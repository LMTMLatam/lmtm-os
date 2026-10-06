import {
  Inbox,
  CircleDot,
  Target,
  LayoutDashboard,
  Sun,
  Megaphone,
  DollarSign,
  History,
  Search,
  SquarePen,
  Network,
  Boxes,
  Repeat,
  GitBranch,
  Settings,
  Building2,
  Wallet,
  MessageCircle,
  Brain,
  TrendingUp,
  Layers,
  Gavel,
  ClipboardCheck,
  Clapperboard,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "@/lib/router";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarAgents } from "./SidebarAgents";
import { useDialogActions } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { heartbeatsApi } from "../api/heartbeats";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { useSeccionAbierta } from "../hooks/useSeccionAbierta";
import { Button } from "@/components/ui/button";
import { PluginSlotOutlet } from "@/plugins/slots";
import { SidebarCompanyMenu } from "./SidebarCompanyMenu";

/**
 * EL SIDEBAR TENÍA 22 PUERTAS.
 *
 * La sección "Company" sola llevaba 15 ítems planos, y arriba había otros 7.
 * Nadie decide nada con 22 puertas: el panel se volvió un índice de todo lo que
 * el sistema puede hacer en vez de un lugar donde ver qué hay que hacer hoy.
 *
 * Queda así:
 *   · 6 destinos siempre visibles — los que se usan todos los días
 *   · todo el resto adentro de dos grupos colapsados: "Más" (negocio) y
 *     "Sistema" (el harness de agentes, que no es lo que mira el equipo)
 *
 * NO se borró ninguna ruta: todo sigue llegando al mismo lugar, sólo cambia
 * cuántas cosas compiten por la atención al abrir el panel.
 *
 * Por qué 6 y no 5: Bandeja queda afuera del grupo colapsado porque es la
 * ÚNICA entrada con indicador de error (corridas fallidas). Esconder el único
 * semáforo rojo detrás de un click es justo la clase de decisión que después se
 * paga con una cuenta caída que nadie vio.
 */
export function Sidebar() {
  const { openNewIssue } = useDialogActions();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const inboxBadge = useInboxBadge(selectedCompanyId);
  const [masAbierto, setMasAbierto] = useSeccionAbierta("sidebar:mas", false);
  const [sistemaAbierto, setSistemaAbierto] = useSeccionAbierta("sidebar:sistema", false);
  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;
  const showWorkspacesLink = experimentalSettings?.enableIsolatedWorkspaces === true;

  const pluginContext = {
    companyId: selectedCompanyId,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  return (
    <aside className="w-full h-full min-h-0 border-r border-border bg-background flex flex-col">
      {/* Top bar: Company name (bold) + Search — aligned with top sections (no visible border) */}
      <div className="flex items-center gap-1 px-3 h-12 shrink-0">
        <SidebarCompanyMenu />
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground shrink-0"
          aria-label="Buscar"
          title="Buscar"
        >
          <NavLink to="/search">
            <Search className="h-4 w-4" />
          </NavLink>
        </Button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-4 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {/* New Issue button aligned with nav items */}
          <button
            onClick={() => openNewIssue()}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <SquarePen className="h-4 w-4 shrink-0" />
            <span className="truncate">Nuevo issue</span>
          </button>

          {/* Los 6 de todos los días. "Hoy" es la pantalla para decidir
              (rediseño B2): incidentes arriba, decisiones por plata, un botón
              cada una. El tablero viejo pasa a "Operación", en Sistema. */}
          <SidebarNavItem to="/hoy" label="Hoy" icon={Sun} />
          <SidebarNavItem
            to="/inbox"
            label="Bandeja"
            icon={Inbox}
            badge={inboxBadge.inbox}
            badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
            alert={inboxBadge.failedRuns > 0}
          />
          {/* "Clientes" es la Cartera (B3): todos por plata en riesgo y contra
              su objetivo. Las fichas viejas siguen en "Más". */}
          <SidebarNavItem to="/cartera" label="Clientes" icon={Building2} />
          {/* Operación (la pantalla de Nazareno, PLAN §5) vuelve arriba en el lugar
              de Pauta, que se retiró en B4. */}
          <SidebarNavItem to="/dashboard" label="Operación" icon={LayoutDashboard} liveCount={liveRunCount} />
          <SidebarNavItem to="/paid-media" label="Pauta" icon={Megaphone} />
          <SidebarNavItem to="/contenido" label="Contenido" icon={Clapperboard} />
          <SidebarNavItem to="/company/settings" label="Config" icon={Settings} />

          <PluginSlotOutlet
            slotTypes={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-[13px] font-medium"
            missingBehavior="placeholder"
          />
        </div>

        {/* Negocio, pero no de todos los días. Cerrado por defecto. */}
        <SidebarSection label="Más" collapsible={{ open: masAbierto, onOpenChange: setMasAbierto }}>
          <SidebarNavItem to="/clients" label="Fichas de clientes" icon={Building2} />
          <SidebarNavItem to="/intelligence" label="Centro de Inteligencia" icon={Brain} />
          <SidebarNavItem to="/growth" label="Growth" icon={TrendingUp} />
          <SidebarNavItem to="/readiness" label="Readiness" icon={ClipboardCheck} />
          <SidebarNavItem to="/niches" label="Nichos" icon={Layers} />
          <SidebarNavItem to="/licitaciones" label="Licitaciones" icon={Gavel} />
          <SidebarNavItem to="/finance" label="Finanzas" icon={Wallet} />
          <SidebarNavItem to="/whatsapp" label="WhatsApp" icon={MessageCircle} />
          <SidebarNavItem to="/costs" label="Costos" icon={DollarSign} />
          <SidebarNavItem to="/activity" label="Actividad" icon={History} />
        </SidebarSection>

        {/* El harness de agentes. Es la maquinaria, no el trabajo de la agencia:
            el equipo no necesita verla para hacer su día. */}
        <SidebarSection
          label="Sistema"
          collapsible={{ open: sistemaAbierto, onOpenChange: setSistemaAbierto }}
        >
          <SidebarNavItem to="/issues" label="Issues" icon={CircleDot} />
          <SidebarNavItem to="/routines" label="Rutinas" icon={Repeat} />
          <SidebarNavItem to="/goals" label="Objetivos" icon={Target} />
          {showWorkspacesLink ? (
            <SidebarNavItem to="/workspaces" label="Workspaces" icon={GitBranch} />
          ) : null}
          <SidebarNavItem to="/skills" label="Skills" icon={Boxes} />
          <SidebarNavItem to="/org" label="Org" icon={Network} />
          <SidebarProjects />
          <SidebarAgents />
        </SidebarSection>

        <PluginSlotOutlet
          slotTypes={["sidebarPanel"]}
          context={pluginContext}
          className="flex flex-col gap-3"
          itemClassName="rounded-lg border border-border p-3"
          missingBehavior="placeholder"
        />
      </nav>
    </aside>
  );
}
