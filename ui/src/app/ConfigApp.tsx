// LMTM: Config (fase C1). Por ahora, la puerta a cada ajuste que ya existe;
// cada uno se muda a la app cuando se rehace.

import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Copy } from "lucide-react";
import { Link } from "@/lib/router";
import { api } from "../api/client";
import { AGENCIA, SISTEMA } from "../lmtm/secciones";
import { Encabezado } from "./Shell";
import { Tarjeta, TituloFranja } from "./HoyApp";

interface PersonaConector { nombre: string; alta: string; link: string | null; llamadas30d: number; ultimoUso: string | null }
interface Conector { personas: PersonaConector[]; linkCompartido: { activo: boolean; llamadas30d: number; ultimoUso: string | null } }

const fechaCorta = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-AR", { day: "numeric", month: "short" }) : "nunca");

interface Medida {
  piezasSemana: number; controlGuardado30d: number | null; veredictos: { sirvio: number; noSirvio: number };
  corridasSemana: { total: number; bien: number }; tareasBloqueadas: number; nas: { clientes: number; actualizado: string | null }; tablasSecas: string[];
}
const SECAS: Record<string, string> = {
  video_plantillas: "plantillas de video (las arma el modelo de texto con los virales; estuvo caído hasta el 15/11)",
  pieza_metricas: "métricas de piezas publicadas (nadie vinculó todavía un posteo a su pieza con «¿Ya se publicó?»)",
};

/** Medición continua del plan 15/11: si el sistema mejora y si algo se secó en silencio. */
function Medicion() {
  const q = useQuery({ queryKey: ["lmtm", "cerebro", "medicion"], queryFn: () => api.get<Medida>("/cerebro/medicion"), staleTime: 5 * 60_000 });
  const cob = useQuery({ queryKey: ["lmtm", "cerebro", "cobertura"], queryFn: () => api.get<{ promedio: number | null }>("/cerebro/cobertura"), staleTime: 5 * 60_000 });
  const m = q.data;
  if (!m) return null;
  const pct = m.corridasSemana.total ? Math.round((100 * m.corridasSemana.bien) / m.corridasSemana.total) : null;
  const filas: Array<[string, string]> = [
    ["Ficha del cerebro (promedio)", cob.data?.promedio != null ? `${cob.data.promedio} %` : "—"],
    ["Piezas producidas esta semana", String(m.piezasSemana)],
    ["Piezas con control guardado (30 días)", m.controlGuardado30d != null ? `${m.controlGuardado30d} %` : "—"],
    ["Veredictos: sirvió / no sirvió", `${m.veredictos.sirvio} / ${m.veredictos.noSirvio}`],
    ["Corridas de agentes bien (7 días)", pct != null ? `${pct} % de ${m.corridasSemana.total}` : "—"],
    ["Tareas bloqueadas", String(m.tareasBloqueadas)],
    ["NAS indexado", `${m.nas.clientes} clientes${m.nas.actualizado ? ` · ${new Date(m.nas.actualizado).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}` : ""}`],
  ];
  return (
    <Tarjeta>
      <TituloFranja>Cómo viene el sistema</TituloFranja>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13px]">
        {filas.map(([k, v]) => (<Fragment key={k}><dt className="text-l-tinta-2">{k}</dt><dd className="text-right font-medium tabular-nums">{v}</dd></Fragment>))}
      </dl>
      {m.tablasSecas.length > 0 && (
        <p className="mt-3 border-t border-l-linea pt-2 text-[12px] text-l-atencion-texto">
          Siguen vacías: {m.tablasSecas.map((t) => SECAS[t] ?? t).join("; ")}.
        </p>
      )}
    </Tarjeta>
  );
}

/**
 * Un link del conector de Claude por persona (15/11): así se sabe quién usó qué
 * y se le puede cortar a una sola persona. El link ES el acceso: no se manda por
 * un canal público.
 */
function LinksDelConector() {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["lmtm", "conector-personas"], queryFn: () => api.get<Conector>("/equipo/conector") });
  const refrescar = () => void qc.invalidateQueries({ queryKey: ["lmtm", "conector-personas"] });
  const agregar = useMutation({
    mutationFn: () => api.post<{ ok: boolean; motivo?: string }>("/equipo/conector", { nombre }),
    onSuccess: (r) => { if (r.ok) setNombre(""); refrescar(); },
  });
  const revocar = useMutation({
    mutationFn: (b: { nombre: string; nuevo: boolean }) => api.post<{ ok: boolean }>("/equipo/conector/revocar", b),
    onSuccess: refrescar,
  });
  const copiar = async (p: PersonaConector) => {
    if (!p.link) return;
    try { await navigator.clipboard.writeText(p.link); setCopiado(p.nombre); } catch { setCopiado(null); window.prompt("Copiá el link", p.link); }
  };
  if (q.error) return null; // no es admin
  return (
    <Tarjeta>
      <TituloFranja>Conector de Claude: un link por persona</TituloFranja>
      <p className="mb-2 text-[12px] text-l-tinta-3">Cada persona agrega su link en claude.ai → Conectores. Queda registrado quién usó qué; revocar le corta solo a esa persona.</p>
      <ul>
        {(q.data?.personas ?? []).map((p) => (
          <li key={p.nombre} className="flex flex-wrap items-center gap-2 border-b border-l-linea py-2 text-[13px] last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{p.nombre}</span>
              <span className="block text-[12px] text-l-tinta-3">{p.llamadas30d} usos en 30 días · último {fechaCorta(p.ultimoUso)}</span>
            </span>
            <button type="button" onClick={() => void copiar(p)} disabled={!p.link} className="inline-flex min-h-8 items-center gap-1 rounded-[8px] border border-l-linea-2 px-2 disabled:opacity-50">
              <Copy className="h-3.5 w-3.5" aria-hidden /> {copiado === p.nombre ? "Copiado" : "Copiar link"}
            </button>
            <button type="button" onClick={() => revocar.mutate({ nombre: p.nombre, nuevo: true })} className="min-h-8 rounded-[8px] px-2 text-l-tinta-2 hover:text-l-tinta">Link nuevo</button>
            <button type="button" onClick={() => revocar.mutate({ nombre: p.nombre, nuevo: false })} className="min-h-8 rounded-[8px] px-2 text-l-critico-texto">Quitar</button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (nombre.trim().length >= 2) agregar.mutate(); }}>
        <label className="sr-only" htmlFor="persona-conector">Nombre</label>
        <input id="persona-conector" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (Marcos, Nazareno…)" className="min-h-9 min-w-0 flex-1 rounded-[8px] border border-l-linea-2 bg-transparent px-2 text-[13px]" />
        <button type="submit" disabled={nombre.trim().length < 2 || agregar.isPending} className="min-h-9 rounded-[8px] bg-l-marca px-3 text-[13px] font-semibold text-l-marca-tinta disabled:opacity-50">Dar link</button>
      </form>
      {agregar.data && !agregar.data.ok && <p className="mt-1 text-[12px] text-l-atencion-texto" role="alert">{agregar.data.motivo}</p>}
      {q.data?.linkCompartido.activo && (
        <p className="mt-3 border-t border-l-linea pt-2 text-[12px] text-l-tinta-3">
          El link compartido viejo sigue activo ({q.data.linkCompartido.llamadas30d} usos en 30 días, último {fechaCorta(q.data.linkCompartido.ultimoUso)}). Cuando todos tengan el suyo, se apaga sacando LMTM_CONECTOR_EQUIPO de Railway.
        </p>
      )}
    </Tarjeta>
  );
}

const AJUSTES = [
  { to: "/actividad", titulo: "Actividad", detalle: "Todo lo que se hizo, en una línea de tiempo" },
  { to: "/contenido", titulo: "Contenido", detalle: "Producción, edición y tipos de video" },
  { to: "/finanzas", titulo: "Finanzas", detalle: "Sin datos cargados todavía" },
  { to: "/conexiones", titulo: "Conexiones de pauta", detalle: "Meta Ads y Google Ads de cada cliente" },
  { to: "/avisos", titulo: "Avisos de WhatsApp", detalle: "Qué se mandó, qué va al resumen y qué se descartó, con el motivo" },
  { to: "/whatsapp", titulo: "WhatsApp", detalle: "Grupos de clientes y bot" },
  { to: "/preparacion", titulo: "Preparación de clientes", detalle: "Qué le falta a cada cliente para operar solo" },
  { to: "/company/settings/access", titulo: "Equipo y accesos", detalle: "Quién entra y con qué permisos" },
  { to: "/company/settings", titulo: "Empresa", detalle: "Datos generales" },
] as const;

export function ConfigApp() {
  return (
    <>
      <Encabezado titulo="Config" />
      <div className="grid max-w-[960px] gap-6 px-4 md:grid-cols-2 md:px-8">
        <Tarjeta>
          <TituloFranja>Ajustes</TituloFranja>
          <ul>
            {AJUSTES.map((a) => (
              <li key={a.to} className="border-b border-l-linea last:border-b-0">
                <Link to={a.to} className="flex items-center gap-3 py-3 text-inherit hover:text-l-marca">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{a.titulo}</span>
                    <span className="block text-[12px] text-l-tinta-3">{a.detalle}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-l-tinta-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
        <Medicion />
        <LinksDelConector />
        <Tarjeta>
          <TituloFranja>Sistema</TituloFranja>
          <ul>
            {SISTEMA.map((m) => (
              <li key={m.to} className="border-b border-l-linea last:border-b-0">
                <Link to={m.to} className="flex items-center gap-3 py-3 text-inherit hover:text-l-marca">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{m.label}</span>
                    <span className="block text-[12px] text-l-tinta-3">{m.detalle}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-l-tinta-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
        <Tarjeta>
          <TituloFranja>Más pantallas</TituloFranja>
          <ul>
            {AGENCIA.filter((m) => m.to !== "/config").map((m) => (
              <li key={m.to} className="border-b border-l-linea last:border-b-0">
                <Link to={m.to} className="flex items-center gap-3 py-3 text-[14px] text-inherit hover:text-l-marca">
                  <span className="flex-1">{m.label}</span>
                  <ChevronRight className="h-4 w-4 text-l-tinta-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </>
  );
}
