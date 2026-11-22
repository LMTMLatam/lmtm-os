// LMTM: Contenido generado (pedido 11/10). Todo lo que produjeron Higgsfield y
// Magnific —por la etiqueta de ClickUp, desde el panel o pedido por Claude—,
// con su link de Drive, y lo que gastó cada herramienta. Las unidades NO se
// suman entre herramientas: el plan, la API y Magnific son bolsas distintas.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, ExternalLink, FolderOpen, Link2, Loader2, OctagonAlert, Scissors, Search, Sparkles, Wand2 } from "lucide-react";
import { Link } from "@/lib/router";
import { columnasEnMarcha, type PedidoAgente } from "./contenido-en-marcha";
import { api } from "../api/client";
import { clientsApi } from "../api/clients";
import { Encabezado } from "./Shell";
import { PestanasProduccion } from "./ProduccionApp";
import { Tarjeta, TituloFranja } from "./HoyApp";

export interface TotalHerramienta {
  herramienta: string;
  generaciones: number;
  creditos: number | null;
  usd: number | null;
  sinCosto: number;
  noEntregadas: number;
}
export interface PiezaGenerada {
  id: string;
  titulo: string;
  kind: string;
  clientId: string | null;
  cliente: string | null;
  createdAt: string;
  driveLink: string | null;
  links: string[];
  taskUrl: string | null;
  prompt: string | null;
  origen: string | null;
  gasto: TotalHerramienta[] | null;
  delProductor?: boolean;
  reemplaza?: string | null;
  movimiento?: string | null;
  postLink?: string | null;
  revision?: { apto: boolean | null; nivel?: number | null; problemas?: Array<{ que: string }>; sinRevision?: string } | null;
  veredicto?: { sirve: boolean; porque: string | null; fecha: string } | null;
  medidas?: Array<{ momento: string; horas: number; alcance: number | null; guardados: number | null; compartidos: number | null; comentarios: number | null; reacciones: number | null }>;
}
interface RespuestaPedido {
  ok: boolean;
  mensaje: string;
}
interface Respuesta {
  dias: number;
  totales: TotalHerramienta[];
  porCliente: Array<{ clientId: string; cliente: string; herramientas: TotalHerramienta[] }>;
  piezas: PiezaGenerada[];
}
interface Estado {
  via?: "plan" | "api" | null;
  creditos?: number | null;
  sesion?: "ok" | "caida";
  magnific?: boolean;
}

const HERRAMIENTAS: Record<string, { nombre: string; unidad: string }> = {
  higgsfield_plan: { nombre: "Higgsfield · plan", unidad: "créditos del plan" },
  higgsfield_api: { nombre: "Higgsfield · API", unidad: "créditos de la API" },
  magnific: { nombre: "Magnific", unidad: "" },
  elevenlabs: { nombre: "ElevenLabs", unidad: "créditos" },
};
const nombreHerramienta = (h: string) => HERRAMIENTAS[h]?.nombre ?? h;
const ORIGEN: Record<string, string> = { clickup: "Etiqueta de ClickUp", panel: "Panel", claude: "Claude" };
const TIPO: Record<string, string> = { video: "Video", placa: "Placa", carrusel: "Carrusel", imagen: "Imagen" };
const PERIODOS = [7, 30, 90, 365];

const num = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);
const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** "56 créditos" / "US$ 0,09" / "sin costo informado". Nunca un 0 inventado. */
function costo(t: TotalHerramienta): string {
  const partes: string[] = [];
  if (t.creditos != null) partes.push(`${num(t.creditos)} créditos`);
  if (t.usd != null) partes.push(`US$ ${num(t.usd)}`);
  if (partes.length === 0) return "sin costo informado";
  if (t.sinCosto > 0) partes.push(`+ ${t.sinCosto} sin costo informado`);
  return partes.join(" · ");
}

export function ContenidoGeneradoApp() {
  const [dias, setDias] = useState(30);
  const [cliente, setCliente] = useState("");
  const [herramienta, setHerramienta] = useState("");
  const [buscar, setBuscar] = useState("");
  const [sinValidar, setSinValidar] = useState(false);
  const q = useQuery({
    queryKey: ["lmtm", "contenido", "generado", dias],
    queryFn: () => api.get<Respuesta>(`/contenido/generado?dias=${dias}`),
    refetchInterval: 60_000,
  });
  const estado = useQuery({ queryKey: ["lmtm", "contenido", "estado"], queryFn: () => api.get<Estado>("/video/estado"), refetchInterval: 60_000 });
  const d = q.data;

  const clientes = useMemo(
    () => [...new Map((d?.piezas ?? []).filter((p) => p.clientId).map((p) => [p.clientId!, p.cliente ?? p.clientId!])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [d],
  );
  const texto = buscar.trim().toLowerCase();
  const visibles = (d?.piezas ?? []).filter((p) =>
    (!cliente || p.clientId === cliente)
    && (!herramienta || p.gasto?.some((g) => g.herramienta === herramienta))
    && (!texto || p.titulo.toLowerCase().includes(texto) || (p.cliente ?? "").toLowerCase().includes(texto))
    && (!sinValidar || (p.kind === "video" && !p.veredicto)));

  return (
    <>
      <Encabezado
        titulo="Contenido"
        bajada="Pedí piezas nuevas o la edición de material filmado, seguí lo que está en marcha y validá lo que entregaron"
      />
      <PestanasProduccion />
      <div className="space-y-8 px-4 pb-10 md:px-8">
        {/* Rediseño 20/11 (Naza): «en contenido solo lo de edición y lo de producción, bien intuitivo». */}
        <PedirContenido />
        <EnMarcha />
        {q.isLoading && (
          <p className="flex items-center gap-2 text-[14px] text-l-tinta-3"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…</p>
        )}
        {q.error && (
          <p className="flex gap-1.5 text-[14px] text-l-critico-texto" role="alert">
            <OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> {q.error instanceof Error ? q.error.message : "No se pudo leer"}
          </p>
        )}

        {d && (
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[18px] font-semibold">Lo que entregaron <span className="text-[14px] font-normal text-l-tinta-3">· {visibles.length}</span></h2>
              <div className="flex gap-1" role="group" aria-label="Período">
                {PERIODOS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDias(n)}
                    aria-pressed={dias === n}
                    className={`min-h-9 rounded-full px-3 text-[13px] ${dias === n ? "bg-l-marca-suave font-semibold text-l-tinta" : "text-l-tinta-2 hover:bg-l-sup"}`}
                  >
                    {n === 365 ? "1 año" : `${n} días`}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <label className="relative min-w-0 flex-1 sm:max-w-xs">
                <span className="sr-only">Buscar</span>
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-l-tinta-3" aria-hidden />
                <input
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Buscar pieza o cliente"
                  className="h-9 w-full rounded-[8px] border border-l-linea-2 bg-l-sup pl-8 pr-2 text-[14px]"
                />
              </label>
              <select value={cliente} onChange={(e) => setCliente(e.target.value)} className="h-9 rounded-[8px] border border-l-linea-2 bg-l-sup px-2 text-[14px]" aria-label="Cliente">
                <option value="">Todos los clientes</option>
                {clientes.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
              <select value={herramienta} onChange={(e) => setHerramienta(e.target.value)} className="h-9 rounded-[8px] border border-l-linea-2 bg-l-sup px-2 text-[14px]" aria-label="Herramienta">
                <option value="">Todas las herramientas</option>
                {Object.keys(HERRAMIENTAS).map((h) => <option key={h} value={h}>{nombreHerramienta(h)}</option>)}
              </select>
              <label className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-l-linea-2 bg-l-sup px-2 text-[14px]">
                <input type="checkbox" checked={sinValidar} onChange={(e) => setSinValidar(e.target.checked)} />
                Videos sin validar
              </label>
            </div>
            {visibles.length === 0 ? (
              <Tarjeta><p className="text-[14px] text-l-tinta-2">No hay contenido generado en este período con esos filtros.</p></Tarjeta>
            ) : (
              <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
                {visibles.map((p) => <FilaPieza key={p.id} p={p} />)}
              </ul>
            )}
          </section>
        )}
        {d && (
          <details className="rounded-2xl border border-l-linea bg-l-sup px-4 py-3">
            <summary className="min-h-10 cursor-pointer text-[14px] font-semibold text-l-tinta-2">Gasto de las herramientas · últimos {d.dias} días</summary>
            <div className="mt-4 space-y-8">
          <section>
            <TituloFranja>Por herramienta</TituloFranja>
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.keys(HERRAMIENTAS).map((h) => (
                <TarjetaHerramienta key={h} h={h} t={d.totales.find((x) => x.herramienta === h)} e={estado.data} />
              ))}
            </div>
            <p className="mt-2 text-[12px] text-l-tinta-3">
              El costo es el que cotiza cada herramienta al momento de pedir. Las bolsas no se suman entre sí. Lo generado antes del 11/10 no tiene el gasto registrado.
            </p>
          </section>

        {d.porCliente.length > 0 && (
          <section>
            <TituloFranja>Por cliente</TituloFranja>
            <div className="overflow-x-auto rounded-2xl border border-l-linea bg-l-sup">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-l-linea text-left text-[12px] text-l-tinta-3">
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Herramienta</th>
                    <th className="px-3 py-2 text-right font-medium">Generaciones</th>
                    <th className="px-3 py-2 font-medium">Gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porCliente.flatMap((c) =>
                    c.herramientas.map((t, i) => (
                      <tr key={`${c.clientId}-${t.herramienta}`} className="border-b border-l-linea last:border-0">
                        <td className="px-3 py-2">{i === 0 ? c.cliente : ""}</td>
                        <td className="px-3 py-2 text-l-tinta-2">{nombreHerramienta(t.herramienta)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.generaciones}</td>
                        <td className="px-3 py-2 tabular-nums text-l-tinta-2">{costo(t)}</td>
                      </tr>
                    )))}
                </tbody>
              </table>
            </div>
          </section>
        )}

            </div>
          </details>
        )}
      </div>
    </>
  );
}

const campo = "w-full min-w-0 rounded-[12px] border border-l-linea-2 bg-l-papel px-3 text-[14px] text-l-tinta outline-none focus:border-l-marca";
const botonPedir = "inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-[image:var(--l-marca-grad)] px-5 text-[14px] font-semibold text-l-marca-tinta disabled:opacity-50";

type Quien = "productor" | "editor" | "engranar";
const OPCIONES: Array<{ k: Quien; titulo: string; detalle: string; Icono: typeof Sparkles }> = [
  { k: "productor", titulo: "Pieza nueva", detalle: "El Productor arma un reel, clip, placa o carrusel desde cero, con el material del cliente.", Icono: Sparkles },
  { k: "editor", titulo: "Editar material filmado", detalle: "El Editor toma los crudos del NAS y los deja listos para redes.", Icono: Scissors },
  { k: "engranar", titulo: "Engranar gancho + propiedad + cierre", detalle: "Une videos ya terminados del NAS y nivela el audio. Sin agente: no gasta.", Icono: Link2 },
];

/**
 * Un solo lugar para pedir (rediseño 20/11, Naza: «así dividida en dos es bastante fea»): se elige qué hace falta y
 * aparece solo ese formulario.
 */
function PedirContenido() {
  const [quien, setQuien] = useState<Quien>("productor");
  return (
    <section className="rounded-[20px] border border-l-linea bg-l-sup bg-[image:var(--l-brillo-caja)] p-5 md:p-6">
      <h2 className="text-[18px] font-semibold">¿Qué necesitás?</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Qué pedir">
        {OPCIONES.map((o) => {
          const activo = o.k === quien;
          return (
            <button
              key={o.k}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => setQuien(o.k)}
              className={`flex items-start gap-3 rounded-[16px] border p-4 text-left transition-colors ${activo ? "border-l-marca bg-l-marca-suave" : "border-l-linea-2 hover:border-l-tinta-3"}`}
            >
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[12px] ${activo ? "bg-[image:var(--l-marca-grad)] text-l-marca-tinta" : "bg-l-papel text-l-tinta-2"}`}>
                <o.Icono className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-l-tinta">{o.titulo}</span>
                <span className="mt-0.5 block text-[13px] leading-[1.45] text-l-tinta-2">{o.detalle}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-5 border-t border-l-linea pt-5">{quien === "productor" ? <FormProductor /> : quien === "editor" ? <FormEditor /> : <FormEngranar />}</div>
    </section>
  );
}

function ElegirCliente({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const clientes = useQuery({ queryKey: ["clients", "para-pedidos"], queryFn: () => clientsApi.list("active") });
  const lista = [...(clientes.data?.clients ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-medium text-l-tinta-2" htmlFor={id}>Cliente</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${campo} h-11 sm:max-w-sm`} required>
        <option value="">Elegí el cliente</option>
        {lista.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}

function Resultado({ m }: { m: { data?: RespuestaPedido; error: unknown } }) {
  if (m.data) return <span className={`text-[13px] ${m.data.ok ? "text-l-bien-texto" : "text-l-critico-texto"}`} role="status">{m.data.mensaje}</span>;
  if (m.error) return <span className="text-[13px] text-l-critico-texto" role="alert">{m.error instanceof Error ? m.error.message : "No se pudo pedir"}</span>;
  return null;
}

/** Pedido de una pieza nueva al Productor de contenido. */
function FormProductor() {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [pedido, setPedido] = useState("");
  const pedir = useMutation({
    mutationFn: () => api.post<RespuestaPedido>("/contenido/productor/pedido", { clientId, pedido }),
    onSuccess: (r) => {
      if (r.ok) setPedido("");
      void qc.invalidateQueries({ queryKey: ["lmtm", "contenido", "productor"] });
    },
  });
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (clientId && pedido.trim().length >= 10) pedir.mutate(); }}>
      <ElegirCliente id="cliente-productor" value={clientId} onChange={setClientId} />
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-l-tinta-2" htmlFor="pedido-video">Qué pieza querés: producto, para qué y si hay material (link de Drive)</label>
        <textarea
          id="pedido-video"
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          rows={3}
          placeholder="Reel de 25 s de los placares a medida, para pauta. Material: https://drive.google.com/…"
          className={`${campo} py-2.5`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!clientId || pedido.trim().length < 10 || pedir.isPending} className={botonPedir}>
          {pedir.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Clapperboard className="h-4 w-4" aria-hidden />} Pedir la pieza
        </button>
        <Resultado m={pedir} />
      </div>
      <p className="text-[12px] text-l-tinta-3">Cada pedido es una corrida del agente (OpenAI y voces de Gemini). Para corregir una pieza ya hecha, usá «Pedir cambios» en la pieza: sale mucho más barato.</p>
    </form>
  );
}

interface CarpetaCrudos { cliente: string; clientId: string; carpeta: string; videos: number; mb: number; fecha: string }

/** Plan 17/11: «en el cliente X, carpeta X, tenés los crudos de hoy: dejalos listos para redes». */
function FormEditor() {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [ruta, setRuta] = useState("");
  const [pedido, setPedido] = useState("");
  // Sin cliente: lo nuevo de todos (7 días). Con cliente: sus carpetas de crudos de 60 días, para no tipear la ruta.
  const crudos = useQuery({
    queryKey: ["lmtm", "contenido", "crudos", clientId],
    queryFn: () => api.get<{ carpetas: CarpetaCrudos[] }>(`/contenido/crudos-nuevos?${clientId ? `dias=60&clientId=${encodeURIComponent(clientId)}` : "dias=7"}`),
  });
  const pedir = useMutation({
    mutationFn: () => api.post<RespuestaPedido>("/contenido/editor/pedido", { clientId, ruta: ruta.trim(), pedido }),
    onSuccess: (r) => {
      if (r.ok) { setPedido(""); setRuta(""); }
      void qc.invalidateQueries({ queryKey: ["lmtm", "contenido", "editor"] });
    },
  });
  const nuevas = (crudos.data?.carpetas ?? []).filter((c) => !clientId || c.clientId === clientId).slice(0, clientId ? 12 : 6);
  const valida = !!clientId && ruta.trim().startsWith("/LMTM/");
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (valida) pedir.mutate(); }}>
      <ElegirCliente id="cliente-editor" value={clientId} onChange={setClientId} />
      {nuevas.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-medium text-l-tinta-2">{clientId ? "Crudos de este cliente en el NAS (60 días)" : "Crudos nuevos en el NAS (7 días)"}: tocá uno</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {nuevas.map((c) => {
              const elegida = ruta === c.carpeta;
              return (
                <button
                  key={c.carpeta}
                  type="button"
                  onClick={() => { setClientId(c.clientId); setRuta(c.carpeta); }}
                  aria-pressed={elegida}
                  className={`min-w-0 rounded-[14px] border p-3 text-left text-[13px] ${elegida ? "border-l-marca bg-l-marca-suave" : "border-l-linea-2 hover:border-l-tinta-3"}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-l-tinta">{c.cliente}</span>
                    <span className="shrink-0 text-[12px] text-l-tinta-3">{c.fecha}</span>
                  </span>
                  <span className="mt-0.5 block text-l-tinta-2">{c.videos} videos · {c.mb >= 1000 ? `${(c.mb / 1000).toFixed(1)} GB` : `${c.mb} MB`}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-l-tinta-3" title={c.carpeta}>{c.carpeta.replace(/^\/LMTM\/Clientes\/[^/]+\//, "…/")}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      {clientId && crudos.isSuccess && nuevas.length === 0 && (
        <p className="text-[13px] text-l-tinta-3">No hay carpetas de crudos de este cliente en el NAS en los últimos 60 días: escribí la ruta.</p>
      )}
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-l-tinta-2" htmlFor="ruta-crudos">Carpeta del NAS con los crudos</label>
        <input id="ruta-crudos" value={ruta} onChange={(e) => setRuta(e.target.value)} placeholder="/LMTM/Clientes/<Cliente>/VIDEO/PROYECTOS/<proyecto>/RECURSOS/CRUDOS" className={`${campo} h-11`} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-l-tinta-2" htmlFor="pedido-editor">Algo puntual (opcional): cuántas piezas, de qué producto, para qué</label>
        <textarea id="pedido-editor" value={pedido} onChange={(e) => setPedido(e.target.value)} rows={2} placeholder="Sacá 3 reels: uno de cada ambiente y un testimonio" className={`${campo} py-2.5`} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!valida || pedir.isPending} className={botonPedir}>
          {pedir.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FolderOpen className="h-4 w-4" aria-hidden />} Pasarle los crudos
        </button>
        <Resultado m={pedir} />
      </div>
      <p className="text-[12px] text-l-tinta-3">Las piezas vuelven a «Lo que entregaron», más abajo, y quedan en Drive, en la carpeta VIDEOS del cliente.</p>
    </form>
  );
}

interface ArchivoNas { nombre: string; ruta: string; mb: number | null }
interface Material { sinNas?: boolean; carpeta?: string; propiedades: ArchivoNas[]; ganchos: ArchivoNas[]; cierres: ArchivoNas[] }

/**
 * Plan 21/11 (inmobiliarias): la propiedad ya viene editada y hay un banco de ganchos y cierres por persona. Acá se
 * eligen las tres piezas y el servidor las une, nivela el audio y deja el video en Drive. Qué persona va con qué
 * propiedad lo decide quien lo pide.
 */
function FormEngranar() {
  const [clientId, setClientId] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [gancho, setGancho] = useState("");
  const [cierre, setCierre] = useState("");
  const [subtitular, setSubtitular] = useState(false);
  const [trabajo, setTrabajo] = useState<string | null>(null);
  const material = useQuery({
    queryKey: ["lmtm", "contenido", "engranado", clientId],
    queryFn: () => api.get<Material>(`/contenido/engranado/material?clientId=${encodeURIComponent(clientId)}`),
    enabled: !!clientId, retry: false,
  });
  const pedir = useMutation({
    mutationFn: () => api.post<RespuestaPedido & { id?: string }>("/contenido/engranado", { clientId, cuerpo, gancho: gancho || undefined, cierre: cierre || undefined, subtitular }),
    onSuccess: (r) => { if (r.ok && r.id) setTrabajo(r.id); },
  });
  const estado = useQuery({
    queryKey: ["lmtm", "contenido", "engranado-estado", trabajo],
    queryFn: () => api.get<{ estado: "en_curso" | "lista" | "fallo" | "desconocida"; mensaje: string }>(`/contenido/engranado/estado/${trabajo}`),
    enabled: !!trabajo,
    refetchInterval: (q) => (q.state.data && q.state.data.estado !== "en_curso" ? false : 5000),
  });
  const listo = estado.data?.estado === "lista";
  const m = material.data;
  const elegir = (id: string, etiqueta: string, valor: string, cambiar: (v: string) => void, opciones: ArchivoNas[], vacio: string) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-medium text-l-tinta-2" htmlFor={id}>{etiqueta}</label>
      <select id={id} value={valor} onChange={(e) => cambiar(e.target.value)} className={`${campo} h-11`}>
        <option value="">{vacio}</option>
        {opciones.map((o) => <option key={o.ruta} value={o.ruta}>{o.nombre}{o.mb != null ? ` · ${Math.round(o.mb)} MB` : ""}</option>)}
      </select>
    </div>
  );
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (clientId && cuerpo) { setTrabajo(null); pedir.mutate(); } }}>
      <ElegirCliente id="cliente-engranar" value={clientId} onChange={(v) => { setClientId(v); setCuerpo(""); setGancho(""); setCierre(""); setTrabajo(null); }} />
      {material.isLoading && <p className="text-[13px] text-l-tinta-3" role="status">Leyendo el NAS…</p>}
      {material.isError && <p className="text-[13px] text-l-critico-texto" role="alert">{material.error instanceof Error ? material.error.message : "No se pudo leer el NAS."}</p>}
      {m?.sinNas && <p className="text-[13px] text-l-tinta-3">Este cliente no tiene carpeta en el NAS.</p>}
      {m && !m.sinNas && m.propiedades.length === 0 && <p className="text-[13px] text-l-tinta-3">No hay videos terminados en {m.carpeta}.</p>}
      {m && m.propiedades.length > 0 && (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            {elegir("eng-gancho", "Gancho (adelante)", gancho, setGancho, m.ganchos, m.ganchos.length ? "Sin gancho" : "No hay ganchos en el banco")}
            {elegir("eng-cuerpo", "Propiedad", cuerpo, setCuerpo, m.propiedades, "Elegí el video")}
            {elegir("eng-cierre", "Cierre (al final)", cierre, setCierre, m.cierres, m.cierres.length ? "Sin cierre" : "No hay cierres en el banco")}
          </div>
          <label className="flex items-start gap-2 text-[13px] text-l-tinta-2">
            <input type="checkbox" checked={subtitular} onChange={(e) => setSubtitular(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>Ponerle subtítulos. Solo si las piezas NO los traen ya: si no, quedan duplicados. Los nombres de calles y barrios hay que leerlos antes de publicar.</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!cuerpo || pedir.isPending || estado.data?.estado === "en_curso"} className={botonPedir}>
              {pedir.isPending || estado.data?.estado === "en_curso" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />} Engranar
            </button>
            {estado.data ? (
              <span className={`text-[13px] ${estado.data.estado === "fallo" || estado.data.estado === "desconocida" ? "text-l-critico-texto" : listo ? "text-l-bien-texto" : "text-l-tinta-3"}`} role="status">
                {estado.data.mensaje.replace(/https?:\/\/\S+/, "").trim()}{" "}
                {/https?:\/\/\S+/.exec(estado.data.mensaje) && <a href={/https?:\/\/\S+/.exec(estado.data.mensaje)![0]} target="_blank" rel="noreferrer" className="underline">Abrir en Drive</a>}
              </span>
            ) : <Resultado m={pedir} />}
          </div>
          <p className="text-[12px] text-l-tinta-3">El video queda en Drive, en la carpeta VIDEOS del cliente, y en «Lo que entregaron» para validar. Si la propiedad termina con el logo, el cierre queda después del logo: pedila exportada sin logo.</p>
        </>
      )}
    </form>
  );
}

/** Los pedidos a los dos agentes juntos, por estado. Cada uno abre su tarea. */
function EnMarcha() {
  const prod = useQuery({ queryKey: ["lmtm", "contenido", "productor"], queryFn: () => api.get<{ pedidos: PedidoAgente[] }>("/contenido/productor/pedidos"), refetchInterval: 60_000 });
  const edit = useQuery({ queryKey: ["lmtm", "contenido", "editor"], queryFn: () => api.get<{ pedidos: PedidoAgente[] }>("/contenido/editor/pedidos"), refetchInterval: 60_000 });
  const columnas = columnasEnMarcha(prod.data?.pedidos ?? [], edit.data?.pedidos ?? []);
  const total = columnas.reduce((s, c) => s + c.pedidos.length, 0);
  if (prod.isLoading || edit.isLoading) return null;
  return (
    <section>
      <h2 className="mb-3 text-[18px] font-semibold">En marcha <span className="text-[14px] font-normal text-l-tinta-3">· {total}</span></h2>
      {total === 0 ? (
        <p className="rounded-[16px] border border-l-linea bg-l-sup px-4 py-4 text-[14px] text-l-tinta-2">No hay pedidos en marcha. Lo que pidas arriba aparece acá hasta que se entrega.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {columnas.map((c) => (
            <div key={c.titulo} className="rounded-[18px] border border-l-linea bg-l-sup p-3">
              <h3 className={`mb-2 flex items-baseline justify-between px-1 text-[13px] font-semibold ${c.alerta && c.pedidos.length ? "text-l-atencion-texto" : "text-l-tinta-2"}`}>
                {c.titulo} <span className="tabular-nums text-l-tinta-3">{c.pedidos.length}</span>
              </h3>
              {c.pedidos.length === 0 ? (
                <p className="px-1 pb-1 text-[12px] text-l-tinta-3">Nada</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {c.pedidos.slice(0, 5).map((p) => (
                    <li key={p.id}>
                      <Link to={`/issues/${p.identifier ?? p.id}`} className="block rounded-[12px] bg-l-papel/60 p-2.5 text-inherit hover:bg-l-papel">
                        <span className="flex items-center justify-between gap-2 text-[11px] text-l-tinta-3">
                          <span className={`rounded-full px-2 py-px font-semibold ${p.origen === "Producción" ? "bg-l-marca-suave text-l-tinta" : "bg-l-linea-2 text-l-tinta-2"}`}>{p.origen}</span>
                          <span className="tabular-nums">{fecha(p.actualizado)}</span>
                        </span>
                        <span className="mt-1 line-clamp-2 block text-[13px] leading-[1.4] text-l-tinta">{p.titulo}</span>
                      </Link>
                    </li>
                  ))}
                  {c.pedidos.length > 5 && <li className="px-1 text-[12px] text-l-tinta-3">y {c.pedidos.length - 5} más</li>}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TarjetaHerramienta({ h, t, e }: { h: string; t?: TotalHerramienta; e?: Estado }) {
  const saldo = h === "higgsfield_plan" && e?.creditos != null ? `Le quedan ${num(e.creditos)} créditos al plan` : null;
  const sinConfigurar = h === "magnific" && e && !e.magnific;
  return (
    <Tarjeta>
      <div className="text-[13px] font-semibold">{nombreHerramienta(h)}</div>
      {t ? (
        <>
          <div className="mt-1 text-[22px] font-semibold tabular-nums">{t.generaciones} <span className="text-[13px] font-normal text-l-tinta-3">generaciones</span></div>
          <div className="text-[13px] tabular-nums text-l-tinta-2">{h === "magnific" && t.creditos != null ? `≈ ${costo(t)}, a tarifa` : costo(t)}</div>
          {t.noEntregadas > 0 && (
            <div className="mt-1 text-[12px] text-l-atencion-texto">{t.noEntregadas} pagadas que no terminaron en una pieza</div>
          )}
        </>
      ) : (
        <div className="mt-1 text-[13px] text-l-tinta-3">{sinConfigurar ? "Sin configurar" : "Sin uso en el período"}</div>
      )}
      {saldo && <div className="mt-2 border-t border-l-linea pt-2 text-[12px] text-l-tinta-3">{saldo}</div>}
      {h === "magnific" && (
        <div className="mt-2 border-t border-l-linea pt-2 text-[12px] text-l-tinta-3">
          Solo lo que generan los agentes. Lo que se genera en la web de Magnific no está acá:{" "}
          <a className="underline" href="https://www.magnific.com/developers/dashboard" target="_blank" rel="noreferrer">ver el saldo real</a>
        </div>
      )}
    </Tarjeta>
  );
}

/**
 * Control de calidad que hizo el agente al entregar y el veredicto de una
 * persona (15/11). «No sirve» pide el porqué: queda como regla del cliente y el
 * agente la lee antes de la próxima pieza.
 */
/** Para contar después qué falla más en cada plantilla (plan 17/11, fase 4). El texto queda como regla del cliente. */
const MOTIVOS = ["Gancho flojo", "Ritmo", "Toma mal elegida", "Subtítulos", "Marca", "Dato equivocado"];

export function Calidad({ p }: { p: Pick<PiezaGenerada, "id" | "revision" | "veredicto"> }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [porque, setPorque] = useState("");
  const juzgar = useMutation({
    mutationFn: (sirve: boolean) => api.post<{ ok: boolean; motivo?: string }>("/contenido/veredicto", { deliverableId: p.id, sirve, porque: porque.trim() }),
    onSuccess: (r) => { if (r.ok) { setAbierto(false); setPorque(""); void qc.invalidateQueries({ queryKey: ["lmtm", "contenido"] }); } },
  });
  const r = p.revision;
  const control = !r ? null
    : r.apto === null ? <span className="text-l-atencion-texto">Sin control de calidad{r.sinRevision ? `: ${r.sinRevision}` : ""}</span>
    : r.apto ? <span>Pasó el control{r.nivel ? ` · nivel ${r.nivel}/5` : ""}</span>
    : <span className="text-l-atencion-texto" title={(r.problemas ?? []).map((x) => x.que).join("\n")}>No pasó el control{r.nivel ? ` · nivel ${r.nivel}/5` : ""}{r.problemas?.length ? ` · ${r.problemas[0].que}` : ""}</span>;
  const v = p.veredicto;
  return (
    <div className="mt-1 flex flex-col gap-1 text-[12px] text-l-tinta-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {control}
        {v ? (
          <span className={v.sirve ? "" : "text-l-critico-texto"}>{v.sirve ? "Sirvió" : "No sirvió"}{v.porque ? `: ${v.porque}` : ""}</span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-l-tinta-3">¿Sirve?</span>
            <button type="button" disabled={juzgar.isPending} onClick={() => juzgar.mutate(true)} className="min-h-8 rounded-[8px] border border-l-linea-2 px-2 disabled:opacity-50">Sí</button>
            <button type="button" disabled={juzgar.isPending} onClick={() => setAbierto((x) => !x)} aria-expanded={abierto} className="min-h-8 rounded-[8px] border border-l-linea-2 px-2 disabled:opacity-50">No</button>
          </span>
        )}
      </div>
      {abierto && !v && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Motivo">
          {MOTIVOS.map((m) => (
            <button key={m} type="button" aria-pressed={porque.startsWith(`${m}: `)} onClick={() => setPorque((x) => (x.startsWith(`${m}: `) ? x : `${m}: ${x.replace(/^[^:]{1,20}: /, "")}`))} className={`min-h-8 rounded-full border px-2 text-[12px] ${porque.startsWith(`${m}: `) ? "border-l-marca text-l-marca" : "border-l-linea-2"}`}>{m}</button>
          ))}
        </div>
      )}
      {abierto && !v && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (porque.trim().length >= 5) juzgar.mutate(false); }}>
          <label className="sr-only" htmlFor={`porque-${p.id}`}>Por qué no sirve</label>
          <input id={`porque-${p.id}`} value={porque} onChange={(e) => setPorque(e.target.value)} placeholder="Por qué no sirve (lo va a leer el agente la próxima vez)" className="min-h-8 min-w-0 flex-1 rounded-[8px] border border-l-linea-2 bg-transparent px-2 text-[12px]" />
          <button type="submit" disabled={porque.trim().length < 5 || juzgar.isPending} className="min-h-8 rounded-[8px] bg-l-marca px-2 text-[12px] font-semibold text-l-marca-tinta disabled:opacity-50">Guardar</button>
        </form>
      )}
      {juzgar.data && !juzgar.data.ok && <span className="text-l-atencion-texto" role="alert">{juzgar.data.motivo}</span>}
    </div>
  );
}

export function FilaPieza({ p }: { p: PiezaGenerada }) {
  const archivos = p.links.length > 1 ? p.links : p.driveLink ? [p.driveLink] : [];
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [cambios, setCambios] = useState("");
  const [link, setLink] = useState("");
  const vincular = useMutation({
    mutationFn: () => api.post<{ ok: boolean; motivo?: string }>("/contenido/productor/vincular", { deliverableId: p.id, permalink: link.trim() }),
    onSuccess: (r) => { if (r.ok) { setLink(""); void qc.invalidateQueries({ queryKey: ["lmtm", "contenido"] }); } },
  });
  const pedir = useMutation({
    mutationFn: (texto?: string) => api.post<RespuestaPedido>("/contenido/productor/cambios", { deliverableId: p.id, cambios: texto ?? cambios }),
    onSuccess: (r) => {
      if (r.ok) { setCambios(""); setAbierto(false); }
      void qc.invalidateQueries({ queryKey: ["lmtm", "contenido", "productor"] });
    },
  });
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 border-b border-l-linea px-3 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-l-tinta-3">
          {fecha(p.createdAt)} · {p.cliente ?? "sin cliente"} · {TIPO[p.kind] ?? p.kind}{p.origen ? ` · ${ORIGEN[p.origen] ?? p.origen}` : ""}
          {p.delProductor ? " · Productor" : ""}{p.reemplaza ? " · versión corregida" : ""}{p.movimiento ? ` · estilo ${p.movimiento}` : ""}
        </div>
        <div className="truncate text-[14px]" title={p.titulo}>{p.titulo.replace(/^(Video|Placa|Carrusel|Imagen): /, "")}</div>
        <div className="text-[12px] tabular-nums text-l-tinta-2">
          {p.gasto == null
            ? "Gasto sin registrar (generado antes del 11/10)"
            : p.gasto.map((g) => `${nombreHerramienta(g.herramienta)}: ${g.generaciones > 1 ? `${g.generaciones} generaciones, ` : ""}${costo(g)}`).join(" · ")}
        </div>
        <Calidad p={p} />
        {p.medidas?.map((m) => (
          <div key={m.momento} className="text-[12px] tabular-nums text-l-tinta-2">
            A {m.momento === "7d" ? "7 días" : "24 h"}: {[["alcance", m.alcance], ["guardados", m.guardados], ["compartidos", m.compartidos], ["comentarios", m.comentarios], ["reacciones", m.reacciones]].map(([n, v]) => `${v ?? "s/d"} ${n}`).join(" · ")}
          </div>
        ))}
        {p.delProductor && p.kind === "video" && (p.postLink ? (
          <a href={p.postLink} target="_blank" rel="noreferrer noopener" className="text-[12px] text-l-tinta-2 hover:text-l-tinta">Ver el posteo</a>
        ) : (
          <form className="mt-1 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (link.trim()) vincular.mutate(); }}>
            <label className="text-[12px] text-l-tinta-3" htmlFor={`post-${p.id}`}>¿Ya se publicó?</label>
            <input id={`post-${p.id}`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link del posteo, para medirlo" className="min-h-8 min-w-0 flex-1 rounded-[8px] border border-l-linea-2 bg-transparent px-2 text-[12px]" />
            <button type="submit" disabled={!link.trim() || vincular.isPending} className="min-h-8 rounded-[8px] border border-l-linea-2 px-2 text-[12px] disabled:opacity-50">Vincular</button>
            {vincular.data && !vincular.data.ok && <span className="w-full text-[12px] text-l-atencion-texto">{vincular.data.motivo}</span>}
          </form>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {archivos.map((l, i) => (
          <a key={l} href={l} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center gap-1 rounded-[8px] border border-l-linea-2 px-2.5 hover:border-l-tinta-3">
            <FolderOpen className="h-3.5 w-3.5" aria-hidden /> {archivos.length > 1 ? `Drive ${i + 1}` : "Drive"}
          </a>
        ))}
        {archivos.length === 0 && <span className="text-l-atencion-texto">Sin link de Drive</span>}
        {p.taskUrl && (
          <a href={p.taskUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center gap-1 rounded-[8px] px-2 text-l-tinta-2 hover:text-l-tinta">
            Tarea <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
        {p.delProductor && p.kind === "video" && (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="inline-flex min-h-9 items-center gap-1 rounded-[8px] border border-l-linea-2 px-2.5 hover:border-l-tinta-3"
          >
            <Wand2 className="h-3.5 w-3.5" aria-hidden /> Pedir cambios
          </button>
        )}
        {p.delProductor && p.kind === "video" && p.movimiento && (
          <button
            type="button"
            disabled={pedir.isPending}
            onClick={() => pedir.mutate(`Otro estilo de movimiento: que no sea «${p.movimiento}». Mismo guion, mismas tomas y mismas voces; cambiá solo "movimiento" en guion.json.`)}
            className="inline-flex min-h-9 items-center gap-1 rounded-[8px] border border-l-linea-2 px-2.5 hover:border-l-tinta-3 disabled:opacity-50"
          >
            Otro estilo
          </button>
        )}
      </div>
      {abierto && (
        <form
          className="flex w-full flex-col gap-2"
          onSubmit={(e) => { e.preventDefault(); if (cambios.trim().length >= 5) pedir.mutate(undefined); }}
        >
          <label className="text-[13px] text-l-tinta-2" htmlFor={`cambios-${p.id}`}>Qué cambiar (el resto queda igual y no se rehace)</label>
          <textarea
            id={`cambios-${p.id}`}
            value={cambios}
            onChange={(e) => setCambios(e.target.value)}
            rows={2}
            placeholder="En «los fabricamos» mostrá la fábrica; el cierre con «Pedí tu presupuesto»."
            className="w-full min-w-0 rounded-[8px] border border-l-linea-2 bg-l-sup px-3 py-2 text-[14px]"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={cambios.trim().length < 5 || pedir.isPending} className="inline-flex min-h-9 items-center gap-1.5 rounded-[8px] bg-l-marca px-3 text-[14px] font-semibold text-l-marca-tinta disabled:opacity-50">
              {pedir.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Enviar al Productor
            </button>
            {pedir.data && <span className={`text-[13px] ${pedir.data.ok ? "text-l-tinta-2" : "text-l-critico-texto"}`} role="status">{pedir.data.mensaje}</span>}
            {pedir.error && <span className="text-[13px] text-l-critico-texto" role="alert">{pedir.error instanceof Error ? pedir.error.message : "No se pudo pedir"}</span>}
          </div>
        </form>
      )}
      {!abierto && pedir.data?.ok && <p className="w-full text-[13px] text-l-tinta-2" role="status">{pedir.data.mensaje}</p>}
    </li>
  );
}
