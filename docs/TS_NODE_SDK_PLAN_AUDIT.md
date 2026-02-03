# Audit: Implementation Plan vs TS_NODE_SDK_PLAN.md

This document audits the **Sketricgen Node Library — Implementation Plan** against **TS_NODE_SDK_PLAN.md**. Items are labeled **Missing**, **Inaccurate**, **Clarification**, or **OK**.

---

## 1. Gaps and inaccuracies

### 1.1 **Missing: Upload endpoint URLs are not derived from baseUrl**

**Spec (Section 1.1, Appendix A):** Workflow URL is `{baseUrl}/api/v1/run-workflow`. Upload init and upload complete use **absolute URLs** that are **not** relative to baseUrl:

- Upload init: `https://v9xof9ohlg.execute-api.us-east-1.amazonaws.com/dev/publicAssetsUploadInit`
- Upload complete: `https://v9xof9ohlg.execute-api.us-east-1.amazonaws.com/dev/publicAssetsUploadComplete`

**Implementation plan:** Phase 2 says “Resolves URL (base URL + path for workflow; absolute URLs for upload init/complete per Appendix A)” in `request.ts`, but the **client shell** (Phase 2) and **repository structure** do not specify where these upload URLs come from. The client constructor only mentions `baseUrl?`; it does not mention `uploadInitUrl` or `uploadCompleteUrl`.

**Recommendation:** Either:

- Add to client options: `uploadInitUrl?` and `uploadCompleteUrl?` with defaults from Appendix A (and document in Phase 2), or  
- State explicitly in Phase 2/3: “Upload init and complete URLs are **constants** (or config) from Appendix A, not derived from baseUrl.”

This avoids implementers incorrectly building upload URLs from `baseUrl`.

---

### 1.2 **Missing: Passing pre-obtained `assets` (file IDs) in runWorkflow**

**Spec (Section 2, Section 3.1):** The MVP allows “upload + runWorkflow with assets”. `RunWorkflowRequest` has `assets?: string[]`. So users who already have file IDs (e.g. from a prior `files.upload()`) should be able to pass them without re-uploading.

**Implementation plan:** Phase 4 lists options as `conversationId`, `contactId`, `filePaths`, `stream`. It does not mention `assets?: string[]`.

**Recommendation:** Add to Phase 4: “Options may include `assets?: string[]` (pre-obtained file IDs). If both `filePaths` and `assets` are provided, merge: upload filePaths, then concatenate with `assets` for the request.” This matches the spec’s “upload + runWorkflow with assets” and keeps the API flexible.

---

### 1.3 **Missing: No timeout when streaming**

**Spec (Section 6.1):** Same endpoint and body for streaming; only the response is streamed. **Python client** uses `timeout=None` for the streaming request so the connection is not aborted mid-stream.

**Implementation plan:** Phase 2 says to wrap fetch errors and use AbortSignal + timeout. Phase 4 does not say that when `stream === true`, the workflow request should **not** apply the normal request timeout (or should use a much larger one).

**Recommendation:** In Phase 4 (workflow), add: “When `stream === true`, do not apply the normal request timeout (or use a separate, long-lived timeout) so the SSE connection is not aborted while reading the stream.”

---

### 1.4 **Missing: Empty file and filename extension validation (upload)**

**Spec / Python:**

- **Empty file:** Python `upload.py` rejects 0-byte files with `SketricGenValidationError('Cannot upload empty file')`.
- **Filename:** Initiate upload requires `file_name` with an extension (e.g. “doc.pdf”); Python validates “.” in filename and uses basename.

**Implementation plan:** Phase 3 mentions validating max size (20 MB) and allowed content types, but does not mention:
- Rejecting 0-byte files with `SketricGenValidationError`.
- Validating that `file_name` / `filename` includes an extension for the init step.

**Recommendation:** In Phase 3, add:
- “Reject empty files (0 bytes) with `SketricGenValidationError`.”
- “Validate that `file_name` / `filename` includes an extension (e.g. contains ‘.’) before calling upload init; sanitize to basename if needed.”

---

### 1.5 **Clarification: S3 multipart file field name**

**Spec (Section 5.2):** “Python uses field name `"file`” for the file in the S3 multipart POST.

**Implementation plan:** Phase 3 says “all upload.fields first, then file field last” but does not name the file field.

**Recommendation:** In Phase 3, add explicitly: “Use the form field name `'file'` for the file part (per spec Section 5.2).”

---

### 1.6 **Clarification: Error message extraction (message vs detail)**

**Spec (Section 4.2):** “Parse body (JSON or text), extract `message` or `detail`” when building API errors.

**Implementation plan:** Phase 2 says “parse body, then throw … (statusCode, message, responseBody, requestId)” but does not specify how to derive `message` from the body.

**Recommendation:** In Phase 2, add one line: “Error message: use `body.message` if present, else `body.detail`, else fallback text (e.g. response.text or ‘Unknown error’).”

---

### 1.7 **Optional: Explicit list of public type exports**

**Spec (Section 3, Python __all__):** Public response types include at least `ChatResponse`, `StreamEvent`. Option types and request/response DTOs may be exported for advanced use.

**Implementation plan:** Phase 1 says “re-export … all public types” without listing them.

**Recommendation:** Optionally list in Phase 1 the types to export from `index.ts`, e.g.: `SketricGenClient`; options types like `RunWorkflowOptions`; response types `ChatResponse`, `StreamEvent`, `CompleteUploadResponse` (or JS shape with `fileId`); and all error classes. This avoids under- or over-exporting.

---

## 2. What matches the spec (no change needed)

- **Repository structure:** `src/` with `index`, `client`, `types`, `errors`, `request`, `upload`, `workflow`, `streaming` aligns with the spec’s responsibilities (types, errors, HTTP, upload, workflow, SSE).
- **Phase 1 (types + errors):** Snake_case for API DTOs, full error hierarchy with fields (e.g. `statusCode`, `responseBody`, `requestId` for API errors) matches Section 3 and 4.
- **Phase 2 (request + client):** API-KEY vs X-API-KEY per endpoint, JSON encode/decode, wrapping fetch errors, fromEnv with correct env var names — all correct. Constructor options (apiKey, baseUrl, timeout, uploadTimeout, maxRetries) match.
- **Phase 3 (upload):** 3-step flow, path/Buffer/Readable, 20 MB and allowed content types, presigned fields first then file, streaming preference — correct. Returning object with `fileId` is correct.
- **Phase 4 (workflow + streaming):** runWorkflow(agentId, userInput, options), validation (user_input length, agent_id non-empty), filePaths → upload → assets, non-stream vs stream return types, SSE parser yielding StreamEvent — correct. askWithFiles as optional is correct.
- **Phase 5 (package, build, docs):** package name, engines, files, README examples (message, file, streaming), .gitignore — correct.
- **Data flow diagram:** Accurately shows init → S3 → complete → run-workflow with assets.
- **Acceptance criteria and Do’s/Don’ts:** Aligned with Section 9 and 10 of the spec.

---

## 3. Spec typo (in TS_NODE_SDK_PLAN.md)

- **Section 1.3:** “SKETRICGEN_UPLOAD_TIMEOINT” should be “SKETRICGEN_UPLOAD_TIMEOUT”. Appendix B and the implementation plan already use the correct spelling.

---

## 4. Summary table

| Item | Severity | Location in implementation plan | Action |
|------|----------|----------------------------------|--------|
| Upload init/complete URLs not tied to baseUrl | Missing | Phase 2, client options / config | Add upload URL source (options or constants) |
| runWorkflow options.assets | Missing | Phase 4, options | Add `assets?: string[]` and merge with filePaths |
| No timeout when stream: true | Missing | Phase 4, workflow | Do not apply normal timeout for streaming request |
| Empty file + filename extension validation | Missing | Phase 3, upload | Reject 0-byte; require extension in filename |
| S3 file field name "file" | Clarification | Phase 3, upload | State field name explicitly |
| Error message: message vs detail | Clarification | Phase 2, request | Document extraction order |
| Public type exports list | Optional | Phase 1, index | Optionally list exported types |
| Spec typo TIMEOINT | N/A | TS_NODE_SDK_PLAN.md §1.3 | Fix to TIMEOUT |

---

## 5. Suggested edits to the implementation plan

If you adopt these, you can add:

**Phase 2 (client shell):**
- “Client stores default upload init and upload complete URLs from Appendix A (or accepts optional `uploadInitUrl` / `uploadCompleteUrl` overrides). These are not derived from baseUrl.”

**Phase 2 (request.ts):**
- “When building API error message from response body: use `body.message` if present, else `body.detail`, else fallback to response text or ‘Unknown error’.”

**Phase 3 (upload):**
- “Validate: file size > 0 (throw SketricGenValidationError for empty file); filename has an extension (e.g. contains ‘.’). Use form field name `'file'` for the file in the S3 multipart body.”

**Phase 4 (workflow):**
- “Options may include `assets?: string[]`. If both `filePaths` and `assets` are provided, upload filePaths, then send request with `assets = [...uploadedFileIds, ...(options.assets ?? [])]`.”
- “When `stream === true`, do not apply the normal request timeout (or use a long timeout) so the SSE stream is not aborted.”

After these additions, the implementation plan is fully aligned with TS_NODE_SDK_PLAN.md and the Python SDK behavior.
