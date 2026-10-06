// LMTM: las propuestas de pauta de los agentes, en Hoy (fase C1).
//
// Hasta ahora quedaban en la pantalla de Aprobaciones de paperclip y Hoy no las
// mostraba: el piloto juntó 44 sin que nadie las viera. Acá van agrupadas por
// cliente, una por acción (si Milo y el media buyer propusieron lo mismo, una
// sola fila), con aprobar, rechazar con motivo y aprobar en tanda por cliente.
// Aprobar EJECUTA en la cuenta (con las guardas de siempre): por eso la tanda
// pide confirmación en el lugar.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, OctagonAlert } from "lucide-react";
import { Link } from "@/lib/router";
import { api } from "../api/client";
import { approvalsApi } from "../api/approvals";
import { Boton } from "../lmtm/componentes";
import { TituloFranja } from "./HoyApp";

interface Propuesta {
  clave: string;
  ids: string[];
  agentes: string[];
  clientId: string;
  cliente: string;
  slug: string;
  resumen: string;
  justificacion: string;
  createdAt: string;
}

type Resultado = { ok: boolean; detalle: string };

const propuestasApi = { listar: () => api.get<{ propuestas: Propuesta[] }>("/agentes/propuestas") };

/** Aprueba la primera copia y descarta las repetidas: se ejecuta una sola vez. */
async function aprobar(p: Propuesta): Promise<Resultado> {
  const [primera, ...copias] = p.ids;
  const r = (await approvalsApi.approve(primera, "Aprobada desde Hoy")) as unknown as { payload?: { resultado?: Resultado } };
  for (const id of copias) await approvalsApi.reject(id, `Repetida: se aprobó ${primera}`).catch(() => undefined);
  return r.payload?.resultado ?? { ok: true, detalle: "Aprobada." };
}

export function PropuestasAgentes() {
  const q = useQuery({ queryKey: ["lmtm", "propuestas"], queryFn: () => propuestasApi.listar(), refetchInterval: 60_000 });
  const ps = q.data?.propuestas ?? [];
  if (ps.length === 0) return null;
  const porCliente = new Map<string, Propuesta[]>();
  for (const p of ps) porCliente.set(p.slug, [...(porCliente.get(p.slug) ?? []), p]);
  return (
    <section className="mt-7">
      <TituloFranja>Propuestas de los agentes · {ps.length} para aprobar</TituloFranja>
      <p className="-mt-1.5 mb-3 text-[13px] text-l-tinta-3">Aprobar las ejecuta en la cuenta, con los mismos topes de siempre (20% por vez, una vez por día).</p>
      <div className="space-y-4">
        {[...porCliente.values()].map((lista) => (
          <GrupoCliente key={lista[0].slug} lista={lista} />
        ))}
      </div>
    </section>
  );
}

function GrupoCliente({ lista }: { lista: Propuesta[] }) {
  const qc = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const [resultados, setResultados] = useState<Record<string, Resultado>>({});
  const tanda = useMutation({
    mutationFn: async () => {
      for (const p of lista) {
        const r = await aprobar(p).catch((e: unknown) => ({ ok: false, detalle: e instanceof Error ? e.message : "No se pudo." }));
        setResultados((x) => ({ ...x, [p.clave]: r }));
      }
    },
    onSettled: () => {
      setConfirmando(false);
      void qc.invalidateQueries({ queryKey: ["lmtm"] });
    },
  });
  return (
    <div className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-l-linea px-4 py-2.5">
        <Link to={`/clientes/${lista[0].slug}`} className="text-[13px] font-semibold uppercase tracking-[0.06em] text-l-tinta hover:text-l-marca">
          {lista[0].cliente}
        </Link>
        {lista.length > 1 &&
          (confirmando ? (
            <span className="flex items-center gap-2 text-[13px]">
              <span className="text-l-tinta-2">¿Ejecutar las {lista.length} en la cuenta?</span>
              <Boton tipo="primario" onClick={() => tanda.mutate()} disabled={tanda.isPending}>
                {tanda.isPending ? "Ejecutando…" : "Confirmar"}
              </Boton>
              <Boton tipo="secundario" onClick={() => setConfirmando(false)} disabled={tanda.isPending}>
                Cancelar
              </Boton>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmando(true)} className="text-[13px] font-semibold text-l-marca">
              Aprobar las {lista.length}
            </button>
          ))}
      </div>
      <ul>
        {lista.map((p) => (
          <FilaPropuesta key={p.clave} p={p} resultadoTanda={resultados[p.clave]} />
        ))}
      </ul>
    </div>
  );
}

function FilaPropuesta({ p, resultadoTanda }: { p: Propuesta; resultadoTanda?: Resultado }) {
  const qc = useQueryClient();
  const [abierta, setAbierta] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const listo = () => void qc.invalidateQueries({ queryKey: ["lmtm"] });
  const si = useMutation({ mutationFn: () => aprobar(p), onSuccess: (r) => setResultado(r), onError: (e) => setResultado({ ok: false, detalle: e instanceof Error ? e.message : "No se pudo." }), onSettled: listo });
  const no = useMutation({
    mutationFn: async () => {
      for (const id of p.ids) await approvalsApi.reject(id, motivo.trim());
    },
    onSuccess: () => setResultado({ ok: true, detalle: "Rechazada. El motivo queda para el agente." }),
    onSettled: listo,
  });
  const r = resultado ?? resultadoTanda;
  return (
    <li className="border-b border-l-linea px-4 py-3 last:border-b-0">
      <button type="button" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta} className="flex w-full items-start gap-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium leading-[1.4]">{p.resumen}</span>
          <span className="block text-[12px] text-l-tinta-3">propuesta por {p.agentes.join(" y ") || "un agente"}</span>
        </span>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-l-tinta-3 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {abierta && <p className="mt-2 whitespace-pre-line text-[13px] leading-[1.5] text-l-tinta-2">{p.justificacion}</p>}
      {r ? (
        <p className={`mt-2 flex gap-1.5 text-[13px] ${r.ok ? "text-l-bien-texto" : "text-l-critico-texto"}`} role="status">
          {r.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          {r.detalle}
        </p>
      ) : rechazando ? (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            no.mutate();
          }}
        >
          <textarea
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: es la campaña de marca, no se pausa"
            className="w-full resize-y rounded-[10px] border border-l-linea-2 bg-l-sup px-3 py-2 text-[14px]"
          />
          <div className="flex gap-2">
            <Boton tipo="primario" disabled={motivo.trim().length < 5 || no.isPending}>
              Rechazar
            </Boton>
            <Boton tipo="secundario" onClick={() => setRechazando(false)}>
              Volver
            </Boton>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Boton tipo="primario" onClick={() => si.mutate()} disabled={si.isPending}>
            {si.isPending ? "Ejecutando…" : "Aprobar"}
          </Boton>
          <Boton tipo="secundario" onClick={() => setRechazando(true)}>
            Rechazar
          </Boton>
        </div>
      )}
    </li>
  );
}
