import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LearningStreak,
  LearningStreakDocument,
} from './schemas/learning-streak.schema';

const MIN_QUALIFYING_ACTIVITIES = 1;

@Injectable()
export class StreakService {
  private readonly logger = new Logger(StreakService.name);

  constructor(
    @InjectModel(LearningStreak.name)
    private readonly streakModel: Model<LearningStreakDocument>,
  ) {}

  async recordActivity(
    userId: string,
    timezone: string,
  ): Promise<LearningStreakDocument> {
    const now = new Date();
    const todayInTz = this.normalizeDateToTimezone(now, timezone);

    const existing = await this.streakModel.findOne({
      userId,
      date: todayInTz,
    });

    if (existing) {
      existing.activityCount += 1;
      existing.qualified = existing.activityCount >= MIN_QUALIFYING_ACTIVITIES;
      existing.timezone = timezone;
      return existing.save();
    }

    const streakCount = await this.calculateStreakForDate(
      userId,
      todayInTz,
      timezone,
    );

    const record = new this.streakModel({
      userId,
      date: todayInTz,
      qualified: true,
      activityCount: 1,
      timezone,
      streakCount,
    });

    return record.save();
  }

  async getStreak(userId: string, timezone: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: Date | null;
    qualifiedDays: number;
  }> {
    const records = await this.streakModel
      .find({ userId, qualified: true })
      .sort({ date: -1 })
      .exec();

    if (records.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: null,
        qualifiedDays: 0,
      };
    }

    const now = new Date();
    const todayInTz = this.normalizeDateToTimezone(now, timezone);

    const currentStreak = await this.calculateCurrentStreak(
      userId,
      todayInTz,
      timezone,
    );

    const longestStreak = await this.calculateLongestStreak(userId);

    return {
      currentStreak,
      longestStreak,
      lastActivityDate: records[0].date,
      qualifiedDays: records.length,
    };
  }

  async getStreakHistory(
    userId: string,
    limit = 30,
  ): Promise<LearningStreakDocument[]> {
    return this.streakModel
      .find({ userId })
      .sort({ date: -1 })
      .limit(limit)
      .exec();
  }

  private normalizeDateToTimezone(date: Date, timezone: string): Date {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const parts = formatter.formatToParts(date);
    const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const month = parts.find((p) => p.type === 'month')?.value ?? '01';
    const day = parts.find((p) => p.type === 'day')?.value ?? '01';

    return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  }

  private async calculateStreakForDate(
    userId: string,
    targetDate: Date,
    timezone: string,
  ): Promise<number> {
    const prevDate = new Date(targetDate);
    prevDate.setUTCDate(prevDate.getUTCDate() - 1);

    const prevRecord = await this.streakModel.findOne({
      userId,
      date: prevDate,
      qualified: true,
    });

    if (prevRecord) {
      return prevRecord.streakCount + 1;
    }

    const twoDaysAgo = new Date(targetDate);
    twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);

    const twoDaysAgoRecord = await this.streakModel.findOne({
      userId,
      date: twoDaysAgo,
      qualified: true,
    });

    if (twoDaysAgoRecord) {
      return twoDaysAgoRecord.streakCount + 1;
    }

    return 1;
  }

  private async calculateCurrentStreak(
    userId: string,
    todayInTz: Date,
    timezone: string,
  ): Promise<number> {
    let currentDate = new Date(todayInTz);
    let streak = 0;
    let missedDays = 0;
    const maxGraceDays = 1;

    for (let i = 0; i < 365; i++) {
      const record = await this.streakModel.findOne({
        userId,
        date: currentDate,
        qualified: true,
      });

      if (record) {
        streak += 1;
        missedDays = 0;
      } else {
        missedDays += 1;
        if (missedDays > maxGraceDays) {
          break;
        }
      }

      currentDate = new Date(currentDate);
      currentDate.setUTCDate(currentDate.getUTCDate() - 1);
    }

    return streak;
  }

  private async calculateLongestStreak(userId: string): Promise<number> {
    const records = await this.streakModel
      .find({ userId, qualified: true })
      .sort({ date: 1 })
      .exec();

    if (records.length === 0) {
      return 0;
    }

    let longest = 1;
    let current = 1;

    for (let i = 1; i < records.length; i++) {
      const prevDate = new Date(records[i - 1].date);
      const currDate = new Date(records[i].date);

      const diffDays =
        (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        current += 1;
        longest = Math.max(longest, current);
      } else if (diffDays === 2) {
        current += 1;
      } else {
        current = 1;
      }
    }

    return Math.max(longest, current);
  }
}
