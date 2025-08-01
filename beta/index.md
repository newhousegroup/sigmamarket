<!-- index.md -->

# 🏦 Economy Game Demo

<style>
  input, button {
    margin: 5px;
    padding: 6px;
    font-size: 16px;
  }
</style>

<div id="loginBox">
  <h2>🔐 Login</h2>
  <input type="text" id="username" placeholder="Username"><br>
  <input type="password" id="pin" placeholder="4-digit PIN" maxlength="4"><br>
  <button onclick="login()">Login</button>
</div>

<div id="gameBox" style="display:none;">
  <h2>💰 Balance: $<span id="balance">...</span></h2>
  <input type="text" id="recipient" placeholder="Recipient username"><br>
  <input type="number" id="amount" placeholder="Amount"><br>
  <button id="send">Send</button>
</div>

<!-- Firebase + app.js -->
<script type="module" src="app.js"></script>
