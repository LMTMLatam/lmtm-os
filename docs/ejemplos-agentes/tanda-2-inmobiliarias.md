# Corrida de referencia: inmobiliarias (05/11/2026)

Trabajo completo sobre los 13 clientes activos del rubro, hecho a mano con datos reales. Nada salió a clientes y no se tocó ninguna cuenta de pauta, web, planilla ni script.

**Qué es material para los agentes:** la skill `lmtm-ejemplos-nicho`, sin nombres. Este archivo es el registro completo.

## Qué se revisó por cliente

| Área | Cómo |
|---|---|
| Scripts de Redes y de video | Código, ejecuciones, planilla real y efecto en ClickUp |
| Publicación | Cadena de publicación, planilla y posteos reales |
| Pauta | Por campaña, 30 días, propuestas pendientes |
| Redes | Interacción por pieza y formato, 60 días |
| Web | GA4, Search Console, fuentes, eventos clave y PageSpeed |
| Trabajo de los agentes | Tareas, entregables, corridas, alertas y memoria |
| Plan de acción | Uno por cliente, guardado en su ficha |

## Comparación del rubro

Pauta: 06/10 al 04/11. Redes: 60 días en Instagram.

| Cliente | Gasto Meta | Leads | CPL Meta | Mediana redes | Sesiones web | Contactos medidos en la web | Por delante en el calendario |
|---|---:|---:|---:|---:|---:|---|---|
| IMPERIA | $93.366 | 38 | $2.457 | 41 | sin dato | sin etiqueta | 2 sin resolver |
| COSA | $444.255 | 93 | $4.777 | 31 | 8.970 | 0 eventos clave | 9 sin aprobar |
| SKYGARDEN | $229.869 | 43 | $5.346 | 7 | 626 | 0 eventos clave | 3, solo 1 aprobada |
| MA | $1.313.921 | 244 | $5.385 | 28 | 6.581 | 56 `generate_lead`; el resto no sirve | planilla vacía, publica por otra vía |
| SRP | $1.305.118 | 219 | $5.959 | 9 | 19.537 | 68 `generate_lead`; el resto no sirve | 3 aprobadas |
| DUNOD | $1.107.839 | 100 | $11.078 | sin dato | 15.293 | 423 eventos clave | nada |
| GALA | USD 286 | 14 | USD 20,4 | 5 | 1.785 | 0 eventos clave | 7 aprobadas |
| BRISANOVA | sin gasto desde el 03/10 | | | 6 | sin web cargada | | 5 aprobadas |
| PRONE | sin gasto | | | 14,5 | 2.233 | 102 `click` | 1, hoy |
| CANNES, Cliente Inmobiliario, Distrito Roldan, GRUPO MA | sin pauta | | | sin datos | sin datos | | nada |

### Conclusiones

1. **Nadie mide ventas.** Con esos datos, ningún CPL dice qué campaña vende. Solo DUNOD tiene eventos clave que parecen contactos en todo el conjunto.
2. **El gasto no sigue al resultado.** Los tres que más gastan tienen CPL de $5.385 a $11.078. El mejor costo tiene la menor inversión, y bajó su rendimiento al concentrarse en una campaña.
3. **Publicar más no da más.** SRP: 46 publicaciones, mediana 9. IMPERIA: 19, mediana 41. Todo es interacción: no tenemos alcance.
4. **El reel supera al carrusel** en las 7 cuentas que tienen los dos, de 1,2 a 8 veces.
5. **Las campañas mix costaron 4 veces más** ($18.676 contra $4.576), pero solo en MA. No es una regla del rubro todavía.
6. **El objetivo de la campaña casi no cambió el CPL de WhatsApp:** leads $4.843, interacción $4.491. Se esperaba otra cosa.
7. **Lo que más traba son decisiones de personas:** 31 tareas `[HUMANO]` abiertas y 13 propuestas de pauta pendientes. Solo 2 de 9 calendarios activos están sanos.
8. **El esfuerzo de los agentes va a donde hay reintentos, no a donde hay plata:** de 762 corridas en 30 días, DUNOD tuvo 560, la mayoría fallidas por el proveedor. MA, con el mismo gasto, tuvo 2.
9. **Hay clientes que compiten entre sí.** Varios se cargaron como competidores unos de otros, en la misma plaza. Falta decidir si eso importa.
10. **Competencia sin medir:** 302 competidores cargados y 2 con Instagram medido.

## Scripts

Se leyeron 23: los 13 de Redes y 10 de video. En Distrito Roldan y GRUPO MA no hay script de video con ese nombre. IMPERIA tiene la lista de video activa, pero tampoco encontré su script con ese nombre.

| Hallazgo | Clientes |
|---|---|
| Corrieron hoy, sin fallas | 21 de 23 |
| Sin ejecuciones recientes | Redes de Distrito Roldan y GRUPO MA |
| **Token de ClickUp escrito en el código** | Los 23 |
| La planilla registrada en LMTM-OS no es la del script | BRISANOVA, DUNOD, Distrito Roldan, GRUPO MA, MA, SRP, SKYGARDEN |
| Planilla de Redes sin filas con fecha | CANNES, MA, Distrito Roldan |
| Planilla sin hora en las piezas futuras | GALA (7) |
| Aprobación distinta entre planilla y ClickUp | IMPERIA (2 piezas) |

**Error mío del 04/11:** en `script-health.ts` puse que la API devuelve vacío para todos los scripts y dejé de avisar en esos casos. Hoy devolvió ejecuciones para 21 de 23. Así, un script que dejó de correr no genera aviso. Falta corregirlo y medir cuántos avisos daría en toda la agencia antes de prenderlo.

## Datos que estaban mal

- **Radar del 19/10:** MA con CPL de $234 en Meta (eran unos $5.000) y PRONE con CPL de $2.137 (no tiene pauta).
- **Plan de GALA:** comparaba dólares con pesos. Ahora `get_client_ads_performance` devuelve `moneda`.
- **Plan de DUNOD:** decía que Meta era la única pauta. GA4 muestra Google pago.
- **Aviso de SKYGARDEN:** suponía que faltaba la columna Horario. Existe.
- **Análisis SEO de MA:** dijo error 500 y `noindex`. Desde un navegador responde bien.

## Qué aprenden los agentes

| Vía | Qué |
|---|---|
| Skill `lmtm-ejemplos-nicho` | Qué verificar, cómo comparar, tres formatos |
| Radar del nicho | Reemplaza al del 19/10, con los datos corregidos |
| 5 lecciones de equipo | Medición, verificación, publicación, ClickUp, decisiones |
| Memoria de 6 clientes | Hechos comprobados el 05/11 |
| Planes de los 13 clientes | Son el plan anterior que lee Luna la próxima vez |
| Rutinas de Luna, Carlos y Milo | Mandan a cargar la skill |

## Límites

- Sin alcance orgánico ni ventas.
- El Instagram de DUNOD no se pudo leer: la red frenó la consulta.
- No se verificaron lead por lead los problemas del CRM de DUNOD: salen de LMTM-6486.
- Las conversiones de Google de MA se atribuyen a `first_visit` por los datos de GA4. Falta confirmarlo en Google Ads.
- No se escuchó ni se vio ningún video o guion en esta corrida: las listas de video se revisaron solo por estado.

## Planes de cada cliente

