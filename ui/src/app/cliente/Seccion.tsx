// LMTM: qué se muestra en cada sección de la ficha del cliente (rediseño 20/11).
// Antes era pages/ClientDashboard.tsx, 2.103 líneas con las 12 secciones adentro;
// ahora cada una es su archivo y baja recién cuando se abre.

import { lazy } from "react";
import { useNavigate } from "@/lib/router";
import type { Client, ClientAdsSummary } from "../../api/clients";
import { ResumenCliente } from "../../lmtm/ResumenCliente";

const de = <K extends string>(carga: () => Promise<Record<K, React.ComponentType<any>>>, nombre: K) => lazy(() => carga().then((m) => ({ default: m[nombre] })));
const PlanAccionTab = de(() => import("./PlanAccion"), "PlanAccionTab");
const PaidMediaTab = de(() => import("./Pauta"), "PaidMediaTab");
const WebTab = de(() => import("@/components/WebTab"), "WebTab");
const CalendarTab = de(() => import("./Calendario"), "CalendarTab");
const SuperRedesTab = de(() => import("./SuperRedes"), "SuperRedesTab");
const GanchosTab = de(() => import("./Ganchos"), "GanchosTab");
const TendenciasTab = de(() => import("./Tendencias"), "TendenciasTab");
const ProductosTab = de(() => import("@/components/ProductosTab"), "ProductosTab");
const MemoriaTab = de(() => import("./Memoria"), "MemoriaTab");
const CompetidoresTab = de(() => import("./Competencia"), "CompetidoresTab");
const TasksTab = de(() => import("./Tareas"), "TasksTab");

/** Las secciones que vienen de la ficha vieja; «agentes» y «que-funciona» las arma ClienteApp. */
export type Tab = "resumen" | "plan-accion" | "tasks" | "calendario" | "dashboard" | "productos" | "ideas" | "ganchos" | "tendencias" | "memoria" | "competidores" | "web";

export function TabContent({ tab, client, ads }: { tab: Tab; client: Client; ads?: ClientAdsSummary }) {
  const navigate = useNavigate();
  switch (tab) {
    case "resumen":
      return <ResumenCliente clientId={client.id} onCalendario={() => navigate(`/clientes/${client.slug}/calendario`)} />;
    case "plan-accion":
      return <PlanAccionTab client={client} />;
    case "dashboard":
      return <PaidMediaTab client={client} ads={ads} />;
    case "web":
      return <WebTab clientSlug={client.slug} clientId={client.id} />;
    case "calendario":
      return <CalendarTab client={client} />;
    case "ideas":
      return <SuperRedesTab client={client} />;
    case "ganchos":
      return <GanchosTab client={client} />;
    case "tendencias":
      return <TendenciasTab client={client} />;
    case "productos":
      return <ProductosTab clientSlug={client.slug} />;
    case "memoria":
      return <MemoriaTab client={client} />;
    case "competidores":
      return <CompetidoresTab client={client} />;
    case "tasks":
      return <TasksTab client={client} />;
  }
}
