import { redirect } from 'next/navigation';
import { getSesion } from '@/lib/auth/sesion';
import { Sidebar } from '@/components/shared/Sidebar';
import { BottomNav } from '@/components/shared/BottomNav';
import { SignOutButton } from '@/components/shared/SignOutButton';
import { RealtimeRefresher } from '@/components/shared/RealtimeRefresher';
import { ImpresoraComandas } from '@/components/comandas/ImpresoraComandas';
import { PlanBanner } from '@/components/plan/PlanBanner';
import { BannerPractica } from '@/components/practica/BannerPractica';
import { getPlanInfo } from '@/lib/plan/queries';
import { isSuperAdminEmail } from '@/lib/admin/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Cacheado por request: la página que se renderiza dentro reusa esto mismo.
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  if (!sesion.empresaId) redirect('/onboarding');

  // El dueño desactivó a esta persona: no ve nada del negocio.
  if (!sesion.activo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-lg font-semibold">Tu acceso a {sesion.empresaNombre} está desactivado</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Si crees que es un error, habla con el dueño del negocio.
        </p>
        <SignOutButton />
      </div>
    );
  }

  const nombreEmpresa = sesion.empresaNombre;
  const plan = await getPlanInfo(sesion.empresaId);
  const esAdmin = isSuperAdminEmail(sesion.email ?? undefined);

  return (
    <div className="flex min-h-screen bg-background">
      <RealtimeRefresher empresaId={sesion.empresaId} />
      <ImpresoraComandas empresaId={sesion.empresaId} />
      <Sidebar negocio={nombreEmpresa} esAdmin={esAdmin} rol={sesion.rol} />
      <div className="flex flex-1 flex-col pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        {sesion.modoPractica && <BannerPractica />}
        <PlanBanner plan={plan} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
      <BottomNav esAdmin={esAdmin} categoria={sesion.empresaCategoria} rol={sesion.rol} />
    </div>
  );
}
