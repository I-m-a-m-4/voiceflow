'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, CheckCircle2, ArrowRight, ShieldCheck, Monitor } from 'lucide-react';

function DesktopBridgeContent() {
  const searchParams = useSearchParams();
  const port = searchParams.get('port');
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
      }
    });
    return () => unsub();
  }, []);

  const transferAuthToDesktop = async (user: User, googleIdToken?: string, googleAccessToken?: string) => {
    if (!port) {
      setErrorMessage("No desktop port specified. Please launch authentication directly from your Voiceflow Desktop App.");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);

      // Fetch the Firebase ID Token
      const firebaseToken = await user.getIdToken();

      // Build payload for desktop client
      const payload = {
        // If we have direct Google IdP tokens from popup, pass them; otherwise pass firebaseToken
        idToken: googleIdToken || '',
        accessToken: googleAccessToken || '',
        firebaseToken,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      };

      const serialized = btoa(JSON.stringify(payload));
      setIsSuccess(true);

      // Send to local desktop listener via top-level location redirect
      const callbackUrl = `http://127.0.0.1:${port}/callback?token=${encodeURIComponent(serialized)}`;
      
      // Give the user a brief visual confirmation before transferring
      setTimeout(() => {
        window.location.href = callbackUrl;
      }, 600);
    } catch (err: any) {
      console.error('Session transfer failed:', err);
      setErrorMessage(err.message || 'Failed to transfer login session to desktop.');
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!auth) return;
    setIsLoading(true);
    setErrorMessage(null);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      await transferAuthToDesktop(
        result.user,
        credential?.idToken || undefined,
        credential?.accessToken || undefined
      );
    } catch (err: any) {
      console.error('Browser Google Sign-In error:', err);
      const isCancelled = err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request';
      if (!isCancelled) {
        setErrorMessage(err?.message || 'Could not complete Google Sign-In in your browser.');
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] flex flex-col items-center justify-center p-4 selection:bg-orange-500/20 relative">
      {/* Top Banner Prompt after successful sign-in */}
      {isSuccess && (
        <div className="fixed top-4 inset-x-4 max-w-xl mx-auto z-50 animate-in slide-in-from-top duration-300">
          <div className="bg-[#1c1917]/95 border border-orange-500/30 backdrop-blur-md rounded-2xl p-3.5 shadow-2xl shadow-orange-950/40 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
                <Monitor className="w-4 h-4 text-orange-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  Open Voiceflow for a much smoother flow
                </p>
                <p className="text-[11px] text-zinc-400 truncate">
                  Continue where you left off in the desktop app
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={port ? `http://127.0.0.1:${port}/callback` : '#'}
                onClick={(e) => {
                  if (!port) {
                    e.preventDefault();
                    window.close();
                  }
                }}
                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-medium transition-all shadow-md shadow-orange-600/20 flex items-center gap-1.5"
              >
                <span>Open Voiceflow</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      <Card className="w-full max-w-md bg-[#18181b] border-[#27272a] shadow-2xl overflow-hidden rounded-2xl">
        <div className="h-1.5 w-full bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500" />
        
        <CardHeader className="text-center pt-8 pb-4">
          <div className="mx-auto w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-4">
            <Monitor className="w-6 h-6 text-orange-500" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight text-white">
            Voiceflow Desktop Connect
          </CardTitle>
          <CardDescription className="text-xs text-zinc-400 mt-1">
            Sign in with Google to securely authorize your desktop application
          </CardDescription>
        </CardHeader>

        <CardContent className="px-6 pb-8 pt-2 flex flex-col items-center">
          {isSuccess ? (
            <div className="flex flex-col items-center py-6 text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-white">Authenticated Successfully!</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                Redirecting back to your Voiceflow Desktop App... You can safely return to Voiceflow Desktop.
              </p>
              <div className="mt-5 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs text-orange-300 flex items-center gap-2">
                <Monitor className="w-4 h-4 shrink-0 text-orange-400" />
                <span>Switch back to Voiceflow for a much smoother flow</span>
              </div>
            </div>
          ) : (
            <div className="w-full space-y-4">
              {errorMessage && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 text-center">
                  {errorMessage}
                </div>
              )}

              {currentUser ? (
                <div className="space-y-3">
                  <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center gap-3">
                    {currentUser.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt="Avatar"
                        className="w-10 h-10 rounded-full border border-zinc-700 object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-orange-500/10 text-orange-500 font-bold flex items-center justify-center text-sm border border-orange-500/20">
                        {currentUser.email ? currentUser.email[0].toUpperCase() : 'U'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">
                        {currentUser.displayName || 'Google Account'}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate">{currentUser.email}</p>
                    </div>
                  </div>

                  <Button
                    onClick={() => transferAuthToDesktop(currentUser)}
                    disabled={isLoading}
                    className="w-full bg-orange-600 hover:bg-orange-500 text-white font-medium py-5 rounded-xl shadow-lg shadow-orange-600/20 flex items-center justify-center gap-2 text-sm"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Authorizing Desktop...
                      </>
                    ) : (
                      <>
                        Continue to Desktop as {currentUser.displayName?.split(' ')[0] || 'User'}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>

                  <div className="relative py-2 flex items-center justify-center">
                    <div className="border-t border-zinc-800 w-full absolute" />
                    <span className="bg-[#18181b] px-3 text-[10px] uppercase text-zinc-500 font-bold relative tracking-wider">
                      Or switch account
                    </span>
                  </div>
                </div>
              ) : null}

              <Button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                variant="outline"
                className="w-full bg-zinc-900/60 hover:bg-zinc-800 text-white border-zinc-700/80 font-medium py-5 rounded-xl flex items-center justify-center gap-3 text-sm transition-all shadow-sm"
              >
                {isLoading && !currentUser ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    Continue with Google
                  </>
                )}
              </Button>

              <div className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-zinc-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/80" />
                <span>Protected by Google OAuth 2.0 Loopback</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DesktopBridgePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      }
    >
      <DesktopBridgeContent />
    </Suspense>
  );
}
