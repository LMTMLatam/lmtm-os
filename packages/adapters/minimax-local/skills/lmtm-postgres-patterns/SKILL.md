---
name: lmtm-postgres-patterns
displayName: Postgres patterns
description: Schema design, indexes, RLS, performance, migrations, para el backend de LMTM-OS.
required: false
---

# Postgres patterns

## Schema design

### Naming conventions

- **Tables**: plural, snake_case → `users`, `ad_accounts`,
  `campaign_metrics_daily`.
- **Columns**: singular, snake_case → `user_id`, `created_at`,
  `first_seen_at`.
- **Primary key**: `id` (UUID v4 generado por `gen_random_uuid()`).
- **Foreign keys**: `<table_singular>_id` → `user_id`, `company_id`.
- **Timestamps**: `created_at`, `updated_at` en TODA tabla. Default
  `now()`. Update trigger para `updated_at`.
- **Booleans**: `is_`, `has_`, `should_` → `is_active`, `has_2fa`.

### Type patterns

- **ID**: `uuid` con default `gen_random_uuid()`. No int/bigint.
- **Money**: `numeric(15, 2)` con `currency text` separado. NUNCA
  float para money.
- **Enum**: `text` con CHECK constraint, o `create type ... as enum`
  si el set es estable.
- **JSON**: `jsonb` (no `json`). Indexable con GIN.
- **Array**: usar `text[]` solo para casos chicos. Para
  one-to-many, hacer tabla aparte.
- **Timestamp**: `timestamptz` (con timezone), nunca `timestamp`.
- **Soft delete**: `deleted_at timestamptz null` + index donde
  `deleted_at is null`.

### Migrations

- **Tool**: Drizzle (lo que usa LMTM-OS), Prisma, Knex, sqlx,
  Flyway, Liquibase, raw SQL.
- **Forward-only**: nunca editar migraciones aplicadas. Crear una
  nueva.
- **Reversible**: cada UP tiene un DOWN. Si no podés hacerlo
  reversible, dejá un comentario explicando por qué.
- **Naming**: `0094_add_client_tier.sql` (número secuencial +
  descripción snake_case).
- **Testing**: probar la migración en una copia de la base primero
  (dev/staging) antes de prod.

## Indexes

### Cuándo crear un index

- **Columna en WHERE frecuente** (> 10% de queries).
- **Columna en JOIN** (FK, especialmente).
- **Columna en ORDER BY** (si la query es lenta).

### Tipos

- **B-tree** (default): equality y range queries. `=`, `<`, `>`, `BETWEEN`, `ORDER BY`.
- **Hash**: solo equality. Marginal improvement sobre B-tree para
  equality puro.
- **GIN**: full-text search, jsonb, arrays. `@@`, `?`, `?|`, `?&`.
- **BRIN**: tablas enormes (> 100M rows) ordenadas por la columna
  indexada. Muy chico, no muy preciso.
- **Partial**: `WHERE` clause. Ej. `WHERE deleted_at IS NULL`.

### Compuestos

- **Orden importa**: (equality, range, sort).
  ```sql
  CREATE INDEX ON ad_performance (client_id, date, platform);
  -- filtra: client_id (=), date (range), ord. por: platform
  ```
- **Left-prefix rule**: si tenés `(a, b, c)`, también funciona para
  `(a)` y `(a, b)`, pero no para `(b)` o `(c)`.

### Cuándo NO crear

- **Tabla chica** (< 10k rows): full scan es más rápido.
- **Alta cardinalidad con baja selectividad** (ej. `is_active boolean`): no ayuda.
- **Muchas escrituras**: cada index es un costo en INSERT/UPDATE.

### Maintenance

```sql
-- Reconstruir un index que se fragmentó
REINDEX INDEX idx_name;
REINDEX TABLE table_name;

-- Estadísticas (para el query planner)
ANALYZE table_name;

-- Ver indexes no usados
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexname NOT LIKE '%_pkey';
```

## RLS (Row-Level Security)

LMTM-OS es multi-tenant. **Cada query debería filtrar por
`company_id` automáticamente**. RLS lo hace a nivel DB.

### Setup

```sql
-- Habilitar RLS en la tabla
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Policy: solo ver filas de tu company
CREATE POLICY tenant_isolation ON clients
  FOR ALL
  TO authenticated_user
  USING (company_id = current_setting('app.current_company_id')::uuid);

-- Set en cada request
SET LOCAL app.current_company_id = '...uuid...';
```

### Pattern con Drizzle

Drizzle soporta RLS pero es manual. Setup típico:
1. Crear la policy en la migration.
2. En el middleware de la app, hacer `SET LOCAL` en cada transacción.
3. Nunca confiar solo en el WHERE clause de la app — RLS es el
   safety net.

## Performance

### Query optimization workflow

1. **`EXPLAIN ANALYZE`** la query.
2. **Identificar el bottleneck**: Seq Scan en tabla grande, nested
   loop con muchas rows, sort en memoria, etc.
3. **Aplicar fix**: index, rewrite query, materialized view, etc.
4. **Re-EXPLAIN** para verificar.

### Patrones comunes

#### N+1 queries

```sql
-- MAL: una query por usuario
SELECT * FROM users WHERE company_id = $1;  -- 100 users
-- después 100 queries: SELECT * FROM orders WHERE user_id = $X

-- BIEN: un solo JOIN
SELECT u.*, json_agg(o.*) AS orders
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.company_id = $1
GROUP BY u.id;
```

#### Pagination con offset (lento en tablas grandes)

```sql
-- LENTO en page 1000
SELECT * FROM events ORDER BY created_at DESC LIMIT 20 OFFSET 20000;

-- RÁPIDO: keyset pagination
SELECT * FROM events
WHERE created_at < $1  -- last seen timestamp
ORDER BY created_at DESC LIMIT 20;
```

#### Aggregation en ventana de tiempo

```sql
-- MAL: full scan si la tabla es grande
SELECT COUNT(*) FROM events WHERE created_at > NOW() - INTERVAL '7 days';

-- BIEN: tener un index en created_at, o usar una tabla pre-aggregada
```

### Vacuum y autovacuum

- **Autovacuum** corre automáticamente en Postgres. Saca tuplas
  muertas y actualiza stats.
- **Si tenés muchas UPDATEs/DELETEs**: ajustar
  `autovacuum_vacuum_scale_factor` por tabla.
- **Después de bulk DELETE**: `VACUUM ANALYZE table_name;` manual.

## Common gotchas

### `now()`

- `now()` y `CURRENT_TIMESTAMP` devuelven el **inicio de la
  transacción**, no el momento actual.
- Si querés wall-clock time, usar `clock_timestamp()`.
- Para audit fields, `now()` está bien (querés el tiempo de la
  transacción).

### NULL handling

- `NULL = NULL` es `NULL` (no true). Usar `IS NULL` o `IS NOT NULL`.
- `COALESCE(field, default_value)` para default.
- `NULLIF(a, b)` si querés tratar `a = b` como `NULL`.

### Time zones

- `timestamptz` siempre se guarda en UTC internamente.
- `timestamp` (sin tz) es el problema — guardás el string sin
  contexto.
- **Siempre** `timestamptz`. **Siempre**.

### UUID generation

- `gen_random_uuid()` (Postgres 13+): built-in, no requiere
  extensión.
- `uuid_generate_v4()`: requiere `uuid-ossp` extension.
- Generar en la app (`crypto.randomUUID()`) o en la DB — ambos
  válidos, pero consistente.
- **LMTM-OS**: generado en la app, no en la DB.

### JSONB queries

```sql
-- Acceder a un campo
SELECT data->>'name' FROM users;
-- o
SELECT data->'name'->>'first' FROM users;

-- Index GIN
CREATE INDEX idx_users_data ON users USING GIN (data jsonb_path_ops);

-- Query
SELECT * FROM users WHERE data @> '{"plan": "pro"}';
```

## Backups

- **LMTM-OS**: Supabase hace backups automáticos (point-in-time
  recovery en plan Pro).
- **Antes de migraciones grandes**: snapshot manual.
- **Testear** el restore periódicamente. Backup sin test = no
  backup.
