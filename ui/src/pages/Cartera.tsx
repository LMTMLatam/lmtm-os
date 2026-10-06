// LMTM: la Cartera. Todos los clientes activos, ordenados por la plata en riesgo.
//
// Reemplaza a las cuatro carteras que había (la tabla de Pauta, el semáforo de
// Growth, el de Operación y las tarjetas de Clientes), cada una con su propia
// suma y su propia vara. Ésta mide a cada cliente contra SU objetivo (no el
// ideal del rubro), dice si estamos viendo sus datos y cuál es la próxima
// decisión. Un toque lleva a la pantalla del cliente. Diseño: lmtm-diseno.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, FileText, Hourglass, OctagonAlert, Send, Unplug, X } from "lucide-react";
import { Link } from "@/lib/router";
import { carteraApi, type FilaCartera } from "../api/informes";
import { EstadoObjetivoMarca, LmtmPantalla } from "../lmtm/componentes";
import { etiquetaResponsable, pesos } from "../lmtm/formato";

const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
const NOMBRE_FUENTE = { meta_ads: "Meta", google_ads: "Google", organico: "Redes" } as const;
const ESTADO_FUENTE = { fallando: "fallando", atrasada: "atrasada", sin_conexion: "se desconectó", sin_entrega: "sin pauta", ok: "al día" } as const;

type Filtro = "todos" | "decidir" | "arriba" | "datos";
const FILTROS: Array<{ k: Filtro; label: string; pasa: (f: FilaCartera) => boolean }> = [
  { k: "todos", label: "Todos", pasa: () => true },
  { k: "decidir", label: "Para decidir", pasa: (f) => f.decisiones > 0 },
  { k: "arriba", label: "Arriba del objetivo", pasa: (f) => f.estado === "arriba" || f.estado === "muy_arriba" },
  { k: "datos", label: "Datos con problemas", pasa: (f) => f.fuentesConProblemas.length > 0 },
];

export function Cartera() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["lmtm", "cartera"],
    queryFn: () => carteraApi.leer(),
    staleTime: 3 * 60_000,
  });
  const [filtro, setFiltro] = useState<Filtro>("todos");

  // Abajo y plegados, solo los que no tienen pauta Y no tienen nada para
  // decidir. Un cliente que se desconectó con plata en juego (la firma de
  // Distrillantas) no tiene pauta "a la vista", y justamente por eso va arriba.
  const enLista = (c: FilaCartera) => !c.sinPauta || c.decisiones > 0;
  const conPauta = data?.clientes.filter(enLista) ?? [];
  const sinPauta = data?.clientes.filter((c) => !enLista(c)) ?? [];
  const visibles = conPauta.filter(FILTROS.find((f) => f.k === filtro)!.pasa);

  return (
    <LmtmPantalla
      titulo="Clientes"
      subtitulo={data ? `Semana del ${fechaCorta(data.semana.desde)} al ${fechaCorta(data.semana.hasta)} · ${data.clientes.length} activos` : undefined}
      panel="/dashboard"
    >
      {isLoading && <p className="text-[14px] text-l-tinta-3">Leyendo las métricas de cada cliente…</p>}
      {error && (
        <p className="flex gap-1.5 text-[14px] text-l-critico-texto" role="alert">
          <OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> No se pudo cargar la cartera: {error instanceof Error ? error.message : "error"}
        </p>
      )}
      {data && (
        <>
          {data.sinLeer.length > 0 && (
            <p className="mb-4 flex gap-1.5 text-[13px] text-l-tinta-2" role="alert">
              <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--l-atencion)" }} aria-hidden />
              <span>No se pudieron leer las métricas de {data.sinLeer.join(", ")}: no aparecen abajo.</span>
            </p>
          )}

          {/* Un solo renglón de filtros, arriba de la lista (dataviz). */}
          <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Filtrar clientes">
            {FILTROS.map((f) => {
              const n = conPauta.filter(f.pasa).length;
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
                  {f.label} <span className={activo ? "" : "text-l-tinta-3"}>{n}</span>
                </button>
              );
            })}
          </div>

          {visibles.length === 0 ? (
            <p className="mt-6 text-[14px] text-l-tinta-2">Ningún cliente en este filtro.</p>
          ) : (
            <ul>
              {visibles.map((f) => (
                <FilaCliente key={f.clientId} f={f} />
              ))}
            </ul>
          )}

          {sinPauta.length > 0 && (
            <details className="mt-8 text-[14px]">
              <summary className="cursor-pointer font-medium text-l-tinta-2">Sin pauta conectada ({sinPauta.length})</summary>
              <p className="mt-2 text-[13px] text-l-tinta-3">No tienen una cuenta de publicidad conectada ni nada para decidir: no se puede medir cuánto les cuesta una consulta.</p>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {sinPauta.map((f) => (
                  <li key={f.clientId}>
                    <Link to={`/c/${f.slug}`} className="text-l-marca underline-offset-2 hover:underline">
                      {f.cliente}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </LmtmPantalla>
  );
}

const INFORME = {
  publicado: { Icono: Check, label: "Informe publicado", color: "var(--l-bien)" },
  aprobado: { Icono: Send, label: "Informe listo para publicar", color: "var(--l-marca)" },
  observado: { Icono: OctagonAlert, label: "Informe observado", color: "var(--l-atencion)" },
  borrador: { Icono: Hourglass, label: "Informe en borrador", color: "var(--l-tinta-3)" },
} as const;

function FilaCliente({ f }: { f: FilaCartera }) {
  const s = f.semana;
  const inf = f.informe ? INFORME[f.informe] : null;
  return (
    <li className="border-t border-l-linea last:border-b">
      <Link to={`/c/${f.slug}`} className="grid grid-cols-[1fr_auto] gap-x-3 py-4 text-inherit no-underline">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13px] font-semibold uppercase tracking-[0.06em]">{f.cliente}</span>
            {inf ? (
              <span className="inline-flex items-center gap-1 text-[12px] text-l-tinta-3">
                <inf.Icono className="h-3.5 w-3.5" style={{ color: inf.color }} aria-hidden />
                {inf.label}
              </span>
            ) : f.sinPauta ? null : (
              // Sin pauta no hay informe posible: decirlo sería ruido en cada fila.
              <span className="inline-flex items-center gap-1 text-[12px] text-l-tinta-3">
                <FileText className="h-3.5 w-3.5" aria-hidden /> Sin informe de la semana
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[14px]">
            {f.sinPauta ? (
              <span className="text-l-tinta-2">Sin pauta a la vista: no hay cuenta conectada</span>
            ) : s.cpl != null ? (
              <span className="font-medium">{pesos(s.cpl)} por consulta</span>
            ) : (
              <span className="text-l-tinta-2">{s.leads === 0 ? "Sin consultas en la semana" : "sin dato"}</span>
            )}
            {!f.sinPauta && <EstadoObjetivoMarca e={f.estado} chico />}
            {s.objetivo != null && <span className="text-[12px] text-l-tinta-3">objetivo {pesos(s.objetivo)}</span>}
            {s.leadsDudosos && <span className="text-[12px] text-l-tinta-3">· incluye Google dudoso</span>}
          </div>

          {f.fuentesConProblemas.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-l-tinta-2">
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
          )}

          {f.proxima && (
            <div className="mt-1.5 text-[13px] leading-[1.45] text-l-tinta-2">
              <span className="text-l-tinta">{f.proxima.que}</span>
              <span className="text-l-tinta-3">
                {" · "}
                {etiquetaResponsable(f.proxima.responsable).toLowerCase()}
                {f.decisiones > 1 ? ` · y ${f.decisiones - 1} más` : ""}
              </span>
            </div>
          )}
        </div>

        <div className="text-right">
          {f.plataEnRiesgo != null ? (
            <>
              <div className="whitespace-nowrap text-[18px] font-semibold tracking-[-0.01em]">{pesos(f.plataEnRiesgo)}</div>
              <div className="text-[11px] text-l-tinta-3">por día en juego</div>
            </>
          ) : f.decisiones > 0 ? (
            <div className="text-[12px] italic text-l-tinta-3">
              sin dato
              <span className="block not-italic">de plata</span>
            </div>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
