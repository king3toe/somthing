import axios from 'axios';
import db from '../db';

// Registry of well-known tools and their precise JSON schemas for LLMs
export const PredefinedToolSchemas: Record<string, any> = {
  get_weather: {
    name: "get_weather",
    description: "Get the current weather for a specific location.",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "The city and state, e.g., San Francisco, CA" }
      },
      required: ["location"]
    }
  },
  search_youtube: {
    name: "search_youtube",
    description: "Search YouTube for videos matching a query.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" }
      },
      required: ["query"]
    }
  },
  web_search: {
    name: "web_search",
    description: "Perform a web search using a search engine like Serper or DuckDuckGo.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" }
      },
      required: ["query"]
    }
  },
  fetch_url: {
    name: "fetch_url",
    description: "Fetch the raw text content of a specific webpage URL.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The full URL of the webpage to fetch" }
      },
      required: ["url"]
    }
  }
};

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
      // Fallback to open-meteo if no API key (requires lat/lon mapping in a real app, but using standard base if provided)
      const targetUrl = baseUrl || 'https://api.openweathermap.org/data/2.5/weather';
      result = await axios.get(`${targetUrl}?q=${location}&appid=${apiKey}&units=metric`);
      return JSON.stringify({ description: result.data.weather?.[0]?.description, temp: result.data.main?.temp });
    }
    else if (toolName === 'search_youtube') {
      const query = encodeURIComponent((args as any).query || '');
      const targetUrl = baseUrl || 'https://www.googleapis.com/youtube/v3';
      result = await axios.get(`${targetUrl}/search?part=snippet&q=${query}&key=${apiKey}`);
      return JSON.stringify(result.data.items.map((i: any) => ({ title: i.snippet?.title, videoId: i.id?.videoId })));
    }
    else if (toolName === 'web_search') {
      // Example integration with Serper.dev
      const targetUrl = baseUrl || 'https://google.serper.dev/search';
      result = await axios.post(targetUrl, { q: (args as any).query }, {
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }
      });
      return JSON.stringify(result.data.organic?.map((o: any) => ({ title: o.title, link: o.link, snippet: o.snippet })) || result.data);
    }
    else if (toolName === 'fetch_url') {
      result = await axios.get((args as any).url);
      // extremely basic text extraction for demo purposes
      const html = result.data;
      const text = html.replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, '')
                       .replace(/<\/?\w(?:[^"'>]|"[^"]*"|'[^']*')*>/gmi, '')
                       .replace(/\s+/g, ' ')
                       .trim().substring(0, 5000); // truncate to avoid blowing up context
      return JSON.stringify({ content: text });
    }
    else {
      // General Generic API handler
      result = await axios.post(baseUrl, args, {
        headers: {
          'Authorization': apiKey ? `Bearer ${apiKey}` : '',
          'Content-Type': 'application/json'
        }
      });
      return typeof result.data === 'object' ? JSON.stringify(result.data) : String(result.data);
    }
  } catch (err: any) {
    console.error(`Error executing tool ${toolName}:`, err.message);
    const errorDetails = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    return JSON.stringify({ error: `Tool execution failed: ${errorDetails}` });
  }
};

export const withToolInterceptor = async (executeAI: (body: any) => Promise<any>, body: any, depth = 0): Promise<any> => {
  const MAX_DEPTH = 10; // Allow deeper agentic reasoning chains
  if (depth > MAX_DEPTH) {
    console.warn("Max tool execution depth reached. Forcing response.");
    return {
      choices: [{ message: { role: 'assistant', content: 'I have reached my maximum thinking steps and must stop. Here is what I know so far based on my tool usage.' } }]
    };
  }

  const response = await executeAI(body);
  const choice = response.choices?.[0];

  if (choice && choice.message && choice.message.tool_calls && choice.message.tool_calls.length > 0) {
    const toolCalls = choice.message.tool_calls;

    body.messages.push(choice.message);

    // Advanced Agentic Skills: Execute all tools in parallel if requested by the LLM
    const toolPromises = toolCalls.map(async (toolCall: any) => {
      console.log(`[Agentic Skill] Executing step ${depth}, Tool: ${toolCall.function.name}`);
      const toolResultStr = await resolveToolCall(toolCall);
      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: toolResultStr
      };
    });

    const toolResults = await Promise.all(toolPromises);

    // Append all results to context
    for (const res of toolResults) {
      body.messages.push(res);
    }

    // Agent autonomously evaluates and chains next steps
    return withToolInterceptor(executeAI, body, depth + 1);
  }

  return response;
};
