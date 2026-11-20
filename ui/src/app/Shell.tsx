// LMTM: el shell de la app propia. Rediseño 20/11 (maqueta aprobada): oscuro con
// magenta, riel con lo de todos los días, los clientes fijados y lo de la agencia;
// arriba el buscador (Ctrl+K) y los avisos. Celular: barra abajo con 5 secciones.

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Moon, Search, Sun } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "@/lib/router";
import { useTheme } from "../context/ThemeContext";
import { decisionesApi } from "../api/decisiones";
import { agentesApi } from "./api";
import { accessApi } from "../api/access";
import { AGENCIA, PRINCIPALES, seccionDe } from "../lmtm/secciones";
import { useFijados } from "../lmtm/fijados";
import { useAprobaciones } from "../lmtm/aprobaciones";
import { repartirHoy } from "../lmtm/hoy";
import { Comandos, Tecla } from "../lmtm/Comandos";

function useContadores() {
  const hoy = useQuery({ queryKey: ["lmtm", "hoy"], queryFn: () => decisionesApi.hoy(), staleTime: 60_000, refetchInterval: 5 * 60_000 });
  const corriendo = useQuery({
    queryKey: ["lmtm", "agentes", "corriendo"],
    queryFn: () => agentesApi.trabajos({ estado: "corriendo", limite: 50 }),
    refetchInterval: 60_000,
  });
  // Lo que hay para decidir, por cliente: el punto de los fijados.
  const porCliente = new Map<string, number>();
  for (const d of [...(hoy.data?.incidentes ?? []), ...(hoy.data?.decisiones ?? [])]) porCliente.set(d.clienteSlug, (porCliente.get(d.clienteSlug) ?? 0) + 1);
  return {
    porSeccion: {
      // Solo lo urgente (20/11): con las 110 decisiones abiertas el número no decía nada.
      "/hoy": hoy.data ? hoy.data.incidentes.length + repartirHoy(hoy.data.decisiones, []).urgentes.length || null : null,
      "/agentes": corriendo.data?.trabajos.length || null,
    } as Record<string, number | null>,
    porCliente,
  };
}

/**
 * ¿Ve lo de la agencia (finanzas, licitaciones, WhatsApp, config)? Dueños y
 * admins sí; el equipo invitado como operador o lector ve los clientes (16/10:
 * "hay licitaciones, finanzas, etc. que no van; deberían ver clientes"). El
 * servidor bloquea igual finanzas y licitaciones: esto solo ordena el menú.
 */
export function useEsAdmin(): boolean {
  const q = useQuery({ queryKey: ["lmtm", "yo"], queryFn: () => accessApi.getCurrentBoardAccess(), staleTime: 10 * 60_000 });
  const a = q.data;
  if (!a) return false;
  return a.source === "local_implicit" || a.isInstanceAdmin || (a.memberships ?? []).some((m) => m.status === "active" && (m.membershipRole === "owner" || m.membershipRole === "admin"));
}

const claseNav = (activo: boolean) =>
  `flex min-h-11 items-center gap-3 rounded-[12px] px-3 text-[14px] font-medium transition-colors ${
    activo ? "bg-[image:var(--l-marca-grad)] font-semibold text-l-marca-tinta shadow-[0_8px_28px_rgba(240,92,245,.3)]" : "text-l-tinta-2 hover:bg-l-sup hover:text-l-tinta"
  }`;

function Cuenta({ n, activo }: { n: number | null | undefined; activo?: boolean }) {
  if (!n) return null;
  return <span className={`ml-auto rounded-full px-2 py-px text-[12px] font-semibold tabular-nums ${activo ? "bg-black/15 text-l-marca-tinta" : "bg-l-linea-2 text-l-tinta"}`}>{n}</span>;
}

export function Shell() {
  const { theme, toggleTheme } = useTheme();
  const { porSeccion, porCliente } = useContadores();
  porSeccion["/aprobaciones"] = useAprobaciones().total || null;
  const esAdmin = useEsAdmin();
  const fijados = useFijados();
  const [comandos, setComandos] = useState(false);
  const { pathname } = useLocation();
  const actual = seccionDe(pathname);
  const agencia = AGENCIA.filter((s) => esAdmin || !s.soloAdmin);

  useEffect(() => {
    document.title = actual.label ? `${actual.label} · LMTM` : "LMTM";
  }, [actual.label]);

  return (
    // El shell es su propio contenedor de scroll: el body de paperclip tiene
    // overflow hidden (su layout scrollea adentro) y sin esto la página no bajaba.
    <div className="lmtm h-dvh overflow-y-auto" data-tema={theme === "dark" ? "oscuro" : "claro"}>
      <div className="mx-auto flex min-h-dvh max-w-[1520px]">
        {/* Riel (escritorio) */}
        <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col overflow-y-auto px-4 py-6 md:flex">
          <Link to="/hoy" className="px-3 pb-6 text-[20px] font-bold tracking-[-0.01em] text-l-tinta">
            LMTM <span className="text-l-marca">OS</span>
          </Link>
          <nav className="flex flex-col gap-1" aria-label="Secciones">
            {PRINCIPALES.map(({ to, label, Icono, hijas }) => {
              const abierta = actual.madre?.to === to;
              return (
                <div key={to}>
                  <NavLink to={to} className={({ isActive }) => claseNav(isActive || abierta)}>
                    <Icono className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    <span className="flex-1">{label}</span>
                    <Cuenta n={porSeccion[to]} activo={abierta || pathname.startsWith(to)} />
                  </NavLink>
                  {abierta && hijas && (
                    <div className="mt-1 flex flex-col gap-0.5 pl-9">
                      {hijas.map((h) => (
                        <NavLink
                          key={h.to}
                          to={h.to}
                          end
                          className={({ isActive }) => `flex min-h-9 items-center rounded-[10px] px-3 text-[13px] ${isActive ? "bg-l-marca-suave font-semibold text-l-tinta" : "text-l-tinta-2 hover:text-l-tinta"}`}
                        >
                          {h.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="mt-6 px-3 text-[13px] font-semibold text-l-tinta">Fijados</div>
          {fijados.lista.length === 0 ? (
            <p className="mt-1 px-3 text-[12px] leading-snug text-l-tinta-3">Fijá un cliente desde su ficha y queda acá.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-0.5">
              {fijados.lista.map((f) => {
                const n = porCliente.get(f.slug);
                return (
                  <li key={f.slug}>
                    <NavLink to={`/clientes/${f.slug}`} className={({ isActive }) => claseNav(isActive)}>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${n ? "bg-l-marca" : "bg-l-neutro"}`} aria-hidden />
                      <span className="flex-1 truncate">{f.nombre}</span>
                      <Cuenta n={n} />
                      {n ? <span className="sr-only">{n} para decidir</span> : null}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-6 px-3 text-[13px] font-semibold text-l-tinta">Agencia</div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {agencia.map((m) => (
              <li key={m.to}>
                <NavLink to={m.to} className={({ isActive }) => `flex min-h-9 items-center rounded-[10px] px-3 text-[13px] ${isActive ? "bg-l-marca-suave font-semibold text-l-tinta" : "text-l-tinta-2 hover:bg-l-sup hover:text-l-tinta"}`}>
                  {m.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </aside>

        <main className="min-w-0 flex-1 pb-24 md:pb-10">
          <BarraSuperior onBuscar={() => setComandos(true)} oscuro={theme === "dark"} onTema={toggleTheme} />
          <Suspense fallback={<p className="px-4 py-6 text-[14px] text-l-tinta-3 md:px-8" role="status">Cargando…</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Barra (celular) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-l-linea bg-l-papel/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur md:hidden"
        aria-label="Secciones"
      >
        {/* En el celular va lo de tomar acción; Pauta queda en el Ctrl+K y en cada cliente. */}
        {PRINCIPALES.filter((s) => s.to !== "/pauta").map(({ to, label, Icono }) => (
          <NavLink
            key={to}
            to={to}
            className={() => `relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${actual.madre?.to === to ? "font-semibold text-l-marca" : "text-l-tinta-3"}`}
          >
            <Icono className="h-5 w-5" aria-hidden />
            {label}
            {porSeccion[to] != null && (
              <span className="absolute right-[calc(50%-22px)] top-1.5 min-w-4 rounded-full bg-l-marca px-1 text-center text-[10px] font-semibold leading-4 text-l-marca-tinta">
                {porSeccion[to]}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <Comandos abierto={comandos} onCambio={setComandos} esAdmin={esAdmin} />
    </div>
  );
}

function BarraSuperior({ onBuscar, oscuro, onTema }: { onBuscar: () => void; oscuro: boolean; onTema: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4 md:px-8 md:pt-6">
      <button
        type="button"
        onClick={onBuscar}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[14px] border border-l-linea-2 bg-l-sup/80 px-3.5 text-left text-[14px] text-l-tinta-3 hover:border-l-marca sm:max-w-[440px]"
      >
        <Search className="h-[18px] w-[18px] shrink-0" aria-hidden />
        <span className="flex-1 truncate">Buscar cliente, sección o acción</span>
        <span className="hidden sm:inline">
          <Tecla>Ctrl K</Tecla>
        </span>
      </button>
      <span className="flex-1" />
      <Link to="/avisos" aria-label="Avisos" className="grid h-12 w-12 place-items-center rounded-[14px] border border-l-linea-2 bg-l-sup/80 text-l-tinta hover:border-l-marca">
        <Bell className="h-[18px] w-[18px]" aria-hidden />
      </Link>
      <BotonTema oscuro={oscuro} onClick={onTema} />
    </div>
  );
}

export function BotonTema({ oscuro, onClick }: { oscuro: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-12 w-12 place-items-center rounded-[14px] border border-l-linea-2 bg-l-sup/80 text-l-tinta hover:border-l-marca"
      aria-label={oscuro ? "Pasar a modo claro" : "Pasar a modo oscuro"}
    >
      {oscuro ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}

/** Encabezado de una pantalla de la app: título, bajada y lo de la derecha. */
export function Encabezado({ titulo, bajada, derecha }: { titulo: ReactNode; bajada?: ReactNode; derecha?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 px-4 pb-5 pt-6 md:px-8">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] md:text-[30px]">{titulo}</h1>
        {bajada && <div className="mt-1 text-[13px] text-l-tinta-3">{bajada}</div>}
      </div>
      {derecha && <div className="flex flex-wrap items-center gap-2">{derecha}</div>}
    </header>
  );
}
