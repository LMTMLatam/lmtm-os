import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, Link, useNavigate } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adsApi, type AdsPageWithAdSets, type AdsMapping } from "../api/ads";
import { clientsApi, type Client } from "../api/clients";
import { queryKeys } from "../lib/queryKeys";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Facebook,
  Building2,
  RefreshCcw,
  ArrowRight,
  Link2,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";

type Step =
  | "loading"
  | "browse"
  | "syncing"
  | "done"
  | "error";

interface PageRowState {
  clientId: string | null;
  adAccountId: string;
  adAccountName: string;
  includedAdsetIds: Set<string>;
  expanded: boolean;
  // An ad account is selected iff we pick at least one adset (or "all")
  // OR if there's no adset in the account. For "all" we store "ALL" sentinel.
}

const ALL_ADSETS = "__ALL__" as const;

export function ConnectAds() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const connectionId = params.get("connectionId");
  const returnTo = params.get("returnTo") ?? "";

  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ total: number; perJob: Record<string, number> } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // pageId -> state
  const [pageRows, setPageRows] = useState<Record<string, PageRowState>>({});

  // ---- Load connection ----
  const connectionQuery = useQuery({
    queryKey: connectionId ? ["ads", "connection", connectionId] : ["ads", "connection", "none"],
    queryFn: () => adsApi.getConnection(connectionId!),
    enabled: !!connectionId,
    retry: false,
  });
  const connection = connectionQuery.data;

  // ---- Load pages + adsets (Make.com-style) ----
  const pagesQuery = useQuery({
    queryKey: connectionId ? ["ads", "connection", connectionId, "pages-with-adsets"] : ["ads", "none"],
    queryFn: () => adsApi.listPagesWithAdSets(connectionId!),
    enabled: !!connectionId && !connectionQuery.isError,
    retry: false,
  });
  const pagesData = pagesQuery.data?.pages ?? [];

  // ---- Load LMTM clients ----
  const clientsQuery = useQuery({
    queryKey: queryKeys.clients.list("active"),
    queryFn: () => clientsApi.list("active"),
    enabled: !!connectionId,
    retry: false,
  });
  const lmtmClients: Client[] = Array.isArray(clientsQuery.data) ? clientsQuery.data : ((clientsQuery.data as any)?.clients ?? []);

  // ---- Decide starting step ----
  useEffect(() => {
    if (connectionQuery.isError) {
      setError("Conexión no encontrada. Vuelve a conectar Meta desde Configuración.");
      setStep("error");
      return;
    }
    if (connectionQuery.isLoading) return;
    if (pagesQuery.isError) {
      setError(`No se pudo cargar el inventario: ${(pagesQuery.error as Error).message}`);
      setStep("error");
      return;
    }
    if (pagesQuery.isLoading) return;
    if (pagesData) {
      // Initialize row state from existing mappings
      setPageRows((prev) => {
        const next: Record<string, PageRowState> = { ...prev };
        for (const p of pagesData) {
          if (next[p.page.id]) continue; // don't overwrite user edits
          const existing = p.existingMapping;
          // Pick the best ad account: status=1 (active) first, then most adsets, then alphabetical
          const firstAdAcc = [...p.adAccounts].sort((a, b) => {
            const aActive = a.status === 1 ? 0 : 1;
            const bActive = b.status === 1 ? 0 : 1;
            if (aActive !== bActive) return aActive - bActive;
            const ac = (p.adSets[a.id] ?? []).length;
            const bc = (p.adSets[b.id] ?? []).length;
            if (bc !== ac) return bc - ac;
            return a.name.localeCompare(b.name);
          })[0] ?? p.adAccounts[0];
          const adsetsForFirstAcc = firstAdAcc ? (p.adSets[firstAdAcc.id] ?? []) : [];
          const initialAdsetIds = new Set<string>();
          if (existing?.includedAdsets && existing.includedAdsets.length > 0) {
            for (const id of existing.includedAdsets) initialAdsetIds.add(id);
          } else if (existing) {
            // existing mapping with no subset = all
            for (const a of adsetsForFirstAcc) initialAdsetIds.add(a.id);
          } else {
            // NEW mapping: pre-select ALL adsets of the default account for fastest bulk path
            for (const a of adsetsForFirstAcc) initialAdsetIds.add(a.id);
          }
          next[p.page.id] = {
            clientId: existing?.clientId ?? null,
            adAccountId: existing?.adAccountId ?? firstAdAcc?.id ?? "",
            adAccountName: existing?.label ?? firstAdAcc?.name ?? "",
            includedAdsetIds: initialAdsetIds,
            expanded: !!existing, // auto-expand already-mapped pages
          };
        }
        return next;
      });
      setStep("browse");
    }
  }, [connectionQuery.isLoading, connectionQuery.isError, pagesQuery.isLoading, pagesQuery.isError, pagesData]);

  // ---- Filter pages by search ----
  const filteredPages = useMemo(() => {
    if (!searchTerm) return pagesData;
    const t = searchTerm.toLowerCase();
    return pagesData.filter(
      (p) => p.page.name.toLowerCase().includes(t) ||
             p.adAccounts.some((a) => a.name.toLowerCase().includes(t)),
    );
  }, [pagesData, searchTerm]);

  // ---- Stats ----
  const stats = useMemo(() => {
    const total = pagesData.length;
    const mapped = Object.values(pageRows).filter((r) => r.clientId && r.adAccountId).length;
    const adsetCount = Object.values(pageRows).reduce((acc, r) => acc + r.includedAdsetIds.size, 0);
    return { total, mapped, adsetCount };
  }, [pagesData, pageRows]);

  // ---- Bulk create mappings + sync ----
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!connection) throw new Error("No connection");
      const companyId = connection.companyId;
      const mappings = Object.entries(pageRows)
        .filter(([, row]) => row.clientId && row.adAccountId)
        .map(([pageId, row]) => ({
          adAccountId: row.adAccountId,
          pageId,
          clientId: row.clientId ?? undefined,
          label: row.adAccountName,
          includedAdsets: Array.from(row.includedAdsetIds),
        }));
      if (mappings.length === 0) throw new Error("No hay mappings para guardar");
      // 1) Bulk create (skip-existing semantics)
      const created = await adsApi.createBulkMappings({
        companyId,
        connectionId: connection.id,
        mappings,
      });
      // 2) Sync each created mapping
      setStep("syncing");
      const perJob: Record<string, number> = {};
      let total = 0;
      for (const m of created.created.concat(created.updated)) {
        for (const job of ["campaigns", "insights", "all"] as const) {
          const r = await clientsApi.syncAds(connection.id, m.id, job, sinceIso(365), untilIso(0));
          perJob[job] = (perJob[job] ?? 0) + (r.totalRecords ?? 0);
          total += r.totalRecords ?? 0;
        }
      }
      return { total, perJob, created: created.created.length, updated: created.updated.length, skipped: created.skipped };
    },
    onSuccess: (res) => {
      setSyncResult({ total: res.total, perJob: res.perJob });
      setStep("done");
      qc.invalidateQueries({ queryKey: ["ads"] });
      qc.invalidateQueries({ queryKey: queryKeys.clients.campaigns("__lmtm__", sinceIso(365), untilIso(0)) });
    },
    onError: (e: Error) => {
      setError(e.message);
      setStep("error");
    },
  });

  // ---- Row mutators ----
  const setRowClient = useCallback((pageId: string, clientId: string) => {
    setPageRows((prev) => {
      const row = prev[pageId];
      if (!row) return prev;
      return { ...prev, [pageId]: { ...row, clientId } };
    });
  }, []);

  const setRowAdAccount = useCallback((pageId: string, adAccountId: string, adAccountName: string) => {
    setPageRows((prev) => {
      const row = prev[pageId];
      if (!row) return prev;
      return { ...prev, [pageId]: { ...row, adAccountId, adAccountName, includedAdsetIds: new Set() } };
    });
  }, []);

  const toggleAdset = useCallback((pageId: string, adsetId: string) => {
    setPageRows((prev) => {
      const row = prev[pageId];
      if (!row) return prev;
      const next = new Set(row.includedAdsetIds);
      if (next.has(adsetId)) next.delete(adsetId);
      else next.add(adsetId);
      return { ...prev, [pageId]: { ...row, includedAdsetIds: next } };
    });
  }, []);

  const toggleAllAdsets = useCallback((pageId: string, allAdsetIds: string[]) => {
    setPageRows((prev) => {
      const row = prev[pageId];
      if (!row) return prev;
      const next = new Set(row.includedAdsetIds);
      const allSelected = allAdsetIds.every((id) => next.has(id));
      if (allSelected) {
        for (const id of allAdsetIds) next.delete(id);
      } else {
        for (const id of allAdsetIds) next.add(id);
      }
      return { ...prev, [pageId]: { ...row, includedAdsetIds: next } };
    });
  }, []);

  const toggleExpand = useCallback((pageId: string) => {
    setPageRows((prev) => {
      const row = prev[pageId];
      if (!row) return prev;
      return { ...prev, [pageId]: { ...row, expanded: !row.expanded } };
    });
  }, []);

  // ============================================================
  // Render
  // ============================================================

  if (step === "loading" || connectionQuery.isLoading || pagesQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Header step="loading" total={0} mapped={0} adsetCount={0} />
        <Card className="mt-4 p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando inventario de Meta…
          </div>
          <div className="mt-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Header step="error" total={0} mapped={0} adsetCount={0} />
        <Card className="mt-4 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 text-red-500" />
            <div className="flex-1">
              <div className="font-medium text-red-600">Algo falló</div>
              <div className="mt-1 text-sm text-muted-foreground">{error}</div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => { pagesQuery.refetch(); connectionQuery.refetch(); setStep("loading"); }}>Reintentar</Button>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/lmtm/dashboard">Volver</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (step === "syncing") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Header step="syncing" total={pagesData.length} mapped={stats.mapped} adsetCount={stats.adsetCount} />
        <Card className="mt-4 p-6">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Sincronizando adsets, campañas e insights desde Meta…
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Esto puede tardar hasta 1 minuto por ad account.
          </div>
        </Card>
      </div>
    );
  }

  if (step === "done") {
    const goBack = () => {
      if (returnTo) navigate(returnTo);
      else navigate("/lmtm/dashboard");
    };
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Header step="done" total={pagesData.length} mapped={stats.mapped} adsetCount={stats.adsetCount} />
        <Card className="mt-4 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 text-green-500" />
            <div className="flex-1">
              <div className="font-medium">¡Listo!</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Sincronizamos {syncResult?.total ?? 0} filas (campañas + adsets + insights) en los últimos 365 días.
              </div>
              {syncResult && Object.keys(syncResult.perJob).length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {Object.entries(syncResult.perJob).map(([job, n]) => (
                    <li key={job}>· {job}: {n} filas</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={goBack}>Ir al dashboard</Button>
          </div>
        </Card>
      </div>
    );
  }

  // step === "browse" - the main Make.com-style inventory
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Breadcrumb />
      <Header
        step="browse"
        total={pagesData.length}
        mapped={stats.mapped}
        adsetCount={stats.adsetCount}
      />

      <ConnectionSummary connection={connection!} />

      <Card className="mt-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Inventario de Meta ({pagesData.length} pages)</h2>
          </div>
          <div className="relative w-72 max-w-full">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar page o ad account…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {filteredPages.length === 0 && pagesData.length > 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Sin resultados para "{searchTerm}"
            </div>
          )}
          {pagesData.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No se encontraron pages en esta cuenta de Meta. Asegurate de tener páginas administradas.
            </div>
          )}
          {filteredPages.map((p) => (
            <PageRow
              key={p.page.id}
              page={p}
              row={pageRows[p.page.id]}
              clients={lmtmClients}
              onToggleExpand={() => toggleExpand(p.page.id)}
              onSetClient={(cid) => setRowClient(p.page.id, cid)}
              onSetAdAccount={(accId, accName) => setRowAdAccount(p.page.id, accId, accName)}
              onToggleAdset={(adsetId) => toggleAdset(p.page.id, adsetId)}
              onToggleAll={(adsetIds) => toggleAllAdsets(p.page.id, adsetIds)}
            />
          ))}
        </div>
      </Card>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {stats.mapped} de {stats.total} pages conectadas · {stats.adsetCount} adsets seleccionados
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            asChild
          >
            <Link to="/lmtm/dashboard">Cancelar</Link>
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={stats.mapped === 0 || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <><Loader2 className="mr-1 size-4 animate-spin" /> Sincronizando…</>
            ) : (
              <><Link2 className="mr-1 size-4" /> Conectar y sincronizar</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// =================================================================
// Sub-components
// =================================================================

function Header({ step, total, mapped, adsetCount }: { step: Step; total: number; mapped: number; adsetCount: number }) {
  const isLoading = step === "loading";
  const isSyncing = step === "syncing";
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conectar ad account a un cliente</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isLoading
            ? "Cargando inventario…"
            : isSyncing
              ? "Sincronizando datos desde Meta…"
              : step === "done"
                ? "Conexión completada"
                : step === "error"
                  ? "Error al conectar"
                  : "Estilo Make.com: conectá cada page a un cliente de LMTM y elegí qué adsets sincronizar."}
        </p>
      </div>
      {step === "browse" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{mapped}/{total} mapeadas</Badge>
          <Badge variant="secondary">{adsetCount} adsets</Badge>
        </div>
      )}
    </div>
  );
}

function Breadcrumb() {
  return (
    <nav className="mb-2 text-xs text-muted-foreground">
      <Link to="/lmtm/clients" className="hover:underline">Clients</Link>
      <span className="px-1.5">/</span>
      <span>Conectar ad account</span>
    </nav>
  );
}

function ConnectionSummary({ connection }: { connection: { id: string; label: string; platform: string; status: string; scopes: string[] } }) {
  return (
    <Card className="mt-4 flex items-center gap-3 p-3">
      <div className="flex size-9 items-center justify-center rounded-md bg-blue-500/10 text-blue-500">
        <Facebook className="size-4" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium">{connection.label}</div>
        <div className="text-xs text-muted-foreground">
          {connection.platform} · {(connection.scopes ?? []).length} scopes · status {connection.status}
        </div>
      </div>
      <Badge variant="default" className="bg-green-500/15 text-green-600 hover:bg-green-500/15">{connection.status}</Badge>
    </Card>
  );
}

function PageRow({
  page, row, clients, onToggleExpand, onSetClient, onSetAdAccount, onToggleAdset, onToggleAll,
}: {
  page: AdsPageWithAdSets;
  row: PageRowState | undefined;
  clients: Client[];
  onToggleExpand: () => void;
  onSetClient: (id: string) => void;
  onSetAdAccount: (id: string, name: string) => void;
  onToggleAdset: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
}) {
  if (!row) {
    return <Skeleton className="h-14 w-full" />;
  }
  const adAccount = page.adAccounts.find((a) => a.id === row.adAccountId) ?? page.adAccounts[0];
  const adsets = adAccount ? (page.adSets[adAccount.id] ?? []) : [];
  const isMapped = !!row.clientId && !!row.adAccountId;
  const allAdsetIds = adsets.map((a) => a.id);
  const allSelected = adsets.length > 0 && allAdsetIds.every((id) => row.includedAdsetIds.has(id));
  return (
    <div className={`rounded-md border ${isMapped ? "border-green-500/30 bg-green-500/5" : "border-border"}`}>
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={onToggleExpand}
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
          aria-label={row.expanded ? "Collapse" : "Expand"}
        >
          {row.expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <div className="flex size-8 items-center justify-center rounded-md bg-blue-500/10 text-blue-500">
          <Facebook className="size-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-medium">{page.page.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {page.adAccounts.length} ad account{page.adAccounts.length === 1 ? "" : "s"} ·{" "}
            {page.adAccounts.reduce((acc, a) => acc + (page.adSets[a.id]?.length ?? 0), 0)} adsets totales
          </div>
        </div>
        {isMapped && (
          <Badge variant="default" className="bg-green-500/15 text-green-600 hover:bg-green-500/15">
            {row.includedAdsetIds.size} adset{row.includedAdsetIds.size === 1 ? "" : "s"}
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 border-t border-border px-3 py-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Ad account</label>
          <select
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={row.adAccountId}
            onChange={(e) => {
              const acc = page.adAccounts.find((a) => a.id === e.target.value);
              onSetAdAccount(e.target.value, acc?.name ?? "");
            }}
          >
            {page.adAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency} · {a.timezone}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Cliente LMTM</label>
          <select
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={row.clientId ?? ""}
            onChange={(e) => onSetClient(e.target.value)}
          >
            <option value="">— Sin cliente —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {row.expanded && (
        <div className="border-t border-border bg-muted/30 px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground">
              {adsets.length === 0
                ? "Esta ad account no tiene adsets."
                : `${adsets.length} adset${adsets.length === 1 ? "" : "s"} disponibles`}
            </div>
            {adsets.length > 0 && (
              <button
                onClick={() => onToggleAll(allAdsetIds)}
                className="text-xs font-medium text-blue-500 hover:underline"
              >
                {allSelected ? "Deseleccionar todos" : "Seleccionar todos"}
              </button>
            )}
          </div>
          {adsets.length > 0 && (
            <div className="max-h-72 space-y-1 overflow-y-auto rounded border border-border bg-background p-2">
              {adsets.map((ad) => {
                const checked = row.includedAdsetIds.has(ad.id);
                return (
                  <label
                    key={ad.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleAdset(ad.id)}
                      className="size-3.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{ad.name}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {ad.id} · {ad.status}
                        {ad.dailyBudget != null && ` · ${ad.dailyBudget}/día`}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =================================================================
// Helpers
// =================================================================

function sinceIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}
function untilIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}
