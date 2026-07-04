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

Señales claras, con números en la mano (sacalos de `lmtmGetClientAdsPerformance`):
- Aviso/adset con gasto y **0 (o casi 0) conversiones** sostenido.
- CTR muy por debajo del promedio de su campaña y del benchmark del rubro (`lmtmGetNicheIntel`).
- CPL disparado vs el rubro sin señal de mejora.

No pauses por ruido de un día: mirá una ventana razonable (7-14d) antes de proponer.

## Flujo obligatorio (mueve plata real)

1. **Detectá y fundamentá**: qué entidad, cuánto gastó, cuántas conversiones, vs qué benchmark.
2. **Proponé en el issue** la pausa con esa justificación concreta. NO ejecutes todavía.
3. **Esperá OK humano** explícito en el issue.
4. Recién ahí ejecutá: `lmtmPauseAdEntity({clientId, entityType:"campaign"|"adset", entityId, approved:true})`.
   - Sin `approved:true` la tool te devuelve "requiere OK humano" y no hace nada — es a propósito.
   - El server verifica que la entidad sea de ESE cliente; si no, rechaza.

## Después de pausar

- La acción queda registrada (ledger propuesta→resultado). Dejá un comentario en el issue:
  qué pausaste, por qué, y qué esperás que mejore (ej. "el CPL de la campaña debería bajar al
  reasignar ese presupuesto"). Así después se puede medir si sirvió.
- Si la pausa era para reasignar presupuesto a otra campaña, eso (subir presupuesto) es acción
  humana — dejalo como recomendación, no lo ejecutes.

## Límite

Nunca reanudes, subas presupuesto, crees campañas ni borres nada por vía automática. Ante la
duda sobre si algo afecta gasto, proponé y esperá — no avances solo.
