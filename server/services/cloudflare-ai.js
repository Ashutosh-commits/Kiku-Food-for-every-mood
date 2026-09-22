import { config } from "../config.js";
import { fetchJsonLimited } from "../lib/http.js";

export function cloudflareAiConfigured() {
  return config.aiProvider === "cloudflare" && Boolean(config.cloudflareAccountId && config.cloudflareApiToken && config.cloudflareAiModel);
}

function endpoint() {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.cloudflareAccountId)}/ai/v1/chat/completions`;
}

export async function cloudflareChat({ messages, tools = undefined, maxCompletionTokens = config.cloudflareAiMaxTokens, temperature = 0.2, user = undefined, responseFormat = undefined }) {
  if (!cloudflareAiConfigured()) return null;

  const body = {
    model: config.cloudflareAiModel,
    messages,
    max_completion_tokens: Math.max(64, Math.min(Number(maxCompletionTokens) || config.cloudflareAiMaxTokens, 2400)),
    temperature: Math.max(0, Math.min(Number(temperature) || 0.2, 1)),
    store: false,
    ...(Array.isArray(tools) && tools.length ? { tools, tool_choice: "auto", parallel_tool_calls: true } : {}),
    ...(user ? { user: String(user).slice(0, 128) } : {}),
    ...(responseFormat ? { response_format: responseFormat } : {}),
  };

  try {
    const { response, data } = await fetchJsonLimited(endpoint(), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.cloudflareApiToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.cloudflareAiTimeoutMs),
    }, 2 * 1024 * 1024);
    if (!response.ok) return null;
    if (data?.success === false) return null;
    return data;
  } catch {
    return null;
  }
}
