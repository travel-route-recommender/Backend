import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { LocalUploadService } from '../common/storage/local-upload.service';
import {
  AnalysisReport,
  AnalysisReportDocument,
} from '../schemas/analysis-report.schema';
import {
  OnboardingSurvey,
  OnboardingSurveyDocument,
} from '../schemas/onboarding-survey.schema';
import {
  RoomDocumentDoc,
  RoomDocumentFile,
} from '../schemas/room-document.schema';
import { RoomTodo, RoomTodoDocument } from '../schemas/room-todo.schema';
import { TestResult, TestResultDocument } from '../schemas/test-result.schema';
import { TravelRoom, TravelRoomDocument } from '../schemas/travel-room.schema';
import { UserSave, UserSaveDocument } from '../schemas/user-save.schema';
import { User, UserDocument } from '../schemas/user.schema';

type MutableUserReference = Types.ObjectId | undefined;

@Injectable()
export class AccountDeletionService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(UserSave.name) private saveModel: Model<UserSaveDocument>,
    @InjectModel(TestResult.name)
    private testResultModel: Model<TestResultDocument>,
    @InjectModel(OnboardingSurvey.name)
    private surveyModel: Model<OnboardingSurveyDocument>,
    @InjectModel(TravelRoom.name)
    private roomModel: Model<TravelRoomDocument>,
    @InjectModel(RoomTodo.name)
    private todoModel: Model<RoomTodoDocument>,
    @InjectModel(RoomDocumentFile.name)
    private documentModel: Model<RoomDocumentDoc>,
    @InjectModel(AnalysisReport.name)
    private reportModel: Model<AnalysisReportDocument>,
    private readonly uploads: LocalUploadService,
  ) {}

  async deleteAccount(userId: string, password?: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    await this.assertPassword(user, password);

    const target = user._id;
    const filesToDelete = new Set<string>();
    if (user.profileImageUrl?.startsWith('/uploads/')) {
      filesToDelete.add(user.profileImageUrl);
    }

    const rooms = await this.findRoomsReferencing(target);
    const deletedRoomIds = new Set<string>();

    for (const room of rooms) {
      const remainingMembers = room.members.filter(
        (member) => !member.userId.equals(target),
      );

      if (room.createdBy.equals(target) || remainingMembers.length === 0) {
        deletedRoomIds.add(room._id.toString());
        this.collectTicketUrls(room, filesToDelete);
        continue;
      }

      const currentOwner = remainingMembers.find(
        (member) => member.role === 'owner',
      );
      const nextOwner =
        currentOwner ??
        [...remainingMembers].sort(
          (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime(),
        )[0];
      if (!nextOwner) continue;

      if (!currentOwner) {
        remainingMembers.forEach((member) => {
          member.role = member.userId.equals(nextOwner.userId)
            ? 'owner'
            : 'member';
        });
      }

      const replacementId = nextOwner.userId;
      room.members = remainingMembers;
      if (room.createdBy.equals(target)) room.createdBy = replacementId;
      this.scrubRoomReferences(room, target, replacementId, filesToDelete);
      room.factsVersion = (room.factsVersion ?? 0) + 1;
      room.scheduleVersion = (room.scheduleVersion ?? 0) + 1;
      room.markModified('members');
      room.markModified('candidatePlaces');
      room.markModified('schedule');
      await room.save();
    }

    const deletedRoomObjectIds = [...deletedRoomIds].map(
      (id) => new Types.ObjectId(id),
    );
    const documentFilter = deletedRoomObjectIds.length
      ? {
          $or: [
            { uploadedBy: target },
            { roomId: { $in: deletedRoomObjectIds } },
          ],
        }
      : { uploadedBy: target };
    const documents = await this.documentModel.find(documentFilter).exec();
    documents.forEach((document) => filesToDelete.add(document.fileUrl));

    await Promise.all([
      this.scrubTodos(target, deletedRoomIds),
      this.documentModel.deleteMany(documentFilter).exec(),
      deletedRoomObjectIds.length
        ? this.reportModel
            .deleteMany({ roomId: { $in: deletedRoomObjectIds } })
            .exec()
        : Promise.resolve(),
      deletedRoomObjectIds.length
        ? this.roomModel
            .deleteMany({ _id: { $in: deletedRoomObjectIds } })
            .exec()
        : Promise.resolve(),
      this.saveModel.deleteMany({ userId: target }).exec(),
      this.testResultModel.deleteMany({ userId: target }).exec(),
      this.surveyModel.deleteMany({ userId: target }).exec(),
    ]);

    await Promise.all(
      [...filesToDelete].map((url) => this.uploads.deleteByPublicUrl(url)),
    );
    // The user document is deliberately removed last. If an earlier cleanup fails,
    // the authenticated user can retry instead of leaving an unreachable account.
    await this.userModel.deleteOne({ _id: target }).exec();

    return { success: true };
  }

  private async assertPassword(user: UserDocument, password?: string) {
    if (!user.passwordHash) return;
    const valid = password
      ? await bcrypt.compare(password, user.passwordHash)
      : false;
    if (!valid) {
      throw new UnauthorizedException({
        code: 'PASSWORD_CONFIRMATION_FAILED',
        message: '현재 비밀번호가 일치하지 않습니다.',
      });
    }
  }

  private findRoomsReferencing(userId: Types.ObjectId) {
    return this.roomModel
      .find({
        $or: [
          { createdBy: userId },
          { 'members.userId': userId },
          { 'candidatePlaces.addedBy': userId },
          { 'candidatePlaces.memberSignals.userId': userId },
          { 'transportMode.updatedBy': userId },
          { 'returnDeadline.updatedBy': userId },
          { 'travelBufferMinutes.updatedBy': userId },
          { 'prepBufferMinutes.updatedBy': userId },
          { 'schedule.days.items.lockedBy': userId },
          { 'schedule.days.items.tickets.uploadedBy': userId },
          { 'schedule.days.items.reservation.confirmedBy': userId },
        ],
      })
      .exec();
  }

  private collectTicketUrls(room: TravelRoomDocument, files: Set<string>) {
    room.schedule?.days?.forEach((day) => {
      day.items?.forEach((item) => {
        item.tickets?.forEach((ticket) => files.add(ticket.imageUrl));
      });
    });
  }

  private scrubRoomReferences(
    room: TravelRoomDocument,
    target: Types.ObjectId,
    replacementId: Types.ObjectId,
    files: Set<string>,
  ) {
    const replaceRequiredReference = (value: MutableUserReference) =>
      value?.equals(target) ? replacementId : value;

    if (room.transportMode) {
      room.transportMode.updatedBy =
        replaceRequiredReference(room.transportMode.updatedBy) ?? replacementId;
    }
    if (room.returnDeadline) {
      room.returnDeadline.updatedBy =
        replaceRequiredReference(room.returnDeadline.updatedBy) ??
        replacementId;
    }
    if (room.travelBufferMinutes) {
      room.travelBufferMinutes.updatedBy =
        replaceRequiredReference(room.travelBufferMinutes.updatedBy) ??
        replacementId;
    }
    if (room.prepBufferMinutes) {
      room.prepBufferMinutes.updatedBy =
        replaceRequiredReference(room.prepBufferMinutes.updatedBy) ??
        replacementId;
    }

    room.candidatePlaces = room.candidatePlaces
      .filter((candidate) => !candidate.addedBy.equals(target))
      .map((candidate) => {
        candidate.memberSignals = (candidate.memberSignals ?? []).filter(
          (signal) => !signal.userId.equals(target),
        );
        return candidate;
      });

    room.schedule?.days?.forEach((day) => {
      day.items?.forEach((item) => {
        if (item.lockedBy?.equals(target)) {
          item.locked = false;
          item.lockedBy = undefined;
          item.lockedAt = undefined;
        }
        item.tickets = (item.tickets ?? []).filter((ticket) => {
          if (!ticket.uploadedBy.equals(target)) return true;
          files.add(ticket.imageUrl);
          return false;
        });
        if (item.reservation?.confirmedBy?.equals(target)) {
          item.reservation.confirmedBy = undefined;
          item.reservation.confirmedAt = undefined;
        }
      });
    });
  }

  private async scrubTodos(
    target: Types.ObjectId,
    deletedRoomIds: Set<string>,
  ) {
    if (deletedRoomIds.size) {
      await this.todoModel
        .deleteMany({
          roomId: {
            $in: [...deletedRoomIds].map((id) => new Types.ObjectId(id)),
          },
        })
        .exec();
    }

    const todos = await this.todoModel
      .find({
        $or: [
          { createdBy: target },
          { updatedBy: target },
          { completedBy: target },
          { assigneeId: target },
          { 'checklist.doneBy': target },
        ],
      })
      .exec();

    for (const todo of todos) {
      if (deletedRoomIds.has(todo.roomId.toString())) continue;
      if (todo.createdBy.equals(target)) {
        await todo.deleteOne();
        continue;
      }
      if (todo.updatedBy?.equals(target)) todo.updatedBy = undefined;
      if (todo.completedBy?.equals(target)) todo.completedBy = undefined;
      if (todo.assigneeId?.equals(target)) todo.assigneeId = undefined;
      todo.checklist?.forEach((item) => {
        if (item.doneBy?.equals(target)) item.doneBy = undefined;
      });
      todo.markModified('checklist');
      await todo.save();
    }
  }
}
