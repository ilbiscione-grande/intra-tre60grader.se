import type { Metadata } from 'next';
import ToastProvider from '@/components/providers/ToastProvider';
import { AppPreferencesProvider } from '@/components/providers/AppPreferencesProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Projectify + Bookie',
  description: 'Kombinerad arbetsyta för projekt och ekonomi',
  manifest: '/manifest.webmanifest'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <AppPreferencesProvider>
          {children}
          <ToastProvider />
        </AppPreferencesProvider>
      </body>
    </html>
  );
}
