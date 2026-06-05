# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANTE — Next.js 16

**Leer `node_modules/next/dist/docs/` antes de cualquier feature nueva.** Las APIs cambiaron respecto al training data: `cookies()` es async, `params`/`searchParams` son Promises en page props, `useFormState` es ahora `useActionState`, etc. Heed deprecation warnings.

## Comandos

```bash
# Desarrollo (desde mostrador/)
npm run dev          # puerto 3000

# Build de producción
npm run build && npm start

# Login de prueba en dev (no pedir password al usuario)
# GET http://localhost:3000/dev/preview-login?email=EMAIL&password=PASS&next=/dashboard
```

No hay suite de tests ni linter configurados.

## Arquitectura

SaaS de gestión financiera para PyMEs colombianas. Multi-tenant: una `empresa` por usuario. Stack: Next.js 16 App Router + React 19 + Tailwind 4 + shadcn/ui + Supabase (auth + DB + Realtime) + Zod 4 + Zustand.

### Estructura de rutas

```
src/app/
  (auth)/login|register    — formularios públicos
  auth/callback/           — intercambia code de Supabase por sesión
  onboarding/              — crea empresa tras primer login
  dashboard/               — requiere auth + empresa; layout con Sidebar/BottomNav
    pos/                   — POS, registra ventas
    inventario/            — CRUD productos
    egresos/               — CRUD gastos (+ /nuevo, /[id])
    ingresos/              — historial de ventas
    analitica/             — KPIs, top productos, horas pico, métodos de pago
    reportes/              — PDF + Excel vía /api/reportes
    configuracion/         — datos negocio + config Bre-B
    plan/                  — trial/básico/pro
  api/
    reportes/              — genera PDF/Excel con jspdf + exceljs
    webhook/whatsapp-invoice/ — recibe egresos desde el bot WhatsApp
  dev/preview-login/       — login programático solo en development
```

### Flujo de autenticación y multi-tenant

`middleware.ts` protege todas las rutas `/dashboard/*` y `/onboarding/*`. Si el usuario tiene sesión pero no tiene `empresa_id` en la tabla `usuarios`, redirige a `/onboarding`. El `DashboardLayout` hace una segunda verificación server-side para asegurar que la empresa existe.

### Patrón Supabase (CRÍTICO)

Hay tres clientes distintos — usar el correcto según el contexto:

| Cliente | Archivo | Cuándo usar |
|---|---|---|
| `createClient()` | `lib/supabase/server.ts` | Server Components, Server Actions (respeta RLS) |
| `createClient()` | `lib/supabase/client.ts` | Client Components (browser, respeta RLS) |
| `createAdminClient()` | `lib/supabase/admin.ts` | Mutations en Server Actions / API routes (bypasea RLS) |

**Regla de oro**: Los INSERTs/UPDATEs/DELETEs **siempre fallan** con el cliente anon porque RLS bloquea writes de `authenticated`. Usar `createAdminClient()` **solo después de validar la identidad** con `createClient().auth.getUser()`. Nunca exponer el admin client al browser.

### Server Actions

Todas las mutaciones van en `src/lib/[dominio]/actions.ts`. Patrón estándar:

```ts
'use server';
export async function miAccion(prev: State, formData: FormData): Promise<State> {
  // 1. Validar sesión con createClient()
  // 2. Validar input con Zod
  // 3. Mutar con createAdminClient()
  // 4. revalidatePath() + redirect() o return state
}
```

### Schema de BD

Tablas principales: `empresas` → `usuarios`, `categorias`, `productos`, `ventas`, `venta_items`, `egresos`, `movimientos_inventario`. El `empresa_id` es la clave de aislamiento en todas las tablas. Ver `supabase/schema.sql` para el schema completo.

### Realtime

`RealtimeRefresher` (Client Component en el DashboardLayout) escucha cambios en `ventas` y `egresos` vía Supabase Realtime y llama `router.refresh()` para actualizar los Server Components. **Requiere correr el SQL de `supabase/realtime.sql`** en el panel de Supabase para agregar esas tablas a la publicación `supabase_realtime`.

### Plan y gating

`lib/plan/queries.ts` exporta `getPlanInfo(empresaId)`. Devuelve `{ esPro, bloqueado, diasRestantes }`. Trial activo cuenta como Pro. Vencido → `bloqueado = true` → el POS rechaza ventas nuevas (soft block). La Analítica, Reportes y Bre-B están gatekeadas detrás de `esPro`.

### Bre-B (cobros QR)

`lib/breb/emv.ts` construye el payload EMVCo estándar con CRC16. El GUI (`CO.COM.BRE-B`) es un placeholder — el banco/ACH lo asigna al registrar la llave. Validar con un cobro de prueba real antes de producción.

### Webhook WhatsApp → Egresos

`POST /api/webhook/whatsapp-invoice` recibe `{ numero_emisor, proveedor, monto, fecha, categoria }` con header `x-webhook-secret`. Busca la empresa por `whatsapp_numero`, detecta duplicados (mismo proveedor+monto en 7 días) e inserta en `egresos` con `fuente: 'whatsapp_ia'`. El bot externo (a construir) usa Anthropic Claude vision para extraer los datos de la foto y llama este endpoint.

### Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      — solo server-side
GEMINI_API_KEY                 — pendiente reemplazar por ANTHROPIC_API_KEY
WHATSAPP_WEBHOOK_SECRET        — debe coincidir con el bot
NEXT_PUBLIC_APP_URL
```

### Pendiente de construir

- **Bot WhatsApp con Anthropic** (feature principal): recibe foto → Claude vision extrae datos → llama `/api/webhook/whatsapp-invoice`. Se construye fuera de `mostrador/` como servicio separado.
- **Wompi/Stripe**: botón "Mejorar a Pro" es stub (`UpgradeButton.tsx` muestra toast "próximamente").
- **Bre-B automático** (Fase 4b): diferido hasta convenio con banco.
