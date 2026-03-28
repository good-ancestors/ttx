export function GET() {
  // Just return immediately — the act of calling this route warms up the serverless function
  // The facilitator page will also call the other AI routes to warm them
  return Response.json({ warmed: true, timestamp: Date.now() });
}
