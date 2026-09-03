// LMTM-OS: cola y resultados de generación de contenido (Higgsfield).
//
// El flujo real vive en ClickUp: el equipo etiqueta la pieza con "generar
// contenido" y el barrido la toma sola cada 10 minutos. Esta pantalla es la otra
// puerta — ver qué hay en cola, cuántos créditos quedan y forzar una pieza sin
// esperar el barrido.
//
// Muestra TODO lo generado, no solo video: los carruseles y placas salen del
// mismo circuito y el equipo los aprueba igual (se llamaba "Videos" y los
// dejaba afuera — 18/8).

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Clapperboard, ExternalLink, Loader2, Coins, AlertTriangle } from "lucide-react";

interface Pendiente {
  clientId: string; cliente: string; taskId: string;
  titulo: string; url: string | null; tipo: string | null; conImagen: boolean;
}
interface Estado { sesion?: "ok" | "caida"; via?: "plan" | "api" | null; creditos?: number | null; avisoSesion?: string | null; etiqueta: string; pendientes: Pendiente[] }
interface PiezaHecha {
  id: string; title: string; url: string | null; clientId: string | null;
  /** video | placa | carrusel | imagen — decide la miniatura y el distintivo. */
  kind: string;
  metadata: Record<string, unknown>; createdAt: string;
}

/** Las imágenes de Drive no son públicas: se piden por el proxy del servidor,
 *  igual que en la pestaña Marca. Un video no se previsualiza — se muestra el
 *  ícono y el clic lleva a la tarea. */
function miniaturaDe(p: PiezaHecha): string | null {
  if (p.kind === "video") return null;
  const id = /\/d\/([\w-]{20,})/.exec(p.url ?? "")?.[1];
  return id ? `/api/drive-img/${id}` : p.url;
}

export function Contenido() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const qc = useQueryClient();
  const [generando, setGenerando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setBreadcrumbs([{ label: "Contenido" }]); }, [setBreadcrumbs]);

  const estadoQuery = useQuery({
    queryKey: ["video", "estado"],
    queryFn: () => api.get<Estado>("/video/estado"),
    refetchInterval: 60_000,
  });
  const hechosQuery = useQuery({
    queryKey: ["contenido", "generados"],
    queryFn: () => api.get<{ videos: PiezaHecha[] }>("/video/generados"),
  });

  const generar = useMutation({
    mutationFn: (p: Pendiente) => api.post<{ ok: boolean; url?: string; error?: string }>("/video/generar", { clientId: p.clientId, taskId: p.taskId }),
    onMutate: (p) => { setGenerando(p.taskId); setError(null); },
    onSuccess: (r) => {
      if (!r.ok) setError(r.error ?? "no se pudo generar");
      void qc.invalidateQueries({ queryKey: ["video"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    onSettled: () => setGenerando(null),
  });

  const estado = estadoQuery.data;
  const pendientes = estado?.pendientes ?? [];
  const sesionCaida = estado?.sesion === "caida";

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-muted-foreground" />
            Contenido
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Etiquetá una pieza en ClickUp con <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{estado?.etiqueta ?? "generar video"}</code> y
            el sistema genera lo que corresponda según el campo <strong>Tipo de Contenido</strong>: reel, clip, placa o carrusel. Nada se publica solo — el resultado vuelve como comentario en la tarea.
          </p>
        </div>
        <Card className="px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <Coins className={`h-4 w-4 ${sesionCaida ? "text-rose-500" : "text-emerald-500"}`} />
            <div>
              <p className={`text-sm font-semibold leading-none ${sesionCaida ? "text-rose-500" : ""}`}>
                {sesionCaida ? "No puede generar"
                  : estado?.via === "plan" ? `Plan · ${estado?.creditos ?? "—"} créditos`
                  : "API (pago por uso)"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {estado?.via === "plan" ? "gastando la suscripción" : estado?.via === "api" ? "el plan no está disponible" : "Higgsfield"}
              </p>
            </div>
          </div>
        </Card>
      </header>

      {estado?.avisoSesion && (
        <Card className={`p-3 border-l-4 flex items-start gap-2 ${sesionCaida ? "border-l-rose-500" : "border-l-amber-500"}`}>
          <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${sesionCaida ? "text-rose-500" : "text-amber-500"}`} />
          <p className="text-xs">
            {estado?.avisoSesion}
          </p>
        </Card>
      )}


      {error && (
        <Card className="p-3 border-l-4 border-l-amber-500 text-xs">{error}</Card>
      )}

      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">En cola ({pendientes.length})</h2>
        {estadoQuery.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : pendientes.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            Nada etiquetado. El barrido revisa las listas de Redes cada 10 minutos.
          </p>
        ) : (
          <div className="space-y-2">
            {pendientes.map((p) => (
              <div key={p.taskId} className="flex items-center gap-3 border-b last:border-0 pb-2 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate" title={p.titulo}>{p.titulo}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {p.cliente}{p.tipo ? ` · ${p.tipo}` : ""}{p.conImagen ? " · con imagen base" : " · sin imagen base"}
                  </p>
                </div>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noreferrer noopener" className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={generando != null || sesionCaida}
                  onClick={() => generar.mutate(p)}
                >
                  {generando === p.taskId
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="ml-1.5">Generando…</span></>
                    : "Generar"}
                </Button>
              </div>
            ))}
          </div>
        )}
        {generando && (
          <p className="text-[10px] text-muted-foreground mt-3">
            Tarda ~2 minutos. Podés cerrar la pantalla: el resultado igual llega como comentario a la tarea de ClickUp.
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Últimos generados</h2>
        {hechosQuery.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (hechosQuery.data?.videos ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Todavía no se generó nada.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(hechosQuery.data?.videos ?? []).slice(0, 16).map((v) => {
              const mini = miniaturaDe(v);
              const esVideo = v.kind === "video";
              const piezas = Number(v.metadata?.piezas ?? 0);
              return (
                <a
                  key={v.id}
                  // Al link de la TAREA, no al archivo: desde la tarea se ve el
                  // contexto (copy, tipo, comentario con el prompt) y se aprueba o
                  // se manda a regenerar. El archivo suelto no deja hacer nada
                  // (pedido del usuario 18/8).
                  href={(v.metadata?.taskUrl as string | undefined) ?? v.url ?? undefined}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block border rounded-lg overflow-hidden hover:border-foreground/30"
                >
                  <div className="aspect-[9/16] bg-muted flex items-center justify-center relative">
                    {mini
                      ? <img src={mini} alt="" loading="lazy" className="h-full w-full object-cover" />
                      : <Clapperboard className="h-5 w-5 text-muted-foreground/40" />}
                    <span className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded bg-background/85 backdrop-blur-sm">
                      {esVideo ? "Video" : piezas > 1 ? `Carrusel ${piezas}` : "Placa"}
                    </span>
                  </div>
                  <p className="text-[10px] p-2 line-clamp-2" title={v.title}>
                    {v.title.replace(/^(Video|Placa|Carrusel): /, "")}
                  </p>
                </a>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
