---
name: lmtm-ejemplos-licitaciones
displayName: Ejemplos de curaduría de licitaciones
description: "Cómo se decide si una licitación de Mercado Público sirve a la agencia, con una tanda real de 13 (1 útil, 12 descartadas) del 22/11/2026. Cargala antes de curar candidatas."
required: false
---

# Cómo se cura una licitación

**No copies los motivos de estos casos.** Cada licitación se decide leyendo su ficha.

## El nombre engaña. La ficha dice qué se compra
Tres palabras aparecen en licitaciones que no son para una agencia:

- **«Audiovisual»**: muchas veces es la compra de equipos (cámaras, proyectores, computadoras de edición).
- **«Comunicaciones»**: puede ser telecomunicación (radio VHF, enlaces de fibra, internet).
- **«Pauta»**: en Chile, «pauta informativa» es el boletín diario de noticias que venden las agencias de prensa. No es pauta publicitaria.

Lo que desempata está en `raw` de la licitación:
- `Items.Listado[].NombreProducto` y `Categoria`: qué se compra de verdad. «Publicidad en Internet» sirve. «Boletines informativos», «Agencia de noticias» o un equipo, no.
- `Fechas.FechaFinal`: último día para hacer preguntas. Suele ser una semana antes del cierre. Si ya pasó, la oferta se arma a ciegas: decilo.
- `Tiempo`: meses de contrato.

## Tres preguntas para decidir
1. **¿Es un servicio o una compra de cosas?** Si se compran bienes, descartada, aunque la pida un departamento de comunicaciones.
2. **¿Es lo que vendemos?** Estrategia, contenido, redes, diseño, web, video, pauta digital: sí. Monitoreo de prensa, agencia de noticias, concesión de cartelería en la calle, avisaje en radio y televisión: no.
3. **¿Se puede entregar desde Rosario?** Una campaña digital, sí. Montar un evento en otra región o transmitir en vivo desde una oficina pública todos los días, no.

Si las tres son sí y cierra en 3 días o más: útil.

## Cómo se escribe la relevancia
En la útil, dos o tres frases con:
- qué pide y cuál es el ítem de la ficha;
- qué ofertaríamos;
- monto, meses, fecha de cierre **y fecha límite de preguntas**;
- lo que una persona tiene que confirmar en las bases antes de ofertar (si exige domicilio o inscripción en el país, si el monto incluye la inversión en medios).

En la descartada, una frase con el motivo real. «Otro rubro» alcanza cuando es obvio; cuando el nombre confunde, decí por qué confunde.

## La tanda del ejemplo
| Caso | Decisión | Qué lo definió |
|---|---|---|
| «Agencia creativa y medios digitales» de una universidad | Útil | Ítem «Publicidad en Internet», se entrega remoto, 3 meses |
| «Pauta informativa y señal de streaming» | Descartada | Ítem «Boletines informativos» y streaming presencial |
| «Monitoreo de prensa» | Descartada | Ítem «Agencia de noticias»: es recorte de medios |
| «Producción de eventos» de Navidad | Descartada | Montaje presencial en otra región, sin difusión |
| «Equipos para la Unidad de Comunicaciones» | Descartada | Se compran computadoras |
| Otras ocho | Descartadas | Equipos, cámaras de seguridad, radio, enlaces, una escultura |

Una útil de trece es un buen resultado. Marcar útil lo dudoso llena la lista y nadie la mira.

## Mirá también las útiles viejas
Antes de cerrar, revisá las que ya están en «útil»: si alguna cierra en menos de 3 días y nadie la tomó, decilo en el comentario final. Curar bien no sirve si nadie decide ofertar.
