---
name: marketing-landing
displayName: Landing pages
description: Estructura y copy de landing pages que convierten: hero, prueba social, oferta, CTA y objeciones. Usala al crear o auditar una landing.
required: false
---

# Analisis CRO de Landing Page

## Proposito de la skill

Auditar cualquier landing page para optimizar su tasa de conversion (CRO). El output es un desmontaje seccion por seccion con mejoras priorizadas que impactan directamente en conversion.

## Cuando usarla

- El usuario facilita una URL y pide auditar la conversion
- El usuario quiere feedback, revision o auditoria de una landing
- El usuario quiere mejorar registros, captura de leads o ventas
- Se activa con `/marketing landing <url>` o `/marketing cro <url>`

## Como ejecutarla

### Paso 1: Identificar el tipo de pagina

El tipo de pagina condiciona benchmarks y pesos de scoring.

| Tipo de pagina     | Objetivo principal   | CR bueno | CR excelente |
| ------------------ | -------------------- | -------- | ------------ |
| Captura de leads   | Email / formulario   | 5-10%    | 15%+         |
| Registro SaaS      | Trial o freemium     | 3-7%     | 10%+         |
| E-commerce         | Al carrito / compra  | 2-4%     | 5%+          |
| Registro webinar   | Apuntarse al evento  | 20-30%   | 40%+         |
| Descarga de app    | Instalacion          | 10-15%   | 20%+         |
| Lista de espera    | Apuntarse a waitlist | 15-25%   | 35%+         |
| Reserva de llamada | Agendar call         | 5-10%    | 15%+         |
| Donacion ONG       | Realizar donacion    | 2-5%     | 8%+          |

### Paso 2: Aplicar el framework CRO de 7 puntos

Analiza cada seccion en orden. Puntua 1-10 y aporta observaciones concretas.

#### Seccion 1: Hero (Peso: 25%)

La primera pantalla que ve el visitante. Aqui arrancan el 80% de las decisiones de conversion.

**Checklist:**

- [ ] El headline es visible en menos de 2 segundos tras cargar
- [ ] El headline comunica el beneficio principal, no una feature
- [ ] El headline tiene menos de 10 palabras
- [ ] El subheadline amplia el headline con especificidad
- [ ] El CTA principal esta above the fold
- [ ] El boton del CTA contrasta con el fondo
- [ ] El texto del CTA es orientado a accion (no "Enviar" ni "Click aqui")
- [ ] La imagen o video apoya el mensaje (no es stock generico)
- [ ] Hay trust badges o social proof above the fold
- [ ] La pagina carga en menos de 3 segundos
- [ ] Sin menu de navegacion compitiendo con el CTA (en landings dedicadas)

**Criterios de scoring:**

- 9-10: Headline orientado a beneficio, especifico y potente. CTA claro y con contraste. Visual apoya el mensaje. Senales de confianza presentes.
- 7-8: Headline y CTA solidos pero falta un elemento (trust, visual o especificidad).
- 5-6: Headline generico o CTA debil. Faltan varios elementos above the fold.
- 3-4: Headline enfocado en features o vago. CTA below the fold o confuso.
- 1-2: Ni headline ni CTA claros. El visitante no entiende la oferta en 5 segundos.

#### Seccion 2: Value Proposition (Peso: 20%)

Como de claro comunica la pagina el POR QUE del visitante para convertir.

**Checklist:**

- [ ] Explica con claridad que hace el producto/servicio
- [ ] Promete resultados o outcomes concretos
- [ ] Diferencia frente a alternativas (por que ESTA solucion)
- [ ] Publico objetivo claro (el visitante sabe si es para el)
- [ ] Beneficios cuantificados cuando es posible (ahorra X horas, sube Y%)
- [ ] Value prop escaneable, no enterrada en parrafos

**Aplica el framework de las 4 U:**

1. **Util** — resuelve un problema real
2. **Urgente** — hay razon para actuar ya
3. **Unico** — se diferencia de competidores
4. **Ultra-especifico** — claims concretos, no vagos

#### Seccion 3: Social Proof (Peso: 15%)

Evidencia de que otros confian y obtienen resultados.

**Tipos (ordenados por poder de persuasion):**

1. Metricas de revenue o resultados ("2,4M EUR procesados", "500K usuarios")
2. Testimonios nominales con foto, cargo y empresa
3. Logos de clientes reconocibles
4. Casos de estudio con resultados concretos
5. Valoraciones y numero de resenas
6. Menciones en prensa ("Aparecemos en...")
7. Certificaciones y premios
8. Contenido generado por usuarios
9. Seguidores en redes sociales

**Checklist:**

- [ ] Al menos 2 tipos de social proof
- [ ] Testimonios con nombre real y foto
- [ ] Testimonios mencionan resultados concretos
- [ ] Social proof cerca de puntos de decision (junto a CTAs)
- [ ] Numeros especificos ("11.847" convierte mas que "10.000+")
- [ ] Logos reconocibles para el publico objetivo
- [ ] Social proof reciente y relevante

#### Seccion 4: Features y Beneficios (Peso: 15%)

Como presenta la pagina lo que incluye el producto/servicio.

**Checklist:**

- [ ] Las features se traducen en beneficios (que HACE la feature por el usuario)
- [ ] Contenido escaneable (iconos, bullets, parrafos cortos)
- [ ] Jerarquia visual guia el ojo
- [ ] Features mas importantes primero
- [ ] Cada bloque tiene mini-headline claro
- [ ] Capturas, demos o visuales acompanan cada feature
- [ ] Lista completa pero no abrumadora (3-7 features clave)

**Traduccion feature a beneficio:**
Mal: "Dashboard de analytics con IA"
Bien: "Ve exactamente que campanas generan ingresos — la IA analiza los datos por ti"

#### Seccion 5: Gestion de Objeciones (Peso: 10%)

Como aborda la pagina las razones para NO convertir.

**Objeciones comunes por tipo de pagina:**

| Objecion                          | Como tratarla                                                      |
| --------------------------------- | ------------------------------------------------------------------ |
| "Es caro"                         | Calculadora de ROI, comparativa, garantia de devolucion            |
| "No estoy seguro de que funcione" | Casos, trial gratis, video demo                                    |
| "Parece complicado"               | Asistente de setup, onboarding, "arranca en 5 minutos"             |
| "No se si lo necesito"            | Agitacion del problema, coste de no actuar                         |
| "Y si no me gusta?"               | Trial, garantia, cancela cuando quieras                            |
| "Y mis datos, son seguros?"       | Badges de seguridad, logos de cumplimiento, politica de privacidad |
| "Tengo que preguntar al equipo"   | Pagina comparativa compartible, trial de equipo, one-pager de ROI  |

**Checklist:**

- [ ] FAQ aborda las 3-5 objeciones principales
- [ ] Risk reversal presente (garantia, trial, cancelacion libre)
- [ ] Transparencia de precios (sin costes ocultos)
- [ ] Indicadores de seguridad y privacidad donde aplica
- [ ] Comparativa con alternativas si tiene sentido

#### Seccion 6: Call-to-Action (Peso: 10%)

El mecanismo de conversion en si.

**Checklist del boton:**

- [ ] El CTA describe el VALOR, no la accion ("Quiero mi informe gratis" vs "Enviar")
- [ ] El boton domina visualmente (tamano, color, whitespace)
- [ ] El CTA aparece varias veces en paginas largas
- [ ] Hay CTA secundario para quien aun no esta listo
- [ ] Microcopy de apoyo (ej. "Sin tarjeta de credito")
- [ ] Primera persona ("Empezar MI trial" vs "Empezar TU trial")
- [ ] CTA especifico de la oferta, no generico

**Scoring del copy del CTA:**

- Debil: "Enviar", "Click aqui", "Saber mas"
- Medio: "Registrate", "Empezar", "Descargar"
- Fuerte: "Quiero mi trial gratis", "Generar mi informe", "Reservar mi descuento"

#### Seccion 7: Footer y Elementos Secundarios (Peso: 5%)

**Checklist:**

- [ ] CTA final al pie de pagina
- [ ] Contacto o soporte visible
- [ ] Politica de privacidad y terminos enlazados
- [ ] Trust badges cerca del CTA final
- [ ] Sin enlaces que desvien de la conversion
- [ ] Copyright y aviso legal
- [ ] Redes sociales (solo si apoyan conversion, no distraen)

### Paso 3: Scoring del copy

Puntua el copy global en 5 dimensiones (1-10 cada una):

1. **Claridad** — entiende el visitante la oferta en 5 segundos?
2. **Urgencia** — hay razon para actuar YA?
3. **Especificidad** — claims con numeros, plazos, outcomes?
4. **Prueba** — evidencia, datos o testimonios que respalden?
5. **Orientacion a accion** — empuja a un paso concreto?

Copy Score = media de las 5 dimensiones x10 (sobre 100).

### Paso 4: Auditoria del formulario

Si la pagina tiene formulario, evalua:

| Elemento                | Best practice                                                              |
| ----------------------- | -------------------------------------------------------------------------- |
| Numero de campos        | Cada campo extra reduce conversion ~7%. Captura de leads: 3-5 maximo.      |
| Labels                  | Labels inline o flotantes. Nunca solo placeholder.                         |
| Texto del boton         | Alineado con el value prop. "Generar mi guia" mejor que "Enviar".          |
| Gestion de errores      | Validacion inline, mensajes especificos, no borrar el formulario al error. |
| Multi-paso              | Divide formularios largos en pasos con indicador de progreso.              |
| Obligatorio vs opcional | Marca los opcionales, no los obligatorios.                                 |
| Autofill                | Habilitar autofill del navegador para campos estandar.                     |
| Tipos de campo          | Usa tipos correctos (email, tel, url) para teclados moviles.               |

### Paso 5: Auditoria mobile

Mobile supone mas del 60% del trafico. Revisa:

- [ ] CTA alcanzable con el pulgar (mitad inferior)
- [ ] Texto legible sin zoom (minimo 16px en body)
- [ ] Formularios usables en movil (tap targets grandes, teclados adecuados)
- [ ] Imagenes escalan sin romper layout
- [ ] Sin scroll horizontal
- [ ] Carga en menos de 3 segundos en 4G
- [ ] Click-to-call en telefonos
- [ ] Barra CTA sticky al scroll (si aplica)

### Paso 6: Impacto de velocidad de carga

Benchmarks de impacto en conversion:

| Tiempo de carga | Impacto en conversion |
| --------------- | --------------------- |
| 0-2 segundos    | Baseline (optimo)     |
| 2-3 segundos    | -7% CR                |
| 3-5 segundos    | -20% CR               |
| 5-8 segundos    | -35% CR               |
| 8+ segundos     | -50%+ CR              |

Problemas comunes a detectar:

- Imagenes sin optimizar (recomendar WebP, lazy loading)
- JavaScript render-blocking
- Sin cache de navegador
- Sin CDN
- Exceso de scripts de terceros
- CSS/JS sin minificar

### Paso 7: Recomendaciones de A/B test

Formatea cada test como hipotesis:

**Plantilla:**
"Si [CAMBIAMOS X], entonces [METRICA] [MEJORARA/SUBIRA] porque [RAZON]."

**Tests habituales:**

1. Variaciones de headline (beneficio vs outcome)
2. Color y texto del CTA
3. Posicion del social proof (arriba vs abajo del fold)
4. Reducir 1-2 campos del formulario
5. Hero imagen vs hero video
6. Long-form vs short-form
7. Anadir urgencia (countdown, plazas limitadas)
8. Anclaje y presentacion de precios
9. Testimonios texto vs video
10. Chatbot o chat en vivo

### Paso 8: Lectura de heatmap (sin datos reales)

Sin heatmap real, orienta sobre:

- **Zonas esperadas de atencion** segun layout
- **Patron F vs patron Z** segun densidad
- **Profundidad de scroll estimada** segun longitud y cortes
- **Zonas de click probable** segun jerarquia visual
- **Rage clicks** (elementos que parecen clicables y no lo son)
- **Zonas muertas** ignoradas

## Formato de salida

Genera un archivo `LANDING-CRO.md` en la raiz del proyecto o directorio de output con esta estructura:

```markdown
# Analisis CRO de Landing Page

## [URL de la pagina]

### Fecha de analisis: [fecha]

---

## Score CRO general: [X/100]

## Tipo de pagina: [identificado]

## CR actual estimada: [estimacion]

## CR objetivo: [mejora realista]

---

## Analisis seccion a seccion

### 1. Hero [Score: X/10]

**Observaciones:**

- [observaciones concretas]

**Mejoras (Prioridad: ALTA/MEDIA/BAJA):**

- [recomendaciones accionables]

[Repetir para las 7 secciones]

---

## Copy Score: [X/100]

| Dimension            | Score | Notas   |
| -------------------- | ----- | ------- |
| Claridad             | X/10  | [notas] |
| Urgencia             | X/10  | [notas] |
| Especificidad        | X/10  | [notas] |
| Prueba               | X/10  | [notas] |
| Orientacion a accion | X/10  | [notas] |

---

## Auditoria del formulario

[observaciones y mejoras]

---

## Auditoria mobile

[observaciones y mejoras]

---

## Recomendaciones de A/B test

1. [test formato hipotesis]
2. [test formato hipotesis]
3. [test formato hipotesis]

---

## Lista priorizada de mejoras

### Quick Wins (esta semana)

1. [mejora con impacto esperado]

### Medio plazo (este mes)

1. [mejora con impacto esperado]

### Estrategicas (este trimestre)

1. [mejora con impacto esperado]

---

## Wireframes antes/despues

[descripcion textual del layout actual vs recomendado]
```

## Principios clave

- Ata toda recomendacion a IMPACTO EN INGRESOS. No basta con "cambia el color del boton": "cambiar el CTA a un color contrastado suele subir clicks 15-30%, lo que con tu trafico significa X conversiones extra al mes".
- Prioriza por ratio esfuerzo-impacto. Quick wins primero.
- Se concreto. "Mejora tu headline" no sirve. "Cambia el headline de 'Bienvenido a nuestra plataforma' a 'Reduce tu tiempo de reporting un 75% — analytics automatico para equipos de growth' porque anade especificidad, beneficio cuantificado y publico claro" si sirve.
- Cita benchmarks para que el cliente sepa donde esta.
- Si tienes acceso al navegador, saca capturas y referencia elementos concretos.
- Si el usuario ejecuto antes `/marketing auditoria`, incorpora esos hallazgos para un analisis mas completo.

**Nota contexto mercado hispanohablante:** priorizamos conversion sobre SEO porque la mayoria de webs B2B en Espana viven de trafico de pago + outbound, no de SEO organico.
