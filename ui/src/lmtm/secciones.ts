// LMTM: el mapa del panel (rediseño 20/11), en un solo lugar: el riel, el menú de
// comandos (Ctrl+K) y la ficha del cliente leen de acá. No se perdió ninguna sección:
// se agruparon.

import { Activity, Bot, Clapperboard, Film, Inbox, Library, LineChart, ListChecks, Users, type LucideIcon } from "lucide-react";

export interface Seccion { to: string; label: string; soloAdmin?: boolean }
export interface SeccionPrincipal extends Seccion { Icono: LucideIcon; hijas?: Seccion[] }

/** Lo de todos los días. Las hijas se ven en el riel cuando la madre está abierta. */
export const PRINCIPALES: SeccionPrincipal[] = [
  { to: "/hoy", label: "Hoy", Icono: Inbox },
  { to: "/aprobaciones", label: "Aprobaciones", Icono: ListChecks },
  { to: "/clientes", label: "Clientes", Icono: Users },
  {
    to: "/contenido",
    label: "Contenido",
    Icono: Clapperboard,
    hijas: [
      { to: "/contenido", label: "Calendario y piezas" },
      { to: "/biblioteca", label: "Biblioteca" },
      { to: "/produccion/generado", label: "Producción" },
      { to: "/produccion/tipos", label: "Tipos de video" },
    ],
  },
  { to: "/pauta", label: "Pauta", Icono: LineChart },
  {
    to: "/agentes",
    label: "Agentes",
    Icono: Bot,
    hijas: [
      { to: "/agentes", label: "Equipo" },
      { to: "/trabajo", label: "Trabajo" },
      { to: "/actividad", label: "Actividad" },
    ],
  },
];

/** Lo de la agencia, más abajo en el riel. */
export const AGENCIA: Seccion[] = [
  { to: "/nichos", label: "Nichos" },
  { to: "/inteligencia", label: "Inteligencia" },
  { to: "/semaforo", label: "Semáforo de clientes" },
  { to: "/licitaciones", label: "Licitaciones", soloAdmin: true },
  { to: "/whatsapp", label: "WhatsApp", soloAdmin: true },
  { to: "/finanzas", label: "Finanzas", soloAdmin: true },
  { to: "/config", label: "Configuración", soloAdmin: true },
];

/** Se abren desde Configuración; están acá para el título de la pestaña y el Ctrl+K. */
export const OTRAS: Seccion[] = [
  { to: "/preparacion", label: "Preparación" },
  { to: "/conexiones", label: "Conexiones" },
  { to: "/avisos", label: "Avisos" },
];

/** Iconos de las hijas de una madre, para la barra del celular. */
export const ICONO_HIJA: Record<string, LucideIcon> = { "/biblioteca": Library, "/produccion/generado": Film, "/actividad": Activity };

/** Puro. La sección (o hija) que corresponde a una ruta, para marcarla y titular la pestaña. */
export function seccionDe(pathname: string): { madre: SeccionPrincipal | null; label: string | null } {
  const todas = [...PRINCIPALES.flatMap((p) => [p, ...(p.hijas ?? []).map((h) => ({ ...h, madre: p }))]), ...AGENCIA, ...OTRAS];
  // La más específica gana: /produccion/tipos antes que /produccion.
  const hit = todas.filter((s) => pathname === s.to || pathname.startsWith(`${s.to}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  if (!hit) return { madre: null, label: null };
  const madre = "madre" in hit ? (hit.madre as SeccionPrincipal) : PRINCIPALES.find((p) => p.to === hit.to) ?? null;
  return { madre, label: hit.label };
}

// ── La ficha del cliente: 5 grupos con las 14 secciones de siempre ──────────

export interface SeccionCliente { id: string; label: string }
export const GRUPOS_CLIENTE: Array<{ grupo: string; secciones: SeccionCliente[] }> = [
  { grupo: "Resumen", secciones: [{ id: "resumen", label: "Para hacer" }, { id: "plan-accion", label: "Plan de acción" }] },
  { grupo: "Pauta", secciones: [{ id: "dashboard", label: "Campañas" }, { id: "web", label: "Web" }] },
  {
    grupo: "Contenido",
    secciones: [
      { id: "calendario", label: "Calendario" },
      { id: "ideas", label: "Ideas (Super Redes)" },
      { id: "ganchos", label: "Ganchos" },
      { id: "tendencias", label: "Tendencias" },
      { id: "que-funciona", label: "Qué funciona" },
    ],
  },
  { grupo: "Marca", secciones: [{ id: "productos", label: "Marca y productos" }, { id: "memoria", label: "Memoria" }, { id: "competidores", label: "Competencia" }] },
  { grupo: "Trabajo", secciones: [{ id: "agentes", label: "De los agentes" }, { id: "tasks", label: "Tareas" }] },
];
export const SECCIONES_CLIENTE = GRUPOS_CLIENTE.flatMap((g) => g.secciones.map((s) => ({ ...s, grupo: g.grupo })));
