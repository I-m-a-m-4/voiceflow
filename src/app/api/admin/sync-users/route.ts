import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminFirestore } from "@/firebase/admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPER_ADMIN_UIDS = new Set([
  "jzQgCHzaObeUbeYklTLtQQh03G53",
  "LfWAXxvz3ihDd30hLdv5vBgYq6w2",
]);
const SUPER_ADMIN_EMAIL = "belloimam431@gmail.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Super-Admin endpoint that reconciles Firebase Auth users with Firestore `users/{uid}`.
 * Any user who signed up in Firebase Auth (e.g. via email/password or desktop OAuth bridge)
 * whose client-side Firestore write was interrupted or rejected is automatically backfilled
 * so they appear immediately in Admin Users and Dashboard analytics.
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
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401, headers: CORS_HEADERS });
    }

    const isOwner =
      SUPER_ADMIN_UIDS.has(decoded.uid) ||
      (decoded.email && decoded.email.toLowerCase() === SUPER_ADMIN_EMAIL);
    if (!isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: CORS_HEADERS });
    }

    // 1. Collect all Firebase Auth users (paginated up to 5,000)
    const authUsers: Array<{
      uid: string;
      email: string;
      displayName: string;
      photoURL: string;
      createdAt: string;
      lastSignInTime: string;
      authProvider: string;
    }> = [];

    let nextPageToken: string | undefined;
    let pages = 0;
    do {
      const page = await adminAuth.listUsers(1000, nextPageToken);
      for (const u of page.users) {
        if (!u.email && !u.displayName) continue;
        const providerId = u.providerData?.[0]?.providerId || "password";
        authUsers.push({
          uid: u.uid,
          email: u.email || "",
          displayName: u.displayName || (u.email ? u.email.split("@")[0] : "User"),
          photoURL: u.photoURL || "",
          createdAt: u.metadata.creationTime
            ? new Date(u.metadata.creationTime).toISOString()
            : new Date().toISOString(),
          lastSignInTime: u.metadata.lastSignInTime
            ? new Date(u.metadata.lastSignInTime).toISOString()
            : "",
          authProvider: providerId === "google.com" ? "google" : "email",
        });
      }
      nextPageToken = page.pageToken;
      pages++;
    } while (nextPageToken && pages < 5);

    // 2. Fetch existing Firestore user IDs
    const existingSnap = await adminFirestore.collection("users").select("email", "createdAt").get();
    const existingIds = new Set(existingSnap.docs.map((d: { id: string }) => d.id));

    // 3. Backfill any missing Auth users into Firestore `users` + `businessInstances`
    const missing = authUsers.filter((u) => !existingIds.has(u.uid));
    const newlySyncedEmails: string[] = [];

    // Preload any pending admin credit dashes so backfilled users receive pre-granted Pro/minutes automatically
    const pendingDashMap = new Map<string, any>();
    if (missing.length > 0) {
      const pendingSnap = await adminFirestore.collection("pending_credit_dashes").get().catch(() => null);
      if (pendingSnap) {
        pendingSnap.docs.forEach((d: any) => {
          pendingDashMap.set(d.id.toLowerCase(), d.data());
        });
      }
    }

    const chunkSize = 150;
    for (let i = 0; i < missing.length; i += chunkSize) {
      const slice = missing.slice(i, i + chunkSize);
      const batch = adminFirestore.batch();

      for (const u of slice) {
        const bizRef = adminFirestore.collection("businessInstances").doc();
        const userRef = adminFirestore.collection("users").doc(u.uid);
        const createdDate = new Date(u.createdAt);
        const cleanEmail = (u.email || "").trim().toLowerCase();
        const pendingDash = cleanEmail ? pendingDashMap.get(cleanEmail) : null;
        const isProPending = pendingDash?.isPro === true;
        const bonusMinsPending =
          typeof pendingDash?.bonusMinutesGranted === "number" ? pendingDash.bonusMinutesGranted : 0;

        batch.set(bizRef, {
          name: u.displayName || "My Workspace",
          ownerId: u.uid,
          plan: isProPending ? "pro" : "starter",
          status: "active",
          createdAt: createdDate,
          settings: { currency: "USD", timezone: "UTC", defaultTaxRate: 0 },
          syncedFromAuth: true,
        });

        const userDoc: Record<string, any> = {
          email: u.email,
          emailLower: cleanEmail,
          name: u.displayName,
          displayName: u.displayName,
          photoURL: u.photoURL || "",
          businessId: bizRef.id,
          role: "admin",
          authProvider: u.authProvider,
          status: "active",
          surveyCompleted: false,
          createdAt: createdDate,
          lastLoginAt: u.lastSignInTime ? new Date(u.lastSignInTime) : createdDate,
          syncedFromAuth: true,
        };

        if (isProPending) {
          userDoc.isPro = true;
          userDoc.planTier = "pro";
          userDoc.subscriptionPlan = pendingDash.subscriptionPlan || "Voiceflow Pro (Gifted by Admin)";
          userDoc.dashedBy = pendingDash.dashedBy || "admin";
          userDoc.dashedAt = new Date();
        }
        if (bonusMinsPending > 0) {
          userDoc.bonusMinutesGranted = bonusMinsPending;
          userDoc.dashedBy = pendingDash.dashedBy || "admin";
          userDoc.dashedAt = new Date();
        }

        batch.set(userRef, userDoc);

        if (pendingDash && cleanEmail) {
          batch.delete(adminFirestore.collection("pending_credit_dashes").doc(cleanEmail));
        }

        if (u.email) newlySyncedEmails.push(u.email);
      }

      await batch.commit();
    }

    return NextResponse.json(
      {
        ok: true,
        totalAuthUsers: authUsers.length,
        existingFirestoreUsers: existingIds.size,
        backfilledCount: missing.length,
        newlySyncedEmails: newlySyncedEmails.slice(0, 25),
      },
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error("Admin sync-users failed:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to sync Auth users" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

