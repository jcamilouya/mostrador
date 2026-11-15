'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { KeyRound, Loader2, Plus, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  borrarPersona,
  cambiarActivo,
  cambiarClave,
  cambiarRol,
  crearPersona,
  guardarMeseroCobra,
} from '@/lib/equipo/actions';
import type { Persona } from '@/lib/equipo/queries';
import { aSlug } from '@/lib/carta/slug';
import { NOMBRE_ROL } from '@/lib/auth/roles';

type Resultado = { ok: true } | { ok: false; error: string };

export function EquipoManager({
  equipo,
  sufijo,
  meseroCobra,
}: {
  equipo: Persona[];
  sufijo: string;
  meseroCobra: boolean;
}) {
  const router = useRouter();
  const [ocupado, start] = useTransition();
  const [nueva, setNueva] = useState(false);
  const [clavePara, setClavePara] = useState<Persona | null>(null);

  function correr(fn: () => Promise<Resultado>, exito: string, despues?: () => void) {
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(exito);
      despues?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {equipo.length === 0
            ? 'Todavía no has agregado a nadie.'
            : `${equipo.length} ${equipo.length === 1 ? 'persona' : 'personas'}`}
        </p>
        <Button className="h-11 rounded-2xl gap-2" onClick={() => setNueva(true)}>
          <Plus className="h-4 w-4" /> Agregar persona
        </Button>
      </div>

      <ul className="space-y-2">
        {equipo.map((p) => (
          <li
            key={p.id}
            className={`flex flex-wrap items-center gap-3 rounded-2xl bg-card p-4 shadow-sm ${p.activo ? '' : 'opacity-60'}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-secondary">
              <UserRound className="h-5 w-5 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.nombre}</p>
              <p className="truncate text-xs text-muted-foreground">
                Usuario: <span className="font-mono">{p.usuario ?? '—'}</span>
                {!p.activo && ' · desactivado'}
              </p>
            </div>
            <div className="flex rounded-xl bg-secondary p-0.5">
              {(['mesero', 'caja'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={ocupado}
                  aria-pressed={p.rol === r}
                  onClick={() => p.rol !== r && correr(() => cambiarRol(p.id, r), `${p.nombre} ahora es ${NOMBRE_ROL[r].toLowerCase()}`)}
                  className={`rounded-[10px] px-3 py-1.5 text-xs font-medium ${
                    p.rol === r ? 'bg-background shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {NOMBRE_ROL[r]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl gap-1.5"
                disabled={ocupado}
                onClick={() => setClavePara(p)}
              >
                <KeyRound className="h-3.5 w-3.5" /> Contraseña
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl"
                disabled={ocupado}
                onClick={() =>
                  correr(
                    () => cambiarActivo(p.id, !p.activo),
                    p.activo ? `${p.nombre} ya no puede entrar` : `${p.nombre} puede entrar de nuevo`,
                  )
                }
              >
                {p.activo ? 'Desactivar' : 'Activar'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Borrar a ${p.nombre}`}
                className="rounded-xl text-muted-foreground hover:text-[var(--egreso)]"
                disabled={ocupado}
                onClick={() => {
                  if (!confirm(`¿Borrar a ${p.nombre}? Ya no podrá entrar.`)) return;
                  correr(() => borrarPersona(p.id), `${p.nombre} borrado`);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {/* Permiso: ¿el mesero cobra? */}
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-card p-4 shadow-sm">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-foreground"
          defaultChecked={meseroCobra}
          disabled={ocupado}
          onChange={(e) =>
            correr(
              () => guardarMeseroCobra(e.target.checked),
              e.target.checked ? 'Los meseros ya pueden cobrar' : 'Ahora solo la caja cobra',
            )
          }
        />
        <span>
          <span className="block font-medium">Los meseros también pueden cobrar</span>
          <span className="text-sm text-muted-foreground">
            Apagado, el mesero pide la cuenta y la caja cobra. Útil si el mesero lleva datáfono o
            recibe efectivo en la mesa.
          </span>
        </span>
      </label>

      <NuevaPersona
        abierta={nueva}
        sufijo={sufijo}
        ocupado={ocupado}
        onCerrar={() => setNueva(false)}
        onCrear={(datos) =>
          correr(() => crearPersona(datos), `${datos.nombre} ya puede entrar con "${datos.usuario}"`, () =>
            setNueva(false),
          )
        }
      />

      <Dialog open={Boolean(clavePara)} onOpenChange={(o) => !o && setClavePara(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>Nueva contraseña para {clavePara?.nombre}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const clave = String(new FormData(e.currentTarget).get('clave') ?? '');
              if (clavePara) correr(() => cambiarClave(clavePara.id, clave), 'Contraseña cambiada', () => setClavePara(null));
            }}
          >
            <Input name="clave" type="text" minLength={6} required placeholder="Mínimo 6 caracteres" className="h-12 rounded-2xl" />
            <Button type="submit" className="h-12 w-full rounded-2xl" disabled={ocupado}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NuevaPersona({
  abierta,
  sufijo,
  ocupado,
  onCerrar,
  onCrear,
}: {
  abierta: boolean;
  sufijo: string;
  ocupado: boolean;
  onCerrar: () => void;
  onCrear: (d: { nombre: string; rol: 'mesero' | 'caja'; usuario: string; clave: string }) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [tocado, setTocado] = useState(false);
  const [rol, setRol] = useState<'mesero' | 'caja'>('mesero');
  const [clave, setClave] = useState('');

  // Usuario sugerido desde el nombre ("Carlos Pérez" → carlos.sabore) hasta
  // que la persona lo edite a mano.
  const sugerido = `${aSlug(nombre).split('-')[0] ?? ''}.${sufijo}`;
  const usuarioFinal = tocado ? usuario : nombre.trim() ? sugerido : '';

  return (
    <Dialog
      open={abierta}
      onOpenChange={(o) => {
        if (!o) {
          onCerrar();
          setNombre('');
          setUsuario('');
          setTocado(false);
          setClave('');
        }
      }}
    >
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>Agregar persona</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onCrear({ nombre: nombre.trim(), rol, usuario: usuarioFinal, clave });
          }}
        >
          <Input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre (ej: Carlos)"
            className="h-12 rounded-2xl"
            maxLength={60}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            {(['mesero', 'caja'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRol(r)}
                className={`h-12 rounded-2xl text-sm font-medium ${
                  rol === r ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'
                }`}
              >
                {NOMBRE_ROL[r]}
              </button>
            ))}
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Usuario para entrar</span>
            <Input
              value={usuarioFinal}
              onChange={(e) => {
                setTocado(true);
                setUsuario(e.target.value.toLowerCase().replace(/\s+/g, ''));
              }}
              placeholder={`carlos.${sufijo}`}
              className="h-12 rounded-2xl font-mono"
              autoCapitalize="none"
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Contraseña</span>
            <Input
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              type="text"
              minLength={6}
              placeholder="Mínimo 6 caracteres"
              className="h-12 rounded-2xl"
              required
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Entra en la misma página de inicio de sesión, escribiendo el usuario en vez del correo.
          </p>
          <Button type="submit" className="h-12 w-full rounded-2xl" disabled={ocupado}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear cuenta'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
