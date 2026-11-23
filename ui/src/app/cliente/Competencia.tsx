// Ficha del cliente, sección partida de pages/ClientDashboard.tsx (rediseño 20/11).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientsApi, type Client } from "../../api/clients";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, Facebook } from "lucide-react";

const diaMes = (f: string) => f.split("-").reverse().slice(0, 2).join("/");

/** Lo medido de sus competidores (23/11): lo último en redes, lo que les rinde y él no usa, y qué trabajan en su web. */
function Medido({ client }: { client: Client }) {
  const q = useQuery({ queryKey: ["client", client.slug, "competencia"], queryFn: () => clientsApi.competencia(client.slug), staleTime: 10 * 60_000 });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Leyendo lo último de la competencia…</p>;
  if (q.error || !q.data) return <p className="text-sm text-destructive" role="alert">No se pudo leer lo medido de la competencia: {q.error instanceof Error ? q.error.message : "error"}</p>;
  const d = q.data;
  const w = d.web;
  return (
    <>
      <Card className="p-3 space-y-2">
        <p className="text-sm font-medium">Lo último que publicaron <span className="font-normal text-muted-foreground">· Instagram, se relee todos los días</span></p>
        {d.ultimas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay publicaciones leídas de sus competidores.</p>
        ) : (
          <ul className="divide-y">
            {d.ultimas.slice(0, 8).map((p) => (
              <li key={`${p.competidor}-${p.link}-${p.fecha}`} className="flex items-start gap-3 py-2">
                <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">{diaMes(p.fecha)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm"><span className="font-medium">{p.competidor}</span> <span className="text-muted-foreground">· {p.formato ?? "publicación"}{p.angulo ? ` · ${p.angulo}` : ""}{p.meGusta != null ? ` · ${p.meGusta} me gusta` : ""}</span></span>
                  <span className="block truncate text-xs text-muted-foreground">{p.texto || "Sin texto"}</span>
                </span>
                {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Ver la publicación"><ExternalLink className="h-4 w-4" aria-hidden /></a>}
              </li>
            ))}
          </ul>
        )}
        {d.oportunidades.length > 0 && (
          <div className="pt-1">
            <p className="text-xs font-medium">Les rinde y {client.name} no lo usó en {d.dias} días</p>
            <ul className="mt-1 space-y-1">
              {d.oportunidades.map((o) => (
                <li key={o.angulo} className="text-sm">
                  {o.nombre} <span className="text-muted-foreground">· {o.competidores} {o.competidores === 1 ? "competidor" : "competidores"}{o.indiceMediano != null ? ` · ${String(o.indiceMediano).replace(".", ",")}× lo normal de su cuenta` : ""}</span>
                  {o.ejemplo && <a href={o.ejemplo} target="_blank" rel="noreferrer" className="ml-1.5 text-xs underline underline-offset-2">ejemplo</a>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {d.sinDatos.length > 0 && <p className="text-xs text-muted-foreground">Sin Instagram medido: {d.sinDatos.join(", ")}.</p>}
      </Card>

      <Card className="p-3 space-y-2">
        <p className="text-sm font-medium">Qué trabajan en su web <span className="font-normal text-muted-foreground">· términos que repiten al menos 2 competidores en su portada</span></p>
        {w.conWeb === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún competidor tiene el sitio web cargado.</p>
        ) : w.leidas === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se leyó ninguno de los {w.conWeb} sitios: se leen solos, de a una tanda por hora.</p>
        ) : w.terminos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún término se repite en dos competidores ({w.leidas} de {w.conWeb} sitios leídos).</p>
        ) : (
          <ul className="divide-y">
            {w.terminos.map((t) => (
              <li key={t.termino} className="flex items-baseline gap-3 py-1.5" title={t.hosts.join(", ")}>
                <span className="min-w-0 flex-1 text-sm">{t.termino} <span className="text-muted-foreground">· {t.competidores} competidores</span></span>
                {w.conSearchConsole && (
                  <span className={`shrink-0 text-xs tabular-nums ${t.posicionDelCliente != null && t.posicionDelCliente <= 10 ? "text-muted-foreground" : "font-medium"}`}>
                    {t.posicionDelCliente != null ? `puesto ${String(t.posicionDelCliente).replace(".", ",")} en Google` : "no aparece en Google"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {w.leidas} de {w.conWeb} sitios leídos; se releen cada semana. Es lo que el sitio declara, no cuánto se busca.
          {w.conSearchConsole ? ` A ${client.name} le faltan ${w.faltan} en la primera página.` : " Sin Search Console vinculado no se sabe en qué puesto está el cliente para cada uno."}
        </p>
      </Card>
    </>
  );
}

export function CompetidoresTab({ client }: { client: Client }) {
  const qc = useQueryClient();
  const compQuery = useQuery({
    queryKey: ["client", client.slug, "competitors"],
    queryFn: () => clientsApi.listCompetitors(client.slug),
  });
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const add = useMutation({
    mutationFn: () => clientsApi.addCompetitor(client.id, { name: name.trim(), fbPageUrl: url.trim() || null }),
    onSuccess: () => { setName(""); setUrl(""); qc.invalidateQueries({ queryKey: ["client", client.slug, "competitors"] }); },
  });
  const del = useMutation({
    mutationFn: (cid: string) => clientsApi.deleteCompetitor(client.id, cid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", client.slug, "competitors"] }),
  });

  const comps = compQuery.data?.competitors ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Competidores de {client.name}. Se usan para generar ideas diferenciadas en la pestaña <span className="font-medium">Ideas de posteos</span>.</p>

      {comps.length > 0 && <Medido client={client} />}

      <Card className="p-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Nombre</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Competidor" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Página / URL (opcional)</label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="facebook.com/… o web" />
        </div>
        <Button size="sm" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>Agregar</Button>
      </Card>

      {compQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando competidores…</p>
      ) : comps.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Sin competidores cargados. Agregá al menos uno para que las ideas se diferencien de la competencia.</Card>
      ) : (
        <div className="space-y-2">
          {comps.map((c) => (
            <Card key={c.id} className="p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.name}</p>
                {c.fbPageUrl && <a href={c.fbPageUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 inline-flex items-center gap-1"><Facebook className="h-3 w-3" /> {c.fbPageUrl}</a>}
                {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                {c.sampleAds?.length > 0 && <p className="text-[11px] text-muted-foreground mt-1">{c.sampleAds.length} anuncio(s) observado(s)</p>}
              </div>
              <Button size="sm" variant="ghost" disabled={del.isPending} onClick={() => del.mutate(c.id)}>Quitar</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

