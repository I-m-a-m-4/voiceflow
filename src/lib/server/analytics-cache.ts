import { adminFirestore } from '@/firebase/admin';

export async function getCachedPlatformAnalytics(forceRefresh = false) {
  if (!adminFirestore) {
    throw new Error("Firebase Admin not initialized.");
  }

  const cacheDocRef = adminFirestore.collection('admin_analytics').doc('overview');
  let cacheDoc: any = null;

  try {
    cacheDoc = await cacheDocRef.get();
  } catch (e) {
    console.error("Failed to fetch cache doc:", e);
  }

  const now = new Date();
  const CACHE_TTL_HOURS = 6;

  if (!forceRefresh && cacheDoc?.exists) {
    const data = cacheDoc.data();
    const lastUpdated = data?.lastUpdated?.toDate();

    if (lastUpdated && (now.getTime() - lastUpdated.getTime()) < CACHE_TTL_HOURS * 60 * 60 * 1000) {
      return { ...data, fromCache: true };
    }
  }

  try {
    const [usersSnap, businessSnap] = await Promise.all([
      adminFirestore.collection('users').select('id').get(),
      adminFirestore.collection('businessInstances').get(),
    ]);

    const users = usersSnap.docs;
    const businesses = businessSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    const analyticsPayload = {
      totalUsers: users.length,
      totalBusinesses: businesses.length,
      lastUpdated: now,
      fromCache: false
    };

    try {
      await cacheDocRef.set(analyticsPayload);
    } catch (e) {
      console.warn("Could not update analytics cache:", e);
    }

    return analyticsPayload;
  } catch (error: any) {
    if (cacheDoc?.exists) {
      return { ...cacheDoc.data(), fromCache: true, fallback: true };
    }
    throw error;
  }
}
