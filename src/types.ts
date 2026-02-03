/**
 * API-facing request/response types (snake_case to match backend).
 * @see TS_NODE_SDK_PLAN.md Section 3
 */

// --- Workflow (run-workflow) ---

export interface RunWorkflowRequest {
  agent_id: string;
  user_input: string;
  assets?: string[];
  conversation_id?: string;
  contact_id?: string;
  stream?: boolean;
}

export interface ChatResponse {
  agent_id: string;
  user_id: string;
  conversation_id: string;
  response: string;
  owner: string;
  error: boolean;
}

// --- Upload Init ---

export interface InitiateUploadRequest {
  agent_id: string;
  file_name: string;
}

export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
  expires_at: string;
  max_file_bytes: number;
}

export interface InitiateUploadResponse {
  success: boolean;
  file_id: string;
  content_type: string;
  upload: PresignedUpload;
}

// --- Upload Complete ---

export interface CompleteUploadRequest {
  agent_id: string;
  file_id: string;
  file_name?: string;
}

export interface CompleteUploadResponse {
  success: boolean;
  file_id: string;
  file_size_bytes: number;
  content_type: string;
  file_name: string;
  created_at: string;
  url: string;
}

// --- Streaming (SSE) ---

export interface StreamEvent {
  event_type: string;
  data: string;
  id?: string;
}

// --- Public options (camelCase for Node API) ---

export interface RunWorkflowOptions {
  conversationId?: string;
  contactId?: string;
  filePaths?: string[];
  assets?: string[];
  stream?: boolean;
}

/** Upload result shape returned by client.files.upload(); includes fileId for use in assets. */
export interface UploadResult {
  fileId: string;
  file_size_bytes: number;
  content_type: string;
  file_name: string;
  created_at: string;
  url: string;
}
