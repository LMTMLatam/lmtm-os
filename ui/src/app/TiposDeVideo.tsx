// LMTM: Contenido → «Tipos de video» (pedido 09/11). Una plantilla de edición
// por nicho y tipo de video, armada por los agentes con los virales medidos de
// la competencia y aprobada por una persona. Acá el equipo la mira, agrega o
// cambia reglas, edita, aprueba, carga virales y baja el perfil para el kit de
// video de su PC (vtool --perfil). Datos de /api/video-tipos.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, ExternalLink, Loader2, OctagonAlert, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../api/client";
import { Boton } from "../lmtm/componentes";
import { Tarjeta } from "./HoyApp";

type Estado = "sin-plantilla" | "borrador" | "lista" | "aprobada" | "vieja";
interface Celda { nicho: string; tipo: string; estado: Estado; version: number; virales: number; cuentas: number; actualizada: string | null }
interface Grilla {
  tipos: Array<{ slug: string; nombre: string; descripcion: string }>;
  nichos: Array<{ nicho: string; clientes: number; cuentasMedidas: number; sinTipo: number }>;
  celdas: Celda[];
  reglas: { viralDesde: number; ventanaDias: number; minVirales: number; minCuentas: number };
}
interface Regla { id: string; texto: string; origen: "persona" | "agente"; autor?: string; viral?: string }
interface Contenido {
  objetivo?: string; duracion?: [number, number];
  estructura?: Array<{ tramo: string; desde: number; hasta: number; que: string }>;
  ganchos?: Array<{ formula: string; viral?: string }>;
  edicion?: Record<string, string>;
  promptIa?: string; noHacer?: string[]; reglas?: Regla[];
  perfil?: { nombre: string; descripcion: string; reel: Record<string, unknown>; duracion?: [number, number] };
}
interface Viral { id: string; url: string | null; cuenta: string; fecha: string; veces: number | null; texto: string; fuente: string; gancho?: string | null; notas?: string | null }
interface Plantilla {
  nicho: string; tipo: string; estado: Estado; version: number; contenido: Contenido | null;
  evidencia: { virales: number; cuentas: number }; autor: string | null; motivo: string | null; aprobadaPor: string | null; actualizada: string | null;
  guia: string | null; virales: Viral[]; noVirales: Viral[];
  versiones: Array<{ version: number; estado: string; autor: string; motivo: string | null; fecha: string }>;
}

const ESTADOS: Record<Estado, { texto: string; clase: string }> = {
  "sin-plantilla": { texto: "Sin plantilla", clase: "text-l-tinta-3" },
  borrador: { texto: "Borrador", clase: "text-l-tinta-2" },
  lista: { texto: "Para revisar", clase: "text-l-atencion-texto" },
  aprobada: { texto: "Aprobada", clase: "text-l-bien-texto" },
  vieja: { texto: "Revisar (vieja)", clase: "text-l-atencion-texto" },
};
const EDICION: Array<[string, string]> = [["cortes", "Cortes"], ["subtitulos", "Subtítulos"], ["zoom", "Zoom"], ["sfx", "Efectos de sonido"], ["musica", "Música"], ["look", "Look"], ["planos", "Planos obligatorios"]];

const tiposApi = {
  grilla: () => api.get<Grilla>("/video-tipos"),
  plantilla: (n: string, t: string) => api.get<Plantilla>(`/video-tipos/${encodeURIComponent(n)}/${encodeURIComponent(t)}`),
  guardar: (n: string, t: string, body: { contenido: Contenido; reglas: Regla[]; motivo: string }) => api.post<{ version: number; estado: string }>(`/video-tipos/${encodeURIComponent(n)}/${encodeURIComponent(t)}`, body),
  aprobar: (n: string, t: string) => api.post<{ ok: true }>(`/video-tipos/${encodeURIComponent(n)}/${encodeURIComponent(t)}/aprobar`, {}),
  viral: (b: Record<string, string>) => api.post<{ mensaje: string }>("/video-tipos/virales", b),
};

function bajar(nombre: string, texto: string, tipo: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: tipo }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function TiposDeVideo() {
  const grilla = useQuery({ queryKey: ["lmtm", "video-tipos"], queryFn: tiposApi.grilla, staleTime: 5 * 60_000 });
  const [nicho, setNicho] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<{ nicho: string; tipo: string } | null>(null);
  const g = grilla.data;
  const nichoActual = nicho ?? g?.nichos[0]?.nicho ?? null;
  const celdas = useMemo(() => (g?.celdas ?? []).filter((c) => c.nicho === nichoActual), [g, nichoActual]);
  const info = g?.nichos.find((n) => n.nicho === nichoActual);

  if (grilla.isLoading) return <p className="flex items-center gap-2 text-[14px] text-l-tinta-3"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo las plantillas…</p>;
  if (grilla.error || !g) return <p className="text-[14px] text-l-critico-texto" role="alert">No se pudieron leer las plantillas: {grilla.error instanceof Error ? grilla.error.message : "error"}</p>;

  return (
    <div className="space-y-3">
      <p className="-mt-1.5 text-[13px] text-l-tinta-3">
        Cómo se edita cada tipo de video en cada rubro. La arman los agentes con los videos de la competencia que hicieron {g.reglas.viralDesde} veces o más lo normal de su propia cuenta (últimos {g.reglas.ventanaDias} días), y la aprueba una persona. Las reglas que cargues acá no las puede sacar un agente. Claude la usa desde cada PC con el conector del equipo.
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Rubro">
        {g.nichos.map((n) => (
          <button key={n.nicho} type="button" role="tab" aria-selected={n.nicho === nichoActual} onClick={() => { setNicho(n.nicho); setAbierta(null); }}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] ${n.nicho === nichoActual ? "border-l-tinta bg-l-tinta text-l-papel" : "border-l-linea-2 text-l-tinta-2"}`}>
            {n.nicho} <span className="opacity-70">{n.clientes}</span>
          </button>
        ))}
      </div>
      {info && (
        <p className="text-[13px] text-l-tinta-3">
          {info.cuentasMedidas === 0
            ? "Todavía no hay cuentas de la competencia medidas en este rubro: cargá competidores con su Instagram de empresa en la ficha de cada cliente, o un viral que encontraste."
            : `${info.cuentasMedidas} cuentas de la competencia medidas.${info.sinTipo ? ` ${info.sinTipo} virales sin tipo claro (el texto no alcanzaba).` : ""}`}
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {g.tipos.map((t) => {
          const c = celdas.find((x) => x.tipo === t.slug);
          const e = ESTADOS[c?.estado ?? "sin-plantilla"];
          const activa = abierta?.tipo === t.slug && abierta.nicho === nichoActual;
          return (
            <li key={t.slug}>
              <button type="button" onClick={() => setAbierta(activa ? null : { nicho: nichoActual!, tipo: t.slug })} title={t.descripcion}
                className={`w-full rounded-xl border p-3 text-left ${activa ? "border-l-tinta" : "border-l-linea"} bg-l-sup hover:border-l-linea-2`}>
                <div className="text-[14px] font-medium text-l-tinta">{t.nombre}</div>
                <div className={`text-[12px] ${e.clase}`}>{e.texto}{c?.version ? ` · v${c.version}` : ""}</div>
                <div className="mt-1 text-[12px] text-l-tinta-3">{c?.virales ? `${c.virales} virales de ${c.cuentas} cuentas` : "Sin virales medidos"}</div>
              </button>
            </li>
          );
        })}
      </ul>
      {abierta && <Detalle key={`${abierta.nicho}/${abierta.tipo}`} nicho={abierta.nicho} tipo={abierta.tipo} nombreTipo={g.tipos.find((t) => t.slug === abierta.tipo)?.nombre ?? abierta.tipo} minimos={g.reglas} onCerrar={() => setAbierta(null)} />}
      <CargarViral nichos={g.nichos.map((n) => n.nicho)} tipos={g.tipos} nicho={nichoActual} />
    </div>
  );
}

function Detalle({ nicho, tipo, nombreTipo, minimos, onCerrar }: { nicho: string; tipo: string; nombreTipo: string; minimos: Grilla["reglas"]; onCerrar: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lmtm", "video-tipos", nicho, tipo], queryFn: () => tiposApi.plantilla(nicho, tipo) });
  const [editando, setEditando] = useState(false);
  const refrescar = () => { void qc.invalidateQueries({ queryKey: ["lmtm", "video-tipos"] }); };
  const aprobar = useMutation({ mutationFn: () => tiposApi.aprobar(nicho, tipo), onSuccess: refrescar });
  const guardar = useMutation({
    mutationFn: (b: { contenido: Contenido; reglas: Regla[]; motivo: string }) => tiposApi.guardar(nicho, tipo, b),
    onSuccess: () => { setEditando(false); refrescar(); },
  });
  const p = q.data;
  if (q.isLoading || !p) return <Tarjeta><Loader2 className="h-4 w-4 animate-spin" aria-label="Cargando" /></Tarjeta>;
  const c = p.contenido ?? {};
  const reglas = c.reglas ?? [];
  const guardarReglas = (nuevas: Regla[], motivo: string) => guardar.mutate({ contenido: c, reglas: nuevas, motivo });

  return (
    <Tarjeta className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-semibold text-l-tinta">{nombreTipo} · {nicho}</h3>
          <p className="text-[13px] text-l-tinta-3">
            <span className={ESTADOS[p.estado].clase}>{ESTADOS[p.estado].texto}</span>
            {p.version ? ` · versión ${p.version}` : ""}
            {` · ${p.evidencia.virales} virales medidos de ${p.evidencia.cuentas} cuentas`}
            {p.estado === "borrador" && p.contenido && p.evidencia.virales < minimos.minVirales ? ` (para revisarla hacen falta ${minimos.minVirales} de ${minimos.minCuentas} cuentas)` : ""}
          </p>
          {p.motivo && <p className="text-[13px] text-l-tinta-3">Último cambio: {p.motivo} ({p.autor})</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {p.contenido && p.estado !== "aprobada" && <Boton tipo="primario" onClick={() => aprobar.mutate()} disabled={aprobar.isPending}><Check className="mr-1 inline h-4 w-4" aria-hidden />Aprobar</Boton>}
          <Boton tipo="secundario" onClick={() => setEditando(!editando)}><Pencil className="mr-1 inline h-4 w-4" aria-hidden />{editando ? "Cancelar" : p.contenido ? "Editar" : "Escribir a mano"}</Boton>
          {p.contenido?.perfil && p.guia && (
            <Boton tipo="secundario" onClick={() => { bajar(`${nicho}__${tipo}.json`, JSON.stringify(c.perfil, null, 2), "application/json"); bajar(`${nicho}__${tipo}.md`, p.guia!, "text/markdown"); }}>
              <Download className="mr-1 inline h-4 w-4" aria-hidden />Perfil vtool
            </Boton>
          )}
          <button type="button" onClick={onCerrar} className="grid h-11 w-11 place-items-center rounded-[10px] text-l-tinta-2" aria-label="Cerrar"><X className="h-4 w-4" aria-hidden /></button>
        </div>
      </div>
      {(guardar.error || aprobar.error) && <p className="text-[13px] text-l-critico-texto" role="alert"><OctagonAlert className="mr-1 inline h-4 w-4" aria-hidden />{((guardar.error ?? aprobar.error) as Error).message}</p>}

      <Reglas reglas={reglas} guardando={guardar.isPending} onCambiar={guardarReglas} />

      {editando ? (
        <Editor inicial={c} guardando={guardar.isPending} onGuardar={(contenido, motivo) => guardar.mutate({ contenido, reglas, motivo })} />
      ) : p.contenido ? (
        <Vista c={c} />
      ) : (
        <p className="text-[14px] text-l-tinta-3">Todavía no hay plantilla. La arma el equipo de agentes cuando hay virales medidos, o la podés escribir a mano.</p>
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

function Reglas({ reglas, guardando, onCambiar }: { reglas: Regla[]; guardando: boolean; onCambiar: (r: Regla[], motivo: string) => void }) {
  const [nueva, setNueva] = useState("");
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  return (
    <section>
      <h4 className="mb-1.5 text-[13px] font-semibold text-l-tinta">Reglas</h4>
      {reglas.length === 0 && <p className="mb-2 text-[13px] text-l-tinta-3">Sin reglas todavía.</p>}
      <ul className="mb-2 space-y-1.5">
        {reglas.map((r) => (
          <li key={r.id} className="flex items-start gap-2 text-[14px]">
            {editando?.id === r.id ? (
              <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); onCambiar(reglas.map((x) => x.id === r.id ? { ...x, texto: editando.texto, origen: "persona" } : x), `Regla editada: ${editando.texto.slice(0, 80)}`); setEditando(null); }}>
                <input value={editando.texto} onChange={(e) => setEditando({ id: r.id, texto: e.target.value })} className="min-h-11 flex-1 rounded-[10px] border border-l-linea-2 bg-l-papel px-3 text-[14px]" aria-label="Texto de la regla" />
                <Boton tipo="primario" type="submit" disabled={guardando || !editando.texto.trim()}>Guardar</Boton>
              </form>
            ) : (
              <>
                <span className="flex-1 text-l-tinta">{r.texto}<span className="ml-1.5 text-[12px] text-l-tinta-3">{r.origen === "persona" ? "· del equipo" : `· propuesta por un agente${r.viral ? `, sale del viral ${r.viral.slice(0, 8)}` : ""}`}</span></span>
                <button type="button" onClick={() => setEditando({ id: r.id, texto: r.texto })} className="text-l-tinta-3 hover:text-l-tinta" aria-label="Editar regla"><Pencil className="h-4 w-4" aria-hidden /></button>
                <button type="button" disabled={guardando} onClick={() => onCambiar(reglas.filter((x) => x.id !== r.id), `Regla borrada: ${r.texto.slice(0, 80)}`)} className="text-l-tinta-3 hover:text-l-critico" aria-label="Borrar regla"><Trash2 className="h-4 w-4" aria-hidden /></button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onCambiar([...reglas, { id: crypto.randomUUID(), texto: nueva.trim(), origen: "persona" }], `Regla nueva: ${nueva.trim().slice(0, 80)}`); setNueva(""); }}>
        <input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Ej.: el precio y la zona tienen que estar en pantalla antes del segundo 3" className="min-h-11 flex-1 rounded-[10px] border border-l-linea-2 bg-l-papel px-3 text-[14px]" aria-label="Regla nueva" />
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
function Editor({ inicial, guardando, onGuardar }: { inicial: Contenido; guardando: boolean; onGuardar: (c: Contenido, motivo: string) => void }) {
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
            <span className="min-w-0 flex-1 text-l-tinta-2"><b>@{v.cuenta}</b> · {v.fecha}{v.fuente !== "sistema" ? ` · cargado por ${v.fuente}` : ""}<br /><span className="line-clamp-2">{v.gancho || v.notas || v.texto}</span></span>
            {v.url && <a href={v.url} target="_blank" rel="noreferrer" className="shrink-0 text-l-tinta-3 hover:text-l-marca" aria-label={`Abrir video de @${v.cuenta}`}><ExternalLink className="h-4 w-4" aria-hidden /></a>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CargarViral({ nichos, tipos, nicho }: { nichos: string[]; tipos: Grilla["tipos"]; nicho: string | null }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ url: "", cuenta: "", nicho: nicho ?? "", tipo: tipos[0]?.slug ?? "", gancho: "", notas: "" });
  const m = useMutation({ mutationFn: () => tiposApi.viral({ ...f, nicho: f.nicho || nicho || "" }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["lmtm", "video-tipos"] }); setF({ ...f, url: "", cuenta: "", gancho: "", notas: "" }); } });
  const campo = "min-h-11 w-full rounded-[10px] border border-l-linea-2 bg-l-papel px-3 text-[14px]";
  if (!abierto) return <button type="button" onClick={() => setAbierto(true)} className="text-[13px] text-l-tinta-2 hover:text-l-marca"><Plus className="mr-1 inline h-4 w-4" aria-hidden />Cargar un viral que encontraste</button>;
  return (
    <Tarjeta>
      <form className="grid gap-2 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <input className={`${campo} md:col-span-2`} placeholder="Link del video" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} aria-label="Link del video" required />
        <input className={campo} placeholder="Cuenta (sin @)" value={f.cuenta} onChange={(e) => setF({ ...f, cuenta: e.target.value })} aria-label="Cuenta" required />
        <select className={campo} value={f.nicho || nicho || ""} onChange={(e) => setF({ ...f, nicho: e.target.value })} aria-label="Rubro">{nichos.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <select className={campo} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} aria-label="Tipo de video">{tipos.map((t) => <option key={t.slug} value={t.slug}>{t.nombre}</option>)}</select>
        <input className={campo} placeholder="Gancho (lo que dice en los primeros 3 s)" value={f.gancho} onChange={(e) => setF({ ...f, gancho: e.target.value })} aria-label="Gancho" />
        <input className={`${campo} md:col-span-2`} placeholder="Qué lo hace funcionar (opcional)" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} aria-label="Notas" />
        <div className="flex gap-2"><Boton tipo="primario" type="submit" disabled={m.isPending}>{m.isPending ? "Verificando…" : "Guardar"}</Boton><Boton tipo="secundario" onClick={() => setAbierto(false)}>Cerrar</Boton></div>
      </form>
      {m.data && <p className="mt-2 text-[13px] text-l-tinta-2" role="status">{m.data.mensaje}</p>}
      {m.error && <p className="mt-2 text-[13px] text-l-critico-texto" role="alert">{(m.error as Error).message}</p>}
    </Tarjeta>
  );
}
