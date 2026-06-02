---
name: lmtm-typescript-patterns
displayName: TypeScript patterns
description: Patterns para TypeScript moderno: types, generics, narrowing, error handling, para LMTM-OS.
required: false
---

# TypeScript patterns

## El setup de LMTM-OS

- **TypeScript 5.x** (strict mode en `tsconfig.json`).
- **Module system**: ESM (`"type": "module"` en package.json).
- **Runtime**: Node 20+ (LMTM-OS usa `node --conditions=production`).
- **Build tool**: `tsc` directamente (Drizzle migration es vía SQL).
- **Linter**: ESLint + Prettier (config del fork de paperclip).
- **Path aliases**: `@lmtm/*` (ej. `@lmtm/shared`).

## Types fundamentals

### Primitivos

```typescript
let name: string = "Pablo";
let age: number = 35;
let active: boolean = true;
let nothing: null = null;
let undef: undefined = undefined;
```

### Objects e interfaces

```typescript
interface User {
  id: string;            // UUID
  email: string;
  name: string | null;   // nullable
  createdAt: Date;
  isActive: boolean;
}

const user: User = {
  id: "...",
  email: "pablo@example.com",
  name: "Pablo",
  createdAt: new Date(),
  isActive: true,
};
```

### Union types

```typescript
type Status = "active" | "paused" | "archived" | "draft";
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

### Type narrowing

```typescript
function processStatus(s: Status) {
  if (s === "active") {
    // s es "active" aquí
    return "running";
  }
  // s es "paused" | "archived" | "draft" aquí
  return "stopped";
}
```

### Discriminated unions

```typescript
type Event =
  | { type: "click"; target: string; timestamp: number }
  | { type: "purchase"; amount: number; orderId: string }
  | { type: "signup"; email: string };

function handle(e: Event) {
  switch (e.type) {
    case "click":
      // e es { type: "click", ... }
      return logClick(e.target);
    case "purchase":
      // e es { type: "purchase", ... }
      return processOrder(e.orderId, e.amount);
    case "signup":
      // e es { type: "signup", ... }
      return sendWelcome(e.email);
  }
}
```

## Generics

### Función genérica

```typescript
function firstOrNull<T>(items: T[]): T | null {
  return items[0] ?? null;
}

const x = firstOrNull([1, 2, 3]);  // x: number | null
const y = firstOrNull(["a", "b"]); // y: string | null
```

### Con constraints

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const u = { name: "Pablo", age: 35 };
const name = getProperty(u, "name"); // string
// const wrong = getProperty(u, "missing"); // ERROR: not in keyof T
```

### Tipos utility

```typescript
type User = { id: string; name: string; email: string; isAdmin: boolean };

type PartialUser = Partial<User>;        // todos opcionales
type RequiredUser = Required<PartialUser>; // todos requeridos
type UserKeys = keyof User;               // "id" | "name" | "email" | "isAdmin"
type UserName = Pick<User, "name" | "email">; // subset
type UserWithoutAdmin = Omit<User, "isAdmin">;
type ReadonlyUser = Readonly<User>;
type UserRecord = Record<string, User>;
```

### Conditional types

```typescript
type IsString<T> = T extends string ? true : false;

type A = IsString<string>; // true
type B = IsString<number>; // false

// Inferir el tipo de retorno de una función
type MyReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

function foo() { return 42; }
type FooReturn = MyReturnType<typeof foo>; // number
```

## Async patterns

### Async/await

```typescript
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}
```

### Promise.all / Promise.allSettled

```typescript
// Todas tienen que pasar
const [a, b, c] = await Promise.all([fetchA(), fetchB(), fetchC()]);

// Independientes, no falla si una falla
const results = await Promise.allSettled([fetchA(), fetchB(), fetchC()]);
// results[i] es { status: "fulfilled", value } | { status: "rejected", reason }
```

### Error handling

```typescript
// Custom error class
class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Wrapper para Result type
async function tryAsync<T>(
  promise: Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: Error }> {
  try {
    return { ok: true, value: await promise };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// Uso
const result = await tryAsync(fetchUser(id));
if (result.ok) {
  console.log(result.value.name);
} else {
  logger.error({ err: result.error }, "fetchUser failed");
}
```

## Validation con Zod

```typescript
import { z } from "zod";

const UserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150).optional(),
});

type UserInput = z.infer<typeof UserInputSchema>;

// Validar
const parseResult = UserInputSchema.safeParse(input);
if (!parseResult.success) {
  return { status: 400, body: { errors: parseResult.error.flatten() } };
}
// parseResult.data está validado y es tipo UserInput
```

## Type-safe env vars

```typescript
// env.ts
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.coerce.number().default(3100),
  DATABASE_URL: z.string().url(),
  MINIMAX_API_KEY: z.string().min(20),
  META_APP_ID: z.string(),
  META_APP_SECRET: z.string(),
});

export const env = EnvSchema.parse(process.env);
```

## Discriminated errors

```typescript
type ApiResponse<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthorized"; reason: string }
  | { kind: "forbidden"; resource: string }
  | { kind: "not_found"; id: string }
  | { kind: "validation_error"; errors: Record<string, string[]> }
  | { kind: "rate_limited"; retryAfter: number }
  | { kind: "server_error"; requestId: string };

function handleResponse<T>(r: ApiResponse<T>) {
  switch (r.kind) {
    case "ok":
      return r.data;
    case "validation_error":
      console.error("Validation failed", r.errors);
      throw new Error("validation");
    // ... etc
  }
}
```

## Test patterns

```typescript
import { describe, it, expect, beforeEach } from "vitest";

describe("UserService", () => {
  let service: UserService;
  let mockDb: MockDatabase;

  beforeEach(() => {
    mockDb = new MockDatabase();
    service = new UserService(mockDb);
  });

  it("creates a user with valid input", async () => {
    const result = await service.createUser({
      email: "test@example.com",
      name: "Test",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe("test@example.com");
    }
  });

  it("rejects invalid email", async () => {
    const result = await service.createUser({
      email: "not-an-email",
      name: "Test",
    });
    expect(result.ok).toBe(false);
  });
});
```

## Performance tips

- **Evita `any`**. Si no podés tipar, es un bug latente.
- **No** `as` sin comentario. Es un escape hatch, no una
  solución.
- **No** `!` (non-null assertion) sin comentario.
- **Usa `readonly`** para data que no debería mutar.
- **`const` por default**, `let` solo si necesitás reasignar.
- **No** declares functions en hot loops dentro de un for.
- **No** crees closures grandes innecesarios.
- **Type-only imports** (`import type { Foo }`) para evitar
  dependencias runtime.

## Anti-patterns

- **Type assertion abusivo**: `as any`, `as unknown as T`. Si lo
  usás, dejá un comment explicando por qué.
- **Optional chaining excesivo**: `a?.b?.c?.d` es un code smell.
  Validá primero.
- **Interfaces anchas**: si tiene > 10 props, probablemente
  necesita split.
- **No** uses `Function` como tipo. `() => void` es lo que querés.
- **No** ignores errores con `.catch(() => {})` sin comment.
