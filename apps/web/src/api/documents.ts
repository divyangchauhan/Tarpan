import type { Document } from '@tarpan/shared';
import { apiClient } from './client';

export interface CreateDocumentRequest {
  fileName: string;
  contentType: string;
}

export interface CreateDocumentResponse {
  uploadUrl: string;
  document: Document;
}

export async function createDocument(
  caseId: string,
  data: CreateDocumentRequest,
): Promise<CreateDocumentResponse> {
  const response = await apiClient.post<CreateDocumentResponse>(
    `/cases/${caseId}/documents/initiate-upload`,
    data,
  );
  return response.data;
}

export async function enqueueProcessing(caseId: string, documentId: string): Promise<Document> {
  const response = await apiClient.post<Document>(
    `/cases/${caseId}/documents/${documentId}/process`,
  );
  return response.data;
}

export async function getDocument(caseId: string, documentId: string): Promise<Document> {
  const response = await apiClient.get<Document>(`/cases/${caseId}/documents/${documentId}`);
  return response.data;
}

export async function getDocuments(caseId: string): Promise<Document[]> {
  const response = await apiClient.get<Document[]>(`/cases/${caseId}/documents`);
  return response.data;
}

export async function uploadToS3(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status})`);
  }
}
