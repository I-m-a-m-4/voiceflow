"use client";

import { useState, useEffect } from "react";

export type CurrencyCode = "USD" | "NGN";

export interface GeoCurrencyInfo {
  currency: CurrencyCode;
  currencySymbol: string;
  isNigeria: boolean;
  country: string;
  setCurrency: (c: CurrencyCode) => void;
  formatPrice: (usdPrice: number, ngnPrice: number) => string;
}

export function useCurrencyGeo(): GeoCurrencyInfo {
  const [currency, setCurrencyState] = useState<CurrencyCode>("USD");
  const [isNigeria, setIsNigeria] = useState<boolean>(false);
  const [country, setCountry] = useState<string>("US");

  useEffect(() => {
    // 1. Check cached preference in localStorage
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("voiceflow_currency") as CurrencyCode | null;
      if (saved === "NGN" || saved === "USD") {
        setCurrencyState(saved);
        if (saved === "NGN") setIsNigeria(true);
      }
    }

    // 2. Client time zone check as fast immediate hint
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (timeZone.includes("Lagos") || timeZone.includes("Africa/Lagos")) {
        setCurrencyState((prev) => (localStorage.getItem("voiceflow_currency") as CurrencyCode) || "NGN");
        setIsNigeria(true);
      }
    } catch {}

    // 3. Query /api/geo endpoint
    fetch("/api/geo")
      .then((res) => res.json())
      .then((data) => {
        if (data.country) setCountry(data.country);
        if (data.isNigeria) {
          setIsNigeria(true);
          const saved = localStorage.getItem("voiceflow_currency");
          if (!saved) {
            setCurrencyState("NGN");
          }
        }
      })
      .catch(() => {});
  }, []);

  const setCurrency = (c: CurrencyCode) => {
    setCurrencyState(c);
    if (typeof window !== "undefined") {
      localStorage.setItem("voiceflow_currency", c);
    }
  };

  const currencySymbol = currency === "NGN" ? "₦" : "$";

  const formatPrice = (usdPrice: number, ngnPrice: number) => {
    if (currency === "NGN") {
      return `₦${ngnPrice.toLocaleString()}`;
    }
    return `$${usdPrice.toFixed(2)}`;
  };

  return {
    currency,
    currencySymbol,
    isNigeria,
    country,
    setCurrency,
    formatPrice,
  };
}
