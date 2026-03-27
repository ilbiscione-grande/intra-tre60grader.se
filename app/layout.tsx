import type { Metadata, Viewport } from 'next';
import MobileOrientationGuard from '@/components/providers/MobileOrientationGuard';
import ToastProvider from '@/components/providers/ToastProvider';
import { AppPreferencesProvider } from '@/components/providers/AppPreferencesProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Projectify + Bookie',
  description: 'Kombinerad arbetsyta för projekt och ekonomi',
  manifest: '/manifest.webmanifest'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <AppPreferencesProvider>
          <MobileOrientationGuard />
          {children}
          <ToastProvider />
        </AppPreferencesProvider>
      </body>
    </html>
  );
}
