// LMTM-OS: Public dashboard UI
// A read-only view of the per-client dashboard, accessible without a login
// at /public/dashboards/:slug. The slug is a server-issued token that
// resolves to a public_dashboards row; if `enabled = true`, the page
// renders.
//
// Client-facing: this is the report the agency SHARES with each client, so it
// has to sell — hero header, real charts (area/bars/donut/funnel) and deltas
// vs the previous period, built on the validated pubviz palette.
//
// Auto-refreshes every 60s so the client always sees fresh data without
// having to manually reload.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PubvizTheme, AreaChart, Donut, FunnelViz, RankedBars, Delta, PV_SLOTS, StatRow, ComboChart, CumulativeFlow, Spark, BarsVsRef } from "@/components/pubviz";
import {
  LayoutDashboard,
  Wallet,
  Megaphone,
  Globe2,
  Users,
  FileText,
  TrendingUp,
  Target,
  Eye,
  MousePointerClick,
  DollarSign,
  Activity,
  AlertCircle,
  Sparkles,
  ExternalLink,
  RefreshCcw,
  BarChart3,
  Image as ImageIcon,
  MessageCircle,
  Share2,
  Heart,
} from "lucide-react";

const REFRESH_MS = 60_000;

interface PublicClient {
  id: string;
  slug: string;
  name: string;
  currency: string;
  cplObjetivo?: number | null;
}
interface PublicHeader {
  label: string | null;
  enabled: boolean;
  createdAt: string;
  lastViewedAt: string | null;
}
interface TimeseriesPoint {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  conversions: number;
  reach: number;
  videoViews: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpl: number;
}
interface FunnelData {
  impressions: number;
  clicks: number;
  landingVisits: number;
  leads: number;
  conversions: number;
  spend: number;
  revenue: number;
  reach: number;
  rates: {
    ctr: number;
    clickToLanding: number;
    landingToLead: number;
    clickToLead: number;
    leadToSale: number;
    clickToSale: number;
  };
  cpls: {
    cpc: number;
    cpl: number;
    cpa: number;
    roas: number;
  };
}
interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpl: number;
}
interface CampaignsResponse {
  client: PublicClient;
  since: string;
  until: string;
  totals: { spend: number; impressions: number; clicks: number; leads: number; ctr: number; cpc: number; cpm: number };
  campaigns: Campaign[];
}
interface OrganicPost {
  id: string;
  pageId: string;
  message: string;
  postType: string;
  createdTime: string | null;
  permalinkUrl: string | null;
  fullPicture: string | null;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
  videoViews: number;
  impressions: number;
  engaged: number;
  engagementRate: number;
  score: number;
}

interface Creative {
  id: string;
  name: string;
  status: string | null;
  imageUrl: string | null;
  copy: string | null;
  titulo: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  ctr: number;
  cpl: number;
}

type Section = "resumen" | "presupuesto" | "campanas" | "anuncios" | "audiencia" | "organica" | "posts" | "leads";

const SECTIONS: Array<{ value: Section; label: string; icon: typeof LayoutDashboard }> = [
  { value: "resumen", label: "Resumen", icon: LayoutDashboard },
  { value: "presupuesto", label: "Presupuesto y saldo", icon: Wallet },
  { value: "campanas", label: "Campañas", icon: Megaphone },
  { value: "anuncios", label: "Anuncios", icon: ImageIcon },
  { value: "audiencia", label: "Audiencia", icon: Users },
  { value: "organica", label: "Página orgánica", icon: Globe2 },
  { value: "posts", label: "Posts y contenido", icon: FileText },
  { value: "leads", label: "Leads / Conversiones", icon: Target },
];

// ============================================================
//   Fetch helpers
// ============================================================
async function apiPublic<T>(slug: string, path: string, params?: { since?: string; until?: string; platform?: string }): Promise<T> {
  const sp = new URLSearchParams();
  if (params?.since) sp.set("since", params.since);
  if (params?.until) sp.set("until", params.until);
  if (params?.platform && params.platform !== "all") sp.set("platform", params.platform);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  const r = await fetch(`/api/public/dashboards/${slug}${path}${qs}`, { credentials: "omit" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

function useFormatters(currency: string) {
  return useMemo(() => {
    const fmtMoney = (n: number, max = 0) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: max }).format(n);
    const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
    const fmtPct = (n: number, digits = 2) => `${(n * 100).toFixed(digits)}%`;
    const fmtCompact = (n: number) => {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
      return n.toString();
    };
    return { fmtMoney, fmtInt, fmtPct, fmtCompact };
  }, [currency]);
}

/** Previous window of the same length, ending the day before `since`. */
function prevRange(since: string, until: string): { since: string; until: string } {
  const s = new Date(since + "T12:00:00");
  const u = new Date(until + "T12:00:00");
  const days = Math.max(1, Math.round((u.getTime() - s.getTime()) / 86400000) + 1);
  const pu = new Date(s);
  pu.setDate(pu.getDate() - 1);
  const ps = new Date(pu);
  ps.setDate(ps.getDate() - (days - 1));
  return { since: ps.toISOString().slice(0, 10), until: pu.toISOString().slice(0, 10) };
}

const ACCENTS = {
  blue: { chip: "linear-gradient(135deg, #2a78d6, #4a3aa7)" },
  green: { chip: "linear-gradient(135deg, #1baf7a, #0e8a60)" },
  amber: { chip: "linear-gradient(135deg, #eda100, #eb6834)" },
  rose: { chip: "linear-gradient(135deg, #e87ba4, #d03b6b)" },
  violet: { chip: "linear-gradient(135deg, #7c5ce0, #4a3aa7)" },
} as const;

const SPARK_COLORS: Record<keyof typeof ACCENTS, string> = {
  blue: "#2a78d6", green: "#1baf7a", amber: "#eda100", rose: "#e87ba4", violet: "#7c5ce0",
};

function Kpi({ title, value, sub, icon: Icon, accent = "blue", delta, big = false, alert = false, spark, sparkId }: {
  title: string;
  value: string;
  sub?: string;
  icon: typeof DollarSign;
  accent?: keyof typeof ACCENTS;
  delta?: React.ReactNode;
  big?: boolean;
  /** Semáforo: true = la métrica está fuera del objetivo del cliente. */
  alert?: boolean;
  /** Serie diaria del período → sparkline de progreso dentro de la card. */
  spark?: number[];
  sparkId?: string;
}) {
  return (
    <Card className={`p-3.5 relative overflow-hidden ${alert ? "border-rose-500/60 bg-rose-500/5" : ""}`}>
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: alert ? "#d03b3b" : ACCENTS[accent].chip }} />
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">{title}</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className={`${big ? "text-2xl" : "text-xl"} font-bold truncate`}>{value}</p>
            {delta}
          </div>
          {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
        </div>
        <div className="shrink-0 rounded-lg p-2 text-white shadow-sm" style={{ background: ACCENTS[accent].chip }}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {spark && spark.length > 1 && <Spark points={spark} color={alert ? "#d03b3b" : SPARK_COLORS[accent]} id={sparkId ?? title} />}
    </Card>
  );
}

// ============================================================
//   Main public page
// ============================================================
export function PublicDashboard() {
  const { slug } = useParams<{ slug: string }>();

  const headerQuery = useQuery({
    queryKey: ["public", "dashboards", slug],
    queryFn: () => apiPublic<{ client: PublicClient; dashboard: PublicHeader }>(slug!, ""),
    enabled: !!slug,
    refetchInterval: REFRESH_MS,
    retry: false,
  });

  if (headerQuery.isLoading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-3 max-w-md">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
          <p className="text-xs text-muted-foreground">Cargando dashboard…</p>
        </div>
      </div>
    );
  }

  if (headerQuery.isError) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <Card className="p-6 max-w-md w-full">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-sm">Dashboard no disponible</h3>
              <p className="text-xs text-muted-foreground mt-1">{(headerQuery.error as Error).message}</p>
              <p className="text-xs text-muted-foreground mt-2">El link puede haber sido revocado. Pedile uno nuevo a tu agencia.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const { client, dashboard } = headerQuery.data!;
  return <PublicDashboardInner slug={slug!} client={client} dashboard={dashboard} />;
}

/** El reporte que ve el CLIENTE es siempre claro y prolijo, sin importar el
 *  tema del panel interno (que suele estar en dark). Se fuerza light mientras
 *  la página está montada y se restaura al salir. */
function useForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    const prevScheme = root.style.colorScheme;
    root.classList.remove("dark");
    root.style.colorScheme = "light";
    return () => {
      if (wasDark) root.classList.add("dark");
      root.style.colorScheme = prevScheme;
    };
  }, []);
}

function PublicDashboardInner({ slug, client, dashboard }: { slug: string; client: PublicClient; dashboard: PublicHeader }) {
  useForceLightTheme();
  const today = useMemo(() => new Date(), []);
  /** Tope de lo que se puede elegir a mano: hoy. Distinto del default. */
  const maxFecha = useMemo(() => today.toISOString().slice(0, 10), [today]);
  // El rango por defecto TERMINA AYER, no hoy.
  //
  // ads_insights del dia en curso esta a medio sincronizar, y eso ya rompio dos
  // calculos internos (la plata parada se inflaba 2x, el aviso de saldo llegaba
  // tarde). Aca hacia dos cosas peores, porque las ve el cliente:
  //   1. el ultimo punto de TODOS los graficos caia siempre, todos los dias,
  //      y se lee como "la campana se cayo hoy";
  //   2. el delta "vs periodo anterior" comparaba un periodo con un dia a
  //      medias contra uno completo, asi que salia sistematicamente peor.
  // De paso arregla un off-by-one: [hoy-30, hoy] son 31 dias, no 30.
  // Es ademas lo que hace Meta con su preset "Ultimos 30 dias", asi que el
  // panel ahora COINCIDE con el Administrador de anuncios en vez de diferir.
  // Elegir hoy a mano sigue siendo posible.
  const defaultUntil = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [today]);
  const defaultSince = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, [today]);

  const [range, setRange] = useState({ since: defaultSince, until: defaultUntil });
  const [platform, setPlatform] = useState<"all" | "meta" | "google">("all");
  const [activeSection, setActiveSection] = useState<Section>("resumen");
  const [now, setNow] = useState(Date.now());
  const fmt = useFormatters(client.currency);

  // Auto-refresh timestamp display
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const tsQuery = useQuery({
    queryKey: ["public", "timeseries", slug, range.since, range.until, platform],
    queryFn: () => apiPublic<{ client: PublicClient; since: string; until: string; series: TimeseriesPoint[] }>(slug, "/timeseries", { ...range, platform }),
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  const funnelQuery = useQuery({
    queryKey: ["public", "funnel", slug, range.since, range.until, platform],
    queryFn: () => apiPublic<{ funnel: FunnelData }>(slug, "/funnel", { ...range, platform }),
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  // Previous window of the same length — powers the "vs período anterior" deltas.
  const prev = useMemo(() => prevRange(range.since, range.until), [range.since, range.until]);
  const prevFunnelQuery = useQuery({
    queryKey: ["public", "funnel-prev", slug, prev.since, prev.until, platform],
    queryFn: () => apiPublic<{ funnel: FunnelData }>(slug, "/funnel", { ...prev, platform }),
    retry: false,
  });
  const campaignsQuery = useQuery({
    queryKey: ["public", "campaigns", slug, range.since, range.until, platform],
    queryFn: () => apiPublic<CampaignsResponse>(slug, "/campaigns", { ...range, platform }),
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  const audienciaQuery = useQuery({
    queryKey: ["public", "audiencia", slug],
    queryFn: () => apiPublic<{ audiencia: Record<string, Array<{ key: string; spend: number; leads: number; impressions: number; cpl: number | null }>> }>(slug, "/audiencia"),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const creativesQuery = useQuery({
    queryKey: ["public", "creatives", slug, range.since, range.until, platform],
    queryFn: () => apiPublic<{ creatives: Creative[] }>(slug, "/creatives", { ...range, platform }),
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  const organicQuery = useQuery({
    queryKey: ["public", "organic", slug],
    queryFn: () => apiPublic<{ posts: OrganicPost[] }>(slug, "/organic"),
    refetchInterval: REFRESH_MS,
    retry: false,
  });

  const funnel = funnelQuery.data?.funnel;
  const prevFunnel = prevFunnelQuery.data?.funnel;
  const series = tsQuery.data?.series ?? [];
  const campaigns = campaignsQuery.data?.campaigns ?? [];
  const organic = organicQuery.data?.posts ?? [];

  const totalSpend = funnel?.spend ?? 0;
  const totalImpr = funnel?.impressions ?? 0;
  const totalClicks = funnel?.clicks ?? 0;
  const totalLeads = funnel?.leads ?? 0;
  const ctr = funnel?.rates.ctr ?? 0;
  const cpl = funnel?.cpls.cpl ?? 0;
  const cpc = funnel?.cpls.cpc ?? 0;
  const cpm = totalImpr > 0 ? (totalSpend / totalImpr) * 1000 : 0;
  const roas = funnel?.cpls.roas ?? 0;
  const frequency = totalImpr > 0 && (funnel?.reach ?? 0) > 0 ? totalImpr / (funnel!.reach) : 0;
  const activeCampaigns = campaigns.filter((c) => c.status?.toLowerCase() === "active").length;

  const lastSync = useMemo(() => {
    const elapsed = Math.floor((now - (tsQuery.dataUpdatedAt ?? now)) / 1000);
    if (elapsed < 5) return "ahora";
    if (elapsed < 60) return `hace ${elapsed}s`;
    if (elapsed < 3600) return `hace ${Math.floor(elapsed / 60)} min`;
    return `hace ${Math.floor(elapsed / 3600)} h`;
  }, [now, tsQuery.dataUpdatedAt]);

  const renderSection = () => {
    switch (activeSection) {
      case "resumen": return <ResumenPublic series={series} campaigns={campaigns} totalSpend={totalSpend} totalImpr={totalImpr} totalClicks={totalClicks} totalLeads={totalLeads} ctr={ctr} cpl={cpl} cpc={cpc} cpm={cpm} roas={roas} frequency={frequency} activeCampaigns={activeCampaigns} fmt={fmt} funnel={funnel} prevFunnel={prevFunnel} cplObjetivo={client.cplObjetivo ?? null} />;
      case "presupuesto": return <PresupuestoPublic totalSpend={totalSpend} series={series} campaigns={campaigns} fmt={fmt} />;
      case "campanas": return <CampanasPublic campaigns={campaigns} fmt={fmt} />;
      case "anuncios": return <AnunciosPublic creatives={creativesQuery.data?.creatives ?? []} loading={creativesQuery.isLoading} fmt={fmt} />;
      case "audiencia": return <AudienciaPublic data={audienciaQuery.data?.audiencia ?? {}} fmt={fmt} />;
      case "organica": return <OrganicaPublic posts={organic} fmt={fmt} />;
      case "posts": return <PostsPublic posts={organic} fmt={fmt} />;
      case "leads": return <LeadsPublic funnel={funnel} prevFunnel={prevFunnel} fmt={fmt} />;
    }
  };

  const rangeLabel = useMemo(() => {
    const f = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" });
    return `${f(range.since)} — ${f(range.until)}`;
  }, [range]);

  return (
    // h-dvh + overflow-y-auto: el body del app tiene overflow:hidden (el panel
    // maneja su propio scroll), así que esta página pública scrollea sola.
    <div className="h-dvh overflow-y-auto bg-background pv">
      <PubvizTheme />
      {/* Hero header */}
      <header className="text-white" style={{ background: "linear-gradient(120deg, #1c3f8f 0%, #2a78d6 45%, #4a3aa7 100%)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/70 font-medium">
                <BarChart3 className="h-3.5 w-3.5" />
                Reporte de resultados
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold truncate mt-1">{client.name}</h1>
              <p className="text-xs text-white/70 mt-1">{rangeLabel} · {dashboard.label ?? "Dashboard en vivo"}</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-white/70 bg-white/10 rounded-full px-3 py-1.5 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300" />
              </span>
              <span>En vivo · actualizado {lastSync}</span>
              <RefreshCcw className="h-3 w-3" />
            </div>
          </div>
        </div>
        {/* Date range + section nav */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-4 flex items-center gap-3 flex-wrap">
          <DateRangePicker since={range.since} until={range.until} defaultUntil={maxFecha} onChange={setRange} />
          <div className="flex gap-1">
            {(["all", "meta", "google"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`text-xs px-2.5 py-1.5 rounded-full transition-colors ${platform === p ? "bg-white text-slate-900 font-semibold shadow-sm" : "text-white/80 hover:text-white hover:bg-white/10"}`}
              >
                {p === "all" ? "Todas" : p === "meta" ? "Meta" : "Google"}
              </button>
            ))}
          </div>
          <nav className="flex flex-wrap gap-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = s.value === activeSection;
              return (
                <button
                  key={s.value}
                  onClick={() => setActiveSection(s.value)}
                  className={`text-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-colors ${
                    isActive ? "bg-white text-slate-900 font-semibold shadow-sm" : "text-white/80 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {renderSection()}
      </main>

      <footer className="border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-[10px] text-muted-foreground text-center">
          Powered by LMTM-OS · {dashboard.label ?? client.name}
        </div>
      </footer>
    </div>
  );
}

// ============================================================
//   Date range picker (same UX as the admin dashboard)
// ============================================================
function DateRangePicker({ since, until, defaultUntil, onChange }: { since: string; until: string; defaultUntil: string; onChange: (n: { since: string; until: string }) => void }) {
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-0.5">
        <label className="text-[9px] uppercase tracking-wide text-white/60">Desde</label>
        <input
          type="date"
          value={since}
          max={until}
          onChange={(e) => onChange({ since: e.target.value, until })}
          className="block h-7 px-2 text-xs rounded-md bg-white/15 text-white border border-white/20 [color-scheme:dark]"
        />
      </div>
      <div className="space-y-0.5">
        <label className="text-[9px] uppercase tracking-wide text-white/60">Hasta</label>
        <input
          type="date"
          value={until}
          min={since}
          max={defaultUntil}
          onChange={(e) => onChange({ since, until: e.target.value })}
          className="block h-7 px-2 text-xs rounded-md bg-white/15 text-white border border-white/20 [color-scheme:dark]"
        />
      </div>
    </div>
  );
}

// ============================================================
//   Sections
// ============================================================
function ResumenPublic({ series, campaigns, totalSpend, totalImpr, totalClicks, totalLeads, ctr, cpl, cpc, cpm, roas, frequency, activeCampaigns, fmt, funnel, prevFunnel, cplObjetivo }: any) {
  const spendSeries = series.map((p: TimeseriesPoint) => ({ date: p.date, value: p.spend }));
  const leadSeries = series.map((p: TimeseriesPoint) => ({ date: p.date, value: p.leads }));
  const donutSlices = [...campaigns]
    .sort((a: Campaign, b: Campaign) => b.spend - a.spend)
    .filter((c: Campaign) => c.spend > 0)
    .map((c: Campaign) => ({ label: c.name, value: c.spend }));
  const prevCpm = (prevFunnel?.impressions ?? 0) > 0 ? (prevFunnel.spend / prevFunnel.impressions) * 1000 : 0;
  // Semáforo (review 27/7): CPL real vs objetivo del cliente (+20% de tolerancia).
  const cplAlerta = cplObjetivo != null && cplObjetivo > 0 && cpl > cplObjetivo * 1.2;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi big title="Inversión" value={fmt.fmtMoney(totalSpend)} icon={DollarSign} accent="blue"
          delta={<Delta curr={totalSpend} prev={prevFunnel?.spend ?? 0} goodWhen="up" />}
          sub="Período seleccionado" spark={series.map((p: TimeseriesPoint) => p.spend)} sparkId="s-inv" />
        <Kpi big title="Leads" value={fmt.fmtInt(totalLeads)} icon={Target} accent="green" alert={cplAlerta}
          delta={<Delta curr={totalLeads} prev={prevFunnel?.leads ?? 0} goodWhen="up" />}
          sub={cpl > 0 ? `CPL ${fmt.fmtMoney(cpl)}${cplObjetivo ? ` · objetivo ${fmt.fmtMoney(cplObjetivo)}` : ""}${cplAlerta ? " ⚠ sobre objetivo" : ""}` : undefined} spark={series.map((p: TimeseriesPoint) => p.leads)} sparkId="s-leads" />
        <Kpi big title="Conversiones" value={fmt.fmtInt(funnel?.conversions ?? 0)} icon={TrendingUp} accent="violet"
          delta={<Delta curr={funnel?.conversions ?? 0} prev={prevFunnel?.conversions ?? 0} goodWhen="up" />}
          sub={roas > 0 ? `ROAS ${roas.toFixed(2)}x` : undefined} spark={series.map((p: TimeseriesPoint) => p.conversions)} sparkId="s-conv" />
        <Kpi big title="CTR" value={fmt.fmtPct(ctr, 2)} icon={MousePointerClick} accent="amber"
          delta={<Delta curr={ctr} prev={prevFunnel?.rates?.ctr ?? 0} goodWhen="up" />}
          sub={`CPC ${fmt.fmtMoney(cpc, 2)}`} spark={series.map((p: TimeseriesPoint) => p.ctr)} sparkId="s-ctr" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Impresiones" value={fmt.fmtCompact(totalImpr)} icon={Eye} accent="rose"
          delta={<Delta curr={totalImpr} prev={prevFunnel?.impressions ?? 0} goodWhen="up" />}
          sub={(funnel?.reach ?? 0) > 0 ? `${fmt.fmtCompact(funnel!.reach)} personas alcanzadas` : undefined} spark={series.map((p: TimeseriesPoint) => p.impressions)} sparkId="s-impr" />
        <Kpi title="Clics" value={fmt.fmtInt(totalClicks)} icon={MousePointerClick} accent="violet"
          delta={<Delta curr={totalClicks} prev={prevFunnel?.clicks ?? 0} goodWhen="up" />} spark={series.map((p: TimeseriesPoint) => p.clicks)} sparkId="s-clicks" />
        <Kpi title="CPM" value={fmt.fmtMoney(cpm, 0)} icon={Activity} accent="amber"
          delta={<Delta curr={cpm} prev={prevCpm} goodWhen="down" />}
          sub={frequency >= 1 ? `Frecuencia ${frequency.toFixed(2)}` : undefined} spark={series.map((p: TimeseriesPoint) => p.cpm)} sparkId="s-cpm" />
        <Kpi title="Campañas activas" value={fmt.fmtInt(activeCampaigns)} icon={Megaphone} accent="blue" sub={`${campaigns.length} totales`} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">Ritmo de inversión</h3>
            <p className="text-[10px] text-muted-foreground">Inversión por día · media móvil · promedio del período</p>
          </div>
          {series.length === 0 ? <Skeleton className="h-52 w-full" /> : (
            <>
              <StatRow stats={[
                { label: "Invertido", value: fmt.fmtMoney(totalSpend) },
                { label: "Promedio diario", value: fmt.fmtMoney(series.length ? totalSpend / series.length : 0) },
                { label: "Días", value: String(series.length) },
              ]} />
              <ComboChart points={spendSeries} color={PV_SLOTS[0]} fmtValue={(n) => fmt.fmtMoney(n)} labels={{ bars: "Inversión diaria", line: "Media móvil", guide: "Promedio del período" }} />
            </>
          )}
        </Card>
        <Card className="p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">Generación de leads</h3>
            <p className="text-[10px] text-muted-foreground">Leads por día · media móvil · promedio del período</p>
          </div>
          {series.length === 0 ? <Skeleton className="h-52 w-full" /> : (
            <>
              <StatRow stats={[
                { label: "Leads", value: fmt.fmtInt(totalLeads) },
                { label: "CPL", value: cpl > 0 ? fmt.fmtMoney(cpl) : "—" },
                { label: "Mejor día", value: fmt.fmtInt(Math.max(...leadSeries.map((p: { value: number }) => p.value), 0)) },
              ]} />
              <ComboChart points={leadSeries} color={PV_SLOTS[2]} fmtValue={(n) => fmt.fmtInt(n)} labels={{ bars: "Leads diarios", line: "Media móvil", guide: "Promedio del período" }} />
            </>
          )}
        </Card>
      </div>
      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Flujo acumulado de resultados</h3>
          <p className="text-[10px] text-muted-foreground">Cómo se fueron sumando leads y ventas a lo largo del período</p>
        </div>
        {series.length === 0 ? <Skeleton className="h-52 w-full" /> : (
          <>
            <StatRow stats={[
              { label: "Leads totales", value: fmt.fmtInt(totalLeads) },
              { label: "Ventas", value: fmt.fmtInt(funnel?.conversions ?? 0) },
              { label: "Lead → Venta", value: funnel?.rates?.leadToSale > 0 ? fmt.fmtPct(funnel.rates.leadToSale, 1) : "—" },
            ]} />
            <CumulativeFlow
              id="flow"
              fmtValue={(n) => fmt.fmtInt(n)}
              series={[
                { label: "Leads", color: "var(--pv-c3)", points: series.map((p: TimeseriesPoint) => ({ date: p.date, value: p.leads })) },
                { label: "Ventas", color: "var(--pv-c1)", points: series.map((p: TimeseriesPoint) => ({ date: p.date, value: p.conversions })) },
              ]}
            />
          </>
        )}
      </Card>
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Sparkles className="h-4 w-4" style={{ color: "#4a3aa7" }} /> ¿A dónde fue la inversión?</h3>
        <Donut slices={donutSlices} fmtValue={(n) => fmt.fmtMoney(n)} centerLabel="invertido" />
      </Card>
    </div>
  );
}

function PresupuestoPublic({ totalSpend, series, campaigns, fmt }: any) {
  const monthlyBudget = campaigns.reduce((a: number, c: any) => a + ((c.dailyBudget ?? 0) * 30), 0);
  const consumedPct = monthlyBudget > 0 ? (totalSpend / monthlyBudget) * 100 : 0;
  const overBudget = monthlyBudget > 0 && totalSpend > monthlyBudget;
  const days = series.length || 1;
  const avgDaily = totalSpend / days;
  const today = new Date();
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysRemaining = Math.max(1, endOfMonth.getDate() - today.getDate());
  const projected = avgDaily * (daysRemaining + today.getDate());
  const spendSeries = series.map((p: TimeseriesPoint) => ({ date: p.date, value: p.spend }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Gasto del período" value={fmt.fmtMoney(totalSpend)} icon={DollarSign} accent="blue" />
        <Kpi title="Promedio diario" value={fmt.fmtMoney(avgDaily, 2)} icon={Activity} accent="violet" />
        <Kpi title="Proyección cierre" value={fmt.fmtMoney(projected, 0)} icon={TrendingUp} accent="amber" sub={`${daysRemaining} días restantes`} />
        <Kpi title="Presupuesto mensual" value={monthlyBudget > 0 ? fmt.fmtMoney(monthlyBudget) : "—"} icon={Wallet} accent="rose" sub={monthlyBudget > 0 ? `${consumedPct.toFixed(0)}% consumido` : undefined} />
      </div>
      {monthlyBudget > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Presupuesto consumido</h3>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div className={`h-full ${overBudget ? "bg-rose-500" : consumedPct > 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(consumedPct, 100)}%` }} />
          </div>
        </Card>
      )}
      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Burnup de inversión</h3>
          <p className="text-[10px] text-muted-foreground">Gasto acumulado del período, día a día</p>
        </div>
        {series.length === 0 ? <Skeleton className="h-52 w-full" /> : (
          <>
            <StatRow stats={[
              { label: "Gastado", value: fmt.fmtMoney(totalSpend) },
              { label: "Promedio diario", value: fmt.fmtMoney(avgDaily, 0) },
              { label: "Proyección de cierre", value: fmt.fmtMoney(projected, 0), sub: `${daysRemaining} días restantes` },
            ]} />
            <CumulativeFlow
              id="burnup"
              fmtValue={(n) => fmt.fmtMoney(n)}
              series={[{ label: "Inversión", color: "var(--pv-c1)", points: spendSeries }]}
            />
          </>
        )}
      </Card>
    </div>
  );
}

function BarCell({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  return (
    <div className="min-w-[110px]">
      <div className="text-right tabular-nums">{label}</div>
      <div className="h-1 rounded-full bg-muted overflow-hidden mt-0.5">
        <div className="h-full rounded-full" style={{ width: `${Math.max(max > 0 ? (value / max) * 100 : 0, 1)}%`, background: color }} />
      </div>
    </div>
  );
}

function CampanasPublic({ campaigns, fmt }: { campaigns: Campaign[]; fmt: any }) {
  const totalSpend = campaigns.reduce((a, c) => a + c.spend, 0);
  const sorted = [...campaigns].sort((a, b) => b.spend - a.spend);
  const maxClicks = Math.max(...campaigns.map((c) => c.clicks), 1);
  const maxLeads = Math.max(...campaigns.map((c) => c.leads), 1);
  const topLeads = sorted.filter((c) => c.leads > 0).sort((a, b) => b.leads - a.leads).slice(0, 6)
    .map((c) => ({ label: c.name, value: c.leads, sub: c.cpl > 0 ? `CPL ${fmt.fmtMoney(c.cpl)}` : undefined }));
  // CPL por campaña vs promedio de la cuenta (barras con línea de referencia).
  const conCpl = sorted.filter((c) => c.cpl > 0 && c.leads > 0).slice(0, 8);
  const totalLeadsCamp = conCpl.reduce((a, c) => a + c.leads, 0);
  const cplRef = totalLeadsCamp > 0 ? conCpl.reduce((a, c) => a + c.spend, 0) / totalLeadsCamp : 0;
  return (
    <div className="space-y-4">
    {topLeads.length > 0 && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-4">¿Qué campañas traen los leads?</h3>
          <RankedBars rows={topLeads} color={PV_SLOTS[2]} fmtValue={(n: number) => fmt.fmtInt(n)} />
        </Card>
        {cplRef > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-1">Costo por consulta vs promedio</h3>
            <p className="text-[10px] text-muted-foreground mb-4">Verde = por debajo del promedio de la cuenta</p>
            <BarsVsRef
              rows={conCpl.map((c) => ({ label: c.name, value: c.cpl }))}
              ref={cplRef}
              refLabel="Promedio de la cuenta"
              fmtValue={(n: number) => fmt.fmtMoney(n)}
            />
          </Card>
        )}
      </div>
    )}
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3">Campañas ({campaigns.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-2 px-2 font-medium">Campaña</th>
              <th className="py-2 px-2 font-medium">Estado</th>
              <th className="py-2 px-2 font-medium text-right">Inversión</th>
              <th className="py-2 px-2 font-medium min-w-[90px]">% del total</th>
              <th className="py-2 px-2 font-medium text-right">Clics</th>
              <th className="py-2 px-2 font-medium text-right">CTR</th>
              <th className="py-2 px-2 font-medium text-right">CPL</th>
              <th className="py-2 px-2 font-medium text-right">Leads</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Sin campañas</td></tr>
            ) : sorted.map((c) => {
              const active = c.status?.toLowerCase() === "active";
              const share = totalSpend > 0 ? (c.spend / totalSpend) * 100 : 0;
              return (
                <tr key={c.id} className="border-b">
                  <td className="py-2 px-2 font-medium max-w-[220px] truncate" title={c.name}>{c.name}</td>
                  <td className="py-2 px-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? "#0ca30c" : "var(--pv-muted)" }} />
                      <span className={active ? "font-medium" : "text-muted-foreground"}>{active ? "Activa" : c.status}</span>
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-medium">{fmt.fmtMoney(c.spend)}</td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(share, 1)}%`, background: "var(--pv-c1)" }} />
                      </div>
                      <span className="tabular-nums text-muted-foreground w-8 text-right">{share.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="py-2 px-2"><BarCell value={c.clicks} max={maxClicks} color="var(--pv-c5)" label={fmt.fmtInt(c.clicks)} /></td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtPct(c.ctr)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{c.cpl > 0 ? fmt.fmtMoney(c.cpl) : "—"}</td>
                  <td className="py-2 px-2"><BarCell value={c.leads} max={maxLeads} color="var(--pv-c3)" label={fmt.fmtInt(c.leads)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
    </div>
  );
}

/**
 * Miniatura con fallback: las URLs de fbcdn están firmadas y pueden vencer
 * entre syncs. Si la imagen no carga se muestra el placeholder en vez de un
 * ícono roto — este reporte lo ve el cliente.
 */
function Thumb({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  const [roto, setRoto] = useState(false);
  if (!src || roto) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className}`}>
        <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setRoto(true)} className={`object-cover ${className}`} />;
}

const MEDALLA = ["#eda100", "#9aa4b2", "#c07a3e"];

function AnunciosPublic({ creatives, loading, fmt }: { creatives: Creative[]; loading: boolean; fmt: any }) {
  if (loading) return <Skeleton className="h-64 w-full" />;
  if (creatives.length === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Todavía no hay anuncios con inversión en este período.</Card>;
  }
  const conLeads = creatives.filter((c) => c.leads > 0);
  const podio = creatives.slice(0, 3);
  const resto = creatives.slice(3);
  const maxLeads = Math.max(...creatives.map((c) => c.leads), 1);
  const maxSpend = Math.max(...creatives.map((c) => c.spend), 1);
  // CPL de cada anuncio contra el promedio de todos — muestra de un vistazo
  // cuáles compran barato las consultas.
  const totalLeads = conLeads.reduce((a, c) => a + c.leads, 0);
  const cplRef = totalLeads > 0 ? conLeads.reduce((a, c) => a + c.spend, 0) / totalLeads : 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {podio.map((c, i) => (
          <Card key={c.id} className="overflow-hidden flex flex-col">
            <div className="relative aspect-[4/3] bg-muted">
              <Thumb src={c.imageUrl} alt={c.name} className="w-full h-full" />
              <span
                className="absolute top-2 left-2 h-6 w-6 rounded-full text-[11px] font-bold text-white flex items-center justify-center shadow"
                style={{ background: MEDALLA[i] }}
              >
                {i + 1}
              </span>
            </div>
            <div className="p-3 flex-1 flex flex-col gap-2">
              {/* El NOMBRE del anuncio manda sobre el titular. El titular es copy
                  comercial y se repite entre anuncios distintos: el 21/9/26 el
                  panel mostraba dos anuncios como "Repará 4 llantas y pagá 3",
                  imposibles de distinguir. El nombre es el que los identifica
                  —es el que usa el equipo y el que muestra el panel interno—,
                  así que el titular pasa al hover. */}
              <p className="text-xs font-medium line-clamp-2" title={c.titulo || c.name}>{c.name || c.titulo}</p>
              <div className="mt-auto grid grid-cols-3 gap-2 text-center pt-2 border-t">
                <div>
                  <p className="text-lg font-bold leading-none tabular-nums" style={{ color: "var(--pv-c3)" }}>{fmt.fmtInt(c.leads)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">consultas</p>
                </div>
                <div>
                  <p className="text-sm font-semibold leading-none tabular-nums pt-1">{c.cpl > 0 ? fmt.fmtMoney(c.cpl) : "—"}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">costo c/u</p>
                </div>
                <div>
                  <p className="text-sm font-semibold leading-none tabular-nums pt-1">{fmt.fmtPct(c.ctr)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">CTR</p>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {cplRef > 0 && conLeads.length > 1 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-1">Costo por consulta de cada anuncio</h3>
          <p className="text-[10px] text-muted-foreground mb-4">Verde = compra consultas más baratas que el promedio</p>
          <BarsVsRef
            rows={conLeads.slice(0, 8).map((c) => ({ label: c.name || c.titulo || "Anuncio", value: c.cpl }))}
            ref={cplRef}
            refLabel="Promedio de la cuenta"
            fmtValue={(n: number) => fmt.fmtMoney(n)}
          />
        </Card>
      )}

      {resto.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Resto de los anuncios</h3>
          <div className="space-y-2">
            {resto.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <Thumb src={c.imageUrl} alt={c.name} className="h-11 w-11 rounded-md shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate" title={c.titulo || c.name}>{c.name || c.titulo}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.max((c.leads / maxLeads) * 100, 1)}%`, background: "var(--pv-c3)" }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-20 text-right">{fmt.fmtInt(c.leads)} consultas</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.max((c.spend / maxSpend) * 100, 1)}%`, background: "var(--pv-c1)" }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-20 text-right">{fmt.fmtMoney(c.spend)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/** Grilla visual de posts ordenada por interacción (no por fecha). */
function PostGrid({ posts, fmt, cols = "md:grid-cols-3" }: { posts: OrganicPost[]; fmt: any; cols?: string }) {
  return (
    <div className={`grid grid-cols-2 ${cols} gap-3`}>
      {posts.map((p, i) => {
        const inter = p.reactions + p.comments + p.shares;
        return (
          <a
            key={p.id}
            href={p.permalinkUrl ?? undefined}
            target="_blank"
            rel="noreferrer noopener"
            className="group relative block aspect-square rounded-lg overflow-hidden border"
          >
            <Thumb src={p.fullPicture} alt="" className="w-full h-full transition-transform duration-300 group-hover:scale-105" />
            {i < 3 && (
              <span
                className="absolute top-2 left-2 h-6 w-6 rounded-full text-[11px] font-bold text-white flex items-center justify-center shadow"
                style={{ background: MEDALLA[i] }}
              >
                {i + 1}
              </span>
            )}
            <div
              className="absolute inset-x-0 bottom-0 p-2 text-white"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,.82), rgba(0,0,0,.45) 55%, transparent)" }}
            >
              <p className="text-[15px] font-bold leading-none tabular-nums">{fmt.fmtInt(inter)}</p>
              <p className="text-[9px] opacity-80 mb-1">interacciones</p>
              <div className="flex items-center gap-2 text-[9px] opacity-90">
                <span className="inline-flex items-center gap-0.5"><Heart className="h-2.5 w-2.5" />{fmt.fmtInt(p.reactions)}</span>
                <span className="inline-flex items-center gap-0.5"><MessageCircle className="h-2.5 w-2.5" />{fmt.fmtInt(p.comments)}</span>
                <span className="inline-flex items-center gap-0.5"><Share2 className="h-2.5 w-2.5" />{fmt.fmtInt(p.shares)}</span>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

type AudFila = { key: string; spend: number; leads: number; impressions: number; cpl: number | null };

const DIM_LABEL: Record<string, string> = {
  age: "Por edad", gender: "Por género", device: "Por dispositivo", publisher_platform: "Por red",
};
const KEY_LABEL: Record<string, string> = {
  female: "Mujeres", male: "Hombres", unknown: "Sin dato",
  android_smartphone: "Android", iphone: "iPhone", ipad: "iPad", android_tablet: "Tablet Android",
  desktop: "Computadora", other: "Otros",
  facebook: "Facebook", instagram: "Instagram", audience_network: "Audience Network", messenger: "Messenger",
};
const lindo = (k: string) => KEY_LABEL[k.toLowerCase()] ?? k;

function AudienciaPublic({ data, fmt }: { data: Record<string, AudFila[]>; fmt: any }) {
  const dims = ["age", "gender", "device", "publisher_platform"].filter((d) => (data[d] ?? []).length > 0);
  if (dims.length === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Todavía no hay datos de audiencia para este período.</Card>;
  }
  // Titular: el segmento que mejor convierte (más leads con CPL más bajo).
  const edades = (data.age ?? []).filter((a) => a.leads > 0);
  // "El mas eficiente" es una comparacion, y una comparacion necesita contra
  // que. Con un solo rango con consultas, el ganador lo es por default; y con
  // dos o tres consultas el CPL es ruido —una sola consulta mas lo mueve a la
  // mitad—, pero sale impreso en negrita en el panel del cliente. Si no hay
  // con que comparar, no se afirma nada: la frase de genero (que es un conteo
  // crudo, no una inferencia) se muestra igual.
  const MIN_LEADS_EDAD = 5;
  const ordenEdades = [...edades].sort((a, b) => (a.cpl ?? 9e9) - (b.cpl ?? 9e9));
  const candidata = ordenEdades[0];
  const mejorEdad = edades.length >= 2 && candidata && candidata.cpl != null && candidata.leads >= MIN_LEADS_EDAD
    ? candidata
    : null;
  const genero = (data.gender ?? []).filter((g) => g.leads > 0);
  const mejorGenero = [...genero].sort((a, b) => b.leads - a.leads)[0];

  return (
    <div className="space-y-4">
      {(mejorEdad || mejorGenero) && (
        <Card className="p-4 border-l-4" style={{ borderLeftColor: "#1baf7a" }}>
          <h3 className="text-sm font-semibold mb-1">¿A quién le está hablando tu pauta?</h3>
          <p className="text-sm text-muted-foreground">
            {mejorGenero && <>El público que más responde es <strong className="text-foreground">{lindo(mejorGenero.key).toLowerCase()}</strong>{" "}({fmt.fmtInt(mejorGenero.leads)} consultas). </>}
            {mejorEdad && <>El rango <strong className="text-foreground">{mejorEdad.key}</strong> es el más eficiente, con un costo por consulta de <strong className="text-foreground">{fmt.fmtMoney(mejorEdad.cpl!)}</strong> sobre {fmt.fmtInt(mejorEdad.leads)} consultas.</>}
          </p>
        </Card>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {dims.map((d) => {
          const filas = (data[d] ?? []).filter((f) => f.spend > 0).slice(0, 8);
          const usarDonut = d === "gender" || d === "publisher_platform";
          return (
            <Card key={d} className="p-4">
              <h3 className="text-sm font-semibold mb-1">{DIM_LABEL[d] ?? d}</h3>
              <p className="text-[10px] text-muted-foreground mb-3">Inversión y consultas del período</p>
              {usarDonut ? (
                <Donut
                  slices={filas.map((f) => ({ label: `${lindo(f.key)} · ${fmt.fmtInt(f.leads)} consultas`, value: f.spend }))}
                  fmtValue={(n: number) => fmt.fmtMoney(n)}
                  centerLabel="invertido"
                />
              ) : (
                <RankedBars
                  rows={filas.map((f) => ({
                    label: lindo(f.key),
                    value: f.spend,
                    sub: f.cpl != null ? `${fmt.fmtInt(f.leads)} consultas · ${fmt.fmtMoney(f.cpl)} c/u` : `${fmt.fmtInt(f.leads)} consultas`,
                  }))}
                  color={d === "age" ? PV_SLOTS[0] : PV_SLOTS[4]}
                  fmtValue={(n: number) => fmt.fmtMoney(n)}
                />
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function OrganicaPublic({ posts, fmt }: { posts: OrganicPost[]; fmt: any }) {
  const t = posts.reduce((a, p) => ({ impressions: a.impressions + p.impressions, engaged: a.engaged + p.engaged, reactions: a.reactions + p.reactions, comments: a.comments + p.comments, shares: a.shares + p.shares }), { impressions: 0, engaged: 0, reactions: 0, comments: 0, shares: 0 });
  // Meta no reporta impresiones orgánicas para todas las páginas — sin ese
  // dato, mostrar "0" o "ER 0.00%" es mentir (review 27/7): se muestra "—".
  const sinImpresiones = t.impressions === 0 && posts.length > 0;
  const er = t.impressions > 0 ? t.engaged / t.impressions : 0;
  const porInteraccion = [...posts]
    .sort((a, b) => (b.reactions + b.comments + b.shares) - (a.reactions + a.comments + a.shares));
  const topConImagen = porInteraccion.filter((p) => p.fullPicture).slice(0, 6);
  const top = porInteraccion
    .slice(0, 6)
    .map((p) => ({
      label: (p.message || "(sin texto)").slice(0, 70),
      value: p.reactions + p.comments + p.shares,
      sub: p.impressions > 0 ? `ER ${fmt.fmtPct(p.engagementRate)}` : "interacciones",
    }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Publicaciones" value={fmt.fmtInt(posts.length)} icon={FileText} accent="blue" />
        <Kpi title="Impresiones" value={sinImpresiones ? "—" : fmt.fmtCompact(t.impressions)} icon={Eye} accent="violet" sub={sinImpresiones ? "Meta no reporta este dato para la página" : undefined} />
        <Kpi title="Engagement Rate" value={sinImpresiones ? "—" : fmt.fmtPct(er, 2)} icon={Activity} accent="green" sub={sinImpresiones ? "Sin impresiones no se puede calcular" : undefined} />
        <Kpi title="Interacciones" value={fmt.fmtCompact(t.reactions + t.comments + t.shares)} icon={Sparkles} accent="rose" />
      </div>
      {topConImagen.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-1">Las publicaciones que más funcionaron</h3>
          <p className="text-[10px] text-muted-foreground mb-4">Tocá cualquiera para verla en la red</p>
          <PostGrid posts={topConImagen} fmt={fmt} />
        </Card>
      )}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4">Publicaciones con más interacción</h3>
        <RankedBars rows={top} color={PV_SLOTS[2]} fmtValue={(n) => fmt.fmtInt(n)} />
      </Card>
    </div>
  );
}

function PostsPublic({ posts, fmt }: { posts: OrganicPost[]; fmt: any }) {
  // Dos vistas: la grilla visual (lo que el cliente quiere ver) y el detalle
  // con el texto de cada publicación.
  const [vista, setVista] = useState<"grilla" | "detalle">("grilla");
  const ordenados = useMemo(
    () => [...posts].sort((a, b) => (b.reactions + b.comments + b.shares) - (a.reactions + a.comments + a.shares)),
    [posts],
  );
  const conImagen = ordenados.filter((p) => p.fullPicture);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-sm font-semibold">Publicaciones ({posts.length})</h3>
        <div className="inline-flex rounded-md border overflow-hidden text-[11px]">
          {(["grilla", "detalle"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`px-2.5 py-1 ${vista === v ? "bg-foreground text-background font-medium" : "hover:bg-muted"}`}
            >
              {v === "grilla" ? "Grilla" : "Detalle"}
            </button>
          ))}
        </div>
      </div>
      {posts.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">Sin publicaciones</p>
      ) : vista === "grilla" ? (
        <PostGrid posts={conImagen.slice(0, 24)} fmt={fmt} cols="md:grid-cols-4" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ordenados.slice(0, 12).map((p) => (
            <div key={p.id} className="border rounded-lg overflow-hidden">
              {p.fullPicture && (
                <div className="aspect-video">
                  <Thumb src={p.fullPicture} alt="" className="w-full h-full" />
                </div>
              )}
              <div className="p-3 space-y-1">
                <p className="text-xs line-clamp-3">{p.message || "(sin texto)"}</p>
                <div className="grid grid-cols-4 gap-2 text-[10px] pt-2 border-t">
                  <div><p className="text-muted-foreground">Reacs</p><p className="font-medium">{fmt.fmtInt(p.reactions)}</p></div>
                  <div><p className="text-muted-foreground">Com.</p><p className="font-medium">{fmt.fmtInt(p.comments)}</p></div>
                  <div><p className="text-muted-foreground">Shares</p><p className="font-medium">{fmt.fmtInt(p.shares)}</p></div>
                  <div><p className="text-muted-foreground">ER</p><p className="font-medium">{p.impressions > 0 ? fmt.fmtPct(p.engagementRate) : "—"}</p></div>
                </div>
                {p.permalinkUrl && (
                  <a href={p.permalinkUrl} target="_blank" rel="noreferrer noopener" className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    Ver en Meta <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LeadsPublic({ funnel, prevFunnel, fmt }: { funnel?: FunnelData; prevFunnel?: FunnelData; fmt: any }) {
  if (!funnel) return <Skeleton className="h-64 w-full" />;
  const stages = [
    { label: "Impresiones", value: funnel.impressions },
    { label: "Clics", value: funnel.clicks },
    { label: "Visitas a landing", value: funnel.landingVisits },
    { label: "Leads", value: funnel.leads },
    { label: "Ventas", value: funnel.conversions },
  ].filter((s, i) => s.value > 0 || i < 2 || i === 3);
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4">Embudo de conversión</h3>
        <FunnelViz stages={stages} fmtValue={(n) => fmt.fmtInt(n)} />
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="CTR" value={fmt.fmtPct(funnel.rates.ctr, 2)} icon={MousePointerClick} accent="blue"
          delta={<Delta curr={funnel.rates.ctr} prev={prevFunnel?.rates?.ctr ?? 0} goodWhen="up" />} />
        <Kpi title="Clic → Lead" value={fmt.fmtPct(funnel.rates.clickToLead, 2)} icon={Target} accent="violet" />
        <Kpi title="Lead → Venta" value={fmt.fmtPct(funnel.rates.leadToSale, 2)} icon={Target} accent="green" />
        <Kpi title="CPL" value={funnel.cpls.cpl > 0 ? fmt.fmtMoney(funnel.cpls.cpl) : "—"} icon={DollarSign} accent="amber"
          delta={<Delta curr={funnel.cpls.cpl} prev={prevFunnel?.cpls?.cpl ?? 0} goodWhen="down" />}
          sub={funnel.cpls.cpa > 0 ? `CPA ${fmt.fmtMoney(funnel.cpls.cpa)}` : undefined} />
      </div>
    </div>
  );
}
