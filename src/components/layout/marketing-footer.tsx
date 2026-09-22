'use client';
import Link from "next/link";
import Image from "next/image";
import React from 'react';

export default function MarketingFooter() {
  return (
    <>
      <div className="relative z-20 overflow-x-hidden bg-orange-50 pt-32 pb-16 md:pt-[174px] md:pb-[160px] lg:pb-[210px] xl:pt-[220px]">
        {/* Floating 3D Keys Background Elements */}
        <div className="absolute right-[5%] top-[10%] hidden md:block mix-blend-multiply pointer-events-none animate-bounce" style={{ animationDuration: '6s' }}>
          <img src="/enter-key.jpg" alt="" className="w-64 h-64 object-contain transform rotate-12 brightness-[1.15] contrast-[1.25] grayscale-[20%] opacity-90" />
        </div>
        <div className="absolute right-[22%] top-[40%] hidden md:block mix-blend-multiply pointer-events-none animate-bounce" style={{ animationDuration: '7s' }}>
          <img src="/command-key.jpg" alt="" className="w-56 h-56 object-contain transform -rotate-12 brightness-[1.15] contrast-[1.25] grayscale-[20%] opacity-90" />
        </div>

        <div className="relative mx-auto w-full max-w-7xl px-5 md:px-8">
          <div className="max-w-[575px] md:max-w-[492px] lg:max-w-[575px]">
            <h3 className="inline text-[20px] leading-tight font-medium -tracking-[0.04em] text-slate-900 sm:block sm:text-[28px] md:text-[24px] lg:text-[28px]">
              Meeting AI that helps during the call, not after.
            </h3>
            <p className="inline text-slate-500 text-[20px] leading-tight font-medium -tracking-[0.04em] sm:block sm:text-[28px] md:text-[24px] lg:text-[28px]">
              Try Voiceflow on your next meeting today.
            </p>
            <div className="mt-5 flex flex-col gap-3 md:mt-6 lg:mt-7 xl:mt-7">
              <a href="/download" className="lg:h-12 px-5 w-fit h-11 rounded-[8px] relative font-semibold text-white inline-flex items-center justify-center text-base leading-none bg-zinc-800 hover:bg-zinc-700 shadow-lg hover:shadow-xl transition-all">
                <span className="relative z-10 flex items-center gap-2 text-sm leading-none -tracking-[0.04em] lg:text-base">
                  <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.951-1.801"/>
                  </svg>
                  Get for Windows
                </span>
              </a>
            </div>
          </div>
        </div>
      </div>
      <footer className="relative bg-orange-50 pt-10 pb-5">
        <div className="mx-auto w-full max-w-7xl px-5 md:px-8">
          <div className="relative flex h-full w-full justify-center">
            <div className="absolute -top-10 h-[1px] w-full bg-[linear-gradient(180deg,#E5E9F2_0%,#D0D7E7_100%)]"></div>
          </div>
        </div>
        {/* Gradient shadow removed as requested */}
        <div className="mx-auto w-full max-w-7xl px-5 md:px-8">
          <div className="flex flex-col lg:flex-row lg:justify-between">
            <div>
              <Link className="inline-flex rounded-md text-2xl font-bold tracking-tighter text-black" href="/">
                VoiceFlow
              </Link>
            </div>
            <nav className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 md:mt-[50px] md:grid-cols-[repeat(4,fit-content(240px))] md:gap-11 lg:mt-0 lg:gap-[58px] xl:gap-[66px]">
              <div>
                <h3 className="font-medium tracking-tight text-black">Product</h3>
                <ul className="mt-3 flex flex-col gap-y-2">
                  <li><Link className="rounded tracking-tight inline-flex items-center gap-x-1.5 leading-snug font-normal text-slate-600 transition-colors duration-200 hover:text-blue-600" href="/download">Download</Link></li>
                  <li><Link className="rounded tracking-tight inline-flex items-center gap-x-1.5 leading-snug font-normal text-slate-600 transition-colors duration-200 hover:text-blue-600" href="/pricing">Pricing</Link></li>
                  <li><Link className="rounded tracking-tight inline-flex items-center gap-x-1.5 leading-snug font-normal text-slate-600 transition-colors duration-200 hover:text-blue-600" href="/careers">Careers</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium tracking-tight text-black">Resources</h3>
                <ul className="mt-3 flex flex-col gap-y-2">
                  <li><Link className="rounded tracking-tight inline-flex items-center gap-x-1.5 leading-snug font-normal text-slate-600 transition-colors duration-200 hover:text-blue-600" href="/blog">Blog</Link></li>
                  <li><Link className="rounded tracking-tight inline-flex items-center gap-x-1.5 leading-snug font-normal text-slate-600 transition-colors duration-200 hover:text-blue-600" href="/help-center">Help Center</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium tracking-tight text-black">Compare</h3>
                <ul className="mt-3 flex flex-col gap-y-2">
                  <li><Link className="rounded tracking-tight inline-flex items-center gap-x-1.5 leading-snug font-normal text-slate-600 transition-colors duration-200 hover:text-blue-600" href="/blog/voiceflow-vs-otter">Voiceflow vs Otter</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium tracking-tight text-black">Support</h3>
                <ul className="mt-3 flex flex-col gap-y-2">
                  <li><Link className="rounded tracking-tight inline-flex items-center gap-x-1.5 leading-snug font-normal text-slate-600 transition-colors duration-200 hover:text-blue-600" href="/legal/privacy-policy">Privacy Policy</Link></li>
                  <li><Link className="rounded tracking-tight inline-flex items-center gap-x-1.5 leading-snug font-normal text-slate-600 transition-colors duration-200 hover:text-blue-600" href="/legal/terms-of-service">Terms of Service</Link></li>
                  <li><a className="rounded tracking-tight inline-flex items-center gap-x-1.5 leading-snug font-normal text-slate-600 transition-colors duration-200 hover:text-blue-600" href="mailto:hello@voiceflow.com">Contact Us</a></li>
                </ul>
              </div>
            </nav>
          </div>
          <div className="mt-11 md:mt-[30px]">
            <a className="font-medium tracking-tight transition-colors duration-300 inline-flex h-[34px] items-center justify-center gap-x-1.5 rounded-[6px] border border-slate-200 bg-slate-100 px-3 text-sm leading-none text-slate-600 hover:bg-slate-200" href="#">
              <span className="size-1.5 rounded-full bg-[#2CB463]"></span>All systems operational
            </a>
          </div>
          <div className="relative mt-[30px] flex flex-col pt-[30px] md:mt-5 md:flex-row md:items-center md:justify-between md:pt-5">
            <div className="absolute top-0 left-0 h-[1px] w-full bg-[linear-gradient(180deg,#E5E9F2_0%,#D0D7E7_100%)]"></div>
            <p className="order-2 mt-7 text-sm tracking-tight text-slate-500 md:order-1 md:mt-0">© 2026 Voiceflow. All rights reserved.</p>
            <div className="order-1 flex items-center gap-4 md:order-2">
              <a className="rounded-lg text-slate-600 transition-colors duration-300 hover:text-slate-900" target="_blank" rel="noopener noreferrer" href="https://x.com/voiceflow">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="size-5"><path d="M14.6009 2H17.0544L11.6943 8.35385L18 17H13.0627L9.19566 11.7562L4.77087 17H2.31595L8.04904 10.2038L2 2H7.06262L10.5581 6.79308L14.6009 2ZM13.7399 15.4769H15.0993L6.32392 3.44308H4.86506L13.7399 15.4769Z"></path></svg>
                <span className="sr-only">Follow us on Twitter</span>
              </a>
              <a className="rounded-lg text-slate-600 transition-colors duration-300 hover:text-slate-900" target="_blank" rel="noopener noreferrer" href="https://www.instagram.com/voiceflow/">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="size-5"><path d="M10 1C7.555 1 7.24975 1.01125 6.28975 1.054C5.33125 1.099 4.67875 1.24975 4.105 1.4725C3.51325 1.702 3.01075 2.01025 2.5105 2.5105C2.01025 3.01075 1.70125 3.5125 1.4725 4.105C1.24975 4.67875 1.09825 5.33125 1.054 6.28975C1.009 7.24975 1 7.555 1 10C1 12.445 1.01125 12.7503 1.054 13.7103C1.099 14.668 1.24975 15.3213 1.4725 15.895C1.702 16.486 2.01025 16.9893 2.5105 17.4895C3.01075 17.989 3.5125 18.2987 4.105 18.5275C4.6795 18.7495 5.332 18.9018 6.28975 18.946C7.24975 18.991 7.555 19 10 19C12.445 19 12.7503 18.9888 13.7103 18.946C14.668 18.901 15.3213 18.7495 15.895 18.5275C16.486 18.298 16.9893 17.989 17.4895 17.4895C17.989 16.9893 18.2987 16.4883 18.5275 15.895C18.7495 15.3213 18.9018 14.668 18.946 13.7103C18.991 12.7503 19 12.445 19 10C19 7.555 18.9888 7.24975 18.946 6.28975C18.901 5.332 18.7495 4.678 18.5275 4.105C18.298 3.51325 17.989 3.01075 17.4895 2.5105C16.9893 2.01025 16.4883 1.70125 15.895 1.4725C15.3213 1.24975 14.668 1.09825 13.7103 1.054C12.7503 1.009 12.445 1 10 1ZM10 2.62C12.4023 2.62 12.6888 2.632 13.6375 2.67325C14.515 2.7145 14.9913 2.86 15.3077 2.9845C15.7292 3.14725 16.0278 3.34225 16.3442 3.6565C16.6585 3.9715 16.8535 4.27075 17.0163 4.69225C17.1392 5.00875 17.2862 5.485 17.326 6.3625C17.3687 7.312 17.3785 7.597 17.3785 10C17.3785 12.403 17.3673 12.6888 17.323 13.6375C17.2773 14.515 17.131 14.9913 17.0072 15.3077C16.8393 15.7292 16.648 16.0278 16.333 16.3442C16.0188 16.6585 15.715 16.8535 15.298 17.0163C14.983 17.1392 14.4993 17.2862 13.6217 17.326C12.6663 17.3687 12.385 17.3785 9.9775 17.3785C7.56925 17.3785 7.288 17.3673 6.33325 17.323C5.455 17.2773 4.97125 17.131 4.65625 17.0072C4.2295 16.8393 3.93625 16.648 3.622 16.333C3.30625 16.0188 3.1045 15.715 2.947 15.298C2.82325 14.983 2.67775 14.4993 2.632 13.6217C2.59825 12.6768 2.58625 12.385 2.58625 9.98875C2.58625 7.59175 2.59825 7.29925 2.632 6.343C2.67775 5.4655 2.82325 4.9825 2.947 4.6675C3.1045 4.24 3.30625 3.9475 3.622 3.63175C3.93625 3.3175 4.2295 3.115 4.65625 2.95825C4.97125 2.83375 5.4445 2.6875 6.322 2.6425C7.27825 2.60875 7.5595 2.5975 9.96625 2.5975L10 2.62ZM10 5.3785C7.44625 5.3785 5.3785 7.4485 5.3785 10C5.3785 12.5538 7.4485 14.6215 10 14.6215C12.5538 14.6215 14.6215 12.5515 14.6215 10C14.6215 7.44625 12.5515 5.3785 10 5.3785ZM10 13C8.3425 13 7 11.6575 7 10C7 8.3425 8.3425 7 10 7C11.6575 7 13 8.3425 13 10C13 11.6575 11.6575 13 10 13ZM15.8845 5.19625C15.8845 5.7925 15.4 6.27625 14.8045 6.27625C14.2083 6.27625 13.7245 5.79175 13.7245 5.19625C13.7245 4.60075 14.209 4.117 14.8045 4.117C15.3993 4.11625 15.8845 4.60075 15.8845 5.19625Z"></path></svg>
                <span className="sr-only">Follow us on Instagram</span>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
