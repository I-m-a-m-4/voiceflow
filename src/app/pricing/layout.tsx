import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing Plans | Voiceflow AI Notetaker',
  description: 'Explore transparent pricing for Voiceflow AI Notetaker & Stealth Co-Pilot. From Free Starter to Pro & Team plans.',
  alternates: {
    canonical: '/pricing'
  },
  openGraph: {
    title: 'Voiceflow Pricing - Flexible Plans for AI Meeting Intelligence',
    description: 'Start for free or upgrade to Pro for unlimited meeting transcriptions, real-time stealth Q&A, and screen analysis.',
  }
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
