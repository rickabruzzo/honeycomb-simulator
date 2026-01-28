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

## Cleanup Duplicates Endpoint

The `/api/admin/cleanup` endpoint allows authorized users to clean up duplicate personas and old conferences.

### What Gets Archived

The cleanup endpoint archives:
1. **Duplicate Personas** - Old scenario-labeled personas (e.g., "Platform Engineer (Scenario A)")
2. **Old Conferences** - Standalone "KubeCon" conference (replaced by "KubeCon + CloudNativeCon")

**Required Authentication:**
Same as other admin endpoints - requires `x-admin-reset-token` header.

**Usage:**
```bash
curl -X POST https://your-app.vercel.app/api/admin/cleanup \
  -H "x-admin-reset-token: your-secure-random-token-here"
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Cleanup completed successfully",
  "archived": {
    "personas": 8,
    "conferences": 1
  }
}
```

This endpoint uses soft deletion (sets `isArchived: true`) rather than hard deletion, so records can be recovered if needed.

## Cleanup Trainees Endpoint

The `/api/admin/cleanup-trainees` endpoint resets the trainees list to only contain the default demo trainees (Rick Abruzzo and Maggie Ennis). All other trainees are archived.

### Purpose

Use this endpoint to:
- Clean up test trainees after demos or workshops
- Reset to baseline state for new training sessions
- Remove trainees created during development/testing

### Safety Features

- **Requires Authentication:** Must include `x-admin-reset-token` header matching `ADMIN_RESET_TOKEN` env var
- **Production Safety:** In production (`VERCEL_ENV=production`), requires `ALLOW_ADMIN_RESET=true` to be set
- **Soft Deletes:** Archives trainees (sets `isArchived: true`) - no permanent data loss
- **Idempotent:** Safe to run multiple times - creates Rick and Maggie if missing
- **Cache Invalidation:** Automatically invalidates bootstrap cache so changes appear immediately

### Usage

**Dry Run (Preview Changes):**
```bash
# Local - see what would be archived without making changes
curl -X POST "http://localhost:3000/api/admin/cleanup-trainees?dryRun=true" \
  -H "x-admin-reset-token: dev-reset-token"

# Production
curl -X POST "https://honeycomb-simulator.vercel.app/api/admin/cleanup-trainees?dryRun=true" \
  -H "x-admin-reset-token: $ADMIN_RESET_TOKEN"
```

**Actual Cleanup:**
```bash
# Local Development
curl -X POST http://localhost:3000/api/admin/cleanup-trainees \
  -H "x-admin-reset-token: dev-reset-token"

# Production
curl -X POST https://honeycomb-simulator.vercel.app/api/admin/cleanup-trainees \
  -H "x-admin-reset-token: $ADMIN_RESET_TOKEN"
```

### Response

**Success (Actual Cleanup):**
```json
{
  "success": true,
  "kept": [
    { "id": "rick-abruzzo-xyz", "name": "Rick Abruzzo" },
    { "id": "maggie-ennis-abc", "name": "Maggie Ennis" }
  ],
  "archivedCount": 15,
  "createdCount": 0,
  "total": 17,
  "dryRun": false
}
```

**Success (Dry Run):**
```json
{
  "success": true,
  "kept": [
    { "id": "rick-abruzzo-xyz", "name": "Rick Abruzzo" },
    { "id": "maggie-ennis-abc", "name": "Maggie Ennis" }
  ],
  "toArchive": [
    { "id": "test-person-xyz", "name": "Test Person" },
    { "id": "another-user-abc", "name": "Another User" }
  ],
  "archivedCount": 15,
  "createdCount": 0,
  "total": 17,
  "dryRun": true
}
```

**Fields:**
- `kept`: Array of trainees that were kept (Rick and Maggie)
- `toArchive`: Array of trainees that would be archived (only in dry run)
- `archivedCount`: Number of trainees that were archived (or would be in dry run)
- `createdCount`: Number of trainees that were created (if Rick/Maggie didn't exist)
- `total`: Total number of trainees processed (non-archived only)
- `dryRun`: Boolean indicating if this was a dry run

**Error Responses:**

Missing/Invalid Token (401):
```json
{
  "error": "Unauthorized - invalid or missing x-admin-reset-token"
}
```

Production Safety Block (403):
```json
{
  "error": "Admin reset disabled in production (ALLOW_ADMIN_RESET not true)",
  "hint": "Set ALLOW_ADMIN_RESET=true env var to enable"
}
```

### Acceptance Criteria

✅ **Correct Archive Count:** `archivedCount` should equal `total - 2` (all trainees except Rick and Maggie)

✅ **Only Rick and Maggie Remain:** `/api/trainees` returns only Rick Abruzzo and Maggie Ennis

✅ **Idempotent:** Re-running returns `archivedCount: 0` on second run (no trainees left to archive)

✅ **Soft Delete:** Uses `isArchived: true` (no permanent deletion)

✅ **Dry Run Safe:** `?dryRun=true` shows preview without making changes

### Verification

After running cleanup, verify the results:

```bash
# Check trainees list (API)
curl -s http://localhost:3000/api/trainees | jq '.trainees[] | "\(.firstName) \(.lastName)"'

# Check bootstrap (what Scenario Builder sees)
curl -s "http://localhost:3000/api/bootstrap?ts=$(date +%s)" | jq '.trainees[] | "\(.firstName) \(.lastName)"'
```

Both should return only:
```
"Rick Abruzzo"
"Maggie Ennis"
```

Or in production:
```bash
# Check production trainees
curl -s https://honeycomb-simulator.vercel.app/api/trainees | jq '.trainees[] | "\(.firstName) \(.lastName)"'
```

### Production Checklist

Before running in production:

1. **Backup:** Ensure KV data is backed up (Upstash dashboard)
2. **Token:** Verify `ADMIN_RESET_TOKEN` is set securely in Vercel env vars
3. **Enable:** Set `ALLOW_ADMIN_RESET=true` in Vercel env vars
4. **Deploy:** Redeploy to pick up new env vars (if just added)
5. **Execute:** Run the cleanup command with correct token
6. **Verify:** Check trainees in UI and via API endpoints
7. **Cleanup:** Remove `ALLOW_ADMIN_RESET=true` after operation

## Archive Trainees by Name

The `/api/admin/archive-trainees-by-name` endpoint allows bulk archiving specific trainees by name.

**Note:** This is a legacy endpoint that does NOT require admin token authentication. For production cleanup, prefer `/api/admin/cleanup-trainees`.

**Usage:**
```bash
curl -X POST http://localhost:3000/api/admin/archive-trainees-by-name \
  -H "Content-Type: application/json" \
  -d '{"names": ["Test Person", "Another User", "Demo Trainee"]}'
```

**Response:**
```json
{
  "archivedCount": 2,
  "archivedIds": ["test-person-xyz", "another-user-abc"],
  "notFound": ["Demo Trainee"]
}
```

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
