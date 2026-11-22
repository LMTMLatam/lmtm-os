---
name: lmtm-ejemplos-tendencias
displayName: Ejemplos de tendencias diarias
description: "Cuándo una noticia entra al panel de tendencias y cuándo no, con una corrida real del 22/11/2026 donde de cuatro rubros buscados se guardó una. Cargala antes de guardar tendencias con lmtmSaveTrend."
required: false
---

# Qué tendencia entra al panel

El panel lo lee quien arma contenido para un cliente. Una tendencia que no se puede convertir en una pieza esta semana le hace perder tiempo.

## Tres condiciones. Tienen que cumplirse las tres
1. **La fecha de la fuente se puede confirmar.** Los buscadores devuelven notas viejas con el año actual en el encabezado. Si el texto habla de otro año, o no podés saber de cuándo es, no entra.
2. **Es del rubro, no del país.** «Cayó la producción industrial» no le da un posteo a un proveedor industrial. «Se lanzó una línea de crédito para comprar maquinaria» sí.
3. **Podés decir en una frase qué pieza haría un cliente con eso y cuándo.** Si no podés, es una noticia, no una tendencia.

## Antes de buscar
Mirá lo que ya está en el panel de los últimos días. El 20/11 había 18 tendencias en un día y cuatro eran la misma noticia de precios de neumáticos contada cuatro veces. Si el tema ya está, no lo sumes de nuevo.

## La corrida del ejemplo
Cuatro búsquedas, una por rubro.

| Rubro | Qué apareció | Decisión |
|---|---|---|
| Comercio | Fecha del Black Friday y una campaña de shoppings de tres días, a cinco días | **Guardada** |
| Turismo | Balances de fines de semana largos anteriores; el del fin de semana en curso todavía no se había publicado | No: el dato de hoy no existe |
| Eventos | Notas de fiestas de fin de año con el año actual en el título y texto de dos años atrás | No: fecha no confiable |
| Industria | Índice de producción de dos meses antes, publicado hacía 16 días | No: viejo y sin uso para un posteo |

Una de cuatro. Está bien. Cinco buenas por semana sirven más que dieciocho por día.

## Cómo se escribe el resumen
El resumen de la guardada decía, en este orden:
- el hecho, con sus fechas;
- **qué hacer**: «una pieza que diga qué descuento real hay, en qué productos y hasta cuándo»;
- **cuándo**: «publicada el miércoles o jueves, no el viernes»;
- **cuándo no hacer nada**: «si el cliente no tiene promo confirmada, no se arma nada: se le pregunta antes»;
- **qué no usar**: «las cifras de ventas esperadas son de otro año».

## Etiquetas
- `potencial-de-gancho`: se puede hacer una pieza esta semana.
- `explicativo`: sirve de contexto para un copy, no da una pieza sola.
- `ignorar`: casi nunca hace falta guardarla. Si no sirve, no se guarda.

Usá los rubros exactos de la lista de la rutina: con otro nombre no le llega a ningún cliente.
