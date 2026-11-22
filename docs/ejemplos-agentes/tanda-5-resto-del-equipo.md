# Tanda 5 — el resto del equipo (22/11/2026)

Pedido de Naza: una corrida de ejemplo de cada tarea que hacen los agentes y que todavía no tenía ejemplo ni skill. Las tandas 1 a 4 cubren pauta, plan estratégico, guion, blog, nicho, webs y Google Ads. Acá va lo demás. Cada corrida se hizo con las mismas herramientas que tiene el agente y dejó lo mismo que dejaría él.

Estos son los casos reales, con nombres. Las skills (`lmtm-ejemplos-*`) llevan el criterio sin nombres.

## 1. Curador de licitaciones (Carlos)

**Qué había:** 13 candidatas, 14 útiles, cierres entre el 25/11 y el 21/12.

**Qué se hizo:** se leyó la descripción entera y el ítem de la ficha (`raw.Items`: categoría y código UNSPSC) de las tres dudosas. 1 útil, 12 descartadas, cada una con su motivo escrito.

| Código | Decisión | Por qué |
|---|---|---|
| 5251-101-LE26 «Agencia creativa y medios digitales», UTEM | útil | Ítem «Publicidad en Internet». Estrategia, piezas y pauta digital: se entrega remoto. CLP 11,9 M, 3 meses. Cierra 02/12; preguntas hasta el 25/11 |
| 630-33-L126 «Pauta informativa y streaming» | descartada | «Pauta informativa» en Chile es el boletín diario de noticias (ítem «Boletines informativos»), no publicidad. Más streaming presencial en Santiago |
| 1457282-10-LE26 «Monitoreo de prensa» | descartada | Clipping de prensa, radio y TV chilena (ítem «Agencia de noticias»). No es contenido ni comunicación |
| 1638-115-LE26 «Producción de eventos» de Navidad | descartada | Montaje presencial en Atacama. No pide difusión |
| 316-63-LE26 «Equipos para la Unidad de Comunicaciones» | descartada | Nombra diseño y video, pero se compran computadoras |
| Otras 8 | descartadas | Compra de equipos, videovigilancia, radio VHF, enlaces de datos, una escultura |

**Lo que el nombre no dice y la ficha sí:**
- El ítem (`raw.Items.Listado[0].NombreProducto`) dice qué se compra de verdad. «Audiovisual», «comunicaciones» y «pauta» aparecen en compras de equipos, telecomunicaciones y agencias de noticias.
- `raw.Fechas.FechaFinal` es el último día para hacer preguntas: suele ser una semana antes del cierre. Si ya pasó, la oferta se arma a ciegas.
- `raw.Tiempo` son los meses de contrato.

**Lo que se le deja a una persona:** en la útil, confirmar en las bases si exige domicilio o inscripción en Chile y si el monto incluye la inversión en medios. Eso decide si se oferta; el curador no lo sabe.

**Hallazgo aparte:** de las 14 útiles, 3 cierran entre el 25 y el 26/11 y no hay rastro de que alguien las haya mirado. Entre las útiles hay una concesión de publicidad en refugios peatonales y un avisaje en radio y TV por CLP 293 M: una agencia de Rosario no las ejecuta. Curar bien no sirve si nadie decide ofertar: pregunta para Naza.

## 2. Revisión de competencia de un cliente (Carlos)

**Cliente:** El Hiper de la Pelu (retail). Entregable: «Competencia de El Hiper de la Pelu — 22/11/2026».

**Qué devolvió `lmtmCompetenciaCliente`:** 3 competidores cargados, 1 solo medido (una cadena de perfumería). Dos «oportunidades» calculadas, las dos sacadas de esa única cuenta.

**Qué se hizo distinto de copiar la salida:**
- La revisión abre diciendo su alcance: una sola cuenta medida, sirve como señal.
- Se cruzó el mejor contenido del competidor (un reel de «5 productos», 17 veces lo normal de su cuenta) con la memoria del cliente, que ya decía que su «Top 5» en carrusel funciona. La oportunidad no es un ángulo nuevo: es su propio formato en video.
- Se preguntó si el competidor medido es competencia de verdad (perfumería contra insumos de peluquería) y se pidió cargar los correctos, sin inventar nombres.
- Instagram devolvió 429 al verificar un usuario: se anotó «no se pudo confirmar» y no se reintentó.

**No se hizo:** guardar el gancho del competidor en el baúl. Con una sola cuenta y sin poder abrir el reel, no hay evidencia de que el gancho sea lo que hizo rendir la pieza.

## 3. Tendencias diarias (Caro)

**Qué había en el panel:** 18 tendencias el 20/11, varias repetidas (4 sobre precio de neumáticos en dos días) y muchas noticias macro sin uso para un posteo.

**Qué se hizo:** 4 búsquedas, una por rubro (turismo, retail, eventos, industria). Se guardó **1**.

| Rubro | Qué apareció | Decisión |
|---|---|---|
| retail-consumo | Black Friday 27/11 y Black Shopping Days 27 al 29/11 | Guardada: fecha coherente con 2026, a 5 días, con uso concreto |
| turismo-hoteleria | Balances de fines de semana largos anteriores; el de este finde todavía no salió | No guardada: el dato de hoy no existe |
| entretenimiento-eventos | Notas de fiestas de fin de año con fecha de 2026 en el encabezado y texto de 2024 y 2025 | No guardada: fecha no confiable |
| industria-b2b | Producción industrial de septiembre, publicada el 06/11 | No guardada: tiene 16 días y no da para un posteo de un proveedor industrial |

**Criterio:** una tendencia entra si (1) la fecha de la fuente se puede confirmar, (2) es del rubro y no del país en general, (3) se puede decir en una frase qué pieza haría un cliente con eso esta semana. El resumen guardado dice qué hacer, cuándo y cuándo no hacer nada («si el cliente no tiene promo confirmada, no se arma nada»).

Una de cuatro es un resultado válido. Dieciocho por día no las lee nadie.

## 4. Propuesta CM de un cliente (Caro)

**Cliente:** DOMINGO BISIO (transporte de cargas industriales). Entregable: «Propuesta CM 2026-12 — DOMINGO BISIO».

**Lo que decía el sistema y lo que era:**
- «POSIBLE FATIGA CREATIVA: 2 aperturas repetidas 4 veces». Mirando las fechas: la misma pieza salió el 02 y el 06/11, y otra el 13, 14 y 15/11. No faltan ideas: hay publicaciones duplicadas. El pedido es revisar la planilla, no proponer ángulos.
- «33 posts en 60 días, formato dominante status 39 %». «Status» es la copia de Facebook de cada pieza de Instagram. Son unas 20 piezas reales.
- Baúl de ganchos del rubro: 17. Aplicables a un transportista: 1 (los demás hablan de tableros eléctricos y molinos). Se usó ese.
- Competencia: nada rindió por encima de lo normal y los medidos son de paquetería. Se escribió «no hay nada que copiar».

**Lo que se respetó de lo que ya dijo el equipo:** 100 ideas de agentes en la lista y 0 aprobadas, y producción descarta las piezas de «trayectoria». Por eso la propuesta trae 4 ideas, todas con personas u operación real, y pide vaciar la lista.

**Hallazgo que salió de leer la ficha entera:** la web tiene el certificado inválido (no linkearla en copys).

**Error propio, corregido en la misma corrida:** la ficha muestra una cuenta de anuncios llamada «Hiper de la Pelu - Self» y la primera versión afirmó que era de otro cliente y que había que desvincularla. Al revisar los mapeos, la cuenta es de Bisio (su memoria la nombra en una decisión del 28/07): solo tiene un nombre viejo. Se guardó una versión corregida diciendo qué se corrigió. Un nombre que sorprende se verifica antes de escribirlo, no después.

**Traba del sistema:** `lmtmSaveDeliverable` con kind=plan rechaza un segundo plan del cliente en 7 días. La Propuesta CM entra pasando `cambio` con lo que aporta de nuevo.

## 5. Alertas de cartera: saldo (Nicolas)

**Estado de la rutina antes:** las corridas del 20 y del 21/11 quedaron abiertas sin comentario. La del 20 se cortó por el tope de turnos después de crear 9 tareas (la rutina dice que el saldo va por WhatsApp, nunca en tareas). En dos días no salió ningún aviso.

**Cómo se hizo en pocos pasos:**
1. Una consulta para saber quién gasta: gasto y leads de 7 días por cliente y cuenta, contra los 7 anteriores. 17 clientes gastan en Meta, 9 en Google.
2. `lmtmGetClientBalance` solo de esos 17 (no de los 58).
3. Días restantes = restante ÷ (gasto de 7 días ÷ 7), cuenta por cuenta, también las de Google.

**Avisos enviados (5), todos con cuenta, tope, gastado, restante, % y días:**
| Cliente | Cuenta | Situación |
|---|---|---|
| SKYGARDEN | Meta | Frenada: restante $0, sin gasto desde el 16/11 (6 días), campañas prendidas. De 31 leads a 1 |
| COSA PROPIEDADES | Google | Restan $23.529 con $20.500 de gasto diario: 1 día |
| LMTM (propia) | Meta | Restan $60.537: 6 días |
| MAERS | Meta | 98,8 % del tope, 8 días. Venía mejorando |
| MA PROPIEDADES | Google | 98,9 %, 7 días |

**No se avisó, y por qué:**
- RAMASCO Meta (96 % del tope), COSA Meta (96,5 %) y Distrillantas Google (95,6 %): pasan el corte del 90 %, pero les quedan 35, 32 y 52 días. En un tope acumulado de $20 M, el 96 % no dice nada: lo que decide es cuántos días quedan.
- Cuentas en estado 3 (deuda) de RAMASCO y RENO, y una de MA con restante $0: sin gasto en 30 días. No hay nada que hacer hoy.
- El Hiper: 13 días. Se mira la semana que viene.

**Lo que no era una alerta de saldo:** GRUPO ROIBAS gastó $450.723 en 7 días viniendo de $0. Son campañas de tráfico a la web (objetivo OUTCOME_TRAFFIC) lanzadas el 16 y 18/11: no se juzgan por leads. DUNOD tiene CPL de $11.690, igual que la semana anterior: es crónico, va al plan, no a la alerta del día.

## 6. Detector de posts no disparados (Nicolas)

**Qué devolvió `lmtmGetCadenaPublicacion`:** 57 clientes revisados, 30 con un eslabón roto (18 sin calendario, 8 con contenido incompleto, 4 con destino sin escenario).

**Qué se hizo:**
- Se ordenó por fecha, no por cliente: primero lo que se pierde en 48 h.
- Para el caso más cercano se abrió el calendario (`lmtmGetClientScheduledContent`): nombre de la pieza y hora exacta, para que el aviso se pueda ejecutar sin buscar.
- Se cruzaron los 18 «sin calendario» con los posts reales de 7 días: 3 de ellos publicaron 10, 10 y 4 posts. No están rotos, publican por otra vía. Se dijo en el aviso para que nadie salga a arreglarlos.
- Un solo mensaje al resumen de las 9:00, en cuatro partes: lo que se pierde (con fecha), lo que ya no salió (con la causa), lo que hay que prevenir (una conexión que no verifica) y lo que no es falla.

**No se hizo:** crear una tarea por cliente, ni tocar fechas u horarios (regla de la casa: los decide una persona).

## 7. Por qué dejó de gastar (media buyer)

**Cliente:** SEBASTIAN RAMASCO PADILLA. El gasto en Meta bajó de ~$54.000 a ~$23.700 por día. No había decisión abierta de «gasto caído»: salió de mirar la cartera en la corrida 5.

**Cómo se hizo:** una consulta por campaña con gasto diario de los últimos 4 días contra los 14 anteriores, estado, fecha de fin y último día con gasto. El saldo ya estaba leído (35 días de margen).

**Causa: terminó.** 10 campañas «OCTUBRE» llegaron a su fecha de fin entre el 13 y el 19/11. Figuran ACTIVE y no gastan. Las 4 que quedan terminan el 23 y el 25/11: el 26 la cuenta queda en $0.

**Qué se entregó:** un comentario en la tarea que ya existía sobre las campañas vencidas del cliente (LMTM-7156), no una tarea nueva. Con la causa en la primera línea, las 5 campañas vencidas que más consultas traían, la más barata de las que siguen, y un siguiente paso con fecha.

**Lo que no se propuso:** reactivar campañas. Son propiedades: desde los datos no se sabe si siguen en venta. Se dijo así y se dejó la decisión a quien habla con el cliente.

## 8. Informe semanal al cliente (estratega)

**Cliente:** HANSHI, semana del 09 al 15/11. El informe anterior estaba «observado» por el auditor.

**Por qué estaba observado:** tenía un número escrito a mano (el id de la cuenta de Google) y afirmaba el costo por consulta y el objetivo con los marcadores vacíos.

**Lo que el auditor no ve y también estaba mal:**
- «Dejamos producidos dos posteos»: las piezas son del 03/11, de otra semana, y la del 14/11 no se publicó. Se reescribió como «están listas y todavía no se publicaron».
- Cuatro pedidos al cliente, uno de ellos explicándole un problema interno. Quedaron tres, cada uno algo que el cliente puede hacer hoy.
- «adultxs», «producciónadas»: se releyó frase por frase.

**Cómo se dice una semana sin datos:** «no hubo publicidad activa ni publicaciones nuevas», «todavía no se puede medir», y por qué. Sin marcadores vacíos y sin disculpas. El auditor lo aprobó al primer intento.

**Hallazgo de la corrida:** desde octubre hay 194 informes escritos y 0 publicados. Nadie los está publicando. Antes de pulir el informe 195 hay que saber por qué.

**Traba del sistema:** `lmtmEscribirInforme` pide el id del cliente (uuid), no el nombre.

## 9. Proponer calendario (contenido)

**Primero se miró a quién le falta de verdad.** De los 15 clientes con la decisión «cargar el calendario» abierta, 12 ya tienen un calendario propuesto por un agente (IMPERIA tiene tres, el último del 19/11; ALTECNO uno del 16/11). No están sin calendario por falta de propuesta: nadie lo cargó en la planilla. Escribirles otro es sumar a la pila.

**Se hizo uno para quien no tenía ninguno:** Hotel Libertador. Entregable: «Calendario propuesto 25/11 al 29/11 — Hotel Libertador (primera semana) — corregido».
- Semana corta de 3 piezas, porque no se lee ninguna publicación en 60 días y no se sabe si no publica o si no se ve su red.
- Cada pieza en una línea con el formato del rol; lo que no está en la ficha va como [completar] (horario del desayuno, costo del estacionamiento, canal de reservas).
- Una pieza depende de una confirmación («si no hay disponibilidad, no sale»).
- Se respetó lo que el equipo ya rechazó para ese cliente: ganchos de intriga y tono de lujo.
- Se cruzó con la pauta: hay una campaña mandando gente a la web mientras el perfil lleva un mes callado.

**Error propio, corregido:** la primera versión decía que el reel «es el formato que más rinde en hotelería» sin haberlo medido. Medido: 2 reels contra 29 fotos en 120 días. La dirección coincide, pero dos casos no son una regla. Se guardó la versión corregida diciéndolo.

## 10. Triage de la cola (Pablo)

**Qué había:** 27 tareas abiertas de Pablo, casi todas en «por hacer», sin un comentario y quietas entre 2 y 11 días.

**Lo que se vio al leerlas juntas:**
- El detector de publicación le abre una tarea nueva cada día por el mismo problema de Make (11, 17, 18 y 20/11). Cuatro tareas, un solo tema, y ninguna la puede resolver un agente: hay que entrar a Make.
- Varias son sobre posts con fecha: cuando la fecha pasa, la tarea ya no sirve y sigue abierta.
- Una urgente y bloqueada (certificado de numorph.com que vencía el 21/11) ya estaba resuelta y nadie lo había mirado.

**Qué se hizo (10 tareas tocadas de 27):**
| Acción | Tareas | Con qué prueba |
|---|---|---|
| Cerrada como hecha | LMTM-7206 | Se leyó el certificado del sitio: ahora vence el 07/05/2027 |
| Una sola por tema | LMTM-7236 queda, con [HUMANO] y el estado medido hoy; LMTM-6995, 7186 y 7214 cerradas como duplicadas | Cadena de publicación del 22/11 |
| Cerradas por vencidas | LMTM-7235, 7185, 7211, 6993, 6994 | La fecha del post pasó; se dice cuál es la tarea viva de ese cliente |

**Error propio, corregido en el momento:** en el comentario que unificaba el tema de Make puse «CARVUK: encenderlo», copiando la salida de la herramienta. La descripción de esa misma tarea decía que NO se enciende: sus destinos son los de otro cliente y publicaría en redes ajenas. Se corrigió con un segundo comentario y en el aviso al equipo. Antes de comentar una tarea se lee entera; lo que dice una herramienta sobre un escenario no reemplaza lo que una persona o un colega ya anotó.

**Lo que no se tocó:** las 17 restantes necesitan a una persona (aprobaciones, piezas, avisar a un cliente). Cerrarlas o moverlas no las resuelve.

**Traba del sistema:** `paperclipUpdateIssue` devuelve la tarea entera con todas sus relaciones (miles de caracteres por llamada). Para un triage de muchas tareas conviene comentar con `paperclipAddComment` y cambiar estado solo donde hace falta.

## 11. Por qué una campaña no trae leads: la web (Carla, CRO)

**Tarea:** LMTM-6906, INBELT. Google gastó $75.255 en 7 días con 1 lead. La tarea llevaba 13 días abierta sin un comentario.

**Cómo se hizo:** se bajó el HTML crudo de la home y de /contacto/ con curl y se buscaron las etiquetas por texto (`gtag`, `dataLayer`, `G-`, `GTM-`, `AW-`, `fbq`), los formularios y los links de contacto. Dos comandos.

**Lo que se encontró:**
1. Cero etiquetas de medición en las dos páginas. «0 leads» significa «no hay con qué contarlos».
2. La home, adonde mandan las campañas, no tiene formulario, ni WhatsApp, ni teléfono.
3. El único formulario (Contact Form 7, en /contacto/) envía sin página de gracias: aunque haya Analytics, no se cuenta solo.

**Qué se entregó:** comentario en la tarea con lo verificado, la salvedad de lo que el HTML crudo no ve (etiquetas cargadas después del aviso de cookies), los 4 pasos en orden, el fragmento exacto para contar el envío del formulario, quién puede hacerlo (la web no está en el hosting de la agencia) y cómo se comprueba que quedó.

**Lo que no se hizo:** proponer pausar. La regla de la casa es que no se decide sobre pauta sin medición; primero se mide.

## 12. Análisis del CRM propio (Ana)

**Entregable:** «CRM propio — quién lo usa de verdad (lectura del 22/11/2026)». Dos lecturas de la API (`/admin/overview` y `/admin/companies`), nada escrito.

**Lo que decía el resumen y lo que había debajo:**
- «11 empresas pagando, $2.750.000 de ingreso mensual». Las 11 tienen la facturación salteada y 7 son de prueba. El número no es plata.
- Uso del mes: 30 conversaciones y 70 respuestas de IA, todas de un solo cliente. Los otros seis clientes reales, cero.
- Tres pruebas vencidas (21/10, 24/10 y 19/11) que siguen figurando «en prueba».

**Cruce con otra fuente:** un cliente recibe ~76 consultas por semana desde la pauta y tiene 0 conversaciones en el CRM. Los leads no pasan por ahí.

**Lo que se dijo que no se puede ver:** el tablero de cada empresa (hace falta un usuario de esa empresa).

## 13. Análisis de datos entre fuentes (Delfina)

**Entregable:** «Lo que la flota produce y lo que se usa — medición del 22/11/2026». Una sola consulta a la base, armada con lo que fue apareciendo en las otras corridas.

| Qué | Producido | Usado |
|---|---|---|
| Informes semanales desde el 01/10 | 194 | 0 publicados |
| Tareas abiertas de agentes | 292 | 159 sin tocar hace más de 7 días |
| Tareas [HUMANO] | 59 | la más vieja, del 09/09 |
| Corridas en 7 días | 244 | 97 bien, 119 cortadas por tope |

**Cómo se escribió:** la tabla, qué significa en tres efectos, **qué no dice el número** (no mide calidad; los informes pueden llegar por otra vía) y tres preguntas concretas para quien decide. No trae recomendaciones de proceso: trae preguntas.

## Lo que esta tanda no cubre
- **Estudio semanal de virales (Carlos):** depende de la API de redes de la oficina y de fichar videos uno por uno. Hay una nota propia del estudio base del 17/11 («Estudio de virales y Editor de video»).
- **Producción de piezas (Productor) y edición de crudos (Editor):** corren en el servidor con terminal, gastan créditos y tardan de 10 a 40 minutos por pieza. No se hicieron desde acá.
- **Revisión de marca de una pieza (Bianca):** hay que mirar la imagen; no se hizo.
- **Auditoría de perfil (Caro):** la corrida 4 (Propuesta CM) usa la misma lectura (`lmtmGetClientContentMatrix`) y ya existe la skill `lmtm-auditoria-perfil`.
- **Dario, Roxana y Esteban:** están pausados.

## Lo que se repitió en casi todas las corridas
1. **Ya estaba hecho y esperando.** Calendarios propuestos sin cargar, informes sin publicar, 100 ideas sin aprobar. Antes de producir se mira si la versión anterior se usó.
2. **La herramienta decía una cosa y era otra.** «Fatiga creativa» era una pieza publicada tres veces; «11 pagando» era facturación salteada; «0 leads» era una web sin etiquetas; «sin calendario» eran clientes que publican por otra vía.
3. **Un porcentaje sin su base no decide.** 96 % de un tope acumulado con 35 días de margen no es una alerta.
4. **Tres errores propios en trece corridas**, los tres por afirmar algo sin verificarlo (una cuenta «de otro cliente», un formato «que más rinde», un escenario «para encender»). Los tres se corrigieron a la vista, diciendo qué estaba mal.
