/**
 * runWorkflow: validate, collect assets (filePaths + options.assets), POST run-workflow.
 * @see TS_NODE_SDK_PLAN.md Sections 3.1, 6
 */

import { request, requestStream } from './request.js';
import { parseSSE } from './streaming.js';
import type {
  RunWorkflowRequest,
  ChatResponse,
  RunWorkflowOptions,
  StreamEvent,
} from './types.js';
import { SketricGenValidationError } from './errors.js';
import type { UploadResult } from './types.js';

const MAX_USER_INPUT_LENGTH = 10_000;

export interface WorkflowContext {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
  uploadAsset: (
    agentId: string,
    filePath: string
  ) => Promise<UploadResult>;
}

function validateInput(agentId: string, userInput: string): void {
  const trimmedId = agentId?.trim();
  if (!trimmedId) {
    throw new SketricGenValidationError('agent_id must be non-empty');
  }
  if (!userInput || typeof userInput !== 'string') {
    throw new SketricGenValidationError('user_input must be non-empty');
  }
  if (userInput.length > MAX_USER_INPUT_LENGTH) {
    throw new SketricGenValidationError(
      `user_input must be at most ${MAX_USER_INPUT_LENGTH} characters`
    );
  }
}

export async function runWorkflowNonStream(
  agentId: string,
  userInput: string,
  options: RunWorkflowOptions | undefined,
  ctx: WorkflowContext
): Promise<ChatResponse> {
  validateInput(agentId, userInput);
  const assets: string[] = [];
  if (options?.filePaths?.length) {
    for (const path of options.filePaths) {
      const result = await ctx.uploadAsset(agentId, path);
      assets.push(result.fileId);
    }
  }
  if (options?.assets?.length) {
    assets.push(...options.assets);
  }
  const body: RunWorkflowRequest = {
    agent_id: agentId.trim(),
    user_input: userInput,
    stream: false,
    ...(assets.length ? { assets } : {}),
    ...(options?.conversationId ? { conversation_id: options.conversationId } : {}),
    ...(options?.contactId ? { contact_id: options.contactId } : {}),
  };
  const url = `${ctx.baseUrl}/api/v1/run-workflow`;
  return request<ChatResponse>({
    url,
    method: 'POST',
    auth: 'api-key',
    apiKey: ctx.apiKey,
    body,
    timeoutMs: ctx.timeoutMs,
  });
}

export async function* runWorkflowStream(
  agentId: string,
  userInput: string,
  options: RunWorkflowOptions | undefined,
  ctx: WorkflowContext
): AsyncGenerator<StreamEvent> {
  validateInput(agentId, userInput);
  const assets: string[] = [];
  if (options?.filePaths?.length) {
    for (const path of options.filePaths) {
      const result = await ctx.uploadAsset(agentId, path);
      assets.push(result.fileId);
    }
  }
  if (options?.assets?.length) {
    assets.push(...options.assets);
  }
  const body: RunWorkflowRequest = {
    agent_id: agentId.trim(),
    user_input: userInput,
    stream: true,
    ...(assets.length ? { assets } : {}),
    ...(options?.conversationId ? { conversation_id: options.conversationId } : {}),
    ...(options?.contactId ? { contact_id: options.contactId } : {}),
  };
  const url = `${ctx.baseUrl}/api/v1/run-workflow`;
  const { body: streamBody } = await requestStream({
    url,
    method: 'POST',
    auth: 'api-key',
    apiKey: ctx.apiKey,
    body,
    noTimeout: true,
  });
  yield* parseSSE(streamBody);
}
