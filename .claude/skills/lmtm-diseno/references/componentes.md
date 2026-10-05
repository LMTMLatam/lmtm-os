# Componentes de LMTM

Todos en `ui/src/lmtm/componentes.tsx`; los textos que se repiten entre
pantallas ("Le toca al equipo", "$48.217", "13/09") salen de
`ui/src/lmtm/formato.ts`, para que Hoy, Cartera y el resumen de las 9:00 digan
lo mismo con las mismas palabras.

## LmtmPantalla

El contenedor de una pantalla para decidir. Pone la clase `.lmtm` (los tokens),
el tema y el encabezado: `LMTM · <pantalla>` a la izquierda, con `subtitulo`
debajo (en Hoy, la fecha); a la derecha, el botón al resto del panel (`panel`)
y el de la luna.

- La fecha va debajo y no a la derecha: "miércoles 30 de septiembre" más dos
  botones de 44 px no entran en 390 px.
- `panel` es la salida al resto de la app (Hoy es la pantalla de inicio y va sin
  la barra de paperclip). El informe para el cliente no lo pasa: el cliente no
  entra al panel.

- Ancho máximo 680 px, 16 px de margen lateral, sin la barra de paperclip.
- El tema se guarda en `localStorage` (`lmtm.tema`) dentro de `try`: en una
  ventana privada o con el almacenamiento bloqueado, la pantalla abre en claro y
  funciona igual.

## Franja

Encabezado de un bloque: 13 px, mayúsculas, la cantidad en `tinta-3`.

- Con `critica`, el texto va en `critico-texto` y SIEMPRE con un ícono
  (`OctagonAlert`): el color solo no alcanza.
- 36 px arriba (`mt-9`). Es lo único que separa un bloque del otro: no hay
  tarjetas.
- `primera`: la franja abre la pantalla y el aire va debajo. Es el caso de los
  incidentes en Hoy, que van arriba de todo, incluso del número héroe: lo que
  no puede esperar se ve antes que cualquier monto.

## Plata

Un monto por día.

- En lista: 20 px seminegrita, "por día" debajo en 11 px. Alineada a la derecha
  para leer la columna de arriba abajo.
- `grande` (en un incidente): 18 px con "por día" al lado.
- `null`: "sin dato" en itálica `tinta-3`, con "de plata" debajo en la lista o
  "Plata en juego: sin dato" en un incidente. Nunca "$0" ni un guion: un 0 dice
  que no se pierde nada, y no lo sabemos.

## PorQue

La frase del motor (`porque.resumen`) y hasta 3 números (`porque.datos`), cada
uno como una línea de texto corrido: "Gasto diario antes: **$48.217 por día**".

- Etiqueta en `tinta-3`, valor en `tinta` 500. Así, en el celular, la etiqueta y
  el valor parten juntos y no en dos columnas que quiebran por separado.
- Los datos sin valor no se muestran: un "sin dato" en la evidencia no explica
  nada. Si TODA la evidencia falta, la frase alcanza.
- `porque.nota` (por ejemplo, "objetivo propuesto: 20% menos que el último
  mes") va arriba en `atencion-texto`.

## AccionesDecision

Un botón principal que dice lo que hace y "Descartar" como secundario.

| La decisión | El botón | Qué pasa al tocarlo |
|---|---|---|
| Cambia el presupuesto | "Subir a $18.000" / "Bajar a $9.000" | Ensayo contra la cuenta → "La cuenta lo acepta" → Confirmar |
| Mueve plata entre conjuntos | "Mover $5.000 por día" | Ensayo → Confirmar |
| Duplica un ganador | "Duplicar (nace pausado)" | Ensayo → Confirmar |
| Pausa | "Pausar" | Ensayo → Confirmar |
| Es una tarea | "Asignar al equipo" / "Avisarle al cliente" | Crea la tarea en ClickUp, sin ensayo |
| No tiene acción | "Ya lo hice" | La marca como hecha; se confirma con el próximo dato |

- **Lo que toca la pauta se ensaya siempre primero.** El ensayo es la misma
  ruta sin `confirmar`: valida contra la cuenta y no escribe. Recién con el
  ensayo bien aparece "Confirmar".
- "Descartar" abre un campo: el motivo es obligatorio (5 letras o más) porque
  es lo que ajusta la regla que la propuso.
- Un error se muestra con ícono y el motivo que escribió la guarda ("No se hizo:
  el presupuesto cambió desde que se propuso…"), nunca se traga.
- Ya hecha (`ejecutada`), no hay botones: "Hecho. Se confirma con el próximo
  dato."

## Boton

44 px de alto como mínimo, 10 px de radio, 14 px.

- `primario`: fondo `tinta`, texto `papel`. Uno solo por fila.
- `secundario`: borde `linea-2`, texto `tinta-2`.

## FilaDecision

Una decisión de la lista "Para decidir hoy":

```
1   CLIENTE                  Le toca al equipo     $48.217
    Qué hacer (16 px, 500)                         por día
    Por qué (14 px, tinta-2)
    Dato: valor
    [Botón principal] [Descartar]
```

- Grilla `22px 1fr auto`: número, contenido y la columna de plata.
- Los botones van en una fila propia, a lo ancho, con la sangría del contenido
  (`pl-[34px]`): en el celular la columna de plata no les roba lugar.
- 18 px arriba y abajo, línea de 1 px entre filas.

## BloqueIncidente

Un incidente (nivel 5): lo único que va arriba de la plata parada.

- Regla izquierda de 3 px `critico` y un lavado `critico-suave` que se
  desvanece hacia la derecha. Sin borde alrededor.
- Qué hacer en 17 px 600; por qué con hasta 3 datos; la plata en `grande`.

## BarraCobertura y LeyendaCobertura

"Qué estamos viendo": una barra por fuente (Meta, Google, Redes) con los
clientes según el estado de su fuente.

- Barra apilada de 12 px, 2 px de separación entre tramos (dataviz), orden fijo:
  al día, sin pauta corriendo, atrasada, fallando, sin conectar.
- Debajo de cada barra, cada estado presente con su ícono, su número y su
  palabra ("✓ 17 al día · ✕ 1 fallando · 32 sin conectar"). La barra sola
  distinguía "atrasada", "fallando" y "sin conectar" solo por el color.
- Los íconos de los estados neutros ("sin pauta corriendo", "sin conectar") van
  en `tinta-3`: el gris del tramo sobre el papel no llega a 3:1. No son
  problemas y no llevan color de estado.
- La leyenda (muestra de color con borde + palabra) dice qué tramo es cuál.
- `aria-label` con los conteos en palabras.
