#!/usr/bin/env tsx
// Find Convex preview deployments whose git branch no longer exists on origin
// and shorten their expiry so they self-clean within 24h.
//
// Auth: needs a Convex team access token in CONVEX_TEAM_ACCESS_TOKEN.
//   Generate at https://dashboard.convex.dev/team/settings/access-tokens
//   Loaded from process.env or the main repo's .env.local.
//
// Usage:
//   npx tsx scripts/prune-convex-previews.ts            # dry run (default)
//   npx tsx scripts/prune-convex-previews.ts --apply    # shorten expiry to 24h
//   npx tsx scripts/prune-convex-previews.ts --apply --delete  # actually delete

import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const TEAM = "good-ancestors";
const PROJECT = "ttx";
const API = "https://api.convex.dev/v1";

function loadEnvLocal(): void {
  if (process.env.CONVEX_TEAM_ACCESS_TOKEN) return;
  const gitCommonDir = execSync("git rev-parse --git-common-dir", {
    encoding: "utf8",
  }).trim();
  const mainRepoRoot = path.resolve(gitCommonDir, "..");
  const envPath = path.join(mainRepoRoot, ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvLocal();
const TOKEN = process.env.CONVEX_TEAM_ACCESS_TOKEN;
if (!TOKEN) {
  console.error(
    "CONVEX_TEAM_ACCESS_TOKEN not set. Add to .env.local or export in your shell.",
  );
  process.exit(1);
}

async function api<T>(p: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(API + p, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${text}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

type Deployment = {
  name: string;
  deploymentType: "dev" | "prod" | "preview";
  reference?: string | null;
  expiresAt?: number | null;
  createTime?: number;
  projectId?: number;
};

async function getProjectId(): Promise<number> {
  // Easiest path: fetch the prod deployment by team+project slug, read projectId.
  const prod = await api<Deployment>(
    `/teams/${TEAM}/projects/${PROJECT}/deployment?defaultProd=true`,
  );
  if (!prod.projectId) throw new Error(`No projectId in prod deployment response`);
  return prod.projectId;
}

async function listPreviews(projectId: number): Promise<Deployment[]> {
  // The /projects/{id}/list_deployments endpoint may or may not paginate;
  // handle both by reading a `cursor` field if present.
  const out: Deployment[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({ deploymentType: "preview" });
    if (cursor) qs.set("cursor", cursor);
    const res = await api<
      Deployment[] | { deployments?: Deployment[]; cursor?: string | null }
    >(`/projects/${projectId}/list_deployments?${qs.toString()}`);
    if (Array.isArray(res)) {
      out.push(...res);
      cursor = undefined;
    } else {
      out.push(...(res.deployments ?? []));
      cursor = res.cursor ?? undefined;
    }
  } while (cursor);
  return out;
}

function currentRemoteBranches(): Set<string> {
  const out = execFileSync(
    "git",
    ["branch", "-r", "--format=%(refname:short)"],
    { encoding: "utf8" },
  );
  return new Set(
    out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !s.endsWith("/HEAD"))
      .map((s) => s.replace(/^origin\//, "")),
  );
}

function fmtAge(ms: number): string {
  const d = Math.floor(ms / 86400000);
  if (d > 0) return `${d}d`;
  return `${Math.floor(ms / 3600000)}h`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const hardDelete = process.argv.includes("--delete");
  console.log(`→ fetching project id for ${TEAM}/${PROJECT}…`);
  const projectId = await getProjectId();

  console.log(`→ listing preview deployments…`);
  const previews = await listPreviews(projectId);
  console.log(`  ${previews.length} preview deployments total`);

  const branches = currentRemoteBranches();
  console.log(`→ ${branches.size} live remote branches on origin`);

  // Convex preview `reference` is `preview/<branch>` with slashes replaced
  // by dashes and lowercased (matches the Vercel preview alias convention).
  const liveRefs = new Set<string>();
  for (const b of branches) {
    liveRefs.add(`preview/${b.replace(/\//g, "-").toLowerCase()}`);
  }

  const orphans = previews.filter(
    (d) => d.reference && !liveRefs.has(d.reference),
  );
  console.log(`\nOrphans (branch no longer on origin): ${orphans.length}`);
  const now = Date.now();
  for (const o of orphans) {
    const age = o.createTime ? fmtAge(now - o.createTime) : "?";
    const exp = o.expiresAt
      ? `expires in ${fmtAge(o.expiresAt - now)}`
      : "no expiry";
    console.log(`  ${o.name.padEnd(30)} ref=${o.reference}  age=${age}  ${exp}`);
  }

  if (!apply) {
    console.log(`\nDry run. Re-run with --apply to shorten expiry to 24h.`);
    return;
  }

  if (orphans.length === 0) {
    console.log(`\nNothing to do.`);
    return;
  }

  const action = hardDelete ? "delete" : "shorten expiry to 24h on";
  console.log(`\n${hardDelete ? "Deleting" : "Shortening expiry on"} ${orphans.length} orphan previews…`);
  let ok = 0;
  let fail = 0;
  const newExpiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h from now
  for (const o of orphans) {
    try {
      if (hardDelete) {
        await api(`/deployments/${o.name}/delete`, { method: "POST" });
      } else {
        await api(`/deployments/${o.name}`, {
          method: "PATCH",
          body: JSON.stringify({ expiresAt: newExpiresAt }),
        });
      }
      console.log(`  ✓ ${o.name}`);
      ok++;
    } catch (e) {
      console.log(`  ✗ ${o.name}: ${(e as Error).message}`);
      fail++;
    }
  }
  console.log(`\nDone. ${ok} ${hardDelete ? "deleted" : "updated"}, ${fail} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
