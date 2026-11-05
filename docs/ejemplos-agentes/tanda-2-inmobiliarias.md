# Corrida de referencia: inmobiliarias (05/11/2026)

Trabajo completo sobre los 13 clientes activos del rubro, hecho a mano con datos reales. Nada salió a clientes y no se tocó ninguna cuenta de pauta, web, planilla ni script.

**Qué es material para los agentes:** la skill `lmtm-ejemplos-nicho`, sin nombres. Este archivo es el registro completo.

## Qué se revisó por cliente

| Área | Cómo |
|---|---|
| Scripts de Redes y de video | Código, ejecuciones, planilla real y efecto en ClickUp |
| Publicación | Cadena de publicación, planilla y posteos reales |
| Pauta | Por campaña, 30 días, propuestas pendientes |
| Redes | Interacción por pieza y formato, 60 días |
| Web | GA4, Search Console, fuentes, eventos clave y PageSpeed |
| Trabajo de los agentes | Tareas, entregables, corridas, alertas y memoria |
| Plan de acción | Uno por cliente, guardado en su ficha |

## Comparación del rubro

Pauta: 06/10 al 04/11. Redes: 60 días en Instagram.

| Cliente | Gasto Meta | Leads | CPL Meta | Mediana redes | Sesiones web | Contactos medidos en la web | Por delante en el calendario |
|---|---:|---:|---:|---:|---:|---|---|
| IMPERIA | $93.366 | 38 | $2.457 | 41 | sin dato | sin etiqueta | 2 sin resolver |
| COSA | $444.255 | 93 | $4.777 | 31 | 8.970 | 0 eventos clave | 9 sin aprobar |
| SKYGARDEN | $229.869 | 43 | $5.346 | 7 | 626 | 0 eventos clave | 3, solo 1 aprobada |
| MA | $1.313.921 | 244 | $5.385 | 28 | 6.581 | 56 `generate_lead`; el resto no sirve | planilla vacía, publica por otra vía |
| SRP | $1.305.118 | 219 | $5.959 | 9 | 19.537 | 68 `generate_lead`; el resto no sirve | 3 aprobadas |
| DUNOD | $1.107.839 | 100 | $11.078 | sin dato | 15.293 | 423 eventos clave | nada |
| GALA | USD 286 | 14 | USD 20,4 | 5 | 1.785 | 0 eventos clave | 7 aprobadas |
| BRISANOVA | sin gasto desde el 03/10 | | | 6 | sin web cargada | | 5 aprobadas |
| PRONE | sin gasto | | | 14,5 | 2.233 | 102 `click` | 1, hoy |
| CANNES, Cliente Inmobiliario, Distrito Roldan, GRUPO MA | sin pauta | | | sin datos | sin datos | | nada |

### Conclusiones

1. **Nadie mide ventas.** Con esos datos, ningún CPL dice qué campaña vende. Solo DUNOD tiene eventos clave que parecen contactos en todo el conjunto.
2. **El gasto no sigue al resultado.** Los tres que más gastan tienen CPL de $5.385 a $11.078. El mejor costo tiene la menor inversión, y bajó su rendimiento al concentrarse en una campaña.
3. **Publicar más no da más.** SRP: 46 publicaciones, mediana 9. IMPERIA: 19, mediana 41. Todo es interacción: no tenemos alcance.
4. **El reel supera al carrusel** en las 7 cuentas que tienen los dos, de 1,2 a 8 veces.
5. **Las campañas mix costaron 4 veces más** ($18.676 contra $4.576), pero solo en MA. No es una regla del rubro todavía.
6. **El objetivo de la campaña casi no cambió el CPL de WhatsApp:** leads $4.843, interacción $4.491. Se esperaba otra cosa.
7. **Lo que más traba son decisiones de personas:** 31 tareas `[HUMANO]` abiertas y 13 propuestas de pauta pendientes. Solo 2 de 9 calendarios activos están sanos.
8. **El esfuerzo de los agentes va a donde hay reintentos, no a donde hay plata:** de 762 corridas en 30 días, DUNOD tuvo 560, la mayoría fallidas por el proveedor. MA, con el mismo gasto, tuvo 2.
9. **Hay clientes que compiten entre sí.** Varios se cargaron como competidores unos de otros, en la misma plaza. Falta decidir si eso importa.
10. **Competencia sin medir:** 302 competidores cargados y 2 con Instagram medido.

## Scripts

Se leyeron 23: los 13 de Redes y 10 de video. En Distrito Roldan y GRUPO MA no hay script de video con ese nombre. IMPERIA tiene la lista de video activa, pero tampoco encontré su script con ese nombre.

| Hallazgo | Clientes |
|---|---|
| Corrieron hoy, sin fallas | 21 de 23 |
| Sin ejecuciones recientes | Redes de Distrito Roldan y GRUPO MA |
| **Token de ClickUp escrito en el código** | Los 23 |
| La planilla registrada en LMTM-OS no es la del script | BRISANOVA, DUNOD, Distrito Roldan, GRUPO MA, MA, SRP, SKYGARDEN |
| Planilla de Redes sin filas con fecha | CANNES, MA, Distrito Roldan |
| Planilla sin hora en las piezas futuras | GALA (7) |
| Aprobación distinta entre planilla y ClickUp | IMPERIA (2 piezas) |

**Error mío del 04/11:** en `script-health.ts` puse que la API devuelve vacío para todos los scripts y dejé de avisar en esos casos. Hoy devolvió ejecuciones para 21 de 23. Así, un script que dejó de correr no genera aviso. Falta corregirlo y medir cuántos avisos daría en toda la agencia antes de prenderlo.

## Datos que estaban mal

- **Radar del 19/10:** MA con CPL de $234 en Meta (eran unos $5.000) y PRONE con CPL de $2.137 (no tiene pauta).
- **Plan de GALA:** comparaba dólares con pesos. Ahora `get_client_ads_performance` devuelve `moneda`.
- **Plan de DUNOD:** decía que Meta era la única pauta. GA4 muestra Google pago.
- **Aviso de SKYGARDEN:** suponía que faltaba la columna Horario. Existe.
- **Análisis SEO de MA:** dijo error 500 y `noindex`. Desde un navegador responde bien.

## Qué aprenden los agentes

| Vía | Qué |
|---|---|
| Skill `lmtm-ejemplos-nicho` | Qué verificar, cómo comparar, tres formatos |
| Radar del nicho | Reemplaza al del 19/10, con los datos corregidos |
| 5 lecciones de equipo | Medición, verificación, publicación, ClickUp, decisiones |
| Memoria de 6 clientes | Hechos comprobados el 05/11 |
| Planes de los 13 clientes | Son el plan anterior que lee Luna la próxima vez |
| Rutinas de Luna, Carlos y Milo | Mandan a cargar la skill |

## Límites

- Sin alcance orgánico ni ventas.
- El Instagram de DUNOD no se pudo leer: la red frenó la consulta.
- No se verificaron lead por lead los problemas del CRM de DUNOD: salen de LMTM-6486.
- Las conversiones de Google de MA se atribuyen a `first_visit` por los datos de GA4. Falta confirmarlo en Google Ads.
- No se escuchó ni se vio ningún video o guion en esta corrida: las listas de video se revisaron solo por estado.

## Planes de cada cliente

### SEBASTIAN RAMASCO PADILLA

**Primero la web: está hackeada.** Lo demás puede esperar a que eso se resuelva.

*Corrida de referencia hecha por Claude. Ventana: 06/10 al 04/11.*

## Lo urgente
La home de sramascopadilla.com.ar tiene spam de apuestas inyectado:
- Un bloque de texto dice «Las tragamonedas ofrecen grandes emociones y, con 1xbet bolivia…». Ese texto también sale en la descripción que toma Google.
- Hay enlaces a 888casinonz.com, xbet-bolivia.com, pinup.hn, casinotest2.com y otros dominios ajenos.
- Corre WordPress 6.4.14 y Slider Revolution 6.5.12. No sé por dónde entraron.

**Quién:** una persona del equipo, hoy, con el cliente y su hosting. Hay que limpiar, cambiar accesos y actualizar. Ningún agente toca la web ni le escribe al cliente.

## Por qué no sirven los números de la web
| Dato de GA4 | Lectura |
|---|---|
| Sesiones: 10.452 → 19.537 | Casi todo es «Direct» (16.003). No hay una causa comercial a la vista |
| `page_view` y `session_start` son eventos clave | No son contactos |
| `contactar` se dispara tantas veces como `page_view` (36.865 y 36.792) | Mal configurado |
| `generate_lead`: 68 | Lo único que parece un contacto real |

En el HTML de la home no encontré etiqueta de GA, solo el píxel de Meta. Hipótesis: el tráfico o el evento vienen de otro lado. Se comprueba después de limpiar la web.

## Pauta: qué decidir
| Decisión | Campaña | Dato |
|---|---|---|
| Mantener y mirar primero si sobra presupuesto | WP - San Luis 433 | $79.671, CPL $3.187 |
| Mantener y mirar primero si sobra presupuesto | WP CASAS/PH ROSARIO | $103.756, CPL $3.578, CTR 9,3% |
| Revisar | WP UNIDADES FUNCIONALES | $115.225, CPL $8.863: la más cara de las grandes |
| Preguntar para qué está | INTERACCION DARRAGUEIRA | $67.975, 0 leads, sin gasto desde el 19/10 |
| No juzgar por CPL | SEGUIDORES (3 campañas) | $128.092: buscan seguidores, no leads. Hay que decidir si ese objetivo sigue valiendo |
| Preguntar | Google | Sin gasto desde el 28/09 con campañas prendidas |

Hay una alerta de saldo de hoy y la recarga de LMTM-6440 sigue abierta. Sin esa recarga, nada de esta tabla importa.

## Redes: publicar más no está rindiendo
En 30 días publicó 29 veces en Instagram con 20 textos distintos, y la planilla tenía 16 piezas con fecha. Es la cuenta con menor interacción por pieza entre las que publican seguido: mediana 9, contra 41 de IMPERIA con menos de la mitad de piezas en Instagram. Hay 11 textos repetidos en Instagram.

**Hipótesis sobre las repeticiones:** se publica por dos vías. En GA aparece `smartlink2.metricool.com`, así que hay que preguntarle al equipo si se está subiendo también desde Metricool. Eso solo no lo prueba.

## Scripts
El de Redes corrió hoy y la planilla tiene 3 piezas futuras, todas aprobadas; la del 06/11 no tiene copy o pieza y no va a salir. La planilla registrada en LMTM-OS es otra: la de gasto de abril, no «SRP | Cronopost».

## Otros datos
- La prueba del CRM vence el 19/11 y esta cuenta todavía no tiene canales conectados.
- Hay 45 alertas viejas de «riesgo de baja» abiertas desde julio. Ninguna se envió: son ruido.

### MA PROPIEDADES

**Las conversiones de Google son falsas y ahora se ve por qué. Con eso resuelto, el resto de las decisiones cambia.**

*Corrida de referencia hecha por Claude. Ventana: 06/10 al 04/11.*

### 1. Conversiones de Google (LMTM-6676)
GA4 de MA tiene como eventos clave `first_visit` (3.649) y `tiempo en la página más de 2 min` (1.668). Los contactos reales son muchos menos: `generate_lead` 56 y `click` 118.

Google reporta 2.756 «leads» sobre 5.258 clics. Lo más probable es que esté importando esos eventos de GA4. **Falta confirmarlo:** en Google Ads → Objetivos → Conversiones, ver qué acciones son «principales». Hasta entonces, ningún CPL de Google sirve.

### 2. El tráfico cayó 78% por presupuesto, no por SEO
| | 30 días anteriores | Últimos 30 días | Cambio |
|---|---|---:|---:|
| Gasto en Google | $906.566 | $203.707 | -78% |
| Sesiones en GA4 | 29.410 | 6.581 | -78% |

No hace falta auditar la web por esto. Falta saber quién bajó el presupuesto y si fue a propósito. Con conversiones falsas, Google pudo estar optimizando hacia visitas nuevas: conviene corregir eso antes de volver a subir.

### 3. Decidir pausas tarde costó plata
Cuatro pausas propuestas el 21/10 siguen pendientes. Esas campañas gastaron **$151.077 y trajeron 8 leads** hasta frenar el 02/11. Antes de aprobar las 7 pendientes, cancelar las de campañas que ya no gastan.

| Pendiente | Qué hacer |
|---|---|
| MIX DEPTOS PREMIUM, MIX CASA BARRIO PRIVADO, MIX RIO, SALTA 1250 (21/10) | Sin gasto desde el 02/11: cancelar la propuesta o confirmar que estén apagadas |
| Eva Perón 8998, CAPTACION (03/11), MIX EMPRENDIMIENTOS (04/11) | Siguen gastando: decidir esta semana. CAPTACION busca propietarios: no compararla con compradores |

### 4. Lo que rinde en esta cuenta
Las campañas «MIX» gastaron $261.466 y trajeron 14 leads (CPL $18.676). El resto: $1.052.455 y 230 leads (CPL $4.576). La mejor, DPTOS OPORTUNIDADES ROS (CPL $1.875, CTR 7,4%), está **pausada**: dejó de gastar el 02/11 y no hay respuesta sobre por qué. Si esas propiedades siguen disponibles, es lo primero que se prende.

### 5. Una alarma que no era
- **«Sin calendario» es engañoso:** la planilla de Cronopost tiene 0 filas, pero publicó 20 piezas distintas en 30 días. Publica por otra vía. Las tareas urgentes de «resetear el calendario» parten de un dato incompleto. Falta preguntar por dónde publican y corregir el control. LMTM-5054, 5055 y 5064 siguen trabadas desde septiembre por el mismo tema.
- **«La web no carga»:** el análisis SEO devolvió error 500 y `noindex` al leerla desde el servidor. Desde un navegador responde 200 con la página completa. No hay nada que avisarle al cliente.

### Otros datos
- Es la única inmobiliaria con Search Console: 3.062 clics y 48.442 impresiones en 30 días.
- Mediana de interacción por pieza: 28. Los reels (53) rinden el doble que los carruseles (27).

### DUNOD

**DUNOD no necesita más tareas. Necesita que una persona tome tres decisiones.**

*Corrida de referencia hecha por Claude. Ventana: 06/10 al 04/11.*

Hoy tiene 36 tareas abiertas y 42 entregables en 30 días. Registré 560 corridas de agentes, 73% de todas las del rubro y la mayoría fallidas por error del proveedor. Mientras tanto gasta $1,1 millones por mes en una sola campaña a un costo por lead del doble que sus pares.

## Las tres decisiones
**1. ¿Quién atiende los leads de Meta?**
Según LMTM-6486, unos 97 leads de los últimos 30 días no entran al circuito comercial y los 16 del CRM siguen quietos desde agosto. El panel del CRM muestra 0 conversaciones en esta empresa. No lo verifiqué lead por lead. Antes de bajar el CPL, hay que saber si alguien contesta: si no, cualquier ajuste de pauta es secundario.

**2. ¿Cuánto se gasta en Clientes Potenciales Advantage+?**
$1.095.006, 100 leads, CPL $10.950. Hay 4 propuestas pendientes sobre dos conjuntos, repetidas y con montos que no coinciden ($12.000 dos veces; $5.600 y $6.000). Hay que aprobar una por conjunto y cancelar el resto. No conviene escalar nada hasta resolver el punto 1.

**3. ¿Quién maneja la pauta de Google?**
GA4 muestra **3.305 sesiones de `google / cpc`** en 28 días y 106 eventos clave, pero LMTM no tiene ninguna cuenta de Google conectada para DUNOD. Los planes anteriores decían que Meta era «la única fuente»: no era así. Hay que preguntarle al cliente.

## Lo nuevo: Analytics ya mide
Desde hoy entran datos: 15.293 sesiones y 423 eventos clave en 30 días, con eventos que sí parecen contactos (`ads_conversion_Enviar_formulario` 326, `formulario` 49, `formulario_venta` 7). Es la mejor medición web del rubro.

| Canal | Sesiones | Eventos clave |
|---|---:|---:|
| Búsqueda orgánica | 4.907 | 183 |
| Google pago | 3.305 | 106 |
| Directo | 3.830 | 62 |

La búsqueda orgánica trae más contactos que la pauta de Google y no se paga por clic. La web está lenta en celular (PageSpeed 38), le falta la descripción y 23 de 24 imágenes no tienen texto alternativo. Mejorarla puede rendir más que otra campaña.

## Redes: no sabemos qué pasa
- La página y el Instagram están desconectados de la cuenta de LMTM (LMTM-6624): no entran posteos propios desde el 30/06.
- La planilla termina el 30/09, ClickUp el 12/10 y el último envío a Make fue hace 69 días.
- No pude leer el perfil público: Instagram frenó la consulta.

No hay piezas futuras cargadas. Producir más sin reconectar y sin calendario no sirve: LMTM-6695, 6696, 6697 y 6534 están bloqueadas con el Productor.

## Tareas para cerrar
**La API de Analytics ya está habilitada**, así que quedan viejas LMTM-6420 (de COSA), 6622 y 6625. LMTM-6145 y 6151 solo se pueden cerrar en parte: sus otros pedidos siguen pendientes. Conviene revisar el resto antes de abrir ninguna nueva.

### COSA PROPIEDADES

**Hasta el 07/11 hay que conseguir la aprobación de 9 piezas. Si no, ninguna sale.**

*Corrida de referencia hecha por Claude. Ventana: 06/10 al 04/11.*

**Esta semana**
1. **Aprobaciones:** hay 9 piezas programadas del 07/11 al 05/12, todas en PENDIENTE, en la planilla y en ClickUp. Aprobar después de la fecha no sirve: el despachador las descarta. Una persona se las pide al cliente.
2. **Pedir qué cuenta Google como lead:** reporta 432 sobre 4.283 clics, pero GA4 tiene **0 eventos clave**. PMax da CPL $631 y Search Barrios Cerrados $3.343. Puede ser una diferencia real o una conversión mal definida: sin saberlo, no conviene pasar plata de una a otra.

**Lo que no hay que hacer todavía:** comparar el CPL de Google con el de Meta (CPL $4.777). Miden cosas distintas, y una de las dos no se puede verificar.

**Pauta de Meta**
| Campaña | Gasto | CPL | Lectura |
|---|---:|---:|---|
| FORM - NOVIEMBRE | $49.253 | $4.104 | 3 días, CTR 7,8%: es pronto para juzgarla |
| FORM SEPTIEMBRE - EXTENSIÓN | $248.173 | $4.773 | Pausada desde el 02/11 |
| FORM FUNES - EXTENSIÓN | $108.413 | $8.339 | Pausada: Funes costó casi el doble |

Antes de sumar Funes a noviembre, mirar por qué costó casi el doble: público, propiedad o aviso.

**Web**
GA4 ya mide: 8.970 sesiones, estables contra el período anterior. Falta medir contactos: mientras no haya evento clave, la web no se puede evaluar. PageSpeed 46; la home no tiene H1 ni sitemap, y tiene 166 palabras. Es la plantilla de Tokko: parte de esto puede no poder cambiarse, hay que preguntarlo (LMTM-6614).

**Redes**
Solo 3 piezas en 30 días. La de mayor interacción fue detrás de escena: «Casa sol de funes, día de producción». Coincide con el rubro, donde ese ángulo es el que más rinde (1,9×, pocas piezas). Vale una prueba por mes, no un cambio de línea.

**Sin novedad:** los dos scripts corren. El de video pasa una planilla vacía: no hay tareas de video abiertas.

### IMPERIA PROPIEDADES

**No escalar todavía: la plata quedó en una sola campaña y el CPL empeoró.** El radar del rubro decía «escalar». Mirando el detalle, primero hay que recuperar lo que se apagó.

*Corrida de referencia hecha por Claude. Ventana: 06/10 al 04/11.*

| | 30 días anteriores | Últimos 30 días |
|---|---:|---:|
| Gasto en Meta | $156.004 | $93.366 |
| Leads | 86 | 38 |
| CPL | $1.814 | $2.457 |

Sigue siendo el mejor costo del rubro, pero:
- **FORM Jujuy 3200** concentró $73.090 (CPL $2.707).
- **FORM Jujuy 3023** dejó de gastar el 14/10 (CPL $3.426).
- **FORM Moreno 73 bis** dejó de gastar el 07/10: en 2 días hizo 6 leads a CPL $524. Es muy poca muestra, pero es la señal más fuerte de la cuenta.

**Decisión:** relanzar Moreno 73 bis con fecha vigente y el aviso que ya tiene (LMTM-6525). No esperar a los videos, que están bloqueados con el Productor (LMTM-6524). Si sostiene el costo con al menos $30.000, recién ahí se habla de subir.

**Redes: es la referencia del rubro**
La mediana es 41 por pieza, la más alta, con solo 19 piezas en Instagram en 60 días. Los reels promedian 221 y los carruseles 27. Ese promedio está inflado por un reel: [Crespo 800](https://www.instagram.com/reel/DdpOg5iAWIw/), con 2.134. Conviene revisar si tuvo pauta antes de copiarlo como fórmula.

**Tres arreglos de una persona**
1. **Las 2 piezas del 06 y 10/11:** la planilla dice APROBADO y ClickUp sigue en PENDIENTE. Tal como están, el despachador las descarta. Revisar hoy.
2. **Analytics:** la propiedad está vinculada, pero no hay ningún dato en 90 días, y en la home no aparece ninguna etiqueta de GA, GTM ni píxel. Sin eso, un FORM es lo único medible. Hay que instalarla.
3. **Cuentas:** la de Google está cancelada (LMTM-6551) y hay una subcuenta residual en otra moneda (INR). Sacarlas del mapeo evita mezclar números.

**Limpieza:** hay 38 alertas abiertas, entre ellas pedidos viejos para habilitar la escritura en Cronopost. Ninguna cambia lo de arriba.

### SKYGARDEN

**Antes de que se frene la pauta: ¿el cliente recarga y en cuántas campañas se reparte?** Son dos preguntas para una persona, y las tareas abiertas se contradicen.

*Corrida de referencia hecha por Claude. Ventana: 06/10 al 04/11.*

**Qué pasó**
El gasto en Meta bajó de $628.829 a $229.869 y el CPL mejoró de $6.550 a $5.346. Según LMTM-6717, quedan unos $206.900 de tope. Hay 16 campañas con gasto para 43 leads: en la mayoría, poca plata y pocos datos.

| Campaña | Gasto | Leads | CPL | CTR |
|---|---:|---:|---:|---:|
| RESIDENCIAL - OCTUBRE | $83.994 | 21 | $4.000 | 2,4% |
| WP - LOTES OCTUBRE | $60.083 | 6 | $10.014 | 0,7% |
| WP - CASAS FUNES SEPTIEMBRE | $20.403 | 1 | $20.403 | 0,7% |
| WP ROSARIO DPTOS CASAS SEPTIEMBRE | $16.812 | 3 | $5.604 | 2,1% |

**Propuesta para decidir:** concentrar en RESIDENCIAL y una de Rosario, y revisar la pieza de Lotes antes de volver a darle plata. Con CTR de 0,7%, el problema empieza en el aviso, no en el público.

**Lo que hay que ordenar**
- LMTM-6461 y LMTM-6702 piden reactivar campañas en video; LMTM-6717 pide recargar; LMTM-5540 pide avisar al cliente. Tiene que quedar una sola, con una persona a cargo.
- Hay 7 tareas de personas abiertas, algunas de septiembre, como el puente de WhatsApp caído (LMTM-5574 y 5577).

**Publicación**
- «MARCOS PAZ 3500» del 03/11 no salió. El aviso supone que falta la columna Horario, pero la planilla la tiene y no hay filas futuras sin hora. Esa explicación no aplica. La causa más probable: se cargó con la hora ya vencida. Reprogramarla.
- Vienen 3 piezas hasta el 13/11: 1 aprobada y 2 pendientes. Si no se aprueban antes, se pierden.
- Publicó 11 piezas en 30 días, pero Make no registra ningún envío: otra vez, hay una vía que no vemos.

**Medición**
GA4 ya mide: 626 sesiones, 0 eventos clave. Sin eso, la web no puede decir si sirve. Tiene una etiqueta de Google Ads (AW-) instalada, sin pauta de Google conectada.

**Redes:** los reels (36) rinden 4 veces más que los carruseles (8), con una mediana general de 7. La mejor fue el reel de CAPUA Funes con EDINANO (92), distinta al resto del perfil.

**Web:** PageSpeed 54, sin descripción ni H1. Va después de lo anterior.

### GALA

**Corrección importante: esta cuenta está en dólares.** Los planes anteriores decían que su CPL estaba «por debajo del promedio del rubro». Era al revés.

*Corrida de referencia hecha por Claude. Ventana: 06/10 al 04/11. Dólar oficial compra: $1.520.*

| | Gasto | Leads | CPL | En pesos |
|---|---:|---:|---:|---:|
| Meta | USD 286 | 14 | USD 20,4 | ~$31.000 |
| Google | USD 205 | 0 | sin dato | |
| Total | USD 491 | 14 | USD 35 | ~$53.000 |

El rubro está cerca de $5.000 en Meta. No es una comparación justa: GALA vende desarrollos en Uruguay, con otro valor de venta y otro público. Por eso hay que medirla contra su propia venta, no contra el promedio.

**Lo que frena todo: Google no mide nada**
La campaña «Campaing #1» se lleva USD 205, con CTR de 11% y 1.346 clics. Trae el 62% del tráfico de la web (1.099 de 1.785 sesiones), y ni Google ni GA4 registran un contacto. Cerrar LMTM-6598 no pasa por bajar el gasto a ciegas: primero hay que definir qué es un contacto en esta web e instalarlo.

**Meta**
Las de Uruguay y Argentina se reparten parecido: WP URUGUAY OCTUBRE (CPL USD 22) y WP ARGENTINA OCTUBRE (USD 27). Con 3 a 5 leads por campaña, no se puede elegir una ganadora todavía.

**Lo que está bien**
Hay 7 piezas futuras, todas aprobadas, hasta el 26/11. Es uno de los dos calendarios sanos del rubro. Detalle: esas 7 filas no tienen hora, y sin hora salen a las 04:00. Conviene cargarla antes del próximo pase del script.

**Redes**
Mediana 5, casi sin reels (1 de 11 en Instagram). Es el único reel y el mejor de la cuenta: [Gala Rock sigue avanzando](https://www.instagram.com/reel/DecByWOjYiY/) (14). Una sola pieza no prueba nada, pero justifica probar con obra en movimiento.

**Falta una persona:** la memoria dice desde el 08/10 que no está cargado quién decide del lado del cliente. Sin eso no se puede avanzar con los pedidos abiertos (LMTM-5780, 5720, 5998).

**Web:** PageSpeed 85, la mejor del rubro. Tiene 184 palabras y no tiene H1: es el arreglo más simple que queda.

### BRISANOVA

**Una pregunta antes que cualquier plan de medios: ¿la pauta se frenó a propósito?**

*Corrida de referencia hecha por Claude.*

**Lo firme**
- Último gasto en Meta: 03/10. En los 30 días previos: $441.042, 53 leads, CPL $8.322.
- Hubo una alerta de saldo el 28/09. Coincide con el corte, pero no prueba la causa.
- El calendario está sano: 5 piezas aprobadas hasta el 28/11.

**Lo que no hay que hacer**
Activar el plan de LMTM-6679 sin hablar antes con el cliente. Con un CPL de $8.322, volver a lo mismo no es una buena noticia. Ya hay un pedido de contacto abierto desde septiembre (LMTM-5148).

**Si vuelve la pauta, lo que hay que cambiar**
En LMTM-2804 y las tareas relacionadas ya se proponían cambios de público que nunca se aplicaron (LMTM-4853 y 4855 siguen bloqueadas desde el 08/09). Hay que decidir qué pasa con eso, no volver a escribirlo.

**Redes**
No publicó ningún reel en Instagram en 60 días: 18 piezas, mediana de 6, la más baja del rubro junto con GALA. Hay 8 videos en «concepto» en su lista de producción. Sacar uno o dos es la prueba más barata que tiene.

**Falta:** no tiene web cargada en LMTM-OS, así que no hay análisis ni Analytics. La planilla registrada es la de gasto de abril, no «BRISANOVA 2025», que es la que usa el script.

### PRONE INMOBILIARIA

**Sin pauta y con el calendario que termina hoy. Es una conversación con el cliente, no una tarea para agentes.**

*Corrida de referencia hecha por Claude.*

- **Pauta:** sin gasto en los últimos 60 días. Tiene 2 cuentas conectadas y la memoria hablaba de un tope estancado desde septiembre. *El radar del 19/10 le atribuía un CPL de $2.137: no hay gasto que lo respalde. No usar ese dato.*
- **Publicación:** último posteo el 26/10. La planilla tiene una sola pieza futura, la de hoy. Después no hay nada.
- **Salud:** alerta del 03/11, 25/100.

**Qué pedirle a una persona esta semana:** hablar con el cliente sobre presupuesto y calendario de noviembre. Lo demás depende de esa charla.

**Lo que ya hay para mostrarle**
| Canal | Sesiones (28 días) | Clics medidos |
|---|---:|---:|
| Búsqueda orgánica | 979 | 37 |
| Directo | 577 | 18 |
| Instagram | 449 | 37 |

Instagram trae menos visitas y los mismos clics que Google: convierte más del doble. No es poco para una cuenta sin pauta. Su único evento clave es `click`, así que falta confirmar que mida contactos.

**Redes:** la mejor pieza fue el reel de [Urquiza al 2100](https://www.instagram.com/reel/DeYpc52glqb/) (83), contra una mediana de 14,5. El plan anterior midió 95% de carruseles en su historial: probar más reels de propiedades concretas tiene respaldo propio.

**Web:** PageSpeed 58, sin sitemap ni datos estructurados y con 6 imágenes sin texto alternativo.

**Limpieza:** hay 62 competidores cargados. Son demasiados para usarlos y, en todo el rubro, solo 2 de 302 tienen Instagram medido.

### CANNES

*Corrida de referencia hecha por Claude.*

**Lo firme:** sin pauta conectada ni posteos sincronizados. Planilla sin filas con fecha y 4 tareas en ClickUp, la última con fecha de junio. Su web y al menos una campaña de octubre figuran bajo otras cuentas de la agencia.

**La acción que falta:** que una persona decida si CANNES es un cliente aparte o un proyecto dentro de otro.

**Quién:** responsable de la cuenta. Hasta entonces, no hace falta otro plan semanal.

### Cliente Inmobiliario

*Corrida de referencia hecha por Claude.*

**Lo firme:** sin web, pauta ni posteos sincronizados. Una sola fila con fecha en la planilla (05/08) y 10 tareas en «pendiente». El script corre todos los días sobre eso. Lleva 7 planes en 45 días sin ningún dato nuevo.

**La acción que falta:** que una persona confirme si es un cliente real, porque el nombre parece genérico.

**Quién:** responsable de la cuenta. Si no está activo, se saca de las rutinas.

### Distrito Roldan

*Corrida de referencia hecha por Claude.*

**Lo firme:** sin web, pauta ni posteos sincronizados. La planilla no tiene filas con fecha y no se edita desde el 01/07. El script de Redes no registra ejecuciones recientes y no encontré script de video. La memoria dice que no tiene escenario de publicación propio.

**La acción que falta:** que una persona confirme si sigue activo. Si sigue, primero hay que dejar andando publicación y script.

**Quién:** responsable de la cuenta. Hasta entonces, no hace falta otro plan semanal.

### GRUPO MA

*Corrida de referencia hecha por Claude.*

**Lo firme:** sin pauta conectada ni posteos sincronizados. Hay 400 tareas en ClickUp, 386 en «pendiente», y 3 filas con fecha en la planilla (la última, 20/07). El script de Redes no registra ejecuciones recientes. LMTM-4891 es de BOERO y está cargada acá por error.

**La acción que falta:** que una persona decida si sigue activo y si esas 400 tareas se archivan.

**Quién:** responsable de la cuenta. Hasta entonces, no hace falta otro plan semanal.

