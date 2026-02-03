# sketricgen

Node.js SDK for [Sketricgen](https://sketricgen.ai) workflows. Run workflows, upload files, and stream responses with a simple API.

**Requirements:** Node.js >= 18 (uses built-in `fetch`, `FormData`, and streams).

## Install

```bash
npm i sketricgen
```

## Configuration

Set your API key via the constructor or environment:

| Variable | Purpose |
|----------|---------|
| `SKETRICGEN_API_KEY` | API key (required if not passed in code) |
| `SKETRICGEN_TIMEOUT` | Request timeout in seconds (optional) |
| `SKETRICGEN_UPLOAD_TIMEOUT` | Upload timeout in seconds (optional) |
| `SKETRICGEN_MAX_RETRIES` | Max retries (optional) |

## Quick start

### 1. Send a message (no files)

```ts
import { SketricGenClient } from 'sketricgen';

const client = SketricGenClient.fromEnv();
// Or: const client = new SketricGenClient({ apiKey: 'your-api-key' });

const response = await client.runWorkflow('your-agent-id', 'Hello, what can you do?');
console.log(response.response);
```

### 2. Run a workflow with a file

You can pass local file paths; the client uploads them and attaches them to the workflow.

```ts
import { SketricGenClient } from 'sketricgen';

const client = SketricGenClient.fromEnv();

const response = await client.runWorkflow('your-agent-id', 'Summarize this document.', {
  filePaths: ['./path/to/document.pdf'],
});
console.log(response.response);
```

Alternatively, upload first and pass the returned file IDs as `assets`:

```ts
const uploadResult = await client.files.upload({
  agentId: 'your-agent-id',
  file: './path/to/document.pdf',
});
const response = await client.runWorkflow('your-agent-id', 'Summarize this document.', {
  assets: [uploadResult.fileId],
});
```

### 3. Stream the response

For streaming (SSE), pass `stream: true`. Each event has `event_type` and `data` (JSON string). Use `TEXT_MESSAGE_CONTENT` events and parse `data` for the `delta` field.

```ts
const stream = client.runWorkflow('your-agent-id', 'Explain step by step.', {
  stream: true,
});

for await (const event of stream) {
  if (event.event_type === 'TEXT_MESSAGE_CONTENT') {
    const payload = JSON.parse(event.data);
    if (payload.delta) process.stdout.write(payload.delta);
  }
}
```

### Streaming events

When `stream: true`, the client returns an async iterable of **`StreamEvent`**. Each event has:

| Field | Type | Description |
|-------|------|-------------|
| `event_type` | string | Type of the SSE event (e.g. `TEXT_MESSAGE_CONTENT`, `RUN_FINISHED`). |
| `data` | string | JSON string. Parse with `JSON.parse(event.data)` to get the payload; the parsed object may have a `type` field matching `event_type`. |
| `id` | string (optional) | Optional event ID. |

You must parse `event.data` and handle the events you care about. The following event types can be emitted (aligned with the [SketricGen streaming protocol](https://docs.sketricgen.ai/dev-guide/python-sdk#streaming-events)):

| Event type | Description | Key fields in parsed `data` |
|------------|-------------|-----------------------------|
| `RUN_STARTED` | Workflow execution started | `thread_id`, `run_id` |
| `TEXT_MESSAGE_START` | Assistant message started | `message_id`, `role` |
| `TEXT_MESSAGE_CONTENT` | Text chunk (incremental) | `message_id`, `delta` |
| `TEXT_MESSAGE_END` | Assistant message completed | `message_id` |
| `TOOL_CALL_START` | Tool/function call started | `tool_call_id`, `tool_call_name` |
| `TOOL_CALL_END` | Tool/function call completed | `tool_call_id` |
| `RUN_FINISHED` | Workflow completed | `thread_id`, `run_id` |
| `RUN_ERROR` | Workflow error | `message` |
| `CUSTOM` | Custom event | varies |

**For integrators and AI agents:** Always handle `RUN_ERROR` (check `data.message`). Use `RUN_FINISHED` to detect successful completion. Use `delta` from `TEXT_MESSAGE_CONTENT` for incremental output. Optionally handle `TOOL_CALL_START` / `TOOL_CALL_END` to show tool usage (e.g. "Calling: ...").

**Complete example** (handling text, tool calls, completion, and errors):

```ts
const stream = client.runWorkflow('agent-123', 'Search and summarize', { stream: true });

for await (const event of stream) {
  const data = JSON.parse(event.data);
  const eventType = event.event_type ?? data?.type;

  switch (eventType) {
    case 'RUN_STARTED':
      console.error('Started run:', data.run_id);
      break;
    case 'TEXT_MESSAGE_CONTENT':
      if (data.delta) process.stdout.write(data.delta);
      break;
    case 'TOOL_CALL_START':
      console.error('\n[Calling:', data.tool_call_name + ']');
      break;
    case 'TOOL_CALL_END':
      console.error('[Done]');
      break;
    case 'RUN_FINISHED':
      console.error('\nCompleted.');
      break;
    case 'RUN_ERROR':
      console.error('Error:', data.message);
      break;
  }
}
```

Event protocol and details: [Streaming events (Python SDK)](https://docs.sketricgen.ai/dev-guide/python-sdk#streaming-events).

## API Reference

For a quick reference from the terminal, run `npx sketricgen --help` or `npx sketricgen --help <method>` (e.g. `npx sketricgen --help runWorkflow`).

### SketricGenClient (constructor)

```ts
new SketricGenClient(options)
```

| Option | Type | Description |
|--------|------|-------------|
| `apiKey` | string | **Required.** Your API key. |
| `baseUrl` | string | Optional. Default: `https://chat-v2.sketricgen.ai` |
| `uploadInitUrl` | string | Optional. Upload init endpoint (not derived from baseUrl). |
| `uploadCompleteUrl` | string | Optional. Upload complete endpoint. |
| `timeout` | number | Optional. Request timeout in seconds. |
| `uploadTimeout` | number | Optional. Upload timeout in seconds. |
| `maxRetries` | number | Optional. Max retry attempts. |

```ts
const client = new SketricGenClient({ apiKey: 'your-api-key' });
```

### SketricGenClient.fromEnv(overrides?)

Create a client from environment variables. Pass an optional `overrides` object to override any option.

| Variable | Purpose |
|----------|---------|
| `SKETRICGEN_API_KEY` | API key (required unless in overrides) |
| `SKETRICGEN_TIMEOUT` | Request timeout in seconds |
| `SKETRICGEN_UPLOAD_TIMEOUT` | Upload timeout in seconds |
| `SKETRICGEN_MAX_RETRIES` | Max retries |

```ts
const client = SketricGenClient.fromEnv();
const clientWithOverrides = SketricGenClient.fromEnv({ apiKey: 'override-key' });
```

### client.runWorkflow(agentId, userInput, options?)

Execute a workflow. Returns **`Promise<ChatResponse>`** by default, or **`AsyncGenerator<StreamEvent>`** when `options.stream === true`.

| Option | Type | Description |
|--------|------|-------------|
| `conversationId` | string | Optional. Resume an existing conversation. |
| `contactId` | string | Optional. External contact ID (max 255 chars). |
| `filePaths` | string[] | Optional. Local file paths; client uploads then attaches as assets. |
| `assets` | string[] | Optional. Pre-obtained file IDs (e.g. from `files.upload`). |
| `stream` | boolean | Optional. If `true`, returns async iterable of `StreamEvent`. |

**Non-streaming example:**

```ts
const response = await client.runWorkflow('agent-123', 'Hello!');
console.log(response.response);
```

**Streaming example:** use `for await` and handle `TEXT_MESSAGE_CONTENT` events; parse `event.data` as JSON and use the `delta` field for incremental text. For all stream event types and a full handling example, see [Streaming events](#streaming-events) below.

```ts
const stream = client.runWorkflow('agent-123', 'Explain step by step.', { stream: true });
for await (const event of stream) {
  if (event.event_type === 'TEXT_MESSAGE_CONTENT') {
    const payload = JSON.parse(event.data);
    if (payload.delta) process.stdout.write(payload.delta);
  }
}
```

**With files:** use `filePaths` or upload first and pass `assets`.

```ts
const response = await client.runWorkflow('agent-123', 'Summarize this.', { filePaths: ['./doc.pdf'] });
```

### client.files.upload({ agentId, file, filename?, contentType? })

Upload a file. Returns a promise that resolves to an object with **`fileId`** (and other fields) for use in `runWorkflow(..., { assets: [result.fileId] })`.

| Param | Type | Description |
|-------|------|-------------|
| `agentId` | string | **Required.** The agent ID. |
| `file` | string \| Buffer \| Readable | **Required.** Path, Buffer, or Node `Readable` stream. |
| `filename` | string | Optional. Required when `file` is Buffer or Readable; must include extension. |
| `contentType` | string | Optional. Use when `file` is Buffer/Readable and type cannot be inferred. |

**Allowed content types:** `image/jpeg`, `image/webp`, `image/png`, `application/pdf`, `image/gif`. **Max size:** 20 MB. Empty files are rejected.

```ts
const result = await client.files.upload({ agentId: 'agent-123', file: './document.pdf' });
// use result.fileId in runWorkflow(..., { assets: [result.fileId] })
```

When `file` is a `Buffer` or `Readable` stream, you must provide `filename` (with extension); optionally set `contentType`.

## License

See [LICENSE](LICENSE).
