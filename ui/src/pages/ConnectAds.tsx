import { useState, useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adsApi, type AdsAdAccount, type AdsPage, type AdsConnection } from "../api/ads";
import { clientsApi, type Client } from "../api/clients";
import { queryKeys } from "../lib/queryKeys";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Facebook,
  Building2,
  Target,
  RefreshCcw,
  ArrowRight,
  Link2,
} from "lucide-react";

type Step = "loading" | "ad-account" | "page" | "client" | "review" | "syncing" | "done" | "error";

export function ConnectAds() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const connectionId = params.get("connectionId");
  const returnTo = params.get("returnTo") ?? "";

  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pickedAccount, setPickedAccount] = useState<AdsAdAccount | null>(null);
  const [pickedPage, setPickedPage] = useState<AdsPage | null>(null);
  const [pickedClient, setPickedClient] = useState<Client | null>(null);
  const [syncResult, setSyncResult] = useState<{ total: number; perJob: Record<string, number> } | null>(null);

  // ---- Load connection ----
  const connectionQuery = useQuery({
    queryKey: connectionId ? ["ads", "connection", connectionId] : ["ads", "connection", "none"],
    queryFn: () => adsApi.getConnection(connectionId!),
    enabled: !!connectionId,
    retry: false,
  });

  const connection: AdsConnection | undefined = connectionQuery.data;

  // ---- Ad accounts ----
  const adAccountsQuery = useQuery({
    queryKey: connectionId ? ["ads", "connection", connectionId, "ad-accounts"] : ["ads", "none"],
    queryFn: () => adsApi.listAdAccounts(connectionId!),
    enabled: !!connectionId && !connectionQuery.isError,
    retry: false,
  });

  // ---- Pages ----
  const pagesQuery = useQuery({
    queryKey: connectionId ? ["ads", "connection", connectionId, "pages"] : ["ads", "none"],
    queryFn: () => adsApi.listPages(connectionId!),
    enabled: !!connectionId && !connectionQuery.isError,
    retry: false,
  });

  // ---- LMTM clients ----
  const clientsQuery = useQuery({
    queryKey: queryKeys.clients.list(),
    queryFn: () => clientsApi.list(),
    enabled: step !== "loading" && step !== "done",
    retry: false,
  });

  // ---- Once data loads, decide starting step ----
  useEffect(() => {
    if (connectionQuery.isError) {
      setError("Conexión no encontrada. Vuelve a conectar Meta desde Configuración.");
      setStep("error");
      return;
    }
    if (connectionQuery.isLoading) return;
    if (adAccountsQuery.isError) {
      setError(`No se pudieron listar las ad accounts: ${(adAccountsQuery.error as Error).message}`);
      setStep("error");
      return;
    }
    if (adAccountsQuery.isLoading) return;
    if (adAccountsQuery.data && step === "loading") {
      setStep("ad-account");
    }
  }, [connectionQuery.isLoading, connectionQuery.isError, adAccountsQuery.isLoading, adAccountsQuery.isError, adAccountsQuery.data, step]);

  // ---- Create mapping + sync mutation ----
  const createMappingMutation = useMutation({
    mutationFn: async () => {
      if (!connection || !pickedAccount || !pickedClient) throw new Error("Missing data");
      // 1) Create the mapping
      const mapping = await adsApi.createMapping({
        companyId: connection.companyId,
        connectionId: connection.id,
        adAccountId: pickedAccount.id,
        clientId: pickedClient.id,
        pageId: pickedPage?.id,
        platform: connection.platform,
        label: `${pickedClient.name} · ${pickedAccount.name}`,
      });

      // 2) Sync campaigns + insights
      setStep("syncing");
      const today = new Date();
      const since = new Date(today);
      since.setDate(since.getDate() - 365);
      const sinceStr = since.toISOString().slice(0, 10);
      const untilStr = today.toISOString().slice(0, 10);

      const resp = await fetch("/api/ads/sync/all", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: connection.id,
          mappingId: mapping.id,
          since: sinceStr,
          until: untilStr,
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Sync failed (${resp.status}): ${txt.slice(0, 300)}`);
      }
      const data = await resp.json();
      return { mapping, data };
    },
    onSuccess: ({ data }) => {
      const perJob: Record<string, number> = {};
      let total = 0;
      for (const r of data.results ?? []) {
        perJob[r.job] = r.recordsSynced ?? 0;
        total += r.recordsSynced ?? 0;
      }
      setSyncResult({ total, perJob });
      setStep("done");
      // Invalidate all client dashboards
      if (pickedClient) {
        qc.invalidateQueries({ queryKey: queryKeys.clients.adsSummary(pickedClient.slug) });
        qc.invalidateQueries({ queryKey: queryKeys.clients.campaigns(pickedClient.slug) });
      }
      qc.invalidateQueries({ queryKey: queryKeys.clients.list() });
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    },
  });

  if (!connectionId) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card className="p-6">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <h2 className="text-sm font-medium mt-2">Falta connectionId</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Esta pantalla se abre automáticamente al terminar la conexión con Meta.
            Si llegaste directamente, volvé a <Link to="/clients" className="underline">Clients</Link>.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <BreadcrumbHeader />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conectar ad account a un cliente</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paso {stepNumber(step)} de 4 · elegí qué ad account conectar y a qué cliente de LMTM pertenece.
        </p>
      </div>

      {connection && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-blue-500/10 p-2.5">
              <Facebook className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{connection.label}</p>
              <p className="text-xs text-muted-foreground">
                {connection.platform} · {connection.scopes.length} scopes · status {connection.status}
              </p>
            </div>
            <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {connection.status}
            </Badge>
          </div>
        </Card>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(["ad-account", "page", "client", "review"] as Step[]).map((s, i) => {
          const idx = ["ad-account", "page", "client", "review"].indexOf(step as string);
          const isCurrent = s === step;
          const isDone = idx > i;
          return (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                  isCurrent
                    ? "bg-foreground text-background"
                    : isDone
                    ? "bg-emerald-500/20 text-emerald-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              <span className={`text-xs ${isCurrent ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {s === "ad-account" && "Ad account"}
                {s === "page" && "Página"}
                {s === "client" && "Cliente"}
                {s === "review" && "Confirmar"}
              </span>
              {i < 3 && <span className="text-muted-foreground">→</span>}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      {step === "loading" && (
        <Card className="p-6 space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </Card>
      )}

      {step === "ad-account" && (
        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3">Elegí la ad account de Meta</h3>
          {adAccountsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (adAccountsQuery.data?.accounts.length ?? 0) === 0 ? (
            <div className="text-xs text-muted-foreground py-4">
              No se encontraron ad accounts. Verificá que la app de Meta tenga acceso a al menos una.
            </div>
          ) : (
            <div className="space-y-2">
              {adAccountsQuery.data!.accounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    setPickedAccount(a);
                    setStep("page");
                  }}
                  className="w-full text-left rounded-md border p-3 hover:border-foreground hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {a.id} · {a.currency} · {a.timezone}
                        {a.businessName ? ` · ${a.businessName}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {a.status === 1 ? "Activa" : a.status === 2 ? "Deshabilitada" : `Status ${a.status}`}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {step === "page" && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Elegí la página de Facebook (opcional)</h3>
            <Button size="sm" variant="ghost" onClick={() => setStep("ad-account")}>
              ← Cambiar ad account
            </Button>
          </div>
          {pagesQuery.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (pagesQuery.data?.pages.length ?? 0) === 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                No se encontraron páginas accesibles. Podés continuar sin página.
              </p>
              <Button size="sm" onClick={() => setStep("client")}>
                Continuar sin página →
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => {
                  setPickedPage(null);
                  setStep("client");
                }}
                className="w-full text-left rounded-md border border-dashed p-3 hover:bg-muted/30 transition-colors text-xs text-muted-foreground"
              >
                Omitir (no asociar página)
              </button>
              {pagesQuery.data!.pages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPickedPage(p);
                    setStep("client");
                  }}
                  className="w-full text-left rounded-md border p-3 hover:border-foreground hover:bg-muted/30 transition-colors"
                >
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {p.id}
                    {p.category ? ` · ${p.category}` : ""}
                    {p.tasks?.length ? ` · ${p.tasks.length} permisos` : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {step === "client" && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Elegí el cliente de LMTM</h3>
            <Button size="sm" variant="ghost" onClick={() => setStep("page")}>
              ← Cambiar página
            </Button>
          </div>
          {clientsQuery.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (clientsQuery.data?.clients.length ?? 0) === 0 ? (
            <div className="text-xs text-muted-foreground">
              No hay clientes creados. <Link to="/clients" className="underline">Crear cliente</Link>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {clientsQuery.data!.clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setPickedClient(c);
                    setStep("review");
                  }}
                  className="w-full text-left rounded-md border p-3 hover:border-foreground hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium">{c.name}</p>
                    <Badge variant="secondary" className="text-[10px]">{c.status}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {c.industry ?? "—"} · {c.tier} · {c.currency}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {step === "review" && (
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-medium">Confirmá la conexión</h3>
          <div className="rounded-md border p-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ad account</span>
              <span className="font-medium">{pickedAccount?.name} ({pickedAccount?.id})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Página</span>
              <span className="font-medium">{pickedPage?.name ?? "— (sin página)"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente LMTM</span>
              <span className="font-medium">{pickedClient?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sync inicial</span>
              <span className="font-medium">últimos 365 días</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={() => setStep("client")}>
              ← Cambiar cliente
            </Button>
            <Button
              size="sm"
              onClick={() => createMappingMutation.mutate()}
              disabled={createMappingMutation.isPending}
            >
              {createMappingMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Conectar y sincronizar
            </Button>
          </div>
        </Card>
      )}

      {step === "syncing" && (
        <Card className="p-6 text-center">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
          <p className="text-sm font-medium mt-3">Sincronizando campañas y métricas</p>
          <p className="text-xs text-muted-foreground mt-1">
            Trayendo campaigns, adsets, ads e insights de los últimos 365 días. Esto puede tardar 1-2 minutos.
          </p>
        </Card>
      )}

      {step === "done" && syncResult && (
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h3 className="text-sm font-medium">Conexión completa</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Se sincronizaron <b>{syncResult.total}</b> registros:
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {Object.entries(syncResult.perJob).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span className="tabular-nums">{v}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-2">
            {pickedClient && (
              <Button
                size="sm"
                onClick={() => navigate(`/c/${pickedClient.slug}/paid-media`)}
              >
                Ver dashboard
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            )}
            {returnTo && (
              <Button size="sm" variant="outline" onClick={() => navigate(returnTo)}>
                Volver
              </Button>
            )}
            <Link to="/clients" className="text-xs text-muted-foreground hover:text-foreground underline ml-auto">
              Clients
            </Link>
          </div>
        </Card>
      )}

      {step === "error" && (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <h3 className="text-sm font-medium">Algo falló</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{error}</p>
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setStep("ad-account");
                setError(null);
                adAccountsQuery.refetch();
              }}
            >
              <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
              Reintentar
            </Button>
            <Link to="/clients" className="text-xs text-muted-foreground hover:text-foreground underline">
              Volver
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}

function stepNumber(step: Step): number {
  switch (step) {
    case "loading": return 0;
    case "ad-account": return 1;
    case "page": return 2;
    case "client": return 3;
    case "review":
    case "syncing":
    case "done": return 4;
    case "error": return 0;
  }
}

function BreadcrumbHeader() {
  return (
    <div className="text-xs text-muted-foreground">
      <Link to="/clients" className="hover:text-foreground">
        Clients
      </Link>
      <span className="mx-1.5">/</span>
      <span>Conectar ad account</span>
    </div>
  );
}
