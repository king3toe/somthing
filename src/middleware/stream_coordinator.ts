import { StreamEvent, AdapterRequest } from './stream_types';
import { resolveToolCall } from './tools';
import db from '../db';

export async function* withErrorPolicy(
  stream: AsyncGenerator<StreamEvent, void, unknown>
): AsyncGenerator<StreamEvent, void, unknown> {
  let hasCommittedOutput = false;
  try {
    for await (const event of stream) {
      if (!hasCommittedOutput && (event.type === 'content' || event.type === 'tool_delta')) {
         hasCommittedOutput = true;
      }
      yield event;
    }
  } catch (error: any) {
    if (!hasCommittedOutput) throw error;
    yield { type: 'error', error };
  }
}

export async function* runAgentStream(
  adapterStreamFn: (req: AdapterRequest) => AsyncGenerator<StreamEvent, void, unknown>,
  baseReq: AdapterRequest,
  metricsCallback?: (metrics: any) => void
): AsyncGenerator<StreamEvent, void, unknown> {
  const MAX_ROUNDS = 5;
  const startTime = Date.now();
  let firstTokenTime: number | null = null;
  let errorCount = 0;

  let aggregatedUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let currentReq = { ...baseReq };
  let round = 0;

  try {
    while (round < MAX_ROUNDS) {
      if (baseReq.signal?.aborted) break;

      const stream = adapterStreamFn(currentReq);
      let toolAccumulator: any = {};
      let finishReason: string | null = null;
      let roundUsage = null;
      let toolIndexMap: Record<number, number> = {};
      let globalIndexOffset = 0; // In a full implementation, we'd sync this with client state

      for await (const event of stream) {
        if (baseReq.signal?.aborted) break;

        if (firstTokenTime === null && event.type === 'content') {
           firstTokenTime = Date.now();
        }

        if (event.type === 'usage') {
           roundUsage = event.usage;
           continue; // don't yield usage until the very end
        }

        if (event.type === 'error') {
           errorCount++;
           yield event;
           continue;
        }

        if (event.type === 'finish') {
           finishReason = event.reason;
           continue; // don't yield finish until very end
        }

        if (event.type === 'tool_delta') {
           if (!toolAccumulator[event.index]) toolAccumulator[event.index] = { id: event.id, name: event.name, args: '' };
           if (event.arguments) toolAccumulator[event.index].args += event.arguments;
           yield event; // pass-through so client sees thinking/typing
           continue;
        }

        yield event;
      }

      if (roundUsage) {
         aggregatedUsage.prompt_tokens += roundUsage.prompt_tokens;
         aggregatedUsage.completion_tokens += roundUsage.completion_tokens;
         aggregatedUsage.total_tokens += roundUsage.total_tokens;
      }

      // Check Execution Gate and Mixed Tools rules
      const toolKeys = Object.keys(toolAccumulator);
      if (finishReason !== 'tool_calls' || toolKeys.length === 0) {
         yield { type: 'finish', reason: finishReason };
         break;
      }

      // Determine if tools are internal or external
      let hasExternal = false;
      let internalToolsToRun = [];
      const configuredTools = db.prepare('SELECT * FROM ToolConfigs').all() as any[];

      for (const k of toolKeys) {
         const t = toolAccumulator[k];
         const config = configuredTools.find(ct => ct.tool_name === t.name);
         if (config) {
             internalToolsToRun.push({ ...t, config });
         } else {
             hasExternal = true;
         }
      }

      // Mixed tools rule: If any external, don't execute any internal. Hand back to client.
      if (hasExternal) {
         yield { type: 'finish', reason: 'tool_calls' };
         break;
      }

      // All internal. Execute them.
      yield { type: 'ping' }; // keepalive

      const results: any[] = [];
      // Setup periodic ping while tools execute
      const pingInterval = setInterval(() => {
        // Yielding out of an async generator in a setTimeout is tricky without an event emitter.
        // For now, we yield a ping *before* the tools, and again *after* the tools.
      }, 15000);

      for (const t of internalToolsToRun) {
          try {
             let args = {};
             try { args = JSON.parse(t.args); } catch(e) {}

             const out = await resolveToolCall({ function: { name: t.name, arguments: t.args } });
             results.push({ id: t.id, name: t.name, result: out });
          } catch (e: any) {
             results.push({ id: t.id, name: t.name, result: `Error: ${e.message}` });
          }
      }
      clearInterval(pingInterval);

      // Prepare next round request
      currentReq.messages = [
         ...currentReq.messages,
         { role: 'assistant', content: null, tool_calls: internalToolsToRun.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.args } })) },
         ...results.map(r => ({ role: 'tool', tool_call_id: r.id, name: r.name, content: r.result }))
      ];

      round++;
      yield { type: 'ping' }; // keepalive
    }

    yield { type: 'usage', usage: aggregatedUsage };

  } finally {
    if (metricsCallback) {
      metricsCallback({
         ttft_ms: firstTokenTime ? (firstTokenTime - startTime) : null,
         latency_ms: Date.now() - startTime,
         errorCount,
         usage: aggregatedUsage
      });
    }
  }
}

export async function* toSSE(stream: AsyncGenerator<StreamEvent, void, unknown>, completionId: string): AsyncGenerator<string, void, unknown> {
  for await (const event of stream) {
    if (event.type === 'content') {
      yield `data: ${JSON.stringify({ id: completionId, choices: [{ delta: { content: event.text } }] })}\n\n`;
    } else if (event.type === 'tool_delta') {
      yield `data: ${JSON.stringify({ id: completionId, choices: [{ delta: { tool_calls: [{ index: event.index, id: event.id, function: { name: event.name, arguments: event.arguments } }] } }] })}\n\n`;
    } else if (event.type === 'usage') {
      yield `data: ${JSON.stringify({ id: completionId, usage: event.usage })}\n\n`;
    } else if (event.type === 'finish') {
      yield `data: ${JSON.stringify({ id: completionId, choices: [{ finish_reason: event.reason }] })}\n\n`;
    } else if (event.type === 'error') {
      yield `data: ${JSON.stringify({ id: completionId, error: { message: event.error.message } })}\n\n`;
    } else if (event.type === 'ping') {
      yield `: ping\n\n`;
    }
  }
  yield 'data: [DONE]\n\n';
}
