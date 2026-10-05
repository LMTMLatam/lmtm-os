---
name: lmtm-ad-actions
displayName: Acciones sobre pauta (pausar) — ejecutar, no solo proponer
description: Cómo y cuándo PAUSAR una campaña o adset de Meta con lmtmPauseAdEntity. Única acción de escritura sobre pauta. Usala cuando detectes gasto sin conversiones o un aviso quemando presupuesto — con OK humano previo.
required: false
---

# Acciones sobre pauta — pausar (con OK humano)

Ahora podés EJECUTAR, no solo proponer: `lmtmPauseAdEntity` pausa una campaña o
adset de Meta de un cliente. Es la única acción de escritura sobre pauta que existe
(no hay reanudar, subir presupuesto ni crear por acá — eso lo hace un humano).

## Cuándo pausar

Señales claras, con números en la mano. Sacalos de `lmtmGetClientCampaigns`: es la
única que trae cada campaña y conjunto con su id, gasto, leads, CPL y `gastoSobreObjetivo`
(`lmtmGetClientAdsPerformance` da solo el total del cliente, sin ids). Si una campaña
viene con `leadsDudosos`, su CPL no sirve para decidir nada.
- Aviso/adset con gasto y **0 (o casi 0) conversiones** sostenido.
- CTR muy por debajo del promedio de su campaña y del benchmark del rubro (`lmtmGetNicheIntel`).
- CPL disparado vs el rubro sin señal de mejora.

No pauses por ruido de un día: mirá una ventana razonable (7-14d) antes de proponer.

## Flujo obligatorio (mueve plata real)

1. **Detectá y fundamentá**: qué entidad (id de `lmtmGetClientCampaigns`), cuánto gastó,
   cuántos leads, contra qué objetivo.
2. **Dejá la propuesta armada**: `lmtmPauseAdEntity({clientId, entityType:"campaign"|"adset", entityId, justificacion})`
   SIN `approved`. El server la guarda lista para que una persona la apruebe con un click y
   la ejecuta él mismo al aprobarla. No hace falta que vuelvas a llamar la tool.
   - Sin `justificacion` no se arma nada: poné los números (gasto, leads, CPL vs objetivo).
   - El server verifica que la entidad sea de ESE cliente; si no, rechaza.
3. Nombrá la propuesta en el issue (la tool te devuelve el id) para que la persona llegue directo.
4. `approved:true` solo si una persona lo aprobó explícitamente en el issue.

## Después de pausar

- La acción queda registrada (ledger propuesta→resultado). Dejá un comentario en el issue:
  qué pausaste, por qué, y qué esperás que mejore.
- **A los 7 días el sistema MIDE solo si sirvió**: compara el CPL/CTR del cliente la semana
  antes vs después de la pausa y escribe el veredicto (MEJORÓ / igual / EMPEORÓ) en el brain
  del cliente (`lmtmGetClientBrain`, memoria `pausa-<id>`). Antes de proponer una pausa parecida
  a una que ya hiciste, leé el brain: si una pausa anterior EMPEORÓ los números, no la repitas.
- Si la pausa era para reasignar presupuesto a otra campaña, eso (subir presupuesto) es acción
  humana — dejalo como recomendación, no lo ejecutes.

## Límite

Nunca reanudes, subas presupuesto, crees campañas ni borres nada por vía automática. Ante la
duda sobre si algo afecta gasto, proponé y esperá — no avances solo.
