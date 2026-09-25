import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateAboutContentRevisionDto } from './dto/create-about-management.dto';
import { UpdateAboutContentRevisionDto } from './dto/update-about-management.dto';
import { RollbackAboutContentRevisionDto } from './dto/rollback-about-content-revision.dto';
import {
  AboutContentRevision,
  AboutContentRevisionDocument,
  RevisionStatus,
} from './schemas/about-content-revision.schema';

@Injectable()
export class AboutManagementService {
  @InjectModel(AboutContentRevision.name)
  private readonly revisionModel: Model<AboutContentRevisionDocument>;

  async createRevision(
    dto: CreateAboutContentRevisionDto,
    authorId: string,
  ): Promise<AboutContentRevisionDocument> {
    const latest = await this.revisionModel
      .findOne()
      .sort({ version: -1 })
      .lean()
      .exec();
    const nextVersion = latest ? latest.version + 1 : 1;

    const revision = new this.revisionModel({
      title: dto.title,
      content: dto.content,
      preview: dto.preview ?? dto.content.slice(0, 200),
      status: RevisionStatus.DRAFT,
      author: authorId,
      version: nextVersion,
    });
    return revision.save();
  }

  async updateRevision(
    id: string,
    dto: UpdateAboutContentRevisionDto,
  ): Promise<AboutContentRevisionDocument> {
    const revision = await this.revisionModel.findById(id).exec();
    if (!revision) {
      throw new NotFoundException('Revision not found');
    }
    if (revision.status === RevisionStatus.PUBLISHED) {
      throw new ConflictException('Cannot edit a published revision directly');
    }
    if (dto.title !== undefined) revision.title = dto.title;
    if (dto.content !== undefined) revision.content = dto.content;
    if (dto.preview !== undefined) revision.preview = dto.preview;
    return revision.save();
  }

  async publishRevision(id: string): Promise<AboutContentRevisionDocument> {
    const revision = await this.revisionModel.findById(id).exec();
    if (!revision) {
      throw new NotFoundException('Revision not found');
    }
    if (revision.status === RevisionStatus.PUBLISHED) {
      throw new ConflictException('Revision is already published');
    }

    // Unpublish the currently published revision (if any)
    await this.revisionModel.updateMany(
      { status: RevisionStatus.PUBLISHED },
      { $set: { status: RevisionStatus.ARCHIVED } },
    );

    revision.status = RevisionStatus.PUBLISHED;
    revision.publishedAt = new Date();
    return revision.save();
  }

  async rollback(
    dto: RollbackAboutContentRevisionDto,
    actorId: string,
  ): Promise<AboutContentRevisionDocument> {
    let source: AboutContentRevisionDocument | null;

    if (dto.targetRevisionId) {
      source = await this.revisionModel.findById(dto.targetRevisionId).exec();
      if (!source) {
        throw new NotFoundException('Target revision not found');
      }
    } else {
      // Find the most recently published revision
      source = await this.revisionModel
        .findOne({ status: RevisionStatus.PUBLISHED })
        .sort({ publishedAt: -1 })
        .exec();
      if (!source) {
        throw new NotFoundException('No published revision to roll back to');
      }
    }

    const latest = await this.revisionModel
      .findOne()
      .sort({ version: -1 })
      .lean()
      .exec();

    const rollbackRevision = new this.revisionModel({
      title: source.title,
      content: source.content,
      preview: source.preview,
      status: RevisionStatus.DRAFT,
      author: actorId,
      version: latest ? latest.version + 1 : 1,
    });
    return rollbackRevision.save();
  }

  async findAllRevisions(): Promise<AboutContentRevisionDocument[]> {
    return this.revisionModel.find().sort({ version: -1 }).exec();
  }

  async findRevisionById(id: string): Promise<AboutContentRevisionDocument> {
    const revision = await this.revisionModel.findById(id).exec();
    if (!revision) {
      throw new NotFoundException('Revision not found');
    }
    return revision;
  }

  async findPublished(): Promise<AboutContentRevisionDocument> {
    const revision = await this.revisionModel
      .findOne({ status: RevisionStatus.PUBLISHED })
      .sort({ publishedAt: -1 })
      .exec();
    if (!revision) {
      throw new NotFoundException('No published revision found');
    }
    return revision;
  }

  async archiveRevision(id: string): Promise<AboutContentRevisionDocument> {
    const revision = await this.revisionModel.findById(id).exec();
    if (!revision) {
      throw new NotFoundException('Revision not found');
    }
    if (revision.status === RevisionStatus.ARCHIVED) {
      throw new ConflictException('Revision is already archived');
    }
    revision.status = RevisionStatus.ARCHIVED;
    return revision.save();
  }
}
