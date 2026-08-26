import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ClosureCalendar, ClosureCalendarDocument } from '../schemas/closure-calendar.schema';
import { CreateClosureCalendarDto } from '../dto/closure-calendar.dto';

@Injectable()
export class ClosureCalendarService {
  constructor(
    @InjectModel(ClosureCalendar.name)
    private readonly closureModel: Model<ClosureCalendarDocument>,
  ) {}

  async createClosure(dto: CreateClosureCalendarDto, createdBy: string): Promise<ClosureCalendar> {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (endDate < startDate) {
      throw new Error('End date must be after start date');
    }

    const closure = await new this.closureModel({
      startDate,
      endDate,
      reason: dto.reason,
      extendsPickupWindows: dto.extendsPickupWindows !== 'false',
      blocksDueDates: dto.blocksDueDates === 'true',
      createdBy,
    }).save();

    return closure;
  }

  async listClosures(): Promise<ClosureCalendar[]> {
    return this.closureModel.find().sort({ startDate: 1 }).exec();
  }

  async deleteClosure(closureId: string): Promise<void> {
    await this.closureModel.findByIdAndDelete(closureId).exec();
  }

  async isDateClosed(date: Date): Promise<boolean> {
    const closure = await this.closureModel.findOne({
      startDate: { $lte: date },
      endDate: { $gte: date },
      blocksDueDates: true,
    }).exec();
    return !!closure;
  }

  async getClosureDaysBetween(start: Date, end: Date): Promise<number> {
    const closures = await this.closureModel.find({
      startDate: { $lte: end },
      endDate: { $gte: start },
      blocksDueDates: true,
    }).exec();

    let totalDays = 0;
    for (const closure of closures) {
      const overlapStart = Math.max(start.getTime(), closure.startDate.getTime());
      const overlapEnd = Math.min(end.getTime(), closure.endDate.getTime());
      if (overlapEnd >= overlapStart) {
        const days = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
        totalDays += days;
      }
    }
    return totalDays;
  }

  async calculateDueDate(loanStartDate: Date, loanPeriodDays: number): Promise<Date> {
    let dueDate = new Date(loanStartDate);
    let remainingDays = loanPeriodDays;

    while (remainingDays > 0) {
      dueDate.setDate(dueDate.getDate() + 1);

      const dayOfWeek = dueDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isClosed = await this.isDateClosed(dueDate);

      if (!isWeekend && !isClosed) {
        remainingDays--;
      }
    }

    return dueDate;
  }
}
