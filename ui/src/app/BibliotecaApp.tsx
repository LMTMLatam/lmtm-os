// LMTM: Biblioteca (plan 15/11, fase 5). Todo lo que se produjo —placas, videos,
// copys, informes, specs, investigaciones— por cliente, tipo y veredicto, con su
// control de calidad y el «¿sirve?». Los «planes» de los agentes no entran (D7).

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { api } from "../api/client";
import { clientsApi } from "../api/clients";
import { Encabezado } from "./Shell";
import { Tarjeta } from "./HoyApp";
import { Calidad } from "./ContenidoGeneradoApp";

interface Pieza {
  id: string; kind: string; title: string; url: string | null; created_at: string; links: string[] | null; via: string | null;
  revision: { apto: boolean | null; nivel?: number | null; problemas?: Array<{ que: string }>; sinRevision?: string } | null;
  veredicto: { sirve: boolean; porque: string | null; fecha: string } | null;
  resumen: string | null; cliente: string | null; client_id: string | null; agente: string | null;
}
interface Respuesta { dias: number; piezas: Pieza[]; porTipo: Array<{ kind: string; n: number }> }

const TIPOS: Record<string, string> = {
  video: "Videos", placa: "Placas y carruseles", imagen: "Imágenes", copy: "Copys", report: "Informes y reportes",
  campaign_spec: "Specs de campaña", research: "Investigaciones", informe: "Informes", other: "Otros", workflow: "Flujos", spec: "Specs",
};
const JUICIOS = [["", "Todas"], ["sin", "Sin juzgar"], ["sirve", "Sirvieron"], ["no", "No sirvieron"]] as const;
const fecha = (s: string) => new Date(s).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
const quien = (p: Pieza) => (p.via === "equipo" ? "Equipo (Claude)" : p.agente ?? (p.via?.startsWith("productor") ? "Productor" : p.via ?? "—"));

export function BibliotecaApp() {
  const [cliente, setCliente] = useState("");
  const [tipo, setTipo] = useState("");
  const [juicio, setJuicio] = useState("");
  const [dias, setDias] = useState(30);
  const clientes = useQuery({ queryKey: ["clients", "biblioteca"], queryFn: () => clientsApi.list("active") });
  const p = new URLSearchParams({ dias: String(dias) });
  if (cliente) p.set("cliente", cliente);
  if (tipo) p.set("tipo", tipo);
  if (juicio) p.set("veredicto", juicio);
  const q = useQuery({ queryKey: ["lmtm", "contenido", "biblioteca", p.toString()], queryFn: () => api.get<Respuesta>(`/biblioteca?${p}`) });
  const lista = [...(clientes.data?.clients ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const total = (q.data?.porTipo ?? []).reduce((t, x) => t + Number(x.n), 0);
  return (
    <>
      <Encabezado titulo="Biblioteca" bajada="Todo lo que se produjo para los clientes, con su control y si sirvió" />
      <div className="flex flex-col gap-4 px-4 pb-10 md:px-8">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <select value={cliente} onChange={(e) => setCliente(e.target.value)} aria-label="Cliente" className="h-9 min-w-0 rounded-[8px] border border-l-linea-2 bg-l-sup px-2">
            <option value="">Todos los clientes</option>
            {lista.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período" className="h-9 rounded-[8px] border border-l-linea-2 bg-l-sup px-2">
            {[7, 30, 90, 365].map((d) => <option key={d} value={d}>{d === 365 ? "Último año" : `Últimos ${d} días`}</option>)}
          </select>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Veredicto">
            {JUICIOS.map(([v, l]) => (
              <button key={v} type="button" onClick={() => setJuicio(v)} aria-pressed={juicio === v}
                className={`min-h-8 rounded-full px-3 ${juicio === v ? "bg-l-marca-suave font-semibold text-l-marca" : "border border-l-linea-2 text-l-tinta-2"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 text-[12px]" role="group" aria-label="Tipo">
          <button type="button" onClick={() => setTipo("")} aria-pressed={!tipo} className={`min-h-8 rounded-full px-3 ${!tipo ? "bg-l-marca-suave font-semibold text-l-marca" : "border border-l-linea-2 text-l-tinta-2"}`}>Todo · {total}</button>
          {(q.data?.porTipo ?? []).map((t) => (
            <button key={t.kind} type="button" onClick={() => setTipo(t.kind)} aria-pressed={tipo === t.kind}
              className={`min-h-8 rounded-full px-3 ${tipo === t.kind ? "bg-l-marca-suave font-semibold text-l-marca" : "border border-l-linea-2 text-l-tinta-2"}`}>{TIPOS[t.kind] ?? t.kind} · {t.n}</button>
          ))}
        </div>
        <Tarjeta className="p-0">
          {q.isLoading && <p className="p-4 text-[13px] text-l-tinta-3">Cargando…</p>}
          {q.error && <p className="p-4 text-[13px] text-l-critico-texto">No se pudo cargar la biblioteca.</p>}
          {q.data && q.data.piezas.length === 0 && <p className="p-4 text-[13px] text-l-tinta-3">Nada en este período con estos filtros.</p>}
          <ul>
            {q.data?.piezas.map((x) => (
              <li key={x.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-l-linea px-4 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-l-tinta-3">{fecha(x.created_at)} · {x.cliente ?? "sin cliente"} · {TIPOS[x.kind] ?? x.kind} · {quien(x)}</div>
                  <div className="truncate text-[14px]" title={x.title}>{x.title.replace(/^(Video|Placa|Carrusel|Imagen): /, "")}</div>
                  {x.resumen && !["placa", "video", "imagen"].includes(x.kind) && <p className="line-clamp-2 text-[12px] text-l-tinta-2">{x.resumen}</p>}
                  {["placa", "video", "imagen"].includes(x.kind) && <Calidad p={x} />}
                </div>
                {x.url && /^https?:\/\//.test(x.url) && (
                  <a href={x.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center gap-1 rounded-[8px] border border-l-linea-2 px-2.5 text-[13px] hover:border-l-tinta-3">
                    Abrir <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </>
  );
}
