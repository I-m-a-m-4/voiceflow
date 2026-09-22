import { NextRequest, NextResponse } from "next/server";
import { SUBSCRIPTION_PLANS } from "@/lib/plans";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { userId, planId, email, name } = await req.json();

    if (!userId || !planId || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 });
    }

    // Free plan check
    if (plan.price === 0) {
      return NextResponse.json({ url: "/dashboard?success=true" });
    }

    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("Flutterwave secret key is not configured.");
    }

    const txRef = `tx-${userId}-${planId}-${Date.now()}`;
    
    // Call Flutterwave Standard Checkout API
    const response = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: plan.price,
        currency: "USD",
        redirect_url: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:9002"}/dashboard?success=true`,
        meta: {
          user_id: userId,
          plan_id: planId,
        },
        customer: {
          email: email,
          name: name || "Voiceflow User",
        },
        customizations: {
          title: plan.name,
          description: `Subscription for ${plan.name}`,
          logo: "https://voiceflow.space/logo.png",
        },
      }),
    });

    const data = await response.json();

    if (data.status === "success") {
      return NextResponse.json({ url: data.data.link });
    } else {
      throw new Error(data.message || "Failed to generate payment link");
    }
  } catch (error: any) {
    console.error("Flutterwave checkout error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
