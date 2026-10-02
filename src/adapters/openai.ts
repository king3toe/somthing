import { StreamEvent, AdapterRequest } from '../middleware/stream_types';
import { createParser, EventSourceMessage } from 'eventsource-parser';

export async function* streamOpenAI(
  providerConfig: any,
  req: AdapterRequest
): AsyncGenerator<StreamEvent, void, unknown> {
  const url = providerConfig.base_url || 'https://api.openai.com/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${providerConfig.api_key}`
  };

  const payload = { ...req };
  delete payload.signal;
  payload.stream = true;
  payload.stream_options = { include_usage: true };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: req.signal
  });

  if (!response.ok) {
    let errBody = '';
    try { errBody = await response.text(); } catch(e) {}
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText} ${errBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is null');

  const decoder = new TextDecoder('utf-8');
  let queue: string[] = [];

  const parser = createParser({
    onEvent: (event: EventSourceMessage) => {
      queue.push(event.data);
    }
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        parser.feed(decoder.decode(value, { stream: true }));
        while (queue.length > 0) {
          const data = queue.shift();
          if (data === '[DONE]') {
            // we do NOT yield [DONE]. toSSE handles that.
            continue;
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
              if (parsed.choices?.[0]?.finish_reason) {
                 yield { type: 'finish', reason: parsed.choices[0].finish_reason };
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

export async function completeOpenAI(
  providerConfig: any,
  req: AdapterRequest
): Promise<any> {
  const url = providerConfig.base_url || 'https://api.openai.com/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${providerConfig.api_key}`
  };

  const payload = { ...req };
  delete payload.signal;
  payload.stream = false;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: req.signal
  });

  if (!response.ok) {
    let errBody = '';
    try { errBody = await response.text(); } catch(e) {}
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText} ${errBody}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: data.usage,
    finishReason: data.choices?.[0]?.finish_reason || 'stop'
  };
}
