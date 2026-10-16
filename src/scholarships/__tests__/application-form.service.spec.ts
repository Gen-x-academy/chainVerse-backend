import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ApplicationFormService } from '../services/application-form.service';
import {
  ApplicationForm,
  FieldType,
  FormStatus,
} from '../schemas/application-form.schema';
import {
  BusinessRuleException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ADMIN_ID = 'admin-user-001';

const buildMockForm = (overrides: Partial<any> = {}): any => ({
  _id: 'form-id-001',
  programId: 'program-001',
  tenantId: 'tenant-001',
  version: 1,
  title: 'Scholarship Application 2026',
  sections: [
    {
      sectionId: 'section-001',
      title: 'Personal Information',
      order: 0,
      isRequired: true,
      fields: [
        {
          fieldId: 'field-name',
          label: 'Full Name',
          type: FieldType.TEXT,
          required: true,
          options: undefined,
          conditionalOn: undefined,
        },
        {
          fieldId: 'field-country',
          label: 'Country',
          type: FieldType.SELECT,
          required: true,
          options: ['Nigeria', 'Ghana', 'Kenya'],
          conditionalOn: undefined,
        },
        {
          fieldId: 'field-state',
          label: 'State / Region',
          type: FieldType.TEXT,
          required: false,
          options: undefined,
          conditionalOn: { fieldId: 'field-country', value: 'Nigeria' },
        },
      ],
    },
  ],
  status: FormStatus.DRAFT,
  publishedAt: undefined,
  publishedBy: undefined,
  createdBy: ADMIN_ID,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

// ── Mock Model factory ────────────────────────────────────────────────────────

const createMockModel = (docOverride?: Partial<any>) => {
  const mockDoc = buildMockForm(docOverride);

  const mockModel = jest.fn().mockImplementation(() => mockDoc);
  (mockModel as any).create = jest.fn().mockResolvedValue(mockDoc);
  (mockModel as any).find = jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([mockDoc]),
    }),
  });
  (mockModel as any).findById = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue(mockDoc),
  });

  return { mockModel, mockDoc };
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('ApplicationFormService', () => {
  let service: ApplicationFormService;
  let mockModel: any;
  let mockDoc: any;

  beforeEach(async () => {
    ({ mockModel, mockDoc } = createMockModel());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationFormService,
        { provide: getModelToken(ApplicationForm.name), useValue: mockModel },
      ],
    }).compile();

    service = module.get<ApplicationFormService>(ApplicationFormService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a form in DRAFT status', async () => {
      const dto = {
        programId: 'program-001',
        tenantId: 'tenant-001',
        title: 'Test Form',
        sections: [],
      };

      const result = await service.create(dto, ADMIN_ID);

      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          programId: 'program-001',
          tenantId: 'tenant-001',
          createdBy: ADMIN_ID,
          status: FormStatus.DRAFT,
          version: 1,
        }),
      );
      expect(result).toBeDefined();
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates a DRAFT form successfully', async () => {
      mockDoc.status = FormStatus.DRAFT;
      const dto = { title: 'Updated Title' };

      const result = await service.update(mockDoc._id, dto, ADMIN_ID);

      expect(mockDoc.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws BusinessRuleException when trying to update a PUBLISHED form', async () => {
      mockDoc.status = FormStatus.PUBLISHED;
      const dto = { title: 'Should Fail' };

      await expect(service.update(mockDoc._id, dto, ADMIN_ID)).rejects.toThrow(
        BusinessRuleException,
      );
    });

    it('update on PUBLISHED form uses BIZ_FORM_NOT_DRAFT error code', async () => {
      mockDoc.status = FormStatus.PUBLISHED;

      try {
        await service.update(mockDoc._id, {}, ADMIN_ID);
        fail('Expected BusinessRuleException');
      } catch (err: any) {
        expect(err.errorCode).toBe(ErrorCode.BIZ_FORM_NOT_DRAFT);
      }
    });
  });

  // ── publish ────────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('transitions a DRAFT form to PUBLISHED and sets publishedAt/publishedBy', async () => {
      mockDoc.status = FormStatus.DRAFT;
      mockDoc.publishedAt = undefined;

      const result = await service.publish(mockDoc._id, ADMIN_ID);

      expect(mockDoc.status).toBe(FormStatus.PUBLISHED);
      expect(mockDoc.publishedAt).toBeInstanceOf(Date);
      expect(mockDoc.publishedBy).toBe(ADMIN_ID);
      expect(mockDoc.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws BusinessRuleException when publishing an already PUBLISHED form', async () => {
      mockDoc.status = FormStatus.PUBLISHED;

      await expect(service.publish(mockDoc._id, ADMIN_ID)).rejects.toThrow(
        BusinessRuleException,
      );
    });
  });

  // ── archive ────────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('transitions a PUBLISHED form to ARCHIVED', async () => {
      mockDoc.status = FormStatus.PUBLISHED;

      const result = await service.archive(mockDoc._id, ADMIN_ID);

      expect(mockDoc.status).toBe(FormStatus.ARCHIVED);
      expect(mockDoc.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws BusinessRuleException when archiving a DRAFT form', async () => {
      mockDoc.status = FormStatus.DRAFT;

      await expect(service.archive(mockDoc._id, ADMIN_ID)).rejects.toThrow(
        BusinessRuleException,
      );
    });

    it('archive on non-PUBLISHED form uses BIZ_FORM_NOT_PUBLISHED error code', async () => {
      mockDoc.status = FormStatus.DRAFT;

      try {
        await service.archive(mockDoc._id, ADMIN_ID);
        fail('Expected BusinessRuleException');
      } catch (err: any) {
        expect(err.errorCode).toBe(ErrorCode.BIZ_FORM_NOT_PUBLISHED);
      }
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the form when it exists', async () => {
      const result = await service.findOne(mockDoc._id);
      expect(result).toBe(mockDoc);
    });

    it('throws ResourceNotFoundException when form does not exist', async () => {
      mockModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        ResourceNotFoundException,
      );
    });
  });

  // ── validateAnswers ────────────────────────────────────────────────────────

  describe('validateAnswers', () => {
    beforeEach(() => {
      // Ensure the mock form is PUBLISHED with version 1
      mockDoc.status = FormStatus.PUBLISHED;
      mockDoc.version = 1;
    });

    it('returns valid=true for a correctly completed form', async () => {
      const answers = [
        { fieldId: 'field-name', value: 'Amara Okafor' },
        { fieldId: 'field-country', value: 'Kenya' },
        // field-state conditional on country=Nigeria — not triggered, so skip
      ];

      const result = await service.validateAnswers(mockDoc._id, 1, answers);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid=false and lists error when a required field is missing', async () => {
      const answers = [
        // field-name is required — omitted deliberately
        { fieldId: 'field-country', value: 'Ghana' },
      ];

      const result = await service.validateAnswers(mockDoc._id, 1, answers);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('field-name'))).toBe(true);
    });

    it('returns valid=false when a SELECT value is not in the options list', async () => {
      const answers = [
        { fieldId: 'field-name', value: 'Test User' },
        { fieldId: 'field-country', value: 'InvalidCountry' },
      ];

      const result = await service.validateAnswers(mockDoc._id, 1, answers);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('InvalidCountry'))).toBe(true);
    });

    it('skips a conditional field when its condition is not met', async () => {
      // field-state is conditional on field-country === 'Nigeria'
      // Here we select Ghana, so field-state should be invisible and not required
      const answers = [
        { fieldId: 'field-name', value: 'Kofi Mensah' },
        { fieldId: 'field-country', value: 'Ghana' },
        // field-state intentionally omitted — should not cause an error
      ];

      const result = await service.validateAnswers(mockDoc._id, 1, answers);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid=false on version mismatch', async () => {
      const answers = [{ fieldId: 'field-name', value: 'Test' }];

      const result = await service.validateAnswers(mockDoc._id, 99, answers);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/version mismatch/i);
    });

    it('returns valid=false when form is not found', async () => {
      mockModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.validateAnswers('bad-id', 1, []);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/not found/i);
    });
  });
});
