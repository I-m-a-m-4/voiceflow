import { Metadata } from 'next';

// page.tsx is a client component, so metadata has to live in a layout. Without
// this the route inherited the root layout's metadata and, until it was removed,
// a canonical pointing at the homepage.
export const metadata: Metadata = {
  title: 'Setup Guides & Tutorials | Voiceflow Help Center',
  description: 'Step-by-step guides for setting up Voiceflow: importing inventory, configuring your POS, adding staff roles, launching a storefront, and running offline.',
  alternates: {
    canonical: '/help-center/guides'
  },
  openGraph: {
    title: 'Voiceflow Setup Guides & Tutorials',
    description: 'Everything you need to get Voiceflow running: inventory imports, POS configuration, staff permissions, and offline mode.',
    type: 'website',
  },
};

export default function GuidesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
