/**
 * SSE parser: consumes ReadableStream, yields StreamEvent objects.
 * event.data is a JSON string (AG-UI payload). Key event types: RUN_STARTED,
 * TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT (delta), TEXT_MESSAGE_END,
 * TOOL_CALL_START, TOOL_CALL_END, RUN_FINISHED, RUN_ERROR, CUSTOM.
 * @see TS_NODE_SDK_PLAN.md Section 6
 */

import type { StreamEvent } from './types.js';

export async function* parseSSE(
  body: ReadableStream<Uint8Array> | null
): AsyncGenerator<StreamEvent> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let current: Partial<StreamEvent> = {};
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          current.event_type = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          current.data = line.slice(5).trim();
        } else if (line.startsWith('id:')) {
          current.id = line.slice(3).trim();
        } else if (line === '') {
          if (current.event_type !== undefined && current.data !== undefined) {
            yield {
              event_type: current.event_type,
              data: current.data,
              id: current.id,
            };
          }
          current = {};
        }
      }
    }
    if (current.event_type !== undefined && current.data !== undefined) {
      yield {
        event_type: current.event_type,
        data: current.data,
        id: current.id,
      };
    }
  } finally {
    reader.releaseLock();
  }
}
