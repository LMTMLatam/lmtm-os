# Plan 21/11/2026 — la agencia entera en el panel + fábrica de video de inmobiliarias

Pedido de Naza (21/11): investigar la agencia, otras agencias y sus paneles, ver qué falta y qué de lo que
hacemos se puede integrar al panel, y armar un plan. Adicional: un lugar (Drive o NAS) con todas las
inmobiliarias donde se suben las propiedades y sus crudos, y de ahí salen con subtítulos y formato correcto.
Más el documento de Marcos «RESUMEN DE TABLEROS 18/7», para completar.

**Nada de este plan está aplicado.** Es investigación + plan.

## 1. Qué hace la agencia hoy (medido el 21/11)

58 clientes activos. Últimos 30 días: 421 publicaciones reales (IG + FB), 354 piezas entregadas por agentes,
314 tareas terminadas, 246 decisiones, 95 acciones de pauta, 128 informes semanales, 1.530 corridas de agentes
(409 bien).

| Trabajo | Dónde vive | En el panel |
|---|---|---|
| Calendario y publicación | Planilla Cronopost → ClickUp → Make | Sí (calendario, salud de posteos, publicación trabada) |
| Producción de piezas | Productor + Editor, Drive | Sí (Contenido, bandeja de validación) |
| Rodajes y crudos | NAS `/LMTM/Clientes/<cliente>/VIDEO` | A medias (crudos por cliente; sin flujo de entrada) |
| Pauta Meta / Google | LMTM-OS | Sí (Pauta, decisiones, piloto automático) |
| Informe semanal y dashboard del cliente | LMTM-OS | Sí (32 links; no se comparten solos) |
| Webs y SEO | Hostinger, Search Console | Sí (auditoría semanal, cambios con aprobación) |
| CRM, leads, bot | crm.lmtmas.com | No (app aparte; al panel solo llegan los leads de pauta) |
| Lo vendido a cada cliente | PLANILLA GENERAL (Google Sheets) | A medias (contenido sí; plata y avisos no) |
| Quién atiende cada cuenta | PLANILLA GENERAL, cols AA–AH | A medias (cuentas por persona, no trabajo real) |
| Planillas de producción de video | Drive (carpeta `1OcvVV…`) | No |
| Planilla de leads del bot | Drive (carpeta `1ejJdV…`) | No |
| Cobros, abonos, gastos | Fuera del sistema | No: `finance_entries` tiene 0 filas |
| Alta de clientes | ClickUp F1/F2 → Make | Sí (Preparación) |
| Licitaciones | Mercado Público | Sí |

## 2. Qué tienen los paneles de otras agencias y nosotros no

Mirados: Productive, Teamwork, Scoro (gestión), AgencyAnalytics (reportes al cliente), Planable (aprobaciones),
ManyRequests / Wayfront (portal). Las fuentes son blogs de los propios vendedores: sirven de orientación, no de
medida.

| Módulo típico | LMTM hoy | Brecha |
|---|---|---|
| Alcance vendido vs entregado (retainer) | Contenido cotizado vs realizado | Falta plata de pauta, cantidad de avisos, stories, LinkedIn y TikTok reales |
| Señal de sobre-servicio / sub-servicio | No | Es justo lo que pide Marcos: «¿le tengo que cobrar más?» |
| Revisión trimestral (QBR) | Botón «3 meses» en el semáforo | Falta el informe en sí |
| Salud del cliente | Índice /100 (pauta, operación, contenido) | Falta seguidores, tendencia de leads, mejoras de agentes y oportunidades en una sola vista |
| Capacidad del equipo | Cuentas por persona | Falta carga real (piezas por persona por mes) |
| Rentabilidad por cliente | No | Abono − costo (horas no hay; sí créditos, tokens, herramientas) |
| Portal del cliente con aprobación | Dashboard público de solo lectura | El cliente aprueba en ClickUp; un post sin aprobar se pierde en silencio (causa n.º 1 de «no publica») |
| Renovaciones y contratos | No | Fecha de inicio y de revisión por cliente |
| Satisfacción (NPS) | No | El bot ya lee los grupos de WhatsApp: se puede sacar de ahí |
| Control de horas | No | No se recomienda: se usa la tarea de ClickUp como medida |

Lo que LMTM tiene y esos paneles no: agentes que ejecutan, medición por efecto, estudio de virales, pauta con
escritura. No hay que cambiar de herramienta: hay que cerrar las brechas de gestión.

## 3. El documento de Marcos (18/7): qué está y qué falta

Ya se implementó el 20/7 (`docs/plan-tableros-18-7.md`). Estado contra lo que pide el PDF:

| Pide | Estado |
|---|---|
| Lista de clientes con inversión | Hecho (Semáforo de clientes) |
| Posteos y videos cotizado vs realizado | Hecho (Instagram real; ClickUp si no hay cuenta leída) |
| Historias cotizado vs realizado | Se muestran, no pesan: el equipo no las carga y la API solo da 24 h. Hay captura cada 6 h sin contar |
| Inversión de Meta cotizado vs realizado | Falta el cotizado: la planilla dice sí/no, no pesos |
| Inversión de Google cotizado vs realizado | Igual |
| Cantidad de avisos cotizado vs realizado | Falta entero (no está en la planilla ni en `cotizado.ts`) |
| Cruce de recursos (quién tiene muchas cuentas) | Hecho por cantidad de cuentas; falta por trabajo |
| Salud: leads, seguidores, calidad de avisos, vendido vs realizado, mejoras de agentes, oportunidades | Cada dato existe por separado; falta la vista junta |
| Informe trimestral | Falta |
| Planillas de video (Drive) | Sin leer |
| Planilla de leads del bot | Sin leer |

## 4. Plan por fases

Cada fase se despliega sola y deja algo usable. Orden por valor para Marcos primero.

**Fase 1 — La cuenta del cliente completa (doc de Marcos).**
- Tres columnas nuevas en PLANILLA GENERAL: inversión Meta $/mes, inversión Google $/mes, avisos/mes. Las
  carga el equipo (la planilla ya manda; no se crea otra fuente).
- `cotizado.ts`: leer esas columnas; realizado de avisos = anuncios distintos con gasto en el mes
  (`ads_insights`); stories = las capturadas cada 6 h.
- Vista por cliente tal cual el PDF: MES, cada renglón «cotizado vs realizado». En la ficha y en el semáforo.

**Fase 2 — Salud en una vista.** Una tarjeta por cliente: leads (y tendencia), seguidores por cuenta (y
diferencia), calidad de avisos Meta/Google, cumplimiento, mejoras ejecutadas por agentes, oportunidades vivas.
Solo lectura de datos que ya existen.

**Fase 3 — Informe trimestral y señal de cobro.**
- Regla: realizado ≥ 120 % de lo cotizado en 2 de 3 meses → «sobre-servicio: revisar precio»; ≤ 70 % →
  «sub-servicio: riesgo». Se mira el trimestre, no el mes (pedido de Marcos).
- Informe trimestral por cliente, con los números del sistema, que aprueba una persona (mismo camino que el
  informe semanal). Sale el primer día hábil de cada trimestre.

**Fase 4 — Carga real del equipo.** Piezas por persona por mes (responsable en ClickUp) contra cuentas
asignadas. Aviso cuando alguien pasa el doble de la mediana.

**Fase 5 — Planillas sueltas al panel.** Leer la carpeta de producción de video (videos por cliente) y la de
leads del bot. Primero mirar qué tienen: no se revisaron en esta investigación.

**Fase 6 — Aprobación del cliente desde su link.** El cliente ve las piezas de la semana y aprueba; el panel
escribe «Aprobación de cliente» en ClickUp. A verificar antes: que la API de ClickUp deje escribir ese campo.

**Fase 7 — Rentabilidad.** Abono por cliente (`clients.monthly_retainer_cents`, lo carga Naza) menos costo
medido (créditos de contenido, tokens, herramientas). Sin horas.

**Después, si hace falta:** fechas de contrato y revisión, satisfacción desde los grupos de WhatsApp.

## 5. Fábrica de video de inmobiliarias

**Lo que ya hay:** NAS conectado al servidor (solo lectura), índice nocturno, `crudos_preparar`, agente Editor,
bandeja «Videos sin validar», y `vtool`, que en una pasada endereza, pasa a 9:16 (1080×1920), pone subtítulos
palabra por palabra y nivela el audio. En el NAS cada inmobiliaria ya tiene
`VIDEO/PROYECTOS/<propiedad>/{RECURSOS, AUDIO, GRAFICOS, PORTADAS…}` (COSA: 26 propiedades; MA: 17).

**Lo que falta:** un lugar único de entrada, que arranque solo, y un modo «engranar» sin agente (el material
viene casi hecho: no hace falta un modelo que piense la edición).

**Diseño:**
1. **Entrada: una carpeta en el NAS**, `/LMTM/INMOBILIARIAS/<Inmobiliaria>/<Propiedad>/`. Los crudos pesan
   hasta 1,8 GB cada uno y ya llegan al NAS por Resilio; subirlos a Drive sería duplicar. La ruta se suma a
   `clients.metadata.nas` de cada inmobiliaria (ya admite varias).
2. **Ficha opcional `datos.txt`** en la propiedad: dirección, precio, ambientes, link. Si no está, el video
   sale solo con lo que se dice en cámara. Nada inventado.
3. **Disparo:** el recorrido nocturno detecta una propiedad con videos y sin salida. También un botón en el
   panel para no esperar a la noche.
4. **Proceso sin agente:** por cada crudo, `vtool` (9:16 + subtítulos + audio + cierre de marca). Un archivo
   por vez: el disco del servidor es de 5 GB.
5. **Salida: Drive** `Super Redes/<cliente>/VIDEOS/<propiedad>/` y bandeja de validación. Una persona mira,
   corrige nombres de calles en los subtítulos si hace falta, y lo carga a la planilla. No publica solo.
6. **Piloto:** COSA PROPIEDADES, una propiedad. Después MA PROPIEDADES, PRONE, IMPERIA, MA DESARROLLOS.

**Si el volumen no entra por el servidor** (NAS → Railway ≈ 42 Mbps): mover el proceso a un contenedor en el
QNAP, al lado de los archivos. Depende de los pasos de Container Station que siguen pendientes.

## 5 bis. Prueba con DUNOD (21/11) — corrige el diseño del punto 5

Naza avisó que DUNOD ya tiene el modelo armado. Lo que hay en `/LMTM/Clientes/Dunod`:
- `PRODUCCION/<MM_DD_PROPIEDAD>/` con los crudos (a veces `FOTOS/` y `VIDEOS/`): la entrada ya existe, no hace
  falta una carpeta `/LMTM/INMOBILIARIAS` nueva. La plantilla `PRODUCCION/MES_ANO_DETALLE` está en todos.
- `VIDEO/TERMINADOS/NO_SUBIDO/HOOKS y CIERRES/`: banco de 17 ganchos y cierres por persona
  (`<PERSONA>_HOOK<n>_DUN_<fecha>_V1.mp4`, `<PERSONA>_CIERRE<n>…`; Belén, Gaspar, Gastón, Seba), de ~4 s.
- `VIDEO/TERMINADOS/NO_SUBIDO/<PROPIEDAD>_DUN_<fecha>_V1.mp4`: el video de la propiedad ya editado.

«Engranar» = gancho + propiedad + cierre. Probado en esta PC con el kit (`C:\LMTM\video-kit`, sin tokens):
`SEBA_HOOK1` + `JULIO_SOSA_8900` + `SEBA_CIERRE1` → `vtool unir` → `vtool normalizar` → 42 s, 1080×1920,
-14 LUFS, en menos de un minuto. Copia en `Downloads/PRUEBA_engranado_DUNOD_JULIO_SOSA_8900.mp4`.

Lo que mostró la prueba:
1. Las tres piezas ya traen subtítulos quemados, placa «VENTA» y logo. En DUNOD **no hay que subtitular** los
   terminados: se duplicarían. El subtitulado queda para lo que viene sin texto (crudos, otras inmobiliarias).
2. El video de la propiedad termina con el logo, y el cierre quedó DESPUÉS del logo. Para engranar bien, la
   propiedad se exporta sin logo, o el cierre se inserta antes del logo.
3. Gancho de Seba con propiedad presentada por otra persona: hace falta la regla (misma persona o cualquiera).
4. Whisper `small` se equivoca en nombres («María Tango», «podáis»): si se subtitula, lo revisa una persona.
5. Aviso de «imagen congelada» en el logo final: falso positivo.

**Diseño corregido:** entrada = `PRODUCCION/<fecha_propiedad>` y `TERMINADOS/NO_SUBIDO` de cada inmobiliaria
(16 clientes con rubro inmobiliaria; GRUPO MA y Distrito Roldan sin carpeta). Banco `HOOKS y CIERRES` por
cliente. El proceso mira si la pieza ya tiene subtítulos antes de ponerlos. Salida a Drive + bandeja.

## 6. Decisiones para Naza

1. Plata y avisos cotizados: ¿columnas nuevas en PLANILLA GENERAL (recomendado) o se cargan en el panel?
2. Entrada de inmobiliarias: ¿carpeta única en el NAS (recomendado) o Drive?
3. Salida de los videos: sigue solo Drive (decisión del 18/11) o también `TERMINADOS/NO_SUBIDO` del NAS. Lo
   segundo pide darle escritura al usuario `Agentes_IA`.
4. Fase 6: ¿el cliente aprueba desde su link?
5. Fase 7: ¿se cargan los abonos?
6. Engranado: ¿el gancho y el cierre son de la misma persona que presenta la propiedad? ¿El video de la propiedad se
   exporta sin logo para que el cierre vaya antes?

## No revisado

- El contenido de las carpetas de Drive que cita Marcos (video y leads).
- El detalle de los 30 días de actividad: se leyó el resumen, no las 1.371 líneas.
- Precios y funciones de los paneles de otras agencias en sus páginas oficiales.
