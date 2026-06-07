import type { GeneratedDocument, InstitutionType } from '@tarpan/shared';
import { apiClient } from './client';

export interface CreateGeneratedDocumentRequest {
  documentId: string;
  institutionType: InstitutionType;
  institutionName?: string;
}

export async function createGeneratedDocument(
  caseId: string,
  data: CreateGeneratedDocumentRequest,
): Promise<GeneratedDocument> {
  const response = await apiClient.post<GeneratedDocument>(
    `/cases/${caseId}/generated-documents`,
    data,
  );
  return response.data;
}

export async function getGeneratedDocuments(caseId: string): Promise<GeneratedDocument[]> {
  const response = await apiClient.get<GeneratedDocument[]>(`/cases/${caseId}/generated-documents`);
  return response.data;
}
