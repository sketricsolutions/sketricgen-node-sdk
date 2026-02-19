# sketricgen-node-sdk — Agent Instructions

This is the **public Node.js SDK** for SketricGen, published to **npm** as `sketricgen`. It wraps the SketricGen public REST API so developers can run workflows, upload files, and stream responses from their Node.js applications.

---

## What this package does

- **Run workflows** — send messages to agent workflows (non-streaming and SSE streaming)
- **Upload files** — 3-step S3 presigned upload (init -> upload to S3 -> complete)
- **Stream responses** — async generator yielding SSE events (AG-UI protocol)
- **CLI help** — `sketricgen --help` prints usage and method reference

---

## Stack

- TypeScript (ES2022, NodeNext modules)
- Zero runtime dependencies (uses built-in `fetch`, `FormData`, Node streams)
- Node.js >= 18
- Published to npm, compiled to `dist/`

---

## Directory structure

```
src/
├── index.ts          # Public exports (SketricGenClient, types, errors)
├── client.ts         # SketricGenClient class (constructor, fromEnv, runWorkflow, files.upload)
├── types.ts          # API types (RunWorkflowRequest, ChatResponse, StreamEvent, UploadResult, etc.)
├── errors.ts         # Custom error classes (SketricGenError, APIError, AuthError, ValidationError, etc.)
├── request.ts        # HTTP request layer (fetch wrapper, error handling, retries)
├── streaming.ts      # SSE stream parser (parses text/event-stream into StreamEvent objects)
├── upload.ts         # 3-step upload flow (initiate -> S3 presigned POST -> complete)
└── workflow.ts       # runWorkflowStream / runWorkflowNonStream implementations

bin/
└── cli.mjs           # CLI entry point (sketricgen --help, per-method help)

dist/                 # Compiled JS + .d.ts (do not edit)

docs/
├── TS_NODE_SDK_PLAN.md       # Full implementation plan (spec)
├── TS_NODE_SDK_PLAN_AUDIT.md # Audit of plan vs implementation
├── TESTING.md                # Testing guide (build, link, verify)
└── PUBLISH_CHECKLIST.md      # Steps to push to GitHub + publish to npm
```

---

## Public API surface

```typescript
import { SketricGenClient } from 'sketricgen';

// Construct
const client = new SketricGenClient({ apiKey: 'your-key' });
// Or from environment
const client = SketricGenClient.fromEnv();

// Non-streaming
const response = await client.runWorkflow('agent-id', 'Hello');

// Streaming (async generator)
const stream = client.runWorkflow('agent-id', 'Hello', { stream: true });
for await (const event of stream) { /* handle event */ }

// File upload
const result = await client.files.upload({ agentId: 'agent-id', file: './doc.pdf' });
```

### Key types

| Type | Purpose |
|---|---|
| `SketricGenClient` | Main client class |
| `ChatResponse` | Non-streaming response (`agent_id`, `conversation_id`, `response`) |
| `StreamEvent` | SSE event (`event_type`, `data`, `id`) |
| `RunWorkflowOptions` | Options: `conversationId`, `contactId`, `filePaths`, `assets`, `stream` |
| `UploadResult` | Upload result (`fileId`, `url`, `content_type`, etc.) |

### Stream event types

| Event | Purpose |
|---|---|
| `TEXT_MESSAGE_CONTENT` | Incremental text chunk (parse `data` for `delta`) |
| `TEXT_MESSAGE_START/END` | Message boundaries |
| `TOOL_CALL_START/END` | Tool invocation boundaries |
| `RUN_STARTED` | Workflow execution started |
| `RUN_FINISHED` | Workflow completed |
| `RUN_ERROR` | Error occurred |

---

## Relationship to other services

- Calls `sketricgen-chatservers` at `/api/v1/run-workflow` (base URL: `https://chat-v2.sketricgen.ai`)
- Upload endpoints go to API Gateway Lambda (separate from chatservers)
- Must stay in sync with the Python SDK (`sketricgen-sdk`) — same API surface, same event types
- Changes to chatservers' public API require updates here

---

## Development

```bash
npm install
npm run build      # Compile TypeScript to dist/
npm run lint       # ESLint
npm test           # Run tests
npm run help       # CLI help
```

### Publishing

Follow `docs/PUBLISH_CHECKLIST.md`:
1. `npm run build`
2. `git add -A && git commit && git push`
3. `npm publish` (requires npm auth)

---

## Files you must NEVER modify

- `dist/` — auto-generated. Run `npm run build` to regenerate.
- `package-lock.json` — managed by npm. Only modify `package.json`.
- Do not change default API URLs without coordinating with chatservers and the Python SDK.

---

## Key docs to read

- `docs/TS_NODE_SDK_PLAN.md` — full specification and endpoint inventory
- `docs/TESTING.md` — how to test locally
- `docs/PUBLISH_CHECKLIST.md` — release process
- `README.md` — public-facing usage guide (this IS the user documentation)
