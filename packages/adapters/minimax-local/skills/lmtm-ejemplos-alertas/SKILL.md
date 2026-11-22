---
name: lmtm-ejemplos-alertas
displayName: Ejemplos de alertas de saldo y de publicación
description: "Cómo se hace la revisión diaria de cartera (saldo de cuentas) y la de posts que no van a salir en pocos pasos y sin avisos falsos, con las corridas reales del 22/11/2026. Cargala antes de correr las alertas de cartera o el detector de publicación."
required: false
---

# Alertas diarias: saldo y publicación

Las dos rutinas tienen el mismo riesgo: recorrer los 58 clientes uno por uno, quedarse sin turnos y no avisar nada. Pasó dos días seguidos. El orden de abajo entra en una corrida.

## Regla que vale para las dos
- **El aviso va por WhatsApp** (`lmtmSendBalanceAlert` o `lmtmSendWhatsappReport`). No se crean tareas para alertas: el 20/11 una corrida creó 9 tareas, se cortó y no mandó ningún aviso.
- **Un mensaje, no veinte.** Sale agrupado en el resumen del equipo.
- **Si no pudiste verificar, decí «hoy no se pudo verificar».** Nunca «todo bien».

## Saldo: quién gasta primero, después el saldo
1. Empezá por los que gastan: `lmtmPortfolioSnapshot` y `lmtmGetClientAdsPerformance` de 7 días. Fueron 17 clientes en Meta y 9 en Google, no 58.
2. `lmtmGetClientBalance` solo de esos.
3. Por cada cuenta: **días restantes = restante ÷ (gasto de 7 días ÷ 7)**. Las cuentas de Google también: aparecen en el mismo listado sin el prefijo `act_`.

### El porcentaje solo no decide
| Cuenta | % del tope | Días que quedan | ¿Se avisa? |
|---|---|---|---|
| Tope agotado, sin gasto hace 6 días, campañas prendidas | 100 % | 0 | Sí, primero |
| Google con saldo para un día | 99,8 % | 1 | Sí |
| Meta propia | 88 % | 6 | Sí |
| Meta de un cliente | 98,8 % | 8 | Sí |
| Meta con tope acumulado muy alto | 96 % | 35 | **No** |
| Google | 95,6 % | 52 | **No** |
| Meta | 73 % | 13 | No hoy; se mira la semana próxima |

En un tope que se fue subiendo durante años, el 96 % no dice nada. Lo que decide son los días.

### No se avisa
- Cuentas con restante $0 o en estado de deuda **sin gasto en 30 días**: no hay nada que hacer hoy.
- Una cuenta que gasta mucho más que la semana anterior no es una alerta de saldo. Mirá el objetivo de la campaña: si es de tráfico, no se juzga por leads.
- Un costo por lead alto que está igual que la semana pasada es crónico: va al plan del cliente, no a la alerta del día.

### Qué lleva el mensaje
Cliente, plataforma, cuenta, tope, gastado, restante, porcentaje, gasto diario y hasta qué fecha alcanza. Y una línea de contexto si cambia la urgencia: «venía mejorando: conviene no dejarla frenar».

## Publicación: ordenar por fecha, no por cliente
1. `lmtmGetCadenaPublicacion` una vez. Da el primer eslabón roto de cada cliente.
2. **Ordená por fecha de pérdida.** Primero lo que se pierde en 48 horas.
3. Para lo más cercano, abrí el calendario (`lmtmGetClientScheduledContent`) y poné el nombre de la pieza y la hora: quien lee tiene que poder actuar sin buscar.
4. **Cruzá los «sin calendario» con los posts reales.** De 18, tres habían publicado 10, 10 y 4 posts esa semana: publican por otra vía. Decilo, para que nadie salga a arreglarlos.
5. Si un cliente figura sin posts, puede ser que no estemos leyendo su red. Lo único medido es que no tiene nada con fecha. No escribas «no publicó».

### Las cuatro partes del mensaje
1. **Se pierden si no se completan antes** — por fecha, con qué le falta a cada uno.
2. **Ya no salieron** — con la causa (celda de horario vacía, disparo vacío, escenario apagado).
3. **Para prevenir** — conexiones que no verifican y a cuántos escenarios afectan.
4. **No es falla** — lo que parece roto y no lo está.

### Cuidado con las instrucciones
No escribas «encender el escenario» porque la herramienta lo sugiere. Puede haber una tarea abierta que diga que no se enciende (destinos de otro cliente) o una cola con posts viejos que saldrían todos juntos. Buscá la tarea del tema antes de recomendar.

No se tocan fechas ni horarios: los decide una persona.
