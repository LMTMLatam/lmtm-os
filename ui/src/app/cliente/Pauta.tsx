// Ficha del cliente, sección partida de pages/ClientDashboard.tsx (rediseño 20/11).
import { Link } from "@/lib/router";
import { type Client, type ClientAdsSummary } from "../../api/clients";
import { PaidMediaDashboard } from "../../pages/PaidMediaDashboard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Facebook, Layers } from "lucide-react";

export function PaidMediaTab({ client, ads }: { client: Client; ads?: ClientAdsSummary }) {
  const hasAccounts = (ads?.accounts?.length ?? 0) > 0;
  const fmtSpend = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: client.currency,
      maximumFractionDigits: 0,
    }).format(n);
  const fmtSpend2 = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: client.currency,
      maximumFractionDigits: 2,
    }).format(n);
  const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

  if (!hasAccounts) {
    const metaConnected = ads?.oauthReady?.meta === true;
    return (
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-blue-500/10 p-2.5 shrink-0">
            <Facebook className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 space-y-2">
            {metaConnected ? (
              <>
                <h3 className="text-sm font-medium">Asigná páginas y adsets a {client.name}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Meta ya está conectado a nivel agencia. Para ver campañas de {client.name} en este dashboard,
                  abrí el selector y asigná las páginas / cuentas publicitarias / conjuntos de anuncios que correspondan a este cliente.
                </p>
                <div className="flex items-center gap-2 pt-2 flex-wrap">
                  <Button size="sm" asChild>
                    <Link to="/connect-ads">
                      <Layers className="h-3.5 w-3.5 mr-1.5" />
                      Abrir selector de páginas y adsets
                    </Link>
                  </Button>
                  {ads?.oauthStartUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { window.location.href = ads.oauthStartUrl!; }}
                    >
                      <Facebook className="h-3.5 w-3.5 mr-1.5" />
                      Reconectar Meta
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-medium">Connect Meta to see paid media for {client.name}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Link a Meta (Facebook + Instagram) ad account to pull campaigns, spend, impressions, clicks, CTR and leads.
                  Click below to start the OAuth flow; on success you'll be asked to pick the ad account, page and LMTM client, and the dashboard will populate after the first sync.
                </p>
                <div className="flex items-center gap-2 pt-2 flex-wrap">
                  {ads?.oauthStartUrl ? (
                    <Button
                      size="sm"
                      onClick={() => { window.location.href = ads.oauthStartUrl!; }}
                    >
                      <Facebook className="h-3.5 w-3.5 mr-1.5" />
                      Connect Meta
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      <Facebook className="h-3.5 w-3.5 mr-1.5" />
                      Meta not configured (admin must set META_APP_ID + META_APP_SECRET)
                    </Button>
                  )}
                  <Link
                    to="/connect-ads"
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Ir al selector de páginas
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return <PaidMediaDashboard client={client} ads={ads!} />;
}

