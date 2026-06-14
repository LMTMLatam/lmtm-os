import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { waBotApi, type WaBotStatus } from "../api/waBot";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Smartphone, CheckCircle2, RefreshCw, Unlink } from "lucide-react";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  connected: { label: "Conectado", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  connecting: { label: "Esperando vinculación", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  disconnected: { label: "Desconectado", cls: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300" },
};

export function WhatsApp() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const qc = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "WhatsApp" }]);
  }, [setBreadcrumbs]);

  const statusQuery = useQuery({
    queryKey: ["wa-bot", "status"],
    queryFn: () => waBotApi.status(),
    refetchInterval: 4000,
  });

  const start = useMutation({
    mutationFn: () => waBotApi.start(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-bot", "status"] }),
  });
  const stop = useMutation({
    mutationFn: () => waBotApi.stop(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-bot", "status"] }),
  });

  const s: WaBotStatus | undefined = statusQuery.data;
  const status = s?.status ?? "disconnected";
  const meta = STATUS_META[status] ?? STATUS_META.disconnected;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-emerald-600" />
            WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bot de resúmenes de grupos. Vinculá un número para que lea los grupos y genere resúmenes automáticos con IA.
          </p>
        </div>
        <Badge className={`text-xs px-2 py-0.5 ${meta.cls}`}>{meta.label}</Badge>
      </div>

      {s && !s.openwaAvailable && (
        <Card className="p-4 border-destructive/20 bg-destructive/5">
          <p className="text-sm text-destructive">
            El gateway de WhatsApp no está disponible (OPENWA_URL no configurado o no responde).
          </p>
        </Card>
      )}

      {/* Connected */}
      {status === "connected" && (
        <Card className="p-6 flex flex-col items-center text-center gap-3">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <div>
            <p className="font-medium">WhatsApp vinculado</p>
            {s?.connectedPhone && (
              <p className="text-sm text-muted-foreground mt-0.5">+{s.connectedPhone}</p>
            )}
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            El bot ya está leyendo los grupos donde esté agregado este número. Agregalo a los grupos de clientes o equipo que quieras resumir.
          </p>
          <button
            onClick={() => { if (confirm("¿Desvincular WhatsApp? Vas a tener que escanear el QR de nuevo.")) stop.mutate(); }}
            disabled={stop.isPending}
            className="mt-2 inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50"
          >
            <Unlink className="h-3.5 w-3.5" />
            {stop.isPending ? "Desvinculando…" : "Desvincular"}
          </button>
        </Card>
      )}

      {/* Connecting — show QR */}
      {status === "connecting" && (
        <Card className="p-6 flex flex-col items-center text-center gap-4">
          <div className="w-[280px] h-[280px] bg-white rounded-md flex items-center justify-center overflow-hidden">
            {s?.qr ? (
              <img src={s.qr} alt="QR de vinculación de WhatsApp" className="w-[280px] h-[280px]" />
            ) : (
              <span className="text-sm text-zinc-500 flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Generando QR…
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground max-w-md space-y-1.5 text-left">
            <p className="font-medium text-foreground flex items-center gap-1.5">
              <Smartphone className="h-4 w-4" /> Cómo vincular
            </p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Abrí WhatsApp en el teléfono del bot.</li>
              <li>Ajustes → Dispositivos vinculados → Vincular un dispositivo.</li>
              <li>Escaneá este código. Se actualiza solo.</li>
            </ol>
          </div>
          <button
            onClick={() => stop.mutate()}
            disabled={stop.isPending}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Cancelar
          </button>
        </Card>
      )}

      {/* Disconnected — connect CTA */}
      {status === "disconnected" && (
        <Card className="p-8 flex flex-col items-center text-center gap-4">
          <MessageCircle className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground max-w-md">
            No hay ningún WhatsApp vinculado. Conectá uno para empezar a generar resúmenes de grupos.
            Recomendado: usar un número dedicado al bot, no uno personal.
          </p>
          <button
            onClick={() => start.mutate()}
            disabled={start.isPending || !s?.openwaAvailable}
            className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50"
          >
            <MessageCircle className="h-4 w-4" />
            {start.isPending ? "Iniciando…" : "Conectar WhatsApp"}
          </button>
          {start.data?.error && (
            <p className="text-xs text-rose-500">{start.data.error}</p>
          )}
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        La sesión se guarda de forma persistente: si redeployamos el servidor, no hace falta volver a escanear el QR.
      </p>
    </div>
  );
}
