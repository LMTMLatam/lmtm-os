// LMTM: Avisos de WhatsApp (07/10). Nazareno: "las alertas notificaban cosas
// que no eran reales". Acá se ve qué dice el sistema y por qué, antes de que
// llegue al celular:
//  · el resumen de las 9:00 tal como saldría ahora (ensayo, no manda nada);
//  · todo lo que pasó por el embudo en 48 h: lo que interrumpió, lo que espera
//    al resumen y lo que se descartó, con el motivo.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { api } from "../api/client";
import { haceCuanto } from "../lmtm/formato";
import { Encabezado } from "./Shell";
import { Tarjeta, TituloFranja } from "./HoyApp";

interface Aviso {
  id: string;
  createdAt: string;
  origen: string;
  tema: string;
  nivel: number;
  estado: "enviado" | "pendiente" | "agrupado" | "descartado" | "error" | string;
  motivo: string | null;
  texto: string;
}

const ESTADO: Record<string, { label: string; clase: string }> = {
  enviado: { label: "Interrumpió", clase: "bg-l-critico-suave text-l-critico-texto" },
  pendiente: { label: "Va al resumen", clase: "bg-l-marca-suave text-l-marca" },
  agrupado: { label: "Salió en el resumen", clase: "bg-l-papel text-l-tinta-2" },
  descartado: { label: "Descartado", clase: "bg-l-papel text-l-tinta-3" },
  error: { label: "No salió", clase: "bg-l-critico-suave text-l-critico-texto" },
};

export function AvisosApp() {
  const [filtro, setFiltro] = useState<string>("todos");
  const registro = useQuery({ queryKey: ["lmtm", "avisos", "registro"], queryFn: () => api.get<{ horas: number; avisos: Aviso[] }>("/avisos/registro?horas=48"), refetchInterval: 120_000 });
  const ensayo = useQuery({ queryKey: ["lmtm", "avisos", "ensayo"], queryFn: () => api.get<{ texto: string; pendientes: number }>("/avisos/resumen/ensayo"), staleTime: 5 * 60_000 });
  const avisos = registro.data?.avisos ?? [];
  const visibles = filtro === "todos" ? avisos : avisos.filter((a) => a.estado === filtro);
  const cuenta = (e: string) => avisos.filter((a) => a.estado === e).length;

  return (
    <>
      <Encabezado titulo="Avisos de WhatsApp" bajada="Qué dice el sistema, a quién y por qué. Solo interrumpen los incidentes; el resto va al resumen de las 9:00." />
      <div className="grid gap-8 px-4 pb-10 md:px-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-w-0">
          <TituloFranja>Lo que pasó en 48 horas · {avisos.length}</TituloFranja>
          <div className="mb-3 flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtrar por estado">
            {["todos", "enviado", "pendiente", "agrupado", "descartado"].map((k) => {
              const activo = filtro === k;
              const n = k === "todos" ? avisos.length : cuenta(k);
              if (n === 0 && k !== "todos" && !activo) return null;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  onClick={() => setFiltro(k)}
                  className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] ${activo ? "border-l-tinta bg-l-tinta font-semibold text-l-papel" : "border-l-linea-2 text-l-tinta-2"}`}
                >
                  {k === "todos" ? "Todos" : ESTADO[k].label} <span className={activo ? "opacity-70" : "text-l-tinta-3"}>{n}</span>
                </button>
              );
            })}
          </div>
          {registro.isLoading && <p className="text-[14px] text-l-tinta-3">Cargando…</p>}
          {registro.error && <p className="text-[14px] text-l-critico-texto">No se pudo leer el registro.</p>}
          {registro.data && visibles.length === 0 && <p className="text-[14px] text-l-tinta-2">Nada con ese filtro.</p>}
          {visibles.length > 0 && (
            <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
              {visibles.map((a) => (
                <FilaAviso key={a.id} a={a} />
              ))}
            </ul>
          )}
        </section>
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <Tarjeta>
            <TituloFranja>El resumen, si saliera ahora</TituloFranja>
            {ensayo.isLoading ? (
              <p className="flex items-center gap-2 text-[13px] text-l-tinta-3">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Armándolo (revisa los links de las tendencias)…
              </p>
            ) : ensayo.error ? (
              <p className="text-[13px] text-l-critico-texto">No se pudo armar.</p>
            ) : (
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap font-sans text-[13px] leading-[1.5] text-l-tinta">{ensayo.data?.texto}</pre>
            )}
            <p className="mt-2 text-[12px] text-l-tinta-3">Es un ensayo: no manda nada. El de verdad sale a las 9:00.</p>
          </Tarjeta>
        </aside>
      </div>
    </>
  );
}

function FilaAviso({ a }: { a: Aviso }) {
  const [abierto, setAbierto] = useState(false);
  const e = ESTADO[a.estado] ?? { label: a.estado, clase: "bg-l-papel text-l-tinta-2" };
  const primera = a.texto.replace(/[*_]/g, "").split("\n").find((l) => l.trim()) ?? "";
  return (
    <li className="border-b border-l-linea last:border-b-0">
      <button type="button" onClick={() => setAbierto((x) => !x)} aria-expanded={abierto} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-l-papel/60">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
            <span className={`rounded-full px-2 py-0.5 font-medium ${e.clase}`}>{e.label}</span>
            <span className="font-semibold uppercase tracking-[0.06em] text-l-tinta-2">{a.tema}</span>
            <span className="text-l-tinta-3">{haceCuanto(a.createdAt) === "hoy" ? new Date(a.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : haceCuanto(a.createdAt)}</span>
          </span>
          <span className="mt-0.5 block truncate text-[14px] text-l-tinta">{primera}</span>
          {a.motivo && <span className="block text-[12px] text-l-tinta-3">Motivo: {a.motivo}</span>}
        </span>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-l-tinta-3 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {abierto && <pre className="whitespace-pre-wrap px-4 pb-4 font-sans text-[13px] leading-[1.5] text-l-tinta-2">{a.texto}</pre>}
    </li>
  );
}
