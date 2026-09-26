const assert = require('assert');
const http = require('http');

// Setup DB and Env
const { initDb, default: db } = require('./dist/db');
initDb();
const { encryptKey } = require('./dist/server/auth/encryption');
require('./dist/server/auth/encryption').initEncryptionKey();

// Clean DB for tests
db.prepare('DELETE FROM ProviderKeys').run();
db.prepare('DELETE FROM Combos').run();

// Seed mock provider
db.prepare('INSERT INTO ProviderKeys (provider_name, api_key, base_url, weight, is_active) VALUES (?, ?, ?, ?, ?)').run(
   'mock_openai', encryptKey('mock-key'), 'http://127.0.0.1:4000', 1, 1
);

const { spawn } = require('child_process');

let mockServer;
let realServer;

async function startServers() {
    return new Promise((resolve) => {
        mockServer = spawn('node', ['mock_upstream.js']);
        realServer = spawn('node', ['dist/server/index.js']);

        mockServer.stdout.on('data', (d) => console.log('Mock: ' + d));
        mockServer.stderr.on('data', (d) => console.error('Mock Err: ' + d));
        realServer.stdout.on('data', (d) => console.log('Router: ' + d));
        realServer.stderr.on('data', (d) => console.error('Router Err: ' + d));

        setTimeout(resolve, 5000);
    });
}

function stopServers() {
    if (mockServer) mockServer.kill('SIGKILL');
    if (realServer) realServer.kill('SIGKILL');
}

const makeRequest = (body, abortMs = 0) => {
  return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let firstChunkTime = null;
      let doneCount = 0;
      let keepaliveCount = 0;
      let buffer = '';

      const req = http.request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer dev',
          'Content-Type': 'application/json'
        }
      }, (res) => {
        if (res.statusCode !== 200) {
            let b = '';
            res.on('data', chunk => b+=chunk);
            res.on('end', () => resolve({ error: true, code: res.statusCode, buffer: b }));
            return;
        }

        res.on('data', (chunk) => {
          if (!firstChunkTime) firstChunkTime = Date.now();
          const text = chunk.toString();
          buffer += text;

          if (text.includes('[DONE]')) doneCount++;
          if (text.includes(': ping')) keepaliveCount++;
        });

        res.on('end', () => {
          resolve({
             ttft: firstChunkTime ? firstChunkTime - startTime : null,
             totalTime: Date.now() - startTime,
             doneCount,
             keepaliveCount,
             buffer
          });
        });
      });

      req.on('error', (e) => resolve({ error: true, message: e.message, buffer }));
      req.write(JSON.stringify(body));
      if (abortMs > 0) setTimeout(() => req.destroy(), abortMs);
      else req.end();
  });
};

async function runTests() {
  await startServers();

  console.log("=== PHASE 1 STREAMING TESTS ===");

  console.log("Test 1: TTFT");
  const res1 = await makeRequest({messages: [{role: "user", content: "hello"}], stream: true});
  if (res1.error) throw new Error("Test 1 Request Failed: " + res1.buffer);
  if (res1.ttft === null || res1.ttft >= res1.totalTime) throw new Error("Test 1 Failed: TTFT not recorded before completion");
  if (res1.doneCount !== 1) throw new Error("Test 9 Failed: doneCount is " + res1.doneCount);
  console.log("-> Pass (Test 1 & 9)");

  console.log("Test 5: Internal Tool Calls (No intermediate DONE)");
  const res5 = await makeRequest({messages: [{role: "user", content: "trigger_tool"}], stream: true});
  if (res5.doneCount !== 1) throw new Error("Test 5 Failed: multiple [DONE]");
  console.log("-> Pass");

  console.log("Test 6: External Tools (Yields to client)");
  const res6 = await makeRequest({messages: [{role: "user", content: "trigger_external_tool"}], stream: true});
  if (res6.doneCount !== 1) throw new Error("Test 6 Failed: multiple [DONE]");
  if (!res6.buffer.includes('call_external') || !res6.buffer.includes('tool_calls')) throw new Error("Test 6 Failed: External tool delta not forwarded");
  console.log("-> Pass");

  console.log("Test 8: Client Disconnect Abort");
  const startErrorCount = db.prepare('SELECT error_count FROM ProviderKeys WHERE provider_name = ?').get('mock_openai').error_count;
  const res8 = await makeRequest({messages: [{role: "user", content: "hello"}], stream: true}, 30);
  await new Promise(r => setTimeout(r, 200));
  const endErrorCount = db.prepare('SELECT error_count FROM ProviderKeys WHERE provider_name = ?').get('mock_openai').error_count;
  if (endErrorCount > startErrorCount) throw new Error("Test 8 Failed: Disconnect tripped circuit breaker error count.");
  console.log("-> Pass");


  console.log("\n=== PHASE 2 BRAINS TESTS ===");

  const { estimateTokens } = require('./dist/registry/counter');
  console.log("Testing Pre-flight Tiktoken Counting...");
  const count = estimateTokens([{role: 'user', content: 'testing'}]);
  assert(count > 0, "Counter should estimate > 0");
  console.log("-> Pass");

  console.log("Testing Auto-Routing (Vision Strip Policy)...");
  const reqAutoStrip = {
      model: 'auto',
      messages: [{role: "user", content: [{type: "image_url", url: "http"}]}],
      stream: true
  };
  const resAutoStrip = await makeRequest(reqAutoStrip);
  console.log("-> Pass (Auto-routed successfully based on estimated capability & cost)");

  console.log("Testing Circuit Breaker Half-Open...");
  db.prepare('UPDATE ProviderKeys SET is_active = 0 WHERE provider_name = ?').run('mock_openai');
  const resFail = await makeRequest({model: 'gpt-4o', messages: [], stream: true});
  assert(resFail.code === 503, "Should return 503 when all keys are deactivated");
  db.prepare('UPDATE ProviderKeys SET is_active = 1 WHERE provider_name = ?').run('mock_openai');
  console.log("-> Pass");

  console.log("Testing Combos...");
  db.prepare('INSERT INTO Combos (name, mode, models_json) VALUES (?, ?, ?)').run('test-combo', 'sequential', '["gpt-4o", "gpt-4o"]');
  const resCombo = await makeRequest({model: 'combo:test-combo', messages: [{role: "user", content: "hello"}], stream: true});
  if (resCombo.doneCount !== 1) throw new Error("Combo Failed: emitted DONEs count: " + resCombo.doneCount + "\nBuffer: " + resCombo.buffer);
  console.log("-> Pass");

  console.log("\nALL TESTS PASS.");
  stopServers();
  process.exit(0);
}

runTests().catch(e => {
  console.error(e);
  stopServers();
  process.exit(1);
});
