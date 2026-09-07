import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RoomDocumentFile,
  RoomDocumentDoc,
} from '../schemas/room-document.schema';
import {
  TravelRoom,
  TravelRoomDocument,
} from '../schemas/travel-room.schema';
import {
  LocalUploadService,
  DOCUMENT_MAX_BYTES,
} from '../common/storage/local-upload.service';
import { SignedUrlService } from '../common/storage/signed-url.service';
import {
  assertRoomMember,
  assertRoomWritable,
  requireRoom,
} from './room-access';

@Injectable()
export class RoomDocumentsService {
  constructor(
    @InjectModel(RoomDocumentFile.name)
    private docModel: Model<RoomDocumentDoc>,
    @InjectModel(TravelRoom.name) private roomModel: Model<TravelRoomDocument>,
    private uploads: LocalUploadService,
    private signedUrls: SignedUrlService,
  ) {}

  private async getRoom(roomId: string) {
    return requireRoom(await this.roomModel.findById(roomId));
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
      createdAt: (doc as any).createdAt ?? null,
      download: signed ?? null,
    };
  }

  async list(roomId: string, userId: string) {
    const room = await this.getRoom(roomId);
    assertRoomMember(room, userId);
    const docs = await this.docModel
      .find({ roomId: room._id })
      .sort({ createdAt: -1 })
      .exec();
    return {
      data: docs.map((d) =>
        this.toDto(
          d,
          this.signedUrls.createDownloadUrl({
            publicPath: d.fileUrl,
            roomId,
          }),
        ),
      ),
    };
  }

  async upload(
    roomId: string,
    userId: string,
    file: Express.Multer.File,
    note?: string,
  ) {
    const room = await this.getRoom(roomId);
    assertRoomMember(room, userId);
    assertRoomWritable(room);
    this.uploads.assertDocumentFile(file);

    const saved = await this.uploads.saveRoomDocument(roomId, file);
    try {
      const doc = await this.docModel.create({
        roomId: room._id,
        fileUrl: saved.fileUrl,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        note,
        uploadedBy: new Types.ObjectId(userId),
      });
      // use filename uuid as stable id for TODO links — keep mongo _id
      const signed = this.signedUrls.createDownloadUrl({
        publicPath: saved.fileUrl,
        roomId,
      });
      return this.toDto(doc, signed);
    } catch (err) {
      await this.uploads.deleteByPublicUrl(saved.fileUrl);
      throw err;
    }
  }

  async remove(roomId: string, userId: string, documentId: string) {
    const room = await this.getRoom(roomId);
    const member = assertRoomMember(room, userId);
    const doc = await this.docModel.findOne({
      _id: documentId,
      roomId: room._id,
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (
      member.role !== 'owner' &&
      doc.uploadedBy.toString() !== userId
    ) {
      throw new ForbiddenException({
        code: 'DOCUMENT_DELETE_FORBIDDEN',
        message: '업로더 또는 방장만 삭제할 수 있습니다.',
      });
    }
    const url = doc.fileUrl;
    await doc.deleteOne();
    await this.uploads.deleteByPublicUrl(url);
    return { success: true };
  }

  async signPath(roomId: string, userId: string, publicPath: string) {
    const room = await this.getRoom(roomId);
    assertRoomMember(room, userId);
    if (!publicPath.startsWith(`/uploads/tickets/${roomId}/`) &&
        !publicPath.startsWith(`/uploads/documents/${roomId}/`)) {
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
      });
      if (!exists) {
        // still allow if file path matches room (tickets don't have doc rows)
        // documents must exist
        throw new NotFoundException('Document not found');
      }
    }
    return this.signedUrls.createDownloadUrl({
      publicPath,
      roomId,
    });
  }

  async assertDocumentInRoom(roomId: string, documentId: string) {
    const doc = await this.docModel.findOne({
      _id: documentId,
      roomId: new Types.ObjectId(roomId),
    });
    return !!doc;
  }
}

export { DOCUMENT_MAX_BYTES };
