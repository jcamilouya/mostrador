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
  auth/callback/           — canjea code o token_hash de Supabase por sesión
  auth/confirmado/         — pantalla "correo confirmado" (entra solo a la app)
  onboarding/              — crea empresa tras primer login
  dashboard/               — requiere auth + empresa; layout con Sidebar/BottomNav
    pos/                   — POS, registra ventas (selector de combos por producto)
    inventario/            — CRUD productos (+ opciones/combos por producto)
    egresos/               — CRUD gastos (+ /nuevo, /[id])
    ingresos/              — historial de ventas
    analitica/             — KPIs, top productos, horas pico, métodos de pago
    reportes/              — PDF + Excel vía /api/reportes
    clientes/              — CRUD clientes (+ /nuevo, /[id])
    configuracion/         — datos negocio + config Bre-B (incl. subir QR oficial)
    plan/                  — trial/básico/pro (paga con Wompi; ver Pagos del plan)
  admin/                   — super admin: métricas + control de suscripciones (ver Panel admin)
  api/
    reportes/              — genera PDF/Excel con jspdf + exceljs
    ia/leer-factura/       — Anthropic vision extrae datos de una foto de factura
    checkout/wompi/init/   — inicia el pago del plan (crea `pagos` + firma de integridad)
    webhook/wompi/         — ÚNICO que activa el plan tras pago aprobado
    webhook/whatsapp-invoice/ — recibe egresos del bot WhatsApp externo
    webhook/whatsapp/      — webhook del canal WhatsApp
    webhook/bancolombia/   — confirma ventas Bre-B pagadas (conciliación, producción)
  dev/preview-login/       — login programático solo en development
```

### Flujo de autenticación y multi-tenant

`middleware.ts` protege todas las rutas `/dashboard/*` y `/onboarding/*`. Si el usuario tiene sesión pero no tiene `empresa_id` en la tabla `usuarios`, redirige a `/onboarding`. El `DashboardLayout` hace una segunda verificación server-side para asegurar que la empresa existe.

**Confirmación de correo:** `signUp` manda `emailRedirectTo` a `/auth/callback?next=/onboarding&confirmar=1`. El callback maneja tanto `code` (PKCE/OAuth) como `token_hash`+`type` (link de correo, funciona en otro dispositivo) y, si es confirmación, redirige a `/auth/confirmado` (mensaje amigable + auto-entra). Requiere Site URL + Redirect URLs correctos en el panel de Supabase.

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

Tablas principales: `empresas` → `usuarios`, `categorias`, `productos`, `ventas`, `venta_items`, `egresos`, `movimientos_inventario`. También `clientes`, `pagos` + `wompi_eventos` (Wompi), `egresos_pendientes_whatsapp` (bot), `admin_log` (auditoría del super admin). El `empresa_id` es la clave de aislamiento en todas las tablas. Ver `supabase/schema.sql` y `supabase/migrations/` para el schema completo.

Migraciones a correr en Supabase (además de `schema.sql` + `realtime.sql`): `001_clientes`, `002_admin`, `003_breb_qr`, `004_pagos` (Wompi), `005_variantes` (columna `productos.variantes` JSONB para los combos).

### POS, productos y combos

Un producto puede tener **opciones/combos** en `productos.variantes` (JSONB: `[{ nombre, precio }]`; cada opción tiene su precio **completo**, no un delta). `ProductForm` los edita (input hidden serializado a JSON, validado por `variantesSchema` en `lib/inventario/schemas.ts`). En el POS (`ProductGrid`), tocar un producto con variantes abre un selector (opción "Sencillo" con `precio_venta` base + cada variante); sin variantes se agrega directo. El carrito (`stores/cart-store.ts`) llavea cada línea por `lineId` (`producto_id` o `producto_id::variante`) para que dos opciones del mismo producto sean líneas distintas; `venta_items` guarda el nombre y precio ya resueltos (sin cambios de schema). El stock es a nivel de producto (las variantes lo comparten).

### Realtime

`RealtimeRefresher` (Client Component en el DashboardLayout) escucha cambios en `ventas` y `egresos` vía Supabase Realtime y llama `router.refresh()` para actualizar los Server Components. **Requiere correr el SQL de `supabase/realtime.sql`** en el panel de Supabase para agregar esas tablas a la publicación `supabase_realtime`.

### Plan y gating

`lib/plan/queries.ts` exporta `getPlanInfo(empresaId)`. Devuelve `{ plan, esPro, bloqueado, diasRestantes, trialActivo }`. **Todos los planes respetan `plan_expira_en`** (modelo de pago que renueva 30 días): trial activo cuenta como Pro; `basico`/`pro` desbloquean el core pero al vencer → `bloqueado = true` (soft block: el POS rechaza ventas nuevas). Un plan de pago **sin fecha** se considera vigente (cortesía/asignación manual). `basico` nunca es `esPro`; solo `pro` y trial activo lo son. La Analítica, Reportes y Bre-B están gatekeadas detrás de `esPro`. El POS muestra Básico normal; solo las funciones Pro piden mejorar. Precios en `PRECIOS` (COP/mes). El plan Básico también es pagable (`UpgradeButton plan="basico"`).

### Pagos del plan (Wompi)

Pasarela de pagos colombiana. Wompi **no tiene débito automático** → modelo de **pago único que renueva 30 días** el plan. Flujo:

1. `UpgradeButton` (`components/plan/`) llama `POST /api/checkout/wompi/init` → crea fila `pagos` (estado `pending`) + **firma de integridad** y abre el Widget de Wompi (`checkout.wompi.co/widget.js`).
2. El cliente paga (tarjeta/PSE/Nequi). El navegador **NO** activa el plan; solo redirige a `/checkout/wompi/return` (informativo).
3. `POST /api/webhook/wompi` **es el único que activa el plan**: verifica el checksum (`lib/payments/wompi.ts`, `crypto.timingSafeEqual`), ventana de tiempo e idempotencia (`wompi_eventos`), y al `APPROVED` pone `empresas.plan` + extiende `plan_expira_en` +30 días (apila renovaciones).

**Dormido sin llaves:** si faltan `WOMPI_*`, `init` responde `{ disponible: false }` sin tocar la BD — seguro de desplegar. Sandbox vs producción se decide por el prefijo de `WOMPI_PUBLIC_KEY` (`pub_test_` vs `pub_prod_`). Patrones de seguridad basados en el plugin externo *PagoKit*.

### Panel de super admin (`/admin`)

Back-office del SaaS, fuera de `/dashboard`, protegido por `requireSuperAdmin` (`lib/admin/auth.ts`). Usa `createAdminClient()` (bypasea RLS) y el RPC `admin_empresas_resumen` para agregar métricas de todas las empresas. `lib/admin/queries.ts` deriva por empresa el `EstadoSuscripcion` (`trial_activo`/`trial_vencido`/`basico`/`basico_vencido`/`pro`/`pro_vencido`) y los días restantes según `plan_expira_en` — **debe coincidir con la lógica de `lib/plan/queries.ts`** (si cambia una, cambiar la otra). El MRR cuenta solo planes vigentes. La ficha de cada empresa muestra uso, historial de pagos Wompi (`getPagosEmpresa`) y permite cambiar plan / activar Pro / extender días (`lib/admin/actions.ts`), todo auditado en `admin_log`.

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
# Pagos Wompi (suscripción del plan; dormido sin estas llaves)
WOMPI_PUBLIC_KEY                 — pub_test_… / pub_prod_… (decide sandbox/prod)
WOMPI_PRIVATE_KEY
WOMPI_INTEGRITY_SECRET           — firma de integridad del checkout
WOMPI_EVENTS_SECRET              — verificación del checksum del webhook
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
- **Wompi a producción**: integrada y corriendo con llaves de **prueba** (`pub_test_`) + webhook configurado. Falta la aprobación de producción de Wompi y cambiar a llaves `pub_prod_` (recordar **Redeploy** en Vercel al cambiar env).
- **Bre-B API Bancolombia**: los productos *QR Code Information* + *QR Payments Information* ya fueron **aprobados** en el portal. Para activarla faltan: (a) credenciales de producción (`BANCOLOMBIA_*`); (b) cambiar `bancolombia.ts` para leer el cert mTLS desde **variable de entorno** en vez de archivo (los `.secrets/` no se despliegan en Vercel); (c) confirmar con Bancolombia si Mostrador puede generar el QR de las llaves **de sus comercios** (rol agregador/partner) o solo de la propia; (d) servidor autorizado en el WAF. El cobro por **QR universal subido** ya funciona para cualquier banco.
