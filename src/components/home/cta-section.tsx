import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function CtaSection() {
    return (
        <section className="bg-otter-blue py-24 px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center">
                <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
                    Ready to upgrade your meetings?
                </h2>
                <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
                    Get started for free today and experience the difference of having an AI assistant that never misses a beat.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Button asChild size="lg" className="w-full sm:w-auto h-14 px-8 text-lg rounded-full bg-white text-otter-blue hover:bg-gray-100 font-bold transition-colors">
                        <Link href="/signup">Start for Free</Link>
                    </Button>
                    <p className="text-blue-200 text-sm mt-4 sm:mt-0 sm:ml-4">
                        No credit card required.
                    </p>
                </div>
            </div>
        </section>
    );
}
