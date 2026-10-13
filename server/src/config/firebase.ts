import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  setLogLevel,
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocFromServer,
  runTransaction,
  Timestamp,
  collectionGroup
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

// Silence non-fatal gRPC idle stream disconnect warnings
setLogLevel('error');

// Load firebase-applet-config.json
let firebaseConfig: any = {
  projectId: 'argon-abbey-z9brs',
  appId: '1:720088090564:web:a5c5f6fbd57ea2e973c691',
  apiKey: 'AIzaSyAn4BIpCTezWyPoPpXa96SSP91zfLfqBzs',
  authDomain: 'argon-abbey-z9brs.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-remixremixservef-9ef5ae6f-16f7-43ef-8a7c-e5046035320b',
  storageBucket: 'argon-abbey-z9brs.firebasestorage.app',
  messagingSenderId: '720088090564'
};

try {
  const possiblePaths = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(__dirname, '../../../firebase-applet-config.json'),
  ];
  for (const configPath of possiblePaths) {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      firebaseConfig = JSON.parse(raw);
      break;
    }
  }
} catch (e) {
  // Use embedded Firebase config
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');

export {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  getDocFromServer,
  runTransaction,
  Timestamp,
  collectionGroup
};
