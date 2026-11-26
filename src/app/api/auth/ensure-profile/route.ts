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
 * Authoritative, idempotent server-side profile provisioning for any signed-in user.
 *
 * Guarantees that EVERY Firebase Auth user (email/password, Google web popup/redirect,
 * desktop OAuth bridge, or legacy account logging back in) has both a `users/{uid}`
 * profile and a linked `businessInstances/{id}` workspace — eliminating client-side
 * Firestore security-rule rejections and navigation race conditions.
 *
 * Also claims any pre-granted `pending_credit_dashes/{emailLower}` automatically.
 */
export async function POST(req: NextRequest) {
  try {
    if (!adminAuth || !adminFirestore) {
      return NextResponse.json(
        { error: "Firebase Admin SDK is not configured on the server." },
        { status: 503, headers: CORS_HEADERS }
      );
    }

    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!bearer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(bearer, true);
    } catch {
      return NextResponse.json({ error: "Invalid or expired ID token" }, { status: 401, headers: CORS_HEADERS });
    }

    const body = await req.json().catch(() => ({}));
    const requestedName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 120) : "";
    const requestedPhone = typeof body?.phone === "string" ? body.phone.trim().slice(0, 40) : "";

    const uid = decoded.uid;
    let authUser: any = null;
    try {
      authUser = await adminAuth.getUser(uid);
    } catch {
      authUser = null;
    }

    const rawEmail = String(authUser?.email || decoded.email || "").trim();
    const cleanEmail = rawEmail.toLowerCase();
    const displayName =
      requestedName ||
      String(authUser?.displayName || decoded.name || "").trim() ||
      (rawEmail ? rawEmail.split("@")[0] : "User");
    const photoURL = String(authUser?.photoURL || decoded.picture || "");

    const providerId =
      authUser?.providerData?.[0]?.providerId ||
      decoded.firebase?.sign_in_provider ||
      "password";
    const authProvider = providerId === "google.com" ? "google" : "email";

    const now = new Date();
    const createdAt = authUser?.metadata?.creationTime
      ? new Date(authUser.metadata.creationTime)
      : now;

    // Persist displayName back onto Firebase Auth if it was empty (e.g. email/password signups)
    if (requestedName && authUser && !authUser.displayName) {
      await adminAuth.updateUser(uid, { displayName: requestedName }).catch(() => {});
    }

    const userRef = adminFirestore.collection("users").doc(uid);
    const userSnap = await userRef.get();

    // Check for pre-granted admin credits / Pro plan waiting on this email
    let pendingDash: any = null;
    if (cleanEmail) {
      const pendingSnap = await adminFirestore.collection("pending_credit_dashes").doc(cleanEmail).get();
      if (pendingSnap.exists) {
        pendingDash = pendingSnap.data();
      }
    }

    if (!userSnap.exists) {
      const bizRef = adminFirestore.collection("businessInstances").doc();
      const isProPending = pendingDash?.isPro === true;
      const bonusMinsPending =
        typeof pendingDash?.bonusMinutesGranted === "number" ? pendingDash.bonusMinutesGranted : 0;

      const batch = adminFirestore.batch();

      batch.set(bizRef, {
        name: displayName || "My Workspace",
        ownerId: uid,
        plan: isProPending ? "pro" : "starter",
        status: "active",
        createdAt,
        settings: { currency: "USD", timezone: "UTC", defaultTaxRate: 0 },
      });

      const newUserDoc: Record<string, any> = {
        email: rawEmail,
        emailLower: cleanEmail,
        name: displayName,
        displayName,
        photoURL,
        phone: requestedPhone || "",
        businessId: bizRef.id,
        role: "admin",
        authProvider,
        status: "active",
        surveyCompleted: false,
        createdAt,
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

      return NextResponse.json(
        { ok: true, uid, created: true, businessId: bizRef.id },
        { headers: CORS_HEADERS }
      );
    }

    // Existing profile: backfill any missing metadata (`businessId`, `emailLower`, `name`, `createdAt`) and claim pending dashes
    const existing = userSnap.data() || {};
    let businessId = existing.businessId;
    const updates: Record<string, any> = {
      lastLoginAt: now,
    };

    if (cleanEmail && existing.emailLower !== cleanEmail) {
      updates.emailLower = cleanEmail;
    }
    if (rawEmail && !existing.email) {
      updates.email = rawEmail;
    }
    if (displayName && !existing.name) {
      updates.name = displayName;
    }
    if (displayName && !existing.displayName) {
      updates.displayName = displayName;
    }
    if (photoURL && !existing.photoURL) {
      updates.photoURL = photoURL;
    }
    if (!existing.authProvider) {
      updates.authProvider = authProvider;
    }
    if (!existing.createdAt) {
      updates.createdAt = createdAt;
    }

    const batch = adminFirestore.batch();

    if (!businessId) {
      const bizRef = adminFirestore.collection("businessInstances").doc();
      businessId = bizRef.id;
      updates.businessId = businessId;
      batch.set(bizRef, {
        name: existing.name || displayName || "My Workspace",
        ownerId: uid,
        plan: existing.isPro || pendingDash?.isPro ? "pro" : "starter",
        status: "active",
        createdAt,
        settings: { currency: "USD", timezone: "UTC", defaultTaxRate: 0 },
      });
    }

    if (pendingDash) {
      if (pendingDash.isPro) {
        updates.isPro = true;
        updates.planTier = "pro";
        updates.subscriptionPlan = pendingDash.subscriptionPlan || "Voiceflow Pro (Gifted by Admin)";
        if (businessId) {
          batch.set(
            adminFirestore.collection("businessInstances").doc(businessId),
            { plan: "pro", updatedAt: now },
            { merge: true }
          );
        }
      }
      if (typeof pendingDash.bonusMinutesGranted === "number" && pendingDash.bonusMinutesGranted > 0) {
        const curBonus = Number(existing.bonusMinutesGranted || 0);
        updates.bonusMinutesGranted = curBonus + pendingDash.bonusMinutesGranted;
      }
      updates.dashedBy = pendingDash.dashedBy || "admin";
      updates.dashedAt = now;
      if (cleanEmail) {
        batch.delete(adminFirestore.collection("pending_credit_dashes").doc(cleanEmail));
      }
    }

    batch.set(userRef, updates, { merge: true });
    await batch.commit();

    return NextResponse.json(
      { ok: true, uid, created: false, businessId },
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error("ensure-profile error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to ensure user profile" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

