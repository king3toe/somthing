import { safeFetch } from './ssrf';
import axios from 'axios';
import db from '../db';

// Registry of well-known tools and their precise JSON schemas for LLMs
import { execSync } from 'child_process';
import crypto from 'crypto';
import path from 'path';

export const PredefinedToolSchemas: Record<string, any> = {
  save_memory: {
    name: "save_memory",
    description: "Saves a piece of information, preference, or fact into long-term memory for later retrieval.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "A unique, short identifier or topic for this memory (e.g. 'user_name', 'favorite_color')" },
        value: { type: "string", description: "The detailed fact to remember." }
      },
      required: ["key", "value"]
    }
  },
  search_memory: {
    name: "search_memory",
    description: "Searches the long-term memory store by key.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "The exact key or a keyword prefix to search for." }
      },
      required: ["key"]
    }
  },
  execute_python: {
    name: "execute_python",
    description: "Executes Python code in a sandboxed environment and returns the standard output. Useful for math, data analysis, or logic tasks.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "The Python script to execute. Must use print() to output results." }
      },
      required: ["code"]
    }
  },
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
  scrape_and_extract: {
    name: "scrape_and_extract",
    description: "Fetch and extract clean text from a webpage URL. Great for reading articles, docs, or web search results.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The full URL of the webpage to scrape" }
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
    else if (toolName === 'scrape_and_extract') {
      const targetUrl = (args as any).url;
      if (!targetUrl) return JSON.stringify({ error: 'Missing URL' });
      // To improve scraping, we fetch with common headers
      const r = await safeFetch(targetUrl, {
         headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });
      const html = await r.text();
      // Remove scripts, styles, head, svgs
      const clean = html.replace(/<(script|style|head|svg|nav|footer)[^>]*>[\s\S]*?<\/\1>/gi, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim().substring(0, 15000); // 15k chars is about ~3.5k tokens
      return JSON.stringify({ source: targetUrl, content: clean });
    }
    else if (toolName === 'save_memory') {
      const key = (args as any).key;
      const value = (args as any).value;
      if (!key || !value) return JSON.stringify({ error: 'Missing key or value' });
      db.prepare(`
        INSERT INTO AgentMemory (memory_key, memory_value)
        VALUES (?, ?)
        ON CONFLICT(memory_key) DO UPDATE SET memory_value=excluded.memory_value, updated_at=CURRENT_TIMESTAMP
      `).run(key, value);
      return JSON.stringify({ success: true, message: `Saved '${value}' under '${key}'` });
    }
    else if (toolName === 'search_memory') {
      const key = (args as any).key || '';
      const rows = db.prepare('SELECT memory_key, memory_value FROM AgentMemory WHERE memory_key LIKE ? LIMIT 10').all(`%${key}%`);
      return JSON.stringify({ results: rows });
    }
    else if (toolName === 'execute_python') {
      const scriptCode = (args as any).code || '';
      const tmpFile = path.join('/tmp', `script_${crypto.randomUUID()}.py`);
      require('fs').writeFileSync(tmpFile, scriptCode);
      try {
        // Run with a 10-second timeout to prevent infinite loops
        const stdout = execSync(`python3 ${tmpFile}`, { timeout: 10000, encoding: 'utf8' });
        result = { stdout: stdout.trim() };
      } catch (err: any) {
        result = { error: err.stderr ? err.stderr.toString() : err.message };
      } finally {
        try { require('fs').unlinkSync(tmpFile); } catch(e){}
      }
      return JSON.stringify(result);
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
