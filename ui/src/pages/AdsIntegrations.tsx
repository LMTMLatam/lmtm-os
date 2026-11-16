import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Loader2, Plug, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { adsApi, type AdsConnection, type AdsPlatform } from "../api/ads";
import { clientsApi, type Client } from "../api/clients";
import { secretsApi } from "../api/secrets";
import { useCompany } from "../context/CompanyContext";
import { Button } from "@/components/ui/button";
import { queryKeys } from "../lib/queryKeys";
import { WebGoogleCard } from "../components/WebGoogleCard";
import { Encabezado } from "../app/Shell";

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
      "Lee y escribe campañas, conjuntos y anuncios, y trae el rendimiento (gasto, impresiones, CTR, ROAS). Hace falta un usuario de Facebook con acceso al Business Manager y a las cuentas publicitarias.",
    scopes: ["ads_read", "ads_management", "pages_show_list", "leads_retrieval"],
    ready: true,
  },
  {
    id: "google",
    name: "Google Ads",
    description:
      "Lee campañas y grupos de anuncios de Google Ads y trae el rendimiento (gasto, impresiones, CTR, conversiones, costo por conversión). Se autoriza con la cuenta de Google dueña del MCC (453-458-4343): una sola autorización trae todas las cuentas de clientes del administrador.",
    scopes: ["https://www.googleapis.com/auth/adwords"],
    ready: true,
  },
  {
    id: "tiktok",
    name: "TikTok Ads",
    description: "Todavía no está habilitada: hace falta una cuenta de TikTok Business y una app registrada en ads.tiktok.com.",
    scopes: ["user.info.basic", "user.info.email", "ads.read", "ads.write"],
    ready: false,
    reason: "Falta registrar la app de TikTok Ads",
  },
  {
    id: "linkedin",
    name: "LinkedIn Ads",
    description: "Todavía no está habilitada: hace falta una app de LinkedIn Marketing Developer Platform.",
    scopes: ["r_ads", "rw_ads", "r_ads_reporting", "r_organization_social"],
    ready: false,
    reason: "Falta la app de LinkedIn Marketing Developer Platform",
  },
];

function StatusPill({ status }: { status: AdsConnection["status"] }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-l-bien/30 bg-l-bien/10 px-2 py-0.5 text-xs text-l-bien-texto">
        <CheckCircle2 className="h-3 w-3" />
        Activa
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-l-atencion/30 bg-l-atencion/10 px-2 py-0.5 text-xs text-l-atencion-texto">
        <XCircle className="h-3 w-3" />
        Vencida
      </span>
    );
  }
  if (status === "revoked") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-l-critico/30 bg-l-critico-suave px-2 py-0.5 text-xs text-l-critico-texto">
        <XCircle className="h-3 w-3" />
        Revocada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-l-linea bg-l-papel px-2 py-0.5 text-xs text-l-tinta-3">
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
              <span>cuenta: {connection.adAccountId}</span>
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
          <p className="mt-2 text-xs text-l-critico-texto">
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
          <span className="ml-1.5">Desconectar</span>
        </Button>
      </div>
    </div>
  );
}

/** Mapeo cuentas → clientes (pedido 23/7): por cada conexión activa, lista las
 *  cuentas publicitarias reales (Meta o Google) y deja elegir a qué cliente
 *  del panel pertenece cada una. Guarda al elegir. Para el flujo Meta completo
 *  (páginas + adsets estilo Make) sigue existiendo /connect-ads. */
function ConnectionMappings({ connection, companyId, abrir }: { connection: AdsConnection; companyId: string; abrir?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  // El botón de arriba ("Mapear cuentas de Meta/Google") despliega este panel
  // en vez de dejar al usuario buscar el acordeón (pedido 11/8).
  useEffect(() => { if (abrir) setOpen(true); }, [abrir]);
  const accountsQuery = useQuery({
    queryKey: ["ads", "accounts", connection.id],
    queryFn: () => adsApi.listAdAccounts(connection.id),
    enabled: open,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const clientsQuery = useQuery({
    queryKey: queryKeys.clients.list("active"),
    queryFn: () => clientsApi.list("active"),
    enabled: open,
  });
  const mappingsQuery = useQuery({
    queryKey: ["ads", "mappings", companyId],
    queryFn: () => adsApi.listMappings({ companyId }),
    enabled: open,
  });
  const save = useMutation({
    mutationFn: (b: { adAccountId: string; clientId?: string; label?: string }) =>
      adsApi.createMapping({ companyId, connectionId: connection.id, adAccountId: b.adAccountId, platform: connection.platform, clientId: b.clientId, label: b.label }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ads", "mappings", companyId] }),
  });
  const clients: Client[] = Array.isArray(clientsQuery.data) ? clientsQuery.data : ((clientsQuery.data as { clients?: Client[] })?.clients ?? []);
  const normId = (id: string) => id.replace(/^act_/i, "");
  const mappingByAccount = new Map(
    (mappingsQuery.data?.mappings ?? [])
      .filter((m) => m.platform === connection.platform)
      .map((m) => [normId(m.adAccountId), m]),
  );
  const accounts = accountsQuery.data?.accounts ?? [];
  return (
    <div className="mt-2 rounded-md border border-border/70 bg-muted/20 p-2">
      <button onClick={() => setOpen(!open)} className="text-xs font-medium text-foreground/80 hover:text-foreground">
        {open ? "▾" : "▸"} Mapear cuentas → clientes {open && accounts.length > 0 ? `(${accounts.length} cuentas)` : ""}
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {accountsQuery.isLoading && <p className="text-xs text-muted-foreground">Cargando cuentas de {connection.platform}…</p>}
          {accountsQuery.isError && <p className="text-xs text-l-critico-texto">No se pudieron listar: {(accountsQuery.error as Error).message.slice(0, 200)}</p>}
          {accounts.map((a) => {
            const m = mappingByAccount.get(normId(a.id));
            return (
              <div key={a.id} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full shrink-0 ${a.status === "active" ? "bg-l-bien" : "bg-muted-foreground/40"}`} />
                <span className="flex-1 truncate" title={a.id}>{a.name} <span className="text-muted-foreground">({a.id})</span></span>
                <select
                  value={m?.clientId ?? ""}
                  onChange={(e) => save.mutate({ adAccountId: a.id, clientId: e.target.value || undefined, label: `${connection.platform === "google" ? "Google Ads" : "Meta Ads"} — ${a.name}` })}
                  className="text-xs bg-background border border-border rounded-md px-1.5 py-1 max-w-52"
                >
                  <option value="">— sin mapear —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {m?.clientId && <span className="text-l-bien-texto text-[10px]">✓</span>}
              </div>
            );
          })}
          {save.isError && <p className="text-[11px] text-l-critico-texto">Error al guardar: {(save.error as Error).message.slice(0, 150)}</p>}
          {connection.platform === "meta" && (
            <p className="text-[11px] text-muted-foreground pt-1">Para el mapeo completo de Meta (páginas + conjuntos estilo Make): <a className="underline" href={`/connect-ads?connectionId=${connection.id}`}>abrir asistente</a>.</p>
          )}
        </div>
      )}
    </div>
  );
}

function PlatformCard({
  platform,
  connections,
  companyId,
  onConnect,
  onDisconnect,
  pendingDisconnectId,
  abrirMapeo,
}: {
  platform: PlatformDescriptor;
  connections: AdsConnection[];
  companyId: string | null;
  onConnect: () => void;
  onDisconnect: (id: string) => void;
  pendingDisconnectId: string | null;
  abrirMapeo?: boolean;
}) {
  const active = connections.filter((c) => c.status === "active");
  return (
    <div id={`plataforma-${platform.id}`} className="rounded-lg border border-border bg-card p-5 scroll-mt-4">
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
            <span className="ml-1.5">Conectar</span>
          </Button>
        ) : (
          <span className="inline-flex items-center rounded-full border border-l-atencion/30 bg-l-atencion/10 px-2.5 py-1 text-xs text-l-atencion-texto">
            Coming soon
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground mb-3">
        <span className="font-medium text-foreground/70">Permisos:</span> {platform.scopes.join(", ")}
      </div>
      {platform.ready && active.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Sin conexión activa. Tocá <em>Conectar</em> para autorizarla.
        </div>
      ) : null}
      <div className="mt-3 flex flex-col gap-2">
        {connections.map((c) => (
          <div key={c.id}>
            <ConnectionRow
              connection={c}
              onDisconnect={onDisconnect}
              isDisconnecting={pendingDisconnectId === c.id}
            />
            {c.status === "active" && companyId && <ConnectionMappings connection={c} companyId={companyId} abrir={abrirMapeo} />}
          </div>
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
          <span className="inline-flex items-center gap-1 rounded-full border border-l-bien/30 bg-l-bien/10 px-2.5 py-1 text-xs text-l-bien-texto">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Connected
          </span>
        ) : null}
      </div>
      {descriptor.scopesNote ? (
        <div className="text-xs text-muted-foreground mb-3">
          <span className="font-medium text-foreground/70">Permisos:</span> {descriptor.scopesNote}
        </div>
      ) : null}

      {!open ? (
        <Button variant={connected ? "outline" : "default"} size="sm" onClick={() => setOpen(true)}>
          <Plug className="h-3.5 w-3.5" />
          <span className="ml-1.5">{connected ? "Reconectar o actualizar" : "Conectar"}</span>
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
          {error ? <p className="text-xs text-l-critico-texto">{error}</p> : null}
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
  const queryClient = useQueryClient();
  const [mapeoAbierto, setMapeoAbierto] = useState<AdsPlatform | null>(null);

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
    if (window.confirm("¿Desconectar esta cuenta? Las herramientas que la usan van a fallar hasta que se conecte de nuevo.")) {
      disconnectMutation.mutate(id);
    }
  };

  if (!selectedCompany) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Cargando la empresa…
      </div>
    );
  }

  const irAlMapeo = (p: AdsPlatform) => {
    setMapeoAbierto(p);
    document.getElementById(`plataforma-${p}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const connections = connectionsQuery.data?.connections ?? [];
  const conexionMeta = connections.find((c) => c.platform === "meta" && c.status === "active") ?? null;
  const byPlatform = new Map<AdsPlatform, AdsConnection[]>();
  for (const c of connections) {
    const arr = byPlatform.get(c.platform) ?? [];
    arr.push(c);
    byPlatform.set(c.platform, arr);
  }

  return (
    <>
    <Encabezado titulo="Conexiones" bajada={`Las cuentas de ${selectedCompany.name} con las que trabajan LMTM-OS y los agentes: pauta, web y publicación (planilla → ClickUp → Make → redes).`} />
    <div className="max-w-[960px] px-4 pb-10 md:px-8">

      {/* Acceso directo al mapeo: hasta ahora había que adivinar que estaba
          adentro del acordeón de cada conexión (pedido 11/8). */}
      <div className="mb-5 rounded-lg border border-border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold text-foreground">Mapear cuentas publicitarias → clientes</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Sin mapeo, el cliente no tiene datos de pauta: su tablero sale vacío y los agentes no lo analizan.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Meta va al ASISTENTE (/connect-ads), no al acordeón: ahí se mapea
              página + cuenta + conjuntos estilo Make, con preselección y carga
              masiva. El acordeón solo permite cuenta → cliente y el equipo lo
              encontró peor (pedido 14/8). */}
          {conexionMeta ? (
            <a href={`/connect-ads?connectionId=${conexionMeta.id}`}>
              <Button size="sm" variant="outline">Mapear cuentas de Meta</Button>
            </a>
          ) : (
            <Button size="sm" variant="outline" disabled title="No hay conexión de Meta activa">
              Mapear cuentas de Meta
            </Button>
          )}
          {/* Google no tiene asistente: no hay páginas ni conjuntos que elegir,
              así que el acordeón (cuenta → cliente) es todo lo que hace falta. */}
          <Button size="sm" variant="outline" onClick={() => irAlMapeo("google")}>
            Mapear cuentas de Google
          </Button>
          <Link
            to="/preparacion"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Ver qué clientes están sin mapear
          </Link>
        </div>
      </div>

      <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-l-tinta-2">Plataformas de pauta</h2>
      {connectionsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando conexiones…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {PLATFORMS.map((platform) => (
            <PlatformCard
              key={platform.id}
              platform={platform}
              connections={byPlatform.get(platform.id) ?? []}
              companyId={selectedCompanyId ?? null}
              onConnect={() => handleConnect(platform.id)}
              onDisconnect={handleDisconnect}
              pendingDisconnectId={disconnectMutation.variables ?? null}
              abrirMapeo={mapeoAbierto === platform.id}
            />
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-[12px] font-semibold uppercase tracking-[0.08em] text-l-tinta-2">Web</h2>
      <WebGoogleCard companyId={selectedCompanyId!} />

      <h2 className="mb-3 mt-8 text-[12px] font-semibold uppercase tracking-[0.08em] text-l-tinta-2">
        Publicación y automatización
      </h2>
      <PipelineIntegrations companyId={selectedCompanyId!} />

      <section className="mt-8 rounded-2xl border border-dashed border-l-linea bg-l-sup p-4 text-xs text-l-tinta-3">
        <h4 className="mb-1 text-sm font-semibold text-l-tinta">Cómo funciona la conexión</h4>
        <p>
          Al tocar <em>Conectar</em> se abre la pantalla de autorización de la plataforma. Cuando das el permiso, la
          plataforma vuelve a LMTM-OS, que cambia ese permiso por un token de larga duración y lo guarda en
          {" "}<code className="rounded bg-l-papel px-1 py-0.5 font-mono text-[11px]">ads_connections</code>{" "}
          para esta empresa. Las herramientas de los agentes lo leen en el momento de usarlo: nadie ve el token.
        </p>
      </section>
    </div>
    </>
  );
}
