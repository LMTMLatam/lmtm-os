import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { waBotApi, type WaBotStatus, type WaGroupConfig } from "../api/waBot";
import { clientsApi } from "../api/clients";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Smartphone, CheckCircle2, RefreshCw, Unlink, Clock, Users, MessageSquare } from "lucide-react";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "recién";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  connected: { label: "Conectado", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  connecting: { label: "Esperando vinculación", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  disconnected: { label: "Desconectado", cls: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300" },
};

export function WhatsApp() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const qc = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "WhatsApp" }]);
  }, [setBreadcrumbs]);

  const statusQuery = useQuery({
    queryKey: ["wa-bot", "status"],
    queryFn: () => waBotApi.status(),
    refetchInterval: 4000,
  });

  const start = useMutation({
    mutationFn: () => waBotApi.start(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-bot", "status"] }),
  });
  const stop = useMutation({
    mutationFn: () => waBotApi.stop(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-bot", "status"] }),
  });

  const s: WaBotStatus | undefined = statusQuery.data;
  const status = s?.status ?? "disconnected";
  const meta = STATUS_META[status] ?? STATUS_META.disconnected;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-emerald-600" />
            WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bot de resúmenes de grupos. Vinculá un número para que lea los grupos y genere resúmenes automáticos con IA.
          </p>
        </div>
        <Badge className={`text-xs px-2 py-0.5 ${meta.cls}`}>{meta.label}</Badge>
      </div>

      {s && !s.openwaAvailable && (
        <Card className="p-4 border-destructive/20 bg-destructive/5">
          <p className="text-sm text-destructive">
            El gateway de WhatsApp no está disponible (OPENWA_URL no configurado o no responde).
          </p>
        </Card>
      )}

      {/* Connected */}
      {status === "connected" && (
        <Card className="p-6 flex flex-col items-center text-center gap-3">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <div>
            <p className="font-medium">WhatsApp vinculado</p>
            {s?.connectedPhone && (
              <p className="text-sm text-muted-foreground mt-0.5">+{s.connectedPhone}</p>
            )}
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            El bot ya está leyendo los grupos donde esté agregado este número. Agregalo a los grupos de clientes o equipo que quieras resumir.
          </p>
          <button
            onClick={() => { if (confirm("¿Desvincular WhatsApp? Vas a tener que escanear el QR de nuevo.")) stop.mutate(); }}
            disabled={stop.isPending}
            className="mt-2 inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50"
          >
            <Unlink className="h-3.5 w-3.5" />
            {stop.isPending ? "Desvinculando…" : "Desvincular"}
          </button>
        </Card>
      )}

      {/* Connecting — show QR */}
      {status === "connecting" && (
        <Card className="p-6 flex flex-col items-center text-center gap-4">
          <div className="w-[280px] h-[280px] bg-white rounded-md flex items-center justify-center overflow-hidden">
            {s?.qr ? (
              <img src={s.qr} alt="QR de vinculación de WhatsApp" className="w-[280px] h-[280px]" />
            ) : (
              <span className="text-sm text-zinc-500 flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Generando QR…
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground max-w-md space-y-1.5 text-left">
            <p className="font-medium text-foreground flex items-center gap-1.5">
              <Smartphone className="h-4 w-4" /> Cómo vincular
            </p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Abrí WhatsApp en el teléfono del bot.</li>
              <li>Ajustes → Dispositivos vinculados → Vincular un dispositivo.</li>
              <li>Escaneá este código. Se actualiza solo.</li>
            </ol>
          </div>
          <button
            onClick={() => stop.mutate()}
            disabled={stop.isPending}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Cancelar
          </button>
        </Card>
      )}

      {/* Disconnected — connect CTA */}
      {status === "disconnected" && (
        <Card className="p-8 flex flex-col items-center text-center gap-4">
          <MessageCircle className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground max-w-md">
            No hay ningún WhatsApp vinculado. Conectá uno para empezar a generar resúmenes de grupos.
            Recomendado: usar un número dedicado al bot, no uno personal.
          </p>
          <button
            onClick={() => start.mutate()}
            disabled={start.isPending || !s?.openwaAvailable}
            className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50"
          >
            <MessageCircle className="h-4 w-4" />
            {start.isPending ? "Iniciando…" : "Conectar WhatsApp"}
          </button>
          {start.data?.error && (
            <p className="text-xs text-rose-500">{start.data.error}</p>
          )}
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        La sesión se guarda de forma persistente: si redeployamos el servidor, no hace falta volver a escanear el QR.
      </p>

      <ConversationsPanel />
    </div>
  );
}

// ── Resúmenes de conversaciones por grupo ─────────────────────────────────────
function ConversationsPanel() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const configsQuery = useQuery({
    queryKey: ["wa-bot", "groupConfigs"],
    queryFn: () => waBotApi.groupConfigs(),
    refetchInterval: 30000,
  });
  const groupsQuery = useQuery({
    queryKey: ["wa-bot", "groups"],
    queryFn: () => waBotApi.groups(),
    refetchInterval: 30000,
  });

  // Union of groups that have a config and groups that have messages.
  const groups = useMemo(() => {
    const map = new Map<string, { jid: string; name: string | null; hasMessages?: boolean; cfg?: WaGroupConfig }>();
    for (const g of groupsQuery.data ?? []) map.set(g.groupJid, { jid: g.groupJid, name: g.groupName, hasMessages: g.hasMessages });
    for (const c of configsQuery.data ?? []) {
      const e = map.get(c.groupJid) ?? { jid: c.groupJid, name: c.groupName };
      e.cfg = c;
      e.name = e.name ?? c.groupName;
      map.set(c.groupJid, e);
    }
    return [...map.values()].sort((a, b) => (a.name ?? a.jid).localeCompare(b.name ?? b.jid));
  }, [groupsQuery.data, configsQuery.data]);

  const activeJid = selected ?? groups[0]?.jid ?? null;

  const summariesQuery = useQuery({
    queryKey: ["wa-bot", "summaries", activeJid],
    queryFn: () => waBotApi.groupSummaries(activeJid!),
    enabled: !!activeJid,
    refetchInterval: 30000,
  });

  const setCfg = useMutation({
    mutationFn: (args: { jid: string; body: Partial<WaGroupConfig> }) => waBotApi.setGroupConfig(args.jid, args.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-bot", "groupConfigs"] }),
  });

  const clientsQuery = useQuery({
    queryKey: ["clients", "active"],
    queryFn: () => clientsApi.list("active"),
  });
  const clientList: Array<{ id: string; name: string }> = Array.isArray(clientsQuery.data)
    ? (clientsQuery.data as Array<{ id: string; name: string }>)
    : ((clientsQuery.data as { clients?: Array<{ id: string; name: string }> } | undefined)?.clients ?? []);

  const active = groups.find((g) => g.jid === activeJid);
  const inactivity = active?.cfg?.inactivityMinutes ?? 60;

  return (
    <div className="space-y-3 pt-4 border-t">
      <div>
        <h2 className="text-lg font-medium flex items-center gap-2">
          <MessageSquare className="h-5 w-5" /> Resúmenes de conversaciones
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Acá figuran <strong>todos</strong> los grupos del número vinculado: asigná cada uno a su cliente desde el selector, tenga o no resúmenes todavía. Cuando un grupo queda inactivo por el tiempo configurado, el bot lo resume automáticamente.
        </p>
      </div>

      {groups.length === 0 ? (
        <Card className="p-8 text-center">
          <Users className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground mt-3">
            Todavía no hay grupos con actividad. Cuando el bot esté conectado y reciba mensajes en un grupo, vas a ver acá los resúmenes.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
          {/* Group list */}
          <div className="space-y-1">
            {groups.map((g) => (
              <button
                key={g.jid}
                onClick={() => setSelected(g.jid)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  g.jid === activeJid ? "bg-muted font-medium" : "hover:bg-muted/50 text-muted-foreground"
                }`}
              >
                <span className="truncate block">{g.name ?? g.jid}</span>
                <span className="flex items-center gap-1.5">
                  {g.cfg?.clientId ? (
                    <span className="text-[10px] text-emerald-500">vinculado</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60">sin vincular</span>
                  )}
                  {g.hasMessages === false && (
                    <span className="text-[10px] text-muted-foreground/50">· sin actividad</span>
                  )}
                  {g.cfg && !g.cfg.enabled && (
                    <span className="text-[10px] text-amber-500">· pausado</span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {/* Selected group: config + summaries */}
          <div className="space-y-3">
            {active && (
              <Card className="p-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-4 w-4" /> Resumir tras
                </span>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  defaultValue={inactivity}
                  key={`${activeJid}-${inactivity}`}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (v >= 5 && v !== inactivity && activeJid) setCfg.mutate({ jid: activeJid, body: { inactivityMinutes: v } });
                  }}
                  className="w-20 h-8 px-2 rounded-md border border-border bg-background text-sm"
                />
                <span className="text-muted-foreground">min de inactividad</span>
                <span className="w-full basis-full" />
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-4 w-4" /> Cliente
                </span>
                <select
                  value={active.cfg?.clientId ?? ""}
                  onChange={(e) => activeJid && setCfg.mutate({ jid: activeJid, body: { clientId: e.target.value || null } })}
                  className="h-8 px-2 rounded-md border border-border bg-background text-sm min-w-[180px]"
                >
                  <option value="">— Sin cliente —</option>
                  {clientList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => activeJid && setCfg.mutate({ jid: activeJid, body: { enabled: !(active.cfg?.enabled ?? true) } })}
                  className="ml-auto text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted"
                >
                  {active.cfg?.enabled === false ? "Reactivar" : "Pausar"} grupo
                </button>
              </Card>
            )}

            {summariesQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando resúmenes…</p>}
            {summariesQuery.data && summariesQuery.data.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Sin resúmenes todavía. Aparecerán cuando una conversación quede inactiva {inactivity} min.
              </p>
            )}
            {(summariesQuery.data ?? []).map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-2">
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {s.messageCount} mensajes · {timeAgo(s.createdAt)}
                  </span>
                  {s.sentAt ? (
                    <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] px-1.5 py-0">enviado</Badge>
                  ) : (
                    <Badge className="bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 text-[10px] px-1.5 py-0">solo panel</Badge>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{s.content}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
