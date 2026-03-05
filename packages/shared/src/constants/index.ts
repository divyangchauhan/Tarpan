/** Minimum AI extraction confidence score to skip manual review */
export const EXTRACTION_CONFIDENCE_THRESHOLD = 0.85;

/** Pre-signed S3 URL TTL in seconds (15 minutes) */
export const S3_PRESIGNED_URL_TTL_SECONDS = 900;

/** Maximum file size for death certificate upload (20 MB) */
export const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

/** Accepted MIME types for death certificate upload */
export const ACCEPTED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_UPLOAD_MIME_TYPES)[number];
