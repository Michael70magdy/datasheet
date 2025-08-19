// Import this from each page as a module.
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Replace with your own config from Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyDZypafzXFJp6llDReV3KdwAr1MrcvfZ6M",
  authDomain: "team-grade.firebaseapp.com",
  projectId: "team-grade",
  storageBucket: "team-grade.firebasestorage.app",
  messagingSenderId: "905391416822",
  appId: "1:905391416822:web:3acfde98ecdf54b33853d7",
  measurementId: "G-VJLYTE7MYD"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
