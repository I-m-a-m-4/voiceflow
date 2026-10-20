import { firestore } from './instance';
import { collection, addDoc, serverTimestamp, doc, getDoc, getDocs, query, where, orderBy, deleteDoc, updateDoc } from 'firebase/firestore';

export interface ChatMessageItem {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export interface AssistItemData {
  prompt: string;
  type?: string;
  response: string;
  timestamp?: string;
}

export interface MeetingData {
  userId: string;
  transcript: string;
  summary?: string;
  title?: string;
  durationSeconds?: number;
  durationMinutes?: number;
  audioUrl?: string; // We can add audio storage later
  type: 'meeting' | 'dictation';
  chatMessages?: ChatMessageItem[];
  assists?: AssistItemData[];
  createdAt?: any;
  updatedAt?: any;
}

export async function saveMeeting(data: Omit<MeetingData, 'createdAt'>) {
  try {
    if (firestore) {
      const meetingsRef = collection(firestore, 'meetings');
      const docRef = await addDoc(meetingsRef, {
        ...data,
        createdAt: serverTimestamp(),
      });
      return docRef.id;
    }
  } catch (err) {
    console.warn("Remote saveMeeting failed (possibly offline). Saving locally:", err);
  }

  // Resilient offline fallback: save to localStorage so transcript is never lost
  const localId = `offline-${Date.now()}`;
  try {
    if (typeof window !== 'undefined') {
      const offlineList = JSON.parse(localStorage.getItem('voiceflow_offline_meetings') || '[]');
      offlineList.unshift({
        id: localId,
        ...data,
        createdAt: new Date().toISOString(),
        isOfflineBackup: true,
      });
      localStorage.setItem('voiceflow_offline_meetings', JSON.stringify(offlineList.slice(0, 30)));
    }
  } catch (e) {
    console.error("Critical: Failed to save offline meeting backup:", e);
  }
  return localId;
}

export function getOfflineMeetings(): (MeetingData & { id: string; isOfflineBackup?: boolean })[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('voiceflow_offline_meetings') || '[]');
  } catch {
    return [];
  }
}

export async function syncOfflineMeetings(): Promise<number> {
  if (typeof window === 'undefined' || !firestore) return 0;
  const offline = getOfflineMeetings();
  if (offline.length === 0) return 0;

  let synced = 0;
  const remaining: any[] = [];

  for (const item of offline) {
    try {
      const { id, isOfflineBackup, ...dataToSave } = item as any;
      const meetingsRef = collection(firestore, 'meetings');
      await addDoc(meetingsRef, {
        ...dataToSave,
        createdAt: serverTimestamp(),
        syncedFromOffline: true,
      });
      synced++;
    } catch (e) {
      remaining.push(item);
    }
  }

  localStorage.setItem('voiceflow_offline_meetings', JSON.stringify(remaining));
  return synced;
}

export async function updateMeeting(meetingId: string, data: Partial<MeetingData>, userId?: string) {
  if (!firestore) throw new Error("Firestore not initialized");

  const meetingRef = doc(firestore, 'meetings', meetingId);
  await updateDoc(meetingRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });

  if (userId) {
    try {
      const userMeetingRef = doc(firestore, `users/${userId}/meetings/${meetingId}`);
      await updateDoc(userMeetingRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Subcollection might not exist, ignore
    }
  }
}

export async function getUserMeetings(userId: string) {
  if (!firestore) throw new Error("Firestore not initialized");
  
  const meetingsRef = collection(firestore, 'meetings');
  const q = query(meetingsRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

export async function deleteMeeting(meetingId: string, userId?: string) {
  if (!firestore) throw new Error("Firestore not initialized");
  
  // 1. Delete from root 'meetings'
  try {
    const meetingRef = doc(firestore, 'meetings', meetingId);
    await deleteDoc(meetingRef);
  } catch (err) {
    console.warn("Could not delete from root meetings collection:", err);
  }

  // 2. Delete from user subcollection if userId is provided
  if (userId) {
    try {
      const userMeetingRef = doc(firestore, `users/${userId}/meetings/${meetingId}`);
      await deleteDoc(userMeetingRef);
    } catch (err) {
      console.warn("Could not delete from user meetings subcollection:", err);
    }
  }
}

export interface MeetingCheckInData {
  meetingId: string;
  userId: string;
  userName: string;
  userEmail: string;
  notes?: string;
  location?: string;
  checkInTime?: any;
}

export async function saveMeetingCheckIn(data: Omit<MeetingCheckInData, 'checkInTime'>) {
  if (!firestore) throw new Error("Firestore not initialized");

  const checkInsRef = collection(firestore, 'meeting_checkins');
  const docRef = await addDoc(checkInsRef, {
    ...data,
    checkInTime: serverTimestamp(),
  });

  return docRef.id;
}

export async function getMeetingCheckIns(meetingId: string) {
  if (!firestore) throw new Error("Firestore not initialized");

  const checkInsRef = collection(firestore, 'meeting_checkins');
  const q = query(checkInsRef, where('meetingId', '==', meetingId), orderBy('checkInTime', 'desc'));

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

