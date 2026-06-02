---
name: lmtm-n8n-workflows
displayName: n8n workflows
description: Patrones de workflows en n8n: triggers, error handling, retry, webhooks, credenciales.
required: false
---

# n8n workflows

## Conceptos base

- **Node**: una operación (HTTP, DB query, Send email, Code, etc.).
- **Trigger**: el primer node que inicia el workflow (webhook,
  schedule, manual, app event).
- **Execution**: una corrida del workflow (con sus inputs y outputs).
- **Workflow**: la definición (los nodes y cómo se conectan).
- **Credential**: auth guardada por n8n para conectar a servicios
  externos.

## Triggers comunes

### Webhook

```
[Webhook node] → [Validate payload] → [Process] → [Response]
```

**Configuración**:
- Method: POST (default), GET, etc.
- Authentication: none, header auth, basic auth.
- Response mode: responseNode (manual), immediately (auto-200),
  onReceived.
- Path: único por workflow.

**Test**: usar el "Test URL" primero (devuelve data dummy al editor),
después el "Production URL".

### Schedule (cron)

```
[Schedule trigger] → [Query DB] → [Process] → [Send to API]
```

**Expresión cron**:
- `0 9 * * 1-5` — 9 AM, lunes a viernes
- `0 */6 * * *` — cada 6 horas
- `0 0 1 * *` — primer día del mes
- Timezone: crítica. Configurar en el nodo o en el workflow.

### App events (polling)

- Stripe: new customer
- HubSpot: new contact
- Gmail: new email
- Etc.

Útiles para: "cada vez que entra un lead, mandá email".

## Patrones de diseño

### 1. Linear (el más simple)

```
[Trigger] → [Step 1] → [Step 2] → [Step 3] → [Done]
```

Uso: tareas simples, una sola salida.

### 2. Switch / If

```
[Trigger] → [Switch node] → [Branch A] (condición X)
                          → [Branch B] (condición Y)
                          → [Default branch]
```

Uso: enrutar según input (ej. tipo de evento, país, tier).

### 3. Loop over items

```
[Trigger] → [Get list] → [Loop] → [Process item] → [Next iteration]
                                      ↓
                                [Aggregate results]
```

Uso: procesar N items (ej. 100 leads, 50 ad accounts).

### 4. Sub-workflow

```
[Main workflow] → [Execute sub-workflow] → [Continue]
```

Uso: lógica reutilizable, separación de concerns.

### 5. Error handling robusto

```
[Main flow]
   ↓ (on error)
[Error trigger workflow] → [Log error] → [Alert]
```

Configuración:
- Settings → Error Workflow → seleccionar un workflow de error
  separado.
- El error workflow puede loggear, alertar (Slack, email), o intentar
  retry.

## Error handling

### Por nodo

- **On Error**:
  - `Stop Workflow` — default, para todo.
  - `Continue (using error output)` — sigue, marca como fallido.
  - `Continue (using input data)` — sigue, no marca como error.
- **Retry on Fail**: boolean, cuántos intentos, delay entre intentos.

### Global

Settings del workflow:
- **Error Workflow**: workflow separado que corre cuando este falla.
- **Save Execution Progress**: sí, siempre.
- **Save Data Error Executions**: sí, para debug.
- **Timeout**: cuánto tiempo antes de marcar como timeout.

### Patrón: "Dead letter queue"

```
[Main flow] → [Try] → [Success: continue]
                     → [Fail: send to DLQ table] → [Alert team]
```

La "DLQ" es una tabla DB donde quedan los items que fallaron, para
re-procesar después manualmente.

## Webhooks seguros

### Validación de firma

```
[Webhook] → [Verify HMAC signature] → [If valid: continue] → [If not: 401]
```

Para webhooks críticos (Stripe, GitHub, etc.):
- Calcular HMAC SHA256 del body con tu secret.
- Comparar con el header `X-Signature` (o el que corresponda).
- Si no matchea, return 401 inmediatamente.

### Idempotency

Si el mismo webhook puede llegar 2 veces (timing issues, retries del
sender):

```
[Webhook] → [Check idempotency_key in DB] → [If exists: return 200 OK]
                                          → [If new: process + save key]
```

## Variables de entorno

En n8n, podés usar:

- **Credentials** para auth (API keys, OAuth).
- **Workflow static data** para valores que persisten entre
  ejecuciones (counter, last run time).
- **Execution data** para pasar valores entre nodos.
- **Environment variables** del n8n mismo (Settings → Variables) para
  config global.

**Tip**: nunca hardcodees API keys. Usá credentials.

## Code node (JavaScript / Python)

### Cuándo

- Lógica custom que los nodos built-in no hacen.
- Transformaciones complejas.
- Validaciones específicas.

### Limitaciones

- **Code node** tiene timeout (default 60s).
- **No** acceder a filesystem directamente (es sandboxed).
- **No** hacer HTTP calls pesados (usá HTTP node).
- **Return**: array de items, cada item es un objeto.

### Ejemplo

```javascript
// Input: items = [{json: {email: "foo@bar.com", name: "Foo"}}]
const output = items.map(item => {
  return {
    json: {
      ...item.json,
      domain: item.json.email.split('@')[1],
      first_name: item.json.name.split(' ')[0],
      processed_at: new Date().toISOString()
    }
  };
});
return output;
```

## Postgres en n8n

### Connection

- Host, port, database, user, password (o SSL cert).
- **SSL**: requerido en producción.
- **Connection limit**: 10 default. Ajustar según concurrencia.

### Queries comunes

```sql
-- INSERT con RETURNING
INSERT INTO clients (name, email, created_at)
VALUES ($1, $2, NOW())
RETURNING id;

-- UPSERT
INSERT INTO ads_accounts (client_id, platform, account_id)
VALUES ($1, $2, $3)
ON CONFLICT (client_id, platform)
DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = NOW();

-- Bulk insert
INSERT INTO events (user_id, event_type, properties, created_at)
VALUES {{ $json.values }};
```

### Tips

- **Parámetros** con `{{ $json.field }}` — n8n los escapa por vos.
  No concatenes strings.
- **Batch** queries con `{{ $json.map(x => `(${x.a}, ${x.b})`).join(',') }}`
  si tenés < 100 items.
- **Múltiples ejecuciones** del mismo nodo Postgres = múltiples
  conexiones. Usá connection pooling si vas a escalar.

## Métricas de workflows

Monitoreá en **Executions**:

- **Success rate**: % de ejecuciones exitosas. < 95% = problema.
- **Average duration**: tiempo promedio. Spikes = query lenta o
  API rate limit.
- **Failed executions**: cuáles y por qué. Log + alerta.
- **P95 / P99 duration**: outliers que pueden indicar problemas.
- **Items processed**: volumen. Spikes = trigger raro, drop =
  upstream roto.

## Common anti-patterns

- **No** dejar `On Error = Continue` en nodos críticos. Mejor parar
  y alertar.
- **No** hardcodear credenciales en nodes. Usá credentials.
- **No** hacer loops sin aggregate al final (se pierde el resultado
  completo).
- **No** usar Schedule trigger a 1 minuto si no es necesario (carga
  el server). 5-15 min es usualmente suficiente.
- **No** dejar workflows viejos activos que ya no se usan. Borrar
  o desactivar.
- **No** ignorar el Error Workflow. Sin él, los fallos pasan
  desapercibidos.
