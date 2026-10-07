// LMTM: Licitaciones en la app propia (07/10, "nos sirve mucho, que quede
// activo"). Oportunidades de Mercado Público (ChileCompra) que la agencia puede
// ofertar: el sync diario trae candidatas por palabras de marketing, el curador
// (Carlos, 10:00 L–V) marca las útiles con el porqué, y acá el equipo las ve y
// las cura a mano. Misma API de siempre (/api/licitaciones).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { api } from "../api/client";
import { Boton } from "../lmtm/componentes";
import { Encabezado } from "./Shell";

interface Licitacion {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  organismo: string | null;
  region: string | null;
  moneda: string | null;
  montoEstimado: string | null;
  fechaCierre: string | null;
  url: string | null;
  estado: string;
  relevancia: string | null;
}

type Vista = "utiles" | "revisar" | "archivo";

/** "cierra en 3 días", "cierra HOY", "cerrada". Urgente = 5 días o menos. */
export function cierre(fecha: string | null, ahora = Date.now()): { txt: string; urgente: boolean } {
  if (!fecha) return { txt: "sin fecha de cierre", urgente: false };
  const falta = new Date(fecha).getTime() - ahora;
  // Ya pasó la hora de cierre: cerrada, aunque sea hoy (antes decía "cierra HOY").
  if (falta < 0) return { txt: "cerrada", urgente: false };
  const d = Math.ceil(falta / 86_400_000);
  if (d === 0) return { txt: "cierra HOY", urgente: true };
  return { txt: `cierra en ${d} ${d === 1 ? "día" : "días"}`, urgente: d <= 5 };
}

export function LicitacionesApp() {
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista>("utiles");
  const archivo = vista === "archivo";
  const q = useQuery({
    queryKey: ["lmtm", "licitaciones", archivo],
    queryFn: () => api.get<{ licitaciones: Licitacion[] }>(`/licitaciones?estado=${archivo ? "descartada,vencida" : "util,candidata"}`),
    staleTime: 5 * 60_000,
  });
  const sync = useMutation({
    mutationFn: () => api.post<{ activas: number; matcheadas: number; nuevas: number }>("/licitaciones/sync", {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lmtm", "licitaciones"] }),
  });
  const filas = q.data?.licitaciones ?? [];
  const utiles = filas.filter((l) => l.estado === "util");
  const revisar = filas.filter((l) => l.estado === "candidata");
  const lista = vista === "utiles" ? utiles : vista === "revisar" ? revisar : filas;
  const pestañas: Array<{ k: Vista; label: string; n: number | null }> = [
    { k: "utiles", label: "Nos sirven", n: archivo ? null : utiles.length },
    { k: "revisar", label: "Por revisar", n: archivo ? null : revisar.length },
    { k: "archivo", label: "Archivo", n: archivo ? filas.length : null },
  ];

  return (
    <>
      <Encabezado
        titulo="Licitaciones"
        bajada="Mercado Público (Chile): se sincroniza a diario y el curador marca las que sirven, con el porqué."
        derecha={
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-l-linea-2 px-3 text-[13px] text-l-tinta-2 hover:text-l-tinta disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} aria-hidden /> {sync.isPending ? "Sincronizando…" : "Sincronizar ahora"}
          </button>
        }
      />
      <div className="max-w-[960px] px-4 pb-10 md:px-8">
        {sync.data && (
          <p className="mb-3 text-[13px] text-l-tinta-3" role="status">
            {sync.data.activas} activas en Mercado Público · {sync.data.matcheadas} de marketing · {sync.data.nuevas} nuevas.
          </p>
        )}
        <div className="mb-4 flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Licitaciones">
          {pestañas.map((p) => (
            <button
              key={p.k}
              type="button"
              role="tab"
              aria-selected={vista === p.k}
              onClick={() => setVista(p.k)}
              className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] ${vista === p.k ? "border-l-tinta bg-l-tinta font-semibold text-l-papel" : "border-l-linea-2 text-l-tinta-2"}`}
            >
              {p.label}
              {p.n != null && <span className={vista === p.k ? " opacity-70" : " text-l-tinta-3"}> {p.n}</span>}
            </button>
          ))}
        </div>
        {q.isLoading && (
          <p className="flex items-center gap-2 text-[14px] text-l-tinta-3">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…
          </p>
        )}
        {q.error && <p className="text-[14px] text-l-critico-texto">No se pudieron cargar: {q.error instanceof Error ? q.error.message : "error"}</p>}
        {q.data && lista.length === 0 && (
          <p className="text-[14px] text-l-tinta-2">
            {vista === "utiles" ? "Todavía ninguna marcada como útil: el curador corre cada mañana, o marcalas desde Por revisar." : vista === "revisar" ? "No hay candidatas pendientes." : "El archivo está vacío."}
          </p>
        )}
        {lista.length > 0 && (
          <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
            {lista.map((l) => (
              <Fila key={l.codigo} l={l} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Fila({ l }: { l: Licitacion }) {
  const qc = useQueryClient();
  const [abierta, setAbierta] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [porque, setPorque] = useState("");
  const marcar = useMutation({
    mutationFn: (estado: "util" | "descartada") =>
      api.patch(`/licitaciones/${encodeURIComponent(l.codigo)}`, { estado, ...(estado === "util" && porque.trim() ? { relevancia: porque.trim() } : {}) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lmtm", "licitaciones"] }),
  });
  const c = cierre(l.fechaCierre);
  const monto = l.montoEstimado ? `${l.moneda ?? ""} ${Number(l.montoEstimado).toLocaleString("es-CL")}`.trim() : null;
  return (
    <li className="border-b border-l-linea px-4 py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
            <span className={`rounded-full px-2 py-0.5 font-medium ${c.urgente ? "bg-l-critico-suave text-l-critico-texto" : "bg-l-papel text-l-tinta-2"}`}>{c.txt}</span>
            {l.estado === "util" && <span className="rounded-full bg-l-marca-suave px-2 py-0.5 font-medium text-l-marca">Nos sirve</span>}
            <span className="text-l-tinta-3">{l.codigo}</span>
          </div>
          <div className="mt-1 text-[15px] font-medium leading-[1.4]">
            {l.url ? (
              <a href={l.url} target="_blank" rel="noreferrer noopener" className="hover:text-l-marca">
                {l.nombre} <ExternalLink className="inline h-3.5 w-3.5 align-[-2px] text-l-tinta-3" aria-hidden />
              </a>
            ) : (
              l.nombre
            )}
          </div>
          <div className="text-[13px] text-l-tinta-3">{[l.organismo, l.region, monto].filter(Boolean).join(" · ")}</div>
          {l.relevancia && <p className={`mt-1 text-[13px] leading-[1.45] ${l.estado === "util" ? "text-l-tinta" : "text-l-tinta-2"}`}>{l.relevancia}</p>}
        </div>
        {l.descripcion && (
          <button
            type="button"
            onClick={() => setAbierta((a) => !a)}
            aria-expanded={abierta}
            className="grid h-9 w-9 place-items-center rounded-[8px] text-l-tinta-3 hover:bg-l-papel"
            aria-label={abierta ? "Ocultar la descripción" : "Ver la descripción"}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden />
          </button>
        )}
      </div>
      {abierta && l.descripcion && <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.5] text-l-tinta-2">{l.descripcion}</p>}
      {marcando ? (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            marcar.mutate("util");
          }}
        >
          <textarea
            rows={2}
            value={porque}
            onChange={(e) => setPorque(e.target.value)}
            autoFocus
            placeholder="¿Por qué nos sirve? Queda escrito en la licitación."
            className="w-full resize-y rounded-[10px] border border-l-linea-2 bg-l-sup px-3 py-2 text-[14px] text-l-tinta"
          />
          <div className="flex gap-2">
            <Boton tipo="primario" disabled={marcar.isPending}>
              {marcar.isPending ? "Guardando…" : "Marcar como útil"}
            </Boton>
            <Boton tipo="secundario" onClick={() => setMarcando(false)}>
              Volver
            </Boton>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {l.estado !== "util" && (
            <Boton tipo="primario" onClick={() => setMarcando(true)}>
              Nos sirve
            </Boton>
          )}
          {l.estado !== "descartada" && (
            <Boton tipo="secundario" onClick={() => marcar.mutate("descartada")} disabled={marcar.isPending}>
              Descartar
            </Boton>
          )}
        </div>
      )}
    </li>
  );
}
