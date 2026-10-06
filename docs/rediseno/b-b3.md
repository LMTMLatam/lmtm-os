# B3. Cartera + Cliente + informe: plan

1. Informes semanales (migración 0151, aditiva): el estratega escribe SIN números, con marcadores ({cpl}, {objetivo}…) que el servidor completa desde `metricasCliente()` de esa semana; el auditor determinístico frena números a mano, otro cliente, jerga y CTR suelto; una persona publica con un toque.
2. Borrador automático cada lunes, sin modelo: números de `metricas`, "hicimos" de las decisiones ejecutadas y "próximo" de las abiertas. Todo cliente con pauta tiene su informe aunque ningún agente escriba; el estratega (A5) lo reemplaza con el suyo.
3. Informe para el cliente en el link público actual (el slug no cambia): costo por lead (por calificado cuando haya CRM) contra el objetivo, embudo, campañas (Google dudoso marcado), lo hecho, lo que necesitamos del cliente y la narrativa publicada. Todo número sale de `metricas`.
4. El panel público viejo queda como "ver el detalle" sin los números inventados (visitas = clics × 0,6, frecuencia con alcance sumado, ROAS con Google) hasta B4.
5. Cliente (`/c/:slug`, pestaña "Resumen" por defecto): objetivo vs real, embudo, lo hecho y lo aprendido, decisiones pendientes con su botón e informe de la semana. Reemplaza "Plan de acción" (semáforo y narrativa sin control).
6. Cartera (`/cartera`, "Clientes" en la barra): los clientes activos ordenados por plata en riesgo, con objetivo vs real, frescura, próxima decisión e informe. Reemplaza TablaCartera y los semáforos de Growth y Operación.
7. Se retira el reporte semanal a ClickUp (narrativa de modelo sin control, con el día a medio sincronizar).
8. Verificación: tests de marcadores, auditor, borrador y orden; migración en Postgres local; capturas; números del informe contra `metricasCliente()` con el rol de solo lectura cuando llegue.
