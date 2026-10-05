// LMTM-OS: las reglas que ya existían, escribiendo en `decisiones`.
//
// No se reescribe ninguna medición. Cada regla de acá toma lo que ya devuelve
// su módulo (cadena-publicacion, balance-monitor, costo-de-no-hacer,
// cola-humana, ingest/salud) y lo traduce a una decisión con la misma forma:
// qué hacer, por qué, cuánta plata por día y quién.
//
// Antes cada módulo tenía su propia lista y su propio orden. El informe
// ejecutivo (que se borra en este cambio) intentaba juntarlas, pero nadie lo
// llamaba: vivía solo en el código.
//
// Funciones puras: reciben lo que los módulos ya calcularon y devuelven
// propuestas. Lo que habla con la base y las APIs está en `motor.ts`.

import type { CadenaRota, Eslabon } from "../../services/cadena-publicacion.js";
import type { BalanceInfo } from "../../services/balance-monitor.js";
import type { CostoCliente } from "../../services/costo-de-no-hacer.js";
import type { SaludFuente, Fuente } from "../../ingest/salud.js";
import type { Propuesta, Responsable } from "../tipos.js";

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

// ── Cadena de publicación ────────────────────────────────────────────────

/** El eslabón roto, traducido a una acción con responsable (venía de informe-ejecutivo). */
export function accionDeCadena(eslabon: Eslabon, cliente: string): { que: string; responsable: Responsable } {
  switch (eslabon) {
    case "sin_destino":
      return { que: "Darlo de alta en los destinos de Make: lo que se le programe no va a ningún lado", responsable: "equipo" };
    case "destino_sin_escenario":
      return { que: "Crear o encender su escenario de Make: el destino está cargado pero no hay quién publique", responsable: "equipo" };
    case "sin_calendario":
      return { que: "Cargar el calendario del mes en su planilla", responsable: "equipo" };
    case "contenido_incompleto":
      return { que: "Completar copy, pieza y aprobación de los posts ya programados", responsable: "equipo" };
    case "despachador_mudo":
      return { que: "Revisar su escenario de Make: dejó de publicar", responsable: "equipo" };
    case "despacho_sin_registro":
      return { que: "Verificar el alta de su escenario de Make: nunca publicó", responsable: "equipo" };
    case "sync_ciego":
      return { que: "Reconectar sus redes: dejamos de ver lo que publica (suele ser el permiso de la página)", responsable: "equipo" };
    case "red_muda":
      return { que: "Revisar por qué Make dice que publicó y en la red no aparece", responsable: "equipo" };
    default: {
      // Sumar un eslabón sin traducirlo NO compila: un eslabón que nadie ubica
      // se cae de la lista en silencio, y eso ya pasó una vez con el aviso diario.
      const falta: never = eslabon;
      return falta;
    }
  }
}

/**
 * La cadena rota de un cliente.
 *
 * Sin plata por día A PROPÓSITO. El informe ejecutivo le pegaba a esta acción
 * la caída de gasto en pauta del cliente, pero la cadena es de publicación
 * ORGÁNICA: que Make no despache no frena un peso de la pauta. Ponerle ese
 * número la mandaba arriba de todo con una plata que no estaba en juego por
 * ella.
 */
export function propuestaDeCadena(r: CadenaRota): Propuesta {
  const a = accionDeCadena(r.eslabon, r.cliente);
  return {
    clientId: r.clientId,
    tipo: `cadena:${r.eslabon}`,
    clave: `cadena:${r.clientId}:${r.eslabon}`,
    que: a.que,
    porque: {
      resumen: r.detalle,
      datos: [{ etiqueta: "Días sin la última señal", valor: r.diasSin, unidad: "dias" }],
    },
    arsPorDia: null,
    responsable: a.responsable,
    creadaPor: "regla:cadena_publicacion",
    accion: { tipo: "tarea", titulo: a.que, descripcion: r.detalle },
    venceEnDias: 7,
  };
}

// ── Saldo ────────────────────────────────────────────────────────────────

const plataforma = (b: Pick<BalanceInfo, "platform">) => (b.platform === "google" ? "Google Ads" : "Meta");

/** Días en los que un saldo se agota al ritmo actual y ya merece decisión (como el pacing del monitor). */
export const DIAS_PARA_AGOTARSE = 7;

/**
 * Cuentas frenadas y por frenarse.
 *
 * `motivoFrenada` y `mereceAvisoDeSaldo` son las funciones del monitor de
 * saldo, no una definición nueva. Lo único que agrega el motor es la plata:
 * una cuenta frenada hace diez días ya gastó cero los últimos siete, así que
 * su gasto diario reciente es 0 y diría "no hay nada en juego". La plata
 * parada (lo que gastaba antes y ya no) sale de costo-de-no-hacer y es la que
 * vale.
 */
export function propuestasDeSaldo(
  balances: BalanceInfo[],
  costos: Map<string, CostoCliente>,
  fns: { motivoFrenada: (b: BalanceInfo) => string | null; mereceAvisoDeSaldo: (b: BalanceInfo) => boolean },
): Propuesta[] {
  const out: Propuesta[] = [];
  // La plata parada es del CLIENTE, no de cada cuenta: si tiene dos cuentas
  // frenadas, va una sola vez (en la que más gastaba). Si no, Hoy sumaría el
  // mismo peso dos veces y ese cliente pasaría adelante de otros que pierden más.
  const paradaUsada = new Set<string>();
  const ordenadas = [...balances].sort((a, b) => b.dailySpend - a.dailySpend);
  for (const b of ordenadas) {
    if (!b.clientId) continue;
    const motivo = fns.motivoFrenada(b);
    const gastoDiario = Math.round(b.dailySpend);
    // La plata parada del cliente ya quedó en otra de sus cuentas frenadas: la
    // caída de gasto del cliente incluye la de ésta, así que sumar acá su gasto
    // propio la contaría dos veces.
    const yaContada = Boolean(motivo) && paradaUsada.has(b.clientId);
    const parada = motivo && !yaContada ? costos.get(b.clientId)?.arsPorDia ?? 0 : 0;
    if (motivo && parada > 0) paradaUsada.add(b.clientId);

    if (motivo) {
      const gastaba = Math.max(gastoDiario, parada);
      const ars = yaContada ? 0 : gastaba;
      out.push({
        clientId: b.clientId,
        tipo: "saldo:frenada",
        clave: `saldo:${b.platform}:${b.account}`,
        que: `Destrabar la cuenta de ${plataforma(b)}: está frenada y no muestra anuncios`,
        porque: {
          resumen: yaContada
            ? `La cuenta ${motivo}. La plata parada de este cliente ya está contada en su otra cuenta frenada.`
            : `La cuenta ${motivo}.`,
          datos: [
            { etiqueta: "Gasto diario antes de frenarse", valor: gastaba > 0 ? gastaba : null, unidad: "ars_dia" },
            { etiqueta: "Saldo restante", valor: b.remaining != null ? Math.round(b.remaining) : null, unidad: "ars" },
          ],
          // Frenada con pauta activa (venía gastando): plata que se pierde hoy.
          ...(b.activaReciente ? { nivel: 5 as const } : {}),
        },
        arsPorDia: ars > 0 ? ars : null,
        // La plata la pone el cliente; el equipo le avisa.
        responsable: "cliente",
        creadaPor: "regla:saldo",
        accion: {
          tipo: "tarea",
          titulo: `${b.clientName}: pedir que destrabe la cuenta de ${plataforma(b)} (frenada)`,
          descripcion: `La cuenta ${b.account} ${motivo}. Mientras siga así, la pauta no se muestra.`,
        },
        venceEnDias: 3,
      });
      continue;
    }

    const porAgotarse = b.daysLeft != null && b.daysLeft <= DIAS_PARA_AGOTARSE && b.dailySpend > 0;
    if (fns.mereceAvisoDeSaldo(b) || porAgotarse) {
      const dias = b.daysLeft != null ? Math.max(0, Math.floor(b.daysLeft)) : null;
      out.push({
        clientId: b.clientId,
        tipo: "saldo:bajo",
        clave: `saldo:${b.platform}:${b.account}`,
        que: dias != null
          ? `Cargar saldo en la cuenta de ${plataforma(b)}: se frena en ${dias === 0 ? "menos de un día" : `${dias} ${dias === 1 ? "día" : "días"}`}`
          : `Cargar saldo en la cuenta de ${plataforma(b)} antes de que se frene`,
        porque: {
          resumen: `Quedan ${pesos(b.remaining ?? 0)} y gasta ${pesos(b.dailySpend)} por día.`,
          datos: [
            { etiqueta: "Saldo restante", valor: b.remaining != null ? Math.round(b.remaining) : null, unidad: "ars" },
            { etiqueta: "Gasto diario (7 días)", valor: b.gastoConocido ? gastoDiario : null, unidad: "ars_dia" },
            { etiqueta: "Días hasta frenarse", valor: dias, unidad: "dias" },
          ],
        },
        arsPorDia: gastoDiario > 0 ? gastoDiario : null,
        responsable: "cliente",
        creadaPor: "regla:saldo",
        accion: {
          tipo: "tarea",
          titulo: `${b.clientName}: pedir carga de saldo en ${plataforma(b)}`,
          descripcion: `Quedan ${pesos(b.remaining ?? 0)} en la cuenta ${b.account}.`,
        },
        venceEnDias: 3,
      });
    }
  }
  return out;
}

// ── Costo de no hacer ────────────────────────────────────────────────────

/**
 * Plata parada que nadie explicó todavía.
 *
 * Se saltean dos casos, y los dos son para no afirmar de más:
 *  · el cliente ya tiene una cuenta frenada: la causa está identificada y esa
 *    decisión ya lleva la plata;
 *  · la fuente de pauta del cliente está fallando o atrasada: el gasto "cayó"
 *    porque no lo estamos viendo, no porque haya parado (CONTEXTO, regla 10).
 *    La decisión de cobertura cubre ese caso.
 */
export function propuestasDeCosto(
  costos: Map<string, CostoCliente>,
  nombres: Map<string, string>,
  excluir: Set<string>,
  ventana: { desde: string; hasta: string },
): Propuesta[] {
  const out: Propuesta[] = [];
  for (const [clientId, c] of costos) {
    if (excluir.has(clientId)) continue;
    const cliente = nombres.get(clientId) ?? "este cliente";
    out.push({
      clientId,
      tipo: "pauta:gasto_caido",
      clave: `costo:${clientId}`,
      que: `Averiguar por qué dejó de gastar: venía ${pesos(c.gastoDiarioPrevio)} por día y ahora ${pesos(c.gastoDiarioActual)}`,
      porque: {
        resumen: "La pauta cayó y no hay una cuenta frenada que lo explique. Puede ser una campaña pausada, un presupuesto vencido o una decisión del cliente que nadie registró.",
        datos: [
          { etiqueta: "Gasto diario antes", valor: c.gastoDiarioPrevio, unidad: "ars_dia" },
          { etiqueta: "Gasto diario ahora (4 días)", valor: c.gastoDiarioActual, unidad: "ars_dia" },
          { etiqueta: "Plata parada por día", valor: c.arsPorDia, unidad: "ars_dia" },
        ],
        ventana,
      },
      arsPorDia: c.arsPorDia,
      responsable: "equipo",
      creadaPor: "regla:costo_de_no_hacer",
      accion: {
        tipo: "tarea",
        titulo: `${cliente}: averiguar por qué cayó la pauta (${pesos(c.arsPorDia)} por día)`,
        descripcion: `Gastaba ${pesos(c.gastoDiarioPrevio)} por día y en los últimos 4 días ${pesos(c.gastoDiarioActual)}.`,
      },
      venceEnDias: 5,
    });
  }
  return out;
}

// ── Cola humana ──────────────────────────────────────────────────────────

export interface FilaCola {
  clientId: string | null;
  title: string;
  identifier: string | null;
  motivo: string | null;
  diasParado: number;
}

/** Desde cuántos días esperando a una persona entra a Hoy (el mismo umbral que la cola). */
export const DIAS_ESPERA_DECISION = 3;

/**
 * Lo que espera a una persona, UNA decisión por cliente.
 *
 * Las 145 tareas esperando una persona, de a una, serían 145 filas en el
 * celular: el mismo cementerio que la cola vieja. Por cliente son una fila
 * con el número y las tres más viejas a la vista.
 *
 * Sin plata: la plata parada del cliente ya la lleva su decisión de costo; si
 * también la llevara ésta, Hoy sumaría el mismo peso dos veces.
 */
export function propuestasDeCola(filas: FilaCola[], nombres: Map<string, string>): Propuesta[] {
  const porCliente = new Map<string, FilaCola[]>();
  for (const f of filas) {
    if (!f.clientId || f.diasParado < DIAS_ESPERA_DECISION) continue;
    const arr = porCliente.get(f.clientId) ?? [];
    arr.push(f);
    porCliente.set(f.clientId, arr);
  }
  const out: Propuesta[] = [];
  for (const [clientId, arr] of porCliente) {
    arr.sort((a, b) => b.diasParado - a.diasParado);
    const cliente = nombres.get(clientId) ?? "este cliente";
    const n = arr.length;
    out.push({
      clientId,
      tipo: "cola:esperando_persona",
      clave: `cola:${clientId}`,
      que: n === 1
        ? `Destrabar la tarea que espera a una persona hace ${arr[0].diasParado} días`
        : `Destrabar ${n} tareas que esperan a una persona (la más vieja, hace ${arr[0].diasParado} días)`,
      porque: {
        resumen: arr[0].motivo ?? "Un agente la marcó como bloqueada y lo que falta no lo puede hacer un agente.",
        datos: arr.slice(0, 3).map((f) => ({
          etiqueta: `${f.identifier ? `${f.identifier} · ` : ""}${f.title.replace(/^\[HUMANO\]\s*/, "")}`,
          valor: f.diasParado,
          unidad: "dias" as const,
        })),
      },
      arsPorDia: null,
      responsable: "equipo",
      creadaPor: "regla:cola_humana",
      accion: null,
      venceEnDias: 7,
    });
  }
  return out;
}

// ── Cobertura (salud de fuentes, del chat A) ─────────────────────────────

const NOMBRE_FUENTE: Record<Fuente, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  organico: "las redes (orgánico)",
};

const fechaCorta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null);

/**
 * El error de la plataforma dicho como lo diría una persona. El crudo
 * ("403: The caller does not have permission") es inglés y código: va en la
 * tarea para el equipo, no en Hoy. Lo que no se reconoce devuelve null y la
 * frase se queda en "falla cada noche", sin inventar una causa.
 */
export function errorEnCastellano(error: string | null): string | null {
  if (!error) return null;
  if (/\b403\b|permission|permiso|forbidden/i.test(error)) return "la cuenta no nos da permiso";
  if (/\b401\b|token|expired|venci|oauth|session|unauthori[sz]ed/i.test(error)) return "venció el acceso y hay que volver a conectar la cuenta";
  if (/reduce the amount of data/i.test(error)) return "la plataforma pide traer menos datos por vez";
  if (/unavailable|timeout|timed out|\b5\d\d\b|ECONN|rate limit|too many/i.test(error)) return "la plataforma no responde";
  return null;
}

/**
 * Lo que no estamos viendo.
 *
 *  · fallando     → el sync no termina: reconectar.
 *  · atrasada     → corre pero no llega dato: revisar.
 *  · sin_conexion → solo Meta, que es la fuente de la que vive la agencia
 *                   (PLAN: "los 32 clientes sin Meta mapeado se vuelven
 *                   decisiones con responsable"). Google y orgánico sin
 *                   conectar son, la mayoría de las veces, clientes que no
 *                   contrataron ese servicio.
 *  · sin_entrega  → nada. El sync anda y no hay datos porque la pauta está
 *                   pausada: no es una falla y no se le pide nada a nadie.
 */
/** Días con datos recientes para considerar que un cliente "tiene pauta andando". */
export const DIAS_PAUTA_RECIENTE = 30;

/**
 * ¿Esta falla de fuente es un incidente? Solo en fuentes de pauta y en
 * clientes que tenían datos hace poco: una cuenta caída que gastaba la semana
 * pasada es plata que no estamos viendo hoy. Una que no trae nada desde junio
 * es un pendiente, no una urgencia.
 */
export function esIncidenteDeFuente(s: Pick<SaludFuente, "fuente" | "ultimoDato">, ahora: Date): boolean {
  if (s.fuente === "organico" || !s.ultimoDato) return false;
  const dias = (ahora.getTime() - Date.parse(`${s.ultimoDato}T00:00:00Z`)) / 86_400_000;
  return dias <= DIAS_PAUTA_RECIENTE;
}

export function propuestasDeCobertura(salud: SaludFuente[], ahora = new Date()): Propuesta[] {
  const out: Propuesta[] = [];
  for (const s of salud) {
    const fuente = NOMBRE_FUENTE[s.fuente];
    const nivel = esIncidenteDeFuente(s, ahora) ? { nivel: 5 as const } : {};
    const base = {
      clientId: s.clientId,
      clave: `cobertura:${s.clientId}:${s.fuente}`,
      arsPorDia: null,
      responsable: "equipo" as const,
      creadaPor: "regla:cobertura",
      venceEnDias: 7,
    };
    if (s.estado === "fallando") {
      const desde = fechaCorta(s.fallandoDesde);
      const que = `Reconectar ${fuente}: no se pueden traer los datos${desde ? ` desde el ${desde}` : ""}`;
      const causa = errorEnCastellano(s.ultimoError);
      out.push({
        ...base,
        tipo: "cobertura:fallando",
        que,
        porque: {
          resumen: causa ? `La conexión con ${fuente} falla cada noche: ${causa}.` : `La conexión con ${fuente} falla cada noche.`,
          datos: [
            { etiqueta: "Intentos fallidos seguidos", valor: s.fallasSeguidas, unidad: "veces" },
            { etiqueta: "Último dato", valor: s.ultimoDato, unidad: "texto" },
          ],
          ...nivel,
        },
        accion: { tipo: "tarea", titulo: que, descripcion: `${s.detalle}${s.ultimoError ? `\nError: ${s.ultimoError}` : ""}` },
      });
    } else if (s.estado === "atrasada") {
      const que = `Revisar por qué no llegan datos de ${fuente}${s.ultimoDato ? ` desde el ${fechaCorta(s.ultimoDato)}` : ""}`;
      out.push({
        ...base,
        tipo: "cobertura:atrasada",
        que,
        porque: {
          resumen: s.fuente === "organico"
            ? "La conexión anda pero las métricas de la página no se actualizan."
            : `La conexión con ${fuente} anda pero hace más de un día que no termina bien.`,
          datos: [{ etiqueta: "Último dato", valor: s.ultimoDato, unidad: "texto" }],
          ...nivel,
        },
        accion: { tipo: "tarea", titulo: que, descripcion: s.detalle },
      });
    } else if (s.estado === "sin_conexion" && s.fuente !== "organico" && s.ultimoDato) {
      // Tuvo datos y ya no tiene conexión: no es "falta conectar", es que SE
      // DESCONECTÓ. Es la firma de Distrillantas y lo que más importa ver.
      const que = `Reconectar ${fuente}: se desconectó (último dato del ${fechaCorta(s.ultimoDato)})`;
      out.push({
        ...base,
        tipo: "cobertura:desconectada",
        que,
        porque: {
          resumen: `La cuenta tenía datos hasta el ${fechaCorta(s.ultimoDato)} y ya no está conectada: desde ahí no vemos ni el gasto, ni los leads, ni si se frena.`,
          datos: [{ etiqueta: "Último dato", valor: s.ultimoDato, unidad: "texto" }],
          ...nivel,
        },
        accion: { tipo: "tarea", titulo: que, descripcion: s.detalle },
      });
    } else if (s.estado === "sin_conexion" && s.fuente === "meta_ads") {
      const que = "Conectar su cuenta de Meta, o marcar que no tiene pauta";
      out.push({
        ...base,
        tipo: "cobertura:sin_meta",
        que,
        porque: {
          resumen: "No tiene cuenta de Meta mapeada: no vemos su pauta, ni sus leads, ni si se frena.",
          datos: [],
        },
        accion: { tipo: "tarea", titulo: que, descripcion: s.detalle },
        venceEnDias: 30,
      });
    }
  }
  return out;
}

/**
 * Clientes cuya pauta no estamos viendo bien: su caída de gasto no se puede
 * afirmar. Incluye la cuenta que se desconectó (sin conexión pero con datos
 * viejos): sus filas dejan de llegar y el gasto "cae a cero" en nuestra base
 * aunque los anuncios sigan andando.
 */
export function clientesConPautaCiega(salud: SaludFuente[]): Set<string> {
  return new Set(
    salud
      .filter((s) => s.fuente === "meta_ads" || s.fuente === "google_ads")
      .filter((s) => s.estado === "fallando" || s.estado === "atrasada" || (s.estado === "sin_conexion" && s.ultimoDato != null))
      .map((s) => s.clientId),
  );
}
