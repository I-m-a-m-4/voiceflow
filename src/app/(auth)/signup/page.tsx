"use client";

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth, useFirestore } from '@/firebase';
import { GoogleAuthProvider, OAuthProvider, signInWithPopup, getRedirectResult, createUserWithEmailAndPassword } from 'firebase/auth';
import { createUserProfileDocument, waitForUserProfile } from '@/firebase/users';
import Link from 'next/link';
import { Loader } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc } from 'firebase/firestore';
import AuthRightPanel from '@/components/auth/auth-right-panel';
import AuthHeader from '@/components/auth/auth-header';
import { trackLaunchStage } from '@/lib/launch-telemetry';

function SignupPageContent() {
  const router = useRouter();
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!auth || !firestore) return;
    let isMounted = true;
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result || !isMounted) return;
        const user = result.user;
        void trackLaunchStage('signup_succeeded', 'google-redirect');
        setIsGoogleLoading(true);
        try {
          const userDocRef = doc(firestore, `users/${user.uid}`);
          const userDocSnap = await getDoc(userDocRef);
          if (!userDocSnap.exists()) {
            await createUserProfileDocument(firestore, user, user.displayName || '', user.phoneNumber || '', null);
            await waitForUserProfile(firestore, user.uid);
            await new Promise(resolve => setTimeout(resolve, 1500));
            router.push('/dashboard');
          } else {
            await new Promise(resolve => setTimeout(resolve, 1500));
            router.push('/dashboard');
          }
        } catch (profileErr: any) {
          console.error("Failed to create profile after redirect:", profileErr);
        } finally {
          if (isMounted) setIsGoogleLoading(false);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [auth, firestore, router]);

  const handleGoogleSignup = async () => {
    if (!auth || !firestore) return;
    setIsGoogleLoading(true);
    void trackLaunchStage('signup_started', 'google');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      let result = await signInWithPopup(auth, provider);
      
      const user = result.user;
      void trackLaunchStage('signup_succeeded', 'google');

      const userDocRef = doc(firestore, `users/${user.uid}`);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await createUserProfileDocument(firestore, user, user.displayName || '', user.phoneNumber || '', null);
        await waitForUserProfile(firestore, user.uid);
        await new Promise(resolve => setTimeout(resolve, 1200));
        router.push('/dashboard');
      } else {
        await new Promise(resolve => setTimeout(resolve, 1200));
        router.push('/dashboard');
      }
    } catch (error: any) {
      void trackLaunchStage('signup_failed', `google:${error?.code ?? 'unknown'}`);
      setIsGoogleLoading(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || !firestore) return;
    setIsEmailLoading(true);
    void trackLaunchStage('signup_started', 'email');
    try {
      let result = await createUserWithEmailAndPassword(auth, email, password);
      
      const user = result.user;
      void trackLaunchStage('signup_succeeded', 'email');

      const userDocRef = doc(firestore, `users/${user.uid}`);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await createUserProfileDocument(firestore, user, user.displayName || '', user.phoneNumber || '', null);
        await waitForUserProfile(firestore, user.uid);
        await new Promise(resolve => setTimeout(resolve, 1200));
        router.push('/dashboard');
      } else {
        await new Promise(resolve => setTimeout(resolve, 1200));
        router.push('/dashboard');
      }
    } catch (error: any) {
      void trackLaunchStage('signup_failed', `email:${error?.code ?? 'unknown'}`);
      toast({
        variant: "destructive",
        title: "Sign Up Failed",
        description: error.message || "Please check your details and try again.",
      });
      setIsEmailLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen flex lg:grid lg:grid-cols-2 bg-white relative">
      <AuthHeader />
      
      {/* Left Panel - Auth Form */}
      <div className="flex flex-col w-full h-full justify-center px-6 sm:px-12 pt-24 pb-12 lg:pb-24 max-w-xl mx-auto z-10">
        <div className="w-full max-w-sm mx-auto text-center space-y-8">
          
          <div className="space-y-3">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Create Account</h1>
            <p className="text-sm text-gray-600">
              Sync your <span className="font-semibold text-gray-800">work calendar</span> to start using VoiceFlow
            </p>
          </div>

          <div className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center justify-center gap-3 h-12 text-sm font-medium border-gray-300 hover:bg-gray-50 text-white rounded-md"
              onClick={handleGoogleSignup}
              disabled={isGoogleLoading}
            >
              {isGoogleLoading ? (
                <Loader className="h-4 w-4 animate-spin text-gray-500" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
              )}
              Continue with Google
            </Button>
            
            <div className="relative flex items-center justify-center my-4">
               <div className="absolute inset-x-0 h-px bg-gray-200"></div>
               <span className="relative bg-white px-4 text-xs font-medium text-gray-400 uppercase tracking-widest">Or sign up with email</span>
            </div>

            <form onSubmit={handleEmailSignup} className="space-y-4">
              <Input 
                type="email" 
                placeholder="Email Address" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12"
              />
              <Input 
                type="password" 
                placeholder="Password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12"
              />
              <Button
                type="submit"
                className="w-full h-12 text-sm font-medium rounded-md"
                disabled={isEmailLoading || isGoogleLoading}
              >
                {isEmailLoading ? <Loader className="h-4 w-4 animate-spin text-white" /> : "Sign Up"}
              </Button>
            </form>
          </div>

          <div className="text-xs text-gray-400">
            <Link href="/help" className="hover:underline">
              Why does VoiceFlow need calendar access?
            </Link>
          </div>

          <div className="relative flex items-center justify-center my-6">
             <div className="absolute inset-x-0 h-px bg-gray-200"></div>
             <span className="relative bg-white px-4 text-xs font-medium text-gray-400 uppercase tracking-widest">Or</span>
          </div>

          <div className="space-y-6">
            <Link href="/login" className="text-sm font-semibold text-otter-blue hover:underline block">
              Other ways to sign up
            </Link>

            <div className="text-sm text-gray-600">
              Already have a VoiceFlow account? <Link href="/login" className="font-semibold text-otter-blue hover:underline">Sign In</Link>
            </div>
          </div>

        </div>

        <div className="mt-auto pt-16 text-center">
            <p className="text-xs text-gray-500 leading-relaxed">
              By using VoiceFlow you agree to the <br className="sm:hidden" />
              <Link href="/terms" className="text-otter-blue hover:underline">Terms of Service</Link> and <Link href="/privacy" className="text-otter-blue hover:underline">Privacy Policy</Link>
            </p>
        </div>
      </div>

      {/* Right Panel - Testimonial & Social Proof */}
      <AuthRightPanel />
    </div>
  )
}

export default function SignupPage() {
  return (
    <React.Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center flex-col gap-2 bg-background">
        <Loader className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <SignupPageContent />
    </React.Suspense>
  );
}
