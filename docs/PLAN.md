# EveryRoute - Omni-Router Architecture & Plan

## Overview
EveryRoute is a local-first, scalable API router designed to consolidate AI models and general-purpose APIs into a single, unified endpoint. It allows users to use one master API key to access multiple LLMs (OpenAI, Anthropic, etc.) and gives those LLMs automatic access to external tools (Weather, YouTube, etc.) via function calling.

## Goals
1.  **Unified API Gateway:** Provide a single endpoint (`/v1/chat/completions`) that routes requests to various providers based on the requested model or combo.
2.  **Tool Injection (General APIs):** Register non-AI APIs (like weather, search) as native tools so AI models can use them seamlessly.
3.  **Advanced Routing (Implemented Now):**
    *   **Combos/Fallbacks:** Automatically switch to a fallback model if the primary model fails or is unavailable.
    *   **Load Balancing:** Distribute requests across multiple API keys for the same provider to avoid rate limits.
    *   **Caching:** Cache identical requests to save costs and reduce latency.
    *   **Cost Tracking:** Detailed per-key, per-model, per-provider usage tracking.
4.  **Local Memory:** Maintain session history locally to provide conversational context without needing to send the entire history on every request (unless required by the model).
5.  **Dashboard UI:** A local web dashboard (similar to the provided screenshot) to manage providers, tools, combos, and view analytics.

## Directory Structure
```
everyRoute/
├── src/
│   ├── adapters/        # Provider-specific logic (OpenAI, Anthropic, Gemini, etc.)
│   ├── db/              # SQLite database initialization and schemas
│   ├── middleware/      # Tool interception, Memory injection, Routing logic
│   ├── public/          # Static assets for the dashboard UI (HTML, CSS, JS)
│   ├── server/          # Fastify server setup, API routes, and Router wildcard
├── docs/                # Architecture and Planning documents
│   └── PLAN.md
├── router.db            # Local SQLite database
├── package.json
└── tsconfig.json
```

## Current Implementation Status
- Basic routing (OpenAI, Anthropic) is implemented.
- Basic Tool interception is implemented.
- Basic Memory injection is implemented.
- Database schema exists for Keys, Providers, Tools, Combos, Cost, Memory, Configs.
- Fastify server is set up.

## Action Plan (To implement Advanced Features NOW)

### Phase 1: Enhance Database Schema
We need to update the database to support Load Balancing (multiple keys per provider) and Caching.
1.  **Update `ProviderConfigs`:** Change to allow multiple entries for the same provider, or create a `ProviderKeys` table. Let's create `ProviderKeys` to map `provider_name` -> `api_key`.
2.  **Create `Cache` table:** Store `request_hash`, `response`, `created_at`.

### Phase 2: Implement Caching Mechanism
1.  **Middleware/Cache:** Create a function to generate a deterministic hash of the request body (model, messages, tools).
2.  **Router update:** Before calling the provider adapter, check the cache. If a hit exists and is valid (e.g., < 24h old), return it immediately.

### Phase 3: Implement Load Balancing & Fallbacks (Combos)
1.  **Key Rotation:** When fetching a provider's key, select one randomly or via round-robin from `ProviderKeys`.
2.  **Router Update (Fallbacks):** Wrap the `executeAI` call in a `try...catch`. If it fails, check if the requested model is part of a Combo. If so, retry the request using the `fallback_model` and its corresponding provider.

### Phase 4: Enhance Tool Interception & General APIs
1.  Ensure the tool schema injection is robust enough to handle complex schemas if provided in the `ToolConfigs` database.
2.  Verify the dynamic execution of tools (Weather, YouTube) works correctly with the updated routing.

### Phase 5: Dashboard Updates (If necessary)
Ensure the API endpoints (`/api/providers`, `/api/combos`, etc.) support the new multi-key structures. (Note: For this initial sprint, we will focus on the backend routing logic).

## Execution Strategy
I will proceed with Phase 1, 2, and 3 immediately, as requested by the user ("do all and the fourth dont push it in the future iwill say lets do it in this time rather than future").
