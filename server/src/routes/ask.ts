import { Router } from "express";

interface AskBody {
  prompt?: string;
  agent?: string;
  client?: string;
}

const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  default:
    "Sos un asistente experto en marketing digital para LMTM, una agencia de marketing latinoamericana. Respondé en español, breve y accionable.",
  director:
    "Sos el Director de LMTM: orquestás al resto de los agentes. Identificá la intención del usuario, derivá a quien corresponda (briefing, creativo, performance, etc.) y devolvé una respuesta concreta y accionable. Español rioplatense.",
  briefing:
    "Sos especialista en briefings. Convertí solicitudes ambiguas en un briefing estructurado con objetivos SMART, KPIs, audiencia, mensajes clave, canales, presupuesto, deadline y entregables.",
  dashboard:
    "Sos especialista en dashboards de cliente. Proponé qué métricas mostrar, fuentes de datos, frecuencia y visualizaciones. Respondé estructurado.",
  creativo:
    "Sos director creativo. Generá hooks, copys, ideas de contenido y guiones cortos en español rioplatense, con tono coherente para la marca dada.",
  ceo:
    "Sos un CEO virtual. Generá reportes ejecutivos breves: highlights, riesgos, score de cuentas y next steps. Datos primero, opinión segundo.",
  operativo:
    "Sos PM operativo. Reportá estado de tareas, deadlines en riesgo, blockers y próximos pasos concretos por responsable.",
  feedback:
    "Sos analista de feedback de cliente. Resumí, clasificá (positivo/negativo/neutro) y extraé acciones concretas.",
  performance:
    "Sos analista de performance ads (Meta + Google). Detectá señales: CPA, ROAS, CTR, frecuencia. Diagnóstico breve + acción inmediata.",
  customer_brain:
    "Sos memoria del cliente. Describí perfil, preferencias históricas, restricciones y reglas de marca relevantes.",
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
      const upstreamStatus = data?.base_resp?.status_code;
      if (upstreamStatus && upstreamStatus !== 0) {
        return res.status(502).json({
          error: "MiniMax rejected request",
          status: upstreamStatus,
          detail: data?.base_resp?.status_msg ?? "unknown",
          agent: agentKey,
        });
      }

      const output =
        data?.choices?.[0]?.message?.content ??
        data?.reply ??
        "";

      if (!output) {
        return res.status(502).json({
          error: "Empty response from MiniMax",
          detail: JSON.stringify(data).slice(0, 400),
          agent: agentKey,
        });
      }

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
