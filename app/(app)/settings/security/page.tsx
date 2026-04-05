import MfaSettingsCard from '@/components/security/MfaSettingsCard';
import PasswordSettingsCard from '@/components/security/PasswordSettingsCard';

export default function SecuritySettingsPage() {
  return (
    <section className="space-y-4">
      <PasswordSettingsCard />
      <MfaSettingsCard />
    </section>
  );
}
