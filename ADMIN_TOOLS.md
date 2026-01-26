# Admin Tools

This document describes administrative endpoints and tools for managing the Honeycomb Simulator.

## Demo Reset Endpoint

The `/api/admin/reset-demo` endpoint allows authorized users to clear all demo data and return the application to a fresh state.

### What Gets Deleted

The reset endpoint clears:
1. **Invites** - All invite tokens and the invite index
2. **Sessions** - All session data referenced by invites
3. **Scores** - All score records and the score index
4. **Leaderboard** - The leaderboard index (same as score index)

### Security

This endpoint requires authentication via the `x-admin-reset-token` header.

**Required Environment Variables:**
```bash
ADMIN_RESET_TOKEN=your-secure-random-token-here
```

**Optional Environment Variables:**
```bash
# Allow reset in production (default: false)
ALLOW_ADMIN_RESET=true
```

By default, the endpoint will not work in production (`VERCEL_ENV=production`) unless `ALLOW_ADMIN_RESET=true` is explicitly set.

### Usage

**Using curl:**
```bash
curl -X POST https://your-app.vercel.app/api/admin/reset-demo \
  -H "x-admin-reset-token: your-secure-random-token-here"
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Demo state reset successfully",
  "deleted": {
    "invites": 15,
    "sessions": 15,
    "scores": 12
  }
}
```

**Response (Unauthorized):**
```json
{
  "error": "Unauthorized: Invalid or missing admin token"
}
```

**Response (Production Block):**
```json
{
  "error": "Reset not allowed in production. Set ALLOW_ADMIN_RESET=true to override."
}
```

### Development Usage

For local development:

1. Set your admin token in `.env.local`:
   ```bash
   ADMIN_RESET_TOKEN=dev-reset-token-123
   ```

2. Run the reset:
   ```bash
   curl -X POST http://localhost:3000/api/admin/reset-demo \
     -H "x-admin-reset-token: dev-reset-token-123"
   ```

### Warning

**This operation is destructive and cannot be undone.** All invites, sessions, scores, and leaderboard entries will be permanently deleted from the KV store.

## Scenario Preset Seeding

The application automatically seeds preset conferences and personas for scenarios A-F on first access.

### Conferences

The following conferences are automatically created if they don't exist:
- **SREcon** - SLOs, Incident response, Reducing toil
- **AWS re:Invent** - Cloud migration, Microservices, Customer experience, Scaling architecture
- **KubeCon** - Datadog cost pressure, Growing microservices, Platform engineering
- **KubeCon + CloudNativeCon** - OpenTelemetry, Developer experience, Debugging
- **QCon EMEA** - Distributed systems, Engineering leadership, Scaling startups

### Scenario Personas

The following personas are automatically created if they don't exist:
- **Platform Engineer (Scenario A)** - KubeCon, Datadog cost pressure, Starting OTel
- **Site Reliability Engineer (Scenario B)** - SREcon, On-call war story, OSS-first, Aware OTel
- **Senior Fullstack Developer (Scenario C)** - KubeCon + CloudNativeCon, Backend traces exist, Starting OTel
- **Director of Engineering (Scenario D)** - AWS re:Invent, Migrating monolith, Aware OTel
- **Technical Buyer (Scenario E)** - AWS re:Invent, Legacy tooling slows delivery, Considering OTel
- **CTO (Startup) (Scenario F)** - QCon EMEA, Greenfield decisions, Strong OSS bias, Considering OTel

### Idempotency

Seeding is **idempotent** - running it multiple times will not create duplicates. The system checks for existing records by normalized name (case-insensitive, whitespace-collapsed) before creating new entries.

### Manual Seeding

Seeding happens automatically when:
- First GET request to `/api/conferences` (seeds conferences)
- First GET request to `/api/personas` (seeds personas + scenario presets)

You can trigger seeding manually by making these API requests:
```bash
# Seed conferences
curl http://localhost:3000/api/conferences

# Seed personas + scenario presets
curl http://localhost:3000/api/personas
```

### Admin Seed Endpoint

The `/api/admin/seed-presets` endpoint allows authorized users to manually trigger seeding of scenario preset data.

**Required Authentication:**
Same as reset endpoint - requires `x-admin-reset-token` header.

**Usage:**
```bash
curl -X POST https://your-app.vercel.app/api/admin/seed-presets \
  -H "x-admin-reset-token: your-secure-random-token-here"
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Scenario presets seeded successfully (skipped existing records)"
}
```

This endpoint is idempotent and safe to run multiple times.

## Generating Admin Tokens

To generate a secure admin reset token, use one of these methods:

**Using Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Using OpenSSL:**
```bash
openssl rand -hex 32
```

**Using Python:**
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Store the generated token in your environment variables and keep it secure.
