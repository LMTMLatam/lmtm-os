// LMTM: la ficha del cliente. Rediseño 20/11 (maqueta aprobada): encabezado con el
// estado del cliente en cuatro tarjetas, la barra de acciones siempre a mano y las 14
// secciones de siempre agrupadas en 5 (Resumen, Pauta, Contenido, Marca, Trabajo).
// No se perdió ninguna sección; los links viejos (/clientes/x/ganchos) siguen andando.

import { Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clapperboard, ExternalLink, FileText, OctagonAlert, Pin, Send } from "lucide-react";
import { useFijados } from "../lmtm/fijados";
import { Link, useParams } from "@/lib/router";
import { api } from "../api/client";
import { clientsApi, type Client, type ClientAdsSummary } from "../api/clients";
import { clientesApi } from "../api/informes";
import { SelectorCliente } from "../components/SelectorCliente";
import { queryKeys } from "../lib/queryKeys";
import { haceCuanto, pesos } from "../lmtm/formato";
import { EstadoObjetivoMarca } from "../lmtm/componentes";
import { ScrollLateral } from "../lmtm/ScrollLateral";
import { GRUPOS_CLIENTE, SECCIONES_CLIENTE } from "../lmtm/secciones";
import { ShareDialog } from "../pages/PaidMediaDashboard";
import { TabContent, type Tab } from "./cliente/Seccion";
import { diasDeSaldo, recursosDe } from "./cliente/estado";
import { agentesApi, nombreRol, ROLES } from "./api";
import { EstadoPunto, Tarjeta, TituloFranja } from "./HoyApp";
import { QueFuncionaCliente } from "./QueFunciona";
import { TrabajoDelCliente } from "./Trabajo";

type Seccion = Tab | "agentes" | "que-funciona";

export function ClienteApp() {
  const { slug = "", seccion } = useParams<{ slug: string; seccion?: string }>();
  const activa = (SECCIONES_CLIENTE.find((s) => s.id === seccion)?.id ?? "resumen") as Seccion;
  const cliente = useQuery({ queryKey: queryKeys.clients.detail(slug), queryFn: () => clientsApi.get(slug), enabled: !!slug, retry: false });
  const ads = useQuery({ queryKey: queryKeys.clients.adsSummary(slug), queryFn: () => clientsApi.adsSummary(slug), enabled: !!slug, retry: false });
  const c = cliente.data;

  return (
    <div className="px-4 pb-6 pt-6 md:px-8">
      <EncabezadoCliente slug={slug} c={c} activa={activa} />
      {cliente.isLoading && <p className="text-[14px] text-l-tinta-3" role="status">Cargando…</p>}
      {cliente.isError && (
        <p className="flex gap-1.5 text-[14px] text-l-critico-texto" role="alert">
          <OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> No se encontró el cliente.
        </p>
      )}
      {c && (
        <>
          <TarjetasEstado c={c} ads={ads.data} />
          <MenuCliente slug={c.slug} activa={activa} />
          <div className="mt-5 min-w-0">
            <Suspense fallback={<p className="text-[14px] text-l-tinta-3" role="status">Cargando la sección…</p>}>
              {activa === "agentes" ? <AgentesDelCliente clientId={c.id} /> : activa === "que-funciona" ? <QueFuncionaCliente clientId={c.id} /> : <TabContent tab={activa} client={c} ads={ads.data} />}
            </Suspense>
          </div>
        </>
      )}
    </div>
  );
}

const claseAccion = "inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-l-linea-2 bg-l-sup/60 px-4 text-[14px] font-medium text-l-tinta hover:border-l-marca";

function EncabezadoCliente({ slug, c, activa }: { slug: string; c?: Client; activa: Seccion }) {
  return (
    <header className="mb-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-l-tinta-3">
        <Link to="/clientes" className="inline-flex items-center gap-1 text-l-marca">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Clientes
        </Link>
        {c?.industry && <span>{c.industry}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] md:text-[30px]">{c?.name ?? slug}</h1>
        {/* Saltar de cliente cayendo en la misma sección. */}
        <SelectorCliente slugActual={slug} tab={activa} />
        {c && <BotonFijar slug={c.slug} nombre={c.name.trim()} />}
      </div>
      {c && <BarraAcciones c={c} />}
    </header>
  );
}

/** Lo de todos los días con un cliente, siempre a mano: pedir, producir, compartir y sus recursos de afuera. */
function BarraAcciones({ c }: { c: Client }) {
  const resumen = useQuery({ queryKey: ["lmtm", "cliente", c.id], queryFn: () => clientesApi.resumen(c.id), staleTime: 60_000 });
  const informe = resumen.data?.linkPublico;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link to={`/clientes/${c.slug}/agentes`} className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-[image:var(--l-marca-grad)] px-4 text-[14px] font-semibold text-l-marca-tinta">
        <Send className="h-4 w-4" aria-hidden /> Pedir a un agente
      </Link>
      <Link to="/contenido" className={claseAccion}>
        <Clapperboard className="h-4 w-4" aria-hidden /> Nueva pieza
      </Link>
      {informe && (
        <a href={informe} target="_blank" rel="noreferrer noopener" className={claseAccion}>
          <FileText className="h-4 w-4" aria-hidden /> Informe
        </a>
      )}
      {/* Compartir el dashboard con el cliente: el mismo diálogo de Pauta (link, prender y apagar). */}
      <ShareDialog client={c} />
      <span className="mx-1 hidden h-6 w-px bg-l-linea-2 sm:block" aria-hidden />
      {/* En el celular, los recursos en una sola fila que se desliza (antes ocupaban tres renglones). */}
      <div className="-mx-1 flex w-full gap-0 overflow-x-auto [scrollbar-width:none] sm:mx-0 sm:w-auto sm:flex-wrap">
      {recursosDe(c).map((r) =>
        r.url ? (
          <a key={r.nombre} href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-[12px] px-3 text-[13px] text-l-tinta-2 hover:bg-l-sup hover:text-l-tinta">
            {r.nombre} <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : (
          <span key={r.nombre} className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-3 text-[13px] text-l-tinta-3 line-through decoration-l-linea-2" title="No configurado">
            {r.nombre}
          </span>
        ),
      )}
      </div>
    </div>
  );
}

function Barra({ pct, alerta }: { pct: number; alerta?: boolean }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-l-linea-2" aria-hidden>
      <i className={`block h-full rounded-full ${alerta ? "bg-[linear-gradient(90deg,#ff7af7,#ef6b6b)]" : "bg-[image:var(--l-marca-grad)]"}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

function TarjetaEstado({ titulo, valor, pie, children, brillo }: { titulo: string; valor: React.ReactNode; pie?: React.ReactNode; children?: React.ReactNode; brillo?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-2.5 rounded-[20px] border border-l-linea bg-l-sup p-4 md:p-5 ${brillo ? "bg-[image:var(--l-brillo-caja)]" : ""}`}>
      <p className="text-[12px] text-l-tinta-2 md:text-[14px]">{titulo}</p>
      <div className="truncate text-[21px] font-semibold leading-none tracking-[-0.02em] tabular-nums md:text-[28px]">{valor}</div>
      {children}
      {pie && <p className="line-clamp-2 text-[12px] text-l-tinta-3">{pie}</p>}
    </div>
  );
}

/** El estado del cliente de un vistazo: costo contra el objetivo, saldo, lo que hay para decidir y la ficha. */
function TarjetasEstado({ c, ads }: { c: Client; ads?: ClientAdsSummary }) {
  const resumen = useQuery({ queryKey: ["lmtm", "cliente", c.id], queryFn: () => clientesApi.resumen(c.id), staleTime: 60_000 });
  const cerebro = useCobertura(c.id);
  const r = resumen.data;
  const costo = r ? (r.medida === "calificado" ? r.semana.costoPorCalificado : r.semana.cpl) : null;
  const objetivo = r?.semana.objetivo ?? null;
  const dias = diasDeSaldo(ads);
  const cb = cerebro.data?.cobertura;
  const nas = cerebro.data?.material?.indiceNas;
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      <TarjetaEstado
        brillo
        titulo={r?.medida === "calificado" ? "Costo por calificado" : "Costo por consulta"}
        valor={costo != null ? pesos(costo) : <span className="text-[20px] italic text-l-tinta-3">sin dato</span>}
        pie={objetivo != null ? `Objetivo ${pesos(objetivo)} · semana del ${r!.semana.desde.slice(8, 10)}/${r!.semana.desde.slice(5, 7)}` : r ? "Sin objetivo cargado" : undefined}
      >
        {r && <EstadoObjetivoMarca e={r.estado} chico />}
        {costo != null && objetivo != null && <Barra pct={(costo / objetivo) * 100} alerta={costo > objetivo} />}
      </TarjetaEstado>
      <TarjetaEstado
        titulo="Saldo de pauta"
        valor={dias != null ? `${dias} ${dias === 1 ? "día" : "días"}` : ads?.accountHealth?.remaining != null ? pesos(ads.accountHealth.remaining) : <span className="text-[20px] italic text-l-tinta-3">sin dato</span>}
        pie={ads?.accountHealth ? `${ads.accountHealth.statusLabel}${dias != null ? ` · quedan ${pesos(ads.accountHealth.remaining ?? 0)}` : ""}` : "Sin cuenta de Meta conectada"}
      >
        {dias != null && <Barra pct={Math.min(100, (dias / 30) * 100)} alerta={dias <= 7} />}
      </TarjetaEstado>
      <TarjetaEstado
        titulo="Para decidir"
        valor={r ? r.decisiones.length : "…"}
        pie={r?.decisiones[0] ? r.decisiones[0].que : r ? "Nada pendiente con este cliente" : undefined}
      />
      <TarjetaEstado
        titulo="Ficha de marca"
        valor={cb ? `${cb.porcentaje}%` : "…"}
        pie={
          cb && (
            <>
              <span title={cb.falta.join(", ")}>{cb.falta.length ? `Falta: ${cb.falta.slice(0, 2).join(", ")}${cb.falta.length > 2 ? "…" : ""}` : "No le falta nada"}</span>
              {nas && <span className="block">NAS: {nas.videos.toLocaleString("es-AR")} videos y {nas.fotos.toLocaleString("es-AR")} fotos</span>}
            </>
          )
        }
      >
        {cb && <Barra pct={cb.porcentaje} alerta={cb.porcentaje < 85} />}
      </TarjetaEstado>
    </div>
  );
}

/**
 * Las 5 agrupaciones como pestañas arriba y, debajo, las secciones del grupo abierto. 20/11 (Naza): con la barra
 * lateral del panel, un segundo menú a la izquierda le robaba ancho al contenido y dejaba aire a los costados.
 */
function MenuCliente({ slug, activa }: { slug: string; activa: Seccion }) {
  const grupoActivo = GRUPOS_CLIENTE.find((g) => g.secciones.some((s) => s.id === activa)) ?? GRUPOS_CLIENTE[0];
  return (
    <nav className="mt-6 border-b border-l-linea" aria-label="Secciones del cliente">
      <ScrollLateral>
        <ul className="flex shrink-0 gap-1">
          {GRUPOS_CLIENTE.map((g) => (
            <li key={g.grupo}>
              <Link
                to={`/clientes/${slug}/${g.secciones[0].id}`}
                aria-current={g === grupoActivo ? "true" : undefined}
                className={`relative inline-flex min-h-11 items-center whitespace-nowrap px-4 text-[15px] ${
                  g === grupoActivo
                    ? "font-semibold text-l-tinta after:absolute after:inset-x-3 after:-bottom-px after:h-[3px] after:rounded-full after:bg-[image:var(--l-marca-grad)]"
                    : "text-l-tinta-2 hover:text-l-tinta"
                }`}
              >
                {g.grupo}
              </Link>
            </li>
          ))}
        </ul>
      </ScrollLateral>
      {grupoActivo.secciones.length > 1 && (
        <ul className="flex flex-wrap gap-1.5 py-3">
          {grupoActivo.secciones.map((s) => (
            <li key={s.id}>
              <Link
                to={`/clientes/${slug}/${s.id}`}
                aria-current={s.id === activa ? "page" : undefined}
                className={`inline-flex min-h-9 items-center rounded-full px-3.5 text-[13px] ${s.id === activa ? "bg-l-marca-suave font-semibold text-l-tinta" : "border border-l-linea-2 text-l-tinta-2 hover:text-l-tinta"}`}
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

/** Fija el cliente en el riel (rediseño 20/11). */
export function BotonFijar({ slug, nombre }: { slug: string; nombre: string }) {
  const f = useFijados();
  const fijado = f.fijado(slug);
  return (
    <button
      type="button"
      onClick={() => f.alternar({ slug, nombre })}
      aria-pressed={fijado}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium ${fijado ? "border-l-marca bg-l-marca-suave text-l-tinta" : "border-l-linea-2 text-l-tinta-2 hover:text-l-tinta"}`}
    >
      <Pin className="h-3.5 w-3.5" aria-hidden /> {fijado ? "Fijado" : "Fijar"}
    </button>
  );
}

/**
 * Qué tan completa está la ficha que leen los agentes y Claude (plan 15/11, fase 1/5):
 * lo mismo que trae lmtmCliente. Lo que falta lo carga el equipo.
 */
function useCobertura(clientId: string) {
  return useQuery({
    queryKey: ["lmtm", "cerebro", "cliente", clientId],
    queryFn: () => api.get<{ cobertura: { porcentaje: number; falta: string[] }; material?: { indiceNas?: { archivos: number; videos: number; fotos: number } | null } }>(`/cerebro/cliente?q=${clientId}`),
    staleTime: 10 * 60_000,
  });
}

function AgentesDelCliente({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lmtm", "agentes", "cliente", clientId], queryFn: () => agentesApi.trabajos({ clientId, limite: 50 }), refetchInterval: 60_000 }); // el canal en vivo refresca al instante (20/11)
  const [rol, setRol] = useState(Object.keys(ROLES)[0]);
  const [pedido, setPedido] = useState("");
  const pedir = useMutation({
    mutationFn: () => agentesApi.pedir({ rol, clientId, pedido }),
    onSuccess: () => {
      setPedido("");
      void qc.invalidateQueries({ queryKey: ["lmtm", "agentes"] });
    },
  });
  // Lo terminado está en el registro de abajo; acá arriba, lo que todavía corre.
  const enCurso = (q.data?.trabajos ?? []).filter((t) => t.estado !== "hecho").slice(0, 5);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        {enCurso.length > 0 && <TituloFranja>En curso</TituloFranja>}
        {enCurso.map((t) => (
          <Tarjeta key={t.id}>
            <div className="flex items-center gap-1.5 text-[12px] text-l-tinta-3">
              <EstadoPunto estado={t.estado} /> {nombreRol(t.rol)} · {haceCuanto(t.finishedAt ?? t.startedAt ?? t.createdAt)}
            </div>
            <p className="mt-1 text-[14px] text-l-tinta-2">{t.estado === "fallo" ? `No pudo terminar: ${t.error ?? ""}` : t.estado === "corriendo" ? "Trabajando…" : "En la cola"}</p>
          </Tarjeta>
        ))}
        <TituloFranja>Lo que hicieron y propusieron los agentes con este cliente</TituloFranja>
        <TrabajoDelCliente clientId={clientId} />
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
            className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] bg-[image:var(--l-marca-grad)] px-3.5 text-[14px] font-semibold text-l-marca-tinta disabled:opacity-50"
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
