import { NextRequest, NextResponse } from "next/server";
import { SUBSCRIPTION_PLANS } from "@/lib/plans";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { userId, planId, amount, planName, email, name, origin, redirectUrl, currency } = await req.json();

    const userEmail = email || "user@voiceflow.space";
    const plan = SUBSCRIPTION_PLANS[planId];
    const finalAmount = amount || (plan ? plan.price : 11.99);
    const finalPlanName = planName || (plan ? plan.name : "Voiceflow Pro");
    const finalCurrency = (currency === "NGN" || currency === "ngn") ? "NGN" : "USD";

    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!secretKey) {
      console.error("FLUTTERWAVE_SECRET_KEY environment variable is missing.");
      return NextResponse.json(
        { error: "Payment gateway configuration error. Please contact administrator." },
        { status: 500 }
      );
    }

    const txRef = `tx-${userId || 'guest'}-${planId || 'pro'}-${Date.now()}`;
    
    // Resolve base URL dynamically so localhost requests always return back to localhost!
    const headerOrigin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    let refererOrigin: string | null = null;
    if (referer) {
      try {
        refererOrigin = new URL(referer).origin;
      } catch {}
    }

    const detectedOrigin = origin || headerOrigin || refererOrigin;
    let baseUrl = "http://localhost:3000";

    if (detectedOrigin && (detectedOrigin.includes("localhost") || detectedOrigin.includes("127.0.0.1") || detectedOrigin.startsWith("http://"))) {
      // Local development or custom port
      baseUrl = detectedOrigin;
    } else if (detectedOrigin && !detectedOrigin.startsWith("tauri://")) {
      baseUrl = detectedOrigin;
    } else if (process.env.NEXT_PUBLIC_BASE_URL) {
      baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    }

    const finalRedirectUrl = redirectUrl 
      ? `${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}tx_ref=${txRef}&plan_id=${planId || 'pro'}`
      : `${baseUrl}/dashboard?tx_ref=${txRef}&plan_id=${planId || 'pro'}`;

    // Call Flutterwave Standard Checkout API
    const response = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: finalAmount,
        currency: finalCurrency,
        redirect_url: finalRedirectUrl,
        meta: {
          user_id: userId || 'guest',
          plan_id: planId || 'pro',
        },
        customer: {
          email: userEmail,
          name: name || "Voiceflow User",
        },
        customizations: {
          title: `Upgrade to ${finalPlanName}`,
          description: `Subscription payment for Voiceflow ${finalPlanName}`,
          logo: `${baseUrl}/icon.svg`,
        },
      }),
    });

    const data = await response.json();

    if (data.status === "success" && data.data?.link) {
      return NextResponse.json({ url: data.data.link, txRef });
    } else {
      throw new Error(data.message || "Failed to generate payment link");
    }
  } catch (error: any) {
    console.error("Flutterwave checkout error:", error);
    return NextResponse.json({ error: error.message || "Failed to initiate payment" }, { status: 500 });
  }
}
