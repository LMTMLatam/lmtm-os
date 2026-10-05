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

## Referencia del 05/10 (ventana 21/09–04/10)

Lo que el playbook pausaría hoy (`--referencia`): Distrillantas 1 campaña (WP AVELLANEDA,
CPL 1.234 vs 786) y 3 conjuntos; MA PROPIEDADES 12 campañas de Meta; SEBASTIAN RAMASCO
PADILLA 5. Google: nada en las dos inmobiliarias (conversiones dudosas).
