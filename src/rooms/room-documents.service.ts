import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  RoomDocumentFile,
  RoomDocumentDoc,
} from '../schemas/room-document.schema';
import { TravelRoom, TravelRoomDocument } from '../schemas/travel-room.schema';
import {
  LocalUploadService,
  DOCUMENT_MAX_BYTES,
} from '../common/storage/local-upload.service';
import { SignedUrlService } from '../common/storage/signed-url.service';
import { assertRoomMember, requireRoom } from './room-access';
import { RoomTodosService } from './room-todos.service';

@Injectable()
export class RoomDocumentsService {
  private readonly logger = new Logger(RoomDocumentsService.name);

  constructor(
    @InjectModel(RoomDocumentFile.name)
    private docModel: Model<RoomDocumentDoc>,
    @InjectModel(TravelRoom.name) private roomModel: Model<TravelRoomDocument>,
    private uploads: LocalUploadService,
    private signedUrls: SignedUrlService,
    private todosService: RoomTodosService,
    @InjectConnection() private connection: Connection,
    private config: ConfigService,
  ) {}

  private async getRoom(roomId: string) {
    return requireRoom(await this.roomModel.findById(roomId));
  }

  private isTransactionUnsupported(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('Transaction numbers are only allowed') ||
      message.includes('replica set member or mongos') ||
      message.includes('does not support retryable writes')
    );
  }

  private async runDocumentTransaction<TResult>(
    task: (session: ClientSession) => Promise<TResult>,
    developmentFallback: () => Promise<TResult>,
  ) {
    let session: ClientSession | undefined;
    try {
      session = await this.connection.startSession();
      const result = await session.withTransaction(() => task(session!));
      if (result === undefined) {
        throw new Error('문서 저장 트랜잭션 결과를 확인할 수 없습니다.');
      }
      return result;
    } catch (error) {
      const isProduction =
        this.config.get<string>('NODE_ENV', 'development') === 'production';
      if (!isProduction && this.isTransactionUnsupported(error)) {
        return developmentFallback();
      }
      throw error;
    } finally {
      await session?.endSession();
    }
  }

  private mutationLeaseMs() {
    const configured = Number(
      this.config.get<string>('DOCUMENT_MUTATION_LEASE_MS', '120000'),
    );
    return Number.isFinite(configured)
      ? Math.min(10 * 60_000, Math.max(30_000, Math.floor(configured)))
      : 120_000;
  }

  private receiptId(kind: 'upload' | 'delete', documentId: string) {
    return `${kind}:${documentId}`;
  }

  private async applyStandaloneFactsReceipt(
    roomId: string,
    userId: string,
    kind: 'upload' | 'delete',
    documentId: string,
  ) {
    const receiptId = this.receiptId(kind, documentId);
    const updated = await this.roomModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(roomId),
        'members.userId': new Types.ObjectId(userId),
        'documentMutationReceipts.id': { $ne: receiptId },
      },
      {
        $inc: { factsVersion: 1 },
        $push: {
          documentMutationReceipts: {
            $each: [{ id: receiptId, kind, appliedAt: new Date() }],
            $slice: -512,
          },
        },
      },
      { returnDocument: 'after' },
    );
    if (updated) return updated;
    const current = await this.getRoom(roomId);
    assertRoomMember(current, userId);
    if (
      current.documentMutationReceipts?.some(
        (receipt) => receipt.id === receiptId,
      )
    ) {
      return current;
    }
    throw new ConflictException({
      code: 'DOCUMENT_VERSION_COMMIT_CONFLICT',
      message:
        '문서 버전을 반영하는 동안 여행방이 변경되었습니다. 다시 시도해 주세요.',
    });
  }

  private async clearStandaloneReceipt(
    roomId: string,
    kind: 'upload' | 'delete',
    documentId: string,
  ) {
    try {
      await this.roomModel.updateOne(
        { _id: new Types.ObjectId(roomId) },
        {
          $pull: {
            documentMutationReceipts: {
              id: this.receiptId(kind, documentId),
            },
          },
        },
      );
    } catch (error) {
      // The receipt is bounded and exists only to make the standalone fallback
      // idempotent. Cleanup failure must not turn an already committed upload
      // or delete into a client-visible failure that invites a duplicate retry.
      this.logger.warn(
        `문서 변경 영수증 정리 지연: ${kind}:${documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private toDto(
    doc: RoomDocumentDoc,
    signed?: ReturnType<SignedUrlService['createDownloadUrl']>,
  ) {
    return {
      id: doc._id.toString(),
      roomId: doc.roomId.toString(),
      fileUrl: doc.fileUrl,
      originalName: doc.originalName ?? null,
      mimeType: doc.mimeType ?? null,
      size: doc.size ?? null,
      note: doc.note ?? null,
      uploadedBy: doc.uploadedBy.toString(),
      createdAt:
        (doc as RoomDocumentDoc & { createdAt?: Date }).createdAt ?? null,
      download: signed ?? null,
    };
  }

  async list(roomId: string, userId: string) {
    // A document mutation also advances factsVersion and may advance
    // scheduleVersion when a reservation link is detached. Fence the list
    // with room-version reads so callers never receive documents paired with
    // version counters from a different snapshot.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = await this.getRoom(roomId);
      assertRoomMember(before, userId);
      const snapshotDocs = await this.docModel
        .find({ roomId: before._id })
        .sort({ createdAt: -1 })
        .exec();
      if (await this.recoverStalePendingMarkers(roomId, userId, snapshotDocs)) {
        continue;
      }
      // Standalone-development fallback spans multiple writes. Pending rows
      // make that window explicit so a stable-looking but mixed snapshot can
      // never escape this endpoint.
      if (snapshotDocs.some((doc) => doc.creatingAt || doc.deletingAt)) {
        continue;
      }
      const after = await this.getRoom(roomId);
      assertRoomMember(after, userId);
      if (
        (before.scheduleVersion ?? 0) !== (after.scheduleVersion ?? 0) ||
        (before.factsVersion ?? 0) !== (after.factsVersion ?? 0)
      ) {
        continue;
      }
      return {
        data: snapshotDocs.map((d) =>
          this.toDto(
            d,
            this.signedUrls.createDownloadUrl({
              publicPath: d.fileUrl,
              roomId,
            }),
          ),
        ),
        scheduleVersion: after.scheduleVersion ?? 0,
        factsVersion: after.factsVersion ?? 0,
      };
    }
    throw new ConflictException({
      code: 'DOCUMENT_SNAPSHOT_CHANGED',
      message: '문서 목록이 변경되었습니다. 잠시 후 다시 불러와 주세요.',
    });
  }

  private async recoverStalePendingMarkers(
    roomId: string,
    userId: string,
    docs: RoomDocumentDoc[],
  ) {
    const staleBefore = Date.now() - this.mutationLeaseMs();
    for (const doc of docs) {
      if (doc.creatingAt && doc.creatingAt.getTime() <= staleBefore) {
        const room = await this.applyStandaloneFactsReceipt(
          roomId,
          userId,
          'upload',
          doc._id.toString(),
        );
        const released = await this.docModel.updateOne(
          { _id: doc._id, creatingAt: doc.creatingAt },
          { $unset: { creatingAt: 1 } },
        );
        if (released.modifiedCount > 0) {
          await this.clearStandaloneReceipt(
            room._id.toString(),
            'upload',
            doc._id.toString(),
          );
        }
        return true;
      }
      if (doc.deletingAt && doc.deletingAt.getTime() <= staleBefore) {
        // Preserve the document after a crashed deletion. A later explicit
        // delete resumes using the stored facts receipt without double-bump.
        await this.docModel.updateOne(
          { _id: doc._id, deletingAt: doc.deletingAt },
          { $unset: { deletingAt: 1 } },
        );
        return true;
      }
    }
    return false;
  }

  async upload(
    roomId: string,
    userId: string,
    file: Express.Multer.File,
    note?: string,
  ) {
    const room = await this.getRoom(roomId);
    assertRoomMember(room, userId);
    this.uploads.assertDocumentFile(file);

    const saved = await this.uploads.saveRoomDocument(roomId, file);
    const documentData = {
      roomId: room._id,
      fileUrl: saved.fileUrl,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      note: note?.trim() || undefined,
      uploadedBy: new Types.ObjectId(userId),
    };
    try {
      const persisted = await this.runDocumentTransaction(
        async (session) => {
          const updatedRoom = await this.roomModel.findOneAndUpdate(
            { _id: room._id, 'members.userId': new Types.ObjectId(userId) },
            { $inc: { factsVersion: 1 } },
            { returnDocument: 'after', session },
          );
          if (!updatedRoom) {
            throw new ForbiddenException('여행방 접근 권한이 없습니다.');
          }
          const [doc] = await this.docModel.create([documentData], { session });
          return { doc, room: updatedRoom };
        },
        async () => {
          const doc = await this.docModel.create({
            ...documentData,
            creatingAt: new Date(),
          });
          try {
            const updatedRoom = await this.applyStandaloneFactsReceipt(
              roomId,
              userId,
              'upload',
              doc._id.toString(),
            );
            await doc.updateOne({ $unset: { creatingAt: 1 } });
            doc.creatingAt = undefined;
            await this.clearStandaloneReceipt(
              roomId,
              'upload',
              doc._id.toString(),
            );
            return { doc, room: updatedRoom };
          } catch (error) {
            await doc.deleteOne();
            throw error;
          }
        },
      );
      // use filename uuid as stable id for TODO links — keep mongo _id
      const signed = this.signedUrls.createDownloadUrl({
        publicPath: saved.fileUrl,
        roomId,
      });
      return {
        ...this.toDto(persisted.doc, signed),
        scheduleVersion: persisted.room.scheduleVersion ?? 0,
        factsVersion: persisted.room.factsVersion ?? 0,
      };
    } catch (err) {
      try {
        await this.uploads.deleteByPublicUrl(saved.fileUrl);
      } catch (cleanupError) {
        this.logger.error(
          `실패한 문서 업로드 파일 정리 실패: ${saved.fileUrl}`,
          cleanupError instanceof Error
            ? cleanupError.stack
            : String(cleanupError),
        );
      }
      throw err;
    }
  }

  async remove(roomId: string, userId: string, documentId: string) {
    const room = await this.getRoom(roomId);
    const member = assertRoomMember(room, userId);
    const doc = await this.docModel.findOne({
      _id: documentId,
      roomId: room._id,
      creatingAt: { $exists: false },
    });
    if (!doc) throw new NotFoundException('문서를 찾을 수 없습니다.');
    this.assertDeleteAllowed(member.role, doc.uploadedBy, userId);
    const now = new Date();
    const staleBefore = new Date(now.getTime() - this.mutationLeaseMs());
    const marked = await this.docModel.findOneAndUpdate(
      {
        _id: doc._id,
        roomId: room._id,
        creatingAt: { $exists: false },
        $and: [
          {
            $or: [
              { deletingAt: { $exists: false } },
              { deletingAt: { $lte: staleBefore } },
            ],
          },
          {
            $or: [
              { linkMutationExpiresAt: { $exists: false } },
              { linkMutationExpiresAt: { $lte: now } },
            ],
          },
        ],
      },
      {
        $set: { deletingAt: now },
        $unset: { linkMutationToken: 1, linkMutationExpiresAt: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!marked) {
      throw new ConflictException({
        code: 'DOCUMENT_MUTATION_IN_PROGRESS',
        message:
          '문서가 다른 TODO에 연결 중이거나 이미 삭제 중입니다. 잠시 후 다시 시도해 주세요.',
      });
    }

    let removed: Awaited<
      ReturnType<RoomDocumentsService['removeMetadataInTransaction']>
    >;
    try {
      removed = await this.runDocumentTransaction(
        (session) =>
          this.removeMetadataInTransaction(roomId, userId, documentId, session),
        () => this.removeMetadataWithoutTransaction(roomId, userId, documentId),
      );
    } catch (error) {
      await this.docModel.updateOne(
        { _id: marked._id, deletingAt: now },
        { $unset: { deletingAt: 1 } },
      );
      throw error;
    }
    try {
      await this.uploads.deleteByPublicUrl(removed.fileUrl);
    } catch (error) {
      this.logger.error(
        `삭제된 문서 파일 정리 실패: ${documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    return {
      success: true,
      scheduleVersion: removed.scheduleVersion,
      factsVersion: removed.factsVersion,
      todoLinkImpact: removed.todoLinkImpact,
    };
  }

  private assertDeleteAllowed(
    role: 'owner' | 'member',
    uploadedBy: Types.ObjectId,
    userId: string,
  ) {
    if (role !== 'owner' && uploadedBy.toString() !== userId) {
      throw new ForbiddenException({
        code: 'DOCUMENT_DELETE_FORBIDDEN',
        message: '문서를 올린 참여자 또는 방장만 삭제할 수 있습니다.',
      });
    }
  }

  private detachDocumentFromReservations(
    room: TravelRoomDocument,
    documentId: string,
  ) {
    let changed = false;
    for (const day of room.schedule.days ?? []) {
      for (const item of day.items ?? []) {
        const reservation = item.reservation;
        if (!reservation?.documentTicketIds?.includes(documentId)) continue;
        reservation.documentTicketIds = reservation.documentTicketIds.filter(
          (id) => id !== documentId,
        );
        reservation.revision = (reservation.revision ?? 0) + 1;
        changed = true;
      }
    }
    if (changed) room.markModified('schedule');
    return changed;
  }

  private async removeMetadataInTransaction(
    roomId: string,
    userId: string,
    documentId: string,
    session: ClientSession,
  ) {
    const room = requireRoom(
      await this.roomModel.findById(roomId).session(session).exec(),
    );
    const member = assertRoomMember(room, userId);
    const doc = await this.docModel
      .findOne({ _id: documentId, roomId: room._id })
      .session(session)
      .exec();
    if (!doc) throw new NotFoundException('문서를 찾을 수 없습니다.');
    this.assertDeleteAllowed(member.role, doc.uploadedBy, userId);

    const scheduleChanged = this.detachDocumentFromReservations(
      room,
      documentId,
    );
    room.factsVersion = (room.factsVersion ?? 0) + 1;
    if (scheduleChanged) {
      room.scheduleVersion = (room.scheduleVersion ?? 0) + 1;
    }
    const todoLinkImpact = await this.todosService.detachLinkedTarget(
      roomId,
      'document',
      documentId,
      session,
    );
    await room.save({ session });
    await doc.deleteOne({ session });
    return {
      fileUrl: doc.fileUrl,
      scheduleVersion: room.scheduleVersion ?? 0,
      factsVersion: room.factsVersion ?? 0,
      todoLinkImpact,
    };
  }

  /** Development fallback for standalone MongoDB instances without transactions. */
  private async removeMetadataWithoutTransaction(
    roomId: string,
    userId: string,
    documentId: string,
  ) {
    const room = await this.getRoom(roomId);
    const member = assertRoomMember(room, userId);
    let doc = await this.docModel.findOne({
      _id: documentId,
      roomId: room._id,
    });
    if (!doc) throw new NotFoundException('문서를 찾을 수 없습니다.');
    this.assertDeleteAllowed(member.role, doc.uploadedBy, userId);
    if (!doc.deletingAt) {
      const marked = await this.docModel.findOneAndUpdate(
        { _id: doc._id, roomId: room._id, deletingAt: { $exists: false } },
        { $set: { deletingAt: new Date() } },
        { returnDocument: 'after' },
      );
      if (marked) doc = marked;
      else {
        const concurrent = await this.docModel.findOne({
          _id: documentId,
          roomId: room._id,
        });
        if (!concurrent) {
          throw new NotFoundException('문서를 찾을 수 없습니다.');
        }
        doc = concurrent;
      }
    }

    const factsRoom = await this.applyStandaloneFactsReceipt(
      roomId,
      userId,
      'delete',
      documentId,
    );
    const versionRoom = await this.detachDocumentWithOptimisticRetry(
      roomId,
      documentId,
    );
    const todoLinkImpact = await this.todosService.detachLinkedTarget(
      roomId,
      'document',
      documentId,
    );
    await doc.deleteOne();
    await this.clearStandaloneReceipt(roomId, 'delete', documentId);
    return {
      fileUrl: doc.fileUrl,
      scheduleVersion: versionRoom.scheduleVersion ?? 0,
      factsVersion: versionRoom.factsVersion ?? factsRoom.factsVersion ?? 0,
      todoLinkImpact,
    };
  }

  private async detachDocumentWithOptimisticRetry(
    roomId: string,
    documentId: string,
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const room = await this.getRoom(roomId);
      const changed = this.detachDocumentFromReservations(room, documentId);
      if (!changed) return room;
      const scheduleVersion = room.scheduleVersion ?? 0;
      const factsVersion = room.factsVersion ?? 0;
      const updated = await this.roomModel.findOneAndUpdate(
        {
          _id: room._id,
          scheduleVersion,
          factsVersion,
        },
        {
          $set: { schedule: room.schedule },
          $inc: { scheduleVersion: 1 },
        },
        { returnDocument: 'after' },
      );
      if (updated) return updated;
    }
    throw new ConflictException({
      code: 'DOCUMENT_DELETE_CONFLICT',
      message:
        '일정이 동시에 변경되어 문서를 삭제하지 못했습니다. 최신 일정을 불러온 뒤 다시 시도해 주세요.',
    });
  }

  async signPath(roomId: string, userId: string, publicPath: string) {
    const room = await this.getRoom(roomId);
    assertRoomMember(room, userId);
    if (
      !publicPath.startsWith(`/uploads/tickets/${roomId}/`) &&
      !publicPath.startsWith(`/uploads/documents/${roomId}/`)
    ) {
      throw new ForbiddenException({
        code: 'FILE_PATH_FORBIDDEN',
        message: '이 여행방 파일만 서명할 수 있습니다.',
      });
    }
    // tickets live on schedule — membership is enough
    if (publicPath.startsWith(`/uploads/documents/${roomId}/`)) {
      const exists = await this.docModel.exists({
        roomId: room._id,
        fileUrl: publicPath,
        creatingAt: { $exists: false },
        deletingAt: { $exists: false },
      });
      if (!exists) {
        // still allow if file path matches room (tickets don't have doc rows)
        // documents must exist
        throw new NotFoundException('문서를 찾을 수 없습니다.');
      }
    } else {
      const exists = await this.roomModel.exists({
        _id: room._id,
        'schedule.days.items.tickets.imageUrl': publicPath,
      });
      if (!exists) {
        throw new NotFoundException('티켓을 찾을 수 없습니다.');
      }
    }
    return this.signedUrls.createDownloadUrl({
      publicPath,
      roomId,
    });
  }

  async assertDocumentInRoom(roomId: string, documentId: string) {
    if (
      !Types.ObjectId.isValid(roomId) ||
      !Types.ObjectId.isValid(documentId)
    ) {
      return false;
    }
    const doc = await this.docModel.findOne({
      _id: documentId,
      roomId: new Types.ObjectId(roomId),
      creatingAt: { $exists: false },
      deletingAt: { $exists: false },
    });
    return !!doc;
  }
}

export { DOCUMENT_MAX_BYTES };
