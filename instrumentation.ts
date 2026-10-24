export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { startMorningJob } = await import("@/lib/morning");
    startMorningJob();
  }
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { watchBackgroundTasks } = await import("@/lib/alerts");
    watchBackgroundTasks();
  }
}

/** Next.js calls this for every error thrown while serving a page, a form submit, or an API route. */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routeType: string; routePath: string },
) {
  // Written as a positive check so the build leaves the mail code out of the edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportError } = await import("@/lib/alerts");
    // The path only, never the query string or headers, so no sign-in token or personal detail goes into the mail.
    await reportError(`${request.method} ${request.path.split("?")[0]}`, error, { detail: `${context.routeType} ${context.routePath}` });
  }
}
