'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, signInWithPopup, signInWithRedirect, signInWithCredential, getRedirectResult, getAdditionalUserInfo, signOut, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { handleGoogleSignupSuccess } from '@/firebase/users';
import { useAuth } from '@/context/auth-context';
import AuthLayout from '@/components/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { isNativeApp, openExternal, getWebBaseUrl } from '@/lib/platform';
import { syncDeviceTrial } from '@/lib/device-fingerprint';

export default function SignupPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });

  const isNavigatingRef = React.useRef(false);

  const goToDashboard = () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;

    const isTauri = typeof window !== 'undefined' && (
      window.location.protocol === 'tauri:' || 
      window.location.origin.includes('tauri.localhost') || 
      window.location.protocol === 'asset:' ||
      (window as any).__TAURI_INTERNALS__ !== undefined
    );
    const destination = isTauri ? '/dashboard/' : '/dashboard';

    try {
      router.replace(destination);
    } catch {
      try {
        router.push(destination);
      } catch {}
    }

    // Direct window.location fallback if client router has not transitioned after 250ms
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        if (!window.location.pathname.includes('/dashboard')) {
          window.location.href = destination;
        }
      }, 250);
    }
  };

  useEffect(() => {
    let hasCachedSession = false;
    if (typeof window !== 'undefined') {
      try {
        hasCachedSession = !!localStorage.getItem('voiceflow_auth_session');
      } catch {}
    }

    if ((!authLoading && user) || hasCachedSession) {
      goToDashboard();
      return;
    }

    if (!auth) return;

    // Listen directly to auth state to redirect the very millisecond a session is confirmed
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        const fallbackName = firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'User');
        const sessionData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: fallbackName,
          photoURL: firebaseUser.photoURL,
          isAnonymous: firebaseUser.isAnonymous,
          emailVerified: firebaseUser.emailVerified,
          isCached: true,
        };
        try {
          localStorage.setItem('voiceflow_auth_session', JSON.stringify(sessionData));
          localStorage.setItem('userEmail', firebaseUser.email || '');
          localStorage.setItem('userName', fallbackName);
        } catch {}
        try {
          await handleGoogleSignupSuccess(db, firebaseUser);
          await syncDeviceTrial(db, firebaseUser).catch(() => {});
        } catch {}
        goToDashboard();
      }
    });

    let isMounted = true;
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result?.user || !isMounted) return;
        setIsGoogleLoading(true);
        const redirectUser = result.user;
        const fallbackName = redirectUser.displayName || (redirectUser.email ? redirectUser.email.split('@')[0] : 'User');

        const sessionData = {
          uid: redirectUser.uid,
          email: redirectUser.email,
          displayName: fallbackName,
          photoURL: redirectUser.photoURL,
          isAnonymous: redirectUser.isAnonymous,
          emailVerified: redirectUser.emailVerified,
          isCached: true,
        };
        try {
          localStorage.setItem('voiceflow_auth_session', JSON.stringify(sessionData));
          localStorage.setItem('userEmail', redirectUser.email || '');
          localStorage.setItem('userName', fallbackName);
        } catch {}

        toast({
          title: 'Account created!',
          description: 'Successfully signed up with Google.',
        });

        // Ensure user profile is provisioned before navigating
        try {
          await handleGoogleSignupSuccess(db, redirectUser);
          await syncDeviceTrial(db, redirectUser).catch(() => {});
        } catch (e) {
          console.error('User sync error:', e);
        }

        goToDashboard();
      })
      .catch((error: any) => {
        const isCancellation =
          error?.code === 'auth/popup-closed-by-user' ||
          error?.code === 'auth/redirect-cancelled-by-user' ||
          error?.code === 'auth/null-user';
        if (!isCancellation) {
          console.error('Redirect sign-up error:', error);
          toast({
            variant: "destructive",
            title: "Authentication Failed",
            description: error.message || "Please try again.",
          });
        }
      })
      .finally(() => {
        if (isMounted) setIsGoogleLoading(false);
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user, authLoading, router]);

  const handleGoogleSignup = async () => {
    if (!auth) return;
    setIsGoogleLoading(true);

    // 1. If running inside Tauri Desktop shell, use the system browser OAuth loopback flow
    if (isNativeApp()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { listen } = await import('@tauri-apps/api/event');

        // Start local loopback listener
        const port = await invoke<number>('start_oauth_listener');

        let unlistenFn: (() => void) | null = null;
        const authPromise = new Promise<string>(async (resolve) => {
          unlistenFn = await listen<string>('desktop-auth-callback', (event) => {
            resolve(event.payload);
          });
        });

        // Open user's default system browser (Chrome/Edge/Firefox)
        const bridgeUrl = `${getWebBaseUrl()}/auth/desktop-bridge?port=${port}`;
        await openExternal(bridgeUrl);

        toast({
          title: "Browser Opened",
          description: "Please complete Google Sign-In in your browser.",
        });

        // Await token from browser (timeout after 5 minutes)
        const tokenString = await Promise.race([
          authPromise,
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('Sign-in timed out. Please try again.')), 300000)
          ),
        ]);

        if (unlistenFn) (unlistenFn as any)();

        let payload: any = null;
        try {
          payload = JSON.parse(atob(tokenString));
        } catch {
          payload = JSON.parse(tokenString);
        }

        if (payload?.idToken) {
          const credential = GoogleAuthProvider.credential(payload.idToken, payload.accessToken || undefined);
          const result = await signInWithCredential(auth, credential);
          const user = result.user;
          const fallbackName = user.displayName || payload.displayName || (user.email ? user.email.split('@')[0] : 'User');

          const sessionData = {
            uid: user.uid,
            email: user.email,
            displayName: fallbackName,
            photoURL: user.photoURL || payload.photoURL,
            isAnonymous: user.isAnonymous,
            emailVerified: user.emailVerified,
            isCached: true,
          };
          try {
            localStorage.setItem('voiceflow_auth_session', JSON.stringify(sessionData));
            localStorage.setItem('userEmail', user.email || '');
            localStorage.setItem('userName', fallbackName);
          } catch {}

          toast({
            title: "Account created!",
            description: "Successfully signed up with Google.",
          });

          try {
            await handleGoogleSignupSuccess(db, user);
            await syncDeviceTrial(db, user).catch(() => {});
          } catch (e) {
            console.error('User sync error:', e);
          }

          goToDashboard();
        }
      } catch (err: any) {
        console.error('Desktop Google Sign-Up error:', err);
        toast({
          variant: "destructive",
          title: "Google Sign-Up Failed",
          description: err.message || "Could not complete desktop Google sign-up.",
        });
      } finally {
        setIsGoogleLoading(false);
      }
      return;
    }

    // 2. Standard Web Browser: use signInWithPopup
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;
      const fallbackName = user.displayName || (user.email ? user.email.split('@')[0] : 'User');

      const sessionData = {
        uid: user.uid,
        email: user.email,
        displayName: fallbackName,
        photoURL: user.photoURL,
        isAnonymous: user.isAnonymous,
        emailVerified: user.emailVerified,
        isCached: true,
      };
      try {
        localStorage.setItem('voiceflow_auth_session', JSON.stringify(sessionData));
        localStorage.setItem('userEmail', user.email || '');
        localStorage.setItem('userName', fallbackName);
      } catch {}

      toast({
        title: 'Account created!',
        description: 'Successfully signed up with Google.',
      });

      // Ensure user profile is provisioned before navigating
      try {
        await handleGoogleSignupSuccess(db, user);
        await syncDeviceTrial(db, user).catch(() => {});
      } catch (e) {
        console.error('User sync error:', e);
      }

      goToDashboard();
    } catch (popupError: any) {
      const isCancellation =
        popupError?.code === 'auth/popup-closed-by-user' ||
        popupError?.code === 'auth/cancelled-popup-request' ||
        popupError?.code === 'auth/user-cancelled';

      if (!isCancellation) {
        console.error('Google Sign-Up Error:', popupError);
        toast({
          variant: 'destructive',
          title: 'Google Sign Up',
          description: popupError?.message || 'Could not complete Google sign-up. You can also sign up with email & password below.',
        });
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Name required',
        description: 'Please enter your full name.',
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Weak password',
        description: 'Password must be at least 6 characters long.',
      });
      return;
    }

    setIsLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        name: formData.name.trim(),
        email: user.email,
        createdAt: new Date().toISOString(),
        role: 'admin',
      }, { merge: true });

      await syncDeviceTrial(db, user).catch(() => {});

      const sessionData = {
        uid: user.uid,
        email: user.email,
        displayName: formData.name.trim(),
        photoURL: user.photoURL,
        isAnonymous: user.isAnonymous,
        emailVerified: user.emailVerified,
        isCached: true,
      };
      try {
        localStorage.setItem('voiceflow_auth_session', JSON.stringify(sessionData));
        localStorage.setItem('userEmail', formData.email.toLowerCase());
        localStorage.setItem('userName', formData.name.trim());
      } catch {}

      toast({
        title: 'Welcome!',
        description: 'Your account has been created successfully.',
      });
      goToDashboard();
    } catch (err: any) {
      console.error('Sign up error:', err);
      let message = 'Failed to create account. Please try again.';
      if (err?.code === 'auth/email-already-in-use') {
        message = 'This email is already registered. Please log in.';
      } else if (err?.message) {
        message = err.message;
      }
      toast({
        variant: 'destructive',
        title: 'Sign Up Error',
        description: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight font-clash">Create an account</h1>
          <p className="text-gray-500 font-medium">Enter your details below to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-semibold text-gray-700">Full Name</Label>
            <Input 
              id="name" 
              type="text" 
              placeholder="Your Name" 
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="h-12 bg-white text-black border-gray-200 focus:border-primary focus:ring-primary/20"
              required 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-semibold text-gray-700">Email</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="m@example.com" 
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="h-12 bg-white text-black border-gray-200 focus:border-primary focus:ring-primary/20"
              required 
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-semibold text-gray-700">Password</Label>
            <div className="relative">
              <Input 
                id="password" 
                type={showPassword ? "text" : "password"} 
                className="h-12 bg-white text-black border-gray-200 focus:border-primary focus:ring-primary/20 pr-10"
                value={formData.password}
                placeholder="At least 6 characters"
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required 
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 text-base font-semibold group mt-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>Sign up <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" /></>
            )}
          </Button>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase font-medium">
              <span className="bg-background px-3 text-muted-foreground tracking-wider">Or continue with</span>
            </div>
          </div>

          <Button 
            type="button" 
            variant="outline"
            onClick={handleGoogleSignup}
            className="w-full h-12 text-base font-semibold bg-background"
            disabled={isLoading || isGoogleLoading}
          >
            {isGoogleLoading ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            {isGoogleLoading ? 'Connecting to Google...' : 'Google'}
          </Button>
        </form>

        <div className="text-center pt-4">
          <p className="text-gray-600 font-medium">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-bold hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
