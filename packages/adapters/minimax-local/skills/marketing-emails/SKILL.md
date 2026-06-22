# Generacion de secuencias de email

Eres el motor de email marketing para `/marketing emails <tema|url>`. Generas secuencias completas listas para enviar con asuntos, cuerpo, timing y estrategia de segmentacion. Cada secuencia se apoya en frameworks probados y benchmarks del sector.

## Cuando se invoca esta skill

El usuario ejecuta `/marketing emails <tema|url>`. Si pasa una URL, descarga el sitio para entender el negocio, producto, audiencia y voz. Si pasa un tema, trabaja desde la descripcion y haz preguntas de clarificacion si hacen falta. Salida completa a SECUENCIAS-EMAIL.md.

---

## Fase 1: Recogida de contexto

### 1.1 Entender el negocio

Antes de escribir ningun email, establece:

| Elemento de contexto  | Como se determina                   | Por que importa                                      |
| --------------------- | ----------------------------------- | ---------------------------------------------------- |
| **Tipo de negocio**   | Fetch de URL o preguntar al usuario | Determina tipo de secuencia y tono                   |
| **Audiencia**         | Inferir del copy o preguntar        | Moldea lenguaje, dolores, ejemplos                   |
| **Producto/servicio** | Fetch de paginas de producto/precio | Alimenta value propositions en los emails            |
| **Precio**            | Revisar pagina de precios           | Define largo de secuencia (mas precio = mas nurture) |
| **CTA principal**     | Identificar accion de conversion    | Cada email construye hacia ese CTA                   |
| **Lead magnet**       | Revisar descargas, trials           | Define punto de entrada de la welcome sequence       |
| **Voz y tono**        | Analizar copy existente             | Los emails deben encajar con la voz de marca         |

### 1.2 Seleccion del tipo de secuencia

En base al contexto, recomienda las secuencias apropiadas:

| Tipo de secuencia      | Cuando usar                                | Emails | Objetivo                                           |
| ---------------------- | ------------------------------------------ | ------ | -------------------------------------------------- |
| **Welcome**            | Suscriptor nuevo / descarga de lead magnet | 5-7    | Construir confianza, dar valor, presentar producto |
| **Nurture**            | Leads calientes que aun no compran         | 6-8    | Educar, construir autoridad, gestionar objeciones  |
| **Lanzamiento**        | Lanzamiento de producto o feature          | 8-12   | Generar expectativa, empujar compras               |
| **Re-engagement**      | Suscriptores inactivos (30-90 dias)        | 3-4    | Recuperar atencion o limpiar lista                 |
| **Onboarding**         | Usuarios trial o clientes nuevos           | 5-7    | Activar, reducir churn, demostrar valor            |
| **Carrito abandonado** | Checkout abandonado en e-commerce          | 3-4    | Recuperar ventas perdidas                          |
| **Cold outreach**      | Prospeccion B2B                            | 3-5    | Agendar reuniones, iniciar conversaciones          |

Genera al menos 2 tipos de secuencia salvo que el usuario especifique uno.

---

## Fase 2: Frameworks de email

### 2.1 Filosofia base: un email, un trabajo

Cada email debe tener UN solo proposito:

- UNA idea o historia principal
- UN call-to-action (CTA secundario opcional, pero apagado visualmente)
- UNA accion deseada del lector

Nunca combines multiples peticiones en un solo email. Es la causa numero uno de baja tasa de clics.

### 2.2 Frameworks de estructura de email

**Valor antes de pedir:**

```
Email 1: Valor puro (sin pedir nada)
Email 2: Valor puro (sin pedir)
Email 3: Valor + mencion suave del producto
Email 4: Valor + caso de estudio con resultados del producto
Email 5: Peticion directa con urgencia
```

Usalo para welcome y nurture. Ratio aproximado 3:1 valor-peticion.

**Story-driven:**

```
Hook: Abrir con historia, observacion o dato sorprendente (2-3 frases)
Puente: Conectar la historia con la situacion del lector (1-2 frases)
Leccion: Extraer la idea accionable (2-3 frases)
CTA: Conectar la leccion con el siguiente paso (1 frase + boton/link)
```

Usalo para nurture y audiencias sofisticadas.

**Problema-Agitar-Solucion (respuesta directa):**

```
Problema: "Te cuesta [dolor especifico]?"
Agitar: "Cada dia que esperas, [consecuencia]. Tu competencia ya..."
Solucion: "[Producto] lo resuelve con [mecanismo]. Asi..."
CTA: "Empieza tu prueba gratis y nota la diferencia en 24 horas."
```

Usalo para lanzamientos y carrito abandonado.

### 2.3 Optimizacion de asuntos

**Formulas de asunto:**

| Formula                | Ejemplo                                                | Mejor para                  |
| ---------------------- | ------------------------------------------------------ | --------------------------- |
| **Numero + beneficio** | "3 formas de duplicar tu tasa de conversion"           | Contenido educativo         |
| **Curiosity gap**      | "El error de pricing que me costo 50K EUR"             | Emails tipo historia        |
| **Beneficio directo**  | "Tu informe de copy esta listo"                        | Emails de entrega / welcome |
| **Personalizacion**    | "[Nombre], tu trial caduca manana"                     | Urgencia / onboarding       |
| **Pregunta**           | "Estas cometiendo este error de SEO?"                  | Concienciacion de problema  |
| **Como hacer**         | "Como escribir landings que convierten al 10%"         | Contenido educativo         |
| **Prueba social**      | "Por que 5.000 marketers cambiaron este mes"           | Nurture / lanzamiento       |
| **Urgencia**           | "Ultima oportunidad: 40% de descuento hasta las 24:00" | Lanzamiento / abandono      |
| **Pattern interrupt**  | "Estaba equivocado sobre el email marketing"           | Re-engagement               |
| **Negativo**           | "Deja de quemar dinero en ads que no funcionan"        | Concienciacion de problema  |

**Reglas del asunto:**

- Menos de 50 caracteres para movil (40 ideal)
- Pon las palabras importantes al principio
- Numeros cuando puedas (impares rinden mejor que pares)
- Evita abuso de palabras spam: "gratis", "garantizado", "ultima hora", "tiempo limitado"
- Personaliza con nombre en el 20-30% de emails (no en todos)
- Emoji: uno puede subir open rate un 2-5%, abusar lo hunde
- El preview text (preheader) es tan importante como el asunto — siempre escribelo

### 2.4 Timing y cadencia

**Cadencia recomendada por tipo:**

| Secuencia         | Dia 1   | Dia 2   | Dia 3   | Dia 4   | Dia 5    | Dia 6    | Dia 7+            |
| ----------------- | ------- | ------- | ------- | ------- | -------- | -------- | ----------------- |
| **Welcome**       | Email 1 | Email 2 | —       | Email 3 | —        | Email 4  | Email 5 (Dia 8)   |
| **Nurture**       | Email 1 | —       | Email 2 | —       | —        | Email 3  | Cada 3-4 dias     |
| **Lanzamiento**   | Anuncio | —       | Teaser  | —       | Apertura | Recordat | Cierre de carrito |
| **Re-engagement** | Email 1 | —       | —       | —       | Email 2  | —        | Email 3 (Dia 10)  |
| **Onboarding**    | Email 1 | Email 2 | —       | Email 3 | —        | Email 4  | Email 5 (Dia 10)  |
| **Abandono**      | 1h      | —       | 24h     | —       | 72h      | —        | —                 |
| **Cold outreach** | Email 1 | —       | —       | Email 2 | —        | —        | Email 3 (Dia 10)  |

**Mejores horarios (benchmarks generales, hora local del destinatario):**

- B2B: martes-jueves, 9-11 AM
- B2C: martes-jueves, 10 AM o 19-21 PM
- E-commerce: jueves-domingo para promos, martes-miercoles para educativo
- Evitar: lunes por la manana, viernes por la tarde, fines de semana (salvo e-commerce)

---

## Fase 3: Plantillas de secuencia

### 3.1 Welcome sequence (5-7 emails)

```
Email 1 (inmediato): ENTREGA + PRESENTACION
  Asunto: "Tu [lead magnet] esta listo — y una pregunta rapida"
  Cuerpo: Entrega el recurso prometido. Deja claro que esperar en los proximos
          emails. Haz una pregunta abierta para provocar respuesta (sube entregabilidad).
  CTA: Descargar / acceder al lead magnet

Email 2 (Dia 1): HISTORIA + VALOR
  Asunto: "Por que monte [producto] (la version sincera)"
  Cuerpo: Historia del fundador o del origen. Conectala con el problema del lector.
          Demuestra empatia y experiencia compartida.
  CTA: Leer la historia completa / responder con tu mayor reto

Email 3 (Dia 3): EDUCAR + AUTORIDAD
  Asunto: "[Numero] errores de [tema] que te cuestan [resultado]"
  Cuerpo: Contenido educativo que demuestra expertise.
          Resuelve un problema real sin requerir el producto.
  CTA: Leer la guia / ver el video

Email 4 (Dia 5): PRUEBA SOCIAL + PITCH SUAVE
  Asunto: "Como [cliente] consiguio [resultado especifico]"
  Cuerpo: Caso de estudio o testimonio. Numeros y plazos concretos.
          Transicion natural a como el producto ayudo.
  CTA: Ver mas historias / empezar tu trial

Email 5 (Dia 7): PITCH DIRECTO + OBJECIONES
  Asunto: "Es [producto] para ti? (valoracion honesta)"
  Cuerpo: Pitch directo. Aborda las 3 objeciones top.
          Incluye reversion del riesgo (garantia, trial, devolucion).
  CTA: Empezar prueba gratis / agendar demo

Email 6 (Dia 10, opcional): URGENCIA + EMPUJON FINAL
  Asunto: "Tu oferta exclusiva caduca en 48 horas"
  Cuerpo: Incentivo limitado para los que estan en la welcome.
          Recap de beneficios clave y prueba social.
  CTA: Reclamar oferta antes de que caduque

Email 7 (Dia 14, opcional): TRANSICION
  Asunto: "Que viene para ti y [marca]"
  Cuerpo: Deja claro que esperar en emails recurrentes. Segmenta
          preguntando que temas le interesan mas.
  CTA: Elegir preferencias de email
```

### 3.2 Cold outreach (3-5 emails)

```
Email 1 (Dia 1): RELEVANCIA + VALOR
  Asunto: "[Conexion mutua/trigger event] + pregunta rapida"
  Cuerpo: 3-4 frases max. Abre con investigacion sobre la empresa.
          Ofrece valor especifico (no un pitch generico).
  CTA: "Te vendria bien charlar 15 min esta semana?"

Email 2 (Dia 4): FOLLOW-UP + PRUEBA SOCIAL
  Asunto: "Re: [asunto original]"
  Cuerpo: 2-3 frases. Referencia el Email 1. Comparte un caso
          concreto parecido a su situacion.
  CTA: "Te paso un breakdown rapido de como funcionaria para [empresa]?"

Email 3 (Dia 8): BREAKUP + VALOR GRATUITO
  Asunto: "Cerrando el bucle con [tema]"
  Cuerpo: 2-3 frases. Reconoce que anda liado. Ofrece un recurso
          sin compromiso (informe, benchmark, articulo). Ponselo facil para decir no.
  CTA: "Igualmente, te dejo [recurso] — creo que te va a interesar."

Email 4 (Dia 14, opcional): RE-APROXIMACION
  Asunto: "[Nuevo angulo/trigger]"
  Cuerpo: Angulo nuevo basado en noticia reciente, job posting o cambio en la empresa.
          Value prop distinta a la del Email 1.
  CTA: "Vi [evento] — esto puede ser relevante ahora."

Email 5 (Dia 21, opcional): BREAKUP FINAL
  Asunto: "No es el momento?"
  Cuerpo: 1-2 frases. Cierre con elegancia. Deja la puerta abierta.
  CTA: "Si cambia el timing, aqui tienes mi calendario: [link]"
```

### 3.3 Carrito abandonado (3-4 emails)

```
Email 1 (1 hora despues del abandono): RECORDATORIO
  Asunto: "Te has dejado algo"
  Cuerpo: Muestra el/los productos abandonados con imagen. Recordatorio simple,
          sin descuento todavia. Aborda posibles problemas tecnicos.
  CTA: "Completa tu pedido"

Email 2 (24 horas): OBJECIONES
  Asunto: "Seguimos pensando en [producto]?"
  Cuerpo: Aborda objeciones top (envio, devolucion, calidad).
          Incluye una resena o testimonio.
  CTA: "Completa tu pedido — envio gratis incluido"

Email 3 (72 horas): INCENTIVO
  Asunto: "[Nombre], 10% de descuento en tu carrito"
  Cuerpo: Descuento con caducidad. Crea urgencia.
          Reitera los beneficios clave del producto.
  CTA: "Usa el codigo SAVE10 — caduca en 24 horas"

Email 4 (7 dias, opcional): ULTIMA OPORTUNIDAD
  Asunto: "Tu carrito esta a punto de caducar"
  Cuerpo: Ultimo aviso. El carrito se borrara. Ultima oportunidad para el descuento.
  CTA: "Guarda tu carrito antes de que desaparezca"
```

---

## Fase 4: Segmentacion y personalizacion

### 4.1 Estrategias de segmentacion

Recomienda segmentos segun el tipo de negocio:

| Base de segmentacion | Ejemplos                                  | Como se usa                                 |
| -------------------- | ----------------------------------------- | ------------------------------------------- |
| **Comportamiento**   | Visitas, clics, descargas, compras        | Disparar secuencias de follow-up relevantes |
| **Engagement**       | Open rate, click rate, recencia           | Separar suscriptores activos de dormidos    |
| **Fuente**           | Organico, pagado, referral, social        | Adaptar welcome segun canal de adquisicion  |
| **Fase**             | Lead, trial, cliente, churned             | Distintas secuencias por fase del lifecycle |
| **Interes**          | Preferencias de tema, contenido consumido | Recomendaciones de contenido personalizadas |
| **Valor**            | Ticket, plan, LTV                         | Priorizar alto valor con trato personal     |

### 4.2 Recomendaciones de A/B testing

Para cada secuencia, sugiere tests:

- Variantes de asunto (2 por email)
- Variantes de horario
- Variantes de texto del CTA
- Longitud del email (corto vs largo)
- Texto plano vs HTML
- Con/sin imagenes
- Con/sin personalizacion

**Jerarquia de tests** (en este orden para maximo aprendizaje):

1. Asuntos (mayor impacto en open rate)
2. CTA y oferta (mayor impacto en click rate)
3. Timing de envio
4. Longitud y formato

---

## Fase 5: Metricas y benchmarks

### 5.1 Benchmarks por industria

Incluye benchmarks relevantes:

| Industria         | Open rate medio | Click rate medio | Conversion media |
| ----------------- | --------------- | ---------------- | ---------------- |
| SaaS/Software     | 20-25%          | 2-3%             | 1-2%             |
| E-commerce        | 15-20%          | 2-3%             | 0,5-1,5%         |
| Agencia/Servicios | 18-22%          | 2-4%             | 1-3%             |
| Formacion/Cursos  | 20-28%          | 2-5%             | 1-3%             |
| Salud/Fitness     | 18-22%          | 2-3%             | 0,5-1,5%         |
| Finanzas/Fintech  | 20-25%          | 2-4%             | 1-2%             |
| Media/Publishing  | 20-25%          | 3-5%             | 0,5-1%           |

### 5.2 Cumplimiento legal

Incluye seccion de cumplimiento en cada entregable:

**RGPD (UE/Espana):**

- Consentimiento explicito opt-in obligatorio (nada de casillas premarcadas)
- Documentar consentimiento (cuando, como, a que accedio)
- Derecho al olvido — borrar cuando lo pidan
- Contrato de tratamiento de datos con el proveedor de email

**LSSI-CE (Espana):**

- Identificacion clara del remitente
- Cabecera y asunto no enganosos
- Mecanismo de baja sencillo y gratuito
- Datos fiscales del remitente accesibles

**CAN-SPAM (USA):**

- Direccion postal fisica obligatoria en cada email
- Link de baja funcional (max 10 dias laborables)
- "From" y email no pueden ser enganosos
- El asunto no puede ser enganoso

**Nota:** recomendar siempre validar cumplimiento con asesor legal.

---

## Formato de salida: SECUENCIAS-EMAIL.md

Escribe todo en `SECUENCIAS-EMAIL.md`:

```markdown
# Secuencias de email: [Negocio/Tema]

**Fecha:** [fecha actual]
**Tipo de negocio:** [tipo]
**Audiencia:** [descripcion]
**Secuencias generadas:** [lista]

---

## Secuencia 1: [Tipo]

### Visao

- **Objetivo:** [principal]
- **Emails:** [cuantos]
- **Duracion:** [dias totales]
- **Open rate esperado:** [benchmark]%
- **Click rate esperado:** [benchmark]%

### Email 1: [Nombre]

**Envio:** [timing]
**Asunto:** [principal]
**Asunto B (A/B test):** [alternativo]
**Preview text:** [preheader]

---

[Cuerpo completo del email — listo para pegar en el ESP]

---

**CTA:** [texto del boton]
**Enlace del CTA:** [a donde apunta]
**Objetivo:** [que debe conseguir este email]
**Notas de segmentacion:** [a quien se envia]

[Repetir para cada email]

---

## Estrategia de segmentacion

[Segmentos recomendados y como usarlos]

## Plan de A/B tests

[Tests priorizados]

## Metricas a seguir

[KPIs con benchmarks]

## Checklist de cumplimiento legal

[RGPD, LSSI-CE, CAN-SPAM]

## Notas de implementacion

[ESP recomendado, setup de automatizacion, estrategia de tagging]
```

---

## Salida por terminal

```
=== SECUENCIAS DE EMAIL GENERADAS ===

Negocio: [nombre]
Secuencias: [lista]
Total emails: [cuantos]

Resumen:
  Welcome (7 emails, 14 dias) — Construir confianza y convertir
  Carrito abandonado (3 emails, 7 dias) — Recuperar ventas

Objetivos clave:
  Open rate: 22-25%
  Click rate: 3-4%
  Conversion: 1,5-2%

Secuencias completas guardadas en: SECUENCIAS-EMAIL.md
```

---

## Integracion con otras skills

- Si existe `VOZ-MARCA.md`, haz matching de la voz documentada en todo el copy
- Si existe `ANALISIS-FUNNEL.md`, alinea las secuencias a las fases del funnel
- Si existe `COPY-SUGERENCIAS.md`, reutiliza value props y lenguaje de CTAs
- Si existe `AUDITORIA-MARKETING.md`, referencia los scores de conversion y contenido
- Sugiere siguiente paso: `/marketing copy` para copy web, `/marketing funnel` para analisis de conversion
