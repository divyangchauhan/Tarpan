import type { Document } from '@afterlight/shared';
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
    `/cases/${caseId}/documents`,
    data,
  );
  return response.data;
}

export async function confirmUpload(documentId: string): Promise<Document> {
  const response = await apiClient.patch<Document>(`/documents/${documentId}/confirm-upload`);
  return response.data;
}

export async function getDocument(documentId: string): Promise<Document> {
  const response = await apiClient.get<Document>(`/documents/${documentId}`);
  return response.data;
}

export async function uploadToS3(uploadUrl: string, file: File): Promise<void> {
  await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
}
