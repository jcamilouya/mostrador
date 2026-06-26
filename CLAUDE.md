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
    clientes/              — CRUD clientes (+ /nuevo, /[id])
    configuracion/         — datos negocio + config Bre-B (incl. subir QR oficial)
    plan/                  — trial/básico/pro
  admin/                   — panel interno (empresas/[id]); fuera de /dashboard
  api/
    reportes/              — genera PDF/Excel con jspdf + exceljs
    ia/leer-factura/       — Anthropic vision extrae datos de una foto de factura
    webhook/whatsapp-invoice/ — recibe egresos del bot WhatsApp externo
    webhook/whatsapp/      — webhook del canal WhatsApp
    webhook/bancolombia/   — confirma ventas Bre-B pagadas (conciliación, producción)
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

### Bre-B (cobros QR) — CRÍTICO

**Un QR Bre-B pagable NO se puede generar localmente.** Decodificando un QR real (ver `docs/breb/`) se confirmó que el QR incrusta identificadores **opacos asignados por el banco/ACH** (GUIDs/UUIDs en el tag 26 + plantillas 91-94), no derivables de la llave. `lib/breb/emv.ts` (`construirPayloadBreb`) arma un EMVCo escaneable pero **NO garantizado pagable** — usar solo como preview/fallback. `validarPayloadEmv` valida cabecera EMVCo + CRC16.

Dos formas reales de obtener un QR válido:

1. **QR universal (activo, cualquier banco).** El negocio sube en Configuración la imagen de su QR Bre-B oficial; `ConfigForm` lo decodifica en el navegador con `jsqr`, lo valida y guarda el payload en `empresas.breb_qr_payload`. El POS lo re-dibuja escaneable vía `BrebQR` (`overridePayload`); si no hay QR, muestra la llave como texto.
2. **API Bancolombia (producción, solo comercios Bancolombia).** `lib/breb/bancolombia.ts` → `obtenerQROficial({ tipoLlave, valorLlave })` consume el producto *QR Code Information* (`POST .../qr-code-image`, headers `client-id`/`client-secret`/`message-id`, mTLS opcional con cert de `.secrets/`) y devuelve la imagen del QR oficial. **Inactivo**: el sandbox da QR no pagable y el WAF (Incapsula) bloquea; se activa con credenciales de producción (gate `BANCOLOMBIA_QR_BASE_URL` sin `sandbox`). `qr-action.ts` orquesta API → fallback EMV.

Conciliación de pagos: `/api/webhook/bancolombia` marca completadas las ventas `pendiente` por `breb_transaccion_id` y descuenta stock (producción); confirmación manual vía `confirmarVentaBreb` en `lib/breb/actions.ts`. Specs oficiales descargadas en `docs/breb/`. Bre-B está detrás de `esPro`.

### IA de facturas

`/api/ia/leer-factura` recibe una imagen y usa el SDK de Anthropic (`@anthropic-ai/sdk`, modelo `claude-haiku-4-5`) para extraer `{ proveedor, monto, fecha, categoria, descripcion }` en JSON. Lo usa el formulario de egresos para auto-rellenar un gasto desde una foto. Requiere `ANTHROPIC_API_KEY`.

### Bot WhatsApp (egresos por foto)

Dos vías para registrar gastos desde WhatsApp:

- **In-app (implementado):** `/api/webhook/whatsapp` es el webhook de **Meta WhatsApp Cloud API** (lógica en `lib/whatsapp/`). Foto → `descargarImagenMeta` → `procesarFactura` (Claude vision, ver *IA de facturas*) → guarda en `egresos_pendientes_whatsapp`; el dueño responde **SI/NO** para confirmar (`confirmarEgresoPendiente`) o cancelar. Empareja el negocio por `empresas.whatsapp_numero`. Falta solo dar de alta el número en Meta + env (`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_TOKEN`).
- **Webhook externo (legacy):** `POST /api/webhook/whatsapp-invoice` recibe egresos ya estructurados (`{ numero_emisor, proveedor, monto, fecha, categoria }`) con header `x-webhook-secret`; inserta en `egresos` con `fuente: 'whatsapp_ia'` y deduplica (mismo proveedor+monto en 7 días).

### Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        — solo server-side
ANTHROPIC_API_KEY                — IA de facturas (/api/ia/leer-factura + bot)
WHATSAPP_VERIFY_TOKEN            — verificación del webhook de Meta
WHATSAPP_PHONE_NUMBER_ID         — número de WhatsApp Cloud API
WHATSAPP_API_TOKEN               — token de Meta (enviar/leer mensajes)
WHATSAPP_WEBHOOK_SECRET          — solo para el webhook externo legacy
NEXT_PUBLIC_APP_URL
# Bre-B / Bancolombia (solo producción; inactivo en sandbox)
BANCOLOMBIA_CLIENT_ID
BANCOLOMBIA_CLIENT_SECRET
BANCOLOMBIA_QR_BASE_URL          — debe NO contener 'sandbox' para activar la API
BANCOLOMBIA_CERT_PATH            — cert mTLS (en .secrets/, gitignored)
BANCOLOMBIA_KEY_PATH             — llave privada mTLS (en .secrets/, gitignored)
BANCOLOMBIA_WEBHOOK_SECRET       — firma del webhook de conciliación
```

`.secrets/` (gitignored) guarda el cert/llave generados para registrar la app en el portal de Bancolombia Developers.

### Pendiente de construir

- **WhatsApp en producción**: el bot está implementado (`/api/webhook/whatsapp` + `lib/whatsapp/`); falta dar de alta el número en **Meta WhatsApp Business** y poner los tokens. Es configuración/aprobación, no código.
- **Wompi/Stripe**: botón "Mejorar a Pro" es stub (`UpgradeButton.tsx` muestra toast "próximamente").
- **Bre-B API Bancolombia**: integrada pero inactiva; requiere acceso de **producción** + servidor autorizado en el WAF + comercio con cuenta Bancolombia. Ver sección Bre-B.
