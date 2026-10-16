'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const sections = [
  { id: 'intro', num: 'I', label: 'Introduction' },
  { id: 'collect', num: 'II', label: 'What We Collect' },
  { id: 'audio', num: 'III', label: 'Audio & Microphone Privacy' },
  { id: 'screen', num: 'IV', label: 'Presenter Privacy Shield' },
  { id: 'use', num: 'V', label: 'How We Use Your Data' },
  { id: 'ai-disclosure', num: 'VI', label: 'AI Processors & Disclosure' },
  { id: 'security', num: 'VII', label: 'Data Security & Encryption' },
  { id: 'rights', num: 'VIII', label: 'Your Rights & Deletion' },
  { id: 'contact', num: 'IX', label: 'Contact Us' },
];

export default function PrivacyPolicyPage() {
  const [activeSection, setActiveSection] = useState('intro');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0px -80% 0px' }
    );

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 selection:bg-orange-500/20">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 pb-12 pt-20 md:pb-16 md:pt-28">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
          <div 
            aria-hidden="true" 
            className="pointer-events-none absolute inset-0 opacity-50 dark:opacity-20" 
            style={{
              backgroundImage: 'linear-gradient(to right, rgba(249,115,22,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(249,115,22,0.1) 1px, transparent 1px)',
              backgroundSize: '44px 44px'
            }}
          />
        </div>
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 font-medium tracking-wide text-orange-600 dark:text-orange-400 backdrop-blur-sm text-sm uppercase">
              Compliance & Safety
            </span>
          </div>
          <h1 className="mx-auto mt-6 max-w-[680px] text-4xl font-bold tracking-tight sm:text-5xl">
            Voiceflow Privacy <span className="text-orange-500 italic">Policy</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[640px] text-base sm:text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            How Voiceflow collects, processes, and protects your meeting audio, live transcripts, and notes with end-to-end security and full user transparency.
          </p>
          <p className="mt-4 text-xs font-mono text-slate-500 dark:text-slate-400">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </section>

      {/* Main Content Layout */}
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-14">
          
          {/* Sidebar Navigation */}
          <aside className="min-w-0 lg:sticky lg:top-28 lg:self-start">
            {/* Mobile Horizontal Nav */}
            <nav aria-label="Page sections" className="-mx-6 max-w-[calc(100%+3rem)] overflow-x-auto px-6 pb-4 lg:hidden no-scrollbar">
              <div className="flex min-w-max gap-2">
                {sections.map(({ id, num, label }) => (
                  <Link
                    key={id}
                    href={`#${id}`}
                    className={`rounded-full border px-3.5 py-1.5 text-xs tracking-tight transition-colors whitespace-nowrap ${
                      activeSection === id 
                        ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400 font-semibold' 
                        : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-500 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="me-1.5 opacity-60 font-mono text-[11px]">{num}</span>
                    {label}
                  </Link>
                ))}
              </div>
            </nav>

            {/* Desktop Vertical Nav */}
            <nav aria-label="Page sections" className="hidden lg:flex flex-col border-l-2 border-slate-100 dark:border-slate-800/60">
              {sections.map(({ id, num, label }) => (
                <Link
                  key={id}
                  href={`#${id}`}
                  className={`group relative py-2 pl-4 pr-3 text-xs font-medium transition-colors ${
                    activeSection === id 
                      ? 'text-orange-500 font-semibold' 
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <span 
                    className={`absolute inset-y-0 left-[-2px] w-[2px] transition-all ${
                      activeSection === id ? 'bg-orange-500' : 'bg-transparent group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
                    }`} 
                  />
                  <span className="me-2 inline-block w-4 opacity-50 font-mono text-[10px]">{num}</span>
                  {label}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Content Area */}
          <div className="min-w-0 prose prose-slate dark:prose-invert max-w-none lg:prose-lg prose-headings:scroll-mt-28 prose-headings:font-bold prose-h2:text-2xl prose-h3:text-lg">
            
            {/* Section I: Introduction */}
            <div id="intro" className="scroll-mt-32">
              <h2>I. Introduction</h2>
              <p>
                Welcome to <strong>Voiceflow</strong> ("we," "our," or "the Service"), an intelligent <strong>AI Meeting Notetaker, Real-Time Speaking Assistant, and Executive Teleprompter</strong> designed to help professionals, teams, and executives capture meeting discussions, organize follow-up action items, and speak with confidence during live presentations and calls.
              </p>
              <p>
                We believe your private conversations, client calls, and meeting minutes belong exclusively to you. This Privacy Policy details our technical architecture, our strict zero-data-selling pledge, and how we handle microphone audio, screen display frames, and meeting transcripts in full compliance with international privacy standards and Microsoft Store developer policies.
              </p>

              <div className="not-prose my-6 p-4 rounded-xl border bg-orange-500/5 dark:bg-orange-950/20 border-orange-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 font-medium text-slate-800 dark:text-slate-200">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <div>
                    Voiceflow is operated by <strong>VOICEFLOWTECH SOLUTIONS</strong>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Registered Business Entity — BN: 9673520</div>
                  </div>
                </div>
                <div className="text-slate-600 dark:text-slate-400 font-mono text-[11px] bg-white dark:bg-slate-900 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-800">
                  support@voiceflow.space
                </div>
              </div>
            </div>

            {/* Section II: What We Collect */}
            <div id="collect" className="scroll-mt-28 mt-14 pt-8 border-t border-slate-100 dark:border-slate-800/50">
              <h2>II. What We Collect</h2>
              <p>
                To provide real-time speech-to-text transcription and structured meeting summaries, Voiceflow collects only the data necessary to deliver the Service:
              </p>
              
              <h3>A. Account Identification</h3>
              <p>
                When you create an account, we collect your name, email address, profile picture (if signing in via Google OAuth), and subscription tier. This information is used strictly to identify your workspace and authenticate access to your saved transcripts.
              </p>

              <h3>B. User-Initiated Meeting Content</h3>
              <p>
                When you explicitly click <em>"Start Voiceflow"</em> or dictate notes, the application processes:
              </p>
              <ul>
                <li><strong>Spoken Dialogue Audio:</strong> Microphone audio recorded in real-time during your active meeting session.</li>
                <li><strong>Generated Transcripts:</strong> Text transcripts derived from speech-to-text processing.</li>
                <li><strong>Executive Summaries & Action Items:</strong> AI-generated structured outlines, takeaways, and follow-up checklists.</li>
                <li><strong>Saved Q&A Assists:</strong> Specific prompt questions and answers generated during your meeting session.</li>
              </ul>

              <h3>C. Technical Device & Diagnostic Telemetry</h3>
              <p>
                We collect standard technical diagnostic information, including app version, OS platform (Windows, macOS, Web), and anonymous error logs to monitor stability and prevent crashes. We do not track keystrokes, personal browsing history, or background applications.
              </p>
            </div>

            {/* Section III: Audio & Microphone Privacy */}
            <div id="audio" className="scroll-mt-28 mt-14 pt-8 border-t border-slate-100 dark:border-slate-800/50">
              <h2>III. Audio & Microphone Privacy</h2>
              <p>
                Voiceflow treats audio data with the highest sensitivity:
              </p>
              <ul>
                <li><strong>Explicit User Activation:</strong> Voiceflow never listens or records in the background without your explicit action. The microphone is only active while the visual recording indicator (pulsing session timer) is displayed on your screen.</li>
                <li><strong>Local Voice Activity Detection (VAD):</strong> When you stop speaking for more than 2 seconds, Voiceflow automatically pauses stream processing locally to save bandwidth and prevent recording ambient silence.</li>
                <li><strong>Ephemeral Audio Processing:</strong> Captured audio is converted into voice-optimized 64kbps Opus WebM chunks and transmitted over secure TLS 1.3 to our transcription pipeline. Once the transcript is generated and returned to your dashboard, the temporary raw audio stream is purged from memory.</li>
                <li><strong>Zero Audio Brokering:</strong> We never sell, license, or trade raw meeting audio to third-party data brokers or marketing firms.</li>
              </ul>
            </div>

            {/* Section IV: Presenter Privacy Shield */}
            <div id="screen" className="scroll-mt-28 mt-14 pt-8 border-t border-slate-100 dark:border-slate-800/50">
              <h2>IV. Presenter Privacy Shield & Screen Share Protection</h2>
              <p>
                A core feature of the Voiceflow desktop application on Windows is the <strong>Presenter Privacy Shield</strong>. This capability is engineered to protect confidential meeting notes and teleprompter cues when presenting to colleagues or clients.
              </p>
              
              <h3>A. Technical Implementation (`WDA_EXCLUDEFROMCAPTURE`)</h3>
              <p>
                Voiceflow utilizes the official native Windows Win32 API <code>SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)</code>. When Presenter Privacy is enabled:
              </p>
              <ul>
                <li>Your floating notes and teleprompter widget remain fully visible to you on your desktop.</li>
                <li>The widget is automatically excluded from display capture and screen sharing streams in Microsoft Teams, Zoom, Google Meet, and OBS.</li>
                <li>This ensures your private speaking points, confidential agenda items, and internal cheat sheets are never accidentally broadcasted to webinar attendees, clients, or interviewers.</li>
              </ul>

              <h3>B. On-Demand Visual Snapshotting</h3>
              <p>
                When you click the <em>"Analyze Screen"</em> button, Voiceflow captures a single static snapshot of your active display surface via browser/system capture APIs. This snapshot is transmitted directly to our vision inference engine to extract slide text or answer visual questions, and is discarded from memory immediately after the answer is produced. Voiceflow never performs ongoing passive screen recording.
              </p>
            </div>

            {/* Section V: How We Use Your Data */}
            <div id="use" className="scroll-mt-28 mt-14 pt-8 border-t border-slate-100 dark:border-slate-800/50">
              <h2>V. How We Use Your Data</h2>
              <p>
                Information processed through Voiceflow is used strictly to provide the core services you request:
              </p>
              <ul>
                <li><strong>Real-Time Meeting Transcription:</strong> Generating accurate transcripts of spoken dialogue during calls.</li>
                <li><strong>Executive Summarization:</strong> Transforming lengthy transcripts into concise executive overviews, key takeaways, and action items.</li>
                <li><strong>Teleprompter Assistance:</strong> Delivering suggested follow-up questions, topic recaps, and talking points in real-time.</li>
                <li><strong>Follow-Up Email Drafting:</strong> Generating professional recap emails that you can review and send via Gmail or Outlook.</li>
                <li><strong>Account & Subscription Maintenance:</strong> Verifying plan limits and processing premium subscriptions.</li>
              </ul>
            </div>

            {/* Section VI: AI Processors & Third-Party Disclosure */}
            <div id="ai-disclosure" className="scroll-mt-28 mt-14 pt-8 border-t border-slate-100 dark:border-slate-800/50">
              <h2>VI. AI Model Processing & Third-Party Disclosures</h2>
              <p>
                To provide ultra-low latency transcription and summarization, Voiceflow partners with enterprise AI infrastructure providers:
              </p>
              <ul>
                <li><strong>Groq Cloud:</strong> Provides high-speed Whisper audio transcription and Llama-3 inference under strict zero-data-retention enterprise agreements.</li>
                <li><strong>Google Cloud & Gemini GenAI:</strong> Powers multimodal vision understanding and contextual summarization with enterprise confidentiality guarantees.</li>
                <li><strong>Firebase (Google Cloud):</strong> Provides secure authentication, identity management, and multi-tenant Firestore cloud database hosting.</li>
              </ul>
              <div className="not-prose my-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                <strong>No Public Model Training:</strong> Under our enterprise agreements with our AI infrastructure providers, your proprietary meeting transcripts, audio files, and private notes are <strong>NEVER used to train, fine-tune, or improve public AI foundation models</strong>.
              </div>
            </div>

            {/* Section VII: Data Security & Encryption */}
            <div id="security" className="scroll-mt-28 mt-14 pt-8 border-t border-slate-100 dark:border-slate-800/50">
              <h2>VII. Data Security & Encryption</h2>
              <p>
                We deploy robust administrative, physical, and technical safeguards to keep your meeting transcripts secure:
              </p>
              <ul>
                <li><strong>Encryption in Transit:</strong> All communications between the Voiceflow desktop/web client and our cloud backend are encrypted using TLS 1.3 / SSL.</li>
                <li><strong>Encryption at Rest:</strong> All saved meeting records, summaries, and transcripts are stored with 256-bit AES encryption in Google Cloud Firestore.</li>
                <li><strong>Multi-Tenant Isolation:</strong> Meeting records are strictly partitioned by authenticated user ID. Strict server-side security rules ensure no account can access, query, or view another user's recordings.</li>
                <li><strong>Compliance Standards:</strong> Our hosting infrastructure complies with ISO/IEC 27001, 27017, 27018 standards and SOC 2 Type II certification.</li>
              </ul>
            </div>

            {/* Section VIII: Your Rights & One-Click Data Deletion */}
            <div id="rights" className="scroll-mt-28 mt-14 pt-8 border-t border-slate-100 dark:border-slate-800/50">
              <h2>VIII. Your Rights & Data Deletion</h2>
              <p>
                You maintain complete ownership and control over your meeting history:
              </p>
              <ul>
                <li><strong>Instant Meeting Deletion:</strong> You can delete any individual meeting, transcript, or summary directly from your dashboard at any time. Clicking <em>"Delete"</em> immediately and permanently removes the document from our Firestore database.</li>
                <li><strong>Full Account Erasure:</strong> You may request complete deletion of your account and all associated workspace data by emailing <strong>support@voiceflow.space</strong>. All records are permanently erased within 30 days of identity confirmation.</li>
                <li><strong>Data Portability:</strong> You can copy your summaries, export clean transcripts, or copy email drafts to your clipboard with a single click at any time.</li>
              </ul>
            </div>

            {/* Section IX: Contact Us */}
            <div id="contact" className="scroll-mt-28 mt-14 pt-8 border-t border-slate-100 dark:border-slate-800/50">
              <h2>IX. Contact & Microsoft Store Compliance</h2>
              <p>
                If you have questions regarding this Privacy Policy, wish to report a privacy concern, or require technical verification for Microsoft Partner Center certification, please contact our data protection team:
              </p>
              
              <div className="not-prose mt-4 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-2 text-xs">
                <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">VOICEFLOWTECH SOLUTIONS</div>
                <div className="text-slate-600 dark:text-slate-400">Attn: Privacy & Safety Officer</div>
                <div className="text-slate-600 dark:text-slate-400">Official Support: <a href="mailto:support@voiceflow.space" className="text-orange-500 font-semibold underline">support@voiceflow.space</a></div>
                <div className="text-slate-600 dark:text-slate-400">Developer Contact: <a href="mailto:voiceflowpos@gmail.com" className="text-orange-500 font-semibold underline">voiceflowpos@gmail.com</a></div>
                <div className="text-slate-500 dark:text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800">
                  Store Certification URL: <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[11px]">https://voiceflow.space/legal/privacy-policy</code>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
