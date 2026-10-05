import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { clientsApi, type Client, type Decisor } from "../api/clients";
import { queryKeys } from "../lib/queryKeys";

/**
 * A QUIÉN le habla todo lo que el sistema escribe para este cliente.
 *
 * No existía. Los agentes producían copy, planes y reportes sin saber quién
 * decide del otro lado ni qué le importa, así que le hablaban a nadie en
 * particular — y eso se nota en todo lo que sale.
 *
 * Lo carga una persona a propósito: esta información no se puede derivar de la
 * pauta ni del orgánico, sólo la tiene el equipo que habla con el cliente.
 *
 * El card se muestra SIEMPRE, también vacío, y en ese caso lo dice fuerte. Un
 * campo que simplemente no aparece cuando está vacío no se carga nunca, porque
 * nadie extraña lo que no ve.
 */

const CAMPOS: Array<{ k: keyof Decisor; label: string; placeholder: string; largo?: boolean }> = [
  { k: "quien", label: "Quién decide", placeholder: "Marcelo, dueño — decide él solo" },
  { k: "queLeImporta", label: "Qué le importa", placeholder: "Leads que cierren, no volumen" },
  { k: "queLoFrena", label: "Qué lo frena", placeholder: "Le fue mal con otra agencia", largo: true },
  { k: "comoHablarle", label: "Cómo hablarle", placeholder: "Directo y con números; odia el palabrerío" },
  { k: "canal", label: "Canal", placeholder: "WhatsApp" },
];

export function DecisorCard({ client }: { client: Client }) {
  const qc = useQueryClient();
  const guardado = (client.metadata?.decisor ?? {}) as Decisor;
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<Decisor>(guardado);

  const cargado = CAMPOS.some(({ k }) => guardado[k]);
  const faltan = CAMPOS.filter(({ k }) => !guardado[k]);

  const guardar = useMutation({
    mutationFn: () => {
      const limpio: Decisor = {};
      for (const { k } of CAMPOS) {
        const v = borrador[k]?.trim();
        if (v) limpio[k] = v;
      }
      return clientsApi.setDecisor(client.slug, Object.keys(limpio).length ? limpio : null);
    },
    onSuccess: () => {
      setEditando(false);
      // La ficha cachea con esta key: invalidar otra deja el card mostrando lo
      // viejo y parece que no guardo.
      qc.invalidateQueries({ queryKey: queryKeys.clients.detail(client.slug) });
    },
  });

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-lg bg-primary/15 p-1.5">
          <UserRound className="h-3.5 w-3.5 text-primary" />
        </span>
        <h3 className="text-sm font-semibold">A quién le hablamos</h3>
        {!editando && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={() => {
              setBorrador(guardado);
              setEditando(true);
            }}
          >
            {cargado ? "Editar" : "Cargar"}
          </Button>
        )}
      </div>

      {!editando && !cargado && (
        <p className="py-2 text-xs text-muted-foreground">
          Sin cargar. Todo lo que los agentes escriben para este cliente —copy, planes, reportes— le
          habla a quien decide del otro lado. Mientras esto esté vacío, le hablan a nadie en particular.
        </p>
      )}

      {!editando && cargado && (
        <div className="space-y-2 text-sm">
          {CAMPOS.filter(({ k }) => guardado[k]).map(({ k, label }) => (
            <div key={k} className="flex gap-2">
              <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
              <span className="flex-1 leading-snug">{guardado[k]}</span>
            </div>
          ))}
          {faltan.length > 0 && (
            <p className="pt-1 text-[11px] text-muted-foreground">
              Falta: {faltan.map((f) => f.label.toLowerCase()).join(", ")}.
            </p>
          )}
        </div>
      )}

      {editando && (
        <div className="space-y-2.5">
          {CAMPOS.map(({ k, label, placeholder, largo }) => (
            <label key={k} className="block">
              <span className="text-xs text-muted-foreground">{label}</span>
              {largo ? (
                <textarea
                  rows={2}
                  className="mt-0.5 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  placeholder={placeholder}
                  value={borrador[k] ?? ""}
                  onChange={(e) => setBorrador((b) => ({ ...b, [k]: e.target.value }))}
                />
              ) : (
                <input
                  className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  placeholder={placeholder}
                  value={borrador[k] ?? ""}
                  onChange={(e) => setBorrador((b) => ({ ...b, [k]: e.target.value }))}
                />
              )}
            </label>
          ))}

          <p className="text-[11px] text-muted-foreground">
            Lo que dejes vacío queda marcado como faltante para los agentes, que tienen prohibido
            suponerlo. Es mejor cargar tres campos ciertos que cinco a ojo.
          </p>

          <div className="flex items-center gap-2 pt-0.5">
            <Button size="sm" className="h-7 text-xs" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
              {guardar.isPending ? "Guardando…" : "Guardar"}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            {guardar.isError && <span className="text-xs text-destructive">No se pudo guardar.</span>}
          </div>
        </div>
      )}
    </Card>
  );
}
