import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore, collection, doc, getDoc, setDoc, updateDoc,
  runTransaction, query, onSnapshot, serverTimestamp,
  deleteDoc, getDocs, increment, addDoc, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =========================
   Firebase init
========================= */
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

/* =========================
   Globals / constants
========================= */
const MAX_BOOST = 3.0;

let currentUser = null;

/** Market + Inventory
 * inventory/{username} = { dia, med, ino }
 * market/{listingId} = { seller, item, price, created }
 * stock/{item} = { remaining }  // only for globally limited items (dia, med)
 */
const ITEMS = {
  dia: { name: "Diamond 💎", globallyLimited: true },
  med: { name: "Gold Medal 🏅", globallyLimited: true },
  ino: { name: "Innocamp Coin 🪙", globallyLimited: false }
};

const GLOBAL_STOCK_DEFAULTS = {
  dia: 8,
  med: 8
};

/* =========================
   Startup
========================= */
window.onload = async () => {
  const saved = localStorage.getItem("playerdata");
  if (saved) {
    const player = JSON.parse(saved);
    currentUser = player.username;

    showGameUI(player.username, player.balance);

    // Core watchers
    startBalancePolling();
    watchSlaveStatus();
    workerMenu();

    // Boost watcher
    watchBoost();

    // Inventory + Market watchers
    await ensureInventory();
    watchInventory();
    watchMarket();

    // (Optional) ensure stock docs exist — only does anything if missing
    // You can also call this manually as admin: ensureStockDocs()
    ensureStockDocs().catch(() => {});
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

/* =========================
   Login / Signup
========================= */
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

    startBalancePolling();
    watchSlaveStatus();
    workerMenu();

    watchBoost();

    await ensureInventory();
    watchInventory();
    watchMarket();
    ensureStockDocs().catch(() => {});
  } else {
    alert("Wrong PIN");
  }
};

function saveAndShow(username, pin, balance) {
  localStorage.setItem("playerdata", JSON.stringify({ username, pin, balance }));
  showGameUI(username, balance);
  loadLeaderboard();
}

function showGameUI(username, balance) {
  document.getElementById("loginBox").style.display = "none";
  document.getElementById("logintext").style.display = "block";
  document.getElementById("loggedin").textContent = username;

  document.getElementById("gameBox").style.display = "block";
  document.getElementById("balance").textContent = balance;
}

function usernameTest(s) {
  return /^[a-z0-9]+$/g.test(s);
}

window.signUp = async function () {
  const username = prompt("Enter a username:")?.trim().toLowerCase();
  if (!username) {
    alert("Signup canceled.");
    return;
  }
  if (!usernameTest(username) || username === "none") {
    alert("Invalid username.");
    return;
  }

  const pin = prompt("Enter a 4-digit PIN:")?.trim();
  if (!pin || pin.length !== 4 || isNaN(pin)) {
    alert("Invalid PIN.");
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

  await ensureInventory();
  watchInventory();
  watchMarket();
  ensureStockDocs().catch(() => {});

  alert("Welcome to Sigma Market Online!");

  startBalancePolling();
  watchSlaveStatus();
  workerMenu();

  watchBoost();
};

/* =========================
   Bank - send money
========================= */
document.getElementById("send").addEventListener("click", async () => {
  const recipient = document.getElementById("recipient").value.trim().toLowerCase();
  const amount = parseFloat(document.getElementById("amount").value);

  if (!recipient || isNaN(amount) || amount <= 0) {
    alert("Invalid recipient or amount");
    return;
  }

  if (recipient === currentUser) {
    alert("Cannot send money to yourself");
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
  const balanceEl = document.getElementById("balance");
  const currentDisplayed = parseInt(balanceEl.textContent) || 0;
  animateNumber(balanceEl, currentDisplayed, newBalance);

  const saved = JSON.parse(localStorage.getItem("playerdata")) || {};
  saved.balance = newBalance;
  localStorage.setItem("playerdata", JSON.stringify(saved));

  alert(`Sent $${amount} to ${recipient}`);
});

/* =========================
   Logout rule (workers can't)
========================= */
window.logout = async function () {
  if (!currentUser) return;

  const workerRef = doc(db, "workers", currentUser);
  const workerSnap = await getDoc(workerRef);

  // Only block logout if worker doc exists AND slave === true
  if (workerSnap.exists()) {
    const data = workerSnap.data();
    if (data.slave === true) {
      alert("You cannot log out because you are a worker.");
      return;
    }
  }

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

/* =========================
   Redeem codes (money)
========================= */
window.redeemCode = async function () {
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }

  const codeInput = document.getElementById("redeemID").value.trim();

  if (!codeInput) {
    alert("Please enter a code.");
    return;
  }

  if (codeInput === "indian") {
    alert("WHY DID YOU REDEEM IT");
    document.getElementById("redeemID").value = "";
    return;
  }

  const redeemedCodes = JSON.parse(localStorage.getItem("redeemedCodes")) || [];
  if (redeemedCodes.includes(codeInput)) {
    alert("You’ve already redeemed this code.");
    return;
  }

  const codeRef = doc(db, "codes", codeInput);
  const playerRef = doc(db, "playerdata", currentUser);

  try {
    await runTransaction(db, async (transaction) => {
      const codeSnap = await transaction.get(codeRef);
      if (!codeSnap.exists()) throw new Error("Invalid code.");

      const codeData = codeSnap.data();
      if (codeData.uses <= 0) throw new Error("This code has already been fully redeemed.");

      const playerSnap = await transaction.get(playerRef);
      const playerData = playerSnap.exists() ? playerSnap.data() : { balance: 0 };

      const newBalance = (playerData.balance || 0) + codeData.amount;

      transaction.update(playerRef, { balance: newBalance });
      transaction.update(codeRef, { uses: codeData.uses - 1 });
    });

    const updatedPlayerSnap = await getDoc(playerRef);
    const updatedBalance = updatedPlayerSnap.data().balance;

    alert("Code redeemed successfully!");

    const balanceEl = document.getElementById("balance");
    const currentDisplayed = parseInt(balanceEl.textContent) || 0;
    animateNumber(balanceEl, currentDisplayed, updatedBalance);

    const saved = JSON.parse(localStorage.getItem("playerdata")) || {};
    saved.balance = updatedBalance;
    localStorage.setItem("playerdata", JSON.stringify(saved));

    redeemedCodes.push(codeInput);
    localStorage.setItem("redeemedCodes", JSON.stringify(redeemedCodes));
  } catch (err) {
    alert(err.message || "Something went wrong. Please try again.");
    console.error(err);
  }

  document.getElementById("redeemID").value = "";
};

/* =========================
   Balance snapshot + master cut
========================= */
function startBalancePolling() {
  if (!currentUser) return;

  const playerRef = doc(db, "playerdata", currentUser);
  const workerRef = doc(db, "workers", currentUser);

  let lastBalance = null;

  onSnapshot(playerRef, async (snap) => {
    if (!snap.exists()) return;

    const newBalance = snap.data().balance;
    const localData = JSON.parse(localStorage.getItem("playerdata")) || {};

    if (lastBalance === null) lastBalance = newBalance;

    const diff = newBalance - lastBalance;

    if (localData.balance !== newBalance) {
      const balanceEl = document.getElementById("balance");
      const currentDisplayed = parseInt(balanceEl.textContent) || 0;
      animateNumber(balanceEl, currentDisplayed, newBalance);

      localData.balance = newBalance;
      localStorage.setItem("playerdata", JSON.stringify(localData));
      console.log("[Snapshot] Balance updated to:", newBalance);
    }

    // Master cut logic
    const workerSnap = await getDoc(workerRef);
    if (workerSnap.exists()) {
      const data = workerSnap.data();
      if (data.slave === true && data.master && diff > 0) {
        const masterRef = doc(db, "playerdata", data.master);

        await runTransaction(db, async (transaction) => {
          const masterSnap = await transaction.get(masterRef);
          const slaveSnap = await transaction.get(playerRef);
          if (!masterSnap.exists() || !slaveSnap.exists()) return;

          const masterCut = Math.floor(diff * 0.4);
          const newSlaveBalance = slaveSnap.data().balance - masterCut;

          transaction.update(masterRef, { balance: increment(masterCut) });
          transaction.update(playerRef, { balance: newSlaveBalance });

          console.log(`[Master Cut] ${data.master} earned $${masterCut}`);
        });
      }
    }

    lastBalance = newBalance;
  }, (error) => {
    console.error("Snapshot listener error:", error);
  });
}

/* =========================
   Number animation
========================= */
function animateNumber(element, start, end, duration = 500) {
  const startTimestamp = performance.now();
  const step = (currentTime) => {
    const progress = Math.min((currentTime - startTimestamp) / duration, 1);
    const currentValue = Math.floor(progress * (end - start) + start);
    element.textContent = currentValue;
    if (progress < 1) requestAnimationFrame(step);
    else element.textContent = end;
  };
  requestAnimationFrame(step);
}

/* =========================
   Confetti + jackpot overlay
========================= */
window.win = function (amount, display) {
  console.log(`win function ${amount}, ${display}`);
  amount = Math.floor(amount);

  if (amount <= 0) return;

  if (amount <= 10) {
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
  } else if (amount <= 100) {
    confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
  } else {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0, 0, 0, 0.85)";
    overlay.style.zIndex = "9999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.flexDirection = "column";
    overlay.style.color = "white";
    overlay.style.textAlign = "center";
    overlay.style.fontWeight = "bold";

    const jackpotText = document.createElement("div");
    jackpotText.innerHTML = `JACKPOT<br>$${display}`;
    jackpotText.style.fontSize = "0";
    jackpotText.style.opacity = "0";
    jackpotText.style.animation = "jackpotZoom 1s ease-out forwards";

    overlay.appendChild(jackpotText);
    document.body.appendChild(overlay);

    let confettiInterval = setInterval(() => {
      confetti({ particleCount: 200, spread: 120, origin: { y: 0.6 } });
    }, 400);

    let fireworkInterval = setInterval(() => {
      confetti({ particleCount: 100, angle: 60, spread: 55, origin: { x: 0, y: 0.6 } });
      confetti({ particleCount: 100, angle: 120, spread: 55, origin: { x: 1, y: 0.6 } });
    }, 600);

    setTimeout(() => {
      clearInterval(confettiInterval);
      clearInterval(fireworkInterval);
      overlay.style.animation = "fadeOut 0.5s ease forwards";
      setTimeout(() => document.body.removeChild(overlay), 500);
    }, 5000);
  }
};

const style = document.createElement("style");
style.innerHTML = `
@keyframes jackpotZoom {
  0% { font-size: 0; opacity: 0; transform: scale(0.2); }
  50% { font-size: 20vw; opacity: 1; transform: scale(1.2); white-space:nowrap }
  100% { font-size: 15vw; opacity: 1; transform: scale(1); white-space:nowrap }
}
@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}`;
document.head.appendChild(style);

/* =========================
   Global boost (limited)
========================= */
const boostRef = doc(db, "server", "boost");
let boost = 1;

window.increaseBoost = async function () {
  const snap = await getDoc(boostRef);
  if (!snap.exists()) return;

  let currentBoost = boost;
  currentBoost += 0.045;

  // HARD LIMIT
  currentBoost = Math.min(currentBoost, MAX_BOOST);

  await updateDoc(boostRef, {
    boost: currentBoost,
    lastUpdated: Date.now()
  });
};

window.watchBoost = function () {
  const boostBar = document.getElementById("boostBar");
  const boostValue = document.getElementById("boostValue");

  let lastUpdatedLocal = Date.now();
  let baseBoost = 1;

  onSnapshot(boostRef, (snap) => {
    if (!snap.exists()) return;
    let { boost: storedBoost = 1, lastUpdated = Date.now() } = snap.data();
    baseBoost = storedBoost;
    lastUpdatedLocal = lastUpdated;
  });

  function tick() {
    const now = Date.now();
    const elapsed = (now - lastUpdatedLocal) / 1000;

    const displayBoost = Math.max(1, baseBoost - 0.003 * elapsed);

    boostValue.textContent = displayBoost.toFixed(3) + "x";
    const width = Math.min(displayBoost - 1, 1) * 100;
    boostBar.style.width = width + "%";

    boost = displayBoost;
    requestAnimationFrame(tick);
  }

  tick();
};

/* =========================
   Spin
========================= */
window.spin = async function () {
  const spinBtn = document.getElementById("spin");
  spinBtn.disabled = true;

  try {
    const spinCode = document.getElementById("spinCode").value.trim();
    if (!spinCode || isNaN(spinCode) || parseInt(spinCode) <= 0) {
      alert("Please enter a valid amount to spin.");
      return;
    }

    const spinval = parseInt(spinCode);
    const amount = Math.log2(spinval + 1) * Math.sqrt(spinval);
    const playerRef = doc(db, "playerdata", currentUser);
    const playerSnap = await getDoc(playerRef);

    if (!playerSnap.exists()) {
      alert("Player data not found. Please log in again.");
      return;
    }

    const playerData = playerSnap.data();
    if (spinval > playerData.balance) {
      alert("You don't have enough balance to spin that amount.");
      return;
    }

    const spinResultEl = document.getElementById("spinResult");
    spinResultEl.innerHTML = "Spinning";
    let dots = "";
    const spinInterval = setInterval(() => {
      dots = dots.length < 3 ? dots + "." : "";
      spinResultEl.innerHTML = `Spinning${dots}`;
    }, 300);

    await new Promise(resolve => setTimeout(resolve, 2000));
    clearInterval(spinInterval);
    spinResultEl.innerHTML = "Please wait";
    await new Promise(resolve => setTimeout(resolve, 200));

    const random = Math.floor(Math.random() * 240) + 1;
    let result = 0;
    let mult = 0;

    const restricted = [];

    if (restricted.includes(currentUser)) {
      if (random <= 120) mult = -(Math.random() * 0.5 + 0.5);
      else if (random <= 220) mult = (Math.random() * 3 + 2);
      else if (random <= 236) mult = 9;
      else if (random <= 239) mult = 24;
      else mult = 200;
    } else {
      if (random <= 100) mult = -(Math.random() * 0.5 + 0.5);
      else if (random <= 216) mult = (Math.random() * 3 + 2);
      else if (random <= 234) mult = 9;
      else if (random <= 239) mult = 24;
      else mult = 200;
    }

    if (mult < 0) result = spinval * mult;
    else result = amount * mult * boost;

    result = Math.floor(result);
    win(mult, result);

    increaseBoost();

    const newBalance = playerData.balance + result;
    await updateDoc(playerRef, { balance: newBalance });

    const balanceEl = document.getElementById("balance");
    const currentDisplayed = parseInt(balanceEl.textContent) || 0;
    animateNumber(balanceEl, currentDisplayed, newBalance);

    const saved = JSON.parse(localStorage.getItem("playerdata")) || {};
    saved.balance = newBalance;
    localStorage.setItem("playerdata", JSON.stringify(saved));

    if (result < 0) {
      spinResultEl.innerHTML = `You <b>lost</b> $${-result}`;
    } else if (mult === 200) {
      spinResultEl.innerHTML = `You <b>won</b> $${result}<br><b id="jackpot">JACKPOT</b>`;
      const jackpotEl = document.getElementById("jackpot");
      let colors = ["yellow", "green", "blue", "indigo", "violet", "red", "orange"];
      let i = 0;
      const interval = setInterval(() => {
        jackpotEl.style.color = colors[i % colors.length];
        i++;
        if (i > 20) {
          clearInterval(interval);
          jackpotEl.style.display = "none";
        }
      }, 75);
    } else {
      spinResultEl.innerHTML = `You <b>won</b> $${result}`;
    }
  } finally {
    spinBtn.disabled = false;
  }
};

/* =========================
   Server status watchdog
========================= */
const serverRef = doc(db, "server", "status");
let alerted = false;

if (!window.location.pathname.includes("beta")) {
  onSnapshot(serverRef, (snap) => {
    if (!snap.exists()) return;
    const stopped = snap.data().stopped;
    if (stopped === true && !alerted) {
      alerted = true;
      alert("Server restarting");
      window.location.href = "restart.html";
    }
  }, (err) => {
    console.error("Error watching server status:", err);
  });
}

window.signupoptions = function () {
  signUp();
};

/* =========================
   Formatting helpers
========================= */
function formatNumber(num) {
  if (num >= 1e12) return (num / 1e12).toFixed(1).replace(/\.0$/, "") + "T";
  if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return num.toString();
}

function updateMaxReward() {
  const inputEl = document.getElementById("spinCode");
  const outputEl = document.getElementById("maxReward");
  const val = Number(inputEl.value);

  if (isNaN(val) || val <= 0) {
    outputEl.textContent = "";
    return;
  }

  const reward = Math.min(Math.floor(200 * Math.log2(val + 1) * Math.sqrt(val)), 1e9);
  outputEl.textContent = "$" + formatNumber(reward);
}

document.getElementById("spinCode").addEventListener("input", updateMaxReward);
updateMaxReward();

/* =========================
   Leaderboard
========================= */
window.loadLeaderboard = function () {
  const leaderboardEl = document.getElementById("leaderboard");
  leaderboardEl.innerHTML = "Loading...";

  const excludedUsers = ["admin", "testplayer", "testplayer2", "testplayer3", "testplayer4"];
  const q = query(collection(db, "playerdata"));

  onSnapshot(q, (querySnapshot) => {
    const players = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const username = docSnap.id;

      if (!excludedUsers.includes(username)) {
        players.push({
          username,
          balance: data.balance || 0,
        });
      }
    });

    players.sort((a, b) => b.balance - a.balance);

    let output = "";

    players.slice(0, 5).forEach((p, i) => {
      output += `<div>#${i + 1}: ${p.username} - $${formatNumber(p.balance)}</div>`;
    });

    const currentIndex = players.findIndex(p => p.username === currentUser);
    if (currentIndex >= 5) {
      const p = players[currentIndex];
      output += `<hr style="margin:8px 0;"><div><b>#${currentIndex + 1}: ${p.username} - $${formatNumber(p.balance)}</b></div>`;
    }

    leaderboardEl.innerHTML = output || "<p>No players found.</p>";
  }, (error) => {
    console.error("Error in onSnapshot:", error);
    leaderboardEl.innerHTML = "Error loading leaderboard.";
  });
};

loadLeaderboard();

/* =========================
   Workers system
========================= */
window.enslave = async function (slaveUsername, masterUsername) {
  const slaveRef = doc(db, "workers", slaveUsername);
  const masterRef = doc(db, "workers", masterUsername);

  const slaveSnap = await getDoc(slaveRef);
  const masterSnap = await getDoc(masterRef);

  if (masterSnap.exists()) {
    const masterData = masterSnap.data();
    if (masterData.owns && masterData.owns !== "") {
      alert(`Master ${masterUsername} already owns a worker: ${masterData.owns}`);
      return;
    }
  }

  if (masterSnap.exists() && masterSnap.data().slave === true) {
    alert("You are already a worker.");
    return;
  }

  await setDoc(slaveRef, {
    slave: true,
    master: masterUsername,
    owns: null,
    joined: serverTimestamp(),
    lastpay: serverTimestamp(),
  }, { merge: true });

  if (!masterSnap.exists()) {
    await setDoc(masterRef, {
      slave: false,
      master: null,
      owns: slaveUsername,
      joined: null,
      lastpay: null
    });
  } else {
    await updateDoc(masterRef, {
      owns: slaveUsername,
      slave: false,
      master: null,
      joined: null,
      lastpay: null
    });
  }

  alert(`${slaveUsername} is now a worker of ${masterUsername}`);
  workerMenu();
};

window.freeSlave = async function (slaveUsername) {
  const slaveRef = doc(db, "workers", slaveUsername);
  const slaveSnap = await getDoc(slaveRef);
  if (!slaveSnap.exists()) {
    alert("Error 1");
    return;
  }

  const data = slaveSnap.data();
  const masterUsername = data.master;
  if (!masterUsername) {
    alert("Error 2");
    return;
  }

  const masterRef = doc(db, "workers", masterUsername);
  const masterSnap = await getDoc(masterRef);

  if (masterSnap.exists()) {
    const owns = masterSnap.data().owns || "";
    if (owns === slaveUsername) {
      await updateDoc(masterRef, { owns: "" });
    }
  }

  await updateDoc(slaveRef, {
    slave: false,
    master: null,
    owns: "",
    lastpay: serverTimestamp()
  });

  alert(`${slaveUsername} has been freed from ${masterUsername}`);
  workerMenu();
};

window.resetTest = async function () {
  const workersCol = collection(db, "workers");
  const snapshot = await getDocs(workersCol);

  const deletePromises = snapshot.docs.map((document) => {
    return deleteDoc(doc(db, "workers", document.id));
  });

  await Promise.all(deletePromises);
  alert("Cleared workerdata");
};

window.updatebankrupt = async function () {
  const dropdown = document.getElementById("bankrupt");
  const snapshot = await getDocs(collection(db, "playerdata"));
  let count = 0;

  const excludedUsers = ["admin", "testplayer", "testplayer2", "testplayer3", "testplayer4"];

  // Clear old options except placeholder
  dropdown.innerHTML = `<option disabled selected>Choose a player</option>`;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const userId = docSnap.id;

    if ((data.balance || 0) > 300 || userId === currentUser || excludedUsers.includes(userId)) {
      continue;
    }

    const workerRef = doc(db, "workers", userId);
    const workerSnap = await getDoc(workerRef);
    if (workerSnap.exists() && workerSnap.data().slave === true) continue;

    const option = document.createElement("option");
    option.value = userId;
    option.textContent = `${userId} ($${data.balance})`;
    dropdown.appendChild(option);
    count++;
  }

  if (count === 0) {
    const option = document.createElement("option");
    option.textContent = "No bankrupt players";
    option.disabled = true;
    dropdown.appendChild(option);
  }
};

updatebankrupt();

window.enslaveSelected = function () {
  const selected = document.getElementById("bankrupt").value;
  if (selected === "Choose a player") {
    alert("Please choose a player to take as a worker.");
    return;
  }
  if (confirm(`Do you want to take ${selected} as your worker?`)) {
    enslave(selected, currentUser);
  }
};

window.watchSlaveStatus = async function (userId = currentUser) {
  if (!userId) return;

  const workerRef = doc(db, "workers", userId);
  const key = `slaveStatus_${userId}`;
  let previouslySlave = localStorage.getItem(key) === "true";

  onSnapshot(workerRef, (snap) => {
    if (!snap.exists()) return;

    const data = snap.data();
    const isNowSlave = data.slave === true;

    if (isNowSlave && !previouslySlave) {
      alert(`⚠️ You have been enslaved by another player.\nYou are now a worker of ${data.master}`);
      workerMenu();
    } else if (!isNowSlave && previouslySlave) {
      alert("Congratulations, you have been freed by your master!");
      workerMenu();
    }

    previouslySlave = isNowSlave;
    localStorage.setItem(key, isNowSlave ? "true" : "false");
  });
};

window.freeSlaveConfirm = async function () {
  const masterRef = doc(db, "workers", currentUser);
  const masterSnap = await getDoc(masterRef);
  if (!masterSnap.exists()) {
    alert("You do not own a worker.");
    return;
  }
  const data = masterSnap.data();
  const slaveName = data.owns;

  if (confirm(`Confirm freeing your worker ${slaveName}?`)) {
    freeSlave(slaveName);
  }
};

window.workerMenu = async function () {
  const text = document.getElementById("workerBar");
  const menu = document.getElementById("bankrupt");
  const cf = document.getElementById("enslaveBtn");
  const free = document.getElementById("freeslaveBtn");

  if (!currentUser) return;

  const ref = doc(db, "workers", currentUser);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    free.style.display = "none";
    cf.style.display = "block";
    menu.style.display = "block";
    text.innerHTML = `Select a player with a net worth less than $300 to become your worker.`;
    return;
  }

  const data = snap.data();
  const isSlave = data.slave === true;
  const isMaster = typeof data.owns === "string" && data.owns.length > 0;

  if (isMaster) {
    free.style.display = "block";
    cf.style.display = "none";
    menu.style.display = "none";

    const slavenetSnap = await getDoc(doc(db, "playerdata", data.owns));
    const slavenet = slavenetSnap.exists() ? (slavenetSnap.data().balance || 0) : 0;

    text.innerHTML = `You currently have <b>${data.owns}</b> as your worker. Your worker has a net worth of $${slavenet}.`;
  } else if (isSlave) {
    free.style.display = "none";
    cf.style.display = "none";
    menu.style.display = "none";
    text.innerHTML = `You are a worker of <b>${data.master}</b>. Workers have 40% of their earnings taken away to their master.`;
  } else {
    free.style.display = "none";
    cf.style.display = "block";
    menu.style.display = "block";
    text.innerHTML = `Select a player with a net worth less than $300 to become your worker.`;
  }
};

/* =========================
   Auction listener
========================= */
window.listenToAuction = function () {
  const auctionRef = doc(db, "server", "auction");
  let redirected = false;

  onSnapshot(auctionRef, (docSnap) => {
    const data = docSnap.data();
    if (data && data.active && !redirected) {
      redirected = true;
      alert("There is an ongoing auction!");
      window.location.href = "auction.html";
    }
  });
};

listenToAuction();

/* ==========================================================
   ===================== MARKET SYSTEM ======================
   ========================================================== */

/* =========================
   Inventory ensure + watcher
========================= */
async function ensureInventory() {
  if (!currentUser) return;

  const invRef = doc(db, "inventory", currentUser);
  const invSnap = await getDoc(invRef);

  if (!invSnap.exists()) {
    await setDoc(invRef, { dia: 0, med: 0, ino: 0 });
  }
}

window.watchInventory = function () {
  if (!currentUser) return;

  const invRef = doc(db, "inventory", currentUser);

  onSnapshot(invRef, (snap) => {
    if (!snap.exists()) return;

    const inv = snap.data();

    // If you later add UI elements, hook them here.
    // Example: document.getElementById("invDia").textContent = inv.dia || 0;
    console.log("[Inventory]", inv);
  }, (err) => {
    console.error("Inventory watcher error:", err);
  });
};

/* =========================
   Global stock docs (for dia/med)
========================= */
async function ensureStockDocs() {
  // This is safe to call often; it only creates docs if missing.
  const stockCol = collection(db, "stock");

  for (const key of Object.keys(GLOBAL_STOCK_DEFAULTS)) {
    const sref = doc(stockCol, key);
    const ssnap = await getDoc(sref);
    if (!ssnap.exists()) {
      await setDoc(sref, { remaining: GLOBAL_STOCK_DEFAULTS[key] });
    }
  }
}

/* =========================
   Admin mint (optional)
   Gives an item to a user and consumes global stock if limited.
   Usage: mintItem("someone", "dia", 1)
========================= */
window.mintItem = async function (toUser, itemKey, qty = 1) {
  qty = Math.floor(Number(qty));
  toUser = (toUser || "").trim().toLowerCase();

  if (currentUser !== "admin") {
    alert("Admin only.");
    return;
  }
  if (!toUser || !ITEMS[itemKey] || qty <= 0) {
    alert("Invalid mint.");
    return;
  }

  const invRef = doc(db, "inventory", toUser);
  const playerRef = doc(db, "playerdata", toUser);
  const stockRef = doc(db, "stock", itemKey);

  await runTransaction(db, async (tx) => {
    const playerSnap = await tx.get(playerRef);
    if (!playerSnap.exists()) throw new Error("User not found.");

    const invSnap = await tx.get(invRef);
    if (!invSnap.exists()) tx.set(invRef, { dia: 0, med: 0, ino: 0 });

    if (ITEMS[itemKey].globallyLimited) {
      const stockSnap = await tx.get(stockRef);
      if (!stockSnap.exists()) {
        tx.set(stockRef, { remaining: GLOBAL_STOCK_DEFAULTS[itemKey] ?? 0 });
      }
      const remaining = (stockSnap.exists() ? stockSnap.data().remaining : (GLOBAL_STOCK_DEFAULTS[itemKey] ?? 0));
      if (remaining < qty) throw new Error("Not enough global stock remaining.");
      tx.update(stockRef, { remaining: remaining - qty });
    }

    tx.update(invRef, { [itemKey]: increment(qty) });
  });

  alert(`Minted ${qty}x ${ITEMS[itemKey].name} to ${toUser}`);
};

/* =========================
   Market watcher + optional render hook
========================= */
window.watchMarket = function () {
  const q = query(collection(db, "market"));

  onSnapshot(q, (snap) => {
    const listings = [];
    snap.forEach(d => listings.push({ id: d.id, ...d.data() }));

    // If you later add UI elements, hook them here.
    // For now just log and keep infra ready.
    console.log("[Market listings]", listings);

    // Optional: If you add <div id="marketList"></div> in HTML later,
    // this will automatically render.
    const marketListEl = document.getElementById("marketList");
    if (marketListEl) {
      listings.sort((a, b) => {
        const at = a.created?.seconds || 0;
        const bt = b.created?.seconds || 0;
        return bt - at;
      });

      marketListEl.innerHTML = listings.map(L => {
        const nm = ITEMS[L.item]?.name || L.item;
        return `
          <div style="border:1px solid #ddd; padding:8px; margin:6px 0; border-radius:8px;">
            <div style="font-weight:600;">${nm}</div>
            <div style="font-size:12px; opacity:.8;">Seller: ${L.seller}</div>
            <div style="margin-top:6px;">
              Price: <b>$${L.price}</b>
              <button style="margin-left:10px;" onclick="buyListing('${L.id}')">Buy</button>
              ${L.seller === currentUser ? `<button style="margin-left:6px;" onclick="cancelListing('${L.id}')">Cancel</button>` : ""}
            </div>
          </div>
        `;
      }).join("") || "<i>No listings.</i>";
    }
  }, (err) => {
    console.error("Market watcher error:", err);
  });
};

/* =========================
   Sell item -> create listing
   Usage: sellItem("dia", 500)
========================= */
window.sellItem = async function (itemKey, price) {
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }

  itemKey = (itemKey || "").trim();
  price = Math.floor(Number(price));

  if (!ITEMS[itemKey] || !Number.isFinite(price) || price <= 0) {
    alert("Invalid listing.");
    return;
  }

  const sellerInvRef = doc(db, "inventory", currentUser);
  const listingsCol = collection(db, "market");
  const listingRef = doc(listingsCol); // pre-generate doc id so we can tx.set

  await runTransaction(db, async (tx) => {
    const invSnap = await tx.get(sellerInvRef);
    if (!invSnap.exists()) throw new Error("Inventory not found.");

    const inv = invSnap.data();
    const owned = inv[itemKey] || 0;
    if (owned <= 0) throw new Error("You don't own this item.");

    // take item first to prevent dupes
    tx.update(sellerInvRef, { [itemKey]: increment(-1) });

    // create listing
    tx.set(listingRef, {
      seller: currentUser,
      item: itemKey,
      price: price,
      created: serverTimestamp()
    });
  });

  alert(`Listed ${ITEMS[itemKey].name} for $${price}`);
};

/* =========================
   Cancel your listing -> return item
========================= */
window.cancelListing = async function (listingId) {
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }
  if (!listingId) return;

  const listingRef = doc(db, "market", listingId);
  const invRef = doc(db, "inventory", currentUser);

  await runTransaction(db, async (tx) => {
    const listingSnap = await tx.get(listingRef);
    if (!listingSnap.exists()) throw new Error("Listing no longer exists.");

    const L = listingSnap.data();
    if (L.seller !== currentUser) throw new Error("Not your listing.");

    // return item
    tx.update(invRef, { [L.item]: increment(1) });

    // delete listing
    tx.delete(listingRef);
  });

  alert("Listing canceled. Item returned.");
};

/* =========================
   Buy listing -> money + item transfer, delete listing
========================= */
window.buyListing = async function (listingId) {
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }
  if (!listingId) return;

  const listingRef = doc(db, "market", listingId);
  const buyerRef = doc(db, "playerdata", currentUser);
  const buyerInvRef = doc(db, "inventory", currentUser);

  await runTransaction(db, async (tx) => {
    const listingSnap = await tx.get(listingRef);
    if (!listingSnap.exists()) throw new Error("Listing is gone.");

    const L = listingSnap.data();
    if (L.seller === currentUser) throw new Error("You can't buy your own listing.");

    const sellerRef = doc(db, "playerdata", L.seller);

    const buyerSnap = await tx.get(buyerRef);
    if (!buyerSnap.exists()) throw new Error("Buyer not found.");

    const buyerBal = buyerSnap.data().balance || 0;
    if (buyerBal < L.price) throw new Error("Not enough money.");

    // money transfer
    tx.update(buyerRef, { balance: increment(-L.price) });
    tx.update(sellerRef, { balance: increment(L.price) });

    // item to buyer
    tx.update(buyerInvRef, { [L.item]: increment(1) });

    // remove listing
    tx.delete(listingRef);
  });

  // Update local storage + UI balance quickly (snapshot will also catch it)
  try {
    const buyerSnap2 = await getDoc(doc(db, "playerdata", currentUser));
    if (buyerSnap2.exists()) {
      const newBal = buyerSnap2.data().balance || 0;

      const balanceEl = document.getElementById("balance");
      const currentDisplayed = parseInt(balanceEl.textContent) || 0;
      animateNumber(balanceEl, currentDisplayed, newBal);

      const saved = JSON.parse(localStorage.getItem("playerdata")) || {};
      saved.balance = newBal;
      localStorage.setItem("playerdata", JSON.stringify(saved));
    }
  } catch (e) {
    console.warn("Post-buy balance refresh failed:", e);
  }

  alert("Purchase successful!");
};