"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { type ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;

// Create a single client instance
const convex = new ConvexReactClient(convexUrl || "https://placeholder.convex.cloud");

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
