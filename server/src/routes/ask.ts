import { Router } from "express";

interface AskBody {
  prompt?: string;
  agent?: string;
  client?: string;
}

const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  default:
    "Sos un asistente experto en marketing digital para LMTM, una agencia de marketing latinoamericana. Respondé en español, breve y accionable.",
  copy: "Sos un copywriter senior. Generá copy persuasivo, claro y conciso. Respondé en español rioplatense.",
  ads: "Sos un especialista en performance ads (Meta + Google). Proponé creatividades y ángulos concretos.",
  seo: "Sos un especialista SEO. Sugerí keywords, estructura y mejoras técnicas.",
  funnel:
    "Sos un experto en funnels de venta. Diagnosticá y proponé optimizaciones por etapa.",
};

export function askRoutes() {
  const router = Router();

  router.post("/ask", async (req, res) => {
    const body = (req.body ?? {}) as AskBody;
    const prompt = body.prompt?.trim();
    const agentKey = (body.agent ?? "default").toLowerCase();

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    const apiKey = process.env.MINIMAX_API_KEY;
    const baseUrl = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.chat/v1";
    const model = process.env.MINIMAX_MODEL ?? "MiniMax-Text-01";

    if (!apiKey) {
      return res.status(500).json({ error: "MINIMAX_API_KEY not configured" });
    }

    const systemPrompt =
      AGENT_SYSTEM_PROMPTS[agentKey] ?? AGENT_SYSTEM_PROMPTS.default;
    const clientContext = body.client?.trim()
      ? `\n\nContexto del cliente: ${body.client.trim()}`
      : "";

    try {
      const response = await fetch(`${baseUrl}/text/chatcompletion_v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt + clientContext },
            { role: "user", content: prompt },
          ],
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(502).json({
          error: "MiniMax upstream error",
          status: response.status,
          detail: text.slice(0, 500),
        });
      }

      const data: any = await response.json();
      const output =
        data?.choices?.[0]?.message?.content ??
        data?.reply ??
        "";

      return res.json({
        output: typeof output === "string" ? output : JSON.stringify(output),
        agent: agentKey,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(502).json({ error: "MiniMax request failed", detail: message });
    }
  });

  return router;
}
