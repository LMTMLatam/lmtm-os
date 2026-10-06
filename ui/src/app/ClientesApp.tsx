// LMTM: Clientes (fase C1). La cartera como tabla para escritorio (ordenable,
// con filtros y búsqueda) y como lista en el celular. Mismos números que
// Cartera de B3 (`/api/cartera`, que sale de metricas).

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, Hourglass, OctagonAlert, Search, Unplug, X } from "lucide-react";
import { Link } from "@/lib/router";
import { carteraApi, type FilaCartera } from "../api/informes";
import { EstadoObjetivoMarca } from "../lmtm/componentes";
import { etiquetaResponsable, pesos } from "../lmtm/formato";
import { Encabezado } from "./Shell";

const NOMBRE_FUENTE = { meta_ads: "Meta", google_ads: "Google", organico: "Redes" } as const;
const ESTADO_FUENTE = { fallando: "fallando", atrasada: "atrasada", sin_conexion: "se desconectó", sin_entrega: "sin pauta", ok: "al día" } as const;
const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

type Filtro = "todos" | "decidir" | "arriba" | "datos" | "sin_pauta";
const FILTROS: Array<{ k: Filtro; label: string; pasa: (f: FilaCartera) => boolean }> = [
  { k: "todos", label: "Con pauta", pasa: (f) => !f.sinPauta || f.decisiones > 0 },
  { k: "decidir", label: "Para decidir", pasa: (f) => f.decisiones > 0 },
  { k: "arriba", label: "Arriba del objetivo", pasa: (f) => f.estado === "arriba" || f.estado === "muy_arriba" },
  { k: "datos", label: "Datos con problemas", pasa: (f) => f.fuentesConProblemas.length > 0 },
  { k: "sin_pauta", label: "Sin pauta", pasa: (f) => f.sinPauta && f.decisiones === 0 },
];

type Orden = "plata" | "cpl" | "decisiones" | "nombre";

export function ClientesApp() {
  const { data, isLoading, error } = useQuery({ queryKey: ["lmtm", "cartera"], queryFn: () => carteraApi.leer(), staleTime: 3 * 60_000 });
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [orden, setOrden] = useState<Orden>("plata");
  const [buscar, setBuscar] = useState("");

  const filas = useMemo(() => {
    const texto = buscar.trim().toLowerCase();
    const f = (data?.clientes ?? []).filter(FILTROS.find((x) => x.k === filtro)!.pasa).filter((c) => !texto || c.cliente.toLowerCase().includes(texto));
    const num = (n: number | null) => n ?? -1;
    return [...f].sort((a, b) =>
      orden === "nombre"
        ? a.cliente.localeCompare(b.cliente)
        : orden === "cpl"
          ? num(b.semana.cpl) - num(a.semana.cpl)
          : orden === "decisiones"
            ? b.decisiones - a.decisiones
            : num(b.plataEnRiesgo) - num(a.plataEnRiesgo),
    );
  }, [data, filtro, orden, buscar]);

  return (
    <>
      <Encabezado
        titulo="Clientes"
        bajada={data ? `Semana del ${fechaCorta(data.semana.desde)} al ${fechaCorta(data.semana.hasta)} · ${data.clientes.length} activos` : undefined}
      />
      <div className="px-4 md:px-8">
        {isLoading && <p className="text-[14px] text-l-tinta-3">Leyendo las métricas de cada cliente…</p>}
        {error && (
          <p className="flex gap-1.5 text-[14px] text-l-critico-texto" role="alert">
            <OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> No se pudo cargar: {error instanceof Error ? error.message : "error"}
          </p>
        )}
        {data && (
          <>
            {data.sinLeer.length > 0 && <p className="mb-3 text-[13px] text-l-tinta-2">No se pudieron leer las métricas de {data.sinLeer.join(", ")}.</p>}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtrar clientes">
                {FILTROS.map((f) => {
                  const n = data.clientes.filter(f.pasa).length;
                  const activo = f.k === filtro;
                  return (
                    <button
                      key={f.k}
                      type="button"
                      role="tab"
                      aria-selected={activo}
                      onClick={() => setFiltro(f.k)}
                      className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] ${activo ? "border-l-tinta bg-l-tinta font-semibold text-l-papel" : "border-l-linea-2 text-l-tinta-2"}`}
                    >
                      {f.label} <span className={activo ? "opacity-70" : "text-l-tinta-3"}>{n}</span>
                    </button>
                  );
                })}
              </div>
              <label className="relative ml-auto min-w-[180px] flex-1 sm:max-w-[260px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-l-tinta-3" aria-hidden />
                <input
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Buscar cliente"
                  className="h-9 w-full rounded-full border border-l-linea-2 bg-l-sup pl-8 pr-3 text-[13px] outline-none focus:border-l-marca"
                />
              </label>
            </div>

            {/* Escritorio: tabla */}
            <div className="hidden overflow-x-auto rounded-2xl border border-l-linea bg-l-sup md:block">
              <table className="w-full text-left text-[14px]">
                <thead className="border-b border-l-linea text-[12px] text-l-tinta-3">
                  <tr>
                    <Th activo={orden === "nombre"} onClick={() => setOrden("nombre")}>Cliente</Th>
                    <Th activo={orden === "cpl"} onClick={() => setOrden("cpl")}>Costo por consulta</Th>
                    <th className="px-3 py-2.5 font-medium">Datos</th>
                    <Th activo={orden === "decisiones"} onClick={() => setOrden("decisiones")}>Próxima decisión</Th>
                    <Th activo={orden === "plata"} onClick={() => setOrden("plata")} derecha>Plata en juego</Th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.clientId} className="border-b border-l-linea align-top last:border-b-0 hover:bg-l-papel/60">
                      <td className="px-3 py-3">
                        <Link to={`/clientes/${f.slug}`} className="font-semibold text-l-tinta hover:text-l-marca">
                          {f.cliente}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Cpl f={f} />
                      </td>
                      <td className="px-3 py-3">
                        <Fuentes f={f} />
                      </td>
                      <td className="max-w-[340px] px-3 py-3 text-[13px] text-l-tinta-2">
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
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">
                        {f.plataEnRiesgo != null ? `${pesos(f.plataEnRiesgo)}` : <span className="font-normal italic text-l-tinta-3">{f.decisiones > 0 ? "sin dato" : ""}</span>}
                        {f.plataEnRiesgo != null && <div className="text-[11px] font-normal text-l-tinta-3">por día</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Celular: lista */}
            <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup md:hidden">
              {filas.map((f) => (
                <li key={f.clientId} className="border-b border-l-linea last:border-b-0">
                  <Link to={`/clientes/${f.slug}`} className="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-3.5 text-inherit">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold uppercase tracking-[0.06em]">{f.cliente}</div>
                      <div className="mt-0.5">
                        <Cpl f={f} />
                      </div>
                      <Fuentes f={f} />
                      {f.proxima && <div className="mt-1 line-clamp-2 text-[13px] text-l-tinta-2">{f.proxima.que}</div>}
                    </div>
                    <div className="text-right">
                      {f.plataEnRiesgo != null && (
                        <>
                          <div className="whitespace-nowrap text-[17px] font-semibold">{pesos(f.plataEnRiesgo)}</div>
                          <div className="text-[11px] text-l-tinta-3">por día</div>
                        </>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

function Th({ children, activo, onClick, derecha }: { children: React.ReactNode; activo: boolean; onClick: () => void; derecha?: boolean }) {
  return (
    <th className={`px-3 py-2.5 font-medium ${derecha ? "text-right" : ""}`}>
      <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 ${activo ? "font-semibold text-l-tinta" : "hover:text-l-tinta"}`}>
        {children}
        {activo && <ArrowDown className="h-3 w-3" aria-hidden />}
      </button>
    </th>
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
