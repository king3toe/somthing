import db from '../db';

export const injectMemory = (sessionId: string | undefined, messages: any[]) => {
  if (!sessionId) return messages;

  // Fetch last 10 messages from this session
  const history = db.prepare('SELECT role, content FROM Memory WHERE session_id = ? ORDER BY created_at DESC LIMIT 10').all(sessionId) as { role: string, content: string }[];

  if (history.length === 0) return messages;

  // Reverse to chronological order
  history.reverse();

  // Inject history before the current messages
  return [...history, ...messages];
};

export const saveMemory = (sessionId: string | undefined, messages: any[], responseMessage: any) => {
  if (!sessionId) return;

  const insertStmt = db.prepare('INSERT INTO Memory (session_id, role, content) VALUES (?, ?, ?)');

  // Save the last user message
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  if (lastUserMessage) {
    insertStmt.run(sessionId, 'user', lastUserMessage.content);
  }

  // Save the assistant response
  if (responseMessage && responseMessage.content) {
    insertStmt.run(sessionId, 'assistant', responseMessage.content);
  }
};
