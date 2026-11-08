# Tanda 3 — auditoría de webs en Hostinger (08/11/26)

Pedido de Naza: «hacé una corrida de ejemplo de lo que deberían hacer, con tu modelo, y que ellos tomen ejemplos». La hizo Claude con las mismas herramientas que tienen los agentes (`get_web_hosting`, `get_web_archivos`, `get_analisis_seo`, `proponer_cambio_web`). La versión sin nombres para los agentes es la skill `lmtm-ejemplos-web`.

Se eligieron 5 webs de rubros distintos: hotel, inmobiliaria, industria B2B, loteos y materiales.

## Método (lo que hace bien una corrida)

1. **`get_web_hosting`**: estado técnico (SSL, PHP, WordPress, plugins y temas con vulnerabilidades).
2. **`get_analisis_seo`**: lo que ve Google (título, descripción, H1, schema, velocidad, Search Console).
3. **Cruzar las dos.** Las cosas importantes salen de la cruza:
   - una descripción rara en el SEO llevó al spam inyectado;
   - un plugin de cache activo con la cache del servidor apagada explica la lentitud.
4. **Antes de alarmar, verificar.** En esta tanda dos «hallazgos» eran falsos (ver Campo Timbo y Santa Rosa).
5. **Separar qué se propone, qué hace una persona y qué no se toca.**
   - Proponer solo cambios de la lista cerrada que tengan actualización disponible.
   - Lo demás (premium sin licencia, limpieza, contraseñas, base de datos) va como tarea para una persona, con los pasos.

## Ferrol Apart Hotel — ferrolaparthotel.com.ar

- **Hosting:** está sano.
  - WordPress 7.1.4 al día, PHP 8.5, SSL de por vida con https forzado.
  - 25 plugins, ninguno con vulnerabilidades conocidas; 5 con actualización menor (Hostinger, LiteSpeed, Simple Custom Post Order, WP Ghost).
- **SEO:**
  - Título «Ferrol Apart Hotel |» (cortado, con la barra colgando).
  - Sin meta description, sin H1, sin schema de hotel.
  - Las 78 imágenes sin texto alternativo, sin Open Graph.
  - PageSpeed 60.
  - **Cruza:** el plugin LiteSpeed Cache está activo, pero la cache del servidor está APAGADA en Hostinger.
  - Search Console (28 días): 97 clics, 1.164 impresiones, posición media 6,5.
- **No tiene plugin de SEO** (ni Yoast ni Rank Math ni AIOSEO): por eso no hay dónde poner descripción ni schema.
- **Propuesta:** ninguna. No hay nada de seguridad que arreglar, y las actualizaciones menores no justifican una aprobación.
- **Tarea para una persona:**
  - Prender la cache en hPanel → Velocidad.
  - Instalar un plugin de SEO, completar título, descripción y H1 («Apart hotel en …» con la zona).
  - Schema `Hotel`.
  - Alt de las imágenes de habitaciones.

## Sebastián Ramasco Padilla — sramascopadilla.com.ar (en Hostinger como nuevo.sramascopadilla.com.ar)

**URGENTE: spam de apuestas inyectado.**
- En la home hay un bloque oculto (`position: absolute; left: -7566px`) dentro de un widget de texto de Elementor.
- Dice «Las tragamonedas ofrecen grandes emociones y, con 1xbet bolivia…» con un link dofollow a `xbet-bolivia.com`.
- All in One SEO arma la meta description con el texto de la página, así que la descripción que ve Google termina en «Las tragamonedas ofrecen grandes».
- La página figura modificada el 05/11/26 19:31. Ya estaba anotado como abierto el 05/11.

**Por qué entraron:** WordPress 6.4.14 con 53 vulnerabilidades del núcleo, varias sin login (SQL injection, RCE por condición de carrera). Plugins con fallas graves:

| Plugin | Falla grave |
|---|---|
| WP All Export Pro 1.8.1 | RCE sin login |
| Slider Revolution 6.5.12 | subida de archivos y RCE |
| Elementor 3.14.1 | subida de archivos |
| Redux | subida sin login, escalada de privilegios |
| Houzez (tema y plugins) | SQL injection, escalada de privilegios |
| Loco Translate | CSRF a RCE |
| WP Crontrol | RCE |
| All-in-One WP Migration | SQL injection sin login a RCE |

- **Propuesto** (`proponer_cambio_web`, aprobación pendiente): actualizar los que tienen actualización disponible.
  - Plugins: wpforms-lite, all-in-one-seo-pack, redux-framework, litespeed-cache, mailchimp-for-wp, all-in-one-wp-migration, members, one-click-demo-import, insert-headers-and-footers.
  - Hostinger los marca con actualización.
- **NO se propone por API, va a una persona:**
  1. Sacar el bloque del widget de Elementor de la home y buscar el mismo texto en otras páginas (Elementor → buscar «tragamonedas», «1xbet»).
  2. Revisar los usuarios administradores y cambiar todas las contraseñas.
  3. Actualizar a mano los premium sin actualización por API (Elementor, Slider Revolution, WP All Export Pro, Houzez y sus plugins): necesitan licencia o descarga.
  4. Después, WordPress a la 7.1 con respaldo previo: el salto es grande y con un tema premium viejo puede romper.
  5. Pedir la reindexación de la home en Search Console.
- **SEO** (después de limpiar): PageSpeed 40, sin H1, 17 de 24 imágenes sin alt, descripción de 655 caracteres armada sola.

## PKT Global — pktglobal.com

- **Hosting:**
  - WordPress 6.7.11 con 49 vulnerabilidades del núcleo (las graves se arreglan en 7.0.2 y 7.1.4).
  - Plugins casi todos al día y sin vulnerabilidades (solo Yoast Duplicate Post viejo).
  - Tema The7 con actualización. PHP 8.2. Cache del servidor apagada.
- **SEO:** sin meta description, 2 H1 iguales («GRANDES PROYECTOS»), sin schema, 31 de 34 imágenes sin alt, LCP 5 s.
- **Propuesto:** `actualizar_wordpress` con `soloMenor: true`.
  - Lo menor es lo seguro de pedir.
  - Las graves se arreglan recién en la 7.x: anotarlo en la justificación para que una persona decida el salto mayor con respaldo.
- **Tarea para una persona:** H1 único con el producto («Amoblamientos para oficinas y proyectos…»), descripción, schema `Organization`, alt de las fotos de proyectos.

## Campo Timbo — campotimbo.com

- **Hosting:** lo más viejo de la tanda.
  - **PHP 7.0** (sin soporte desde 2019), WordPress 6.5.14 con 49 vulnerabilidades.
  - Tema Betheme 20.9.6 con RCE (se arregla en 28.5.8).
  - WPBakery 5.4.2, Slider Revolution 5.4.6, Contact Form 7 5.0.3 con escalada de privilegios.
- **Falsa alarma verificada:**
  - Hay 5 temas con nombres raros y fechas (`top_1747903366`, `custom-file-1-1748029274`…), creados en mayo 2025 e inactivos. Parece un patrón de malware.
  - **Se revisó:** el `functions.php` de cada uno es idéntico byte a byte al tema original (PopularFX o Hello Elementor), sin `eval`, `base64_decode` ni líneas ofuscadas.
  - Son copias sobrantes, no un hackeo. Igual conviene borrarlas (una persona: la API no borra).
- **Sin «Sitio web» en su Marca:** el SEO no corre hasta cargarlo. Se agregó el mapeo de la web, pero la Marca sigue vacía.
- **Propuesto:** solo actualizar los plugins que tienen actualización (all-in-one-wp-migration, js_composer, ultimate-social-media-icons, LayerSlider).
  - **NO PHP:** pasar de 7.0 a 8.x con un tema de 2018 casi seguro rompe la web. Primero tema y plugins, después PHP, con respaldo y probando.
- **Tarea para una persona:**
  - Cargar la web en la Marca.
  - Renovar Betheme (licencia).
  - Plan de actualización por etapas.

## Santa Rosa — santarosaarenas.com.ar

- **Hosting:** WordPress **5.3.27** (de 2019) con 106 vulnerabilidades del núcleo. PHP 7.2.
  - Plugins viejos: WPForms 1.6.6, WPBakery 6.5, Really Simple SSL 4.0, All-in-One WP Migration 7.90 (SQL injection sin login).
- **Falsa alarma verificada:** 7 plugins inactivos con nombres aleatorios (`6ac07c03ebaec-Pqm76N`…). El campo `nombre` de la auditoría dice «Hostinger Smart Auto Updates»: copias del plugin de Hostinger, no malware. **Mirar el nombre antes de alarmar.**
- **SEO:**
  - LCP de 18 s en celular (PageSpeed 41). Sin sitemap, sin descripción, sin schema.
  - 5 H1, idioma declarado `en-US` en una web en castellano.
  - Subdominio pedidos.santarosaarenas.com.ar aparte.
- **Propuesto:**
  - `actualizar_wordpress` soloMenor (5.3.x al último parche).
  - Actualizar los plugins con actualización disponible (Ultimate_VC_Addons, ecwid-shopping-cart, gotmls, all-in-one-wp-migration, LayerSlider, wordfence).
- **Tarea para una persona:**
  - El salto a WordPress 6/7 y PHP 8, por etapas y con respaldo.
  - Prender la cache, sitemap (lo da un plugin de SEO), idioma `es-AR`, un solo H1.

## Lo que la corrida cambió en el sistema

- **Vulnerabilidades resumidas.** Un WordPress viejo traía más de 100 vulnerabilidades y la respuesta se cortaba antes de los plugins. Ahora va el total, las graves con nombre (sin login, RCE, SQL, subida de archivos, escalada) y la versión que las arregla todas.
- **Listar carpetas.** Usaba el parámetro equivocado y devolvía la raíz entera sin avisar. Arreglado (`directory`).
