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

---

# Segunda vuelta (21/11, tarde): lo que había quedado sin hacer

Naza: «implementá todo lo que mencionaste en no hecho, testealo y dejalo bien». Commit `661806a`, desplegado.

| Qué | Cómo quedó | Probado en producción |
|---|---|---|
| El cliente aprueba desde su link | `GET/POST /api/public/dashboards/:slug/aprobaciones`. Apagado por cliente; se prende en la ficha → Cuenta (`metadata.aprobacionPorLink`). Muestra lo que sale en 21 días sin aprobar; «Aprobar» escribe SOLO «Aprobación de cliente» = APROBADO y deja un comentario; «Pedir cambios» deja un comentario. Solo tareas de la lista de Redes de ese cliente. | Sí, con una tarea de prueba en la lista de LMTM: el campo quedó en APROBADO (orderindex 2, lo que mira el despachador), los dos comentarios están, una tarea de otra lista se rechaza, y con el interruptor apagado da 404. La tarea se borró y el interruptor de LMTM volvió a apagado. |
| Trackers de video | `services/tracker-video.ts`: lee la hoja Resumen de `TRACKER_<MES>.xlsx` (zip + XML con zlib, sin librería). Fila «Videos (tracker del equipo)» en la cuenta y en el informe trimestral. | Sí: DUNOD da 8/4 (nov), 8/5 (oct), 8/16 (sep), 8/2 (ago), igual que el ranking del equipo. |
| Margen por cliente | Último mes cerrado: abono − gastos cargados a ese cliente en Finanzas − su parte de los gastos generales, repartidos por piezas vendidas. Los gastos en otra moneda no se convierten: se cuentan aparte. Solo admin. | A medias: sin abonos ni gastos cargados responde «Falta cargar el abono». La cuenta con números está probada en los tests, no con datos reales (no se cargaron datos de prueba en Finanzas). |
| Botón de engranar | Contenido → «¿Qué necesitás?» → «Engranar gancho + propiedad + cierre». Lista el NAS del cliente, une, nivela, revisa con vtool, sube a Drive y deja el video para validar a nombre del Editor. | Sí, de punta a punta con DUNOD: 42 s en `Super Redes/DUNOD/VIDEOS`. **Quedó una pieza de PRUEBA** («JULIO SOSA 8900 … (engranado)») en Drive y en «Videos sin validar»: descartarla o usarla. |
| Engranado para los agentes | `lmtmVideoEngranar` sumado a `PAPERCLIP_MCP_TOOLS` del Editor y del Productor (respaldo en la tabla `respaldo_allowlist_20261121`). La skill `lmtm-video` dice cuándo usarlo. | La lista, sí (verificado en `agentes_config`). Que un agente lo use bien en una corrida real, no. |

También verificado de la primera vuelta: los seguidores de Instagram ya se guardan (DUNOD 17.296, LMTM 1.862).

## Decisiones de esta vuelta

- **Margen sin tipo de cambio.** El costo de los agentes está en 0 (plan fijo) y los créditos no tienen precio en
  dólares: no hay costo medido en plata por cliente. El margen sale de lo que se cargue en Finanzas, en la moneda del
  cliente. `/growth/profitability` (resta dólares de pesos) sigue ahí sin pantalla; no se tocó.
- **Engranado sin disparo nocturno.** Qué persona va con qué propiedad lo elige quien aprieta el botón; un disparo
  solo tendría que adivinarlo.
- **La aprobación no muestra la pieza.** Los adjuntos de ClickUp dejaron de ser públicos (13/11): el cliente ve
  nombre, fecha, red, formato y texto, no la imagen.

## Para saber

- Los comentarios de la aprobación salen en ClickUp a nombre de Marcos Lewis: es el dueño del token de la API.
- «Pedir cambios» avisa a todos los que siguen la tarea.
- El lector de Excel toma el año del tracker de la fecha de creación del archivo. Si alguien duplica un tracker viejo
  y lo renombra, el año sale bien igual (se crea de nuevo), pero un archivo movido desde otro año no.
- Nombres del tracker que no se pudieron emparejar con un cliente quedan afuera sin aviso en pantalla
  (`videosDelTracker` los devuelve en `sinCliente`).

---

# Tercera vuelta (21/11, noche): mirado en el navegador

Naza inició sesión en el Chrome del perfil «Default» (el que tiene la extensión de Claude). Commits `7b5072a` y
`b451880`, desplegados.

Visto andando: ficha → Cuenta (tabla por mes, salud, seguidores, margen, interruptor, informe); Semáforo → «Señal de
cobro del trimestre» (dentro de «Detalle completo»); Contenido → «Engranar» (lista el NAS, lanza, muestra el avance y
el link de Drive); «Lo que entregaron» con las piezas engranadas; y el link público del cliente con «Aprobar» y
«Pedir cambios».

Lo que solo se vio en pantalla, ya corregido:
- Al guardar lo vendido, los meses cerrados seguían diciendo «sin cargar» hasta 6 h después (lo guardado de
  `cotizado.ts` no se vaciaba). Ahora `PATCH /clients/:id` con `cotizado` llama a `olvidarMesesCerrados()`.
- Historias de meses anteriores a la captura (15/10) figuraban «0» en rojo: ahora «sin medir»
  (`MesCuenta.historiasMedidas`, `HISTORIAS_DESDE`).
- Las piezas engranadas decían «No pasó el control» y «Gasto sin registrar (generado antes del 11/10)»: la revisión
  técnica se guardaba como texto en `metadata.revision`, que la lista lee como control de calidad. Ahora va en
  `revisionTecnica` y `revision` dice «Sin control de calidad: piezas ya terminadas…»; gasto «Sin gasto».
- El link de Drive del engranado no se podía abrir: ahora es un link.

Para saber: la primera carga de Cuenta después de un despliegue tarda 15–20 s (4 meses + los Excel de Drive); después
queda guardada. Quedaron DOS piezas de prueba de DUNOD en Drive y en «Lo que entregaron»: «JULIO SOSA 8900 …
(engranado)» y «Vid 4 JUEGOS 2026 … (engranado)».
