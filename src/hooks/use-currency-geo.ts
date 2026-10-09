"use client";

import { useState, useEffect } from "react";

export type CurrencyCode = "USD" | "NGN";

export interface GeoCurrencyInfo {
  currency: CurrencyCode;
  currencySymbol: string;
  isNigeria: boolean;
  country: string;
  formatPrice: (usdPrice: number, ngnPrice: number) => string;
}

export function useCurrencyGeo(): GeoCurrencyInfo {
  const [isNigeria, setIsNigeria] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (tz.includes("Lagos") || tz.includes("Nigeria") || tz.includes("W. Central Africa")) {
        return true;
      }
      const languages = navigator.languages || [navigator.language || ""];
      if (languages.some(lang => lang.toLowerCase().includes("-ng") || lang.toLowerCase() === "ng")) {
        return true;
      }
    } catch {}
    return false;
  });

  const [country, setCountry] = useState<string>(() => (isNigeria ? "NG" : "US"));

  useEffect(() => {
    let clientDetectedNigeria = false;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      const languages = navigator.languages || [navigator.language || ""];
      if (
        tz.includes("Lagos") || 
        tz.includes("Nigeria") || 
        tz.includes("W. Central Africa") || 
        languages.some(lang => lang.toLowerCase().includes("-ng") || lang.toLowerCase() === "ng")
      ) {
        clientDetectedNigeria = true;
        setIsNigeria(true);
        setCountry("NG");
      }
    } catch {}

    // Query /api/geo endpoint
    fetch("/api/geo")
      .then((res) => res.json())
      .then((data) => {
        if (data.isNigeria || data.country === "NG") {
          setIsNigeria(true);
          setCountry("NG");
        } else if (!clientDetectedNigeria) {
          setIsNigeria(false);
          if (data.country) setCountry(data.country);
        }
      })
      .catch(() => {
        // Fallback: direct query to ip-api if /api/geo had network error
        if (!clientDetectedNigeria) {
          fetch("http://ip-api.com/json")
            .then((r) => r.json())
            .then((geo) => {
              if (geo.countryCode === "NG" || geo.country === "Nigeria" || (geo.timezone && geo.timezone.includes("Lagos"))) {
                setIsNigeria(true);
                setCountry("NG");
              }
            })
            .catch(() => {});
        }
      });
  }, []);

  const activeCurrency: CurrencyCode = isNigeria ? "NGN" : "USD";
  const currencySymbol = activeCurrency === "NGN" ? "₦" : "$";

  const formatPrice = (usdPrice: number, ngnPrice: number) => {
    if (activeCurrency === "NGN") {
      return `₦${ngnPrice.toLocaleString()}`;
    }
    return `$${usdPrice.toFixed(2)}`;
  };

  return {
    currency: activeCurrency,
    currencySymbol,
    isNigeria,
    country,
    formatPrice,
  };
}
