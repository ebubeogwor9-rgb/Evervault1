var TOKEN_KEY = "evervault_admin_token";
var users = {};
var selectedUsername = null;
var adminToken = localStorage.getItem(TOKEN_KEY) || null;

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

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

function friendlyErr(err) {
  return (err && err.error) || (err && err.message) || "Something went wrong.";
}

function api(method, path, body) {
  var opts = { method: method, headers: {} };
  if (adminToken) opts.headers["Authorization"] = "Bearer " + adminToken;
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

function showLogin() {
  $("loginView").classList.remove("hidden");
  $("adminView").classList.add("hidden");
  $("loginError").textContent = "";
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

function showAdmin() {
  $("loginView").classList.add("hidden");
  $("adminView").classList.remove("hidden");
  renderAll();
}

function cleanup() {
  users = {};
  selectedUsername = null;
  adminToken = null;
  localStorage.removeItem(TOKEN_KEY);
}

function isSuspended(u) {
  return (u.transfers || 0) >= 3;
}

function renderAll() {
  showLoading("Loading", "Fetching users...");
  api("GET", "/api/admin/users").then(function (data) {
    users = {};
    var total = 0, active = 0, suspended = 0, sum = 0;
    var html = "";
    var userList = data.users || [];
    for (var i = 0; i < userList.length; i++) {
      var u = userList[i];
      if (u.username === "__admin__") continue;
      users[u.username] = u;
      total++;
      sum += (Number(u.checking) || 0) + (Number(u.savings) || 0);
      if (isSuspended(u)) suspended++; else active++;
      var badge = isSuspended(u) ? '<span class="badge sus">SUSPENDED</span>' : '<span class="badge ok">ACTIVE</span>';
      html += '<div class="user-row" data-key="' + esc(u.username) + '">' +
        '<div><div class="name">' + esc(u.name) + badge + '</div><div class="uname">@' + esc(u.username) + ' · Transfers: ' + (u.transfers || 0) + '/3</div></div>' +
        '<div class="bal"><strong>' + money(u.checking) + '</strong> / ' + money(u.savings) + '</div>' +
        '</div>';
    }
    $("statUsers").textContent = total;
    $("statActive").textContent = active;
    $("statSuspended").textContent = suspended;
    $("statTotal").textContent = money(sum);
    $("userList").innerHTML = html || '<div style="color:#8a93a8;font-size:13px;">No users found.</div>';
    renderRecipients();
    hideLoading();

    var rows = document.querySelectorAll(".user-row");
    for (var j = 0; j < rows.length; j++) {
      rows[j].addEventListener("click", function () {
        openEditor(this.getAttribute("data-key"));
      });
    }
  }).catch(function (err) {
    hideLoading();
    $("loginError").textContent = friendlyErr(err);
    cleanup();
    showLogin();
  });
}

function openEditor(username) {
  var u = users[username];
  if (!u) return;
  selectedUsername = username;
  $("addForm").classList.add("hidden");
  $("editor").classList.remove("hidden");
  $("editorTitle").textContent = "Edit " + u.name;
  $("eName").value = u.name;
  $("eEmail").value = u.email || "";
  $("ePhone").value = u.phone || "";
  $("eUsername").value = u.username;
  $("ePassword").value = "";
  $("eChecking").value = u.checking;
  $("eSavings").value = u.savings;
  $("eTransfers").value = u.transfers;
  $("eAcctCheck").value = u.acctCheck || "";
  $("eAcctSave").value = u.acctSave || "";
  $("eRouting").value = u.routing || "";
  $("eCardNum").value = u.cardNum || "";
  $("eCardExp").value = u.cardExp || "";
  $("eCardCvv").value = u.cardCvv || "";
  $("editError").textContent = "";
  $("editOk").classList.add("hidden");
  $("hError").textContent = "";
  $("hDate").value = "";
  $("hDesc").value = "";
  $("hAmt").value = "";
  $("hBal").value = "";
  $("nMsg").value = "";
  $("nError").textContent = "";
  if ($("editHistoryBox")) $("editHistoryBox").classList.add("hidden");
  renderHistory(username);
  renderNotifications(username);
}

function renderHistory(username) {
  api("GET", "/api/admin/users/" + encodeURIComponent(username)).then(function (data) {
    var u = data.user;
    var history = u.history || [];
    var html = "";
    for (var i = 0; i < history.length; i++) {
      var t = history[i];
      var sign = t.type === "credit" ? "+" : "-";
      var cls = t.type === "credit" ? "credit" : "debit";
      html += '<div class="h-row"><div class="d">' + fmtDate(t.ts) + ' · ' + esc(t.desc) + '</div>' +
        '<div class="a ' + cls + '">' + sign + money(t.amt) + ' · bal ' + money(t.bal) + '</div>' +
        '<button class="hist-del" data-id="' + t.id + '" style="margin:0;padding:4px 10px;font-size:12px;">Remove</button></div>';
    }
    $("eHistory").innerHTML = html || '<div style="color:#8a93a8;font-size:13px;">No transactions.</div>';
    var dels = document.querySelectorAll(".hist-del");
    for (var j = 0; j < dels.length; j++) {
      dels[j].addEventListener("click", function () {
        var id = this.getAttribute("data-id");
        showLoading("Removing", "Removing history entry...");
        api("DELETE", "/api/admin/users/" + encodeURIComponent(selectedUsername) + "/history/" + id).then(function () {
          hideLoading();
          renderHistory(selectedUsername);
        }).catch(function (err) {
          hideLoading();
          $("editError").textContent = friendlyErr(err);
        });
      });
    }
  }).catch(function (err) {
    $("editError").textContent = friendlyErr(err);
  });
}

function renderNotifications(username) {
  api("GET", "/api/admin/users/" + encodeURIComponent(username)).then(function (data) {
    var u = data.user;
    var notifs = u.notifications || [];
    var html = "";
    for (var i = 0; i < notifs.length; i++) {
      var n = notifs[i];
      html += '<div class="h-row"><div class="d">' + fmtDate(n.ts) + ' · ' + esc(n.msg) + '</div>' +
        '<button class="notif-del" data-id="' + n.id + '" style="margin:0;padding:4px 10px;font-size:12px;">Remove</button></div>';
    }
    $("eNotifications").innerHTML = html || '<div style="color:#8a93a8;font-size:13px;">No notifications.</div>';
    var dels = document.querySelectorAll(".notif-del");
    for (var j = 0; j < dels.length; j++) {
      dels[j].addEventListener("click", function () {
        var id = this.getAttribute("data-id");
        showLoading("Removing", "Removing notification...");
        api("DELETE", "/api/admin/users/" + encodeURIComponent(selectedUsername) + "/notifications/" + id).then(function () {
          hideLoading();
          renderNotifications(selectedUsername);
        }).catch(function (err) {
          hideLoading();
          $("editError").textContent = friendlyErr(err);
        });
      });
    }
  }).catch(function (err) {
    $("editError").textContent = friendlyErr(err);
  });
}

function renderRecipients() {
  api("GET", "/api/admin/recipients").then(function (data) {
    var rows = data.recipients || [];
    var html = "";
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      html += '<div class="user-row" style="cursor:default;">' +
        '<div><div class="name">' + esc(r.name) + '</div><div class="uname">Account ' + esc(r.number) + '</div></div>' +
        '<button class="danger recip-del" data-num="' + esc(r.number) + '" style="margin:0;padding:8px 14px;">Remove</button>' +
        '</div>';
    }
    $("recipList").innerHTML = html || '<div style="color:#8a93a8;font-size:13px;">No custom recipients yet.</div>';
    var dels = document.querySelectorAll(".recip-del");
    for (var j = 0; j < dels.length; j++) {
      dels[j].addEventListener("click", function () {
        var num = this.getAttribute("data-num");
        showLoading("Removing", "Removing recipient...");
        api("DELETE", "/api/admin/recipients/" + encodeURIComponent(num)).then(function () {
          hideLoading();
          renderRecipients();
        }).catch(function (err) {
          hideLoading();
          $("recipError").textContent = friendlyErr(err);
        });
      });
    }
  }).catch(function () {});
}

$("adminLogin").addEventListener("submit", function (e) {
  e.preventDefault();
  var u = $("auser").value.trim();
  var p = $("apass").value;
  var errorEl = $("loginError");
  if (!u || !p) {
    errorEl.textContent = "Please enter your admin username and password.";
    return;
  }
  showLoading("Signing In", "Please wait...");
  api("POST", "/api/admin/login", { username: u, password: p }).then(function (data) {
    adminToken = data.token;
    localStorage.setItem(TOKEN_KEY, adminToken);
    errorEl.textContent = "";
    showAdmin();
    hideLoading();
  }).catch(function (err) {
    hideLoading();
    errorEl.textContent = err.error || "Invalid admin credentials.";
  });
});

$("saveBtn").addEventListener("click", function () {
  var u = users[selectedUsername];
  if (!u) return;
  var name = $("eName").value.trim();
  var check = parseFloat($("eChecking").value);
  var sav = parseFloat($("eSavings").value);
  var tr = parseInt($("eTransfers").value, 10);
  var newUname = $("eUsername").value.trim();
  var err = $("editError");
  if (!name || isNaN(check) || isNaN(sav) || isNaN(tr)) {
    err.textContent = "Please fill in valid values.";
    return;
  }
  if (!newUname) {
    err.textContent = "Username cannot be empty.";
    return;
  }
  var upd = {
    name: name,
    email: $("eEmail").value.trim(),
    phone: $("ePhone").value.trim(),
    checking: check,
    savings: sav,
    transfers: tr,
    newUsername: newUname,
    password: $("ePassword").value || undefined,
    acctCheck: $("eAcctCheck").value.trim() || undefined,
    acctSave: $("eAcctSave").value.trim() || undefined,
    routing: $("eRouting").value.trim() || undefined,
    cardNum: $("eCardNum").value.trim() || undefined,
    cardExp: $("eCardExp").value.trim() || undefined,
    cardCvv: $("eCardCvv").value.trim() || undefined
  };
  showLoading("Saving", "Saving " + name + "...");
  api("PUT", "/api/admin/users/" + encodeURIComponent(selectedUsername), upd).then(function () {
    hideLoading();
    err.textContent = "";
    $("editOk").classList.remove("hidden");
    setTimeout(function () { $("editOk").classList.add("hidden"); }, 3000);
    $("ePassword").value = "";
    if (newUname !== selectedUsername) selectedUsername = newUname;
    renderAll();
  }).catch(function (e) {
    hideLoading();
    err.textContent = friendlyErr(e);
  });
});

$("suspendBtn").addEventListener("click", function () {
  if (!selectedUsername) return;
  showLoading("Suspending", "Suspending...");
  api("POST", "/api/admin/users/" + encodeURIComponent(selectedUsername) + "/suspend").then(function () {
    hideLoading();
    openEditor(selectedUsername);
  }).catch(function (err) {
    hideLoading();
    $("editError").textContent = friendlyErr(err);
  });
});

$("reinstateBtn").addEventListener("click", function () {
  if (!selectedUsername) return;
  showLoading("Reinstating", "Reinstating...");
  api("POST", "/api/admin/users/" + encodeURIComponent(selectedUsername) + "/reinstate").then(function () {
    hideLoading();
    openEditor(selectedUsername);
  }).catch(function (err) {
    hideLoading();
    $("editError").textContent = friendlyErr(err);
  });
});

$("deleteUserBtn").addEventListener("click", function () {
  if (!selectedUsername) return;
  var u = users[selectedUsername];
  if (u && u.username === "richloner") {
    $("editError").textContent = "You cannot delete the main demo account.";
    return;
  }
  if (confirm("Delete " + (u ? u.name : selectedUsername) + "? Their transactions and notifications will also be removed.")) {
    showLoading("Deleting", "Deleting...");
    api("DELETE", "/api/admin/users/" + encodeURIComponent(selectedUsername)).then(function () {
      hideLoading();
      selectedUsername = null;
      $("editor").classList.add("hidden");
      renderAll();
    }).catch(function (err) {
      hideLoading();
      $("editError").textContent = friendlyErr(err);
    });
  }
});

$("addUserBtn").addEventListener("click", function () {
  $("editor").classList.add("hidden");
  $("addForm").classList.remove("hidden");
  $("addError").textContent = "";
});

$("cancelAddBtn").addEventListener("click", function () {
  $("addForm").classList.add("hidden");
});

$("createBtn").addEventListener("click", function () {
  var name = $("aName").value.trim();
  var uname = $("aUsername").value.trim();
  var email = $("aEmail").value.trim();
  var pass = $("aPassword").value;
  var check = parseFloat($("aChecking").value);
  var sav = parseFloat($("aSavings").value);
  var err = $("addError");
  if (!name || !uname || !pass || !email) {
    err.textContent = "Name, email, username and password are required.";
    return;
  }
  if (email.indexOf("@") < 1) {
    err.textContent = "Please enter a valid email address.";
    return;
  }
  if (pass.length < 6) {
    err.textContent = "Password must be at least 6 characters.";
    return;
  }
  if (isNaN(check) || isNaN(sav)) {
    err.textContent = "Enter valid balances.";
    return;
  }
  showLoading("Creating Account", "Creating " + name + "...");
  api("POST", "/api/admin/users", {
    name: name,
    username: uname,
    password: pass,
    email: email,
    phone: $("aPhone").value.trim(),
    checking: check,
    savings: sav,
    acctCheck: $("aAcctCheck").value.trim() || undefined,
    acctSave: $("aAcctSave").value.trim() || undefined,
    routing: $("aRouting").value.trim() || undefined
  }).then(function () {
    hideLoading();
    $("aName").value = "";
    $("aEmail").value = "";
    $("aPhone").value = "";
    $("aUsername").value = "";
    $("aPassword").value = "";
    $("aChecking").value = "0";
    $("aSavings").value = "0";
    $("aAcctCheck").value = "";
    $("aAcctSave").value = "";
    $("aRouting").value = "";
    err.textContent = "";
    $("addForm").classList.add("hidden");
    renderAll();
  }).catch(function (e) {
    hideLoading();
    err.textContent = friendlyErr(e);
  });
});

$("resetBtn").addEventListener("click", function () {
  if (confirm("Reset ALL data? This deletes every user (except admins) and every recipient.")) {
    showLoading("Resetting", "Clearing all demo data...");
    api("POST", "/api/admin/reset").then(function () {
      hideLoading();
      selectedUsername = null;
      $("editor").classList.add("hidden");
      renderAll();
    }).catch(function (err) {
      hideLoading();
      $("loginError").textContent = friendlyErr(err);
    });
  }
});

$("addHistoryBtn").addEventListener("click", function () {
  var dateVal = $("hDate").value;
  var desc = $("hDesc").value.trim();
  var amt = parseFloat($("hAmt").value);
  var type = $("hType").value;
  var err = $("hError");
  if (!selectedUsername) return;
  if (!dateVal) { err.textContent = "Choose a date."; return; }
  if (!desc || isNaN(amt) || amt <= 0) { err.textContent = "Enter a description and a valid amount."; return; }
  var ts = new Date(dateVal + "T12:00:00").getTime();
  var balField = $("hBal").value;
  var u = users[selectedUsername];
  var bal = balField !== "" ? parseFloat(balField) : ((Number(u.checking) || 0) + (Number(u.savings) || 0));
  showLoading("Adding", "Adding history entry...");
  api("POST", "/api/admin/users/" + encodeURIComponent(selectedUsername) + "/history", { ts: ts, desc: desc, type: type, amt: amt, bal: bal }).then(function () {
    hideLoading();
    err.textContent = "";
    $("hDate").value = "";
    $("hDesc").value = "";
    $("hAmt").value = "";
    $("hBal").value = "";
    renderHistory(selectedUsername);
  }).catch(function (e) {
    hideLoading();
    err.textContent = friendlyErr(e);
  });
});

$("clearHistoryBtn").addEventListener("click", function () {
  if (!selectedUsername) return;
  if (confirm("Clear all transaction history for this user?")) {
    showLoading("Clearing", "Removing all transactions...");
    api("DELETE", "/api/admin/users/" + encodeURIComponent(selectedUsername) + "/history").then(function () {
      hideLoading();
      renderHistory(selectedUsername);
    }).catch(function (err) {
      hideLoading();
      $("editError").textContent = friendlyErr(err);
    });
  }
});

$("addNotifBtn").addEventListener("click", function () {
  var msg = $("nMsg").value.trim();
  var err = $("nError");
  if (!selectedUsername) return;
  if (!msg) { err.textContent = "Enter a notification message."; return; }
  showLoading("Adding", "Adding notification...");
  api("POST", "/api/admin/users/" + encodeURIComponent(selectedUsername) + "/notifications", { msg: msg }).then(function () {
    hideLoading();
    $("nMsg").value = "";
    err.textContent = "";
    renderNotifications(selectedUsername);
  }).catch(function (e) {
    hideLoading();
    err.textContent = friendlyErr(e);
  });
});

$("addRecipBtn").addEventListener("click", function () {
  var num = $("rNumber").value.trim();
  var name = $("rName").value.trim();
  var err = $("recipError");
  if (!num || !name) { err.textContent = "Enter both an account number and a name."; return; }
  showLoading("Saving Recipient", "Adding " + name + "...");
  api("POST", "/api/admin/recipients", { number: num, name: name }).then(function () {
    hideLoading();
    $("rNumber").value = "";
    $("rName").value = "";
    err.textContent = "";
    renderRecipients();
  }).catch(function (e) {
    hideLoading();
    err.textContent = friendlyErr(e);
  });
});

$("refreshBtn").addEventListener("click", function () {
  renderAll();
});

$("logoutBtn").addEventListener("click", function () {
  cleanup();
  doWithLoading("Logging Out", "Please wait...", 700, function () {
    showLogin();
  });
});

if (adminToken) {
  showLoading("Signing In", "Verifying session...");
  api("GET", "/api/admin/users").then(function () {
    showAdmin();
    hideLoading();
  }).catch(function () {
    adminToken = null;
    localStorage.removeItem(TOKEN_KEY);
    hideLoading();
    showLogin();
  });
} else {
  showLogin();
}
