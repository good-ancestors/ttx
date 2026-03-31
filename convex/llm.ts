// Direct Anthropic API calls using tool_use for structured output.
// No "use node" needed — only uses fetch() which is in the default Convex runtime.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

interface LLMResponse<T> {
  output: T | null;
  model: string;
  timeMs: number;
  tokens: number;
}

interface AnthropicResponse {
  content: { type: string; text?: string; id?: string; name?: string; input?: unknown }[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
  stop_reason: string;
}

/**
 * Call Anthropic with tool_use for guaranteed structured output.
 * Defines a tool with a JSON schema and forces the model to call it.
 */
export async function callAnthropic<T>(opts: {
  models: string[];
  prompt: string;
  schema: Record<string, unknown>;
  toolName?: string;
  maxTokens?: number;
}): Promise<LLMResponse<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const { models, prompt, schema, toolName = "respond", maxTokens = 4096 } = opts;
  const startTime = Date.now();

  for (const model of models) {
    try {
      console.log(`[llm] Calling ${model} with tool_use (promptLen=${prompt.length})`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

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
          messages: [{ role: "user", content: prompt }],
          tools: [{
            name: toolName,
            description: "Respond with structured data",
            input_schema: schema,
          }],
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

      // Extract tool_use result
      const toolUse = data.content.find((c) => c.type === "tool_use");
      if (!toolUse?.input) {
        console.error(`[llm] ${model} did not return tool_use. stop_reason: ${data.stop_reason}`);
        continue;
      }

      console.log(`[llm] ${model} responded: ${tokens} tokens via tool_use`);
      return { output: toolUse.input as T, model, timeMs: Date.now() - startTime, tokens };
    } catch (err) {
      console.error(`[llm] ${model} failed:`, err instanceof Error ? err.message : String(err));
    }
  }

  return { output: null, model: "none", timeMs: Date.now() - startTime, tokens: 0 };
}

