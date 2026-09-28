// ============================================================
// FIREBASE SETUP — fill in .env.local (copy .env.local.example)
// with your project's values to sync this app across devices in
// real time. Until you do, the app works fine on its own using
// this browser's local storage. See console.firebase.google.com
// to get these six values.
// ============================================================
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export let syncEnabled = false;
export let db = null;
export let auth = null;
export let docRef = null;

try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    docRef = doc(db, "mm-miles", "shared-data");
    syncEnabled = true;
  }
} catch (e) {
  console.error("Firebase init failed", e);
  syncEnabled = false;
}
