'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import {
  Copy,
  Check,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  QrCode as QrIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { guardarCarta, alternarProductoEnCarta } from '@/lib/carta/actions';
import { aSlug } from '@/lib/carta/slug';
import { formatCOP } from '@/lib/utils/format';
import type { ConfigCarta } from '@/lib/carta/queries';

/**
 * La carta digital vista por el dueño: un interruptor, un link y un QR para
 * pegar en las mesas.
 *
 * El interruptor es lo importante. Encenderlo publica sus platos y precios a
 * cualquiera con el link, así que se dice con esas palabras y arranca apagado:
 * nadie queda publicado por no haber leído.
 */
export function CartaManager({ config, base }: { config: ConfigCarta; base: string }) {
  const router = useRouter();
  const [state, formAction, enviando] = useActionState(guardarCarta, {});

  const [slug, setSlug] = useState(config.slug ?? '');
  const [activa, setActiva] = useState(config.activa);
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const url = slug ? `${base}/carta/${slug}` : '';

  // El QR se dibuja en el navegador: no hace falta pedirle la imagen a nadie.
  useEffect(() => {
    if (!url || !activa) {
      setQr(null);
      return;
    }
    let vivo = true;
    QRCode.toDataURL(url, { width: 720, margin: 2, errorCorrectionLevel: 'M' })
      .then((d) => vivo && setQr(d))
      .catch(() => vivo && setQr(null));
    return () => {
      vivo = false;
    };
  }, [url, activa]);

  useEffect(() => {
    if (state.error) toast('No se pudo guardar', { description: state.error });
    if (state.ok) {
      toast.success(activa ? 'Tu carta está publicada' : 'Tu carta quedó oculta');
      router.refresh();
    }
    // `activa` a propósito fuera: el aviso habla del guardado, no de cada clic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast('No pudimos copiar', { description: 'Selecciona el link y cópialo a mano.' });
    }
  }

  function descargarQR() {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr;
    a.download = `carta-${slug || 'negocio'}.png`;
    a.click();
  }

  if (config.faltaMigracion) {
    return (
      <div className="rounded-3xl bg-[var(--utilidad)]/10 p-6 text-center">
        <p className="font-semibold text-[var(--utilidad)]">Falta un paso en la base de datos</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Para usar la carta digital hay que correr la migración{' '}
          <code className="rounded bg-secondary px-1.5 py-0.5">017_carta_publica.sql</code> en
          Supabase. Todo lo demás de la app sigue funcionando normal.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Interruptor + link ── */}
      <form action={formAction} className="space-y-5 rounded-3xl bg-card p-5 shadow-sm">
        <input type="hidden" name="activa" value={activa ? 'true' : 'false'} />

        <button
          type="button"
          onClick={() => setActiva((a) => !a)}
          className="flex w-full items-center gap-4 text-left"
        >
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
              activa ? 'bg-[var(--ingreso)]/15 text-[var(--ingreso)]' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {activa ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              {activa ? 'Tu carta está visible' : 'Tu carta está oculta'}
            </span>
            <span className="block text-sm text-muted-foreground">
              {activa
                ? 'Cualquiera con el link puede ver tus platos y precios.'
                : 'Nadie puede verla. Enciéndela para publicarla.'}
            </span>
          </span>
          <span
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              activa ? 'bg-[var(--ingreso)]' : 'bg-border'
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                activa ? 'left-6' : 'left-1'
              }`}
            />
          </span>
        </button>

        <div className="space-y-2">
          <Label htmlFor="slug">El link de tu carta</Label>
          <div className="flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2">
            <span className="shrink-0 text-sm text-muted-foreground">/carta/</span>
            <Input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => setSlug(aSlug(e.target.value))}
              placeholder="mi-negocio"
              className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Solo letras, números y guiones. Si lo dejas vacío lo armamos con el nombre de tu
            negocio.
          </p>
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={enviando}
          className="h-12 w-full rounded-2xl gap-2"
        >
          {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
          {activa ? 'Publicar mi carta' : 'Guardar y dejarla oculta'}
        </Button>
      </form>

      {/* ── QR + link, solo cuando ya está publicada de verdad ── */}
      {config.activa && config.slug && (
        <div className="space-y-5 rounded-3xl bg-card p-5 shadow-sm">
          <div>
            <p className="font-semibold">El QR para tus mesas</p>
            <p className="text-sm text-muted-foreground">
              Descárgalo, imprímelo y pégalo en cada mesa. El cliente lo escanea con la cámara y ve
              tu carta.
            </p>
          </div>

          <div className="flex flex-col items-center gap-4">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt="Código QR de tu carta"
                className="h-52 w-52 rounded-2xl bg-white p-3 shadow-sm"
              />
            ) : (
              <div className="flex h-52 w-52 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                <QrIcon className="h-16 w-16" />
              </div>
            )}

            <div className="flex w-full flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={descargarQR}
                disabled={!qr}
                className="h-12 flex-1 rounded-2xl gap-2"
              >
                <Download className="h-4 w-4" /> Descargar el QR
              </Button>
              <a
                href={`${base}/carta/${config.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <Button type="button" variant="outline" className="h-12 w-full rounded-2xl gap-2">
                  <ExternalLink className="h-4 w-4" /> Ver mi carta
                </Button>
              </a>
            </div>
          </div>

          <button
            type="button"
            onClick={copiar}
            className="flex w-full items-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-left text-sm"
          >
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{url}</span>
            {copiado ? (
              <Check className="h-4 w-4 shrink-0 text-[var(--ingreso)]" />
            ) : (
              <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </button>
        </div>
      )}

      {/* ── Qué sale y qué no ── */}
      <ListaProductos productos={config.productos} />
    </div>
  );
}

/**
 * Qué productos salen en la carta. Existe porque casi todo negocio vende cosas
 * que NO son parte de la carta —domicilio, bolsa, desechables— y verlas
 * impresas al lado de los platos queda mal.
 */
function ListaProductos({ productos }: { productos: ConfigCarta['productos'] }) {
  const router = useRouter();
  const [guardando, startGuardar] = useTransition();
  const [cambiando, setCambiando] = useState<string | null>(null);

  if (productos.length === 0) {
    return (
      <div className="rounded-3xl bg-card p-6 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">
          Todavía no tienes productos. Cárgalos y aparecerán aquí para elegir cuáles van en la
          carta.
        </p>
      </div>
    );
  }

  const fuera = productos.filter((p) => !p.enCarta).length;

  function alternar(id: string, valor: boolean) {
    setCambiando(id);
    startGuardar(async () => {
      const res = await alternarProductoEnCarta(id, valor);
      if (!res.ok) toast('No se pudo guardar', { description: res.error });
      else router.refresh();
      setCambiando(null);
    });
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-card shadow-sm">
      <header className="border-b p-5">
        <p className="font-semibold">Qué se ve en tu carta</p>
        <p className="text-sm text-muted-foreground">
          {fuera === 0
            ? 'Salen todos tus productos. Apaga los que no quieras mostrar.'
            : `${fuera} producto${fuera === 1 ? '' : 's'} no se ${fuera === 1 ? 'muestra' : 'muestran'}.`}
        </p>
      </header>

      <ul className="divide-y divide-border">
        {productos.map((p) => (
          <li key={p.id} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className={`truncate font-medium ${p.enCarta ? '' : 'text-muted-foreground'}`}>
                {p.nombre}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">{formatCOP(p.precio)}</p>
            </div>

            <button
              type="button"
              onClick={() => alternar(p.id, !p.enCarta)}
              disabled={guardando && cambiando === p.id}
              aria-label={p.enCarta ? `Ocultar ${p.nombre}` : `Mostrar ${p.nombre}`}
              className={`flex h-11 items-center gap-2 rounded-xl px-3 text-sm transition-colors disabled:opacity-50 ${
                p.enCarta
                  ? 'bg-[var(--ingreso)]/10 text-[var(--ingreso)]'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              {guardando && cambiando === p.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : p.enCarta ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
              {p.enCarta ? 'Se ve' : 'Oculto'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
