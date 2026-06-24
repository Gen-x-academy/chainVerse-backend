import { FinancialAidApplication } from './financial-aid-application.entity';

/**
 * Repository contract for financial-aid application persistence.
 *
 * Defined as an abstract class (not a TypeScript interface) so that NestJS
 * can use it as an injection token at runtime.  Concrete implementations
 * (in-memory, MongoDB, Postgres …) live in the infrastructure layer and are
 * swapped in the module without touching any use-case or domain code.
 */
export abstract class FinancialAidApplicationRepository {
  /** Persist a new or updated application.  Returns the saved instance. */
  abstract save(
    application: FinancialAidApplication,
  ): Promise<FinancialAidApplication>;

  /** Return all applications, or an empty array when none exist. */
  abstract findAll(): Promise<FinancialAidApplication[]>;

  /** Return the application with the given id, or null when not found. */
  abstract findById(id: string): Promise<FinancialAidApplication | null>;

  /** Return all applications belonging to a student. */
  abstract findByStudentId(
    studentId: string,
  ): Promise<FinancialAidApplication[]>;

  /** Return the application for a specific student+course pair, or null. */
  abstract findByStudentAndCourse(
    studentId: string,
    courseId: string,
  ): Promise<FinancialAidApplication | null>;

  /** Permanently remove the application with the given id. */
  abstract delete(id: string): Promise<void>;
}
