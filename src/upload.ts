/**
 * 3-step S3 presigned upload: init → S3 POST → complete.
 * @see TS_NODE_SDK_PLAN.md Section 5
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { request } from './request.js';
import type { InitiateUploadResponse, CompleteUploadResponse } from './types.js';
import type { UploadResult } from './types.js';
import {
  SketricGenValidationError,
  SketricGenFileSizeError,
  SketricGenContentTypeError,
  SketricGenUploadError,
} from './errors.js';

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/webp',
  'image/png',
  'application/pdf',
  'image/gif',
] as const;

export interface UploadParams {
  agentId: string;
  file: string | Buffer | Readable;
  filename?: string;
  contentType?: string;
}

export interface UploadContext {
  apiKey: string;
  uploadInitUrl: string;
  uploadCompleteUrl: string;
  timeoutMs?: number;
}

function getBasename(name: string): string {
  const base = path.basename(name);
  if (!base.includes('.')) {
    throw new SketricGenValidationError(
      'Filename must include an extension (e.g. "doc.pdf")'
    );
  }
  return base;
}

function validateContentType(contentType: string): void {
  const normalized = contentType.toLowerCase().split(';')[0].trim();
  if (!ALLOWED_CONTENT_TYPES.includes(normalized as (typeof ALLOWED_CONTENT_TYPES)[number])) {
    throw new SketricGenContentTypeError(
      `Content type "${contentType}" is not allowed`,
      contentType,
      [...ALLOWED_CONTENT_TYPES]
    );
  }
}

function validateSize(size: number): void {
  if (size <= 0) {
    throw new SketricGenValidationError('Cannot upload empty file');
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new SketricGenFileSizeError(
      `File size ${size} exceeds maximum ${MAX_FILE_SIZE_BYTES} bytes`,
      size,
      MAX_FILE_SIZE_BYTES
    );
  }
}

async function resolveFileInput(
  file: string | Buffer | Readable,
  filename?: string,
  contentType?: string
): Promise<{ blob: Blob; fileName: string; contentType: string; size: number }> {
  if (typeof file === 'string') {
    const filePath = file;
    const stat = await fs.promises.stat(filePath);
    validateSize(stat.size);
    const baseName = path.basename(filePath);
    if (!baseName.includes('.')) {
      throw new SketricGenValidationError(
        'Filename must include an extension (e.g. "doc.pdf")'
      );
    }
    const buf = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const inferredType =
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.png'
            ? 'image/png'
            : ext === '.webp'
              ? 'image/webp'
              : ext === '.gif'
                ? 'image/gif'
                : undefined;
    const type = contentType ?? inferredType;
    if (type) validateContentType(type);
    return {
      blob: new Blob([buf], { type: type ?? 'application/octet-stream' }),
      fileName: baseName,
      contentType: type ?? 'application/octet-stream',
      size: stat.size,
    };
  }

  if (Buffer.isBuffer(file)) {
    if (!filename || !filename.includes('.')) {
      throw new SketricGenValidationError(
        'filename (with extension) is required when file is a Buffer'
      );
    }
    validateSize(file.length);
    const type = contentType ?? 'application/octet-stream';
    if (contentType) validateContentType(contentType);
    return {
      blob: new Blob([file], { type }),
      fileName: path.basename(filename),
      contentType: type,
      size: file.length,
    };
  }

  // Readable stream
  if (!filename || !filename.includes('.')) {
    throw new SketricGenValidationError(
      'filename (with extension) is required when file is a Readable stream'
    );
  }
  const chunks: Buffer[] = [];
  for await (const chunk of file as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const total = chunks.reduce((s, c) => s + c.length, 0);
    if (total > MAX_FILE_SIZE_BYTES) {
      throw new SketricGenFileSizeError(
        `File size exceeds maximum ${MAX_FILE_SIZE_BYTES} bytes`,
        total,
        MAX_FILE_SIZE_BYTES
      );
    }
  }
  const buf = Buffer.concat(chunks);
  validateSize(buf.length);
  const type = contentType ?? 'application/octet-stream';
  if (contentType) validateContentType(type);
  return {
    blob: new Blob([buf], { type }),
    fileName: path.basename(filename),
    contentType: type,
    size: buf.length,
  };
}

export async function uploadAsset(
  params: UploadParams,
  ctx: UploadContext
): Promise<UploadResult> {
  const { agentId, file, filename, contentType } = params;
  const resolved = await resolveFileInput(file, filename, contentType);
  const file_name = getBasename(resolved.fileName);

  const initResponse = await request<InitiateUploadResponse>({
    url: ctx.uploadInitUrl,
    method: 'POST',
    auth: 'x-api-key',
    apiKey: ctx.apiKey,
    body: { agent_id: agentId, file_name },
    timeoutMs: ctx.timeoutMs,
  });

  if (!initResponse.success || !initResponse.upload) {
    throw new SketricGenUploadError(
      'Upload init failed',
      initResponse
    );
  }

  const { url: s3Url, fields } = initResponse.upload;
  const formData = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    formData.append(k, v);
  }
  const fileBlob =
    fields['Content-Type'] != null
      ? new Blob([await resolved.blob.arrayBuffer()], {
          type: fields['Content-Type'],
        })
      : resolved.blob;
  formData.append('file', fileBlob, resolved.fileName);

  const uploadRes = await fetch(s3Url, {
    method: 'POST',
    body: formData,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new SketricGenUploadError(
      `S3 upload failed: ${uploadRes.status} ${text}`,
      text
    );
  }

  const completeResponse = await request<CompleteUploadResponse>({
    url: ctx.uploadCompleteUrl,
    method: 'POST',
    auth: 'x-api-key',
    apiKey: ctx.apiKey,
    body: {
      agent_id: agentId,
      file_id: initResponse.file_id,
      file_name,
    },
    timeoutMs: ctx.timeoutMs,
  });

  if (!completeResponse.success) {
    throw new SketricGenUploadError('Upload complete failed', completeResponse);
  }

  return {
    fileId: completeResponse.file_id,
    file_size_bytes: completeResponse.file_size_bytes,
    content_type: completeResponse.content_type,
    file_name: completeResponse.file_name,
    created_at: completeResponse.created_at,
    url: completeResponse.url,
  };
}
