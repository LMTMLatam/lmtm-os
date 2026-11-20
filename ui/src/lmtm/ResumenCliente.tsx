// LMTM: la pestaña «Para hacer» de un cliente, la que abre por defecto.
//
// 20/11 (Naza: «la sección para hacer está muy mal posicionada, tiene espacios vacíos a los costados; todas las
// secciones deben ser visuales como Hoy»): a todo el ancho y en paneles como Hoy. El costo contra el objetivo ya está
// en las tarjetas de arriba de la ficha; acá van la evolución día por día, el embudo, lo que lograron los agentes con
// este cliente, lo que hay para decidir (corto: para qué y en qué se basa al abrirlo), lo hecho y el informe.

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ExternalLink, Hourglass, OctagonAlert, Send } from "lucide-react";
import { clientesApi, informesApi, type ResumenCliente as Datos } from "../api/informes";
import { clientsApi } from "../api/clients";
import { api, ApiError } from "../api/client";
import { agentesApi, type Trabajo } from "../app/api";
import { FilaAbrible } from "../app/HoyApp";
import { Boton, Panel } from "./componentes";
import { haceCuanto, pesos } from "./formato";
import { AntesDespues, BarrasH, Linea } from "./graficos";

const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
const entero = (n: number) => Math.round(n).toLocaleString("es-AR");
const hace30 = () => new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

export function ResumenCliente({ clientId, slug, onCalendario }: { clientId: string; slug: string; onCalendario?: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["lmtm", "cliente", clientId],
    queryFn: () => clientesApi.resumen(clientId),
    staleTime: 60_000,
  });
  return (
    <div>
      {isLoading && <p className="pt-4 text-[14px] text-l-tinta-3">Cargando…</p>}
      {error && (
        <p className="flex gap-1.5 pt-4 text-[14px] text-l-critico-texto" role="alert">
          <OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> No se pudo cargar el resumen: {error instanceof Error ? error.message : "error"}
        </p>
      )}
      {data && <Contenido d={data} clientId={clientId} slug={slug} onCalendario={onCalendario} />}
    </div>
  );
}

function Contenido({ d, clientId, slug, onCalendario }: { d: Datos; clientId: string; slug: string; onCalendario?: () => void }) {
  const serie = useQuery({ queryKey: ["lmtm", "cliente", slug, "serie", 30], queryFn: () => clientsApi.timeseries(slug, { since: hace30() }), staleTime: 10 * 60_000 });
  const trabajos = useQuery({ queryKey: ["lmtm", "agentes", "cliente", clientId], queryFn: () => agentesApi.trabajos({ clientId, limite: 50 }), staleTime: 60_000 });
  const porDecision = useMemo(() => {
    const m = new Map<string, Trabajo>();
    for (const t of trabajos.data?.trabajos ?? []) if (t.ref?.startsWith("decision:") && !m.has(t.ref.slice(9))) m.set(t.ref.slice(9), t);
    return m;
  }, [trabajos.data]);
  const puntos = (serie.data?.series ?? []).map((p) => ({ date: String(p.date).slice(0, 10), spend: Number(p.spend) || 0, leads: Number(p.leads) || 0 }));

  return (
    <div className="space-y-4">
      {puntos.length > 1 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel titulo="Consultas por día" bajada="Últimos 30 días, todas las cuentas">
            <Linea puntos={puntos.map((p) => ({ x: p.date, y: p.leads }))} formato={entero} etiqueta="Consultas por día" />
          </Panel>
          <Panel titulo="Inversión por día" bajada="Últimos 30 días, todas las cuentas">
            <Linea puntos={puntos.map((p) => ({ x: p.date, y: p.spend }))} formato={pesos} etiqueta="Inversión por día" />
          </Panel>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="Embudo" bajada={`Del ${fechaCorta(d.embudo.desde)} al ${fechaCorta(d.embudo.hasta)} · cada paso con su costo`}>
          <Embudo e={d.embudo} />
        </Panel>
        <LogrosAgentes slug={slug} clientId={clientId} />
      </div>

      <Panel titulo={`Para decidir · ${d.decisiones.length}`} bajada="Cada una dice para qué sirve; al abrirla, en qué se basa y qué hacer">
        {d.decisiones.length === 0 ? (
          <p className="flex items-center gap-2 text-[14px] text-l-tinta-2">
            <Check className="h-4 w-4 text-l-bien-texto" aria-hidden /> Nada pendiente para este cliente.
          </p>
        ) : (
          <ul className="-mx-5 -mb-5 border-t border-l-linea">
            {d.decisiones.map((x) => (
              <FilaAbrible key={x.id} d={x} agente={porDecision.get(x.id)} sinCliente />
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {d.hechas.length > 0 && (
          <Panel
            titulo="Lo que se hizo"
            bajada={`${d.hechas.filter((x) => x.estado === "verificada").length} confirmadas con los datos · ${d.hechas.filter((x) => x.estado !== "verificada").length} esperando el dato`}
          >
            <ul className="space-y-2">
              {d.hechas.map((x) => (
                <li key={x.id} className="flex gap-2 text-[14px] text-l-tinta-2">
                  {x.estado === "verificada" ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--l-bien)" }} aria-label="Confirmado con los datos" />
                  ) : (
                    <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-l-tinta-3" aria-label="Esperando el dato" />
                  )}
                  <span>
                    {x.que}
                    {x.ejecutadaAt && <span className="text-l-tinta-3"> · {haceCuanto(x.ejecutadaAt)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <Panel titulo="Informe de la semana">
          <InformeSemana d={d} clientId={clientId} />
        </Panel>
      </div>

      {onCalendario && (
        <button type="button" onClick={onCalendario} className="inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-l-marca">
          Ver el calendario de contenido <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Pauta → consultas → calificadas → ventas: barras de cantidad con su costo. Lo que no se mide dice «sin dato». */
function Embudo({ e }: { e: Datos["embudo"] }) {
  const pasos = [
    { etiqueta: "Consultas", valor: e.leads, costo: e.cpl },
    { etiqueta: "Calificadas", valor: e.calificados, costo: e.costoPorCalificado },
    { etiqueta: "Ventas (Meta)", valor: e.ventas, costo: e.costoPorVenta },
  ];
  const medidos = pasos.filter((p) => p.valor != null);
  return (
    <div>
      <p className="mb-4 text-[13px] text-l-tinta-2">
        <span className="block text-[28px] font-semibold leading-none tabular-nums text-l-tinta">{e.inversion == null ? "sin dato" : pesos(e.inversion)}</span>
        invertidos
      </p>
      {medidos.length > 0 && <BarrasH filas={medidos.map((p) => ({ etiqueta: p.etiqueta, valor: p.valor!, detalle: p.costo != null ? `${pesos(p.costo)} c/u` : undefined }))} formato={entero} />}
      <ul className="mt-3 flex flex-wrap gap-2">
        {pasos.map((p) => (
          <li key={p.etiqueta} className="rounded-[10px] border border-l-linea bg-l-papel/60 px-2.5 py-1.5">
            <span className="block text-[11px] text-l-tinta-3">{p.etiqueta}, cada una</span>
            <span className={`text-[15px] font-semibold tabular-nums ${p.costo == null ? "italic text-l-tinta-3" : "text-l-tinta"}`}>{p.costo == null ? "sin dato" : pesos(p.costo)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Impacto {
  pauta: { clientes: Array<{ cliente: string; slug: string; cambios: number; cplAntes: number; cplDespues: number }> };
}

const AREA: Record<string, string> = { pauta: "Pauta", web: "Web", contenido: "Contenido", analisis: "Análisis", informe: "Informes" };

/** Lo que lograron los agentes con este cliente: el costo antes y después de sus cambios y lo que hicieron por área. */
function LogrosAgentes({ slug, clientId }: { slug: string; clientId: string }) {
  const impacto = useQuery({ queryKey: ["lmtm", "impacto"], queryFn: () => api.get<Impacto>("/impacto"), staleTime: 10 * 60_000 });
  const trabajo = useQuery({
    queryKey: ["lmtm", "trabajo", "resumen", clientId, 90],
    queryFn: () => api.get<{ resumen: { porArea: Record<string, { hechos: number }> } }>(`/trabajo?clientId=${clientId}&dias=90&resumen=1`),
    staleTime: 10 * 60_000,
  });
  const yo = impacto.data?.pauta.clientes.find((c) => c.slug === slug);
  const areas = Object.entries(trabajo.data?.resumen.porArea ?? {})
    .map(([k, v]) => ({ etiqueta: AREA[k] ?? k, valor: v.hechos }))
    .filter((f) => f.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  return (
    <Panel titulo="Lo que lograron los agentes" bajada="Últimos 90 días">
      {yo ? (
        <div className="mb-5">
          <p className="mb-3 text-[12px] text-l-tinta-3">Costo por consulta antes de su primer cambio en la cuenta y después del último ({yo.cambios} cambios)</p>
          <AntesDespues filas={[{ etiqueta: "Costo por consulta", antes: yo.cplAntes, despues: yo.cplDespues }]} formato={pesos} menorEsMejor />
        </div>
      ) : (
        <p className="mb-4 text-[13px] text-l-tinta-3">Todavía no hicieron cambios medibles en sus cuentas.</p>
      )}
      {areas.length > 0 ? <BarrasH filas={areas} formato={(n) => String(n)} /> : <p className="text-[13px] text-l-tinta-3">Sin trabajo de los agentes en 90 días.</p>}
    </Panel>
  );
}

const ESTADO_INFORME = {
  publicado: { label: "Publicado: el cliente lo ve en su link", Icono: Check, color: "var(--l-bien)" },
  aprobado: { label: "Listo para publicar: pasó el auditor", Icono: Send, color: "var(--l-marca)" },
  observado: { label: "Observado por el auditor: hay que corregirlo", Icono: OctagonAlert, color: "var(--l-atencion)" },
  borrador: { label: "Borrador", Icono: Hourglass, color: "var(--l-tinta-3)" },
} as const;

function InformeSemana({ d, clientId }: { d: Datos; clientId: string }) {
  const qc = useQueryClient();
  const i = d.informe;
  const mut = useMutation({
    mutationFn: (accion: "publicar" | "retirar") => (accion === "publicar" ? informesApi.publicar(i!.id) : informesApi.retirar(i!.id)),
    // También la Cartera, que muestra el estado del informe de cada cliente.
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lmtm"] }),
  });

  if (!i) {
    return (
      <p className="text-[14px] text-l-tinta-2">
        Todavía no hay informe de la semana del {fechaCorta(d.semana.desde)}. El borrador automático se arma los lunes desde las 10:00; el estratega lo puede reemplazar con el suyo.
      </p>
    );
  }
  const { label, Icono, color } = ESTADO_INFORME[i.estado];
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[14px] font-medium">
        <Icono className="h-4 w-4 shrink-0" style={{ color }} aria-hidden />
        {label}
      </div>
      <div className="mt-0.5 text-[12px] text-l-tinta-3">
        {i.escritoPor === "tablero:automatico" ? "Borrador automático (sin modelo)" : i.escritoPor.startsWith("agente:") ? "Escrito por el estratega" : "Escrito por una persona"}
        {i.publicadoAt ? ` · publicado ${haceCuanto(i.publicadoAt)}` : ""}
      </div>

      {i.fallas.length > 0 && (
        <ul className="mt-3 space-y-1 border-l-[3px] pl-3 text-[13px] text-l-tinta-2" style={{ borderColor: "var(--l-atencion)" }}>
          {i.fallas.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}

      <blockquote className="mt-3 text-[15px] leading-[1.55]">{i.texto.resumen}</blockquote>
      {i.texto.proximos.length > 0 && (
        <p className="mt-2 text-[13px] text-l-tinta-2">
          <span className="font-medium">La semana que viene:</span> {i.texto.proximos.join(" · ")}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {i.estado === "aprobado" && (
          <Boton tipo="primario" onClick={() => mut.mutate("publicar")} disabled={mut.isPending}>
            {mut.isPending ? "Publicando…" : "Publicar para el cliente"}
          </Boton>
        )}
        {i.estado === "publicado" && (
          <Boton tipo="secundario" onClick={() => mut.mutate("retirar")} disabled={mut.isPending}>
            Retirar del link
          </Boton>
        )}
        {d.linkPublico && (
          <a href={d.linkPublico} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 px-1 text-[14px] font-semibold text-l-marca">
            Ver como lo ve el cliente <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        )}
      </div>
      {!d.linkPublico && <p className="mt-2 text-[12px] text-l-tinta-3">Este cliente no tiene link público activo: se crea con «Compartir», arriba en la ficha.</p>}
      {mut.error && (
        <p className="mt-2 flex gap-1.5 text-[13px] text-l-critico-texto" role="alert">
          <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {mut.error instanceof ApiError ? mut.error.message : "No se pudo completar."}
        </p>
      )}
    </div>
  );
}
