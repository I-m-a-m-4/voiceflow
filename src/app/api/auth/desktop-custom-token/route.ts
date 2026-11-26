import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminFirestore } from "@/firebase/admin";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Exchanges a verified browser Firebase ID token (from /auth/desktop-bridge) for:
 * 1. A real Firebase Custom Auth Token so the Tauri desktop WebView ALWAYS signs in genuinely
 *    via `signInWithCustomToken` (never left with `auth.currentUser === null`!).
 * 2. Guaranteed server-side Firestore `users/{uid}` + `businessInstances` provisioning so every
 *    Gmail/Google desktop signup IMMEDIATELY appears in the Admin dashboard.
 * 3. Automatic claiming of any pre-dashed admin credits (`pending_credit_dashes/{email}`).
 */
export async function POST(req: NextRequest) {
  try {
    if (!adminAuth || !adminFirestore) {
      return NextResponse.json(
        { error: "Firebase Admin SDK is not configured." },
        { status: 503, headers: CORS_HEADERS }
      );
    }

    const body = await req.json().catch(() => ({}));
    const idToken = typeof body?.idToken === "string" ? body.idToken.trim() : "";
    if (!idToken) {
      return NextResponse.json({ error: "Missing Firebase ID token" }, { status: 400, headers: CORS_HEADERS });
    }

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(idToken, true);
    } catch {
      return NextResponse.json({ error: "Invalid or expired ID token" }, { status: 401, headers: CORS_HEADERS });
    }

    const uid = decoded.uid;
    const rawEmail = (decoded.email || "").trim();
    const cleanEmail = rawEmail.toLowerCase();
    const displayName =
      (typeof decoded.name === "string" && decoded.name.trim()) ||
      (rawEmail ? rawEmail.split("@")[0] : "User");
    const photoURL = typeof decoded.picture === "string" ? decoded.picture : "";

    const userRef = adminFirestore.collection("users").doc(uid);
    const userSnap = await userRef.get();

    // Check if Admin pre-dashed credits/Pro for this email before signup
    let pendingDash: any = null;
    if (cleanEmail) {
      const pendingRef = adminFirestore.collection("pending_credit_dashes").doc(cleanEmail);
      const pendingSnap = await pendingRef.get();
      if (pendingSnap.exists) {
        pendingDash = pendingSnap.data();
      }
    }

    if (!userSnap.exists) {
      const bizRef = adminFirestore.collection("businessInstances").doc();
      const now = new Date();
      const isProPending = pendingDash?.isPro === true;
      const bonusMinsPending = typeof pendingDash?.bonusMinutesGranted === "number" ? pendingDash.bonusMinutesGranted : 0;

      const batch = adminFirestore.batch();
      batch.set(bizRef, {
        name: displayName || "My Workspace",
        ownerId: uid,
        plan: isProPending ? "pro" : "starter",
        status: "active",
        createdAt: now,
        settings: { currency: "USD", timezone: "UTC", defaultTaxRate: 0 },
      });

      const newUserDoc: Record<string, any> = {
        email: rawEmail,
        emailLower: cleanEmail,
        name: displayName,
        displayName,
        photoURL,
        businessId: bizRef.id,
        role: "admin",
        authProvider: decoded.firebase?.sign_in_provider === "google.com" ? "google" : "email",
        status: "active",
        surveyCompleted: false,
        createdAt: now,
        lastLoginAt: now,
      };

      if (isProPending) {
        newUserDoc.isPro = true;
        newUserDoc.planTier = "pro";
        newUserDoc.subscriptionPlan = pendingDash.subscriptionPlan || "Voiceflow Pro (Gifted by Admin)";
        newUserDoc.dashedBy = pendingDash.dashedBy || "admin";
        newUserDoc.dashedAt = now;
      }
      if (bonusMinsPending > 0) {
        newUserDoc.bonusMinutesGranted = bonusMinsPending;
        newUserDoc.dashedBy = pendingDash.dashedBy || "admin";
        newUserDoc.dashedAt = now;
      }

      batch.set(userRef, newUserDoc);
      if (pendingDash && cleanEmail) {
        batch.delete(adminFirestore.collection("pending_credit_dashes").doc(cleanEmail));
      }
      await batch.commit();
    } else {
      // Existing user: update lastLoginAt, ensure emailLower is populated, and apply any pending pre-dash
      const updates: Record<string, any> = {
        lastLoginAt: new Date(),
        emailLower: cleanEmail,
      };
      if (pendingDash) {
        if (pendingDash.isPro) {
          updates.isPro = true;
          updates.planTier = "pro";
          updates.subscriptionPlan = pendingDash.subscriptionPlan || "Voiceflow Pro (Gifted by Admin)";
        }
        if (typeof pendingDash.bonusMinutesGranted === "number" && pendingDash.bonusMinutesGranted > 0) {
          const curBonus = Number(userSnap.data()?.bonusMinutesGranted || 0);
          updates.bonusMinutesGranted = curBonus + pendingDash.bonusMinutesGranted;
        }
        updates.dashedBy = pendingDash.dashedBy || "admin";
        updates.dashedAt = new Date();
      }
      await userRef.set(updates, { merge: true });
      if (pendingDash && cleanEmail) {
        await adminFirestore.collection("pending_credit_dashes").doc(cleanEmail).delete().catch(() => {});
      }
    }

    const customToken = await adminAuth.createCustomToken(uid);

    return NextResponse.json(
      {
        ok: true,
        customToken,
        uid,
        email: rawEmail,
        displayName,
        photoURL,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error("desktop-custom-token error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to mint desktop auth token" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

