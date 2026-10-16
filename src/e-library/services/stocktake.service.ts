import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StocktakeSession, StocktakeSessionDocument, StocktakeStatus, ScanResult } from '../schemas/stocktake-session.schema';
import { BookCopy, BookCopyDocument, CopyPhysicalStatus } from '../schemas/book-copy.schema';
import { CreateStocktakeSessionDto, RecordScanDto, ReconcileStocktakeDto } from '../dto/stocktake.dto';
import { BarcodeService } from './barcode.service';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { ResourceConflictException, ResourceNotFoundException } from '../../common/errors/domain.exception';

@Injectable()
export class StocktakeService {
  constructor(
    @InjectModel(StocktakeSession.name)
    private readonly sessionModel: Model<StocktakeSessionDocument>,
    @InjectModel(BookCopy.name)
    private readonly bookCopyModel: Model<BookCopyDocument>,
    private readonly barcodeService: BarcodeService,
  ) {}

  async createSession(dto: CreateStocktakeSessionDto, startedBy: string): Promise<StocktakeSession> {
    const activeSession = await this.sessionModel.findOne({
      status: StocktakeStatus.IN_PROGRESS,
      branch: dto.branch ?? { $exists: false },
    }).exec();

    if (activeSession) {
      throw new ResourceConflictException(
        'A stocktake session is already in progress for this branch',
        ErrorCode.BIZ_DUPLICATE_REQUEST,
      );
    }

    const session = await new this.sessionModel({
      name: dto.name,
      status: StocktakeStatus.IN_PROGRESS,
      startedAt: new Date(),
      startedBy,
      branch: dto.branch,
      scans: [],
      totalScanned: 0,
      totalMissing: 0,
      totalMisshelved: 0,
      totalDamaged: 0,
      totalExtra: 0,
    }).save();

    return session;
  }

  async recordScan(sessionId: string, dto: RecordScanDto, scannedBy: string): Promise<StocktakeSession> {
    const session = await this.sessionModel.findById(sessionId).exec();
    if (!session) {
      throw new ResourceNotFoundException('Stocktake session not found', ErrorCode.RES_NOT_FOUND);
    }
    if (session.status !== StocktakeStatus.IN_PROGRESS) {
      throw new ResourceConflictException(
        'Stocktake session is no longer in progress',
        ErrorCode.BIZ_DUPLICATE_REQUEST,
      );
    }

    const copy = await this.bookCopyModel.findOne({ barcode: dto.barcode }).exec();
    if (!copy) {
      throw new ResourceNotFoundException(`No copy found with barcode "${dto.barcode}"`, ErrorCode.RES_BOOK_NOT_FOUND);
    }

    // Duplicate scans are safe — just update the existing entry
    const existingScanIndex = session.scans.findIndex(
      (s) => s.barcode === dto.barcode,
    );

    const scanEntry = {
      copyId: copy._id,
      barcode: dto.barcode,
      result: dto.result as ScanResult,
      scannedAt: new Date(),
      scannedBy,
      expectedLocation: dto.expectedLocation,
      actualLocation: dto.actualLocation,
      note: dto.note,
    };

    if (existingScanIndex >= 0) {
      session.scans[existingScanIndex] = scanEntry as any;
    } else {
      session.scans.push(scanEntry as any);
    }

    // Recount totals
    session.totalScanned = session.scans.length;
    session.totalMissing = session.scans.filter((s) => s.result === ScanResult.MISSING).length;
    session.totalMisshelved = session.scans.filter((s) => s.result === ScanResult.MISHELVED).length;
    session.totalDamaged = session.scans.filter((s) => s.result === ScanResult.DAMAGED).length;
    session.totalExtra = session.scans.filter((s) => s.result === ScanResult.EXTRA).length;

    await session.save();
    return session;
  }

  async getSession(sessionId: string): Promise<StocktakeSessionDocument> {
    const session = await this.sessionModel.findById(sessionId).exec();
    if (!session) {
      throw new ResourceNotFoundException('Stocktake session not found', ErrorCode.RES_NOT_FOUND);
    }
    return session;
  }

  async listSessions(status?: StocktakeStatus): Promise<StocktakeSession[]> {
    const filter = status ? { status } : {};
    return this.sessionModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async reconcile(sessionId: string, dto: ReconcileStocktakeDto, reconciledBy: string): Promise<StocktakeSession> {
    const session = await this.getSession(sessionId);

    if (session.status !== StocktakeStatus.IN_PROGRESS) {
      throw new ResourceConflictException(
        'Stocktake session is not in progress',
        ErrorCode.BIZ_DUPLICATE_REQUEST,
      );
    }

    // Process missing copies
    if (dto.missingAction !== 'skip') {
      const missingScans = session.scans.filter((s) => s.result === ScanResult.MISSING);
      for (const scan of missingScans) {
        const newStatus = dto.missingAction === 'mark_lost'
          ? CopyPhysicalStatus.LOST
          : CopyPhysicalStatus.WITHDRAWN;
        await this.bookCopyModel.findByIdAndUpdate(scan.copyId, { $set: { status: newStatus } });
      }
    }

    // Process damaged copies
    if (dto.damagedAction !== 'skip') {
      const damagedScans = session.scans.filter((s) => s.result === ScanResult.DAMAGED);
      for (const scan of damagedScans) {
        const newStatus = dto.damagedAction === 'mark_damaged'
          ? CopyPhysicalStatus.IN_REPAIR
          : CopyPhysicalStatus.IN_REPAIR;
        await this.bookCopyModel.findByIdAndUpdate(scan.copyId, { $set: { status: newStatus } });
      }
    }

    const updated = await this.sessionModel.findByIdAndUpdate(
      sessionId,
      {
        $set: {
          status: StocktakeStatus.COMPLETED,
          completedAt: new Date(),
        },
      },
      { new: true },
    ).exec();

    return updated as StocktakeSession;
  }
}
