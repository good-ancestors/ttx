import { ConvexHttpClient } from "convex/browser";

let _client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
    }
    _client = new ConvexHttpClient(url);
  }
  return _client;
}

/**
 * Lazy-initialized Convex HTTP client.
 * Defers instantiation until first property access so the module can be
 * imported at build time without NEXT_PUBLIC_CONVEX_URL being set.
 */
export const convex: ConvexHttpClient = new Proxy({} as ConvexHttpClient, {
  get(_target, prop, _receiver) {
    const client = getConvexClient();
    const value = (client as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? (value as Function).bind(client) : value;
  },
});
