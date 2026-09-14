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
import { clients, competitors, accountScores, organicPosts, adsAccountMappings, adsInsights, adsAlerts, learnings, contentPerformance, agentDeliverables, hooks, issues, agents, trends, nicheReports } from "@paperclipai/db";
import { isNotNull, isNull, ne } from "drizzle-orm";
import { desc, eq, and, gte, or, inArray, sql } from "drizzle-orm";
import { issueService } from "../services/issues.js";
import type { PluginToolDispatcher } from "../services/plugin-tool-dispatcher.js";
import { getBrainContext, upsertMemory, type MemoryKind } from "../services/customer-brain.js";
import { aggInsights, dayStr, sendWhatsAppToNumber, alertsNumber } from "../services/agency-ops.js";
import { fetchAccountBalances } from "../services/balance-monitor.js";
import { getRedesScheduledContent, getRedesCalendar } from "../services/clickup-sync.js";
import { createClientTask } from "../services/client-tasks.js";
import { clickupTools, googleTools } from "../services/agent-mcp-tools.js";
import { resolveCompanyId } from "../services/intel-common.js";
import { canonicalizeNiches, trendMatchesIndustry } from "../services/niche-slugs.js";
import {
  esDeAccion,
  mensajeDeBloqueo,
  modoDeAgente,
  puedeUsar,
  MODO_POR_DEFECTO,
  type ModoAgente,
} from "../services/agent-modo.js";
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
      name: "save_niche_report",
      description:
        "Guarda el RADAR DE NICHO semanal: informe accionable por rubro que ve el equipo en el panel de Nichos. Secciones: analisisCruzado (qué funciona entre NUESTROS clientes del rubro, orgánico y pauta por separado, con números), referentes (cuentas EXTERNAS tendencia del rubro — BsAs/otro país, TikTok/IG/Ads Library — con urlPerfil y urlEjemplo REALES), ideas (cada una con titulo + detalle + url de REFERENCIA de donde salió — si la sacaste de redes porque funciona, el link es OBLIGATORIO), planPorCliente (2-3 movidas concretas por cliente del rubro: para dónde ir, no datos). Upsert por rubro+semana.",
      parameters: {
        type: "object",
        properties: {
          niche: { type: "string", description: "Rubro canónico (slug de clients.industry)" },
          analisisCruzado: {
            type: "object",
            properties: {
              organico: { type: "string", description: "Qué está funcionando en orgánico entre nuestros clientes del rubro (formatos, ganchos, cadencia) y cómo se compara con el benchmark" },
              pauta: { type: "string", description: "Qué está funcionando en pauta (CTR/CPL reales vs benchmark, campañas ganadoras) y qué están pautando los referentes externos" },
            },
          },
          referentes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                cuenta: { type: "string", description: "@usuario" },
                plataforma: { type: "string", description: "instagram | tiktok | meta-ads" },
                ubicacion: { type: "string", description: "ej. Buenos Aires, México, España" },
                queHacen: { type: "string", description: "Qué hacen que funciona (orgánico y/o pauta)" },
                urlPerfil: { type: "string" },
                urlEjemplo: { type: "string", description: "Link a un post/reel/anuncio concreto" },
              },
              required: ["nombre"],
            },
          },
          ideas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                titulo: { type: "string" },
                detalle: { type: "string", description: "Qué es, por qué funciona, cómo lo adaptamos" },
                url: { type: "string", description: "Link de referencia (OBLIGATORIO si salió de redes)" },
                fuente: { type: "string", description: "De dónde salió (cuenta/plataforma)" },
              },
              required: ["titulo"],
            },
          },
          planPorCliente: {
            type: "array",
            items: {
              type: "object",
              properties: {
                cliente: { type: "string" },
                clientId: { type: "string" },
                movidas: { type: "array", items: { type: "string" }, description: "2-3 acciones concretas de dirección" },
              },
              required: ["cliente", "movidas"],
            },
          },
        },
        required: ["niche"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_client_competitor",
      description:
        "Carga un COMPETIDOR del cliente: un negocio REAL y EXTERNO del mismo rubro/zona (NUNCA otro cliente de la agencia — el sistema lo rechaza). Pasá al menos una fuente verificable (igHandle, fbPageUrl o website). Dedupe automático por nombre.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          name: { type: "string", description: "Nombre del competidor" },
          igHandle: { type: "string", description: "@usuario de Instagram (sin URL)" },
          fbPageUrl: { type: "string", description: "URL de la página de Facebook o del Ads Library" },
          website: { type: "string" },
          notes: { type: "string", description: "Por qué es competidor relevante (rubro, zona, tamaño)" },
        },
        required: ["clientId", "name"],
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
        "Guarda una TENDENCIA en el panel del nicho del cliente. Priorizá dos tipos y EVITÁ noticias genéricas de IA/marketing: (1) del RUBRO del cliente (inmobiliario, gastronomía, retail, salud, etc.) — una noticia/dato/movimiento del sector que dé para contenido; (2) de CONTENIDO — un formato/ángulo/tema que está rindiendo en ESE rubro (ej. 'reels de recorrido de propiedad', 'carruseles de 5 errores', 'antes/después de reforma'). Etiquetá honesto: 'potencial-de-gancho' solo si de verdad da para un posteo; 'explicativo' si es contexto; 'ignorar' si no. CLAVE: en `niches` poné SIEMPRE el/los rubro(s) específico(s) — un trend sin nicho aparece en TODOS los clientes, así que reservá `[]` SOLO para cambios universales de plataforma (ej. cambio de algoritmo de Instagram), nunca para noticias de sector o de IA/marketing.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título corto de la tendencia" },
          url: { type: "string", description: "Link a la fuente" },
          source: { type: "string", description: "Fuente (ej. 'blog Anthropic', 'X')" },
          tag: { type: "string", enum: ["potencial-de-gancho", "explicativo", "ignorar"] },
          niches: { type: "array", items: { type: "string" }, description: "Rubro(s) específico(s) a los que aplica, ej. ['inmobiliario']. [] = universal, SOLO para cambios de plataforma — evitá [] en noticias de sector o de contenido." },
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
      description: "Lista los entregables guardados. CON clientId/issueId: los de ese cliente o issue, para reutilizar trabajo hecho. SIN filtros: devuelve la COBERTURA — qué clientes tienen el entregable más viejo (o nunca), para saber por quién empezar en una tanda rotativa.",
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
        "PAUSAR una campaña o conjunto de anuncios (adset) de un cliente. En Meta sirve para campaña y adset; en Google SOLO para campaña. Usala cuando detectes gasto sin conversiones, CTR muy bajo o un aviso quemando presupuesto. MUEVE plata real: proponé la pausa en el issue con la justificación (números concretos) y esperá OK humano; recién con aprobación pasá approved=true. El servidor verifica que la entidad sea de ESE cliente. NO existe reanudar/subir presupuesto/crear por esta vía (eso lo hace un humano).",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          entityType: { type: "string", enum: ["campaign", "adset"], description: "Tipo de entidad a pausar" },
          entityId: { type: "string", description: "ID de la campaña o adset (tal cual aparece en la data de la plataforma)" },
          approved: { type: "boolean", description: "true SOLO si un humano ya aprobó explícitamente esta pausa en el issue" },
        },
        required: ["clientId", "entityType", "entityId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_validacion_redes",
      description:
        "Revisar el calendario de un cliente y devolver qué posts VAN A FALLAR cuando lleguen a su fecha, por no cumplir las reglas de la red destino: copy más largo que el tope (Pinterest 500, X 280, Instagram 2200, LinkedIn 3000), YouTube/TikTok con un formato que no es video, carrusel con más piezas de las que la red acepta. El despachador de Make NO chequea nada de esto: descarta el post en silencio y la tarea igual queda etiquetada como enviada. Usala ANTES de dar por cerrado un calendario, y cuando escribas copy usá el campo topeDeTexto, que es el límite de la red más chica entre las elegidas. También avisa de redes cargadas que el despachador no sabe entregar (WhatsApp, Reddit) y de redes mal escritas.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          dias: { type: "number", description: "Cuántos días hacia adelante mirar (default 30)" },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cliente_listo_para_producir",
      description:
        "Verificar si tiene sentido producir contenido para un cliente ANTES de generarlo. Devuelve listo=false cuando el cliente no tiene destino de publicación en Make: en ese caso lo que se genere se descarta en silencio al llegar su fecha, así que NO hay que producir — hay que abrir un issue para dar de alta el destino y avisar. Consultala siempre antes de armar un plan de contenido, ideas, placas o calendario. Si devuelve sinVerificar=true no se pudo comprobar y se puede producir igual.",
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
      name: "get_cadena_publicacion",
      description:
        "Estado de la cadena de publicación de toda la agencia, medido por EFECTO real (destino en Make, último despacho que escribió Make, posts que devolvió la red) y no por etiquetas ni estados de corrida. Devuelve por cliente el PRIMER eslabón roto: sin_destino (lo que se le programe no va a ningún lado), despachador_mudo (Make no despacha hace días), sync_ciego (no estamos viendo su red, hay que arreglar el sync antes de concluir nada) o red_muda (Make dice que publicó y no está). Usala para saber dónde está roto el flujo antes de prometerle nada a un cliente.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_auditoria_keywords_google",
      description:
        "Auditar las keywords de Google Ads de un cliente: lee el informe de términos de búsqueda de los últimos N días y devuelve qué negativizar, qué keyword nueva sumar, qué pausar y qué bajar de amplia a frase, con los números que justifican cada una. NO toca nada, solo lee. Es la ÚNICA fuente válida de términos para add_negative_keywords y pause_keywords_google — no inventes términos. Si el reporte arranca con una advertencia de gasto de marca sin conversiones, el problema es la MEDICIÓN: informá eso y no propongas optimizaciones sobre esos datos.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          dias: { type: "number", description: "Ventana a mirar hacia atrás (default 30)" },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_negative_keywords",
      description:
        "Agregar palabras clave NEGATIVAS a una campaña de Google Ads (en concordancia de frase). Es la palanca más segura: solo puede bajar gasto y se revierte borrando el criterio. Sacá los términos de get_auditoria_keywords_google, nunca inventados. Corré primero con ensayo=true (Google valida y NO guarda nada) para confirmar que el lote es válido, proponé en el issue cuánta plata libera, y recién con OK humano ejecutá con approved=true. El servidor RECHAZA términos que nombren la marca del propio cliente: esa gente ya te está buscando y suele convertir por teléfono o en el local sin que el píxel lo vea.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          campaignId: { type: "string", description: "ID de la campaña de Google a la que se le suman las negativas" },
          terminos: { type: "array", items: { type: "string" }, description: "Términos de búsqueda a negativizar (máximo 50)" },
          ensayo: { type: "boolean", description: "true = validar contra Google sin guardar nada" },
          approved: { type: "boolean", description: "true SOLO si un humano ya aprobó esta lista en el issue" },
        },
        required: ["clientId", "campaignId", "terminos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pause_keywords_google",
      description:
        "PAUSAR keywords de Google Ads que gastan sin convertir, indicándolas por TEXTO (el servidor las resuelve contra la cuenta del cliente, así que un texto inventado no toca nada). Sacá la lista de get_auditoria_keywords_google. MUEVE plata real: ensayo=true primero, justificación con el gasto sin conversiones de cada una en el issue, y approved=true solo con OK humano. El servidor protege las keywords de marca del cliente.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          textos: { type: "array", items: { type: "string" }, description: "Texto exacto de las keywords a pausar (máximo 50)" },
          ensayo: { type: "boolean", description: "true = validar contra Google sin guardar nada" },
          approved: { type: "boolean", description: "true SOLO si un humano ya aprobó esta lista en el issue" },
        },
        required: ["clientId", "textos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_video_tasks",
      description:
        "Tareas ABIERTAS de la lista 'Producción de video' del cliente en ClickUp, con flag tieneGuion (heurística sobre la descripción). Las que NO tienen guion son las que el guionista debe escribir: el guion se publica como COMENTARIO en la tarea (mcp clickup add_comment con el taskId) y se guarda como deliverable.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string", description: "UUID del cliente" } },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_licitaciones",
      description:
        "Licitaciones de Mercado Público (ChileCompra) guardadas en el panel. Filtrá por estado: candidata (a revisar), util (nos sirven), descartada, vencida. Devuelve código, nombre, descripción, organismo, región, monto, fecha de cierre y relevancia.",
      parameters: {
        type: "object",
        properties: { estado: { type: "string", description: "candidata | util | descartada | vencida (default: candidata)" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_licitacion_estado",
      description:
        "Marca una licitación del panel: util (con relevancia OBLIGATORIA: por qué le sirve a la agencia y qué se podría ofertar) o descartada. Usalo al curar las candidatas.",
      parameters: {
        type: "object",
        properties: {
          codigo: { type: "string", description: "CodigoExterno de la licitación" },
          estado: { type: "string", description: "util | descartada" },
          relevancia: { type: "string", description: "Por qué nos sirve (obligatoria si estado=util)" },
        },
        required: ["codigo", "estado"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_niche_intel",
      description:
        "Inteligencia del NICHO/rubro: benchmark de CTR/CPL (promedio vs meta alcanzable del mejor cuartil), formato ganador en orgánico Y en ads, experimento sugerido, PLAN DE ACCIÓN minado a diario (acciones concretas por cliente: subir CTR, bajar CPL, escalar, activar pauta — con prioridad), mejor contenido y competidores del rubro. Usalo como BASE de todo diagnóstico de pauta o propuesta antes de improvisar. Sin 'niche' devuelve el resumen de todos los nichos.",
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
        "Publicaciones orgánicas REALES del cliente (Instagram + Facebook) CON SU RENDIMIENTO: reacciones, comentarios, compartidos y engagement por post, más el ranking de formatos que mejor y peor rinden EN ESA CUENTA y el resumen ya destilado (`queFunciona`). Usalo SIEMPRE antes de proponer ideas de contenido: es la diferencia entre una idea genérica y una basada en lo que a este cliente le funcionó. También sirve para verificar si lo que se debía postear salió. Ventana por defecto 90 días — subila si el cliente publica poco.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "UUID del cliente" },
          sinceHours: { type: "number", description: "Ventana en horas (default 2160 = 90 días). Para aprender patrones conviene 90-180 días, no 7." },
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
        "Contenido PROGRAMADO del cliente desde la lista de Redes Sociales de ClickUp dentro de una ventana. REGLA DE ATRASO (la ÚNICA que importa, ya viene calculada en el campo `overdue`): startDate (Fecha de inicio, la que dispara el webhook a Make) ya pasó Y sin etiqueta 'mandado a make' (sentToMake=false). NADA MÁS cuenta: el status de ClickUp ('en curso', etc.), plannedDate y due_date NO determinan atraso, y las tareas SIN startDate son ideas sin programar — NUNCA reportarlas como atrasadas. Si overdue=true → el webhook no disparó: eso sí reportalo. Devuelve null si el cliente no tiene lista de Redes mapeada.",
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
  {
    type: "function",
    function: {
      name: "get_client_marketing_plan",
      description:
        "Plan de Marketing del cliente en ClickUp (reuniones, planificaciones, estrategia cargada por el equipo). Usalo para alinear propuestas y contenido con la estrategia REAL acordada con el cliente — es la fuente de 'qué se decidió en reuniones'.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "UUID del cliente" },
          limit: { type: "number", description: "Máx. ítems (default 30)" },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_content_matrix",
      description:
        "MATRIZ PROFUNDA de contenido del cliente — la base de la auditoría de perfil. Devuelve en una llamada: (a) orgánico real últimos N días (mix de formatos, posts/semana, días desde el último), (b) señal de FALTA DE CREATIVIDAD (aperturas de copy repetidas ≥3 veces y concentración de formato), (c) matriz planificada formato×objetivo del calendario de Redes (-30/+30 días) con huecos (sin formato/sin objetivo cargado) y atrasos reales (campo overdue), (d) tendencias recientes del NICHO del cliente. Combinala con get_niche_intel (benchmarks/plan del rubro) y con la navegación del perfil público (bio/destacadas) para la auditoría completa.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "UUID del cliente" },
          days: { type: "number", description: "Ventana de orgánico hacia atrás (default 60)" },
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
  // ── A2A: tarjetas de agentes + delegación explícita (pedido 25/7) ─────────
  {
    type: "function",
    function: {
      name: "get_agent_cards",
      description:
        "TARJETAS del equipo de agentes: quién es cada uno, qué sabe hacer, cuándo derivarle trabajo, y cuántos issues abiertos tiene ahora (carga). Consultalo ANTES de delegar con delegate_to_agent para elegir al especialista correcto.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "delegate_to_agent",
      description:
        "DELEGA trabajo a otro agente del equipo: crea un issue asignado a él con tu contexto. Usalo cuando detectás algo que NO es de tu especialidad (ej. Content detecta problema de pauta → delegar a Milo). Mirá primero get_agent_cards para elegir bien. No te autodelegues ni delegues lo que podés resolver vos.",
      parameters: {
        type: "object",
        properties: {
          agentName: { type: "string", description: "Nombre del agente destino (ej. 'Milo', 'Caro', 'Esteban')" },
          title: { type: "string", description: "Título corto y accionable de la tarea" },
          description: { type: "string", description: "Contexto completo: qué detectaste, dónde, qué esperás que haga (markdown)" },
          clientId: { type: "string", description: "UUID del cliente si la tarea es de un cliente (de list_clients)" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Prioridad (default medium)" },
          issueId: { type: "string", description: "Issue de origen (el tuyo) para dejar registro de la derivación" },
        },
        required: ["agentName", "title", "description"],
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

  // Modo del agente que está llamando. Si no se puede resolver (actor de board,
  // agente borrado, DB caída) devuelve el default, que es "accion": este gate
  // limita a quien está marcado como consulta, no rompe a quien no lo está.
  async function modoDelActor(req: Request): Promise<ModoAgente> {
    const ctx = actorContext(req);
    if (!ctx?.agentId) return MODO_POR_DEFECTO;
    try {
      const [row] = await db
        .select({ permissions: agents.permissions })
        .from(agents)
        .where(eq(agents.id, ctx.agentId))
        .limit(1);
      return modoDeAgente(row?.permissions);
    } catch {
      return MODO_POR_DEFECTO;
    }
  }

  // GET /api/agent-tools — list every tool the agent can call (MiniMax/OpenAI format).
  // Un agente en modo consulta no ve siquiera las herramientas que escriben: es
  // más barato que las ignore a que las llame y se coma un error.
  router.get("/agent-tools", async (req, res) => {
    if (req.actor.type === "none") throw unauthorized("Authentication required");
    const todas = [...CORE_TOOLS, ...pluginToolDefs()];
    const modo = await modoDelActor(req);
    const tools = modo === "accion" ? todas : todas.filter((t) => !esDeAccion(t.function.name));
    res.json({ tools });
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

    // El filtro del GET ya esconde estas tools, pero el modelo puede inventarse
    // el nombre igual. Este es el que corta de verdad.
    const modo = await modoDelActor(req);
    if (!puedeUsar(modo, tool)) return reply(false, mensajeDeBloqueo(tool));

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

      if (tool === "save_niche_report") {
        const rawNiche = typeof params.niche === "string" ? params.niche.trim() : "";
        if (!rawNiche) return reply(false, "Falta niche.");
        const industries = (await db.selectDistinct({ i: clients.industry }).from(clients)
          .where(and(eq(clients.status, "active"), isNotNull(clients.industry))))
          .map((r) => r.i!.toLowerCase()).filter((i) => i !== "interno-test");
        const { ok: okNiches, unknown } = canonicalizeNiches([rawNiche], industries);
        if (!okNiches.length) return reply(false, `Rubro desconocido: "${rawNiche}"${unknown.length ? "" : ""}. Slugs válidos: ${industries.join(", ")}.`);
        const niche = okNiches[0];
        // Ideas sacadas de redes SIN link no sirven al equipo — es el pedido
        // explícito: título + detalle + link de referencia verificable.
        const ideas = Array.isArray(params.ideas) ? (params.ideas as Array<Record<string, unknown>>) : [];
        const sinLink = ideas.filter((i) => typeof i.fuente === "string" && /instagram|tiktok|meta|facebook|reel|ads library/i.test(i.fuente) && !(typeof i.url === "string" && i.url.startsWith("http")));
        if (sinLink.length) return reply(false, `${sinLink.length} idea(s) citan una red social como fuente pero no traen url de referencia. Si la idea salió de redes porque funciona, el link al post/reel/anuncio es OBLIGATORIO.`);
        const sections = {
          analisisCruzado: (params.analisisCruzado ?? {}) as { organico?: string; pauta?: string },
          referentes: Array.isArray(params.referentes) ? (params.referentes as never[]).slice(0, 10) : [],
          ideas: ideas.slice(0, 10) as never[],
          planPorCliente: Array.isArray(params.planPorCliente) ? (params.planPorCliente as never[]).slice(0, 30) : [],
        };
        // Semana = lunes corriente (upsert por rubro+semana).
        const now = new Date();
        const monday = new Date(now.getTime() - ((now.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
        const [existing] = await db.select({ id: nicheReports.id }).from(nicheReports)
          .where(and(eq(nicheReports.niche, niche), eq(nicheReports.week, monday)));
        if (existing) {
          await db.update(nicheReports).set({ sections, createdByAgentId: ctx.agentId, updatedAt: new Date() }).where(eq(nicheReports.id, existing.id));
        } else {
          await db.insert(nicheReports).values({ niche, week: monday, sections, createdByAgentId: ctx.agentId });
        }
        return reply(true, `Radar de nicho guardado para "${niche}" (semana ${monday}): ${sections.referentes.length} referentes, ${sections.ideas.length} ideas, plan para ${sections.planPorCliente.length} clientes.`);
      }

      if (tool === "add_client_competitor") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const name = typeof params.name === "string" ? params.name.trim().slice(0, 200) : "";
        if (!clientId || !name) return reply(false, "Faltan clientId o name.");
        const igHandle = typeof params.igHandle === "string" ? params.igHandle.trim().replace(/^@/, "").slice(0, 120) || null : null;
        const fbPageUrl = typeof params.fbPageUrl === "string" ? params.fbPageUrl.trim().slice(0, 500) || null : null;
        const website = typeof params.website === "string" ? params.website.trim().slice(0, 500) || null : null;
        if (!igHandle && !fbPageUrl && !website) return reply(false, "Pasá al menos una fuente verificable: igHandle, fbPageUrl o website.");
        const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId));
        if (!client) return reply(false, "Cliente no encontrado.");
        const compCompanyId = (await resolveCompanyId(db, clientId)) ?? ctx.companyId;
        // Un competidor tiene que ser EXTERNO: los clientes de la agencia no
        // compiten entre sí en este panel (ese fue el reclamo del equipo).
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const agencyClients = await db.select({ name: clients.name }).from(clients).where(eq(clients.status, "active"));
        if (agencyClients.some((c) => norm(c.name) === norm(name))) {
          return reply(false, `"${name}" es un CLIENTE de la agencia, no un competidor externo. Buscá negocios reales del rubro/zona que NO trabajen con nosotros.`);
        }
        const existing = await db.select({ id: competitors.id, name: competitors.name }).from(competitors).where(eq(competitors.clientId, clientId)).limit(50);
        if (existing.some((c) => norm(c.name) === norm(name))) return reply(true, `"${name}" ya estaba cargado como competidor de este cliente.`);
        await db.insert(competitors).values({
          companyId: compCompanyId, clientId, name,
          igHandle, fbPageUrl, website,
          notes: typeof params.notes === "string" ? params.notes.slice(0, 1000) : null,
          sampleAds: [],
        });
        return reply(true, `Competidor "${name}" cargado (${[igHandle && "IG", fbPageUrl && "FB", website && "web"].filter(Boolean).join("/")}).`);
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
        // Análisis profundo (23/7): benchmark del rubro, formatos, edades —
        // el mismo que ve el equipo en la card de análisis estratégico.
        const [cl] = await db.select({ industry: clients.industry }).from(clients).where(eq(clients.id, clientId));
        const { analisisProfundo } = await import("../services/ads-deep-analysis.js");
        const profundo = await analisisProfundo(db, { id: clientId, industry: cl?.industry ?? null }).catch(() => null);
        // Desglose por plataforma (30/7): el total mezclaba Meta + Google y los
        // agentes no podían analizar Google por separado. Sus CPL no son
        // comparables entre sí — Google captura demanda, Meta la genera.
        const porPlat = await db
          .select({
            platform: adsInsights.platform,
            spend: sql<string>`coalesce(sum(${adsInsights.spend}),0)`,
            impressions: sql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
            clicks: sql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
            leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
          })
          .from(adsInsights)
          .where(and(eq(adsInsights.clientId, clientId), gte(adsInsights.date, since.toISOString().slice(0, 10))))
          .groupBy(adsInsights.platform);
        const plataformas = porPlat.map((p) => {
          const sp = Number(p.spend), ld = p.leads, im = p.impressions, ck = p.clicks;
          return {
            platform: p.platform,
            spend: Math.round(sp), impressions: im, clicks: ck, leads: ld,
            ctrPct: im > 0 ? Number(((ck / im) * 100).toFixed(2)) : 0,
            cpl: ld > 0 ? Number((sp / ld).toFixed(2)) : null,
          };
        });
        return reply(
          true,
          JSON.stringify({
            windowDays: days,
            plataformas,
            notaPlataformas: plataformas.length > 1
              ? "Este cliente tiene MÁS DE UNA plataforma: analizá y recomendá sobre cada una por separado. No compares sus CPL entre sí (Google capta demanda existente, Meta la genera)."
              : undefined,
            analisis: profundo?.resumen ?? [],
            porEdad: profundo?.porEdad ?? [],
            formatos: profundo?.formatos ?? null,
            benchmarkRubro: profundo?.benchmark ?? null,
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
        const hours = typeof params.sinceHours === "number" && params.sinceHours > 0 ? Math.min(24 * 180, params.sinceHours) : 24 * 90;
        const since = new Date(Date.now() - hours * 3_600_000);
        const maps = await db
          .select({ pageId: adsAccountMappings.pageId })
          .from(adsAccountMappings)
          .where(eq(adsAccountMappings.clientId, clientId));
        const pageIds = [...new Set(maps.map((m) => m.pageId).filter((p): p is string => !!p))];
        const match = pageIds.length
          ? or(eq(organicPosts.clientId, clientId), inArray(organicPosts.pageId, pageIds))
          : eq(organicPosts.clientId, clientId);
        // Antes esto devolvía SOLO el texto de cada post: el agente veía qué
        // publicó el cliente pero no qué le funcionó, así que las ideas salían
        // genéricas con 3.301 posts en la base (14/8). Ahora viene el
        // rendimiento y, arriba, el resumen de qué formato rinde en la cuenta.
        const { rendimientoOrganico, memoriaOrganica } = await import("../services/organico-aprendizaje.js");
        const r = await rendimientoOrganico(db, clientId, {
          dias: Math.ceil(hours / 24), limite: 50, pageIds,
        });
        if (r.totalPosts === 0) {
          return reply(true, "(Sin publicaciones orgánicas sincronizadas en la ventana. Si el cliente publica pero no aparece, falta reconectar la página de Meta o no se sincronizó todavía.)");
        }
        const aprendido = await memoriaOrganica(db, clientId);
        return reply(true, JSON.stringify({
          ventanaDias: Math.ceil(hours / 24),
          totalPosts: r.totalPosts,
          conMetricas: r.conMetricas,
          engagementPromedio: r.promedio,
          nota: r.conMetricas === 0
            ? "Meta no devolvió métricas de estos posts — usalos como referencia de temas, no de rendimiento."
            : "engagement = reacciones + comentarios×3 + compartidos×5.",
          queFunciona: aprendido,
          porFormato: r.porTipo,
          mejores: r.top.map((p) => ({ tipo: p.tipo, engagement: p.engagement, texto: p.texto.slice(0, 200), permalink: p.permalink })),
          peores: r.flojos.map((p) => ({ tipo: p.tipo, engagement: p.engagement, texto: p.texto.slice(0, 120) })),
          posts: r.posts.map((p) => ({
            tipo: p.tipo, texto: p.texto.slice(0, 240), fecha: p.fecha,
            engagement: p.engagement, reacciones: p.reacciones, comentarios: p.comentarios, compartidos: p.compartidos,
            permalink: p.permalink,
          })),
        }));
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

      if (tool === "get_client_marketing_plan") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        if (!clientId) return reply(false, "Falta clientId.");
        const limit = typeof params.limit === "number" && params.limit > 0 ? Math.min(params.limit, 60) : 30;
        try {
          const { getPlanMarketing } = await import("../services/clickup-sync.js");
          const items = await getPlanMarketing(db, clientId, limit);
          if (items === null) return reply(false, "El cliente no tiene lista 'Plan de Marketing' en su folder de ClickUp (o no tiene folder mapeado).");
          return reply(true, JSON.stringify({ items }));
        } catch (e) {
          return reply(false, `get_client_marketing_plan: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "get_client_content_matrix") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        if (!clientId) return reply(false, "Falta clientId.");
        const days = typeof params.days === "number" && params.days > 0 ? Math.min(params.days, 180) : 60;
        const now = Date.now();
        const since = new Date(now - days * 86_400_000);

        // (a) orgánico real + (b) señal de creatividad
        const posts = await db
          .select({ createdTime: organicPosts.createdTime, postType: organicPosts.postType, message: organicPosts.message })
          .from(organicPosts)
          .where(and(eq(organicPosts.clientId, clientId), gte(organicPosts.createdTime, since)));
        const formatMix: Record<string, number> = {};
        for (const p of posts) formatMix[p.postType ?? "otro"] = (formatMix[p.postType ?? "otro"] ?? 0) + 1;
        const lastPost = posts.reduce<Date | null>((m, p) => (p.createdTime && (!m || p.createdTime > m) ? p.createdTime : m), null);
        // aperturas de copy repetidas: primeras ~7 palabras normalizadas
        const openings = new Map<string, number>();
        for (const p of posts) {
          const open = (p.message ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
            .split(/\s+/).slice(0, 7).join(" ").trim();
          if (open.length >= 15) openings.set(open, (openings.get(open) ?? 0) + 1);
        }
        const repeated = [...openings.entries()].filter(([, n]) => n >= 3)
          .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([o, n]) => ({ apertura: o, veces: n }));
        const total = posts.length || 1;
        const topFormatShare = Math.max(0, ...Object.values(formatMix)) / total;

        // (c) matriz planificada formato×objetivo (con huecos y atrasos reales)
        const cal = (await getRedesCalendar(db, clientId, now - 30 * 86_400_000, now + 30 * 86_400_000).catch(() => null)) ?? [];
        const matriz: Record<string, number> = {};
        let sinFormato = 0, sinObjetivo = 0, overdue = 0;
        for (const it of cal) {
          if (!it.format) sinFormato++;
          if (!it.objective) sinObjetivo++;
          if (new Date(it.date).getTime() < now && !it.sentToMake) overdue++;
          matriz[`${it.format ?? "?"} × ${it.objective ?? "?"}`] = (matriz[`${it.format ?? "?"} × ${it.objective ?? "?"}`] ?? 0) + 1;
        }

        // (d) tendencias del nicho (14 días; incluye las universales sin nicho)
        const [c] = await db.select({ industry: clients.industry }).from(clients).where(eq(clients.id, clientId));
        const cutoffDay = new Date(now - 14 * 86_400_000).toISOString().slice(0, 10);
        const recentTrends = await db.select({ day: trends.day, title: trends.title, niches: trends.niches, summary: trends.summary })
          .from(trends).where(and(gte(trends.day, cutoffDay), ne(trends.tag, "ignorar"))).orderBy(desc(trends.day)).limit(120);
        const nicheTrends = recentTrends
          .filter((t) => trendMatchesIndustry(t.niches, c?.industry))
          .slice(0, 10).map((t) => ({ day: t.day, title: t.title, resumen: t.summary?.slice(0, 160) ?? null }));
        // (e) efemérides próximas del rubro (21 días adelante — pedido 18/7:
        // odesur/primavera/congresos entran acá; nunca se planifica hacia atrás)
        const { efemeridesProximasPorRubro } = await import("../services/efemerides.js");
        const efemerides = efemeridesProximasPorRubro(c?.industry, 21);

        return reply(true, JSON.stringify({
          nicho: c?.industry ?? null,
          organico: {
            ventanaDias: days, posts: posts.length,
            postsPorSemana: Math.round((posts.length / (days / 7)) * 10) / 10,
            diasDesdeUltimoPost: lastPost ? Math.floor((now - lastPost.getTime()) / 86_400_000) : null,
            mixFormatos: formatMix,
          },
          creatividad: {
            aperturasRepetidas: repeated,
            concentracionFormatoTop: Math.round(topFormatShare * 100) + "%",
            señal: repeated.length >= 2 || topFormatShare >= 0.7
              ? "POSIBLE FATIGA CREATIVA: copys que arrancan igual y/o un solo formato dominante — proponer ángulos/formatos nuevos"
              : "sin señal fuerte de repetición",
          },
          planificacion: { piezasCalendario60d: cal.length, matrizFormatoObjetivo: matriz, sinFormato, sinObjetivo, atrasosReales: overdue },
          tendenciasNicho: nicheTrends,
          efemeridesProximas: efemerides,
        }));
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
        const { motivoPlanillaProtegida } = await import("../services/planillas-protegidas.js");
        const bloqueo = await motivoPlanillaProtegida(db, spreadsheetId);
        if (bloqueo) return reply(false, bloqueo);
        try {
          const r = await googleTools.sheetsAppend({ spreadsheetId, range, values });
          return reply(true, JSON.stringify(r));
        } catch (e) {
          return reply(false, `sheets_append: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "create_client_task") {
        // Cupo semanal de propuestas por agente (30/7): el backlog tenía 188
        // items agent_proposed sin ejecutar. Proponer más no ayuda: satura la
        // cola y tapa lo accionable.
        const [prop] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(issues)
          .where(and(
            eq(issues.createdByAgentId, ctx.agentId),
            gte(issues.createdAt, new Date(Date.now() - 7 * 86_400_000)),
            sql`${issues.status} in ('backlog','todo')`,
          ));
        if ((prop?.n ?? 0) >= 15) {
          return reply(false, `Cupo alcanzado: ya tenés ${prop.n} tareas propuestas esta semana sin ejecutar. Cerrá o hacé avanzar las que están pendientes antes de proponer más (mirá tu cola con get_team_status).`);
        }
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
        // Solo lecciones de NEGOCIO (30/7): 76 de 136 lecciones eran sobre el
        // harness/paperclip — infra que no es trabajo de los agentes y que
        // ademas ya tienen prohibido tocar.
        if (/^(paperclip|harness|sistema|system|infra|paperclip-recovery)/.test(area) || /\b(harness|paperclip|detector|dispatcher|heartbeat|wakeup)\b/i.test(lesson)) {
          return reply(false, "Esa lección es sobre el sistema/harness, no sobre el trabajo de la agencia — no se guarda. Guardá lecciones de marketing, clientes, pauta, contenido o herramientas del cliente (ej. area='meta', 'clickup', 'contenido').");
        }
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
        // Anti-duplicados (pedido 18/7: "todos tienen el mismo gancho"): si la
        // APERTURA (primeras 4 palabras) ya está en el baúl del mismo ámbito,
        // rechazar y pedir variar — un baúl de 5 "Lo que nadie te..." no sirve.
        const apertura = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).slice(0, 4).join(" ");
        const nueva = apertura(text);
        if (nueva.split(" ").length >= 3 && niche) {
          const existentes = await db.select({ text: hooks.text, clientId: hooks.clientId }).from(hooks)
            .where(eq(hooks.niche, niche)).limit(300);
          const mismos = existentes.filter((h) => apertura(h.text) === nueva);
          const enMiAmbito = mismos.some((h) => h.clientId === clientId);
          if (enMiAmbito || mismos.length >= 2) {
            return reply(false, `Esa apertura ya está ${enMiAmbito ? "en este baúl" : `usada en ${mismos.length} baúl(es) del rubro "${niche}"`} ("${mismos[0].text.slice(0, 60)}…"). El equipo pidió ITERAR los ganchos, no repetirlos entre clientes: buscá otro ángulo del mismo reel o reformulá la apertura.`);
          }
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
        const summary = typeof params.summary === "string" ? params.summary.slice(0, 1000) : null;
        // Los tags de nicho DEBEN ser rubros reales de clientes: el panel de
        // cada cliente filtra por su industry, y un slug libre no matchea a
        // nadie (la tendencia queda invisible) mientras que [] aparece en
        // TODOS. Validar acá corta el problema en origen.
        const industries = (await db.selectDistinct({ i: clients.industry }).from(clients)
          .where(and(eq(clients.status, "active"), isNotNull(clients.industry))))
          .map((r) => r.i!.toLowerCase()).filter((i) => i !== "interno-test");
        const rawNiches = Array.isArray(params.niches) ? (params.niches as unknown[]).map(String).slice(0, 20) : [];
        const { ok: nicheTags, unknown } = canonicalizeNiches(rawNiches, industries);
        if (unknown.length) {
          return reply(false, `Rubro(s) desconocido(s): ${unknown.join(", ")}. Usá EXACTAMENTE estos slugs (rubros reales de los clientes): ${industries.join(", ")}. Si es un cambio universal de PLATAFORMA (algoritmo/feature de IG, Meta, TikTok, WhatsApp) mandá niches=[].`);
        }
        if (nicheTags.length === 0 && /\b(ia|ai|chatgpt|claude|gemini|openai|anthropic|copilot|bing|cloudflare|product ?hunt|saas|seo|llm)\b/i.test(`${title} ${summary ?? ""}`)) {
          return reply(false, "Esto parece noticia de IA/herramientas/marketing, no un cambio universal de plataforma. Etiquetala niches=['agencia-marketing'] (o el rubro específico si de verdad aplica). niches=[] queda RESERVADO a cambios de plataforma (algoritmo de IG, features de Meta/TikTok/WhatsApp).");
        }
        await db.insert(trends).values({
          day: dayStr(new Date()),
          title,
          url: typeof params.url === "string" ? params.url.slice(0, 500) : null,
          source: typeof params.source === "string" ? params.source.slice(0, 120) : null,
          tag: ["potencial-de-gancho", "explicativo", "ignorar"].includes(params.tag as string) ? (params.tag as string) : "potencial-de-gancho",
          niches: nicheTags,
          summary,
        });
        return reply(true, `Tendencia guardada en el panel${nicheTags.length ? ` para: ${nicheTags.join(", ")}` : " (universal)"}.`);
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
        // Checks deterministas (curso reliable-agents 26/7): links muertos,
        // caracteres no latinos, mención de otro cliente. Si falla, el error
        // vuelve al agente para que corrija y reintente — no lo pesca un humano.
        try {
          const { verificarEntrega } = await import("../services/entrega-checks.js");
          const check = await verificarEntrega(db, `${title}\n${content}`, { clientId });
          if (!check.ok) {
            return reply(false, "El entregable NO se guardó — corregí estos problemas y volvé a llamar save_deliverable:\n" + check.problemas.map((p) => `- ${p}`).join("\n"));
          }
        } catch { /* checks best-effort: nunca bloquear por un fallo del verificador */ }
        const companyId = clientId ? ((await resolveCompanyId(db, clientId)) ?? ctx.companyId) : ctx.companyId;
        const [row] = await db.insert(agentDeliverables).values({
          companyId, issueId, clientId, agentId: ctx.agentId,
          kind, title, content: content.slice(0, 20000),
          url: typeof params.url === "string" ? params.url.slice(0, 500) : null,
        }).returning({ id: agentDeliverables.id });
        return reply(true, `Entregable guardado (${kind}): "${title}" [id ${row?.id ?? "?"}].`);
      }

      if (tool === "list_deliverables") {
        // Sin filtros: además del listado, devolvemos qué clientes tienen el
        // entregable de ese tipo MÁS VIEJO (10/8). La rutina del plan de acción
        // pedía "acordate a quién cubriste" y la memoria del agente fallaba:
        // había clientes con plan de hace 3 semanas. Con el dato objetivo el
        // agente empieza siempre por los más atrasados.
        const sinFiltro = !params.clientId && !params.issueId;
        const tipo = typeof params.tipoCobertura === "string" ? params.tipoCobertura : "Plan de acción";
        if (sinFiltro) {
          const cob = await db
            .select({ name: clients.name, id: clients.id, ultimo: sql<string | null>`max(${agentDeliverables.createdAt})` })
            .from(clients)
            .leftJoin(agentDeliverables, and(eq(agentDeliverables.clientId, clients.id), sql`${agentDeliverables.title} ilike ${tipo + "%"}`))
            .where(eq(clients.status, "active"))
            .groupBy(clients.id, clients.name)
            .orderBy(sql`max(${agentDeliverables.createdAt}) asc nulls first`)
            .limit(15);
          const lineas = cob.map((c) => `- ${c.name}: ${c.ultimo ? String(c.ultimo).slice(0, 10) : "NUNCA"}`);
          return reply(true,
            `COBERTURA de "${tipo}" — clientes MÁS ATRASADOS primero (empezá por estos):\n` + lineas.join("\n") +
            `\n\n(Para ver los entregables de un cliente puntual, llamá de nuevo con clientId.)`);
        }
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

      if (tool === "get_validacion_redes") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        if (!clientId) return reply(false, "Falta clientId.");
        const dias = typeof params.dias === "number" && params.dias > 0 ? Math.min(params.dias, 90) : 30;
        try {
          const { getRedesCalendar } = await import("../services/clickup-sync.js");
          const { validarPieza, topeDeTexto } = await import("../services/redes-reglas.js");
          const ahora = Date.now();
          const cal = await getRedesCalendar(db, clientId, ahora, ahora + dias * 86_400_000);
          if (cal === null) return reply(false, "El cliente no tiene lista de Redes Sociales mapeada en ClickUp.");

          const conProblemas = [];
          const sinRuta = new Set<string>();
          const desconocidas = new Set<string>();
          for (const p of cal) {
            const v = validarPieza({ redes: p.networks, largoTexto: p.copyLargo, formato: p.format });
            v.redesSinRuta.forEach((r) => sinRuta.add(r));
            v.redesDesconocidas.forEach((r) => desconocidas.add(r));
            if (v.problemas.length === 0) continue;
            conProblemas.push({
              tarea: p.name, fecha: p.date.slice(0, 10), url: p.url,
              redes: p.networks, problemas: v.problemas.map((x) => x.problema),
              topeDeTexto: topeDeTexto(p.networks),
            });
          }
          return reply(true, JSON.stringify({
            revisados: cal.length, conProblemas: conProblemas.length,
            posts: conProblemas.slice(0, 25),
            redesSinRutaEnMake: [...sinRuta],
            redesMalEscritas: [...desconocidas],
          }));
        } catch (e) {
          return reply(false, `get_validacion_redes: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "get_cliente_listo_para_producir") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        if (!clientId) return reply(false, "Falta clientId.");
        try {
          const { puedeProducir } = await import("../services/cadena-publicacion.js");
          const p = await puedeProducir(db, clientId);
          return reply(true, JSON.stringify(p));
        } catch (e) {
          return reply(false, `get_cliente_listo_para_producir: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "get_cadena_publicacion") {
        try {
          const { revisarCadena } = await import("../services/cadena-publicacion.js");
          const r = await revisarCadena(db);
          if (r.ciego) return reply(false, "No se pudo leer Make, así que no se puede afirmar nada del estado de la cadena. No asumas que está sana.");
          return reply(true, JSON.stringify({
            revisados: r.revisados,
            rotos: r.rotas.length,
            porEslabon: r.rotas.reduce<Record<string, number>>((a, x) => { a[x.eslabon] = (a[x.eslabon] ?? 0) + 1; return a; }, {}),
            clientes: r.rotas.map((x) => ({ cliente: x.cliente, clientId: x.clientId, eslabon: x.eslabon, diasSin: x.diasSin, detalle: x.detalle })),
          }));
        } catch (e) {
          return reply(false, `get_cadena_publicacion: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "get_auditoria_keywords_google") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        if (!clientId) return reply(false, "Falta clientId.");
        const dias = typeof params.dias === "number" && params.dias > 0 ? Math.min(params.dias, 90) : 30;
        try {
          const { auditarKeywords, auditoriaAPasos } = await import("../services/ads-keywords.js");
          const a = await auditarKeywords(db, clientId, dias);
          if (!a) return reply(false, "El cliente no tiene Google Ads mapeado.");
          // Se devuelve la guía redactada Y los ids que hacen falta para actuar:
          // sin campaignId el agente no puede llamar a add_negative_keywords.
          return reply(true, JSON.stringify({
            guia: auditoriaAPasos(a).cuerpo,
            cuenta: a.cuenta,
            gastoMarcaSinConversion: a.gastoMarcaSinConversion,
            negativas: a.negativas.map((t) => ({ termino: t.termino, costo: t.costo, clics: t.clics, campana: t.campana })),
            pausar: a.pausar.map((k) => ({ texto: k.texto, costo: k.costo, clics: k.clics, campana: k.campana })),
          }));
        } catch (e) {
          return reply(false, `get_auditoria_keywords_google: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "add_negative_keywords") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const campaignId = typeof params.campaignId === "string" ? params.campaignId : "";
        const terminos = Array.isArray(params.terminos) ? params.terminos.filter((t): t is string => typeof t === "string") : [];
        if (!clientId || !campaignId) return reply(false, "Faltan clientId o campaignId.");
        if (terminos.length === 0) return reply(false, "Falta la lista de términos.");
        const { agregarNegativas } = await import("../services/ads-actions.js");
        const r = await agregarNegativas(db, {
          clientId, campaignId, terminos, agentId: ctx.agentId,
          approved: params.approved === true, ensayo: params.ensayo === true,
        });
        // El rechazo por marca se informa SIEMPRE, salga bien o mal: es el dato
        // que evita que el agente vuelva a proponer lo mismo en el próximo ciclo.
        const nota = r.rechazadosPorMarca?.length
          ? ` No se incluyeron por ser de la marca: ${r.rechazadosPorMarca.join(", ")}.`
          : "";
        if (r.approvalRequired) return reply(false, (r.error ?? "Requiere aprobación humana.") + nota);
        if (!r.ok) return reply(false, r.error ?? "No se pudieron agregar las negativas.");
        if (r.ensayo) return reply(true, `Ensayo OK: Google validó ${r.aplicados?.length ?? 0} negativa(s) y NO guardó nada.${nota} Pedí OK humano y volvé a llamar con approved=true.`);
        return reply(true, `Agregadas ${r.aplicados?.length ?? 0} negativa(s) en concordancia de frase.${nota} Acción registrada.`);
      }

      if (tool === "pause_keywords_google") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const textos = Array.isArray(params.textos) ? params.textos.filter((t): t is string => typeof t === "string") : [];
        if (!clientId) return reply(false, "Falta clientId.");
        if (textos.length === 0) return reply(false, "Falta la lista de keywords.");
        const { pausarKeywords } = await import("../services/ads-actions.js");
        const r = await pausarKeywords(db, {
          clientId, textos, agentId: ctx.agentId,
          approved: params.approved === true, ensayo: params.ensayo === true,
        });
        const partes: string[] = [];
        if (r.protegidasPorMarca?.length) partes.push(`protegidas por ser de la marca: ${r.protegidasPorMarca.join(", ")}`);
        if (r.noEncontradas?.length) partes.push(`no están activas en la cuenta: ${r.noEncontradas.join(", ")}`);
        const nota = partes.length ? ` (${partes.join("; ")})` : "";
        if (r.approvalRequired) return reply(false, (r.error ?? "Requiere aprobación humana.") + nota);
        if (!r.ok) return reply(false, (r.error ?? "No se pudieron pausar.") + nota);
        if (r.ensayo) return reply(true, `Ensayo OK: Google validó la pausa de ${r.pausadas?.length ?? 0} keyword(s) y NO guardó nada.${nota} Pedí OK humano y volvé a llamar con approved=true.`);
        return reply(true, `Pausadas ${r.pausadas?.length ?? 0} keyword(s).${nota} Acción registrada.`);
      }

      if (tool === "get_client_video_tasks") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        if (!clientId) return reply(false, "Falta clientId.");
        try {
          const { getVideoTasks } = await import("../services/clickup-sync.js");
          const tasks = await getVideoTasks(db, clientId);
          if (tasks === null) return reply(false, "El cliente no tiene lista 'Producción de video' mapeada en ClickUp.");
          return reply(true, JSON.stringify({ tasks }));
        } catch (e) {
          return reply(false, `get_client_video_tasks: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "list_licitaciones") {
        const estado = typeof params.estado === "string" && params.estado ? params.estado : "candidata";
        try {
          const { listarLicitaciones } = await import("../services/licitaciones.js");
          const rows = await listarLicitaciones(db, [estado]);
          const out = rows.map((r) => ({
            codigo: r.codigo, nombre: r.nombre, descripcion: r.descripcion?.slice(0, 400) ?? null,
            organismo: r.organismo, region: r.region, moneda: r.moneda, montoEstimado: r.montoEstimado,
            fechaCierre: r.fechaCierre, relevancia: r.relevancia, url: r.url,
          }));
          return reply(true, JSON.stringify({ licitaciones: out }));
        } catch (e) {
          return reply(false, `list_licitaciones: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "set_licitacion_estado") {
        const codigo = typeof params.codigo === "string" ? params.codigo : "";
        const estado = typeof params.estado === "string" ? params.estado : "";
        const relevancia = typeof params.relevancia === "string" ? params.relevancia.trim() : "";
        if (!codigo || !["util", "descartada"].includes(estado)) return reply(false, "Faltan codigo o estado (util|descartada).");
        if (estado === "util" && relevancia.length < 15) return reply(false, "Para marcar util la relevancia es obligatoria: explicá en 1-2 frases por qué nos sirve y qué podríamos ofertar.");
        try {
          const { marcarLicitacion } = await import("../services/licitaciones.js");
          const ok = await marcarLicitacion(db, codigo, estado as "util" | "descartada", relevancia || undefined);
          return ok ? reply(true, `Licitación ${codigo} → ${estado}.`) : reply(false, `No existe la licitación ${codigo}.`);
        } catch (e) {
          return reply(false, `set_licitacion_estado: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (tool === "get_niche_intel") {
        const niche = typeof params.niche === "string" ? params.niche.trim().toLowerCase() : "";
        const scopes = ["niche", "niche_benchmark", "niche_experiment", "niche_ads_format", "niche_actions"];
        const conds = [inArray(learnings.scope, scopes)];
        if (niche) conds.push(eq(learnings.scopeKey, niche));
        const rows = await db.select().from(learnings).where(and(...conds)).orderBy(learnings.scopeKey);
        if (rows.length === 0) return reply(true, niche ? `Sin inteligencia minada para el nicho "${niche}" todavía (se mina cada 24h; necesita >=2 clientes con pauta).` : "Sin inteligencia de nichos minada todavía.");
        const lines: string[] = [];
        const label: Record<string, string> = { niche: "Formato ganador orgánico", niche_benchmark: "Benchmark", niche_experiment: "Experimento sugerido", niche_ads_format: "Formato ganador en ads", niche_actions: "Plan de acción" };
        for (const r of rows) {
          lines.push(`[${r.scopeKey}] ${label[r.scope] ?? r.scope}: ${r.pattern}`);
          // El plan de acción vive estructurado en evidence.actions — expandirlo
          // para que el agente reciba las acciones concretas, no solo el titular.
          if (r.scope === "niche_actions") {
            const acts = ((r.evidence as { actions?: Array<{ priority?: number; action?: string; kind?: string }> } | null)?.actions ?? []);
            for (const a of acts) lines.push(`  ${a.priority === 1 ? "[URGENTE]" : a.priority === 2 ? "[mejora]" : a.kind === "idea" ? "[idea]" : "[sumar]"} ${a.action}`);
          }
        }
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
          // Último RADAR del rubro (informe de Carlos): referentes externos con
          // links, ideas con referencia y análisis cruzado — el "qué funciona
          // afuera" que un plan personalizado tiene que contrastar.
          const [radar] = await db.select().from(nicheReports)
            .where(eq(nicheReports.niche, niche))
            .orderBy(desc(nicheReports.week), desc(nicheReports.updatedAt)).limit(1);
          const s = radar?.sections;
          if (s) {
            lines.push("", `RADAR del rubro (semana ${radar.week}):`);
            if (s.analisisCruzado?.organico) lines.push(`Orgánico: ${s.analisisCruzado.organico}`);
            if (s.analisisCruzado?.pauta) lines.push(`Pauta: ${s.analisisCruzado.pauta}`);
            for (const ref of s.referentes ?? []) {
              lines.push(`- Referente externo: ${ref.nombre}${ref.cuenta ? ` (${ref.cuenta})` : ""}${ref.ubicacion ? `, ${ref.ubicacion}` : ""} — ${ref.queHacen ?? ""}${ref.urlEjemplo ? ` · ejemplo: ${ref.urlEjemplo}` : ref.urlPerfil ? ` · ${ref.urlPerfil}` : ""}`);
            }
            for (const idea of s.ideas ?? []) {
              lines.push(`- Idea con referencia: ${idea.titulo}${idea.detalle ? ` — ${idea.detalle}` : ""}${idea.url ? ` · ${idea.url}` : ""}`);
            }
          }
        }
        return reply(true, lines.join("\n").slice(0, 12000));
      }

      if (tool === "get_team_lessons") {
        const area = typeof params.area === "string" ? params.area.trim().toLowerCase() : "";
        const conds = [eq(learnings.scope, "team")];
        if (area) conds.push(eq(learnings.scopeKey, area));
        const rows = await db.select({ area: learnings.scopeKey, lesson: learnings.pattern, occurrences: learnings.occurrences, lastSeenAt: learnings.lastSeenAt })
          .from(learnings).where(and(...conds)).orderBy(desc(learnings.lastSeenAt)).limit(30);
        const lines = rows.map((r) => `[${r.area}] ${r.lesson} (visto ${r.occurrences}x)`);
        // Lecciones de la evaluación semanal del PROPIO agente (agent-eval):
        // se entregan acá para cerrar el loop coleccionar → evaluar → mejorar.
        if (ctx.agentId) {
          const own = await db.select({ lesson: learnings.pattern })
            .from(learnings)
            .where(and(eq(learnings.scope, "agent"), eq(learnings.scopeKey, ctx.agentId)))
            .orderBy(desc(learnings.lastSeenAt)).limit(3);
          if (own.length > 0) {
            lines.push("", "TU EVALUACIÓN SEMANAL (aplicá estas lecciones en tu trabajo):");
            for (const o of own) lines.push(`- ${o.lesson}`);
          }
        }
        if (lines.length === 0) return reply(true, "Sin lecciones de equipo registradas todavía.");
        return reply(true, lines.join("\n"));
      }

      if (tool === "get_agent_cards") {
        const roster = await db
          .select({ id: agents.id, name: agents.name, title: agents.title, capabilities: agents.capabilities })
          .from(agents)
          .where(and(eq(agents.companyId, ctx.companyId), eq(agents.adapterType, "claude_local")));
        if (roster.length === 0) return reply(true, "No hay agentes en el roster.");
        const loads = await db
          .select({ agentId: issues.assigneeAgentId, c: sql<number>`count(*)::int` })
          .from(issues)
          .where(and(
            eq(issues.companyId, ctx.companyId),
            inArray(issues.status, ["todo", "in_progress", "in_review", "blocked"] as never),
            isNotNull(issues.assigneeAgentId),
          ))
          .groupBy(issues.assigneeAgentId);
        const loadMap = new Map(loads.map((l) => [l.agentId, l.c]));
        const lines = roster
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((a) => {
            const me = a.id === ctx.agentId ? " ← VOS" : "";
            const card = (a.capabilities ?? "").trim() || "(sin tarjeta cargada)";
            return `${a.name}${a.title ? ` — ${a.title}` : ""} · carga: ${loadMap.get(a.id) ?? 0} issues abiertos${me}\n  ${card}`;
          });
        return reply(true, lines.join("\n\n"));
      }

      if (tool === "delegate_to_agent") {
        const agentName = typeof params.agentName === "string" ? params.agentName.trim() : "";
        const title = typeof params.title === "string" ? params.title.trim().slice(0, 200) : "";
        const detail = typeof params.description === "string" ? params.description.trim() : "";
        if (!agentName || !title || !detail) return reply(false, "Faltan agentName, title o description.");
        const roster = await db
          .select({ id: agents.id, name: agents.name })
          .from(agents)
          .where(and(eq(agents.companyId, ctx.companyId), eq(agents.adapterType, "claude_local")));
        const q = agentName.toLowerCase();
        const matches = roster.filter((a) => a.name.toLowerCase().includes(q) || a.name.toLowerCase().split(/[\s(]+/)[0] === q);
        if (matches.length === 0) return reply(false, `No encontré al agente "${agentName}". Roster: ${roster.map((a) => a.name).join(", ")}.`);
        if (matches.length > 1) return reply(false, `"${agentName}" es ambiguo: ${matches.map((a) => a.name).join(", ")}. Usá el nombre completo.`);
        const target = matches[0];
        if (target.id === ctx.agentId) return reply(false, "No podés delegarte trabajo a vos mismo — resolvelo o elegí a otro especialista.");
        const [me] = ctx.agentId
          ? await db.select({ name: agents.name }).from(agents).where(eq(agents.id, ctx.agentId)).limit(1)
          : [];
        // Dedup: same open title already assigned to the target.
        const dup = await db.select({ identifier: issues.identifier }).from(issues)
          .where(and(
            eq(issues.assigneeAgentId, target.id),
            eq(issues.title, title),
            sql`${issues.status} not in ('done','cancelled')`,
          )).limit(1);
        if (dup.length > 0) return reply(false, `Ya existe una tarea abierta igual para ${target.name}: ${dup[0].identifier ?? "s/n"}. No dupliques.`);
        const clientId = typeof params.clientId === "string" && params.clientId ? params.clientId : null;
        const priority = (["low", "medium", "high", "urgent"] as const).includes(params.priority as never) ? (params.priority as string) : "medium";
        const created = await issuesSvc.create(ctx.companyId, {
          title,
          description: `${detail}\n\n_Delegado por ${me?.name ?? "otro agente"} · vía delegate_to_agent_`,
          status: "todo" as never,
          priority: priority as never,
          ...(clientId ? { clientId } : {}),
          originKind: "agent_delegated",
          createdByAgentId: ctx.agentId || null,
          assigneeAgentId: target.id,
        } as never);
        const identifier = ((created as Record<string, unknown>).identifier ?? (created as Record<string, unknown>).id ?? "") as string;
        // Leave a trace on the origin issue so the delegation is auditable.
        if (issueRef) {
          const origin = await issuesSvc.getById(issueRef);
          if (origin) {
            await issuesSvc.addComment(origin.id, `🤝 Delegué a **${target.name}**: "${title}" (${identifier}).`, { agentId: ctx.agentId, runId: ctx.runId }).catch(() => {});
          }
        }
        return reply(true, `Delegado a ${target.name}: ${identifier} — "${title}". Va a aparecer en su cola de trabajo.`);
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

  // POST /api/ops/agent-eval/run — manual trigger of the weekly agent evals.
  router.post("/ops/agent-eval/run", async (req, res) => {
    if (req.actor.type === "none") throw unauthorized("Authentication required");
    const { runAgentEvals } = await import("../services/agent-eval.js");
    const result = await runAgentEvals(db);
    res.json(result);
  });

  // POST /api/ops/organico/destilar { clientId? } — recalcula "qué funciona en
  // el orgánico". Sin clientId corre toda la cartera. Lo dispara solo el brain
  // cada 12h; esto es para verlo al toque.
  router.post("/ops/organico/destilar", async (req, res) => {
    if (req.actor.type === "none") throw unauthorized("Authentication required");
    const { destilarOrganico, destilarTodos, rendimientoOrganico } = await import("../services/organico-aprendizaje.js");
    const clientId = typeof req.body?.clientId === "string" ? req.body.clientId : null;
    if (clientId) {
      const [texto, detalle] = await Promise.all([
        destilarOrganico(db, clientId),
        rendimientoOrganico(db, clientId),
      ]);
      return res.json({
        aprendido: texto,
        conMetricas: detalle.conMetricas,
        promedio: detalle.promedio,
        porFormato: detalle.porTipo,
      });
    }
    res.json(await destilarTodos(db));
  });

  // POST /api/ops/keywords/auditar { clientId | clientSlug, dias?, derivar? }
  // Audita las keywords de Google Ads de una cuenta. Sin `derivar` solo devuelve
  // el análisis; con `derivar:true` deja la guía como tarea del equipo.
  router.post("/ops/keywords/auditar", async (req, res) => {
    if (req.actor.type === "none") throw unauthorized("Authentication required");
    const { auditarKeywords, auditoriaAPasos, auditarYDerivar } = await import("../services/ads-keywords.js");
    const { clientId, clientSlug, dias, derivar } = (req.body ?? {}) as {
      clientId?: string; clientSlug?: string; dias?: number; derivar?: boolean;
    };
    let id = clientId;
    if (!id && clientSlug) {
      const { clients } = await import("@paperclipai/db");
      const [c] = await db.select({ id: clients.id }).from(clients).where(eq(clients.slug, clientSlug));
      id = c?.id;
    }
    if (!id) return res.status(400).json({ error: "falta clientId o clientSlug" });
    if (derivar) return res.json(await auditarYDerivar(db, id, dias ?? 30));
    const a = await auditarKeywords(db, id, dias ?? 30);
    if (!a) return res.status(404).json({ error: "el cliente no tiene Google Ads mapeado" });
    res.json({ ...a, guia: auditoriaAPasos(a).cuerpo });
  });

  return router;
}
