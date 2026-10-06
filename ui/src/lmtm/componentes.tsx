// LMTM: los componentes de las pantallas donde se decide.
// Reglas en .claude/skills/lmtm-diseno/SKILL.md: la plata primero, el estado
// con ícono y palabra, aire en vez de cajas, una acción principal por fila.

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronRight, CircleHelp, Clock, LayoutGrid, Moon, OctagonAlert, Pause, Sun, Unplug, X } from "lucide-react";
import { Link } from "@/lib/router";
import { ApiError } from "../api/client";
import { useTheme } from "../context/ThemeContext";
import { decisionesApi, type Decision, type EstadoFuente, type ResultadoEjecucion } from "../api/decisiones";
import type { EstadoObjetivo } from "../api/informes";
import { etiquetaAccion, etiquetaResponsable, formatoDato, pesos, tocaLaPauta } from "./formato";

// ── Pantalla ─────────────────────────────────────────────────────────────

const CLAVE_TEMA = "lmtm.tema";

function temaGuardado(): "claro" | "oscuro" {
  // El almacenamiento del navegador puede no estar (ventana privada, bloqueado):
  // sin él, claro, que es el de por defecto.
  try {
    return window.localStorage.getItem(CLAVE_TEMA) === "oscuro" ? "oscuro" : "claro";
  } catch {
    return "claro";
  }
}

/**
 * El contenedor de una pantalla LMTM: tokens, tema y encabezado, sin la barra
 * de paperclip. `panel`: a dónde lleva el botón que abre el resto de la app.
 * Hoy es la pantalla de inicio y sin él no había forma de salir de ahí; el
 * informe para el cliente no lo pasa (el cliente no entra al panel).
 */
export function LmtmPantalla({
  titulo,
  subtitulo,
  derecha,
  panel,
  children,
}: {
  titulo: string;
  /** Debajo del título (en Hoy, la fecha): a la derecha no entra junto a los botones a 390 px. */
  subtitulo?: ReactNode;
  derecha?: ReactNode;
  panel?: string;
  children: ReactNode;
}) {
  const [tema, setTema] = useState<"claro" | "oscuro">(temaGuardado);
  useEffect(() => {
    try {
      window.localStorage.setItem(CLAVE_TEMA, tema);
    } catch {
      /* sin almacenamiento, el tema dura lo que la pestaña */
    }
  }, [tema]);
  return (
    <div className="lmtm min-h-dvh" data-tema={tema}>
      <div className="mx-auto max-w-[680px] px-4 pb-12 pt-5">
        <header className="mb-7 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-[-0.01em]">
              <span className="text-l-marca">LMTM</span> · {titulo}
            </div>
            {subtitulo && <div className="mt-0.5 text-[13px] text-l-tinta-3">{subtitulo}</div>}
          </div>
          <div className="flex items-center gap-2 text-[13px] text-l-tinta-3">
            {derecha}
            {panel && (
              <Link
                to={panel}
                className="grid h-11 w-11 place-items-center rounded-[10px] border border-l-linea-2 text-l-tinta-2"
                aria-label="Abrir el resto del panel"
                title="Clientes, bandeja y el resto del panel"
              >
                <LayoutGrid className="h-[18px] w-[18px]" aria-hidden />
              </Link>
            )}
            <button
              type="button"
              onClick={() => setTema((t) => (t === "claro" ? "oscuro" : "claro"))}
              className="grid h-11 w-11 place-items-center rounded-[10px] border border-l-linea-2 text-l-tinta-2"
              aria-label={tema === "claro" ? "Pasar a modo oscuro" : "Pasar a modo claro"}
            >
              {tema === "claro" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

/**
 * Un bloque con los tokens LMTM dentro de una pantalla de paperclip (la
 * pestaña Resumen de Cliente vive en el layout con barra lateral). Usa el tema
 * que la persona eligió en Hoy; sin botón propio para no tener dos lunas.
 */
export function LmtmBloque({ children }: { children: ReactNode }) {
  // Sigue el tema de la app (el del botón del riel): dentro del shell propio un
  // bloque con su propio tema quedaba claro sobre oscuro.
  const { theme } = useTheme();
  return (
    <div className="lmtm rounded-xl px-4 pb-8 pt-2 sm:px-6" data-tema={theme === "dark" ? "oscuro" : "claro"}>
      <div className="mx-auto max-w-[680px]">{children}</div>
    </div>
  );
}

/** Encabezado de una franja: "INCIDENTES 3". `primera`: abre la pantalla, el aire va debajo. */
export function Franja({
  titulo,
  cantidad,
  icono,
  critica,
  primera,
  children,
}: {
  titulo: string;
  cantidad?: number;
  icono?: ReactNode;
  critica?: boolean;
  primera?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={primera ? "mb-9" : "mt-9"}>
      <h2 className={`mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] ${critica ? "text-l-critico-texto" : "text-l-tinta-2"}`}>
        {icono}
        {titulo}
        {cantidad != null && <span className="font-medium text-l-tinta-3">{cantidad}</span>}
      </h2>
      {children}
    </section>
  );
}

// ── Estado contra el objetivo ────────────────────────────────────────────

/** Estado contra el objetivo: siempre ícono y palabra, el color solo acompaña. */
const ESTADO: Record<EstadoObjetivo, { label: string; Icono: typeof Check; color: string; texto: string }> = {
  en_objetivo: { label: "En el objetivo", Icono: Check, color: "var(--l-bien)", texto: "text-l-bien-texto" },
  arriba: { label: "Arriba del objetivo", Icono: AlertTriangle, color: "var(--l-atencion)", texto: "text-l-atencion-texto" },
  muy_arriba: { label: "Muy arriba del objetivo", Icono: OctagonAlert, color: "var(--l-critico)", texto: "text-l-critico-texto" },
  sin_dato: { label: "Sin dato para comparar", Icono: CircleHelp, color: "var(--l-tinta-3)", texto: "text-l-tinta-3" },
};

export function EstadoObjetivoMarca({ e, chico }: { e: EstadoObjetivo; chico?: boolean }) {
  const { label, Icono, color, texto } = ESTADO[e];
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${texto} ${chico ? "text-[12px]" : "text-[14px]"}`}>
      <Icono className={chico ? "h-3.5 w-3.5" : "h-4 w-4"} style={{ color }} aria-hidden />
      {label}
    </span>
  );
}

// ── Plata ────────────────────────────────────────────────────────────────

/** Un monto por día. null es "sin dato", nunca $0. */
export function Plata({ valor, grande }: { valor: number | null; grande?: boolean }) {
  // Suelto, "sin dato" no dice de qué: se nombra la plata para que se lea solo.
  if (valor == null) {
    return grande ? (
      <span className="text-[13px] text-l-tinta-3">
        Plata en juego: <span className="italic">sin dato</span>
      </span>
    ) : (
      <span className="text-[13px] italic text-l-tinta-3">
        sin dato<span className="block text-[11px] not-italic">de plata</span>
      </span>
    );
  }
  return (
    <span className={`whitespace-nowrap font-semibold tracking-[-0.01em] ${grande ? "text-[18px]" : "text-[20px]"}`}>
      {pesos(valor)}
      <span className={`${grande ? "ml-1 inline text-[12px]" : "block text-[11px]"} font-medium tracking-normal text-l-tinta-3`}>por día</span>
    </span>
  );
}

// ── Acciones de una decisión ─────────────────────────────────────────────

type Paso =
  | { tipo: "reposo" }
  | { tipo: "ensayo_ok"; detalle: string }
  | { tipo: "descartando" }
  | { tipo: "error"; detalle: string };

function mensajeDeError(e: unknown): string {
  // Un 422 de ejecutar trae el resultado con el motivo escrito por la guarda
  // ("El salto es de 45%..."): es lo único que sirve mostrar.
  if (e instanceof ApiError) {
    const r = (e.body as { resultado?: ResultadoEjecucion } | null)?.resultado;
    return r?.detalle ?? e.message;
  }
  return e instanceof Error ? e.message : "No se pudo completar.";
}

/**
 * El botón principal y "Descartar". Lo que toca la pauta se ENSAYA primero
 * (valida contra la cuenta sin escribir) y recién después se confirma; una
 * tarea o un "ya lo hice" van directo.
 */
export function AccionesDecision({ d }: { d: Decision }) {
  const qc = useQueryClient();
  const [paso, setPaso] = useState<Paso>({ tipo: "reposo" });
  const [motivo, setMotivo] = useState("");
  const listo = () => {
    setPaso({ tipo: "reposo" });
    // Todas las pantallas LMTM (Hoy, Cliente, Cartera) leen las mismas decisiones.
    void qc.invalidateQueries({ queryKey: ["lmtm"] });
  };
  const falla = (e: unknown) => setPaso({ tipo: "error", detalle: mensajeDeError(e) });

  const ensayar = useMutation({
    mutationFn: () => decisionesApi.ensayar(d.id),
    onSuccess: (r) => (r.resultado.ok ? setPaso({ tipo: "ensayo_ok", detalle: r.resultado.detalle }) : setPaso({ tipo: "error", detalle: r.resultado.detalle })),
    onError: falla,
  });
  const ejecutar = useMutation({ mutationFn: () => decisionesApi.ejecutar(d.id), onSuccess: listo, onError: falla });
  const hecha = useMutation({ mutationFn: () => decisionesApi.hecha(d.id), onSuccess: listo, onError: falla });
  const descartar = useMutation({ mutationFn: () => decisionesApi.descartar(d.id, motivo), onSuccess: listo, onError: falla });
  const ocupado = ensayar.isPending || ejecutar.isPending || hecha.isPending || descartar.isPending;

  const principal = () => {
    if (!d.accion) return hecha.mutate();
    if (tocaLaPauta(d.accion)) return ensayar.mutate();
    return ejecutar.mutate();
  };

  if (d.estado === "ejecutada") {
    return <p className="mt-2 text-[13px] text-l-tinta-3">Hecho. Se confirma con el próximo dato.</p>;
  }

  if (paso.tipo === "descartando") {
    return (
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          descartar.mutate();
        }}
      >
        <label className="block text-[13px] text-l-tinta-2" htmlFor={`motivo-${d.id}`}>
          ¿Por qué no? El motivo ajusta la regla que la propuso.
        </label>
        <textarea
          id={`motivo-${d.id}`}
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="w-full resize-y rounded-[10px] border border-l-linea-2 bg-l-sup px-3 py-2 text-[14px] text-l-tinta"
          placeholder="Ej.: el cliente pausó la pauta por vacaciones"
        />
        <div className="flex gap-2">
          <Boton tipo="primario" disabled={motivo.trim().length < 5 || ocupado}>
            Descartar
          </Boton>
          <Boton tipo="secundario" onClick={() => setPaso({ tipo: "reposo" })}>
            Volver
          </Boton>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-3">
      {paso.tipo === "ensayo_ok" ? (
        <div className="space-y-2">
          <p className="flex gap-1.5 text-[14px] text-l-tinta-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-l-bien" aria-hidden />
            <span>
              <span className="font-medium text-l-tinta">La cuenta lo acepta.</span> {paso.detalle.replace(/^Ensayo OK:\s*/i, "")}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Boton tipo="primario" onClick={() => ejecutar.mutate()} disabled={ocupado}>
              {ejecutar.isPending ? "Haciendo…" : "Confirmar"}
            </Boton>
            <Boton tipo="secundario" onClick={() => setPaso({ tipo: "reposo" })}>
              Cancelar
            </Boton>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Boton tipo="primario" onClick={principal} disabled={ocupado}>
            {ocupado ? "Un momento…" : etiquetaAccion(d)}
          </Boton>
          <Boton tipo="secundario" onClick={() => setPaso({ tipo: "descartando" })} disabled={ocupado}>
            Descartar
          </Boton>
        </div>
      )}
      {paso.tipo === "error" && (
        <p className="mt-2 flex gap-1.5 text-[13px] text-l-critico-texto" role="alert">
          <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>No se hizo: {paso.detalle}</span>
        </p>
      )}
    </div>
  );
}

export function Boton({ tipo, children, ...props }: { tipo: "primario" | "secundario" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "min-h-11 rounded-[10px] px-3.5 text-[14px] disabled:opacity-50";
  const estilo =
    tipo === "primario"
      ? "bg-l-tinta font-semibold text-l-papel"
      : "border border-l-linea-2 font-medium text-l-tinta-2";
  return (
    <button type={props.type ?? (tipo === "primario" && !props.onClick ? "submit" : "button")} className={`${base} ${estilo}`} {...props}>
      {children}
    </button>
  );
}

// ── Por qué ──────────────────────────────────────────────────────────────

/** La frase y, si los hay, los números de los que salió. */
export function PorQue({ d, max = 3 }: { d: Decision; max?: number }) {
  const datos = (d.porque?.datos ?? []).filter((x) => x.valor != null).slice(0, max);
  return (
    <div className="mt-1 text-[14px] leading-[1.5] text-l-tinta-2">
      {d.porque?.nota && <p className="mb-1 font-medium text-l-atencion-texto">{d.porque.nota}</p>}
      <p>{d.porque?.resumen}</p>
      {datos.length > 0 && (
        // Cada dato es una línea de texto corrido: en el celular la etiqueta y
        // el valor parten juntos, no en dos columnas que quiebran por separado.
        <ul className="mt-1.5 space-y-0.5 text-[13px]">
          {datos.map((x) => (
            <li key={x.etiqueta}>
              <span className="text-l-tinta-3">{x.etiqueta}: </span>
              <span className="font-medium text-l-tinta">{formatoDato(x.valor, x.unidad)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Filas ────────────────────────────────────────────────────────────────

/** El cliente en mayúsculas chicas y, a la derecha, a quién le toca. */
function LineaCliente({ d }: { d: Decision }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-l-tinta-2">{d.cliente}</span>
      <span className="text-[12px] text-l-tinta-3">{etiquetaResponsable(d.responsable)}</span>
    </div>
  );
}

/**
 * Una decisión de la lista: número, cliente, qué, por qué y la plata a la
 * derecha (para leer la columna de plata de arriba abajo). Los botones van
 * abajo, a lo ancho: en el celular la columna de plata no les tiene que robar
 * lugar.
 */
export function FilaDecision({ d, n }: { d: Decision; n: number }) {
  return (
    <li className="border-t border-l-linea py-[18px] last:border-b">
      <div className="grid grid-cols-[22px_1fr_auto] gap-x-3">
        <div className="pt-0.5 text-[13px] font-medium text-l-tinta-3">{n}</div>
        <div className="min-w-0">
          <LineaCliente d={d} />
          <div className="mt-0.5 text-[16px] font-medium leading-[1.4]">{d.que}</div>
          <PorQue d={d} max={2} />
        </div>
        <div className="pl-1 text-right">
          <Plata valor={d.arsPorDia} />
        </div>
      </div>
      <div className="pl-[34px]">
        <AccionesDecision d={d} />
      </div>
    </li>
  );
}

/** Un incidente: regla crítica a la izquierda, ícono y palabra en la franja. */
export function BloqueIncidente({ d }: { d: Decision }) {
  return (
    <li className="mb-2.5 rounded-r-xl border-l-[3px] border-l-l-critico bg-gradient-to-r from-l-critico-suave to-transparent py-3.5 pl-4 pr-3">
      <LineaCliente d={d} />
      <div className="mt-0.5 text-[17px] font-semibold leading-[1.35]">{d.que}</div>
      <PorQue d={d} />
      <div className="mt-2">
        <Plata valor={d.arsPorDia} grande />
      </div>
      <AccionesDecision d={d} />
    </li>
  );
}

// ── Cobertura ────────────────────────────────────────────────────────────

/**
 * `color` es el del tramo de la barra; `icono`, el del ícono al lado de la
 * palabra. Los neutros van con el ícono en tinta: el gris del tramo sobre el
 * papel no llega a 3:1 y el ícono desaparecía.
 */
export const ESTADOS_FUENTE: Array<{ k: EstadoFuente; label: string; color: string; icono: string; Icono: typeof Check }> = [
  { k: "ok", label: "Al día", color: "var(--l-bien)", icono: "var(--l-bien)", Icono: Check },
  { k: "sin_entrega", label: "Sin pauta corriendo", color: "var(--l-neutro)", icono: "var(--l-tinta-3)", Icono: Pause },
  { k: "atrasada", label: "Atrasada", color: "var(--l-atencion)", icono: "var(--l-atencion)", Icono: Clock },
  { k: "fallando", label: "Fallando", color: "var(--l-critico)", icono: "var(--l-critico)", Icono: X },
  { k: "sin_conexion", label: "Sin conectar", color: "var(--l-neutro-2)", icono: "var(--l-tinta-3)", Icono: Unplug },
];

/**
 * Parte del todo de una fuente: barra apilada de 12 px, 2 px de separación
 * entre tramos (dataviz). Debajo, cada estado con su ícono y su número: la
 * barra sola distinguía "atrasada", "fallando" y "sin conectar" solo por el
 * color.
 */
export function BarraCobertura({ nombre, conteo, total }: { nombre: string; conteo: Record<EstadoFuente, number>; total: number }) {
  const presentes = ESTADOS_FUENTE.filter((e) => conteo[e.k] > 0);
  return (
    <div className="mb-3.5 grid grid-cols-[64px_1fr] items-center gap-x-3 gap-y-1.5">
      <div className="text-[14px] font-medium">{nombre}</div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded" role="img" aria-label={`${nombre}: ${presentes.map((e) => `${e.label} ${conteo[e.k]}`).join(", ")}, de ${total}`}>
        {presentes.map((e) => (
          <span key={e.k} title={`${e.label}: ${conteo[e.k]}`} style={{ flex: conteo[e.k], background: e.color }} />
        ))}
      </div>
      <ul className="col-start-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-l-tinta-2" aria-hidden>
        {presentes.map(({ k, label, icono, Icono }) => (
          <li key={k} className="flex items-center gap-1">
            <Icono className="h-3.5 w-3.5" style={{ color: icono }} />
            <span className="font-medium text-l-tinta">{conteo[k]}</span> {label.toLowerCase()}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Qué color de tramo es cada estado. Muestra con borde: el gris de "sin conectar" casi no se ve sobre el papel. */
export function LeyendaCobertura() {
  return (
    <ul className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12px] text-l-tinta-2">
      {ESTADOS_FUENTE.map(({ k, label, color }) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-l-linea-2" style={{ background: color }} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}

export function FlechaLink({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-0.5 font-semibold text-l-marca">
      {children}
      <ChevronRight className="h-4 w-4" aria-hidden />
    </span>
  );
}
