// Link del cliente: las piezas que tiene para aprobar (plan 21/11). Aparece solo si
// la agencia lo prendió para ese cliente y hay algo pendiente. El cliente aprueba o
// pide cambios; no toca fechas ni textos.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, MessageSquare } from "lucide-react";

interface Pieza { id: string; nombre: string; fecha: string; redes: string[]; formato: string | null; copy: string | null; falta: string[] }

const dia = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

async function pedir<T>(slug: string, path: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(`/api/public/dashboards/${slug}/aprobaciones${path}`, {
    credentials: "omit",
    ...(cuerpo ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) } : {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? "No se pudo. Probá de nuevo.");
  return j as T;
}

function UnaPieza({ slug, p }: { slug: string; p: Pieza }) {
  const qc = useQueryClient();
  const [cambios, setCambios] = useState<string | null>(null);
  const decidir = useMutation({
    mutationFn: (b: { accion: "aprobar" | "cambios"; texto?: string }) => pedir<{ ok: boolean }>(slug, `/${p.id}`, b),
    onSuccess: (_r, b) => { if (b.accion === "aprobar") void qc.invalidateQueries({ queryKey: ["public", slug, "aprobaciones"] }); },
  });
  const pedido = decidir.isSuccess && decidir.variables?.accion === "cambios";
  return (
    <li className="rounded-[14px] border border-l-linea bg-l-papel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold text-l-tinta">{p.nombre}</span>
        <span className="text-[12px] text-l-tinta-3">sale el {dia(p.fecha)}</span>
      </div>
      <div className="mt-0.5 text-[12px] text-l-tinta-3">{[p.formato, ...p.redes].filter(Boolean).join(" · ")}</div>
      {p.copy ? <p className="mt-2 whitespace-pre-wrap text-[14px] leading-[1.5] text-l-tinta-2">{p.copy}</p> : <p className="mt-2 text-[13px] text-l-tinta-3">El texto todavía no está cargado.</p>}
      {cambios !== null && !pedido && (
        <textarea value={cambios} onChange={(e) => setCambios(e.target.value)} rows={3} maxLength={1000} placeholder="¿Qué habría que cambiar?" aria-label="Qué cambiar"
          className="mt-3 w-full rounded-[12px] border border-l-linea-2 bg-l-sup p-3 text-[14px] text-l-tinta outline-none focus:border-l-marca" />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {pedido ? (
          <span className="text-[13px] text-l-bien-texto" role="status">Le avisamos al equipo. Cuando esté corregida, vuelve a aparecer acá.</span>
        ) : cambios === null ? (
          <>
            <button type="button" disabled={decidir.isPending} onClick={() => decidir.mutate({ accion: "aprobar" })}
              className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-[image:var(--l-marca-grad)] px-5 text-[14px] font-semibold text-l-marca-tinta disabled:opacity-50">
              {decidir.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Aprobar
            </button>
            <button type="button" onClick={() => setCambios("")} className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-l-linea-2 px-4 text-[14px] font-medium text-l-tinta-2">
              <MessageSquare className="h-4 w-4" aria-hidden /> Pedir cambios
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={decidir.isPending || cambios.trim().length < 3} onClick={() => decidir.mutate({ accion: "cambios", texto: cambios })}
              className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-[image:var(--l-marca-grad)] px-5 text-[14px] font-semibold text-l-marca-tinta disabled:opacity-50">
              {decidir.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Enviar
            </button>
            <button type="button" onClick={() => setCambios(null)} className="min-h-11 px-3 text-[14px] text-l-tinta-3">Cancelar</button>
          </>
        )}
        {decidir.isError && <span className="text-[13px] text-l-critico-texto" role="alert">{(decidir.error as Error).message}</span>}
      </div>
    </li>
  );
}

export function AprobacionesPublic({ slug }: { slug: string }) {
  const q = useQuery({
    queryKey: ["public", slug, "aprobaciones"],
    queryFn: () => pedir<{ activo: boolean; piezas: Pieza[] }>(slug, ""),
    enabled: !!slug, retry: false, staleTime: 60_000,
  });
  if (!q.data?.activo || q.data.piezas.length === 0) return null;
  return (
    <section className="mb-6 rounded-[18px] border border-l-marca/40 bg-l-sup p-4 sm:p-5" aria-label="Piezas para aprobar">
      <h2 className="text-[17px] font-semibold text-l-tinta">Tenés {q.data.piezas.length} {q.data.piezas.length === 1 ? "pieza" : "piezas"} para aprobar</h2>
      <p className="mt-0.5 text-[13px] text-l-tinta-3">Lo que no esté aprobado el día que le toca, no se publica.</p>
      <ul className="mt-3 flex flex-col gap-3">{q.data.piezas.map((p) => <UnaPieza key={p.id} slug={slug} p={p} />)}</ul>
    </section>
  );
}
