import { get_encoding } from 'tiktoken';

export function estimateTokens(messages: any[], model: string = "gpt-4o"): number {
  try {
     // fallback to cl100k_base which is a decent generic estimator
     const enc = get_encoding("cl100k_base");
     let tokens = 0;

     for (const msg of messages) {
        tokens += 4; // overhead per msg
        if (typeof msg.content === 'string') {
            tokens += enc.encode(msg.content).length;
        } else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
               if (block.type === 'text' && block.text) {
                  tokens += enc.encode(block.text).length;
               } else if (block.type === 'image_url') {
                  // VERY rough estimation for vision: 85 tokens base + 170 per tile. Average ~300.
                  tokens += 300;
               }
            }
        }
     }
     tokens += 3; // final overhead
     enc.free();
     return tokens;
  } catch (e) {
     return 0; // fallback gracefully
  }
}
