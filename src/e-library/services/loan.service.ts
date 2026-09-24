import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Loan, LoanDocument } from '../schemas/loan.schema';
import { LoanStatus } from '../enums/loan-status.enum';
import { CreateLoanDto } from '../dto/create-loan.dto';
import {
  BusinessRuleException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

@Injectable()
export class LoanService {
  constructor(
    @InjectModel(Loan.name) private readonly loanModel: Model<LoanDocument>,
  ) {}

  async createLoan(dto: CreateLoanDto): Promise<LoanDocument> {
    return this.loanModel.create({
      patronId: dto.patronId,
      itemId: dto.itemId,
      borrowedAt: new Date(),
      dueDate: new Date(dto.dueDate),
      status: LoanStatus.ACTIVE,
    });
  }

  async getLoan(id: string): Promise<LoanDocument> {
    const loan = await this.loanModel.findById(id);
    if (!loan) {
      throw new ResourceNotFoundException(
        `Loan ${id} not found`,
        ErrorCode.RES_LOAN_NOT_FOUND,
      );
    }
    return loan;
  }

  async listLoans(filter: {
    patronId?: string;
    status?: LoanStatus;
  }): Promise<LoanDocument[]> {
    return this.loanModel
      .find({ ...filter })
      .sort({ dueDate: 1 })
      .exec();
  }

  async returnLoan(id: string): Promise<LoanDocument> {
    const loan = await this.getLoan(id);
    if (loan.status === LoanStatus.RETURNED) {
      throw new BusinessRuleException(
        `Loan ${id} has already been returned`,
        ErrorCode.BIZ_LOAN_ALREADY_RETURNED,
      );
    }
    loan.status = LoanStatus.RETURNED;
    loan.returnedAt = new Date();
    await loan.save();
    return loan;
  }
}
