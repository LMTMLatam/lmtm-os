// LMTM: el marco para las pantallas que todavía vienen de paperclip (tareas de los
// agentes, rutinas, equipo e invitaciones, secretos, skills, ajustes de la instancia).
// Pedido de Naza 20/11: «todavía viven cosas de paperclip: borrá lo viejo». Antes se
// abrían con su propio menú (Nuevo issue, Bandeja, Operación, SISTEMA); ahora van
// adentro del riel y el tema de la app. De paperclip queda solo lo que esas pantallas
// necesitan para andar: la empresa elegida según la ruta, los diálogos, los avisos y el
// panel de propiedades de una tarea.

import { useEffect, useMemo } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { GeneralSettingsProvider } from "../context/GeneralSettingsContext";
import { shouldSyncCompanySelectionFromRoute } from "../lib/company-selection";
import { NewIssueDialog } from "../components/NewIssueDialog";
import { NewProjectDialog } from "../components/NewProjectDialog";
import { NewGoalDialog } from "../components/NewGoalDialog";
import { NewAgentDialog } from "../components/NewAgentDialog";
import { PropertiesPanel } from "../components/PropertiesPanel";
import { ToastViewport } from "../components/ToastViewport";
import { Shell } from "./Shell";
import { NoExiste } from "./NoExiste";

export function LayoutSistema() {
  const { companies, loading, selectedCompany, selectedCompanyId, selectionSource, setSelectedCompanyId } = useCompany();
  const { companyPrefix } = useParams<{ companyPrefix: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const empresa = useMemo(
    () => (companyPrefix ? companies.find((c) => c.issuePrefix.toUpperCase() === companyPrefix.toUpperCase()) ?? null : null),
    [companies, companyPrefix],
  );
  const prefijoDesconocido = Boolean(companyPrefix) && !loading && companies.length > 0 && !empresa;

  // La empresa de la ruta pasa a ser la elegida (lo mismo que hacía el layout de paperclip).
  useEffect(() => {
    if (!companyPrefix || loading || !empresa) return;
    if (companyPrefix !== empresa.issuePrefix) {
      navigate(`/${empresa.issuePrefix}${location.pathname.replace(/^\/[^/]+/, "")}${location.search}`, { replace: true });
      return;
    }
    if (shouldSyncCompanySelectionFromRoute({ selectionSource, selectedCompanyId, routeCompanyId: empresa.id })) {
      setSelectedCompanyId(empresa.id, { source: "route_sync" });
    }
  }, [companyPrefix, empresa, loading, location.pathname, location.search, navigate, selectionSource, selectedCompanyId, setSelectedCompanyId]);

  const respaldo = selectedCompany ?? companies[0] ?? null;
  return (
    <Shell>
      <GeneralSettingsProvider value={{ keyboardShortcutsEnabled: false }}>
        <div className="flex min-w-0">
          <div className="min-w-0 flex-1 px-4 pb-10 md:px-8">
            <TituloSistema />
            {prefijoDesconocido ? (
              // El «prefijo» desconocido casi siempre es una ruta escrita sin la empresa (/licitaciones): se reintenta
              // bajo la empresa por defecto; si tampoco existe, el catch-all muestra «Esta página no existe».
              respaldo ? <Navigate to={`/${respaldo.issuePrefix}${location.pathname}${location.search}${location.hash}`} replace /> : <NoExiste />
            ) : (
              <Outlet />
            )}
          </div>
          <PropertiesPanel />
        </div>
        <NewIssueDialog />
        <NewProjectDialog />
        <NewGoalDialog />
        <NewAgentDialog />
        <ToastViewport />
      </GeneralSettingsProvider>
    </Shell>
  );
}

/** Los títulos que ponen las páginas de paperclip, en castellano (el contenido de adentro sigue como está). */
const TITULOS: Record<string, string> = {
  Issues: "Tareas de los agentes", Routines: "Rutinas de los agentes", Skills: "Skills de los agentes", Costs: "Costos de los agentes",
  Secrets: "Claves y secretos", Settings: "Ajustes", "Instance Settings": "Ajustes del sistema", General: "General", Access: "Accesos",
  Invites: "Invitaciones", "Join Requests": "Pedidos para sumarse", Plugins: "Plugins", Profile: "Mi perfil", Heartbeats: "Latidos",
  Experimental: "Experimental", Agents: "Agentes", Runs: "Corridas", "Recent Runs": "Corridas recientes", Configuration: "Configuración",
  Instructions: "Instrucciones", Budget: "Presupuesto", Dashboard: "Inicio", Users: "Usuarios", Search: "Buscar", Export: "Exportar",
  Import: "Importar", "New Agent": "Nuevo agente", Inbox: "Bandeja", Workspaces: "Espacios de trabajo", "Runtime logs": "Registro",
  Services: "Servicios", Status: "Estado", Approvals: "Aprobaciones", Projects: "Proyectos", "Not Found": "No existe",
};
const traducir = (t: string) => TITULOS[t] ?? t;

/** El título de la pantalla, armado con las migas que pone cada página de paperclip. */
function TituloSistema() {
  const { breadcrumbs } = useBreadcrumbs();
  if (breadcrumbs.length === 0) return <div className="pt-6" />;
  const anteriores = breadcrumbs.slice(0, -1);
  const actual = breadcrumbs[breadcrumbs.length - 1];
  return (
    <header className="pb-5 pt-6">
      {anteriores.length > 0 && (
        <nav className="mb-1 flex flex-wrap items-center gap-1.5 text-[13px] text-l-tinta-3" aria-label="Dónde estás">
          {anteriores.map((b, i) => (
            <span key={`${b.label}-${i}`} className="flex items-center gap-1.5">
              {b.href ? <Link to={b.href} className="hover:text-l-marca">{traducir(b.label)}</Link> : <span>{traducir(b.label)}</span>}
              <span aria-hidden>›</span>
            </span>
          ))}
        </nav>
      )}
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] md:text-[30px]">{traducir(actual.label)}</h1>
    </header>
  );
}
