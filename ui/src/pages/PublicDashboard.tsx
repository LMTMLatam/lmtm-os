// LMTM: el informe que ve el cliente en su link (/public/dashboards/:slug).
//
// El link es el mismo de siempre (los slugs no cambian). Lo que cambia es qué
// muestra: antes un tablero de 9 pestañas con CTR, CPM y números que no se
// sostenían; ahora un informe de la semana que responde lo que el cliente
// pregunta: cuánto le costó cada consulta, si eso está en el objetivo, cómo
// viene, qué hicimos y qué necesitamos de él. Todo número sale de `metricas`
// (server/src/decisiones/informe-publico.ts). Diseño: skill lmtm-diseno.

import { useParams } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, OctagonAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { informePublico, type InformePublico } from "../api/informes";
import { EstadoObjetivoMarca, Franja, LmtmPantalla } from "../lmtm/componentes";
import { pesos } from "../lmtm/formato";

const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
const sumarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const entero = (n: number) => Math.round(n).toLocaleString("es-AR");

export function PublicDashboard() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [semana, setSemana] = useState<string | undefined>(undefined);
  const { data, error, isLoading } = useQuery({
    queryKey: ["informe-publico", slug, semana ?? "ultima"],
    queryFn: () => informePublico(slug, semana),
    staleTime: 5 * 60_000,
  });

  const subtitulo = data ? `Semana del ${fechaCorta(data.semana.desde)} al ${fechaCorta(data.semana.hasta)}` : undefined;
  return (
    <LmtmPantalla titulo={data?.cliente ?? "Informe"} subtitulo={subtitulo}>
      {isLoading && <p className="text-[14px] text-l-tinta-3">Armando el informe…</p>}
      {error && (
        <p className="flex gap-1.5 text-[14px] text-l-critico-texto" role="alert">
          <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error instanceof Error ? error.message : "No se pudo cargar."}
        </p>
      )}
      {data && <Informe d={data} slug={slug} onSemana={setSemana} />}
    </LmtmPantalla>
  );
}

function Informe({ d, slug, onSemana }: { d: InformePublico; slug: string; onSemana: (s: string) => void }) {
  const n = d.numeros;
  const costo = d.medida === "calificado" ? n.costoPorCalificado : n.cpl;
  // La semana más nueva que se puede pedir es la que terminó el domingo pasado:
  // la página no ofrece ir a una semana que todavía no existe.
  const ultima = esUltimaSemana(d.semana.hasta);

  return (
    <>
      {/* El número que el cliente vino a buscar. */}
      <div className="text-[13px] font-medium text-l-tinta-2">{d.medida === "calificado" ? "Cada consulta calificada costó" : "Cada consulta costó"}</div>
      {costo != null ? (
        <div className="mb-1 mt-1.5 text-[44px] font-semibold leading-none tracking-[-0.03em] min-[360px]:text-[52px]">{pesos(costo)}</div>
      ) : n.leads === 0 ? (
        <div className="mb-1 mt-1.5 text-[28px] font-semibold leading-tight">No llegaron consultas</div>
      ) : (
        <div className="mb-1 mt-1.5 text-[28px] font-medium italic leading-tight text-l-tinta-3">sin dato</div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <EstadoObjetivoMarca e={d.estado} />
        <span className="text-[13px] text-l-tinta-3">
          {n.objetivo != null
            ? `Objetivo: ${pesos(n.objetivo)} por consulta${n.objetivoFuente === "historial" ? " (propuesto por LMTM: 20% menos que tu último mes)" : ""}`
            : "Todavía no acordamos un objetivo de costo por consulta"}
        </span>
      </div>
      {d.medida === "lead" && (
        <p className="mt-2 text-[13px] text-l-tinta-3">El costo por consulta calificada va a aparecer cuando conectemos tu sistema de ventas.</p>
      )}

      {/* Los números de la semana, cada uno contra la anterior. */}
      <dl className="mt-7 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-l-linea pt-5 min-[520px]:grid-cols-3">
        <Numero etiqueta="Inversión" valor={n.inversion == null ? null : pesos(n.inversion)} actual={n.inversion} anterior={n.anterior.inversion} />
        <Numero etiqueta="Consultas" valor={n.leads == null ? null : entero(n.leads)} actual={n.leads} anterior={n.anterior.leads} />
        {n.ventas != null ? (
          <Numero etiqueta="Ventas (Meta)" valor={entero(n.ventas)} />
        ) : (
          <Numero etiqueta="Consultas calificadas" valor={n.calificados == null ? null : entero(n.calificados)} />
        )}
      </dl>
      {n.leadsDudosos && (
        <p className="mt-3 flex gap-1.5 text-[13px] text-l-tinta-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--l-atencion)" }} aria-hidden />
          <span>Las consultas incluyen conversiones de Google que en tu cuenta no son confiables (Google cuenta acciones que no son consultas). Las estamos revisando.</span>
        </p>
      )}

      <Franja titulo="Cómo viene">
        <Tendencia d={d} />
      </Franja>

      {d.narrativa && (
        <Franja titulo="La semana">
          <p className="text-[16px] leading-[1.55]">{d.narrativa.resumen}</p>
          <Lista titulo="Lo que hicimos" items={d.narrativa.hicimos} />
          <Lista titulo="Lo que aprendimos" items={d.narrativa.aprendimos} />
          <Lista titulo="La semana que viene" items={d.narrativa.proximos} numerada />
        </Franja>
      )}

      {d.pedidos.length > 0 && (
        <Franja titulo="Lo que necesitamos de vos">
          <ul className="space-y-2 border-l-[3px] border-l-l-marca pl-4">
            {d.pedidos.map((p) => (
              <li key={p} className="text-[15px] font-medium leading-[1.45]">
                {p}
              </li>
            ))}
          </ul>
        </Franja>
      )}

      <Franja titulo="Por campaña">
        <Campanas d={d} />
      </Franja>

      <nav className="mt-9 flex items-center justify-between gap-2 border-t border-l-linea pt-4 text-[14px]">
        <BotonSemana onClick={() => onSemana(sumarDias(d.semana.desde, -7))}>
          <ChevronLeft className="h-4 w-4" aria-hidden /> Semana anterior
        </BotonSemana>
        <BotonSemana onClick={() => onSemana(sumarDias(d.semana.desde, 7))} disabled={ultima}>
          Semana siguiente <ChevronRight className="h-4 w-4" aria-hidden />
        </BotonSemana>
      </nav>

      <footer className="mt-6 space-y-2 text-[12px] text-l-tinta-3">
        <p>
          Números de Meta y Google hasta el domingo {fechaCorta(d.semana.hasta)}. Lo que todavía no se puede medir dice “sin dato”, nunca 0.
          {d.publicadoAt && ` Resumen de la semana escrito por tu equipo de LMTM.`}
        </p>
        <p>
          <a className="font-semibold text-l-marca underline-offset-2 hover:underline" href={`/public/dashboards/${encodeURIComponent(slug)}/detalle`}>
            Ver el detalle de anuncios, audiencia y redes
          </a>
        </p>
      </footer>
    </>
  );
}

/** ¿El domingo `hasta` es el último que terminó? Entonces no hay "semana siguiente". */
function esUltimaSemana(hasta: string): boolean {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return sumarDias(hasta, 7) >= hoy;
}

function BotonSemana({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded-[10px] px-2 font-medium text-l-tinta-2 disabled:opacity-40" {...props}>
      {children}
    </button>
  );
}

/** Un número de la semana con su cambio contra la anterior, en palabras. */
function Numero({ etiqueta, valor, actual, anterior }: { etiqueta: string; valor: string | null; actual?: number | null; anterior?: number | null }) {
  let cambio: ReactNode = null;
  if (actual != null && anterior != null && anterior > 0) {
    const pct = Math.round(((actual - anterior) / anterior) * 100);
    const Icono = pct >= 0 ? ArrowUp : ArrowDown;
    cambio = (
      <span className="mt-0.5 inline-flex items-center gap-0.5 text-[12px] text-l-tinta-3">
        {pct !== 0 && <Icono className="h-3 w-3" aria-hidden />}
        {pct === 0 ? "igual que la semana anterior" : `${Math.abs(pct)}% ${pct > 0 ? "más" : "menos"} que la anterior`}
      </span>
    );
  }
  return (
    <div>
      <dt className="text-[12px] font-medium text-l-tinta-2">{etiqueta}</dt>
      <dd className="mt-0.5">
        {valor == null ? <span className="text-[20px] italic text-l-tinta-3">sin dato</span> : <span className="text-[22px] font-semibold tracking-[-0.01em]">{valor}</span>}
        <div>{cambio}</div>
      </dd>
    </div>
  );
}

function Lista({ titulo, items, numerada }: { titulo: string; items: string[]; numerada?: boolean }) {
  if (items.length === 0) return null;
  const Tag = numerada ? "ol" : "ul";
  return (
    <div className="mt-5">
      <h3 className="text-[13px] font-semibold text-l-tinta-2">{titulo}</h3>
      <Tag className={`mt-1.5 space-y-1.5 pl-5 text-[15px] leading-[1.5] ${numerada ? "list-decimal" : "list-disc"}`}>
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </Tag>
    </div>
  );
}

/**
 * Costo por consulta de las últimas 8 semanas, con el objetivo como línea.
 * Un solo eje (pesos), barras finas con 2 px de aire, la semana del informe
 * en el tono fuerte y las demás en el suave (dataviz). Las semanas sin dato
 * quedan vacías y lo dicen; los números exactos, en la tabla de abajo.
 */
function Tendencia({ d }: { d: InformePublico }) {
  const puntos = d.tendencia;
  const objetivo = d.numeros.objetivo;
  const tope = Math.max(...puntos.map((p) => p.cpl ?? 0), objetivo ?? 0) * 1.12 || 1;
  const alto = 140;
  const y = (v: number) => alto - (v / tope) * alto;
  return (
    <div>
      <div className="relative" style={{ height: alto + 22 }}>
        <svg viewBox={`0 0 ${puntos.length * 40} ${alto}`} preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-[140px] w-full" role="img" aria-label="Costo por consulta de las últimas 8 semanas; los números están en la tabla de abajo">
          <line x1="0" x2={puntos.length * 40} y1={alto - 0.5} y2={alto - 0.5} stroke="var(--l-linea-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {puntos.map((p, i) =>
            p.cpl == null ? null : (
              <rect key={p.desde} x={i * 40 + 6} y={y(p.cpl)} width={28} height={alto - y(p.cpl)} rx={4}
                fill={p.desde === d.semana.desde ? "var(--l-marca)" : "color-mix(in srgb, var(--l-marca) 38%, var(--l-papel))"}>
                <title>{`Semana del ${fechaCorta(p.desde)}: ${pesos(p.cpl)} por consulta`}</title>
              </rect>
            ),
          )}
          {objetivo != null && (
            <line x1="0" x2={puntos.length * 40} y1={y(objetivo)} y2={y(objetivo)} stroke="var(--l-tinta-2)" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {objetivo != null && (
          <span className="absolute right-0 -translate-y-full pb-0.5 text-[11px] font-medium text-l-tinta-2" style={{ top: y(objetivo) }}>
            Objetivo {pesos(objetivo)}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 grid text-center text-[11px] text-l-tinta-3" style={{ gridTemplateColumns: `repeat(${puntos.length}, 1fr)` }}>
          {puntos.map((p) => (
            <span key={p.desde} className={p.desde === d.semana.desde ? "font-semibold text-l-tinta" : ""}>
              {fechaCorta(p.desde)}
            </span>
          ))}
        </div>
      </div>
      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer text-l-tinta-2">Ver los números semana por semana</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-[12px] text-l-tinta-3">
            <tr>
              <th className="py-1 font-medium">Semana del</th>
              <th className="py-1 text-right font-medium">Inversión</th>
              <th className="py-1 text-right font-medium">Consultas</th>
              <th className="py-1 text-right font-medium">Por consulta</th>
            </tr>
          </thead>
          <tbody>
            {[...puntos].reverse().map((p) => (
              <tr key={p.desde} className="border-t border-l-linea">
                <td className="py-1.5">{fechaCorta(p.desde)}</td>
                <td className="py-1.5 text-right">{p.inversion == null ? "sin dato" : pesos(p.inversion)}</td>
                <td className="py-1.5 text-right">{p.leads == null ? "sin dato" : entero(p.leads)}</td>
                <td className="py-1.5 text-right">{p.cpl == null ? (p.leads === 0 ? "sin consultas" : "sin dato") : pesos(p.cpl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Campanas({ d }: { d: InformePublico }) {
  if (d.campanas == null) return <p className="text-[14px] italic text-l-tinta-3">sin dato: no hay una cuenta de publicidad conectada</p>;
  if (d.campanas.length === 0) return <p className="text-[14px] text-l-tinta-2">Ninguna campaña gastó esta semana.</p>;
  return (
    <ul>
      {d.campanas.map((c) => (
        <li key={`${c.plataforma}:${c.nombre}`} className="border-t border-l-linea py-3.5 last:border-b">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[15px] font-medium leading-[1.35]">{c.nombre}</div>
              <div className="mt-0.5 text-[12px] text-l-tinta-3">
                {c.plataforma === "google" ? "Google" : "Meta"} · {pesos(c.inversion)} · {entero(c.leads)} {c.leads === 1 ? "consulta" : "consultas"}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[17px] font-semibold">{c.cpl == null ? <span className="text-[14px] font-normal italic text-l-tinta-3">sin consultas</span> : pesos(c.cpl)}</div>
              {c.cpl != null && <div className="text-[11px] text-l-tinta-3">por consulta</div>}
            </div>
          </div>
          <div className="mt-1">
            {c.leadsDudosos ? (
              <span className="text-[12px] text-l-tinta-2">Google cuenta como conversión acciones que no son consultas: este número no se compara.</span>
            ) : (
              <EstadoObjetivoMarca e={c.estado} chico />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
