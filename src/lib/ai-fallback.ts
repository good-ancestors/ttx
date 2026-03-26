import { generateText, Output, createGateway } from "ai";
import type { ZodSchema } from "zod";
import { EMERGENCY_FALLBACK } from "./ai-models";

const gw = createGateway();

interface GenerateWithFallbackResult<T> {
  output: T | null;
  model: string;
  timeMs: number;
  tokens?: number;
}

/**
 * Try generateText with primary model, fall back to secondary, then emergency.
 * Returns the output plus metadata about which model was used and how long it took.
 */
export async function generateWithFallback<T>(opts: {
  primary: string;
  fallback: string;
  prompt: string;
  schema: ZodSchema<T>;
  maxRetries?: number;
}): Promise<GenerateWithFallbackResult<T>> {
  const models = [opts.primary, opts.fallback, EMERGENCY_FALLBACK];

  for (const modelId of models) {
    const start = performance.now();
    try {
      const { output, usage } = await generateText({
        model: gw(modelId),
        output: Output.object({ schema: opts.schema }),
        prompt: opts.prompt,
        maxRetries: opts.maxRetries ?? 2,
      });

      const timeMs = Math.round(performance.now() - start);
      return {
        output: output as T | null,
        model: modelId,
        timeMs,
        tokens: usage?.totalTokens,
      };
    } catch (error) {
      const timeMs = Math.round(performance.now() - start);
      console.warn(
        `Model ${modelId} failed after ${timeMs}ms:`,
        error instanceof Error ? error.message : String(error)
      );
      // Try next model
    }
  }

  // All models failed
  return { output: null, model: "none", timeMs: 0 };
}
