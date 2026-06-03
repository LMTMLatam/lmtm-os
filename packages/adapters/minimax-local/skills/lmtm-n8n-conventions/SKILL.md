---
name: lmtm-n8n-conventions
displayName: n8n MCP Conventions (LMTM)
description: How LMTM-OS agents should interact with the agency's n8n instance through the lmtm-n8n plugin. The MCP server exposes the n8n Workflow SDK, so agents can search, execute, test, build, and manage n8n workflows programmatically.
keywords: n8n, workflow, mcp, automation, sdk
---

# n8n MCP Conventions — LMTM-OS

The LMTM agency has a self-hosted n8n instance at
`https://lmtmlatam.app.n8n.cloud/` (Cloud, n8n 2.21+). The instance
exposes an **MCP server at `https://lmtmlatam.app.n8n.cloud/mcp-server/http`**
using the Streamable HTTP transport + JSON-RPC 2.0. Auth: Bearer access
token. The plugin reads it from `N8N_MCP_URL` + `N8N_MCP_TOKEN`.

## What the server actually exposes

The MCP server is the **n8n Workflow SDK bridge**, NOT a flat "call my
existing workflow" gateway. There are 25 tools in three groups:

### A. Workflow execution & management (10 tools)
Read and operate on workflows the user has already built in n8n.
- `search_workflows` (read) — list workflows, filter by name/description/project
- `get_workflow_details` (read) — full structure of one workflow
- `execute_workflow` (destructive) — run a workflow by ID; returns execution ID
- `get_execution` (read) — fetch one execution's metadata + optional node data
- `search_executions` (read) — paginated history of executions
- `publish_workflow` (destructive, idempotent) — activate / publish a draft
- `unpublish_workflow` (destructive, idempotent) — deactivate
- `prepare_test_pin_data` (read) — get the pin-data shape for testing
- `test_workflow` (destructive) — test a workflow with pinned data
- `archive_workflow` (destructive) — soft-delete a workflow

### B. Credentials & data tables (8 tools)
- `list_credentials` (read) — see available credentials (no secrets returned)
- `search_data_tables` (read)
- `create_data_table` (write)
- `rename_data_table` (write)
- `add_data_table_column` (write)
- `delete_data_table_column` (destructive)
- `rename_data_table_column` (write)
- `add_data_table_rows` (write, max 1000/call)

### C. Workflow SDK — build new workflows programmatically (7 tools)
Required sequence when building a workflow from scratch:
1. `get_sdk_reference` (read) — get the Workflow SDK syntax reference. **Always call this first.** Sections: `patterns`, `patterns_detailed`, `expressions`, `functions`, `rules`, `import`, `guidelines`, `design`, `all`.
2. `get_suggested_nodes` (read) — curated recommendations by technique category (`chatbot`, `notification`, `scheduling`, `data_transformation`, `data_persistence`, `data_extraction`, `document_processing`, `form_input`, `content_generation`, `triage`, `scraping_and_research`).
3. `search_nodes` (read) — find node IDs and discriminators by service name.
4. `get_node_types` (read) — get the **exact** TypeScript parameter definitions for the chosen nodes. **Never guess parameter names** — this is the most common cause of invalid workflows.
5. `validate_workflow` (read) — validate SDK code before saving.
6. `create_workflow_from_code` (write) — save the validated code.
7. `update_workflow` (destructive) — replace the code of an existing workflow.

## Three tools the plugin exposes

The `lmtm-n8n` plugin is intentionally minimal. It exposes exactly
three tools (all namespaced as `lmtm-n8n__*` at runtime):

| Tool name | When to use |
|---|---|
| `lmtm-n8n__n8n-ping` | Verify connectivity + auth. Performs the JSON-RPC `initialize` handshake. Returns the server's name (`n8n MCP Server`) and version. Call this first whenever a downstream tool returns an auth/timeout error. |
| `lmtm-n8n__n8n-list-tools` | Discover the **25 SDK tools** the n8n MCP server exposes. Returns `{count, cached, tools: [{name, description, inputSchema}]}`. Cached for 60s; pass `refresh: true` to bypass. **This returns the SDK tool catalog, not a list of user workflows.** |
| `lmtm-n8n__n8n-call-tool` | Invoke any of the 25 SDK tools by name with its arguments. The `toolName` you pass here is one of the SDK tool names (e.g. `search_workflows`, `execute_workflow`, `create_workflow_from_code`). |

User workflows ("Leads unificados", "Main Dashboard Visualization",
etc.) are **not** directly exposed as their own tools. You reach them
by calling `n8n-call-tool` → `search_workflows` first to get the
workflow ID, then `n8n-call-tool` → `execute_workflow` with that ID.

## Standard patterns

### Pattern 1 — Read data from an existing workflow

```
1. lmtm-n8n__n8n-ping                          # verify auth
2. lmtm-n8n__n8n-call-tool
   { toolName: "search_workflows",
     arguments: { query: "leads" } }           # find the workflow
3. lmtm-n8n__n8n-call-tool
   { toolName: "execute_workflow",
     arguments: { workflowId: "CHTON...",
                  executionMode: "production" } }   # returns executionId
4. lmtm-n8n__n8n-call-tool
   { toolName: "get_execution",
     arguments: { workflowId: "CHTON...",
                  executionId: "...",
                  includeData: true } }         # get the actual result
```

Note: `execute_workflow` returns the executionId **immediately**, not
the result. You almost always need a follow-up `get_execution` call.

### Pattern 2 — Build a new workflow programmatically

```
1. lmtm-n8n__n8n-call-tool
   { toolName: "get_sdk_reference",
     arguments: { section: "patterns" } }
2. lmtm-n8n__n8n-call-tool
   { toolName: "get_suggested_nodes",
     arguments: { categories: ["scheduling"] } }
3. lmtm-n8n__n8n-call-tool
   { toolName: "search_nodes",
     arguments: { queries: ["gmail", "slack", "schedule trigger"] } }
4. lmtm-n8n__n8n-call-tool
   { toolName: "get_node_types",
     arguments: { nodeIds: [...] } }           # get exact param shapes
5. lmtm-n8n__n8n-call-tool
   { toolName: "validate_workflow",
     arguments: { code: "..." } }              # fix until valid=true
6. lmtm-n8n__n8n-call-tool
   { toolName: "create_workflow_from_code",
     arguments: { code: "...", name: "...", description: "..." } }
```

### Pattern 3 — Find and read existing data tables

```
1. lmtm-n8n__n8n-call-tool
   { toolName: "search_data_tables",
     arguments: { query: "leads", limit: 20 } }
2. (Use the returned tableId for follow-up reads/writes)
```

## Error handling

| Error shape | What it means | What to do |
|---|---|---|
| `code: "timeout"` | n8n MCP call took longer than the timeout | Retry once with `timeoutMs: 90000`. If it still times out, escalate to operator — the SDK call may be slow. |
| `code: "http_401"` / `"http_403"` | Access token rejected | Do NOT retry. Surface to operator via board comment. Token rotation is a manual operator task in n8n. |
| `code: "http_404"` | The SDK tool name doesn't exist | Call `n8n-list-tools` with `refresh: true` to re-fetch the tool list. |
| `code: "network_error"` | n8n is down or unreachable | Retry once after 10s. If still failing, escalate. |
| SDK `result.structuredContent.error` | The SDK call failed at the n8n level (workflow not found, permission denied, etc.) | Read the error message — n8n often includes a `hint` field with the recovery action. |
| SDK `result.content[].text` contains `"valid": false` (from `validate_workflow`) | Your code is wrong | Read the `errors[]` and `hint` fields. Re-read `get_sdk_reference` if needed. |

## Known workflows in this n8n instance (sample, 2026-06-03)

There are 65 workflows. Examples returned by `search_workflows`:

| Workflow | ID | Active | Purpose |
|---|---|---|---|
| `Generate and Publish Carousels for TikTok and Instagram with GPT-Image-1` | `CHTONwTiyIGUE28w` | ❌ | Carousel generation |
| `Flujo del informe de campaña por Creative Grouping` | `vRD19Ok3uasrsLdM` | ❌ | Meta campaign report by creative |
| `Flujo de informes de meta campaña por agrupación de etiquetas de nombre` | `iBN0o5Ne9IRBdKDT` | ❌ | Meta campaign report by name tag |
| `Flujo de obtención de datos de meta por parte del agente de IA` | `3FFHT8reo4b1cVNz` | ❌ | Meta data fetch by AI agent |
| `Flujo para consultar el saldo de Meta` | `Xw7Nk92SdD2sSrYd` | ❌ | Meta balance query |
| `Flujo de resumen del grupo` | `4YeEYLMrASHsoBTb` | ❌ | Group summary |
| `Flujo del informe de campaña en meta` | `5phiYudsmyrdQGBq` | ❌ | Meta campaign report |
| `flujo de informes de campañas de Google` | `sZZvBIZ58VAaS045` | ❌ | Google campaign report |
| `Flujo de búsqueda de palabras clave en grupos de WhatsApp` | `BW28ZnWMvoU4hLRb` | ✅ | WhatsApp group keyword search |
| `Flujo de creación automática de videos` | `UWR7jMimnZfaBsrb` | ❌ | Auto video creation |

Plus the two from the screenshot: `Leads unificados` (SKYGARDEN) and
`Main Dashboard Visualization` (Dashboard). To get their IDs, call
`n8n-call-tool` → `search_workflows` with `query: "leads"` and
`query: "dashboard"`. Do not hardcode IDs — they change.

## When to escalate vs. handle autonomously

You can call any n8n tool autonomously if:
- The tool is read-only (anything in group A or C whose annotation
  says `readOnlyHint: true`), AND
- The result is for internal LMTM use (not shown directly to an end
  client without review).

You must surface a board comment and ask the operator before calling
if:
- The tool is destructive (annotations say `destructiveHint: true`):
  `execute_workflow`, `test_workflow`, `archive_workflow`,
  `delete_data_table_column`, `update_workflow`, `publish_workflow`,
  `unpublish_workflow`, OR
- The tool creates persistent state: `create_data_table`,
  `add_data_table_column`, `add_data_table_rows`, `rename_*`,
  `create_workflow_from_code`.

A clean pattern for "needs review" is to call `search_workflows` /
`get_workflow_details` first to surface what's there, then ASK the
operator before calling the destructive variant.

## Do NOT

- **Do NOT** call the n8n REST API directly. Always go through the
  `lmtm-n8n` plugin. This keeps auth, audit logging, and rate limiting
  in one place.
- **Do NOT** hardcode workflow IDs in your long-term memory. Look them
  up via `n8n-call-tool` → `search_workflows` every time.
- **Do NOT** pass the access token to n8n in any user-facing message.
  It never leaves the plugin worker.
- **Do NOT** retry more than twice on the same error.
- **Do NOT** write workflow code from memory — always call
  `get_sdk_reference` and `get_node_types` first. Guessing parameter
  names is the #1 cause of broken workflows.

## Cross-references

- ClickUp is the LMTM canonical system of record for **tasks** (PM).
  n8n is the orchestrator for **cross-app automations** (e.g. "when a
  new ClickUp task is created in a high-priority list, post a Slack
  message"). If you only need to read/write tasks, use the
  `lmtm-clickup` plugin instead.
- For paid-media data, use the `lmtm-ads-tools` plugin (planned) or
  the `ads/...` REST endpoints. n8n is not the source of truth for
  ad metrics.
- For the actual workflow YAML/code, you can also call
  `get_workflow_details` to read the structure of any existing
  workflow before deciding whether to `update_workflow` it.
