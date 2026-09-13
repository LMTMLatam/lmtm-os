---
name: lmtm-auditoria-perfil
description: Auditoría profunda del perfil de redes de un cliente — creatividad, estructura del perfil, destacadas, tendencias del nicho y matriz de planificación. Usala cuando un issue o rutina pida auditar el perfil/contenido de un cliente más allá de "¿salió el post?".
---

# Auditoría de perfil y creatividad

Auditás el perfil de redes de un cliente en 5 dimensiones. El objetivo NO es reportar atrasos (eso lo hace el monitor) sino detectar oportunidades de nivel superior: fatiga creativa, perfil mal estructurado, destacadas viejas, tendencias desaprovechadas y huecos en la matriz de contenido.

## Herramientas base
1. `lmtmGetClientContentMatrix` — la matriz profunda en una llamada: mix real de formatos, posts/semana, señal de repetición de copys, matriz planificada formato×objetivo (con huecos), tendencias del nicho.
2. `lmtmGetNicheIntel` — benchmarks y plan de acción del rubro.
3. `lmtmGetClientBrain` — contexto y aprendizajes previos (leelo SIEMPRE primero).
4. Navegación del perfil público (WebFetch/browser) — para lo que la API no ve: bio, link, destacadas, grilla.

## Las 5 dimensiones

### 1. Falta de creatividad
`creatividad` en la matriz: si hay `aperturasRepetidas` (mismos arranques de copy ≥3 veces) o `concentracionFormatoTop` ≥70%, hay fatiga. Proponé: 3 ángulos nuevos CONCRETOS para el rubro (usá el Baúl de Ganchos con `lmtmSearchHooks` y las tendencias del nicho), y qué formato sumar (si todo es placa, proponer reel/carrusel con guion).

### 2. Estructura del perfil
Entrá al perfil público de IG/FB del cliente (handle en el brain; si falta, WebSearch). Chequeá: bio (¿dice qué hace, para quién y con qué CTA?), link (¿funciona?, ¿landing correcta?), nombre buscable (¿incluye el rubro/ciudad?), grilla (¿los primeros 9 posts comunican la oferta?). Reportá lo que falta con la corrección propuesta (texto de bio sugerido incluido).

### 3. Destacadas y demás desactualizado
En el perfil de IG mirá las historias destacadas: ¿existen?, ¿cubren lo esencial del rubro (ej. inmobiliaria: propiedades activas / vendidos / testimonios / contacto)?, ¿hay portadas consistentes?, ¿alguna referencia claramente vieja (precios, promos vencidas, propiedades ya vendidas)? Lo mismo para info de contacto/horarios en FB. Listá cada destacada a crear/actualizar.

### 4. Tendencias del nicho
`tendenciasNicho` de la matriz + `lmtmGetNicheIntel`. Cruzá: ¿alguna tendencia reciente del rubro que el calendario NO está aprovechando? Proponé la pieza concreta (formato + gancho + fecha sugerida).

### 5. Matriz profunda
`planificacion.matrizFormatoObjetivo`: ¿está balanceada o todo cae en una celda? ¿`sinFormato`/`sinObjetivo` altos? (piezas sin clasificar = el equipo no puede balancear). ¿La distribución matchea el formato ganador del nicho (`lmtmGetNicheIntel`)? Señalá las celdas vacías que importan (ej. "0 piezas educativas en video en 60 días").

## Entrega
- Guardá el informe con `lmtmSaveDeliverable` (tipo auditoría, por cliente).
- Cada acción concreta que requiera al equipo → `lmtmCreateClientTask` (una por acción, accionable: "Actualizar destacada X con Y", no "mejorar perfil").
- Aprendizajes durables del cliente → `lmtmRememberAboutClient`.
- NO WhatsApp salvo que la rutina lo pida.

## Reglas
- Trabajá por TANDAS (3 clientes por corrida, los menos auditados primero — guardá en memoria cuáles hiciste). NUNCA los ~67 en una corrida.
- Atrasos de publicación: SOLO el campo `overdue`/`atrasosReales` (fecha de inicio vencida y sin etiqueta = el webhook nunca disparó). No inventes criterios. OJO con el converso: sin atrasos NO significa que esté publicando — la etiqueta no prueba publicación. Si el punto es si el cliente publica, `lmtmGetCadenaPublicacion`.
- Si el perfil público no carga, reportá "sin verificar" esa dimensión — no bloquees la auditoría entera.
