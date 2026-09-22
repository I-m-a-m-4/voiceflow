
import { Metadata } from 'next';
import ContactContent from './contact-content';

export const metadata: Metadata = {
  title: 'Contact Us | Voiceflow Operational Support',
  description: 'Need help scaling your retail business? Get in touch with our tactical support team for inquiries about our POS, inventory management, or enterprise solutions.',
  openGraph: {
    title: 'Contact Voiceflow - Tactical Support for Retailers',
    description: 'Reach out to the Voiceflow team for support, pricing inquiries, or partnership opportunities.',
    url: 'https://voiceflow.space/contact',
    images: [
      {
        url: 'https://voiceflow.space/herolytics.svg',
        width: 1200,
        height: 630,
        alt: 'Contact Voiceflow Support',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact Voiceflow Operational Support',
    description: 'We are here to assist with your retail mission.',
    images: ['https://voiceflow.space/herolytics.svg'],
  },
};

export default function Page() {
  return <ContactContent />;
}
