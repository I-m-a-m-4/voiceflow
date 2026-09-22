
import { Metadata } from 'next';
import PricingContent from './pricing-content';

export const metadata: Metadata = {
  title: 'Pricing Plans | Voiceflow POS & Inventory Management',
  description: 'Choose the perfect plan for your retail business. Start free forever with our Starter plan — no trial, no credit card — or scale with Pro and Business features.',
  openGraph: {
    title: 'Voiceflow Pricing - Scale Your Retail Business',
    description: 'Affordable, high-fidelity inventory management and POS software tailored for Nigerian retailers.',
    url: 'https://voiceflow.space/pricing',
    siteName: 'Voiceflow',
    images: [
      {
        url: 'https://voiceflow.space/herolytics.svg',
        width: 1200,
        height: 630,
        alt: 'Voiceflow Pricing Plans',
      },
    ],
    locale: 'en_NG',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Voiceflow Pricing - Scale Your Retail Business',
    description: 'Start for free and automate your retail operations today.',
    images: ['https://voiceflow.space/herolytics.svg'],
  },
};

export default function Page() {
  return <PricingContent />;
}
