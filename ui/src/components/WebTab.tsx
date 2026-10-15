// Ficha del cliente → Web: Search Console + Analytics 4 (13/10).
// null se muestra "sin dato", nunca 0. Las ventanas terminan donde el dato ya es
// final (Search Console hoy-3, Analytics hoy-2), por eso no llegan a ayer.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { TrabajoDelCliente } from "../app/Trabajo";
import { webApi, type WebRendimiento } from "../api/web";
import { ConLinks } from "./WebGoogleCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const n = (v: number | null | undefined, dec = 0) =>
  v == null ? "sin dato" : v.toLocaleString("es-AR", { maximumFractionDigits: dec, minimumFractionDigits: 0 });
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ruta = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };

function Variacion({ pct, alReves = false }: { pct: number | null; alReves?: boolean }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">sin comparación</span>;
  const bueno = alReves ? pct < 0 : pct > 0;
  return (
    <span className={`text-xs tabular-nums ${pct === 0 ? "text-muted-foreground" : bueno ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
      {pct > 0 ? "+" : ""}{n(pct, 1)}% vs. período anterior
    </span>
  );
}

function Kpi({ titulo, valor, pie }: { titulo: string; valor: string; pie?: React.ReactNode }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
      {pie ? <div className="mt-0.5">{pie}</div> : null}
    </Card>
  );
}

function Tabla({ titulo, ayuda, cols, filas }: { titulo: string; ayuda?: string; cols: string[]; filas: Array<Array<React.ReactNode>> }) {
  if (filas.length === 0) return null;
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {ayuda ? <p className="mt-0.5 text-xs text-muted-foreground">{ayuda}</p> : null}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              {cols.map((c, i) => <th key={c} className={`py-1 pr-3 font-medium ${i > 0 ? "text-right" : ""}`}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-t border-border">
                {f.map((c, j) => <td key={j} className={`py-1.5 pr-3 ${j > 0 ? "text-right tabular-nums whitespace-nowrap" : "break-all"}`}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Vincular({ slug, w, onListo }: { slug: string; w: WebRendimiento; onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const inv = useQuery({ queryKey: ["web-inventario"], queryFn: () => webApi.inventario(), enabled: abierto });
  const [gsc, setGsc] = useState(w.sitioSearchConsole ?? "");
  const [ga, setGa] = useState(w.propiedadAnalytics?.id ?? "");
  const guardar = useMutation({ mutationFn: (b: Parameters<typeof webApi.vincular>[1]) => webApi.vincular(slug, b), onSuccess: () => { setAbierto(false); onListo(); } });
  if (!abierto) {
    return <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>Elegir sitio y propiedad a mano</Button>;
  }
  return (
    <Card className="p-3 space-y-2">
      {inv.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      {inv.data && (
        <>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Search Console</span>
            <select value={gsc} onChange={(e) => setGsc(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">— ninguno —</option>
              {inv.data.sitios.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Google Analytics 4</span>
            <select value={ga} onChange={(e) => setGa(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">— ninguna —</option>
              {inv.data.propiedades.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.cuenta}{p.webs.length ? ` (${p.webs.join(", ")})` : ""}</option>)}
            </select>
          </label>
          {inv.data.errores.map((e) => <p key={e.email + e.error} className="text-xs text-red-700 dark:text-red-300">{e.email}: <ConLinks texto={e.error} /></p>)}
        </>
      )}
      {guardar.error ? <p className="text-xs text-red-700 dark:text-red-300">{(guardar.error as Error).message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={guardar.isPending || !inv.data} onClick={() => guardar.mutate({ gscSitio: gsc || null, ga4Propiedad: ga || null })}>
          {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}<span className={guardar.isPending ? "ml-1.5" : ""}>Guardar y sincronizar</span>
        </Button>
        {w.elegidaPor === "persona" && (
          <Button size="sm" variant="outline" disabled={guardar.isPending} onClick={() => guardar.mutate({ automatico: true })}>Volver a automático</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
      </div>
    </Card>
  );
}

export function WebTab({ clientSlug, clientId }: { clientSlug: string; clientId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["web", clientSlug], queryFn: () => webApi.rendimiento(clientSlug) });
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  const w = q.data;
  if (!w) return <p className="text-sm text-muted-foreground">No se pudo leer la web de este cliente.</p>;
  const g = w.searchConsole;
  const a = w.analytics;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {w.web ? (
            <a href={w.web} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium hover:underline">
              {w.web} <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          ) : <span className="text-muted-foreground">Sin web cargada en Marca</span>}
          <span className="text-xs text-muted-foreground">Search Console: {w.sitioSearchConsole ?? "sin vincular"}</span>
          <span className="text-xs text-muted-foreground">Analytics: {w.propiedadAnalytics?.nombre ?? w.propiedadAnalytics?.id ?? "sin vincular"}</span>
          {w.elegidaPor && <span className="text-xs text-muted-foreground">Elegida {w.elegidaPor === "persona" ? "a mano" : "sola por la web"}</span>}
          {w.sincronizadoAt && <span className="text-xs text-muted-foreground">Actualizado {new Date(w.sincronizadoAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</span>}
        </div>
        {w.error && <p className="text-xs text-red-700 dark:text-red-300"><ConLinks texto={w.error} /></p>}
        {w.falta.length > 0 && (
          <ul className="text-xs text-muted-foreground list-disc pl-4">{w.falta.map((f) => <li key={f}>{f}</li>)}</ul>
        )}
        <Vincular key={`${w.sitioSearchConsole}|${w.propiedadAnalytics?.id}`} slug={clientSlug} w={w} onListo={() => qc.invalidateQueries({ queryKey: ["web", clientSlug] })} />
      </Card>

      {g && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Google · búsquedas del {ddmm(g.ventana.desde)} al {ddmm(g.ventana.hasta)}{g.diasConDato < 28 ? ` (${g.diasConDato} días con dato)` : ""}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi titulo="Clics desde Google" valor={n(g.clics)} pie={<Variacion pct={g.variacionClicsPct} />} />
            <Kpi titulo="Veces que apareció" valor={n(g.impresiones)} pie={<Variacion pct={g.variacionImpresionesPct} />} />
            <Kpi titulo="Posición media" valor={n(g.posicionMedia, 1)} pie={<span className="text-xs text-muted-foreground">antes {n(g.anterior.posicionMedia, 1)} · más bajo es mejor</span>} />
            <Kpi titulo="Clics / apariciones" valor={g.ctr == null ? "sin dato" : `${n(g.ctr, 1)}%`} />
          </div>
        </section>
      )}

      {g && (
        <Tabla
          titulo="Búsquedas para subir"
          ayuda="Aparece en posición 4 a 20 con muchas impresiones: un contenido que responda la búsqueda o mejorar esa página la puede subir. También sirven como ganchos para redes."
          cols={["Búsqueda", "Posición", "Impresiones", "Clics", "Página"]}
          filas={g.oportunidades.map((o) => [o.consulta, n(o.posicion, 1), n(o.impresiones), n(o.clics), o.pagina ? ruta(o.pagina) : "—"])}
        />
      )}
      {g && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Tabla titulo="Lo más buscado" cols={["Búsqueda", "Clics", "Impresiones", "Posición"]}
            filas={g.topBusquedas.map((b) => [b.consulta, n(b.clics), n(b.impresiones), n(b.posicion, 1)])} />
          <Tabla titulo="Páginas que más traen desde Google" cols={["Página", "Clics", "Impresiones", "Posición"]}
            filas={g.topPaginas.map((p) => [ruta(p.pagina), n(p.clics), n(p.impresiones), n(p.posicion, 1)])} />
        </div>
      )}

      {a && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Analytics · visitas del {ddmm(a.ventana.desde)} al {ddmm(a.ventana.hasta)}{a.diasConDato < 28 ? ` (${a.diasConDato} días con dato)` : ""}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi titulo="Visitas (sesiones)" valor={n(a.sesiones)} pie={<Variacion pct={a.variacionSesionesPct} />} />
            <Kpi titulo="Personas" valor={n(a.usuarios)} pie={<span className="text-xs text-muted-foreground">{n(a.usuariosNuevos)} nuevas</span>} />
            <Kpi titulo="Conversiones (eventos clave)" valor={n(a.eventosClave)} pie={<Variacion pct={a.variacionEventosClavePct} />} />
            <Kpi titulo="Visitas que interactúan" valor={a.tasaInteraccionPct == null ? "sin dato" : `${n(a.tasaInteraccionPct, 1)}%`} />
          </div>
          {a.eventosClaveConfigurados.length === 0 && (a.sesiones ?? 0) > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">Analytics no registró ningún evento clave: no se sabe qué visita terminó en consulta.</p>
          )}
        </section>
      )}
      {a && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Tabla titulo="De dónde llegan" cols={["Canal", "Visitas", "Conversiones", "Interacción"]}
            filas={a.canales.map((c) => [c.canal, n(c.sesiones), n(c.eventosClave), c.interaccionPct == null ? "sin dato" : `${n(c.interaccionPct, 1)}%`])} />
          <Tabla titulo="Páginas de entrada" ayuda="Con el canal: una página de pauta con poca interacción es plata que se pierde ahí." cols={["Página", "Canal", "Visitas", "Interacción"]}
            filas={a.landings.map((l) => [l.pagina, l.canal ?? "—", n(l.sesiones), l.interaccionPct == null ? "sin dato" : `${n(l.interaccionPct, 1)}%`])} />
          <Tabla titulo="Fuentes" cols={["Fuente / medio", "Visitas", "Conversiones"]}
            filas={a.fuentes.map((f) => [f.fuente, n(f.sesiones), n(f.eventosClave)])} />
          <Tabla titulo="Conversiones configuradas" cols={["Evento clave", "Veces"]}
            filas={a.eventosClaveConfigurados.map((e) => [e.evento, n(e.veces)])} />
        </div>
      )}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mejoras de web y SEO</h3>
        <p className="text-xs text-muted-foreground">
          Lo que detectaron Search Console y Analytics, en qué quedó y, cuando se hizo, qué pasó con las visitas desde Google 28 días después.
        </p>
        <TrabajoDelCliente clientId={clientId} areas={["web"]} resumen={false} />
      </section>
    </div>
  );
}
