// Integraciones → Google Analytics + Search Console (13/10).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Plug, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { webApi } from "../api/web";
import { Button } from "@/components/ui/button";

/** Los errores de Google traen el link para habilitar la API: que se pueda clickear. */
export function ConLinks({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(https?:\/\/\S+)/g).map((t, i) =>
        /^https?:\/\//.test(t)
          ? <a key={i} href={t} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 break-all">{t}</a>
          : <span key={i}>{t}</span>,
      )}
    </>
  );
}

export function WebGoogleCard({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["web-estado"], queryFn: webApi.estado, refetchInterval: 60_000 });
  const sincronizar = useMutation({ mutationFn: webApi.sincronizar, onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ["web-estado"] }), 30_000) });
  const quitar = useMutation({ mutationFn: webApi.desconectar, onSuccess: () => qc.invalidateQueries({ queryKey: ["web-estado"] }) });
  const params = new URLSearchParams(window.location.search);
  const ok = params.get("google_web") === "ok";
  const error = params.get("google_web_error");
  const d = q.data;
  const conError = d?.clientes.filter((c) => c.error) ?? [];
  const sinVincular = d?.clientes.filter((c) => c.web && !c.gscSitio && !c.ga4Nombre && !c.error) ?? [];

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Plug className="h-4 w-4 text-muted-foreground" />
            Google Analytics + Search Console
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-prose">
            Visitas, conversiones y búsquedas en Google de la web de cada cliente. Conectá una cuenta de Google que ya tenga acceso a sus
            propiedades (solo lectura): cada cliente se vincula solo por la web cargada en Marca, y se puede elegir a mano en su ficha → Web.
          </p>
        </div>
        {d && d.conexiones.some((c) => c.estado === "activa") ? (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
          </span>
        ) : null}
      </div>
      <div className="text-xs text-muted-foreground mb-3">
        <span className="font-medium text-foreground/70">Permisos:</span> webmasters.readonly, analytics.readonly
      </div>

      {ok && <p className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300">Cuenta conectada. La primera sincronización tarda unos minutos.</p>}
      {error && <p className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-300"><ConLinks texto={error} /></p>}

      {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}

      {d && d.conexiones.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {d.conexiones.map((c) => (
            <div key={c.id} className="rounded-md border border-border p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium text-foreground min-w-0">
                  {c.estado === "activa" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />}
                  <span className="truncate">{c.email}</span>
                </span>
                <Button size="sm" variant="ghost" className="h-7 px-2" disabled={quitar.isPending}
                  onClick={() => { if (window.confirm(`¿Quitar ${c.email}? Se le devuelve el permiso a Google y dejan de sincronizarse sus propiedades.`)) quitar.mutate(c.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {c.ultimoError && <p className="mt-1 text-red-700 dark:text-red-300"><ConLinks texto={c.ultimoError} /></p>}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            {d.resumen.conWeb} de {d.resumen.clientes} clientes con web · {d.resumen.conSearchConsole} con Search Console · {d.resumen.conAnalytics} con Analytics
          </p>
          {conError.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-red-700 dark:text-red-300">{conError.length} clientes con error</summary>
              <ul className="mt-1 space-y-1">
                {conError.map((c) => <li key={c.clientId}><Link to={`/c/${c.slug}/web`} className="font-medium underline-offset-2 hover:underline">{c.nombre}</Link>: <ConLinks texto={c.error!} /></li>)}
              </ul>
            </details>
          )}
          {sinVincular.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">{sinVincular.length} clientes con web y sin propiedad encontrada</summary>
              <p className="mt-1 text-muted-foreground">
                {sinVincular.map((c, i) => <span key={c.clientId}>{i ? ", " : ""}<Link to={`/c/${c.slug}/web`} className="underline-offset-2 hover:underline">{c.nombre}</Link></span>)}
              </p>
            </details>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={d?.conexiones.length ? "outline" : "default"} onClick={() => window.open(webApi.conectarUrl(companyId), "_blank", "noopener,noreferrer")}>
          <Plug className="h-3.5 w-3.5" />
          <span className="ml-1.5">{d?.conexiones.length ? "Conectar otra cuenta" : "Conectar cuenta de Google"}</span>
        </Button>
        {d && d.conexiones.length > 0 && (
          <Button size="sm" variant="outline" disabled={sincronizar.isPending || sincronizar.isSuccess} onClick={() => sincronizar.mutate()}>
            <RefreshCw className={`h-3.5 w-3.5 ${sincronizar.isPending ? "animate-spin" : ""}`} />
            <span className="ml-1.5">{sincronizar.isSuccess ? "Sincronizando…" : "Sincronizar ahora"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
