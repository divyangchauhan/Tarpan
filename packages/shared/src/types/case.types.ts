export enum CaseStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export interface ExecutorInfo {
  name: string;
  address: string;
  relationship: string;
  phone?: string;
  email?: string;
}

export interface DeceasedInfo {
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string; // ISO 8601 date string
  dateOfDeath: string; // ISO 8601 date string
  placeOfDeath: string;
  socialSecurityNumber?: string; // Encrypted at rest
}

export interface Case {
  id: string;
  userId: string;
  status: CaseStatus;
  deceasedInfo: DeceasedInfo;
  executorInfo?: ExecutorInfo;
  createdAt: Date;
  updatedAt: Date;
}
