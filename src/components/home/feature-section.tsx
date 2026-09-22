import { Mic, FileText, Bot, Zap, Globe, MessageSquare } from 'lucide-react';
import Image from 'next/image';

export default function FeatureSection() {
    const features = [
        {
            title: "AI Meeting Assistant",
            description: "Record audio, write notes, automatically capture slides, and generate summaries for every meeting.",
            icon: Bot,
            color: "text-otter-blue",
            bgColor: "bg-otter-light"
        },
        {
            title: "Automated Summaries",
            description: "Get a high-level summary of your meeting in seconds, with key takeaways and action items.",
            icon: FileText,
            color: "text-purple-600",
            bgColor: "bg-purple-100"
        },
        {
            title: "Real-time Captions",
            description: "Follow along with live transcription that identifies who is speaking, as they speak.",
            icon: MessageSquare,
            color: "text-green-600",
            bgColor: "bg-green-100"
        }
    ];

    return (
        <section className="py-24 bg-white relative">
            <div className="max-w-7xl mx-auto px-6 lg:px-8">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold text-otter-dark mb-6">
                        More than just notes. It's your AI sidekick.
                    </h2>
                    <p className="text-lg text-gray-600">
                        VoiceFlow works where you work, integrating with Zoom, Google Meet, and Microsoft Teams to make every conversation more productive.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {features.map((feature, index) => (
                        <div key={index} className="group p-8 rounded-2xl bg-gray-50 hover:bg-white hover:shadow-xl border border-transparent hover:border-gray-100 transition-all duration-300">
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${feature.bgColor} ${feature.color}`}>
                                <feature.icon size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-otter-dark mb-4">{feature.title}</h3>
                            <p className="text-gray-600 leading-relaxed mb-6">{feature.description}</p>
                            <a href="#" className="inline-flex items-center text-otter-blue font-semibold group-hover:underline">
                                Learn more
                                <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
                            </a>
                        </div>
                    ))}
                </div>

                {/* Integration Banner */}
                <div className="mt-20 bg-otter-dark rounded-3xl p-8 md:p-12 overflow-hidden relative isolate">
                    <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-otter-blue/30 via-otter-dark to-otter-dark"></div>
                    <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div>
                            <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                                Seamless Integration
                            </h3>
                            <p className="text-gray-300 mb-8 text-lg">
                                Connect VoiceFlow to your calendar and let it automatically join your meetings. No bots required with our native Windows integration.
                            </p>
                            <div className="flex gap-4">
                                <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center font-bold text-blue-500 text-xl">Z</div>
                                <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center font-bold text-green-500 text-xl">M</div>
                                <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center font-bold text-purple-600 text-xl">T</div>
                            </div>
                        </div>
                        <div className="relative aspect-video bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
                             {/* Placeholder for integration UI */}
                            <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                                Integration UI Preview
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
