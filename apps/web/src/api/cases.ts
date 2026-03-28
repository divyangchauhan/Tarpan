import type { Case, DeceasedInfo, ExecutorInfo } from '@afterlight/shared';
import { apiClient } from './client';

export interface CreateCaseRequest {
  deceasedInfo: DeceasedInfo;
  executorInfo?: ExecutorInfo;
}

export interface UpdateCaseRequest {
  deceasedInfo?: Partial<DeceasedInfo>;
  executorInfo?: Partial<ExecutorInfo>;
}

export async function createCase(data: CreateCaseRequest): Promise<Case> {
  const response = await apiClient.post<Case>('/cases', data);
  return response.data;
}

export async function getCases(): Promise<Case[]> {
  const response = await apiClient.get<Case[]>('/cases');
  return response.data;
}

export async function getCase(id: string): Promise<Case> {
  const response = await apiClient.get<Case>(`/cases/${id}`);
  return response.data;
}

export async function updateCase(id: string, data: UpdateCaseRequest): Promise<Case> {
  const response = await apiClient.patch<Case>(`/cases/${id}`, data);
  return response.data;
}
