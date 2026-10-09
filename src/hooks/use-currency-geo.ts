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
  const [currency, setCurrencyState] = useState<CurrencyCode>("USD");
  const [isNigeria, setIsNigeria] = useState<boolean>(false);
  const [country, setCountry] = useState<string>("US");

  useEffect(() => {
    // 1. Client time zone check as fast immediate hint
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (timeZone.includes("Lagos") || timeZone.includes("Africa/Lagos") || timeZone.includes("Nigeria")) {
        setCurrencyState("NGN");
        setIsNigeria(true);
        setCountry("NG");
      }
    } catch {}

    // 2. Query /api/geo endpoint
    fetch("/api/geo")
      .then((res) => res.json())
      .then((data) => {
        if (data.country) setCountry(data.country);
        if (data.isNigeria || data.country === "NG") {
          setIsNigeria(true);
          setCurrencyState("NGN");
        } else {
          setIsNigeria(false);
          setCurrencyState("USD");
        }
      })
      .catch(() => {});
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
