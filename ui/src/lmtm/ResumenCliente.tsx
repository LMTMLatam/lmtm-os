// LMTM: la pestaña "Resumen" de un cliente (/c/:slug), la que abre por defecto.
//
// Lo que el equipo necesita para decidir sobre UN cliente, en el orden en que
// lo pregunta: ¿cómo viene contra el objetivo? ¿qué hay para decidir? ¿qué se
// hizo? ¿está el informe de la semana para mandarle? Reemplaza a "Plan de
// acción" (un semáforo y una narrativa de modelo que nadie controlaba).
// Diseño: skill lmtm-diseno. Números: `metricas`, vía /api/clientes/:id/resumen.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ExternalLink, Hourglass, OctagonAlert, Send } from "lucide-react";
import { clientesApi, informesApi, type ResumenCliente as Datos } from "../api/informes";
import { ApiError } from "../api/client";
import { Boton, EstadoObjetivoMarca, FilaDecision, Franja, LmtmBloque } from "./componentes";
import { haceCuanto, pesos } from "./formato";

const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
const entero = (n: number) => Math.round(n).toLocaleString("es-AR");

export function ResumenCliente({ clientId, onCalendario }: { clientId: string; onCalendario?: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["lmtm", "cliente", clientId],
    queryFn: () => clientesApi.resumen(clientId),
    staleTime: 60_000,
  });
  return (
    <LmtmBloque>
      {isLoading && <p className="pt-4 text-[14px] text-l-tinta-3">Cargando…</p>}
      {error && (
        <p className="flex gap-1.5 pt-4 text-[14px] text-l-critico-texto" role="alert">
          <OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> No se pudo cargar el resumen: {error instanceof Error ? error.message : "error"}
        </p>
      )}
      {data && <Contenido d={data} clientId={clientId} onCalendario={onCalendario} />}
    </LmtmBloque>
  );
}

function Contenido({ d, clientId, onCalendario }: { d: Datos; clientId: string; onCalendario?: () => void }) {
  const n = d.semana;
  const costo = d.medida === "calificado" ? n.costoPorCalificado : n.cpl;
  return (
    <>
      <section className="mt-5">
        <div className="text-[13px] font-medium text-l-tinta-2">
          Semana del {fechaCorta(n.desde)} al {fechaCorta(n.hasta)} · {d.medida === "calificado" ? "costo por consulta calificada" : "costo por consulta"}
        </div>
        {n.inversion == null ? (
          <div className="mt-1.5 text-[24px] font-medium italic text-l-tinta-3">sin dato: no hay pauta conectada</div>
        ) : costo != null ? (
          <div className="mt-1.5 text-[40px] font-semibold leading-none tracking-[-0.03em]">{pesos(costo)}</div>
        ) : (
          <div className="mt-1.5 text-[24px] font-semibold">{n.leads === 0 ? "Sin consultas" : "sin dato"}</div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <EstadoObjetivoMarca e={d.estado} />
          <span className="text-[13px] text-l-tinta-3">
            {n.objetivo != null
              ? `Objetivo ${pesos(n.objetivo)}${n.objetivoFuente === "historial" ? " (propuesto: 20% menos que el último mes)" : ""}`
              : "Sin objetivo acordado: cargarlo en la ficha del cliente"}
          </span>
        </div>
      </section>

      <Franja titulo="Embudo, últimos 30 días">
        <Embudo e={d.embudo} />
      </Franja>

      <Franja titulo="Para decidir" cantidad={d.decisiones.length}>
        {d.decisiones.length === 0 ? (
          <p className="text-[14px] text-l-tinta-2">Nada pendiente para este cliente.</p>
        ) : (
          <ul>
            {d.decisiones.map((x, i) => (
              <FilaDecision key={x.id} d={x} n={i + 1} />
            ))}
          </ul>
        )}
      </Franja>

      {d.hechas.length > 0 && (
        <Franja titulo="Lo que se hizo">
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
                  <span className="text-l-tinta-3">
                    {" · "}
                    {x.estado === "verificada" ? "confirmado con los datos" : "esperando el dato"}
                    {x.ejecutadaAt ? ` · ${haceCuanto(x.ejecutadaAt)}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Franja>
      )}

      <Franja titulo="Informe de la semana">
        <InformeSemana d={d} clientId={clientId} />
      </Franja>

      {onCalendario && (
        <button type="button" onClick={onCalendario} className="mt-8 inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-l-marca">
          Ver el calendario de contenido <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </>
  );
}

/** Pauta → consultas → calificadas → ventas, cada paso con su costo. Lo que no se mide dice "sin dato". */
function Embudo({ e }: { e: Datos["embudo"] }) {
  const pasos: Array<{ etiqueta: string; valor: string | null; costo: string | null }> = [
    { etiqueta: "Inversión", valor: e.inversion == null ? null : pesos(e.inversion), costo: null },
    { etiqueta: "Consultas", valor: e.leads == null ? null : entero(e.leads), costo: e.cpl == null ? null : `${pesos(e.cpl)} c/u` },
    { etiqueta: "Calificadas", valor: e.calificados == null ? null : entero(e.calificados), costo: e.costoPorCalificado == null ? null : `${pesos(e.costoPorCalificado)} c/u` },
    { etiqueta: "Ventas (Meta)", valor: e.ventas == null ? null : entero(e.ventas), costo: e.costoPorVenta == null ? null : `${pesos(e.costoPorVenta)} c/u` },
  ];
  return (
    <>
      <ol className="grid grid-cols-2 gap-x-4 gap-y-4 min-[520px]:grid-cols-4">
        {pasos.map((p) => (
          <li key={p.etiqueta}>
            <div className="text-[12px] font-medium text-l-tinta-2">{p.etiqueta}</div>
            {p.valor == null ? <div className="text-[18px] italic text-l-tinta-3">sin dato</div> : <div className="text-[20px] font-semibold">{p.valor}</div>}
            {p.costo && <div className="text-[12px] text-l-tinta-3">{p.costo}</div>}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] text-l-tinta-3">
        Del {fechaCorta(e.desde)} al {fechaCorta(e.hasta)}. Las calificadas aparecen cuando el CRM esté conectado; las ventas, solo con seguimiento de compras en Meta.
      </p>
    </>
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
      {!d.linkPublico && <p className="mt-2 text-[12px] text-l-tinta-3">Este cliente no tiene link público activo: se crea desde la pestaña Dashboard → Compartir.</p>}
      {mut.error && (
        <p className="mt-2 flex gap-1.5 text-[13px] text-l-critico-texto" role="alert">
          <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {mut.error instanceof ApiError ? mut.error.message : "No se pudo completar."}
        </p>
      )}
    </div>
  );
}
