// LMTM: Aprobaciones (rediseño 20/11). Todo lo que espera un sí o un no, en un solo
// lugar: los cambios de pauta (decisiones y propuestas de los agentes), las piezas
// sin veredicto y las webs y pedidos de los agentes. Referencia: la bandeja «Mis
// aprobaciones» de Planable (aprobar por fila y en tanda). Las filas son las mismas
// de Hoy y de Producción: aprobar acá hace exactamente lo mismo que allá.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, OctagonAlert } from "lucide-react";
import { api } from "../api/client";
import { agentesApi, type Trabajo } from "./api";
import { Boton } from "../lmtm/componentes";
import { useAprobaciones } from "../lmtm/aprobaciones";
import { Encabezado } from "./Shell";
import { FilaAbrible, TituloFranja } from "./HoyApp";
import { PropuestasAgentes } from "./Propuestas";
import { FilaPieza, type PiezaGenerada } from "./ContenidoGeneradoApp";

type Pestaña = "todas" | "pauta" | "contenido" | "web";

export function AprobacionesApp() {
  const { decisiones, n, total, cargando } = useAprobaciones();
  const [pestaña, setPestaña] = useState<Pestaña>("todas");
  const ver = (p: Exclude<Pestaña, "todas">) => pestaña === "todas" || pestaña === p;
  const PESTAÑAS: Array<{ k: Pestaña; label: string; n: number }> = [
    { k: "todas", label: "Todas", n: total },
    { k: "pauta", label: "Pauta", n: n.pauta },
    { k: "contenido", label: "Contenido", n: n.contenido },
    { k: "web", label: "Web y pedidos", n: n.web },
  ];

  return (
    <>
      <Encabezado titulo="Aprobaciones" bajada="Todo lo que espera un sí o un no, en un solo lugar." />
      <div className="px-4 md:px-8">
        <div className="mb-6 inline-flex flex-wrap gap-1 rounded-[14px] bg-l-sup p-1" role="tablist" aria-label="Qué aprobar">
          {PESTAÑAS.map((p) => (
            <button
              key={p.k}
              type="button"
              role="tab"
              aria-selected={pestaña === p.k}
              onClick={() => setPestaña(p.k)}
              className={`min-h-10 rounded-[10px] px-4 text-[14px] ${pestaña === p.k ? "bg-l-papel font-semibold text-l-tinta" : "font-medium text-l-tinta-2 hover:text-l-tinta"}`}
            >
              {p.label} <span className="tabular-nums text-l-tinta-3">{p.n}</span>
            </button>
          ))}
        </div>

        {cargando && <p className="text-[14px] text-l-tinta-3" role="status">Juntando lo que hay para aprobar…</p>}
        {!cargando && total === 0 && (
          <p className="flex items-center gap-2 rounded-2xl border border-l-linea bg-l-sup px-4 py-5 text-[15px]">
            <Check className="h-5 w-5 text-l-bien-texto" aria-hidden /> No hay nada esperando tu respuesta.
          </p>
        )}

        {ver("pauta") && <DecisionesDePauta decisiones={decisiones} />}
        {ver("pauta") && <PropuestasAgentes />}
        {ver("contenido") && <PiezasSinVeredicto />}
        {ver("web") && <PropuestasAgentes grupo="otras" />}
      </div>
    </>
  );
}

function DecisionesDePauta({ decisiones }: { decisiones: ReturnType<typeof useAprobaciones>["decisiones"] }) {
  const trabajos = useQuery({ queryKey: ["lmtm", "agentes", "trabajos"], queryFn: () => agentesApi.trabajos({ limite: 300 }), staleTime: 60_000 });
  const porDecision = useMemo(() => {
    const m = new Map<string, Trabajo>();
    for (const t of trabajos.data?.trabajos ?? []) if (t.ref?.startsWith("decision:") && !m.has(t.ref.slice(9))) m.set(t.ref.slice(9), t);
    return m;
  }, [trabajos.data]);
  if (decisiones.length === 0) return null;
  return (
    <section className="mb-7">
      <TituloFranja>Cambios de pauta para aprobar · {decisiones.length}</TituloFranja>
      <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
        {decisiones.map((d) => (
          <FilaAbrible key={d.id} d={d} agente={porDecision.get(d.id)} />
        ))}
      </ul>
    </section>
  );
}

/** Videos de los agentes sin veredicto (30 días, como el aviso de Hoy). «Sirven todas» pide confirmar en el lugar. */
function PiezasSinVeredicto() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["lmtm", "contenido", "generado", 30],
    queryFn: () => api.get<{ piezas: PiezaGenerada[] }>("/contenido/generado?dias=30"),
    staleTime: 60_000,
  });
  const piezas = (q.data?.piezas ?? []).filter((p) => p.kind === "video" && !p.veredicto);
  const [confirmando, setConfirmando] = useState(false);
  const [fallas, setFallas] = useState<string[]>([]);
  const todas = useMutation({
    mutationFn: async () => {
      const mal: string[] = [];
      for (const p of piezas) {
        const r = await api.post<{ ok: boolean; motivo?: string }>("/contenido/veredicto", { deliverableId: p.id, sirve: true, porque: "" }).catch(() => ({ ok: false }));
        if (!r.ok) mal.push(p.titulo);
      }
      setFallas(mal);
    },
    onSettled: () => {
      setConfirmando(false);
      void qc.invalidateQueries({ queryKey: ["lmtm", "contenido"] });
    },
  });
  if (q.isLoading) return null;
  if (q.error) return <p className="mb-7 text-[14px] text-l-critico-texto" role="alert">No se pudieron leer las piezas.</p>;
  if (piezas.length === 0) return null;
  return (
    <section className="mb-7">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <TituloFranja sinMargen>Piezas sin veredicto · {piezas.length}</TituloFranja>
        {piezas.length > 1 &&
          (confirmando ? (
            <span className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-l-tinta-2">¿Marcar las {piezas.length} como que sirven?</span>
              <Boton tipo="primario" onClick={() => todas.mutate()} disabled={todas.isPending}>
                {todas.isPending ? "Guardando…" : "Confirmar"}
              </Boton>
              <Boton tipo="secundario" onClick={() => setConfirmando(false)} disabled={todas.isPending}>
                Cancelar
              </Boton>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmando(true)} className="min-h-10 text-[13px] font-semibold text-l-marca">
              Sirven las {piezas.length}
            </button>
          ))}
      </div>
      <p className="-mt-1.5 mb-3 text-[13px] text-l-tinta-3">«No sirve» pide el porqué: queda como regla del cliente y el agente la lee antes de la próxima pieza.</p>
      {fallas.length > 0 && (
        <p className="mb-3 flex gap-1.5 text-[13px] text-l-critico-texto" role="alert">
          <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> No se guardó el veredicto de: {fallas.join(", ")}.
        </p>
      )}
      <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
        {piezas.map((p) => (
          <FilaPieza key={p.id} p={p} />
        ))}
      </ul>
    </section>
  );
}
