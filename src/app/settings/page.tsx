import { getSettings } from '@/lib/settings';
import SettingsForm from './components/SettingsForm';
import PageContainer from '@/components/PageContainer';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ searchParams }: { searchParams: { success?: string } }) {
  const settings = getSettings();
  const success = searchParams.success;

  return (
    <PageContainer scrollable>
      {success && (
        <div className="mb-6 p-4 bg-emerald-950/30 border border-emerald-500/30 text-emerald-400 rounded-lg">
          Configurações salvas com sucesso.
        </div>
      )}
      <SettingsForm settings={settings} />
    </PageContainer>
  );
}
