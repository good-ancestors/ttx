"use node";

// Direct Anthropic API calls for use in Convex Node actions.
// Replaces Vercel AI SDK's generateWithFallback for server-side pipeline.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

interface LLMResponse<T> {
  output: T | null;
  model: string;
  timeMs: number;
  tokens: number;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicResponse {
  content: { type: string; text?: string }[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

/**
 * Call the Anthropic Messages API with model fallback.
 * Returns parsed JSON output validated by the caller.
 */
export async function callAnthropicWithFallback<T>(opts: {
  models: string[];
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  parseOutput: (text: string) => T;
}): Promise<LLMResponse<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const { models, prompt, systemPrompt, maxTokens = 4096, parseOutput } = opts;
  const startTime = Date.now();

  for (const model of models) {
    try {
      const messages: AnthropicMessage[] = [{ role: "user", content: prompt }];
      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        messages,
      };
      if (systemPrompt) body.system = systemPrompt;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min per attempt

      const res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[llm] ${model} returned ${res.status}: ${errText.slice(0, 200)}`);
        continue;
      }

      const data = (await res.json()) as AnthropicResponse;
      const text = data.content.find((c) => c.type === "text")?.text ?? "";
      const tokens = data.usage.input_tokens + data.usage.output_tokens;

      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
      const jsonText = (jsonMatch[1] ?? text).trim();

      const output = parseOutput(jsonText);
      return { output, model, timeMs: Date.now() - startTime, tokens };
    } catch (err) {
      console.error(`[llm] ${model} failed:`, err instanceof Error ? err.message : String(err));
    }
  }

  return { output: null, model: "none", timeMs: Date.now() - startTime, tokens: 0 };
}

/**
 * Call Anthropic with structured JSON output using the prefill technique.
 * Asks the model to respond with JSON, prefills assistant with "{" to force JSON output.
 */
export async function callAnthropicJSON<T>(opts: {
  models: string[];
  prompt: string;
  maxTokens?: number;
  parseOutput: (text: string) => T;
}): Promise<LLMResponse<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const { models, prompt, maxTokens = 4096, parseOutput } = opts;
  const startTime = Date.now();

  for (const model of models) {
    try {
      const messages: AnthropicMessage[] = [
        { role: "user", content: prompt + "\n\nRespond with ONLY a JSON object, no other text." },
        { role: "assistant", content: "{" }, // Prefill to force JSON
      ];

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      console.log(`[llm] Calling ${model} (maxTokens=${maxTokens}, promptLen=${prompt.length})`);
      const res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errBody = await res.text();
        console.error(`[llm] ${model} returned ${res.status}: ${errBody.slice(0, 300)}`);
        continue;
      }

      const data = (await res.json()) as AnthropicResponse;
      const text = data.content.find((c) => c.type === "text")?.text ?? "";
      const tokens = data.usage.input_tokens + data.usage.output_tokens;
      console.log(`[llm] ${model} responded: ${tokens} tokens, text length: ${text.length}`);

      // Prepend the "{" we used as prefill
      const jsonText = "{" + text;
      try {
        const output = parseOutput(jsonText);
        return { output, model, timeMs: Date.now() - startTime, tokens };
      } catch (parseErr) {
        console.error(`[llm] JSON parse failed for ${model}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
        console.error(`[llm] First 500 chars of response: ${jsonText.slice(0, 500)}`);
        continue;
      }
    } catch (err) {
      console.error(`[llm] ${model} failed:`, err instanceof Error ? err.message : String(err));
    }
  }

  return { output: null, model: "none", timeMs: Date.now() - startTime, tokens: 0 };
}
