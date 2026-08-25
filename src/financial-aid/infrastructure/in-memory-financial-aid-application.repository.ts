import { Injectable } from '@nestjs/common';
import { FinancialAidApplication } from '../domain/financial-aid-application.entity';
import { FinancialAidApplicationRepository } from '../domain/financial-aid-application.repository';

/**
 * Volatile, in-process implementation of the repository.
 *
 * Data lives only for the lifetime of the process.  Swap this provider
 * in the module for a database-backed implementation without touching
 * use cases or the controller.
 */
@Injectable()
export class InMemoryFinancialAidApplicationRepository extends FinancialAidApplicationRepository {
  private readonly store: FinancialAidApplication[] = [];

  async save(
    application: FinancialAidApplication,
  ): Promise<FinancialAidApplication> {
    const idx = this.store.findIndex((a) => a.id === application.id);
    if (idx === -1) {
      this.store.push(application);
    } else {
      this.store[idx] = application;
    }
    return application;
  }

  async findAll(): Promise<FinancialAidApplication[]> {
    return [...this.store];
  }

  async findById(id: string): Promise<FinancialAidApplication | null> {
    return this.store.find((a) => a.id === id) ?? null;
  }

  async findByStudentId(studentId: string): Promise<FinancialAidApplication[]> {
    return this.store.filter((a) => a.studentId === studentId);
  }

  async findByStudentAndCourse(
    studentId: string,
    courseId: string,
  ): Promise<FinancialAidApplication | null> {
    return (
      this.store.find(
        (a) => a.studentId === studentId && a.courseId === courseId,
      ) ?? null
    );
  }

  async delete(id: string): Promise<void> {
    const idx = this.store.findIndex((a) => a.id === id);
    if (idx !== -1) this.store.splice(idx, 1);
  }
}
