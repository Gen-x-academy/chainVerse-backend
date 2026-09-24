import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateBadgeDto } from './dto/create-badge.dto';
import { UpdateBadgeDto } from './dto/update-badge.dto';
import { Badge, BadgeDocument } from './schemas/badge.schema';
import { BadgeAward, BadgeAwardDocument } from './schemas/badge-award.schema';

export interface EvaluationRule {
  eventName: string;
  metric: string;
  threshold: number;
}

@Injectable()
export class BadgeService {
  private readonly logger = new Logger(BadgeService.name);

  constructor(
    @InjectModel(Badge.name)
    private readonly badgeModel: Model<BadgeDocument>,
    @InjectModel(BadgeAward.name)
    private readonly badgeAwardModel: Model<BadgeAwardDocument>,
  ) {}

  async create(payload: CreateBadgeDto): Promise<Badge> {
    const badge = new this.badgeModel(payload);
    return badge.save();
  }

  async findAll(): Promise<Badge[]> {
    return this.badgeModel.find().exec();
  }

  async findOne(id: string): Promise<BadgeDocument> {
    const badge = await this.badgeModel.findById(id).exec();
    if (!badge) {
      throw new NotFoundException('Badge not found');
    }
    return badge;
  }

  async findByNftTokenId(nftTokenId: string): Promise<Badge | null> {
    return this.badgeModel.findOne({ nftTokenId }).exec();
  }

  async update(id: string, payload: UpdateBadgeDto): Promise<Badge> {
    const badge = await this.badgeModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!badge) {
      throw new NotFoundException('Badge not found');
    }
    return badge;
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const result = await this.badgeModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Badge not found');
    }
    return { id, deleted: true };
  }

  async evaluateAndAward(
    userId: string,
    eventName: string,
    metrics: Record<string, number>,
  ): Promise<BadgeAward[]> {
    const badges = await this.badgeModel.find().exec();
    const awarded: BadgeAward[] = [];

    for (const badge of badges) {
      const rules = this.extractRules(badge);
      if (rules.length === 0) continue;

      const matchesAll = rules.every((rule) => {
        if (rule.eventName !== eventName) return false;
        const value = metrics[rule.metric] ?? 0;
        return value >= rule.threshold;
      });

      if (!matchesAll) continue;

      const award = await this.awardBadge(userId, badge, metrics);
      if (award) awarded.push(award);
    }

    return awarded;
  }

  async awardBadge(
    userId: string,
    badge: BadgeDocument,
    metrics?: Record<string, number>,
  ): Promise<BadgeAward | null> {
    try {
      const award = new this.badgeAwardModel({
        userId,
        badgeId: badge._id.toString(),
        metadata: { metrics },
      });
      await award.save();
      this.logger.log(
        'Awarded badge "%s" to user %s',
        badge.name,
        userId,
      );
      return award;
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 11000) {
        this.logger.debug(
          'Badge "%s" already awarded to user %s — skipping',
          badge.name,
          userId,
        );
        return null;
      }
      throw err;
    }
  }

  async hasAwarded(userId: string, badgeId: string): Promise<boolean> {
    const count = await this.badgeAwardModel
      .countDocuments({ userId, badgeId })
      .exec();
    return count > 0;
  }

  async getUserAwards(userId: string): Promise<BadgeAward[]> {
    return this.badgeAwardModel.find({ userId }).exec();
  }

  private extractRules(badge: BadgeDocument): EvaluationRule[] {
    const meta = badge.metadata as Record<string, unknown> | undefined;
    if (!meta) return [];
    const rules = meta['evaluationRules'];
    if (!Array.isArray(rules)) return [];
    return rules as EvaluationRule[];
  }
}
