import '@/app/global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import { Geist, Geist_Mono } from 'next/font/google';
import { HomeLayout } from '@/components/layout/home';
import { baseOptions } from '@/lib/layout.shared';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen">
        <RootProvider
          search={{
            links: [
              ['Getting Started with Workflows', '/docs/getting-started'],
              ['Concepts', '/docs/foundations/concepts'],
              [
                'Control Flow Patterns',
                '/docs/foundations/control-flow-patterns',
              ],
              ['Errors & Retries', '/docs/foundations/errors-and-retries'],
              ['Workflow Functions', '/docs/how-it-works/workflow-functions'],
              ['Step Functions', '/docs/how-it-works/step-functions'],
              ['API Reference', '/docs/api-reference'],
            ],
          }}
        >
          <HomeLayout
            {...baseOptions()}
            links={[
              {
                text: 'Docs',
                url: '/docs/introduction',
                secondary: false,
              },
              {
                text: 'Examples',
                url: '/examples',
                secondary: false,
              },
            ]}
          >
            {children}
          </HomeLayout>
        </RootProvider>
      </body>
    </html>
  );
}
