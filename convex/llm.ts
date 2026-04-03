// Direct Anthropic API calls using tool_use for structured output.
// No "use node" needed — only uses fetch() which is in the default Convex runtime.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

interface LLMResponse<T> {
  output: T | null;
  model: string;
  timeMs: number;
  tokens: number;
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface AnthropicResponse {
  content: { type: string; text?: string; id?: string; name?: string; input?: unknown }[];
  usage: AnthropicUsage;
  model: string;
  stop_reason: string;
}

/**
 * Call Anthropic with tool_use for guaranteed structured output.
 * Defines a tool with a JSON schema and forces the model to call it.
 * Uses prompt caching on system prompt and tool definitions.
 */
export async function callAnthropic<T>(opts: {
  models: string[];
  prompt: string;
  systemPrompt?: string;
  schema: Record<string, unknown>;
  toolName?: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<LLMResponse<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const { models, prompt, systemPrompt, schema, toolName = "respond", maxTokens = 4096, timeoutMs = 60_000 } = opts;
  const startTime = Date.now();

  for (let i = 0; i < models.length; i++) {
    const model = models[i];

    // Backoff + jitter before retrying fallback models
    if (i > 0) {
      const backoffMs = Math.pow(2, i) * 500 + Math.random() * 500;
      await new Promise(r => setTimeout(r, backoffMs));
    }

    try {
      // First model gets full timeout, fallback models get 30s
      const effectiveTimeout = i === 0 ? timeoutMs : Math.min(timeoutMs, 30_000);
      console.log(`[llm] Calling ${model} with tool_use (promptLen=${prompt.length}, system=${systemPrompt ? "yes" : "no"}, timeout=${effectiveTimeout}ms)`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

      // System prompt with cache_control for prompt caching
      const systemContent = systemPrompt
        ? [{ type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } }]
        : undefined;

      // Tool definition with cache_control — caches the schema across identical calls
      const tools = [{
        name: toolName,
        description: "Respond with structured data",
        input_schema: schema,
        cache_control: { type: "ephemeral" as const },
      }];

      const res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          ...(systemContent ? { system: systemContent } : {}),
          messages: [{ role: "user", content: prompt }],
          tools,
          tool_choice: { type: "tool", name: toolName },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errBody = await res.text();
        console.error(`[llm] ${model} returned ${res.status}: ${errBody.slice(0, 300)}`);
        continue;
      }

      const data = (await res.json()) as AnthropicResponse;
      const tokens = data.usage.input_tokens + data.usage.output_tokens;

      // Log cache performance
      const cacheWrite = data.usage.cache_creation_input_tokens ?? 0;
      const cacheRead = data.usage.cache_read_input_tokens ?? 0;
      const cacheInfo = (cacheWrite || cacheRead)
        ? ` (cache: ${cacheRead} read, ${cacheWrite} written)`
        : "";

      // Check for truncation
      if (data.stop_reason === "max_tokens") {
        console.error(`[llm] ${model} truncated at max_tokens (${maxTokens}) — output incomplete, ${data.usage.output_tokens} tokens generated`);
        continue;
      }

      // Extract tool_use result
      const toolUse = data.content.find((c) => c.type === "tool_use");
      if (!toolUse?.input) {
        console.error(`[llm] ${model} did not return tool_use. stop_reason: ${data.stop_reason}`);
        continue;
      }

      console.log(`[llm] ${model} responded: ${tokens} tokens via tool_use${cacheInfo}`);
      return { output: toolUse.input as T, model, timeMs: Date.now() - startTime, tokens };
    } catch (err) {
      console.error(`[llm] ${model} failed:`, err instanceof Error ? err.message : String(err));
    }
  }

  return { output: null, model: "none", timeMs: Date.now() - startTime, tokens: 0 };
}
