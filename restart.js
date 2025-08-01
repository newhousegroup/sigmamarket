import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyC0Ojzt2HxZzTwmUZsX9ZEZ31NiyNqo6B8",
  authDomain: "sigma-market-app.firebaseapp.com",
  projectId: "sigma-market-app",
  storageBucket: "sigma-market-app.appspot.com",
  messagingSenderId: "1042846633134",
  appId: "1:1042846633134:web:ef61598314d0987ec6713f",
  measurementId: "G-WG84HP2QDH"
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

// Track the interval so we can stop it
const statusCheckInterval = setInterval(checkServerStatus, 1000);

async function checkServerStatus() {
  try {
    const statusDoc = await getDoc(doc(db, "server", "status"));
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
  } catch (error) {
    console.error("Error checking server status:", error);
  }
}

function reconnect() {
  clearInterval(statusCheckInterval);
  clearInterval(dotsInterval);
  headingEl.textContent = "Reconnecting...";
  setTimeout(() => {
    window.location.href = "index.html";
  }, 1000);
}