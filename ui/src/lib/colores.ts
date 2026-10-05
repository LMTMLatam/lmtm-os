/**
 * Colores que NO son de estado y que igual tienen que ser uno solo.
 *
 * El caso que lo motivó: el color de un proyecto lo elige una persona, y cuando
 * no eligió ninguno cada pantalla inventaba su propio fallback. El sidebar y la
 * ficha de issue pintaban índigo (#6366f1); las rutinas y las columnas pintaban
 * gris pizarra (#64748b). El MISMO proyecto se veía de dos colores distintos
 * según desde dónde lo mirabas, que es peor que cualquiera de los dos colores.
 */

/**
 * Proyecto o etiqueta sin color propio.
 *
 * Va en gris de texto apagado y no en índigo a propósito: "nadie eligió un
 * color" no debería verse como una decisión de diseño. Además es un token, así
 * que se adapta a dark mode — los dos hex anteriores no lo hacían.
 */
export const COLOR_SIN_ELEGIR = "var(--color-muted-foreground)";
