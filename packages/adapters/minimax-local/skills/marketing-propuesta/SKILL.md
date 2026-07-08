---
name: marketing-propuesta
displayName: Propuestas comerciales
description: Estructura y redacción de propuestas comerciales de agencia: diagnóstico, alcance, entregables, pricing y cierre. Usala al cotizar o armar propuestas para prospectos.
required: false
---

# Generador de Propuesta para Cliente de Marketing

## Proposito de la skill

Generar una propuesta profesional lista para cliente de servicios de marketing. El documento posiciona a la agencia/consultor como la opcion clara, enmarca el pricing con anchoring y opciones por tiers, e incluye proyecciones de ROI para justificar la inversion.

## Cuando usarla

- El usuario quiere crear una propuesta para un prospecto
- El usuario cerro una discovery call y necesita formalizar la propuesta
- El usuario quiere una plantilla base para su agencia
- Se activa con `/marketing propuesta` o `/marketing propuesta <cliente>`

## Como ejecutarla

### Paso 1: Recoger inputs de la propuesta

Consigue estos datos del usuario (preguntalos si faltan):

**Sobre el cliente:**

1. Nombre del cliente y empresa
2. Industria y modelo de negocio
3. Situacion de marketing actual (que estan haciendo)
4. Pain points o retos principales
5. Objetivos (ingresos, crecimiento, leads, awareness)
6. Rango de presupuesto (si se conoce)
7. Timeline de decision
8. Stakeholders y decisores clave

**Sobre los servicios:**

1. Que servicios propones? (SEO, paid ads, contenido, social, email, full-stack)
2. Modelo de contratacion (retainer, proyecto, performance-based)
3. Timeline propuesto
4. Casos de estudio o resultados relevantes

**Si existe data de auditoria:** revisa los resultados previos de `/marketing auditoria`. Si existen, incorpora los hallazgos en la seccion de Analisis de la Situacion para una propuesta respaldada por datos.

### Paso 2: Framework de preguntas para discovery call

Si el usuario no ha hecho la discovery call aun, dale estas 10 preguntas esenciales:

**Entender el negocio:**

1. "Cuentame el modelo de negocio. Como ganan dinero?"
2. "Quien es tu cliente ideal? Describemelo a fondo."
3. "Como es tu proceso de venta desde primer contacto hasta cierre?"

**Marketing actual:** 4. "Que marketing haces hoy y que funciona o no?" 5. "Cual es tu gasto mensual en marketing y que ROI te da?" 6. "Que herramientas y plataformas usas?"

**Objetivos y expectativas:** 7. "Si somos brutalmente exitosos, como se ve en 6 meses? En 12?" 8. "Que numeros concretos quieres alcanzar? (Ingresos, leads, trafico)" 9. "Cual es el LTV de un cliente para ti?"

**Decision y proceso:** 10. "Quien mas participa en la decision y que plazo manejas para elegir partner?"

**Preguntas extra:**

- "Cual es tu mayor frustracion con el marketing ahora mismo?"
- "Has trabajado antes con agencias o consultores? Que fue bien o mal?"
- "Hay algo que te haria decir que no a trabajar juntos?"

### Paso 3: Construir el documento de propuesta

#### Seccion 1: Portada

```
[Logo de tu empresa]

Propuesta de Estrategia de Marketing
Preparada para: [Cliente]
Preparada por: [Tu nombre / Agencia]
Fecha: [Fecha]
Valida hasta: [Fecha + 30 dias]

CONFIDENCIAL
```

#### Seccion 2: Resumen Ejecutivo (maximo 1 pagina)

Un resumen conciso que:

- Reconoce la situacion y objetivos del cliente
- Plantea el problema core que vas a resolver
- Adelanta el enfoque recomendado
- Insinua el outcome esperado
- Crea urgencia para actuar

**Plantilla:**

```
[Cliente] esta en un punto de inflexion. Con [situacion actual — ej. producto validado pero generacion de leads inconsistente], hay una oportunidad significativa para [outcome — ej. escalar adquisicion hasta soportar tus targets de crecimiento].

Tras analizar [que has revisado — web, ads, competidores], hemos identificado [X] areas donde mejoras estrategicas pueden generar [resultado concreto — ej. un aumento del 40-60% en leads cualificados en 6 meses].

Esta propuesta plantea un engagement de [plazo] enfocado en [servicios principales], disenado para [outcome principal]. Nuestro enfoque se apoya en [diferenciador — ej. metodologia data-driven, experiencia en el sector, frameworks probados].

Recomendamos arrancar con [primera fase] para sentar baselines y obtener quick wins, y escalar esfuerzos segun los datos de performance.
```

#### Seccion 3: Analisis de la Situacion (2-3 paginas)

Presenta tu analisis del marketing actual del cliente. Aqui la data de `/marketing auditoria` es oro.

**Estructura:**

1. **Estado actual** — que estan haciendo y como funciona
2. **Oportunidades detectadas** — areas concretas de mejora
3. **Panorama competitivo** — como se comparan (usa `/marketing competidores` si existe)
4. **Retos clave** — obstaculos a resolver
5. **Contexto de mercado** — tendencias y benchmarks del sector

**Importante:** enmarca todo como oportunidad, no como fracaso. El cliente debe sentirse entendido, no criticado.

Bien: "Tu web convierte aproximadamente al 1,8%, por debajo del benchmark del sector (3,2%). Vemos un camino claro para cerrar ese gap con iniciativas de CRO."

Mal: "Tu web convierte fatal y necesita una reforma completa."

#### Seccion 4: Estrategia y Enfoque (2-3 paginas)

Presenta la estrategia recomendada. Suficiente detalle para demostrar expertise, sin regalar el know-how.

**Estructura:**

1. **Framework estrategico** — enfoque y metodologia
2. **Fase 1: Fundacion** (Mes 1-2) — setup, auditorias, baselines, quick wins
3. **Fase 2: Crecimiento** (Mes 3-4) — ejecucion de campanas core, optimizacion
4. **Fase 3: Escala** (Mes 5-6) — amplificar lo que funciona, cortar lo que no, invertir en ganadores
5. **Ongoing: Optimizar** — mejora continua, reporting, refresco de estrategia

Para cada fase:

- Actividades y entregables concretos
- Outcomes esperados
- Como se medira el exito

#### Seccion 5: Scope de Trabajo (1-2 paginas)

Detalla que entra (y que no).

**Incluye:**

- Entregables concretos con cantidades (ej. "8 posts de blog al mes, 1.500-2.000 palabras cada uno")
- Cadencia de reuniones (ej. "Calls estrategicas quincenales, reporting mensual")
- SLA de respuesta (ej. "24h laborables")
- Herramientas y plataformas incluidas
- Formato y frecuencia de reporting

**Excluye explicitamente:**

- Items fuera de scope para evitar scope creep
- Costes adicionales (ad spend, software, stock)
- Responsabilidades del cliente

**Responsabilidades del cliente:**
Lista lo que necesitas de ellos para tener exito:

- Feedback y aprobaciones a tiempo (SLA concreto)
- Accesos a cuentas, herramientas y datos
- Punto de contacto designado
- Aprobacion de contenido en X dias laborables
- Ad budget (separado de fees de gestion)

#### Seccion 6: Timeline (1 pagina)

Timeline visual con fases, milestones y entregables.

```
Mes 1      | Mes 2      | Mes 3      | Mes 4      | Mes 5      | Mes 6
-----------|------------|------------|------------|------------|----------
FUNDACION  | FUNDACION  | CRECIMIENTO| CRECIMIENTO| ESCALA     | ESCALA
Auditoria  | Quick wins | Lanzamiento| Optimizar  | Amplificar | A maxima
y setup    | y baselines| campanas   | e iterar   | ganadores  | capacidad

Milestones clave:
- Semana 2: auditoria y documento de estrategia cerrado
- Semana 4: primeras campanas en vivo
- Mes 2: primer informe de performance
- Mes 3: recomendaciones de optimizacion
- Mes 6: revision integral y refresco de estrategia
```

#### Seccion 7: Inversion (1-2 paginas)

Presenta el pricing en estructura Good-Better-Best.

**Modelo de 3 tiers:**

| Componente            | Growth         | Accelerate     | Dominate           |
| --------------------- | -------------- | -------------- | ------------------ |
| Estrategia            | Revision trim  | Estrategia mes | Estrategia semanal |
| Creacion de contenido | 4 piezas/mes   | 8 piezas/mes   | 16 piezas/mes      |
| Redes sociales        | 3 plataformas  | 5 plataformas  | Todas              |
| Gestion de paid ads   | Hasta 4K EUR   | Hasta 12K EUR  | Hasta 40K EUR      |
| SEO                   | On-page basico | SEO completo   | SEO + linkbuilding |
| Email marketing       | —              | Newsletter mes | Full automation    |
| Reporting             | Mensual        | Quincenal      | Dashboard semanal  |
| Reuniones             | Call mensual   | Call quincenal | Call semanal       |
| **Inversion mensual** | **X.XXX EUR**  | **X.XXX EUR**  | **X.XXX EUR**      |

**Tips de psicologia del pricing:**

- Presenta 3 opciones; la mayoria elige la del medio
- Nombres aspiracionales para los tiers (no Bronze/Silver/Gold)
- Ancla primero el tier mas alto para que el medio parezca razonable
- "Mas popular" o "Recomendado" en el tier medio
- Ensena la matematica: "Con tu LTV, solo necesitas [X] clientes nuevos al mes para ROI positivo"

**Modelos de pricing de referencia:**

| Modelo            | Cuando usarlo                               | Rango tipico              |
| ----------------- | ------------------------------------------- | ------------------------- |
| Retainer mensual  | Servicios ongoing, relacion estable         | 1.500-20.000 EUR/mes      |
| Por proyecto      | Scope cerrado, entregable unico             | 4.000-80.000 EUR/proyecto |
| Performance-based | Cliente quiere compartir riesgo, tu confias | Base + % revenue/leads    |
| Hibrido           | Engagements complejos                       | Retainer + bonus perform  |
| Por horas         | Consultoria, advisory, ad-hoc               | 120-400 EUR/hora          |

#### Seccion 8: Proyeccion de ROI

Ensena al cliente el retorno esperado de su inversion.

**Framework de calculo de ROI:**

```
Estado actual:
- Trafico mensual web: [X]
- CR actual: [X%]
- Leads actuales/mes: [X]
- Tasa de cierre: [X%]
- Ticket medio: [X] EUR
- Ingresos marketing mes actual: [X] EUR

Estado proyectado (6 meses):
- Aumento proyectado de trafico: [X%] -> [nuevo trafico]
- CR proyectada: [X%] -> [nuevos leads/mes]
- Aumento de leads: [X%]
- Aumento de ingresos: [X] EUR/mes
- ROI proyectado 6 meses: [X]x

Inversion: [total 6 meses] EUR
Retorno proyectado: [aumento de ingresos] EUR
ROI: [X]x
```

**Importante:** se conservador. Promete poco y entrega mas. Usa rangos, no cifras exactas. Incluye disclaimers de que los resultados dependen de multiples factores.

#### Seccion 9: Equipo (0,5-1 pagina)

Presenta a los miembros del equipo que trabajaran la cuenta.

Por cada miembro:

- Nombre y cargo
- Experiencia y expertise relevantes
- Rol en este engagement
- Bio breve (2-3 frases maximo)

#### Seccion 10: Casos de Estudio (1-2 paginas)

Incluye 2-3 casos relevantes que demuestren resultados parecidos a los prometidos.

**Formato de caso:**

```
Cliente: [Industria y tipo — anonimiza si hace falta]
Reto: [1-2 frases sobre su situacion]
Solucion: [1-2 frases sobre lo que hicisteis]
Resultados:
- [Metrica 1: ej. "Aumento de trafico organico 287% en 6 meses"]
- [Metrica 2: ej. "CPL reducido de 40 EUR a 10 EUR"]
- [Metrica 3: ej. "Generados 150K EUR en ingresos nuevos"]
```

#### Seccion 11: Siguientes Pasos (0,5 pagina)

Que queda crisstalino que pasa despues. Reduce friccion.

```
Listos para avanzar? Asi sigue el proceso:

1. Firma esta propuesta (link de e-signature incluido)
2. Agendamos kickoff en 48 horas
3. Te mandamos cuestionario de onboarding y peticion de accesos
4. Arrancamos la fase de Fundacion inmediatamente

Dudas? Contacta con [Nombre] en [email] o [telefono].

Esta propuesta es valida hasta [fecha — 30 dias desde hoy].
```

### Paso 4: Diseno y formato de la propuesta

**Best practices:**

- Maximo 15 paginas totales (sin apendice)
- Headers, fuentes y colores consistentes
- Logo del cliente junto al tuyo en portada
- Graficos y visuales en vez de texto denso cuando sea posible
- Negrita en numeros y outcomes clave
- Usa whitespace, no apelotones contenido
- Numeracion de paginas e indice para propuestas largas
- Exporta a PDF para presentacion profesional

**Formato Markdown:**

- H1 para titulo
- H2 para secciones principales
- H3 para subsecciones
- Tablas para pricing, timelines, comparativas
- Negrita para enfasis en puntos clave
- Blockquotes para testimonios

### Paso 5: Secuencia de follow-up post-envio

**Dia 0 (envio):**
Envia via email con cover note breve. Asunto: "Tu plan de crecimiento — [Cliente]"

**Dia 2:**
Follow-up: "Queria asegurarme de que recibiste la propuesta. Encantado de hacer una call para recorrerla si te viene bien."

**Dia 5:**
Valor anadido: comparte articulo, caso o insight del sector. Menciona la propuesta de pasada.

**Dia 7:**
Directo: "Me encantaria escuchar que te parecio. Alguna duda que pueda resolver? Estoy disponible [horarios concretos] esta semana."

**Dia 14:**
Ultimo empujon: "Queria hacer un ultimo check-in. Entiendo que el timing puede no ser el mejor — si es el caso, me encantaria reconectar cuando tenga sentido. Si no, avancemos."

**Dia 21:**
Breakup: "No he tenido respuesta, asumo que el timing no cuadra. Cerrare la propuesta en [fecha de expiracion]. Si cambia la situacion, aqui estoy. Mucho exito a ti y a [empresa]."

### Paso 6: Gestion de objeciones

Prepara respuestas para pushbacks habituales:

| Objecion                              | Framework de respuesta                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| "Es caro"                             | Reenmarca como inversion, ensena matematica de ROI, oferta un scope menor, coste de no actuar        |
| "Podemos hacerlo in-house"            | Coste de oportunidad, expertise, velocidad a resultados, coste real fully-loaded in-house            |
| "Probamos esto y no funciono"         | Pregunta que no funciono, diferencia tu enfoque, propon pilot con criterios de exito                 |
| "Tenemos que pensarlo"                | Fija fecha de follow-up, resuelve dudas concretas, ofrece referencias adicionales                    |
| "Puedes garantizar resultados?"       | Explica por que las garantias son irreales en marketing, comparte historicos, componente performance |
| "Estamos hablando con otras agencias" | Bien. Diferencia en metodologia no en precio, ofrece piloto, enfatiza cultura                        |
| "El plazo es muy largo"               | Explica por que los atajos fallan, fase de quick wins, valor temprano en el plan                     |
| "No tenemos presupuesto ahora"        | Ofrece scope inicial mas pequeno, plan de pago diferido, coste de esperar                            |

### Paso 7: Terminos y condiciones esenciales

En apendice o documento aparte:

1. **Pagos:** Net 15 o Net 30, metodos, penalizaciones por retraso
2. **Duracion:** periodo minimo, auto-renovacion
3. **Cancelacion:** preaviso (tipico 30 dias), proceso de salida
4. **Cambios de scope:** proceso y costes adicionales
5. **Propiedad intelectual:** quien posee el trabajo, licencias
6. **Confidencialidad:** NDA, tratamiento de datos
7. **Limites de responsabilidad:** caps, fuerza mayor
8. **Reporting y comunicacion:** cadencia y formato acordados
9. **Costes de terceros:** responsabilidad del cliente sobre ad spend, software, stock
10. **Disclaimer de resultados:** no garantizados, contexto de performance pasado

## Formato de salida

Genera un archivo `PROPUESTA-CLIENTE.md` con esta estructura:

```markdown
# Propuesta de Servicios de Marketing

## Preparada para: [Cliente]

## Preparada por: [Agencia]

## Fecha: [Fecha]

---

## Indice

1. Resumen Ejecutivo
2. Analisis de la Situacion
3. Estrategia y Enfoque
4. Scope de Trabajo
5. Timeline
6. Inversion
7. Proyeccion de ROI
8. Nuestro Equipo
9. Casos de Estudio
10. Siguientes Pasos

---

[Contenido completo con todas las secciones pobladas segun datos del cliente]

---

## Apendice

- Terminos y Condiciones
- Descripcion detallada de entregables
- Stack de herramientas
```

## Principios clave

- La propuesta es un documento de venta, no un statement of work. Tiene que VENDER, no solo describir.
- Lidera con los problemas y objetivos del cliente, no con tus servicios. Haz que se sienta entendido antes de presentar soluciones.
- Cada precio debe anclarse al ROI que genera. Nunca presentes coste sin contexto.
- Usa el lenguaje del propio cliente (el de la discovery call). Devuelvele sus palabras.
- Si hay data de auditoria de skills previas, usala a fondo — las propuestas respaldadas por datos cierran 2-3x mas que las genericas.
- Concisa. Los decisores escanean. Negritas, headers y tablas hacen la info escaneable.
- Incluye siempre un siguiente paso concreto y con fecha. La ambiguedad mata deals.
