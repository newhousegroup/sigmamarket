import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

let currentUser = null;

// Restore session on load
window.onload = () => {
  const saved = localStorage.getItem("playerdata");
  if (saved) {
    const player = JSON.parse(saved);
    currentUser = player.username;
    showGameUI(player.username, player.balance);
  } else {
    document.getElementById("logintext").style.display = "none";
  }
};

// Enter key login
["username", "pin"].forEach(id => {
  document.getElementById(id).addEventListener("keypress", (e) => {
    if (e.key === "Enter") login();
  });
});

window.login = async function () {
  const username = document.getElementById("username").value.trim().toLowerCase();
  const pin = document.getElementById("pin").value.trim();

  if (!username || (pin.length !== 4 && username !== "admin")) {
    alert("Invalid username or PIN");
    return;
  }

  const userRef = doc(db, "playerdata", username);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    alert("Username not found. Please sign up first.");
    return;
  }

  const data = userSnap.data();
  if (data.pin === pin) {
    currentUser = username;
    saveAndShow(username, pin, data.balance);
  } else {
    alert("Wrong PIN");
  }
};


function saveAndShow(username, pin, balance) {
  localStorage.setItem("playerdata", JSON.stringify({ username, pin, balance }));
  showGameUI(username, balance);
}

function showGameUI(username, balance) {
  document.getElementById("loginBox").style.display = "none";
  document.getElementById("logintext").style.display = "block";
  document.getElementById("loggedin").textContent = username;

  if (username === "admin") {
    document.getElementById("gameBox").style.display = "none";
    // Future: show admin panel here
  } else {
    document.getElementById("gameBox").style.display = "block";
    document.getElementById("balance").textContent = balance;
  }
}

document.getElementById("send").addEventListener("click", async () => {
  const recipient = document.getElementById("recipient").value.trim().toLowerCase();
  const amount = parseFloat(document.getElementById("amount").value);

  if (!recipient || isNaN(amount) || amount <= 0) {
    alert("Invalid recipient or amount");
    return;
  }

  const senderRef = doc(db, "playerdata", currentUser);
  const recipientRef = doc(db, "playerdata", recipient);

  const [senderSnap, recipientSnap] = await Promise.all([
    getDoc(senderRef),
    getDoc(recipientRef)
  ]);

  if (!recipientSnap.exists()) {
    alert("Recipient does not exist");
    return;
  }

  const senderData = senderSnap.data();
  const recipientData = recipientSnap.data();

  if (senderData.balance < amount) {
    alert("Not enough balance");
    return;
  }

  await updateDoc(senderRef, { balance: senderData.balance - amount });
  await updateDoc(recipientRef, { balance: recipientData.balance + amount });

  const newBalance = senderData.balance - amount;
  document.getElementById("balance").textContent = newBalance;

  const saved = JSON.parse(localStorage.getItem("playerdata"));
  saved.balance = newBalance;
  localStorage.setItem("playerdata", JSON.stringify(saved));

  alert(`Sent $${amount} to ${recipient}`);
});

window.logout = function () {
  localStorage.removeItem("playerdata");
  currentUser = null;

  document.getElementById("loginBox").style.display = "block";
  document.getElementById("gameBox").style.display = "none";
  document.getElementById("logintext").style.display = "none";
  document.getElementById("loggedin").textContent = "";
  document.getElementById("balance").textContent = "...";

  document.getElementById("username").value = "";
  document.getElementById("pin").value = "";
};

window.prelogout = function () {
  if (confirm("Are you sure you want to log out?")) logout();
};

window.signUp = async function () {
  const username = prompt("Enter a username:")?.trim().toLowerCase();
  if (!username) {
    alert("Signup canceled.");
    return;
  }

  const pin = prompt("Enter a 4-digit PIN:")?.trim();
  if (!pin || pin.length !== 4 || isNaN(pin)) {
    alert("Invalid PIN. Signup canceled.");
    return;
  }

  const userRef = doc(db, "playerdata", username);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    alert("Username already taken.");
    return;
  }

  const startingBalance = 1000;
  await setDoc(userRef, { pin, balance: startingBalance });
  currentUser = username;
  saveAndShow(username, pin, startingBalance);
  alert("Welcome to Sigma Market Online!");
};
