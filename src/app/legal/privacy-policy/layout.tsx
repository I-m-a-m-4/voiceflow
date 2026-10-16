import { Metadata } from 'next';

// page.tsx is a client component, so metadata has to live in a layout.
export const metadata: Metadata = {
  title: 'Privacy Policy | Voiceflow AI Meeting Notetaker',
  description: 'How Voiceflow collects, processes, and protects your meeting audio, transcripts, and notes, including our Presenter Privacy Shield and your data deletion rights.',
  alternates: {
    canonical: '/legal/privacy-policy'
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPolicyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
