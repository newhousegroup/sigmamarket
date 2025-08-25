import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore, collection, doc, getDoc, setDoc, updateDoc, runTransaction, query, onSnapshot, serverTimestamp, deleteDoc, getDocs, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

window.onload = () => {
  const saved = localStorage.getItem("playerdata");
  if (saved) {
    const player = JSON.parse(saved);
    currentUser = player.username;
    showGameUI(player.username, player.balance);
    startBalancePolling();
    watchSlaveStatus();
    workerMenu();
  } else {
    document.getElementById("logintext").style.display = "none";
  }
};

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
    startBalancePolling();
    watchSlaveStatus();
    workerMenu();
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
  // Show balance instantly on login (no animation)
  document.getElementById("balance").textContent = balance;

}

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
  alert("Welcome to Sigma Market Online!");
  startBalancePolling();
  watchSlaveStatus();
  workerMenu();
};

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

  if (codeInput === 'indian') {
    alert("WHY DID YOU REDEEM IT");
    document.getElementById("redeemID").value = "";
    return;
  }

  // ✅ Now we check if code was already redeemed
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
      if (!codeSnap.exists()) {
        throw new Error("Invalid code.");
      }

      const codeData = codeSnap.data();
      if (codeData.uses <= 0) {
        throw new Error("This code has already been fully redeemed.");
      }

      const playerSnap = await transaction.get(playerRef);
      const playerData = playerSnap.exists() ? playerSnap.data() : { balance: 0 };

      const newBalance = (playerData.balance || 0) + codeData.amount;

      transaction.update(playerRef, { balance: newBalance });
      transaction.update(codeRef, { uses: codeData.uses - 1 });
    });

    // Update localStorage
    const updatedPlayerSnap = await getDoc(playerRef);
    const updatedPlayerData = updatedPlayerSnap.data();
    const updatedBalance = updatedPlayerData.balance;

    alert(`Code redeemed successfully!`);

    const balanceEl = document.getElementById("balance");
    const currentDisplayed = parseInt(balanceEl.textContent) || 0;
    animateNumber(balanceEl, currentDisplayed, updatedBalance);

    const saved = JSON.parse(localStorage.getItem("playerdata")) || {};
    saved.balance = updatedBalance;
    localStorage.setItem("playerdata", JSON.stringify(saved));

    // 💾 Save redeemed code
    redeemedCodes.push(codeInput);
    localStorage.setItem("redeemedCodes", JSON.stringify(redeemedCodes));

  } catch (err) {
    alert(err.message || "Something went wrong. Please try again.");
    console.error(err);
  }

  document.getElementById("redeemID").value = "";
};

function startBalancePolling() {
  if (!currentUser) return;

  const playerRef = doc(db, "playerdata", currentUser);
  const workerRef = doc(db, "workers", currentUser);

  let lastBalance = null;

  onSnapshot(playerRef, async (snap) => {
    if (!snap.exists()) return;

    const newBalance = snap.data().balance;
    const localData = JSON.parse(localStorage.getItem("playerdata")) || {};

    if (lastBalance === null) {
      lastBalance = newBalance;
    }

    const diff = newBalance - lastBalance;

    // Visuals
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
      console.log("[Worker Info]", data);

      if (data.slave === true && data.master && diff > 0) {
        const masterRef = doc(db, "playerdata", data.master);

        await runTransaction(db, async (transaction) => {
          const masterSnap = await transaction.get(masterRef);
          const slaveSnap = await transaction.get(playerRef);

          if (!masterSnap.exists() || !slaveSnap.exists()) return;

          const masterCut = Math.floor(diff * 0.4);
          const newSlaveBalance = slaveSnap.data().balance - masterCut;

          transaction.update(masterRef, {
            balance: increment(masterCut)
          });

          transaction.update(playerRef, {
            balance: newSlaveBalance
          });

          console.log(`[Master Cut] ${data.master} earned $${masterCut}`);
        });
      }
    }

    lastBalance = newBalance;
  }, (error) => {
    console.error("Snapshot listener error:", error);
  });
}

function animateNumber(element, start, end, duration = 500) {
  const startTimestamp = performance.now();
  const step = (currentTime) => {
    const progress = Math.min((currentTime - startTimestamp) / duration, 1);
    const currentValue = Math.floor(progress * (end - start) + start);
    element.textContent = currentValue;
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      element.textContent = end; // ensure exact final value
    }
  };
  requestAnimationFrame(step);
}

window.win = function (amount, display) {
  console.log(`win function ${amount}, ${display}`);
  amount = Math.floor(amount);
  
  if (amount <= 0) return; // no celebration for losses

  if (amount <= 10) {
    // Small wins
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
  } 
  else if (amount <= 100) {
    // Medium wins
    confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
  } 
  else {
    // Jackpot
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
    jackpotText.style.fontSize = "0"; // start tiny
    jackpotText.style.opacity = "0";
    jackpotText.style.animation = "jackpotZoom 1s ease-out forwards";

    overlay.appendChild(jackpotText);
    document.body.appendChild(overlay);

    // Confetti loop
    let confettiInterval = setInterval(() => {
      confetti({ particleCount: 200, spread: 120, origin: { y: 0.6 } });
    }, 400);

    // Fireworks burst
    let fireworkInterval = setInterval(() => {
      confetti({
        particleCount: 100,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 }
      });
      confetti({
        particleCount: 100,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 }
      });
    }, 600);

    // Remove after 5s
    setTimeout(() => {
      clearInterval(confettiInterval);
      clearInterval(fireworkInterval);
      overlay.style.animation = "fadeOut 0.5s ease forwards";
      setTimeout(() => {
        document.body.removeChild(overlay);
      }, 500);
    }, 5000);
  }
};

// Animations
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

const boostRef = doc(db, "server", "boost");
let boost = 1; // global live boost value

function getDecayed(boost, lastUpdated) {
  const elapsed = (Date.now() - lastUpdated) / 1000; // seconds
  return Math.max(1, boost - 0.001 * elapsed);
}

window.increaseBoost = async function () {
  const snap = await getDoc(boostRef);
  if (!snap.exists()) return;

  // start from the CURRENT DISPLAY value
  let currentBoost = boost; // <- global updated by watchBoost

  // apply increase
  currentBoost += 0.025;

  await updateDoc(boostRef, {
    boost: currentBoost,
    lastUpdated: Date.now()
  });
};

window.watchBoost = function () {
  const boostBar = document.getElementById("boostBar");
  const boostValue = document.getElementById("boostValue");

  let lastUpdatedLocal = Date.now();
  let baseBoost = 1; // last server snapshot

  onSnapshot(boostRef, (snap) => {
    if (!snap.exists()) return;

    let { boost: storedBoost = 1, lastUpdated = Date.now() } = snap.data();

    baseBoost = storedBoost;
    lastUpdatedLocal = lastUpdated;
  });

  function tick() {
    const now = Date.now();
    const elapsed = (now - lastUpdatedLocal) / 1000; // seconds since last update

    // apply decay
    const displayBoost = Math.max(1, baseBoost - 0.003 * elapsed);

    // update UI
    boostValue.textContent = displayBoost.toFixed(3) + "x";
    const width = Math.min(displayBoost - 1, 1) * 100;
    boostBar.style.width = width + "%";

    // update global "boost" so spin() & increaseBoost() can use it
    boost = displayBoost;

    requestAnimationFrame(tick);
  }

  tick();
};

watchBoost();

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

    await new Promise(resolve => setTimeout(resolve, 500));
    clearInterval(spinInterval);
    spinResultEl.innerHTML = "Please wait";
    await new Promise(resolve => setTimeout(resolve, 200));

    const random = Math.floor(Math.random() * 240) + 1;
    let result = 0;
    let mult = 0;

    const restricted = ['x', 'y', 'z', 'frontman', 'reserves'];

    if (restricted.includes(currentUser)) {
      if (random <= 120) {
        mult = -(Math.random() * 0.5 + 0.5);
      } else if (random <= 220) {
        mult = (Math.random() * 3 + 2);          // x3
    /*} else if (random <= 231) {
      result = amount * 4;          // x5
   */ } else if (random <= 236) {
        mult = 9;          // x10
      } else if (random <= 239) {
        mult = 24;         // x25
      } else {
        mult = 200;        // Jackpot
      }
    } else {
      if (random <= 100) {
        mult = -(Math.random() * 0.5 + 0.5);
      } else if (random <= 216) {
        mult = (Math.random() * 3 + 2);          // x3
    /*} else if (random <= 231) {
      result = amount * 4;          // x5
   */ } else if (random <= 234) {
        mult = 9;          // x10
      } else if (random <= 239) {
        mult = 24;         // x25
      } else {
        mult = 200;        // Jackpot
      }
    }

    if (mult < 0) {
      result = spinval*mult;
    } else {
      result = amount*mult*boost;
    }
    
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
    } else if (result === amount * 200) {
      spinResultEl.innerHTML = `You <b>won</b> $${result}<br><b id="jackpot">JACKPOT</b>`;
      const jackpotEl = document.getElementById("jackpot");
      let colors = ["yellow", "green", "blue", "indigo", "violet", "red", "orange"];
      let i = 0;
      const interval = setInterval(() => {
        jackpotEl.style.color = colors[i % colors.length];
        i++;
        if (i > 20) {
          clearInterval(interval);
          jackpotEl.style.display = 'none';
        }
      }, 75);
    } else {
      spinResultEl.innerHTML = `You <b>won</b> $${result}`;
    }
  } finally {
    spinBtn.disabled = false; // Always re-enable, even on error or early return
  }
};



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
}

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

// Attach event listener for live update
document.getElementById("spinCode").addEventListener("input", updateMaxReward);

// Optionally, run once on page load in case spinCode already has value
updateMaxReward();

// Replace with actual username
window.openLootbox = async function () {
  if (!currentUser) {
    alert("You must be logged in to open lootboxes.");
    return;
  }

  const userRef = doc(db, "inventory", currentUser);
  const userSnap = await getDoc(userRef);

  // If no inventory document, create it with empty inv and some lootboxes
  if (!userSnap.exists()) {
    await setDoc(userRef, {
      playerinv: [0, 0, 0, 0, 0], // 5 item slots initialized to 0 count
      playerboxes: [1, 0], // 1 normal lootbox, 0 premium lootbox by default
    });
    alert("Inventory created. Please try opening a lootbox again.");
    return;
  }

  const data = userSnap.data();
  const boxes = data.playerboxes || [0, 0];
  const inv = data.playerinv || [0, 0, 0, 0, 0];

  if (boxes[0] <= 0) {
    alert("No normal lootboxes left!");
    return;
  }

  // Remove one normal lootbox
  boxes[0]--;

  // Pick a random item ID 0-4
  const itemId = Math.floor(Math.random() * 5);

  // Make sure inventory array is long enough
  while (inv.length <= itemId) inv.push(0);

  // Increment count of that item
  inv[itemId]++;

  // Update Firestore
  await updateDoc(userRef, {
    playerboxes: boxes,
    playerinv: inv,
  });

  alert(`You received Item ${itemId}!`);
}

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

    // Sort by balance descending
    players.sort((a, b) => b.balance - a.balance);

    let output = "";

    // Top 5
    players.slice(0, 5).forEach((p, i) => {
      output += `<div>#${i + 1}: ${p.username} - $${formatNumber(p.balance)}</div>`;
    });

    // Show current user if not in top 5
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

window.enslave = async function (slaveUsername, masterUsername) {
  const slaveRef = doc(db, "workers", slaveUsername);
  const masterRef = doc(db, "workers", masterUsername);

  const slaveSnap = await getDoc(slaveRef);
  const masterSnap = await getDoc(masterRef);

  // Check if master already owns a slave
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

  // Update slave doc
  await setDoc(slaveRef, {
    slave: true,
    master: masterUsername,
    owns: null,
    joined: serverTimestamp(),
    lastpay: serverTimestamp(),
  }, { merge: true });

  // Create or update master doc
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
}

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

  // Clear master's owns field if it equals this slave
  if (masterSnap.exists()) {
    const owns = masterSnap.data().owns || "";
    if (owns === slaveUsername) {
      await updateDoc(masterRef, { owns: "" });
    }
  }

  // Update slave doc to escaped state
  await updateDoc(slaveRef, {
    slave: false,
    master: null,
    owns: "",
    lastpay: serverTimestamp()
  });

  alert(`${slaveUsername} has been freed from ${masterUsername}`);
  workerMenu();
}

window.resetTest = async function () {
  const workersCol = collection(db, "workers");
  const snapshot = await getDocs(workersCol);

  const deletePromises = snapshot.docs.map((document) => {
    return deleteDoc(doc(db, "workers", document.id));
  });

  await Promise.all(deletePromises);
  alert("Cleared workerdata")
}

window.updatebankrupt = async function () {
  const dropdown = document.getElementById("bankrupt");

  const snapshot = await getDocs(collection(db, "playerdata"));
  let count = 0;

  const excludedUsers = ["admin", "testplayer", "testplayer2", "testplayer3", "testplayer4"];

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const userId = docSnap.id;

    // Skip excluded, current user, and high balance
    if ((data.balance || 0) > 300 || userId === currentUser || excludedUsers.includes(userId)) {
      continue;
    }

    // Check if the user is a slave
    const workerRef = doc(db, "workers", userId);
    const workerSnap = await getDoc(workerRef);

    if (workerSnap.exists() && workerSnap.data().slave === true) {
      continue; // Skip enslaved users
    }

    // Passed all checks: add to dropdown
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
}

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
}

window.watchSlaveStatus = async function (userId = currentUser) {
  if (!userId) return;

  const workerRef = doc(db, "workers", userId);

  // Get previously known slave state from localStorage
  const key = `slaveStatus_${userId}`;
  let previouslySlave = localStorage.getItem(key) === "true";

  onSnapshot(workerRef, (snap) => {
    if (!snap.exists()) return;

    const data = snap.data();
    const isNowSlave = data.slave === true;

    // Trigger alert only if newly enslaved
    if (isNowSlave && !previouslySlave) {
      alert(`⚠️ You have been enslaved by another player.\nYou are now a worker of ${data.master}`);
      workerMenu();
    } else if (!isNowSlave && previouslySlave) {
      alert("Congratulations, you have been freed by your master!");
      workerMenu();
    }

    // Update both local variable and localStorage
    previouslySlave = isNowSlave;
    localStorage.setItem(key, isNowSlave ? "true" : "false");
  });
};

window.freeSlaveConfirm = async function () {
  const masterRef = doc(db, "workers", currentUser);
  const masterSnap = await getDoc(masterRef);
  const data = masterSnap.data();
  const slaveName = data.owns;

  if (confirm(`Confirm freeing your worker ${slaveName}?`)) {
    freeSlave(slaveName);
  }
}

window.workerMenu = async function () {
  const text = document.getElementById("workerBar");
  const menu = document.getElementById("bankrupt");
  const cf = document.getElementById("enslaveBtn");
  const free = document.getElementById("freeslaveBtn");

  if (!currentUser) return;
  const ref = doc(db, "workers", currentUser);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    free.style.display = 'none';
    cf.style.display = 'block';
    menu.style.display = 'block';
    text.innerHTML = `Select a player with a net worth less than $300 to become your worker.`;
  }

  const data = snap.data();
  const isSlave = data.slave === true;
  const isMaster = typeof data.owns === 'string' && data.owns.length > 0;

  if (isMaster) {
    free.style.display = 'block';
    cf.style.display = 'none';
    menu.style.display = 'none';
    const slavenet = (await getDoc(doc(db, "playerdata", data.owns))).data().balance;
    text.innerHTML = `You currently have <b>${data.owns}</b> as your worker. Your worker has a net worth of $${slavenet}.`;
  } else if (isSlave) {
    free.style.display = 'none';
    cf.style.display = 'none';
    menu.style.display = 'none';
    text.innerHTML = `You are a worker of <b>${data.master}</b>. Workers have 40% of their earnings taken away to their master.`;
  } else {
    free.style.display = 'none';
    cf.style.display = 'block';
    menu.style.display = 'block';
    text.innerHTML = `Select a player with a net worth less than $300 to become your worker.`;
  }
}

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