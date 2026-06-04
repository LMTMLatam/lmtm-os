import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Loader2, Plug, Trash2, XCircle } from "lucide-react";
import { adsApi, type AdsConnection, type AdsPlatform } from "../api/ads";
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
    description: "OAuth flow not configured in this build yet. Will be enabled once a Google Ads developer token + OAuth client are wired.",
    scopes: ["https://www.googleapis.com/auth/adwords"],
    ready: false,
    reason: "Awaiting Google Ads developer token + OAuth client",
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

export function AdsIntegrations() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([
      { label: "Company", href: "/company/settings" },
      { label: "Ad Integrations" },
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
    }
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
        <h1 className="text-2xl font-bold text-foreground">Ad Platform Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect {selectedCompany.name} to ad platforms (Meta, Google, TikTok, LinkedIn) so LMTM-OS agents can read performance and manage campaigns via the bundled plugins.
        </p>
      </header>

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
