// LMTM: Contenido generado (pedido 11/10). Todo lo que produjeron Higgsfield y
// Magnific —por la etiqueta de ClickUp, desde el panel o pedido por Claude—,
// con su link de Drive, y lo que gastó cada herramienta. Las unidades NO se
// suman entre herramientas: el plan, la API y Magnific son bolsas distintas.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, ExternalLink, FolderOpen, Loader2, OctagonAlert, Search, Wand2 } from "lucide-react";
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
interface PedidoProductor {
  id: string;
  identifier: string | null;
  titulo: string;
  estado: string;
  creado: string;
  actualizado: string;
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
const ESTADO: Record<string, string> = {
  backlog: "En cola", todo: "En cola", in_progress: "Produciendo", in_review: "En revisión",
  blocked: "Frenado: mirá la tarea", done: "Listo", cancelled: "Cancelado",
};
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
        bajada="Producción y edición: pedile piezas nuevas al Productor, pasale crudos al Editor y mirá lo que entregaron"
        derecha={
          <div className="flex gap-1" role="group" aria-label="Período">
            {PERIODOS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDias(n)}
                aria-pressed={dias === n}
                className={`min-h-9 rounded-full px-3 text-[13px] ${dias === n ? "bg-l-marca-suave font-semibold text-l-marca" : "text-l-tinta-2 hover:bg-l-sup"}`}
              >
                {n === 365 ? "1 año" : `${n} días`}
              </button>
            ))}
          </div>
        }
      />
      <PestanasProduccion />
      <div className="space-y-8 px-4 pb-10 md:px-8">
        {/* Rediseño 20/11 (Naza): «en contenido solo lo de edición y lo de producción, bien intuitivo». */}
        <div className="grid gap-6 lg:grid-cols-2">
          <PedirVideo />
          <PedirAlEditor />
        </div>
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
            <TituloFranja>Lo que entregaron · {visibles.length}</TituloFranja>
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

/**
 * Los pedidos al Productor o al Editor (20/11: «info clara»): sin los cancelados, los 6 más nuevos a la vista y el
 * resto a un clic. Antes eran dos copias de la misma lista, con todo junto.
 */
function ListaPedidos({ pedidos }: { pedidos: PedidoProductor[] }) {
  const [todos, setTodos] = useState(false);
  const vivos = pedidos.filter((p) => p.estado !== "cancelled");
  if (vivos.length === 0) return null;
  const visibles = todos ? vivos : vivos.slice(0, 6);
  return (
    <div className="mt-3 border-t border-l-linea pt-2">
      <p className="text-[12px] font-semibold text-l-tinta-3">Pedidos · {vivos.length}</p>
      <ul>
        {visibles.map((p) => (
          <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1 text-[13px]">
            <span className="min-w-0 flex-1 truncate" title={p.titulo}>{p.identifier ? `${p.identifier} · ` : ""}{p.titulo}</span>
            <span className={`tabular-nums ${p.estado === "blocked" ? "text-l-atencion-texto" : "text-l-tinta-3"}`}>{ESTADO[p.estado] ?? p.estado} · {fecha(p.creado)}</span>
          </li>
        ))}
      </ul>
      {vivos.length > 6 && (
        <button type="button" onClick={() => setTodos((v) => !v)} className="mt-1 min-h-9 text-[13px] font-semibold text-l-marca">
          {todos ? "Ver menos" : `Ver los ${vivos.length}`}
        </button>
      )}
    </div>
  );
}

/** Pedido de un video al Productor de contenido y lo que tiene en curso. */
function PedirVideo() {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [pedido, setPedido] = useState("");
  const clientes = useQuery({ queryKey: ["clients", "para-pedidos"], queryFn: () => clientsApi.list("active") });
  const pedidos = useQuery({
    queryKey: ["lmtm", "contenido", "productor"],
    queryFn: () => api.get<{ pedidos: PedidoProductor[] }>("/contenido/productor/pedidos"),
    refetchInterval: 60_000,
  });
  const pedir = useMutation({
    mutationFn: () => api.post<RespuestaPedido>("/contenido/productor/pedido", { clientId, pedido }),
    onSuccess: (r) => {
      if (r.ok) setPedido("");
      void qc.invalidateQueries({ queryKey: ["lmtm", "contenido", "productor"] });
    },
  });
  const lista = [...(clientes.data?.clients ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <section>
      <TituloFranja>Producción · pedile una pieza al Productor</TituloFranja>
      <Tarjeta>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => { e.preventDefault(); if (clientId && pedido.trim().length >= 10) pedir.mutate(); }}
        >
          <div className="flex flex-wrap gap-2">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-9 min-w-0 rounded-[8px] border border-l-linea-2 bg-l-sup px-2 text-[14px]" aria-label="Cliente" required>
              <option value="">Elegí el cliente</option>
              {lista.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <label className="text-[13px] text-l-tinta-2" htmlFor="pedido-video">Qué video querés: producto, para qué, y si hay material (link de Drive)</label>
          <textarea
            id="pedido-video"
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            rows={3}
            placeholder="Reel de 25 s de los placares a medida, para pauta. Material: https://drive.google.com/…"
            className="w-full min-w-0 rounded-[8px] border border-l-linea-2 bg-l-sup px-3 py-2 text-[14px]"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!clientId || pedido.trim().length < 10 || pedir.isPending}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-[8px] bg-l-marca px-3 text-[14px] font-semibold text-l-marca-tinta disabled:opacity-50"
            >
              {pedir.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Clapperboard className="h-4 w-4" aria-hidden />} Pedir el video
            </button>
            {pedir.data && <span className={`text-[13px] ${pedir.data.ok ? "text-l-tinta-2" : "text-l-critico-texto"}`} role="status">{pedir.data.mensaje}</span>}
            {pedir.error && <span className="text-[13px] text-l-critico-texto" role="alert">{pedir.error instanceof Error ? pedir.error.message : "No se pudo pedir"}</span>}
          </div>
          <p className="text-[12px] text-l-tinta-3">Cada pedido es una corrida del agente: gasta OpenAI y voces de Gemini. Para corregir un video ya hecho, usá «Pedir cambios» en el video (sale mucho más barato que pedirlo de nuevo).</p>
        </form>
        <ListaPedidos pedidos={pedidos.data?.pedidos ?? []} />
      </Tarjeta>
    </section>
  );
}

interface CarpetaCrudos { cliente: string; clientId: string; carpeta: string; videos: number; mb: number; fecha: string }

/** Plan 17/11: «en el cliente X, carpeta X, tenés los crudos de hoy: dejalos listos para redes». */
function PedirAlEditor() {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [ruta, setRuta] = useState("");
  const [pedido, setPedido] = useState("");
  const clientes = useQuery({ queryKey: ["clients", "para-pedidos"], queryFn: () => clientsApi.list("active") });
  // Sin cliente: lo nuevo de todos (7 días). Con cliente: sus carpetas de crudos de 60 días, para no tipear la ruta.
  const crudos = useQuery({
    queryKey: ["lmtm", "contenido", "crudos", clientId],
    queryFn: () => api.get<{ carpetas: CarpetaCrudos[] }>(`/contenido/crudos-nuevos?${clientId ? `dias=60&clientId=${encodeURIComponent(clientId)}` : "dias=7"}`),
  });
  const pedidos = useQuery({
    queryKey: ["lmtm", "contenido", "editor"],
    queryFn: () => api.get<{ pedidos: PedidoProductor[] }>("/contenido/editor/pedidos"),
    refetchInterval: 60_000,
  });
  const pedir = useMutation({
    mutationFn: () => api.post<RespuestaPedido>("/contenido/editor/pedido", { clientId, ruta: ruta.trim(), pedido }),
    onSuccess: (r) => {
      if (r.ok) { setPedido(""); setRuta(""); }
      void qc.invalidateQueries({ queryKey: ["lmtm", "contenido", "editor"] });
    },
  });
  const lista = [...(clientes.data?.clients ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const nuevas = (crudos.data?.carpetas ?? []).filter((c) => !clientId || c.clientId === clientId).slice(0, clientId ? 15 : 8);
  const valida = !!clientId && ruta.trim().startsWith("/LMTM/");
  return (
    <section>
      <TituloFranja>Edición · pasale los crudos al Editor</TituloFranja>
      <Tarjeta>
        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (valida) pedir.mutate(); }}>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-9 min-w-0 rounded-[8px] border border-l-linea-2 bg-l-sup px-2 text-[14px]" aria-label="Cliente" required>
            <option value="">Elegí el cliente</option>
            {lista.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {nuevas.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-l-tinta-2">{clientId ? "Crudos de este cliente en el NAS (últimos 60 días)" : "Crudos nuevos en el NAS (últimos 7 días)"}: tocá uno</span>
              <ul className="flex flex-col gap-1">
                {nuevas.map((c) => (
                  <li key={c.carpeta}>
                    <button type="button" onClick={() => { setClientId(c.clientId); setRuta(c.carpeta); }} aria-pressed={ruta === c.carpeta} className={`w-full min-w-0 rounded-[8px] border px-2 py-1 text-left text-[13px] ${ruta === c.carpeta ? "border-l-marca" : "border-l-linea-2"}`}>
                      <span className="font-semibold">{c.cliente}</span> · {c.videos} videos · {c.mb >= 1000 ? `${(c.mb / 1000).toFixed(1)} GB` : `${c.mb} MB`} · {c.fecha}
                      <span className="block truncate text-l-tinta-3" title={c.carpeta}>{c.carpeta}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {clientId && crudos.isSuccess && nuevas.length === 0 && (
            <p className="text-[13px] text-l-tinta-3">No hay carpetas de crudos de este cliente en el NAS en los últimos 60 días: escribí la ruta.</p>
          )}
          <label className="text-[13px] text-l-tinta-2" htmlFor="ruta-crudos">Carpeta del NAS con los crudos</label>
          <input id="ruta-crudos" value={ruta} onChange={(e) => setRuta(e.target.value)} placeholder="/LMTM/Clientes/<Cliente>/VIDEO/PROYECTOS/<proyecto>/RECURSOS/CRUDOS" className="h-9 w-full min-w-0 rounded-[8px] border border-l-linea-2 bg-l-sup px-2 text-[14px]" />
          <label className="text-[13px] text-l-tinta-2" htmlFor="pedido-editor">Algo puntual (opcional): cuántas piezas, de qué producto, para qué</label>
          <textarea id="pedido-editor" value={pedido} onChange={(e) => setPedido(e.target.value)} rows={2} placeholder="Sacá 3 reels: uno de cada ambiente y un testimonio" className="w-full min-w-0 rounded-[8px] border border-l-linea-2 bg-l-sup px-3 py-2 text-[14px]" />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!valida || pedir.isPending} className="inline-flex min-h-9 items-center gap-1.5 rounded-[8px] bg-l-marca px-3 text-[14px] font-semibold text-l-marca-tinta disabled:opacity-50">
              {pedir.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FolderOpen className="h-4 w-4" aria-hidden />} Pasarle los crudos
            </button>
            {pedir.data && <span className={`text-[13px] ${pedir.data.ok ? "text-l-tinta-2" : "text-l-critico-texto"}`} role="status">{pedir.data.mensaje}</span>}
            {pedir.error && <span className="text-[13px] text-l-critico-texto" role="alert">{pedir.error instanceof Error ? pedir.error.message : "No se pudo pedir"}</span>}
          </div>
          <p className="text-[12px] text-l-tinta-3">Las piezas vuelven a esta pantalla para validar (filtro «Videos sin validar») y quedan en Drive, en la carpeta VIDEOS del cliente.</p>
        </form>
        <ListaPedidos pedidos={pedidos.data?.pedidos ?? []} />
      </Tarjeta>
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
