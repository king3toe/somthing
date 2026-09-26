import { StreamEvent } from '../middleware/stream_types';
import { createParser, EventSourceMessage } from 'eventsource-parser';

export async function* handleAnthropic(
  providerConfig: any,
  body: any,
  isStream: boolean = false,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent, void, unknown> {
  const url = providerConfig.base_url || 'https://api.anthropic.com/v1/messages';
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': providerConfig.api_key,
    'anthropic-version': '2023-06-01'
  };

  const anthropicBody = {
    model: body.model || 'claude-3-haiku-20240307',
    max_tokens: body.max_tokens || 1024,
    messages: body.messages,
    stream: isStream
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(anthropicBody),
    signal
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
  }

  if (!isStream) {
    const data = await response.json();
    if (data.content?.[0]?.text) {
      yield { type: 'content', text: data.content[0].text };
    }
    if (data.usage) {
      yield { type: 'usage', usage: { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens, total_tokens: data.usage.input_tokens + data.usage.output_tokens } };
    }
    yield { type: 'finish', reason: data.stop_reason || 'stop' };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is null');

  const decoder = new TextDecoder('utf-8');
  let eventType = '';
  const parser = createParser({
    onEvent: (event) => {
       if (event.event) eventType = event.event;
       queue.push({ event: eventType, data: event.data });
    }
  });

  let queue: { event: string, data: string }[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        parser.feed(decoder.decode(value, { stream: true }));
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) {
             const data = JSON.parse(item.data);
             if (item.event === 'content_block_delta' && data.delta?.type === 'text_delta') {
                yield { type: 'content', text: data.delta.text };
             } else if (item.event === 'content_block_delta' && data.delta?.type === 'input_json_delta') {
                yield { type: 'tool_delta', index: data.index, arguments: data.delta.partial_json };
             } else if (item.event === 'content_block_start' && data.content_block?.type === 'tool_use') {
                yield { type: 'tool_delta', index: data.index, id: data.content_block.id, name: data.content_block.name };
             } else if (item.event === 'message_delta' && data.usage) {
                yield { type: 'usage', usage: { prompt_tokens: 0, completion_tokens: data.usage.output_tokens, total_tokens: data.usage.output_tokens } };
             } else if (item.event === 'message_stop') {
                yield { type: 'finish', reason: 'stop' };
             } else if (item.event === 'error') {
                yield { type: 'error', error: new Error(data.error?.message || 'Anthropic error') };
             }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
