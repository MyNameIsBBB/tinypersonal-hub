# Dynamic Tool Retrieval

TinyPersonal Hub selects tools per request instead of exposing the complete registry to the model.

Flow:

1. The route determines the tools allowed by the authenticated user's capabilities.
2. `retrieveToolNames` searches metadata for only those allowed tools and returns at most five names.
3. `createAgentConfigForRequest` builds the request configuration with only the selected tool schemas.
4. If there is no relevant match, the model receives no tools.

`ToolSearchProvider` is the boundary for the retrieval index. Production currently uses the repository's local SQLite database through `backend-api`: tool descriptions are converted into 384-dimensional deterministic feature-hashing embeddings, stored in `ToolVector`, and ranked with cosine similarity. This needs no external embedding API or model download. The default in-memory `LocalToolSearchProvider` remains available for tests and database-free development. Authorization filtering remains application-owned before and after provider search.

To keep model context bounded, chat sends at most 32 recent messages or approximately 32,000 serialized characters, injects schedule records only when the schedule tool is selected, caps schedule context at 30 records, caps scraped text, and supplies at most five tool schemas.

`web.search` uses the self-hosted SearXNG container over its JSON endpoint. Docker Compose reaches it at `http://searxng:8080`; local non-container app runs default to `http://127.0.0.1:8080`. JSON output is explicitly enabled in `config/searxng/settings.yml`. The host port binds to loopback only and is not exposed to the LAN by default.

Tool metadata belongs in `toolCatalog`. Descriptions and keywords must not contain secrets or user records. Adding a tool requires adding its implementation to `toolRegistry`, retrieval metadata to `toolCatalog`, and permission coverage at the route boundary.
