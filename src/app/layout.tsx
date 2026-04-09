import type { Metadata } from 'next';
import { SupabaseAuthProvider } from '@/components/auth/SupabaseAuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Doodleverse',
  description: 'Doodleverse 让设计更简单。',
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
