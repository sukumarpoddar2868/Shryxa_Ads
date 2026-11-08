import "server-only";
import { aiEnv } from "@/lib/env";

/**
 * Groq chat completion in JSON mode (OpenAI-compatible REST, no SDK).
 * Returns the raw JSON text; callers parse + validate it.
 */
export async function groqJson(
  prompt: string,
  { maxTokens = 2048, temperature = 0.2, timeoutMs = 30_000 }: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  const { GROQ_API_KEY, GROQ_MODEL } = aiEnv();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a precise assistant for Meta advertising workflows. Follow the instructions carefully. Return only a valid JSON object, without Markdown code fences or additional commentary.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: maxTokens,
      temperature,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`Groq request failed (${res.status}): ${body.error?.message ?? "unknown error"}`);
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty response.");
  return content;
}
