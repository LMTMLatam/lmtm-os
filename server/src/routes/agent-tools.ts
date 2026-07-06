// LMTM-OS: agent tool-execution endpoint.
//
// The minimax_local adapter runs the model HTTP-direct (no spawned process), so
// when the model emits a tool call there is nothing to execute it. This router
// is the executor: the adapter (authenticated with the agent's local JWT) lists
// the available tools and runs them here, in-process, with full access to the
// issue service and the plugin tool dispatcher.
//
// Exposed tools:
//  - CORE: get_issue, post_comment, set_issue_status, create_child_issue — let an
//    agent read its task and CLOSE THE LOOP (comment its result + mark the issue
//    done/blocked) so runs actually progress instead of spinning.
//  - PLUGIN: every tool registered by the bundled LMTM plugins (Meta Ads, etc.).
//
// Auth: the agent JWT (req.actor.type === "agent") or a board actor.

import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { clients, competitors, accountScores, organicPosts, adsAccountMappings, adsInsights, adsAlerts, learnings, contentPerformance, agentDeliverables, hooks, issues, agents, trends } from "@paperclipai/db";
import { isNotNull, isNull, ne } from "drizzle-orm";
import { desc, eq, and, gte, or, inArray, sql } from "drizzle-orm";
import { issueService } from "../services/issues.js";
import type { PluginToolDispatcher } from "../services/plugin-tool-dispatcher.js";
import { getBrainContext, upsertMemory, type MemoryKind } from "../services/customer-brain.js";
import { aggInsights, dayStr, sendWhatsAppToNumber, alertsNumber } from "../services/agency-ops.js";
import { fetchAccountBalances } from "../services/balance-monitor.js";
import { getRedesScheduledContent } from "../services/clickup-sync.js";
import { createClientTask } from "../services/client-tasks.js";
import { clickupTools, googleTools } from "../services/agent-mcp-tools.js";
import { resolveCompanyId } from "../services/intel-common.js";
import { unauthorized } from "../errors.js";

type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const CORE_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_issue",
      description:
        "Lee los detalles de un issue (título, descripción, estado). Pasá el id o el identificador (ej. LMTM-7).",
      parameters: {
        type: "object",
        properties: { issueId: { type: "string", description: "ID o identificador del issue (ej. LMTM-7)" } },
        required: ["issueId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "post_comment",
      description:
        "Deja un comentario en el issue con tu análisis, resultado o pregunta. Es la forma de entregar tu trabajo al equipo.",
      parameters: {
        type: "object",
        properties: {
          issueId: { type: "string", description: "ID o identificador del issue" },
          body: { type: "string", description: "Texto del comentario (markdown)" },
        },
        required: ["issueId", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_issue_status",
      description:
        "Cambia el estado del issue. Usá 'done' cuando completaste la tarea (dejá antes un comentario con el resultado), 'blocked' si estás bloqueado (explicá por qué en un comentario), 'in_progress' si seguís. SIEMPRE cerrá la tarea con un estado para que no quede colgada.",
      parameters: {
        type: "object",
        properties: {
          issueId: { type: "string" },
          status: { type: "string", enum: ["done", "in_progress", "blocked", "backlog", "todo", "cancelled"] },
          reason: { type: "string", description: "Motivo breve del cambio (opcional)" },
        },
        required: ["issueId", "status"],
      },
    },
  },
  // ── Acceso a datos del cliente (lectura) ──────────────────────────────────
  {
    type: "function",
    function: {
      name: "list_clients",
      description:
        "Lista los clientes activos de la agencia (id, nombre, slug). Usalo para encontrar el clientId de un cliente por su nombre antes de pedir sus datos.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_brain",
      description:
        "Devuelve la MEMORIA viva del cliente: hechos, decisiones, preferencias, riesgos, performance y el Enfoque Técnico acumulado. Leelo SIEMPRE antes de trabajar sobre un cliente para tener contexto.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string", description: "UUID del cliente (de list_clients)" } },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_competitors",
      description: "Lista los competidores cargados del cliente (nombre, redes, web, notas, anuncios de muestra).",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string" } },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_ads_performance",
      description:
        "Métricas REALES de Meta Ads del cliente para los últimos N días (spend, impresiones, clicks, leads, reach, CTR, CPL, CPC). Datos sincronizados, no inventes.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          sinceDays: { type: "number", description: "Ventana en días (default 30)" },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_scores",
      description: "Devuelve el último score de Salud de cuenta (ads) y Operativo (cumplimiento) del cliente, 0-100.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string" } },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "portfolio_snapshot",
      description:
        "Foto AGREGADA de toda la agencia (últimos 7 días): clientes activos, spend y leads totales, cuántos clientes tienen datos y cuántos tienen alertas abiertas. Usalo ANTES de escalar un problema para distinguir si algo es SISTÉMICO (afecta a toda la cartera) o SOLO de tu cliente — así no escalás un falso outage.",
      parameters: { type: "object", properties: {} },
    },
  },
  // ── Autoaprendizaje (escritura en la memoria del cliente) ─────────────────
  // ── ClickUp (in-process MCP wrapper, mismo backend que el MCP stdio) ───────
  {
    type: "function",
    function: {
      name: "clickup_list_workspaces",
      description: "Lista los workspaces (teams) de ClickUp visibles al token. Útil para arrancar la exploración.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "clickup_list_spaces",
      description: "Lista los spaces de un workspace de ClickUp.",
      parameters: {
        type: "object",
        properties: { workspaceId: { type: "string", description: "Workspace id (de clickup_list_workspaces)" } },
        required: ["workspaceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clickup_list_lists",
      description: "Lista las listas dentro de un folder de ClickUp.",
      parameters: {
        type: "object",
        properties: { folderId: { type: "string", description: "Folder id de ClickUp" } },
        required: ["folderId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clickup_list_tasks",
      description: "Lista las tareas (posts, etc.) de una lista de ClickUp. Útil para cruzar contenido programado con lo publicado en redes.",
      parameters: {
        type: "object",
        properties: {
          listId: { type: "string", description: "List id de ClickUp" },
          limit: { type: "number", description: "Cantidad máxima (default 50, max 100)" },
        },
        required: ["listId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clickup_create_task",
      description:
        "Crea una tarea en una lista de ClickUp. Útil para anotar pendientes operativos que deben vivir en la planilla del cliente. Devuelve la tarea con su id y URL.",
      parameters: {
        type: "object",
        properties: {
          listId: { type: "string", description: "List id destino" },
          name: { type: "string", description: "Título de la tarea" },
          description: { type: "string", description: "Descripción markdown (opcional)" },
          priority: { type: "number", description: "1=urgente, 2=alta, 3=normal, 4=baja" },
          dueDate: { type: "number", description: "Fecha de vencimiento en Unix ms (opcional)" },
        },
        required: ["listId", "name"],
      },
    },
  },
  // ── Google Sheets (in-process MCP wrapper) ─────────────────────────────────
  {
    type: "function",
    function: {
      name: "sheets_read",
      description:
        "Lee un rango de celdas de un Google Sheet (la planilla de planning del cliente). Devuelve filas como arrays de strings. Usalo para verificar qué está cargado en la planilla del cliente.",
      parameters: {
        type: "object",
        properties: {
          spreadsheetId: { type: "string", description: "ID del Sheet (de clients.sheetsSpreadsheetId)" },
          range: { type: "string", description: "Rango A1 notation, ej. 'Hoja1!A1:F50'" },
        },
        required: ["spreadsheetId", "range"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sheets_append",
      description:
        "Agrega filas al final de un rango del Sheet del cliente (programar nuevos posts, registrar learnings, etc.).",
      parameters: {
        type: "object",
        properties: {
          spreadsheetId: { type: "string" },
          range: { type: "string", description: "Rango destino, ej. 'Hoja1!A:F'" },
          values: {
            type: "array",
            description: "Filas a agregar (cada fila es un array de strings)",
            items: { type: "array", items: { type: "string" } },
          },
        },
        required: ["spreadsheetId", "range", "values"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember_about_client",
      description:
        "Guarda un aprendizaje en la MEMORIA del cliente para que el sistema lo recuerde en el futuro. Usalo cuando descubrís algo útil y durable: qué creatividad/ángulo funciona, una preferencia del cliente, un riesgo, una decisión, un resultado clave. Así el sistema autoaprende a medida que trabajamos. NO guardes ruido ni cosas obvias.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          key: { type: "string", description: "Identificador corto del aprendizaje (ej. 'angulo-ganador', 'preferencia-tono')" },
          content: { type: "string", description: "El aprendizaje, claro y autocontenido (1-3 frases)" },
          kind: {
            type: "string",
            enum: ["fact", "preference", "decision", "event", "performance", "context", "risk"],
            description: "Tipo de memoria (default 'fact')",
          },
        },
        required: ["clientId", "key", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember_team_lesson",
      description:
        "Guarda una LECCIÓN DE EQUIPO (no de un cliente puntual): limitaciones del sistema, patrones operativos, errores que otros agentes no deberían repetir. Ej: 'el guard de permisos no deja reasignar issues — pedirlo a un humano', 'antes de escalar un outage, chequear lmtmPortfolioSnapshot'. Visible para TODOS los agentes vía get_team_lessons.",
      parameters: {
        type: "object",
        properties: {
          area: { type: "string", description: "Área corta de la lección (ej. 'harness', 'escalation', 'clickup', 'meta', 'whatsapp')" },
          lesson: { type: "string", description: "La lección, clara y autocontenida (1-3 frases). Debe servirle a un colega que no vivió el problema." },
        },
        required: ["area", "lesson"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_hook",
      description:
        "Guarda un GANCHO en el Baúl de Ganchos: una primera línea/apertura probada que vale la pena reusar. Fuentes típicas: un post propio que rindió (sourceKind='organico'), un reel de un competidor (sourceKind='competidor', con views si las sabés), una tendencia, o manual. Con clientId queda en el baúl del cliente; sin clientId queda global para todo su nicho.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "El gancho, textual (1-2 frases)" },
          clientId: { type: "string", description: "Cliente dueño (opcional — sin esto es global del nicho)" },
          niche: { type: "string", description: "Nicho/rubro al que aplica (ej. 'inmobiliaria')" },
          sourceKind: { type: "string", enum: ["manual", "organico", "competidor", "tendencia"] },
          sourceRef: { type: "string", description: "De dónde salió: @creador, URL del reel/post, etc." },
          format: { type: "string", description: "reel | carrusel | story | estatico" },
          views: { type: "number", description: "Vistas de la pieza original, si se conocen" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_hooks",
      description:
        "Busca en el Baúl de Ganchos (por cliente y/o nicho y/o texto). Devuelve los mejores primero (pineados, más usados). Usalo antes de escribir un guion/copy para arrancar de un gancho probado en vez de inventar de cero.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "Filtrar por cliente (incluye los globales de su nicho)" },
          niche: { type: "string", description: "Filtrar por nicho" },
          q: { type: "string", description: "Texto a buscar dentro del gancho" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_trend",
      description:
        "Guarda una TENDENCIA en el panel: una noticia/novedad externa (IA, marketing, plataformas) con potencial de contenido. Etiquetala honesto: 'potencial-de-gancho' solo si de verdad da para un posteo; 'explicativo' si es contexto; 'ignorar' si no sirve. Indicá a qué nichos les sirve.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título corto de la tendencia" },
          url: { type: "string", description: "Link a la fuente" },
          source: { type: "string", description: "Fuente (ej. 'blog Anthropic', 'X')" },
          tag: { type: "string", enum: ["potencial-de-gancho", "explicativo", "ignorar"] },
          niches: { type: "array", items: { type: "string" }, description: "Nichos a los que aplica ([] = todos)" },
          summary: { type: "string", description: "Resumen de 1-2 frases: qué es y por qué sirve para contenido" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_deliverable",
      description:
        "Guardá un ENTREGABLE terminado como artefacto reutilizable (no un comentario): un copy final, un spec de campaña listo para lanzar, un reporte, una investigación o un plan. Queda ligado al issue y al cliente, buscable y reutilizable. Usalo cuando termines algo concreto, en vez de dejarlo enterrado en un comentario.",
      parameters: {
        type: "object",
        properties: {
          issueId: { type: "string", description: "ID o identificador del issue (ej. LMTM-7)" },
          clientId: { type: "string", description: "ID del cliente (opcional)" },
          kind: { type: "string", enum: ["copy", "campaign_spec", "report", "research", "plan", "other"], description: "Tipo de entregable" },
          title: { type: "string", description: "Título corto del entregable" },
          content: { type: "string", description: "El entregable completo en markdown, autocontenido" },
          url: { type: "string", description: "Link relacionado (tarea ClickUp, Sheet, etc.) — opcional" },
        },
        required: ["kind", "title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_deliverables",
      description: "Lista los entregables guardados (por cliente o por issue), para reutilizar trabajo hecho en vez de rehacerlo.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "Filtrar por cliente (opcional)" },
          issueId: { type: "string", description: "Filtrar por issue (opcional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crm_request",
      description:
        "Operar el CRM PROPIO de LMTM (app FastAPI en crm.lmtmas.com) vía su API. El servidor maneja login y token; vos pasás método + path (relativo a /api, ej. '/users/', '/admin/overview') + body. Reglas en código: los GET y dry-runs (test-chat, channels test) son libres; las escrituras (crear usuario/cliente, conectar canal, editar agente IA) requieren OK humano — proponé en el issue y recién con aprobación pasá approved=true; DELETE, envío de mensajes, cambios de plan/suscripción y credenciales están PROHIBIDOS. Leé la skill lmtm-crm-propio antes de operar.",
      parameters: {
        type: "object",
        properties: {
          method: { type: "string", enum: ["GET", "POST", "PUT"], description: "Método HTTP" },
          path: { type: "string", description: "Path relativo a /api (ej. '/users/', '/pipeline/board', '/admin/companies')" },
          body: { type: "object", description: "Body JSON para POST/PUT (opcional)" },
          approved: { type: "boolean", description: "true SOLO si un humano ya aprobó explícitamente esta escritura en el issue" },
        },
        required: ["method", "path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_team_status",
      description:
        "Qué está haciendo AHORA el resto del equipo: issues en progreso o en review por agente (últimas 24h). Consultalo antes de arrancar un trabajo grande para no duplicar lo que otro colega ya está haciendo, o para saber a quién mencionar. Opcional 'clientId' para ver solo lo de un cliente.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string", description: "Filtrar por cliente (opcional)" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pause_ad_entity",
      description:
        "PAUSAR una campaña o conjunto de anuncios (adset) de Meta de un cliente — la única acción de escritura sobre pauta. Usala cuando detectes gasto sin conversiones, CTR muy bajo o un aviso quemando presupuesto. MUEVE plata real: proponé la pausa en el issue con la justificación (números concretos) y esperá OK humano; recién con aprobación pasá approved=true. El servidor verifica que la entidad sea de ESE cliente. NO existe reanudar/subir presupuesto/crear por esta vía (eso lo hace un humano).",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          entityType: { type: "string", enum: ["campaign", "adset"], description: "Tipo de entidad a pausar" },
          entityId: { type: "string", description: "ID de la campaña o adset (tal cual aparece en la data de Meta)" },
          approved: { type: "boolean", description: "true SOLO si un humano ya aprobó explícitamente esta pausa en el issue" },
        },
        required: ["clientId", "entityType", "entityId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_niche_intel",
      description:
        "Inteligencia del NICHO/rubro: benchmark de CTR/CPL (promedio vs ideal del mejor cuartil), formato de contenido ganador, experimento sugerido, mejor contenido y competidores de todos los clientes del rubro. Usalo para comparar a tu cliente contra sus pares, cruzar qué funciona en el nicho y generalizar lo que mejor rinde. Sin 'niche' devuelve el resumen de todos los nichos.",
      parameters: {
        type: "object",
        properties: { niche: { type: "string", description: "Rubro (ej. 'inmobiliaria', 'turismo-hoteleria', 'construccion-materiales'). Opcional." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_team_lessons",
      description:
        "Lee las lecciones de equipo acumuladas (limitaciones del sistema, patrones operativos, errores conocidos). Consultalo ANTES de diagnosticar problemas del sistema, escalar outages, o intentar operaciones que quizás otro agente ya descubrió que no funcionan.",
      parameters: { type: "object", properties: { area: { type: "string", description: "Filtrar por área (opcional)" } } },
    },
  },
  // ── Saldo / presupuesto de la cuenta publicitaria ────────────────────────
  {
    type: "function",
    function: {
      name: "get_client_balance",
      description:
        "Saldo REAL de las cuentas de Meta Ads del cliente: spend cap, gastado y lo que queda antes del tope (en la moneda de la cuenta). Usalo para detectar cuentas por frenarse por falta de presupuesto. Devuelve [] si el cliente no tiene cuenta mapeada.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string", description: "UUID del cliente" } },
        required: ["clientId"],
      },
    },
  },
  // ── Publicaciones orgánicas reales (IG + FB) ─────────────────────────────
  {
    type: "function",
    function: {
      name: "get_client_organic_posts",
      description:
        "Publicaciones orgánicas REALES sincronizadas de las redes del cliente (Instagram + Facebook) en las últimas N horas: texto, fecha, permalink, plataforma y tipo. Usalo para verificar si lo que se debía postear realmente salió. Devuelve [] si no hay datos sincronizados.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "UUID del cliente" },
          sinceHours: { type: "number", description: "Ventana en horas (default 168 = 7 días)" },
        },
        required: ["clientId"],
      },
    },
  },
  // ── Contenido programado (sheet de ClickUp Redes) ────────────────────────
  {
    type: "function",
    function: {
      name: "get_client_scheduled_content",
      description:
        "Contenido PROGRAMADO del cliente desde la lista de Redes Sociales de ClickUp dentro de una ventana: qué se planeó publicar, cuándo, su estado y si ya está marcado como publicado. Cruzalo con get_client_organic_posts para ver si el plan se cumple. Devuelve null si el cliente no tiene lista de Redes mapeada.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "UUID del cliente" },
          sinceHours: { type: "number", description: "Horas hacia atrás (default 168 = 7 días)" },
          aheadHours: { type: "number", description: "Horas hacia adelante (default 336 = 14 días)" },
        },
        required: ["clientId"],
      },
    },
  },
  // ── Alerta de saldo por WhatsApp (NO crear issues para saldo) ────────────
  {
    type: "function",
    function: {
      name: "send_balance_alert",
      description:
        "Envía una alerta de saldo bajo por WhatsApp al equipo de la agencia. Usalo SIEMPRE que detectes saldo bajo / pauta frenada / spend_cap agotado. NUNCA crees issues para alertas de saldo — van por WhatsApp con esta tool.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "UUID del cliente" },
          message: { type: "string", description: "Mensaje de la alerta (ej. 'MAERS: spend_cap agotado, pauta frenada, recargar urgente')" },
        },
        required: ["clientId", "message"],
      },
    },
  },
  // ── Reporte genérico por WhatsApp (cuando el equipo lo pide) ─────────────
  {
    type: "function",
    function: {
      name: "send_whatsapp_report",
      description:
        "Envía un reporte/mensaje por WhatsApp al equipo de la agencia. Usalo cuando el equipo te pide que reportes/avises algo por WhatsApp (un resumen, un estado, un hallazgo, lo que sea). Para alertas de saldo usá send_balance_alert. El texto se manda tal cual al número interno del equipo.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Texto del reporte a enviar (markdown de WhatsApp: *negrita*, _itálica_, saltos de línea)." },
          title: { type: "string", description: "Título opcional para encabezar el reporte (ej. 'Reporte de pauta - DUNOD')." },
        },
        required: ["message"],
      },
    },
  },
  // ── Crear tarea para un cliente (detección de pendientes) ────────────────
  {
    type: "function",
    function: {
      name: "create_client_task",
      description:
        "Crea una tarea (issue) asociada a un cliente cuando detectás un pendiente real (ej. algo que surgió en un grupo de WhatsApp, una corrección a hacer, un seguimiento). NO uses esto para alertas de saldo/presupuesto — esas van por WhatsApp con send_balance_alert. Las tareas INTERNAS (operativas, sin contacto al cliente ni gasto) se crean activas. Las EXTERNAS (contactar al cliente, gastar plata, publicar algo) quedan en estado 'para aprobar'. Evitá duplicar: si la tarea ya existe abierta para ese cliente, no la repitas.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "UUID del cliente (de list_clients)" },
          title: { type: "string", description: "Título corto y accionable de la tarea" },
          description: { type: "string", description: "Detalle / contexto de la tarea (markdown)" },
          taskType: {
            type: "string",
            enum: ["internal", "external"],
            description: "internal = operativa interna (se crea activa); external = implica al cliente o gasto (queda para aprobar). Default internal.",
          },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Prioridad (default medium)" },
          source: { type: "string", description: "De dónde salió la tarea (ej. 'grupo WhatsApp X', 'auditoría', default 'agente')" },
        },
        required: ["clientId", "title"],
      },
    },
  },
];

function actorContext(req: Request): { agentId: string; companyId: string; runId: string } | null {
  if (req.actor.type === "agent") {
    return {
      agentId: req.actor.agentId ?? "",
      companyId: req.actor.companyId ?? "",
      runId: req.actor.runId ?? "",
    };
  }
  return null;
}

export function agentToolsRoutes(
  db: Db,
  deps: { toolDispatcher?: PluginToolDispatcher | null } = {},
): Router {
  const router = Router();
  const issuesSvc = issueService(db);
  const dispatcher = deps.toolDispatcher ?? null;

  function pluginToolDefs(): ToolDef[] {
    if (!dispatcher) return [];
    try {
      return dispatcher.listToolsForAgent().map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters:
            t.parametersSchema && Object.keys(t.parametersSchema).length > 0
              ? t.parametersSchema
              : { type: "object", properties: {} },
        },
      }));
    } catch {
      return [];
    }
  }

  // GET /api/agent-tools — list every tool the agent can call (MiniMax/OpenAI format).
  router.get("/agent-tools", (req, res) => {
    if (req.actor.type === "none") throw unauthorized("Authentication required");
    res.json({ tools: [...CORE_TOOLS, ...pluginToolDefs()] });
  });

  // POST /api/agent-tools/execute — run a tool by name. Always returns 200 with
  // { ok, content } so the adapter can feed the result (success OR error) back to
  // the model as a tool message and let it recover.
  router.post("/agent-tools/execute", async (req, res) => {
    const ctx = actorContext(req);
    if (!ctx) throw unauthorized("Agent authentication required");
    const body = (req.body ?? {}) as { tool?: unknown; parameters?: unknown };
    const tool = typeof body.tool === "string" ? body.tool : "";
    const params = (body.parameters ?? {}) as Record<string, unknown>;
    const issueRef = typeof params.issueId === "string" ? params.issueId : "";

    const reply = (ok: boolean, content: string) => res.json({ ok, content });

    try {
      if (tool === "get_issue") {
        const issue = await issuesSvc.getById(issueRef);
        if (!issue) return reply(false, `Issue "${issueRef}" no encontrado.`);
        return reply(
          true,
          JSON.stringify({
            id: (issue as Record<string, unknown>).identifier ?? issue.id,
            title: issue.title,
            status: issue.status,
            description:
              (issue as Record<string, unknown>).description ??
              (issue as Record<string, unknown>).body ??
              "",
          }),
        );
      }

      if (tool === "post_comment") {
        const issue = await issuesSvc.getById(issueRef);
        if (!issue) return reply(false, `Issue "${issueRef}" no encontrado.`);
        const text = typeof params.body === "string" ? params.body : "";
        if (!text.trim()) return reply(false, "El comentario está vacío.");
        await issuesSvc.addComment(issue.id, text, { agentId: ctx.agentId, runId: ctx.runId });
        return reply(true, "Comentario publicado en el issue.");
      }

      if (tool === "set_issue_status") {
        const issue = await issuesSvc.getById(issueRef);
        if (!issue) return reply(false, `Issue "${issueRef}" no encontrado.`);
        const status = typeof params.status === "string" ? params.status : "";
        const allowed = ["done", "in_progress", "blocked", "backlog", "todo", "cancelled"];
        if (!allowed.includes(status)) return reply(false, `Estado inválido: "${status}".`);
        await issuesSvc.update(issue.id, {
          status: status as never,
          actorAgentId: ctx.agentId,
        });
        // Automatic learning: when work on a client issue is completed, record an
        // event in the client brain so the system learns from everything it does
        // (a factual trail of what was resolved — NOT unverified conclusions).
        if (status === "done") {
          const clientId = (issue as Record<string, unknown>).clientId as string | undefined;
          if (clientId) {
            try {
              const companyId = (await resolveCompanyId(db, clientId)) ?? ctx.companyId;
              if (companyId) {
                const last = await issuesSvc.listComments(issue.id, { order: "desc", limit: 1 });
                const summary = (last[0]?.body ?? "").trim().slice(0, 600);
                const identifier = String((issue as Record<string, unknown>).identifier ?? issue.id);
                const content = summary
                  ? `Resuelto "${issue.title}": ${summary}`
                  : `Resuelto "${issue.title}".`;
                await upsertMemory(db, {
                  companyId,
                  clientId,
                  kind: "event",
                  key: `issue-${identifier}`,
                  content,
                  source: `agente:${ctx.agentId ?? "?"}`,
                  confidence: 0.8,
                });
              }
            } catch { /* learning is best-effort; never block the status change */ }
          }
        }
        return reply(true, `Estado del issue cambiado a "${status}".`);
      }

      if (tool === "list_clients") {
        const rows = await db
          .select({ id: clients.id, name: clients.name, slug: clients.slug })
          .from(clients)
          .where(eq(clients.status, "active"))
          .limit(200);
        return reply(true, JSON.stringify(rows));
      }

      if (tool === "get_client_brain") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const brain = await getBrainContext(db, clientId, 4000);
        return reply(true, brain || "(El cliente todavía no tiene memoria cargada.)");
      }

      if (tool === "get_client_competitors") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const rows = await db.select().from(competitors).where(eq(competitors.clientId, clientId)).limit(50);
        const out = rows.map((c) => ({
          name: c.name,
          fbPageUrl: c.fbPageUrl,
          igHandle: c.igHandle,
          website: c.website,
          notes: c.notes,
          sampleAds: (c.sampleAds ?? []).length,
        }));
        return reply(true, JSON.stringify(out));
      }

      if (tool === "get_client_ads_performance") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const days =
          typeof params.sinceDays === "number" && params.sinceDays > 0 ? Math.min(365, params.sinceDays) : 30;
        const until = new Date();
        const since = new Date(until.getTime() - days * 86_400_000);
        const agg = await aggInsights(db, clientId, since.toISOString(), until.toISOString());
        const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
        const cpl = agg.leads > 0 ? agg.spend / agg.leads : null;
        const cpc = agg.clicks > 0 ? agg.spend / agg.clicks : null;
        return reply(
          true,
          JSON.stringify({
            windowDays: days,
            spend: Math.round(agg.spend),
            impressions: agg.impressions,
            clicks: agg.clicks,
            leads: agg.leads,
            reach: agg.reach,
            ctrPct: Number(ctr.toFixed(2)),
            cpl: cpl != null ? Number(cpl.toFixed(2)) : null,
            cpc: cpc != null ? Number(cpc.toFixed(2)) : null,
          }),
        );
      }

      if (tool === "get_client_balance") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        if (!clientId) return reply(false, "Falta clientId.");
        const balances = await fetchAccountBalances(db, undefined, { clientId });
        if (balances.length === 0) {
          return reply(true, "(Sin cuentas de Meta mapeadas a este cliente — no se puede leer saldo. Mapear la cuenta en 'Conectar ad account'.)");
        }
        const out = balances.map((b) => ({
          account: b.account,
          currency: b.currency,
          spendCap: b.spendCap,
          amountSpent: b.amountSpent,
          remaining: b.remaining, // null = sin tope (uncapped/prepago)
          low: b.low,
          accountStatus: b.accountStatus,
        }));
        return reply(true, JSON.stringify(out));
      }

      if (tool === "get_client_organic_posts") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        if (!clientId) return reply(false, "Falta clientId.");
        const hours = typeof params.sinceHours === "number" && params.sinceHours > 0 ? Math.min(24 * 90, params.sinceHours) : 168;
        const since = new Date(Date.now() - hours * 3_600_000);
        const maps = await db
          .select({ pageId: adsAccountMappings.pageId })
          .from(adsAccountMappings)
          .where(eq(adsAccountMappings.clientId, clientId));
        const pageIds = [...new Set(maps.map((m) => m.pageId).filter((p): p is string => !!p))];
        const match = pageIds.length
          ? or(eq(organicPosts.clientId, clientId), inArray(organicPosts.pageId, pageIds))
          : eq(organicPosts.clientId, clientId);
        const rows = await db
          .select({
            platform: organicPosts.platform,
            message: organicPosts.message,
            permalinkUrl: organicPosts.permalinkUrl,
            postType: organicPosts.postType,
            createdTime: organicPosts.createdTime,
          })
          .from(organicPosts)
          .where(and(gte(organicPosts.createdTime, since), match))
          .orderBy(desc(organicPosts.createdTime))
          .limit(50);
        if (rows.length === 0) {
          return reply(true, "(Sin publicaciones orgánicas sincronizadas en la ventana. Si el cliente publica pero no aparece, falta reconectar la página de Meta o no se sincronizó todavía.)");
        }
        const out = rows.map((r) => ({
          platform: r.platform,
          type: r.postType,
          text: (r.message ?? "").slice(0, 280),
          permalink: r.permalinkUrl,
          publishedAt: r.createdTime?.toISOString() ?? null,
        }));
        return reply(true, JSON.stringify({ windowHours: hours, count: out.length, posts: out }));
      }

      if (tool === "get_client_scheduled_content") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        if (!clientId) return reply(false, "Falta clientId.");
        const back = typeof params.sinceHours === "number" && params.sinceHours > 0 ? params.sinceHours : 168;
        const ahead = typeof params.aheadHours === "number" && params.aheadHours > 0 ? params.aheadHours : 336;
        const now = Date.now();
        const items = await getRedesScheduledContent(db, clientId, now - back * 3_600_000, now + ahead * 3_600_000);
        if (items === null) {
          return reply(true, "(El cliente no tiene la lista de Redes Sociales de ClickUp mapeada — sincronizar ClickUp del cliente.)");
        }
        return reply(true, JSON.stringify({ count: items.length, items }));
      }

      if (tool === "send_balance_alert") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const message = typeof params.message === "string" ? params.message : "";
        if (!clientId || !message) return reply(false, "Falta clientId o message.");
        const team = alertsNumber();
        if (!team) return reply(false, "LMTM_ALERTS_WHATSAPP no configurado — no se puede enviar.");
        const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId));
        const clientName = client?.name ?? "Cliente";
        const text = `*⚠️ Alerta de saldo — ${clientName}*\n\n${message}\n\n_Recargá el presupuesto / subí el spend cap para que no se frene la pauta._\n_LMTM-OS · agente_`;
        const r = await sendWhatsAppToNumber(team, text);
        if (!r.ok) return reply(false, `No se pudo enviar WhatsApp: ${r.error ?? "error desconocido"}`);
        return reply(true, `Alerta de saldo enviada por WhatsApp al equipo para ${clientName}.`);
      }

      if (tool === "send_whatsapp_report") {
        const message = typeof params.message === "string" ? params.message.trim() : "";
        const title = typeof params.title === "string" ? params.title.trim() : "";
        if (!message) return reply(false, "Falta message.");
        const team = alertsNumber();
        if (!team) return reply(false, "LMTM_ALERTS_WHATSAPP no configurado — no se puede enviar.");
        const text = `${title ? `*${title}*\n\n` : ""}${message}\n\n_LMTM-OS · reporte de agente_`;
        const r = await sendWhatsAppToNumber(team, text);
        if (!r.ok) return reply(false, `No se pudo enviar WhatsApp: ${r.error ?? "error desconocido"}`);
        return reply(true, "Reporte enviado por WhatsApp al equipo.");
      }

      // ClickUp tools (in-process MCP wrapper).
      if (tool === "clickup_list_workspaces") {
        if (!process.env.CLICKUP_API_TOKEN) {
          return reply(false, "CLICKUP_API_TOKEN no configurado en el server.");
        }
        try {
          const r = await clickupTools.listWorkspaces();
          return reply(true, JSON.stringify(r));
        } catch (e) {
          return reply(false, `clickup_list_workspaces: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "clickup_list_spaces") {
        if (!process.env.CLICKUP_API_TOKEN) {
          return reply(false, "CLICKUP_API_TOKEN no configurado en el server.");
        }
        const workspaceId = typeof params.workspaceId === "string" ? params.workspaceId : "";
        if (!workspaceId) return reply(false, "Falta workspaceId.");
        try {
          const r = await clickupTools.listSpaces({ workspaceId });
          return reply(true, JSON.stringify(r));
        } catch (e) {
          return reply(false, `clickup_list_spaces: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "clickup_list_lists") {
        if (!process.env.CLICKUP_API_TOKEN) {
          return reply(false, "CLICKUP_API_TOKEN no configurado en el server.");
        }
        const folderId = typeof params.folderId === "string" ? params.folderId : "";
        if (!folderId) return reply(false, "Falta folderId.");
        try {
          const r = await clickupTools.listLists({ folderId });
          return reply(true, JSON.stringify(r));
        } catch (e) {
          return reply(false, `clickup_list_lists: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "clickup_list_tasks") {
        if (!process.env.CLICKUP_API_TOKEN) {
          return reply(false, "CLICKUP_API_TOKEN no configurado en el server.");
        }
        const listId = typeof params.listId === "string" ? params.listId : "";
        if (!listId) return reply(false, "Falta listId.");
        const limit = typeof params.limit === "number" && params.limit > 0 ? Math.min(100, params.limit) : 50;
        try {
          const r = await clickupTools.listTasks({ listId, limit });
          return reply(true, JSON.stringify(r));
        } catch (e) {
          return reply(false, `clickup_list_tasks: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "clickup_create_task") {
        if (!process.env.CLICKUP_API_TOKEN) {
          return reply(false, "CLICKUP_API_TOKEN no configurado en el server.");
        }
        const listId = typeof params.listId === "string" ? params.listId : "";
        const name = typeof params.name === "string" ? params.name.trim() : "";
        if (!listId || !name) return reply(false, "Faltan listId o name.");
        try {
          const r = await clickupTools.createTask({
            listId,
            name,
            description: typeof params.description === "string" ? params.description : undefined,
            priority: typeof params.priority === "number" ? params.priority : undefined,
            dueDate: typeof params.dueDate === "number" ? params.dueDate : undefined,
          });
          return reply(true, JSON.stringify(r));
        } catch (e) {
          return reply(false, `clickup_create_task: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Google Sheets tools (in-process MCP wrapper).
      if (tool === "sheets_read") {
        if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
          return reply(false, "Google OAuth no configurado en el server (GOOGLE_OAUTH_REFRESH_TOKEN).");
        }
        const spreadsheetId = typeof params.spreadsheetId === "string" ? params.spreadsheetId : "";
        const range = typeof params.range === "string" ? params.range : "";
        if (!spreadsheetId || !range) return reply(false, "Faltan spreadsheetId o range.");
        try {
          const r = await googleTools.sheetsRead({ spreadsheetId, range });
          return reply(true, JSON.stringify(r));
        } catch (e) {
          return reply(false, `sheets_read: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "sheets_append") {
        if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
          return reply(false, "Google OAuth no configurado en el server (GOOGLE_OAUTH_REFRESH_TOKEN).");
        }
        const spreadsheetId = typeof params.spreadsheetId === "string" ? params.spreadsheetId : "";
        const range = typeof params.range === "string" ? params.range : "";
        const values = Array.isArray(params.values) ? (params.values as unknown[][]) : null;
        if (!spreadsheetId || !range || !values) return reply(false, "Faltan spreadsheetId, range o values.");
        try {
          const r = await googleTools.sheetsAppend({ spreadsheetId, range, values });
          return reply(true, JSON.stringify(r));
        } catch (e) {
          return reply(false, `sheets_append: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "create_client_task") {
        const r = await createClientTask(db, {
          clientId: typeof params.clientId === "string" ? params.clientId : "",
          title: typeof params.title === "string" ? params.title : "",
          description: typeof params.description === "string" ? params.description : undefined,
          taskType: params.taskType === "external" ? "external" : "internal",
          priority: typeof params.priority === "string" ? (params.priority as never) : undefined,
          source: typeof params.source === "string" ? params.source : undefined,
          createdByAgentId: ctx.agentId || null,
          fallbackCompanyId: ctx.companyId,
        });
        if (!r.created && !r.duplicate) return reply(false, r.message);
        if (r.duplicate) return reply(true, `${r.message} (${r.identifier ?? "sin id"}) No se duplicó.`);
        return reply(true, `${r.message} ${r.identifier ?? ""}`.trim());
      }

      if (tool === "get_client_scores") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const [row] = await db
          .select()
          .from(accountScores)
          .where(eq(accountScores.clientId, clientId))
          .orderBy(desc(accountScores.date))
          .limit(1);
        if (!row) return reply(true, "(Sin scores calculados todavía para este cliente.)");
        return reply(true, JSON.stringify({ date: row.date, healthScore: row.healthScore, opsScore: row.opsScore }));
      }

      if (tool === "portfolio_snapshot") {
        const since7 = dayStr(new Date(Date.now() - 7 * 86_400_000));
        const [totals] = await db.select({
          spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0)`,
          leads: sql<number>`coalesce(sum(${adsInsights.leads}), 0)::int`,
          clientsWithData: sql<number>`count(distinct ${adsInsights.clientId})::int`,
        }).from(adsInsights).where(gte(adsInsights.date, since7));
        const [active] = await db.select({ n: sql<number>`count(*)::int` })
          .from(clients).where(eq(clients.status, "active"));
        const [alerting] = await db.select({ n: sql<number>`count(distinct ${adsAlerts.clientId})::int` })
          .from(adsAlerts).where(inArray(adsAlerts.status, ["pending", "acknowledged"]));
        return reply(true, JSON.stringify({
          windowDays: 7,
          activeClients: Number(active?.n ?? 0),
          clientsWithAdsData: Number(totals?.clientsWithData ?? 0),
          totalSpend: Math.round(Number(totals?.spend ?? 0)),
          totalLeads: Number(totals?.leads ?? 0),
          clientsWithOpenAlerts: Number(alerting?.n ?? 0),
          note: "Si tu cliente cayó pero el agregado está estable, el problema es de ESE cliente. Si cayó todo, es sistémico (verificá antes de escalar por cliente).",
        }));
      }

      if (tool === "remember_about_client") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const key = typeof params.key === "string" ? params.key.slice(0, 120) : "";
        const content = typeof params.content === "string" ? params.content : "";
        if (!clientId || !key || !content.trim()) return reply(false, "Faltan clientId, key o content.");
        const kind = (typeof params.kind === "string" ? params.kind : "fact") as MemoryKind;
        const companyId = (await resolveCompanyId(db, clientId)) ?? ctx.companyId;
        await upsertMemory(db, { companyId, clientId, kind, key, content, source: `agent:${ctx.agentId}` });
        return reply(true, "Aprendizaje guardado en la memoria del cliente.");
      }

      // Team-level lessons live in `learnings` (scope "team"), NOT client_memory:
      // its unique index treats NULL client_id as distinct, so a client-less
      // memory row could never upsert. learnings' (scope, scopeKey, pattern) key
      // works and the table already feeds reports/agents.
      if (tool === "remember_team_lesson") {
        const area = typeof params.area === "string" ? params.area.trim().toLowerCase().slice(0, 60) : "";
        const lesson = typeof params.lesson === "string" ? params.lesson.trim().slice(0, 1200) : "";
        if (!area || !lesson) return reply(false, "Faltan area o lesson.");
        await db.insert(learnings).values({
          companyId: ctx.companyId, scope: "team", scopeKey: area, pattern: lesson,
          evidence: { agentId: ctx.agentId }, metricImpact: "team_ops",
          confidence: "0.7", occurrences: 1, lastSeenAt: new Date(),
        }).onConflictDoUpdate({
          target: [learnings.scope, learnings.scopeKey, learnings.pattern],
          set: { occurrences: sql`${learnings.occurrences} + 1`, lastSeenAt: new Date() },
        });
        return reply(true, "Lección de equipo guardada — visible para todos los agentes.");
      }

      if (tool === "save_hook") {
        const text = typeof params.text === "string" ? params.text.trim().slice(0, 600) : "";
        if (!text) return reply(false, "Falta text (el gancho).");
        const clientId = typeof params.clientId === "string" && params.clientId ? params.clientId : null;
        let niche = typeof params.niche === "string" && params.niche.trim() ? params.niche.trim() : null;
        if (!niche && clientId) {
          const [c] = await db.select({ industry: clients.industry }).from(clients).where(eq(clients.id, clientId));
          niche = c?.industry ?? null;
        }
        const [row] = await db.insert(hooks).values({
          clientId, niche, text,
          sourceKind: typeof params.sourceKind === "string" ? params.sourceKind : "manual",
          sourceRef: typeof params.sourceRef === "string" ? params.sourceRef.slice(0, 300) : null,
          format: typeof params.format === "string" ? params.format.slice(0, 40) : null,
          views: Number.isFinite(Number(params.views)) && params.views != null ? Number(params.views) : null,
        }).returning({ id: hooks.id });
        return reply(true, `Gancho guardado en el baúl [id ${row?.id ?? "?"}]${clientId ? "" : " (global del nicho)"}.`);
      }

      if (tool === "search_hooks") {
        const conds = [];
        const clientId = typeof params.clientId === "string" && params.clientId ? params.clientId : null;
        if (clientId) {
          const [c] = await db.select({ industry: clients.industry }).from(clients).where(eq(clients.id, clientId));
          conds.push(c?.industry
            ? or(eq(hooks.clientId, clientId), and(isNull(hooks.clientId), eq(hooks.niche, c.industry)))
            : eq(hooks.clientId, clientId));
        }
        if (typeof params.niche === "string" && params.niche.trim()) conds.push(eq(hooks.niche, params.niche.trim()));
        if (typeof params.q === "string" && params.q.trim()) conds.push(sql`${hooks.text} ILIKE ${"%" + params.q.trim() + "%"}`);
        const rows = await db.select().from(hooks).where(conds.length ? and(...conds) : undefined)
          .orderBy(desc(hooks.pinned), desc(hooks.timesUsed), desc(hooks.createdAt)).limit(40);
        if (rows.length === 0) return reply(true, "Baúl vacío para ese filtro. Podés cosechar ganchos de posts top o competidores con save_hook.");
        return reply(true, JSON.stringify(rows.map((h) => ({
          id: h.id, text: h.text, niche: h.niche, source: h.sourceKind, ref: h.sourceRef,
          format: h.format, views: h.views, usado: h.timesUsed, pin: h.pinned,
        }))));
      }

      if (tool === "save_trend") {
        const title = typeof params.title === "string" ? params.title.trim().slice(0, 300) : "";
        if (!title) return reply(false, "Falta title.");
        await db.insert(trends).values({
          day: dayStr(new Date()),
          title,
          url: typeof params.url === "string" ? params.url.slice(0, 500) : null,
          source: typeof params.source === "string" ? params.source.slice(0, 120) : null,
          tag: ["potencial-de-gancho", "explicativo", "ignorar"].includes(params.tag as string) ? (params.tag as string) : "potencial-de-gancho",
          niches: Array.isArray(params.niches) ? (params.niches as unknown[]).map(String).slice(0, 20) : [],
          summary: typeof params.summary === "string" ? params.summary.slice(0, 1000) : null,
        });
        return reply(true, "Tendencia guardada en el panel.");
      }

      if (tool === "save_deliverable") {
        const kind = typeof params.kind === "string" ? params.kind : "other";
        const title = typeof params.title === "string" ? params.title.slice(0, 200) : "";
        const content = typeof params.content === "string" ? params.content : "";
        if (!title.trim() || !content.trim()) return reply(false, "Faltan title o content.");
        // Resolve optional issue (accepts id or LMTM-N identifier) and client.
        let issueId: string | null = null;
        if (typeof params.issueId === "string" && params.issueId) {
          const iss = await issuesSvc.getById(params.issueId).catch(() => null);
          issueId = iss ? String((iss as Record<string, unknown>).id) : null;
        }
        const clientId = typeof params.clientId === "string" && params.clientId ? params.clientId : null;
        const companyId = clientId ? ((await resolveCompanyId(db, clientId)) ?? ctx.companyId) : ctx.companyId;
        const [row] = await db.insert(agentDeliverables).values({
          companyId, issueId, clientId, agentId: ctx.agentId,
          kind, title, content: content.slice(0, 20000),
          url: typeof params.url === "string" ? params.url.slice(0, 500) : null,
        }).returning({ id: agentDeliverables.id });
        return reply(true, `Entregable guardado (${kind}): "${title}" [id ${row?.id ?? "?"}].`);
      }

      if (tool === "list_deliverables") {
        const conds = [eq(agentDeliverables.companyId, ctx.companyId)];
        if (typeof params.clientId === "string" && params.clientId) conds.push(eq(agentDeliverables.clientId, params.clientId));
        if (typeof params.issueId === "string" && params.issueId) {
          const iss = await issuesSvc.getById(params.issueId).catch(() => null);
          if (iss) conds.push(eq(agentDeliverables.issueId, String((iss as Record<string, unknown>).id)));
        }
        const rows = await db.select({ id: agentDeliverables.id, kind: agentDeliverables.kind, title: agentDeliverables.title, url: agentDeliverables.url, createdAt: agentDeliverables.createdAt })
          .from(agentDeliverables).where(and(...conds)).orderBy(desc(agentDeliverables.createdAt)).limit(30);
        if (rows.length === 0) return reply(true, "Sin entregables guardados todavía.");
        return reply(true, rows.map((r) => `[${r.kind}] ${r.title}${r.url ? ` — ${r.url}` : ""} (${r.createdAt.toISOString().slice(0, 10)}, id ${r.id})`).join("\n"));
      }

      if (tool === "crm_request") {
        const m = typeof params.method === "string" ? params.method : "GET";
        const path = typeof params.path === "string" ? params.path : "";
        if (!path) return reply(false, "Falta 'path'.");
        const { crmRequest } = await import("../services/crm-client.js");
        const r = await crmRequest(m, path, params.body, { approved: params.approved === true });
        if (r.approvalRequired) return reply(false, r.error ?? "Requiere aprobación humana.");
        if (!r.ok) return reply(false, r.error ?? `CRM error ${r.status}`);
        return reply(true, JSON.stringify(r.data).slice(0, 7000));
      }

      if (tool === "get_team_status") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const conds = [inArray(issues.status, ["in_progress", "in_review"] as never)];
        if (clientId) conds.push(eq(issues.clientId, clientId));
        const rows = await db.select({
          identifier: issues.identifier, title: issues.title, status: issues.status,
          agent: agents.name, updatedAt: issues.updatedAt, clientId: issues.clientId,
        }).from(issues).leftJoin(agents, eq(agents.id, issues.assigneeAgentId))
          .where(and(...conds)).orderBy(desc(issues.updatedAt)).limit(40);
        if (rows.length === 0) return reply(true, "Nadie tiene issues en progreso/review ahora mismo.");
        const lines = rows.map((r) => `${r.agent ?? "(sin asignar)"} — ${r.identifier ?? ""} [${r.status}]: ${(r.title ?? "").slice(0, 60)}`);
        return reply(true, "Trabajo en curso del equipo:\n" + lines.join("\n"));
      }

      if (tool === "pause_ad_entity") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const entityType = params.entityType === "adset" ? "adset" : "campaign";
        const entityId = typeof params.entityId === "string" ? params.entityId : "";
        if (!clientId || !entityId) return reply(false, "Faltan clientId o entityId.");
        const { pauseAdEntity } = await import("../services/ads-actions.js");
        const r = await pauseAdEntity(db, { clientId, entityType, entityId, agentId: ctx.agentId, approved: params.approved === true });
        if (r.approvalRequired) return reply(false, r.error ?? "Requiere aprobación humana.");
        if (!r.ok) return reply(false, r.error ?? "No se pudo pausar.");
        return reply(true, `Pausado: ${r.entity?.type} "${r.entity?.name}" (${r.entity?.id}). Acción registrada.`);
      }

      if (tool === "get_niche_intel") {
        const niche = typeof params.niche === "string" ? params.niche.trim().toLowerCase() : "";
        const scopes = ["niche", "niche_benchmark", "niche_experiment"];
        const conds = [inArray(learnings.scope, scopes)];
        if (niche) conds.push(eq(learnings.scopeKey, niche));
        const rows = await db.select().from(learnings).where(and(...conds)).orderBy(learnings.scopeKey);
        if (rows.length === 0) return reply(true, niche ? `Sin inteligencia minada para el nicho "${niche}" todavía (se mina cada 24h; necesita >=2 clientes con pauta).` : "Sin inteligencia de nichos minada todavía.");
        const lines: string[] = [];
        const label: Record<string, string> = { niche: "Formato ganador", niche_benchmark: "Benchmark", niche_experiment: "Experimento sugerido" };
        for (const r of rows) lines.push(`[${r.scopeKey}] ${label[r.scope] ?? r.scope}: ${r.pattern}`);
        if (niche) {
          const top = await db.select({ title: contentPerformance.title, format: contentPerformance.format, score: contentPerformance.score, clientName: clients.name })
            .from(contentPerformance)
            .innerJoin(clients, eq(contentPerformance.clientId, clients.id))
            .where(and(eq(clients.status, "active"), eq(clients.industry, niche)))
            .orderBy(desc(contentPerformance.score)).limit(5);
          if (top.length) {
            lines.push("", "Mejor contenido del nicho:");
            for (const t of top) lines.push(`- "${t.title ?? "(sin título)"}" (${t.format ?? "?"}, score ${Math.round(Number(t.score ?? 0))}) — ${t.clientName}`);
          }
          const comps = await db.select({ name: competitors.name, clientName: clients.name })
            .from(competitors).innerJoin(clients, eq(competitors.clientId, clients.id))
            .where(and(eq(clients.status, "active"), eq(clients.industry, niche))).limit(15);
          if (comps.length) {
            lines.push("", "Competidores del nicho (cargados por los clientes):");
            for (const c of comps) lines.push(`- ${c.name} (competidor de ${c.clientName})`);
          }
        }
        return reply(true, lines.join("\n").slice(0, 6000));
      }

      if (tool === "get_team_lessons") {
        const area = typeof params.area === "string" ? params.area.trim().toLowerCase() : "";
        const conds = [eq(learnings.scope, "team")];
        if (area) conds.push(eq(learnings.scopeKey, area));
        const rows = await db.select({ area: learnings.scopeKey, lesson: learnings.pattern, occurrences: learnings.occurrences, lastSeenAt: learnings.lastSeenAt })
          .from(learnings).where(and(...conds)).orderBy(desc(learnings.lastSeenAt)).limit(30);
        if (rows.length === 0) return reply(true, "Sin lecciones de equipo registradas todavía.");
        return reply(true, rows.map((r) => `[${r.area}] ${r.lesson} (visto ${r.occurrences}x)`).join("\n"));
      }

      // Plugin tool.
      if (dispatcher && dispatcher.getTool(tool)) {
        let projectId = ctx.companyId;
        if (issueRef) {
          const issue = await issuesSvc.getById(issueRef);
          const pid = issue ? (issue as Record<string, unknown>).projectId : null;
          if (typeof pid === "string" && pid) projectId = pid;
        }
        const result = await dispatcher.executeTool(tool, params, {
          agentId: ctx.agentId,
          runId: ctx.runId,
          companyId: ctx.companyId,
          projectId,
        });
        const content = typeof result === "string" ? result : JSON.stringify(result);
        return reply(true, content.slice(0, 8000));
      }

      return reply(false, `Tool "${tool}" no encontrada.`);
    } catch (err) {
      return reply(false, `Error ejecutando "${tool}": ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  return router;
}
