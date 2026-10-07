// LMTM: lo que espera a una persona, contestado desde Hoy (fase C1).
//
// Hoy junta las tareas bloqueadas de un cliente en UNA decisión. Hasta ahora,
// para contestarlas había que ir a la pantalla de issues de paperclip; acá se
// abre la decisión y cada tarea se resuelve en el lugar:
//   · Responder → el comentario le llega al agente y la tarea vuelve a "por hacer";
//   · Ya está   → la hizo una persona, se cierra;
//   · No va     → se cancela, con el motivo.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, OctagonAlert } from "lucide-react";
import { api } from "../api/client";
import { issuesApi } from "../api/issues";
import { Boton } from "../lmtm/componentes";

interface TareaEsperando {
  identifier: string | null;
  titulo: string;
  motivo: string | null;
  agente: string | null;
  diasParado: number;
}

const esperandoApi = {
  listar: (clientId: string) => api.get<{ tareas: TareaEsperando[] }>(`/hoy/esperando?clientId=${clientId}`),
};

/** "[HUMANO] [HUMANO-BM] X" → "X": las marcas son para el sistema, no para quien lee. */
const limpiarTitulo = (t: string) => t.replace(/^(\s*\[[A-ZÁÉÍÓÚ-]+\]\s*)+/i, "");

export function TareasEsperando({ clientId }: { clientId: string }) {
  const q = useQuery({ queryKey: ["lmtm", "esperando", clientId], queryFn: () => esperandoApi.listar(clientId) });
  if (q.isLoading) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-l-tinta-3">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando las tareas…
      </p>
    );
  }
  if (q.error) return <p className="text-[13px] text-l-critico-texto">No se pudieron leer las tareas.</p>;
  const tareas = q.data?.tareas ?? [];
  if (tareas.length === 0) return <p className="text-[13px] text-l-tinta-2">Ya no queda ninguna esperando: se cierra en la próxima corrida.</p>;
  return (
    <ul className="mt-1 space-y-3">
      {tareas.map((t) => (
        <Tarea key={t.identifier ?? t.titulo} t={t} clientId={clientId} />
      ))}
    </ul>
  );
}

type Modo = "reposo" | "respondiendo" | "descartando";

function Tarea({ t, clientId }: { t: TareaEsperando; clientId: string }) {
  const qc = useQueryClient();
  const [modo, setModo] = useState<Modo>("reposo");
  const [texto, setTexto] = useState("");
  const [hecho, setHecho] = useState<{ ok: boolean; detalle: string } | null>(null);
  const id = t.identifier;
  const listo = (detalle: string) => {
    setHecho({ ok: true, detalle });
    setModo("reposo");
    void qc.invalidateQueries({ queryKey: ["lmtm", "esperando", clientId] });
  };
  const falla = (e: unknown) => setHecho({ ok: false, detalle: e instanceof Error ? e.message : "No se pudo." });
  const responder = useMutation({
    mutationFn: async () => {
      await issuesApi.addComment(id!, texto.trim());
      await issuesApi.update(id!, { status: "todo" });
    },
    onSuccess: () => listo("Respondida: el agente la retoma con tu respuesta."),
    onError: falla,
  });
  const yaEsta = useMutation({
    mutationFn: async () => {
      await issuesApi.addComment(id!, "Lo resolvió una persona (desde Hoy).");
      await issuesApi.update(id!, { status: "done" });
    },
    onSuccess: () => listo("Cerrada como hecha."),
    onError: falla,
  });
  const noVa = useMutation({
    mutationFn: async () => {
      await issuesApi.addComment(id!, `No va: ${texto.trim()}`);
      await issuesApi.update(id!, { status: "cancelled" });
    },
    onSuccess: () => listo("Cancelada. El motivo queda en la tarea."),
    onError: falla,
  });
  const ocupado = responder.isPending || yaEsta.isPending || noVa.isPending;

  return (
    <li className="rounded-xl border border-l-linea bg-l-papel/60 p-3">
      <div className="text-[12px] text-l-tinta-3">
        {[id, t.agente, t.diasParado === 0 ? "hoy" : t.diasParado === 1 ? "hace 1 día" : `hace ${t.diasParado} días`].filter(Boolean).join(" · ")}
      </div>
      <div className="mt-0.5 text-[14px] font-medium leading-[1.4]">{limpiarTitulo(t.titulo)}</div>
      {t.motivo && <p className="mt-1 text-[13px] leading-[1.45] text-l-tinta-2">{t.motivo}</p>}

      {hecho ? (
        <p className={`mt-2 flex gap-1.5 text-[13px] ${hecho.ok ? "text-l-bien-texto" : "text-l-critico-texto"}`} role="status">
          {hecho.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          {hecho.detalle}
        </p>
      ) : !id ? null : modo === "reposo" ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Boton tipo="primario" onClick={() => setModo("respondiendo")}>
            Responder
          </Boton>
          <Boton tipo="secundario" onClick={() => yaEsta.mutate()} disabled={ocupado}>
            {yaEsta.isPending ? "Cerrando…" : "Ya está hecho"}
          </Boton>
          <Boton tipo="secundario" onClick={() => setModo("descartando")}>
            No va
          </Boton>
        </div>
      ) : (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (modo === "respondiendo") responder.mutate();
            else noVa.mutate();
          }}
        >
          <textarea
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoFocus
            placeholder={modo === "respondiendo" ? "Lo que el agente necesita para seguir. Ej.: ya cargué saldo, seguí." : "Por qué no va. Ej.: el cliente dio de baja la pauta."}
            className="w-full resize-y rounded-[10px] border border-l-linea-2 bg-l-sup px-3 py-2 text-[14px] text-l-tinta"
          />
          <div className="flex gap-2">
            <Boton tipo="primario" disabled={texto.trim().length < 3 || ocupado}>
              {ocupado ? "Enviando…" : modo === "respondiendo" ? "Enviar respuesta" : "Cancelar la tarea"}
            </Boton>
            <Boton tipo="secundario" onClick={() => setModo("reposo")}>
              Volver
            </Boton>
          </div>
        </form>
      )}
    </li>
  );
}
