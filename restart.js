import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase config
/*
const firebaseConfig = {
  apiKey: "AIzaSyC0Ojzt2HxZzTwmUZsX9ZEZ31NiyNqo6B8",
  authDomain: "sigma-market-app.firebaseapp.com",
  projectId: "sigma-market-app",
  storageBucket: "sigma-market-app.appspot.com",
  messagingSenderId: "1042846633134",
  appId: "1:1042846633134:web:ef61598314d0987ec6713f",
  measurementId: "G-WG84HP2QDH"
};*/

const firebaseConfig = {
  apiKey: "AIzaSyCCuyWXzIU33FGrqMEzmtKfB-VTSyq303c",
  authDomain: "portals1.firebaseapp.com",
  projectId: "portals1",
  storageBucket: "portals1.firebasestorage.app",
  messagingSenderId: "270398409173",
  appId: "1:270398409173:web:1ef55962bceb910661155c"
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const headingEl = document.getElementById("heading");
const noteEl = document.getElementById("note");

// Animate dots
let dots = 0;
const dotsInterval = setInterval(() => {
  dots = (dots + 1) % 4;
  headingEl.textContent = "Server restarting" + ".".repeat(dots);
}, 500);

// Listen to server status
const statusRef = doc(db, "server", "status");

const unsubscribe = onSnapshot(statusRef, (statusDoc) => {
  if (statusDoc.exists()) {
    const data = statusDoc.data();

    // Update admin note
    if (data.note !== undefined) {
      noteEl.textContent = "Admin note: " + data.note;
    }

    // If server is back online
    if (data.stopped === false) {
      reconnect();
    }
  }
}, (error) => {
  console.error("Error listening to server status:", error);
});

function reconnect() {
  clearInterval(dotsInterval);
  unsubscribe(); // Stop listening for changes
  headingEl.textContent = "Reconnecting...";
  setTimeout(() => {
    window.location.href = "index.html";
  }, 1000);
}
