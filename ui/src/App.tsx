import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Layout } from "./components/Layout";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { CloudAccessGate } from "./components/CloudAccessGate";
import { Dashboard } from "./pages/Dashboard";
import { DashboardLive } from "./pages/DashboardLive";
import { Companies } from "./pages/Companies";
import { Finance } from "./pages/Finance";
import { ConnectAds } from "./pages/ConnectAds";
import { PublicDashboard } from "./pages/PublicDashboard";
import { PublicDashboardDetalle } from "./pages/PublicDashboardDetalle";
import { PaidMediaHub } from "./pages/PaidMediaHub";
import { Agents } from "./pages/Agents";
import { AgentDetail } from "./pages/AgentDetail";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { ProjectWorkspaceDetail } from "./pages/ProjectWorkspaceDetail";
import { Workspaces } from "./pages/Workspaces";
import { Issues } from "./pages/Issues";
import { Search } from "./pages/Search";
import { IssueDetail } from "./pages/IssueDetail";
import { IssueChatLongThreadPerf } from "./pages/IssueChatLongThreadPerf";
import { Routines } from "./pages/Routines";
import { RoutineDetail } from "./pages/RoutineDetail";
import { UserProfile } from "./pages/UserProfile";
import { ExecutionWorkspaceDetail } from "./pages/ExecutionWorkspaceDetail";
import { Goals } from "./pages/Goals";
import { GoalDetail } from "./pages/GoalDetail";
import { Approvals } from "./pages/Approvals";
import { ApprovalDetail } from "./pages/ApprovalDetail";
import { Costs } from "./pages/Costs";
import { Activity } from "./pages/Activity";
import { Inbox } from "./pages/Inbox";
import { CompanySettings } from "./pages/CompanySettings";
import { CompanyEnvironments } from "./pages/CompanyEnvironments";
import { CompanyAccess } from "./pages/CompanyAccess";
import { CompanyInvites } from "./pages/CompanyInvites";
import { CompanySkills } from "./pages/CompanySkills";
import { AdsIntegrations } from "./pages/AdsIntegrations";
import { WhatsApp } from "./pages/WhatsApp";
import { Intelligence } from "./pages/Intelligence";
import { Growth } from "./pages/Growth";
import { Niches } from "./pages/Niches";
import { Licitaciones } from "./pages/Licitaciones";
import { Readiness } from "./pages/Readiness";
import { Contenido } from "./pages/Contenido";
import { Secrets } from "./pages/Secrets";
import { CompanyExport } from "./pages/CompanyExport";
import { CompanyImport } from "./pages/CompanyImport";
import { DesignGuide } from "./pages/DesignGuide";
import { InstanceGeneralSettings } from "./pages/InstanceGeneralSettings";
import { InstanceAccess } from "./pages/InstanceAccess";
import { InstanceSettings } from "./pages/InstanceSettings";
import { InstanceExperimentalSettings } from "./pages/InstanceExperimentalSettings";
import { ProfileSettings } from "./pages/ProfileSettings";
import { PluginManager } from "./pages/PluginManager";
import { PluginSettings } from "./pages/PluginSettings";
import { AdapterManager } from "./pages/AdapterManager";
import { PluginPage } from "./pages/PluginPage";
import { OrgChart } from "./pages/OrgChart";
import { NewAgent } from "./pages/NewAgent";
import { AuthPage } from "./pages/Auth";
import { BoardClaimPage } from "./pages/BoardClaim";
import { CliAuthPage } from "./pages/CliAuth";
import { InviteLandingPage } from "./pages/InviteLanding";
import { JoinRequestQueue } from "./pages/JoinRequestQueue";
import { NotFoundPage } from "./pages/NotFound";
import { Shell } from "./app/Shell";
import { HoyApp } from "./app/HoyApp";
import { ClientesApp } from "./app/ClientesApp";
import { ClienteApp } from "./app/ClienteApp";
import { AgentesApp } from "./app/AgentesApp";
import { ConfigApp } from "./app/ConfigApp";
import { Pagina } from "./app/Shell";
import { useCompany } from "./context/CompanyContext";
import { useDialogActions } from "./context/DialogContext";
import { loadLastInboxTab } from "./lib/inbox";
import { shouldRedirectCompanylessRouteToOnboarding } from "./lib/onboarding-route";

function boardRoutes() {
  return (
    <>
      {/* La portada es Hoy de la app propia (fase C1). */}
      <Route index element={<Navigate to="/hoy" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="dashboard/live" element={<DashboardLive />} />
      <Route path="onboarding" element={<OnboardingRoutePage />} />
      <Route path="companies" element={<Companies />} />
      <Route path="clients" element={<Navigate to="/clientes" replace />} />
      {/* Pauta, Finanzas, WhatsApp, Inteligencia, Semáforo, Licitaciones y
          Contenido viven en la app propia (fase C1): los links viejos con
          prefijo (y /videos, que está en comentarios de ClickUp) caen ahí. */}
      <Route path="paid-media" element={<Navigate to="/pauta" replace />} />
      <Route path="finance" element={<Navigate to="/finanzas" replace />} />
      <Route path="whatsapp" element={<Navigate to="/whatsapp" replace />} />
      <Route path="intelligence" element={<Navigate to="/inteligencia" replace />} />
      <Route path="growth" element={<Navigate to="/semaforo" replace />} />
      <Route path="niches" element={<Niches />} />
      <Route path="licitaciones" element={<Navigate to="/licitaciones" replace />} />
      <Route path="readiness" element={<Readiness />} />
      <Route path="contenido" element={<Navigate to="/contenido" replace />} />
      <Route path="videos" element={<Navigate to="/contenido" replace />} />
      {/* Competencia global se unificó: cliente→tab Competidores, agregado→Nichos (pedido 18/7) */}
      <Route path="competitors" element={<Navigate to="../niches" replace />} />
      {/* También existe top-level; acá cubre los links con prefijo de company
          (ej. el redirect del OAuth de Meta a /lmtm/connect-ads). */}
      <Route path="connect-ads" element={<ConnectAds />} />
      {/* La ficha vive en la app propia: los links viejos (/LMTM/c/x) caen ahí. */}
      <Route path="c/:slug" element={<AFichaNueva />} />
      <Route path="c/:slug/:tab" element={<AFichaNueva />} />
      <Route path="company/settings" element={<CompanySettings />} />
      <Route path="company/settings/environments" element={<CompanyEnvironments />} />
      <Route path="company/settings/access" element={<CompanyAccess />} />
      <Route path="company/settings/invites" element={<CompanyInvites />} />
      <Route path="company/export/*" element={<CompanyExport />} />
      <Route path="company/import" element={<CompanyImport />} />
      <Route path="company/settings/secrets" element={<Secrets />} />
      <Route path="company/settings/integrations/ads" element={<AdsIntegrations />} />
      <Route path="skills/*" element={<CompanySkills />} />
      <Route path="settings" element={<LegacySettingsRedirect />} />
      <Route path="settings/*" element={<LegacySettingsRedirect />} />
      <Route path="plugins/:pluginId" element={<PluginPage />} />
      <Route path="org" element={<OrgChart />} />
      <Route path="agents" element={<Navigate to="/agents/all" replace />} />
      <Route path="agents/all" element={<Agents />} />
      <Route path="agents/active" element={<Agents />} />
      <Route path="agents/paused" element={<Agents />} />
      <Route path="agents/error" element={<Agents />} />
      <Route path="agents/new" element={<NewAgent />} />
      <Route path="agents/:agentId" element={<AgentDetail />} />
      <Route path="agents/:agentId/:tab" element={<AgentDetail />} />
      <Route path="agents/:agentId/runs/:runId" element={<AgentDetail />} />
      <Route path="projects" element={<Projects />} />
      <Route path="projects/:projectId" element={<ProjectDetail />} />
      <Route path="projects/:projectId/overview" element={<ProjectDetail />} />
      <Route path="projects/:projectId/issues" element={<ProjectDetail />} />
      <Route path="projects/:projectId/issues/:filter" element={<ProjectDetail />} />
      <Route path="projects/:projectId/workspaces/:workspaceId" element={<ProjectWorkspaceDetail />} />
      <Route path="projects/:projectId/workspaces" element={<ProjectDetail />} />
      <Route path="projects/:projectId/configuration" element={<ProjectDetail />} />
      <Route path="projects/:projectId/budget" element={<ProjectDetail />} />
      <Route path="workspaces" element={<Workspaces />} />
      <Route path="issues" element={<Issues />} />
      <Route path="search" element={<Search />} />
      <Route path="issues/all" element={<Navigate to="/issues" replace />} />
      <Route path="issues/active" element={<Navigate to="/issues" replace />} />
      <Route path="issues/backlog" element={<Navigate to="/issues" replace />} />
      <Route path="issues/done" element={<Navigate to="/issues" replace />} />
      <Route path="issues/recent" element={<Navigate to="/issues" replace />} />
      <Route path="issues/:issueId" element={<IssueDetail />} />
      {import.meta.env.DEV ? (
        <Route path="tests/perf/long-thread" element={<IssueChatLongThreadPerf />} />
      ) : null}
      <Route path="routines" element={<Routines />} />
      <Route path="routines/:routineId" element={<RoutineDetail />} />
      <Route path="execution-workspaces/:workspaceId" element={<ExecutionWorkspaceDetail />} />
      <Route path="execution-workspaces/:workspaceId/services" element={<ExecutionWorkspaceDetail />} />
      <Route path="execution-workspaces/:workspaceId/configuration" element={<ExecutionWorkspaceDetail />} />
      <Route path="execution-workspaces/:workspaceId/runtime-logs" element={<ExecutionWorkspaceDetail />} />
      <Route path="execution-workspaces/:workspaceId/issues" element={<ExecutionWorkspaceDetail />} />
      <Route path="execution-workspaces/:workspaceId/routines" element={<ExecutionWorkspaceDetail />} />
      <Route path="goals" element={<Goals />} />
      <Route path="goals/:goalId" element={<GoalDetail />} />
      <Route path="approvals" element={<Navigate to="/approvals/pending" replace />} />
      <Route path="approvals/pending" element={<Approvals />} />
      <Route path="approvals/all" element={<Approvals />} />
      <Route path="approvals/:approvalId" element={<ApprovalDetail />} />
      <Route path="costs" element={<Costs />} />
      <Route path="activity" element={<Activity />} />
      <Route path="inbox" element={<InboxRootRedirect />} />
      <Route path="inbox/mine" element={<Inbox />} />
      <Route path="inbox/recent" element={<Inbox />} />
      <Route path="inbox/unread" element={<Inbox />} />
      <Route path="inbox/all" element={<Inbox />} />
      <Route path="inbox/requests" element={<JoinRequestQueue />} />
      <Route path="inbox/new" element={<Navigate to="/inbox/mine" replace />} />
      <Route path="u/:userSlug" element={<UserProfile />} />
      {/* La guía de componentes de Paperclip es para quien desarrolla (B4). */}
      {import.meta.env.DEV ? <Route path="design-guide" element={<DesignGuide />} /> : null}
      <Route path="instance/settings/adapters" element={<AdapterManager />} />
      <Route path=":pluginRoutePath/*" element={<PluginPage />} />
      <Route path="*" element={<NotFoundPage scope="board" />} />
    </>
  );
}

function InboxRootRedirect() {
  return <Navigate to={`/inbox/${loadLastInboxTab()}`} replace />;
}

function LegacySettingsRedirect() {
  const location = useLocation();
  return <Navigate to={`/instance/settings/general${location.search}${location.hash}`} replace />;
}

function OnboardingRoutePage() {
  const { companies } = useCompany();
  const { openOnboarding } = useDialogActions();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();
  const matchedCompany = companyPrefix
    ? companies.find((company) => company.issuePrefix.toUpperCase() === companyPrefix.toUpperCase()) ?? null
    : null;

  const title = matchedCompany
    ? `Add another agent to ${matchedCompany.name}`
    : companies.length > 0
      ? "Create another company"
      : "Create your first company";
  const description = matchedCompany
    ? "Run onboarding again to add an agent and a starter task for this company."
    : companies.length > 0
      ? "Run onboarding again to create another company and seed its first agent."
      : "Get started by creating a company and your first agent.";

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-4">
          <Button
            onClick={() =>
              matchedCompany
                ? openOnboarding({ initialStep: 2, companyId: matchedCompany.id })
                : openOnboarding()
            }
          >
            {matchedCompany ? "Add Agent" : "Start Onboarding"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function UnprefixedBoardRedirect() {
  const location = useLocation();
  const { companies, selectedCompany, loading } = useCompany();

  if (loading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    if (
      shouldRedirectCompanylessRouteToOnboarding({
        pathname: location.pathname,
        hasCompanies: false,
      })
    ) {
      return <Navigate to="/onboarding" replace />;
    }
    return <NoCompaniesStartPage />;
  }

  return (
    <Navigate
      to={`/${targetCompany.issuePrefix}${location.pathname}${location.search}${location.hash}`}
      replace
    />
  );
}

function NoCompaniesStartPage() {
  const { openOnboarding } = useDialogActions();

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Create your first company</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Get started by creating a company.
        </p>
        <div className="mt-4">
          <Button onClick={() => openOnboarding()}>New Company</Button>
        </div>
      </div>
    </div>
  );
}

/** Los links viejos a la ficha (/c/x/tab, con o sin prefijo) abren la ficha nueva. */
function AFichaNueva() {
  const { slug, tab } = useParams<{ slug: string; tab?: string }>();
  return <Navigate to={`/clientes/${slug}${tab ? `/${tab}` : ""}`} replace />;
}

function PublicDashboardPrefixRedirect() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/public/dashboards/${slug}`} replace />;
}

export function App() {
  return (
    <>
      <Routes>
        <Route path="auth" element={<AuthPage />} />
        <Route path="board-claim/:token" element={<BoardClaimPage />} />
        <Route path="cli-auth/:id" element={<CliAuthPage />} />
        <Route path="invite/:token" element={<InviteLandingPage />} />
        {/* Fixture de performance: solo en desarrollo (B4). Antes se abría en
            producción sin login, antes de la compuerta de acceso. */}
        {import.meta.env.DEV ? <Route path="tests/perf/long-thread" element={<IssueChatLongThreadPerf />} /> : null}
        <Route path="connect-ads" element={<ConnectAds />} />
        <Route path="public/dashboards/:slug" element={<PublicDashboard />} />
        {/* El panel viejo, como "ver el detalle" del informe (B3), hasta B4. */}
        <Route path="public/dashboards/:slug/detalle" element={<PublicDashboardDetalle />} />
        {/* Links públicos pegados/abiertos con el prefijo de empresa adelante
            (/LMTM/public/dashboards/x) daban Page-not-found — redirigir. */}
        <Route path=":prefix/public/dashboards/:slug" element={<PublicDashboardPrefixRedirect />} />

        <Route element={<CloudAccessGate />}>
          <Route index element={<Navigate to="/hoy" replace />} />
          <Route path="onboarding" element={<OnboardingRoutePage />} />
          <Route path="instance" element={<Navigate to="/instance/settings/general" replace />} />
          <Route path="instance/settings" element={<Layout />}>
            <Route index element={<Navigate to="general" replace />} />
            <Route path="profile" element={<ProfileSettings />} />
            <Route path="general" element={<InstanceGeneralSettings />} />
            <Route path="access" element={<InstanceAccess />} />
            <Route path="heartbeats" element={<InstanceSettings />} />
            <Route path="experimental" element={<InstanceExperimentalSettings />} />
            <Route path="plugins" element={<PluginManager />} />
            <Route path="plugins/:pluginId" element={<PluginSettings />} />
            <Route path="adapters" element={<AdapterManager />} />
          </Route>
          {/* Unprefixed → company-prefixed redirects. INVARIANT: every top-level
              board page in boardRoutes() that a link or the Sidebar can point at
              without a company prefix must have a matching entry here, or it
              falls through to the ":companyPrefix" catch-all below and renders
              "Company not found" (the segment gets read as a company prefix).
              When you add a board page, add it here AND in the Sidebar. */}
          <Route path="companies" element={<UnprefixedBoardRedirect />} />
          {/* La app propia de LMTM (fase C1): shell y pantallas nuestras. */}
          <Route element={<Shell />}>
            <Route path="hoy" element={<HoyApp />} />
            <Route path="clientes" element={<ClientesApp />} />
            <Route path="clientes/:slug" element={<ClienteApp />} />
            <Route path="clientes/:slug/:seccion" element={<ClienteApp />} />
            <Route path="agentes" element={<AgentesApp />} />
            <Route path="agentes/:id" element={<AgentesApp />} />
            <Route path="config" element={<ConfigApp />} />
            <Route path="semaforo" element={<Pagina><Growth /></Pagina>} />
            <Route path="pauta" element={<Pagina><PaidMediaHub /></Pagina>} />
            <Route path="contenido" element={<Pagina><Contenido /></Pagina>} />
            <Route path="inteligencia" element={<Pagina><Intelligence /></Pagina>} />
            <Route path="licitaciones" element={<Pagina><Licitaciones /></Pagina>} />
            <Route path="finanzas" element={<Pagina><Finance /></Pagina>} />
            <Route path="whatsapp" element={<Pagina><WhatsApp /></Pagina>} />
          </Route>
          <Route path="cartera" element={<Navigate to="/clientes" replace />} />
          <Route path="dashboard" element={<UnprefixedBoardRedirect />} />
          <Route path="dashboard/live" element={<UnprefixedBoardRedirect />} />
          <Route path="clients" element={<Navigate to="/clientes" replace />} />
          <Route path="finance" element={<Navigate to="/finanzas" replace />} />
          <Route path="intelligence" element={<Navigate to="/inteligencia" replace />} />
          <Route path="growth" element={<Navigate to="/semaforo" replace />} />
          <Route path="niches" element={<UnprefixedBoardRedirect />} />
          <Route path="readiness" element={<UnprefixedBoardRedirect />} />
          <Route path="videos" element={<Navigate to="/contenido" replace />} />
          <Route path="competitors" element={<UnprefixedBoardRedirect />} />
          <Route path="c/:slug" element={<AFichaNueva />} />
          <Route path="c/:slug/:tab" element={<AFichaNueva />} />
          <Route path="company/settings" element={<UnprefixedBoardRedirect />} />
          <Route path="company/settings/*" element={<UnprefixedBoardRedirect />} />
          <Route path="company/export" element={<UnprefixedBoardRedirect />} />
          <Route path="company/export/*" element={<UnprefixedBoardRedirect />} />
          <Route path="company/import" element={<UnprefixedBoardRedirect />} />
          <Route path="org" element={<UnprefixedBoardRedirect />} />
          <Route path="search" element={<UnprefixedBoardRedirect />} />
          <Route path="goals" element={<UnprefixedBoardRedirect />} />
          <Route path="goals/:goalId" element={<UnprefixedBoardRedirect />} />
          <Route path="approvals" element={<UnprefixedBoardRedirect />} />
          <Route path="approvals/pending" element={<UnprefixedBoardRedirect />} />
          <Route path="approvals/all" element={<UnprefixedBoardRedirect />} />
          <Route path="approvals/:approvalId" element={<UnprefixedBoardRedirect />} />
          <Route path="costs" element={<UnprefixedBoardRedirect />} />
          <Route path="activity" element={<UnprefixedBoardRedirect />} />
          <Route path="inbox" element={<UnprefixedBoardRedirect />} />
          <Route path="inbox/:tab" element={<UnprefixedBoardRedirect />} />
          <Route path="design-guide" element={<UnprefixedBoardRedirect />} />
          <Route path="plugins/:pluginId" element={<UnprefixedBoardRedirect />} />
          <Route path="issues" element={<UnprefixedBoardRedirect />} />
          <Route path="issues/:issueId" element={<UnprefixedBoardRedirect />} />
          <Route path="routines" element={<UnprefixedBoardRedirect />} />
          <Route path="routines/:routineId" element={<UnprefixedBoardRedirect />} />
          <Route path="u/:userSlug" element={<UnprefixedBoardRedirect />} />
          <Route path="skills/*" element={<UnprefixedBoardRedirect />} />
          <Route path="settings" element={<LegacySettingsRedirect />} />
          <Route path="settings/*" element={<LegacySettingsRedirect />} />
          <Route path="agents" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/all" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/active" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/paused" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/error" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/new" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/:agentId" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/:agentId/:tab" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/:agentId/runs/:runId" element={<UnprefixedBoardRedirect />} />
          <Route path="projects" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/overview" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/issues" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/issues/:filter" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/workspaces" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/workspaces/:workspaceId" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/configuration" element={<UnprefixedBoardRedirect />} />
          <Route path="workspaces" element={<UnprefixedBoardRedirect />} />
          <Route path="execution-workspaces/:workspaceId" element={<UnprefixedBoardRedirect />} />
          <Route path="execution-workspaces/:workspaceId/services" element={<UnprefixedBoardRedirect />} />
          <Route path="execution-workspaces/:workspaceId/configuration" element={<UnprefixedBoardRedirect />} />
          <Route path="execution-workspaces/:workspaceId/runtime-logs" element={<UnprefixedBoardRedirect />} />
          <Route path="execution-workspaces/:workspaceId/issues" element={<UnprefixedBoardRedirect />} />
          <Route path="execution-workspaces/:workspaceId/routines" element={<UnprefixedBoardRedirect />} />
          {/* Hoy va sin la barra de paperclip: es una pantalla para el
              celular, con el sistema de diseño de LMTM (skill lmtm-diseno). */}
          <Route path=":companyPrefix/hoy" element={<Navigate to="/hoy" replace />} />
          <Route path=":companyPrefix/cartera" element={<Navigate to="/clientes" replace />} />
          <Route path=":companyPrefix" element={<Layout />}>
            {boardRoutes()}
          </Route>
          <Route path="*" element={<NotFoundPage scope="global" />} />
        </Route>
      </Routes>
      <OnboardingWizard />
    </>
  );
}
