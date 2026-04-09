import type { Metadata } from 'next';
import { SupabaseAuthProvider } from '@/components/auth/SupabaseAuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lovart',
  description: 'AI-powered design canvas with image, video, and project workflows.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
      </body>
    </html>
  );
}
