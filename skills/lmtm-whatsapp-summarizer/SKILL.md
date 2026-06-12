---
name: lmtm-whatsapp-summarizer
description: >
  Agente que monitorea grupos de WhatsApp donde LMTM está agregado, lee los
  mensajes en tiempo real, y al final de cada conversación (después de N
  minutos de inactividad configurable) genera un resumen estructurado con
  temas tratados, decisiones tomadas, tareas mencionadas y puntos pendientes.
  El resumen se entrega de vuelta al grupo y opcionalmente se envía a un
  canal configurado (CEO de LMTM, email, ClickUp, Notion). Usar cuando se
  pida "resumir grupo de WhatsApp", "qué pasó en el grupo", "resumen al
  final del día", "monitoreo de grupos", "transcripción de grupo", "resumen
  de conversación de cliente". NO usar para chats 1-a-1 (esos los maneja
  el inbox de OpenClaw normal), ni para otros canales de mensajería.
---

# LMTM WhatsApp Summarizer

Agente LMTM que actúa como observador silencioso en grupos de WhatsApp.
Lee, resume y entrega. No responde en el grupo salvo para confirmar el
resumen al final del ciclo.

## Comportamiento

1. **Modo silencioso**: el bot NO responde mensajes del grupo, no etiqueta
   a nadie, no reacciona. Solo escucha.
2. **Inactividad como trigger**: cuando un grupo pasa N minutos sin
   mensajes (configurable, default 30), dispara el resumen.
3. **Resumen estructurado** en español rioplatense:
   - Temas tratados (bullets)
   - Decisiones tomadas
   - Tareas mencionadas (con quién las asumió si se identifica)
   - Puntos pendientes / abiertos
   - Máximo 300 palabras
4. **Delivery dual**:
   - Inyecta el resumen de vuelta al grupo (formato `📊 *Resumen...*`)
   - Persiste en DB (`wa_group_summaries`) y opcionalmente lo envía a
     un canal configurado (CEO de LMTM, email, ClickUp, n8n webhook)
5. **Reporte diario** (cron opcional): un solo resumen agregado de todos
   los grupos donde el bot está, enviado al CEO al final del día.

## Configuración por grupo

Cada grupo se puede configurar individualmente vía `wa_bot_config.groups`
(o tabla `wa_group_config` si la agregamos):

| Campo | Default | Descripción |
|---|---|---|
| `enabled` | `true` | Si el bot escucha este grupo |
| `inactivityMinutes` | `30` | Minutos de silencio para disparar summary |
| `minMessages` | `3` | Mínimo de mensajes para considerar un ciclo |
| `deliveryMode` | `"group"` | `group`, `email`, `clickup`, `n8n`, `all` |
| `deliveryTarget` | — | Email, list id, webhook URL, etc. |
| `summaryTone` | `"rio platense"` | `formal`, `rio platense`, `concise` |

## Reglas de oro

- **Privacidad**: nunca compartir PII (teléfonos, emails) en el resumen
  salvo que el grupo ya sea interno de LMTM.
- **Idioma**: detectar el idioma dominante del grupo y resumir en ese
  idioma (default: español rioplatense).
- **Contexto LMTM**: si el grupo es de un cliente, el resumen debe
  terminar con un flag si hay decisiones que requieren acción del
  equipo de cuentas de LMTM.
- **Falla silenciosa**: si la API de IA falla, el bot NO rompe el
  grupo. Loguea el error y sigue.
- **No inventar**: si los mensajes son ambiguos, el resumen debe decir
  "no quedó claro" en lugar de asumir.

## Stack técnico (LMTM-OS)

- **OpenWA** (compatible con Baileys): conexión al WhatsApp real
- **Webhook** entrante: `POST /api/wa-bot/webhook` recibe eventos de OpenWA
- **Timer de inactividad** per-grupo, server-side (`groupTimers` Map)
- **IA summarizer**: cascade Claude Haiku 4.5 → OpenAI gpt-4o-mini → MiniMax M3
- **Persistencia**: tablas `wa_group_messages`, `wa_group_summaries`, `wa_bot_config`
- **Delivery**: reusa el helper de `/api/sessions/{id}/messages/send-text`
  de OpenWA para inyectar al grupo

## Endpoints de la API

```
GET  /api/wa-bot/status              → estado de conexión + QR
GET  /api/wa-bot/qr                  → QR code (string base64)
POST /api/wa-bot/start               → arrancar sesión OpenWA
POST /api/wa-bot/stop                → detener sesión
POST /api/wa-bot/webhook             → webhook entrante de OpenWA
GET  /api/wa-bot/groups              → grupos con actividad
GET  /api/wa-bot/groups/:jid/messages     → mensajes de un grupo
GET  /api/wa-bot/groups/:jid/summaries    → summaries previos
POST /api/wa-bot/summary/run         → forzar resumen de todos los grupos
PATCH /api/wa-bot/config             → cambiar inactivityMinutes global
```

## Tareas típicas

- **Diagnosticar por qué no hay resumen**: el grupo no acumuló 3+ mensajes,
  la inactividad no llegó, OpenWA no está conectado, falta API key de IA.
- **Forzar resumen**: `POST /api/wa-bot/summary/run` corre el resumen
  de los últimos 24h de todos los grupos.
- **Cambiar la inactividad**: `PATCH /api/wa-bot/config` con nuevo
  `inactivityMinutes`.
- **Recuperar historial**: `GET /api/wa-bot/groups/:jid/messages?since=...`

## Anti-patrones

- Responder a cada mensaje del grupo (no es un bot conversacional)
- Resumir grupos con menos de 3 mensajes (ruido)
- Inyectar el resumen con caracteres rotos (usar `*` para bold, `\n` para saltos)
- Mezclar resúmenes de varios grupos en uno solo (mantener separados)
- Olvidar persistir el resumen (siempre guardar en `wa_group_summaries` antes de enviar)
