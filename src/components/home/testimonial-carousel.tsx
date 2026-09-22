import { Star } from 'lucide-react';

export default function TestimonialCarousel() {
    const testimonials = [
        {
            quote: "VoiceFlow has completely transformed how our team handles meetings. The summaries are incredibly accurate, and not having a bot in the call makes a huge difference.",
            author: "Sarah Jenkins",
            role: "Product Manager, TechCorp",
            rating: 5
        },
        {
            quote: "The transcription speed is unmatched. I can dictate entire documents directly into Word, and it's practically flawless.",
            author: "David Chen",
            role: "Freelance Writer",
            rating: 5
        },
        {
            quote: "Finally, a meeting tool that actually works on Windows without being clunky. The integration is seamless.",
            author: "Elena Rodriguez",
            role: "Sales Director",
            rating: 5
        }
    ];

    return (
        <section className="py-24 bg-otter-bg border-y border-gray-100">
            <div className="max-w-7xl mx-auto px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold text-otter-dark mb-4">
                        Loved by professionals everywhere
                    </h2>
                    <p className="text-lg text-gray-600">
                        Join thousands of teams who have upgraded their meeting experience.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {testimonials.map((testimonial, index) => (
                        <div key={index} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full">
                            <div className="flex gap-1 mb-6">
                                {[...Array(testimonial.rating)].map((_, i) => (
                                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                                ))}
                            </div>
                            <blockquote className="text-lg text-otter-dark mb-8 flex-grow">
                                "{testimonial.quote}"
                            </blockquote>
                            <div>
                                <div className="font-bold text-otter-dark">{testimonial.author}</div>
                                <div className="text-sm text-gray-500">{testimonial.role}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
