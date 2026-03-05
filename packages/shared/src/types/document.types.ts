export enum DocumentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

export enum DocumentType {
  DEATH_CERTIFICATE = 'DEATH_CERTIFICATE',
}

/**
 * Structured data extracted from a death certificate by the AI processor.
 * Fields vary by issuing state; all fields are optional to handle partial extractions.
 */
export interface ExtractedCertificateData {
  // Decedent information
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dateOfBirth?: string;
  dateOfDeath?: string;
  age?: number;
  sex?: string;
  race?: string;
  maritalStatus?: string;
  socialSecurityNumber?: string;

  // Location
  placeOfDeath?: string;
  cityOfDeath?: string;
  countyOfDeath?: string;
  stateOfDeath?: string;

  // Certificate metadata
  certificateNumber?: string;
  dateIssued?: string;
  issuingCounty?: string;
  issuingState?: string;
  registrarName?: string;

  // Cause of death
  causeOfDeath?: string;
  mannerOfDeath?: string;

  // Surviving family
  survivingSpouse?: string;

  // Residence
  residenceAddress?: string;
  residenceCity?: string;
  residenceState?: string;
  residenceZip?: string;

  // AI extraction metadata
  extractionConfidence: number; // 0–1 confidence score
  needsReview: boolean; // true if confidence < threshold or fields are missing
}

export interface Document {
  id: string;
  caseId: string;
  type: DocumentType;
  status: DocumentStatus;
  s3Key: string;
  extractedData?: ExtractedCertificateData;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Payload published to SQS for the processor Lambda */
export interface DocumentProcessingJob {
  documentId: string;
  caseId: string;
  s3Key: string;
}

/** Callback payload sent by Lambda to the API when processing is complete */
export interface DocumentProcessingResult {
  documentId: string;
  status: DocumentStatus.PROCESSED | DocumentStatus.FAILED;
  extractedData?: ExtractedCertificateData;
  errorMessage?: string;
}
