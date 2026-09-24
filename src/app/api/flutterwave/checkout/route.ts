import { NextRequest, NextResponse } from "next/server";
import { SUBSCRIPTION_PLANS } from "@/lib/plans";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { userId, planId, amount, planName, email, name } = await req.json();

    const userEmail = email || "user@voiceflow.space";
    const plan = SUBSCRIPTION_PLANS[planId];
    const finalAmount = amount || (plan ? plan.price : 11.99);
    const finalPlanName = planName || (plan ? plan.name : "Voiceflow Pro");

    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY || "FLWSECK-43d41d0befc821edd7a9b6a098ae827b-1a0a6503a4avt-X";

    const txRef = `tx-${userId || 'guest'}-${planId || 'pro'}-${Date.now()}`;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (req.headers.get("origin") || "http://localhost:3000");

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
        currency: "USD",
        redirect_url: `${baseUrl}/dashboard?success=true`,
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
      return NextResponse.json({ url: data.data.link });
    } else {
      throw new Error(data.message || "Failed to generate payment link");
    }
  } catch (error: any) {
    console.error("Flutterwave checkout error:", error);
    return NextResponse.json({ error: error.message || "Failed to initiate payment" }, { status: 500 });
  }
}
