# B2. Hoy + avisos: plan

1. Skill `.claude/skills/lmtm-diseno/` (reglas, tokens con contrastes medidos, componentes) antes de la pantalla; `design-guide` queda solo para Operación.
2. Dos direcciones de Hoy con datos reales ("Parte del día" y "Tarjetas"), claro y oscuro a 390 px; se elige una y la otra queda en el PR.
3. `GET /api/hoy`: incidentes de nivel 5 arriba, plata parada por día, decisiones por plata, lo hecho que espera el dato y la cobertura de `saludFuentes()` (`sin_entrega` no es falla).
4. Pantalla Hoy en `ui/src/pages/Hoy.tsx`: un botón por decisión que dice lo que hace; lo que toca la pauta se ensaya antes de confirmar; descartar pide motivo. Es la pantalla de inicio.
5. Avisos (`server/src/avisos/`): solo el nivel 5 interrumpe (incidentes, alerta manual, prueba), con tope de 3 por día que degrada al resumen sin perder nada; todo lo demás va al resumen de las 9:00 con link a Hoy, que reemplaza al brief de 8 y 18.
6. Medición: `medirInterrupciones()` reproduce `wa_outbox` día por día con la política vieja y la nueva (`GET /api/avisos/medicion`, solo lectura).
7. Se borra lo que Hoy cubre: el brief de 8/18 (`informe-ejecutivo.ts` ya en B1), las tarjetas de cola humana y alertas del Dashboard (`AccionFila`), que pasa a llamarse Operación.
8. Verificación: tests de la política, la medición, el mensaje de incidentes y el resumen; capturas de la app real a 390 px (claro y oscuro) y escritorio; ensayo del resumen.
