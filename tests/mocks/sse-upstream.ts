const http = require('http');

// A simple mock upstream server that simulates an OpenAI SSE stream
const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const parsed = JSON.parse(body);
      const isToolCall = parsed.messages && parsed.messages[0]?.content?.includes('trigger_tool');
      const isExternalToolCall = parsed.messages && parsed.messages[0]?.content?.includes('trigger_external_tool');

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      // Delay to test TTFT
      setTimeout(() => {
        if (isExternalToolCall) {
            res.write('data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "id": "call_external", "function": {"name": "external_service", "arguments": "{}"}}]}}]}\n\n');
            setTimeout(() => {
               res.write('data: {"choices": [{"finish_reason": "tool_calls"}]}\n\n');
               res.write('data: {"usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}}\n\n');
               res.write("data: [DONE]\n\n");
               res.end();
            }, 50);
        } else if (isToolCall) {
            // First round: internal tool call
            if (parsed.messages.length === 1) {
                res.write('data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "id": "call_123", "function": {"name": "fetch_url", "arguments": "{\\"url\\": \\"http://127.0.0.1:4000\\"}"}}]}}]}\n\n');
                setTimeout(() => {
                   res.write('data: {"choices": [{"finish_reason": "tool_calls"}]}\n\n');
                   res.write('data: {"usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}}\n\n');
                   res.write("data: [DONE]\n\n");
                   res.end();
                }, 50);
            } else {
                // Second round: reply based on tool execution
                res.write('data: {"choices": [{"delta": {"content": "Tool output synthesized."}}]}\n\n');
                setTimeout(() => {
                   res.write('data: {"choices": [{"finish_reason": "stop"}]}\n\n');
                   res.write('data: {"usage": {"prompt_tokens": 15, "completion_tokens": 10, "total_tokens": 25}}\n\n');
                   res.write("data: [DONE]\n\n");
                   res.end();
                }, 50);
            }
        } else {
            res.write('data: {"choices": [{"delta": {"content": "Hello "}}]}\n\n');
            setTimeout(() => {
               res.write('data: {"choices": [{"delta": {"content": "World!"}}]}\n\n');
               res.write('data: {"choices": [{"finish_reason": "stop"}]}\n\n');
               res.write('data: {"usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7}}\n\n');
               res.write("data: [DONE]\n\n");
               res.end();
            }, 50);
        }
      }, 50);

    });
  } else if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Mock webpage content for tool fetch');
  }
});

server.listen(4000, '127.0.0.1', () => {
  console.log('Mock upstream listening on 4000');
});
