export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export type StreamEvent =
  | { type: "content"; text: string }
  | { type: "tool_delta"; index: number; id?: string; name?: string; arguments?: string }
  | { type: "usage"; usage: Usage }
  | { type: "finish"; reason: string | null }
  | { type: "error"; error: Error }
  | { type: "ping" };

export interface AdapterRequest {
  messages: any[];
  model?: string;
  tools?: any[];
  signal?: AbortSignal;
  [key: string]: any;
}