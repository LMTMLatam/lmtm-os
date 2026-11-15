// LMTM-OS: la parte FIJA del cerebro de la agencia (plan 15/11, fase 1).
//
// Cómo trabaja LMTM: sistemas, procesos, convenciones y reglas de la casa. Antes
// vivía en notas sueltas y en la cabeza del equipo; los agentes lo redescubrían
// (mal) en cada corrida. La parte VIVA (equipo de agentes, rutinas, lecciones,
// números) la arma cerebro.ts con datos de la base.
//
// Cuando un proceso cambia, se cambia ACÁ (y se despliega): es la fuente.

export const AGENCIA = `# LMTM — cómo trabaja la agencia

LMTM es una agencia de marketing de Rosario (Argentina) con ~60 clientes activos: pymes de inmobiliarias,
hotelería, comercios, industria y servicios. Hace redes (contenido y publicación), pauta (Meta y Google),
webs y SEO, y un CRM propio para algunos clientes.

## Los sistemas y para qué sirve cada uno
- **ClickUp** (workspace 9013352440, space Clientes): fuente de verdad operativa. Un folder por cliente;
  las tareas son el contenido y el trabajo. Doc «Enfoque Técnico» por cliente con su información de base.
- **Planilla Cronopost** (Google Sheets, una por cliente): MANDA sobre ClickUp. Un Apps Script nocturno pisa
  fecha, día y horario de ClickUp con lo de la planilla. Para mover un post se edita la planilla.
- **Make** (org 2367960, team 228071): publica. El despachador AutoPoster (escenario 1427144, NO apagar)
  recibe la tarea al llegar su fecha y la manda al escenario del cliente, que publica en Instagram,
  Facebook, LinkedIn, Pinterest, YouTube y TikTok.
- **Google Drive** «Super Redes/<cliente>/»: material del cliente y entregas (PLACAS, VIDEOS).
- **NAS de LMTM** (QNAP, por WebDAV): crudos y videos filmados de los clientes (/LMTM/Clientes/<cliente>).
- **LMTM-OS** (este sistema, Railway): panel, agentes, inteligencia de pauta y orgánico, cerebro.
- **CRM propio** (crm.lmtmas.com): WhatsApp, Instagram y Messenger de algunos clientes, leads, Tokko.
- **Meta Ads / Google Ads**: pauta, medida en LMTM-OS; los agentes pueden pausar, ajustar presupuestos y
  sumar negativas con guardas.
- **WhatsApp del equipo**: avisos agrupados en el resumen diario; un bot lee los grupos de clientes.

## Procesos
1. **Alta de cliente:** crear su folder en ClickUp dispara el alta en LMTM-OS (planilla, Apps Script, cliente
   en la base, tarea de onboarding). Formularios F1 y F2 arman la página «Datos del cliente» del Enfoque
   Técnico. Queda un clic manual: correr crearTriggerDiario en el script del cliente.
2. **Contenido y publicación:** planilla → ClickUp (Redes Sociales) → al llegar start_date, Make publica.
   Un post solo sale si al llegar la fecha tiene «Aprobación de cliente» = APROBADO y copy cargado; si no,
   se descarta EN SILENCIO. La etiqueta «mandado a make» NO prueba que se publicó: la pone ClickUp antes.
   Para saber si publicó: lmtmGetCadenaPublicacion (mide por efecto).
3. **Producción de piezas:** el Productor de contenido arma placas, carruseles y reels con material real
   del cliente (Drive, NAS, web). Cada pieza pasa un control de calidad guardado; una persona dice si sirvió
   (sí/no + por qué) y eso queda como regla del cliente. Nunca publica: entrega en Drive y en la tarea.
4. **Pauta:** sincronización diaria de Meta y Google; el motor de decisiones propone (Hoy); el piloto
   automático ejecuta lo seguro; lo que mueve plata grande lo aprueba una persona.
5. **Informe semanal del cliente:** lo escribe un agente sin números inventados, una persona lo aprueba y
   se publica en el link del cliente.
6. **Licitaciones** (Mercado Público, Chile): Carlos las cura de lunes a viernes.

## Reglas de la casa
- Nada inventado: ni datos, ni precios, ni testimonios, ni casos. Si falta, se pide.
- No se publica ni se le escribe a un cliente sin el OK de una persona.
- Los clientes NO se comparan entre los nuestros: se comparan con su nicho y con lo viral.
- Medir por efecto, no por estado: «verde» en Make, en un script o en una tarea no prueba nada.
- Credenciales: nunca en tareas, comentarios, memoria ni entregables.
- Plata: no se gasta sin OK (recargas, créditos grandes, herramientas nuevas).
- Material real del cliente antes que generado; lo generado nunca se hace pasar por el producto o el local.
- Grupo MA: CANNES, SKYGARDEN, MA DESARROLLOS, MA PROPIEDADES y GRUPO MA son el mismo grupo.

## Personas
- **Nazareno Carames:** dueño y dirección. Decide precios, gastos, prioridades y lo que toca a clientes.
- **Equipo:** cuentas, diseño, copy y programación, BM y pauta (por ejemplo Marcos Lewis: BM y publicación).
  Lo que necesita una persona va como tarea [HUMANO] o decisión en Hoy.
`;
