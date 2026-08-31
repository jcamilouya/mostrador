import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

/**
 * Lee la CARTA/MENÚ de un negocio a partir de una foto y devuelve los productos
 * con su precio, listos para revisar y cargar.
 *
 * Es el muro real del primer día: nadie teclea cuarenta productos un martes a
 * las tres de la tarde. Reusa la misma visión de Claude que ya lee facturas,
 * apuntando a otro papel.
 */

type ProductoLeido = {
  nombre: string;
  precio: number;
  categoria: string | null;
  descripcion: string | null;
};

const PROMPT = `Eres un asistente que digitaliza la CARTA (menú) de un negocio colombiano para cargarla en su sistema de ventas.

Mira la imagen y devuelve SOLO un JSON con este formato exacto, sin texto alrededor:
{
  "productos": [
    { "nombre": "Hamburguesa clásica", "precio": 20000, "categoria": "Hamburguesas", "descripcion": "Carne 120g, queso y papas" }
  ]
}

Reglas:
- Un renglón por cada cosa que se VENDE con su precio. Si un plato tiene varios tamaños o presentaciones con precios distintos, crea un renglón por cada uno y ponlo en el nombre (ej: "Jugo natural (grande)").
- "precio" en pesos colombianos, SOLO dígitos, sin puntos ni comas ni el signo $. "18.000" y "18000" y "18 mil" son 18000. Un precio escrito como "18" en una carta colombiana casi siempre significa 18000: úsalo así solo si el resto de la carta también está en miles.
- "categoria": el título de la sección de la carta donde está el plato (Entradas, Hamburguesas, Bebidas, Postres…). Si la carta no tiene secciones, usa null.
- "descripcion": lo que dice la carta debajo del nombre, si lo hay. Si no, null.
- NO inventes platos ni precios. Si un precio no se alcanza a leer, pon 0 y deja el nombre.
- Ignora teléfonos, direcciones, horarios, redes sociales, domicilios y cualquier texto que no sea un producto con precio.
- Si la imagen NO es una carta ni una lista de productos con precios, responde exactamente: {"error": "no_es_carta"}`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, error: 'La lectura por foto no está configurada en este servidor.' },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Formato inválido' }, { status: 400 });
  }

  const file = formData.get('imagen') as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ ok: false, error: 'Sin imagen' }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: 'La foto pesa más de 5 MB. Tómala de nuevo con menos calidad.' },
      { status: 400 },
    );
  }

  const mediaType = (
    file.type === 'image/png'
      ? 'image/png'
      : file.type === 'image/webp'
        ? 'image/webp'
        : file.type === 'image/gif'
          ? 'image/gif'
          : 'image/jpeg'
  ) as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

  let raw: string;
  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      // Una carta se lee UNA vez por negocio y un precio mal leído se convierte
      // en plata mal cobrada: aquí prima la precisión sobre el costo. Las
      // facturas (frecuentes y de bajo riesgo) siguen con haiku.
      model: 'claude-sonnet-5',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });
    // OJO: no sirve mirar `content[0]`. Los modelos pueden devolver primero un
    // bloque de razonamiento y el texto después; leyendo el primero salía vacío
    // y la lectura fallaba SIEMPRE. Hay que buscar el primer bloque de texto.
    raw = response.content.find((b) => b.type === 'text')?.text ?? '';
  } catch (e) {
    // Sin este try/catch, una caída de la IA tumbaba la pantalla con un error
    // técnico en vez de decirle al dueño que puede seguir a mano.
    console.error('[leer-carta] Anthropic', e);
    return NextResponse.json({
      ok: false,
      error: 'No pudimos leer la foto en este momento. Intenta de nuevo o carga los productos a mano.',
    });
  }

  let datos: { productos?: unknown; error?: string };
  try {
    datos = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    return NextResponse.json({
      ok: false,
      error: 'No pudimos entender la foto. Intenta con mejor luz y que se vean los precios.',
    });
  }

  if (datos.error === 'no_es_carta') {
    return NextResponse.json({
      ok: false,
      error: 'Eso no parece una carta. Toma la foto de tu menú, donde se vean los platos con sus precios.',
    });
  }

  const productos: ProductoLeido[] = (Array.isArray(datos.productos) ? datos.productos : [])
    .map((p) => {
      const item = p as Record<string, unknown>;
      const nombre = typeof item.nombre === 'string' ? item.nombre.trim().slice(0, 200) : '';
      const precio = Math.max(0, Math.round(Number(item.precio) || 0));
      const categoria =
        typeof item.categoria === 'string' && item.categoria.trim()
          ? item.categoria.trim().slice(0, 60)
          : null;
      const descripcion =
        typeof item.descripcion === 'string' && item.descripcion.trim()
          ? item.descripcion.trim().slice(0, 500)
          : null;
      return { nombre, precio, categoria, descripcion };
    })
    .filter((p) => p.nombre.length > 1);

  if (productos.length === 0) {
    return NextResponse.json({
      ok: false,
      error: 'No encontramos productos con precio en esa foto. Prueba con otra donde se lea bien la carta.',
    });
  }

  return NextResponse.json({ ok: true, productos });
}
