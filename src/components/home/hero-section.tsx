import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { InteractiveGrid } from '@/components/interactive-grid';

export default function HeroSection() {
    return (
        <section 
            className="bg-transparent lg:pt-48 lg:pb-32 w-full max-w-none mr-auto ml-auto pt-40 pr-6 pb-24 pl-6 relative overflow-hidden bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url('/hero-bg.png')" }}
        >
            {/* Overlay to ensure text readability against the sunset image */}
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-0"></div>
            {/* Background Effects */}
            <InteractiveGrid />
            <div className="aura-background"></div>

            <div className="max-w-5xl mx-auto relative z-10 text-center">
                {/* Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 backdrop-blur-md border border-gray-200/50 text-sm font-medium text-otter-blue mb-8 shadow-sm hover:bg-white/80 transition-all cursor-default">
                    <span className="flex h-2 w-2 rounded-full bg-otter-blue animate-pulse"></span>
                    <span>VoiceFlow is now available for Windows</span>
                </div>

                {/* Text Content */}
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-otter-dark tracking-tight leading-[1.1] mb-8 drop-shadow-sm">
                    Get an AI meeting assistant that <span className="text-transparent bg-clip-text bg-gradient-to-r from-otter-blue to-purple-600">records audio, writes notes</span>, automatically captures slides, and generates summaries.
                </h1>
                
                <p className="text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto font-medium leading-relaxed">
                    Focus on the conversation, not the notes. VoiceFlow joins your meetings and does the work for you—without inviting an awkward bot.
                </p>
                
                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Button asChild size="lg" className="w-full sm:w-auto h-14 px-10 text-lg rounded-full bg-otter-blue hover:bg-blue-700 text-white font-semibold transition-all hover:scale-105 shadow-lg shadow-blue-500/30">
                        <Link href="/signup">Start for Free</Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="w-full sm:w-auto h-14 px-10 text-lg rounded-full border-2 border-gray-300 text-otter-dark bg-white/50 backdrop-blur-sm hover:bg-white font-semibold transition-all">
                        <Link href="/contact">Book a Demo</Link>
                    </Button>
                </div>
                
                {/* Abstract Visual / Minimal UI representation instead of a specific image */}
                <div className="mt-20 relative max-w-4xl mx-auto perspective-normal">
                    <div className="relative rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-4 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/40 to-white/10 opacity-50"></div>
                        <div className="aspect-[21/9] rounded-xl bg-slate-900 overflow-hidden shadow-inner relative flex items-center justify-center">
                            {/* Abstract Audio Waves */}
                            <div className="flex items-center gap-2">
                                {[...Array(12)].map((_, i) => (
                                    <div 
                                        key={i} 
                                        className="w-3 bg-otter-blue rounded-full opacity-80"
                                        style={{
                                            height: `${Math.max(20, Math.random() * 100)}px`,
                                            animation: `pulse ${1 + Math.random()}s infinite alternate ease-in-out`
                                        }}
                                    ></div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
