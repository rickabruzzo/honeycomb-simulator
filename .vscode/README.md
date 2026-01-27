# VSCode MCP Configuration

This directory contains configuration for Model Context Protocol (MCP) servers used with Claude Code.

## Setup

1. Copy `mcp.json.example` to `mcp.json`:
   ```bash
   cp .vscode/mcp.json.example .vscode/mcp.json
   ```

2. Edit `mcp.json` and replace `your-honeycomb-api-key-here` with your actual Honeycomb API key:
   - Find your API key in your `.env.local` file (look for `OTEL_EXPORTER_OTLP_HEADERS`)
   - Or get it from Honeycomb UI: Account Settings → API Keys

3. The `mcp.json` file is gitignored to prevent accidentally committing your API key.

## Honeycomb MCP

The Honeycomb MCP server allows Claude Code to query your Honeycomb telemetry data directly.

### Usage in Claude Code

Once configured, you can ask Claude to query Honeycomb data:

```
Using Honeycomb MCP, analyze hc.event.message events and tell me:
• average duration_ms
• p95 duration_ms
• grouped by chat_provider for the last week
```

### Verify Connection

Check if the MCP server is connected:

```bash
claude mcp list
```

You should see:
```
honeycomb: https://mcp.honeycomb.io/mcp (HTTP) - ✓ Connected
```
