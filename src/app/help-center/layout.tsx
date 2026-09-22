import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support & Help Center | Voiceflow Retail OS',
  description: 'Get the support you need to run your retail business efficiently. Access documentation, tutorials, and common FAQ for the Voiceflow platform.',
  alternates: {
    canonical: '/help-center'
  },
  openGraph: {
    title: 'Voiceflow Help Center - Resources for Retail Success',
    description: 'Need help with Voiceflow? Our support team and documentation are here to guide you through inventory management, POS setup, and more.',
  }
};

export default function HelpCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
