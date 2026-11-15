# LMTM-OS — auditoría y plan de refactorización (15/11/2026)

Objetivo que pidió Naza: que el conector sea **el cerebro** para Claude y cualquier IA (videos del NAS, info del cliente, marca, tono, todo) y que el panel muestre **todo lo de valor que se hace**.

Estado: **decisiones D1–D8 aprobadas por Naza el 15/11 (todas «sí»). Nada aplicado todavía.**

Ampliación de Naza (15/11):
- No es solo el cerebro del cliente: es **el cerebro de toda la empresa**. Que se sepa todo lo que se hace.
- Si hace falta **sacar paperclip, se saca**: se mantienen las conexiones y se pasa a algo propio.
- Tiene que funcionar bien: **últimamente algunas placas y videos no salieron como se esperaba** (fase nueva de calidad, la 2).

Regla que se mantiene de la fase C (06/10): no se pierde ninguna función propia. Antes de retirar algo se lista qué hacía y dónde queda.

---

## 1. Qué encontré (medido en producción y en el código, 15/11)

### 1.1 El conector

| Hallazgo | Dato |
|---|---|
| Tres listas de herramientas que se mantienen a mano | `agent-tools.ts` (REST), `mcp-server/tools.ts` (123 nombres) y las listas por agente + `HERRAMIENTAS_EQUIPO` (42). Una herramienta que está en una y no en otra es invisible: ya pasó 3 veces (cadena de publicación, Google Ads, NAS). |
| Demasiadas herramientas y se pisan | 83 `lmtm*` + ~40 `paperclip*` en el conector de admin. Para generar contenido hay 4 caminos (`GenerarContenido`, `GenerarPieza`, `VideoPlano`, `ContenidoImagen`). |
| No hay "el cliente entero" en una llamada | `lmtmGuiaContenido` lo hace solo para piezas de contenido. Para lo demás hay que encadenar brain + marca + campañas + competidores + plan + web. |
| El NAS no se puede buscar | Solo se lista carpeta por carpeta (`PROPFIND` profundidad 1). No hay índice, ni duración, ni qué se ve en cada video. 52 de 59 clientes tienen la carpeta mapeada a mano; 7 no. Drive sí tiene búsqueda visual; el NAS no. |
| No hay búsqueda transversal | No se puede preguntar "¿qué sabemos de X?" sobre memoria + entregables + ganchos + material a la vez. |
| La memoria crece sin curar | 3.651 notas; mediana 25 por cliente, máximo 270. El tipo más grande es `risk` (1.008). No vencen ni se deduplican. |
| Marca incompleta | 54 de 59 activos tienen marca; solo 40 con tono, 33 con logo. 19 clientes sin productos. |
| Funciones construidas y vacías | `video_virales` 0 filas, `video_plantillas` 0, `pieza_metricas` 0, `client_dashboard_links` 0, `finance_*` 0. |
| Lo que el equipo hace en Claude no vuelve al panel | El conector del equipo puede generar clips, voz, música e imágenes, pero no tiene `VideoEntregar`, `ContenidoEntregarImagenes`, `VideoDescribir`, `NasBajar` ni `DriveBajar`. Lo que arma Marcos queda en su PC. |
| Un solo código compartido para todo el equipo | No se sabe quién hizo qué ni se puede revocar a una persona. |
| Se cae en cada deploy | Hay que reconectar a mano en claude.ai después de cada despliegue. |

### 1.2 El panel

| Hallazgo | Dato |
|---|---|
| Lo producido está repartido en 5 lugares | `agent_deliverables` (2.757), Contenido generado, Trabajo, informes semanales (157) y decisiones (572). No existe un lugar donde ver "todo lo que se hizo para este cliente". |
| Ruido en los entregables | 1.634 de 2.757 son "plan" (59 %). En 30 días: 267 planes contra 48 placas y 12 videos. |
| La publicación no se ve | Las fallas de Make de esta semana (19 clientes) se vieron por mail, no en el panel. No hay tablero de publicaciones trabadas ni botón para reprocesar. |
| 5 pantallas con el diseño viejo | Semáforo, Inteligencia, WhatsApp, Conexiones y Preparación. La ficha del cliente sigue montada sobre `ClientDashboard.tsx` (1.995 líneas). |
| Paperclip sigue accesible | ~85 rutas viejas vivas (issues, inbox, goals, projects, workspaces, plugins, costs, org). |
| Navegación larga | 7 secciones + 7 en "Más" + 12 pestañas en la ficha. |
| Flota | 220 corridas en 7 días, 57 % bien. Esteban 13/34, Nicolás 7/22, Bianca 4/14. 126 tareas bloqueadas. |

### 1.3 El código

| Hallazgo | Dato |
|---|---|
| Tamaño | 473.000 líneas de TypeScript (server 231.000, UI 152.000, paquetes 89.000). |
| Código muerto | ~55.000 líneas de plugins, workspaces, environments, export/import, budgets y feedback, con sus tablas en 0 filas. |
| Archivos gigantes | `heartbeat.ts` 9.313 líneas, `routes/issues.ts` 4.370, `routes/ads.ts` 4.085, `agent-tools.ts` 3.235. |
| Dos motores de corridas | El de paperclip (`heartbeat_runs`) y el propio (`agente_trabajos`, 425 trabajos). |
| Desorden | ~40 scripts sueltos en la raíz, 16 tablas `respaldo_*` en producción, más de 500 commits sin subir a GitHub. |

### 1.4 La calidad de las piezas (medido el 15/11)

| Hallazgo | Dato |
|---|---|
| Ninguna pieza guarda su control de calidad | 60 piezas en 30 días (48 placas, 12 videos): 0 tienen registrado el resultado de la revisión. La herramienta de revisión existe, pero su veredicto no queda en ningún lado. |
| Nadie registra "esto salió mal y por qué" | No hay dónde anotar el veredicto de la persona. Lo que no gustó queda en WhatsApp o en la cabeza del equipo, y el agente repite el error. |
| El Productor se traba más de lo que entrega | En 30 días: 24 tareas bloqueadas contra 13 terminadas. |
| Marca incompleta = piezas genéricas | Sin tono (19 clientes), sin logo (26) o sin productos (19), la pieza sale sin identidad. |

**Lo que no audité a fondo:** el diseño pantalla por pantalla en el navegador, el CRM (es otra app) y el prompt de cada agente.

---

## 2. El plan

Orden: 0 → 1 → 2 → 3 → 4 → 5 → 6. Cada fase se despliega y se verifica sola; ninguna depende de terminar todo.

Además hay dos frentes que corren por fuera de esa secuencia y están detallados al final: **lo urgente de operación** (sección 7, se hace antes que todo) y **la flota de agentes** (sección 8, va junto con las fases 2 y 4). La sección 9 recorre los 22 sectores del sistema, uno por uno, para que no quede ninguno sin dueño.

La numeración quedó así después de la ampliación: 0 red de seguridad · 1 cerebro de la empresa · 2 calidad de las piezas · 3 índice de material · 4 conector · 5 panel · 6 salida de paperclip y limpieza.

### Fase 0 — Red de seguridad (1 sesión)
- Inventario de funciones propias que no se pueden perder (lista de la fase C actualizada).
- Línea de base en SQL: cobertura del cerebro, corridas, entregables por tipo.
- Respaldo del repositorio en una copia aparte (sin GitHub: decisión de Naza del 15/11).
- **Sale cuando:** hay inventario firmado y el código está respaldado fuera de esta máquina.

### Fase 1 — El cerebro de la empresa (4–5 sesiones)
Un solo servicio `cerebro` que usan **el conector, los agentes y el panel**. Lo que lee la IA es lo mismo que ve la persona. Tiene tres capas:

**Capa agencia** (nueva): quiénes somos y cómo trabajamos.
- Equipo y quién hace qué (personas y agentes), procesos (alta de cliente, publicación, pauta, producción), reglas de la casa y convenciones.
- Los sistemas y cómo se conectan: ClickUp, Make, Drive, NAS, CRM, Meta, Google. Hoy ese mapa vive en notas sueltas; pasa al cerebro.
- Lecciones del equipo (1.049) curadas igual que la memoria.

**Capa actividad** (nueva): todo lo que se hace, en un solo registro.
- Una línea por hecho: qué se hizo, para qué cliente, quién (agente, persona o Claude por el conector), con qué resultado y cuánto costó.
- Fuentes: corridas de agentes, entregables, decisiones, cambios de pauta, publicaciones, tareas de ClickUp, uso del conector, grupos de WhatsApp.
- Responde "¿qué se hizo esta semana para X?" y "¿qué hizo la agencia hoy?" en una llamada.

**Capa cliente:** la ficha completa de cada uno.

- Contenido de la ficha: identidad, marca y tono, público, productos, web, redes, pauta resumida, calendario, competidores, decisiones tomadas con el cliente, memoria curada, dónde está su material (Drive y NAS) y lo último que se le produjo.
- Memoria curada: deduplicar, vencimiento por tipo (un `risk` o un `event` caducan; un `preference` no), lo fijado manda. Con respaldo antes de tocar.
- Completar lo que falta: 5 clientes sin marca, 19 sin tono, 26 sin logo, 19 sin productos, 7 sin carpeta de NAS. Lo que no se pueda sacar solo queda como lista para el equipo.
- Medidor de cobertura por cliente (% de ficha completa), visible en el panel.
- **Sale cuando:** una llamada devuelve la ficha entera de cualquier cliente, otra devuelve todo lo hecho en un período, y la cobertura promedio supera 85 %.

### Fase 2 — Calidad de placas y videos (3–4 sesiones)
Arranca con los ejemplos que pase Naza de piezas que salieron mal: sin eso se arregla a ciegas.

**Caso testigo: BRACHETTA, promo de construcción y volquetes (LMTM-7079 y LMTM-7080, 13/11).** El pedido traía una placa con la info y decía «ese link solo tiene la info dura, no contemples el diseño». Salió una historia solo con texto, sin batería, sin local y con el tercio de abajo vacío. Causas, verificadas en la corrida:

1. **El agente leyó «no copies el diseño» como «sin fotos».** Lo dejó escrito: «diseño tipográfico sin fotos ni imágenes generadas». Las fotos reales de la batería (`110A.png`, tres ángulos) estaban en el Drive del cliente: las usó en el video y no en la placa.
2. **La receta de placas solo sabe hacer HTML con texto.** No compone producto + fondo + precio como una pieza publicitaria; por eso nunca llega al nivel de la referencia.
3. **El control de calidad aprobó igual.** Revisa que el texto se lea y el contraste; no revisa si la pieza es atractiva, si muestra el producto o si quedó medio lienzo vacío. Dio «apta, sin problemas».
4. **La paleta cargada está mal:** verde `#37ca37` y azul `#188bf6` antes que el rojo. Brachetta es rojo, blanco y negro con un toque de verde; el azul no es de la marca.
5. **Una sola opción.** No hubo variantes para elegir.
6. **El video quedó bloqueado sin que nadie se entere.** El agente marcó 3 defectos y pidió revisión, pero no hay revisor asignado: la tarea quedó en «bloqueada» y el pedido murió ahí. Además usó clips de 480 px.

Arreglos que salen de este caso:
- Regla en la receta: una promo de producto **siempre** lleva la foto real del producto; «no copies el diseño» no significa «sin imagen».
- Placa compuesta: producto real recortado + fondo (foto del local o generado sin producto) + precio y textos en HTML. El texto nunca lo escribe el modelo de imágenes.
- El control suma tres preguntas: ¿se ve el producto?, ¿el lienzo está bien ocupado?, ¿está al nivel de las piezas aprobadas del cliente? Si falla una, se rehace.
- Entregar 2 o 3 variantes en promos, no una.
- Corregir la paleta de BRACHETTA y revisar las de los demás contra su logo.
- Toda pieza que queda esperando revisión avisa a quien la pidió (WhatsApp o ClickUp) en vez de quedar bloqueada en silencio.

- **Diagnóstico con casos reales:** para cada pieza mala, qué se pidió, qué material y marca tenía el agente, qué salió y dónde se torció (brief pobre, material equivocado, marca vacía, modelo, plantilla o falta de revisión).
- **Control de calidad obligatorio y guardado:** ninguna pieza se entrega sin pasar la revisión contra el brief y la marca. El veredicto queda en la pieza. Si no pasa, se rehace o se frena con el motivo.
- **Veredicto de la persona en un clic:** sirve / no sirve + por qué, desde el panel y desde la tarea de ClickUp. Cada "no sirve" se guarda como regla del cliente y el agente la lee antes de la próxima pieza.
- **No producir sin lo mínimo:** si al cliente le falta logo, tono o material real, la pieza no arranca y se pide lo que falta, en vez de salir genérica.
- **Piezas de referencia por cliente:** las aprobadas quedan como ejemplo de "así sí".
- **Destrabar al Productor:** revisar las 24 tareas bloqueadas y arreglar la causa que se repita.
- **Sale cuando:** el 100 % de las piezas tiene control guardado, hay veredicto humano en más del 80 %, y la tasa de "sirve" sube contra la línea de base de las primeras dos semanas.

### Fase 3 — Índice de material: NAS + Drive (2–3 sesiones)
- Rastreo nocturno del NAS, recursivo, a una tabla `material`: cliente, ruta, tipo, peso, fecha, duración.
- Búsqueda por texto sobre nombre, carpeta y fecha: gratis, sin IA.
- Descripción de lo que se ve y transcripción: **a pedido y guardada**, con tope de gasto. No se describe todo el NAS de entrada (ver decisión D2).
- Una sola herramienta de búsqueda de material que cubre Drive y NAS.
- **Sale cuando:** "videos de tal producto de tal cliente" devuelve archivos del NAS con link de descarga, sin recorrer carpetas.

### Fase 4 — El conector (3–4 sesiones)
- **Un solo registro de herramientas.** Cada herramienta se define una vez y de ahí salen REST, MCP y los perfiles. Se termina el problema de la herramienta invisible. Con un test que falla si quedan desparejas.
- **Menos herramientas, por intención.** De ~83 a unas 25: `lmtmEmpresa` (la agencia y cómo trabaja), `lmtmActividad` (qué se hizo), `lmtmCliente` (la ficha), `lmtmBuscar` (memoria, material, entregables, ganchos y virales), material, producir, entregar, pauta, publicación, recordar. Las viejas siguen como alias un tiempo para no romper a los agentes.
- **Tres perfiles** sobre el mismo registro: admin, equipo y agente.
- **Equipo:** sumar entregar, describir y bajar material, para que lo que hacen en Claude quede registrado en el panel con su gasto.
- **Un código por persona** en vez de uno compartido (ver D3).
- **Conexión estable:** despliegue sin corte en Railway, para no reconectar cada vez.
- Instrucciones del servidor reescritas: "empezá por `lmtmCliente`".
- **Sale cuando:** con 3 llamadas o menos Claude arma el brief de una pieza con material real, y un deploy no desconecta a nadie.

### Fase 5 — El panel (4–6 sesiones)
- **Actividad** (nueva): la línea de tiempo de todo lo que hace la empresa, filtrable por cliente, persona, agente y tipo. Es la capa actividad del cerebro, a la vista.
- **Biblioteca** (nueva): todo lo producido —videos, placas, copys, informes, planes— filtrable por cliente, tipo y origen (agente, equipo, Claude), con su resultado medido cuando lo hay. Reemplaza a Contenido generado y a parte de Trabajo.
- **Ficha del cliente = vista del cerebro**, editable, con la cobertura a la vista. Se rehace sobre la app nueva y se retira `ClientDashboard.tsx` cuando cada pestaña tenga reemplazo.
- **Publicación** dentro de Contenido: publicaciones trabadas por cliente y por red, con la causa en castellano y botón para reprocesar. Lo de esta semana se hubiera visto ahí.
- Rehacer o fusionar las 5 pantallas viejas. Navegación propuesta: Hoy · Clientes · Contenido · Biblioteca · Pauta · Agentes · Config.
- Las rutas de paperclip se redirigen o se retiran (ver D1).
- Planes: dejan de contar como entregable de valor (ver D7).
- **Sale cuando:** todo lo que produjo un agente o una persona en la semana se encuentra en la Biblioteca en menos de 3 clics y no queda ninguna pantalla con diseño viejo.

### Fase 6 — Salida de paperclip y limpieza (6–9 sesiones, la última)
Aprobado por Naza: se saca paperclip entero y se pasa a algo propio, manteniendo las conexiones.

- **Se mantiene tal cual:** las conexiones (Meta, Google Ads, Search Console y GA4, ClickUp, Make, Drive, NAS, WhatsApp, CRM, Hostinger, Higgsfield, Magnific, ElevenLabs), la base de datos con su historial, y todas las funciones propias del inventario de la fase 0.
- **Se reemplaza por propio:** el motor de corridas (todo pasa al runner propio, que ya corre en producción desde octubre), las tareas internas de los agentes, las rutinas programadas, las aprobaciones y el login con sus permisos.
- **Se retira:** la interfaz de paperclip, plugins, workspaces, environments, export/import, budgets, goals y projects.
- **Cómo:** un módulo por vez, con el propio corriendo en paralelo antes de apagar el viejo, y vuelta atrás preparada. Los agentes se migran de a uno, empezando por los que mejor andan.
- Sacar el código muerto (~55.000 líneas) y partir `heartbeat.ts`, `ads.ts` y `agent-tools.ts`.
- Borrar scripts sueltos de la raíz y las tablas `respaldo_*` de más de 30 días (mirándolas antes).
- **Sale cuando:** el server baja de 231.000 a menos de 170.000 líneas, con los tests en verde y sin cambios de comportamiento.

### Medición continua
Tablero chico en Config: cobertura del cerebro, uso del conector por persona, piezas producidas por semana y aviso cuando una tabla que debería llenarse sigue en cero.

---

## 3. Decisiones (todas aprobadas el 15/11)

D1 y D5 quedaron ampliadas: no es solo sacar la interfaz, es sacar paperclip entero (fase 6).

| # | Decisión | Mi recomendación |
|---|---|---|
| D1 | ¿Se retira la interfaz de paperclip (issues, inbox, goals, projects)? Los agentes siguen usando tareas por dentro. | Sí: se saca la interfaz, se deja el motor. |
| D2 | Describir los videos del NAS con IA cuesta plata. ¿Todo de entrada, o a pedido? | A pedido y guardado, con tope mensual que fijás vos. |
| D3 | ¿Un código de conector por persona del equipo? | Sí. |
| D4 | Finanzas está vacía (0 filas). ¿Se saca o se va a cargar? | Sacarla del menú hasta que haya datos. |
| D5 | ¿Se unifican los dos motores de corridas en el propio? | Sí, pero al final: es lo más riesgoso. |
| D6 | Subir el código a GitHub: hacen falta tus credenciales. | Hacerlo en la fase 0. |
| D7 | Los 1.634 "planes" guardados como entregables. | Que no cuenten como valor; quedan como historial. |
| D8 | ¿El orden 0→1→2→3→4→5 está bien, o querés ver primero el panel? | Cerebro primero: el panel se apoya en él. |

## 4. Riesgos
- **Romper a los agentes al cambiar nombres de herramientas.** Se mitiga con alias y midiendo corridas antes y después.
- **Perder funciones al limpiar**, como pasó en B3/B4. Se mitiga con el inventario de la fase 0 y revisando cada borrado.
- **Gasto de IA al describir material.** Se mitiga con el tope de D2.
- **Deploys:** cada uno corta corridas y hoy desconecta el conector; se agrupan y se hacen sin corridas activas.

## 5. Total estimado
Entre 23 y 32 sesiones de trabajo. Las fases 1 a 4 (cerebro, calidad, material y conector) son 12 a 16 y son las que cumplen el pedido principal. La salida de paperclip va al final porque es la más riesgosa y nada de lo anterior depende de ella.

## 6. Lo que falta de Naza para arrancar
1. ~~Ejemplos de piezas que salieron mal~~ — recibido el caso BRACHETTA (ver fase 2). Si hay más casos, suman.
2. **El tope mensual de gasto** para describir material del NAS con IA (D2).
3. ~~Credenciales de GitHub~~ — Naza (15/11): **no se sube el código a GitHub**. El respaldo de la fase 0 se hace con una copia del repositorio fuera de la carpeta de trabajo.

---

## 7. Lo urgente de operación (antes que todo; 1–2 sesiones)

No es refactorización: son cosas rotas o abiertas hoy.

| # | Qué | Dato (15/11) | Quién |
|---|---|---|---|
| U1 | Publicaciones de Instagram trabadas en Make | 19 para reprocesar (más INBELT y PKT, viejas) | Yo, con tu OK y sabiendo cuáles subió el equipo a mano |
| U2 | ~~El registro de usuarios del panel está abierto~~ | **Falso, verificado el 15/11:** el alta ya exige invitación o el link del equipo (`guardaRegistro`); sin eso responde 403 | Nada que hacer |
| U3 | La cuota de MiniMax se agotó | Nicolás falló hoy con «Token Plan usage limit reached» | Vos decidís: esperar el reinicio o ampliar el plan |
| U4 | 3 agentes en estado de error | Delfina, Esteban y Nicolás | Yo: revisar y reactivar |
| U5 | 135 tareas bloqueadas, 74 de ellas `[HUMANO]` | La más vieja es del 22/07 | Yo armo la lista corta de lo que de verdad necesita una persona; el resto se cierra |
| U6 | Aprobaciones sin decidir | 19 de pauta, 7 de web, 4 generales | Vos o el equipo, desde Hoy |
| U7 | Claves viejas de Make | La anterior del servidor y la que se pegó en el chat | Vos: borrarlas en Make |
| U8 | Un segundo servicio de Postgres en Railway | **Verificado: está vacío.** `Postgres` (creado el 22/08) tiene 0 tablas, 0 conexiones y nadie apunta a él; el sistema usa `lmtm-postgres`. Se paga por nada | Borrarlo lo decidís vos |
| U9 | Disco y base | `/data` estaba al 87 % el 08/11. En la base, 8.405 de 13.896 corridas tienen más de 60 días y con sus eventos ocupan cerca de la mitad de los 1,1 GB | Yo: medir de nuevo y proponer qué se archiva |
| U10 | La paleta de BRACHETTA | Tiene azul y verde antes que el rojo | Yo |

## 8. La flota de agentes (2–3 sesiones, junto con las fases 2 y 4)

- **Por qué fallan:** 220 corridas en 7 días, 57 % bien. De 93 fallas, unas 70 son por quedarse sin turnos: la tarea es demasiado grande o el agente gasta turnos buscando lo que el cerebro debería darle en una llamada. Las fases 1 y 4 atacan justamente eso.
- **Demasiados agentes para lo que rinden:** 15 agentes de paperclip más 4 del motor propio. Esteban 13 de 34 bien, Nicolás 7 de 22, Bianca 4 de 14. Propuesta: quedarse con los que entregan valor medido (Productor, Milo, Caro, Pablo, Luna, Carlos) y fusionar o apagar el resto. La lista final se decide con el valor de la flota de las últimas 4 semanas.
- **Tareas partidas:** una tarea que no entra en una corrida se parte sola en pasos, en vez de reintentar entera.
- **Rutinas:** 13 activas. «Auditoría de perfil y creatividad» no corre desde el 12/07 (se verifica el 18/11). Las dos de Pablo siguen pausadas desde el 07/10: se reactivan o se borran.
- **Costo real:** el sistema registra los tokens (unos 200 millones de entrada por mes) pero no la plata: la columna de dólares está en cero. Se calcula con la tarifa de cada modelo.
- **Sale cuando:** más del 80 % de las corridas termina bien y ningún agente activo tiene menos del 60 %.

## 9. Sector por sector: que no quede nada en el aire

| # | Sector | Estado hoy | Dónde se resuelve |
|---|---|---|---|
| 1 | Conector de Claude | 83 herramientas, se cae en cada deploy, un código compartido | Fase 4 |
| 2 | Cerebro: agencia, actividad y cliente | No existe como una sola cosa | Fase 1 |
| 3 | Material: NAS y Drive | NAS sin búsqueda; Drive con búsqueda visual | Fase 3 |
| 4 | Producción de placas y videos | Sin control guardado ni veredicto; caso BRACHETTA | Fase 2 + U10 |
| 5 | Publicación (planilla → ClickUp → Make → redes) | 19 trabadas; Instagram depende de que el adjunto de ClickUp sea público | U1 + Fase 5 (tablero). Además: que Make tome el archivo de un link propio, para no depender de ClickUp |
| 6 | Pauta (Meta y Google) | 27 de 59 clientes activos sin cuenta de anuncios mapeada; 55 alertas pendientes; 10.814 oportunidades vencidas guardadas | Mapear cuentas: equipo. Limpieza y vista única: fase 5 |
| 7 | Web y SEO | 28 sitios vinculados; 7 cambios esperando aprobación | U6 + fase 5 |
| 8 | Flota de agentes | 57 % de corridas bien; 3 en error | U3, U4 y sección 8 |
| 9 | Rutinas | 13 activas, 1 sin correr desde julio, 2 pausadas | Sección 8 |
| 10 | Hoy y decisiones | 104 decisiones abiertas | Fase 5 (se mantiene; suma lo de publicación y calidad) |
| 11 | Avisos y WhatsApp al equipo | Funciona: salen agrupados en el resumen | Sin cambios; pasa al motor propio en la fase 6 |
| 12 | Grupos de WhatsApp de clientes | 405 mensajes leídos en 7 días; alimentan la memoria | Entra a la capa actividad (fase 1) |
| 13 | Link público del cliente e informes | 33 links, 157 informes aprobados | Se mantiene; se rediseña en la fase 5 |
| 14 | Nichos, competencia, virales y ganchos | Virales en 0 filas; 10 ganchos nuevos en 30 días | Fase 2 (referencias de calidad) y fase 5 |
| 15 | Licitaciones | Funciona: 25 útiles, 2 por revisar | Sin cambios |
| 16 | Finanzas | Vacía | Sale del menú (D4) |
| 17 | Alta de cliente | Funciona; queda 1 clic manual | Sin cambios; se documenta en la capa agencia |
| 18 | Accesos y seguridad | Registro cerrado (solo con invitación); 4 usuarios; código de conector compartido | U7 y fase 4 |
| 19 | Infraestructura | 4 servicios en Railway (uno quizá de más); base de 1,1 GB, la mitad son registros de corridas viejas; variables de n8n que ya no se usan | U8, U9 y fase 6 |
| 20 | Código, tests y despliegue | 564 archivos de test; la revisión automática estaba pensada para GitHub y no corre | Fase 0: un solo comando que corre los tests antes de cada deploy |
| 21 | Costos | Tokens medidos, dólares en cero; créditos de contenido sí se registran | Sección 8 |
| 22 | CRM (crm.lmtmas.com) | Es otra aplicación. Pendientes propios: dominio, facturación con ARCA y la llave para que Esteban proponga cambios | **Fuera de este plan.** Se conecta al cerebro solo como fuente de datos (fase 1). Si querés, se audita aparte |

**Total actualizado:** entre 27 y 38 sesiones, contando lo urgente y la flota.
