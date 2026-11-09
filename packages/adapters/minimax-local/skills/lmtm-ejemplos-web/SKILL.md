---
name: lmtm-ejemplos-web
displayName: Ejemplos de auditoría web
description: "Cómo auditar la web de un cliente desde Hostinger y Google, qué proponer y qué dejarle a una persona, con 5 casos reales anónimos. Cargala antes de usar get_web_hosting o proponer_cambio_web. No es una plantilla."
required: false
---

# Cómo se audita una web

**No copies la forma de estos casos.** Cada web tiene su problema principal. Si dos informes tuyos se parecen, uno de los dos no miró la web.

## El método

Herramientas (MCP): `lmtmWebHosting` = `get_web_hosting` (con `ruta` o `leer: true` = `get_web_archivos`), `lmtmWebContenido` = `get_web_contenido`, `lmtmCambioWeb` = `proponer_cambio_web`. No llames a la API a mano.

1. **`get_web_hosting`:** SSL, PHP, WordPress, plugins y temas con vulnerabilidades (total, graves con nombre y la versión que las arregla).
2. **`get_analisis_seo`:** lo que ve Google.
3. **Cruzar las dos.** Lo importante sale de la cruza, no de cada lista por separado.
4. **Verificar antes de alarmar.** Algo raro (nombres aleatorios, temas con fechas) se revisa con `get_web_archivos` y el campo `nombre` antes de escribir «hackeo».
5. **Separar en tres:**
   - Lo que se propone con `proponer_cambio_web`: solo acciones de la lista con actualización disponible.
   - Lo que hace una persona: pasos concretos.
   - Lo que no conviene tocar todavía, y por qué.

## Reglas que salieron de la corrida

- **Una actualización disponible no es motivo suficiente.** Proponé cuando hay una vulnerabilidad grave que la actualización arregla. Las menores sin vulnerabilidades no justifican una aprobación.
- **WordPress del núcleo: `soloMenor: true`.** Si las vulnerabilidades graves recién se arreglan en una versión mayor, decilo en la justificación. El salto mayor lo decide una persona con respaldo.
- **PHP viejo (7.x) no se sube primero.** Con un tema o un page builder viejos, subir PHP rompe la web. El orden es tema y plugins, después PHP.
- **Plugins premium** (Elementor Pro, Slider Revolution, WP All Export Pro, temas comprados): si no figuran con actualización, la API no los puede actualizar. Van como tarea para una persona (licencia).
- **Contenido, con aprobación (desde el 08/11):** `get_web_contenido` entra al WordPress con una sesión temporal y dice DÓNDE está un texto (página + widget de Elementor, o ítem de menú) y quiénes son los administradores. Con eso `proponer_cambio_web` arma `quitar_spam` (postId o menuItemId), `reemplazar_texto` (postId, buscar, reemplazar) o `bajar_administrador` (userId). Nada se ejecuta sin que una persona lo apruebe. Contraseñas y base de datos siguen siendo de una persona.
- **La justificación** dice qué vulnerabilidad se arregla, cuál es su gravedad y qué riesgo tiene el cambio. Es lo que lee quien aprueba.

## Casos (anónimos)

### 1. Hotel — sano en el hosting, flojo en Google
- **Hosting:** WordPress al día, ningún plugin vulnerable.
- **SEO:** título cortado («Nombre |»), sin descripción, sin H1, ninguna imagen con texto alternativo, PageSpeed 60.
- **Cruza:**
  - Tiene LiteSpeed Cache activo, pero la cache del servidor está apagada.
  - No tiene plugin de SEO: por eso no hay dónde cargar la descripción.
- **Propuesta: ninguna.** Bien hecho: no inventar una aprobación para tener algo que mostrar.
- **Para una persona:** prender la cache, plugin de SEO, H1 con la zona, schema de hotel.

### 2. Inmobiliaria — spam inyectado (lo más grave de la tanda)
- **Cómo se encontró:** la meta description que armaba el plugin de SEO terminaba en «Las tragamonedas ofrecen grandes…».
- **Qué había:** en el HTML, un bloque oculto (`left: -7566px`) dentro de un widget de Elementor, con link dofollow a un casino.
- **Por qué entraron:** WordPress 6.4 con fallas sin login, y plugins con ejecución remota de código o subida de archivos.
- **Propuesto:** actualizar los 9 plugins vulnerables con actualización, y la limpieza: `quitar_spam` del widget de la home, `quitar_spam` del ítem de menú falso y `bajar_administrador` de un admin creado hace poco con un Gmail y el dominio como usuario (los otros eran de hace años).
- **Para una persona:**
  - Sacar el bloque y buscar el texto en las demás páginas.
  - Revisar los administradores y cambiar las contraseñas.
  - Actualizar a mano los premium.
  - WordPress mayor con respaldo; reindexar.
- **Lo que la revisión a mano no vio:** el campo `spam` de `get_web_hosting` encontró una segunda inyección (casino en árabe). Mirá siempre ese campo; vacío = sin enlaces ocultos en la home, no «web limpia».
- **Cómo se reporta:** primero el hallazgo y la prueba (el texto y dónde está), después la causa probable. No al revés.

### 3. Industria B2B — núcleo atrasado, plugins al día
- **Hosting:** WordPress 6.7 con fallas graves que recién se arreglan en la 7.x; plugins sin vulnerabilidades.
- **Propuesto:** núcleo `soloMenor`, aclarando en la justificación que las graves necesitan el salto mayor.
- **SEO:** 2 H1 idénticos, sin descripción, 31 de 34 imágenes sin alt.

### 4. Loteos — falsa alarma descartada
- **Lo que parecía:** 5 temas inactivos con nombres como `top_1747903366`, el patrón típico de una puerta trasera.
- **Cómo se revisó:** con `get_web_archivos` se leyó el `functions.php` de cada uno. Era idéntico al tema original, sin `eval` ni `base64_decode`.
- **Conclusión:** son copias sobrantes. Se informa como «para borrar», no como hackeo.
- **Además:** PHP 7.0 y tema de 2018 con ejecución remota. Se propusieron solo los plugins con actualización. PHP NO, por el orden.

### 5. Materiales — WordPress de 2019
- **Hosting:** WordPress 5.3 con 106 vulnerabilidades, PHP 7.2.
- **Falsa alarma:** 7 plugins con nombres aleatorios. El `nombre` decía «Hostinger Smart Auto Updates». No es malware.
- **SEO:** el contenido principal tarda 18 s en celular, sin sitemap, idioma declarado `en-US`, 5 H1.
- **Propuesto:** núcleo menor + 6 plugins vulnerables con actualización.
- **Para una persona:** plan por etapas hacia WordPress y PHP actuales, con respaldo.
