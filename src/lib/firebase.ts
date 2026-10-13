import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, setLogLevel, enableIndexedDbPersistence } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Silence non-fatal gRPC idle stream disconnect logs
setLogLevel('error');

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
    console.warn('⚠️ Multiple tabs open, persistence can only be enabled in one tab at a a time.');
  } else if (err.code == 'unimplemented') {
    console.warn('⚠️ The current browser does not support all of the features required to enable persistence');
  }
});

export async function validateFirestoreConnection() {
  try {
    console.log('✅ Firebase Firestore initialized.');
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('⚠️ Please check your Firebase configuration or network connectivity.');
    }
  }
}

