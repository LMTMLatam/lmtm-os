# Media buyer en sombra: piloto A4

Rol nuevo "Media buyer (Meta + Google)" (PLAN.md §4), probado primero sobre el
motor actual con el agente Milo (Paid Media). En sombra = nivel N0: **propone, no
ejecuta**. Cada propuesta queda armada en `approvals` (tipo `accion_pauta`) y una
persona la aprueba con un click o la descarta. La autonomía de pauta está apagada
en producción (`LMTM_AUTONOMIA_PAUTA` no existe), así que nada se ejecuta solo.

## Clientes y objetivo

| Cliente | Por qué está en el piloto |
|---|---|
| Distrillantas | Mensajes por sucursal + tráfico + catálogo + Google: mezcla de objetivos |
| MA PROPIEDADES | Muchas campañas por propiedad; Google con conversiones falsas |
| SEBASTIAN RAMASCO PADILLA | Igual que MA PROPIEDADES, cuenta más chica |

Objetivo por cliente: **CPL de Meta en o debajo del objetivo sin perder volumen de
leads**. El objetivo sale de `metricasCliente` (`objetivo.tcpl` y su fuente). Google
de MA PROPIEDADES y SEBASTIAN RAMASCO PADILLA no tiene objetivo: sus "leads" no son
leads hasta que alguien corrija las conversiones en la cuenta.

## Rutina (cargarla desde el panel, asignada a Milo)

- Título: `Media buyer en sombra (piloto)`
- Disparo: `0 11 * * 1-5` (después de que entra el sync de la mañana)
- Descripción:

> Sos el media buyer de Distrillantas, MA PROPIEDADES y SEBASTIAN RAMASCO PADILLA.
> Para cada uno:
> 1. `lmtmGetClientCampaigns` (14 días). Leé el `objetivo`, la `frescura` y las notas.
>    Si una fuente está `fallando` o `atrasada`, decilo y no propongas sobre esa plataforma.
> 2. Aplicá el playbook, solo a campañas cuyo objetivo es leads o mensajes:
>    - gastó menos de 3 × objetivo: esperar, no hay datos;
>    - 0 leads con 3 × objetivo gastado, o CPL arriba de 1,5 × objetivo: proponé pausar
>      (la campaña, o el conjunto si el problema es uno solo);
>    - CPL debajo del objetivo y con presupuesto propio: proponé subir 20% como máximo.
>    Nunca: campañas de tráfico, alcance o catálogo por CPL; la campaña de marca;
>    nada con `leadsDudosos`; comparar Meta contra Google.
> 3. Cada propuesta va con `lmtmPauseAdEntity` o `lmtmSetBudget` SIN `approved`, con
>    `justificacion` que cite gasto, leads, CPL y objetivo de esa entidad.
> 4. Cerrá con un comentario por cliente: qué propusiste, qué dejaste correr y por qué.
>    Si no hay nada que proponer, decilo: no proponer también es una respuesta.

Herramientas que tiene que tener en la allowlist: `lmtmGetClientCampaigns`,
`lmtmGetClientAdsPerformance`, `lmtmPauseAdEntity`, `lmtmSetBudget`.

## Cómo se mide (sale del piloto con números)

1. **Evaluador automático** (`server/src/metricas/eval-propuestas-cli.ts`): corrige cada
   propuesta contra los números que había ese día. Meta: 90% defendibles.
2. **Decisión humana**: aprobadas, descartadas (con motivo) y sin mirar. Meta: 60% aprobadas.
3. **Cobertura**: `--referencia "<cliente>"` lista lo que el playbook pausaría. Cuánto de
   eso propuso el agente, y qué propuso que el playbook no veía.
4. **Efecto**: las pausas ejecutadas ya se re-miden a los 7 días (veredicto en el brain).
5. **Costo**: duración y corridas de la rutina en `heartbeat_runs`.

Dos semanas. Si pasa, se habilita N1 (ejecutar lo reversible hasta un tope) en estos 3
clientes y se suma el siguiente grupo.

## Desde el 07/10: también en el runner propio

La misma revisión corre en el runner de LMTM (`server/src/agentes/`, procedimiento
`revision-diaria` de `roles/media-buyer.md`) a las 11 de lunes a viernes, un
trabajo por cliente, firmada por el agente "Media buyer". La rutina de Milo en
paperclip sigue igual: el evaluador corrige las dos (`eval-propuestas-cli.ts` toma
todas las `accion_pauta`, con el nombre del agente) y la que gane se queda.
En el runner el escalón N0 lo aplica el motor (le saca `approved` a toda
llamada), no el prompt.

Ojo con los números de antes del 07/10: el estado y el presupuesto de los
conjuntos venían de mediados de agosto (el sync diario no traía conjuntos,
arreglado en `084baae`). Las propuestas sobre conjuntos de esos días pueden
estar evaluadas contra datos viejos.

## Bitácora del piloto

| Día | Propuestas | Defendibles (evaluador) | Aprobadas / descartadas | Duración | Nota |
|---|---|---|---|---|---|
| 06/10 | 22 (4 subir, 18 pausar) | 20/22 (91%) | pendientes | 6 min | Las 2 fallas: escaló contra el objetivo total (972) y no el de Meta (790). Arreglado en la tool (`2b95887`). |

Cobertura contra `--referencia` del 05/10: MA PROPIEDADES 12 → propuso 13; SEBASTIAN
RAMASCO PADILLA 5 → 4 (dejó la de interacción); Distrillantas: propuso 1 de los 3
conjuntos y no vio WP AVELLANEDA (la misma causa del objetivo total).

## Referencia del 05/10 (ventana 21/09–04/10)

Lo que el playbook pausaría hoy (`--referencia`): Distrillantas 1 campaña (WP AVELLANEDA,
CPL 1.234 vs 786) y 3 conjuntos; MA PROPIEDADES 12 campañas de Meta; SEBASTIAN RAMASCO
PADILLA 5. Google: nada en las dos inmobiliarias (conversiones dudosas).
