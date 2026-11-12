---
name: lmtm-ejemplos-google-ads
displayName: Ejemplos de Google Ads (keywords)
description: "Cómo se decide sobre keywords de Google Ads: en qué orden mirar, con qué umbrales y tres casos reales anónimos. Cargala antes de proponer negativas, pausar o sumar keywords. Es un criterio, no una plantilla."
required: false
---

# Cómo se optimiza una cuenta de Google Ads

**Esto es un criterio, no una plantilla.** No copies el formato, los números ni las decisiones de los ejemplos: tu cuenta tiene otro problema. Lo que se copia es el orden y las preguntas.

**La auditoría da candidatos, no decisiones.** En los tres ejemplos devolvió una lista de acciones y en ninguno lo correcto era aplicarla tal cual.

## Orden de trabajo

| Paso | Herramienta | Qué buscás |
|---|---|---|
| 1 | `lmtmGetClientCampaigns` (`sinceDays: 30`) | Campañas, gasto, clics, conversiones, destino y `propuestas30d`. Si ya hay una pendiente, no sumes otra |
| 2 | La misma, con `sinceDays: 90` | Conversiones ÷ clics en las dos ventanas. Si cambia mucho, cambió la medición |
| 3 | `lmtmGetClientBrain` y `lmtmRendimientoWeb` | Qué vende el cliente y si Analytics ve el tráfico pago y algún evento clave |
| 4 | `lmtmAuditoriaKeywordsGoogle` con `dias: 30` y con `dias: 90` | Candidatos: `negativas`, `nuevas`, `pausar`. Es la única fuente de textos e ids |
| 5 | Leer cada término | Ver las reglas de abajo |
| 6 | La herramienta de escritura con `ensayo: true` | Que Google valide el lote sin guardar nada |
| 7 | La misma con `justificacion` (sin `ensayo`) | Deja la decisión para que la apruebe una persona. Una sola vez por acción |

Nunca mandes `approved`. Si te quedan pocos turnos, hacé los pasos 1, 4 y 5 y entregá lo que hay.

## Reglas de decisión

**Antes de mirar keywords: ¿las conversiones sirven?**

| Señal | Qué significa | Qué hacés |
|---|---|---|
| 0 conversiones en toda la cuenta | No se mide | No propongas por «no convierte». Solo vale pausar lo que no describe un producto |
| Más del 30% de los clics convierte (`conversionesDudosas: true`) | Cuenta visitas, no consultas | No propongas nada. Avisá |
| Entre 15 y 30% | Sospechoso | Preguntá qué cuenta como conversión antes de sumar keywords |
| 30 y 90 días proponen cosas opuestas | Cambió la medición en el medio | No uses nada anterior al cambio |
| `gastoMarcaSinConversion` de 20% o más del gasto | La marca convierte por teléfono o en el local | Decilo. No toques la marca |
| Menos de 14 días con gasto | Todavía se acomoda | No toques. Decí cuándo se vuelve a mirar |

**Negativas** (`lmtmAddNegativeKeywords`): solo términos de `negativas`. Leelos: si describe algo que el cliente vende, no va. Si la lista viene vacía no quiere decir que no haya desperdicio: el piso es $3.000 y 8 clics por término.

**Pausar** (`lmtmPauseKeywordsGoogle`): solo textos de `pausar`. Separalos en tres grupos: no describe un producto (pausar), describe lo que vende (no pausar: el problema es la concordancia o el destino), no sabés si lo vende (preguntar).

**Sumar** (`lmtmAddKeywordsGoogle`): solo de `nuevas`, con su `adGroupId`. Tiene que cumplir todo:
- 3 o más conversiones en 90 días. Una sola es una anécdota.
- Costo por conversión menor al de su campaña.
- Describe lo que el cliente vende y es del tema de esa campaña.
- No es el nombre de otra empresa, ni de otro cliente de la agencia, ni la marca propia.

**Marca:** el servidor frena el nombre del cliente, pero no la marca mal escrita. Y a veces frena de más: si el nombre del cliente tiene una palabra común, toma como marca cualquier término que la contenga. Leé vos.

**Cobertura:** sumá el costo de lo que la auditoría muestra y comparalo con el gasto de las campañas de búsqueda. Si explica la mitad, decilo.

**Lo que no tiene herramienta** va como pedido a una persona, con el paso exacto: cambiar concordancia, puja, presupuesto, URL final, qué cuenta como conversión.

## Tres ejemplos distintos

### A. Industria: keywords caras, cero conversiones

- La auditoría de 30 días propuso pausar 10 keywords: la mitad del gasto de la única campaña.
- Historial: durante meses convirtió el 80% de los clics; de una semana a la otra pasó a cero, y el clic cuesta 2,4 veces más desde entonces.
- Con 90 días, la misma auditoría propuso sumar búsquedas en inglés «que convierten» y pausar la marca mal escrita.
- **Decisión:** pausar 2 de las 10, las que nombran al sector y no a un producto. Otras 4 describen lo que vende: se quedan. De 4 no se sabe si las vende: se pregunta.
- **A una persona:** arreglar la etiqueta, con la fecha del corte para buscar en el historial de cambios.
- **Medir:** a 7 días, que ya no figuren en `pausar`. A 14, el CPC de la campaña. Se dijo que la mejora esperada es chica.

### B. Inmobiliaria: «sumar 12 keywords que ya convierten»

- De las 12: 6 eran nombres de otras empresas (una, cliente de la agencia), 1 la marca propia, 4 genéricas fuera del tema de la campaña y 1 del tema, con una sola conversión.
- **Decisión:** sumar 1, que en 90 días tenía 4 conversiones a un tercio del costo de su campaña. Pausar 1 que buscaba portales. Las otras 11, no.
- No se negativizaron los competidores: convertían, y sin el CRM no se sabe si eran consultas buenas.
- **A una persona:** decidir con el cliente si se compran nombres de competidores. La campaña tenía un tema en el nombre y casi ningún término de ese tema.
- **Medir:** clics y conversiones semanales de la campaña contra las 4 semanas anteriores. Si la keyword nueva gasta dos veces su costo por conversión sin ninguna, se propone pausarla.

### C. Hotelería: 7 días de datos

- La auditoría propuso sumar 12 keywords. Una figuraba con 2 conversiones por $17.
- La campaña entregaba hacía 7 días, el clic había bajado diez veces en ese lapso y el «objetivo» era el costo de esos mismos días por 0,8.
- **Decisión:** nada. Tres líneas y una pregunta: quién la prendió, a dónde manda y qué cuenta como conversión.
- Search Console mostraba páginas con títulos de casinos. Se abrieron antes de avisar: daban 404. No se alarmó a nadie.
- **Medir:** volver a mirar cuando cumpla 14 días.

## Antes de entregar

- ¿Cada término propuesto lo leíste, o lo copiaste de la lista?
- ¿Dijiste qué no tocaste y por qué?
- ¿Dijiste cuánta plata mueve cada acción, aunque sea poca?
- ¿Dijiste cómo se mide a 7 y a 14 días?
- Si no hay nada para proponer, decilo en tres líneas. También es una respuesta.
