import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi, type TriageCliente } from "../api/dashboard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PubvizTheme, Spark } from "@/components/pubviz";
import { activityApi } from "../api/activity";
import { accessApi } from "../api/access";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { buildCompanyUserProfileMap } from "../lib/company-members";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { MetricCard } from "../components/MetricCard";
import { EmptyState } from "../components/EmptyState";
import { StatusIcon } from "../components/StatusIcon";

import { ActivityRow } from "../components/ActivityRow";
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";
import { Bot, CircleDot, ShieldCheck, LayoutDashboard, PauseCircle, BellRing, Gavel } from "lucide-react";
import { clientsApi } from "../api/clients";
import { ActiveAgentsPanel } from "../components/ActiveAgentsPanel";
import { ChartCard, RunActivityChart, PriorityChart, IssueStatusChart, SuccessRateChart } from "../components/ActivityCharts";
import { PageSkeleton } from "../components/PageSkeleton";
import type { Agent, Issue } from "@paperclipai/shared";
import { PluginSlotOutlet } from "@/plugins/slots";

const DASHBOARD_ACTIVITY_LIMIT = 10;

// ============================================================
//   Centro de mando (6/8): apenas entrás sabés qué es urgente
//   y hacés clic para ir a resolverlo. Menos números sueltos,
//   más señal visual + acción directa.
// ============================================================
function SemaforoBar({ rojo, amarillo, verde }: { rojo: number; amarillo: number; verde: number }) {
  const total = Math.max(rojo + amarillo + verde, 1);
  const seg = [
    { n: rojo, c: "#d03b3b", l: "en rojo" },
    { n: amarillo, c: "#eda100", l: "en amarillo" },
    { n: verde, c: "#1baf7a", l: "en verde" },
  ];
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px]">
      {seg.map((s, i) => s.n > 0 && (
        <div key={i} title={`${s.n} ${s.l}`} style={{ width: `${(s.n / total) * 100}%`, background: s.c }} />
      ))}
    </div>
  );
}

function ClienteChip({ c, tono }: { c: TriageCliente; tono: "rojo" | "amarillo" }) {
  const color = tono === "rojo" ? "#d03b3b" : "#eda100";
  return (
    <Link
      to={`/c/${c.slug}/plan-accion`}
      className="block rounded-lg border p-2.5 no-underline text-inherit hover:bg-accent/40 transition-colors"
      style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)` }}
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-sm font-medium truncate flex-1">{c.name}</span>
        {c.salud != null && <span className="text-xs tabular-nums shrink-0" style={{ color }}>{c.salud}</span>}
      </div>
      {c.problemas[0] && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{c.problemas[0]}</p>}
    </Link>
  );
}

function CentroDeMando() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "accion"],
    queryFn: () => dashboardApi.accion(),
    staleTime: 2 * 60 * 1000,
  });
  const [tab, setTab] = useState<"rojo" | "amarillo">("rojo");

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data) return null;

  const { triage, humanas, alertas, serie } = data;
  const humanasTotal = data.humanasTotal ?? humanas.length;
  const criticas = alertas.filter((a) => a.severity === "critical");
  const lista = tab === "rojo" ? triage.rojo : triage.amarillo;
  const totalInv = serie.reduce((a, s) => a + s.spend, 0);
  const totalLeads = serie.reduce((a, s) => a + s.leads, 0);
  const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

  return (
    <div className="pv space-y-4">
      <PubvizTheme />

      {/* Fila 1: semáforo de cartera + pulso del negocio */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold">Estado de la cartera</h3>
              <p className="text-[11px] text-muted-foreground">Clic en un cliente para ir a su plan de acción</p>
            </div>
            <div className="flex gap-1">
              {(["rojo", "amarillo"] as const).map((t) => {
                const n = t === "rojo" ? triage.rojo.length : triage.amarillo.length;
                const activo = tab === t;
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full transition-colors inline-flex items-center gap-1.5",
                      activo ? "bg-foreground/10 font-semibold" : "text-muted-foreground hover:bg-foreground/5",
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: t === "rojo" ? "#d03b3b" : "#eda100" }} />
                    {n} {t === "rojo" ? "críticos" : "en riesgo"}
                  </button>
                );
              })}
              <span className="text-xs px-2.5 py-1 text-muted-foreground inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#1baf7a" }} />
                {triage.verdeCount} ok
              </span>
            </div>
          </div>
          <SemaforoBar rojo={triage.rojo.length} amarillo={triage.amarillo.length} verde={triage.verdeCount} />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 mt-3">
            {lista.length === 0
              ? <p className="text-xs text-muted-foreground py-4">Ningún cliente en este estado 🎉</p>
              : lista.slice(0, 9).map((c) => <ClienteChip key={c.clientId} c={c} tono={tab} />)}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold">Pulso de la cartera</h3>
          <p className="text-[11px] text-muted-foreground mb-3">Últimos 30 días · toda la agencia</p>
          <div className="space-y-3">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Inversión</span>
                <span className="text-lg font-bold">{fmtMoney(totalInv)}</span>
              </div>
              <Spark points={serie.map((s) => s.spend)} color="#2a78d6" id="dash-spend" height={40} />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Leads</span>
                <span className="text-lg font-bold">{totalLeads.toLocaleString("es-AR")}</span>
              </div>
              <Spark points={serie.map((s) => s.leads)} color="#1baf7a" id="dash-leads" height={40} />
            </div>
          </div>
        </Card>
      </div>

      {/* Fila 2: lo que espera a una PERSONA + alertas críticas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="rounded-lg bg-primary/15 p-1.5"><Gavel className="h-3.5 w-3.5 text-primary" /></span>
            <h3 className="text-sm font-semibold">Solo lo podés hacer vos</h3>
            <span className="text-xs text-muted-foreground">{humanasTotal}</span>
          </div>
          {humanas.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">Nada pendiente de tu lado 🎉</p>
          ) : (
            <div className="divide-y divide-border/60 -mx-1">
              {humanas.slice(0, 7).map((h) => (
                <Link
                  key={h.identifier ?? h.title}
                  to={`/issues/${h.identifier}`}
                  className="block px-1 py-2 text-sm no-underline text-inherit hover:bg-accent/40 rounded transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {(h.priority === "urgent" || h.priority === "high") && (
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#d03b3b" }} />
                    )}
                    <span className="truncate flex-1">{h.title.replace(/^\[HUMANO\]\s*/, "")}</span>
                    {h.diasParado != null && h.diasParado >= 3 && (
                      <span
                        className="text-[10px] tabular-nums shrink-0"
                        style={h.diasParado >= 21 ? { color: "#d03b3b" } : undefined}
                        title={`${h.diasParado} días esperando`}
                      >
                        {h.diasParado}d
                      </span>
                    )}
                    {h.clienteNombre && <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">{h.clienteNombre}</span>}
                  </div>
                  {/* Lo que dijo el agente al trabarse: sin esto la fila dice
                      "Reconectar página Meta" y no dice de qué cuenta. */}
                  {h.motivo && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 pl-0.5">{h.motivo}</p>}
                </Link>
              ))}
              {humanasTotal > 7 && (
                <p className="px-1 pt-2 text-[11px] text-muted-foreground">y {humanasTotal - 7} más esperando</p>
              )}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="rounded-lg p-1.5" style={{ background: "color-mix(in srgb, #d03b3b 15%, transparent)" }}>
              <BellRing className="h-3.5 w-3.5" style={{ color: "#d03b3b" }} />
            </span>
            <h3 className="text-sm font-semibold">Alertas sin resolver</h3>
            {criticas.length > 0 && <span className="text-xs font-medium" style={{ color: "#d03b3b" }}>{criticas.length} críticas</span>}
          </div>
          {alertas.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">Sin alertas abiertas 🎉</p>
          ) : (
            <div className="divide-y divide-border/60 -mx-1">
              {alertas.slice(0, 7).map((a) => (
                <Link
                  key={a.id}
                  to={a.clienteSlug ? `/c/${a.clienteSlug}/dashboard` : "/clients"}
                  className="flex items-center gap-2 px-1 py-2 text-sm no-underline text-inherit hover:bg-accent/40 rounded transition-colors"
                >
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: a.severity === "critical" ? "#d03b3b" : "#eda100" }} />
                  <span className="truncate flex-1">{a.title}</span>
                  {a.clienteNombre && <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">{a.clienteNombre}</span>}
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function getRecentIssues(issues: Issue[]): Issue[] {
  return [...issues]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function Dashboard() {
  const { selectedCompanyId, companies } = useCompany();
  const { openOnboarding } = useDialogActions();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [animatedActivityIds, setAnimatedActivityIds] = useState<Set<string>>(new Set());
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const hydratedActivityRef = useRef(false);
  const activityAnimationTimersRef = useRef<number[]>([]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Dashboard" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: activity } = useQuery({
    queryKey: [...queryKeys.activity(selectedCompanyId!), { limit: DASHBOARD_ACTIVITY_LIMIT }],
    queryFn: () => activityApi.list(selectedCompanyId!, { limit: DASHBOARD_ACTIVITY_LIMIT }),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: companyMembers } = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId!),
    queryFn: () => accessApi.listUserDirectory(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Alertas abiertas de la cartera de clientes (mismo feed que el grid de Clientes).
  const { data: clientAlerts } = useQuery({
    queryKey: ["clients", "alerts-summary"],
    queryFn: () => clientsApi.alertsSummary(),
    enabled: !!selectedCompanyId,
    staleTime: 2 * 60 * 1000,
  });
  const alertTotals = useMemo(() => {
    const vals = Object.values(clientAlerts ?? {});
    return {
      clients: vals.length,
      total: vals.reduce((a, v) => a + v.total, 0),
      critical: vals.reduce((a, v) => a + v.critical, 0),
    };
  }, [clientAlerts]);

  // Lo que espera una DECISIÓN humana: issues en revisión + bloqueados con
  // atención pedida. Es el trabajo del dueño del tablero, no ruido.
  const decisionQueue = useMemo(() => {
    const list = issues ?? [];
    const inReview = list.filter((i) => i.status === "in_review");
    const blockedAttention = list.filter((i) => i.status === "blocked" && i.blockerAttention);
    return [...inReview, ...blockedAttention]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 6);
  }, [issues]);

  const userProfileMap = useMemo(
    () => buildCompanyUserProfileMap(companyMembers?.users),
    [companyMembers?.users],
  );

  const recentIssues = issues ? getRecentIssues(issues) : [];
  const recentActivity = useMemo(() => (activity ?? []).slice(0, 10), [activity]);

  useEffect(() => {
    for (const timer of activityAnimationTimersRef.current) {
      window.clearTimeout(timer);
    }
    activityAnimationTimersRef.current = [];
    seenActivityIdsRef.current = new Set();
    hydratedActivityRef.current = false;
    setAnimatedActivityIds(new Set());
  }, [selectedCompanyId]);

  useEffect(() => {
    if (recentActivity.length === 0) return;

    const seen = seenActivityIdsRef.current;
    const currentIds = recentActivity.map((event) => event.id);

    if (!hydratedActivityRef.current) {
      for (const id of currentIds) seen.add(id);
      hydratedActivityRef.current = true;
      return;
    }

    const newIds = currentIds.filter((id) => !seen.has(id));
    if (newIds.length === 0) {
      for (const id of currentIds) seen.add(id);
      return;
    }

    setAnimatedActivityIds((prev) => {
      const next = new Set(prev);
      for (const id of newIds) next.add(id);
      return next;
    });

    for (const id of newIds) seen.add(id);

    const timer = window.setTimeout(() => {
      setAnimatedActivityIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.delete(id);
        return next;
      });
      activityAnimationTimersRef.current = activityAnimationTimersRef.current.filter((t) => t !== timer);
    }, 980);
    activityAnimationTimersRef.current.push(timer);
  }, [recentActivity]);

  useEffect(() => {
    return () => {
      for (const timer of activityAnimationTimersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const p of projects ?? []) map.set(`project:${p.id}`, p.name);
    return map;
  }, [issues, agents, projects]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message="Welcome to Paperclip. Set up your first company and agent to get started."
          action="Get Started"
          onAction={openOnboarding}
        />
      );
    }
    return (
      <EmptyState icon={LayoutDashboard} message="Create or select a company to view the dashboard." />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const hasNoAgents = agents !== undefined && agents.length === 0;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {hasNoAgents && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/60">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-900 dark:text-amber-100">
              You have no agents.
            </p>
          </div>
          <button
            onClick={() => openOnboarding({ initialStep: 2, companyId: selectedCompanyId! })}
            className="text-sm font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 underline underline-offset-2 shrink-0"
          >
            Create one here
          </button>
        </div>
      )}

      <ActiveAgentsPanel companyId={selectedCompanyId!} />

      {data && (
        <>
          {data.budgets.activeIncidents > 0 ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-red-500/20 bg-[linear-gradient(180deg,rgba(255,80,80,0.12),rgba(255,255,255,0.02))] px-4 py-3">
              <div className="flex items-start gap-2.5">
                <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                <div>
                  <p className="text-sm font-medium text-red-50">
                    {data.budgets.activeIncidents} active budget incident{data.budgets.activeIncidents === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-red-100/70">
                    {data.budgets.pausedAgents} agents paused · {data.budgets.pausedProjects} projects paused · {data.budgets.pendingApprovals} pending budget approvals
                  </p>
                </div>
              </div>
              <Link to="/costs" className="text-sm underline underline-offset-2 text-red-100">
                Open budgets
              </Link>
            </div>
          ) : null}

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3">
            <MetricCard
              icon={Bot}
              value={data.agents.active + data.agents.running + data.agents.paused + data.agents.error}
              label="Agentes"
              to="/agents"
              description={
                <span>
                  {data.agents.running} corriendo{", "}
                  {data.agents.paused} pausados{", "}
                  {data.agents.error} con error
                </span>
              }
            />
            <MetricCard
              icon={CircleDot}
              value={data.tasks.inProgress}
              label="Tareas en curso"
              to="/issues"
              description={
                <span>
                  {data.tasks.open} abiertas{", "}
                  {data.tasks.blocked} bloqueadas
                </span>
              }
            />
            <MetricCard
              icon={BellRing}
              value={alertTotals.total}
              label="Alertas de clientes"
              to="/clients"
              description={
                <span>
                  {alertTotals.critical > 0
                    ? `${alertTotals.critical} crítica${alertTotals.critical === 1 ? "" : "s"} · ${alertTotals.clients} cliente${alertTotals.clients === 1 ? "" : "s"}`
                    : alertTotals.total > 0
                      ? `${alertTotals.clients} cliente${alertTotals.clients === 1 ? "" : "s"} con avisos`
                      : "Cartera sin alertas abiertas"}
                </span>
              }
            />
            <MetricCard
              icon={ShieldCheck}
              value={data.pendingApprovals + data.budgets.pendingApprovals + decisionQueue.length}
              label="Esperan tu decisión"
              to={data.pendingApprovals + data.budgets.pendingApprovals > 0 ? "/approvals" : "/issues"}
              description={
                <span>
                  {data.pendingApprovals + data.budgets.pendingApprovals} aprobaciones · {decisionQueue.length} issues en revisión/bloqueados
                </span>
              }
            />
          </div>

          {/* Cola de decisiones: lo que el equipo humano tiene que destrabar HOY. */}
          {decisionQueue.length > 0 && (
            <div className="rounded-xl border border-primary/25 bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_55%)] p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="rounded-lg bg-primary/15 p-1.5"><Gavel className="h-3.5 w-3.5 text-primary" /></span>
                <h3 className="text-sm font-semibold">Necesita tu decisión</h3>
                <span className="text-xs text-muted-foreground">— en revisión o bloqueado esperando a un humano</span>
              </div>
              <div className="divide-y divide-border/60">
                {decisionQueue.map((issue) => (
                  <Link
                    key={issue.id}
                    to={`/issues/${issue.identifier ?? issue.id}`}
                    className="flex items-center gap-3 py-2 text-sm no-underline text-inherit hover:bg-accent/40 rounded-md px-2 -mx-2 transition-colors"
                  >
                    <StatusIcon status={issue.status} blockerAttention={issue.blockerAttention} />
                    <span className="font-mono text-xs text-muted-foreground shrink-0">{issue.identifier ?? issue.id.slice(0, 8)}</span>
                    <span className="truncate flex-1">{issue.title}</span>
                    {issue.assigneeAgentId && (() => {
                      const name = agentName(issue.assigneeAgentId);
                      return name ? <span className="hidden sm:inline-flex shrink-0"><Identity name={name} size="sm" /></span> : null;
                    })()}
                    <span className="text-xs text-muted-foreground shrink-0">{timeAgo(issue.updatedAt)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── Centro de mando (6/8): qué está urgente y dónde actuar ── */}
          <CentroDeMando />

          <details className="group">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground list-none select-none">
              ▸ Métricas del sistema (runs, prioridades, estados)
            </summary>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
              <ChartCard title="Run Activity" subtitle="Last 14 days">
                <RunActivityChart activity={data.runActivity} />
              </ChartCard>
              <ChartCard title="Issues by Priority" subtitle="Last 14 days">
                <PriorityChart issues={issues ?? []} />
              </ChartCard>
              <ChartCard title="Issues by Status" subtitle="Last 14 days">
                <IssueStatusChart issues={issues ?? []} />
              </ChartCard>
              <ChartCard title="Success Rate" subtitle="Last 14 days">
                <SuccessRateChart activity={data.runActivity} />
              </ChartCard>
            </div>
          </details>

          <PluginSlotOutlet
            slotTypes={["dashboardWidget"]}
            context={{ companyId: selectedCompanyId }}
            className="grid gap-4 md:grid-cols-2"
            itemClassName="rounded-lg border bg-card p-4 shadow-sm"
          />

          <div className="grid md:grid-cols-2 gap-4">
            {/* Recent Activity */}
            {recentActivity.length > 0 && (
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Recent Activity
                </h3>
                <div className="border border-border divide-y divide-border overflow-hidden">
                  {recentActivity.map((event) => (
                    <ActivityRow
                      key={event.id}
                      event={event}
                      agentMap={agentMap}
                      userProfileMap={userProfileMap}
                      entityNameMap={entityNameMap}
                      entityTitleMap={entityTitleMap}
                      className={animatedActivityIds.has(event.id) ? "activity-row-enter" : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Recent Tasks */}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Recent Tasks
              </h3>
              {recentIssues.length === 0 ? (
                <div className="border border-border p-4">
                  <p className="text-sm text-muted-foreground">No tasks yet.</p>
                </div>
              ) : (
                <div className="border border-border divide-y divide-border overflow-hidden">
                  {recentIssues.slice(0, 10).map((issue) => (
                    <Link
                      key={issue.id}
                      to={`/issues/${issue.identifier ?? issue.id}`}
                      className="px-4 py-3 text-sm cursor-pointer hover:bg-accent/50 transition-colors no-underline text-inherit block"
                    >
                      <div className="flex items-start gap-2 sm:items-center sm:gap-3">
                        {/* Status icon - left column on mobile */}
                        <span className="shrink-0 sm:hidden">
                          <StatusIcon status={issue.status} blockerAttention={issue.blockerAttention} />
                        </span>

                        {/* Right column on mobile: title + metadata stacked */}
                        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:contents">
                          <span className="line-clamp-2 text-sm sm:order-2 sm:flex-1 sm:min-w-0 sm:line-clamp-none sm:truncate">
                            {issue.title}
                          </span>
                          <span className="flex items-center gap-2 sm:order-1 sm:shrink-0">
                            <span className="hidden sm:inline-flex"><StatusIcon status={issue.status} blockerAttention={issue.blockerAttention} /></span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {issue.identifier ?? issue.id.slice(0, 8)}
                            </span>
                            {issue.assigneeAgentId && (() => {
                              const name = agentName(issue.assigneeAgentId);
                              return name
                                ? <span className="hidden sm:inline-flex"><Identity name={name} size="sm" /></span>
                                : null;
                            })()}
                            <span className="text-xs text-muted-foreground sm:hidden">&middot;</span>
                            <span className="text-xs text-muted-foreground shrink-0 sm:order-last">
                              {timeAgo(issue.updatedAt)}
                            </span>
                          </span>
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

        </>
      )}
    </div>
  );
}
