---
name: lmtm-ejemplos-pauta
displayName: Ejemplos de pauta
description: "Cómo razona una revisión de pauta bien hecha, con un caso real anónimo. Cargala antes de proponer pausas o cambios de presupuesto. Enseña a decidir, no un formato para copiar."
required: false
---

# Cómo se revisa una cuenta de pauta

**No copies la forma ni los números de este ejemplo.** Es una cuenta real, sin nombres. Tu cuenta tiene otros problemas y puede pedir otro formato. Lo que se copia es el orden del razonamiento.

## Antes de proponer

1. Leé `propuestas30d` de cada campaña en `lmtmGetClientCampaigns`. Si ya hay una pendiente, no sumes otra.
2. Si una pausa dice `approved` y la campaña volvió a gastar, alguien o algo la prendió. Otra propuesta no resuelve eso: preguntá quién y por qué.
3. Antes de confiar en una regla, buscá qué la haría fallar:
   - ¿El CPL mide de verdad lo que busca el aviso?
   - ¿Un solo lead más cambia el veredicto?
   - ¿Hay dos campañas compitiendo por lo mismo?
4. Mirá también lo que no se mide por CPL: fechas de fin, promos vencidas y campañas prendidas sin gasto.

## Ejemplo: tres cuentas, 14 días

El formato fue una lista de decisiones, porque quien lee tiene que aprobar o rechazar.

| Decisión | Caso | Razonamiento |
|---|---|---|
| Preguntar, no proponer | Campaña pausada tres veces, volvió a gastar | Ya tenía dos pausas pendientes. El problema es quién la prende, no el número |
| Verificar antes de juzgar | Conjunto llamado «...CALL», CPL 4,3 veces el objetivo | Solo 5,5% de los clics terminó en lead, contra 19 a 23% en las demás. Si el aviso busca llamadas, el CPL no lo mide |
| Proponer +20% | CPL 0,6 veces el objetivo, con 299 leads, y ya gasta todo su presupuesto | Tiene volumen y está topada. Se aclara que termina en 5 días |
| Rechazar una pendiente | +20% con CPL justo en el objetivo y 6 días | No hay margen para escalar |
| Preguntar hoy | Campañas de una promo que siguen dos días después del evento | Es un problema de calendario, no de CPL |
| Proponer pausa | Dos campañas con el mismo nombre: una con CPL 3 veces el de la otra | Compiten entre sí. Confirmar que sea la misma propiedad |
| No proponer | Tres campañas pasan el límite por muy poco | Con un lead más, todas quedan abajo: es ruido. Se mira en una semana |
| Apagar | Activa, sin fin, con presupuesto alto y gasto $0 | El playbook diría «esperar», pero apagarla no cuesta nada y evita un gasto sin aviso |
| Avisar, sin tocar | Google con «leads» en 63% de los clics | Es un error de conversiones, no un buen resultado |
| Corregir la memoria | Una nota decía que la plata «se reasignó» | Los presupuestos seguían iguales. Lo propuesto no es lo hecho |

## Qué mirar al terminar

- ¿Cada propuesta cita gasto, leads, CPL y objetivo de esa entidad?
- ¿Dijiste lo que dejaste correr y por qué?
- Si no hay nada que proponer, decilo. También es una respuesta.
