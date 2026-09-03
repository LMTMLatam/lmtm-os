// LMTM-OS: qué ve el cliente en "Para aprobar" de su panel (18/8).
//
// EL PROBLEMA
// El panel mostraba solo el TÍTULO y el identificador: "Validar Vigencia De
// Sarratea 625 · LMTM-2862 · externa". El cliente no tiene forma de saber qué
// le están pidiendo, así que no aprueba ni descarta — y la lista crece.
// Verificado el 18/8: 247 propuestas sin resolver en 48 clientes, la más vieja
// de junio. Un cementerio, no una bandeja de trabajo.
//
// Lo llamativo es que la descripción del issue SÍ trae el paso a paso completo
// ("Contactar hoy a X y confirmar si… Con respuesta vigente: actualizar la
// pieza… Si se vendió: cancelar y registrar el motivo"). Nunca se enviaba al
// panel. Esto lo expone y lo ordena.

/** Cuántos días una propuesta sigue siendo accionable para el cliente.
 *
 *  Pasado ese plazo el contexto ya cambió (el presupuesto es otro, la campaña
 *  terminó, la propiedad se vendió) y aprobarla a ciegas es peor que ignorarla.
 *  Sale de "Para aprobar" y queda en el historial de tareas. */
const VIGENCIA_DIAS = 21;

/**
 * Temas que NO van al panel del cliente aunque el agente los proponga.
 *
 *  · saldo/recarga — se avisa por WhatsApp, es la regla del equipo. Igual se
 *    seguían creando: 46 de las 247 pendientes eran de saldo (18/8).
 *  · ideas de contenido — su lugar es la lista de ClickUp, donde el equipo las
 *    trabaja. En el plan de acción solo son ruido que nadie aprueba.
 */
const FUERA_DEL_PANEL = [
  // Plata: saldo, recarga, tope, presupuesto. La primera versión escribía
  // `\brecarga\b` y no atrapaba "RecargAR presupuesto", que es justo como los
  // titula el agente — dos de esas seguían llegando al panel de BRACHETTA
  // (verificado en producción 18/8). Se matchea por raíz, no por palabra exacta.
  /saldo|recarg|presupuest|spendcap|spend cap|\btope\b|facturaci[oó]n/i,
  /idea de (posteo|contenido)|propuesta de (posteo|contenido)|\bcarrusel\b|\breel\b|\bposteo\b/i,
];

export interface PropuestaBase {
  originKind: string | null;
  status: string | null;
  title: string;
  createdAt: Date | string | null;
}

/** ¿Esta propuesta merece un botón "Aprobar" en el panel del cliente? */
export function esPropuestaViva(t: PropuestaBase): boolean {
  if (t.originKind !== "agent_proposed" || t.status !== "backlog") return false;
  if (FUERA_DEL_PANEL.some((re) => re.test(t.title))) return false;
  const creada = t.createdAt ? new Date(t.createdAt).getTime() : 0;
  return creada > 0 && Date.now() - creada < VIGENCIA_DIAS * 86_400_000;
}

export interface ResumenPropuesta {
  /** Qué hay que hacer, en texto corrido y sin la metadata interna. */
  queHacer: string | null;
  /** Los pasos, cuando la descripción los trae numerados o con viñetas. */
  pasos: string[];
  responsable: string | null;
  plazo: string | null;
}

/**
 * Parte la descripción del issue en algo que el cliente pueda leer y decidir.
 *
 * NO se le pide nada a un LLM: las descripciones ya vienen escritas por los
 * agentes con esta forma, y meter un modelo acá sería pagar por reformatear un
 * texto que ya está bien. Solo se saca lo interno y se ordena.
 */
export function resumirPropuesta(descripcion: string | null): ResumenPropuesta {
  const vacio: ResumenPropuesta = { queHacer: null, pasos: [], responsable: null, plazo: null };
  if (!descripcion) return vacio;

  // El pie "_Origen: … detectado por agente_" es trazabilidad interna: al
  // cliente no le dice nada y le ocupa la mitad de la tarjeta.
  let texto = descripcion
    .replace(/_?Origen:[^\n]*_?/gi, "")
    .replace(/\*\*Cliente\*\*:[^\n]*/gi, "")
    .trim();

  const sacar = (re: RegExp): string | null => {
    const m = texto.match(re);
    if (!m) return null;
    texto = texto.replace(m[0], "").trim();
    return m[1].trim().slice(0, 120);
  };
  const responsable = sacar(/(?:^|\n)\s*(?:Responsable|Dueño de respuesta|Seguimiento interno)\s*:\s*([^\n]+)/i);
  const plazo = sacar(/(?:^|\n)\s*(?:Plazo|Fecha límite|Deadline)\s*:\s*([^\n]+)/i);

  // Pasos ya escritos como lista. Si no los hay, el texto va entero: los
  // agentes escriben en prosa accionable ("Contactar hoy a X y confirmar…"),
  // así que trocearlo a la fuerza lo empeora.
  const pasos = texto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(?:[-*•]|\d+[.)])\s+/.test(l))
    .map((l) => l.replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter((l) => l.length > 3)
    .slice(0, 8);

  const queHacer = texto
    .split("\n")
    .filter((l) => !/^(?:[-*•]|\d+[.)])\s+/.test(l.trim()))
    .join(" ")
    .replace(/\*\*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    queHacer: queHacer.length > 10 ? queHacer.slice(0, 900) : null,
    pasos,
    responsable,
    plazo,
  };
}
