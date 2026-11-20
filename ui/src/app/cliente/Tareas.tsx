// Ficha del cliente, sección partida de pages/ClientDashboard.tsx (rediseño 20/11).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientsApi, type Client } from "../../api/clients";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Calendar, CheckCircle2, ListTodo, Clock } from "lucide-react";

export function TasksTab({ client }: { client: Client }) {
  const qc = useQueryClient();
  const tasksQuery = useQuery({
    queryKey: ["client", client.slug, "tasks"],
    queryFn: () => clientsApi.tasks(client.slug),
    refetchInterval: 30000,
  });
  const act = useMutation({
    mutationFn: (args: { issueId: string; action: "approve" | "dismiss" }) => clientsApi.taskAction(args.issueId, args.action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", client.slug, "tasks"] }),
  });
  const sugAct = useMutation({
    mutationFn: (args: { oppId: string; action: "accept" | "dismiss" }) =>
      clientsApi.suggestionAction(client.id, args.oppId, args.action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", client.slug, "tasks"] }),
  });
  const runOpps = useMutation({
    mutationFn: () => clientsApi.runOpportunities(client.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", client.slug, "tasks"] }),
  });

  const data = tasksQuery.data;
  if (tasksQuery.isLoading) return <p className="text-sm text-muted-foreground">Cargando tareas…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">No se pudieron cargar las tareas.</p>;

  const proposals = data.tasks.filter((t) => t.needsApproval);
  const active = data.tasks.filter((t) => !t.needsApproval && !["done", "cancelled"].includes(t.status));
  const done = data.tasks.filter((t) => ["done", "cancelled"].includes(t.status));
  const suggestions = data.suggestions ?? [];

  const postCls =
    data.posting.status === "ok" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : data.posting.status === "warn" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300";
  const PostIcon = data.posting.status === "ok" ? CheckCircle2 : AlertCircle;
  const prioCls = (p: string) =>
    p === "urgent" || p === "high" ? "text-rose-600 dark:text-rose-400" : p === "low" ? "text-muted-foreground" : "text-foreground";

  return (
    <div className="space-y-4">
      {/* Posting status */}
      <Card className={`p-3 flex items-center gap-2 text-sm ${postCls}`}>
        <PostIcon className="h-4 w-4 shrink-0" />
        <span className="font-medium">Posteo:</span>
        <span>{data.posting.detail}</span>
      </Card>

      {/* Proposals awaiting approval */}
      {proposals.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-amber-500" /> Para aprobar ({proposals.length})
          </h3>
          <div className="space-y-2">
            {proposals.map((t) => (
              <Card key={t.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.identifier} · {new Date(t.createdAt).toLocaleDateString("es-AR")}
                      {t.responsable ? ` · lo sigue ${t.responsable}` : ""}
                      {t.plazo ? ` · plazo ${t.plazo}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ issueId: t.id, action: "approve" })}>Aprobar</Button>
                    <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ issueId: t.id, action: "dismiss" })}>Descartar</Button>
                  </div>
                </div>
                {/* Qué se está pidiendo. Sin esto la tarjeta era un título suelto
                    y el cliente no aprobaba ni descartaba: quedaban 247 colgadas. */}
                {t.queHacer && (
                  <p className="text-xs leading-relaxed text-muted-foreground border-l-2 border-amber-500/40 pl-2.5">{t.queHacer}</p>
                )}
                {t.pasos.length > 0 && (
                  <ol className="text-xs text-muted-foreground space-y-0.5 pl-2.5">
                    {t.pasos.map((paso, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-amber-500/70 shrink-0">{i + 1}.</span>
                        <span>{paso}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Active tasks */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
          <ListTodo className="h-4 w-4" /> Tareas activas ({active.length})
        </h3>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin tareas activas para este cliente.</p>
        ) : (
          <div className="space-y-1.5">
            {active.map((t) => (
              <Card key={t.id} className="p-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.identifier} · {t.status}</p>
                </div>
                <span className={`text-xs shrink-0 ${prioCls(t.priority)}`}>{t.priority}</span>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Scheduled content */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
          <Calendar className="h-4 w-4" /> Contenido programado (ClickUp)
        </h3>
        {data.scheduled.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin contenido programado en la ventana (o lista de Redes no mapeada).</p>
        ) : (
          <div className="space-y-1">
            {data.scheduled.slice(0, 30).map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm py-1 border-b border-border/40 last:border-0">
                <span className="truncate flex items-center gap-1.5">
                  {s.published ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> : <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  {s.name}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {s.plannedDate ? new Date(s.plannedDate).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : "—"} · {s.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {done.length > 0 && (
        <p className="text-xs text-muted-foreground">{done.length} tarea(s) cerrada(s).</p>
      )}
    </div>
  );
}

/** Análisis estratégico en lenguaje cliente: qué está pasando, campañas
 *  fatigadas y recomendación de reinversión — con botón copiar-para-el-cliente. */
