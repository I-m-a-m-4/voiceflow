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

    // 2. Client IP lookup via ip-api.com (reliable, no Cloudflare block)
    const forwarded = req.headers.get("x-forwarded-for");
    const clientIp = forwarded ? forwarded.split(",")[0].trim() : (req.headers.get("x-real-ip") || "");
    const isLocal = !clientIp || clientIp === "127.0.0.1" || clientIp === "::1" || clientIp.startsWith("192.168.") || clientIp.startsWith("10.");

    const url = isLocal ? "http://ip-api.com/json" : `http://ip-api.com/json/${clientIp}`;
    const geoRes = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "VoiceFlow-IP-Detection" },
    });

    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (geoData.status === "success" || geoData.countryCode) {
        const isNigeria = 
          geoData.countryCode === "NG" || 
          geoData.country === "Nigeria" || 
          (typeof geoData.timezone === "string" && geoData.timezone.includes("Lagos"));

        return NextResponse.json({
          country: geoData.countryCode || (isNigeria ? "NG" : "US"),
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
