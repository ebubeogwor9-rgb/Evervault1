var THEME_KEY = "securebank_theme";
var TOKEN_KEY = "evervault_token";
var auth = null;
var account = null;
var lastRecipientName = null;
var started = false;
var pollTimer = null;
var recipTimer = null;
var token = localStorage.getItem(TOKEN_KEY) || null;

function $(id) {
  return document.getElementById(id);
}

function money(n) {
  return "$" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtDate(ts) {
  var d = new Date(ts);
  return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
}

function fmtDateTime(ts) {
  var d = new Date(ts);
  var hours = d.getHours();
  var ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  var mins = ("0" + d.getMinutes()).slice(-2);
  var secs = ("0" + d.getSeconds()).slice(-2);
  return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear() + ", " + hours + ":" + mins + ":" + secs + " " + ampm;
}

function fmtCardNum(n) {
  return String(n).replace(/(.{4})/g, "$1 ").trim();
}

function acctName(k) {
  return k === "checking" ? "Checking" : "Savings";
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function genDigits(n) {
  var s = "";
  for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function genCardExp() {
  var d = new Date();
  var m = d.getMonth() + 2;
  var y = d.getFullYear() + 4;
  m = m % 12 || 12;
  return ("0" + m).slice(-2) + "/" + String(y).slice(2);
}

function uid() {
  var s = "";
  for (var i = 0; i < 6; i++) s += Math.floor(Math.random() * 36).toString(36);
  return s + Date.now().toString(36);
}

function txnId() {
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var s = "";
  for (var i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return "TXN" + s;
}

function friendlyErr(err) {
  return (err && err.error) || (err && err.message) || "Something went wrong. Please try again.";
}

function api(method, path, body) {
  var opts = { method: method, headers: {} };
  if (token) opts.headers["Authorization"] = "Bearer " + token;
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  return fetch(location.origin + path, opts).then(function (res) {
    return res.json().then(function (data) {
      if (!res.ok) throw data;
      return data;
    });
  });
}

function sendTxnEmail(toEmail, toName, subject, message) {
  if (!toEmail) return Promise.resolve(false);
  return api("POST", "/api/send-email", {
    to_email: toEmail, to_name: toName, subject: subject, message: message
  }).then(function () { return true; }).catch(function () { return false; });
}

function showView(login, signup, dash) {
  $("loginView").classList.toggle("hidden", !login);
  $("signupView").classList.toggle("hidden", !signup);
  $("dashboardView").classList.toggle("hidden", !dash);
}

function showLogin() {
  showView(true, false, false);
  $("loginError").textContent = "";
}

function showSignup() {
  showView(false, true, false);
  $("signupError").textContent = "";
}

var PAGES = ["home", "transfer", "card", "account", "profile"];

function showPage(page) {
  for (var i = 0; i < PAGES.length; i++) {
    $("page-" + PAGES[i]).classList.toggle("hidden", PAGES[i] !== page);
  }
  var btns = document.querySelectorAll(".nav-btn");
  for (var j = 0; j < btns.length; j++) {
    btns[j].classList.toggle("active", btns[j].getAttribute("data-page") === page);
  }
}

function renderHistory(acc) {
  var list = $("historyList");
  var history = (acc.history || []).slice();
  if (!history.length) {
    list.innerHTML = '<div class="history-empty">No transactions yet.</div>';
    return;
  }
  var html = "";
  for (var i = 0; i < history.length; i++) {
    var t = history[i];
    var sign = t.type === "credit" ? "+" : "-";
    var cls = t.type === "credit" ? "credit" : "debit";
    html += '<div class="history-row">' +
      '<div class="left"><div class="desc">' + esc(t.desc) + '</div><div class="date">' + fmtDate(t.ts) + '</div></div>' +
      '<div class="right"><div class="amt ' + cls + '">' + sign + money(t.amt) + '</div><div class="bal">Bal: ' + money(t.bal) + '</div></div>' +
      '</div>';
  }
  list.innerHTML = html;
}

function renderNotifications(acc) {
  var list = $("notificationList");
  var notifs = (acc.notifications || []).slice();
  if (!notifs.length) {
    list.innerHTML = '<div class="notification-empty">No notifications yet.</div>';
    return;
  }
  var html = "";
  for (var i = 0; i < notifs.length; i++) {
    var n = notifs[i];
    html += '<div class="notification-row"><div class="msg">' + esc(n.msg) + '</div><div class="date">' + fmtDate(n.ts) + '</div></div>';
  }
  list.innerHTML = html;
}

function refresh(acc) {
  $("checkingDisplay").textContent = money(acc.checking);
  $("savingsDisplay").textContent = money(acc.savings);
  $("checkingNumLine").textContent = "Acc •••• " + String(acc.acctCheck).slice(-4) + " · Routing " + acc.routing;
  $("savingsNumLine").textContent = "Acc •••• " + String(acc.acctSave).slice(-4) + " · Routing " + acc.routing;
  $("tpChecking").textContent = money(acc.checking);
  $("tpSavings").textContent = money(acc.savings);
  $("cardNum").textContent = fmtCardNum(acc.cardNum);
  $("cardName").textContent = acc.name.toUpperCase();
  $("cardExp").textContent = acc.cardExp;
  $("cardCvv").textContent = acc.cardCvv;
  $("cardConnected").textContent = "Connected to Checking Account";
  $("cardLink").textContent = "Checking · •••• " + String(acc.acctCheck).slice(-4);
  $("cardRouting").textContent = acc.routing;
  $("cardLimit").textContent = money(acc.checking);
  $("acctCheckNum").textContent = "Account: " + acc.acctCheck;
  $("acctCheckRt").textContent = "Routing: " + acc.routing;
  $("acctSaveNum").textContent = "Account: " + acc.acctSave;
  $("acctSaveRt").textContent = "Routing: " + acc.routing;
  $("acctCheckBal").textContent = money(acc.checking);
  $("acctSaveBal").textContent = money(acc.savings);
  $("acctTotal").textContent = money(acc.checking + acc.savings);
  $("acctAvail").textContent = money(acc.checking + acc.savings);
  $("acctRouting").textContent = acc.routing;
  $("profileName").textContent = acc.name;
  $("profileUsername").textContent = acc.username;
  $("profileEmail").textContent = acc.email || "Not provided";
  $("profilePhone").textContent = acc.phone || "Not provided";
  $("acctSince").textContent = fmtDate(acc.created);
  var asOf = "As of " + fmtDate(Date.now());
  $("homeAsOf").textContent = "Available Balance: " + money(acc.checking + acc.savings) + " · " + asOf;
  $("acctAsOf").textContent = asOf;
  renderHistory(acc);
  renderNotifications(acc);
}

function showDashboard() {
  showView(false, false, true);
  $("welcomeUser").textContent = "Welcome, " + account.name;
  $("signedInAs").textContent = account.name;
  $("recipientInfo").innerHTML = "";
  refresh(account);

  var suspended = account.transfers >= 3;
  $("suspendedBox").classList.toggle("hidden", !suspended);
  $("cardStatus").textContent = suspended ? "Suspended" : "Active";
  $("acctStatus").textContent = suspended ? "Suspended" : "Active";
  $("transferForm").classList.toggle("hidden", suspended);
  $("transferBtn").disabled = suspended;
  $("internalBox").classList.toggle("hidden", suspended);
  $("receipt").classList.add("hidden");
  $("transferError").textContent = "";
  $("intError").textContent = "";
  $("intSuccess").classList.add("hidden");

  showPage("home");
  if (location.hash === "#transfer") showPage("transfer");
  updateLastReceiptBtn();
}

function showLoading(title, sub) {
  $("loadTitle").textContent = title;
  $("loadSub").textContent = sub;
  $("loadingOverlay").classList.remove("hidden");
}

function hideLoading() {
  $("loadingOverlay").classList.add("hidden");
}

function doWithLoading(title, sub, delay, fn) {
  showLoading(title, sub);
  setTimeout(function () {
    hideLoading();
    fn();
  }, delay);
}

function cleanup() {
  account = null;
  started = false;
  lastRecipientName = null;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  poll();
  pollTimer = setInterval(poll, 5000);
}

function poll() {
  if (!token) return;
  api("GET", "/api/me").then(function (data) {
    if (data.ok && data.user) {
      account = data.user;
      if (!started) {
        started = true;
        showDashboard();
      } else {
        refresh(account);
      }
      hideLoading();
    }
  }).catch(function () {
    if (!started) {
      hideLoading();
      showLogin();
      $("loginError").textContent = "Session expired. Please log in again.";
      token = null;
      localStorage.removeItem(TOKEN_KEY);
    }
  });
}

function lookupRecipient(num) {
  var info = $("recipientInfo");
  lastRecipientName = null;
  info.innerHTML = '<span class="notfound">Checking...</span>';
  api("GET", "/api/recipient/" + encodeURIComponent(num)).then(function (data) {
    if (data.name) {
      lastRecipientName = data.name;
      info.innerHTML = '<span class="found">' + esc(lastRecipientName) + '</span>';
    } else {
      info.innerHTML = '<span class="notfound">External account</span>';
    }
  }).catch(function () {
    info.innerHTML = '<span class="notfound">External account</span>';
  });
}

$("goSignup").addEventListener("click", showSignup);
$("goLogin").addEventListener("click", showLogin);

var navBtns = document.querySelectorAll(".nav-btn");
for (var bi = 0; bi < navBtns.length; bi++) {
  navBtns[bi].addEventListener("click", function () {
    var page = this.getAttribute("data-page");
    doWithLoading("Loading", "Please wait...", 400, function () {
      showPage(page);
    });
  });
}

$("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var u = $("username").value.trim();
  var p = $("password").value;
  var errorEl = $("loginError");
  if (!u || !p) {
    errorEl.textContent = "Please enter your username and password.";
    return;
  }
  showLoading("Signing In", "Please wait while we verify your credentials...");
  api("POST", "/api/login", { username: u, password: p }).then(function (data) {
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    account = data.user;
    started = true;
    showDashboard();
    startPolling();
    hideLoading();
    errorEl.textContent = "";
  }).catch(function (err) {
    hideLoading();
    errorEl.textContent = err.error || "Invalid username or password.";
  });
});

$("signupForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var name = $("fullName").value.trim();
  var email = $("email").value.trim();
  var phone = $("phone").value.trim();
  var uname = $("newUsername").value.trim();
  var p = $("newPassword").value;
  var cp = $("confirmPassword").value;
  var errorEl = $("signupError");

  if (!name || !email || !phone || !uname || !p) {
    errorEl.textContent = "Please fill in all fields.";
    return;
  }
  if (email.indexOf("@") < 1 || email.indexOf(".") < 2) {
    errorEl.textContent = "Please enter a valid email address.";
    return;
  }
  if (phone.replace(/[^0-9]/g, "").length < 7) {
    errorEl.textContent = "Please enter a valid phone number.";
    return;
  }
  if (p.length < 6) {
    errorEl.textContent = "Password must be at least 6 characters.";
    return;
  }
  if (p !== cp) {
    errorEl.textContent = "Passwords do not match.";
    return;
  }
  if (uname.indexOf("@") > -1) {
    errorEl.textContent = "Username cannot contain @.";
    return;
  }

  showLoading("Creating Account", "Please wait while we set up your account...");
  api("POST", "/api/register", { name: name, username: uname, password: p, email: email, phone: phone }).then(function (data) {
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    $("fullName").value = "";
    $("email").value = "";
    $("phone").value = "";
    $("newUsername").value = "";
    $("newPassword").value = "";
    $("confirmPassword").value = "";
    errorEl.textContent = "";
    account = data.user;
    started = true;
    showDashboard();
    startPolling();
    hideLoading();
  }).catch(function (err) {
    hideLoading();
    errorEl.textContent = err.error || "Something went wrong. Please try again.";
  });
});

$("recipient").addEventListener("input", function () {
  clearTimeout(recipTimer);
  var num = this.value.trim();
  var info = $("recipientInfo");
  if (!num) {
    info.innerHTML = "";
    lastRecipientName = null;
    return;
  }
  recipTimer = setTimeout(function () {
    lookupRecipient(num);
  }, 300);
});

$("transferForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var recipient = $("recipient").value.trim();
  var amount = parseFloat($("amount").value);
  var from = $("fromAccount").value;
  var errorEl = $("transferError");

  if (!recipient) {
    errorEl.textContent = "Please enter a recipient account number.";
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    errorEl.textContent = "Please enter a valid amount.";
    return;
  }
  if (account && amount > account[from]) {
    errorEl.textContent = "Insufficient balance in " + acctName(from) + ".";
    return;
  }

  $("processingOverlay").classList.remove("hidden");

  api("POST", "/api/transfer", { from: from, recipient: recipient, amount: amount }).then(function (data) {
    $("processingOverlay").classList.add("hidden");
    account = data.user;
    sessionStorage.setItem("lastReceipt", JSON.stringify({
      id: data.txnId,
      time: fmtDateTime(data.ts),
      from: acctName(from) + " · •••• " + String(account[from === "checking" ? "acctCheck" : "acctSave"]).slice(-4),
      to: (lastRecipientName ? lastRecipientName + " · " : "") + "•••• " + recipient.slice(-4),
      amount: money(data.amount),
      balance: money(data.balance)
    }));
    errorEl.textContent = "";
    updateLastReceiptBtn();
    showLoading("Sending Receipt Email", "Finalizing your transfer...");
    var emailJobs = [];
    if (account) {
      emailJobs.push(sendTxnEmail(account.email, account.name, "Evervault · Transfer sent", "You sent " + money(data.amount) + " to account •••• " + recipient.slice(-4) + "."));
    }
    Promise.all(emailJobs).then(function () {
      showLoading("Opening Receipt", "Please wait...");
      location.href = "receipt.html";
    });
  }).catch(function (err) {
    $("processingOverlay").classList.add("hidden");
    errorEl.textContent = err.error || "Transfer failed.";
  });
});

$("internalForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var from = $("intFrom").value;
  var to = $("intTo").value;
  var amount = parseFloat($("intAmount").value);
  var errorEl = $("intError");

  if (from === to) {
    errorEl.textContent = "Please pick two different accounts.";
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    errorEl.textContent = "Please enter a valid amount.";
    return;
  }
  if (account && amount > account[from]) {
    errorEl.textContent = "Insufficient balance in " + acctName(from) + ".";
    return;
  }

  $("processingOverlay").classList.remove("hidden");

  api("POST", "/api/internal-transfer", { from: from, to: to, amount: amount }).then(function (data) {
    $("processingOverlay").classList.add("hidden");
    account = data.user;
    $("intSuccess").classList.remove("hidden");
    $("intAmount").value = "";
    errorEl.textContent = "";
    if (account) {
      sendTxnEmail(account.email, account.name, "Evervault · Transfer completed", "You moved " + money(amount) + " from " + acctName(from) + " to " + acctName(to) + ".");
    }
  }).catch(function (err) {
    $("processingOverlay").classList.add("hidden");
    errorEl.textContent = err.error || "Transfer failed.";
  });
});

$("changePwForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var p = $("newPw").value;
  var cp = $("confirmPw").value;
  var errorEl = $("pwError");
  if (p.length < 6) {
    errorEl.textContent = "Password must be at least 6 characters.";
    return;
  }
  if (p !== cp) {
    errorEl.textContent = "Passwords do not match.";
    return;
  }
  api("POST", "/api/change-password", { password: p }).then(function () {
    $("newPw").value = "";
    $("confirmPw").value = "";
    errorEl.textContent = "";
    $("pwSuccess").classList.remove("hidden");
  }).catch(function (err) {
    errorEl.textContent = err.error || "Failed to update password.";
  });
});

$("changeEmailForm").addEventListener("submit", function (e) {
  e.preventDefault();
  $("emailError").textContent = "Email changes are handled through support.";
});

var resendEmailBtn = $("resendEmailBtn");
if (resendEmailBtn) resendEmailBtn.addEventListener("click", function () {
  $("emailError").textContent = "Email changes are handled through support.";
});

$("logoutBtn").addEventListener("click", function () {
  cleanup();
  api("POST", "/api/logout").catch(function () {});
  token = null;
  localStorage.removeItem(TOKEN_KEY);
  doWithLoading("Logging Out", "Please wait...", 700, function () {
    showLogin();
  });
});

function updateLastReceiptBtn() {
  if (!$("lastReceiptBtn")) return;
  var has = false;
  try {
    has = !!sessionStorage.getItem("lastReceipt");
  } catch (e) {}
  $("lastReceiptBtn").classList.toggle("hidden", !has);
}

$("lastReceiptBtn").addEventListener("click", function () {
  showLoading("Opening Receipt", "Please wait...");
  location.href = "receipt.html";
});

function applyTheme(t) {
  document.body.classList.toggle("dark", t === "black");
  $("themeWhite").classList.toggle("active", t === "white");
  $("themeBlack").classList.toggle("active", t === "black");
  localStorage.setItem(THEME_KEY, t);
}

$("themeWhite").addEventListener("click", function () {
  applyTheme("white");
});
$("themeBlack").addEventListener("click", function () {
  applyTheme("black");
});

var savedTheme = localStorage.getItem(THEME_KEY) || "white";
applyTheme(savedTheme);

if (token) {
  showLoading("Signing In", "Please wait...");
  api("GET", "/api/me").then(function (data) {
    if (data.ok && data.user) {
      account = data.user;
      started = true;
      showDashboard();
      startPolling();
      hideLoading();
    } else {
      token = null;
      localStorage.removeItem(TOKEN_KEY);
      hideLoading();
      showLogin();
    }
  }).catch(function () {
    token = null;
    localStorage.removeItem(TOKEN_KEY);
    hideLoading();
    showLogin();
  });
} else {
  showLogin();
}
