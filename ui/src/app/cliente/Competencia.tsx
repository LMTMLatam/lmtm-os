// Ficha del cliente, sección partida de pages/ClientDashboard.tsx (rediseño 20/11).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientsApi, type Client } from "../../api/clients";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Facebook } from "lucide-react";

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

