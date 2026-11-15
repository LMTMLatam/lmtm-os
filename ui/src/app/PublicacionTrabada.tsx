// LMTM: posts que Make no pudo publicar, con la causa y un botón (plan 15/11, fase 5).
// Reprocesar publica en la cuenta del cliente: pide confirmar en el lugar.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OctagonAlert } from "lucide-react";
import { api } from "../api/client";
import { TituloFranja } from "./HoyApp";

interface Trabada { dlqId: string; scenarioId: number; escenario: string; clientId: string | null; cliente: string; creada: string; motivo: string; causa: string; intentos: number | null }

const cuando = (s: string) => new Date(s).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });

export function PublicacionTrabada() {
  const qc = useQueryClient();
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["lmtm", "publicacion", "trabadas"], queryFn: () => api.get<{ trabadas: Trabada[]; ciego: boolean }>("/publicacion/trabadas"), refetchInterval: 10 * 60_000 });
  const repro = useMutation({
    mutationFn: (dlqId: string) => api.post<{ ok: boolean; motivo?: string }>("/publicacion/reprocesar", { dlqId }),
    onSuccess: () => { setConfirmar(null); setTimeout(() => void qc.invalidateQueries({ queryKey: ["lmtm", "publicacion", "trabadas"] }), 20_000); },
  });
  const lista = q.data?.trabadas ?? [];
  if (q.isLoading) return null;
  if (q.data?.ciego) return <p className="text-[13px] text-l-atencion-texto">No se pudo leer Make: no sé si hay posts trabados.</p>;
  if (!lista.length) return null;
  return (
    <section>
      <TituloFranja critico>Posts que no salieron · {lista.length}</TituloFranja>
      <p className="-mt-1.5 mb-3 text-[13px] text-l-tinta-3">Make no los pudo publicar (últimos 14 días). Reprocesar los retoma desde la red que falló, sin repetir las que ya salieron.</p>
      <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
        {lista.map((t) => (
          <li key={t.dlqId} className="flex flex-wrap items-start gap-x-4 gap-y-1.5 border-b border-l-linea px-4 py-3 last:border-0">
            <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-l-critico" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">{t.cliente} <span className="font-normal text-l-tinta-3">· {cuando(t.creada)}{t.intentos ? ` · ${t.intentos} intentos` : ""}</span></div>
              <p className="text-[13px] text-l-tinta-2">{t.causa}</p>
            </div>
            {/no sirve/i.test(t.causa) ? (
              <span className="text-[12px] text-l-tinta-3">Reprocesar no lo arregla</span>
            ) : confirmar === t.dlqId ? (
              <span className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-l-tinta-2">¿Publicarlo ahora en la cuenta de {t.cliente}?</span>
                <button type="button" disabled={repro.isPending} onClick={() => repro.mutate(t.dlqId)} className="min-h-9 rounded-[8px] bg-l-marca px-3 font-semibold text-white disabled:opacity-50">Sí, reprocesar</button>
                <button type="button" onClick={() => setConfirmar(null)} className="min-h-9 rounded-[8px] px-2 text-l-tinta-2">Cancelar</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmar(t.dlqId)} className="min-h-9 rounded-[8px] border border-l-linea-2 px-3 text-[13px] hover:border-l-tinta-3">Reprocesar</button>
            )}
          </li>
        ))}
      </ul>
      {repro.data && !repro.data.ok && <p className="mt-2 text-[13px] text-l-critico-texto" role="alert">{repro.data.motivo}</p>}
      {repro.data?.ok && <p className="mt-2 text-[13px] text-l-tinta-2" role="status">Reprocesando en Make. En unos segundos sale de la lista si publicó.</p>}
    </section>
  );
}
