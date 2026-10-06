// LMTM: la ficha del cliente en la app propia (fase C1). Encabezado y
// navegación nuevos; las secciones son las mismas de siempre (no se pierde
// ninguna, pedido del 06/10) más "Agentes": lo que investigaron de este
// cliente y pedirles algo.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, OctagonAlert, Send } from "lucide-react";
import { Link, useParams } from "@/lib/router";
import { clientsApi } from "../api/clients";
import { SelectorCliente } from "../components/SelectorCliente";
import { queryKeys } from "../lib/queryKeys";
import { haceCuanto } from "../lmtm/formato";
import { ClientResourcesPanel, TABS, TabContent, type Tab } from "../pages/ClientDashboard";
import { agentesApi, nombreRol, ROLES } from "./api";
import { EstadoPunto, HallazgoAgente, Tarjeta, TituloFranja } from "./HoyApp";
import { Encabezado } from "./Shell";

type Seccion = Tab | "agentes";

/** Orden de la ficha nueva: lo de decidir primero, lo de contenido después. */
const ORDEN: Seccion[] = ["resumen", "plan-accion", "dashboard", "agentes", "calendario", "ideas", "ganchos", "tendencias", "productos", "memoria", "competidores", "tasks"];
const NOMBRE: Partial<Record<Seccion, string>> = { dashboard: "Pauta", agentes: "Agentes", tasks: "Tareas", productos: "Marca", competidores: "Competencia" };

export function ClienteApp() {
  const { slug = "", seccion } = useParams<{ slug: string; seccion?: string }>();
  const activa: Seccion = (ORDEN.find((s) => s === seccion) ?? "resumen") as Seccion;
  const cliente = useQuery({ queryKey: queryKeys.clients.detail(slug), queryFn: () => clientsApi.get(slug), enabled: !!slug, retry: false });
  const ads = useQuery({ queryKey: queryKeys.clients.adsSummary(slug), queryFn: () => clientsApi.adsSummary(slug), enabled: !!slug, retry: false });
  const c = cliente.data;

  return (
    <>
      <Encabezado
        titulo={
          <span className="flex items-center gap-2">
            {c?.name ?? slug}
            {/* Saltar de cliente cayendo en la misma sección. */}
            <SelectorCliente slugActual={slug} tab={activa} />
          </span>
        }
        bajada={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link to="/clientes" className="inline-flex items-center gap-1 text-l-marca">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Clientes
            </Link>
            {c?.industry && <span>{c.industry}</span>}
            {c?.websiteUrl && (
              <a href={c.websiteUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-l-tinta">
                {c.websiteUrl.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </span>
        }
      />
      <div className="px-4 md:px-8">
        {cliente.isLoading && <p className="text-[14px] text-l-tinta-3">Cargando…</p>}
        {cliente.isError && (
          <p className="flex gap-1.5 text-[14px] text-l-critico-texto">
            <OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> No se encontró el cliente.
          </p>
        )}
        {c && (
          <>
            <ClientResourcesPanel client={c} />
            <nav className="sticky top-0 z-10 -mx-4 mt-5 overflow-x-auto border-b border-l-linea bg-l-papel/95 px-4 backdrop-blur md:-mx-8 md:px-8" aria-label="Secciones del cliente">
              <ul className="flex gap-1">
                {ORDEN.map((s) => {
                  const nombre = NOMBRE[s] ?? TABS.find((t) => t.value === s)?.label ?? s;
                  const activo = s === activa;
                  return (
                    <li key={s}>
                      <Link
                        to={`/clientes/${c.slug}/${s}`}
                        className={`-mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-[14px] transition-colors ${
                          activo ? "border-l-tinta font-semibold text-l-tinta" : "border-transparent text-l-tinta-3 hover:text-l-tinta"
                        }`}
                      >
                        {nombre}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="py-6">{activa === "agentes" ? <AgentesDelCliente clientId={c.id} /> : <TabContent tab={activa} client={c} ads={ads.data} />}</div>
          </>
        )}
      </div>
    </>
  );
}

function AgentesDelCliente({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lmtm", "agentes", "cliente", clientId], queryFn: () => agentesApi.trabajos({ clientId, limite: 50 }), refetchInterval: 20_000 });
  const [rol, setRol] = useState(Object.keys(ROLES)[0]);
  const [pedido, setPedido] = useState("");
  const pedir = useMutation({
    mutationFn: () => agentesApi.pedir({ rol, clientId, pedido }),
    onSuccess: () => {
      setPedido("");
      void qc.invalidateQueries({ queryKey: ["lmtm", "agentes"] });
    },
  });
  const ts = q.data?.trabajos ?? [];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        <TituloFranja>Lo que hicieron los agentes con este cliente</TituloFranja>
        {q.isLoading && <p className="text-[14px] text-l-tinta-3">Cargando…</p>}
        {q.data && ts.length === 0 && <p className="text-[14px] text-l-tinta-2">Todavía ningún agente trabajó este cliente en el runner nuevo.</p>}
        {ts.map((t) => (
          <Tarjeta key={t.id}>
            <div className="flex items-center gap-1.5 text-[12px] text-l-tinta-3">
              <EstadoPunto estado={t.estado} /> {nombreRol(t.rol)} · {haceCuanto(t.finishedAt ?? t.startedAt ?? t.createdAt)}
            </div>
            {t.estado === "hecho" ? (
              <HallazgoAgente t={t} />
            ) : (
              <p className="mt-1 text-[14px] text-l-tinta-2">{t.estado === "fallo" ? `No pudo terminar: ${t.error ?? ""}` : t.estado === "corriendo" ? "Trabajando…" : "En la cola"}</p>
            )}
          </Tarjeta>
        ))}
      </div>
      <Tarjeta className="self-start">
        <TituloFranja>Pedirle algo</TituloFranja>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            pedir.mutate();
          }}
        >
          <select value={rol} onChange={(e) => setRol(e.target.value)} className="h-10 w-full rounded-[10px] border border-l-linea-2 bg-l-sup px-2 text-[14px]">
            {Object.entries(ROLES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <textarea
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            rows={3}
            placeholder="Ej.: ¿por qué subió el costo por consulta esta semana?"
            className="w-full resize-y rounded-[10px] border border-l-linea-2 bg-l-sup px-3 py-2 text-[14px]"
          />
          <button
            type="submit"
            disabled={pedido.trim().length < 5 || pedir.isPending}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] bg-l-tinta px-3.5 text-[14px] font-semibold text-l-papel disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden /> {pedir.isPending ? "Mandando…" : "Pedir"}
          </button>
          {pedir.isSuccess && <p className="text-[13px] text-l-bien-texto">Quedó en la cola.</p>}
          {pedir.error && <p className="text-[13px] text-l-critico-texto">{pedir.error instanceof Error ? pedir.error.message : "No se pudo."}</p>}
        </form>
      </Tarjeta>
    </div>
  );
}
