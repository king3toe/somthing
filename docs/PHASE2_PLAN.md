# Phase 2: Brains - EveryRoute AI Gateway

With Phase 1 (Trust and Streaming loops) fully completed, this phase will focus on intelligent, cost-aware dynamic routing and robust provider abstractions.

## Key Features

1. **Model Capability Registry**
   - Normalize capabilities (Vision, Tools, JSON mode) across Anthropic, OpenAI, and Gemini.
   - Example: A user requests `gpt-4o` with `image_url` but the provider key is failing. Gateway seamlessly falls back to `claude-3-5-sonnet` and handles the image translation block.

2. **Cost-Aware Auto-Routing**
   - Dynamic selection based on TTFT and cost per token.
   - If model A costs $5/M but latency is 300ms, and model B costs $15/M but latency is 200ms, we can route based on the `x-everyroute-priority` header (latency vs cost).

3. **Circuit Breakers**
   - Automatically pull provider keys out of the active rotation if they throw 5xx errors or exceed rate limits.
   - Resurrect keys after a cooldown period via a background worker (or lazy evaluation).

4. **Multi-Model Orchestration (MoA / Combos)**
   - Allow a single request to explicitly chain multiple models together (e.g. `primary_model` -> `fallback_model` or `Draft (Haiku)` -> `Review (GPT-4o)`).
   - Leverage the newly built asynchronous `stream_coordinator` iterative loop to feed outputs back into upstream adapters seamlessly.
