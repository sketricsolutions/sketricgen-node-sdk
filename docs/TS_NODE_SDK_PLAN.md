# TypeScript/Node.js SDK Plan: `sketricgen`

**Goal:** Build and publish a TypeScript-first Node package named `sketricgen` that mirrors the Python SDK’s developer experience and wraps the same underlying APIs.

**Package name:** `sketricgen` (no scope)  
**Runtime target:** Node.js **>= 18** (built-in `fetch`, `Blob`, `FormData`)  
**Main export:** `SketricGenClient`

---

## Table of Contents

1. [Python SDK Summary & Endpoint Inventory](#1-python-sdk-summary--endpoint-inventory)
2. [Python → Node Method Mapping Table](#2-python--node-method-mapping-table)
3. [Request/Response Types (API Contract)](#3-requestresponse-types-api-contract)
4. [Error Model](#4-error-model)
5. [File Upload Flow (3-Step S3 Presigned)](#5-file-upload-flow-3-step-s3-presigned)
6. [Streaming (SSE / AG-UI Protocol)](#6-streaming-sse--ag-ui-protocol)
7. [Implementation Steps (Detailed)](#7-implementation-steps-detailed)
8. [Package, Build & Publish](#8-package-build--publish)
9. [Acceptance Checklist](#9-acceptance-checklist)
10. [Do's and Don'ts](#10-dos-and-donts)

---

## 1. Python SDK Summary & Endpoint Inventory

### 1.1 Base URLs & Endpoints

| Purpose            | Python config / URL | Method | Auth header   | Body / notes |
|--------------------|---------------------|--------|---------------|--------------|
| **Run workflow**   | `base_url` + `/api/v1/run-workflow` | POST   | `API-KEY`     | JSON         |
| **Upload init**    | `upload_init_endpoint` (full URL)    | POST   | `X-API-KEY`   | JSON         |
| **Upload complete**| `upload_complete_endpoint` (full URL)| POST   | `X-API-KEY`   | JSON         |
| **S3 upload**      | From init response `upload.url`      | POST   | (in form)     | Multipart    |

**Default URLs (from Python `config.py`):**

- **Base URL:** `https://chat-v2.sketricgen.ai`
- **Workflow path:** `/api/v1/run-workflow` → full URL: `https://chat-v2.sketricgen.ai/api/v1/run-workflow`
- **Upload init:** `https://v9xof9ohlg.execute-api.us-east-1.amazonaws.com/dev/publicAssetsUploadInit`
- **Upload complete:** `https://v9xof9ohlg.execute-api.us-east-1.amazonaws.com/dev/publicAssetsUploadComplete`

Workflow uses `base_url`; upload init/complete use **absolute URLs** (not relative to base).

### 1.2 Auth

- **Workflow:** `API-KEY: <api_key>`
- **Upload init / complete:** `X-API-KEY: <api_key>`
- **Content-Type:** `application/json` for all JSON endpoints; S3 uses multipart (no `Content-Type` header set manually; browser/Node sets it with boundary).

### 1.3 Python Public API Surface (What to Mirror)

- **Client:** `SketricGenClient(api_key, timeout?, upload_timeout?, max_retries?)`
- **Factory:** `SketricGenClient.from_env(**kwargs)` — env: `SKETRICGEN_API_KEY`, `SKETRICGEN_TIMEOUT`, `SKETRICGEN_UPLOAD_TIMEOINT`, `SKETRICGEN_MAX_RETRIES`
- **Workflow (async):** `run_workflow(agent_id, user_input, conversation_id?, contact_id?, file_paths?, stream?)`  
  - Returns: `Promise<ChatResponse>` or `AsyncIterable<StreamEvent>` when `stream === true`
- **Workflow (sync):** `run_workflow_sync(...)` — same params, returns `ChatResponse` or `Iterator<StreamEvent>`

File upload is **internal**: when `file_paths` is provided, the client uploads each file (init → S3 → complete), collects `file_id`s, and sends them as `assets` in the workflow request. There is no public “upload only” method in Python; the golden path is “run workflow with file_paths”.

---

## 2. Python → Node Method Mapping Table

| Python (current) | Node (recommended) | Notes |
|------------------|--------------------|--------|
| `SketricGenClient(api_key, timeout?, ...)` | `new SketricGenClient({ apiKey, baseUrl?, timeout?, uploadTimeout?, maxRetries? })` | Options object for clarity; `baseUrl` optional override. |
| `SketricGenClient.from_env()` | `SketricGenClient.fromEnv()` or same | Env: `SKETRICGEN_API_KEY`, etc. |
| `client.run_workflow(agent_id, user_input, conversation_id?, contact_id?, file_paths?, stream?)` | `client.runWorkflow(agentId, userInput, { conversationId?, contactId?, filePaths?, stream? })` **or** `client.agents.sendMessage(agentId, { content, fileIds?, conversationId?, contactId?, stream? })` | Two options: (A) mirror Python naming/signature; (B) one-pager style with `agents.sendMessage` + separate `fileIds`. Recommendation: support **both** — primary `runWorkflow` (mirror Python) and optional `client.agents` / `client.files` namespaces for clarity. |
| `client.run_workflow_sync(...)` | `client.runWorkflowSync(...)` | Same semantics; Node can be Promise-only in v1 and add sync later if needed. |
| (internal) `_upload_asset(agent_id, file_path, ...)` | `client.files.upload({ agentId, file, filename?, contentType? })` → returns `{ fileId, ... }` | Optional explicit upload API; `file` = path string, `Buffer`, or `Readable` stream. |
| (convenience) run_workflow with file_paths | `client.runWorkflow(agentId, userInput, { filePaths: [...] })` **or** `client.agents.askWithFiles(agentId, { question, files })` | `askWithFiles`: upload `files` then send message with resulting `fileIds`. |

**Recommended MVP export surface (Node):**

- `new SketricGenClient({ apiKey, baseUrl? })`
- `client.runWorkflow(agentId, userInput, options?)` — options: `conversationId`, `contactId`, `filePaths`, `stream`
- `client.files.upload({ agentId, file, filename?, contentType? })` — returns `CompleteUploadResponse`-like object with `fileId`
- Convenience: `client.agents.askWithFiles(agentId, { question, files })` (upload + send message with file IDs)

Optional for v1: `runWorkflowSync`, retries/backoff, timeouts (can match Python: timeout, uploadTimeout).

---

## 3. Request/Response Types (API Contract)

Implement these TypeScript interfaces so request/response shapes match the Python SDK and backend.

### 3.1 Workflow (run-workflow)

**Request (JSON):**

```ts
interface RunWorkflowRequest {
  agent_id: string;
  user_input: string;
  assets?: string[];           // file IDs from upload
  conversation_id?: string;
  contact_id?: string;
  stream?: boolean;
}
```

**Validation (mirror Python):**

- `user_input`: non-empty, max 10_000 characters.
- `agent_id`: non-empty (trimmed).

**Response (non-streaming, JSON):**

```ts
interface ChatResponse {
  agent_id: string;
  user_id: string;
  conversation_id: string;
  response: string;
  owner: string;
  error: boolean;
}
```

### 3.2 Upload Init

**Request (JSON):**

```ts
interface InitiateUploadRequest {
  agent_id: string;
  file_name: string;  // must include extension, e.g. "doc.pdf"
}
```

**Response (JSON):**

```ts
interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
  expires_at: string;
  max_file_bytes: number;
}

interface InitiateUploadResponse {
  success: boolean;
  file_id: string;
  content_type: string;
  upload: PresignedUpload;
}
```

### 3.3 Upload Complete

**Request (JSON):**

```ts
interface CompleteUploadRequest {
  agent_id: string;
  file_id: string;
  file_name?: string;
}
```

**Response (JSON):**

```ts
interface CompleteUploadResponse {
  success: boolean;
  file_id: string;
  file_size_bytes: number;
  content_type: string;
  file_name: string;
  created_at: string;
  url: string;
}
```

### 3.4 Streaming (SSE)

**Stream event (parsed from SSE):**

```ts
interface StreamEvent {
  event_type: string;  // e.g. "message"
  data: string;        // JSON string; parse for AG-UI payload
  id?: string;
}
```

**AG-UI payload (after `JSON.parse(event.data)`):** document in README; key types include `TEXT_MESSAGE_CONTENT` (use `delta`), `RUN_FINISHED`, `RUN_ERROR`, etc. (see Python README / examples.)

---

## 4. Error Model

Mirror Python’s hierarchy and fields so `try/catch` is reliable and errors are typed.

### 4.1 Base and Typed Errors

- **SketricGenError** (base): `message: string`.
- **SketricGenAPIError** (extends base): `message`, `statusCode: number`, `responseBody?: unknown`, optional `requestId?: string` if API returns it.
- **SketricGenAuthenticationError** (extends API error): 401, same fields.
- **SketricGenValidationError**: client-side validation (empty input, bad file name, etc.).
- **SketricGenNetworkError**: fetch/network failure.
- **SketricGenTimeoutError**: request timeout.
- **SketricGenUploadError**: S3 or upload step failed.
- **SketricGenFileSizeError**: `message`, `fileSize: number`, `maxSize: number`.
- **SketricGenContentTypeError**: `message`, `contentType: string`, `allowedTypes: string[]`.

### 4.2 HTTP Error Handling

- On `response.status >= 400`: parse body (JSON or text), extract `message` or `detail`, then throw:
  - 401 → `SketricGenAuthenticationError`
  - else → `SketricGenAPIError` with `statusCode`, `message`, `responseBody`; if API returns `requestId`, set it.
- Never throw raw `fetch` errors; wrap in `SketricGenNetworkError` or `SketricGenTimeoutError` as appropriate.

---

## 5. File Upload Flow (3-Step S3 Presigned)

Upload is **three steps**; the Node SDK must implement all three.

### 5.1 Step 1: Initiate

- **URL:** Upload init endpoint (absolute).
- **Headers:** `X-API-KEY`, `Content-Type: application/json`.
- **Body:** `{ agent_id, file_name }`.
- **Response:** `file_id`, `content_type`, `upload.url`, `upload.fields`.

### 5.2 Step 2: Upload to S3

- **URL:** `upload.url` from step 1.
- **Method:** POST, body = multipart/form-data.
- **Form construction (critical):** All presigned `upload.fields` entries first (order can matter for some S3 policies), then the file field last. Python uses field name `"file"` and the content type from presigned fields when present (`upload.fields['Content-Type']`).
- **File input types to support:** `string` (path), `Buffer`, `Readable` stream. Normalize to a stream or blob for `FormData`; avoid reading entire large files into memory when using streams.

### 5.3 Step 3: Complete

- **URL:** Upload complete endpoint (absolute).
- **Headers:** `X-API-KEY`, `Content-Type: application/json`.
- **Body:** `{ agent_id, file_id, file_name? }`.
- **Response:** `CompleteUploadResponse` (includes `file_id` for use in `assets`).

### 5.4 Limits (from Python)

- **Max file size:** 20 MB (`MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024`).
- **Allowed content types:** `image/jpeg`, `image/webp`, `image/png`, `application/pdf`, `image/gif`.
- Reject before upload if size or content type is invalid; use `SketricGenFileSizeError` and `SketricGenContentTypeError`.

### 5.5 File Input Handling (Node)

- **Path (string):** `fs.createReadStream(path)` (or equivalent) for streaming; get size via `fs.stat`; filename from path.
- **Buffer:** use as blob/stream; require `filename` (and optionally `contentType`) in options.
- **Readable stream:** use as-is; require `filename` (and optionally `contentType`); size may be unknown — validate when possible (e.g. from path or metadata).

---

## 6. Streaming (SSE / AG-UI Protocol)

### 6.1 Request

- Same run-workflow endpoint, POST, with `stream: true` in JSON body.
- Headers unchanged (`API-KEY`, etc.).

### 6.2 Response

- `Content-Type: text/event-stream` (or similar).
- Parse SSE: lines `event:`, `data:`, `id:`; empty line = end of event. Yield `StreamEvent { event_type, data, id }`.

### 6.3 AG-UI Event Types (for docs and examples)

| Event Type             | Description              | Key fields (in `data`)     |
|------------------------|--------------------------|----------------------------|
| `RUN_STARTED`          | Workflow started         | `thread_id`, `run_id`      |
| `TEXT_MESSAGE_START`   | Message started          | `message_id`, `role`       |
| `TEXT_MESSAGE_CONTENT` | Text chunk               | `message_id`, `delta`      |
| `TEXT_MESSAGE_END`     | Message ended            | `message_id`               |
| `TOOL_CALL_START`      | Tool call started        | `tool_call_id`, `tool_call_name` |
| `TOOL_CALL_END`        | Tool call ended          | `tool_call_id`             |
| `RUN_FINISHED`         | Run completed            | `thread_id`, `run_id`, `result` |
| `RUN_ERROR`            | Run error                | `message`                  |
| `CUSTOM`               | Custom                   | varies                     |

Each `StreamEvent.data` is a JSON string; parse and switch on `type` (or equivalent) for the above.

### 6.4 Node Streaming API

- Return an **async iterable** of `StreamEvent` (e.g. `AsyncGenerator<StreamEvent>`).
- Use `fetch` with streaming body: `response.body` (ReadableStream); parse line-by-line and assemble SSE events, then yield `StreamEvent` objects.

---

## 7. Implementation Steps (Detailed)

### Step 1 — Mirror the Python SDK surface

- [ ] Define all TypeScript interfaces for requests/responses (Section 3).
- [ ] Finalize the Python → Node mapping table (Section 2) and stick to it.
- [ ] Document the public API: `SketricGenClient` constructor, `runWorkflow`, `files.upload`, optional `agents.askWithFiles`, and `fromEnv`.

**Output:** List of Node methods, request/response types, and the mapping table in the repo (e.g. in this doc or CONTRIBUTING).

---

### Step 2 — Core HTTP client wrapper

- [ ] Single internal `request(options)` (or `get`/`post` helpers) that:
  - Resolve URL (base URL + path for workflow; absolute for upload init/complete).
  - Set `API-KEY` or `X-API-KEY` per endpoint.
  - Set `Content-Type: application/json` for JSON.
  - Encode request body as JSON where applicable.
  - Decode JSON response; on status >= 400, parse error body and throw typed errors (Section 4).
- [ ] Do **not** throw raw `fetch` errors; always wrap (e.g. timeout → `SketricGenTimeoutError`, network → `SketricGenNetworkError`).
- [ ] Optional: add `timeout` and `uploadTimeout` (Node 18+ `AbortSignal` + `setTimeout`).

**Output:** Internal `request()` used by workflow and upload init/complete.

---

### Step 3 — Files resource (upload)

- [ ] Implement 3-step flow: initiate → S3 POST → complete.
- [ ] Accept `file` as: `string` (path), `Buffer`, or Node `Readable` stream.
- [ ] Normalize to stream/blob for FormData; use presigned `upload.fields` and add file last; use `Content-Type` from presigned fields when present.
- [ ] Validate size (≤ 20 MB) and content type (allowlist) before upload; throw `SketricGenFileSizeError` / `SketricGenContentTypeError` / `SketricGenValidationError` as in Python.
- [ ] Public API: `client.files.upload({ agentId, file, filename?, contentType? })` returning a `CompleteUploadResponse`-like object (with `fileId`).
- [ ] Prefer streaming for large files to avoid memory spikes.

**Output:** `client.files.upload()` working for path, Buffer, and stream.

---

### Step 4 — Agents / workflow (messaging)

- [ ] Implement `client.runWorkflow(agentId, userInput, options?)`:
  - If `options?.filePaths` present: for each path, call internal upload (or `files.upload`), collect `file_id`s into `assets`.
  - Build `RunWorkflowRequest`: `agent_id`, `user_input`, `assets`, `conversation_id`, `contact_id`, `stream`.
  - If `stream === false`: POST, parse JSON, return `ChatResponse`.
  - If `stream === true`: POST with body stream, parse SSE, return async iterable of `StreamEvent`.
- [ ] Optional: `client.agents.askWithFiles(agentId, { question, files })` that uploads `files`, then calls run-workflow with resulting `fileIds` as `assets`.
- [ ] Validate `user_input` (length, non-empty) and `agent_id` (non-empty) before sending.

**Output:** Send message, optional file IDs, non-stream and stream responses matching Python.

---

### Step 5 — “Golden path” examples (README)

- [ ] Example 1: Send a message (no files): create client, `runWorkflow(agentId, userInput)`, log `response.response`.
- [ ] Example 2: Upload a file, then ask a question referencing it: either `runWorkflow(agentId, userInput, { filePaths: [path] })` or `files.upload` + `runWorkflow` with `fileIds`.
- [ ] Example 3 (optional): Streaming — `for await (const event of client.runWorkflow(..., { stream: true }))` and print `TEXT_MESSAGE_CONTENT` deltas.
- [ ] Copy-paste runnable snippets; document env var `SKETRICGEN_API_KEY`.

**Output:** README with 2–3 canonical examples aligned with Python.

---

### Step 6 — Package, build, publish

- [ ] TypeScript project: emit JS + `.d.ts` to `dist/`.
- [ ] Entry points: ESM primary; add CJS build only if needed for your users.
- [ ] `package.json`: name `sketricgen`, `main`/`module`/`types`, `engines.node: ">=18"`, `files: ["dist", "README.md"]`.
- [ ] Scripts: `build`, `lint`, `test`; CI runs lint + tests + build.
- [ ] Publish on tag/release to npm (unscoped) as `sketricgen`.

**Output:** `npm i sketricgen` installs; build produces `dist/` with correct exports.

---

## 8. Package, Build & Publish

- **Build:** TypeScript → `dist/` (JS + `.d.ts`). Prefer ESM; CJS optional.
- **Exports:** Explicit `exports` in `package.json` for ESM and types.
- **CI:** Lint (e.g. ESLint) + unit/integration tests + build on every PR; publish on release tag to npm.
- **Versioning:** Follow semver; align with Python SDK version where it makes sense (e.g. 0.1.0 for first release).

---

## 9. Acceptance Checklist

- [ ] `npm i sketricgen` works in a fresh Node (>= 18) project.
- [ ] Can send a message: `runWorkflow(agentId, userInput)` returns `ChatResponse`.
- [ ] Can upload a file: `files.upload({ agentId, file, filename? })` returns object with `fileId`.
- [ ] Can ask a question with file: either `runWorkflow(..., { filePaths })` or upload + `runWorkflow(..., { fileIds })` (or equivalent).
- [ ] Semantics match Python “golden path” (same endpoints, same request/response shapes, same 3-step upload).
- [ ] Typed responses and typed errors: `SketricGenAPIError` (or equivalent) includes `statusCode` and `requestId` when available.
- [ ] README includes copy-paste examples (message, upload + ask).
- [ ] Minimal dependencies (prefer Node built-ins: `fetch`, `FormData`, `Blob`, streams).
- [ ] Build produces `dist/` and package exports are correct.
- [ ] CI passes (lint, test, build) and publish pipeline is set up for npm.

---

## 10. Do's and Don'ts

**Do:**

- Target Node 18+ to keep dependencies minimal.
- Implement uploads with streams where possible to avoid memory spikes.
- Standardize errors so `try/catch` is reliable and errors are typed.
- Keep the API surface small and predictable (mirror Python).
- Ship types as part of the package (TS types = product feature).
- Include 2–3 canonical examples in README.
- Keep naming aligned: `SketricGenClient`, `runWorkflow`, `files`, `agents` (if used).

**Don’t:**

- Ship without a stable error model (no raw `fetch` errors to the user).
- Read entire large files into memory by default.
- Add heavy dependencies (e.g. axios, extra multipart libs) unless necessary.
- Over-abstract; thin wrapper first.
- Add browser support in v1 unless explicitly required.

---

## Appendix A: Endpoint Quick Reference

| Endpoint        | URL (default) | Method | Auth       | Body           |
|----------------|---------------|--------|------------|----------------|
| Run workflow   | `{baseUrl}/api/v1/run-workflow` | POST | `API-KEY`  | JSON           |
| Upload init    | `https://v9xof9ohlg.execute-api.us-east-1.amazonaws.com/dev/publicAssetsUploadInit` | POST | `X-API-KEY` | JSON           |
| Upload complete| `https://v9xof9ohlg.execute-api.us-east-1.amazonaws.com/dev/publicAssetsUploadComplete` | POST | `X-API-KEY` | JSON           |
| S3 upload     | From init `upload.url`          | POST | (form)     | Multipart      |

---

## Appendix B: Environment Variables

| Variable                  | Purpose        | Optional |
|---------------------------|----------------|----------|
| `SKETRICGEN_API_KEY`      | API key        | No (if not passed in code) |
| `SKETRICGEN_TIMEOUT`      | Request timeout (seconds) | Yes |
| `SKETRICGEN_UPLOAD_TIMEOUT` | Upload timeout (seconds) | Yes |
| `SKETRICGEN_MAX_RETRIES`  | Max retries    | Yes      |

---

*This plan is derived from the Python SDK in this repository and the one-pager for the Node/TypeScript SDK. All endpoints, streaming behavior, upload flow, and error semantics are intended to match the Python SDK.*
