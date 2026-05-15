import { Test, TestingModule } from '@nestjs/testing';
import { InstitutionType } from '@tarpan/shared';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('TemplatesController', () => {
  let controller: TemplatesController;
  let service: TemplatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [TemplatesService],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TemplatesController>(TemplatesController);
    service = module.get<TemplatesService>(TemplatesService);
  });

  describe('findAll', () => {
    it('returns all 16 templates', () => {
      const result = controller.findAll();
      expect(result).toHaveLength(16);
    });

    it('each template has required fields', () => {
      const templates = controller.findAll();
      for (const t of templates) {
        expect(t.templateId).toBeTruthy();
        expect(t.institutionType).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(['Government', 'Financial', 'Utilities & Services', 'Professional']).toContain(
          t.category,
        );
      }
    });

    it('covers every InstitutionType', () => {
      const templates = controller.findAll();
      const covered = new Set(templates.map((t) => t.institutionType));
      for (const type of Object.values(InstitutionType)) {
        expect(covered).toContain(type);
      }
    });
  });

  describe('TemplatesService.getTemplateId', () => {
    it('returns correct templateId for known type', () => {
      expect(service.getTemplateId(InstitutionType.SOCIAL_SECURITY_ADMINISTRATION)).toBe('ssa-721');
      expect(service.getTemplateId(InstitutionType.IRS)).toBe('irs-notification');
      expect(service.getTemplateId(InstitutionType.BANK)).toBe('bank-closure');
    });

    it('throws NotFoundException for unknown type', () => {
      expect(() => service.getTemplateId('UNKNOWN_TYPE' as InstitutionType)).toThrow(
        'No template found for institution type: UNKNOWN_TYPE',
      );
    });
  });
});
