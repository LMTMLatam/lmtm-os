---
name: lmtm-ejemplos-nicho
displayName: Ejemplo de un rubro entero
description: "Cómo se revisa un rubro completo: qué verificar antes de creer un número, cómo comparar clientes y cuándo alcanzan tres líneas. Cargala antes de un plan de acción, un radar de nicho o una revisión por rubro. Enseña a pensar, no un formato."
required: false
---

# Cómo se trabaja un rubro entero

Salió de revisar a mano 13 clientes de un mismo rubro. **No copies la forma ni los números.** Lo que sirve es qué se verificó y por qué.

## Por cada cliente, en este orden

1. **¿Está activo?** Sin pauta, posteos ni web, el plan son tres líneas: lo firme, la acción que falta y quién la hace. En ese rubro había 4 clientes con planes semanales de hasta 15.000 caracteres y ningún dato.
2. **¿El número mide lo que dice?** Ver la tabla de abajo. Es lo que más cambió las conclusiones.
3. **¿Qué decisión cambia esta semana?** Va primero, aunque no sea tu área.
4. **¿Ya está pedido?** Mirá tareas y propuestas abiertas antes de sumar otra.

## Antes de creer un número

| Si ves esto | Comprobá | Caso real |
|---|---|---|
| Muchas conversiones de Google | Los eventos clave de GA4 en `lmtmRendimientoWeb` | 54% de los clics «convertían». Los eventos clave eran `first_visit` y tiempo en página; los contactos reales eran 56 |
| Muchos eventos clave | Si `page_view` o `session_start` cuentan como clave, no son contactos | 79.000 «conversiones» con 19.000 sesiones |
| CPL bajísimo | El campo `moneda` | USD 20 se leyó como $20 y el plan dijo «por debajo del promedio». Eran unos $31.000 |
| Tráfico que cae | El gasto del mismo período | -78% de sesiones con -78% de gasto en Google. No era un problema de SEO |
| «Es la única fuente» | Las fuentes de GA4 | 3.305 sesiones de `google / cpc` sin cuenta de Google conectada: alguien pauta y no lo vemos |
| «Sin calendario» | Los posteos reales | Planilla vacía y 20 piezas en 30 días: publica por otra vía. No es lo mismo que no publicar |
| Muchas publicaciones | Contá Instagram o textos distintos | Una pieza en Instagram y Facebook cuenta dos veces: 61 publicaciones eran 20 textos |
| Script en `COMPLETED` | Filas futuras en su planilla y tareas en ClickUp | Corre todos los días sobre una planilla vacía |
| Una planilla de `sheetsSpreadsheetId` | Que sea la del script | En 7 de 13 clientes era otra, como una de gasto |
| Una alarma de una herramienta | Volver a verificar por otra vía | El lector dijo error 500 y `noindex`. Desde un navegador la web andaba bien |
| CPL de una campaña de seguidores | Su objetivo | No se juzga por CPL: busca otra cosa |
| CPL de una campaña sin mirar el detalle | Cuántos días y cuántos leads | CPL $524 en 2 días y 6 leads: es una pista, no un ganador |

**Leé lo que devuelven las herramientas, no solo el puntaje.** Una descripción de la home hablaba de tragamonedas: la web estaba hackeada. Ningún indicador lo avisaba.

## Cómo comparar clientes

- **Separá lo que no es comparable:** moneda, objetivo, Google y Meta, valor de lo que venden.
- **Usá la mediana** para redes. Un reel con 2.134 de interacción infló el promedio de su cuenta a 180; la mediana era 41.
- **Decí de dónde sale cada conclusión.** «Las campañas mix cuestan 4 veces más» salió de un solo cliente: no es una regla del rubro.
- **Decí lo que no apareció.** Se esperaba que las campañas de interacción rindieran peor que las de leads, y dieron parecido ($4.491 y $4.843).
- **Mirá adónde va el esfuerzo.** Un cliente concentró 73% de las corridas y sigue sin publicar. Otro, con el mismo gasto, tuvo 2.
- **Un CPL no es una venta.** Si el rubro no mide ventas, decilo y no declares ganadores.

## Lo que más frenaba

No faltaban ideas. Frenaban decisiones de personas:
- Pausas sin decidir: mientras esperaban 12 días, cuatro campañas gastaron $151.077 y trajeron 8 leads.
- Piezas sin aprobar: el despachador las descarta al llegar la fecha.
- Pedidos repetidos: 5 tareas pedían habilitar la misma API.

Si lo que falta es una decisión humana, pedila una sola vez, con el costo de no decidir y una persona a cargo. Otra tarea no la acerca.

## Tres formatos distintos

- **Memo de una decisión:** cuando todo depende de una respuesta. «¿La pauta se frenó a propósito?»
- **Tabla de decisiones:** cuando alguien tiene que aprobar o rechazar.
- **Tres líneas:** cuando no hay datos. Si tu plan se parece al de la semana pasada, es porque no decidió nada.

## Antes de entregar

- ¿Cada número dice de qué ventana y moneda es?
- ¿Dijiste qué no pudiste verificar?
- Si afirmás algo de otro cliente, ¿lo miraste vos o lo copiaste de un informe? Un radar de este rubro atribuía CPL a un cliente sin pauta.
