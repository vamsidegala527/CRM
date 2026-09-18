import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HR & Employee Management Portal',
  description: 'Enterprise HR/Admin and Employee Management Portal with Python FastAPI REST API backend and PostgreSQL database.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <main>{children}</main>
      </body>
    </html>
  );
}

