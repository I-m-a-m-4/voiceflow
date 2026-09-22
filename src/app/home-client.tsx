'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  Laptop,
  Sparkles,
  Wand2,
  MessageSquare,
  RefreshCw,
  Zap,
  MoreHorizontal,
  Play,
  Square,
  Volume2,
  Lock,
  Globe,
  CheckCircle2,
  Menu,
  X,
  Apple,
  ArrowRight
} from 'lucide-react';
import MarketingFooter from '@/components/layout/marketing-footer';

export default function HomeClient() {
  // Mobile nav state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);

  // Invisibility Interactive Slider (0% to 100%)
  const [sliderPos, setSliderPos] = useState(30);
  const isDraggingRef = useRef(false);

  // Live Audio Recording Simulation
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // FAQ Accordion Active States
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatRecordingTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSliderMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(percentage);
  };

  const faqs = [
    {
      q: 'Why real-time vs. a regular AI notetaker?',
      a: 'Traditional AI notetakers record the call and email you a summary 10 minutes after the meeting ends. Voiceflow works live during your meeting: giving you instant answers, live context, and discreet prompts when you need them most.'
    },
    {
      q: 'Who is Voiceflow for?',
      a: 'Voiceflow is designed for executives, sales professionals, software engineers, consultants, and anyone who attends virtual meetings and needs real-time assistance, quick recall, or automated note-taking.'
    },
    {
      q: 'Is Voiceflow free?',
      a: 'Yes, Voiceflow offers a generous free tier with unlimited local meeting notes and live transcription. Advanced AI live assistance and team collaboration features are available on Pro plans.'
    },
    {
      q: 'How is it undetectable in meetings?',
      a: 'Voiceflow runs directly on your desktop device as a native audio layer. It never sends a bot into your Zoom, Google Meet, or Teams call, making it 100% invisible to all other participants.'
    },
    {
      q: 'What languages and apps are supported?',
      a: 'Voiceflow supports over 12 major languages (including English, Spanish, Mandarin, French, and German) and works seamlessly across Zoom, Microsoft Teams, Google Meet, Slack Huddles, and Webex.'
    },
    {
      q: 'Can I talk to customer support?',
      a: 'Absolutely! Our engineering team offers 24/7 priority support via live chat, email, and Discord community channels.'
    }
  ];

  return (
    <div className="flex min-h-screen flex-col font-sans bg-white text-slate-900 selection:bg-orange-500 selection:text-white">
      {/* Top Navigation Header */}
      <header className="absolute top-0 z-50 flex w-full pt-6 px-4 lg:px-12">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between text-white">
          <div className="flex items-center gap-2 lg:gap-12">
            <Link href="/" className="flex items-center gap-2.5 group">
              <img src="/icon.svg" alt="Voiceflow" className="w-8 h-8 rounded-lg shadow-sm transition-transform group-hover:scale-105" />
              <span className="font-bold text-xl tracking-tight text-white">Voiceflow</span>
            </Link>
            <div className="hidden items-center gap-6 md:flex">
              <a href="#undetectability" className="text-sm font-semibold text-white hover:text-white/80 transition-colors">
                Undetectability
              </a>
              <a href="#mobile" className="text-sm font-semibold text-white hover:text-white/80 transition-colors">
                Mobile
              </a>
              <a href="#blog" className="text-sm font-semibold text-white hover:text-white/80 transition-colors">
                Blog
              </a>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/admin-imamshaffy" className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-slate-900 font-semibold hover:bg-orange-50 transition-colors shadow-sm">
              Sign In
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-white hover:text-white/80 p-1"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-zinc-950/95 backdrop-blur-xl pt-24 px-6 md:hidden flex flex-col gap-6 text-white">
          <a href="#undetectability" onClick={() => setMobileMenuOpen(false)} className="text-xl font-medium border-b border-zinc-800 pb-3">
            Undetectability
          </a>
          <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-xl font-medium border-b border-zinc-800 pb-3">
            Features
          </a>
          <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="text-xl font-medium border-b border-zinc-800 pb-3">
            FAQ
          </a>
          <Link href="/admin-imamshaffy" onClick={() => setMobileMenuOpen(false)} className="mt-4 w-full py-3 text-center bg-orange-500 hover:bg-orange-600 transition-colors font-semibold rounded-xl text-white">
            Sign In
          </Link>
        </div>
      )}

      {/* Main Content Body */}
      <main className="grow">
        {/* HERO SECTION */}
        <div 
          className="relative bg-cover bg-center pt-28 pb-16 lg:pt-32 lg:pb-20 overflow-hidden"
          style={{ backgroundImage: "url('/hero-bg.png')" }}
        >
          {/* Bottom fade to blend with next section */}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-50 to-transparent z-0 pointer-events-none"></div>

          <div className="relative z-10 mx-auto max-w-6xl px-5 text-center flex flex-col items-center gap-6 mt-6">
            <div className="flex flex-col items-center gap-5">
              <h1 className="max-w-[800px] text-center text-5xl sm:text-6xl lg:text-[72px] font-serif font-medium tracking-tight leading-[1.05] text-white">
                #1 Undetectable<br/>AI for Meetings
              </h1>

              <h2 className="max-w-[620px] text-center text-base sm:text-lg lg:text-xl text-white font-medium leading-relaxed">
                Voiceflow takes perfect meeting notes and gives real-time answers,<br/>all while completely undetectable
              </h2>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-center mt-4">
              <a
                href="/download"
                className="inline-flex items-center justify-center gap-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-4 text-base sm:text-lg shadow-lg hover:scale-105 transition-all w-fit"
              >
                <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.951-1.801"/>
                </svg>
                <span>Get for Windows</span>
              </a>
            </div>

            {/* Hero Interactive Desktop App Window Mockup */}
            <div className="relative mt-12 w-full max-w-5xl rounded-3xl border border-white/20 bg-zinc-950/90 shadow-[0_25px_70px_rgba(0,0,0,0.8)] backdrop-blur-3xl overflow-hidden text-left">
              {/* Native Window Titlebar */}
              <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-900/90 border-b border-white/10 text-xs text-zinc-400">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/90 shadow-sm" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/90 shadow-sm" />
                    <div className="w-3 h-3 rounded-full bg-green-500/90 shadow-sm" />
                  </div>
                  <span className="font-mono text-zinc-400 font-medium pl-2 border-l border-white/10">
                    Voiceflow AI Notetaker — Q3 Executive Strategy Call
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/90 border border-white/10 text-zinc-300 font-mono text-[11px]">
                    <Volume2 className="w-3 h-3 text-orange-400" />
                    <span>Built-in Mic (48kHz)</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Botless Stream Active</span>
                  </div>
                </div>
              </div>

              {/* Window Desktop Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 min-h-[420px] bg-zinc-950">
                {/* Left Side: Live Meeting & Transcript Stream */}
                <div className="lg:col-span-5 p-5 border-b lg:border-b-0 lg:border-r border-white/10 bg-zinc-900/40 flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-zinc-400 font-medium pb-2 border-b border-white/10">
                      <span>Video Conference (4 Participants)</span>
                      <span className="text-zinc-500 font-mono">00:14:28</span>
                    </div>

                    {/* Participant Grid Tiles */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-20 rounded-xl bg-zinc-800/80 border border-white/10 p-2 flex flex-col justify-between relative overflow-hidden">
                        <div className="w-7 h-7 rounded-full bg-orange-600 text-white font-bold text-xs flex items-center justify-center">AM</div>
                        <span className="text-[11px] font-medium text-zinc-300 truncate">Alex Mercer (Host)</span>
                        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400" />
                      </div>
                      <div className="h-20 rounded-xl bg-zinc-800/80 border border-white/10 p-2 flex flex-col justify-between relative overflow-hidden">
                        <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">SJ</div>
                        <span className="text-[11px] font-medium text-zinc-300 truncate">Sarah Jenkins (VP)</span>
                        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400" />
                      </div>
                    </div>

                    {/* Live Transcript Stream Feed */}
                    <div className="mt-3 p-3 rounded-xl bg-zinc-900/80 border border-white/10 space-y-2 text-xs font-mono text-zinc-300 max-h-44 overflow-y-auto">
                      <p className="leading-relaxed">
                        <span className="text-orange-400 font-semibold">[00:14:15] Sarah:</span> "Alex, what are the key highlights for our Q3 ARR metrics?"
                      </p>
                      <p className="leading-relaxed">
                        <span className="text-blue-400 font-semibold">[00:14:22] Alex:</span> "We hit 42% growth QoQ."
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-zinc-400 pt-2 border-t border-white/10">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>No bot joined • 100% Invisible to Zoom & Teams</span>
                  </div>
                </div>

                {/* Right Side: Voiceflow Desktop HUD Overlay */}
                <div className="lg:col-span-7 p-5 sm:p-6 bg-gradient-to-b from-zinc-950 via-zinc-900/90 to-zinc-950 flex flex-col justify-between gap-5">
                  {/* HUD Top Control Pill */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 bg-gradient-to-r from-zinc-900 to-zinc-800 border border-white/15 px-3 py-1.5 rounded-full text-xs font-semibold text-white shadow-sm">
                      <Sparkles className="w-4 h-4 text-orange-400 animate-pulse" />
                      <span>Voiceflow AI Assistant Listening</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button className="flex items-center gap-1 px-3 py-1 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-xs font-medium text-zinc-300 border border-white/10">
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Hide</span>
                      </button>
                      <button aria-label="Stop session" className="flex size-7 items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white shadow-sm">
                        <Square className="w-3 h-3 fill-current text-white" />
                      </button>
                    </div>
                  </div>

                  {/* Live AI Query Box & Streaming Output */}
                  <div className="rounded-2xl border border-white/20 bg-zinc-900/80 p-4 space-y-3 shadow-xl backdrop-blur-md">
                    <div className="flex justify-end">
                      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-3.5 py-1.5 rounded-xl rounded-tr-none text-xs font-medium shadow-md border border-blue-500/30">
                        What should I say about the quarterly targets?
                      </div>
                    </div>

                    <div className="text-xs sm:text-sm leading-relaxed text-zinc-200 pt-1">
                      <p>
                        “Our ARR grew by <strong className="text-orange-400 font-semibold">42% QoQ</strong>, driven primarily by enterprise seat upgrades. We recommend emphasizing that our net retention rate remains at <strong className="text-emerald-400 font-semibold">118%</strong>.”
                      </p>
                    </div>
                  </div>

                  {/* Instant Action Pills */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                    <button className="flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/15 text-zinc-200 transition-colors">
                      <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                      <span>Assist</span>
                    </button>
                    <button className="flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/15 text-zinc-200 transition-colors">
                      <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                      <span>What should I say?</span>
                    </button>
                    <button className="flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/15 text-zinc-200 transition-colors">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                      <span>Follow-up questions</span>
                    </button>
                    <button className="flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/15 text-zinc-200 transition-colors">
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Recap</span>
                    </button>
                  </div>

                  {/* Input Command Box */}
                  <div className="rounded-xl border border-white/20 bg-zinc-900/90 p-2 flex items-center justify-between gap-2 shadow-inner">
                    <input
                      type="text"
                      placeholder="Ask about your screen or conversation, or ⌘ ↵ for Assist"
                      className="w-full bg-transparent px-2 text-xs sm:text-sm text-white placeholder-zinc-500 outline-none"
                      readOnly
                      value=""
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-300 border border-white/10">
                        <Zap className="w-3 h-3 text-orange-400" />
                        Smart
                      </span>
                      <button className="w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-md">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION: HOW VOICEFLOW HELPS DURING A MEETING */}
        <section id="features" className="py-20 lg:py-32 bg-orange-50 text-slate-900">
          <div className="mx-auto max-w-7xl px-5 md:px-8 flex flex-col items-center gap-12">
            <h2 className="text-center text-3xl sm:text-5xl font-medium tracking-tight text-slate-900">
              How Voiceflow helps during a meeting
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full">
              {/* Card 1: Voiceflow Listens */}
              <div className="card-styles relative flex flex-col justify-between p-8 text-white rounded-3xl overflow-hidden shadow-xl bg-gradient-to-br from-orange-500 via-orange-400 to-orange-600">
                <div className="flex flex-col gap-3">
                  <h3 className="text-2xl font-medium tracking-tight text-white flex items-center gap-2">
                    Voiceflow <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold">listens in</span> to the conversation
                  </h3>
                  <p className="text-sm sm:text-base text-orange-50 max-w-md">
                    It picks up the context of your meeting in real time, so it can help when you need it.
                  </p>
                </div>

                {/* Animated Equalizer Visual */}
                <div className="my-8 p-6 rounded-2xl bg-zinc-950/40 border border-white/15 backdrop-blur-lg flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2 text-zinc-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="font-mono text-sm font-semibold tracking-wider">
                      {formatRecordingTime(recordingSeconds)} Recording Live
                    </span>
                  </div>

                  {/* 30 Waveform Audio Bars */}
                  <div className="flex items-center justify-center gap-1.5 h-16 w-full px-4 overflow-hidden">
                    {Array.from({ length: 32 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1.5 bg-white/80 rounded-full transition-all duration-300"
                        style={{
                          height: `${Math.max(15, Math.sin(i * 0.5 + recordingSeconds) * 45 + 35)}%`
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Card 2: Instant Assistance */}
              <div className="card-styles relative flex flex-col justify-between p-8 text-slate-900 rounded-3xl overflow-hidden shadow-xl bg-gradient-to-br from-orange-100 via-orange-50 to-orange-200 border border-orange-200">
                <div className="flex flex-col gap-3">
                  <h3 className="text-2xl font-medium tracking-tight text-slate-900 flex items-center gap-2">
                    When you need help, Voiceflow <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-orange-500 text-white text-xs font-semibold">assists</span> you instantly
                  </h3>
                  <p className="text-sm sm:text-base text-slate-600 max-w-md">
                    Hit Cmd/Ctrl + Enter and Voiceflow helps you with AI in the moment.
                  </p>
                </div>

                {/* Command Bar Shortcut Card */}
                <div className="my-8 p-6 rounded-2xl bg-zinc-900 text-white border border-slate-700 shadow-2xl flex flex-col gap-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 font-mono text-zinc-200">⌘ Cmd</span>
                    <span>+</span>
                    <span className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 font-mono text-zinc-200">↵ Enter</span>
                    <span className="ml-auto text-orange-400 font-semibold">Instant AI Recall</span>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 font-sans">
                    “Cluely gives you instant answers, notes, and next steps, all while staying completely undetectable on your screen.”
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION: UNDETECTABLE IN EVERY WAY */}
        <section id="undetectability" className="py-20 lg:py-32 bg-white text-slate-900">
          <div className="mx-auto max-w-7xl px-5 md:px-8 flex flex-col items-center gap-12">
            <div className="text-center flex flex-col items-center gap-3">
              <h2 className="text-3xl sm:text-5xl font-medium tracking-tight text-slate-900">
                Undetectable in every way
              </h2>
              <p className="text-slate-500 text-base sm:text-lg max-w-lg">
                Suite of features to use Voiceflow without a trace.
              </p>
            </div>

            {/* Feature Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 w-full mt-10">
              {/* Feature 1 */}
              <div className="flex flex-col gap-6">
                <img src="/undetectable-1.jpg" alt="Doesn't join meetings" className="w-full rounded-[2.5rem] object-cover shadow-sm border border-slate-100" />
                <p className="text-base text-slate-500 leading-relaxed">
                  <span className="font-semibold text-slate-900">Doesn't join meetings. </span>
                  Voiceflow never joins your meetings, so there are no bots and no extra people on the guest list.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="flex flex-col gap-6">
                <img src="/undetectable-2.jpg" alt="Invisible to screen share" className="w-full rounded-[2.5rem] object-cover shadow-sm border border-slate-100" />
                <p className="text-base text-slate-500 leading-relaxed">
                  <span className="font-semibold text-slate-900">Invisible to screen share. </span>
                  Voiceflow never shows up in shared screens, recordings, or external meeting tools.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="flex flex-col gap-6">
                <img src="/undetectable-3.jpg" alt="Follows your eyes" className="w-full rounded-[2.5rem] object-cover shadow-sm border border-slate-100" />
                <p className="text-base text-slate-500 leading-relaxed">
                  <span className="font-semibold text-slate-900">Follows your eyes. </span>
                  Voiceflow window is fully moveable so you can position it exactly where you're looking.
                </p>
              </div>
            </div>

            {/* Compatible Tools Cloud */}
            <div className="mt-16 flex flex-col items-center gap-8 w-full">
              <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">
                Compatible with every tool
              </span>
              <div className="flex flex-wrap items-center justify-center gap-10 text-slate-700 font-medium text-sm">
                <span className="flex items-center gap-2">Zoom</span>
                <span className="flex items-center gap-2">Slack</span>
                <span className="flex items-center gap-2">Webex</span>
                <span className="flex items-center gap-2">Microsoft Teams</span>
                <span className="flex items-center gap-2">Google Meet</span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION: REAL-TIME TRANSCRIPTION STATS */}
        <section className="py-20 lg:py-32 bg-white text-slate-900">
          <div className="mx-auto max-w-7xl px-5 md:px-8 flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-20">
            {/* Left: UI Mockup Image */}
            <div className="w-full lg:w-1/2 flex justify-center">
              <img src="/transcript-ui.jpg" alt="Live Transcription UI" className="w-full max-w-md rounded-3xl object-contain mix-blend-multiply" />
            </div>

            {/* Right: Stats Content */}
            <div className="w-full lg:w-1/2 flex flex-col gap-8">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-slate-900">
                Real-time transcription
              </h2>

              <div className="space-y-8 divide-y divide-slate-100">
                <div className="pt-6 flex flex-col sm:flex-row sm:items-start gap-6">
                  <span className="text-4xl lg:text-5xl font-medium text-slate-900 w-28 shrink-0">12+</span>
                  <div className="space-y-1">
                    <h4 className="text-xl font-medium text-slate-900">Languages</h4>
                    <p className="text-sm sm:text-base text-slate-500 leading-relaxed">
                      We support over 12 different languages, including English, Chinese, Spanish, and more.
                    </p>
                  </div>
                </div>

                <div className="pt-6 flex flex-col sm:flex-row sm:items-start gap-6">
                  <span className="text-4xl lg:text-5xl font-medium text-slate-900 w-28 shrink-0 flex items-baseline gap-1">300<span className="text-xl font-medium">ms</span></span>
                  <div className="space-y-1">
                    <h4 className="text-xl font-medium text-slate-900">Response time</h4>
                    <p className="text-sm sm:text-base text-slate-500 leading-relaxed">
                      We have the fastest live transcription available. Test us against any other competitor.
                    </p>
                  </div>
                </div>

                <div className="pt-6 flex flex-col sm:flex-row sm:items-start gap-6">
                  <span className="text-4xl lg:text-5xl font-medium text-slate-900 w-28 shrink-0">95%</span>
                  <div className="space-y-1">
                    <h4 className="text-xl font-medium text-slate-900">Transcription accuracy</h4>
                    <p className="text-sm sm:text-base text-slate-500 leading-relaxed">
                      Trusted by many teams for reliable transcription. All processed with industry-leading accuracy.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION: FREQUENTLY ASKED QUESTIONS */}
        <section id="faq" className="py-20 lg:py-32 bg-white text-slate-900">
          <div className="mx-auto max-w-4xl px-5 md:px-8 space-y-10">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
              Frequently asked questions
            </h2>

            <div className="flex flex-col">
              {faqs.map((faq, idx) => (
                <div
                  key={idx}
                  className="border-b border-slate-200 overflow-hidden transition-colors"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full flex items-center justify-between py-5 text-left font-medium text-slate-900 text-base sm:text-lg hover:text-orange-600 transition-colors"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openFaq === idx ? 'rotate-180 text-orange-600' : ''}`} />
                  </button>
                  {openFaq === idx && (
                    <div className="pb-5 text-slate-600 text-sm sm:text-base leading-relaxed">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA BANNER */}
      </main>

      <MarketingFooter />

      {/* Desktop App Download Modal */}
      {downloadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
          <div className="relative w-full max-w-md rounded-3xl bg-zinc-900 border border-zinc-800 p-6 text-white space-y-4 shadow-2xl">
            <button
              onClick={() => setDownloadModalOpen(false)}
              className="absolute top-4 right-4 p-1 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
              <Laptop className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Get Voiceflow Desktop App</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Download native desktop app for Windows, macOS, or Linux for botless meeting recording and undetectable AI assistance.
            </p>

            <div className="space-y-3 pt-2">
              <a
                href="/download"
                className="w-full py-3 px-4 rounded-xl bg-white text-zinc-950 font-bold text-center flex items-center justify-center gap-2 hover:bg-zinc-100 transition-colors"
              >
                <Laptop className="w-4 h-4" />
                Download Desktop Installer (.msi / .dmg)
              </a>
              <Link
                href="/dashboard"
                onClick={() => setDownloadModalOpen(false)}
                className="w-full py-3 px-4 rounded-xl bg-zinc-800 text-zinc-200 font-semibold text-center flex items-center justify-center gap-2 hover:bg-zinc-700 transition-colors text-xs"
              >
                Continue in Web Browser
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
