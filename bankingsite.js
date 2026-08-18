var THEME_KEY = "securebank_theme";
var EMAILJS_SERVICE = "service_qmglvqj";
var EMAILJS_TEMPLATE = "template_8e3tjuj";
var EMAILJS_PUBLIC = "flg6vStLL0JXZCxzv";
var auth = null;
var db = null;
var account = null;
var lastRecipientName = null;
var started = false;
var userUnsub = null;
var histUnsub = null;
var notifUnsub = null;
var recipTimer = null;
var isSigningUp = false;

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
  var c = err && err.code ? err.code : "";
  if (c === "auth/wrong-password" || c === "auth/user-not-found" || c === "auth/invalid-credential") return "Invalid username or password.";
  if (c === "auth/email-already-in-use") return "An account with that email already exists.";
  if (c === "auth/invalid-email") return "Please enter a valid email address.";
  if (c === "auth/weak-password") return "Password is too weak (at least 6 characters).";
  if (c === "auth/too-many-requests") return "Too many attempts. Please try again later.";
  if (c === "auth/requires-recent-login") return "Please log out and sign back in, then try again.";
  return (err && err.message) || "Something went wrong. Please try again.";
}

function sendTxnEmail(toEmail, toName, params) {
  if (!toEmail || typeof emailjs === 'undefined') return Promise.resolve(false);
  var tplParams = Object.assign({ to_email: toEmail, to_name: toName }, params);
  return emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, tplParams, EMAILJS_PUBLIC).then(function () {
    return true;
  }).catch(function (err) {
    console.error("Evervault email send failed:", err);
    return false;
  });
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

var PAGES = ["home", "transfer", "deposit", "external", "card", "account", "profile"];

function showPage(page) {
  for (var i = 0; i < PAGES.length; i++) {
    $("page-" + PAGES[i]).classList.toggle("hidden", PAGES[i] !== page);
  }
  var btns = document.querySelectorAll(".nav-btn");
  for (var j = 0; j < btns.length; j++) {
    btns[j].classList.toggle("active", btns[j].getAttribute("data-page") === page);
  }
  if (page === "deposit") renderDepositHistory();
  if (page === "external") renderExternalAccounts();
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

  var suspended = account.transfers >= 3 || !!account.suspended;
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
  if (userUnsub) userUnsub();
  if (histUnsub) histUnsub();
  if (notifUnsub) notifUnsub();
  userUnsub = histUnsub = notifUnsub = null;
}

function watchUser() {
  if (!auth.currentUser) return;
  var uid = auth.currentUser.uid;
  showLoading("Loading", "Please wait while we load your account...");
  var watchdog = setTimeout(function () {
    if (started) return;
    hideLoading();
    showLogin();
    $("loginError").textContent = "Your account could not be loaded. Sign-in email: " + (auth.currentUser ? auth.currentUser.email : "unknown") + ". Check that the user profile exists in Firestore and the security rules allow reading it.";
  }, 8000);
  userUnsub = db.collection("users").doc(uid).onSnapshot(function (doc) {
    if (!doc.exists) {
      if (isSigningUp) return;
      hideLoading();
      cleanup();
      showLogin();
      $("loginError").textContent = "Your sign-in email has no bank account profile. Please log out and use the correct email, or contact support.";
      return;
    }
    account = doc.data();
    account.created = account.created || Date.now();
    if (auth.currentUser && auth.currentUser.email && account.email !== auth.currentUser.email) {
      db.collection("users").doc(uid).update({ email: auth.currentUser.email }).catch(function () {});
    }
    try {
      if (!started) {
        started = true;
        showDashboard();
      } else {
        refresh(account);
      }
      clearTimeout(watchdog);
      hideLoading();
    } catch (e) {
      console.error("Evervault account load error:", e);
      hideLoading();
      showLogin();
      $("loginError").textContent = "Account loaded with an error: " + e.message;
    }
  }, function () {
    hideLoading();
    showLogin();
    $("loginError").textContent = "Could not load your account (Firestore permission denied or offline). Check your Firestore security rules.";
  });
  histUnsub = db.collection("users").doc(uid).collection("history").orderBy("ts", "desc").onSnapshot(function (snap) {
    if (!account) return;
    account.history = [];
    snap.forEach(function (d) {
      var h = d.data();
      h.id = d.id;
      account.history.push(h);
    });
    renderHistory(account);
  });
  notifUnsub = db.collection("users").doc(uid).collection("notifications").orderBy("ts", "desc").onSnapshot(function (snap) {
    if (!account) return;
    account.notifications = [];
    snap.forEach(function (d) {
      var n = d.data();
      n.id = d.id;
      account.notifications.push(n);
    });
    renderNotifications(account);
  });
}

function resolveEmail(id) {
  if (id.indexOf("@") > -1) return Promise.resolve(id);
  return db.collection("users").where("username", "==", id).get().then(function (snap) {
    if (snap.empty) throw new Error("No account found with username '" + id + "'.");
    var email = snap.docs[0].data().email;
    if (!email) throw new Error("Account not found.");
    return email;
  });
}

function lookupRecipient(num) {
  var info = $("recipientInfo");
  lastRecipientName = null;
  info.innerHTML = '<span class="notfound">Checking...</span>';
  var q1 = db.collection("users").where("acctCheck", "==", num).get();
  var q2 = db.collection("users").where("acctSave", "==", num).get();
  var q3 = db.collection("recipients").doc(num).get();
  Promise.all([q1, q2, q3]).then(function (rs) {
    var userMatch = rs[0].docs[0] || rs[1].docs[0];
    if (userMatch) {
      lastRecipientName = userMatch.data().name;
      info.innerHTML = '<span class="found">' + esc(lastRecipientName) + '</span>';
    } else if (rs[2].exists) {
      lastRecipientName = rs[2].data().name;
      info.innerHTML = '<span class="found">' + esc(lastRecipientName) + '</span>';
    } else {
      info.innerHTML = '<span class="notfound">External account</span>';
    }
  }).catch(function () {
    info.innerHTML = '<span class="notfound">External account</span>';
  });
}

function findRecipient(num) {
  var q1 = db.collection("users").where("acctCheck", "==", num).get();
  var q2 = db.collection("users").where("acctSave", "==", num).get();
  var q3 = db.collection("recipients").doc(num).get();
  return Promise.all([q1, q2, q3]).then(function (rs) {
    var a = rs[0].docs[0];
    if (a) return { uid: a.id, field: "acctCheck", balField: "checking", name: a.data().name };
    var b = rs[1].docs[0];
    if (b) return { uid: b.id, field: "acctSave", balField: "savings", name: b.data().name };
    if (rs[2].exists) return { uid: null, field: null, balField: null, name: rs[2].data().name };
    return { uid: null, field: null, balField: null, name: null };
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
  resolveEmail(u).then(function (email) {
    return auth.signInWithEmailAndPassword(email, p);
  }).then(function () {
    errorEl.textContent = "";
    setTimeout(hideLoading, 1200);
  }).catch(function (err) {
    hideLoading();
    errorEl.textContent = friendlyErr(err);
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
  isSigningUp = true;
  auth.createUserWithEmailAndPassword(email, p).then(function (res) {
    var uid = res.user.uid;
    var doc = {
      name: name,
      email: email,
      phone: phone,
      username: uname,
      routing: genDigits(9),
      acctCheck: genDigits(10),
      acctSave: genDigits(10),
      cardNum: genDigits(16),
      cardExp: genCardExp(),
      cardCvv: genDigits(3),
      checking: 0,
      savings: 0,
      transfers: 0,
      suspended: false,
      role: "user",
      created: Date.now()
    };
    return db.collection("users").get().then(function (snap) {
      if (snap.size === 0) doc.role = "admin";
      return db.collection("users").doc(uid).set(doc);
    });
  }).then(function () {
    isSigningUp = false;
    $("fullName").value = "";
    $("email").value = "";
    $("phone").value = "";
    $("newUsername").value = "";
    $("newPassword").value = "";
    $("confirmPassword").value = "";
    errorEl.textContent = "";
  }).catch(function (err) {
    isSigningUp = false;
    hideLoading();
    errorEl.textContent = friendlyErr(err);
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

  var resolvedR = null;
  findRecipient(recipient).then(function (r) {
    resolvedR = r;
    var selfRef = db.collection("users").doc(auth.currentUser.uid);
    var recipRef = r.uid ? db.collection("users").doc(r.uid) : null;
    return db.runTransaction(function (tr) {
      var reads = [tr.get(selfRef)];
      if (recipRef) reads.push(tr.get(recipRef));
      return Promise.all(reads).then(function (snaps) {
        var selfSnap = snaps[0];
        if (!selfSnap.exists) throw new Error("Account not found.");
        var self = selfSnap.data();
        if (self.suspended || (self.transfers || 0) >= 3) throw new Error("Transfer limit reached. Please try again later.");
        var bal = Number(self[from] || 0);
        if (bal < amount) throw new Error("Insufficient balance in " + acctName(from) + ".");
        var newBal = round2(bal - amount);
        var ts = Date.now();
        var last4 = String(recipient).slice(-4);
        var entry = {
          id: uid(),
          ts: ts,
          desc: "Transfer to " + (r.name || "External") + " (•••• " + last4 + ")",
          type: "debit",
          amt: amount,
          bal: newBal
        };
        tr.update(selfRef, { [from]: newBal, transfers: (self.transfers || 0) + 1 });
        tr.set(selfRef.collection("history").doc(entry.id), entry);
        if (!recipRef) return { newBal: newBal, name: r.name };
        var rs = snaps[1];
        if (!rs.exists) throw new Error("Recipient account no longer exists.");
        var rd = rs.data();
        var rNew = round2(Number(rd[r.balField] || 0) + amount);
        var fromField = r.field === "acctCheck" ? "acctCheck" : "acctSave";
        var rentry = {
          id: uid(),
          ts: ts,
          desc: "Transfer from " + self.name + " (•••• " + String(self[fromField]).slice(-4) + ")",
          type: "credit",
          amt: amount,
          bal: rNew
        };
        tr.update(recipRef, { [r.balField]: rNew });
        tr.set(recipRef.collection("history").doc(rentry.id), rentry);
        return { newBal: newBal, name: rd.name };
      });
    });
  }).then(function (res) {
    sessionStorage.setItem("lastReceipt", JSON.stringify({
      id: txnId(),
      time: fmtDateTime(Date.now()),
      from: acctName(from) + " · •••• " + String(account[from === "checking" ? "acctCheck" : "acctSave"]).slice(-4),
      to: (res.name ? res.name + " · " : "") + "•••• " + recipient.slice(-4),
      amount: money(amount),
      balance: money(res.newBal)
    }));
    $("processingOverlay").classList.add("hidden");
    errorEl.textContent = "";
    updateLastReceiptBtn();
    var emailJobs = [];
    var txnTime = fmtDateTime(Date.now());
    var txnIdVal = txnId();
    var recipDisplayName = res.name || "Account •••• " + recipient.slice(-4);
    var acctFromName = acctName(from);
    var acctFromNum = "•••• " + String(account[from === "checking" ? "acctCheck" : "acctSave"]).slice(-4);
    if (account) {
      var senderReceipt = "EVERVAULT SECURE BANKING\n"
        + "================================\n\n"
        + "  *** DEBIT ALERT ***\n\n"
        + "A debit transaction has been made on your account.\n\n"
        + "--------------------------------\n\n"
        + "Transaction Type:  DEBIT - Transfer Sent\n"
        + "Status:            COMPLETED\n"
        + "Amount:            -" + money(amount) + "\n"
        + "Account:           " + acctFromName + " " + acctFromNum + "\n\n"
        + "Recipient:         " + recipDisplayName + "\n\n"
        + "Transaction ID:    " + txnIdVal + "\n"
        + "Date & Time:       " + txnTime + "\n"
        + "Balance After:     " + money(res.newBal) + "\n\n"
        + "--------------------------------\n\n"
        + "If you did not authorize this transaction,\n"
        + "contact support immediately at +1 443 898 1098.\n\n"
        + "Evervault Secure Banking - Automated Notification";
      emailJobs.push(sendTxnEmail(account.email, account.name, {
        subject: "DEBIT ALERT - " + money(amount) + " sent from your Evervault account",
        message: senderReceipt
      }));
      if (resolvedR && resolvedR.uid) {
        emailJobs.push(db.collection("users").doc(resolvedR.uid).get().then(function (ds) {
          if (ds.exists) {
            var rd = ds.data();
            if (rd.email) {
              var recipAcctField = r.field === "acctCheck" ? "Checking" : "Savings";
              var recipAcctNum = "•••• " + String(recipient).slice(-4);
              var recipReceipt = "EVERVAULT SECURE BANKING\n"
                + "================================\n\n"
                + "  *** CREDIT ALERT ***\n\n"
                + "A credit transaction has been made to your account.\n\n"
                + "--------------------------------\n\n"
                + "Transaction Type:  CREDIT - Transfer Received\n"
                + "Status:            COMPLETED\n"
                + "Amount:            +" + money(amount) + "\n"
                + "Account:           " + recipAcctField + " " + recipAcctNum + "\n\n"
                + "Sent By:           " + account.name + " (" + acctFromName + " " + acctFromNum + ")\n\n"
                + "Transaction ID:    " + txnIdVal + "\n"
                + "Date & Time:       " + txnTime + "\n"
                + "Balance After:     " + money(Number(rd[r.balField] || 0) + amount) + "\n\n"
                + "--------------------------------\n\n"
                + "If you did not authorize this transaction,\n"
                + "contact support immediately at +1 443 898 1098.\n\n"
                + "Evervault Secure Banking - Automated Notification";
              return sendTxnEmail(rd.email, rd.name, {
                subject: "CREDIT ALERT - " + money(amount) + " received into your Evervault account",
                message: recipReceipt
              });
            }
          }
          return false;
        }).catch(function () { return false; }));
      }
    }
    showLoading("Sending Receipt Email", "Finalizing your transfer...");
    Promise.all(emailJobs).then(function (results) {
      var failed = false;
      for (var i = 0; i < results.length; i++) if (results[i] === false) failed = true;
      if (failed) errorEl.textContent = "Transfer complete, but the receipt email could not be sent. Please contact support.";
      showLoading("Opening Receipt", "Please wait...");
      location.href = "receipt.html";
    });
  }).catch(function (err) {
    $("processingOverlay").classList.add("hidden");
    errorEl.textContent = err.message;
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

  var selfRef = db.collection("users").doc(auth.currentUser.uid);
  db.runTransaction(function (tr) {
    return tr.get(selfRef).then(function (selfSnap) {
      if (!selfSnap.exists) throw new Error("Account not found.");
      var self = selfSnap.data();
      if (self.suspended || (self.transfers || 0) >= 3) throw new Error("Transfer limit reached. Please try again later.");
      var bal = Number(self[from] || 0);
      if (bal < amount) throw new Error("Insufficient balance in " + acctName(from) + ".");
      var newFrom = round2(bal - amount);
      var newTo = round2(Number(self[to] || 0) + amount);
      var ts = Date.now();
      var e1 = { id: uid(), ts: ts, desc: "Internal transfer to " + acctName(to), type: "debit", amt: amount, bal: newFrom };
      var e2 = { id: uid(), ts: ts, desc: "Internal transfer from " + acctName(from), type: "credit", amt: amount, bal: newTo };
      tr.update(selfRef, { checking: round2(from === "checking" ? newFrom : self.checking), savings: round2(from === "savings" ? newFrom : (to === "savings" ? newTo : self.savings)), transfers: (self.transfers || 0) + 1 });
      tr.set(selfRef.collection("history").doc(e1.id), e1);
      tr.set(selfRef.collection("history").doc(e2.id), e2);
    });
  }).then(function () {
    $("processingOverlay").classList.add("hidden");
    $("intSuccess").classList.remove("hidden");
    $("intAmount").value = "";
    errorEl.textContent = "";
    if (account) {
      var internalReceipt = "EVERVAULT SECURE BANKING\n"
        + "================================\n\n"
        + "INTERNAL TRANSFER RECEIPT\n"
        + "--------------------------------\n\n"
        + "Transaction Type:  Internal Transfer\n"
        + "Status:            COMPLETED\n\n"
        + "Amount:            " + money(amount) + "\n"
        + "Transaction ID:    " + txnId() + "\n"
        + "Date & Time:       " + fmtDateTime(Date.now()) + "\n\n"
        + "From Account:      " + acctName(from) + "\n"
        + "To Account:        " + acctName(to) + "\n\n"
        + "--------------------------------\n"
        + "This is an automated notification from Evervault Secure Banking.\n"
        + "If you did not authorize this transaction, contact support at +1 443 898 1098.";
      sendTxnEmail(account.email, account.name, {
        subject: "Evervault - Internal Transfer - " + money(amount),
        message: internalReceipt
      });
    }
  }).catch(function (err) {
    $("processingOverlay").classList.add("hidden");
    errorEl.textContent = err.message;
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
  auth.currentUser.updatePassword(p).then(function () {
    $("newPw").value = "";
    $("confirmPw").value = "";
    errorEl.textContent = "";
    $("pwSuccess").classList.remove("hidden");
  }).catch(function (err) {
    errorEl.textContent = friendlyErr(err);
  });
});

$("changeEmailForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var newEmail = $("newEmail").value.trim();
  var curPw = $("curPw").value;
  var errorEl = $("emailError");
  var okEl = $("emailSuccess");
  if (!newEmail || !curPw) {
    errorEl.textContent = "Enter the new email and your current password.";
    return;
  }
  if (newEmail.indexOf("@") < 1 || newEmail.indexOf(".") < 2) {
    errorEl.textContent = "Please enter a valid email address.";
    return;
  }
  var user = auth.currentUser;
  if (!user) return;
  var cred = firebase.auth.EmailAuthProvider.credential(user.email, curPw);
  errorEl.textContent = "";
  okEl.classList.add("hidden");
  showLoading("Sending", "Sending a verification email to the new address...");
  user.reauthenticateWithCredential(cred).then(function () {
    return user.verifyBeforeUpdateEmail(newEmail);
  }).then(function () {
    hideLoading();
    $("curPw").value = "";
    okEl.classList.remove("hidden");
  }).catch(function (err) {
    hideLoading();
    errorEl.textContent = friendlyErr(err);
  });
});

var resendEmailBtn = $("resendEmailBtn");
if (resendEmailBtn) resendEmailBtn.addEventListener("click", function () {
  var newEmail = $("newEmail").value.trim();
  var errorEl = $("emailError");
  var okEl = $("emailSuccess");
  var user = auth.currentUser;
  if (!user) return;
  if (!newEmail) {
    errorEl.textContent = "Enter the new email first, then click Resend.";
    return;
  }
  errorEl.textContent = "";
  okEl.classList.add("hidden");
  showLoading("Resending", "Sending the verification email again...");
  user.verifyBeforeUpdateEmail(newEmail).then(function () {
    hideLoading();
    okEl.classList.remove("hidden");
  }).catch(function (err) {
    hideLoading();
    errorEl.textContent = friendlyErr(err);
  });
});

$("logoutBtn").addEventListener("click", function () {
  cleanup();
  doWithLoading("Logging Out", "Please wait...", 700, function () {
    auth.signOut().catch(function () {});
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

if (location.protocol === "file:") {
  $("loginError").textContent = "Opened as a local file. Upload the Evervault folder to Netlify and open the live link instead.";
} else if (!window.firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey.indexOf("PASTE_HERE") !== -1) {
  $("loginError").textContent = "Firebase is not configured yet. Add your Firebase config to firebase-config.js (see the setup notes).";
} else {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  if (typeof emailjs !== 'undefined') emailjs.init(EMAILJS_PUBLIC);
  firebase.auth().onAuthStateChanged(function (user) {
    if (user) {
      watchUser();
      initChat(user);
    } else {
      cleanup();
      showLogin();
      closeChat();
    }
  });
}

var chatUnsub = null;
var chatOpen = false;

function initChat(user) {
  var bubble = $("chatBubble");
  if (!bubble) return;
  bubble.classList.remove("hidden");
  bubble.onclick = toggleChat;
  $("chatClose").onclick = closeChat;
  $("chatSend").onclick = sendChatMsg;
  $("chatInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") sendChatMsg();
  });
}

function toggleChat() {
  chatOpen = !chatOpen;
  $("chatPanel").classList.toggle("hidden", !chatOpen);
  if (chatOpen) {
    $("chatInput").focus();
    listenChat();
  }
}

function closeChat() {
  chatOpen = false;
  $("chatPanel").classList.add("hidden");
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
}

function listenChat() {
  if (chatUnsub) return;
  var uid = auth.currentUser.uid;
  var chatRef = db.collection("chats").doc(uid);
  chatRef.set({ userId: uid, userName: account.name, userEmail: account.email, createdAt: firebase.firestore.FieldValue.serverTimestamp(), status: "open" }, { merge: true }).catch(function () {});
  chatUnsub = chatRef.collection("messages").orderBy("ts").onSnapshot(function (snap) {
    var box = $("chatMessages");
    var wasBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    box.innerHTML = '<div class="chat-welcome"><strong>Evervault Support</strong>How can we help you today?</div>';
    snap.forEach(function (d) {
      var m = d.data();
      var div = document.createElement("div");
      div.className = "chat-msg " + (m.sender === "admin" ? "admin" : "user");
      div.innerHTML = esc(m.text) + '<span class="msg-time">' + fmtTime(m.ts || Date.now()) + '</span>';
      box.appendChild(div);
    });
    if (wasBottom) box.scrollTop = box.scrollHeight;
  });
}

function sendChatMsg() {
  var input = $("chatInput");
  var text = input.value.trim();
  if (!text || !auth.currentUser) return;
  input.value = "";
  var uid = auth.currentUser.uid;
  var chatRef = db.collection("chats").doc(uid);
  chatRef.collection("messages").add({
    sender: "user",
    senderName: account.name,
    text: text,
    ts: Date.now()
  }).then(function () {
    return chatRef.set({ lastMessage: text, lastUpdate: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }).catch(function () {});
}

function fmtTime(ts) {
  var d = new Date(ts);
  var h = d.getHours();
  var m = ("0" + d.getMinutes()).slice(-2);
  var ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return h + ":" + m + " " + ap;
}

function setupDeposit() {
  var frontInput = $("depositFront");
  var backInput = $("depositBack");
  if (frontInput) frontInput.addEventListener("change", function () {
    if (this.files && this.files[0]) {
      var reader = new FileReader();
      reader.onload = function (e) {
        $("depositFrontPreview").src = e.target.result;
        $("depositFrontPreview").classList.remove("hidden");
        $("depositFrontPlaceholder").style.display = "none";
      };
      reader.readAsDataURL(this.files[0]);
    }
  });
  if (backInput) backInput.addEventListener("change", function () {
    if (this.files && this.files[0]) {
      var reader = new FileReader();
      reader.onload = function (e) {
        $("depositBackPreview").src = e.target.result;
        $("depositBackPreview").classList.remove("hidden");
        $("depositBackPlaceholder").style.display = "none";
      };
      reader.readAsDataURL(this.files[0]);
    }
  });

  var depositForm = $("depositForm");
  if (depositForm) depositForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!auth.currentUser || !account) return;
    var acct = $("depositAccount").value;
    var amount = parseFloat($("depositAmount").value);
    var checkNum = $("depositCheckNum").value.trim();
    var payer = $("depositPayer").value.trim();
    var errorEl = $("depositError");
    if (isNaN(amount) || amount <= 0) { errorEl.textContent = "Enter a valid amount."; return; }
    if (!checkNum) { errorEl.textContent = "Enter the check number."; return; }
    if (!payer) { errorEl.textContent = "Enter the payer name."; return; }
    var frontFile = $("depositFront").files[0];
    if (!frontFile) { errorEl.textContent = "Please upload a photo of the front of the check."; return; }
    $("processingOverlay").classList.remove("hidden");
    var reader = new FileReader();
    reader.onload = function (ev) {
      var frontData = ev.target.result;
      var backFile = $("depositBack").files[0];
      if (backFile) {
        var reader2 = new FileReader();
        reader2.onload = function (ev2) {
          processDeposit(acct, amount, checkNum, payer, frontData, ev2.target.result);
        };
        reader2.readAsDataURL(backFile);
      } else {
        processDeposit(acct, amount, checkNum, payer, frontData, null);
      }
    };
    reader.readAsDataURL(frontFile);
  });
}

function processDeposit(acct, amount, checkNum, payer, frontImg, backImg) {
  var selfRef = db.collection("users").doc(auth.currentUser.uid);
  db.runTransaction(function (tr) {
    return tr.get(selfRef).then(function (snap) {
      if (!snap.exists) throw new Error("Account not found.");
      var data = snap.data();
      var bal = Number(data[acct] || 0);
      var newBal = round2(bal + amount);
      var ts = Date.now();
      var entry = {
        id: uid(),
        ts: ts,
        desc: "Mobile deposit · Check #" + checkNum + " from " + payer,
        type: "credit",
        amt: amount,
        bal: newBal
      };
      tr.update(selfRef, { [acct]: newBal });
      tr.set(selfRef.collection("history").doc(entry.id), entry);
      tr.set(selfRef.collection("deposits").doc(entry.id), {
        id: entry.id,
        ts: ts,
        amount: amount,
        checkNum: checkNum,
        payer: payer,
        account: acct,
        frontImg: frontImg,
        backImg: backImg || null,
        status: "completed"
      });
      return { newBal: newBal };
    });
  }).then(function (res) {
    $("processingOverlay").classList.add("hidden");
    $("depositError").textContent = "";
    $("depositSuccess").classList.remove("hidden");
    $("depositForm").reset();
    $("depositFrontPreview").classList.add("hidden");
    $("depositBackPreview").classList.add("hidden");
    $("depositFrontPlaceholder").style.display = "";
    $("depositBackPlaceholder").style.display = "";
    renderDepositHistory();
    setTimeout(function () { $("depositSuccess").classList.add("hidden"); }, 5000);
  }).catch(function (err) {
    $("processingOverlay").classList.add("hidden");
    $("depositError").textContent = err.message;
  });
}

function renderDepositHistory() {
  if (!auth.currentUser) return;
  var box = $("depositHistoryList");
  if (!box) return;
  db.collection("users").doc(auth.currentUser.uid).collection("deposits").orderBy("ts", "desc").limit(10).get().then(function (snap) {
    if (snap.empty) { box.innerHTML = '<div class="history-empty">No deposits yet.</div>'; return; }
    var html = "";
    snap.forEach(function (d) {
      var dep = d.data();
      var dt = new Date(dep.ts);
      var dateStr = (dt.getMonth() + 1) + "/" + dt.getDate() + "/" + dt.getFullYear();
      var statusColor = dep.status === "completed" ? "#0b7a3b" : dep.status === "pending" ? "#b8860b" : "#a01c1c";
      html += '<div class="history-row">'
        + '<div class="left"><div class="desc">Check #' + esc(dep.checkNum) + ' · ' + esc(dep.payer) + '</div>'
        + '<div class="date">' + dateStr + ' · ' + esc(dep.account) + '</div></div>'
        + '<div class="right"><div class="amt credit">+' + money(dep.amount) + '</div>'
        + '<div class="bal" style="color:' + statusColor + '">' + esc(dep.status) + '</div></div></div>';
    });
    box.innerHTML = html;
  }).catch(function () {
    box.innerHTML = '<div class="history-empty">Could not load deposits.</div>';
  });
}

document.addEventListener("DOMContentLoaded", function () {
  setupDeposit();
});
if (document.readyState !== "loading") setupDeposit();

function renderExternalAccounts() {
  if (!auth.currentUser) return;
  var box = $("externalList");
  if (!box) return;
  db.collection("users").doc(auth.currentUser.uid).collection("externalAccounts").orderBy("createdAt", "desc").get().then(function (snap) {
    if (snap.empty) { box.innerHTML = '<div class="ext-empty">No external accounts linked yet.</div>'; return; }
    var html = "";
    snap.forEach(function (d) {
      var a = d.data();
      var last4 = String(a.acctNum || "").slice(-4);
      var mask = "••••" + last4;
      var verified = a.verified ? '<span class="ext-verified">Verified</span>' : '<span class="ext-pending">Pending</span>';
      html += '<div class="ext-account-card">'
        + '<div class="ext-info">'
        + '<div class="ext-bank">' + esc(a.bankName) + ' ' + verified + '</div>'
        + '<div class="ext-detail">' + esc(a.acctType) + ' ' + mask + ' · Routing ' + esc(a.routing || "").slice(-4) + '</div>'
        + (a.nickname ? '<div class="ext-nick">' + esc(a.nickname) + '</div>' : '')
        + '</div>'
        + '<div class="ext-actions">'
        + '<button class="secondary ext-delete" data-eid="' + esc(d.id) + '">Remove</button>'
        + '</div></div>';
    });
    box.innerHTML = html;
    var delBtns = box.querySelectorAll(".ext-delete");
    for (var i = 0; i < delBtns.length; i++) {
      delBtns[i].addEventListener("click", function () {
        var eid = this.getAttribute("data-eid");
        if (confirm("Remove this external account?")) {
          db.collection("users").doc(auth.currentUser.uid).collection("externalAccounts").doc(eid).delete().then(function () {
            renderExternalAccounts();
          });
        }
      });
    }
  }).catch(function () {
    box.innerHTML = '<div class="ext-empty">Could not load external accounts.</div>';
  });
}

function setupLinkExternal() {
  var form = $("linkExternalForm");
  if (!form) return;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!auth.currentUser) return;
    var errorEl = $("extError");
    var bankName = $("extBankName").value.trim();
    var acctType = $("extAcctType").value;
    var routing = $("extRouting").value.trim();
    var acctNum = $("extAcctNum").value.trim();
    var nickname = $("extAcctName").value.trim();
    if (!bankName) { errorEl.textContent = "Enter the bank name."; return; }
    if (!routing || routing.length < 9) { errorEl.textContent = "Enter a valid 9-digit routing number."; return; }
    if (!acctNum) { errorEl.textContent = "Enter the account number."; return; }
    errorEl.textContent = "";
    db.collection("users").doc(auth.currentUser.uid).collection("externalAccounts").add({
      bankName: bankName,
      acctType: acctType,
      routing: routing,
      acctNum: acctNum,
      nickname: nickname || bankName + " " + acctType,
      verified: true,
      createdAt: Date.now()
    }).then(function () {
      $("extSuccess").classList.remove("hidden");
      form.reset();
      renderExternalAccounts();
      setTimeout(function () { $("extSuccess").classList.add("hidden"); }, 4000);
    }).catch(function (err) {
      errorEl.textContent = err.message;
    });
  });
}

document.addEventListener("DOMContentLoaded", function () {
  setupLinkExternal();
});
if (document.readyState !== "loading") setupLinkExternal();
