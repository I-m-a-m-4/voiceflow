import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error("Firebase admin initialization error in webhook:", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("verif-hash");
    const secretHash = process.env.FLUTTERWAVE_SECRET_HASH || process.env.FLUTTERWAVE_SECRET_KEY;
    
    // In production, you should set a FLUTTERWAVE_SECRET_HASH in your flutterwave dashboard
    // and verify it here to ensure the webhook is actually from Flutterwave.
    if (!signature || signature !== secretHash) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();

    // Only process successful payments
    if (payload.event === "charge.completed" && payload.data.status === "successful") {
      const { user_id, plan_id } = payload.data.meta;
      
      if (user_id && plan_id && admin.apps.length > 0) {
        const db = admin.firestore();
        await db.collection("users").doc(user_id).set({
          subscriptionPlan: plan_id,
          subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentRef: payload.data.tx_ref
        }, { merge: true });
        
        console.log(`Successfully updated user ${user_id} to plan ${plan_id}`);
      }
    }

    return NextResponse.json({ status: "success" });
  } catch (error: any) {
    console.error("Flutterwave webhook error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
