// LMTM: Actividad (plan 15/11, fase 5). La línea de tiempo de todo lo que hace la
// empresa: piezas, decisiones, acciones de pauta, tareas, informes y posts
// publicados, por cliente y período. Es la capa «actividad» del cerebro, la misma
// que lee Claude con lmtmActividad.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { api } from "../api/client";
import { clientsApi } from "../api/clients";
import { Encabezado } from "./Shell";
import { Tarjeta } from "./HoyApp";

interface Hecho { fecha: string; tipo: string; cliente: string | null; quien: string | null; que: string; resultado: string | null; link: string | null }
interface Respuesta {
  desde: string;
  resumen: Record<string, number | null | Record<string, number> | undefined> & { usoDelConector?: Record<string, number> };
  hechos: Hecho[];
}

const GRUPOS: Array<[string, string]> = [["pieza", "Piezas"], ["publicacion", "Posts publicados"], ["decision", "Decisiones"], ["accion", "Cambios de pauta"], ["tarea", "Tareas hechas"], ["informe", "Informes"]];
const ETIQUETA: Record<string, string> = Object.fromEntries(GRUPOS);
const num = (n: unknown) => (typeof n === "number" ? n.toLocaleString("es-AR") : "—");

export function ActividadApp() {
  const [cliente, setCliente] = useState("");
  const [dias, setDias] = useState(7);
  const [tipo, setTipo] = useState("");
  const clientes = useQuery({ queryKey: ["clients", "actividad"], queryFn: () => clientsApi.list("active") });
  const p = new URLSearchParams({ dias: String(dias), limite: "150" });
  if (cliente) p.set("cliente", cliente);
  if (tipo) p.set("tipo", tipo);
  const q = useQuery({ queryKey: ["lmtm", "actividad", p.toString()], queryFn: () => api.get<Respuesta>(`/cerebro/actividad?${p}`), refetchInterval: 5 * 60_000 });
  const lista = [...(clientes.data?.clients ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const r = q.data?.resumen;
  const corridas = r ? `${num(r.corridasBien)} de ${num(r.corridasDeAgentes)}` : "—";
  const conector = Object.entries(r?.usoDelConector ?? {});
  return (
    <>
      <Encabezado titulo="Actividad" bajada="Todo lo que se hizo, de todas las fuentes, en una línea de tiempo" />
      <div className="flex flex-col gap-4 px-4 pb-10 md:px-8">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <select value={cliente} onChange={(e) => setCliente(e.target.value)} aria-label="Cliente" className="h-9 min-w-0 rounded-[8px] border border-l-linea-2 bg-l-sup px-2">
            <option value="">Toda la agencia</option>
            {lista.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex gap-1" role="group" aria-label="Período">
            {[1, 7, 30].map((d) => (
              <button key={d} type="button" onClick={() => setDias(d)} aria-pressed={dias === d}
                className={`min-h-8 rounded-full px-3 ${dias === d ? "bg-l-marca-suave font-semibold text-l-marca" : "border border-l-linea-2 text-l-tinta-2"}`}>{d === 1 ? "Hoy y ayer" : `${d} días`}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          {GRUPOS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTipo(tipo === k ? "" : k)} aria-pressed={tipo === k}
              className={`rounded-xl border p-3 text-left ${tipo === k ? "border-l-marca bg-l-marca-suave" : "border-l-linea bg-l-sup"}`}>
              <div className="text-[22px] font-semibold tabular-nums">{num(r?.[k])}</div>
              <div className="text-[12px] text-l-tinta-2">{l}</div>
            </button>
          ))}
          <div className="rounded-xl border border-l-linea bg-l-sup p-3">
            <div className="text-[22px] font-semibold tabular-nums">{corridas}</div>
            <div className="text-[12px] text-l-tinta-2">Corridas de agentes bien</div>
          </div>
        </div>
        {conector.length > 0 && (
          <p className="text-[12px] text-l-tinta-3">Conector de Claude: {conector.map(([pers, n]) => `${pers} ${n}`).join(" · ")} llamadas.</p>
        )}
        <Tarjeta className="p-0">
          {q.isLoading && <p className="p-4 text-[13px] text-l-tinta-3">Cargando…</p>}
          {q.error && <p className="p-4 text-[13px] text-l-critico-texto">No se pudo cargar la actividad.</p>}
          {q.data && q.data.hechos.length === 0 && <p className="p-4 text-[13px] text-l-tinta-3">Nada en este período.</p>}
          <ul>
            {q.data?.hechos.map((h, i) => (
              <li key={`${h.fecha}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-l-linea px-4 py-2.5 text-[13px] last:border-0">
                <span className="w-[92px] shrink-0 tabular-nums text-l-tinta-3">{h.fecha.slice(5, 16).replace("-", "/")}</span>
                <span className="w-[120px] shrink-0 text-[12px] text-l-tinta-2">{ETIQUETA[h.tipo.split(":")[0]!] ?? h.tipo}</span>
                <span className="min-w-0 flex-1">
                  {h.cliente && <span className="font-medium">{h.cliente} · </span>}{h.que}
                  {(h.quien || h.resultado) && <span className="block text-[12px] text-l-tinta-3">{[h.quien, h.resultado].filter(Boolean).join(" · ")}</span>}
                </span>
                {h.link && <a href={h.link} target="_blank" rel="noreferrer noopener" className="text-l-tinta-2 hover:text-l-tinta" aria-label="Abrir"><ExternalLink className="h-3.5 w-3.5" /></a>}
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </>
  );
}
