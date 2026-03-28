/**
 * API route auth: allows same-origin requests (browser fetch from our app)
 * and external requests with a valid x-api-secret header.
 * Set TTX_API_SECRET in environment to block unauthenticated external callers.
 * If not set, all requests are allowed (dev mode).
 */
export function checkApiAuth(request: Request): Response | null {
  const secret = process.env.TTX_API_SECRET;
  if (!secret) return null; // No secret configured = open access (dev)

  // Allow same-origin requests (facilitator dashboard, player page)
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host === host) return null;

  // Allow requests with valid API secret (external callers)
  const provided = request.headers.get("x-api-secret");
  if (provided === secret) return null;

  return Response.json(
    { error: "Unauthorized" },
    { status: 401 }
  );
}
