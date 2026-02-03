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

## API

- **`new SketricGenClient({ apiKey, baseUrl?, uploadInitUrl?, uploadCompleteUrl?, timeout?, uploadTimeout?, maxRetries? })`** — Create a client with options.
- **`SketricGenClient.fromEnv(overrides?)`** — Create a client from environment variables.
- **`client.runWorkflow(agentId, userInput, options?)`** — Run a workflow. Returns `Promise<ChatResponse>` by default, or `AsyncGenerator<StreamEvent>` when `options.stream === true`. Options: `conversationId`, `contactId`, `filePaths`, `assets`, `stream`.
- **`client.files.upload({ agentId, file, filename?, contentType? })`** — Upload a file. `file` can be a path (string), a `Buffer`, or a Node `Readable` stream. Returns an object with `fileId` for use in `assets`.

## License

See [LICENSE](LICENSE).
