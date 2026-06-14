import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { clientsApi, type Client, type ClientStatus, type ClientTier } from "../api/clients";
import { queryKeys } from "../lib/queryKeys";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Search, ExternalLink, Globe, User, Building2 } from "lucide-react";

const STATUS_OPTIONS: Array<{ value: ClientStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "offboarded", label: "Offboarded" },
];

const TIER_VARIANT: Record<ClientTier, string> = {
  starter: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
  standard: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  growth: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  enterprise: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const STATUS_VARIANT: Record<ClientStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  paused: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  offboarded: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
  churned: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

function formatRetainer(cents: number, currency: string) {
  if (!cents) return "—";
  const value = cents / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function Clients() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [status, setStatus] = useState<ClientStatus | "all">("active");
  const [q, setQ] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Clients" }]);
  }, [setBreadcrumbs]);

  const query = useQuery({
    queryKey: queryKeys.clients.list(status),
    queryFn: () => clientsApi.list(status === "all" ? undefined : status),
  });

  const clients: Client[] = query.data?.clients ?? [];

  const filtered = useMemo(() => {
    if (!q.trim()) return clients;
    const needle = q.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.slug.toLowerCase().includes(needle) ||
        c.legalName?.toLowerCase().includes(needle) ||
        c.industry?.toLowerCase().includes(needle) ||
        c.primaryContactName?.toLowerCase().includes(needle),
    );
  }, [clients, q]);

  const totalRetainer = useMemo(
    () => clients.reduce((acc, c) => acc + (c.monthlyRetainerCents || 0), 0),
    [clients],
  );
  const byTier = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of clients) counts[c.tier] = (counts[c.tier] || 0) + 1;
    return counts;
  }, [clients]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {clients.length} {status === "all" ? "" : status} client{clients.length === 1 ? "" : "s"}
            {Object.keys(byTier).length > 0 && (
              <>
                {" · "}
                {Object.entries(byTier)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([t, n]) => `${n} ${t}`)
                  .join(" · ")}
              </>
            )}
            {totalRetainer > 0 && (
              <>
                {" · "}
                <span className="tabular-nums">{formatRetainer(totalRetainer, "ARS")}/mo total</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name, slug, contact…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8 h-8 w-64 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-1.5 text-sm">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatus(opt.value)}
            className={`px-3 py-1 rounded-md transition-colors ${
              status === opt.value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Loading / error states */}
      {query.isLoading && (
        <p className="text-sm text-muted-foreground">Loading clients…</p>
      )}
      {query.isError && (
        <Card className="p-4 border-destructive/20 bg-destructive/5">
          <p className="text-sm text-destructive">
            Failed to load clients: {(query.error as Error).message}
          </p>
        </Card>
      )}

      {/* Empty state */}
      {query.isSuccess && clients.length === 0 && (
        <Card className="p-10 text-center">
          <Building2 className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground mt-3">No clients in this status.</p>
        </Card>
      )}

      {/* Client grid */}
      {query.isSuccess && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <ClientCard key={c.id} client={c} />
          ))}
        </div>
      )}

      {/* Filtered-out indicator */}
      {query.isSuccess && clients.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No clients match "{q}".
        </p>
      )}
    </div>
  );
}

// LMTM's ClickUp workspace ("LMTM"). Used as a fallback for building deep
// links when a client row hasn't stored its teamId yet (pre-sync).
const CLICKUP_TEAM_FALLBACK = "9013352440";

function clickupUrl(teamId: string, kind: "f" | "li" | "dc", id: string): string {
  // f = folder, li = list, dc = doc
  return `https://app.clickup.com/${teamId}/v/${kind}/${id}`;
}

function ClickUpLinks({ client }: { client: Client }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const teamId = client.metadata?.clickupTeamId ?? CLICKUP_TEAM_FALLBACK;

  const runSync = async (open: boolean) => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await clientsApi.clickupSync(client.slug);
      const tId = r.teamId ?? teamId;
      if (r.folderId && open) window.open(clickupUrl(tId, "f", r.folderId), "_blank");
      if (r.warnings?.length && !r.folderId) {
        setSyncMsg({ ok: false, text: r.warnings.join("; ") });
      } else {
        setSyncMsg({ ok: true, text: r.folderId ? "Sincronizado ✓" : "Sin carpeta" });
      }
    } catch (e) {
      setSyncMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {client.clickupFolderId ? (
        <a
          href={clickupUrl(teamId, "f", client.clickupFolderId)}
          target="_blank"
          rel="noreferrer noopener"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          title="Abrir carpeta del cliente en ClickUp"
        >
          ClickUp
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      ) : (
        <button
          onClick={() => runSync(true)}
          disabled={syncing}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
          title="Detectar carpeta del cliente en ClickUp y abrirla"
        >
          {syncing ? "↻ Sincronizando…" : "ClickUp"}
          {!syncing && <ExternalLink className="h-2.5 w-2.5" />}
        </button>
      )}

      {/* Pills for the 3 key resources */}
      {client.clickupListRedesId && (
        <a href={clickupUrl(teamId, "li", client.clickupListRedesId)} target="_blank" rel="noreferrer noopener"
          className="text-muted-foreground/60 hover:text-foreground text-[10px]" title="📲 Redes Sociales">RS</a>
      )}
      {client.clickupListVideoId && (
        <a href={clickupUrl(teamId, "li", client.clickupListVideoId)} target="_blank" rel="noreferrer noopener"
          className="text-muted-foreground/60 hover:text-foreground text-[10px]" title="Producción de video">PV</a>
      )}
      {client.clickupListEnfoqueTecnicoId && (
        <a href={clickupUrl(teamId, "dc", client.clickupListEnfoqueTecnicoId)} target="_blank" rel="noreferrer noopener"
          className="text-muted-foreground/60 hover:text-foreground text-[10px]" title="Enfoque Técnico (doc de contexto)">ET</a>
      )}

      {/* Re-sync affordance once a folder is known (refresh lists/doc ids) */}
      {client.clickupFolderId && (
        <button onClick={() => runSync(false)} disabled={syncing}
          className="text-muted-foreground/40 hover:text-foreground text-[10px] disabled:opacity-50"
          title="Re-sincronizar listas y doc">{syncing ? "↻" : "⟳"}</button>
      )}

      {syncMsg && (
        <span className={`ml-1 text-[9px] ${syncMsg.ok ? "text-emerald-500/70" : "text-rose-500/70"} truncate max-w-[140px]`}>
          {syncMsg.text}
        </span>
      )}
    </div>
  );
}

function ClientCard({ client }: { client: Client }) {
  return (
    <Card className="p-4 hover:border-foreground/30 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm truncate">{client.name}</h3>
            <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_VARIANT[client.status]}`}>
              {client.status}
            </Badge>
          </div>
          {client.legalName && client.legalName !== client.name && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {client.legalName}
            </p>
          )}
        </div>
        <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${TIER_VARIANT[client.tier]}`}>
          {client.tier}
        </Badge>
      </div>

      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
        {client.industry && (
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3 w-3" />
            <span className="truncate">{client.industry}</span>
          </div>
        )}
        {client.primaryContactName && (
          <div className="flex items-center gap-1.5">
            <User className="h-3 w-3" />
            <span className="truncate">{client.primaryContactName}</span>
          </div>
        )}
        {client.websiteUrl && (
          <div className="flex items-center gap-1.5">
            <Globe className="h-3 w-3" />
            <a
              href={client.websiteUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="truncate hover:text-foreground transition-colors"
            >
              {client.websiteUrl.replace(/^https?:\/\//, "")}
            </a>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
        <span className="text-muted-foreground tabular-nums">
          {formatRetainer(client.monthlyRetainerCents, client.currency)}/mo
        </span>
        <div className="flex items-center gap-2">
          <ClickUpLinks client={client} />
          <Link
            to={`/c/${client.slug}`}
            className="text-foreground hover:underline inline-flex items-center gap-1"
          >
            Dashboard
            <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
