This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

# Honeycomb Conference Simulator

An internal training application for practicing discovery conversations with AI-powered conference attendees.

## Features

- **Trainer Dashboard** (`/`) - Configure sessions, manage personas, monitor conversations
- **Trainee Interface** (`/s/{token}`) - Practice discovery conversations
- **Admin Dashboard** (`/admin`) - Monitor all sessions and invite links
- **Score Cards** (`/share/{token}`) - View performance metrics after sessions
- **OpenTelemetry Integration** - Full observability with Honeycomb

## Getting Started

### Prerequisites

1. Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

2. Configure your Honeycomb API key in `.env.local`:
```env
OTEL_EXPORTER_OTLP_HEADERS="x-honeycomb-team=YOUR_HONEYCOMB_API_KEY"
```

### Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## OpenTelemetry & Observability

This application is fully instrumented with OpenTelemetry and sends traces to Honeycomb.

### Configuration

The following environment variables control OpenTelemetry:

```env
OTEL_SERVICE_NAME="honeycomb-simulator"
OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"
OTEL_EXPORTER_OTLP_ENDPOINT="https://api.honeycomb.io"
OTEL_EXPORTER_OTLP_HEADERS="x-honeycomb-team=YOUR_API_KEY"
```

### Auto-Instrumentation

The app automatically instruments:
- HTTP requests/responses
- Next.js API routes
- Server-side rendering
- Database queries (when applicable)
- Custom application spans

### Files

- `tracing.js` - OpenTelemetry SDK initialization
- `instrumentation.ts` - Next.js instrumentation hook

### Viewing Traces

1. Configure your Honeycomb API key in `.env.local`
2. Run the app: `npm run dev`
3. Make requests to generate traces
4. View traces in your Honeycomb dashboard under the `honeycomb-simulator` dataset

## Project Structure

- `/app` - Next.js app router pages and API routes
- `/components` - Reusable React components
- `/lib` - Shared utilities, storage, and business logic
- `/public/brand` - Honeycomb brand assets

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
