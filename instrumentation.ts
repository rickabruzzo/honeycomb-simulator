// instrumentation.ts
export async function register() {
  // Only run instrumentation in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Dynamically import tracing to ensure it runs before anything else
    await import("./tracing.js");
  }
}
