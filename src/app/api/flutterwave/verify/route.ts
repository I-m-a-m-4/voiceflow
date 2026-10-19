import { NextRequest, NextResponse } from "next/server";
import { adminFirestore } from "@/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const { transaction_id, tx_ref, userId, planId, planName, amount, currency } = await req.json();

    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { error: "Payment gateway configuration error (missing secret key)." },
        { status: 500 }
      );
    }

    let isVerified = false;
    let flwData: any = null;

    if (transaction_id) {
      // Verify directly with Flutterwave API
      const response = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
      });

      const resData = await response.json();
      if (resData.status === "success" && resData.data?.status === "successful") {
        isVerified = true;
        flwData = resData.data;
      } else {
        return NextResponse.json(
          { error: resData.message || "Payment verification failed with Flutterwave" },
          { status: 400 }
        );
      }
    } else if (tx_ref) {
      // Verify via transaction reference query
      const response = await fetch(`https://api.flutterwave.com/v3/transactions/verify-by-reference?tx_ref=${encodeURIComponent(tx_ref)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
      });

      const resData = await response.json();
      if (resData.status === "success" && resData.data?.status === "successful") {
        isVerified = true;
        flwData = resData.data;
      }
    }

    if (!isVerified) {
      return NextResponse.json(
        { error: "Could not verify payment transaction." },
        { status: 400 }
      );
    }

    const effectiveUserId = userId || flwData?.meta?.user_id;
    const effectivePlanId = planId || flwData?.meta?.plan_id || "pro";
    const effectivePlanName = planName || (effectivePlanId === "pro" ? "Voiceflow Pro" : "Voiceflow Unlimited");

    // Server-side upgrade activation in Firestore
    if (adminFirestore && effectiveUserId && effectiveUserId !== "guest") {
      try {
        await adminFirestore.collection("users").doc(effectiveUserId).set({
          isPro: true,
          planTier: effectivePlanId,
          subscriptionPlan: effectivePlanName,
          updatedAt: FieldValue.serverTimestamp(),
          paymentRef: tx_ref || flwData?.tx_ref,
        }, { merge: true });

        // Record purchase for admin analytics
        await adminFirestore.collection("purchases").add({
          userId: effectiveUserId,
          userEmail: flwData?.customer?.email || "",
          userName: flwData?.customer?.name || "Voiceflow User",
          plan: effectivePlanName,
          planId: effectivePlanId,
          amount: amount || flwData?.amount || 11.99,
          currency: currency || flwData?.currency || "USD",
          status: "completed",
          type: "subscription",
          paymentMethod: "Flutterwave",
          txRef: tx_ref || flwData?.tx_ref || "",
          transactionId: flwData?.id || transaction_id || null,
          createdAt: FieldValue.serverTimestamp(),
          date: FieldValue.serverTimestamp(),
        });
      } catch (dbErr) {
        console.warn("Failed to update user in Firestore via admin:", dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      status: "successful",
      data: flwData,
    });
  } catch (error: any) {
    console.error("Flutterwave verification error:", error);
    return NextResponse.json({ error: error.message || "Failed to verify transaction" }, { status: 500 });
  }
}
