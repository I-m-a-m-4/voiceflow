import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    // 1. Check standard geolocation headers (Vercel, Cloudflare, etc.)
    const countryHeader = 
      req.headers.get("x-vercel-ip-country") ||
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-country-code");

    if (countryHeader) {
      const isNigeria = countryHeader.toUpperCase() === "NG";
      return NextResponse.json({
        country: countryHeader.toUpperCase(),
        currency: isNigeria ? "NGN" : "USD",
        currencySymbol: isNigeria ? "₦" : "$",
        isNigeria,
      });
    }

    // 2. Fallback to client IP lookup
    const forwarded = req.headers.get("x-forwarded-for");
    const clientIp = forwarded ? forwarded.split(",")[0].trim() : (req.headers.get("x-real-ip") || "");

    if (clientIp && clientIp !== "127.0.0.1" && clientIp !== "::1" && !clientIp.startsWith("192.168.") && !clientIp.startsWith("10.")) {
      const geoRes = await fetch(`https://ipapi.co/${clientIp}/json/`, {
        next: { revalidate: 3600 },
        headers: { "User-Agent": "VoiceFlow-IP-Detection" },
      });

      if (geoRes.ok) {
        const geoData = await geoRes.json();
        const isNigeria = geoData.country_code === "NG" || geoData.country === "NG";
        return NextResponse.json({
          country: geoData.country_code || "US",
          currency: isNigeria ? "NGN" : "USD",
          currencySymbol: isNigeria ? "₦" : "$",
          isNigeria,
        });
      }
    }

    // Default to international USD
    return NextResponse.json({
      country: "US",
      currency: "USD",
      currencySymbol: "$",
      isNigeria: false,
    });
  } catch (error: any) {
    return NextResponse.json({
      country: "US",
      currency: "USD",
      currencySymbol: "$",
      isNigeria: false,
    });
  }
}
