// LMTM: Producción → «Tipos de video» (pedido 09/11; sección propia 11/11).
// Una plantilla de edición por tipo de video, para todos (general), para un
// rubro o para un cliente. La arman los agentes con los virales medidos de la
// competencia y la aprueba una persona. Acá el equipo la mira, agrega o cambia
// reglas, edita, aprueba, suma tipos de video propios, carga virales y baja el
// perfil para el kit de video de su PC (vtool --perfil). Datos de /api/video-tipos.
//
// Herencia: un cliente sin plantilla propia usa la de su rubro, y un rubro sin
// plantilla usa la general. Las reglas de los tres niveles se suman.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, EyeOff, ExternalLink, Loader2, OctagonAlert, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../api/client";
import { Boton } from "../lmtm/componentes";
import { Tarjeta } from "./HoyApp";

type Estado = "sin-plantilla" | "borrador" | "lista" | "aprobada" | "vieja";
interface Celda { alcance: string; tipo: string; estado: Estado; version: number; hereda?: { desde: string; estado: Estado }; virales: number; cuentas: number; actualizada: string | null }
interface Tipo { slug: string; nombre: string; descripcion: string; alcance: string; propio: boolean }
interface Grilla {
  tipos: Tipo[];
  nichos: Array<{ nicho: string; clientes: number; cuentasMedidas: number; sinTipo: number }>;
  clientes: Array<{ clave: string; nombre: string; nicho: string | null }>;
  celdas: Celda[];
  reglas: { viralDesde: number; ventanaDias: number; minVirales: number; minCuentas: number };
}
interface Regla { id: string; texto: string; origen: "persona" | "agente"; autor?: string; viral?: string; alcance?: string; desde?: string }
interface Contenido {
  objetivo?: string; duracion?: [number, number];
  estructura?: Array<{ tramo: string; desde: number; hasta: number; que: string }>;
  ganchos?: Array<{ formula: string; viral?: string }>;
  edicion?: Record<string, string>;
  promptIa?: string; noHacer?: string[]; reglas?: Regla[];
  perfil?: { nombre: string; descripcion: string; reel: Record<string, unknown>; duracion?: [number, number] };
}
interface Viral { id: string; url: string | null; cuenta: string; fecha: string; veces: number | null; texto: string; fuente: string; gancho?: string | null; notas?: string | null; red?: string | null }
interface Plantilla {
  alcance: string; nombreAlcance: string; nicho: string; tipo: string; desde: string | null;
  estado: Estado; version: number; contenido: Contenido | null; archivo: string;
  evidencia: { virales: number; cuentas: number }; guia: string | null; virales: Viral[]; noVirales: Viral[];
  validacion: { piezas: number; sirvieron: number; noSirvieron: number; motivos: Record<string, number> } | null;
  propia: { estado: Estado; version: number; contenido: Contenido; autor: string; motivo: string | null; aprobadaPor: string | null; actualizada: string } | null;
  heredada: { alcance: string; nombre: string; estado: Estado; version: number; contenido: Contenido } | null;
  reglasHeredadas: Regla[];
  versiones: Array<{ version: number; estado: string; autor: string; motivo: string | null; fecha: string }>;
}

const TODOS = "todos";
const ESTADOS: Record<Estado, { texto: string; clase: string }> = {
  "sin-plantilla": { texto: "Sin plantilla", clase: "text-l-tinta-3" },
  borrador: { texto: "Borrador", clase: "text-l-tinta-2" },
  lista: { texto: "Para revisar", clase: "text-l-atencion-texto" },
  aprobada: { texto: "Aprobada", clase: "text-l-bien-texto" },
  vieja: { texto: "Revisar (vieja)", clase: "text-l-atencion-texto" },
};
const EDICION: Array<[string, string]> = [["cortes", "Cortes"], ["subtitulos", "Subtítulos"], ["zoom", "Zoom"], ["sfx", "Efectos de sonido"], ["musica", "Música"], ["look", "Look"], ["planos", "Planos obligatorios"]];

const enc = encodeURIComponent;
const tiposApi = {
  grilla: (alcance: string) => api.get<Grilla>(`/video-tipos?alcance=${enc(alcance)}`),
  plantilla: (a: string, t: string) => api.get<Plantilla>(`/video-tipos/${enc(a)}/${enc(t)}`),
  guardar: (a: string, t: string, body: { contenido: Contenido; reglas: Regla[]; motivo: string }) => api.post<{ version: number; estado: string }>(`/video-tipos/${enc(a)}/${enc(t)}`, body),
  aprobar: (a: string, t: string) => api.post<{ ok: true }>(`/video-tipos/${enc(a)}/${enc(t)}/aprobar`, {}),
  viral: (b: Record<string, string>) => api.post<{ mensaje: string }>("/video-tipos/virales", b),
  crearTipo: (b: { nombre: string; descripcion: string; alcance: string }) => api.post<{ slug: string }>("/video-tipos/tipos", b),
  ocultarTipo: (slug: string) => api.post<{ ok: true }>(`/video-tipos/tipos/${enc(slug)}/ocultar`, {}),
};

function bajar(nombre: string, texto: string, tipo: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: tipo }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** El nombre de un alcance para leer: «general», el rubro o el cliente. */
function nombreDe(clave: string, g?: Grilla): string {
  if (clave === TODOS) return "general";
  return g?.clientes.find((c) => c.clave === clave)?.nombre ?? clave.replace(/^cliente:/, "");
}
const sinReglas = (c: Contenido | null | undefined): Contenido => { const { reglas: _r, ...resto } = c ?? {}; return resto; };

export function TiposDeVideo() {
  const [alcance, setAlcance] = useState(TODOS);
  const [abierta, setAbierta] = useState<string | null>(null);
  const grilla = useQuery({ queryKey: ["lmtm", "video-tipos", "grilla", alcance], queryFn: () => tiposApi.grilla(alcance), staleTime: 5 * 60_000, placeholderData: (prev) => prev });
  const g = grilla.data;
  const elegir = (a: string) => { setAlcance(a); setAbierta(null); };
  const celdas = useMemo(() => (g?.celdas ?? []).filter((c) => c.alcance === alcance), [g, alcance]);
  const tipos = useMemo(() => (g?.tipos ?? []).filter((t) => celdas.some((c) => c.tipo === t.slug)), [g, celdas]);
  const cliente = g?.clientes.find((c) => c.clave === alcance) ?? null;
  const rubro = alcance === TODOS ? null : cliente ? cliente.nicho : alcance;
  const info = g?.nichos.find((n) => n.nicho === rubro);

  if (grilla.isLoading) return <p className="flex items-center gap-2 text-[14px] text-l-tinta-3"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo las plantillas…</p>;
  if (grilla.error || !g) return <p className="text-[14px] text-l-critico-texto" role="alert">No se pudieron leer las plantillas: {grilla.error instanceof Error ? grilla.error.message : "error"}</p>;

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-l-tinta-3">
        Cómo se edita cada tipo de video. Hay plantillas generales, por rubro y por cliente: un cliente sin plantilla propia usa la de su rubro, y un rubro sin plantilla usa la general; las reglas de los tres niveles se suman. Las arman los agentes con los videos de la competencia que hicieron {g.reglas.viralDesde} veces o más lo normal de su propia cuenta (últimos {g.reglas.ventanaDias} días), y las aprueba una persona. Las reglas que cargues acá no las puede sacar un agente. Claude las usa desde cada PC con el conector del equipo.
      </p>

      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Para quién">
        <Chip activo={alcance === TODOS} onClick={() => elegir(TODOS)}>General</Chip>
        {g.nichos.map((n) => (
          <Chip key={n.nicho} activo={n.nicho === alcance} onClick={() => elegir(n.nicho)}>{n.nicho} <span className="opacity-70">{n.clientes}</span></Chip>
        ))}
        <select
          value={cliente ? alcance : ""}
          onChange={(e) => e.target.value && elegir(e.target.value)}
          className={`min-h-9 rounded-full border px-3 text-[13px] ${cliente ? "border-l-tinta bg-l-tinta text-l-papel" : "border-l-linea-2 bg-l-papel text-l-tinta-2"}`}
          aria-label="Cliente"
        >
          <option value="">Por cliente…</option>
          {g.clientes.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}{c.nicho ? ` · ${c.nicho}` : ""}</option>)}
        </select>
      </div>

      <p className="text-[13px] text-l-tinta-3">
        {alcance === TODOS
          ? "General: vale para todos los clientes que no tengan una plantilla de su rubro o propia."
          : cliente
            ? `Solo para ${cliente.nombre}. Lo que no tenga plantilla propia usa la de ${cliente.nicho ?? "general"}${cliente.nicho ? " (o la general)" : ""}.`
            : info?.cuentasMedidas === 0
              ? "Todavía no hay cuentas de la competencia medidas en este rubro: cargá competidores con su Instagram de empresa en la ficha de cada cliente, o un viral que encontraste."
              : `${info?.cuentasMedidas ?? 0} cuentas de la competencia medidas.${info?.sinTipo ? ` ${info.sinTipo} virales sin tipo claro (el texto no alcanzaba).` : ""}`}
        {grilla.isFetching && <Loader2 className="ml-1.5 inline h-3.5 w-3.5 animate-spin" aria-label="Actualizando" />}
      </p>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {tipos.map((t) => {
          const c = celdas.find((x) => x.tipo === t.slug);
          const e = ESTADOS[c?.estado ?? "sin-plantilla"];
          const activa = abierta === t.slug;
          return (
            <li key={t.slug}>
              <button type="button" onClick={() => setAbierta(activa ? null : t.slug)} title={t.descripcion}
                className={`h-full w-full rounded-xl border p-3 text-left ${activa ? "border-l-tinta" : "border-l-linea"} bg-l-sup hover:border-l-linea-2`}>
                <div className="text-[14px] font-medium text-l-tinta">{t.nombre}{t.alcance !== TODOS && <span className="ml-1.5 text-[11px] font-normal text-l-tinta-3">· propio de {nombreDe(t.alcance, g)}</span>}</div>
                {c?.hereda
                  ? <div className="text-[12px] text-l-tinta-2">Usa la de {nombreDe(c.hereda.desde, g)} · <span className={ESTADOS[c.hereda.estado].clase}>{ESTADOS[c.hereda.estado].texto.toLowerCase()}</span></div>
                  : <div className={`text-[12px] ${e.clase}`}>{e.texto}{c?.version ? ` · v${c.version}` : ""}</div>}
                <div className="mt-1 text-[12px] text-l-tinta-3">{c?.virales ? `${c.virales} virales de ${c.cuentas} cuentas` : "Sin virales medidos"}</div>
              </button>
            </li>
          );
        })}
      </ul>

      {abierta && (() => {
        const t = g.tipos.find((x) => x.slug === abierta);
        return <Detalle key={`${alcance}/${abierta}`} alcance={alcance} tipo={abierta} tipoInfo={t} grilla={g} onCerrar={() => setAbierta(null)} />;
      })()}

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <NuevoTipo grilla={g} alcance={alcance} />
        <CargarViral nichos={g.nichos.map((n) => n.nicho)} tipos={tipos} nicho={rubro} />
      </div>
    </div>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={activo} onClick={onClick}
      className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] ${activo ? "border-l-tinta bg-l-tinta text-l-papel" : "border-l-linea-2 text-l-tinta-2"}`}>
      {children}
    </button>
  );
}

function Detalle({ alcance, tipo, tipoInfo, grilla, onCerrar }: { alcance: string; tipo: string; tipoInfo?: Tipo; grilla: Grilla; onCerrar: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lmtm", "video-tipos", "plantilla", alcance, tipo], queryFn: () => tiposApi.plantilla(alcance, tipo) });
  const [editando, setEditando] = useState(false);
  const refrescar = () => { void qc.invalidateQueries({ queryKey: ["lmtm", "video-tipos"] }); };
  const aprobar = useMutation({ mutationFn: () => tiposApi.aprobar(alcance, tipo), onSuccess: refrescar });
  const guardar = useMutation({
    mutationFn: (b: { contenido: Contenido; reglas: Regla[]; motivo: string }) => tiposApi.guardar(alcance, tipo, b),
    onSuccess: () => { setEditando(false); refrescar(); },
  });
  const ocultar = useMutation({ mutationFn: () => tiposApi.ocultarTipo(tipo), onSuccess: () => { onCerrar(); refrescar(); } });
  const p = q.data;
  if (q.isLoading || !p) return <Tarjeta><Loader2 className="h-4 w-4 animate-spin" aria-label="Cargando" /></Tarjeta>;
  const propia = p.propia;
  const propias = propia?.contenido.reglas ?? [];
  // Sumar o cambiar una regla no toca el resto de la plantilla propia (si no hay, queda solo con reglas y sigue usando la de arriba).
  const guardarReglas = (nuevas: Regla[], motivo: string) => guardar.mutate({ contenido: sinReglas(propia?.contenido), reglas: nuevas, motivo });
  const nombreTipo = tipoInfo?.nombre ?? tipo;
  const heredaContenido = !!p.desde && p.desde !== alcance;

  return (
    <Tarjeta className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-semibold text-l-tinta">{nombreTipo} · {p.nombreAlcance}</h3>
          <p className="text-[13px] text-l-tinta-3">
            {propia
              ? <><span className={ESTADOS[propia.estado].clase}>{ESTADOS[propia.estado].texto}</span> · versión {propia.version}</>
              : "Sin plantilla propia"}
            {heredaContenido && ` · cómo se edita sale de ${nombreDe(p.desde!, grilla)} (${ESTADOS[p.estado].texto.toLowerCase()})`}
            {` · ${p.evidencia.virales} virales medidos de ${p.evidencia.cuentas} cuentas`}
            {propia?.estado === "borrador" && p.evidencia.virales < grilla.reglas.minVirales ? ` (para revisarla hacen falta ${grilla.reglas.minVirales} de ${grilla.reglas.minCuentas} cuentas)` : ""}
          </p>
          {propia?.motivo && <p className="text-[13px] text-l-tinta-3">Último cambio: {propia.motivo} ({propia.autor})</p>}
          {p.validacion && p.validacion.sirvieron + p.validacion.noSirvieron > 0 && (
            <p className="text-[13px] text-l-tinta-3">
              Validación del equipo: {p.validacion.sirvieron} sirvieron · {p.validacion.noSirvieron} no
              {p.validacion.noSirvieron > 0 && ` (${Object.entries(p.validacion.motivos).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${n}`).join(", ")})`}
              {p.validacion.piezas > p.validacion.sirvieron + p.validacion.noSirvieron && ` · ${p.validacion.piezas - p.validacion.sirvieron - p.validacion.noSirvieron} sin validar`}
            </p>
          )}
          {tipoInfo?.descripcion && <p className="text-[13px] text-l-tinta-3">{tipoInfo.descripcion}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {propia && propia.estado !== "aprobada" && <Boton tipo="primario" onClick={() => aprobar.mutate()} disabled={aprobar.isPending}><Check className="mr-1 inline h-4 w-4" aria-hidden />Aprobar</Boton>}
          <Boton tipo="secundario" onClick={() => setEditando(!editando)}>
            <Pencil className="mr-1 inline h-4 w-4" aria-hidden />
            {editando ? "Cancelar" : propia && heredaContenido === false ? "Editar" : p.heredada ? `Personalizar para ${p.nombreAlcance}` : "Escribir a mano"}
          </Boton>
          {p.contenido?.perfil && p.guia && (
            <Boton tipo="secundario" onClick={() => { bajar(`${p.archivo}.json`, JSON.stringify(p.contenido!.perfil, null, 2), "application/json"); bajar(`${p.archivo}.md`, p.guia!, "text/markdown"); }}>
              <Download className="mr-1 inline h-4 w-4" aria-hidden />Perfil vtool
            </Boton>
          )}
          {tipoInfo?.propio && (
            <Boton tipo="secundario" disabled={ocultar.isPending} onClick={() => { if (window.confirm(`¿Ocultar el tipo «${nombreTipo}»? Sus plantillas no se borran y vuelve si lo creás de nuevo con el mismo nombre.`)) ocultar.mutate(); }}>
              <EyeOff className="mr-1 inline h-4 w-4" aria-hidden />Ocultar tipo
            </Boton>
          )}
          <button type="button" onClick={onCerrar} className="grid h-11 w-11 place-items-center rounded-[10px] text-l-tinta-2" aria-label="Cerrar"><X className="h-4 w-4" aria-hidden /></button>
        </div>
      </div>
      {(guardar.error || aprobar.error || ocultar.error) && <p className="text-[13px] text-l-critico-texto" role="alert"><OctagonAlert className="mr-1 inline h-4 w-4" aria-hidden />{((guardar.error ?? aprobar.error ?? ocultar.error) as Error).message}</p>}

      <Reglas propias={propias} heredadas={p.reglasHeredadas} nombreAlcance={p.nombreAlcance} guardando={guardar.isPending} onCambiar={guardarReglas} />

      {editando ? (
        <Editor
          inicial={propia && !heredaContenido ? sinReglas(propia.contenido) : sinReglas(p.heredada?.contenido ?? propia?.contenido)}
          aviso={!propia || heredaContenido ? (p.heredada ? `Parte de la plantilla de ${p.heredada.nombre}. Al guardar, ${p.nombreAlcance} tiene la suya y deja de seguir los cambios de ${p.heredada.nombre}.` : null) : null}
          guardando={guardar.isPending}
          onGuardar={(contenido, motivo) => guardar.mutate({ contenido, reglas: propias, motivo })}
        />
      ) : p.contenido && (p.contenido.objetivo || p.contenido.estructura?.length || p.contenido.edicion && Object.keys(p.contenido.edicion).length || p.contenido.promptIa) ? (
        <>
          {heredaContenido && <p className="text-[13px] text-l-tinta-3">Esta es la plantilla de {nombreDe(p.desde!, grilla)}. Para cambiarla solo para {p.nombreAlcance}, tocá «Personalizar».</p>}
          <Vista c={p.contenido} />
        </>
      ) : (
        <p className="text-[14px] text-l-tinta-3">Todavía no hay plantilla{alcance === TODOS ? " general" : ""}. La arma el equipo de agentes cuando hay virales medidos, o la podés escribir a mano.</p>
      )}

      <Ejemplos titulo="Virales" lista={p.virales} />
      {p.noVirales.length > 0 && <Ejemplos titulo="De las mismas cuentas, los que no rindieron" lista={p.noVirales} />}

      {p.versiones.length > 1 && (
        <details>
          <summary className="cursor-pointer text-[13px] text-l-tinta-2">Historial ({p.versiones.length} versiones)</summary>
          <ul className="mt-2 space-y-1 text-[13px] text-l-tinta-3">
            {p.versiones.map((v) => <li key={v.version}>v{v.version} · {v.estado} · {v.autor} · {v.fecha.slice(0, 10)}{v.motivo ? ` · ${v.motivo}` : ""}</li>)}
          </ul>
        </details>
      )}
    </Tarjeta>
  );
}

function Reglas({ propias, heredadas, nombreAlcance, guardando, onCambiar }: { propias: Regla[]; heredadas: Regla[]; nombreAlcance: string; guardando: boolean; onCambiar: (r: Regla[], motivo: string) => void }) {
  const [nueva, setNueva] = useState("");
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  return (
    <section>
      <h4 className="mb-1.5 text-[13px] font-semibold text-l-tinta">Reglas</h4>
      {propias.length === 0 && heredadas.length === 0 && <p className="mb-2 text-[13px] text-l-tinta-3">Sin reglas todavía.</p>}
      <ul className="mb-2 space-y-1.5">
        {propias.map((r) => (
          <li key={r.id} className="flex items-start gap-2 text-[14px]">
            {editando?.id === r.id ? (
              <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); onCambiar(propias.map((x) => x.id === r.id ? { ...x, texto: editando.texto, origen: "persona" } : x), `Regla editada: ${editando.texto.slice(0, 80)}`); setEditando(null); }}>
                <input value={editando.texto} onChange={(e) => setEditando({ id: r.id, texto: e.target.value })} className="min-h-11 flex-1 rounded-[10px] border border-l-linea-2 bg-l-papel px-3 text-[14px]" aria-label="Texto de la regla" />
                <Boton tipo="primario" type="submit" disabled={guardando || !editando.texto.trim()}>Guardar</Boton>
              </form>
            ) : (
              <>
                <span className="flex-1 text-l-tinta">{r.texto}<span className="ml-1.5 text-[12px] text-l-tinta-3">{r.origen === "persona" ? "· del equipo" : `· propuesta por un agente${r.viral ? `, sale del viral ${r.viral.slice(0, 8)}` : ""}`}</span></span>
                <button type="button" onClick={() => setEditando({ id: r.id, texto: r.texto })} className="text-l-tinta-3 hover:text-l-tinta" aria-label="Editar regla"><Pencil className="h-4 w-4" aria-hidden /></button>
                <button type="button" disabled={guardando} onClick={() => onCambiar(propias.filter((x) => x.id !== r.id), `Regla borrada: ${r.texto.slice(0, 80)}`)} className="text-l-tinta-3 hover:text-l-critico" aria-label="Borrar regla"><Trash2 className="h-4 w-4" aria-hidden /></button>
              </>
            )}
          </li>
        ))}
        {heredadas.map((r) => (
          <li key={`${r.alcance}-${r.id}`} className="flex items-start gap-2 text-[14px] text-l-tinta-2">
            <span className="flex-1">{r.texto}<span className="ml-1.5 text-[12px] text-l-tinta-3">· {r.desde ?? r.alcance} (se cambia en su nivel)</span></span>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onCambiar([...propias, { id: crypto.randomUUID(), texto: nueva.trim(), origen: "persona" }], `Regla nueva: ${nueva.trim().slice(0, 80)}`); setNueva(""); }}>
        <input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder={`Regla para ${nombreAlcance}. Ej.: el precio y la zona en pantalla antes del segundo 3`} className="min-h-11 flex-1 rounded-[10px] border border-l-linea-2 bg-l-papel px-3 text-[14px]" aria-label="Regla nueva" />
        <Boton tipo="primario" type="submit" disabled={guardando || !nueva.trim()}><Plus className="mr-1 inline h-4 w-4" aria-hidden />Agregar</Boton>
      </form>
    </section>
  );
}

function Vista({ c }: { c: Contenido }) {
  const ed = EDICION.filter(([k]) => c.edicion?.[k]);
  return (
    <div className="grid gap-4 text-[14px] md:grid-cols-2">
      <div className="space-y-3">
        {c.objetivo && <p className="text-l-tinta">{c.objetivo}{c.duracion ? ` · ${c.duracion[0]} a ${c.duracion[1]} s` : ""}</p>}
        {!!c.estructura?.length && <Bloque titulo="Estructura">{c.estructura.map((t, i) => <li key={i}><b>{t.tramo}</b> ({t.desde}–{t.hasta} s): {t.que}</li>)}</Bloque>}
        {!!c.ganchos?.length && <Bloque titulo="Gancho">{c.ganchos.map((g, i) => <li key={i}>{g.formula}</li>)}</Bloque>}
      </div>
      <div className="space-y-3">
        {!!ed.length && <Bloque titulo="Edición">{ed.map(([k, n]) => <li key={k}><b>{n}:</b> {c.edicion![k]}</li>)}</Bloque>}
        {!!c.noHacer?.length && <Bloque titulo="Qué NO hacer">{c.noHacer.map((s, i) => <li key={i}>{s}</li>)}</Bloque>}
        {c.promptIa && <div><h4 className="mb-1 text-[13px] font-semibold text-l-tinta">Prompt de IA</h4><pre className="whitespace-pre-wrap rounded-lg bg-l-papel p-2 text-[12px]">{c.promptIa}</pre></div>}
      </div>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div><h4 className="mb-1 text-[13px] font-semibold text-l-tinta">{titulo}</h4><ul className="list-disc space-y-0.5 pl-5 text-l-tinta-2">{children}</ul></div>;
}

/** Edición a mano: un campo por parte; las listas, una por renglón. */
function Editor({ inicial, aviso, guardando, onGuardar }: { inicial: Contenido; aviso: string | null; guardando: boolean; onGuardar: (c: Contenido, motivo: string) => void }) {
  const lineas = (xs?: string[]) => (xs ?? []).join("\n");
  const [f, setF] = useState({
    objetivo: inicial.objetivo ?? "", min: String(inicial.duracion?.[0] ?? ""), max: String(inicial.duracion?.[1] ?? ""),
    estructura: (inicial.estructura ?? []).map((t) => `${t.tramo} | ${t.desde}-${t.hasta} | ${t.que}`).join("\n"),
    ganchos: lineas(inicial.ganchos?.map((g) => g.formula)), noHacer: lineas(inicial.noHacer), promptIa: inicial.promptIa ?? "",
    ...Object.fromEntries(EDICION.map(([k]) => [k, inicial.edicion?.[k] ?? ""])),
    motivo: "",
  } as Record<string, string>);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const campo = "w-full rounded-[10px] border border-l-linea-2 bg-l-papel px-3 py-2 text-[14px]";
  const enviar = () => {
    const ls = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    const min = Number(f.min), max = Number(f.max);
    onGuardar({
      ...inicial,
      objetivo: f.objetivo, duracion: min && max ? [min, max] : undefined,
      estructura: ls(f.estructura).map((l) => { const [tramo, seg, ...que] = l.split("|").map((x) => x.trim()); const [d, h] = (seg ?? "").split("-").map(Number); return { tramo, desde: d || 0, hasta: h || 0, que: que.join(" | ") }; }),
      ganchos: ls(f.ganchos).map((formula) => ({ formula, viral: inicial.ganchos?.find((g) => g.formula === formula)?.viral })),
      edicion: Object.fromEntries(EDICION.map(([k]) => [k, f[k]]).filter(([, v]) => v)),
      noHacer: ls(f.noHacer), promptIa: f.promptIa,
      perfil: inicial.perfil ? { ...inicial.perfil, duracion: min && max ? [min, max] : inicial.perfil.duracion } : undefined,
    }, f.motivo || "Editada a mano");
  };
  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
      {aviso && <p className="rounded-lg bg-l-papel px-3 py-2 text-[13px] text-l-tinta-2 md:col-span-2">{aviso}</p>}
      <label className="text-[13px] text-l-tinta-2 md:col-span-2">Objetivo<input className={campo} value={f.objetivo} onChange={set("objetivo")} /></label>
      <label className="text-[13px] text-l-tinta-2">Duración mínima (s)<input className={campo} inputMode="numeric" value={f.min} onChange={set("min")} /></label>
      <label className="text-[13px] text-l-tinta-2">Duración máxima (s)<input className={campo} inputMode="numeric" value={f.max} onChange={set("max")} /></label>
      <label className="text-[13px] text-l-tinta-2 md:col-span-2">Estructura (un tramo por renglón: nombre | 0-3 | qué pasa)<textarea rows={4} className={campo} value={f.estructura} onChange={set("estructura")} /></label>
      <label className="text-[13px] text-l-tinta-2">Fórmulas de gancho (una por renglón)<textarea rows={4} className={campo} value={f.ganchos} onChange={set("ganchos")} /></label>
      <label className="text-[13px] text-l-tinta-2">Qué NO hacer (uno por renglón)<textarea rows={4} className={campo} value={f.noHacer} onChange={set("noHacer")} /></label>
      {EDICION.map(([k, n]) => <label key={k} className="text-[13px] text-l-tinta-2">{n}<input className={campo} value={f[k]} onChange={set(k)} /></label>)}
      <label className="text-[13px] text-l-tinta-2 md:col-span-2">Prompt de IA (anclas → descripción exacta → SHOT → fondo, luz y cámara → LOOK → RULES)<textarea rows={5} className={campo} value={f.promptIa} onChange={set("promptIa")} /></label>
      <label className="text-[13px] text-l-tinta-2 md:col-span-2">Qué cambiaste y por qué<input className={campo} value={f.motivo} onChange={set("motivo")} /></label>
      <div className="md:col-span-2"><Boton tipo="primario" type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar versión nueva"}</Boton></div>
    </form>
  );
}

function Ejemplos({ titulo, lista }: { titulo: string; lista: Viral[] }) {
  if (!lista.length) return null;
  return (
    <section>
      <h4 className="mb-1.5 text-[13px] font-semibold text-l-tinta">{titulo} · {lista.length}</h4>
      <ul className="divide-y divide-l-linea rounded-xl border border-l-linea">
        {lista.slice(0, 12).map((v) => (
          <li key={v.id} className="flex gap-3 px-3 py-2 text-[13px]">
            <span className="w-24 shrink-0 font-medium text-l-tinta">{v.veces == null ? "sin medir" : `${v.veces}× lo normal`}</span>
            <span className="min-w-0 flex-1 text-l-tinta-2"><b>@{v.cuenta}</b> · {v.fecha}{v.fuente === "estudio" ? ` · estudio LatAm${v.red ? ` (${v.red})` : ""}` : v.fuente !== "sistema" ? ` · cargado por ${v.fuente}${v.red ? ` (${v.red})` : ""}` : ""}<br /><span className="line-clamp-2">{v.gancho || v.notas || v.texto}</span></span>
            {v.url && <a href={v.url} target="_blank" rel="noreferrer" className="shrink-0 text-l-tinta-3 hover:text-l-marca" aria-label={`Abrir video de @${v.cuenta}`}><ExternalLink className="h-4 w-4" aria-hidden /></a>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NuevoTipo({ grilla, alcance }: { grilla: Grilla; alcance: string }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ nombre: "", descripcion: "", alcance });
  const m = useMutation({
    mutationFn: () => tiposApi.crearTipo(f),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["lmtm", "video-tipos"] }); setF({ ...f, nombre: "", descripcion: "" }); setAbierto(false); },
  });
  const campo = "min-h-11 w-full rounded-[10px] border border-l-linea-2 bg-l-papel px-3 text-[14px]";
  if (!abierto) return <button type="button" onClick={() => { setF({ nombre: "", descripcion: "", alcance }); setAbierto(true); }} className="text-[13px] text-l-tinta-2 hover:text-l-marca"><Plus className="mr-1 inline h-4 w-4" aria-hidden />Nuevo tipo de video</button>;
  return (
    <Tarjeta className="w-full">
      <form className="grid gap-2 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <input className={campo} placeholder="Nombre (ej.: Recorrido de obra)" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} aria-label="Nombre del tipo" required />
        <input className={`${campo} md:col-span-2`} placeholder="Cómo se reconoce: qué se ve y cómo está hecho" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} aria-label="Descripción" />
        <select className={campo} value={f.alcance} onChange={(e) => setF({ ...f, alcance: e.target.value })} aria-label="Para quién">
          <option value={TODOS}>Para todos</option>
          <optgroup label="Para un rubro">{grilla.nichos.map((n) => <option key={n.nicho} value={n.nicho}>{n.nicho}</option>)}</optgroup>
          <optgroup label="Para un cliente">{grilla.clientes.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}</optgroup>
        </select>
        <div className="flex gap-2 md:col-span-2"><Boton tipo="primario" type="submit" disabled={m.isPending || !f.nombre.trim()}>{m.isPending ? "Creando…" : "Crear tipo"}</Boton><Boton tipo="secundario" onClick={() => setAbierto(false)}>Cerrar</Boton></div>
      </form>
      <p className="mt-2 text-[12px] text-l-tinta-3">Los de todos y los de un rubro también se usan para clasificar los videos de la competencia; los de un cliente, no.</p>
      {m.error && <p className="mt-2 text-[13px] text-l-critico-texto" role="alert">{(m.error as Error).message}</p>}
    </Tarjeta>
  );
}

function CargarViral({ nichos, tipos, nicho }: { nichos: string[]; tipos: Tipo[]; nicho: string | null }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ url: "", cuenta: "", nicho: "", tipo: "", gancho: "", notas: "" });
  const nichoElegido = f.nicho || nicho || nichos[0] || "";
  const tipoElegido = f.tipo || tipos[0]?.slug || "";
  const m = useMutation({ mutationFn: () => tiposApi.viral({ ...f, nicho: nichoElegido, tipo: tipoElegido }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["lmtm", "video-tipos"] }); setF({ ...f, url: "", cuenta: "", gancho: "", notas: "" }); } });
  const campo = "min-h-11 w-full rounded-[10px] border border-l-linea-2 bg-l-papel px-3 text-[14px]";
  if (!abierto) return <button type="button" onClick={() => setAbierto(true)} className="text-[13px] text-l-tinta-2 hover:text-l-marca"><Plus className="mr-1 inline h-4 w-4" aria-hidden />Cargar un viral que encontraste</button>;
  return (
    <Tarjeta className="w-full">
      <form className="grid gap-2 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <input className={`${campo} md:col-span-2`} placeholder="Link del video" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} aria-label="Link del video" required />
        <input className={campo} placeholder="Cuenta (sin @)" value={f.cuenta} onChange={(e) => setF({ ...f, cuenta: e.target.value })} aria-label="Cuenta" required />
        <select className={campo} value={nichoElegido} onChange={(e) => setF({ ...f, nicho: e.target.value })} aria-label="Rubro">{nichos.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <select className={campo} value={tipoElegido} onChange={(e) => setF({ ...f, tipo: e.target.value })} aria-label="Tipo de video">{tipos.map((t) => <option key={t.slug} value={t.slug}>{t.nombre}</option>)}</select>
        <input className={campo} placeholder="Gancho (lo que dice en los primeros 3 s)" value={f.gancho} onChange={(e) => setF({ ...f, gancho: e.target.value })} aria-label="Gancho" />
        <input className={`${campo} md:col-span-2`} placeholder="Qué lo hace funcionar (opcional)" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} aria-label="Notas" />
        <div className="flex gap-2"><Boton tipo="primario" type="submit" disabled={m.isPending}>{m.isPending ? "Verificando…" : "Guardar"}</Boton><Boton tipo="secundario" onClick={() => setAbierto(false)}>Cerrar</Boton></div>
      </form>
      {m.data && <p className="mt-2 text-[13px] text-l-tinta-2" role="status">{m.data.mensaje}</p>}
      {m.error && <p className="mt-2 text-[13px] text-l-critico-texto" role="alert">{(m.error as Error).message}</p>}
    </Tarjeta>
  );
}
