// LMTM: Contenido generado (pedido 11/10). Todo lo que produjeron Higgsfield y
// Magnific —por la etiqueta de ClickUp, desde el panel o pedido por Claude—,
// con su link de Drive, y lo que gastó cada herramienta. Las unidades NO se
// suman entre herramientas: el plan, la API y Magnific son bolsas distintas.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FolderOpen, Loader2, OctagonAlert, Search } from "lucide-react";
import { Link } from "@/lib/router";
import { api } from "../api/client";
import { Encabezado } from "./Shell";
import { Tarjeta, TituloFranja } from "./HoyApp";

interface TotalHerramienta {
  herramienta: string;
  generaciones: number;
  creditos: number | null;
  usd: number | null;
  sinCosto: number;
  noEntregadas: number;
}
interface PiezaGenerada {
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
    && (!texto || p.titulo.toLowerCase().includes(texto) || (p.cliente ?? "").toLowerCase().includes(texto)));

  return (
    <>
      <Encabezado
        titulo="Contenido generado"
        bajada={<>Lo que generaron Higgsfield y Magnific, con su link de Drive y lo que gastó · <Link to="/contenido" className="hover:text-l-marca">volver a Contenido</Link></>}
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
      <div className="space-y-8 px-4 pb-10 md:px-8">
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
            <TituloFranja>Gasto por herramienta · últimos {d.dias} días</TituloFranja>
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.keys(HERRAMIENTAS).map((h) => (
                <TarjetaHerramienta key={h} h={h} t={d.totales.find((x) => x.herramienta === h)} e={estado.data} />
              ))}
            </div>
            <p className="mt-2 text-[12px] text-l-tinta-3">
              El costo es el que cotiza cada herramienta al momento de pedir. Las bolsas no se suman entre sí. Lo generado antes del 11/10 no tiene el gasto registrado.
            </p>
          </section>
        )}

        {d && d.porCliente.length > 0 && (
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

        {d && (
          <section>
            <TituloFranja>Piezas · {visibles.length}</TituloFranja>
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
      </div>
    </>
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
          <div className="text-[13px] tabular-nums text-l-tinta-2">{h === "magnific" && t.creditos == null && t.usd == null ? "Magnific no informa el costo por pedido" : costo(t)}</div>
          {t.noEntregadas > 0 && (
            <div className="mt-1 text-[12px] text-l-atencion-texto">{t.noEntregadas} pagadas que no terminaron en una pieza</div>
          )}
        </>
      ) : (
        <div className="mt-1 text-[13px] text-l-tinta-3">{sinConfigurar ? "Sin configurar" : "Sin uso en el período"}</div>
      )}
      {saldo && <div className="mt-2 border-t border-l-linea pt-2 text-[12px] text-l-tinta-3">{saldo}</div>}
    </Tarjeta>
  );
}

function FilaPieza({ p }: { p: PiezaGenerada }) {
  const archivos = p.links.length > 1 ? p.links : p.driveLink ? [p.driveLink] : [];
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 border-b border-l-linea px-3 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-l-tinta-3">
          {fecha(p.createdAt)} · {p.cliente ?? "sin cliente"} · {TIPO[p.kind] ?? p.kind}{p.origen ? ` · ${ORIGEN[p.origen] ?? p.origen}` : ""}
        </div>
        <div className="truncate text-[14px]" title={p.titulo}>{p.titulo.replace(/^(Video|Placa|Carrusel|Imagen): /, "")}</div>
        <div className="text-[12px] tabular-nums text-l-tinta-2">
          {p.gasto == null
            ? "Gasto sin registrar (generado antes del 11/10)"
            : p.gasto.map((g) => `${nombreHerramienta(g.herramienta)}: ${g.generaciones > 1 ? `${g.generaciones} generaciones, ` : ""}${costo(g)}`).join(" · ")}
        </div>
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
      </div>
    </li>
  );
}
