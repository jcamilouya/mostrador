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

`src/proxy.ts` protege todas las rutas `/dashboard/*` y `/onboarding/*`, y devuelve al dashboard a quien ya tiene sesión y abre `/login`. El `DashboardLayout` hace una segunda verificación server-side y manda a `/onboarding` a quien no tiene empresa.

**DOS trampas del archivo, ambas ya pagadas:** (a) en Next 16 la convención se llama `proxy.ts` con función `proxy` — `middleware`/`middleware.ts` está deprecado; (b) el archivo va **dentro de `src/`**, al lado de `app/`. Estuvo en la raíz del proyecto (hermano de `src/`) y Next lo compilaba pero **nunca lo ejecutaba**: ni un redirect incondicional se disparaba. No se notó porque cada layout revalida la sesión por su cuenta; esto es el segundo cinturón, no el único. Si tocas el archivo, compruébalo con los cuatro casos: sin sesión → `/login` 200 y `/dashboard` 307; con sesión → `/login` 307 y `/dashboard` 200.

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

Tablas principales: `empresas` → `usuarios`, `categorias`, `productos`, `ventas`, `venta_items`, `egresos`, `movimientos_inventario`. También `clientes`, `insumos` + `producto_receta` + `movimientos_insumos` (recetas), `pagos` + `wompi_eventos` (Wompi), `egresos_pendientes_whatsapp` (bot), `admin_log` (auditoría del super admin). El `empresa_id` es la clave de aislamiento en todas las tablas. Ver `supabase/schema.sql` y `supabase/migrations/` para el schema completo.

Migraciones a correr en Supabase (además de `schema.sql` + `realtime.sql`): `001_clientes`, `002_admin`, `003_breb_qr`, `004_pagos` (Wompi), `005_variantes` (columna `productos.variantes` JSONB para los combos), `006_insumos` (ingredientes + recetas), …, `012_producto_insumo_link`, `013_pago_tarjeta`, `014_mesas_cuentas_abiertas`, `015_empresa_categoria`, `016_modo_practica`, `017_carta_publica`. El código degrada si falta una (reintenta sin la columna nueva o devuelve un mensaje que nombra la migración), así que se puede desplegar antes de correrlas.

**Cómo se detecta "falta la columna" (CRÍTICO — se rompió una vez):** hay que preguntar por **dos** códigos, con `faltaColumna()` de `lib/supabase/errores.ts`. PostgREST responde distinto según la operación: un **SELECT** devuelve `42703` (el error crudo de Postgres), pero un **INSERT/UPDATE** devuelve `PGRST204`, porque valida el cuerpo contra su propio caché de schema antes de mandárselo a Postgres. Mirar solo `42703` dejó el registro de negocios nuevos **totalmente roto** mientras faltaba la migración 016: el reintento nunca corría y el dueño veía "No pudimos crear tu negocio" para siempre. Además, el reintento debe soltar **solo la columna que falta** (`nombreColumnaFaltante()`), no todas las opcionales: al soltarlas en bloque, un restaurante nuevo se creaba sin su `categoria` y perdía el menú de Mesas.

### POS, productos y combos

Un producto puede tener **opciones/combos** en `productos.variantes` (JSONB: `[{ nombre, precio }]`; cada opción tiene su precio **completo**, no un delta). `ProductForm` los edita (input hidden serializado a JSON, validado por `variantesSchema` en `lib/inventario/schemas.ts`). En el POS (`ProductGrid`), tocar un producto con variantes abre un selector (opción "Sencillo" con `precio_venta` base + cada variante); sin variantes se agrega directo. El carrito (`stores/cart-store.ts`) llavea cada línea por `lineId` (`producto_id` o `producto_id::variante`) para que dos opciones del mismo producto sean líneas distintas; `venta_items` guarda el nombre y precio ya resueltos (sin cambios de schema). El stock es a nivel de producto (las variantes lo comparten).

### Insumos y recetas (inventario de ingredientes)

Dos niveles de inventario: **productos** (lo que se vende) e **insumos** (`/dashboard/insumos`, UI: **Inventario**). Los insumos se agrupan en 4 módulos (`insumos.tipo`: `materia_prima`|`bebidas`|`confiteria`|`activos`, migración `007`); **solo `materia_prima` alimenta las recetas** (las páginas de producto filtran el dropdown por ese tipo). Un producto puede tener **receta** en `producto_receta` (`{insumo_id, cantidad}` por 1 unidad). `lib/insumos/units.ts` maneja unidades con conversión por dimensión (masa g/kg/lb, volumen ml/L, conteo unidad); el stock del insumo se guarda en su unidad y se convierte al agregar compras. `lib/insumos/consumo.ts` (helpers, **NO** server action) centraliza `descontarIngredientesPorVenta` / `devolverIngredientesPorVenta` / `reemplazarReceta`. **El descuento de ingredientes está enganchado en las 3 rutas que completan una venta** (`pos/actions.registrarVenta`, `breb/actions.confirmarVentaBreb`, `webhook/bancolombia`) y la devolución en `ingresos/actions.anularVenta` — si tocas una, revisa las otras. Migración `006_insumos`. Las queries degradan a `[]` si la tabla no existe (seguro de desplegar antes de correr la migración). UI: `/dashboard/insumos` + sección "Receta" en `ProductForm`; alerta de bajo stock en el dashboard. **Fase 2 (facturas → insumos):** `/api/ia/leer-factura` también extrae `ingredientes`; `ExpenseForm` muestra `IngredientesDetectados` (revisar/editar, vincular a un insumo existente o crear nuevo) → `procesarCompraIngredientes` (suma stock + costo promedio, con conversión de unidad). **Fase 3 (costos/disponibilidad):** `getResumenRecetas` calcula el costo real por unidad (Σ cantidad × costo del insumo) y la disponibilidad (min `floor(stock/cantidad)`), usados en `InventoryList` (margen real + "Alcanza: N") y `ProductForm` (costo/ganancia en vivo).

**Stock único producto ↔ insumo (migración `012`, CRÍTICO):** un artículo que se vende tal cual (una cerveza) vive en las dos pantallas. Si el producto del POS **no** tiene `productos.insumo_id`, cada uno lleva su propio stock y **vender no mueve el Inventario** — ese fue el bug de "vendí una y el inventario sigue igual". Reglas: (a) al crear una bebida, si no existe producto homónimo se ofrece crearlo (`crearProductoDesdeBebida`) y si **sí** existe se ofrece conectarlo (`vincularProductoConInsumo`, pide el stock real y lo deja como stock único); `desvincularProducto` los separa. (b) `getVinculosBebidas` detecta los duplicados y `InsumosManager` los muestra en rojo con el botón **Conectar**. (c) Un insumo solo puede tener **un** producto conectado (si no se descontaría dos veces); `calcularConsumo` ignora la línea de receta que apunte al insumo propio del producto por la misma razón. (d) Con el producto conectado, `actualizarProducto` **no** toca `stock_actual`/`stock_minimo` (el form los oculta y los pondría en 0). (e) Toda mutación de stock de insumos revalida también `/dashboard/inventario` y `/dashboard/pos`, y las 4 rutas de venta revalidan `/dashboard/insumos`.

### Productos que se preparan (receta) vs productos con stock

Regla única: **si un producto tiene receta, la receta manda**. `productos.stock_actual` se guarda en 0, el formulario no lo pide, `descontarStockProductosPorVenta` lo salta (solo se descuentan los ingredientes) y el POS **nunca** lo marca agotado — a lo sumo avisa `Falta <ingrediente>`. La decisión de **avisar y no bloquear** es deliberada: con un ingrediente mal cargado, bloquear dejaría al restaurante sin vender. `getResumenRecetas` devuelve `{ costoReceta, faltantes[] }` (ya no `disponibles`: se quitó el "alcanza para N" porque lo útil es saber qué comprar). El costo de venta de un preparado sale de `costosDeReceta`, no de `precio_compra` (que suele quedar en 0 e infla el margen al 100%). Jerarquía de stock en las 3 queries que lo muestran: insumo conectado → receta → stock propio.

**Receta desde el formulario del producto:** `RecetaFila` (en `ProductForm`) crea ingredientes con `crearInsumoRapido` sin salir de la página, y reutiliza el homónimo si existe. Ojo con los **dos números que se confunden**: "cuánto tienes guardado" (stock del insumo) vs "cuánto lleva una" (cantidad de la receta). Confundirlos dejaba la receta vacía en silencio; por eso el renglón incompleto se marca en rojo y el submit se bloquea.

### Reglas de contabilidad (INVIOLABLES — es la caja de un restaurante real)

1. **Identidades numéricas.** `venta_items.subtotal = cantidad × precio_unitario`; `ventas.subtotal = Σ venta_items.subtotal`; `ventas.total = subtotal + iva + recargo` (hoy `iva = 0`). Verificado contra las 34 ventas reales: 0 descuadres. Si tocas precios o totales, vuelve a correr esa verificación.
2. **Solo `completada` es plata que entró.** `abierta` (mesa sin cobrar) y `cancelada` nunca cuentan como ingreso. Toda query que sume o liste ventas debe filtrarlas: dashboard (KPIs y "últimas ventas"), ingresos (lista y agregados), POS (ventas de hoy), historial del cliente, analítica y reportes. Las RPC `balance_diario` y `ventas_por_hora` ya filtran `completada` en SQL.
3. **El inventario se mueve al COBRAR, nunca al pedir.** Una cuenta abierta no descuenta nada; `cobrarCuenta` descuenta productos + ingredientes + bebidas en ese momento. Decisión del dueño: si el cliente cambia de opinión antes de pagar, no queda basura en el inventario.
4. **Los precios y el recargo se calculan en el servidor**, nunca se confía en el número que manda el navegador (`registrarVenta`, `cobrarCuenta`).
5. **Nada se descuenta dos veces.** El cierre de una cuenta filtra por `.eq('estado','abierta')`; la confirmación Bre-B por `.eq('estado','pendiente')`; un producto con receta no descuenta stock propio; un insumo conectado a un producto ignora su propia línea de receta.
6. **El costo de venta se congela en `venta_items.precio_compra`** al momento de vender (receta si la hay, si no `productos.precio_compra`). Las ventas viejas conservan el costo que tenían: no se reescribe el pasado.
7. **Acumulado del cliente**: sube en `registrarVenta` y en `cobrarCuenta`, y se revierte en `anularVenta`. Si agregas una cuarta forma de completar una venta, tiene que hacer las tres cosas (stock, cliente, revalidate).

### Mesas / cuentas abiertas (migración `014`)

Una venta puede quedar en `estado = 'abierta'` con `ventas.mesa` (etiqueta libre). **No descuenta inventario ni cuenta como ingreso** hasta que se cobra: reportes y analítica no cambian porque filtran por `'completada'`. `lib/mesas/actions.ts`: `guardarCuenta` (abre o actualiza, reemplaza las líneas), `cobrarCuenta` (cierra **la misma** fila de `ventas` y ahí sí descuenta productos + ingredientes + bebidas) y `anularCuenta`. El cierre filtra por `.eq('estado','abierta')` para que dos meseros no descuenten dos veces. El carrito (`cart-store`) lleva `cuentaId`/`mesa`; con `cuentaId` puesto, el `PaymentModal` llama `cobrarCuenta` en vez de `registrarVenta`.

### Pago con tarjeta y recargo (migración `013`)

`empresas.recargo_tarjeta_pct` (0–20, default 0) y `ventas.recargo` (los pesos cobrados de más, aparte del precio de los productos). El porcentaje se configura en Configuración; el POS lo **muestra** pero el monto lo recalcula el servidor en `registrarVenta`/`cobrarCuenta`. Nota de negocio: en Colombia el recargo por tarjeta va contra las reglas de Visa/Mastercard y la SIC lo ha sancionado; el mismo campo sirve para presentarlo como descuento por efectivo si algún día se cambia.

### Aprendizaje del dueño (fases 1–3)

El público no es técnico y la app "de inicio es muy confusa". Todo lo que enseña sigue **una regla: nada se pregunta ni se propone antes de tiempo**, y nada se marca a mano — el estado sale siempre de la base de datos, así que no hay carteles mintiendo.

**Registro (fase 1).** `OnboardingFlow` pide dos cosas: cómo se llama y qué vende (`empresas.categoria`, migración `015`). El resto (NIT, dirección, teléfono, WhatsApp) se movió a Ajustes. El paso 2 es cargar la carta con una foto (`CartaPorFoto`). El layout de `/onboarding` tiene **"Entrar con otra cuenta"**: sin eso, una sesión sin empresa queda encerrada (login → dashboard → onboarding → falla → login…).

**Modo práctica (migración `016`).** `empresas.modo_practica` arranca en `true` solo para empresas nuevas (default de la columna es `FALSE` a propósito: un restaurante en producción no puede despertar sin registrar su caja). Con él, `PaymentModal` corta antes de guardar: muestra "¡Vendido!" pero no escribe venta, ni stock, ni acumulado del cliente. `guia_pos_vista` hace que los globos del POS salgan una sola vez, y vive en la empresa y no en el navegador para que no vuelvan al cambiar de celular.

**Lista de arranque (fase 2).** `getTareasArranque` → `ListaArranque`, en el inicio. 4–5 tareas (la de ingredientes solo si `esNegocioDeMesas(categoria)`), cada una marcada por un `count` real. Se puede **doblar pero no cerrar**, y cuando está todo hecho devuelve `null` y no vuelve nunca. Solo el doblado vive en `localStorage`.

**Pantallas que enseñan (fase 2).** `EstadoVacio` en toda pantalla sin datos (nunca una pantalla en blanco) y `AyudaPantalla` — el "?" al lado del h1 — en las **diez** pantallas del dashboard. El botón de WhatsApp de soporte sale solo si está `NEXT_PUBLIC_SOPORTE_WHATSAPP`.

**Siguiente paso (fase 3).** `getSiguientePaso` → `SiguientePaso`. Propone **UNA** cosa, nunca una lista, y solo cuando el negocio ya vende (`VENTAS_PARA_SUGERIR` = 5 ventas cobradas) y **no** está en modo práctica. Orden: recetas → mesas → cobro por QR → datos del negocio → recargo de tarjeta. Cada paso tiene su condición real (¿hay filas en `producto_receta`? ¿alguna venta con `mesa`? ¿hay `breb_qr_payload`?), así que se apaga solo al hacerlo. Recetas y mesas solo se proponen a negocios de comida; el QR solo si `esPro`; el recargo solo si YA cobró con tarjeta alguna vez.

**"Ahora no" va en COOKIE (`COOKIE_PASOS`), no en localStorage** — esto importa: con localStorage el servidor no sabe qué pospuso, así que la tarjeta tenía que pintarse después de hidratar y en un celular lento aparecía tarde y de golpe. Con cookie el servidor filtra y la página llega pintada. Posponer **no silencia todo**: salta ese paso y propone el siguiente. Dura `DIAS_POSPONER` (7) días. Los tipos y constantes compartidos están en `lib/tareas/pasos.ts` y no en `queries.ts`, porque ese arrastra el cliente de Supabase al bundle del navegador.

### Carta digital pública (migración `017`)

El menú del negocio en internet, con un QR para pegar en las mesas. Es **la única parte de la app que ve alguien sin cuenta**, así que tiene sus propias reglas.

**Ruta pública:** `/carta/[slug]` — fuera de `/dashboard`, sin sesión, y **no** está en el matcher de `src/proxy.ts`. `revalidate = 60`: una mesa llena de gente escaneando no golpea la BD, y un cambio de precio se ve al minuto. Lleva `robots: noindex` — es la carta de un negocio, no contenido que queramos en Google.

**`getCartaPublica(slug)` es la función más delicada de la app.** Como no hay sesión usa `createAdminClient()` (bypasea RLS), así que:

1. Solo responde si `empresas.carta_activa` es true. Un slug que existe pero con la carta apagada da el **mismo 404** que un slug inventado: desde fuera no se puede saber si el negocio existe.
2. Solo selecciona los campos que van impresos: nombre, teléfono, dirección, y de cada producto nombre/descripción/precio/variantes. **Nunca** `precio_compra`, stock, ni ids de otras tablas. Si hace falta otro campo se agrega ahí a mano y se piensa dos veces.

Va con `cache()` de React porque la piden `generateMetadata` y la página en el mismo request.

**Consentimiento:** `carta_activa` arranca en `FALSE` y solo se enciende desde `/dashboard/carta`, donde el interruptor dice con esas palabras que cualquiera con el link verá sus platos y precios. Nadie queda publicado por no haber leído.

**`productos.en_carta`** (default `TRUE`) deja fuera lo que se vende pero no es carta: domicilio, bolsa, desechables. Se alterna desde la misma pantalla.

**El slug** se genera del nombre (`lib/carta/slug.ts`, `aSlug`) y el dueño lo puede editar. Índice único **parcial** (`WHERE carta_slug IS NOT NULL`) para que los negocios sin carta no choquen entre sí; un slug repetido devuelve `23505` y se traduce a "ese link ya lo usa otro negocio".

**El dominio del link y del QR sale de los headers de la petición** (`x-forwarded-host`/`host`), no de `NEXT_PUBLIC_APP_URL`: así funciona igual en producción, en un preview de Vercel y en localhost sin configurar nada. El QR se dibuja en el navegador con `qrcode` (ya estaba para Bre-B).

### Rendimiento (leer antes de tocar layout/proxy)

Medido: 400–900 ms por navegación y 11 consultas por clic, con ~360 ms iniciales gastados en preguntar la identidad **tres veces**. Lo que lo arregló: (a) `src/app/dashboard/loading.tsx` + `pos/loading.tsx` — sin fronteras de suspense el navegador deja la pantalla vieja congelada y se siente trabado; (b) `lib/auth/sesion.ts` → `getSesion()` con `cache()` de React, que comparten layout, página y `getEmpresaIdDelUsuario`; (c) el proxy ya **no** consulta `usuarios` (el layout hace la misma comprobación); (d) recharts entra por `next/dynamic`; (e) `RealtimeRefresher` no refresca dentro del POS ni con la pestaña de fondo, y hace debounce de 1.5 s. **No volver a meter consultas de identidad en el proxy ni en las páginas.**

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

`/api/ia/leer-factura` recibe una imagen y usa el SDK de Anthropic (`@anthropic-ai/sdk`, modelo `claude-haiku-4-5`) para extraer `{ proveedor, monto, fecha, categoria, descripcion, ingredientes[] }` en JSON. Lo usa `ExpenseForm` para auto-rellenar un gasto desde una foto; los `ingredientes` (renglones de la factura) alimentan el flujo de insumos (ver *Insumos y recetas*, Fase 2). Requiere `ANTHROPIC_API_KEY`.

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
