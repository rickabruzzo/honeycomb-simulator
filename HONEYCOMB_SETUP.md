# Honeycomb OpenTelemetry Setup

This application is instrumented with OpenTelemetry and configured to send traces **only from Vercel Production** to Honeycomb.

## Environment-Based Tracing

| Environment | VERCEL_ENV | Traces Exported? |
|------------|-----------|------------------|
| Local development (`npm run dev`) | undefined | ❌ No |
| Vercel Preview deployments | `preview` | ❌ No |
| Vercel Production deployment | `production` | ✅ Yes |

The instrumentation code (`tracing.js`) automatically detects the environment and only enables trace export in production.

## Vercel Production Configuration

### Required Environment Variables

Set these **ONLY in Vercel Production** environment:

1. Go to your Vercel project settings
2. Navigate to: **Settings → Environment Variables**
3. Add the following variables with scope **Production only**:

```env
OTEL_SERVICE_NAME=honeycomb-simulator
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io
OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=YOUR_API_KEY,x-honeycomb-dataset=honeycomb-simulator
```

### Step-by-Step Vercel Configuration

1. **Navigate to Environment Variables:**
   - Vercel Dashboard → Your Project → Settings → Environment Variables

2. **Add each variable:**
   - Click "Add New"
   - Enter variable name and value
   - **IMPORTANT:** Select **Production** checkbox ONLY (uncheck Preview and Development)
   - Click "Save"

3. **Required Variables:**

   **OTEL_SERVICE_NAME**
   - Value: `honeycomb-simulator`
   - Scope: ☑ Production only

   **OTEL_EXPORTER_OTLP_PROTOCOL**
   - Value: `http/protobuf`
   - Scope: ☑ Production only

   **OTEL_EXPORTER_OTLP_ENDPOINT**
   - Value: `https://api.honeycomb.io`
   - Scope: ☑ Production only

   **OTEL_EXPORTER_OTLP_HEADERS**
   - Value: `x-honeycomb-team=YOUR_HONEYCOMB_API_KEY,x-honeycomb-dataset=honeycomb-simulator`
   - Scope: ☑ Production only
   - Replace `YOUR_HONEYCOMB_API_KEY` with your actual Honeycomb API key

4. **Redeploy:**
   - After adding variables, trigger a new production deployment
   - Or use: `vercel --prod`

## Local Development

**Do NOT set OTEL_* variables in `.env.local`**

The application will:
- ✅ Still instrument code (for consistency)
- ❌ NOT export traces to Honeycomb
- 📝 Log: `[OpenTelemetry] ○ Tracing instrumented but NOT exporting (local/preview)`

This keeps your local development fast and avoids cluttering Honeycomb with test data.

## Vercel Preview Deployments

Preview deployments (pull requests) will:
- ✅ Still instrument code
- ❌ NOT export traces to Honeycomb
- 📝 Log: `[OpenTelemetry] ○ Tracing instrumented but NOT exporting (local/preview)`

This keeps preview environments clean and avoids duplicate/test data in Honeycomb.

## Verification Checklist

### Local Development
```bash
npm run dev
```

**Expected:**
- Server starts normally
- Console shows: `[OpenTelemetry] ○ Tracing instrumented but NOT exporting (local/preview)`
- No traces appear in Honeycomb when browsing http://localhost:3000

### Vercel Preview
1. Create a PR and deploy preview
2. Check deployment logs
3. **Expected:** Console shows: `[OpenTelemetry] ○ Tracing instrumented but NOT exporting (local/preview)`
4. Browse preview URL - no traces should appear in Honeycomb

### Vercel Production
1. Deploy to production
2. Check deployment logs
3. **Expected:** Console shows: `[OpenTelemetry] ✓ Tracing enabled - exporting to Honeycomb`
4. Browse production URL
5. **Expected:** Traces appear in Honeycomb dashboard under `honeycomb-simulator` dataset

## Troubleshooting

### No traces in production

**Check environment variables:**
```bash
vercel env ls
```

Ensure OTEL_* variables are set for Production scope only.

**Check logs:**
Look for: `[OpenTelemetry] ✓ Tracing enabled - exporting to Honeycomb`

If you see: `[OpenTelemetry] ○ Tracing instrumented but NOT exporting`
→ VERCEL_ENV is not set to `production`

### Traces appearing in local dev

**Check .env.local:**
Remove any OTEL_* variables from `.env.local`

**Check console:**
Should show: `VERCEL_ENV: undefined, exporting: false`

### Vercel environment variable scopes

In Vercel UI, when adding environment variables:
- ☑ **Production** - Enable for production only
- ☐ **Preview** - Leave disabled
- ☐ **Development** - Leave disabled

## Architecture

### Files

- **`tracing.js`** - OpenTelemetry SDK initialization with environment gating
- **`instrumentation.ts`** - Next.js instrumentation hook that loads tracing.js

### How It Works

1. Next.js calls `instrumentation.ts` `register()` on server startup
2. `register()` imports `tracing.js` (Node.js runtime only)
3. `tracing.js` checks `process.env.VERCEL_ENV`
4. If `production`: Creates `OTLPTraceExporter` and starts SDK
5. If not `production`: Starts SDK without exporter (instrumentation only)
6. Logs environment and export status to console

### Why Instrument Without Export?

Even in local/preview, we keep instrumentation active because:
- Maintains consistent code paths across environments
- Ensures production code is tested with instrumentation overhead
- Prevents "works locally but breaks in production" issues
- Zero traces exported = zero cost for dev/preview

## Related Documentation

- [OpenTelemetry Next.js Guide](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [Honeycomb Documentation](https://docs.honeycomb.io/)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
