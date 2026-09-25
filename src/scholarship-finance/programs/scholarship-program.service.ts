import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  BusinessRuleException,
  ErrorCode,
  ResourceNotFoundException,
} from '../../common/errors';
import {
  CreateScholarshipProgramDto,
  UpdateScholarshipProgramStatusDto,
} from './dto/program.dto';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
} from './scholarship-program.schema';

const LEDGER_LOCK_TTL_MS = 15_000;

@Injectable()
export class ScholarshipProgramService {
  constructor(
    @InjectModel(ScholarshipProgram.name)
    private readonly programModel: Model<ScholarshipProgramDocument>,
  ) {}

  create(
    organizationId: string,
    dto: CreateScholarshipProgramDto,
    userId: string,
  ) {
    return this.programModel.create({
      ...dto,
      asset: { code: dto.asset.code, issuer: dto.asset.issuer ?? null },
      organizationId,
      createdBy: userId,
    });
  }

  findByOrganization(organizationId: string) {
    return this.programModel
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Loads a program, scoped to its owning organization. */
  async get(organizationId: string, programId: string) {
    const program = isValidObjectId(programId)
      ? await this.programModel
          .findOne({ _id: programId, organizationId })
          .exec()
      : null;
    if (!program) {
      throw new ResourceNotFoundException(
        'Scholarship program not found',
        ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      );
    }
    return program;
  }

  async getById(programId: string) {
    const program = await this.programModel.findById(programId).exec();
    if (!program) {
      throw new ResourceNotFoundException(
        'Scholarship program not found',
        ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      );
    }
    return program;
  }

  findActive() {
    return this.programModel.find({ status: 'active' }).exec();
  }

  async updateStatus(
    organizationId: string,
    programId: string,
    dto: UpdateScholarshipProgramStatusDto,
  ) {
    const program = await this.get(organizationId, programId);
    program.status = dto.status;
    return program.save();
  }

  /**
   * Runs `work` while holding the program's ledger lease so that balance
   * checks and the entry that depends on them are serialised per program.
   */
  async withLedgerLock<T>(
    programId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const token = randomUUID();
    let acquired = false;
    for (let attempt = 0; attempt < 20 && !acquired; attempt++) {
      const now = new Date();
      const res = await this.programModel
        .updateOne(
          {
            _id: programId,
            $or: [{ ledgerLock: null }, { 'ledgerLock.until': { $lt: now } }],
          },
          {
            $set: {
              ledgerLock: {
                token,
                until: new Date(now.getTime() + LEDGER_LOCK_TTL_MS),
              },
            },
          },
        )
        .exec();
      acquired = res.modifiedCount === 1;
      if (!acquired) await new Promise((r) => setTimeout(r, 50 + attempt * 25));
    }
    if (!acquired) {
      throw new BusinessRuleException(
        'The program ledger is busy; retry shortly',
        ErrorCode.BIZ_LEDGER_BUSY,
      );
    }
    try {
      return await work();
    } finally {
      await this.programModel
        .updateOne(
          { _id: programId, 'ledgerLock.token': token },
          { $set: { ledgerLock: null } },
        )
        .exec();
    }
  }
}
