/** Validates the environment at server start so misconfiguration fails fast. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/config/env");
  }
}
