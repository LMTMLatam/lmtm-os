# Chat A (Datos y agentes): estado y bitácora

Se actualiza al final de cada vuelta. Lo más reciente arriba.

## Estado

| Fase | Estado | Rama / PR |
|---|---|---|
| A1. Salud de fuentes | **en producción** (boot 15:21 UTC), verificado | PR #1 |
| A2. Métricas + objetivos | **en producción** (boot 16:08 UTC) | `rediseno/a-metricas` |
| A3. Aislamiento por cliente | **en producción** (boot 16:08 UTC); limpieza de memoria hecha | `rediseno/a-aislamiento` |
| A4. Agentes con objetivo (piloto, motor actual) | preparación commiteada; el piloto espera la tabla `decisiones` de B1 | `rediseno/a-agentes` |
| A5. Resto de los roles | pendiente | |

**Integración:** A es el integrador (mergea, deploya y verifica en producción, lo
suyo y lo de B). Canal con B: rama `rediseno/buzon`.

**Esperando a una persona:**
- Limpiar la plantilla de ClickUp (OnBoarding de inmobiliaria en ~70 carpetas,
  posteos de Cliente Natural en 6). La plantilla en sí solo se corrige desde la app.
- Rubro real de LoMasFundas (brain dice Deporte; los agentes "corrigieron" a
  productos naturales a partir de la memoria contaminada).
- DUNOD: falta el permiso `pages_read_user_content` en la app de Meta (orgánico).
- Accesos de Google en el MCC: SERRAT, HANSHI, SKYGARDEN, PRONE (403 desde 14/09).

## Bitácora

### 05/10: A3 aislamiento por cliente

**El problema, medido.** El dueño vio sugerencias de una inmobiliaria en
Distrillantas (gomería). Tres fugas:
1. Carpetas de ClickUp creadas copiando otras: el OnBoarding de "Cliente
   Inmobiliario" (objetivos de propiedades) está en ~70 carpetas, y los posteos de
   "Cliente Natural" en Super Redes de 6. Todo creado en bloque el día de cada
   carpeta (Distrillantas: 02/07 08:03-08:07 UTC, creador Marcos Lewis).
2. El review de contenido (07/07) leyó esos posteos y guardó "productos naturales"
   en la memoria de 7 clientes; los agentes lo propagaron.
3. Efemérides sin filtro de rubro: el 12/09 "Día del Corredor Inmobiliario" a 45
   clientes que no son inmobiliarias. El filtro existente además aplicaba todas las
   de nicho a clientes sin rubro (`"x".includes("")`).

**Hecho.** Efemérides por rubro en el motor de oportunidades (con el bug del
filtro corregido); filtro de contenido de plantilla en el review y en el lector de
Super Redes; escaneo diario de contaminación al resumen (nivel 3); skills de los
agentes advierten sobre la plantilla. Limpieza: 7 reviews contaminados borrados con
resguardo en `client_memory_backup_20261005_plantilla`.

**Verificado:** 7 resguardados, 0 contaminados quedan, 5 reviews legítimos intactos.
Quedan 15 menciones de "productos naturales" escritas por agentes: casi todas son
correcciones ("NO productos naturales"); las de LoMasFundas esperan decisión humana.

**De paso (lo mostró A1):** Meta cortaba con "reduce the amount of data" al traer
creativos de MA PROPIEDADES y HANSHI; `paginate()` ahora achica la página y sigue.

### 05/10: A2 métricas y objetivos

**Hecho.** `metricasCliente()` con el contrato de PLAN.md y dos ajustes avisados a
B: inversión y leads son `null` sin cuenta conectada, y se suma
`objetivo.tcplFuente`. El objetivo va en cascada: el del cliente
(`metadata.cplObjetivo`), si no el historial (CPL de 30 días × 0,8 con 10 leads o
más), si no el rubro. Sin tabla nueva. Chequeo diario de consistencia desde `raw`,
con aviso de nivel 4 si algo no cierra.

**Verificado contra producción (solo lectura):**
- Distrillantas 31/08-29/09 Meta, medido en el mismo momento: métricas = panel
  público (ARS 2.519.657,84, 2.422 leads, 29.195 clics). Objetivo propuesto: ARS
  832 (historial). Ventas: 171 compras de Meta.
- Cliente sin cuentas (Agencia LMTM): inversión, leads, CPL y objetivo en `null`.
- Consistencia: 25.214 filas, 0 diferencias en leads, 0 en ventas, 0 huérfanas.
- Tests: 20 entre `metricas` e `ingest`; tsc limpio.

**Pendiente:** leads calificados (el CRM vive en otra base); alcance y frecuencia
del período (hace falta que la ingesta los traiga sin `time_increment`).

### 05/10: A1 salud de fuentes

**Plan.** Sin tabla nueva: `saludFuentes()` junta los hechos (mappings, últimas 30
corridas por cuenta en `sync_logs`, último dato en `ads_insights`, último post y
último refresco de métricas del orgánico) y una función pura los clasifica. El
autosync anota en la metadata de su log las partes best-effort que fallan
(creativos, audiencia, orgánico), que hasta hoy morían en un `console.warn`.

**Decisiones.**
- Capa cruda separada: postergada. `ads_insights.raw` ya guarda el payload y
  recalcular desde ahí da 0 diferencias; los reemplazos ya son transaccionales.
- Servicio `lmtm-ingest` aparte: postergado hasta que el sync pese en el web.
- Orgánico: la frescura se mide por el refresco de `organic_post_insights`, no por
  `organic_posts.synced_at`, que nunca se actualiza (el insert ignora repetidos).
  Con la señal vieja parecía que 15 clientes estaban desactualizados; era 1.

**Verificado contra producción (rol de solo lectura), 05/10:**

| fuente | fallando | atrasada | sin_conexion | sin_entrega | ok |
|---|---|---|---|---|---|
| meta_ads | 1 | 0 | 32 | 9 | 17 |
| google_ads | 4 | 0 | 39 | 8 | 8 |
| organico | 1 | 1 | 33 | 2 | 22 |

- Los 32 `sin_conexion` de Meta son exactamente los 32 clientes sin cuenta mapeada.
- Google: HANSHI, PRONE, SERRAT y SKYGARDEN `fallando` hace 30 corridas (desde
  14/09), "403: The caller does not have permission".
- HANSHI Meta: `fallando` hace 14 corridas (desde 25/09), "400: Service temporarily
  unavailable", último dato 15/06. La última corrida buena (24/09) tampoco trajo
  datos: la pauta está pausada desde junio y además el sync falla.
- DUNOD orgánico: `atrasada`, 101 posts (último 30/06) y ninguna métrica
  sincronizada nunca. Con el registro por partes, el próximo sync dirá si falla.
- Tests: 13 de `salud`, 390 propios en total, tsc limpio.

**Qué queda después del deploy:** confirmar en el sync de la noche siguiente que
aparecen `metadata.partesFallidas` en `sync_logs` cuando una parte falla:
`select metadata->'partesFallidas' from sync_logs where metadata ? 'partesFallidas' order by completed_at desc limit 20;`
