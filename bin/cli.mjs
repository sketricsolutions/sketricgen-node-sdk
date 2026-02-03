#!/usr/bin/env node

/**
 * sketricgen CLI — print usage and per-method help.
 * Usage: sketricgen --help
 *        sketricgen --help <method>
 */

const argv = process.argv.slice(2);
const hasHelp = argv.includes('--help') || argv.includes('-h');
const helpIdx = argv.findIndex((a) => a === '--help' || a === '-h');
const methodName = helpIdx >= 0 && argv[helpIdx + 1] && !argv[helpIdx + 1].startsWith('-')
  ? argv[helpIdx + 1]
  : null;

const METHODS = ['SketricGenClient', 'fromEnv', 'runWorkflow', 'files.upload', 'streaming'];

const INTRO = `sketricgen — Node.js SDK for Sketricgen workflows

Run workflows, upload files, and stream responses. Full docs: https://github.com/sketricgen/sketricgen-node-sdk#readme

Methods:
  SketricGenClient   Create a client (constructor options)
  fromEnv            Create client from environment variables
  runWorkflow        Run a workflow (message, optional files, optional stream)
  files.upload       Upload a file and get fileId for use in assets
  streaming          Stream event types and how to handle them (use with stream: true)

Method help: sketricgen --help <method>

Examples:
  sketricgen --help
  sketricgen --help runWorkflow
  sketricgen --help files.upload
  sketricgen --help streaming
`;

const HELP = {
  SketricGenClient: `
SketricGenClient (constructor)

  new SketricGenClient(options)

Options:
  apiKey           string   Required. Your API key.
  baseUrl          string   Optional. Default: https://chat-v2.sketricgen.ai
  uploadInitUrl    string   Optional. Upload init endpoint (not derived from baseUrl).
  uploadCompleteUrl string  Optional. Upload complete endpoint.
  timeout          number   Optional. Request timeout in seconds.
  uploadTimeout    number   Optional. Upload timeout in seconds.
  maxRetries       number   Optional. Max retry attempts.

Example:

  import { SketricGenClient } from 'sketricgen';

  const client = new SketricGenClient({ apiKey: 'your-api-key' });
  // with overrides:
  const client = new SketricGenClient({
    apiKey: 'your-api-key',
    baseUrl: 'https://custom.example.com',
    timeout: 60,
  });
`,
  fromEnv: `
SketricGenClient.fromEnv(overrides?)

  Create a client using environment variables. Optional overrides object can
  override any option (e.g. apiKey, baseUrl, timeout).

Environment variables:
  SKETRICGEN_API_KEY         Required (unless overrides.apiKey is set).
  SKETRICGEN_TIMEOUT         Optional. Request timeout in seconds.
  SKETRICGEN_UPLOAD_TIMEOUT  Optional. Upload timeout in seconds.
  SKETRICGEN_MAX_RETRIES     Optional. Max retries.

Example:

  import { SketricGenClient } from 'sketricgen';

  const client = SketricGenClient.fromEnv();
  // with overrides:
  const client = SketricGenClient.fromEnv({ apiKey: 'override-key' });
`,
  runWorkflow: `
client.runWorkflow(agentId, userInput, options?)

  Execute a workflow. Returns Promise<ChatResponse> by default, or
  AsyncGenerator<StreamEvent> when options.stream === true.

Arguments:
  agentId    string  Required. The agent ID to run.
  userInput  string  Required. User message (max 10,000 characters).
  options    object  Optional.

Options:
  conversationId  string   Optional. Resume an existing conversation.
  contactId       string   Optional. External contact ID (max 255 chars).
  filePaths       string[] Optional. Local paths; client uploads then attaches as assets.
  assets          string[] Optional. Pre-obtained file IDs (e.g. from files.upload).
  stream          boolean  Optional. If true, returns async iterable of StreamEvent.

Return:
  - When stream is false or omitted: Promise<ChatResponse>
  - When stream is true: AsyncGenerator<StreamEvent> (for await ...)

Example (non-streaming):

  const response = await client.runWorkflow('agent-123', 'Hello!');
  console.log(response.response);

Example (streaming):

  const stream = client.runWorkflow('agent-123', 'Explain step by step.', { stream: true });
  for await (const event of stream) {
    if (event.event_type === 'TEXT_MESSAGE_CONTENT') {
      const payload = JSON.parse(event.data);
      if (payload.delta) process.stdout.write(payload.delta);
    }
  }

  Stream event types and fields: sketricgen --help streaming

Example (with files):

  const response = await client.runWorkflow('agent-123', 'Summarize this.', {
    filePaths: ['./doc.pdf'],
  });
`,
  'files.upload': `
client.files.upload({ agentId, file, filename?, contentType? })

  Upload a file. Returns a promise that resolves to an object with fileId
  (and other fields) for use in runWorkflow options.assets.

Parameters:
  agentId     string  Required. The agent ID.
  file        string | Buffer | Readable  Required. Path, Buffer, or Node Readable stream.
  filename    string  Optional. Required when file is Buffer or Readable (must include extension).
  contentType string Optional. Required when file is Buffer/Readable if not inferrable.

Allowed content types: image/jpeg, image/webp, image/png, application/pdf, image/gif
Max file size: 20 MB. Empty files are rejected.

Example (file path):

  const result = await client.files.upload({
    agentId: 'agent-123',
    file: './document.pdf',
  });
  console.log(result.fileId); // use in runWorkflow(..., { assets: [result.fileId] });

Example (Buffer — filename required):

  const result = await client.files.upload({
    agentId: 'agent-123',
    file: buffer,
    filename: 'doc.pdf',
    contentType: 'application/pdf',
  });
`,
  streaming: `
Streaming events (stream: true)

  When you call runWorkflow(agentId, userInput, { stream: true }), the client
  returns an AsyncGenerator of StreamEvent. You must parse event.data and
  handle the events you care about.

StreamEvent shape:
  event_type  string   Event type (e.g. TEXT_MESSAGE_CONTENT, RUN_FINISHED).
  data        string   JSON string. Parse with JSON.parse(event.data); the
                       parsed object may have a "type" field matching event_type.
  id          string   Optional. Event ID.

Event types (key fields in parsed data):

  RUN_STARTED          Workflow execution started      thread_id, run_id
  TEXT_MESSAGE_START    Assistant message started      message_id, role
  TEXT_MESSAGE_CONTENT  Text chunk (incremental)       message_id, delta
  TEXT_MESSAGE_END      Assistant message completed   message_id
  TOOL_CALL_START       Tool/function call started    tool_call_id, tool_call_name
  TOOL_CALL_END         Tool/function call completed  tool_call_id
  RUN_FINISHED          Workflow completed             thread_id, run_id
  RUN_ERROR             Workflow error                message
  CUSTOM                Custom event                   varies

Handling tip:
  - Always handle RUN_ERROR (check data.message).
  - Use TEXT_MESSAGE_CONTENT and data.delta for incremental text output.
  - Use RUN_FINISHED to know the stream ended successfully.
  - Optionally handle TOOL_CALL_START / TOOL_CALL_END for UX (e.g. show "Calling: ...").

Minimal example:

  const stream = client.runWorkflow('agent-123', 'Hello', { stream: true });
  for await (const event of stream) {
    const data = JSON.parse(event.data);
    if (event.event_type === 'TEXT_MESSAGE_CONTENT' && data.delta) {
      process.stdout.write(data.delta);
    } else if (event.event_type === 'RUN_ERROR') {
      console.error('Error:', data.message);
    } else if (event.event_type === 'RUN_FINISHED') {
      // stream ended successfully
    }
  }

Full protocol: https://docs.sketricgen.ai/dev-guide/python-sdk#streaming-events
`,
};

function main() {
  if (!hasHelp && argv.length === 0) {
    console.log(INTRO);
    return;
  }
  if (!hasHelp) {
    console.log(INTRO);
    return;
  }
  if (methodName && METHODS.includes(methodName)) {
    console.log(HELP[methodName].trim());
    return;
  }
  if (methodName) {
    console.error(`Unknown method: ${methodName}`);
    console.error(`Valid methods: ${METHODS.join(', ')}`);
    process.exit(1);
  }
  console.log(INTRO);
}

main();
