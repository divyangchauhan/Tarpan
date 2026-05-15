import { Injectable, NotFoundException } from '@nestjs/common';
import { InstitutionType, Template } from '@tarpan/shared';

const TEMPLATES: Template[] = [
  // Government
  {
    templateId: 'ssa-721',
    institutionType: InstitutionType.SOCIAL_SECURITY_ADMINISTRATION,
    label: 'Social Security Administration',
    category: 'Government',
  },
  {
    templateId: 'medicare',
    institutionType: InstitutionType.MEDICARE,
    label: 'Medicare',
    category: 'Government',
  },
  {
    templateId: 'irs-notification',
    institutionType: InstitutionType.IRS,
    label: 'Internal Revenue Service (IRS)',
    category: 'Government',
  },
  {
    templateId: 'veterans-affairs',
    institutionType: InstitutionType.VETERANS_AFFAIRS,
    label: 'Veterans Affairs (VA)',
    category: 'Government',
  },
  {
    templateId: 'dmv-notification',
    institutionType: InstitutionType.STATE_DMV,
    label: 'State DMV',
    category: 'Government',
  },
  {
    templateId: 'voter-registration',
    institutionType: InstitutionType.VOTER_REGISTRATION,
    label: 'Voter Registration',
    category: 'Government',
  },
  {
    templateId: 'passport-cancellation',
    institutionType: InstitutionType.PASSPORT,
    label: 'U.S. Passport Services',
    category: 'Government',
  },

  // Financial
  {
    templateId: 'bank-closure',
    institutionType: InstitutionType.BANK,
    label: 'Bank / Credit Union',
    category: 'Financial',
  },
  {
    templateId: 'credit-card-cancellation',
    institutionType: InstitutionType.CREDIT_CARD,
    label: 'Credit Card Issuer',
    category: 'Financial',
  },
  {
    templateId: 'pension-401k',
    institutionType: InstitutionType.PENSION_401K,
    label: 'Pension / 401(k) Provider',
    category: 'Financial',
  },
  {
    templateId: 'life-insurance',
    institutionType: InstitutionType.LIFE_INSURANCE,
    label: 'Life Insurance Company',
    category: 'Financial',
  },

  // Utilities & Services
  {
    templateId: 'usps-notification',
    institutionType: InstitutionType.USPS,
    label: 'U.S. Postal Service (USPS)',
    category: 'Utilities & Services',
  },
  {
    templateId: 'subscription-cancellation',
    institutionType: InstitutionType.SUBSCRIPTION_STREAMING,
    label: 'Streaming Subscriptions',
    category: 'Utilities & Services',
  },
  {
    templateId: 'subscription-cancellation',
    institutionType: InstitutionType.SUBSCRIPTION_UTILITY,
    label: 'Utility Providers',
    category: 'Utilities & Services',
  },

  // Professional
  {
    templateId: 'employer-notification',
    institutionType: InstitutionType.EMPLOYER_HR,
    label: 'Employer / HR Department',
    category: 'Professional',
  },
  {
    templateId: 'professional-license',
    institutionType: InstitutionType.PROFESSIONAL_LICENSE_BOARD,
    label: 'Professional License Board',
    category: 'Professional',
  },
];

// Fast lookup by institutionType
const TEMPLATE_BY_TYPE = new Map<InstitutionType, Template>(
  TEMPLATES.map((t) => [t.institutionType, t]),
);

@Injectable()
export class TemplatesService {
  findAll(): Template[] {
    return TEMPLATES;
  }

  getTemplateId(institutionType: InstitutionType): string {
    const template = TEMPLATE_BY_TYPE.get(institutionType);
    if (!template) {
      throw new NotFoundException(`No template found for institution type: ${institutionType}`);
    }
    return template.templateId;
  }
}
