/** Standard paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Standard API error response */
export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
  timestamp: string;
  path: string;
}

/** WebSocket event names emitted by the server */
export enum WsEvent {
  DOCUMENT_PROCESSING_STARTED = 'document.processing.started',
  DOCUMENT_PROCESSING_COMPLETE = 'document.processing.complete',
  DOCUMENT_PROCESSING_FAILED = 'document.processing.failed',
  GENERATION_COMPLETE = 'generation.complete',
  GENERATION_FAILED = 'generation.failed',
}

/** Payload for WebSocket events related to document processing */
export interface WsDocumentEvent {
  event: WsEvent;
  documentId: string;
  caseId: string;
}
