// LMTM: para qué sirve lo que se propone (pedido de Naza 20/11: «que digan para qué serviría el resultado de lo que
// quieren hacer y en qué se basaron para proponerlo»). El «en qué se basa» ya viene en cada propuesta (el porqué de la
// regla, la justificación del agente); el «para qué» sale del tipo, en el idioma del negocio. Puro.

import type { Propuesta } from "./aprobaciones";

const POR_DECISION: Array<[RegExp, string]> = [
  [/^saldo:/, "Que la pauta no se corte por falta de saldo"],
  [/^pauta:gasto_caido$/, "Que la pauta vuelva a gastar y a traer consultas"],
  [/^pauta:sin_leads$/, "Dejar de pagar anuncios que no traen consultas"],
  [/^pauta:fatiga/, "Cambiar anuncios que la gente ya se cansó de ver"],
  [/^pauta:escalar$/, "Poner más plata en lo que ya trae consultas baratas"],
  [/^pauta:sumar_keywords$/, "Comprar más de las búsquedas que ya traen consultas"],
  [/^pauta:(pausar_keywords|negativas)$/, "Dejar de pagar búsquedas que no traen consultas"],
  [/^pauta:landing$/, "Que la página adonde llega la pauta no pierda los clics pagos"],
  [/^pauta:(costo_calificado_alto|calificados_bajos)$/, "Traer consultas que terminen en venta"],
  [/^pauta:/, "Que la pauta rinda más con la misma plata"],
  [/^cadena:sin_calendario$/, "Que el cliente tenga publicaciones esta semana"],
  [/^cadena:contenido_incompleto$/, "Que los posts programados salgan en su fecha"],
  [/^cadena:/, "Que lo programado se publique de verdad"],
  [/^cobertura:sin_meta$/, "Ver su pauta y sus consultas, y que avise si se frena"],
  [/^cobertura:/, "Volver a leer los datos de este cliente cada noche"],
  [/^contenido:angulo$/, "Publicar más de lo que ya le rinde al rubro"],
  [/^contenido:busquedas$/, "Aparecer en lo que la gente busca en Google"],
  [/^contenido:reutilizar$/, "Sacarle más jugo a lo que ya funcionó"],
  [/^contenido:/, "Que las redes del cliente rindan más"],
  [/^web:sin_conversiones$/, "Saber qué visita terminó en consulta y que las campañas aprendan de eso"],
  [/^web:caida_google$/, "Recuperar las visitas que llegan desde Google"],
  [/^web:/, "Que la web traiga más consultas"],
  [/^upsell:/, "Ofrecerle al cliente algo que hoy le falta"],
  [/^cola:/, "Destrabar una tarea que espera a una persona"],
];

export function paraQueDecision(tipo: string): string | null {
  return POR_DECISION.find(([re]) => re.test(tipo))?.[1] ?? null;
}

const POR_ACCION: Record<string, string> = {
  pause: "Dejar de gastar en lo que no trae consultas",
  set_budget: "Poner la plata donde rinde",
  shift_budget: "Pasar plata de lo que rinde menos a lo que rinde más",
  duplicate: "Escalar lo que ya funciona sin tocar el original",
  actualizar_plugins: "Cerrar agujeros de seguridad de la web",
  actualizar_temas: "Cerrar agujeros de seguridad de la web",
  actualizar_wordpress: "Cerrar agujeros de seguridad de la web",
  version_php: "Que la web ande más rápido y siga recibiendo arreglos de seguridad",
  purgar_cache: "Que los cambios se vean ya en la web",
  quitar_spam: "Sacar spam escondido que perjudica a la web en Google",
  reemplazar_texto: "Que la web diga lo correcto (y nada escondido que la perjudique)",
  instalar_ssl: "Que la web sea segura y Google no la castigue",
  forzar_https: "Que la web sea segura y Google no la castigue",
  crear_redireccion: "Que no se pierdan visitas que llegan por links viejos",
  desactivar_plugin: "Sacar un plugin que da problemas",
  bajar_administrador: "Cerrar un acceso sospechoso a la web",
};

export function paraQuePropuesta(p: Pick<Propuesta, "tipo" | "accion">): string | null {
  const accion = p.accion && typeof p.accion === "object" ? (p.accion as { accion?: unknown }).accion : undefined;
  if (typeof accion === "string" && POR_ACCION[accion]) return POR_ACCION[accion];
  if (p.tipo === "accion_codigo") return "Arreglar o sumar algo en el sistema";
  if (p.tipo === "request_board_approval") return "Que el agente pueda terminar la tarea";
  return null;
}
