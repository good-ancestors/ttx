#!/usr/bin/env node
/**
 * Regenerate convex/sampleActionsData.ts from public/sample-actions.json.
 *
 * The Convex runtime can't directly import JSON files from ../public at build time,
 * so we mirror the JSON into a TS module that re-exports the object. Source of truth
 * is the JSON file — edit that and run this script.
 *
 * Usage: node scripts/generate-sample-actions-data.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const source = resolve(repoRoot, "public/sample-actions.json");
const target = resolve(repoRoot, "convex/sampleActionsData.ts");

const data = JSON.parse(readFileSync(source, "utf8"));
const body = `// Auto-generated from public/sample-actions.json
// DO NOT EDIT — regenerate with \`node scripts/generate-sample-actions-data.mjs\`

export const SAMPLE_ACTIONS_DATA = ${JSON.stringify(data)};
`;
writeFileSync(target, body);
console.log(`✓ Wrote ${target} (${body.length} bytes) from ${source}`);
