import axios from 'axios';

export const handleAnthropic = async (providerConfig: any, body: any) => {
  const apiKey = providerConfig.api_key;
  const baseUrl = providerConfig.base_url || 'https://api.anthropic.com/v1';

  // Basic translation from OpenAI format to Anthropic format
  let anthropicMessages = [];
  let systemPrompt = "";

  for (const msg of body.messages) {
    if (msg.role === 'system') {
      systemPrompt = msg.content;
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

  try {
    const response = await axios.post(`${baseUrl}/messages`, anthropicBody, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    });

    // Translate back to OpenAI format
    return {
      id: response.data.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.data.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response.data.content[0].text
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: response.data.usage.input_tokens,
        completion_tokens: response.data.usage.output_tokens,
        total_tokens: response.data.usage.input_tokens + response.data.usage.output_tokens
      }
    };
  } catch (error: any) {
    if (error.response) {
      throw new Error(`Anthropic API error: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
};
