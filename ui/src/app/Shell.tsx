// LMTM: el shell de la app propia (fase C1). Navegación nuestra, sin la barra,
// el selector de empresa ni el organigrama de paperclip. Lo de paperclip queda
// bajo "Sistema" hasta el retiro.
//
// Escritorio: riel a la izquierda. Celular: barra abajo con las 4 secciones.

import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Inbox, Moon, Settings2, Sun, Users, Wrench } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "@/lib/router";
import { useTheme } from "../context/ThemeContext";
import { decisionesApi } from "../api/decisiones";
import { agentesApi } from "./api";

const SECCIONES = [
  { to: "/hoy", label: "Hoy", Icono: Inbox },
  { to: "/clientes", label: "Clientes", Icono: Users },
  { to: "/agentes", label: "Agentes", Icono: Bot },
  { to: "/config", label: "Config", Icono: Settings2 },
] as const;

/** Las demás pantallas propias: viven en el shell, con su diseño de antes hasta rehacerlas. */
export const MAS = [
  { to: "/semaforo", label: "Semáforo de clientes" },
  { to: "/pauta", label: "Pauta" },
  { to: "/contenido", label: "Contenido" },
  { to: "/inteligencia", label: "Inteligencia" },
  { to: "/licitaciones", label: "Licitaciones" },
  { to: "/finanzas", label: "Finanzas" },
  { to: "/whatsapp", label: "WhatsApp" },
] as const;

/** Margen de una pantalla de antes montada en el shell (traen su propio encabezado). */
export function Pagina({ children }: { children: ReactNode }) {
  return <div className="px-4 pb-10 pt-6 md:px-8">{children}</div>;
}

function useContadores() {
  const hoy = useQuery({ queryKey: ["lmtm", "hoy"], queryFn: () => decisionesApi.hoy(), staleTime: 60_000, refetchInterval: 5 * 60_000 });
  const corriendo = useQuery({
    queryKey: ["lmtm", "agentes", "corriendo"],
    queryFn: () => agentesApi.trabajos({ estado: "corriendo", limite: 50 }),
    refetchInterval: 30_000,
  });
  return {
    "/hoy": hoy.data ? hoy.data.incidentes.length + hoy.data.decisiones.length : null,
    "/agentes": corriendo.data?.trabajos.length || null,
  } as Record<string, number | null>;
}

export function Shell() {
  const { theme, toggleTheme } = useTheme();
  const contadores = useContadores();
  const { pathname } = useLocation();
  useEffect(() => {
    const s = [...SECCIONES, ...MAS].find((x) => pathname.startsWith(x.to));
    document.title = s ? `${s.label} · LMTM` : "LMTM";
  }, [pathname]);
  return (
    // El shell es su propio contenedor de scroll: el body de paperclip tiene
    // overflow hidden (su layout scrollea adentro) y sin esto la página no bajaba.
    <div className="lmtm h-dvh overflow-y-auto" data-tema={theme === "dark" ? "oscuro" : "claro"}>
      <div className="mx-auto flex min-h-dvh max-w-[1440px]">
        {/* Riel (escritorio) */}
        <aside className="sticky top-0 hidden h-dvh w-[220px] shrink-0 flex-col border-r border-l-linea px-3 py-5 md:flex">
          <div className="px-2 pb-6 text-[17px] font-semibold tracking-[-0.01em]">
            <span className="text-l-marca">LMTM</span>
          </div>
          <nav className="flex flex-col gap-0.5" aria-label="Secciones">
            {SECCIONES.map(({ to, label, Icono }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex min-h-10 items-center gap-2.5 rounded-[10px] px-2.5 text-[14px] transition-colors ${
                    isActive ? "bg-l-marca-suave font-semibold text-l-marca" : "text-l-tinta-2 hover:bg-l-sup hover:text-l-tinta"
                  }`
                }
              >
                <Icono className="h-[18px] w-[18px]" aria-hidden />
                <span className="flex-1">{label}</span>
                {contadores[to] != null && <span className="text-[12px] tabular-nums text-l-tinta-3">{contadores[to]}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="mt-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-l-tinta-3">Más</div>
          <ul className="mt-1.5 flex flex-col">
            {MAS.map((m) => (
              <li key={m.to}>
                <NavLink
                  to={m.to}
                  className={({ isActive }) =>
                    `flex min-h-8 items-center rounded-[8px] px-2.5 text-[13px] ${isActive ? "bg-l-marca-suave font-semibold text-l-marca" : "text-l-tinta-2 hover:bg-l-sup hover:text-l-tinta"}`
                  }
                >
                  {m.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex items-center gap-1 px-1 pt-4">
            <Link
              to="/dashboard"
              className="flex min-h-9 flex-1 items-center gap-2 rounded-[8px] px-1.5 text-[13px] text-l-tinta-3 hover:text-l-tinta"
              title="Lo de paperclip (issues, proyectos, organigrama) hasta el retiro"
            >
              <Wrench className="h-4 w-4" aria-hidden /> Sistema
            </Link>
            <BotonTema oscuro={theme === "dark"} onClick={toggleTheme} />
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-24 md:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Barra (celular) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-l-linea bg-l-papel/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur md:hidden"
        aria-label="Secciones"
      >
        {SECCIONES.map(({ to, label, Icono }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${isActive ? "font-semibold text-l-marca" : "text-l-tinta-3"}`}
          >
            <Icono className="h-5 w-5" aria-hidden />
            {label}
            {contadores[to] != null && (
              <span className="absolute right-[calc(50%-22px)] top-1.5 min-w-4 rounded-full bg-l-tinta px-1 text-center text-[10px] font-semibold leading-4 text-l-papel">
                {contadores[to]}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function BotonTema({ oscuro, onClick }: { oscuro: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-[8px] text-l-tinta-3 hover:bg-l-sup hover:text-l-tinta"
      aria-label={oscuro ? "Pasar a modo claro" : "Pasar a modo oscuro"}
    >
      {oscuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/** Encabezado de una pantalla de la app: título, bajada y lo de la derecha. */
export function Encabezado({ titulo, bajada, derecha }: { titulo: ReactNode; bajada?: ReactNode; derecha?: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 px-4 pb-5 pt-6 md:px-8 md:pt-8">
      <div className="min-w-0">
        <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] md:text-[28px]">{titulo}</h1>
        {bajada && <div className="mt-1 text-[13px] text-l-tinta-3">{bajada}</div>}
      </div>
      <div className="flex items-center gap-2">
        {derecha}
        <span className="md:hidden">
          <BotonTema oscuro={theme === "dark"} onClick={toggleTheme} />
        </span>
      </div>
    </header>
  );
}
