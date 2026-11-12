# Tanda 4 — optimización de Google Ads (11/11/2026)

Corrida de referencia hecha por Claude con las mismas palancas que tienen Milo y el Media buyer: `lmtmGetClientCampaigns`, `lmtmAuditoriaKeywordsGoogle`, `lmtmRendimientoWeb`, la memoria del cliente y las tres herramientas de keywords, estas últimas **solo con `ensayo: true`** (Google valida y no guarda nada). El historial semana por semana se sacó con SQL de solo lectura.

No se escribió en ninguna cuenta. No se creó ninguna decisión, tarea, comentario ni memoria: al terminar, `approvals` y `agent_actions` tenían 0 filas nuevas.

**Ventana:** 12/10 al 10/11 (30 días). El 11/11 se dejó afuera porque el día en curso está a medio sincronizar.

**Qué es material para los agentes:** la skill `lmtm-ejemplos-google-ads`, sin nombres. Este archivo es el registro completo.

## Cómo se usa este archivo

- Los tres casos tienen formato distinto porque el problema era distinto. No hay plantilla.
- En los tres, la auditoría automática devolvió una lista de acciones y **en ninguno lo correcto era aplicarla tal cual**. Eso es lo que hay que aprender: la auditoría da candidatos, no decisiones.
- Los números y los clientes de acá no se reutilizan en otra entrega.

## Cómo se eligieron las cuentas

Hay 8 clientes con gasto en Google en la ventana. Se pidió la auditoría de keywords de los 8 antes de elegir.

| Cliente | Rubro | Gasto 30 d | Clics | Conv. | Qué devolvió la auditoría | ¿Entra? |
|---|---|---:|---:|---:|---|---|
| COSA PROPIEDADES | inmobiliaria | $571.687 | 4.382 | 394 | «Sumar 12 keywords» | **Sí:** la lista hay que leerla antes de copiarla |
| BOERO | autopartes | $512.591 | 43.744 | 101 | 0 términos, «cuenta limpia» | No: la herramienta lee otra cuenta (ver «Herramientas») |
| MA PROPIEDADES | inmobiliaria | $486.848 | 11.228 | 7.895 | `conversionesDudosas: true` | No: ya está en las tandas 1 y 2 |
| Distrillantas | gomería | $426.587 | 7.151 | 53 | Sin acciones | No: solo marca y Performance Max; ya está en la tanda 1 |
| INBELT | industria B2B | $235.192 | 469 | 0 | «Pausar 10 keywords» | **Sí:** keywords caras sin conversión |
| GRUPO ROIBAS | hotelería | $21.571 | 633 | 129 | «Sumar 12 keywords» | **Sí:** 7 días de datos |
| MAERS | materiales | $965 | 79 | 0 | no se pidió | No: sin gasto para decidir nada |
| GALA | inmobiliaria | 207 (cuenta en dólares) | 1.302 | 0 | Sin acciones | No: el piso de la auditoría no aplica a su moneda (ver «Herramientas») |

**Ninguna de las 8 auditorías devolvió negativas.** No es que no haya desperdicio: ver «Herramientas», punto 3.

## Orden de trabajo (el mismo en los tres)

1. **`lmtmGetClientCampaigns` (30 días):** qué campañas hay, cuánto gastan, a dónde mandan, qué ya se propuso.
2. **¿Las conversiones sirven?** Conversiones ÷ clics de la cuenta, hoy y en el pasado. Recién si esto cierra se mira el resto.
3. **`lmtmAuditoriaKeywordsGoogle` con 30 y con 90 días.** Si las dos ventanas cuentan historias distintas, cambió algo y hay que saber qué antes de decidir.
4. **Cobertura:** cuánta plata explican los términos que la auditoría muestra contra el gasto real de las campañas de búsqueda.
5. **Leer cada término propuesto, uno por uno:** ¿es la marca?, ¿es el nombre de otra empresa?, ¿describe algo que el cliente vende?
6. **`ensayo: true`** de lo que quedó en pie.
7. **Separar:** qué se propone, qué hace una persona, qué no se toca.

---

## 1. INBELT (industria B2B): keywords caras sin conversión

**Formato:** una línea de tiempo y tres grupos de keywords, porque la decisión depende de cuándo cambió la medición.

### Lo que hay

| Campaña | Gasto | Impr. | Clics | CTR | CPC | Conv. |
|---|---:|---:|---:|---:|---:|---:|
| Search Inbelt refurbished LMTM | $229.962 | 6.375 | 465 | 7,29% | $494 | 0 |
| Inbelt Branding Search LMTM n1 #2 | $5.230 | 54 | 4 | 7,41% | $1.308 | 0 |

Es toda la pauta medible del cliente (Meta figura sin conexión). Sin objetivo de costo por consulta cargado y sin propuestas en 30 días.

La auditoría de 30 días propone **pausar 10 keywords** ($113.491, 143 clics: la mitad del gasto de la campaña) y bajar 8 de amplia a frase.

### Paso 2: las conversiones no sirven, y no desde ahora

| Período | Gasto | Clics | CPC | Conv. | Conv. ÷ clics |
|---|---:|---:|---:|---:|---:|
| Mayo a agosto (4 meses) | $804.868 | 4.039 | $199 | 3.245 | 80% |
| Semana del 31/08, la del corte (incluida en la fila de abajo) | $15.896 | 116 | $137 | 1 | 1% |
| Septiembre al 10/11 | $548.805 | 1.154 | $476 | 3 | 0,3% |

- **Antes del 31/08** convertían 8 de cada 10 clics. Eso no es una consulta: es una acción que se disparaba casi con cada visita.
- **Desde el 31/08** no se registra nada. El corte es de una semana a la otra (138 conversiones la semana del 24/08, 1 la siguiente).
- **El clic cuesta 2,4 veces más** desde entonces, con el mismo gasto mensual. En agosto fueron 1.315 clics; en octubre, 448.
- La memoria del cliente ya tiene, del 08/11, que el sitio no sirve ninguna etiqueta de Google y que la home no tiene formulario ni teléfono. Eso sigue en pie: Analytics vio 82 sesiones en 28 días, contra 203 clics orgánicos de Search Console y 465 pagos.

**Qué no sabemos:** qué pasó el 31/08 (alguien sacó la conversión falsa, o se instaló el aviso de cookies que hoy bloquea las etiquetas) y qué estrategia de puja tiene la campaña. Si puja por conversiones, quedó sin señal, y eso explicaría el clic más caro. Es hipótesis: la puja no se ve desde LMTM-OS.

**Consecuencia:** «0 conversiones» vale para todas las keywords de la cuenta, así que no distingue una buena de una mala. La lista de 10 no es «las que no convierten»: es «las 10 que más gastan».

### Paso 3: 30 y 90 días se contradicen

Con 90 días, la misma herramienta propone **sumar** 12 keywords «que ya convierten». Las tres primeras son `industrial equipment` (81 conversiones), `industrial equipments` (28) e `industrial machinery`: búsquedas en inglés, con conversiones del período en que todo convertía. Y entre las cuatro a pausar aparece `imbelt`, con calidad 10/10: es la marca mal escrita.

Un agente que pide 90 días y copia la lista suma inglés genérico y pausa la marca.

### Paso 4: cobertura

Los términos de búsqueda visibles suman $76.358, un tercio del gasto de la campaña. Ninguno llegó al piso para ser negativa. Las keywords sí explican el gasto, así que acá se decide por keyword.

### Paso 5: las 10 keywords, leídas una por una

| Grupo | Keywords (todas en amplia) | Gasto | Clics | Decisión |
|---|---|---:|---:|---|
| **No describen un producto** | `industria de la mineria` ($14.536, 14 clics, CPC $1.038) · `industria mineras` ($7.236, 14 clics) | $21.772 | 28 | **Proponer pausa.** Quien busca eso busca información del sector, empleo o noticias. No depende de la medición |
| **Describen lo que vende** | `chapa Hardox` · `Hidrociclones` · `revestimiento piping` · `revestimiento goma` | $27.682 | 47 | **No pausar.** Tienen página propia en el sitio o figuran en la ficha del cliente. El problema es la amplia y el destino, no la palabra |
| **No sé si lo vende** | `fajas transportadoras` ($20.272) · `rodillos para banda transportadora` ($18.046) · `bandas transportadoras precio` ($16.278, CPC $1.480) · `ruedas para autoelevadores` ($9.441) | $64.037 | 68 | **Preguntar.** La ficha habla de revestimientos, cerámicas y aceros antidesgaste; no nombra bandas ni ruedas. Si no las vende, son la pausa más grande de la cuenta. Si las vende, se quedan |

**Ensayo:** `lmtmPauseKeywordsGoogle` con las dos del primer grupo y `ensayo: true` → «Google validó la pausa de 2 keyword(s) y NO guardó nada». Existen y están activas.

### Qué no se tocó y por qué

- **`inbelt` e `imbelt`:** la marca. La auditoría propuso bajar una y pausar la otra. El servidor protege `inbelt` pero no `imbelt`: el freno compara el nombre exacto.
- **La campaña entera:** es la única pauta del cliente y el CTR (7,3%) dice que el aviso responde a lo que se busca. Pausarla o no es una decisión comercial, no de keywords.
- **Las 12 «nuevas» de 90 días:** conversiones de una medición que ya no existe.
- **El 9 y el 10/11:** $14.218 por 6 clics y $15.099 por 13. Son dos días; se avisa, no se concluye.

### Cómo se mide

| Cuándo | Qué mirar | Con qué |
|---|---|---|
| 7 días después de la pausa | Las dos keywords ya no figuran en `pausar`. El gasto de la campaña no debería bajar: se reparte en el resto | `lmtmAuditoriaKeywordsGoogle` con `dias: 7` y `lmtmGetClientCampaigns` con `sinceDays: 7` |
| 14 días | CPC de la campaña. Base: $494. Si el gasto se reparte al costo del resto, queda cerca de $476. Es una mejora chica y hay que decirlo así | `lmtmGetClientCampaigns` con `sinceDays: 14` |
| Cuando se arregle la etiqueta | Que aparezca la primera conversión real. Hasta entonces, ningún resultado de esta cuenta se mide en consultas | `lmtmRendimientoWeb`: canal pago con sesiones y eventos clave |

### Qué se le pide a una persona

1. **Medición, primero:** que las etiquetas carguen (hoy dependen del aviso de cookies) y que exista una conversión de formulario enviado. Ya está pedido en LMTM-6906; esto le suma la fecha del corte, 31/08, para buscar en el historial de cambios.
2. **Confirmar con el cliente** si vende bandas, rodillos y ruedas para autoelevadores.
3. **Concordancia:** pasar las del segundo grupo de amplia a frase. No hay herramienta para eso.
4. **Mirar la puja** de la campaña y los dos días de CPC por encima de $1.000.
5. **Corregir la memoria del 24/08**, que dice «Google Ads anda excelente: CPL $188». Salió de las conversiones falsas.

**Lo que este caso enseña:** cuando la cuenta entera tiene cero conversiones, «no convierte» deja de ser un criterio. Ahí solo se puede pausar lo que no describe un producto, y lo demás es medición.

---

## 2. COSA PROPIEDADES (inmobiliaria): «sumar 12 keywords que ya convierten»

**Formato:** la lista de la herramienta clasificada, porque el trabajo fue leerla.

### Lo que hay

| Campaña | Tipo | Gasto | Clics | CPC | Conv. | Costo por conv. |
|---|---|---:|---:|---:|---:|---:|
| Sales-Search- Barrios Cerrados | Búsqueda | $311.713 | 695 | $449 | 89 | $3.502 |
| Performance Max-2 | PMax | $199.110 | 3.517 | $57 | 293 | $680 |
| Campaign #1 | Búsqueda | $60.864 | 170 | $358 | 12 | $5.072 |

Conversiones ÷ clics: 9% en la cuenta, sin ningún salto brusco semana a semana desde septiembre. Pero Analytics muestra 0 eventos clave en las páginas de destino (1.460 sesiones pagas en la home), y la memoria ya dice que no se sabe qué cuenta Google como conversión. Sin propuestas de Google en 30 días.

### La lista de 30 días, clasificada

| Grupo | Términos | Conv. | Costo | Decisión |
|---|---|---:|---:|---|
| **Nombres de otras empresas** | `carcen inmobiliaria` · `inmobiliaria trobbiani` · `locativa` · `pw negocios inmobiliarios` · `inmobiliaria dunod rosario` · `inmobiliaria leone` | 6 | $7.993 | **No sumar.** Una conversión cada uno. Comprar el nombre de un competidor es una decisión del cliente, y uno de los seis es **otro cliente de la agencia** |
| **La marca propia** | `inmobiliaria cosa rosario` | 2 | $1.298 | **No sumar acá.** La marca no va dentro de «Barrios Cerrados»; si se quiere una campaña de marca, la arma una persona |
| **Genéricas fuera del tema** | `inmobiliarias en granadero baigorria santa fe` ($4.290) · `departamento 1 dormitorio dueño directo` ($3.177) · `ventas de departamentos en rosario` ($999) · `inmobiliaria rosario` ($1.496, en Campaign #1) | 4 | $9.962 | **No sumar a «Barrios Cerrados».** «Dueño directo» es alguien que evita a las inmobiliarias. `inmobiliaria rosario` se trata aparte |
| **Del tema de la campaña** | `la finca 2 funes` | 1 | $1.457 | **Preguntar** si ese barrio está en cartera. Con una conversión no alcanza para proponerla |

Total: 12 términos, 13 conversiones, $20.710. Con 90 días la lista cambia de nombres pero no de forma: `espora propiedades`, `berrini inmobiliaria casilda`, `ottado constructora rosario`, `desin s a` y `lux departamentos jesus maria` (Jesús María queda en Córdoba).

**La única que pasa el filtro:** `inmobiliaria rosario`, en Campaign #1. En 90 días trajo 4 conversiones por $6.265 ($1.566 cada una, contra $5.072 de su campaña). Describe lo que el cliente es, no nombra a nadie y tiene más de una conversión.

**La única para pausar:** `paginas de inmobiliarias` [amplia], en Campaign #1: $3.217, 11 clics y 0 conversiones en 90 días. Quien busca eso quiere un portal.

**Ensayos:** `lmtmAddKeywordsGoogle` con `inmobiliaria rosario` en su grupo y `lmtmPauseKeywordsGoogle` con `paginas de inmobiliarias`, los dos con `ensayo: true` → validados, nada guardado.

### Lo que la lista dice sin que nadie lo pregunte

La campaña se llama «Barrios Cerrados» y gasta $311.713. Entre los términos que convirtieron hay **uno solo** de un barrio cerrado. El resto son nombres de inmobiliarias y búsquedas generales. La campaña no está comprando lo que dice su nombre.

No se puede medir cuánto: los términos visibles suman $184.790, la mitad de lo que gastaron las dos campañas de búsqueda ($372.577), y 46 de sus 101 conversiones. La otra mitad no se ve.

### Qué no se tocó y por qué

- **Negativizar los nombres de competidores:** convirtieron, y más barato que el promedio de la campaña. Puede ser gente que quería contactar a la otra inmobiliaria: no se sabe sin cruzar con el CRM del cliente (Tokko, no integrado). Además, el servidor rechazó `espora propiedades` «por ser de la marca»: toma «propiedades» como nombre del cliente (ver «Herramientas»).
- **Mover presupuesto de búsqueda a Performance Max** por la diferencia de costo ($680 contra $3.502): la memoria del 05/11 ya dice que no se mueve hasta saber qué cuenta cada una. Sigue valiendo.
- **Campaign #1 por su costo:** del 02 al 10/11 gastó $14.866 con 0 conversiones, pero ya está anotado que casi no entrega. Es presupuesto, que no se ve desde acá.

### Cómo se mide

| Acción | A los 7 días | A los 14 días | Cuándo se deshace |
|---|---|---|---|
| Sumar `inmobiliaria rosario` | Campaign #1: clics y gasto de la semana. Base de las últimas 4 semanas completas: 156 clics, $53.812, 12 conversiones | Conversiones por semana (base: 3) y costo por conversión (base: $5.072) | Si la keyword gasta más de $3.132 (dos veces su costo por conversión) sin ninguna, se propone pausarla |
| Pausar `paginas de inmobiliarias` | Ya no figura en `pausar` | Nada más: libera unos $1.000 por mes | No hace falta |

### Qué se le pide a una persona

1. **Decidir con el cliente si se compran nombres de competidores.** Hoy pasa sin que nadie lo haya decidido, e incluye a otro cliente de la agencia.
2. **Abrir «Barrios Cerrados» en Google Ads** y mirar keywords y concordancias: desde LMTM-OS no se ven. Ya hay una tarea por el destino (URL final); esto es lo mismo del otro lado del clic.
3. **Qué cuenta como conversión.** Sigue abierto desde el 05/11 y condiciona todo lo anterior.

**Lo que este caso enseña:** «ya convierte» no alcanza para sumar una keyword. Hay que mirar quién es el dueño del nombre, si es del tema de la campaña y si fue más de una vez. De 12, pasó una.

---

## 3. GRUPO ROIBAS (hotelería): 7 días no alcanzan

**Formato:** corto. No hay nada para proponer y eso se dice rápido.

> **Google:** una campaña de búsqueda, «grupo de hoteles». Sin entrega registrada hasta el 03/11; del 04 al 10/11, $21.571, 633 clics, CPC $34, 129 conversiones a $167.
> **No se propone nada.** Son 7 días, el clic bajó de $206 a $19 en ese lapso (todavía se está acomodando) y no se sabe qué cuenta como conversión.
> **Una pregunta para una persona:** quién la prendió el 04/11, a qué página manda y qué acción cuenta.

**Por qué no la lista de la auditoría.** Propone sumar 12 keywords: 24 conversiones por $2.412.
- Tres son la marca (`grupo roibas`, `grupo roibas com ar`, `grupo roibas mar del plata`).
- Las demás son nombres de hoteles, casi todas con una conversión.
- `hotel de luz y fuerza en san bernardo` figura con 2 conversiones por $17. Una reserva de hotel no cuesta $8,50: eso es otra cosa, probablemente una visita o un clic en un botón.

**Tres números que parecen decir algo y no lo dicen:**
- **«Está arriba del objetivo» ($167 contra $134):** el objetivo es el costo de esos mismos 7 días por 0,8. Se compara con sí mismo.
- **«20% de los clics convierte»:** queda debajo del 30% que marca `conversionesDudosas`, así que la herramienta no avisa. Para una reserva es demasiado.
- **«Es la campaña de marca»:** la herramienta la marca así porque se llama «grupo de hoteles» y el cliente «GRUPO…». Las búsquedas son de hoteles por ciudad.

**Lo que no se pudo ver:** la web cargada en LMTM-OS es la de un solo hotel (Bariloche) y las búsquedas son de San Bernardo y Mar del Plata. Analytics de esa propiedad no tiene ningún día con datos. No sé a qué sitio manda la campaña.

**Falsa alarma verificada:** Search Console lista en ese sitio tres páginas con títulos de casinos y de trámites de Texas. Parecía spam inyectado. Se abrieron: las tres dan 404. Hubo algo, ya no está; Google todavía las recuerda. No hay nada que avisar.

**Cuándo se vuelve a mirar:** el 18/11 (14 días de entrega). Ahí sí: conversiones ÷ clics, costo por clic estable o no, y la auditoría de nuevo. Si para entonces nadie contestó qué es una conversión, la respuesta sigue siendo no tocar.

**Lo que este caso enseña:** que una herramienta devuelva 12 acciones no quiere decir que haya 12 cosas para hacer. Con una semana de datos y una conversión sin definir, la entrega correcta son tres líneas y una pregunta.

---

## Principios que se repiten

1. **Primero la medición, después las keywords.** Tres señales de que las conversiones no sirven: cero en toda la cuenta; más del 30% de los clics (y entre 15 y 30% hay que preguntar); un salto de una semana a la otra.
2. **Dos ventanas.** Si 30 y 90 días proponen cosas opuestas, cambió la medición en el medio. Lo anterior al cambio no se usa.
3. **«No convierte» solo sirve si algo convierte.** Con la cuenta en cero, se pausa únicamente lo que no describe un producto, y se dice que el motivo es ese.
4. **Una conversión es una anécdota.** Para sumar una keyword: 3 o más en 90 días, costo por conversión menor al de su campaña, que describa lo que el cliente vende y que no sea el nombre de nadie.
5. **Leer cada término.** La marca, la marca mal escrita, el competidor, otro cliente de la agencia y otra provincia no los distingue un umbral.
6. **Cobertura.** Sumar lo que la auditoría muestra y compararlo con el gasto. Si explica la mitad, decirlo: de la otra mitad no se sabe nada.
7. **Menos de 14 días de entrega: no se toca.** Y un objetivo calculado con esos mismos días no es un objetivo.
8. **`ensayo: true` antes de proponer.** Confirma que la keyword existe y que el lote es válido.
9. **Decir el tamaño.** Una pausa que libera $1.000 por mes se propone igual, pero no se presenta como un hallazgo.
10. **Lo que no tiene palanca va a una persona con el paso exacto:** concordancia, puja, presupuesto, URL final, definición de la conversión.

### Errores típicos de un agente en esta tarea

- Copiar la lista de la auditoría como propuesta.
- Pedir una sola ventana.
- Tomar «sin acciones» como «la cuenta está bien».
- Creer que el servidor frena todo lo que es marca, o que todo lo que frena lo es.
- Proponer con una semana de datos porque la herramienta devolvió algo.
- Comparar contra un objetivo de fuente «historial» sin mirar con cuántos días se armó.

---

## Herramientas: lo que está roto o engaña

Todo verificado en esta corrida. No se tocó código.

1. **La auditoría lee una sola cuenta de Google por cliente.** BOERO tiene dos mapeadas: lee `4057299764` (sin gasto) y la que gastó $512.591 es `7404215852`. Devuelve «0 términos… la cuenta está limpia». `pausarKeywords` y `agregarKeywords` toman «una campaña cualquiera» para resolver la cuenta: pueden buscar en la equivocada. (`conexionGoogle` en `ads-keywords.ts`; los `.limit(1)` de `ads-actions.ts`.)
2. **La detección de marca usa cualquier palabra de 4 letras o más del nombre del cliente.**
   - «propiedades» y «grupo» cuentan como marca. Verificado con ensayo: `espora propiedades` se rechazó como marca de COSA PROPIEDADES.
   - Por lo mismo, `gastoMarcaSinConversion` de esos clientes incluye a competidores.
   - `lmtmGetClientCampaigns` marca «es la campaña de marca: no se corta por CPL» a «grupo de hoteles» y a «Search Inbelt refurbished LMTM», que compran búsquedas genéricas.
   - Al revés, la marca mal escrita no está protegida: la auditoría propuso pausar `imbelt`.
3. **Las negativas no aparecen nunca.** El piso es $3.000 y 8 clics por término, en la moneda de la cuenta.
   - Con CPC de $450 hacen falta 8 clics del mismo término exacto; el desperdicio repartido en muchos términos no llega.
   - En una cuenta en dólares (GALA: 500 términos, 144 de gasto total) no se cruza jamás.
   - La herramienta no devuelve los términos ni un total de los que quedaron abajo: el agente no puede ver búsquedas.
   - Resultado: 0 negativas en las 8 cuentas.
4. **`nuevas` pide una sola conversión** y no mira si las conversiones son creíbles, si el término es de marca o de un tercero, ni si se repite (en MA PROPIEDADES `inmobiliaria rosario` sale 4 veces). `conversionesDudosas` se calcula sobre toda la ventana y no ve un cambio en el medio.
5. **`pausar` con la cuenta en cero conversiones** lista lo que más gasta. Falta un aviso: «0 conversiones en toda la cuenta = medición».
6. **La ventana de la auditoría incluye el día de hoy**, que está a medio cargar.
7. **«Bajar de amplia a frase» no tiene palanca.** Tampoco se leen puja, presupuesto ni concordancias de Google.
8. **El objetivo de fuente «historial» se calcula con lo que haya:** 7 días en GRUPO ROIBAS.
9. **`lmtm-ads-playbook` dice que no se pueden crear keywords.** Desde el 10/11 existe `lmtmAddKeywordsGoogle`.
10. **Nunca se propuso una acción de keywords:** 0 filas en `approvals` y en `agent_actions` de negativas, pausas o altas de keywords.

---

## Para decidir una persona

### Acciones que se pueden aprobar (ya validadas con ensayo)

| Cliente | Acción | Detalle | Efecto esperado |
|---|---|---|---|
| INBELT | Pausar 2 keywords | `industria de la mineria`, `industria mineras` | Deja de gastar $21.772 por mes en búsquedas que no son de producto. El total de la campaña no baja |
| COSA PROPIEDADES | Pausar 1 keyword | `paginas de inmobiliarias` | Unos $1.000 por mes |
| COSA PROPIEDADES | Sumar 1 keyword (frase) | `inmobiliaria rosario`, grupo `142238543025` de Campaign #1 | Puede subir el gasto. Conviene aprobarla después de saber qué cuenta la conversión |

Ninguna quedó cargada como decisión en Hoy: esta corrida no escribió nada. Para cargarlas hay que llamar a la herramienta con `justificacion`.

### Decisiones que no son de keywords

1. **INBELT:** $548.805 desde septiembre sin una conversión medida y con el clic a 2,4 veces. ¿Se sigue al mismo ritmo mientras se arregla la etiqueta, o se baja?
2. **INBELT:** ¿vende bandas, rodillos y ruedas para autoelevadores? De eso dependen $64.037 por mes.
3. **COSA PROPIEDADES:** ¿se compran nombres de competidores? ¿Y el de otro cliente de la agencia?
4. **GRUPO ROIBAS:** quién prendió la campaña el 04/11, a dónde manda y qué cuenta.
5. **BOERO:** la auditoría de keywords no ve la cuenta que gasta. «REsearch x2» sigue igual que en la tanda 1: $300.473, 42.809 clics y 0 conversiones en 30 días.
6. **Qué arreglar primero de «Herramientas».** Sugerido: 1 y 2, porque hoy dan respuestas falsas con apariencia de sanas.

## Límites de esta corrida

- No se vio ninguna pantalla de Google Ads: historial de cambios, puja, presupuesto y concordancias quedan sin verificar.
- Los términos de búsqueda solo se vieron a través de lo que devuelve la auditoría (hasta 12 «nuevas», 15 negativas y 10 a pausar).
- Que los nombres de la lista de COSA PROPIEDADES sean competidores es una lectura de los textos; solo DUNOD está confirmado, por ser cliente.
- Qué pasó en INBELT el 31/08 es hipótesis.
- No se midió nada a 7 ni a 14 días: no se aplicó nada.
