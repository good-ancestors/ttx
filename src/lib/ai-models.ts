// AI model configuration via Vercel AI Gateway.
// Change the model string to swap providers instantly.

// Fast model for action grading (~2-4s)
export const GRADING_MODEL = "google/gemini-2.5-flash";

// Quality model for narrative generation (~8-14s)
export const NARRATIVE_MODEL = "google/gemini-2.5-flash";

// For production, swap to:
// export const GRADING_MODEL = "anthropic/claude-haiku-4-5";
// export const NARRATIVE_MODEL = "anthropic/claude-sonnet-4-6";
