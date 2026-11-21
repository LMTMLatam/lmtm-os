# Estado del plan 21/11 — bitácora

## Decisiones tomadas por Claude (21/11, Naza: «tomá vos las decisiones»)

1. **Plata y avisos vendidos: se cargan en el panel**, en la ficha del cliente (sección Cuenta), no en la
   PLANILLA GENERAL. La escritura de agentes en las planillas del equipo está frenada a propósito y no se tocó.
   Queda en `clients.metadata.cotizado` (`metaMes`, `googleMes`, `avisosMes`). Solo admin.
2. **Salida de videos: solo Drive** (decisión de Naza del 18/11). El NAS sigue en solo lectura.
3. **Engranado:** la persona elige gancho y cierre en el pedido; no se subtitula salvo que se pida.
4. **Aprobación del cliente desde su link: NO se hizo.** Toca a clientes y escribe en ClickUp; no se puede probar
   sin tocar tareas reales. Queda para una sesión con una persona mirando.
5. **Abono:** campo en la ficha (sección Cuenta), solo admin. Los números los carga Naza.
6. **Los meses cerrados se miden solo contra Instagram.** La etiqueta de ClickUp no es confiable y pedir 3 meses
   de 41 listas no entra en un pedido. Sin cuenta leída: «sin medir».
7. **El informe trimestral se arma a pedido** en la ficha (texto para copiar), con los números del sistema. No hay
   rutina que lo mande sola ni paso de aprobación: es interno, para decidir precio.
8. **La lectura de la cuenta es de todo el equipo** (como «cotizado vs realizado»); el abono y la carga, solo admin.

## Hecho (commit a1032be)

| Fase | Qué | Dónde |
|---|---|---|
| 1 | Cotizado vs realizado por mes: posteos, videos, historias, avisos, inversión Meta y Google | `server/src/services/cotizado.ts`, `cuenta.ts` · ficha → Cuenta |
| 2 | Salud en una vista: índice, consultas 30 d vs 30 anteriores, calidad de pauta, mejoras ejecutadas, oportunidades, seguidores | `cuenta.ts` (`saludCuenta`) |
| 2 | Seguidores de Instagram, un número por mes | `stories.ts` (`sellarSeguidores`), cada 6 h con la captura de historias |
| 3 | Señal de cobro: 120 % o más / 70 % o menos en 2 de los 3 meses cerrados | `cuenta.ts` (`senalDeCobro`) · Semáforo de clientes |
| 3 | Informe trimestral en texto | `cuenta.ts` (`textoInformeTrimestral`) · ficha → Cuenta |
| 4 | Carga del equipo en piezas por mes (lo vendido de sus cuentas, por rol) | `cotizado.ts` (`piezasDelRol`) |
| 7 | Abono por cliente | `PATCH /clients/:id` (`abonoMes`) |
| Video | `video_engranar` / `lmtmVideoEngranar`: gancho + propiedad + cierre del NAS, audio a −14 LUFS, sin modelos | `video-agente.ts` |

Rutas nuevas: `GET /growth/cuenta`, `GET /clients/:id/cuenta`. `PATCH /clients/:id` acepta `cotizado` y `abonoMes`.
Tests: `server/src/services/__tests__/cuenta.test.ts` (12) y el de engranado en `video-agente.test.ts`.

## No hecho, y por qué

- **Fase 5, planillas sueltas.** Se miraron las dos carpetas:
  - `1OcvVV…`: `TRACKER_<MES>.xlsx` (videos encargados y entregados por cliente) y
    `Ranking_clientes_mas_a_menos.xlsx`. Son Excel, no planillas de Google: el servidor no tiene lector de Excel y
    no se sumó una dependencia por esto. Si el tracker pasa a planilla de Google se lee igual que la PLANILLA
    GENERAL. El ranking ya dice lo que busca Marcos para video: marzo a octubre, 584 encargados contra 820
    entregados (+236). De más: Reno +10 por mes, Brachetta +9, MA +6, LMTM +5. De menos: Ramasco −2,4,
    Roibas −2, Hanshi −1,9, Bitti −1,7.
  - `1ejJdV…`: planillas de gastos del bot, una por cliente. Casi todas son la plantilla vacía de abril (2,9 KB);
    con datos, solo Gala_Gastos y Metricas_Skygarden. No hay nada que integrar.
- **Fase 6, aprobación del cliente.** Ver decisión 4.
- **Margen por cliente.** `GET /growth/profitability` ya existía pero resta dólares (costo de agentes) de pesos
  (abono): el número sale mal. No se mostró en pantalla. Falta decidir el tipo de cambio.
- **Engranado automático** (disparo nocturno, botón en el panel). Hoy es una herramienta que se pide a mano o por
  el conector. Antes de automatizar faltan dos reglas del equipo: qué persona va con qué propiedad y exportar la
  propiedad sin logo.
- **Herramienta en la lista del Editor y del Productor.** `video_engranar` existe en el servidor y en el conector
  del equipo; sumarla a `PAPERCLIP_MCP_TOOLS` de los agentes es un cambio en la base de producción (con respaldo)
  que no se hizo.

## Sin verificar en producción

- La lectura de seguidores (`followers_count` de Meta): corre en la próxima captura de historias. Si Meta la
  niega, las historias se guardan igual y seguidores queda «sin dato».
- `video_engranar` en el servidor: la misma secuencia (`vtool unir` + `normalizar`) se probó en esta PC con los
  archivos de DUNOD, no en el contenedor.
