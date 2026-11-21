// Ficha del cliente → «Cuenta» (plan 21/11, doc de Marcos): por mes, cada renglón
// cotizado vs realizado; la señal de cobro del trimestre; la salud en una vista; y
// el informe trimestral para copiar. Lo vendido en plata y avisos se carga acá.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Client } from "../../api/clients";
import { api } from "../../api/client";
import { Boton } from "../../lmtm/componentes";
import { Tarjeta, TituloFranja } from "../HoyApp";

interface Renglon { cotizado: number | null; realizado: number }
export interface MesCuenta {
  mes: string; cerrado: boolean; fuente: "instagram" | "clickup" | null;
  posteos: Renglon; videos: Renglon; historias: Renglon; avisos: Renglon; inversionMeta: Renglon; inversionGoogle: Renglon;
  cumplimientoPct: number | null;
  videosTracker?: { encargados: number; entregados: number } | null;
}
type Margen = { mes: string; abono: number; directos: number; imputado: number; participacionPct: number; margen: number; otrasMonedas: number } | { motivo: string };
export type Senal = "sobre-servicio" | "sub-servicio" | "en-linea" | "sin-datos";
interface Cuenta {
  cuenta: { meses: MesCuenta[]; senal: Senal } | null;
  salud: {
    indice: number | null; razones: string[];
    leads: { ultimos30: number | null; previos30: number | null; dudosos: boolean };
    calidadPauta: number | null; seguidores: Record<string, Array<{ mes: string; n: number }>>; mejoras30: number; oportunidades: number;
  };
  cotizado: { metaMes: number | null; googleMes: number | null; avisosMes: number | null };
  abonoMes: number | null; margen?: Margen | null; aprobacionPorLink?: boolean; moneda: string; puedeEditar: boolean; informe: string;
}

export const SENALES: Record<Senal, { texto: string; clase: string }> = {
  "sobre-servicio": { texto: "Se le entrega más de lo vendido: revisar el precio", clase: "border-l-atencion/50 text-l-atencion-texto" },
  "sub-servicio": { texto: "Se le entrega menos de lo vendido: riesgo", clase: "border-l-critico/50 text-l-critico-texto" },
  "en-linea": { texto: "Lo entregado está en línea con lo vendido", clase: "border-l-bien/50 text-l-bien-texto" },
  "sin-datos": { texto: "Sin meses medidos suficientes para decir", clase: "border-l-linea text-l-tinta-3" },
};

const num = (n: number) => n.toLocaleString("es-AR");
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const nombreMes = (m: string) => `${MESES[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;

function Celda({ r, plata }: { r: Renglon; plata?: boolean }) {
  const f = (n: number) => (plata ? `$${num(n)}` : num(n));
  if (r.cotizado == null) return <td className="px-2 py-1.5 text-right text-l-tinta-3">{r.realizado ? f(r.realizado) : "—"} <span className="text-[11px]">/ sin cargar</span></td>;
  if (r.cotizado === 0 && r.realizado === 0) return <td className="px-2 py-1.5 text-right text-l-tinta-3">—</td>;
  const pct = r.cotizado > 0 ? r.realizado / r.cotizado : null;
  const color = pct == null ? "text-l-tinta-2" : pct >= 1.2 ? "text-l-atencion-texto" : pct >= 0.85 ? "text-l-bien-texto" : pct >= 0.5 ? "text-l-atencion-texto" : "text-l-critico-texto";
  return <td className={`px-2 py-1.5 text-right ${color}`}>{f(r.realizado)} <span className="text-l-tinta-3">/ {f(r.cotizado)}</span></td>;
}

const campo = "h-10 w-full rounded-[10px] border border-l-linea-2 bg-l-sup px-3 text-[14px] text-l-tinta outline-none focus:border-l-marca";

function Vendido({ client, d }: { client: Client; d: Cuenta }) {
  const qc = useQueryClient();
  const [v, setV] = useState({
    metaMes: d.cotizado.metaMes?.toString() ?? "", googleMes: d.cotizado.googleMes?.toString() ?? "",
    avisosMes: d.cotizado.avisosMes?.toString() ?? "", abonoMes: d.abonoMes ? d.abonoMes.toString() : "",
  });
  const guardar = useMutation({
    mutationFn: () => api.patch(`/clients/${client.id}`, { cotizado: { metaMes: v.metaMes, googleMes: v.googleMes, avisosMes: v.avisosMes }, abonoMes: v.abonoMes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", client.slug, "cuenta"] }),
  });
  const link = useMutation({
    mutationFn: (prender: boolean) => api.patch(`/clients/${client.id}`, { aprobacionPorLink: prender }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", client.slug, "cuenta"] }),
  });
  const mg = d.margen;
  const entrada = (k: keyof typeof v, etiqueta: string) => (
    <label className="block text-[13px] text-l-tinta-2">
      {etiqueta}
      <input className={`${campo} mt-1`} inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/[^\d.]/g, "") })} placeholder="sin cargar" />
    </label>
  );
  return (
    <Tarjeta>
      <TituloFranja>Lo vendido por mes</TituloFranja>
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => { e.preventDefault(); guardar.mutate(); }}>
        {entrada("metaMes", "Inversión Meta ($)")}
        {entrada("googleMes", "Inversión Google ($)")}
        {entrada("avisosMes", "Avisos")}
        {entrada("abonoMes", `Abono (${d.moneda})`)}
        <div className="flex items-end"><Boton tipo="primario" type="submit" disabled={guardar.isPending}>{guardar.isPending ? "Guardando…" : "Guardar"}</Boton></div>
      </form>
      <p className="mt-2 text-[12px] text-l-tinta-3">
        Posteos, videos e historias vendidos salen de la PLANILLA GENERAL del equipo. Los números se ven actualizados en unos minutos.
        {guardar.isError && <span className="text-l-critico-texto"> No se pudo guardar.</span>}
        {guardar.isSuccess && <span className="text-l-bien-texto"> Guardado.</span>}
      </p>
      <div className="mt-4 border-t border-l-linea pt-3 text-[13px] text-l-tinta-2">
        <span className="font-semibold text-l-tinta">Margen estimado: </span>
        {!mg ? "—" : "motivo" in mg ? <span className="text-l-tinta-3">{mg.motivo}</span> : (
          <>
            <span className={`text-[16px] font-semibold ${mg.margen >= 0 ? "text-l-bien-texto" : "text-l-critico-texto"}`}>${num(mg.margen)}</span>
            <span className="text-l-tinta-3"> en {nombreMes(mg.mes)} = abono ${num(mg.abono)} − gastos de este cliente ${num(mg.directos)} − su parte de los gastos generales ${num(mg.imputado)} ({mg.participacionPct} % de las piezas vendidas).
              {mg.otrasMonedas > 0 && ` ${mg.otrasMonedas} gastos en otra moneda no entraron.`}</span>
          </>
        )}
        <div className="text-[12px] text-l-tinta-3">Sale de los gastos cargados en Finanzas. Es una estimación: no incluye lo que no esté cargado ahí.</div>
      </div>
      <label className="mt-4 flex items-start gap-2 border-t border-l-linea pt-3 text-[13px] text-l-tinta-2">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={!!d.aprobacionPorLink} disabled={link.isPending} onChange={(e) => link.mutate(e.target.checked)} />
        <span>
          <span className="font-semibold text-l-tinta">El cliente aprueba las piezas desde su link.</span> En su dashboard ve lo que sale en los próximos 21 días sin aprobar, y al tocar «Aprobar» se marca
          «Aprobación de cliente» en ClickUp. Está apagado hasta que lo prendas.
          {link.isError && <span className="text-l-critico-texto"> No se pudo cambiar.</span>}
        </span>
      </label>
    </Tarjeta>
  );
}

export function CuentaTab({ client }: { client: Client }) {
  const q = useQuery({ queryKey: ["client", client.slug, "cuenta"], queryFn: () => api.get<Cuenta>(`/clients/${client.id}/cuenta`), staleTime: 5 * 60_000, retry: false });
  const [copiado, setCopiado] = useState(false);
  if (q.isLoading) return <p className="text-[14px] text-l-tinta-3" role="status">Armando la cuenta…</p>;
  if (!q.data) return <p className="text-[14px] text-l-critico-texto" role="alert">No se pudo armar la cuenta.</p>;
  const d = q.data;
  const meses = [...(d.cuenta?.meses ?? [])].sort((a, b) => a.mes.localeCompare(b.mes));
  const s = d.salud;
  const senal = SENALES[d.cuenta?.senal ?? "sin-datos"];
  const renglones: Array<[string, keyof MesCuenta, boolean?]> = [
    ["Posteos", "posteos"], ["Videos y reels", "videos"], ["Historias", "historias"], ["Avisos", "avisos"],
    ["Inversión Meta", "inversionMeta", true], ["Inversión Google", "inversionGoogle", true],
  ];
  const dato = (titulo: string, valor: string, detalle?: string) => (
    <div className="rounded-xl border border-l-linea p-3">
      <div className="text-[12px] text-l-tinta-3">{titulo}</div>
      <div className="text-[20px] font-semibold text-l-tinta">{valor}</div>
      {detalle && <div className="text-[12px] text-l-tinta-3">{detalle}</div>}
    </div>
  );
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border bg-l-sup p-4 text-[15px] font-semibold ${senal.clase}`}>
        {senal.texto}
        <span className="ml-2 text-[12px] font-normal text-l-tinta-3">mirando los 3 meses cerrados: 120 % o más en 2 de 3 es de más; 70 % o menos, de menos</span>
      </div>

      <Tarjeta>
        <TituloFranja>Realizado / cotizado, por mes</TituloFranja>
        {meses.length === 0 ? (
          <p className="text-[14px] text-l-tinta-3">Este cliente no está en la PLANILLA GENERAL: no hay contenido vendido contra el cual comparar.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-l-linea text-left text-l-tinta-3">
                  <th className="py-1.5 pr-2 font-medium"> </th>
                  {meses.map((m) => <th key={m.mes} className="px-2 text-right font-medium">{nombreMes(m.mes)}{!m.cerrado && " (en curso)"}</th>)}
                </tr>
              </thead>
              <tbody>
                {renglones.map(([nombre, k, plata]) => (
                  <tr key={k} className="border-b border-l-linea/60">
                    <td className="py-1.5 pr-2 text-l-tinta-2">{nombre}</td>
                    {meses.map((m) =>
                      // Sin fuente no hay conteo de contenido: un 0 se leería como «no publicó nada».
                      !m.fuente && (k === "posteos" || k === "videos")
                        ? <td key={m.mes} className="px-2 py-1.5 text-right text-l-tinta-3">sin medir <span className="text-[11px]">/ {num((m[k] as Renglon).cotizado ?? 0)}</span></td>
                        : <Celda key={m.mes} r={m[k] as Renglon} plata={plata} />)}
                  </tr>
                ))}
                {meses.some((m) => m.videosTracker) && (
                  <tr className="border-b border-l-linea/60">
                    <td className="py-1.5 pr-2 text-l-tinta-2">Videos (tracker del equipo)</td>
                    {meses.map((m) => m.videosTracker
                      ? <Celda key={m.mes} r={{ cotizado: m.videosTracker.encargados, realizado: m.videosTracker.entregados }} />
                      : <td key={m.mes} className="px-2 py-1.5 text-right text-l-tinta-3">—</td>)}
                  </tr>
                )}
                <tr>
                  <td className="py-1.5 pr-2 font-semibold text-l-tinta">Cumplimiento de contenido</td>
                  {meses.map((m) => <td key={m.mes} className="px-2 py-1.5 text-right font-semibold text-l-tinta">{m.cumplimientoPct != null ? `${m.cumplimientoPct} %` : <span className="font-normal text-l-tinta-3">sin medir</span>}</td>)}
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[12px] text-l-tinta-3">
              «Videos (tracker del equipo)» = entregados / encargados según el Excel del mes del equipo de video; el mes en curso va contra el mes entero.{" "}
              Los meses cerrados se miden solo contra la cuenta de Instagram del cliente; «sin medir» = no la leemos. El mes en curso compara contra la parte del mes que ya pasó. Las historias se cuentan desde el 15/10 y no pesan en el cumplimiento.
            </p>
          </div>
        )}
      </Tarjeta>

      <Tarjeta>
        <TituloFranja>Salud de la cuenta</TituloFranja>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {dato("Índice de salud", s.indice != null ? `${s.indice} / 100` : "sin dato", s.razones[0])}
          {dato("Consultas, 30 días", s.leads.ultimos30 != null ? num(s.leads.ultimos30) : "sin pauta", s.leads.previos30 != null ? `30 anteriores: ${num(s.leads.previos30)}${s.leads.dudosos ? " · Google no confiable" : ""}` : undefined)}
          {dato("Calidad de la pauta", s.calidadPauta != null ? `${s.calidadPauta} / 100` : "sin pauta")}
          {dato("Mejoras ejecutadas", num(s.mejoras30), "en 30 días")}
          {dato("Oportunidades abiertas", num(s.oportunidades))}
          {Object.entries(s.seguidores).map(([red, serie]) => {
            const u = serie[serie.length - 1];
            const dif = serie.length > 1 ? u.n - serie[0].n : null;
            return <div key={red}>{dato(`Seguidores en ${red}`, num(u.n), dif != null ? `${dif >= 0 ? "+" : ""}${num(dif)} desde ${nombreMes(serie[0].mes)}` : "primer dato")}</div>;
          })}
        </div>
        {Object.keys(s.seguidores).length === 0 && <p className="mt-2 text-[12px] text-l-tinta-3">Seguidores: todavía sin dato (se empieza a guardar uno por mes).</p>}
      </Tarjeta>

      {d.puedeEditar && <Vendido client={client} d={d} />}

      <Tarjeta>
        <div className="mb-3 flex items-center gap-3">
          <TituloFranja sinMargen>Informe trimestral</TituloFranja>
          <div className="ml-auto">
            <Boton tipo="secundario" onClick={() => navigator.clipboard.writeText(d.informe).then(() => setCopiado(true))}>{copiado ? "Copiado" : "Copiar"}</Boton>
          </div>
        </div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-[13px] text-l-tinta-2">{d.informe}</pre>
      </Tarjeta>
    </div>
  );
}
