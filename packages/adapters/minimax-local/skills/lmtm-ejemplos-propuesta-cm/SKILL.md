---
name: lmtm-ejemplos-propuesta-cm
displayName: Ejemplos de propuesta CM y de calendario
description: "Cómo se arma la propuesta de contenido del mes y un calendario de un cliente sin sumar a la pila, con dos casos reales anónimos del 22/11/2026. Cargala antes de escribir una Propuesta CM, una auditoría de perfil o un calendario."
required: false
---

# Propuesta de contenido y calendario

**No copies las secciones ni las ideas de los casos.** Sirven para ver cómo se decide.

## Antes de proponer una idea
1. **¿Cuántas ideas tuyas hay sin usar?** La memoria del cliente trae el destino de las ideas de los agentes en su lista. Si dice 100 pendientes y 0 aprobadas, el cliente no necesita la idea 101: necesita que alguien elija. Proponé pocas (cuatro) y pedí que se vacíe la lista.
2. **¿Qué descartó el equipo?** Si producción ya rechazó un tipo de pieza (ganchos de intriga, tono de lujo, piezas de «trayectoria»), no lo propongas de nuevo con otro nombre.
3. **¿Ya hay un calendario propuesto sin cargar?** Si lo hay, no escribas otro. Decí cuál es y desde cuándo espera.

## Cómo leer la matriz de contenido
`lmtmGetClientContentMatrix` da señales, no conclusiones. Abrí las fechas antes de creerle:

- **«Aperturas repetidas»**: mirá en qué días salieron. Si la misma apertura aparece en días seguidos, es la misma pieza publicada varias veces. El pedido es revisar la planilla, no proponer ángulos nuevos.
- **Cantidad de posts**: cada pieza cuenta dos veces si sale en Instagram y en Facebook. «Status» es la copia de Facebook.
- **Formato que más rinde**: se dice cuántos casos hay detrás. Dos reels no prueban nada.
- **Piezas sin objetivo**: si ninguna pieza del calendario tiene objetivo, ese es un pedido antes que cualquier idea.

## El baúl de ganchos
Buscá por cliente y por rubro, y leé cada gancho antes de usarlo. En un rubro amplio como «industria», la mayoría son de otros negocios: de 17 ganchos del rubro, a un transportista le servía uno. Ese uno, que además nunca se había usado, fue la primera idea de la propuesta.

## Caso 1: propuesta del mes de un cliente industrial
- **Diagnóstico**: publica parejo; el video rinde el triple y aun así es un tercio de lo que hace; las «repeticiones» eran publicaciones duplicadas.
- **Qué reforzar**: lo que lo separa de sus competidores (flota propia), personas reales en lugar de historia, y las certificaciones que están en la web y no en las redes.
- **Mix**: la misma cantidad que ya sostiene, con más video y sin el formato que peor rinde. «Si el cotizado es menor, se sacan primero las placas.»
- **Ideas**: cuatro. Cada una dice de dónde sale (gancho del baúl, estructura de su mejor pieza, una fecha del rubro) y qué hay que pedirle al cliente para hacerla.
- **Competencia**: «no hay nada que copiar este mes», con el motivo.
- **Pedidos al equipo**: numerados, antes de fin de mes.

## Caso 2: calendario para un hotel que no se sabe si publica
No había ninguna publicación leída en 60 días.
- **Semana corta de tres piezas**, no un mes: primero hay que saber si publica por su cuenta.
- Cada pieza en una línea: `día · red · formato · objetivo · gancho · copy corto · qué pieza hace falta`.
- Lo que no está en la ficha va como `[completar: …]`: horario del desayuno, costo del estacionamiento, canal de reservas.
- Una pieza condicionada: «si el hotel no confirma disponibilidad, no sale».
- Se cruzó con la pauta: había una campaña mandando gente a la web mientras el perfil llevaba un mes callado. Eso justificó la urgencia.
- Al final, tres cosas que tiene que confirmar una persona.

## Cada copy, cuatro preguntas
¿Qué gana quien lo lee? ¿Se puede imaginar o comprobar? ¿Lo podría firmar la competencia cambiando el logo? ¿Por qué ahora?

## Detalle práctico
`lmtmSaveDeliverable` con kind `plan` rechaza un segundo plan del mismo cliente en 7 días. La Propuesta CM entra pasando `cambio` con lo que aporta de nuevo. Un calendario se guarda con kind `other`.
