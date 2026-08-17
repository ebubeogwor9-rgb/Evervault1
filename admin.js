var auth = null;
var db = null;
var users = {};
var recipients = {};
var selectedUid = null;
var adminCreds = null;
var adminUid = null;
var creatingUser = false;
var editingHistoryId = null;
var usersUnsub = null;
var recipUnsub = null;
var lastUsersJson = "";

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

function uid() {
  var s = "";
  for (var i = 0; i < 6; i++) s += Math.floor(Math.random() * 36).toString(36);
  return s + Date.now().toString(36);
}

function genCardExp() {
  var d = new Date();
  var m = d.getMonth() + 2;
  var y = d.getFullYear() + 4;
  m = m % 12 || 12;
  return ("0" + m).slice(-2) + "/" + String(y).slice(2);
}

function friendlyErr(err) {
  var c = err && err.code ? err.code : "";
  if (c === "auth/wrong-password" || c === "auth/user-not-found" || c === "auth/invalid-credential") return "Invalid username or password.";
  if (c === "auth/email-already-in-use") return "An account with that email already exists.";
  if (c === "auth/invalid-email") return "Please enter a valid email address.";
  if (c === "auth/weak-password") return "Password is too weak (at least 6 characters).";
  if (c === "auth/too-many-requests") return "Too many attempts. Please try again later.";
  return (err && err.message) || "Something went wrong. Please try again.";
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
  startListeners();
  renderAll();
}

function cleanup() {
  users = {};
  recipients = {};
  selectedUid = null;
  adminCreds = null;
  adminUid = null;
  lastUsersJson = "";
  if (usersUnsub) usersUnsub();
  if (recipUnsub) recipUnsub();
  usersUnsub = recipUnsub = null;
}

function startListeners() {
  if (usersUnsub) return;
  usersUnsub = db.collection("users").onSnapshot(function (snap) {
    users = {};
    var arr = [];
    snap.forEach(function (d) {
      var u = d.data();
      u.uid = d.id;
      users[d.id] = u;
      arr.push(u);
    });
    var json = JSON.stringify(arr);
    if (json !== lastUsersJson) {
      lastUsersJson = json;
      renderAll();
    }
  });
  recipUnsub = db.collection("recipients").onSnapshot(function (snap) {
    recipients = {};
    snap.forEach(function (d) {
      recipients[d.id] = d.data();
    });
    renderRecipients();
  });
}

function isSuspended(u) {
  return !!u.suspended || (u.transfers || 0) >= 3;
}

function renderAll() {
  var total = 0, active = 0, suspended = 0, sum = 0;
  var html = "";
  var keys = Object.keys(users);
  for (var i = 0; i < keys.length; i++) {
    var u = users[keys[i]];
    if (u.role === "admin") continue;
    total++;
    sum += (Number(u.checking) || 0) + (Number(u.savings) || 0);
    if (isSuspended(u)) suspended++; else active++;
    var badge = isSuspended(u) ? '<span class="badge sus">SUSPENDED</span>' : '<span class="badge ok">ACTIVE</span>';
    html += '<div class="user-row" data-key="' + esc(u.uid) + '">' +
      '<div><div class="name">' + esc(u.name) + badge + '</div><div class="uname">@' + esc(u.username) + ' · Transfers: ' + (u.transfers || 0) + '/3</div></div>' +
      '<div class="bal"><strong>' + money(u.checking) + '</strong> / ' + money(u.savings) + '</div>' +
      '</div>';
  }
  $("statUsers").textContent = total;
  $("statActive").textContent = active;
  $("statSuspended").textContent = suspended;
  $("statTotal").textContent = money(sum);
  $("userList").innerHTML = html;

  var rows = document.querySelectorAll(".user-row");
  for (var j = 0; j < rows.length; j++) {
    rows[j].addEventListener("click", function () {
      openEditor(this.getAttribute("data-key"));
    });
  }
}

function openEditor(uid) {
  var u = users[uid];
  if (!u) return;
  selectedUid = uid;
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
  editingHistoryId = null;
  if ($("editHistoryBox")) $("editHistoryBox").classList.add("hidden");
  renderHistory(uid);
  renderNotifications(uid);
}

function renderHistory(uid) {
  db.collection("users").doc(uid).collection("history").orderBy("ts", "desc").get().then(function (snap) {
    var html = "";
    snap.forEach(function (d) {
      var t = d.data();
      var sign = t.type === "credit" ? "+" : "-";
      var cls = t.type === "credit" ? "credit" : "debit";
      html += '<div class="h-row"><div class="d">' + fmtDate(t.ts) + ' · ' + esc(t.desc) + '</div>' +
        '<div class="a ' + cls + '">' + sign + money(t.amt) + ' · bal ' + money(t.bal) + '</div>' +
        '<button class="hist-edit" data-id="' + d.id + '" style="margin:0;padding:4px 10px;font-size:12px;width:auto;background:#eef2f7;color:#3a4a5a;">Edit</button>' +
        '<button class="danger hist-del" data-id="' + d.id + '" style="margin:0;padding:4px 10px;font-size:12px;">Remove</button></div>';
    });
    $("eHistory").innerHTML = html || '<div style="color:#8a93a8;font-size:13px;">No transactions.</div>';
    var edits = document.querySelectorAll(".hist-edit");
    for (var k = 0; k < edits.length; k++) {
      edits[k].addEventListener("click", function () {
        openEditHistory(this.getAttribute("data-id"));
      });
    }
    var dels = document.querySelectorAll(".hist-del");
    for (var j = 0; j < dels.length; j++) {
      dels[j].addEventListener("click", function () {
        var id = this.getAttribute("data-id");
        showLoading("Removing", "Removing history entry...");
        db.collection("users").doc(selectedUid).collection("history").doc(id).delete()
          .then(function () {
            hideLoading();
            renderHistory(selectedUid);
          })
          .catch(function (err) {
            hideLoading();
            $("editError").textContent = err.message;
          });
      });
    }
  }).catch(function (err) {
    $("editError").textContent = err.message;
  });
}

function openEditHistory(id) {
  if (!selectedUid) return;
  editingHistoryId = id;
  db.collection("users").doc(selectedUid).collection("history").doc(id).get().then(function (doc) {
    if (!doc.exists) return;
    var t = doc.data();
    var d = new Date(t.ts);
    var ymd = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    $("edDate").value = ymd;
    $("edDesc").value = t.desc || "";
    $("edAmt").value = t.amt != null ? t.amt : "";
    $("edType").value = t.type || "credit";
    $("edBal").value = t.bal != null ? t.bal : "";
    $("edError").textContent = "";
    $("editHistoryBox").classList.remove("hidden");
    $("editHistoryBox").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }).catch(function (err) {
    $("edError").textContent = err.message;
  });
}

function renderNotifications(uid) {
  db.collection("users").doc(uid).collection("notifications").orderBy("ts", "desc").get().then(function (snap) {
    var html = "";
    snap.forEach(function (d) {
      var n = d.data();
      html += '<div class="h-row"><div class="d">' + fmtDate(n.ts) + ' · ' + esc(n.msg) + '</div>' +
        '<button class="danger notif-del" data-id="' + d.id + '" style="margin:0;padding:4px 10px;font-size:12px;">Remove</button></div>';
    });
    $("eNotifications").innerHTML = html || '<div style="color:#8a93a8;font-size:13px;">No notifications.</div>';
    var dels = document.querySelectorAll(".notif-del");
    for (var j = 0; j < dels.length; j++) {
      dels[j].addEventListener("click", function () {
        var id = this.getAttribute("data-id");
        showLoading("Removing", "Removing notification...");
        db.collection("users").doc(selectedUid).collection("notifications").doc(id).delete()
          .then(function () {
            hideLoading();
            renderNotifications(selectedUid);
          })
          .catch(function (err) {
            hideLoading();
            $("editError").textContent = err.message;
          });
      });
    }
  }).catch(function (err) {
    $("editError").textContent = err.message;
  });
}

function renderRecipients() {
  var keys = Object.keys(recipients);
  var html = "";
  for (var i = 0; i < keys.length; i++) {
    var num = keys[i];
    html += '<div class="user-row" style="cursor:default;">' +
      '<div><div class="name">' + esc(recipients[num].name) + '</div><div class="uname">Account ' + esc(num) + '</div></div>' +
      '<button class="danger recip-del" data-num="' + esc(num) + '" style="margin:0;padding:8px 14px;">Remove</button>' +
      '</div>';
  }
  $("recipList").innerHTML = html || '<div style="color:#8a93a8;font-size:13px;">No custom recipients yet.</div>';
  var dels = document.querySelectorAll(".recip-del");
  for (var j = 0; j < dels.length; j++) {
    dels[j].addEventListener("click", function () {
      var num = this.getAttribute("data-num");
      showLoading("Removing", "Removing recipient...");
      db.collection("recipients").doc(num).delete()
        .then(function () {
          hideLoading();
        })
        .catch(function (err) {
          hideLoading();
          $("recipError").textContent = err.message;
        });
    });
  }
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

$("adminLogin").addEventListener("submit", function (e) {
  e.preventDefault();
  var u = $("auser").value.trim();
  var p = $("apass").value;
  var errorEl = $("loginError");
  if (!u || !p) {
    errorEl.textContent = "Please enter your admin username and password.";
    return;
  }
  showLoading("Signing In", "Please wait while we verify your credentials...");
  var resolvedEmail = null;
  resolveEmail(u).then(function (email) {
    resolvedEmail = email;
    return auth.signInWithEmailAndPassword(email, p);
  }).then(function () {
    adminCreds = { email: resolvedEmail, pass: p };
    errorEl.textContent = "";
    setTimeout(hideLoading, 1200);
  }).catch(function (err) {
    hideLoading();
    errorEl.textContent = friendlyErr(err);
  });
});

$("saveBtn").addEventListener("click", function () {
  var u = users[selectedUid];
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
    checking: round2(check),
    savings: round2(sav),
    transfers: tr,
    username: newUname,
    acctCheck: $("eAcctCheck").value.trim() || u.acctCheck,
    acctSave: $("eAcctSave").value.trim() || u.acctSave,
    routing: $("eRouting").value.trim() || u.routing,
    cardNum: $("eCardNum").value.trim() || u.cardNum,
    cardExp: $("eCardExp").value.trim() || u.cardExp,
    cardCvv: $("eCardCvv").value.trim() || u.cardCvv
  };
  showLoading("Saving", "Saving " + name + "...");
  if (newUname !== u.username) {
    db.collection("users").where("username", "==", newUname).get().then(function (snap) {
      var taken = false;
      snap.forEach(function (d) {
        if (d.id !== selectedUid) taken = true;
      });
      if (taken) {
        hideLoading();
        err.textContent = "That username is already taken.";
        return;
      }
      doSave(upd, u);
    }).catch(function (e) {
      hideLoading();
      err.textContent = e.message;
    });
  } else {
    doSave(upd, u);
  }
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

function doSave(upd, u) {
  var err = $("editError");
  db.collection("users").doc(selectedUid).update(upd).then(function () {
    hideLoading();
    err.textContent = "";
    $("editOk").classList.remove("hidden");
    setTimeout(function () {
      $("editOk").classList.add("hidden");
    }, 3000);
    var pw = $("ePassword").value;
    $("ePassword").value = "";
    if (pw && u.email) {
      auth.sendPasswordResetEmail(u.email).then(function () {
        $("editOk").textContent = "Saved. A password reset email was sent to " + u.email + ".";
      }).catch(function () {
        $("editOk").textContent = "Saved (but the password reset email could not be sent).";
      }).then(function () {
        setTimeout(function () {
          $("editOk").classList.add("hidden");
          $("editOk").textContent = "Saved.";
        }, 4000);
      });
    }
    openEditor(selectedUid);
  }).catch(function (e) {
    hideLoading();
    err.textContent = e.message;
  });
}

$("suspendBtn").addEventListener("click", function () {
  var u = users[selectedUid];
  if (!u) return;
  showLoading("Suspending", "Suspending " + u.name + "...");
  db.collection("users").doc(selectedUid).update({ suspended: true, transfers: 3 })
    .then(function () {
      hideLoading();
      openEditor(selectedUid);
    })
    .catch(function (err) {
      hideLoading();
      $("editError").textContent = err.message;
    });
});

$("reinstateBtn").addEventListener("click", function () {
  var u = users[selectedUid];
  if (!u) return;
  showLoading("Reinstating", "Reinstating " + u.name + "...");
  db.collection("users").doc(selectedUid).update({ suspended: false, transfers: 0 })
    .then(function () {
      hideLoading();
      openEditor(selectedUid);
    })
    .catch(function (err) {
      hideLoading();
      $("editError").textContent = err.message;
    });
});

function deleteSub(col) {
  return col.get().then(function (snap) {
    var batch = db.batch();
    snap.forEach(function (d) {
      batch.delete(d.ref);
    });
    return batch.commit();
  });
}

$("deleteUserBtn").addEventListener("click", function () {
  var u = users[selectedUid];
  if (!u) return;
  if (u.role === "admin") {
    $("editError").textContent = "You cannot delete an admin account.";
    return;
  }
  if (confirm("Delete " + u.name + "? Their transactions and notifications will also be removed.")) {
    showLoading("Deleting", "Deleting " + u.name + "...");
    var ref = db.collection("users").doc(selectedUid);
    Promise.all([
      deleteSub(ref.collection("history")),
      deleteSub(ref.collection("notifications"))
    ]).then(function () {
      return ref.delete();
    }).then(function () {
      hideLoading();
      selectedUid = null;
      $("editor").classList.add("hidden");
      $("editOk").classList.add("hidden");
      $("editOk").textContent = "Saved.";
    }).catch(function (err) {
      hideLoading();
      $("editError").textContent = err.message;
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
  if (!adminCreds) {
    err.textContent = "Please log out and sign back in once (this browser needs your admin credentials to create users).";
    return;
  }
  showLoading("Creating Account", "Creating " + name + "...");
  db.collection("users").where("username", "==", uname).get().then(function (snap) {
    if (!snap.empty) throw new Error("That username is already taken.");
    return auth.createUserWithEmailAndPassword(email, pass);
  }).then(function (res) {
    creatingUser = true;
    var uid = res.user.uid;
    var doc = {
      name: name,
      email: email,
      phone: $("aPhone").value.trim(),
      username: uname,
      routing: $("aRouting").value.trim() || genDigits(9),
      acctCheck: $("aAcctCheck").value.trim() || genDigits(10),
      acctSave: $("aAcctSave").value.trim() || genDigits(10),
      cardNum: genDigits(16),
      cardExp: genCardExp(),
      cardCvv: genDigits(3),
      checking: check,
      savings: sav,
      transfers: 0,
      suspended: false,
      role: "user",
      created: Date.now()
    };
    return db.collection("users").doc(uid).set(doc);
  }).then(function () {
    return auth.signInWithEmailAndPassword(adminCreds.email, adminCreds.pass);
  }).then(function () {
    hideLoading();
    creatingUser = false;
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
    lastUsersJson = "";
    renderAll();
  }).catch(function (e) {
    hideLoading();
    creatingUser = false;
    err.textContent = friendlyErr(e);
  });
});

$("resetBtn").addEventListener("click", function () {
  if (confirm("Reset ALL data? This deletes every user (except admins) and every recipient.")) {
    showLoading("Resetting", "Clearing all demo data...");
    var ops = [];
    db.collection("users").get().then(function (snap) {
      snap.forEach(function (d) {
        var u = d.data();
        if (u.role === "admin") return;
        ops.push(deleteSub(d.ref.collection("history")));
        ops.push(deleteSub(d.ref.collection("notifications")));
        ops.push(d.ref.delete());
      });
      return Promise.all(ops);
    }).then(function () {
      return db.collection("recipients").get().then(function (s) {
        var batch = db.batch();
        s.forEach(function (d) {
          batch.delete(d.ref);
        });
        return batch.commit();
      });
    }).then(function () {
      hideLoading();
      selectedUid = null;
      $("editor").classList.add("hidden");
      $("editOk").classList.add("hidden");
      $("editOk").textContent = "Saved.";
    }).catch(function (err) {
      hideLoading();
      $("loginError").textContent = err.message;
    });
  }
});

$("addHistoryBtn").addEventListener("click", function () {
  var dateVal = $("hDate").value;
  var desc = $("hDesc").value.trim();
  var amt = parseFloat($("hAmt").value);
  var type = $("hType").value;
  var err = $("hError");
  if (!selectedUid) return;
  if (!dateVal) {
    err.textContent = "Choose a date.";
    return;
  }
  if (!desc || isNaN(amt) || amt <= 0) {
    err.textContent = "Enter a description and a valid amount.";
    return;
  }
  var ts = new Date(dateVal + "T12:00:00").getTime();
  var balField = $("hBal").value;
  var u = users[selectedUid];
  var bal = balField !== "" ? parseFloat(balField) : ((Number(u.checking) || 0) + (Number(u.savings) || 0));
  showLoading("Adding", "Adding history entry...");
  db.collection("users").doc(selectedUid).collection("history").add({
    ts: ts,
    desc: desc,
    type: type,
    amt: amt,
    bal: bal
  }).then(function () {
    hideLoading();
    err.textContent = "";
    $("hDate").value = "";
    $("hDesc").value = "";
    $("hAmt").value = "";
    $("hBal").value = "";
    renderHistory(selectedUid);
  }).catch(function (e) {
    hideLoading();
    err.textContent = e.message;
  });
});

function ymd(y, m, d) { return new Date(y, m - 1, d).getTime(); }

var SEED_HISTORY = [
  { ts: ymd(2026, 7, 1),   desc: "Savings · Transfer to checking", type: "debit",  amt: 13435.88, bal: 200564.12 },
  { ts: ymd(2026, 5, 20),  desc: "Checking · Wire transfer in",     type: "credit", amt: 26386.34, bal: 300916.34 },
  { ts: ymd(2026, 2, 8),   desc: "Checking · Salary deposit",       type: "credit", amt: 5500,     bal: 274530 },
  { ts: ymd(2025, 10, 15), desc: "Savings · Interest payment",      type: "credit", amt: 2200,     bal: 214000 },
  { ts: ymd(2025, 5, 30),  desc: "Checking · Card purchase",        type: "debit",  amt: 420,      bal: 269030 },
  { ts: ymd(2025, 1, 12),  desc: "Checking · Salary deposit",       type: "credit", amt: 5500,     bal: 269450 },
  { ts: ymd(2024, 11, 5),  desc: "Savings · Deposit",               type: "credit", amt: 10000,    bal: 211800 },
  { ts: ymd(2024, 6, 18),  desc: "Checking · Rent payment",         type: "debit",  amt: 2200,     bal: 263950 },
  { ts: ymd(2024, 2, 10),  desc: "Checking · Salary deposit",       type: "credit", amt: 5500,     bal: 266150 },
  { ts: ymd(2023, 9, 30),  desc: "Savings · Interest payment",      type: "credit", amt: 1800,     bal: 201800 },
  { ts: ymd(2023, 4, 22),  desc: "Checking · Utilities payment",    type: "debit",  amt: 300,      bal: 260650 },
  { ts: ymd(2023, 1, 15),  desc: "Checking · Salary deposit",       type: "credit", amt: 5000,     bal: 260950 },
  { ts: ymd(2022, 9, 12),  desc: "Checking · Transfer out",         type: "debit",  amt: 500,      bal: 255950 },
  { ts: ymd(2022, 5, 25),  desc: "Checking · Card purchase",        type: "debit",  amt: 350,      bal: 256450 },
  { ts: ymd(2022, 3, 8),   desc: "Checking · Salary deposit",       type: "credit", amt: 5000,     bal: 256800 },
  { ts: ymd(2022, 1, 20),  desc: "Savings · Deposit",               type: "credit", amt: 18800,    bal: 200000 },
  { ts: ymd(2021, 8, 14),  desc: "Checking · Rent payment",         type: "debit",  amt: 2000,     bal: 251800 },
  { ts: ymd(2021, 6, 30),  desc: "Savings · Interest payment",      type: "credit", amt: 1200,     bal: 181200 },
  { ts: ymd(2021, 2, 14),  desc: "Checking · Salary deposit",       type: "credit", amt: 5000,     bal: 253800 },
  { ts: ymd(2020, 10, 12), desc: "Checking · ATM withdrawal",       type: "debit",  amt: 1200,     bal: 248800 },
  { ts: ymd(2020, 4, 1),   desc: "Checking · Opening deposit",      type: "credit", amt: 250000,   bal: 250000 },
  { ts: ymd(2020, 4, 1),   desc: "Savings · Opening deposit",       type: "credit", amt: 180000,   bal: 180000 }
];

$("seedHistoryBtn").addEventListener("click", function () {
  var err = $("hError");
  if (!selectedUid) return;
  var u = users[selectedUid];
  var name = u ? u.name : "this user";
  var ref = db.collection("users").doc(selectedUid).collection("history");
  ref.get().then(function (snap) {
    if (!snap.empty && !confirm("This user already has " + snap.size + " history entries. Add the 2020-to-date history anyway?")) {
      return;
    }
    showLoading("Seeding", "Adding 2020-to-date history for " + name + "...");
    var batch = db.batch();
    SEED_HISTORY.forEach(function (h) {
      var docRef = ref.doc(uid());
      batch.set(docRef, {
        ts: h.ts,
        desc: h.desc,
        type: h.type,
        amt: round2(h.amt),
        bal: round2(h.bal)
      });
    });
    return batch.commit();
  }).then(function () {
    hideLoading();
    err.textContent = "";
    renderHistory(selectedUid);
  }).catch(function (e) {
    hideLoading();
    err.textContent = e.message;
  });
});

var saveHistBtnEl = $("saveHistBtn");
if (saveHistBtnEl) saveHistBtnEl.addEventListener("click", function () {
  if (!selectedUid || !editingHistoryId) return;
  var dateVal = $("edDate").value;
  var desc = $("edDesc").value.trim();
  var amt = parseFloat($("edAmt").value);
  var type = $("edType").value;
  var bal = parseFloat($("edBal").value);
  var err = $("edError");
  if (!dateVal || !desc || isNaN(amt) || amt <= 0 || isNaN(bal)) {
    err.textContent = "Fill in date, description, amount and balance.";
    return;
  }
  var ts = new Date(dateVal + "T12:00:00").getTime();
  showLoading("Saving", "Saving receipt changes...");
  db.collection("users").doc(selectedUid).collection("history").doc(editingHistoryId).update({
    ts: ts,
    desc: desc,
    type: type,
    amt: round2(amt),
    bal: round2(bal)
  }).then(function () {
    hideLoading();
    editingHistoryId = null;
    $("editHistoryBox").classList.add("hidden");
    err.textContent = "";
    renderHistory(selectedUid);
  }).catch(function (e) {
    hideLoading();
    err.textContent = e.message;
  });
});

var cancelHistBtnEl = $("cancelHistBtn");
if (cancelHistBtnEl) cancelHistBtnEl.addEventListener("click", function () {
  editingHistoryId = null;
  $("editHistoryBox").classList.add("hidden");
  $("edError").textContent = "";
});

$("addNotifBtn").addEventListener("click", function () {
  var msg = $("nMsg").value.trim();
  var err = $("nError");
  if (!selectedUid) return;
  if (!msg) {
    err.textContent = "Enter a notification message.";
    return;
  }
  showLoading("Adding", "Adding notification...");
  db.collection("users").doc(selectedUid).collection("notifications").add({
    msg: msg,
    ts: Date.now()
  }).then(function () {
    hideLoading();
    $("nMsg").value = "";
    err.textContent = "";
    renderNotifications(selectedUid);
  }).catch(function (e) {
    hideLoading();
    err.textContent = e.message;
  });
});

$("clearHistoryBtn").addEventListener("click", function () {
  if (!selectedUid) return;
  if (confirm("Clear all transaction history for this user?")) {
    showLoading("Clearing", "Removing all transactions...");
    deleteSub(db.collection("users").doc(selectedUid).collection("history"))
      .then(function () {
        hideLoading();
        renderHistory(selectedUid);
      })
      .catch(function (err) {
        hideLoading();
        $("editError").textContent = err.message;
      });
  }
});

$("addRecipBtn").addEventListener("click", function () {
  var num = $("rNumber").value.trim();
  var name = $("rName").value.trim();
  var err = $("recipError");
  if (!num || !name) {
    err.textContent = "Enter both an account number and a name.";
    return;
  }
  showLoading("Saving Recipient", "Adding " + name + "...");
  db.collection("recipients").doc(num).set({ name: name })
    .then(function () {
      hideLoading();
      $("rNumber").value = "";
      $("rName").value = "";
      err.textContent = "";
    })
    .catch(function (e) {
      hideLoading();
      err.textContent = e.message;
    });
});

$("refreshBtn").addEventListener("click", function () {
  showLoading("Refreshing", "Please wait...");
  setTimeout(function () {
    renderAll();
    renderRecipients();
    hideLoading();
  }, 400);
});

$("logoutBtn").addEventListener("click", function () {
  cleanup();
  doWithLoading("Logging Out", "Please wait...", 700, function () {
    auth.signOut().catch(function () {});
    showLogin();
  });
});

if (location.protocol === "file:") {
  $("loginError").textContent = "Opened as a local file. Upload the Evervault folder to Netlify and open the live link instead.";
} else if (!window.firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey.indexOf("PASTE_HERE") !== -1) {
  $("loginError").textContent = "Firebase is not configured yet. Add your Firebase config to firebase-config.js (see the setup notes).";
} else {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  firebase.auth().onAuthStateChanged(function (user) {
    if (!user) {
      cleanup();
      showLogin();
      return;
    }
    db.collection("users").doc(user.uid).get().then(function (doc) {
      var data = doc.exists ? doc.data() : null;
      if (data && data.role === "admin") {
        adminUid = user.uid;
        showAdmin();
      } else if (creatingUser) {
        // transient session while the admin creates a user; admin is re-authenticated right after
      } else {
        auth.signOut().catch(function () {});
        $("loginError").textContent = "This account is not an admin.";
        showLogin();
      }
    }).catch(function () {
      showLogin();
    });
  });
}
