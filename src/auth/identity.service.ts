import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  AuthIdentity,
  AuthIdentityDocument,
  AuthProvider,
} from '../schemas/auth-identity.schema';

@Injectable()
export class IdentityService {
  constructor(
    @InjectModel(AuthIdentity.name)
    private readonly identityModel: Model<AuthIdentityDocument>,
  ) {}

  findPasswordByEmail(email: string): Promise<AuthIdentityDocument | null> {
    return this.identityModel
      .findOne({ provider: 'password', issuer: 'tourmate', subject: email })
      .select('+passwordHash')
      .exec();
  }

  findPasswordByUser(userId: string): Promise<AuthIdentityDocument | null> {
    return this.identityModel
      .findOne({
        userId: new Types.ObjectId(userId),
        provider: 'password',
        issuer: 'tourmate',
      })
      .select('+passwordHash')
      .exec();
  }

  findSocial(
    provider: 'google' | 'kakao',
    issuer: string,
    subject: string,
  ): Promise<AuthIdentityDocument | null> {
    return this.identityModel.findOne({ provider, issuer, subject }).exec();
  }

  async createPassword(
    userId: string,
    email: string,
    passwordHash: string,
    session?: ClientSession,
  ): Promise<AuthIdentityDocument> {
    return this.create(
      {
        userId: new Types.ObjectId(userId),
        provider: 'password',
        issuer: 'tourmate',
        subject: email,
        emailNormalized: email,
        emailVerified: false,
        passwordHash,
      },
      session,
    );
  }

  async createSocial(
    input: {
      userId: string;
      provider: 'google' | 'kakao';
      issuer: string;
      subject: string;
      email?: string;
      emailVerified: boolean;
    },
    session?: ClientSession,
  ): Promise<AuthIdentityDocument> {
    return this.create(
      {
        userId: new Types.ObjectId(input.userId),
        provider: input.provider,
        issuer: input.issuer,
        subject: input.subject,
        emailNormalized: input.email,
        emailVerified: input.emailVerified,
        lastAuthenticatedAt: new Date(),
      },
      session,
    );
  }

  async updatePasswordHash(
    identityId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.identityModel.updateOne(
      { _id: new Types.ObjectId(identityId) },
      { $set: { passwordHash, lastAuthenticatedAt: new Date() } },
    );
  }

  async touch(identityId: string): Promise<void> {
    await this.identityModel.updateOne(
      { _id: new Types.ObjectId(identityId) },
      { $set: { lastAuthenticatedAt: new Date() } },
    );
  }

  async deleteForUser(userId: string, session?: ClientSession): Promise<void> {
    await this.identityModel.deleteMany(
      { userId: new Types.ObjectId(userId) },
      { session },
    );
  }

  private async create(
    data: {
      userId: Types.ObjectId;
      provider: AuthProvider;
      issuer: string;
      subject: string;
      emailNormalized?: string;
      emailVerified: boolean;
      passwordHash?: string;
      lastAuthenticatedAt?: Date;
    },
    session?: ClientSession,
  ): Promise<AuthIdentityDocument> {
    try {
      const [identity] = await this.identityModel.create([data], { session });
      return identity;
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException('Login identity is already registered');
      }
      throw error;
    }
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11_000
    );
  }
}
