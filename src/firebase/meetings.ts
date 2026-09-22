import { firestore } from './instance';
import { collection, addDoc, serverTimestamp, doc, getDoc, getDocs, query, where, orderBy, deleteDoc } from 'firebase/firestore';

export interface MeetingData {
  userId: string;
  transcript: string;
  summary?: string;
  audioUrl?: string; // We can add audio storage later
  type: 'meeting' | 'dictation';
  createdAt?: any;
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

export async function deleteMeeting(meetingId: string) {
  if (!firestore) throw new Error("Firestore not initialized");
  
  const meetingRef = doc(firestore, 'meetings', meetingId);
  await deleteDoc(meetingRef);
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

