import Link from 'next/link';
import MfaSettingsCard from '@/components/security/MfaSettingsCard';
import PasswordSettingsCard from '@/components/security/PasswordSettingsCard';
import SettingsTabs from '@/components/settings/SettingsTabs';

export default function SecuritySettingsPage() {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Inställningar</h1>
        <p className="text-sm text-muted-foreground">Säkerhet finns nu även som egen flik under inställningar.</p>
      </div>
      <SettingsTabs />
      <p className="text-sm text-muted-foreground">
        Du kan också öppna samma innehåll via <Link href="/settings?tab=security" className="underline">Säkerhet</Link> i flikraden.
      </p>
      <PasswordSettingsCard />
      <MfaSettingsCard />
    </section>
  );
}
