// LMTM: Clientes. La cartera como tabla en escritorio (ordenable, con filtros y
// búsqueda) y como lista en el celular. Rediseño 20/11: tres vistas (Todo, Pauta,
// Contenido) y las acciones de cada cliente en su fila, sin entrar a la ficha.
// Pauta sale de `/api/cartera` (metricas); contenido, del tablero de ClickUp y de
// los posts que no salieron.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, Hourglass, OctagonAlert, Search, Unplug, X } from "lucide-react";
import { Link } from "@/lib/router";
import { api } from "../api/client";
import { carteraApi, type FilaCartera } from "../api/informes";
import { EstadoObjetivoMarca } from "../lmtm/componentes";
import { etiquetaResponsable, pesos } from "../lmtm/formato";
import { Encabezado } from "./Shell";

const NOMBRE_FUENTE = { meta_ads: "Meta", google_ads: "Google", organico: "Redes" } as const;
const ESTADO_FUENTE = { fallando: "fallando", atrasada: "atrasada", sin_conexion: "se desconectó", sin_entrega: "sin pauta", ok: "al día" } as const;
const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

type Vista = "todo" | "pauta" | "contenido";
interface Contenido { programadas: number; sinCompletar: number; noSalieron: number }
type Fila = FilaCartera & { contenido: Contenido };

type Filtro = "todos" | "con_pauta" | "decidir" | "arriba" | "datos" | "contenido" | "sin_pauta";
const FILTROS: Array<{ k: Filtro; label: string; pasa: (f: Fila) => boolean }> = [
  { k: "todos", label: "Todos", pasa: () => true },
  { k: "con_pauta", label: "Con pauta", pasa: (f) => !f.sinPauta },
  { k: "decidir", label: "Para decidir", pasa: (f) => f.decisiones > 0 },
  { k: "arriba", label: "Arriba del objetivo", pasa: (f) => f.estado === "arriba" || f.estado === "muy_arriba" },
  { k: "datos", label: "Datos con problemas", pasa: (f) => f.fuentesConProblemas.length > 0 },
  { k: "contenido", label: "Contenido trabado", pasa: (f) => f.contenido.sinCompletar > 0 || f.contenido.noSalieron > 0 },
  { k: "sin_pauta", label: "Sin pauta", pasa: (f) => f.sinPauta && f.decisiones === 0 },
];

type Orden = "plata" | "cpl" | "decisiones" | "nombre" | "contenido";

/** Puro. Lo de contenido de cada cliente: piezas de los próximos 7 días y posts que no salieron. */
export function contenidoPorCliente(
  piezas: Array<{ clientId: string; date: string; readyToPublish: boolean }>,
  trabadas: Array<{ clientId: string | null }>,
  ahora = Date.now(),
): Map<string, Contenido> {
  const m = new Map<string, Contenido>();
  const de = (id: string) => m.get(id) ?? m.set(id, { programadas: 0, sinCompletar: 0, noSalieron: 0 }).get(id)!;
  for (const p of piezas) {
    const t = new Date(p.date).getTime();
    if (t < ahora - 86_400_000 || t > ahora + 7 * 86_400_000) continue;
    const c = de(p.clientId);
    c.programadas += 1;
    if (!p.readyToPublish) c.sinCompletar += 1;
  }
  for (const t of trabadas) if (t.clientId) de(t.clientId).noSalieron += 1;
  return m;
}

export function ClientesApp() {
  const { data, isLoading, error } = useQuery({ queryKey: ["lmtm", "cartera"], queryFn: () => carteraApi.leer(), staleTime: 3 * 60_000 });
  const tablero = useQuery({
    queryKey: ["lmtm", "contenido", "tablero"],
    queryFn: () => api.get<{ piezas: Array<{ clientId: string; date: string; readyToPublish: boolean }> }>("/contenido/tablero?dias=14"),
    staleTime: 5 * 60_000,
  });
  const trabadas = useQuery({
    queryKey: ["lmtm", "publicacion", "trabadas"],
    queryFn: () => api.get<{ trabadas: Array<{ clientId: string | null }> }>("/publicacion/trabadas"),
    staleTime: 5 * 60_000,
  });
  const [vista, setVista] = useState<Vista>("todo");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [orden, setOrden] = useState<Orden>("plata");
  const [buscar, setBuscar] = useState("");

  const todas = useMemo<Fila[]>(() => {
    const cont = contenidoPorCliente(tablero.data?.piezas ?? [], trabadas.data?.trabadas ?? []);
    return (data?.clientes ?? []).map((f) => ({ ...f, contenido: cont.get(f.clientId) ?? { programadas: 0, sinCompletar: 0, noSalieron: 0 } }));
  }, [data, tablero.data, trabadas.data]);

  const filas = useMemo(() => {
    const texto = buscar.trim().toLowerCase();
    const f = todas.filter(FILTROS.find((x) => x.k === filtro)!.pasa).filter((c) => !texto || c.cliente.toLowerCase().includes(texto));
    const num = (n: number | null) => n ?? -1;
    const trabado = (x: Fila) => x.contenido.sinCompletar + x.contenido.noSalieron;
    return [...f].sort((a, b) =>
      orden === "nombre"
        ? a.cliente.localeCompare(b.cliente)
        : orden === "cpl"
          ? num(b.semana.cpl) - num(a.semana.cpl)
          : orden === "decisiones"
            ? b.decisiones - a.decisiones
            : orden === "contenido"
              ? trabado(b) - trabado(a)
              : num(b.plataEnRiesgo) - num(a.plataEnRiesgo),
    );
  }, [todas, filtro, orden, buscar]);

  const columnas = vista === "pauta" ? "minmax(160px,1.2fr) minmax(200px,1.4fr) minmax(130px,1fr) minmax(200px,1.6fr) 120px 210px"
    : vista === "contenido" ? "minmax(160px,1.4fr) 140px 140px 140px 210px"
    : "minmax(160px,1.2fr) minmax(200px,1.4fr) 120px 150px 120px 210px";

  return (
    <>
      <Encabezado
        titulo="Clientes"
        bajada={data ? `Semana del ${fechaCorta(data.semana.desde)} al ${fechaCorta(data.semana.hasta)} · ${data.clientes.length} activos` : undefined}
        derecha={
          <div className="inline-flex gap-1 rounded-[14px] bg-l-sup p-1" role="tablist" aria-label="Vista">
            {(["todo", "pauta", "contenido"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={vista === v}
                onClick={() => {
                  setVista(v);
                  if (v === "contenido" && orden !== "nombre") setOrden("contenido");
                  if (v !== "contenido" && orden === "contenido") setOrden("plata");
                }}
                className={`min-h-10 rounded-[10px] px-4 text-[14px] ${vista === v ? "bg-l-papel font-semibold text-l-tinta" : "font-medium text-l-tinta-2 hover:text-l-tinta"}`}
              >
                {v === "todo" ? "Todo" : v === "pauta" ? "Pauta" : "Contenido"}
              </button>
            ))}
          </div>
        }
      />
      <div className="px-4 md:px-8">
        {isLoading && <p className="text-[14px] text-l-tinta-3" role="status">Leyendo las métricas de cada cliente…</p>}
        {error && (
          <p className="flex gap-1.5 text-[14px] text-l-critico-texto" role="alert">
            <OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> No se pudo cargar: {error instanceof Error ? error.message : "error"}
          </p>
        )}
        {data && (
          <>
            {data.sinLeer.length > 0 && <p className="mb-3 text-[13px] text-l-tinta-2">No se pudieron leer las métricas de {data.sinLeer.join(", ")}.</p>}
            {vista !== "pauta" && (tablero.error || trabadas.error) && <p className="mb-3 text-[13px] text-l-tinta-2">No se pudo leer el contenido de ClickUp: esa parte puede faltar.</p>}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtrar clientes">
                {FILTROS.map((f) => {
                  const n = todas.filter(f.pasa).length;
                  const activo = f.k === filtro;
                  return (
                    <button
                      key={f.k}
                      type="button"
                      role="tab"
                      aria-selected={activo}
                      onClick={() => setFiltro(f.k)}
                      className={`min-h-9 shrink-0 rounded-full border px-3.5 text-[13px] ${activo ? "border-transparent bg-[image:var(--l-marca-grad)] font-semibold text-l-marca-tinta" : "border-l-linea-2 text-l-tinta-2"}`}
                    >
                      {f.label} <span className={activo ? "opacity-70" : "text-l-tinta-3"}>{n}</span>
                    </button>
                  );
                })}
              </div>
              <label className="relative ml-auto min-w-[180px] flex-1 sm:max-w-[260px]">
                <span className="sr-only">Buscar cliente</span>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-l-tinta-3" aria-hidden />
                <input
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Buscar cliente"
                  className="h-10 w-full rounded-full border border-l-linea-2 bg-l-sup pl-8 pr-3 text-[13px] outline-none focus:border-l-marca"
                />
              </label>
            </div>

            {/* Escritorio: tabla */}
            <div className="hidden overflow-x-auto rounded-[20px] border border-l-linea bg-l-sup p-2 md:block">
              <div className="min-w-[960px]" role="table" aria-label="Clientes">
                <div role="row" className="grid items-center gap-4 px-3 py-2.5 text-[12px] text-l-tinta-3" style={{ gridTemplateColumns: columnas }}>
                  <Th activo={orden === "nombre"} onClick={() => setOrden("nombre")}>Cliente</Th>
                  {vista !== "contenido" && <Th activo={orden === "cpl"} onClick={() => setOrden("cpl")}>Costo por consulta</Th>}
                  {vista === "pauta" && <span role="columnheader" className="font-medium">Datos</span>}
                  {vista === "pauta" && <Th activo={orden === "decisiones"} onClick={() => setOrden("decisiones")}>Próxima decisión</Th>}
                  {vista === "todo" && <Th activo={orden === "decisiones"} onClick={() => setOrden("decisiones")}>Para decidir</Th>}
                  {vista !== "pauta" && <Th activo={orden === "contenido"} onClick={() => setOrden("contenido")}>Posts 7 días</Th>}
                  {vista === "contenido" && <span role="columnheader" className="font-medium">Sin completar</span>}
                  {vista !== "pauta" && <span role="columnheader" className="font-medium">No salieron</span>}
                  {vista === "pauta" && <Th activo={orden === "plata"} onClick={() => setOrden("plata")} derecha>Plata en juego</Th>}
                  <span role="columnheader" className="sr-only">Acciones</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {filas.map((f) => (
                    <div key={f.clientId} role="row" className="grid items-center gap-4 rounded-[14px] bg-l-papel/50 px-3 py-3 hover:bg-l-papel" style={{ gridTemplateColumns: columnas }}>
                      <span role="cell" className="min-w-0">
                        <Link to={`/clientes/${f.slug}`} className="font-semibold text-l-tinta hover:text-l-marca">
                          {f.cliente}
                        </Link>
                      </span>
                      {vista !== "contenido" && (
                        <span role="cell">
                          <Cpl f={f} />
                        </span>
                      )}
                      {vista === "pauta" && (
                        <span role="cell">
                          <Fuentes f={f} />
                        </span>
                      )}
                      {vista === "pauta" && (
                        <span role="cell" className="text-[13px] text-l-tinta-2">
                          {f.proxima ? (
                            <>
                              <span className="text-l-tinta">{f.proxima.que}</span>
                              <span className="text-l-tinta-3">
                                {" · "}
                                {etiquetaResponsable(f.proxima.responsable).toLowerCase()}
                                {f.decisiones > 1 ? ` · y ${f.decisiones - 1} más` : ""}
                              </span>
                            </>
                          ) : (
                            <span className="text-l-tinta-3">—</span>
                          )}
                        </span>
                      )}
                      {vista === "todo" && (
                        <span role="cell">
                          {f.decisiones > 0 ? <span className="rounded-full bg-l-marca-suave px-2.5 py-0.5 text-[12px] font-semibold text-l-tinta">{f.decisiones}</span> : <span className="text-l-tinta-3">—</span>}
                        </span>
                      )}
                      {vista !== "pauta" && (
                        <span role="cell" className="text-[14px] tabular-nums">
                          {f.contenido.programadas}
                          {vista === "todo" && f.contenido.sinCompletar > 0 && <span className="text-[12px] text-l-atencion-texto"> · {f.contenido.sinCompletar} sin completar</span>}
                        </span>
                      )}
                      {vista === "contenido" && (
                        <span role="cell" className={`text-[14px] tabular-nums ${f.contenido.sinCompletar ? "font-semibold text-l-atencion-texto" : "text-l-tinta-3"}`}>{f.contenido.sinCompletar}</span>
                      )}
                      {vista !== "pauta" && (
                        <span role="cell" className={`text-[14px] tabular-nums ${f.contenido.noSalieron ? "font-semibold text-l-critico-texto" : "text-l-tinta-3"}`}>{f.contenido.noSalieron}</span>
                      )}
                      {vista === "pauta" && (
                        <span role="cell" className="whitespace-nowrap text-right font-semibold tabular-nums">
                          {f.plataEnRiesgo != null ? pesos(f.plataEnRiesgo) : <span className="font-normal italic text-l-tinta-3">{f.decisiones > 0 ? "sin dato" : ""}</span>}
                          {f.plataEnRiesgo != null && <span className="block text-[11px] font-normal text-l-tinta-3">por día</span>}
                        </span>
                      )}
                      <span role="cell">
                        <AccionesFila slug={f.slug} cliente={f.cliente} vista={vista} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Celular: lista */}
            <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup md:hidden">
              {filas.map((f) => (
                <li key={f.clientId} className="border-b border-l-linea px-4 py-3.5 last:border-b-0">
                  <Link to={`/clientes/${f.slug}`} className="grid grid-cols-[1fr_auto] gap-x-3 text-inherit">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold uppercase tracking-[0.06em]">{f.cliente}</div>
                      {vista !== "contenido" && (
                        <div className="mt-0.5">
                          <Cpl f={f} />
                        </div>
                      )}
                      {vista === "pauta" && <Fuentes f={f} />}
                      {vista !== "pauta" && (
                        <div className="mt-0.5 text-[13px] text-l-tinta-2">
                          {f.contenido.programadas} posts en 7 días{f.contenido.sinCompletar ? ` · ${f.contenido.sinCompletar} sin completar` : ""}
                          {f.contenido.noSalieron ? ` · ${f.contenido.noSalieron} no salieron` : ""}
                        </div>
                      )}
                      {vista === "pauta" && f.proxima && <div className="mt-1 line-clamp-2 text-[13px] text-l-tinta-2">{f.proxima.que}</div>}
                    </div>
                    <div className="text-right">
                      {f.decisiones > 0 && <div className="text-[12px] font-semibold text-l-marca">{f.decisiones} para decidir</div>}
                      {vista === "pauta" && f.plataEnRiesgo != null && (
                        <>
                          <div className="whitespace-nowrap text-[17px] font-semibold">{pesos(f.plataEnRiesgo)}</div>
                          <div className="text-[11px] text-l-tinta-3">por día</div>
                        </>
                      )}
                    </div>
                  </Link>
                  <div className="mt-2">
                    <AccionesFila slug={f.slug} cliente={f.cliente} vista={vista} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

/** Lo de todos los días con un cliente, sin entrar a la ficha. */
function AccionesFila({ slug, cliente, vista }: { slug: string; cliente: string; vista: Vista }) {
  const clase = "inline-flex min-h-9 items-center rounded-[10px] border border-l-linea-2 px-3 text-[13px] text-l-tinta-2 hover:border-l-marca hover:text-l-tinta";
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      <Link to={`/clientes/${slug}/agentes`} className={clase} aria-label={`Pedirle algo a un agente para ${cliente}`}>
        Pedir
      </Link>
      {vista === "pauta" ? (
        <Link to={`/clientes/${slug}/dashboard`} className={clase} aria-label={`Campañas de ${cliente}`}>
          Campañas
        </Link>
      ) : (
        <Link to={`/clientes/${slug}/calendario`} className={clase} aria-label={`Calendario de ${cliente}`}>
          Calendario
        </Link>
      )}
    </span>
  );
}

function Th({ children, activo, onClick, derecha }: { children: React.ReactNode; activo: boolean; onClick: () => void; derecha?: boolean }) {
  return (
    <span role="columnheader" className={`font-medium ${derecha ? "text-right" : ""}`} aria-sort={activo ? "descending" : "none"}>
      <button type="button" onClick={onClick} className={`inline-flex min-h-8 items-center gap-1 ${activo ? "font-semibold text-l-tinta" : "hover:text-l-tinta"}`}>
        {children}
        {activo && <ArrowDown className="h-3 w-3" aria-hidden />}
      </button>
    </span>
  );
}

function Cpl({ f }: { f: FilaCartera }) {
  const s = f.semana;
  if (f.sinPauta) return <span className="text-[13px] text-l-tinta-3">Sin cuenta de pauta conectada</span>;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {s.cpl != null ? <span className="font-medium tabular-nums">{pesos(s.cpl)}</span> : <span className="text-l-tinta-3">{s.leads === 0 ? "sin consultas" : "sin dato"}</span>}
      <EstadoObjetivoMarca e={f.estado} chico />
      {s.objetivo != null && <span className="text-[12px] text-l-tinta-3">objetivo {pesos(s.objetivo)}</span>}
      {s.leadsDudosos && <span className="text-[12px] text-l-tinta-3">· Google dudoso</span>}
    </div>
  );
}

function Fuentes({ f }: { f: FilaCartera }) {
  if (f.fuentesConProblemas.length === 0) return <span className="text-[13px] text-l-tinta-3">{f.sinPauta ? "" : "al día"}</span>;
  return (
    <div className="flex flex-wrap gap-x-3 text-[13px] text-l-tinta-2">
      {f.fuentesConProblemas.map((p) => {
        const Icono = p.estado === "sin_conexion" ? Unplug : p.estado === "fallando" ? X : Hourglass;
        return (
          <span key={p.fuente} className="inline-flex items-center gap-1">
            <Icono className="h-3.5 w-3.5" style={{ color: p.estado === "fallando" ? "var(--l-critico)" : "var(--l-atencion)" }} aria-hidden />
            {NOMBRE_FUENTE[p.fuente]}: {ESTADO_FUENTE[p.estado]}
          </span>
        );
      })}
    </div>
  );
}
