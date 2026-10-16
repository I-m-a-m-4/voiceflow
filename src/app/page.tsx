import { Metadata } from 'next';
import HomeClient from './home-client';

export const metadata: Metadata = {
    alternates: {
        canonical: '/'
    },
    title: 'Voiceflow | AI Meeting Notetaker & Real-Time Speech Co-Pilot',
    description: 'Voiceflow takes automated meeting notes and delivers private real-time speech assistance with Presenter Privacy Shield.',
};

export default function Home() {
    return <HomeClient />;
}
