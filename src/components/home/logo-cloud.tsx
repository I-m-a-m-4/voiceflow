export default function LogoCloud() {
    // Placeholder logos using plain text for now, could be replaced with actual SVG components or Images
    const logos = [
        "IBM", "Zoom", "Dropbox", "UCLA", "TechCrunch", "Forbes"
    ];

    return (
        <section className="bg-white py-12 border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-6 lg:px-8">
                <p className="text-center text-sm font-semibold text-gray-500 uppercase tracking-widest mb-8">
                    Trusted by forward-thinking companies and teams
                </p>
                <div className="flex flex-wrap justify-center gap-8 md:gap-16 items-center opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                    {logos.map((logo, index) => (
                        <div key={index} className="text-xl md:text-2xl font-bold text-gray-400 hover:text-otter-blue transition-colors">
                            {logo}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
