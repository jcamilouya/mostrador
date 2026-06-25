import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/shared/Sidebar';
import { BottomNav } from '@/components/shared/BottomNav';
import { RealtimeRefresher } from '@/components/shared/RealtimeRefresher';
import { PlanBanner } from '@/components/plan/PlanBanner';
import { getPlanInfo } from '@/lib/plan/queries';
import { isSuperAdminEmail } from '@/lib/admin/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id, nombre, empresas (nombre)')
    .eq('id', user.id)
    .maybeSingle();

  if (!usuario?.empresa_id) redirect('/onboarding');

  const empresa = Array.isArray(usuario.empresas)
    ? usuario.empresas[0]
    : usuario.empresas;
  const nombreEmpresa = (empresa as { nombre?: string } | null)?.nombre ?? 'Mi negocio';

  const plan = await getPlanInfo(usuario.empresa_id);
  const esAdmin = isSuperAdminEmail(user.email);

  return (
    <div className="flex min-h-screen bg-background">
      <RealtimeRefresher empresaId={usuario.empresa_id} />
      <Sidebar negocio={nombreEmpresa} esAdmin={esAdmin} />
      <div className="flex flex-1 flex-col pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        <PlanBanner plan={plan} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
      <BottomNav esAdmin={esAdmin} />
    </div>
  );
}
