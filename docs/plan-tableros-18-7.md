# Plan de implementación — RESUMEN DE TABLEROS 18/7

Backlog del documento del jefe. El loop autónomo implementa → testea → fixea →
avanza. Estados: `[ ]` pendiente · `[~]` en curso · `[x]` hecho y verificado ·
`[!]` bloqueado (motivo anotado, se retoma cuando se destrabe).

## Decisiones tomadas (18/7, con opciones)
- Cotizado/facturación: leer SIEMPRE de planillas Google (OAuth existente)
- Tareas: WhatsApp a grupos + listado interno (sin Todoist)
- Tendencias daily + briefs 8/18: WhatsApp al grupo del equipo (falta el grupo → fallback número interno)
- Lectura de chats WA de clientes: POSTERGADO · Tokko: POSTERGADO · Hostinger: DESCARTADO
- Horas: estimar por tareas · Vigilantes en orden Financiera→Contenido→Salud Cliente
- Tope 8 interrupciones/día, nivel 4 agrupado · Blog: borrador primero · GSC: cuenta OAuth actual

## Backlog

- [x] A0. Motor de intervenciones (tabla + niveles + dedupe + tope diario) — deploy 18/7
- [x] A1. Vigilante Financiera (saldo L5 + msg reenviable, consumo brusco L4, sin actividad 48h L4) — deploy 18/7
- [x] A2. Brief 8:00/18:00 ART (fallback número interno hasta tener el grupo)
- [x] B. Vigilante Contenido — VERIFICADO 20/7 (13 intervenciones; carrusel >10 imgs: [!] sin data de adjuntos en ClickUp) → interventions: aprobado-no-publicado (overdue), carrusel incompatible (>10 imgs o mixto), inactividad 72h, sheet desync
- [x] C. Salud del Cliente — VERIFICADO 20/7 (56 evaluados, 4 preocupado): índice /100 por cliente (responde/aprueba/campañas/inversión/atrasos) + "estoy preocupado" (multi-señal degradándose) → dashboard + vigilante
- [x] D. UI Centro de Inteligencia — VERIFICADO 20/7 (página live, endpoints ok) en el panel (intervenciones por nivel, resolver/descartar, salud de clientes) — reemplaza al tablero "Inteligencia" sin propósito
- [x] E. Análisis estratégico — VERIFICADO 20/7 (DUNOD: 4 campañas, 2 fatigadas, reinversión +25 leads; card live con copiar-para-cliente. Audiencia-vs-target: [!] falta señal de "quién compra", se suma con Tokko) en lenguaje cliente (avisos >90d fatigados, "podrías lograr X leads más si...", campañas/conjuntos/anuncios con análisis + gráfico compartible, audiencia con lectura target-vs-contenido)
- [x] F. Cotizado vs realizado — VERIFICADO 20/7 (48 filas, cumplimiento % vivo; inversión $ cotizada: [!] espera planilla facturación). Refinado 20/7: desglose por tipo "hecho/cotizado ✓✗" + prorrateo a días transcurridos. Decisión 20/7 (usuario): el "hecho" sale de CLICKUP (calendario Redes, tag "mandado a make", clasificado por Tipo de Contenido: Reel/Clip corto/Video Largo=video, Story=story, resto=posteo; fallback al nombre), NO de la API de Meta. Cache 10 min (41 listas ≈ 16s primera carga, 0.5s después). Stories se muestran pero no pesan en el % (el equipo no las registra como tareas: 0/41 clientes)
- [x] F2. Carga del equipo — 20/7: el link del docx (gid=714093978) resultó ser la misma PLANILLA GENERAL; las columnas AA-AH ("Responsable de atención": diseño/filmaker/edición/copy/gestión/posteos/pauta) tienen la organización interna → endpoint /growth/carga-equipo + card en Growth (cuentas por persona, sobrecarga marcada) + flags pauta Meta/Google cotizada (cols W/X) en la tabla de cotizado. La planilla NO tiene montos $: la inversión cotizada en pesos sigue sin fuente.
- [x] G. Derivación de tareas — VERIFICADO 20/7 (test: SkyGarden→Paz diseño ✓; ya derivó trabajo real: ADR Luparini→Caro)
- [x] H. Tendencias daily en morning brief — deployado 20/7 (verificación final con el brief de las 8am)
- [x] I. Ganchos anti-duplicados — VERIFICADO 20/7 (rechaza dup con mensaje, acepta únicas)
- [x] J. Propuesta CM — VERIFICADO 20/7 (5 propuestas reales: MAERS, BITTI, Hotel Libertador, IMPERIA; card en dashboard)
- [x] K. Semáforo master — VERIFICADO 20/7 (56 clientes; nota: los 40 rojos incluyen sin-cuenta-mapeada)
- [x] L. Issues citan origen de datos — lección de equipo plantada 20/7 (citar tool + números + fecha; feedback BOERO)
- [x] M. Efemérides por rubro — VERIFICADO 20/7 (matriz devuelve "Día del Amigo" para retail; ventana 21d adelante)
- [x] N. SEO/GEO LMTM — Sergio ya escribió la 1ra nota ("Agencia agéntica"); [!] publicar en WP requiere Application Password; [!] GSC requiere re-auth con scope webmasters
- [x] O1. CRM búsqueda DUNOD — ARREGLADO Y DEPLOYADO 20/7: search_properties ignoraba TODOS los filtros (traía las primeras 20 de la cartera); ahora filtra operación/tipo/zona/precio/ambientes server-side + parámetro operation nuevo. Commit pusheado a Nazacarames/SAAS (08e5c10) y servicio charlott-fastapi reiniciado sano en el VPS
- [!] O2. CRM leads sin nombre/teléfono + edición — requiere sesión dedicada al frontend del CRM (repo/VPS/deploy ya documentados acá)
- [!] O3. CRM rubros nuevos (MUNDO INFLABLE, MAERS, LMTM, Hiper, Distrillantas) — producto por vertical, sesión dedicada
- [x] P. Unificar Competencia — VERIFICADO 20/7 (sidebar limpio, ruta redirige a Nichos)

## Agregados 20/7 (revisión del doc vivo + pedido de consultas IA)
- [x] Q. Consultas IA del equipo (ChatGPT/Gemini) → brain: card en dashboard de cliente para pegar la conversación (o link compartido) → documento (key `consulta-ia`) + issue "[CLIENTE] Destilar consulta IA al brain" asignado a Caro + wakeup. Mismo circuito que el import histórico de ChatGPT. Rutas /clients/:id/consultas-ia (GET/POST), servicio `consultas-ia.ts`. VERIFICADO en prod (validación 400 + listado 200).
- [x] R. Plan de Marketing de ClickUp → agentes: el doc pedía nutrirse de "reuniones y planificaciones en plan de mkt". Tool nuevo `get_client_marketing_plan` (`getPlanMarketing` en clickup-sync: lista "Plan de Marketing" del folder, cache 6h, más recientes primero) + wrapper MCP `lmtmGetClientMarketingPlan` + agregado a PAPERCLIP_MCP_TOOLS de los 14 agentes + backup regenerado. VERIFICADO en prod (DUNOD devuelve tareas reales).
- [x] Grupo WA del equipo: confirmado — `LMTM_ALERTS_WHATSAPP` ya es el grupo (…@g.us); briefs y vigilantes caen ahí vía alertsNumber(). No hacía falta LMTM_TEAM_WA_GROUP.

## Agregados 20/7 tarde (semáforo + plan de acción)
- [x] S. Growth rediseñado: triage ROJO/AMARILLO/VERDE manda arriba (endpoint /growth/triage, servicio `plan-accion.ts` cache 5min); cada cliente con problemas concretos + plan corto determinista (cumplimiento, intervenciones, pauta, oportunidades, movidas del radar). Detalle viejo (cotizado, carga, semáforo pauta, KPIs) colapsado abajo en `<details>`. Distribución verificada: 19 rojo / 17 amarillo / 20 verde.
- [x] T. Ficha del cliente → tab "Plan de acción": triage del cliente + reporte ESTRATÉGICO del agente (deliverable "Plan de acción YYYY-MM-DD — CLIENTE") + botón regenerar (issue a Luna + wakeup). Rutina "Plan de acción por cliente (reporte estratégico)" activa — 27/56 clientes ya con plan el primer día.
- [x] U. Radar de nichos ampliado: prompt actualizado para cubrir TODOS los clientes del rubro (antes "2-3 representativos").
- [x] V. Fix señal noAds: `components.noAds` de account_scores ya no castiga — vigilante salud repesa 0.5·ops+0.5·contenido sin pauta corriendo, y el triage no marca rojo por pauta que no existe. Endpoint POST /ops/vigilantes/salud/run para re-correr a demanda.

## Agregados 22/7
- [x] W. Panel Licitaciones (Mercado Público/ChileCompra): tabla licitaciones (0126 + journal), sync diario con keyword-filter marketing + detalle throttled, rutas GET/PATCH/sync, página + sidebar, tools de agente (list/set estado), rutina "Curador de licitaciones" (Carlos, lun-vie 10 ART) que marca util (con relevancia) / descartada. Ticket en CHILECOMPRA_TICKET. Primer sync: 4164 activas → 74 matchean → 26 candidatas guardadas.
- [x] X. Google Ads: dev token ya estaba en Railway (lo aprobado 22/7 fue el Basic Access de Google); conexión google corrupta (scopes de Meta, bug pre-9/7) revocada. [!] Falta: click "Conectar Google" en /company/settings/integrations/ads con la cuenta dueña del MCC 453-458-4343 → después mapear cuentas hijas y arranca el sync de insights Google (hoy 0 filas).

## Bloqueados esperando al usuario
- Grupo de WhatsApp del equipo (LMTM_TEAM_WA_GROUP) → briefs van al número interno mientras
- Planilla de facturación en $ (la del docx es la PLANILLA GENERAL: cantidades y responsables, sin montos — falta la fuente de lo que se cobra a cada cliente)
- DNS crm.lmtmas.com (registro A → 82.29.56.162)

## CIERRE DEL LOOP — 20/7
Backlog completo: 18 [x] verificados + 2 [!] para sesión dedicada (leads CRM, rubros CRM).
Bloqueados esperando al usuario: WP Application Password, re-auth GSC (scope webmasters), grupo WhatsApp del equipo (LMTM_TEAM_WA_GROUP), planilla de facturación, DNS crm.lmtmas.com.
