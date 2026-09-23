import axios from 'axios';
import db from '../db';

export const resolveToolCall = async (toolCall: any) => {
  const toolName = toolCall.function.name;
  let args = {};

  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch (e) {
    console.error('Failed to parse tool arguments:', e);
  }

  const toolConfig = db.prepare('SELECT * FROM ToolConfigs WHERE tool_name = ?').get(toolName) as { api_key: string, base_url: string } | undefined;

  if (!toolConfig) {
    return JSON.stringify({ error: `Tool ${toolName} not configured.` });
  }

  const apiKey = toolConfig.api_key;
  let baseUrl = toolConfig.base_url;

  try {
    let result;
    if (toolName === 'get_weather') {
      const location = encodeURIComponent((args as any).location || '');
      result = await axios.get(`${baseUrl}?q=${location}&appid=${apiKey}&units=metric`);
      return JSON.stringify(result.data);
    }
    else if (toolName === 'search_youtube') {
      const query = encodeURIComponent((args as any).query || '');
      result = await axios.get(`${baseUrl}/search?part=snippet&q=${query}&key=${apiKey}`);
      return JSON.stringify(result.data.items);
    }
    else {
      result = await axios.post(baseUrl, args, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      return JSON.stringify(result.data);
    }
  } catch (err: any) {
    return JSON.stringify({ error: `Tool execution failed: ${err.message}` });
  }
};

export const withToolInterceptor = async (executeAI: (body: any) => Promise<any>, body: any, depth = 0): Promise<any> => {
  if (depth > 5) throw new Error("Max tool execution depth reached");

  const response = await executeAI(body);
  const choice = response.choices?.[0];

  if (choice && choice.message && choice.message.tool_calls && choice.message.tool_calls.length > 0) {
    const toolCalls = choice.message.tool_calls;

    body.messages.push(choice.message);

    for (const toolCall of toolCalls) {
      console.log(`Executing tool: ${toolCall.function.name}`);
      const toolResultStr = await resolveToolCall(toolCall);

      body.messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: toolResultStr
      });
    }

    return withToolInterceptor(executeAI, body, depth + 1);
  }

  return response;
};
