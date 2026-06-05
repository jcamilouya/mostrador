import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

export const metadata: Metadata = {
  title: 'Configura tu negocio — Mostrador',
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ paso?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('id', user.id)
    .maybeSingle();

  if (usuario?.empresa_id) redirect('/dashboard');

  // dev helper: ?paso=2 o ?paso=3 para preview de pasos
  const { paso } = await searchParams;
  const initialPaso =
    process.env.NODE_ENV === 'development' && paso
      ? Math.min(3, Math.max(1, parseInt(paso, 10) || 1))
      : 1;

  return <OnboardingFlow defaultEmail={user.email ?? ''} initialPaso={initialPaso} />;
}
