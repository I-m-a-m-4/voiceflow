import { Metadata } from 'next';
import HomeClient from './home-client';

export const metadata: Metadata = {
    alternates: {
        canonical: '/'
    },
    title: 'Voiceflow | Undetectable AI Notetaker & Meeting Assistant',
    description: 'Voiceflow takes perfect meeting notes and gives real-time answers, all while completely undetectable.',
};

export default function Home() {
    return <HomeClient />;
}
