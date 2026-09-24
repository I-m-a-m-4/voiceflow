import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Careers | Join the Voiceflow Team',
  description: 'Explore career opportunities at Voiceflow. Join our mission to build the world’s best undetectable AI meeting assistant and real-time intelligence co-pilot.',
  alternates: {
    canonical: '/careers'
  },
  openGraph: {
    title: 'Work at Voiceflow - Open Roles and Opportunities',
    description: 'Join a high-performance team engineering live AI speech transcription and stealth meeting intelligence.',
  }
};

export default function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
