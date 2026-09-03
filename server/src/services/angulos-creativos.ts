// LMTM-OS: los 18 ángulos para vender el mismo producto (18/8).
//
// Fuente: guía de Aguara ("18 ángulos para vender el mismo producto"), que el
// usuario pasó para que la usen los agentes.
//
// PARA QUÉ SIRVE
// El agente de ideas venía escribiendo variaciones del mismo enfoque: "5 errores
// que…", "lo que nadie te cuenta de…", "3 señales de…". Mirando las 90 ideas de
// GRUPO MA se ve clarísimo — casi todas son listas de errores o de tips. Un
// ángulo no es un tema: es DESDE DÓNDE se cuenta el mismo tema. Con estos 18, un
// solo producto da 18 piezas distintas sin repetir el enfoque.
//
// Se rota por cliente para que dos ideas seguidas no salgan del mismo ángulo, y
// el ángulo elegido queda anotado en la idea: así después se puede medir cuál
// funciona en cada cuenta.

export interface AnguloCreativo {
  /** Clave estable. Se guarda en la idea, así que NO se renombra. */
  id: string;
  nombre: string;
  /** Qué hace el ángulo, en una línea. Es lo que lee el modelo. */
  como: string;
  /** Guion de ejemplo de la guía, para que el modelo entienda el tono. */
  ejemplo: string;
}

export const ANGULOS: AnguloCreativo[] = [
  { id: "dolor", nombre: "El dolor que resuelve", como: "Arrancás por el problema que la persona ya siente.",
    ejemplo: "¿Te levantás con las manos secas y tirantes todas las mañanas, y la crema común no te dura nada?" },
  { id: "antes-despues", nombre: "Transformación antes/después", como: "Mostrás el resultado con un antes y un después reales.",
    ejemplo: "Mirá mi piel hace 30 días… y mirala ahora. Lo único que cambió fue sumar esta crema a la noche." },
  { id: "cliente-real", nombre: "Lo que dice un cliente real", como: "Prueba social: dejás que hable un cliente, no vos.",
    ejemplo: "'Las uso todo el día parada en el laburo y, por primera vez, no me duelen los pies.' Eso me escribió Caro." },
  { id: "experto", nombre: "Lo que dice un experto", como: "Autoridad: una figura que sabe respalda el producto.",
    ejemplo: "Le pregunté a una nutricionista si sirve tomar magnesio a la noche. Esto me respondió." },
  { id: "vs-competencia", nombre: "Por qué es distinto a la competencia", como: "Marcás la diferencia clave contra las alternativas.",
    ejemplo: "Todos los cafés instantáneos saben un poco a quemado. Este no, y es por una sola diferencia." },
  { id: "mito", nombre: "El mito desmentido", como: "Rompés una creencia común de tu categoría.",
    ejemplo: "'Para abrigar tiene que ser grueso y pesado.' Mentira. Este buzo finito abriga más." },
  { id: "error", nombre: "El error que comete quien no lo usa", como: "Señalás un error costoso que la gente comete sin darse cuenta.",
    ejemplo: "¿Todavía te hidratás con bebidas deportivas llenas de azúcar? Ese es el error que casi nadie ve." },
  { id: "objecion", nombre: "La objeción #1 respondida", como: "Tomás la excusa más común y la desarmás.",
    ejemplo: "'Es caro.' Hacé la cuenta conmigo: te sale menos que un café por día." },
  { id: "para-quien-no", nombre: "Para quién NO es", como: "Filtrás: al decir para quién no es, atraés más al que sí.",
    ejemplo: "Este producto NO es para vos si buscás lo más barato del mercado." },
  { id: "precio-por-dia", nombre: "Precio dividido por día", como: "Bajás la barrera del precio partiéndolo en el día.",
    ejemplo: "'$30.000 el pote' suena mucho. Pero rinde dos meses: son 500 pesos por día." },
  { id: "progresion", nombre: "Qué pasa a los 7, 14 y 30 días", como: "Mostrás la progresión de resultados en el tiempo.",
    ejemplo: "A los 7 días vas a notar la piel más hidratada. A los 14, menos rojeces. A los 30, cambia la textura." },
  { id: "detras-de-escena", nombre: "Cómo se hace / detrás de escena", como: "Mostrás el proceso real; genera confianza y deseo.",
    ejemplo: "Vení que te muestro cómo hacemos esto adentro. Cuando veas los ingredientes reales…" },
  { id: "rutina", nombre: "La rutina donde encaja", como: "Ubicás el producto dentro de un momento del día.",
    ejemplo: "Mi rutina de la mañana en 30 segundos… y dónde entra este café." },
  { id: "regalo", nombre: "El regalo perfecto para…", como: "Posicionás el producto como el regalo ideal para alguien puntual.",
    ejemplo: "¿Buscás un regalo y no sabés qué? Este set es el regalo perfecto para el que ya tiene todo." },
  { id: "costo-inaccion", nombre: "Lo que pasa si NO lo comprás", como: "Mostrás el costo de la inacción, con honestidad.",
    ejemplo: "Si seguís sin usar esto, en 6 meses tu piel va a estar igual o peor." },
  { id: "origen", nombre: "La historia de por qué lo creamos", como: "Contás el origen; humaniza y diferencia.",
    ejemplo: "Creé esto porque no encontraba ninguno que hiciera lo que yo necesitaba." },
  { id: "ingrediente-exclusivo", nombre: "El ingrediente o material exclusivo", como: "Destacás ese componente que te hace único.",
    ejemplo: "El secreto está en un ingrediente que casi nadie usa porque es caro." },
  { id: "escasez", nombre: "Queda poco stock", como: "Urgencia y escasez REALES para empujar la decisión.",
    ejemplo: "Quedan pocas unidades de esta tanda y no sé cuándo vuelvo a reponer." },
];

/** Ángulos que solo funcionan con un producto físico que se vende por unidad.
 *  Para una inmobiliaria o una agencia, "queda poco stock" o "precio por día"
 *  suenan falsos, y la escasez inventada es justo lo que la guía marca como
 *  error ("urgencia y escasez REALES"). */
const SOLO_PRODUCTO = new Set(["escasez", "precio-por-dia", "regalo", "ingrediente-exclusivo", "progresion"]);

const RUBRO_SIN_STOCK = /inmobiliaria|desarrollador|loteos|agencia|servicio|finanzas|b2b|empresa|tecnologia/i;

/**
 * Los ángulos que se le ofrecen a un cliente, ya filtrados por rubro y rotados
 * para que no salga siempre el mismo primero.
 *
 * `yaUsados` son los ids de los últimos ángulos del cliente: se mandan al final
 * para que el modelo agarre uno fresco sin prohibirle repetir cuando conviene.
 */
export function angulosPara(rubro: string | null, yaUsados: string[] = []): AnguloCreativo[] {
  const aptos = RUBRO_SIN_STOCK.test(rubro ?? "")
    ? ANGULOS.filter((a) => !SOLO_PRODUCTO.has(a.id))
    : ANGULOS;
  const usados = new Set(yaUsados);
  const frescos = aptos.filter((a) => !usados.has(a.id));
  const repetidos = aptos.filter((a) => usados.has(a.id));
  return [...frescos, ...repetidos];
}

/** El bloque que se le pega al prompt del agente de ideas. */
export function bloqueDeAngulos(rubro: string | null, yaUsados: string[] = []): string {
  const lista = angulosPara(rubro, yaUsados)
    .slice(0, 12)
    .map((a) => `- ${a.id} — ${a.nombre}: ${a.como} Ej: "${a.ejemplo}"`)
    .join("\n");
  return [
    "ÁNGULOS DISPONIBLES (elegí UNO por idea y no repitas el de la idea anterior):",
    lista,
    "El ángulo es DESDE DÓNDE contás el tema, no el tema. Dos ideas del mismo tema con ángulos distintos son dos piezas distintas.",
    yaUsados.length ? `Ya se usaron hace poco en esta cuenta: ${yaUsados.join(", ")}. Preferí otros.` : "",
  ].filter(Boolean).join("\n");
}

/** Detecta qué ángulo usó una idea ya escrita, para poder rotar la próxima vez. */
export function anguloDe(texto: string): string | null {
  const t = texto.toLowerCase();
  const m = t.match(/\bangulo\s*:\s*([a-z-]+)/i) ?? t.match(/\bángulo\s*:\s*([a-z-]+)/i);
  if (m && ANGULOS.some((a) => a.id === m[1])) return m[1];
  return null;
}
