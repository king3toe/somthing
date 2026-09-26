import { safeFetch } from './ssrf';
import { StreamEvent } from './stream_types';

export async function* runAgentStream(
  adapterStream: AsyncGenerator<StreamEvent, void, unknown>,
  signal?: AbortSignal,
  metricsCallback?: (metrics: any) => void
): AsyncGenerator<StreamEvent, void, unknown> {
  const startTime = Date.now();
  let firstTokenTime: number | null = null;
  let errorCount = 0;
  let usage = null;

  try {
    let toolAccumulator: any = {};
    for await (const event of adapterStream) {
      if (signal?.aborted) {
         break;
      }

      if (firstTokenTime === null && event.type === 'content') {
         firstTokenTime = Date.now();
      }
      if (event.type === 'usage') {
         usage = event.usage;
      }
      if (event.type === 'error') {
         errorCount++;
      }

      // If tool delta, accumulate it
      if (event.type === 'tool_delta') {
         if (!toolAccumulator[event.index]) toolAccumulator[event.index] = { id: event.id, name: event.name, args: '' };
         if (event.arguments) toolAccumulator[event.index].args += event.arguments;
         // Yield so the client knows a tool is happening
         yield event;
         continue;
      }

      // If we finished and have tools, we would execute them here.
      // For this MVP, we pass through finish.
      if (event.type === 'finish' && Object.keys(toolAccumulator).length > 0) {
         // mock executing tool logic here, then recursing stream
         yield { type: 'content', text: '\n\n[Tool Call intercepted in Gateway]' };
      }

      yield event;
    }
  } catch (error: any) {
    errorCount++;
    yield { type: 'error', error };
  } finally {
    if (metricsCallback) {
      metricsCallback({
         ttft_ms: firstTokenTime ? (firstTokenTime - startTime) : null,
         latency_ms: Date.now() - startTime,
         errorCount,
         usage
      });
    }
  }
}

export async function* toSSE(stream: AsyncGenerator<StreamEvent, void, unknown>): AsyncGenerator<string, void, unknown> {
  for await (const event of stream) {
    if (event.type === 'content') {
      yield `data: ${JSON.stringify({ choices: [{ delta: { content: event.text } }] })}\n\n`;
    } else if (event.type === 'tool_delta') {
      // Mock formatting for tools
      yield `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: event.index, id: event.id, function: { name: event.name, arguments: event.arguments } }] } }] })}\n\n`;
    } else if (event.type === 'usage') {
      yield `data: ${JSON.stringify({ usage: event.usage })}\n\n`;
    } else if (event.type === 'finish') {
      yield `data: ${JSON.stringify({ choices: [{ finish_reason: event.reason }] })}\n\n`;
    } else if (event.type === 'error') {
      yield `data: ${JSON.stringify({ error: { message: event.error.message } })}\n\n`;
    }
  }
  yield 'data: [DONE]\n\n';
}
