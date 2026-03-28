// AI model configuration via Vercel AI Gateway.
// Change the model string to swap providers instantly.
//
// Model comparison results (Round 2 grading, March 2026):
// ┌──────────────────────┬───────────┬──────────────────────────────────────────┐
// │ Model                │ Avg Speed │ Calibration vs Opus baseline             │
// ├──────────────────────┼───────────┼──────────────────────────────────────────┤
// │ claude-opus-4-6      │ 25.1s     │ Baseline — most rigorous, best reasoning│
// │ claude-sonnet-4-6    │ 21.0s     │ Closest to Opus, excellent reasoning     │
// │ claude-haiku-4-5     │ 14.5s     │ More generous, good but less strict      │
// │ gemini-2.5-flash     │ 16.7s     │ Too generous, shallow reasoning          │
// └──────────────────────┴───────────┴──────────────────────────────────────────┘
//
// Recommendation: Sonnet for both grading + narrative (best quality/speed).
// Haiku as fallback (faster, slightly more generous).
// Gemini as last resort (fast but under-calibrated).

export const GRADING_MODEL = "anthropic/claude-sonnet-4-6";
export const GRADING_FALLBACK = "anthropic/claude-haiku-4-5";

export const RESOLVE_MODEL = "anthropic/claude-sonnet-4-6";
export const RESOLVE_FALLBACK = "anthropic/claude-haiku-4-5";

export const NARRATIVE_MODEL = "anthropic/claude-sonnet-4-6";
export const NARRATIVE_FALLBACK = "anthropic/claude-haiku-4-5";

// Last-resort fallback if Anthropic is completely down
export const EMERGENCY_FALLBACK = "google/gemini-2.5-flash";
