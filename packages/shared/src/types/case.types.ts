export enum CaseStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
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
  createdAt: Date;
  updatedAt: Date;
}
