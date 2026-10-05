# Chat A (Datos y agentes): estado y bitácora

Se actualiza al final de cada vuelta. Lo más reciente arriba.

## Estado

| Fase | Estado | Rama / PR |
|---|---|---|
| A1. Salud de fuentes | PR abierto, falta deploy | `rediseno/a-salud-fuentes` |
| A2. Métricas + objetivos | siguiente | |
| A3. Aislamiento por cliente | pendiente | |
| A4. Agentes con objetivo (piloto, motor actual) | pendiente | |
| A5. Resto de los roles | pendiente | |

**Esperando a Nazareno:** deploy de A1 (no tiene migraciones).

## Bitácora

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
