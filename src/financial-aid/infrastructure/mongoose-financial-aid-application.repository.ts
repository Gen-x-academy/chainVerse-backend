import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FinancialAidApplication } from '../domain/financial-aid-application.entity';
import { FinancialAidApplicationRepository } from '../domain/financial-aid-application.repository';
import {
  FinancialAid,
  FinancialAidDocument,
} from '../schemas/financial-aid.schema';

/**
 * MongoDB/Mongoose implementation of the repository contract.
 *
 * Maps between the persistence model (FinancialAidDocument) and the domain
 * entity (FinancialAidApplication) so use-cases stay free of Mongoose types.
 * Swapping this for any other driver only requires changing the `useClass`
 * in FinancialAidModule — nothing else in the domain or use-case layers changes.
 *
 * ID strategy: on first save MongoDB assigns an ObjectId; that ObjectId string
 * becomes the canonical entity id returned to callers.  Subsequent saves
 * find the document by that id and apply field-level updates.
 */
@Injectable()
export class MongooseFinancialAidApplicationRepository extends FinancialAidApplicationRepository {
  constructor(
    @InjectModel(FinancialAid.name)
    private readonly model: Model<FinancialAidDocument>,
  ) {
    super();
  }

  async save(
    application: FinancialAidApplication,
  ): Promise<FinancialAidApplication> {
    const existing = await this.model.findById(application.id).exec();

    if (existing) {
      existing.reason = application.reason;
      existing.status = application.status;
      return this.toEntity(await existing.save());
    }

    // First save: let MongoDB assign the ObjectId; entity id is a draft UUID
    // that gets replaced by the real persisted id in the returned entity.
    const created = await new this.model({
      studentId: application.studentId,
      courseId: application.courseId,
      reason: application.reason,
      status: application.status,
    }).save();

    return this.toEntity(created);
  }

  async findAll(): Promise<FinancialAidApplication[]> {
    const docs = await this.model.find().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findById(id: string): Promise<FinancialAidApplication | null> {
    const doc = await this.model.findById(id).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByStudentId(studentId: string): Promise<FinancialAidApplication[]> {
    const docs = await this.model.find({ studentId }).exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findByStudentAndCourse(
    studentId: string,
    courseId: string,
  ): Promise<FinancialAidApplication | null> {
    const doc = await this.model.findOne({ studentId, courseId }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }

  private toEntity(doc: FinancialAidDocument): FinancialAidApplication {
    return new FinancialAidApplication(
      doc._id.toString(),
      doc.studentId,
      doc.courseId,
      doc.reason,
      doc.status,
      (doc as any).createdAt ?? new Date(),
      (doc as any).updatedAt ?? new Date(),
    );
  }
}
