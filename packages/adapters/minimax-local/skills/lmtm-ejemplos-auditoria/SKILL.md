---
name: lmtm-ejemplos-auditoria
displayName: Ejemplos de auditoría integral de un cliente
description: "Cómo se audita un cliente entero (pauta, publicación, web, medición y lo pendiente) y cómo se decide qué va primero, con el criterio de la auditoría integral del 18/11/2026 y 5 casos reales anónimos. Cargala antes de escribir un plan, una auditoría o un diagnóstico de cliente. No es una plantilla."
required: false
---

# Cómo se audita un cliente

**No copies la forma.** Las 58 auditorías del 18/11 están en el panel («Auditoría integral 18/11 — <cliente>»). Son la línea de base: tu trabajo arranca diciendo qué cambió desde ahí.

## 1. Cruzar fuentes, nunca creerle a una sola
- Una herramienta que dice «limpio», «sin datos» o «publicado» describe lo que ESA herramienta mira, no la realidad. Ejemplo: `get_web_hosting` dice «sin spam» mirando solo la home; el spam estaba en Preguntas Frecuentes desde hacía 9 meses.
- Para cada afirmación fuerte, una segunda fuente: publicación → `lmtmGetCadenaPublicacion` (por efecto), no la etiqueta; web limpia → `get_web_contenido` buscar="casino"; conversión → comparar con sesiones y con el CPL de la otra plataforma.
- Si una fuente te sorprende, verificala antes de escribir. El 18/11 una web «en blanco» era una respuesta comprimida mal leída: estaba bien.

## 2. El orden de lo que va primero
1. **Seguridad**: hackeo, spam oculto, SSL por vencer, web caída. Siempre urgente, sin importar el tráfico.
2. **Lo que se pierde en silencio en 48 h**: posts sin aprobación/copy/pieza con fecha cercana (se descartan solos), saldo o tope que frena la cuenta.
3. **Lo pendiente que se pudre**: aprobaciones y decisiones abiertas hace más de 5 días. Se persigue la vieja, no se propone una nueva encima.
4. **Plata mal medida**: no se mueve presupuesto sobre conversiones rotas (eventos clave > sesiones, conversiones 20 veces más baratas que el CPL de Meta, el mismo GA4 en dos clientes).
5. **Mejoras**: SEO on-page, velocidad, medición nueva, formatos.

## 3. El semáforo
- **Rojo**: algo de 1, 2 o 3 sin resolver, o pauta con CPL disparado sin explicación, o el cliente nunca publicó.
- **Amarillo**: funciona pero hay plata o trabajo en riesgo (saldo, medición, posts por perderse).
- **Verde**: funciona; lo que queda son mejoras.
- **Gris**: sin pauta, sin calendario y sin tareas. No lleva plan: lleva una pregunta a Naza («¿sigue o se archiva?»).

## 4. Cada hallazgo, con dueño y prueba
- Quién lo hace (persona con nombre de rol, o agente) y cómo se sabe que se hizo.
- Antes de mandar algo «al webmaster del cliente», fijate si la web está en el Hostinger de la agencia: si está, lo hace LMTM con aprobación.
- La regla de Naza para pauta: optimizar sí, frenar o apagar no. Una campaña que quema plata se le baja la puja o se le mueve presupuesto; la pausa la decide una persona.

## 5. SEO, competencia y palabras clave
- **Search Console manda.** Separá búsquedas de marca (el cliente ya gana) de las genéricas (donde está la plata). Las de posición 4 a 20 con impresiones son las primeras a atacar: subir de 8 a 3 multiplica los clics.
- **Por qué no sube**, con `lmtmAnalisisSeo`: el título no tiene la búsqueda, no hay H1, la página tiene poco texto, faltan datos estructurados, la velocidad real en celular es mala.
- **Competencia web:** hasta 2 competidores del cliente con web, con `lmtmAnalisisSeo(url)`: qué palabras usan en título, H1 y encabezados, cuánto texto, qué datos estructurados. Nunca contra otros clientes de la agencia. Si la ficha no tiene la web del competidor, se pide cargarla.
- **Palabras clave:** de 5 a 10, todas medidas (Search Console + lo que usa la competencia). No hay volumen de búsqueda: la medida son las impresiones; no se inventan volúmenes. La que ya trae clics orgánicos y el cliente pauta en Google, se le pasa a pauta.
- **Textos exactos** (título ≤60, descripción ≤155, H1, el bloque que falta), sacados de la ficha. Si falta un dato (dirección, teléfono, precio), se pide.
- **Se mide a los 28 días** la posición de las búsquedas elegidas.

## Casos (anónimos)

### 1. Hotel con mucho tráfico de Google y la web hackeada
- **Lo que decía el sistema:** plan semanal con «una pista rara: dos posts que no son del hotel, no es urgencia».
- **Lo que había:** 167 bloques ocultos de casino en 5 páginas (la home pesaba 605 KB, 60 % era spam) y la misma red en otras 3 webs del grupo, inyectada desde enero.
- **Decisión:** incidente del grupo, el mismo día: limpieza a mano restaurando revisiones previas, contraseñas de los 7 sitios, NO aprobar el limpiador automático (cortaba en el primer `</div>` y dejaba texto visible). Después, medición de reservas.

### 2. Inmobiliaria grande con la medición rota
- **Números:** $2,09 M en 30 días; Google con 13.877 «conversiones»; GA4 con 20.603 eventos clave en 20.361 sesiones.
- **Decisión:** no mover un peso hasta que la conversión principal sea solo la consulta (generate_lead). Lo primero no fue la pauta: fueron dos pausas aprobadas que seguían gastando.

### 3. Industria B2B que paga Google sin medir
- **Números:** $476.765 en 60 días, 2 leads; la web sin etiqueta de Google ni GA4 (Search Console 172 clics, GA4 89 sesiones: no está bien instalado).
- **Decisión:** instalar etiquetas y evento de formulario hoy; el presupuesto no se toca hasta medir. No es «Google no funciona»: es «no sabemos».

### 4. Ficha dormida que consumía planes
- **Números:** $0 de pauta y 21 planes escritos en 106 días.
- **Decisión:** gris. Una sola acción (mapear la cuenta o marcar que no tiene pauta) y salir de la tanda diaria de planes.

### 6. Hotel que gana su marca y pierde lo genérico
- **Números:** 4.606 clics en 28 días, casi todos de marca (posición 2). Genéricas: «hoteles en san bernardo» posición 8,7 con 1.047 impresiones y 1 clic; «hotel en san bernardo» 7,2; «frente al mar» 8,2.
- **Por qué:** título sin esas palabras, sin H1, sin descripción, 273 palabras en la home, PageSpeed 43 en celular.
- **Decisión:** título «Hotel Luz y Fuerza San Bernardo: All Inclusive frente al mar», descripción y H1 con lo que está en la ficha (All Inclusive, frente al mar, pileta, spa, juegos), un bloque de texto real, alt de imágenes, cache encendida; dirección y preguntas frecuentes se piden al hotel. Medir en 28 días.

### 5. Cuenta que mejora y aun así es amarilla
- **Números:** CPL de $6.674 a $5.453 en Meta, orgánico de 35 a 63 posts.
- **Por qué amarilla:** 5 posts de HOY sin aprobar, un sorteo a $100.000/día con 7 campañas vencidas y 50.549 eventos clave en 8.021 sesiones. Lo bueno no tapa lo que se pierde hoy.
