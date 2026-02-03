import type { RunWorkflowOptions, UploadResult } from './types.js';
import type { ChatResponse, StreamEvent } from './types.js';
import { uploadAsset } from './upload.js';
import {
  runWorkflowNonStream,
  runWorkflowStream,
} from './workflow.js';

/** Default base URL for workflow API (Appendix A). */
const DEFAULT_BASE_URL = 'https://chat-v2.sketricgen.ai';

/** Default upload init URL (not derived from baseUrl). */
const DEFAULT_UPLOAD_INIT_URL =
  'https://v9xof9ohlg.execute-api.us-east-1.amazonaws.com/dev/publicAssetsUploadInit';

/** Default upload complete URL (not derived from baseUrl). */
const DEFAULT_UPLOAD_COMPLETE_URL =
  'https://v9xof9ohlg.execute-api.us-east-1.amazonaws.com/dev/publicAssetsUploadComplete';

export interface SketricGenClientOptions {
  apiKey: string;
  baseUrl?: string;
  uploadInitUrl?: string;
  uploadCompleteUrl?: string;
  timeout?: number;
  uploadTimeout?: number;
  maxRetries?: number;
}

export class SketricGenClient {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly uploadInitUrl: string;
  readonly uploadCompleteUrl: string;
  readonly timeout?: number;
  readonly uploadTimeout?: number;
  readonly maxRetries?: number;

  constructor(options: SketricGenClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.uploadInitUrl = options.uploadInitUrl ?? DEFAULT_UPLOAD_INIT_URL;
    this.uploadCompleteUrl =
      options.uploadCompleteUrl ?? DEFAULT_UPLOAD_COMPLETE_URL;
    this.timeout = options.timeout;
    this.uploadTimeout = options.uploadTimeout;
    this.maxRetries = options.maxRetries;
  }

  static fromEnv(overrides?: Partial<SketricGenClientOptions>): SketricGenClient {
    const apiKey =
      overrides?.apiKey ?? process.env.SKETRICGEN_API_KEY ?? '';
    const timeout =
      overrides?.timeout ??
      (process.env.SKETRICGEN_TIMEOUT
        ? parseInt(process.env.SKETRICGEN_TIMEOUT, 10)
        : undefined);
    const uploadTimeout =
      overrides?.uploadTimeout ??
      (process.env.SKETRICGEN_UPLOAD_TIMEOUT
        ? parseInt(process.env.SKETRICGEN_UPLOAD_TIMEOUT, 10)
        : undefined);
    const maxRetries =
      overrides?.maxRetries ??
      (process.env.SKETRICGEN_MAX_RETRIES
        ? parseInt(process.env.SKETRICGEN_MAX_RETRIES, 10)
        : undefined);
    return new SketricGenClient({
      apiKey,
      timeout,
      uploadTimeout,
      maxRetries,
      ...overrides,
    });
  }

  runWorkflow(
    agentId: string,
    userInput: string,
    options?: RunWorkflowOptions & { stream?: false }
  ): Promise<ChatResponse>;
  runWorkflow(
    agentId: string,
    userInput: string,
    options: RunWorkflowOptions & { stream: true }
  ): AsyncGenerator<StreamEvent>;
  runWorkflow(
    agentId: string,
    userInput: string,
    options?: RunWorkflowOptions
  ): Promise<ChatResponse> | AsyncGenerator<StreamEvent> {
    const timeoutMs =
      this.timeout != null ? this.timeout * 1000 : undefined;
    const uploadAssetForWorkflow = (aid: string, filePath: string) =>
      uploadAsset(
        { agentId: aid, file: filePath },
        {
          apiKey: this.apiKey,
          uploadInitUrl: this.uploadInitUrl,
          uploadCompleteUrl: this.uploadCompleteUrl,
          timeoutMs:
            this.uploadTimeout != null
              ? this.uploadTimeout * 1000
              : undefined,
        }
      );
    const ctx = {
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      timeoutMs,
      uploadAsset: uploadAssetForWorkflow,
    };
    if (options?.stream === true) {
      return runWorkflowStream(agentId, userInput, options, ctx);
    }
    return runWorkflowNonStream(agentId, userInput, options, ctx);
  }

  get files(): {
    upload: (params: {
      agentId: string;
      file: string | Buffer | import('node:stream').Readable;
      filename?: string;
      contentType?: string;
    }) => Promise<UploadResult>;
  } {
    const self = this;
    return {
      async upload(params): Promise<UploadResult> {
        return uploadAsset(params, {
          apiKey: self.apiKey,
          uploadInitUrl: self.uploadInitUrl,
          uploadCompleteUrl: self.uploadCompleteUrl,
          timeoutMs:
            self.uploadTimeout != null
              ? self.uploadTimeout * 1000
              : undefined,
        });
      },
    };
  }
}
