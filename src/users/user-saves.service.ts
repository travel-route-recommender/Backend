import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserSave, UserSaveDocument } from '../schemas/user-save.schema';
import { Place, PlaceDocument } from '../schemas/place.schema';

@Injectable()
export class UserSavesService {
  constructor(
    @InjectModel(UserSave.name) private saveModel: Model<UserSaveDocument>,
    @InjectModel(Place.name) private placeModel: Model<PlaceDocument>,
  ) {}

  async savePlace(userId: string, placeId: string, roomId?: string) {
    const place = await this.placeModel.findById(placeId);
    if (!place) throw new NotFoundException('Place not found');

    return this.saveModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        placeId: new Types.ObjectId(placeId),
        roomId: roomId ? new Types.ObjectId(roomId) : null,
      },
      {
        userId: new Types.ObjectId(userId),
        placeId: new Types.ObjectId(placeId),
        roomId: roomId ? new Types.ObjectId(roomId) : undefined,
      },
      { upsert: true, new: true },
    );
  }

  async removeSave(userId: string, placeId: string) {
    await this.saveModel.deleteOne({
      userId: new Types.ObjectId(userId),
      placeId: new Types.ObjectId(placeId),
      roomId: null,
    });
    return { success: true };
  }

  async listSaves(userId: string) {
    const saves = await this.saveModel
      .find({ userId: new Types.ObjectId(userId), roomId: null })
      .populate('placeId')
      .sort({ savedAt: -1 })
      .exec();

    return saves.map((s) => ({
      id: s._id.toString(),
      savedAt: (s as unknown as { savedAt: Date }).savedAt,
      place: s.placeId,
    }));
  }
}
