#!/bin/bash
# Vercel "Ignored Build Step" — saves build minutes by skipping preview
# builds for branches that don't have an open PR.
#
# Wire-up: Project Settings → Build and Deployment → Ignored Build Step →
#          Behavior: "Run my Bash script", Command: `bash scripts/vercel-ignored-build.sh`.
#
# Vercel exit-code convention (inverted from normal shell):
#   exit 1 = build proceeds
#   exit 0 = build is canceled

set -u

# Always build production (main pushes, promotions, manual prod deploys).
if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  echo "✅ Production build — proceed."
  exit 1
fi

# Skip preview builds for branches without an open PR. Saves minutes when
# autonomous agent sessions push without ever opening a PR.
if [[ -z "${VERCEL_GIT_PULL_REQUEST_ID:-}" ]]; then
  echo "⏭  No PR open for branch '${VERCEL_GIT_COMMIT_REF:-?}' — skip."
  exit 0
fi

echo "✅ PR #${VERCEL_GIT_PULL_REQUEST_ID} open — proceed."
exit 1
