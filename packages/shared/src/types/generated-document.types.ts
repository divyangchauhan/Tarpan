export interface Template {
  templateId: string;
  institutionType: InstitutionType;
  label: string;
  category: 'Government' | 'Financial' | 'Utilities & Services' | 'Professional';
}

export enum InstitutionType {
  // Government
  SOCIAL_SECURITY_ADMINISTRATION = 'SOCIAL_SECURITY_ADMINISTRATION',
  MEDICARE = 'MEDICARE',
  IRS = 'IRS',
  VETERANS_AFFAIRS = 'VETERANS_AFFAIRS',
  STATE_DMV = 'STATE_DMV',
  VOTER_REGISTRATION = 'VOTER_REGISTRATION',
  PASSPORT = 'PASSPORT',

  // Financial
  BANK = 'BANK',
  CREDIT_CARD = 'CREDIT_CARD',
  PENSION_401K = 'PENSION_401K',
  LIFE_INSURANCE = 'LIFE_INSURANCE',

  // Utilities & Services
  USPS = 'USPS',
  SUBSCRIPTION_STREAMING = 'SUBSCRIPTION_STREAMING',
  SUBSCRIPTION_UTILITY = 'SUBSCRIPTION_UTILITY',

  // Professional
  EMPLOYER_HR = 'EMPLOYER_HR',
  PROFESSIONAL_LICENSE_BOARD = 'PROFESSIONAL_LICENSE_BOARD',
}

export enum GeneratedDocumentStatus {
  PENDING = 'PENDING',
  GENERATING = 'GENERATING',
  READY = 'READY',
  FAILED = 'FAILED',
}

export interface GeneratedDocument {
  id: string;
  caseId: string;
  documentId: string; // source death certificate document
  institutionType: InstitutionType;
  institutionName?: string; // e.g. "Chase Bank" when type is BANK
  status: GeneratedDocumentStatus;
  s3Key?: string; // set when status is READY
  downloadUrl?: string; // pre-signed S3 URL, short-lived
  createdAt: Date;
  updatedAt: Date;
}

/** Payload for requesting document generation */
export interface GenerationRequest {
  caseId: string;
  documentId: string;
  institutions: Array<{
    type: InstitutionType;
    institutionName?: string;
  }>;
}

/**
 * Payload published to the document-generation SQS queue.
 * One message per institution (one GeneratedDocument row per message).
 * The `deceased` object uses snake_case to match the Python Pydantic model field names.
 */
export interface DocumentGenerationJob {
  generatedDocumentId: string;
  templateId: string;
  caseId: string;
  documentId: string;
  deceased: {
    full_name: string;
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
    date_of_birth?: string | null;
    date_of_death: string;
    place_of_death: string;
    state?: string | null;
    certificate_number?: string | null;
  };
  executorName: string;
  executorAddress: string;
  executorRelationship: string;
  executorPhone?: string | null;
  executorEmail?: string | null;
  institutionName?: string | null;
  institutionAddress?: string | null;
}

/** Callback payload sent by Lambda to the API when generation completes */
export interface DocumentGenerationResult {
  generatedDocumentId: string;
  status: GeneratedDocumentStatus.READY | GeneratedDocumentStatus.FAILED;
  s3Key?: string;
  errorMessage?: string;
}
