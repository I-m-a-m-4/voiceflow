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

type DashType = "pro" | "minutes" | "reset" | "revoke";

/**
 * Super-Admin authoritative Credit & Pro Dashing endpoint.
 *
 * Fixes every failure mode of the old client-side Dash Credits flow:
 * 1. Case-insensitive email matching across BOTH Firebase Auth (`getUserByEmail`) and Firestore `users`.
 * 2. If the user signed up in Firebase Auth without a Firestore doc yet, creates their real `users/{uid}`
 *    + `businessInstances` workspace immediately instead of creating an orphaned duplicate random-ID doc.
 * 3. If the user hasn't signed up yet, saves to `pending_credit_dashes/{cleanEmail}` so credits activate
 *    automatically the instant they sign up.
 * 4. Updates `users/{uid}`, `businessInstances/{businessId}`, AND all linked `devices/{deviceId}` records
 *    (clearing `trialExceeded`, `screenCaptureCount`, `deviceTrialExceeded`), logs to `admin_dashes`,
 *    and sends an in-app notification to the recipient!
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

    const body = await req.json();
    const rawEmail = typeof body?.email === "string" ? body.email.trim() : "";
    const cleanEmail = rawEmail.toLowerCase();
    const dashType: DashType = ["pro", "minutes", "reset", "revoke"].includes(body?.dashType)
      ? body.dashType
      : "pro";
    const minutesAmount = Math.max(1, Math.min(100000, Number(body?.minutesAmount) || 300));
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) : "Gifted by Admin";
    const adminEmail = decoded.email || SUPER_ADMIN_EMAIL;

    if (!cleanEmail || !cleanEmail.includes("@")) {
      return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400, headers: CORS_HEADERS });
    }

    // 1. Resolve user from Firebase Auth first (authoritative UID, case-insensitive!)
    let authUser: any = null;
    try {
      authUser = await adminAuth.getUserByEmail(cleanEmail);
    } catch {
      authUser = null;
    }

    // 2. Also find any matching Firestore `users` docs (case-insensitive scan fallback if needed)
    const matchedDocIds = new Set<string>();
    const existingUsersData: Record<string, any> = {};

    if (authUser?.uid) {
      const uidSnap = await adminFirestore.collection("users").doc(authUser.uid).get();
      if (uidSnap.exists) {
        matchedDocIds.add(uidSnap.id);
        existingUsersData[uidSnap.id] = uidSnap.data();
      }
    }

    // Check exact lowercase email, raw email, and emailLower fields
    const queries = [
      adminFirestore.collection("users").where("emailLower", "==", cleanEmail).get(),
      adminFirestore.collection("users").where("email", "==", cleanEmail).get(),
    ];
    if (rawEmail !== cleanEmail) {
      queries.push(adminFirestore.collection("users").where("email", "==", rawEmail).get());
    }
    const querySnaps = await Promise.all(queries);
    for (const snap of querySnaps) {
      snap.docs.forEach((d: any) => {
        matchedDocIds.add(d.id);
        existingUsersData[d.id] = d.data();
      });
    }

    // Fallback case-insensitive match across users collection if Auth didn't match (rare mixed-case docs)
    if (!authUser && matchedDocIds.size === 0) {
      const allUsersSnap = await adminFirestore.collection("users").select("email", "businessId", "deviceId", "bonusMinutesGranted", "usedMinutes", "isPro").get();
      allUsersSnap.docs.forEach((d: any) => {
        const em = String(d.data()?.email || "").trim().toLowerCase();
        if (em === cleanEmail) {
          matchedDocIds.add(d.id);
          existingUsersData[d.id] = d.data();
        }
      });
    }

    const now = new Date();
    const buildUserPayload = (existing: any) => {
      if (dashType === "pro") {
        return {
          isPro: true,
          planTier: "pro",
          subscriptionPlan: "Voiceflow Pro (Gifted by Admin)",
          deviceTrialExceeded: false,
          screenCaptureCount: 0,
          dashedBy: adminEmail,
          dashedAt: now,
          dashNote: note,
          updatedAt: now,
        };
      }
      if (dashType === "minutes") {
        const currentBonus = typeof existing?.bonusMinutesGranted === "number" ? existing.bonusMinutesGranted : 0;
        return {
          bonusMinutesGranted: currentBonus + minutesAmount,
          deviceTrialExceeded: false,
          screenCaptureCount: 0,
          dashedBy: adminEmail,
          dashedAt: now,
          dashNote: note,
          updatedAt: now,
        };
      }
      if (dashType === "reset") {
        return {
          usedMinutes: 0,
          sessionCount: 0,
          screenCaptureCount: 0,
          deviceTrialExceeded: false,
          dashedBy: adminEmail,
          dashedAt: now,
          dashNote: note,
          updatedAt: now,
        };
      }
      // revoke
      return {
        isPro: false,
        planTier: "starter",
        subscriptionPlan: "Basic Plan",
        updatedAt: now,
      };
    };

    let mode: "updated_existing" | "backfilled_auth_user" | "pre_granted_pending" = "updated_existing";
    let primaryUid = authUser?.uid || Array.from(matchedDocIds)[0] || "";
    const touchedDeviceIds = new Set<string>();
    const touchedBusinessIds = new Set<string>();

    // Case A: User exists in Firebase Auth but had NO Firestore doc -> backfill cleanly!
    if (authUser && !matchedDocIds.has(authUser.uid)) {
      mode = "backfilled_auth_user";
      const bizRef = adminFirestore.collection("businessInstances").doc();
      const userRef = adminFirestore.collection("users").doc(authUser.uid);
      const displayName = authUser.displayName || cleanEmail.split("@")[0] || "User";
      const providerId = authUser.providerData?.[0]?.providerId || "password";
      const payload = buildUserPayload(null);

      const batch = adminFirestore.batch();
      batch.set(bizRef, {
        name: displayName,
        ownerId: authUser.uid,
        plan: dashType === "pro" ? "pro" : "starter",
        status: "active",
        createdAt: authUser.metadata?.creationTime ? new Date(authUser.metadata.creationTime) : now,
        settings: { currency: "USD", timezone: "UTC", defaultTaxRate: 0 },
      });
      batch.set(userRef, {
        email: authUser.email || rawEmail,
        emailLower: cleanEmail,
        name: displayName,
        displayName,
        photoURL: authUser.photoURL || "",
        businessId: bizRef.id,
        role: "admin",
        authProvider: providerId === "google.com" ? "google" : "email",
        status: "active",
        surveyCompleted: false,
        createdAt: authUser.metadata?.creationTime ? new Date(authUser.metadata.creationTime) : now,
        ...payload,
      });
      await batch.commit();
      primaryUid = authUser.uid;
      touchedBusinessIds.add(bizRef.id);
    }

    // Case B: Update all matched existing Firestore user docs
    for (const docId of matchedDocIds) {
      const existing = existingUsersData[docId] || {};
      const payload = buildUserPayload(existing);
      await adminFirestore.collection("users").doc(docId).set({ ...payload, emailLower: cleanEmail }, { merge: true });
      if (existing.deviceId) touchedDeviceIds.add(existing.deviceId);
      if (existing.businessId) touchedBusinessIds.add(existing.businessId);
    }

    // Case C: User has NOT signed up anywhere yet -> store cleanly in `pending_credit_dashes/{cleanEmail}`
    if (!authUser && matchedDocIds.size === 0) {
      mode = "pre_granted_pending";
      const pendingRef = adminFirestore.collection("pending_credit_dashes").doc(cleanEmail);
      const prevPending = (await pendingRef.get()).data() || null;
      await pendingRef.set(
        {
          email: cleanEmail,
          ...buildUserPayload(prevPending),
          createdAt: prevPending?.createdAt || now,
        },
        { merge: true }
      );
    }

    // Update linked businessInstances plan when gifting/revoking Pro
    if (dashType === "pro" || dashType === "revoke") {
      for (const bizId of touchedBusinessIds) {
        await adminFirestore
          .collection("businessInstances")
          .doc(bizId)
          .set(
            {
              plan: dashType === "pro" ? "pro" : "starter",
              updatedAt: now,
            },
            { merge: true }
          )
          .catch(() => {});
      }
    }

    // Unblock ALL hardware device records associated with this email or deviceId
    try {
      const devSnap = await adminFirestore
        .collection("devices")
        .where("registeredEmails", "array-contains", cleanEmail)
        .get();
      devSnap.docs.forEach((d: any) => touchedDeviceIds.add(d.id));
    } catch {
      // ignore
    }

    for (const devId of touchedDeviceIds) {
      await adminFirestore
        .collection("devices")
        .doc(devId)
        .set(
          {
            trialExceeded: dashType === "revoke" ? undefined : false,
            hasPro: dashType === "pro" ? true : dashType === "revoke" ? false : undefined,
            isPro: dashType === "pro" ? true : dashType === "revoke" ? false : undefined,
            usedMinutes: dashType === "reset" || dashType === "pro" ? 0 : undefined,
            sessionCount: dashType === "reset" || dashType === "pro" ? 0 : undefined,
            screenCaptureCount: dashType !== "revoke" ? 0 : undefined,
            updatedAt: now,
          },
          { merge: true }
        )
        .catch(() => {});
    }

    // Send in-app notification to the user if they have a UID
    if (primaryUid && dashType !== "revoke") {
      const notifTitle =
        dashType === "pro"
          ? "Voiceflow Pro Activated!"
          : dashType === "minutes"
            ? `+${minutesAmount} Bonus Minutes Added!`
            : "Your Usage Limits Were Reset!";
      const notifBody =
        dashType === "pro"
          ? "You have been gifted unlimited Voiceflow Pro access by the admin team."
          : dashType === "minutes"
            ? `An admin gifted you +${minutesAmount} free bonus minutes. Enjoy uninterrupted sessions!`
            : "Your session and minute limits have been reset to zero.";

      await adminFirestore
        .collection(`users/${primaryUid}/notifications`)
        .add({
          title: notifTitle,
          message: notifBody,
          type: "credit_dash",
          read: false,
          createdAt: now,
        })
        .catch(() => {});
    }

    // Audit log
    await adminFirestore.collection("admin_dashes").add({
      adminEmail,
      recipientEmail: cleanEmail,
      recipientUid: primaryUid || null,
      dashType,
      minutesAmount: dashType === "minutes" ? minutesAmount : null,
      note,
      resolutionMode: mode,
      devicesUpdated: touchedDeviceIds.size,
      createdAt: now,
    });

    return NextResponse.json(
      {
        ok: true,
        email: cleanEmail,
        uid: primaryUid || null,
        dashType,
        minutesAmount: dashType === "minutes" ? minutesAmount : null,
        resolutionMode: mode,
        devicesUnblocked: touchedDeviceIds.size,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error("Admin dash-credits error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to dash credits" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

