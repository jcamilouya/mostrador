# ACTUALIZACIÓN ROADMAP — Mostrador
## Fase actual: Bugs + Configuración + WhatsApp IA + Features vs Treinta

> **Para Claude Code:** Lee este documento completo antes de tocar una sola línea.
> Verifica cada paso antes de avanzar al siguiente.
> Si algo no está claro, pregunta antes de asumir.
> Stack: Next.js 14+ · Supabase · TypeScript · Tailwind · shadcn/ui

---

## Estado actual confirmado

Todas las secciones corren. Lo que existe y funciona:

| Sección | Estado |
|---------|--------|
| Landing, Login, Register | ✅ |
| Dashboard home (KPIs + gráficos) | ✅ con bug |
| POS — grid productos, carrito, filtros | ✅ |
| Inventario — 31 productos, tabla completa | ✅ |
| Gastos — CRUD, categorías, método pago | ✅ |
| Ingresos — historial, 4 KPIs | ✅ |
| Analítica — donut, top productos, heatmap | ✅ con bugs |
| Reportes — PDF + Excel | ✅ |
| Configuración — datos negocio + Bre-B QR preview | ✅ incompleto |
| Plan — trial 21 días, Básico vs Pro | ✅ stub |
| Mobile — bottom nav, POS 2 columnas | ✅ |

---

## PRIORIDAD 1 — Bugs críticos (hacer PRIMERO)

> Sin esto no le muestres la app a nadie. Dan mala impresión aunque todo funcione.

### Bug #1 — KPIs del home muestran $0 cuando hay datos históricos

**Problema:** Los KPIs solo muestran ventas de "hoy". Si hoy no hay ventas (día nuevo, negocio piloto recién instalado) todo aparece en $0.

**Solución:** Lógica de fallback inteligente:

```typescript
// lib/dashboard/kpis.ts
export async function getKpisPrincipal(empresaId: string) {
  const hoy = new Date().toISOString().split('T')[0];

  // 1. Intentar con datos de hoy
  const { data: ventasHoy } = await supabase
    .from('ventas')
    .select('total')
    .eq('empresa_id', empresaId)
    .eq('estado', 'completada')
    .gte('created_at', `${hoy}T00:00:00`)
    .lte('created_at', `${hoy}T23:59:59`);

  const hayDatosHoy = ventasHoy && ventasHoy.length > 0;

  // 2. Si no hay nada hoy → usar últimos 7 días
  const periodo = hayDatosHoy ? 'hoy' : 'últimos 7 días';
  const desde = hayDatosHoy
    ? `${hoy}T00:00:00`
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Calcular KPIs con el período correcto
  const { data: ventas } = await supabase
    .from('ventas')
    .select('total, created_at')
    .eq('empresa_id', empresaId)
    .eq('estado', 'completada')
    .gte('created_at', desde);

  return {
    totalVentas: ventas?.reduce((s, v) => s + v.total, 0) ?? 0,
    cantidadVentas: ventas?.length ?? 0,
    periodo, // Mostrar en la UI: "Hoy" o "Últimos 7 días"
  };
}
```

**En la UI:** Mostrar debajo de cada KPI un badge pequeño indicando el período:
- Si hay datos hoy → badge "Hoy" en verde
- Si es fallback → badge "Últ. 7 días" en amarillo + tooltip "Aún no hay ventas hoy"

**Nunca mostrar $0 sin contexto.** Si hay historial, hay datos que mostrar.

---

### Bug #2 — Analítica muestra "-100% vs mes pasado"

**Problema:** Junio apenas empieza, las ventas son de mayo. El comparativo es matemáticamente correcto pero confunde al usuario que piensa que algo está roto.

**Solución:** Ocultar el comparativo cuando no hay suficientes datos:

```typescript
// lib/analytics/comparativo.ts
export function calcularComparativo(actual: number, anterior: number) {
  // No mostrar comparativo si:
  // 1. El mes actual tiene menos de 3 días con datos
  // 2. El mes anterior tiene $0
  // 3. Estamos en los primeros 5 días del mes
  const diasDelMes = new Date().getDate();

  if (diasDelMes <= 5 || anterior === 0 || actual === 0) {
    return null; // null = no mostrar el badge de comparativo
  }

  const porcentaje = ((actual - anterior) / anterior) * 100;
  return {
    valor: Math.round(porcentaje),
    positivo: porcentaje >= 0,
  };
}
```

**En la UI:** Si `comparativo === null` → no renderizar el badge de % cambio. Punto. No mostrar "-100%", no mostrar "N/A", simplemente no mostrarlo.

---

### Bug #3 — Heatmap de horas pico desalineado

**Problema:** Las celdas del miércoles aparecen en las columnas 21:00-22:00 en vez de estar en la columna correcta del día.

**Diagnóstico probable:** El grid está usando el índice del array en vez del valor real de `hora` o `dia_semana` de la query.

**Solución:**

```typescript
// Al procesar los datos del heatmap, NO usar .forEach con índice
// INCORRECTO:
datos.forEach((item, index) => {
  grid[index] = item.total; // ← BUG: usa posición en array, no dia/hora real
});

// CORRECTO:
const grid: number[][] = Array(7).fill(null).map(() => Array(24).fill(0));
datos.forEach((item) => {
  const dia = item.dia_semana; // 0=domingo, 6=sábado
  const hora = item.hora;      // 0-23
  grid[dia][hora] = item.total_ventas;
});
```

**Verificar:** Después de arreglar, confirmar que:
- Eje X = horas 0 a 23
- Eje Y = días Lun-Dom
- Una celda en (Miércoles, 14:00) debe mostrar ventas reales del miércoles a las 2pm
- Si no hay datos para una celda → opacity muy baja, no "vacío visual confuso"

---

## PRIORIDAD 2 — Configuración completa

> Esta es la página donde el dueño personaliza TODO su negocio. Debe quedar impecable.

### 2.1 Estructura de secciones en Configuración

La página `/configuracion` debe tener estas secciones en tabs o acordeón:

```
Configuración
├── 1. Perfil del negocio
├── 2. WhatsApp (NUEVO — el diferenciador)
├── 3. Bre-B / Pagos QR
├── 4. Impuestos y moneda
└── 5. Plan y suscripción
```

---

### 2.2 Sección: Perfil del negocio

**Campos a mostrar y editar:**

```typescript
interface PerfilNegocio {
  nombre: string;          // Requerido
  nit: string;             // Opcional, con formato XX.XXX.XXX-X
  direccion: string;       // Opcional
  telefono: string;        // Opcional
  email: string;           // No editable (es el login)
  categoria_negocio: string; // Select: tienda, restaurante, peluquería, ferretería, otro
  logo_url: string;        // Upload de imagen → Supabase Storage
}
```

**UX:**
- Botón "Guardar cambios" sticky al fondo o en el header de la sección
- Al subir el logo: preview inmediata antes de guardar, crop cuadrado automático
- Al guardar: toast "¡Perfil actualizado! Tu negocio ya tiene nueva cara 💪"
- Validar NIT con formato colombiano antes de guardar

---

### 2.3 Sección: WhatsApp ← NUEVO, CRÍTICO

> Esta sección conecta el número del dueño con el bot de la plataforma.

**Lógica del flujo (ENTENDER BIEN ANTES DE CODEAR):**

La plataforma tiene UN número de WhatsApp Business central (el bot).
El dueño registra SU número personal en esta sección.
Cuando él envíe una foto al número del bot, el sistema lo reconoce por su número
y sabe a qué empresa asignar el gasto.

**UI de la sección:**

```
┌─────────────────────────────────────────────────────┐
│ 📱 Conecta tu WhatsApp                              │
│                                                     │
│ Regístrala una vez y envía fotos de tus facturas   │
│ al bot. La IA las registra automáticamente.         │
│                                                     │
│ Tu número de WhatsApp                               │
│ ┌─────────────────────────────────────────────┐   │
│ │ 🇨🇴 +57  [310 555 1234                    ] │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ [Guardar número]                                   │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ Número del bot de Mostrador                         │
│ ┌─────────────────────────────────────────────┐   │
│ │ +57 300 XXX XXXX                    [Copiar]│   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ Guarda este número en tus contactos como           │
│ "Mostrador Bot" y envíale fotos de tus facturas.  │
│                                                     │
│ ✅ Estado: Número registrado y activo              │
└─────────────────────────────────────────────────────┘
```

**Instrucciones de uso (mostrar en la misma sección):**

```
Cómo usar:
1. Guarda el número del bot en tus contactos
2. Cuando recibas una factura de un proveedor, tómale foto
3. Envía la foto al bot por WhatsApp
4. El bot te responderá con un resumen → confirmas con SI
5. El gasto queda registrado solo en tu dashboard
```

**Código del componente:**

```typescript
// components/configuracion/WhatsAppConfig.tsx
'use client';
import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';

export function WhatsAppConfig({ empresa }: { empresa: Empresa }) {
  const [numero, setNumero] = useState(empresa.whatsapp_numero ?? '');
  const [guardando, setGuardando] = useState(false);
  const { toast } = useToast();

  const BOT_NUMERO = process.env.NEXT_PUBLIC_WHATSAPP_BOT_NUMERO!;

  async function guardar() {
    setGuardando(true);
    // Validar formato: debe ser número colombiano válido
    const limpio = numero.replace(/\D/g, '');
    if (limpio.length < 10) {
      toast({ title: 'Número inválido', description: 'Ingresa tu número celular completo', variant: 'destructive' });
      setGuardando(false);
      return;
    }
    const numeroFinal = limpio.startsWith('57') ? `+${limpio}` : `+57${limpio}`;

    const { error } = await supabase
      .from('empresas')
      .update({ whatsapp_numero: numeroFinal })
      .eq('id', empresa.id);

    if (error) {
      toast({ title: 'Error al guardar', variant: 'destructive' });
    } else {
      toast({ title: '¡Número guardado! 📱', description: 'Ya puedes enviar fotos de facturas al bot' });
    }
    setGuardando(false);
  }

  return (
    <div className="space-y-6">
      {/* Input número del dueño */}
      <div>
        <label className="text-sm font-medium">Tu número de WhatsApp</label>
        <div className="flex gap-2 mt-1">
          <span className="flex items-center px-3 bg-muted rounded-l-md border text-sm">🇨🇴 +57</span>
          <input
            type="tel"
            value={numero}
            onChange={e => setNumero(e.target.value)}
            placeholder="310 555 1234"
            className="flex-1 border rounded-r-md px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button onClick={guardar} disabled={guardando} className="btn-primary">
        {guardando ? 'Guardando...' : 'Guardar número'}
      </button>

      {/* Número del bot */}
      <div className="bg-muted/50 rounded-xl p-4 border">
        <p className="text-sm font-medium mb-1">Número del bot de Mostrador</p>
        <div className="flex items-center gap-2">
          <code className="text-sm bg-background px-3 py-2 rounded-md border flex-1">
            {BOT_NUMERO}
          </code>
          <button onClick={() => navigator.clipboard.writeText(BOT_NUMERO)}
            className="text-sm text-primary hover:underline">
            Copiar
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Guarda este número como "Mostrador Bot" y envíale fotos de tus facturas.
        </p>
      </div>

      {/* Estado de conexión */}
      {empresa.whatsapp_numero && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <span>✅</span>
          <span>Número {empresa.whatsapp_numero} registrado y activo</span>
        </div>
      )}

      {/* Instrucciones */}
      <InstruccionesWhatsApp />
    </div>
  );
}
```

---

### 2.4 Sección: Bre-B / Pagos QR

> Ya existe preview del QR. Completar la configuración real.

**Campos:**

```typescript
interface BreBConfig {
  breb_merchant_id: string;  // El Merchant ID de Bre-B
  breb_llave: string;        // Llave: cédula, celular o correo
  breb_banco: string;        // Select: Bancolombia, Davivienda, BBVA, Nu, Banco de Bogotá, Otro
}
```

**UI mejorada:**

```
┌─────────────────────────────────────────────────────┐
│ ⚡ Cobros con Bre-B                                  │
│ Recibe pagos de cualquier banco. $0 comisión.       │
│                                                     │
│ Mi banco principal                                  │
│ [Select: Bancolombia ▼]                            │
│                                                     │
│ Mi llave Bre-B                                      │
│ [310 555 1234              ]                        │
│ (la misma que registraste en tu banco)              │
│                                                     │
│ [Guardar y generar QR]                             │
│                                                     │
│ ─── Vista previa de tu QR ───────────────────────  │
│                                                     │
│         [████ QR ESTÁTICO ████]                    │
│                                                     │
│ Muéstraselo a tus clientes para que escaneen       │
│ y paguen desde cualquier banco.                    │
│                                                     │
│ ⚠️ Este es un QR estático (monto libre).           │
│ El QR dinámico (monto fijo por venta) se genera   │
│ automáticamente en el POS al cobrar.               │
└─────────────────────────────────────────────────────┘
```

**Generación del QR EMVCo:**

```typescript
// lib/breb/generate-qr.ts
import QRCode from 'qrcode'; // npm install qrcode

export async function generateBreBQR(params: {
  merchantId: string;
  llave: string;
  monto?: number;        // null = QR estático (monto libre)
  referencia?: string;   // ID de la venta para QR dinámico
}): Promise<string> {
  // Formato EMVCo estándar para Colombia / Bre-B
  const payload = buildEMVCoPayload({
    merchantId: params.merchantId,
    llave: params.llave,
    monto: params.monto,
    moneda: '170', // COP = 170
    referencia: params.referencia,
    pais: 'CO',
  });

  // Retorna base64 del QR para mostrar en <img src={qrDataUrl} />
  return await QRCode.toDataURL(payload, {
    width: 280,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}

function buildEMVCoPayload(p: {
  merchantId: string;
  llave: string;
  monto?: number;
  moneda: string;
  referencia?: string;
  pais: string;
}): string {
  // Estructura básica EMVCo para pagos QR Colombia
  const fields: string[] = [];

  // ID de formato de datos
  fields.push(tlv('00', '01'));

  // Indicador de iniciación
  fields.push(tlv('01', p.monto ? '12' : '11')); // 11=estático, 12=dinámico

  // Información del comercio (Merchant Account)
  const merchantInfo = tlv('00', 'co.breb') + tlv('01', p.merchantId) + tlv('02', p.llave);
  fields.push(tlv('26', merchantInfo));

  // Categoría del comercio
  fields.push(tlv('52', '5999'));

  // Moneda (COP = 170)
  fields.push(tlv('53', p.moneda));

  // Monto (solo si es dinámico)
  if (p.monto) {
    fields.push(tlv('54', p.monto.toFixed(2)));
  }

  // País
  fields.push(tlv('58', p.pais));

  // Nombre del comercio (max 25 chars)
  fields.push(tlv('59', 'Mostrador'));

  // Ciudad
  fields.push(tlv('60', 'Bogota'));

  // Referencia adicional
  if (p.referencia) {
    const addData = tlv('05', p.referencia);
    fields.push(tlv('62', addData));
  }

  const withoutCRC = fields.join('') + '6304';
  const crc = calcCRC16(withoutCRC);
  return withoutCRC + crc;
}

// TLV: Tag-Length-Value
function tlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

// CRC16-CCITT
function calcCRC16(data: string): string {
  let crc = 0xFFFF;
  for (const char of data) {
    crc ^= char.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}
```

**En el POS — QR dinámico por venta:**

```typescript
// Cuando el dueño elige pagar con Bre-B en el POS:
const qrDataUrl = await generateBreBQR({
  merchantId: empresa.breb_merchant_id,
  llave: empresa.breb_llave,
  monto: venta.total,                    // Monto exacto de esta venta
  referencia: venta.id,                  // Para reconciliar el pago
});

// Mostrar QR en pantalla → dueño le muestra al cliente el celular
// El cliente escanea desde su banco → paga
// Webhook confirma → venta se cierra automáticamente
```

---

## PRIORIDAD 3 — WhatsApp IA completo

> Este es el diferenciador #1. Construirlo bien o no construirlo.

### 3.1 Setup inicial (hacer una vez)

**Requisitos previos:**
- Cuenta Meta Business verificada
- Número de teléfono dedicado para el bot (no puede tener WhatsApp instalado)
- App de Meta con WhatsApp Business API habilitada
- API Key de Anthropic (ya existe con créditos)

**Variables de entorno a agregar:**

```env
# WhatsApp Business API
WHATSAPP_API_TOKEN=           # Token de acceso de Meta
WHATSAPP_PHONE_NUMBER_ID=     # ID del número del bot en Meta
WHATSAPP_VERIFY_TOKEN=        # Token de verificación del webhook (inventar uno)
NEXT_PUBLIC_WHATSAPP_BOT_NUMERO=+57300XXXXXXX  # Número visible al dueño

# Anthropic (ya existe)
ANTHROPIC_API_KEY=            # Ya tienes créditos
```

---

### 3.2 Webhook de WhatsApp

```typescript
// app/api/webhook/whatsapp/route.ts

// GET: Verificación del webhook con Meta
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// POST: Recibir mensajes de WhatsApp
export async function POST(req: Request) {
  const body = await req.json();

  // Estructura del webhook de Meta
  const entry   = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const mensaje = changes?.value?.messages?.[0];

  if (!mensaje) return Response.json({ ok: true }); // Ignorar notificaciones sin mensaje

  const numeroDueño = mensaje.from;     // Número que envió el mensaje (+57310...)
  const tipo        = mensaje.type;     // 'image', 'text', etc.

  // 1. Identificar qué empresa es por número
  const { data: empresa } = await supabaseAdmin
    .from('empresas')
    .select('id, nombre')
    .eq('whatsapp_numero', `+${numeroDueño}`)
    .single();

  if (!empresa) {
    // Número no registrado → responder amablemente
    await enviarMensaje(numeroDueño,
      '¡Hola! 👋 Este número no está vinculado a ningún negocio en Mostrador. ' +
      'Entra a tu app → Configuración → WhatsApp y registra tu número.'
    );
    return Response.json({ ok: true });
  }

  // 2. Si es una imagen → procesar con IA
  if (tipo === 'image') {
    await procesarFactura(empresa.id, empresa.nombre, numeroDueño, mensaje.image.id);
    return Response.json({ ok: true });
  }

  // 3. Si es texto "SI" → confirmar egreso pendiente
  if (tipo === 'text') {
    const texto = mensaje.text.body.trim().toUpperCase();
    if (texto === 'SI' || texto === 'SÍ' || texto === 'S') {
      await confirmarEgresoPendiente(empresa.id, numeroDueño);
    } else if (texto === 'NO' || texto === 'N') {
      await cancelarEgresoPendiente(empresa.id, numeroDueño);
      await enviarMensaje(numeroDueño, 'Entendido, cancelado. Mándame la foto cuando quieras 📸');
    }
  }

  return Response.json({ ok: true });
}
```

---

### 3.3 Procesamiento con Claude Vision

```typescript
// lib/whatsapp/procesar-factura.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function procesarFactura(
  empresaId: string,
  nombreEmpresa: string,
  numeroDueño: string,
  imageId: string
) {
  try {
    // 1. Descargar la imagen de Meta
    const imageBase64 = await descargarImagenMeta(imageId);

    // 2. Enviar a Claude Haiku (barato: ~$0.01 por factura)
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: `Eres un asistente que extrae datos de facturas para un negocio colombiano.
Analiza esta imagen y responde SOLO con un JSON con este formato exacto:
{
  "proveedor": "nombre del proveedor o empresa que emite la factura",
  "monto": 0,
  "fecha": "YYYY-MM-DD",
  "categoria": "proveedores|arriendo|servicios|nomina|impuestos|transporte|mantenimiento|otros",
  "descripcion": "breve descripción de qué es",
  "confianza": "alta|media|baja"
}
Si no puedes leer algún campo, usa null.
Si no es una factura o recibo, responde: {"error": "no_es_factura"}`,
          },
        ],
      }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';

    // 3. Parsear respuesta
    let datos: FacturaIA;
    try {
      datos = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      await enviarMensaje(numeroDueño,
        'No pude leer bien esa imagen 😅 ¿Puedes enviar otra foto más clara y con buena luz?'
      );
      return;
    }

    if ('error' in datos) {
      await enviarMensaje(numeroDueño,
        'Eso no parece una factura 🤔 Envíame la foto de una factura o recibo de un proveedor.'
      );
      return;
    }

    // 4. Formatear monto en pesos colombianos
    const montoFormateado = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(datos.monto);

    // 5. Guardar como egreso PENDIENTE (esperar confirmación)
    const { data: egresoPendiente } = await supabaseAdmin
      .from('egresos_pendientes_whatsapp')
      .insert({
        empresa_id: empresaId,
        numero_whatsapp: numeroDueño,
        datos_ia: datos,
        estado: 'pendiente',
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min para confirmar
      })
      .select()
      .single();

    // 6. Responder al dueño con resumen y pedir confirmación
    const emoji = CATEGORIA_EMOJI[datos.categoria] ?? '📄';
    const mensaje =
      `${emoji} *Factura detectada*\n\n` +
      `📌 Proveedor: *${datos.proveedor || 'No detectado'}*\n` +
      `💰 Monto: *${montoFormateado}*\n` +
      `📅 Fecha: *${datos.fecha || 'No detectada'}*\n` +
      `🏷️ Categoría: *${datos.categoria}*\n` +
      (datos.descripcion ? `📝 ${datos.descripcion}\n` : '') +
      `\n¿Confirmas? Responde *SI* para guardar o *NO* para cancelar.`;

    await enviarMensaje(numeroDueño, mensaje);

  } catch (error) {
    console.error('Error procesando factura:', error);
    await enviarMensaje(numeroDueño,
      'Ups, algo salió mal de nuestro lado 😓 Inténtalo de nuevo en un momento.'
    );
  }
}

const CATEGORIA_EMOJI: Record<string, string> = {
  proveedores: '📦',
  arriendo: '🏠',
  servicios: '💡',
  nomina: '👥',
  impuestos: '🏛️',
  transporte: '🚚',
  mantenimiento: '🔧',
  otros: '📋',
};
```

---

### 3.4 Confirmación y guardado definitivo

```typescript
// lib/whatsapp/confirmar-egreso.ts
export async function confirmarEgresoPendiente(empresaId: string, numeroDueño: string) {
  // Buscar el egreso pendiente más reciente de este número
  const { data: pendiente } = await supabaseAdmin
    .from('egresos_pendientes_whatsapp')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('numero_whatsapp', numeroDueño)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!pendiente) {
    await enviarMensaje(numeroDueño,
      'No encontré ninguna factura pendiente de confirmar. ¿Envíame la foto de nuevo?'
    );
    return;
  }

  const { datos_ia } = pendiente;

  // Guardar el egreso real
  const { error } = await supabaseAdmin
    .from('egresos')
    .insert({
      empresa_id: empresaId,
      proveedor: datos_ia.proveedor,
      monto: datos_ia.monto,
      fecha: datos_ia.fecha ?? new Date().toISOString().split('T')[0],
      categoria: datos_ia.categoria,
      descripcion: datos_ia.descripcion,
      fuente: 'whatsapp_ia',
      metodo_pago: 'efectivo',
    });

  if (error) {
    await enviarMensaje(numeroDueño, 'Algo salió mal al guardar 😓 Inténtalo de nuevo.');
    return;
  }

  // Marcar como confirmado
  await supabaseAdmin
    .from('egresos_pendientes_whatsapp')
    .update({ estado: 'confirmado' })
    .eq('id', pendiente.id);

  // Respuesta celebratoria
  const montoFormateado = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(datos_ia.monto);

  await enviarMensaje(numeroDueño,
    `✅ *¡Gasto registrado!*\n\n` +
    `${montoFormateado} de ${datos_ia.proveedor} ya está en tu dashboard.\n\n` +
    `Cuando tengas otra factura, mándame la foto 📸`
  );
}
```

---

### 3.5 Función helper: enviar mensajes

```typescript
// lib/whatsapp/send.ts
export async function enviarMensaje(numero: string, texto: string) {
  await fetch(
    `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numero,
        type: 'text',
        text: { body: texto, preview_url: false },
      }),
    }
  );
}

export async function descargarImagenMeta(imageId: string): Promise<string> {
  // 1. Obtener URL de descarga
  const urlRes = await fetch(
    `https://graph.facebook.com/v18.0/${imageId}`,
    { headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}` } }
  );
  const { url } = await urlRes.json();

  // 2. Descargar la imagen
  const imgRes = await fetch(url, {
    headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}` }
  });
  const buffer = await imgRes.arrayBuffer();

  // 3. Convertir a base64
  return Buffer.from(buffer).toString('base64');
}
```

---

### 3.6 Nueva tabla en Supabase

```sql
-- Egresos pendientes de confirmación por WhatsApp
CREATE TABLE egresos_pendientes_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  numero_whatsapp TEXT NOT NULL,
  datos_ia JSONB NOT NULL,         -- Lo que devolvió Claude
  estado TEXT DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'confirmado', 'cancelado', 'expirado')),
  expires_at TIMESTAMPTZ NOT NULL, -- 30 min para confirmar
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Limpiar expirados automáticamente
CREATE INDEX idx_pendientes_whatsapp_empresa ON egresos_pendientes_whatsapp(empresa_id);
CREATE INDEX idx_pendientes_whatsapp_numero ON egresos_pendientes_whatsapp(numero_whatsapp);

-- RLS
ALTER TABLE egresos_pendientes_whatsapp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pendientes_by_empresa" ON egresos_pendientes_whatsapp
  FOR ALL USING (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );
```

---

## PRIORIDAD 4 — Features vs Treinta

> Treinta acaba de lanzar Cotizaciones. Lo vimos en Instagram. Necesitamos responder.

### 4.1 Cotizaciones (Quotes)

**Qué es:** El negocio genera un presupuesto para un cliente antes de la venta. Si el cliente acepta, la cotización se convierte en venta con un click.

**Flujo:**

```
Cotización creada → Compartir por WhatsApp → Cliente acepta → Convertir en venta
```

**Modelo de datos:**

```sql
CREATE TABLE cotizaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  numero_cotizacion SERIAL,
  cliente_nombre TEXT,
  cliente_telefono TEXT,
  items JSONB NOT NULL,           -- Array de {nombre, cantidad, precio_unitario, subtotal}
  subtotal DECIMAL(12,2) NOT NULL,
  iva DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  notas TEXT,
  estado TEXT DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'aceptada', 'rechazada', 'vencida', 'convertida')),
  vence_en DATE,                  -- Fecha de vencimiento de la cotización
  venta_id UUID REFERENCES ventas(id), -- Si fue convertida
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**UI:** Nueva sección en el menú principal. Un formulario similar al POS para agregar items. Botón "Compartir por WhatsApp" que abre whatsapp:// con el resumen. Botón "Convertir en venta" cuando el cliente acepta.

**Dónde va en el menú:** Entre Ingresos y Analítica. En mobile: agregar al bottom nav o en el menú "Más".

---

### 4.2 Catálogo Virtual

**Qué es:** Un link público compartible con los productos del negocio. Los clientes lo abren desde WhatsApp, ven el catálogo, y pueden pedir.

**URL:** `tuapp.com/catalogo/[slug-del-negocio]`

**Características:**
- Página pública (sin login)
- Muestra: nombre negocio, logo, productos activos con precio y foto
- Filtro por categoría
- Botón "Pedir por WhatsApp" que genera un mensaje prellenado
- El slug se configura en Configuración → Perfil

**Modelo de datos:** Solo necesita un campo nuevo en `empresas`:

```sql
ALTER TABLE empresas ADD COLUMN slug TEXT UNIQUE;
CREATE INDEX idx_empresas_slug ON empresas(slug);
```

**Ruta Next.js:**

```
app/catalogo/[slug]/page.tsx  ← página pública, sin auth
```

---

## PRIORIDAD 5 — Realtime Supabase

```sql
-- Ejecutar en Supabase SQL editor
-- Archivo: mostrador/supabase/realtime.sql (ya existe)
ALTER PUBLICATION supabase_realtime ADD TABLE ventas;
ALTER PUBLICATION supabase_realtime ADD TABLE egresos;
ALTER PUBLICATION supabase_realtime ADD TABLE productos;
```

```typescript
// En el Dashboard, suscribirse a cambios en tiempo real
useEffect(() => {
  const canal = supabase
    .channel(`empresa-${empresaId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ventas',
        filter: `empresa_id=eq.${empresaId}` },
      () => { refetchKpis(); } // Actualizar KPIs al llegar una venta nueva
    )
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'egresos',
        filter: `empresa_id=eq.${empresaId}` },
      () => { refetchKpis(); }
    )
    .subscribe();

  return () => { supabase.removeChannel(canal); };
}, [empresaId]);
```

---

## Orden de ejecución para Claude Code

```
[ ] 1. Bug KPIs $0 → fallback 7 días + badge de período
[ ] 2. Bug -100% → ocultar comparativo sin datos suficientes
[ ] 3. Bug heatmap desalineado → fix de coordenadas día/hora
[ ] 4. Ejecutar y verificar que los 3 bugs NO se reproducen
[ ] 5. Configuración: sección WhatsApp (UI + guardar número)
[ ] 6. Configuración: Bre-B mejorado (QR estático + banco)
[ ] 7. Configuración: Perfil completo (logo upload incluido)
[ ] 8. SQL: crear tabla egresos_pendientes_whatsapp
[ ] 9. Webhook WhatsApp GET (verificación Meta)
[ ] 10. Webhook WhatsApp POST (recibir mensajes)
[ ] 11. Función procesarFactura con Claude Haiku
[ ] 12. Función confirmarEgresoPendiente
[ ] 13. Función enviarMensaje + descargarImagenMeta
[ ] 14. Probar flujo completo: foto → IA → confirmación → egreso
[ ] 15. Realtime: activar ventas + egresos en Supabase
[ ] 16. SQL: crear tabla cotizaciones
[ ] 17. UI Cotizaciones: formulario + compartir WhatsApp
[ ] 18. SQL: agregar campo slug en empresas
[ ] 19. UI Catálogo virtual: página pública /catalogo/[slug]
[ ] 20. Testing end-to-end de todos los flujos
```

---

## Reglas para Claude Code en esta fase

1. **Los bugs primero.** Sin excepción. Son 3 fixes rápidos pero críticos.
2. **Probar el webhook de WhatsApp localmente con ngrok** antes de deployar. Meta necesita una URL pública para el webhook. Usar: `ngrok http 3000` y configurar esa URL en Meta.
3. **El modelo de IA para facturas es `claude-haiku-4-5`**, no sonnet ni opus. Es más barato y suficientemente preciso para leer facturas.
4. **El QR Bre-B en el POS** se genera en el momento del cobro, no antes. No cachear QRs.
5. **Los egresos pendientes de WhatsApp expiran a los 30 minutos.** Si el dueño no confirma, no se guarda nada. Limpiar con un cron job o al inicio del día.
6. **La tabla `egresos_pendientes_whatsapp` usa `service_role`** en el backend (webhook), nunca la anon key del frontend.
7. **Humanizar todos los mensajes del bot.** El bot habla como una persona, no como un sistema.

---

*Actualización: Junio 2026 · Versión 2.0*
