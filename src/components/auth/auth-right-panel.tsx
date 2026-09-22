import React from 'react';
import Image from 'next/image';

export default function AuthRightPanel() {
  return (
    <div className="hidden lg:flex flex-col bg-otter-bg h-full w-full items-center justify-center p-12 relative border-l border-gray-100">
      <div className="max-w-md text-center">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-sm bg-gray-200">
               <Image src="/signup-video-2-poster.jpg" alt="Megan Huynh" width={48} height={48} className="object-cover w-full h-full" />
            </div>
            <div className="text-left">
              <h4 className="font-bold text-gray-900 text-sm">Megan Huynh</h4>
              <p className="text-gray-500 text-xs">Product Manager</p>
            </div>
          </div>
          
          <p className="text-gray-500 text-sm font-medium leading-relaxed italic">
            "VoiceFlow has really boosted my confidence in my work because now I know that every user interview I conduct is stored somewhere for me always to look back to."
          </p>
        </div>

        <div className="mt-16 pt-8 border-t border-gray-200/60 w-full max-w-xs mx-auto">
          <p className="text-xs font-bold text-gray-800 mb-6 uppercase tracking-wider">Featured on:</p>
          <div className="flex flex-wrap justify-center gap-6 opacity-60">
            {/* Using text placeholders since we don't have the SVGs. Will render robust generic text for logos */}
            <span className="font-serif font-bold text-sm tracking-tight text-black">The New York Times</span>
            <span className="font-sans font-black text-sm tracking-tighter text-black">TechCrunch</span>
            <span className="font-sans font-bold text-sm tracking-tighter text-black italic">FAST<span className="font-light">COMPANY</span></span>
            <span className="font-mono font-bold text-sm text-black">WIRED</span>
            <span className="font-sans font-black text-sm text-black">Mashable</span>
          </div>
        </div>
      </div>
    </div>
  );
}
