import { StreamEvent, AdapterRequest } from '../middleware/stream_types';
import { createParser, EventSourceMessage } from 'eventsource-parser';

export async function* streamAnthropic(
  providerConfig: any,
  req: AdapterRequest
): AsyncGenerator<StreamEvent, void, unknown> {
  const url = providerConfig.base_url || 'https://api.anthropic.com/v1/messages';
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': providerConfig.api_key,
    'anthropic-version': '2023-06-01'
  };

  let system = '';
  const messages = [];
  for (const msg of req.messages) {
     if (msg.role === 'system') {
        system = msg.content;
     } else {
        messages.push(msg);
     }
  }

  const anthropicBody = {
    model: req.model || 'claude-3-haiku-20240307',
    max_tokens: req.max_tokens || 1024,
    messages,
    system: system || undefined,
    stream: true,
    // TODO: translate tools if present
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(anthropicBody),
    signal: req.signal
  });

  if (!response.ok) {
    let errBody = '';
    try { errBody = await response.text(); } catch(e) {}
    throw new Error(`Anthropic API error: ${response.status} ${response.statusText} ${errBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is null');

  const decoder = new TextDecoder('utf-8');
  let toolIndex = 0;
  let queue: { event: string, data: string }[] = [];

  const parser = createParser({
    onEvent: (event: EventSourceMessage) => {
       queue.push({ event: event.event || '', data: event.data });
    }
  });

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
             switch (item.event) {
                case "content_block_start":
                  if (data.content_block?.type === "tool_use") {
                    yield {
                      type: "tool_delta",
                      index: toolIndex++,
                      id: data.content_block.id,
                      name: data.content_block.name,
                      arguments: ""
                    };
                  }
                  break;
                case "content_block_delta":
                  if (data.delta?.type === "text_delta") {
                    yield { type: "content", text: data.delta.text };
                  } else if (data.delta?.type === "input_json_delta") {
                    yield {
                      type: "tool_delta",
                      index: toolIndex - 1,
                      arguments: data.delta.partial_json
                    };
                  }
                  break;
                case "message_delta":
                  if (data.delta?.stop_reason) {
                    let reason = data.delta.stop_reason;
                    if (reason === "tool_use") reason = "tool_calls";
                    else if (reason === "end_turn" || reason === "stop_sequence") reason = "stop";
                    else if (reason === "max_tokens") reason = "length";
                    else if (reason === "refusal") reason = "content_filter";
                    yield { type: "finish", reason };
                  }
                  if (data.usage) {
                    yield { type: "usage", usage: { prompt_tokens: 0, completion_tokens: data.usage.output_tokens || 0, total_tokens: data.usage.output_tokens || 0 } };
                  }
                  break;
                case "message_stop":
                  // DO NOT YIELD DONE HERE. toSSE will handle it.
                  break;
                case "error":
                  yield { type: "error", error: new Error(data.error?.message ?? "anthropic_stream_error") };
                  break;
             }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function completeAnthropic(
  providerConfig: any,
  req: AdapterRequest
): Promise<any> {
  const url = providerConfig.base_url || 'https://api.anthropic.com/v1/messages';
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': providerConfig.api_key,
    'anthropic-version': '2023-06-01'
  };

  let system = '';
  const messages = [];
  for (const msg of req.messages) {
     if (msg.role === 'system') {
        system = msg.content;
     } else {
        messages.push(msg);
     }
  }

  const anthropicBody = {
    model: req.model || 'claude-3-haiku-20240307',
    max_tokens: req.max_tokens || 1024,
    messages,
    system: system || undefined,
    stream: false
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(anthropicBody),
    signal: req.signal
  });

  if (!response.ok) {
    let errBody = '';
    try { errBody = await response.text(); } catch(e) {}
    throw new Error(`Anthropic API error: ${response.status} ${response.statusText} ${errBody}`);
  }

  const data = await response.json();
  let content = '';
  for (const block of data.content) {
     if (block.type === 'text') content += block.text;
  }

  let finishReason = data.stop_reason;
  if (finishReason === "tool_use") finishReason = "tool_calls";
  else if (finishReason === "end_turn" || finishReason === "stop_sequence") finishReason = "stop";
  else if (finishReason === "max_tokens") finishReason = "length";
  else if (finishReason === "refusal") finishReason = "content_filter";

  return {
     content,
     usage: { prompt_tokens: data.usage?.input_tokens || 0, completion_tokens: data.usage?.output_tokens || 0, total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) },
     finishReason
  };
}
