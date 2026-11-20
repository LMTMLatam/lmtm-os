// LMTM: «Lo que lograron los agentes» en Hoy (pedido de Naza 20/11: «que muestren que está sirviendo el equipo de
// agentes: comparativas de antes y después; Google Ads, webs, SEO, reflejado en visual»). Solo lo que se midió de
// verdad (server/src/services/impacto.ts); lo que todavía se está midiendo se dice así, sin inventar mejoras.

import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { api } from "../api/client";
import { pesos } from "../lmtm/formato";
import { AntesDespues, BarrasH, Lineas, Proporcion } from "../lmtm/graficos";

interface Impacto {
  pauta: {
    mejoraron: number;
    igual: number;
    empeoraron: number;
    midiendo: number;
    clientes: Array<{ cliente: string; slug: string; cambios: number; cplAntes: number; cplDespues: number }>;
  };
  web: { webs: number; total: number; porTipo: Array<{ tipo: string; n: number }>; primerCambio: string | null; semanas: Array<{ semana: string; conAgentes: number; sinAgentes: number }> };
  google: { abiertas: number; arsPorDia: number };
}

export function ImpactoAgentes() {
  const q = useQuery({ queryKey: ["lmtm", "impacto"], queryFn: () => api.get<Impacto>("/impacto"), staleTime: 10 * 60_000 });
  const d = q.data;
  if (!d) return null;
  const p = d.pauta;
  const medidos = p.mejoraron + p.igual + p.empeoraron;
  const fecha = (s: string) => `${Number(s.slice(8, 10))}/${Number(s.slice(5, 7))}`;
  return (
    <section>
      <h2 className="mb-1 text-[18px] font-semibold">Lo que lograron los agentes</h2>
      <p className="mb-4 text-[13px] text-l-tinta-3">Antes y después de cada cambio que hicieron en cuentas y webs, medido con los datos de cada cliente.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {p.clientes.length > 0 && (
          <Panel titulo="Pauta: costo por consulta" bajada="Antes del primer cambio de los agentes y después del último, por cliente · más a la izquierda es mejor">
            <AntesDespues filas={p.clientes.map((c) => ({ etiqueta: c.cliente, antes: c.cplAntes, despues: c.cplDespues, detalle: `${c.cambios} cambios` }))} formato={pesos} menorEsMejor />
          </Panel>
        )}
        <Panel titulo="Cada cambio, medido" bajada={`${medidos} cambios en cuentas con su resultado${p.midiendo ? ` · ${p.midiendo} midiéndose` : ""}`}>
          <Proporcion
            tramos={[
              { etiqueta: "mejoraron", valor: p.mejoraron, tono: "bien", marca: "↓" },
              { etiqueta: "igual", valor: p.igual, tono: "neutro", marca: "=" },
              { etiqueta: "empeoraron", valor: p.empeoraron, tono: "critico", marca: "↑" },
            ]}
          />
          <p className="mt-5 border-t border-l-linea pt-4 text-[12px] text-l-tinta-3">
            Cada cambio (pausar, mover presupuesto) se mide a los 7 días con el costo por consulta de todo el cliente, contra la semana anterior al cambio.
          </p>
        </Panel>
        {d.web.semanas.length > 1 && (
          <Panel titulo="Webs: clics desde Google" bajada="Las webs que tocaron los agentes contra las que no · base 100 = su promedio antes del primer cambio">
            <Lineas
              x={d.web.semanas.map((s) => s.semana)}
              series={[
                { nombre: "Con agentes", valores: d.web.semanas.map((s) => s.conAgentes) },
                { nombre: "Sin agentes", valores: d.web.semanas.map((s) => s.sinAgentes) },
              ]}
              formato={(n) => String(Math.round(n))}
              marca={d.web.primerCambio ? { x: d.web.primerCambio, etiqueta: `primer cambio (${fecha(d.web.primerCambio)})` } : undefined}
            />
            <p className="mt-3 text-[12px] text-l-tinta-3">Google tarda semanas en reflejar un cambio: se lee de verdad a las 4 semanas del primero.</p>
          </Panel>
        )}
        <Panel titulo="Webs arregladas" bajada={`${d.web.total} cambios en ${d.web.webs} ${d.web.webs === 1 ? "web" : "webs"}, aprobados por el equipo`}>
          {d.web.porTipo.length > 0 ? <BarrasH filas={d.web.porTipo.map((t) => ({ etiqueta: t.tipo, valor: t.n }))} formato={(n) => String(n)} /> : <p className="text-[13px] text-l-tinta-3">Todavía ninguno.</p>}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-l-linea pt-4">
            <Dato grande={String(d.google.abiertas)} texto={`optimizaciones de Google Ads esperando aprobación${d.google.arsPorDia > 0 ? ` · ${pesos(d.google.arsPorDia)} por día en juego` : ""}`} />
            {d.google.abiertas > 0 && (
              <Link to="/decisiones?vista=aprobar" className="shrink-0 text-[13px] font-semibold text-l-marca">
                Ver
              </Link>
            )}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function Panel({ titulo, bajada, children }: { titulo: string; bajada?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-l-linea bg-l-sup p-5">
      <h3 className="text-[16px] font-semibold">{titulo}</h3>
      {bajada && <p className="mb-4 mt-0.5 text-[12px] text-l-tinta-3">{bajada}</p>}
      {children}
    </section>
  );
}

function Dato({ grande, texto }: { grande: string; texto: string }) {
  return (
    <p className="text-[13px] leading-snug text-l-tinta-2">
      <span className="block text-[22px] font-semibold tabular-nums text-l-tinta">{grande}</span>
      {texto}
    </p>
  );
}
