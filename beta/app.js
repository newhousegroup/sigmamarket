import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC0Ojzt2HxZzTwmUZsX9ZEZ31NiyNqo6B8",
  authDomain: "sigma-market-app.firebaseapp.com",
  projectId: "sigma-market-app",
  storageBucket: "sigma-market-app.firebasestorage.app",
  messagingSenderId: "1042846633134",
  appId: "1:1042846633134:web:ef61598314d0987ec6713f",
  measurementId: "G-WG84HP2QDH"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentUser = null;

window.onload = () => {
  const saved = localStorage.getItem('playerdata');
  if (saved) {
    const player = JSON.parse(saved);
    currentUser = player.username;
    document.getElementById("loginBox").style.display = "none";
    document.getElementById("gameBox").style.display = "block";
    document.getElementById("balance").textContent = player.balance;
    document.getElementById("loggedin").textContent = player.username;

    // Optionally fill inputs if needed:
    // document.getElementById("username").value = player.username;
    // document.getElementById("pin").value = player.pin;
  }
};

window.login = async function () {
  const username = document.getElementById("username").value.trim().toLowerCase();
  const pin = document.getElementById("pin").value.trim();

  if (!username || pin.length !== 4) {
    alert("Invalid username or PIN");
    return;
  }

  const userRef = doc(db, "playerdata", username);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    const data = userSnap.data();
    if (data.pin === pin) {
      currentUser = username;
      document.getElementById("loginBox").style.display = "none";
      document.getElementById("gameBox").style.display = "block";
      document.getElementById("balance").textContent = data.balance;
      document.getElementById("loggedin").textContent = data.username;

      localStorage.setItem('playerdata', JSON.stringify({
        username,
        pin,
        balance: data.balance
      }));

    } else {
      alert("Wrong PIN");
    }
  } else {
    const startingBalance = 1000;
    await setDoc(userRef, { pin, balance: startingBalance });
    currentUser = username;
    document.getElementById("loginBox").style.display = "none";
    document.getElementById("gameBox").style.display = "block";
    document.getElementById("balance").textContent = startingBalance;
    document.getElementById("loggedin").textContent = username;

    localStorage.setItem('playerdata', JSON.stringify({
      username,
      pin,
      balance: startingBalance
    }));
  }
};

const sendBtn = document.getElementById("send");
sendBtn.addEventListener("click", async () => {
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

  // Update balance display & localStorage
  const newBalance = senderData.balance - amount;
  document.getElementById("balance").textContent = newBalance;

  // Update localStorage
  const savedData = JSON.parse(localStorage.getItem('playerdata'));
  savedData.balance = newBalance;
  localStorage.setItem('playerdata', JSON.stringify(savedData));

  alert(`Sent $${amount} to ${recipient}`);
});
