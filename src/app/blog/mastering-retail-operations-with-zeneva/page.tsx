
import { Metadata } from 'next';
import MasteringVoiceflowClient from './mastering-retail-client';

export const metadata: Metadata = {
  title: 'Mastering Retail Operations: The Voiceflow Framework for Success | Voiceflow Blog',
  description: 'Scaling a retail business in modern Nigeria requires command over data, inventory shields, and multi-location management. Learn the five pillars of operational excellence.',
  alternates: {
    canonical: '/blog/mastering-retail-operations-with-voiceflow'
  },
  openGraph: {
    title: 'Mastering Retail Operations: The Voiceflow Framework for Success',
    description: 'The ultimate guide to scaling your retail business in Nigeria with the Voiceflow operational framework.',
    images: ['https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=2070&auto=format&fit=crop'],
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mastering Retail Operations: The Voiceflow Framework for Success',
    description: 'Transform your retail operations with the Voiceflow framework.',
    images: ['https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=2070&auto=format&fit=crop'],
  },
};

export default function Page() {
  return <MasteringVoiceflowClient />;
}
