// SNS Dental Clinic - Firebase Configuration
// Loaded with your custom app configuration & updated to Firebase v10.12.2 SDK imports

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBU-tQ2E-0g9mM37mJOxiFBKAq7xscfS3E",
  authDomain: "sns-dental-clinic.firebaseapp.com",
  projectId: "sns-dental-clinic",
  storageBucket: "sns-dental-clinic.firebasestorage.app",
  messagingSenderId: "53643928467",
  appId: "1:53643928467:web:03e6162afa8507cbf5be66"
};

// Check if credentials are still placeholder and log a friendly reminder
const isPlaceholder = firebaseConfig.apiKey.startsWith("YOUR_");

if (isPlaceholder) {
  console.warn(
    "%c[SNS Dental Clinic] %cFirebase SDK Loaded: Please replace 'YOUR_API_KEY' inside '/firebase/firebase-config.js' with your actual Firebase web API key to complete the connection.",
    "color: #0f62fe; font-weight: bold; font-size: 13px;",
    "color: #d97706; font-size: 13px;"
  );
}

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication (Needed for secure admin login panel)
const auth = getAuth(app);

// Initialize Cloud Firestore Database
const db = getFirestore(app);

// Export db and auth to keep all dashboard and form features operational
export { app, auth, db };
