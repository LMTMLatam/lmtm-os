# B4. Diseño + retiro de páginas: plan

1. Las ~8 pantallas del día a día: Hoy, Clientes (Cartera), Cliente, el informe del cliente, Operación, Bandeja, Contenido y Config. Son las que quedan arriba en la barra (más Cliente e informe, a los que se llega desde ahí).
2. Se borra lo que no se puede abrir o nadie usa: Competitors, Org, MyIssues, los cuatro laboratorios de UX y el selector de empresas suelto (ninguno tiene ruta o import vivo).
3. Las páginas de desarrollo quedan solo en desarrollo: la guía de diseño y `/tests/perf/long-thread`, que hoy se abre en producción sin login.
4. Pauta (`/paid-media`) se retira: la cubren Cartera (qué cliente mirar) y Cliente → Dashboard (el detalle de pauta, con selector de cliente). `/paid-media` redirige a `/cartera`. El semáforo de pauta de Growth (`/growth/semaforo-pauta`) se va con ella: Cartera mide contra el objetivo de cada cliente.
5. Operación vuelve arriba (es la pantalla de Nazareno, PLAN §5) en el lugar de Pauta. Siguen siendo 6.
6. Lo que ninguna pantalla nueva cubre todavía queda en "Más", con el porqué escrito en el PR: Fichas (salud y alertas), Growth (cotizado vs realizado, carga del equipo), Inteligencia, Readiness, Nichos, Licitaciones, Finanzas, WhatsApp. Las de Paperclip (agentes, issues, rutinas) quedan en "Sistema": se apagan por rol en A5.
7. Verificación: tests de la barra (sin páginas huérfanas, 6 arriba), typecheck y build, y capturas de la barra y de cada redirección.
