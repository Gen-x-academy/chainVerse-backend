import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createTestApp } from './helpers/test-app.helper';
import {
  makeStudentToken,
  makeTutorToken,
  makeAdminToken,
  makeModeratorToken,
  makeExpiredToken,
} from './helpers/jwt.helper';
import { Book, BookDocument, BookFormat } from '../src/e-library/schemas/book.schema';
import { Hold, HoldDocument, HoldStatus } from '../src/e-library/schemas/hold.schema';
import { Loan, LoanDocument, LoanStatus, CopyStatus } from '../src/e-library/schemas/loan.schema';
import {
  LibraryPolicy,
  LibraryPolicyDocument,
  GLOBAL_LIBRARY_POLICY_SCOPE,
} from '../src/e-library/schemas/library-policy.schema';
import {
  PatronProfile,
  PatronProfileDocument,
  PatronStatus,
  PatronRole,
} from '../src/e-library/schemas/patron-profile.schema';

// ── Stable user IDs (24-char hex, valid ObjectId strings) ───────────────────
const STUDENT_A_ID = '6650a1b2c3d4e5f6a7b8c9d0';
const STUDENT_B_ID = '6650a1b2c3d4e5f6a7b8c9d1';
const TUTOR_ID = '6650a1b2c3d4e5f6a7b8c9d2';
const ADMIN_ID = '6650a1b2c3d4e5f6a7b8c9d3';
const MODERATOR_ID = '6650a1b2c3d4e5f6a7b8c9d4';

// ── Helper to make a far-future date string ──────────────────────────────────
const futureDate = (days = 90) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

// ════════════════════════════════════════════════════════════════════════════
//  E2E Library Journeys – Issue #1071
// ════════════════════════════════════════════════════════════════════════════
describe('Library Journeys (e2e) – Issue #1071', () => {
  let app: INestApplication;

  // Mongoose models for direct DB seeding
  let bookModel: Model<BookDocument>;
  let holdModel: Model<HoldDocument>;
  let loanModel: Model<LoanDocument>;
  let policyModel: Model<LibraryPolicyDocument>;
  let patronProfileModel: Model<PatronProfileDocument>;

  // Seeded IDs
  let bookAId: Types.ObjectId; // 2 copies
  let bookBId: Types.ObjectId; // 1 copy (last-copy edge case)

  // Pre-built tokens
  let studentAToken: string;
  let studentBToken: string;
  let tutorToken: string;
  let adminToken: string;
  let moderatorToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    bookModel = app.get<Model<BookDocument>>(getModelToken(Book.name));
    holdModel = app.get<Model<HoldDocument>>(getModelToken(Hold.name));
    loanModel = app.get<Model<LoanDocument>>(getModelToken(Loan.name));
    policyModel = app.get<Model<LibraryPolicyDocument>>(getModelToken(LibraryPolicy.name));
    patronProfileModel = app.get<Model<PatronProfileDocument>>(getModelToken(PatronProfile.name));

    // ── Seed library policy (singleton) ────────────────────────────────────
    await policyModel.findOneAndUpdate(
      { scope: GLOBAL_LIBRARY_POLICY_SCOPE },
      {
        $setOnInsert: {
          scope: GLOBAL_LIBRARY_POLICY_SCOPE,
          maxActiveHolds: 5,
          allowMultipleEditionsPerWork: false,
          loanPeriodDays: 14,
          maxRenewals: 2,
          renewalExtensionDays: 14,
          holdExpiryDays: 3,
          autoRenewalLeadDays: 2,
          version: 1,
        },
      },
      { upsert: true },
    );

    // ── Seed books ─────────────────────────────────────────────────────────
    const bookA = await bookModel.create({
      title: 'Dune',
      author: 'Frank Herbert',
      workKey: 'dune-frank-herbert',
      format: BookFormat.PHYSICAL,
      totalCopies: 2,
      availableCopies: 2,
    });
    bookAId = bookA._id;

    const bookB = await bookModel.create({
      title: 'Foundation',
      author: 'Isaac Asimov',
      workKey: 'foundation-isaac-asimov',
      format: BookFormat.PHYSICAL,
      totalCopies: 1,
      availableCopies: 1,
    });
    bookBId = bookB._id;

    // ── Seed patron profiles ───────────────────────────────────────────────
    await patronProfileModel.create([
      {
        platformUserId: STUDENT_A_ID,
        role: PatronRole.STUDENT,
        status: PatronStatus.ACTIVE,
        displayName: 'Alice (Student A)',
        email: 'alice@test.local',
      },
      {
        platformUserId: STUDENT_B_ID,
        role: PatronRole.STUDENT,
        status: PatronStatus.ACTIVE,
        displayName: 'Bob (Student B)',
        email: 'bob@test.local',
      },
      {
        platformUserId: TUTOR_ID,
        role: PatronRole.TUTOR,
        status: PatronStatus.ACTIVE,
        displayName: 'Carol (Tutor)',
        email: 'carol@test.local',
      },
    ]);

    // ── Generate tokens ────────────────────────────────────────────────────
    studentAToken = makeStudentToken(STUDENT_A_ID, 'alice@test.local');
    studentBToken = makeStudentToken(STUDENT_B_ID, 'bob@test.local');
    tutorToken = makeTutorToken(TUTOR_ID, 'carol@test.local');
    adminToken = makeAdminToken(ADMIN_ID, 'admin@test.local');
    moderatorToken = makeModeratorToken(MODERATOR_ID, 'moderator@test.local');
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Group 1: Student Journey – Discovery to Checkout
  // ════════════════════════════════════════════════════════════════════════
  describe('Group 1 – Student Journey: Discovery to Checkout', () => {
    it('student can list books in the catalog', async () => {
      const res = await request(app.getHttpServer())
        .get('/library/books')
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.total).toBeGreaterThanOrEqual(2);

      const titles = res.body.data.map((b: any) => b.title);
      expect(titles).toContain('Dune');
      expect(titles).toContain('Foundation');
    });

    it('student can view a specific book', async () => {
      const res = await request(app.getHttpServer())
        .get(`/library/books/${bookAId}`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(200);

      expect(res.body.title).toBe('Dune');
      expect(res.body.author).toBe('Frank Herbert');
      expect(res.body.workKey).toBe('dune-frank-herbert');
      expect(res.body.totalCopies).toBe(2);
      expect(res.body.availableCopies).toBe(2);
    });

    it('student can place a hold on a book', async () => {
      const res = await request(app.getHttpServer())
        .post('/library/holds')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({ bookId: bookAId.toString() })
        .expect(201);

      expect(res.body.patronId).toBe(STUDENT_A_ID);
      expect(res.body.bookId.toString()).toBe(bookAId.toString());
      expect(res.body.status).toBe(HoldStatus.PENDING);
      expect(res.body.workKey).toBe('dune-frank-herbert');
    });

    it('student can view their holds', async () => {
      const res = await request(app.getHttpServer())
        .get('/library/holds')
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const hold = res.body.data.find(
        (h: any) => h.bookId.toString() === bookAId.toString(),
      );
      expect(hold).toBeDefined();
      expect(hold.patronId).toBe(STUDENT_A_ID);
    });

    it('student can view hold queue status', async () => {
      // Fetch holds first to get the hold ID
      const holdsRes = await request(app.getHttpServer())
        .get('/library/holds')
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(200);

      const holdId = holdsRes.body.data[0]._id;

      const res = await request(app.getHttpServer())
        .get(`/library/holds/${holdId}/status`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(200);

      expect(res.body.holdId).toBe(holdId);
      expect(res.body.bookId).toBe(bookAId.toString());
      expect(res.body.status).toBe(HoldStatus.PENDING);
      expect(typeof res.body.queuePosition).toBe('number');
      expect(typeof res.body.estimatedWaitDays).toBe('number');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Group 2: Student Journey – Renewal and Return
  // ════════════════════════════════════════════════════════════════════════
  describe('Group 2 – Student Journey: Renewal and Return', () => {
    let loanId: string;

    beforeAll(async () => {
      // Seed an active loan for student A on book A
      const loan = await loanModel.create({
        patronId: STUDENT_A_ID,
        bookId: bookAId,
        workKey: 'dune-frank-herbert',
        checkedOutAt: new Date(),
        dueDate: new Date(Date.now() + 14 * 86_400_000),
        renewalCount: 0,
        status: LoanStatus.ACTIVE,
        copyStatus: CopyStatus.NORMAL,
        autoRenewEnabled: false,
        renewalHistory: [],
      });
      loanId = (loan._id as Types.ObjectId).toString();

      // Decrement available copies to reflect the checkout
      await bookModel.findByIdAndUpdate(bookAId, { $inc: { availableCopies: -1 } });
    });

    it('student can renew an active loan', async () => {
      const before = await loanModel.findById(loanId).lean();
      const oldDueDate = before!.dueDate;

      const res = await request(app.getHttpServer())
        .post(`/library/loans/${loanId}/renew`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(201);

      expect(res.body.renewalCount).toBe(1);
      expect(new Date(res.body.dueDate).getTime()).toBeGreaterThan(
        new Date(oldDueDate).getTime(),
      );
      expect(res.body.renewalHistory.length).toBe(1);
      expect(res.body.renewalHistory[0].method).toBe('manual');
    });

    it('student can toggle auto-renew on a loan', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/library/loans/${loanId}/auto-renew`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({ autoRenewEnabled: true })
        .expect(200);

      expect(res.body.autoRenewEnabled).toBe(true);
      expect(res.body._id).toBe(loanId);

      // Toggle back off
      const res2 = await request(app.getHttpServer())
        .patch(`/library/loans/${loanId}/auto-renew`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({ autoRenewEnabled: false })
        .expect(200);

      expect(res2.body.autoRenewEnabled).toBe(false);
    });

    it('student can view their loan history', async () => {
      const res = await request(app.getHttpServer())
        .get('/library/loans')
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const found = res.body.data.find((l: any) => l._id === loanId);
      expect(found).toBeDefined();
      expect(found.patronId).toBe(STUDENT_A_ID);
    });

    it('student cannot renew a loan they do not own', async () => {
      // Student B tries to renew Student A's loan
      await request(app.getHttpServer())
        .post(`/library/loans/${loanId}/renew`)
        .set('Authorization', `Bearer ${studentBToken}`)
        .expect(403);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Group 3: Librarian/Staff Journey
  // ════════════════════════════════════════════════════════════════════════
  describe('Group 3 – Librarian/Staff Journey', () => {
    let staffBookId: string;

    it('librarian can create a new book', async () => {
      const res = await request(app.getHttpServer())
        .post('/library/books')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Neuromancer',
          author: 'William Gibson',
          workKey: 'neuromancer-william-gibson',
          format: BookFormat.PHYSICAL,
          totalCopies: 3,
        })
        .expect(201);

      expect(res.body.title).toBe('Neuromancer');
      expect(res.body.author).toBe('William Gibson');
      expect(res.body.workKey).toBe('neuromancer-william-gibson');
      expect(res.body.totalCopies).toBe(3);
      expect(res.body.availableCopies).toBe(3);
      staffBookId = res.body._id;
    });

    it('librarian can checkout a book to a patron', async () => {
      const res = await request(app.getHttpServer())
        .post('/library/loans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patronId: STUDENT_A_ID,
          bookId: staffBookId,
          dueDate: futureDate(14),
        })
        .expect(201);

      expect(res.body.patronId).toBe(STUDENT_A_ID);
      expect(res.body.status).toBe(LoanStatus.ACTIVE);
      expect(res.body.workKey).toBe('neuromancer-william-gibson');

      // Verify available copies decremented
      const book = await bookModel.findById(staffBookId).lean();
      expect(book!.availableCopies).toBe(2);
    });

    it('librarian can view and update library policy', async () => {
      // GET policy
      const getRes = await request(app.getHttpServer())
        .get('/library/policy')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(getRes.body.scope).toBe(GLOBAL_LIBRARY_POLICY_SCOPE);
      expect(typeof getRes.body.maxActiveHolds).toBe('number');
      expect(typeof getRes.body.loanPeriodDays).toBe('number');
      const oldVersion = getRes.body.version;

      // PATCH policy
      const patchRes = await request(app.getHttpServer())
        .patch('/library/policy')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ loanPeriodDays: 21, maxRenewals: 3 })
        .expect(200);

      expect(patchRes.body.loanPeriodDays).toBe(21);
      expect(patchRes.body.maxRenewals).toBe(3);
      expect(patchRes.body.version).toBe(oldVersion + 1);

      // Verify via GET
      const verifyRes = await request(app.getHttpServer())
        .get('/library/policy')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(verifyRes.body.loanPeriodDays).toBe(21);
      expect(verifyRes.body.maxRenewals).toBe(3);
    });

    it('student cannot create books', async () => {
      await request(app.getHttpServer())
        .post('/library/books')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          title: 'Forbidden Book',
          author: 'Nobody',
          workKey: 'forbidden-nobody',
          format: BookFormat.PHYSICAL,
          totalCopies: 1,
        })
        .expect(403);
    });

    it('student cannot checkout books (staff-only endpoint)', async () => {
      await request(app.getHttpServer())
        .post('/library/loans')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          patronId: STUDENT_A_ID,
          bookId: bookAId.toString(),
          dueDate: futureDate(14),
        })
        .expect(403);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Group 4: Cross-User and Cross-Role Denial
  // ════════════════════════════════════════════════════════════════════════
  describe('Group 4 – Cross-User and Cross-Role Denial', () => {
    let studentAHoldId: string;

    beforeAll(async () => {
      // Ensure student A has a hold for cross-user tests
      const existing = await holdModel.findOne({
        patronId: STUDENT_A_ID,
        status: { $in: [HoldStatus.PENDING, HoldStatus.READY] },
      });
      if (existing) {
        studentAHoldId = (existing._id as Types.ObjectId).toString();
      } else {
        const hold = await holdModel.create({
          patronId: STUDENT_A_ID,
          bookId: bookAId,
          workKey: 'dune-frank-herbert',
          status: HoldStatus.PENDING,
          requestedAt: new Date(),
          expiresAt: new Date(Date.now() + 3 * 86_400_000),
        });
        studentAHoldId = (hold._id as Types.ObjectId).toString();
      }
    });

    it('student B cannot view student A holds via list endpoint', async () => {
      const res = await request(app.getHttpServer())
        .get('/library/holds')
        .set('Authorization', `Bearer ${studentBToken}`)
        .expect(200);

      // Student B's holds list should be empty or not contain A's holds
      const aHolds = res.body.data.filter(
        (h: any) => h.patronId === STUDENT_A_ID,
      );
      expect(aHolds.length).toBe(0);
    });

    it('unauthenticated user gets 401 on all library endpoints', async () => {
      await request(app.getHttpServer())
        .get('/library/books')
        .expect(401);

      await request(app.getHttpServer())
        .get('/library/loans')
        .expect(401);

      await request(app.getHttpServer())
        .post('/library/holds')
        .send({ bookId: bookAId.toString() })
        .expect(401);

      await request(app.getHttpServer())
        .get('/library/policy')
        .expect(401);
    });

    it('tutor can access library catalog endpoints', async () => {
      // Tutor should be able to list books
      const listRes = await request(app.getHttpServer())
        .get('/library/books')
        .set('Authorization', `Bearer ${tutorToken}`)
        .expect(200);

      expect(Array.isArray(listRes.body.data)).toBe(true);

      // Tutor should be able to view a single book
      const detailRes = await request(app.getHttpServer())
        .get(`/library/books/${bookAId}`)
        .set('Authorization', `Bearer ${tutorToken}`)
        .expect(200);

      expect(detailRes.body.title).toBe('Dune');
    });

    it('expired token gets 401', async () => {
      const expired = makeExpiredToken(STUDENT_A_ID, 'alice@test.local');

      await request(app.getHttpServer())
        .get('/library/books')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });

    it('tutor cannot checkout books (admin/moderator only)', async () => {
      await request(app.getHttpServer())
        .post('/library/loans')
        .set('Authorization', `Bearer ${tutorToken}`)
        .send({
          patronId: TUTOR_ID,
          bookId: bookAId.toString(),
          dueDate: futureDate(14),
        })
        .expect(403);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Group 5: Concurrency and Edge Cases
  // ════════════════════════════════════════════════════════════════════════
  describe('Group 5 – Concurrency and Edge Cases', () => {
    it('checkout last copy returns conflict for second request', async () => {
      // bookB has 1 copy. First checkout succeeds.
      await request(app.getHttpServer())
        .post('/library/loans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patronId: STUDENT_A_ID,
          bookId: bookBId.toString(),
          dueDate: futureDate(14),
        })
        .expect(201);

      // Verify available copies are now 0
      const book = await bookModel.findById(bookBId).lean();
      expect(book!.availableCopies).toBe(0);

      // Second checkout should fail with 409
      await request(app.getHttpServer())
        .post('/library/loans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patronId: STUDENT_B_ID,
          bookId: bookBId.toString(),
          dueDate: futureDate(14),
        })
        .expect(409);
    });

    it('hold on non-existent book returns 404', async () => {
      const fakeBookId = new Types.ObjectId().toString();

      await request(app.getHttpServer())
        .post('/library/holds')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({ bookId: fakeBookId })
        .expect(404);
    });

    it('renew already renewed loan past limit returns conflict', async () => {
      // Create a loan that has already hit the renewal limit (maxRenewals = 2 after our policy update)
      const loan = await loanModel.create({
        patronId: STUDENT_A_ID,
        bookId: bookAId,
        workKey: 'dune-frank-herbert',
        checkedOutAt: new Date(),
        dueDate: new Date(Date.now() + 30 * 86_400_000),
        renewalCount: 3,
        status: LoanStatus.ACTIVE,
        copyStatus: CopyStatus.NORMAL,
        autoRenewEnabled: false,
        renewalHistory: [],
      });
      const expiredLoanId = (loan._id as Types.ObjectId).toString();

      await request(app.getHttpServer())
        .post(`/library/loans/${expiredLoanId}/renew`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(409);
    });

    it('cancel already cancelled hold returns conflict', async () => {
      // Create a hold for student A on book B (which has a different workKey)
      const hold = await holdModel.create({
        patronId: STUDENT_A_ID,
        bookId: bookBId,
        workKey: 'foundation-isaac-asimov',
        status: HoldStatus.PENDING,
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + 3 * 86_400_000),
      });
      const holdId = (hold._id as Types.ObjectId).toString();

      // First cancel succeeds
      await request(app.getHttpServer())
        .delete(`/library/holds/${holdId}`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(200);

      // Second cancel returns conflict
      await request(app.getHttpServer())
        .delete(`/library/holds/${holdId}`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(409);
    });
  });
});
