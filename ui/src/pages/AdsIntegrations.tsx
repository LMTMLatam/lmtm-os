import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Loader2, Plug, RefreshCw, Trash2, XCircle } from "lucide-react";
import { adsApi, type AdsConnection, type AdsPlatform } from "../api/ads";
import { secretsApi } from "../api/secrets";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Button } from "@/components/ui/button";
import { queryKeys } from "../lib/queryKeys";

interface PlatformDescriptor {
  id: AdsPlatform;
  name: string;
  description: string;
  scopes: string[];
  ready: boolean;
  reason?: string;
}

const PLATFORMS: PlatformDescriptor[] = [
  {
    id: "meta",
    name: "Meta (Facebook + Instagram)",
    description:
      "Read and write campaigns, ad sets, and ads. Pull performance insights (spend, impressions, CTR, ROAS). Requires a Facebook user with access to the relevant Business Manager / ad accounts.",
    scopes: ["ads_read", "ads_management", "pages_show_list", "leads_retrieval"],
    ready: true,
  },
  {
    id: "google",
    name: "Google Ads",
    description:
      "Read Google Ads campaigns, ad groups, and pull performance insights (spend, impressions, CTR, conversions, cost-per-conversion). Authorize with the Google account that owns the MCC (453-458-4343) — one authorization brings every client account under the manager.",
    scopes: ["https://www.googleapis.com/auth/adwords"],
    ready: true,
  },
  {
    id: "tiktok",
    name: "TikTok Ads",
    description: "OAuth flow not configured in this build yet. Requires a TikTok Business account and an app registered at ads.tiktok.com.",
    scopes: ["user.info.basic", "user.info.email", "ads.read", "ads.write"],
    ready: false,
    reason: "Awaiting TikTok Ads app registration",
  },
  {
    id: "linkedin",
    name: "LinkedIn Ads",
    description: "OAuth flow not configured in this build yet. Requires a LinkedIn Marketing Developer Platform (MDP) application.",
    scopes: ["r_ads", "rw_ads", "r_ads_reporting", "r_organization_social"],
    ready: false,
    reason: "Awaiting LinkedIn Marketing Developer Platform app",
  },
];

function StatusPill({ status }: { status: AdsConnection["status"] }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Active
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
        <XCircle className="h-3 w-3" />
        Expired
      </span>
    );
  }
  if (status === "revoked") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-700 dark:text-red-300">
        <XCircle className="h-3 w-3" />
        Revoked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300">
      <XCircle className="h-3 w-3" />
      {status}
    </span>
  );
}

function ConnectionRow({
  connection,
  onDisconnect,
  isDisconnecting,
}: {
  connection: AdsConnection;
  onDisconnect: (id: string) => void;
  isDisconnecting: boolean;
}) {
  const platform = PLATFORMS.find((p) => p.id === connection.platform);
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-semibold text-foreground">{connection.label}</h4>
          <StatusPill status={connection.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{platform?.name ?? connection.platform}</span>
          <span>·</span>
          <span>type: {connection.tokenType}</span>
          {connection.businessId ? (
            <>
              <span>·</span>
              <span>BM: {connection.businessId}</span>
            </>
          ) : null}
          {connection.adAccountId ? (
            <>
              <span>·</span>
              <span>ad account: {connection.adAccountId}</span>
            </>
          ) : null}
          {connection.expiresAt ? (
            <>
              <span>·</span>
              <span>expires: {new Date(connection.expiresAt).toLocaleDateString()}</span>
            </>
          ) : null}
        </div>
        {connection.lastError ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            Last error: {connection.lastError}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {connection.platform === "meta" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Relanza el OAuth de Meta: el callback REFRESCA el token de la
              // conexión existente (con los scopes nuevos) sin tocar mappings.
              window.location.href = `/api/meta/oauth/start?companyId=${connection.companyId}&label=${encodeURIComponent(connection.label ?? "Meta Ads")}`;
            }}
            title="Re-autorizar con Meta (renueva token y scopes sin perder mapeos)"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="ml-1.5">Reconectar</span>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDisconnect(connection.id)}
          disabled={isDisconnecting}
        >
          {isDisconnecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          <span className="ml-1.5">Disconnect</span>
        </Button>
      </div>
    </div>
  );
}

function PlatformCard({
  platform,
  connections,
  onConnect,
  onDisconnect,
  pendingDisconnectId,
}: {
  platform: PlatformDescriptor;
  connections: AdsConnection[];
  onConnect: () => void;
  onDisconnect: (id: string) => void;
  pendingDisconnectId: string | null;
}) {
  const active = connections.filter((c) => c.status === "active");
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Plug className="h-4 w-4 text-muted-foreground" />
            {platform.name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-prose">
            {platform.description}
          </p>
        </div>
        {platform.ready ? (
          <Button onClick={onConnect} size="sm">
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="ml-1.5">Connect</span>
          </Button>
        ) : (
          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-300">
            Coming soon
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground mb-3">
        <span className="font-medium text-foreground/70">Scopes:</span> {platform.scopes.join(", ")}
      </div>
      {platform.ready && active.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          No active connection. Click <em>Connect</em> to start the OAuth flow.
        </div>
      ) : null}
      <div className="mt-3 flex flex-col gap-2">
        {connections.map((c) => (
          <ConnectionRow
            key={c.id}
            connection={c}
            onDisconnect={onDisconnect}
            isDisconnecting={pendingDisconnectId === c.id}
          />
        ))}
      </div>
    </div>
  );
}

// ── Pipeline & automation integrations (Google Workspace, Make, ClickUp) ──────
// These are NOT ad platforms (so they don't live in ads_connections). The
// "Connect" action stores the credential as a company Secret with a stable key
// that the server / agents resolve at runtime. This is what powers the content
// pipeline: Sheet → Apps Script → ClickUp → webhook → Make → publicación.

interface PipelineField {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
}

interface PipelineDescriptor {
  id: string;
  name: string;
  description: string;
  primaryKey: string; // secret key that signals "connected"
  fields: PipelineField[];
  scopesNote?: string;
}

const PIPELINE: PipelineDescriptor[] = [
  {
    id: "google",
    name: "Google Workspace (Sheets · Drive · Apps Script)",
    description:
      "Planificación de posts en Sheets, archivos en Drive y el Apps Script que envía a ClickUp. Pegá un OAuth refresh token (o el JSON del service account) de grow@bylmtm.com con scopes drive, spreadsheets y script.projects para que los agentes lean/escriban Sheets y arreglen el script.",
    primaryKey: "GOOGLE_PIPELINE_CREDENTIALS",
    fields: [
      {
        key: "GOOGLE_PIPELINE_CREDENTIALS",
        label: "OAuth refresh token o service-account JSON",
        placeholder: "Pegá el refresh token (o el JSON completo del service account)",
        multiline: true,
      },
    ],
    scopesNote: "drive, spreadsheets, script.projects",
  },
  {
    id: "make",
    name: "Make",
    description:
      "Automatizaciones: el webhook de ClickUp dispara la publicación en Make. Conectá el MCP server de Make (org LMTM) para que los agentes lean logs de ejecución, clonen scenarios desde la plantilla y arreglen fallos.",
    primaryKey: "MAKE_API_TOKEN",
    fields: [
      { key: "MAKE_MCP_URL", label: "MCP server URL", placeholder: "https://us2.make.com/mcp/api/v1/u/.../sse" },
      { key: "MAKE_API_TOKEN", label: "API / MCP token", placeholder: "Make API token (org 2367960)" },
    ],
  },
  {
    id: "clickup",
    name: "ClickUp",
    description:
      "Folder por cliente con listas Redes Sociales / Producción de video y el doc Enfoque Técnico. Personal API token del workspace LMTM (si ya está configurado en el servidor, pegarlo acá lo sobreescribe a nivel empresa).",
    primaryKey: "CLICKUP_API_TOKEN",
    fields: [
      { key: "CLICKUP_API_TOKEN", label: "Personal API token", placeholder: "pk_..." },
    ],
  },
];

function PipelineIntegrations({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const secretsQuery = useQuery({
    queryKey: ["company-secrets", companyId],
    queryFn: () => secretsApi.list(companyId),
    enabled: !!companyId,
  });
  const secrets = secretsQuery.data ?? [];
  // Server-level wiring (env vars / agent configs): these integrations work
  // globally even without a per-company secret, so count them as connected.
  const serverQuery = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: () => adsApi.pipelineStatus(),
  });
  const server = serverQuery.data;

  return (
    <div className="flex flex-col gap-4">
      {PIPELINE.map((p) => {
        // Secret keys may have been stored lowercase — compare case-insensitively.
        const connected =
          secrets.some(
            (s) => s.key.toLowerCase() === p.primaryKey.toLowerCase() && s.status === "active",
          ) || Boolean(server?.[p.id as keyof typeof server]);
        return (
          <PipelineCard
            key={p.id}
            descriptor={p}
            connected={connected}
            companyId={companyId}
            onSaved={() =>
              queryClient.invalidateQueries({ queryKey: ["company-secrets", companyId] })
            }
          />
        );
      })}
    </div>
  );
}

function PipelineCard({
  descriptor,
  connected,
  companyId,
  onSaved,
}: {
  descriptor: PipelineDescriptor;
  connected: boolean;
  companyId: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = descriptor.fields.filter((f) => (values[f.key] ?? "").trim().length > 0);
      if (entries.length === 0) throw new Error("Completá al menos un campo.");
      for (const f of entries) {
        await secretsApi.create(companyId, {
          name: f.label,
          key: f.key,
          value: values[f.key].trim(),
        });
      }
    },
    onSuccess: () => {
      setOpen(false);
      setValues({});
      setError(null);
      onSaved();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo guardar."),
  });

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Plug className="h-4 w-4 text-muted-foreground" />
            {descriptor.name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-prose">{descriptor.description}</p>
        </div>
        {connected ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Connected
          </span>
        ) : null}
      </div>
      {descriptor.scopesNote ? (
        <div className="text-xs text-muted-foreground mb-3">
          <span className="font-medium text-foreground/70">Scopes:</span> {descriptor.scopesNote}
        </div>
      ) : null}

      {!open ? (
        <Button variant={connected ? "outline" : "default"} size="sm" onClick={() => setOpen(true)}>
          <Plug className="h-3.5 w-3.5" />
          <span className="ml-1.5">{connected ? "Reconnect / update" : "Connect"}</span>
        </Button>
      ) : (
        <div className="mt-2 flex flex-col gap-3 rounded-md border border-dashed border-border bg-muted/30 p-3">
          {descriptor.fields.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-foreground/80">{f.label}</span>
              {f.multiline ? (
                <textarea
                  className="min-h-[80px] rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              ) : (
                <input
                  type="text"
                  className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              )}
            </label>
          ))}
          {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Guardar conexión</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); setError(null); }}>
              Cancelar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Se guarda como secreto de la empresa (encriptado). Los agentes lo resuelven en runtime.
          </p>
        </div>
      )}
    </div>
  );
}

export function AdsIntegrations() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([
      { label: "Company", href: "/company/settings" },
      { label: "Integrations" },
    ]);
  }, [setBreadcrumbs]);

  const connectionsQuery = useQuery({
    queryKey: queryKeys.ads.connections(selectedCompanyId ?? ""),
    queryFn: () => adsApi.listConnections(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => adsApi.deleteConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
    queryKey: queryKeys.ads.connections(selectedCompanyId ?? ""),
      });
    },
  });

  const handleConnect = (platform: AdsPlatform) => {
    if (!selectedCompanyId) return;
    if (platform === "meta") {
      // Open the OAuth start URL in a new tab. The server will exchange the
      // auth code, store the long-lived token in ads_connections, and redirect
      // back to /company/settings/integrations/ads. The user refreshes this
      // page (or our window.message listener picks it up) to see the new row.
      const url = adsApi.metaOAuthStartUrl(selectedCompanyId, "Meta Ads");
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    // Generic platforms (google/tiktok/linkedin) share the /integrations OAuth
    // flow; the server 400s with a clear message if that platform's env vars
    // aren't wired yet.
    const url = `/api/integrations/oauth/start?platform=${platform}&companyId=${selectedCompanyId}&label=${encodeURIComponent(platform === "google" ? "Google Ads (MCC LMTM Global)" : `${platform} Ads`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDisconnect = (id: string) => {
    if (window.confirm("Disconnect this ad account? Tools that depend on it will fail until a new connection is created.")) {
      disconnectMutation.mutate(id);
    }
  };

  if (!selectedCompany) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Select a company first.
      </div>
    );
  }

  const connections = connectionsQuery.data?.connections ?? [];
  const byPlatform = new Map<AdsPlatform, AdsConnection[]>();
  for (const c of connections) {
    const arr = byPlatform.get(c.platform) ?? [];
    arr.push(c);
    byPlatform.set(c.platform, arr);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect {selectedCompany.name} to its tools so LMTM-OS agents can read data, manage campaigns and run the content pipeline (Sheets → ClickUp → Make → publicación).
        </p>
      </header>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ad Platforms</h2>
      {connectionsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading connections...
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {PLATFORMS.map((platform) => (
            <PlatformCard
              key={platform.id}
              platform={platform}
              connections={byPlatform.get(platform.id) ?? []}
              onConnect={() => handleConnect(platform.id)}
              onDisconnect={handleDisconnect}
              pendingDisconnectId={disconnectMutation.variables ?? null}
            />
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Pipeline &amp; Automatización
      </h2>
      <PipelineIntegrations companyId={selectedCompanyId!} />

      <section className="mt-8 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <h4 className="mb-1 text-sm font-semibold text-foreground">How OAuth works</h4>
        <p>
          When you click <em>Connect</em>, a new tab opens to the platform's authorization screen.
          After granting access, the platform redirects back to the LMTM-OS callback, which
          exchanges the auth code for a long-lived access token and stores it in the
          {" "}<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">ads_connections</code>{" "}
          table scoped to this company. Plugin tools (e.g.{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">lmtm-meta-ads:meta-list-ad-accounts</code>
          ) resolve the token at call time via <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">ctx.ads.resolveToken(&quot;meta&quot;, companyId)</code>.
        </p>
      </section>
    </div>
  );
}
