import { firestore } from './instance';
import { collection, addDoc, serverTimestamp, doc, getDoc, getDocs, query, where, orderBy, deleteDoc, updateDoc } from 'firebase/firestore';

export interface MeetingData {
  userId: string;
  transcript: string;
  summary?: string;
  title?: string;
  durationSeconds?: number;
  durationMinutes?: number;
  audioUrl?: string; // We can add audio storage later
  type: 'meeting' | 'dictation';
  createdAt?: any;
  updatedAt?: any;
}

export async function saveMeeting(data: Omit<MeetingData, 'createdAt'>) {
  if (!firestore) throw new Error("Firestore not initialized");
  
  const meetingsRef = collection(firestore, 'meetings');
  const docRef = await addDoc(meetingsRef, {
    ...data,
    createdAt: serverTimestamp(),
  });
  
  return docRef.id;
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

