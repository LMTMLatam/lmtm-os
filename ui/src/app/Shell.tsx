// LMTM: el marco de la app. Rediseño 20/11: oscuro con magenta y pantalla completa, con una barra lateral que se
// pliega a solo íconos (pedido de Naza: «sidebar desplegable, no los botones que hay ahora; más bonito y
// profesional, algo fullscreen»). Adentro de la barra: el buscador (Ctrl+K), lo de todos los días, los clientes
// fijados, lo de la agencia, y al pie los avisos, el tema y plegar. En el celular la barra sale como cajón.

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Building2, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun, X } from "lucide-react";
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
  const aprobar = useAprobaciones().total;
  // Lo que hay para decidir, por cliente: el punto de los fijados.
  const porCliente = new Map<string, number>();
  for (const d of [...(hoy.data?.incidentes ?? []), ...(hoy.data?.decisiones ?? [])]) porCliente.set(d.clienteSlug, (porCliente.get(d.clienteSlug) ?? 0) + 1);
  const porSeccion: Record<string, number | null> = {
    // Solo lo urgente (20/11): con las 110 decisiones abiertas el número no decía nada.
    "/decisiones": hoy.data ? hoy.data.incidentes.length + repartirHoy(hoy.data.decisiones, []).urgentes.length || null : null,
    "/aprobaciones": aprobar || null,
    "/agentes": corriendo.data?.trabajos.length || null,
  };
  return { porSeccion, porCliente };
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

/** Plegada o no: comodidad de cada persona, en su navegador; si no deja guardar, arranca desplegada. */
const CLAVE_PLEGADA = "lmtm.barra-plegada";
function usePlegada(): [boolean, (v: boolean) => void] {
  const [plegada, setPlegada] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_PLEGADA) === "1";
    } catch {
      return false;
    }
  });
  const cambiar = (v: boolean) => {
    setPlegada(v);
    try {
      localStorage.setItem(CLAVE_PLEGADA, v ? "1" : "0");
    } catch {
      /* sin almacenamiento: dura hasta recargar */
    }
  };
  return [plegada, cambiar];
}

const claseItem = (activo: boolean, plegada: boolean) =>
  `relative flex min-h-11 items-center gap-3 rounded-[10px] text-[14px] transition-colors ${plegada ? "justify-center px-0" : "px-3"} ${
    activo
      ? "bg-l-marca-suave font-semibold text-l-tinta before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-l-marca"
      : "font-medium text-l-tinta-2 hover:bg-l-sup hover:text-l-tinta"
  }`;

function Cuenta({ n, plegada }: { n: number | null | undefined; plegada: boolean }) {
  if (!n) return null;
  if (plegada) return <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-l-marca" aria-hidden />;
  return <span className="ml-auto rounded-full bg-l-linea-2 px-2 py-px text-[12px] font-semibold tabular-nums text-l-tinta">{n}</span>;
}

/** Sin `children` muestra la ruta hija (Outlet); con `children`, eso (LayoutSistema envuelve las pantallas de paperclip). */
export function Shell({ children }: { children?: ReactNode } = {}) {
  const { theme, toggleTheme } = useTheme();
  const { porSeccion, porCliente } = useContadores();
  const esAdmin = useEsAdmin();
  const [plegada, setPlegada] = usePlegada();
  const [cajon, setCajon] = useState(false);
  const [comandos, setComandos] = useState(false);
  const { pathname } = useLocation();
  // Las pantallas de paperclip llevan la empresa adelante (/LMTM/issues): se mira la ruta sin ella.
  const actual = seccionDe(pathname.replace(/^\/[A-Z][A-Z0-9]*(?=\/|$)/, ""));

  useEffect(() => {
    document.title = actual.label ? `${actual.label} · LMTM` : "LMTM";
  }, [actual.label]);
  // En el celular el cajón se cierra al navegar.
  useEffect(() => setCajon(false), [pathname]);

  const barra = (enCajon: boolean) => (
    <Barra
      plegada={enCajon ? false : plegada}
      enCajon={enCajon}
      actual={actual}
      porSeccion={porSeccion}
      porCliente={porCliente}
      esAdmin={esAdmin}
      oscuro={theme === "dark"}
      onTema={toggleTheme}
      onBuscar={() => setComandos(true)}
      onPlegar={() => (enCajon ? setCajon(false) : setPlegada(!plegada))}
    />
  );

  return (
    // El marco es su propio contenedor de scroll: el body tiene overflow hidden.
    <div className="lmtm flex h-dvh overflow-hidden" data-tema={theme === "dark" ? "oscuro" : "claro"}>
      {/* Escritorio: barra fija a la izquierda, de alto completo. */}
      <aside className={`hidden h-dvh shrink-0 border-r border-l-linea transition-[width] duration-200 md:block ${plegada ? "w-[76px]" : "w-[256px]"}`}>
        {barra(false)}
      </aside>

      {/* Celular: cajón. */}
      {cajon && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Cerrar el menú" onClick={() => setCajon(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] border-r border-l-linea bg-l-papel">{barra(true)}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-l-linea bg-l-papel/90 px-3 py-2 backdrop-blur md:hidden">
          <button type="button" onClick={() => setCajon(true)} aria-label="Abrir el menú" className="grid h-11 w-11 place-items-center rounded-[12px] text-l-tinta hover:bg-l-sup">
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <Link to="/hoy" className="text-[17px] font-bold text-l-tinta">
            LMTM <span className="text-l-marca">OS</span>
          </Link>
          <span className="flex-1" />
          <button type="button" onClick={() => setComandos(true)} aria-label="Buscar" className="grid h-11 w-11 place-items-center rounded-[12px] text-l-tinta hover:bg-l-sup">
            <Search className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <main className="min-w-0 flex-1 pb-10">
          <Suspense fallback={<p className="px-4 py-6 text-[14px] text-l-tinta-3 md:px-8" role="status">Cargando…</p>}>{children ?? <Outlet />}</Suspense>
        </main>
      </div>

      <Comandos abierto={comandos} onCambio={setComandos} esAdmin={esAdmin} />
    </div>
  );
}

function Barra(p: {
  plegada: boolean;
  enCajon: boolean;
  actual: ReturnType<typeof seccionDe>;
  porSeccion: Record<string, number | null>;
  porCliente: Map<string, number>;
  esAdmin: boolean;
  oscuro: boolean;
  onTema: () => void;
  onBuscar: () => void;
  onPlegar: () => void;
}) {
  const { plegada } = p;
  const fijados = useFijados();
  const agencia = AGENCIA.filter((s) => p.esAdmin || !s.soloAdmin);
  const titulo = (t: string) => (plegada ? t : undefined);
  return (
    <div className="flex h-full flex-col gap-1 overflow-y-auto px-3 py-4">
      <div className={`flex items-center pb-3 ${plegada ? "justify-center" : "justify-between px-2"}`}>
        <Link to="/hoy" className="text-[19px] font-bold tracking-[-0.01em] text-l-tinta" aria-label="LMTM OS, ir a Hoy">
          {plegada ? <span className="text-l-marca">L</span> : <>LMTM <span className="text-l-marca">OS</span></>}
        </Link>
        {p.enCajon && (
          <button type="button" onClick={p.onPlegar} aria-label="Cerrar el menú" className="grid h-10 w-10 place-items-center rounded-[10px] text-l-tinta-2 hover:bg-l-sup">
            <X className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={p.onBuscar}
        title={titulo("Buscar (Ctrl K)")}
        className={`mb-3 flex min-h-11 items-center gap-2.5 rounded-[12px] border border-l-linea-2 bg-l-sup/70 text-[13px] text-l-tinta-3 hover:border-l-marca ${plegada ? "justify-center" : "px-3"}`}
      >
        <Search className="h-[18px] w-[18px] shrink-0" aria-hidden />
        {plegada ? <span className="sr-only">Buscar</span> : <><span className="flex-1 text-left">Buscar</span><Tecla>Ctrl K</Tecla></>}
      </button>

      <nav className="flex flex-col gap-0.5" aria-label="Secciones">
        {PRINCIPALES.map(({ to, label, Icono, hijas }) => {
          const abierta = p.actual.madre?.to === to;
          return (
            <div key={to}>
              <NavLink to={to} title={titulo(label)} className={({ isActive }) => claseItem(isActive || abierta, plegada)}>
                <Icono className="h-[18px] w-[18px] shrink-0" aria-hidden />
                {plegada ? <span className="sr-only">{label}</span> : <span className="flex-1">{label}</span>}
                <Cuenta n={p.porSeccion[to]} plegada={plegada} />
              </NavLink>
              {abierta && hijas && !plegada && (
                <div className="mb-1 mt-0.5 flex flex-col gap-0.5 pl-9">
                  {hijas.map((h) => (
                    <NavLink
                      key={h.to}
                      to={h.to}
                      end
                      className={({ isActive }) => `flex min-h-9 items-center rounded-[8px] px-3 text-[13px] ${isActive ? "font-semibold text-l-tinta" : "text-l-tinta-3 hover:text-l-tinta"}`}
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

      {!plegada && (
        <>
          <p className="mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-l-tinta-3">Fijados</p>
          {fijados.lista.length === 0 ? (
            <p className="px-3 pt-1 text-[12px] leading-snug text-l-tinta-3">Fijá un cliente desde su ficha y queda acá.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-0.5">
              {fijados.lista.map((f) => {
                const n = p.porCliente.get(f.slug);
                return (
                  <li key={f.slug}>
                    <NavLink to={`/clientes/${f.slug}`} className={({ isActive }) => claseItem(isActive, false)}>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${n ? "bg-l-marca" : "bg-l-neutro"}`} aria-hidden />
                      <span className="flex-1 truncate">{f.nombre}</span>
                      {n ? <span className="sr-only">{n} para decidir</span> : null}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-l-tinta-3">Agencia</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {agencia.map((m) => (
              <li key={m.to}>
                <NavLink to={m.to} className={({ isActive }) => `flex min-h-9 items-center rounded-[8px] px-3 text-[13px] ${isActive ? "bg-l-marca-suave font-semibold text-l-tinta" : "text-l-tinta-2 hover:bg-l-sup hover:text-l-tinta"}`}>
                  {m.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </>
      )}
      {plegada && (
        <NavLink to="/config" title="Agencia y configuración" className={({ isActive }) => `${claseItem(isActive, true)} mt-3`}>
          <Building2 className="h-[18px] w-[18px]" aria-hidden />
          <span className="sr-only">Agencia y configuración</span>
        </NavLink>
      )}

      <div className={`mt-auto flex gap-1 border-t border-l-linea pt-3 ${plegada ? "flex-col items-center" : "items-center"}`}>
        <Link to="/avisos" title="Avisos" aria-label="Avisos" className="grid h-10 w-10 place-items-center rounded-[10px] text-l-tinta-2 hover:bg-l-sup hover:text-l-tinta">
          <Bell className="h-[18px] w-[18px]" aria-hidden />
        </Link>
        <button type="button" onClick={p.onTema} title={p.oscuro ? "Modo claro" : "Modo oscuro"} aria-label={p.oscuro ? "Pasar a modo claro" : "Pasar a modo oscuro"} className="grid h-10 w-10 place-items-center rounded-[10px] text-l-tinta-2 hover:bg-l-sup hover:text-l-tinta">
          {p.oscuro ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
        </button>
        {!p.enCajon && (
          <button
            type="button"
            onClick={p.onPlegar}
            title={plegada ? "Desplegar el menú" : "Plegar el menú"}
            aria-label={plegada ? "Desplegar el menú" : "Plegar el menú"}
            aria-expanded={!plegada}
            className={`grid h-10 w-10 place-items-center rounded-[10px] text-l-tinta-2 hover:bg-l-sup hover:text-l-tinta ${plegada ? "" : "ml-auto"}`}
          >
            {plegada ? <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden /> : <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden />}
          </button>
        )}
      </div>
    </div>
  );
}

/** Encabezado de una pantalla de la app: título, bajada y lo de la derecha. */
export function Encabezado({ titulo, bajada, derecha }: { titulo: ReactNode; bajada?: ReactNode; derecha?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 px-4 pb-5 pt-6 md:px-8 md:pt-8">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] md:text-[30px]">{titulo}</h1>
        {bajada && <div className="mt-1 text-[13px] text-l-tinta-3">{bajada}</div>}
      </div>
      {derecha && <div className="flex flex-wrap items-center gap-2">{derecha}</div>}
    </header>
  );
}
