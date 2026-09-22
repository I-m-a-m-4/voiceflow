import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Careers | Join the Voiceflow Team',
  description: 'Explore career opportunities at Voiceflow. Join our mission to build the future of borderless retail operating systems and POS technologies.',
  alternates: {
    canonical: '/careers'
  },
  openGraph: {
    title: 'Work at Voiceflow - Open Roles and Opportunities',
    description: 'Join a high-performance team engineering the modern retail OS for merchants across Africa and globally.',
  }
};

export default function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
