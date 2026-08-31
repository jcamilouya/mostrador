import { redirect } from 'next/navigation';
import { getSesion } from '@/lib/auth/sesion';
import { Sidebar } from '@/components/shared/Sidebar';
import { BottomNav } from '@/components/shared/BottomNav';
import { RealtimeRefresher } from '@/components/shared/RealtimeRefresher';
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

  const nombreEmpresa = sesion.empresaNombre;
  const plan = await getPlanInfo(sesion.empresaId);
  const esAdmin = isSuperAdminEmail(sesion.email ?? undefined);

  return (
    <div className="flex min-h-screen bg-background">
      <RealtimeRefresher empresaId={sesion.empresaId} />
      <Sidebar negocio={nombreEmpresa} esAdmin={esAdmin} />
      <div className="flex flex-1 flex-col pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        {sesion.modoPractica && <BannerPractica />}
        <PlanBanner plan={plan} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
      <BottomNav esAdmin={esAdmin} categoria={sesion.empresaCategoria} />
    </div>
  );
}
