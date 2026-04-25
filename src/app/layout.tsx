import type { Metadata } from 'next';
import { SupabaseAuthProvider } from '@/components/auth/SupabaseAuthProvider';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
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
      <body className="antialiased bg-background text-foreground transition-colors">
        <ThemeProvider>
          <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
