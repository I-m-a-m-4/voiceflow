'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

declare global {
  interface Window {
    FlutterwaveCheckout?: (config: FlutterwaveConfig) => { close: () => void };
  }
}

export interface FlutterwaveConfig {
  public_key: string;
  tx_ref: string;
  amount: number;
  currency: string;
  payment_options?: string;
  customer: {
    email: string;
    phone_number?: string;
    name?: string;
  };
  customizations?: {
    title?: string;
    description?: string;
    logo?: string;
  };
  callback: (response: FlutterwaveResponse) => void;
  onclose: () => void;
  meta?: Record<string, string | number>;
}

export interface FlutterwaveResponse {
  status: string;
  transaction_id: number;
  tx_ref: string;
  flw_ref: string;
  amount: number;
  currency: string;
  charged_amount: number;
  charge_response_code: string;
  charge_response_message: string;
  created_at: string;
  payment_type: string;
  account_id: number;
  customer: { name: string; phone_number: string; email: string };
}

export interface UseFlutterwaveConfig {
  amount: number;
  currency?: string;
  email: string;
  name?: string;
  phone?: string;
  plan?: string; // 'pro_monthly' | 'pro_yearly' | 'biz_monthly' | 'biz_yearly'
  onSuccess?: (response: FlutterwaveResponse) => void;
  onClose?: () => void;
}

const SCRIPT_URL = 'https://checkout.flutterwave.com/v3.js';
const SCRIPT_ID = 'flutterwave-sdk';
let scriptPromise: Promise<void> | null = null;

const loadScript = (): Promise<void> => {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.FlutterwaveCheckout) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => {
        scriptPromise = null;
        existing.remove();
        reject(new Error('Flutterwave SDK failed to load.'));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;

    const timeout = setTimeout(() => {
      scriptPromise = null;
      script.remove();
      reject(new Error('Flutterwave SDK load timed out'));
    }, 15000);

    script.onload = () => {
      clearTimeout(timeout);
      resolve();
    };

    script.onerror = () => {
      clearTimeout(timeout);
      scriptPromise = null;
      script.remove();
      reject(new Error('Flutterwave SDK failed to load.'));
    };

    document.body.appendChild(script);
  });

  return scriptPromise;
};

export const useFlutterwave = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const initializePayment = useCallback(async (config: UseFlutterwaveConfig) => {
    setIsLoading(true);

    try {
      await loadScript();
    } catch {
      toast({
        variant: 'destructive',
        title: 'Payment Gateway Error',
        description: 'Could not connect to payment gateway. Please check your internet and try again.',
      });
      config.onClose?.();
      setIsLoading(false);
      return;
    }

    if (!window.FlutterwaveCheckout) {
      toast({
        variant: 'destructive',
        title: 'Payment Gateway Error',
        description: 'Payment system is temporarily unavailable. Please try again.',
      });
      config.onClose?.();
      setIsLoading(false);
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY || 'FLWPUBK-33162c3bb2bb347a6606f3e44645f1c9-X';

    const txRef = `VF-${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;

    window.FlutterwaveCheckout({
      public_key: publicKey,
      tx_ref: txRef,
      amount: config.amount,
      currency: config.currency || 'NGN',
      payment_options: 'card, ussd, bank_transfer',
      customer: {
        email: config.email,
        name: config.name,
        phone_number: config.phone,
      },
      customizations: {
        title: 'VoiceFlow',
        description: config.plan ? `VoiceFlow ${config.plan} subscription` : 'VoiceFlow subscription',
        logo: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/logo.png`,
      },
      meta: {
        plan: config.plan || '',
      },
      callback: async (response) => {
        setIsLoading(false);
        if (response.status === 'successful') {
          // Verify on server side
          try {
            const verifyRes = await fetch('/api/flutterwave/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transaction_id: response.transaction_id }),
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              config.onSuccess?.(response);
            } else {
              toast({
                variant: 'destructive',
                title: 'Payment Verification Failed',
                description: 'We could not verify your payment. Please contact support.',
              });
            }
          } catch {
            toast({
              variant: 'destructive',
              title: 'Verification Error',
              description: 'Could not verify payment. Please contact support with your transaction ID.',
            });
          }
        } else {
          toast({
            variant: 'destructive',
            title: 'Payment Failed',
            description: `Your payment did not go through (${response.charge_response_message}). Please try again.`,
          });
          config.onClose?.();
        }
      },
      onclose: () => {
        setIsLoading(false);
        config.onClose?.();
      },
    });
  }, [toast]);

  return { isLoading, initializePayment };
};

export default useFlutterwave;
