/**
 * Simple shared secret auth for API routes.
 * Set TTX_API_SECRET in environment to enable.
 * If not set, all requests are allowed (dev mode).
 */
export function checkApiAuth(request: Request): Response | null {
  const secret = process.env.TTX_API_SECRET;
  if (!secret) return null; // No secret configured = open access (dev)

  const provided = request.headers.get("x-api-secret");
  if (provided === secret) return null; // Valid

  return Response.json(
    { error: "Unauthorized" },
    { status: 401 }
  );
}
