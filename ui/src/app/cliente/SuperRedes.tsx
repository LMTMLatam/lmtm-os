// Ficha del cliente → Contenido → Ideas: la lista «Super Redes Sociales» de ClickUp
// (pedido de Naza 20/11: «en el lugar de ideas de contenido, que es donde debe volcar
// las ideas»). Ahí caen las ideas de los agentes y ahí las aprueba el equipo. Cada idea
// tiene «Generar con el agente»: lo mismo que la etiqueta «generar contenido» de
// ClickUp, sin salir del panel; la pieza la arma el Productor de contenido (Magnific).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, OctagonAlert, RefreshCw, Sparkles } from "lucide-react";
import { api } from "../../api/client";
import { clientsApi, type Client } from "../../api/clients";

export interface IdeaSuperRedes {
  id: string; nombre: string; url: string | null; status: string | null; creada: string | null;
  tipo: string | null; estado: string | null; aprobacion: string | null; copy: string | null;
  pedida: boolean; generada: boolean;
  productor: { identifier: string; status: string } | null;
}

export type FiltroIdeas = "todas" | "aprobar" | "aprobadas" | "pedidas" | "generadas";

/** Puro. Qué ideas entran en cada filtro. Lo generado no cuenta como pedido; lo pedido sí, venga del panel o de la etiqueta. */
export function pasaFiltro(i: IdeaSuperRedes, f: FiltroIdeas): boolean {
  if (f === "todas") return true;
  if (f === "generadas") return i.generada;
  if (f === "pedidas") return !i.generada && (i.pedida || i.productor != null);
  if (f === "aprobadas") return /^\s*aprob/i.test(i.aprobacion ?? "");
  return /pendiente/i.test(i.aprobacion ?? "") || (!i.aprobacion && !i.generada && !i.pedida && !i.productor);
}

const FILTROS: Array<{ k: FiltroIdeas; label: string }> = [
  { k: "todas", label: "Todas" },
  { k: "aprobar", label: "Para aprobar" },
  { k: "aprobadas", label: "Aprobadas" },
  { k: "pedidas", label: "Pedidas al agente" },
  { k: "generadas", label: "Con contenido" },
];

const ESTADO_PEDIDO: Record<string, string> = {
  backlog: "en cola", todo: "en cola", in_progress: "produciendo", in_review: "para revisar", blocked: "frenado", done: "entregado",
};
const fecha = (iso: string) => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "numeric" }).format(new Date(iso));

export function SuperRedesTab({ client }: { client: Client }) {
  const qc = useQueryClient();
  const clave = ["lmtm", "super-redes", client.id];
  const q = useQuery({
    queryKey: clave,
    queryFn: () => api.get<{ listaId: string | null; ideas: IdeaSuperRedes[] }>(`/contenido/super-redes/${client.id}`),
    staleTime: 2 * 60_000,
  });
  // Las ideas nuevas las arman los agentes y caen en esta misma lista (pushIdeasToSuperRedes).
  const nuevas = useMutation({
    mutationFn: () => clientsApi.generateContent(client.id),
    onSettled: () => void qc.invalidateQueries({ queryKey: clave }),
  });
  const [filtro, setFiltro] = useState<FiltroIdeas>("todas");
  const ideas = q.data?.ideas ?? [];
  const visibles = ideas.filter((i) => pasaFiltro(i, filtro));
  const teamId = (client.metadata?.clickupTeamId as string | undefined) || "9013352440";
  const urlLista = q.data?.listaId ? `https://app.clickup.com/${teamId}/v/li/${q.data.listaId}` : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold">Ideas · Super Redes</h2>
          <p className="text-[13px] text-l-tinta-3">La lista de ClickUp donde caen las ideas y donde se aprueban. «Generar con el agente» es lo mismo que la etiqueta «generar contenido».</p>
        </div>
        {urlLista && (
          <a href={urlLista} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] border border-l-linea-2 px-3.5 text-[14px] text-l-tinta hover:border-l-marca">
            Abrir en ClickUp <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
        <button
          type="button"
          onClick={() => nuevas.mutate()}
          disabled={nuevas.isPending}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] border border-l-linea-2 px-3.5 text-[14px] text-l-tinta hover:border-l-marca disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${nuevas.isPending ? "animate-spin" : ""}`} aria-hidden /> {nuevas.isPending ? "Pensando ideas…" : "Ideas nuevas"}
        </button>
        <a href={clientsApi.contentCsvUrl(client.slug)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center px-2 text-[13px] text-l-tinta-3 hover:text-l-tinta">
          CSV
        </a>
      </div>
      {nuevas.isSuccess && <p className="text-[13px] text-l-bien-texto" role="status">Listo: las ideas nuevas que pasaron el control quedaron en Super Redes.</p>}
      {nuevas.error && <p className="text-[13px] text-l-critico-texto" role="alert">No se pudieron generar ideas: {nuevas.error instanceof Error ? nuevas.error.message : "error"}</p>}

      {q.isLoading && <p className="text-[14px] text-l-tinta-3" role="status">Leyendo la lista de ClickUp…</p>}
      {q.error && (
        <p className="flex gap-1.5 text-[14px] text-l-critico-texto" role="alert">
          <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {q.error instanceof Error ? q.error.message : "No se pudo leer la lista."}
        </p>
      )}
      {q.data && !q.data.listaId && (
        <p className="rounded-2xl border border-l-linea bg-l-sup px-4 py-5 text-[14px] text-l-tinta-2">
          Este cliente no tiene una lista «Super Redes» en su carpeta de ClickUp. Se crea en ClickUp (con ese nombre) y aparece acá sola.
        </p>
      )}

      {q.data?.listaId && (
        <>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar ideas">
            {FILTROS.map((f) => {
              const n = ideas.filter((i) => pasaFiltro(i, f.k)).length;
              const activo = f.k === filtro;
              return (
                <button
                  key={f.k}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  onClick={() => setFiltro(f.k)}
                  className={`min-h-9 rounded-full border px-3.5 text-[13px] ${activo ? "border-transparent bg-[image:var(--l-marca-grad)] font-semibold text-l-marca-tinta" : "border-l-linea-2 text-l-tinta-2"}`}
                >
                  {f.label} <span className={activo ? "opacity-70" : "text-l-tinta-3"}>{n}</span>
                </button>
              );
            })}
          </div>
          {visibles.length === 0 ? (
            <p className="text-[14px] text-l-tinta-3">No hay ideas con ese filtro.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visibles.map((i) => (
                <FilaIdea key={i.id} i={i} clientId={client.id} />
              ))}
            </ul>
          )}
          {ideas.length >= 100 && <p className="text-[12px] text-l-tinta-3">Se muestran las 100 más nuevas; el resto está en ClickUp.</p>}
        </>
      )}
    </section>
  );
}

function Chip({ children, tono }: { children: React.ReactNode; tono?: "bien" | "atencion" | "marca" }) {
  const c = tono === "bien" ? "text-l-bien-texto" : tono === "atencion" ? "text-l-atencion-texto" : tono === "marca" ? "bg-l-marca-suave text-l-tinta" : "text-l-tinta-2";
  return <span className={`inline-flex items-center rounded-full bg-l-papel px-2.5 py-0.5 text-[12px] font-medium ${c}`}>{children}</span>;
}

function FilaIdea({ i, clientId }: { i: IdeaSuperRedes; clientId: string }) {
  const qc = useQueryClient();
  const [abierta, setAbierta] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const pedir = useMutation({
    mutationFn: () => api.post<{ ok: boolean; mensaje: string }>(`/contenido/super-redes/${clientId}/${i.id}/pedir`, {}),
    onSettled: () => {
      setConfirmando(false);
      void qc.invalidateQueries({ queryKey: ["lmtm", "super-redes", clientId] });
    },
  });
  const aprob = i.aprobacion ?? "";
  return (
    <li className="rounded-[16px] border border-l-linea bg-l-sup px-4 py-3.5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-[999_1_320px]">
          <button type="button" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta} className="text-left text-[15px] font-medium leading-[1.4] text-l-tinta hover:text-l-marca">
            {i.nombre}
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {i.tipo && <Chip tono="marca">{i.tipo}</Chip>}
            {aprob && <Chip tono={/^\s*aprob/i.test(aprob) ? "bien" : /pendiente/i.test(aprob) ? "atencion" : undefined}>{aprob}</Chip>}
            {i.estado && <Chip>{i.estado}</Chip>}
            {i.creada && <span className="text-[12px] text-l-tinta-3">{fecha(i.creada)}</span>}
          </div>
          {i.copy && <p className={`mt-2 whitespace-pre-line text-[13px] leading-[1.5] text-l-tinta-2 ${abierta ? "" : "line-clamp-2"}`}>{i.copy}</p>}
        </div>
        <div className="flex flex-[1_1_220px] flex-col items-end gap-1.5 text-right">
          {i.generada ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-l-bien-texto">
              <Check className="h-4 w-4" aria-hidden /> Contenido generado
            </span>
          ) : i.productor ? (
            <span className="text-[13px] text-l-tinta-2">
              Pedido al Productor · {i.productor.identifier} · <span className="font-semibold text-l-tinta">{ESTADO_PEDIDO[i.productor.status] ?? i.productor.status}</span>
            </span>
          ) : /^\s*vivo/i.test(i.tipo ?? "") ? (
            <span className="text-[13px] text-l-tinta-3">Es un vivo: no se genera</span>
          ) : pedir.data ? (
            <span className={`text-[13px] ${pedir.data.ok ? "text-l-bien-texto" : "text-l-critico-texto"}`} role="status">{pedir.data.mensaje}</span>
          ) : confirmando ? (
            <span className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-[12px] text-l-tinta-2">Usa créditos de Magnific. ¿Pedírsela al agente?</span>
              <button
                type="button"
                onClick={() => pedir.mutate()}
                disabled={pedir.isPending}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] bg-[image:var(--l-marca-grad)] px-3.5 text-[13px] font-semibold text-l-marca-tinta disabled:opacity-50"
              >
                {pedir.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Confirmar
              </button>
              <button type="button" onClick={() => setConfirmando(false)} disabled={pedir.isPending} className="min-h-10 rounded-[10px] border border-l-linea-2 px-3 text-[13px] text-l-tinta-2">
                Cancelar
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] bg-[image:var(--l-marca-grad)] px-4 text-[14px] font-semibold text-l-marca-tinta"
            >
              <Sparkles className="h-4 w-4" aria-hidden /> Generar con el agente
            </button>
          )}
          {pedir.error && <span className="text-[12px] text-l-critico-texto" role="alert">{pedir.error instanceof Error ? pedir.error.message : "No se pudo pedir."}</span>}
          {i.url && (
            <a href={i.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center gap-1 text-[12px] text-l-tinta-3 hover:text-l-tinta">
              Ver en ClickUp <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
