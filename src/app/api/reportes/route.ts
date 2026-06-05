import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getReporteData, type TipoReporte } from '@/lib/reportes/queries';
import { generarPDF, generarExcel, nombreArchivo } from '@/lib/reportes/generar';

export const runtime = 'nodejs';

const TIPOS: TipoReporte[] = ['ventas', 'egresos', 'pyl'];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get('tipo') as TipoReporte | null;
  const formato = searchParams.get('formato') === 'xlsx' ? 'xlsx' : 'pdf';
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');

  if (!tipo || !TIPOS.includes(tipo)) {
    return NextResponse.json({ error: 'Tipo de reporte inválido' }, { status: 400 });
  }
  const fechaOk = /^\d{4}-\d{2}-\d{2}$/;
  if (!desde || !hasta || !fechaOk.test(desde) || !fechaOk.test(hasta)) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!usuario?.empresa_id) {
    return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });
  }

  const data = await getReporteData(usuario.empresa_id, desde, hasta);

  const bytes =
    formato === 'pdf' ? generarPDF(tipo, data) : await generarExcel(tipo, data);

  const contentType =
    formato === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  return new NextResponse(bytes as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${nombreArchivo(tipo, formato, data)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
