import { StreamEvent } from '../middleware/stream_types';
import { createParser, EventSourceMessage } from 'eventsource-parser';

export async function* handleOpenAI(
  providerConfig: any,
  body: any,
  isStream: boolean = false,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent, void, unknown> {
  const url = providerConfig.base_url || 'https://api.openai.com/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${providerConfig.api_key}`
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, stream: isStream }),
    signal
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  if (!isStream) {
    const data = await response.json();
    if (data.choices?.[0]?.message?.content) {
      yield { type: 'content', text: data.choices[0].message.content };
    }
    if (data.usage) {
      yield { type: 'usage', usage: data.usage };
    }
    yield { type: 'finish', reason: data.choices?.[0]?.finish_reason || 'stop' };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is null');

  const decoder = new TextDecoder('utf-8');
  const parser = createParser({
    onEvent: (event) => {
      queue.push(event.data);
    }
  });

  let queue: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        parser.feed(decoder.decode(value, { stream: true }));
        while (queue.length > 0) {
          const data = queue.shift();
          if (data === '[DONE]') {
            yield { type: 'finish', reason: 'stop' };
            return;
          }
          if (data) {
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.content) {
                yield { type: 'content', text: delta.content };
              }
              if (delta?.tool_calls?.length > 0) {
                 const tc = delta.tool_calls[0];
                 yield { type: 'tool_delta', index: tc.index, id: tc.id, name: tc.function?.name, arguments: tc.function?.arguments };
              }
              if (parsed.usage) {
                 yield { type: 'usage', usage: parsed.usage };
              }
            } catch (e) {
              // ignore parse errors for partial chunks if any
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
