// LMTM: Hoy. La pantalla para decidir, pensada para el celular.
//
// Arriba solo los incidentes (nivel 5). Después la plata parada y las
// decisiones ordenadas por plata, cada una con su por qué y UN botón que la
// ejecuta por las rutas con guardas. Abajo, lo hecho que espera el dato y lo
// que estamos viendo (cobertura). Diseño: skill lmtm-diseno, dirección
// "Parte del día" (ver el PR de B2 para la comparación con la otra).

import { useQuery } from "@tanstack/react-query";
import { Hourglass, OctagonAlert, WifiOff } from "lucide-react";
import { decisionesApi, type Fuente, type Hoy as DatosHoy } from "../api/decisiones";
import {
  BarraCobertura,
  BloqueIncidente,
  FilaDecision,
  Franja,
  LeyendaCobertura,
  LmtmPantalla,
} from "../lmtm/componentes";
import { fechaLarga, haceCuanto, horaCorta, pesos } from "../lmtm/formato";

const NOMBRE_FUENTE: Record<Fuente, string> = { meta_ads: "Meta", google_ads: "Google", organico: "Redes" };

export function Hoy() {
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["lmtm", "hoy"],
    queryFn: () => decisionesApi.hoy(),
    staleTime: 60_000,
    // Se mira desde el celular varias veces por día: que esté al día sin recargar.
    refetchInterval: 5 * 60_000,
  });

  return (
    <LmtmPantalla titulo="Hoy" subtitulo={fechaLarga(new Date())} panel="/clients">
      {isLoading && <p className="text-[14px] text-l-tinta-3">Cargando…</p>}
      {error && (
        <p className="flex gap-1.5 text-[14px] text-l-critico-texto" role="alert">
          <OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> No se pudo cargar Hoy: {error instanceof Error ? error.message : "error"}
        </p>
      )}
      {data && (
        // Al refrescar se mantiene lo anterior atenuado: sin saltos ni esqueletos.
        <div className={isFetching ? "opacity-80 transition-opacity" : "transition-opacity"}>
          <Contenido h={data} />
        </div>
      )}
    </LmtmPantalla>
  );
}

function Contenido({ h }: { h: DatosHoy }) {
  // La cuenta de clientes viene del server, del mismo conjunto que sumó la
  // plata: contarlos acá mezclaba los que no tienen plata medida.
  const clientesParados = h.clientesParados;

  return (
    <>
      {h.whatsapp === "desconectado" && (
        <p className="mb-6 flex gap-2 rounded-xl border-l-[3px] border-l-l-critico bg-l-critico-suave px-3 py-2.5 text-[14px]" role="alert">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-l-critico" aria-hidden />
          <span>
            <span className="font-semibold">El WhatsApp de avisos está desconectado.</span> Mientras siga así no sale ningún aviso: esta pantalla es el único lugar donde se ven los incidentes.
          </span>
        </p>
      )}

      {/* Arriba SOLO los incidentes (PLAN, superficies): lo que no puede esperar
          va antes que cualquier número. Sin incidentes, la plata abre la pantalla. */}
      {h.incidentes.length > 0 && (
        <Franja titulo="Incidentes" cantidad={h.incidentes.length} icono={<OctagonAlert className="h-4 w-4" aria-hidden />} critica primera>
          <ul>
            {h.incidentes.map((d) => (
              <BloqueIncidente key={d.id} d={d} />
            ))}
          </ul>
        </Franja>
      )}

      <div className="text-[13px] font-medium text-l-tinta-2">Plata parada por día</div>
      {h.plataParada != null ? (
        <div className="mb-1 mt-1.5 text-[44px] font-semibold leading-none tracking-[-0.03em] min-[360px]:text-[52px]">{pesos(h.plataParada)}</div>
      ) : (
        <div className="mb-1 mt-1.5 text-[28px] font-medium italic leading-tight text-l-tinta-3">sin dato</div>
      )}
      <div className="text-[13px] text-l-tinta-3">
        {h.plataParada != null && `en ${clientesParados} ${clientesParados === 1 ? "cliente" : "clientes"} · `}
        datos hasta ayer
        {h.ultimaCorrida ? ` · actualizado a las ${horaCorta(h.ultimaCorrida)}` : " · el motor todavía no corrió"}
      </div>

      <Franja titulo="Para decidir hoy" cantidad={h.decisiones.length}>
        {h.decisiones.length === 0 ? (
          <p className="text-[14px] text-l-tinta-2">No hay nada para decidir. Si algo cambia, aparece acá.</p>
        ) : (
          <ul>
            {h.decisiones.map((d, i) => (
              <FilaDecision key={d.id} d={d} n={i + 1} />
            ))}
          </ul>
        )}
      </Franja>

      {h.esperando.length > 0 && (
        <Franja titulo="Hecho, esperando el dato" cantidad={h.esperando.length} icono={<Hourglass className="h-4 w-4" aria-hidden />}>
          <ul className="space-y-2">
            {h.esperando.map((d) => (
              <li key={d.id} className="text-[14px] text-l-tinta-2">
                <span className="font-medium text-l-tinta">{d.cliente}</span> · {d.que}
                {d.ejecutadaAt && <span className="text-l-tinta-3"> · {haceCuanto(d.ejecutadaAt)}</span>}
              </li>
            ))}
          </ul>
        </Franja>
      )}

      <Franja titulo="Qué estamos viendo">
        {h.cobertura ? (
          <>
            {(Object.keys(NOMBRE_FUENTE) as Fuente[]).map((f) => (
              <BarraCobertura key={f} nombre={NOMBRE_FUENTE[f]} conteo={h.cobertura!.porFuente[f]} total={h.cobertura!.clientes} />
            ))}
            <LeyendaCobertura />
            {h.sinMeta.length > 0 && (
              <p className="mt-3 text-[13px] text-l-tinta-2">
                {h.sinMeta.length} {h.sinMeta.length === 1 ? "cliente no tiene" : "clientes no tienen"} la cuenta de Meta conectada:{" "}
                {h.sinMeta
                  .slice(0, 6)
                  .map((d) => d.cliente)
                  .join(", ")}
                {h.sinMeta.length > 6 && ` y ${h.sinMeta.length - 6} más`}.
              </p>
            )}
          </>
        ) : (
          <p className="text-[14px] italic text-l-tinta-3">sin dato: no se pudo leer la salud de las fuentes</p>
        )}
      </Franja>

      <div className="mt-7 flex justify-between text-[12px] text-l-tinta-3">
        <span>
          WhatsApp de avisos: {h.whatsapp === "conectado" ? "conectado" : h.whatsapp === "conectando" ? "conectando" : h.whatsapp === "desconectado" ? "desconectado" : "sin dato"}
        </span>
      </div>
    </>
  );
}
