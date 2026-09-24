import axios from 'axios';

export const handleAnthropic = async (providerConfig: any, body: any) => {
  const apiKey = providerConfig.api_key;
  const baseUrl = providerConfig.base_url || 'https://api.anthropic.com/v1';

  let anthropicMessages: any[] = [];
  let systemPrompt = "";

  for (const msg of body.messages) {
    if (msg.role === 'system') {
      systemPrompt = msg.content;
    } else if (msg.role === 'tool') {
      // Check if the previous message was also a tool result (or is already a bundled user tool result)
      const lastMsg = anthropicMessages[anthropicMessages.length - 1];
      const toolBlock = {
        type: 'tool_result',
        tool_use_id: msg.tool_call_id,
        content: msg.content
      };

      if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content) && lastMsg.content.some((c: any) => c.type === 'tool_result')) {
        // Bundle with existing parallel tool calls
        lastMsg.content.push(toolBlock);
      } else {
        // Create new user block for tool results
        anthropicMessages.push({
          role: 'user',
          content: [toolBlock]
        });
      }
    } else if (msg.role === 'assistant' && msg.tool_calls) {
       let content: any[] = msg.content ? [{ type: 'text', text: msg.content }] : [];
       for (const tool of msg.tool_calls) {
         content.push({
           type: 'tool_use',
           id: tool.id,
           name: tool.function.name,
           input: JSON.parse(tool.function.arguments || '{}')
         });
       }
       anthropicMessages.push({ role: 'assistant', content });
    } else {
      anthropicMessages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    }
  }

  const anthropicBody: any = {
    model: body.model.replace('anthropic:', '') || 'claude-3-opus-20240229',
    messages: anthropicMessages,
    max_tokens: body.max_tokens || 1024,
  };

  if (systemPrompt) {
    anthropicBody.system = systemPrompt;
  }

  // Translate OpenAI tools to Anthropic format
  if (body.tools && body.tools.length > 0) {
    anthropicBody.tools = body.tools.map((t: any) => ({
      name: t.function.name,
      description: t.function.description || '',
      input_schema: t.function.parameters || { type: 'object', properties: {} }
    }));
  }

  try {
    const response = await axios.post(`${baseUrl}/messages`, anthropicBody, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    });

    const anthropicResponse = response.data;

    // Translate response back to OpenAI format
    let finalContent = null;
    let toolCalls = [];

    for (const block of anthropicResponse.content) {
      if (block.type === 'text') {
        finalContent = block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input)
          }
        });
      }
    }

    const openaiResponse: any = {
      id: anthropicResponse.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: anthropicResponse.model,
      choices: [
        {
          index: 0,
          message: {
             role: 'assistant',
             content: finalContent
          },
          finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop'
        }
      ],
      usage: {
        prompt_tokens: anthropicResponse.usage?.input_tokens || 0,
        completion_tokens: anthropicResponse.usage?.output_tokens || 0,
        total_tokens: (anthropicResponse.usage?.input_tokens || 0) + (anthropicResponse.usage?.output_tokens || 0)
      }
    };

    if (toolCalls.length > 0) {
      openaiResponse.choices[0].message.tool_calls = toolCalls;
    }

    return openaiResponse;

  } catch (error: any) {
    if (error.response) {
      throw new Error(`Anthropic API error: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
};
