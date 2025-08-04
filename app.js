import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore, collection, doc, getDoc, setDoc, updateDoc, runTransaction, query, onSnapshot
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

  const startingBalance = 0;
  await setDoc(userRef, { pin, balance: startingBalance });
  currentUser = username;
  saveAndShow(username, pin, startingBalance);
  alert("Welcome to Sigma Market Online!");
  startBalancePolling();
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

  onSnapshot(playerRef, (snap) => {
    if (!snap.exists()) return;

    const newBalance = snap.data().balance;
    const localData = JSON.parse(localStorage.getItem("playerdata")) || {};

    if (localData.balance !== newBalance) {
      const balanceEl = document.getElementById("balance");
      const currentDisplayed = parseInt(balanceEl.textContent) || 0;
      animateNumber(balanceEl, currentDisplayed, newBalance);

      localData.balance = newBalance;
      localStorage.setItem("playerdata", JSON.stringify(localData));
      console.log("[Snapshot] Balance updated to:", newBalance);
    }
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
    } else if (spinval = playerData.balance) {
      if(!confirm(`Warning: Don't spend your money all in one place! Do you REALLY want to put $${playerData.balance}, your ENTIRE NET WORTH, on the wheel?`)) {
        return;
      }
    }

    const spinResultEl = document.getElementById("spinResult");
    spinResultEl.innerHTML = "Spinning";
    let dots = "";
    const spinInterval = setInterval(() => {
      dots = dots.length < 3 ? dots + "." : "";
      spinResultEl.innerHTML = `Spinning${dots}`;
    }, 300);

    await new Promise(resolve => setTimeout(resolve, 3000));
    clearInterval(spinInterval);
    spinResultEl.innerHTML = "Please wait";
    await new Promise(resolve => setTimeout(resolve, 200));

    const random = Math.floor(Math.random() * 240) + 1;
    let result = 0;

    if (random <= 140) {
      result = -spinval * (Math.random() * 0.5 + 0.5);
    } else if (random <= 220) {
      result = amount * (Math.random() * 3 + 2);          // x3
    /*} else if (random <= 231) {
      result = amount * 4;          // x5
   */ } else if (random <= 236) {
      result = amount * 9;          // x10
    } else if (random <= 239) {
      result = amount * 24;         // x25
    } else {
      result = amount * 200;        // Jackpot
    }

    result = Math.floor(result);

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

window.loadLeaderboard = async function () {
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
          balance: data.balance || 0
        });
      }
    });

    // Sort by balance descending
    players.sort((a, b) => b.balance - a.balance);

    // Render leaderboard
    leaderboardEl.innerHTML = players.map((p, i) =>
      `<div>#${i + 1}: ${p.username} - $${p.balance}</div>`
    ).join("");
  }, (error) => {
    leaderboardEl.innerHTML = "Error loading leaderboard.";
    console.error("Snapshot error:", error);
  });
};

loadLeaderboard();