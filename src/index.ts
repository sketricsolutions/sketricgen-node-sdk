/**
 * sketricgen — Node.js SDK for Sketricgen workflows.
 * @packageDocumentation
 */

export { SketricGenClient } from './client.js';
export type { SketricGenClientOptions } from './client.js';

export type {
  RunWorkflowRequest,
  ChatResponse,
  RunWorkflowOptions,
  InitiateUploadRequest,
  InitiateUploadResponse,
  PresignedUpload,
  CompleteUploadRequest,
  CompleteUploadResponse,
  UploadResult,
  StreamEvent,
} from './types.js';

export {
  SketricGenError,
  SketricGenAPIError,
  SketricGenAuthenticationError,
  SketricGenValidationError,
  SketricGenNetworkError,
  SketricGenTimeoutError,
  SketricGenUploadError,
  SketricGenFileSizeError,
  SketricGenContentTypeError,
} from './errors.js';
