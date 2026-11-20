// LMTM: Pendientes (20/11, pedido de Naza: «unificá pendientes y aprobaciones en una sección; más visual, y que digan
// para qué serviría el resultado y en qué se basaron para proponerlo»). Todo lo que espera a una persona, en tres
// bloques que se ven de un vistazo arriba: lo urgente, lo que hay que aprobar (cambios de pauta, piezas sin veredicto,
// webs, código y pedidos de los agentes) y lo que hay que hacer. Cada fila dice «para qué» y «en qué se basa».
// Las filas son las mismas de siempre: aprobar acá hace exactamente lo mismo que antes.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, ListTodo, OctagonAlert, Siren, type LucideIcon } from "lucide-react";
import { useSearchParams } from "@/lib/router";
import { api } from "../api/client";
import type { Decision } from "../api/decisiones";
import { agentesApi, type Trabajo } from "./api";
import { Boton } from "../lmtm/componentes";
import { useAprobaciones } from "../lmtm/aprobaciones";
import { repartirHoy } from "../lmtm/hoy";
import { BarrasH } from "../lmtm/graficos";
import { Encabezado } from "./Shell";
import { Bajada, CargaHoy, FILTROS, FilaAbrible, ParaHacer, TituloFranja, Urgente, temaDe, useDatosHoy, type Filtro } from "./HoyApp";
import { PropuestasAgentes } from "./Propuestas";
import { FilaPieza, type PiezaGenerada } from "./ContenidoGeneradoApp";

type Vista = "todo" | "urgente" | "aprobar" | "hacer";
const VISTAS: Vista[] = ["todo", "urgente", "aprobar", "hacer"];

export function PendientesApp() {
  const { hoy, porDecision } = useDatosHoy();
  const h = hoy.data;
  const ap = useAprobaciones();
  const [params, setParams] = useSearchParams();
  const vista: Vista = VISTAS.find((v) => v === params.get("vista")) ?? "todo";
  const filtro: Filtro = FILTROS.find((f) => f.k === params.get("filtro"))?.k ?? "todo";
  const elegir = (v: Vista) => setParams(v === "todo" || v === vista ? {} : { vista: v }, { replace: true });
  const ver = (v: Exclude<Vista, "todo">) => vista === "todo" || vista === v;

  const r = h ? repartirHoy(h.decisiones, h.oportunidades ?? []) : null;
  const paraHacer = useMemo(() => {
    const fuera = new Set([...ap.decisiones, ...(r?.urgentes ?? [])].map((d) => d.id));
    return (h?.decisiones ?? []).filter((d) => !fuera.has(d.id));
  }, [h, ap.decisiones, r]);
  const nUrgente = h && r ? h.incidentes.length + r.urgentes.length : null;

  // Por tema, lo de «para hacer»: los dos que más pesan y el resto junto.
  const porTema = new Map<string, number>();
  for (const d of paraHacer) {
    const f = FILTROS.find((x) => x.k === temaDe(d));
    const k = f?.label ?? "Otros";
    porTema.set(k, (porTema.get(k) ?? 0) + 1);
  }
  const temas = [...porTema.entries()].sort((a, b) => b[1] - a[1]);
  const tramosHacer = [...temas.slice(0, 2).map(([etiqueta, valor]) => ({ etiqueta, valor })), { etiqueta: "Otros", valor: temas.slice(2).reduce((t, [, n]) => t + n, 0) }];

  // Los clientes que más esperan a alguien (urgente, aprobar y hacer).
  const porCliente = new Map<string, number>();
  for (const d of [...(h?.incidentes ?? []), ...(h?.decisiones ?? [])]) porCliente.set(d.cliente, (porCliente.get(d.cliente) ?? 0) + 1);
  const clientes = [...porCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([etiqueta, valor]) => ({ etiqueta, valor }));

  return (
    <>
      <Encabezado titulo="Pendientes" bajada={<Bajada h={h} />} />
      <div className="space-y-8 px-4 pb-10 md:px-8">
        <CargaHoy hoy={hoy} />

        <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-[1fr_1fr_1fr_1.25fr]" role="tablist" aria-label="Qué mirar">
          <Mosaico Icono={Siren} titulo="Urgente" n={nUrgente} pie="corta la pauta o la publicación" tono="critico" activo={vista === "urgente"} onClick={() => elegir("urgente")} ancho />
          <Mosaico
            Icono={CheckCheck}
            titulo="Para aprobar"
            n={ap.cargando ? null : ap.total}
            tramos={[
              { etiqueta: "Pauta", valor: ap.n.pauta },
              { etiqueta: "Piezas", valor: ap.n.contenido },
              { etiqueta: "Web y sistema", valor: ap.n.web },
            ]}
            activo={vista === "aprobar"}
            onClick={() => elegir("aprobar")}
          />
          <Mosaico Icono={ListTodo} titulo="Para hacer" n={h ? paraHacer.length : null} tramos={tramosHacer} activo={vista === "hacer"} onClick={() => elegir("hacer")} />
          <div className="col-span-2 rounded-[20px] border border-l-linea bg-l-sup p-5 xl:col-span-1">
            <p className="mb-3 text-[13px] text-l-tinta-2">Clientes con más pendientes</p>
            {clientes.length > 0 ? <BarrasH filas={clientes} formato={(n) => String(n)} /> : <p className="text-[13px] text-l-tinta-3">Nada esperando.</p>}
          </div>
        </div>

        {h && r && ver("urgente") && <Urgente h={h} urgentes={r.urgentes} porDecision={porDecision} />}

        {ver("aprobar") && (
          <section>
            <h2 className="mb-1 text-[20px] font-semibold tracking-[-0.01em]">Para aprobar</h2>
            <p className="mb-4 text-[13px] text-l-tinta-3">Aprobar ejecuta el cambio, con los topes de siempre. Rechazar le deja el motivo a quien lo propuso.</p>
            {!ap.cargando && ap.total === 0 && (
              <p className="flex items-center gap-2 rounded-2xl border border-l-linea bg-l-sup px-4 py-5 text-[15px]">
                <Check className="h-5 w-5 text-l-bien-texto" aria-hidden /> No hay nada esperando un sí o un no.
              </p>
            )}
            <DecisionesDePauta decisiones={ap.decisiones} />
            <PropuestasAgentes />
            <PiezasSinVeredicto />
            <PropuestasAgentes grupo="otras" />
          </section>
        )}

        {h && ver("hacer") && (
          <section>
            <h2 className="mb-3 text-[20px] font-semibold tracking-[-0.01em]">Para hacer</h2>
            <ParaHacer key={filtro} h={h} decisiones={paraHacer} porDecision={porDecision} filtroInicial={filtro} />
          </section>
        )}
      </div>
    </>
  );
}

const COLOR_TRAMO = ["var(--l-serie-1)", "var(--l-serie-2)", "var(--l-tinta-3)"];

/** Un bloque de arriba: el número grande y, si tiene, de qué se compone (barra partida con su leyenda). Es una pestaña. */
function Mosaico(p: {
  Icono: LucideIcon;
  titulo: string;
  n: number | null;
  pie?: string;
  tono?: "critico";
  tramos?: Array<{ etiqueta: string; valor: number }>;
  activo: boolean;
  onClick: () => void;
  /** En el celular ocupa la fila entera (los otros dos van de a par). */
  ancho?: boolean;
}) {
  const tramos = (p.tramos ?? []).filter((t) => t.valor > 0);
  const total = tramos.reduce((t, x) => t + x.valor, 0);
  const alerta = p.tono === "critico" && (p.n ?? 0) > 0;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={p.activo}
      onClick={p.onClick}
      className={`flex min-w-0 flex-col gap-3 rounded-[20px] border p-4 text-left transition-colors md:p-5 ${p.ancho ? "col-span-2 xl:col-span-1" : ""} ${
        p.activo ? "border-l-marca bg-l-marca-suave" : "border-l-linea bg-l-sup hover:border-l-tinta-3"
      }`}
    >
      <span className="flex items-center justify-between text-[13px] text-l-tinta-2">
        {p.titulo}
        <p.Icono className={`h-5 w-5 ${alerta ? "text-l-critico" : "text-l-marca"}`} aria-hidden />
      </span>
      <span className={`text-[28px] font-semibold leading-none tabular-nums tracking-[-0.02em] md:text-[34px] ${alerta ? "text-l-critico-texto" : ""}`}>
        {p.n ?? <span className="text-[20px] text-l-tinta-3">…</span>}
      </span>
      {total > 0 ? (
        <span className="block">
          <span className="flex h-2 gap-[2px] overflow-hidden rounded-full" aria-hidden>
            {tramos.map((t, i) => (
              <span key={t.etiqueta} style={{ width: `${(t.valor / total) * 100}%`, background: COLOR_TRAMO[i] }} />
            ))}
          </span>
          <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-l-tinta-2">
            {tramos.map((t, i) => (
              <span key={t.etiqueta} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: COLOR_TRAMO[i] }} aria-hidden />
                {t.etiqueta} <span className="font-semibold tabular-nums text-l-tinta">{t.valor}</span>
              </span>
            ))}
          </span>
        </span>
      ) : (
        p.pie && <span className="text-[12px] text-l-tinta-3">{p.pie}</span>
      )}
    </button>
  );
}

function DecisionesDePauta({ decisiones }: { decisiones: Decision[] }) {
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
    <section className="mb-7 mt-7">
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
      <p className="-mt-1.5 mb-3 text-[13px] text-l-tinta-3">Para qué: que el agente aprenda qué sirve. «No sirve» pide el porqué y queda como regla del cliente.</p>
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
