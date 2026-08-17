const express = require('express');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const DatabaseSync = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';
const DEMO_USER = 'richloner';
const DEMO_PASS = 'Deroy123';

const SMTP_EMAIL = process.env.SMTP_EMAIL || 'dayorwire7@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || 'rtzk pjez sfqn wjmd';

const app = express();
app.use(express.json());

app.use(function (req, res, next) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const db = DatabaseSync(path.join(__dirname, 'evervault.db'));

db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  checking REAL NOT NULL DEFAULT 0,
  savings REAL NOT NULL DEFAULT 0,
  transfers INTEGER NOT NULL DEFAULT 0,
  acct_check TEXT,
  acct_save TEXT,
  routing TEXT,
  card_num TEXT,
  card_exp TEXT,
  card_cvv TEXT,
  created INTEGER
);
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  ts INTEGER NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  amt REAL NOT NULL,
  bal REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  ts INTEGER NOT NULL,
  msg TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recipients (
  number TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  created INTEGER NOT NULL
);
`);

function r2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

function genNum(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function genTxnId() {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'TXN';
  for (let i = 0; i < 12; i++) id += c[Math.floor(Math.random() * c.length)];
  return id;
}

function money(n) {
  return '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function assignAccounts(fields) {
  fields = fields || {};
  if (!fields.acctCheck) fields.acctCheck = genNum(10);
  if (!fields.acctSave) fields.acctSave = genNum(10);
  if (!fields.routing) fields.routing = genNum(9);
  if (!fields.cardNum) fields.cardNum = '5' + genNum(15);
  if (!fields.cardExp) {
    const d = new Date();
    fields.cardExp = ('0' + (d.getMonth() + 1)).slice(-2) + '/' + String((d.getFullYear() + 4) % 100).padStart(2, '0');
  }
  if (!fields.cardCvv) fields.cardCvv = genNum(3);
  return fields;
}

function insertUser(username, fields) {
  db.prepare(`INSERT OR REPLACE INTO users
    (username,password,name,email,phone,checking,savings,transfers,acct_check,acct_save,routing,card_num,card_exp,card_cvv,created)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      username, fields.password, fields.name, fields.email || '', fields.phone || '',
      r2(fields.checking || 0), r2(fields.savings || 0), fields.transfers || 0,
      fields.acctCheck || null, fields.acctSave || null, fields.routing || null,
      fields.cardNum || null, fields.cardExp || null, fields.cardCvv || null,
      fields.created || Date.now()
    );
}

function insertHistory(username, ts, description, type, amt, bal) {
  db.prepare('INSERT INTO history (username,ts,description,type,amt,bal) VALUES (?,?,?,?,?,?)')
    .run(username, ts, description, type, r2(amt), r2(bal));
}

function insertNotification(username, ts, msg) {
  db.prepare('INSERT INTO notifications (username,ts,msg) VALUES (?,?,?)').run(username, ts, msg);
}

function ymd(y, m, d) { return new Date(y, m - 1, d).getTime(); }

const SEED_HISTORY = [
  { ts: ymd(2026, 7, 1),   desc: 'Savings · Transfer to checking', type: 'debit',  amt: 13435.88, bal: 200564.12 },
  { ts: ymd(2026, 5, 20),  desc: 'Checking · Wire transfer in',     type: 'credit', amt: 26386.34, bal: 300916.34 },
  { ts: ymd(2026, 2, 8),   desc: 'Checking · Salary deposit',       type: 'credit', amt: 5500,     bal: 274530 },
  { ts: ymd(2025, 10, 15), desc: 'Savings · Interest payment',      type: 'credit', amt: 2200,     bal: 214000 },
  { ts: ymd(2025, 5, 30),  desc: 'Checking · Card purchase',        type: 'debit',  amt: 420,      bal: 269030 },
  { ts: ymd(2025, 1, 12),  desc: 'Checking · Salary deposit',       type: 'credit', amt: 5500,     bal: 269450 },
  { ts: ymd(2024, 11, 5),  desc: 'Savings · Deposit',               type: 'credit', amt: 10000,    bal: 211800 },
  { ts: ymd(2024, 6, 18),  desc: 'Checking · Rent payment',         type: 'debit',  amt: 2200,     bal: 263950 },
  { ts: ymd(2024, 2, 10),  desc: 'Checking · Salary deposit',       type: 'credit', amt: 5500,     bal: 266150 },
  { ts: ymd(2023, 9, 30),  desc: 'Savings · Interest payment',      type: 'credit', amt: 1800,     bal: 201800 },
  { ts: ymd(2023, 4, 22),  desc: 'Checking · Utilities payment',    type: 'debit',  amt: 300,      bal: 260650 },
  { ts: ymd(2023, 1, 15),  desc: 'Checking · Salary deposit',       type: 'credit', amt: 5000,     bal: 260950 },
  { ts: ymd(2022, 9, 12),  desc: 'Checking · Transfer out',         type: 'debit',  amt: 500,      bal: 255950 },
  { ts: ymd(2022, 5, 25),  desc: 'Checking · Card purchase',        type: 'debit',  amt: 350,      bal: 256450 },
  { ts: ymd(2022, 3, 8),   desc: 'Checking · Salary deposit',       type: 'credit', amt: 5000,     bal: 256800 },
  { ts: ymd(2022, 1, 20),  desc: 'Savings · Deposit',               type: 'credit', amt: 18800,    bal: 200000 },
  { ts: ymd(2021, 8, 14),  desc: 'Checking · Rent payment',         type: 'debit',  amt: 2000,     bal: 251800 },
  { ts: ymd(2021, 6, 30),  desc: 'Savings · Interest payment',      type: 'credit', amt: 1200,     bal: 181200 },
  { ts: ymd(2021, 2, 14),  desc: 'Checking · Salary deposit',       type: 'credit', amt: 5000,     bal: 253800 },
  { ts: ymd(2020, 10, 12), desc: 'Checking · ATM withdrawal',       type: 'debit',  amt: 1200,     bal: 248800 },
  { ts: ymd(2020, 4, 1),   desc: 'Checking · Opening deposit',      type: 'credit', amt: 250000,   bal: 250000 },
  { ts: ymd(2020, 4, 1),   desc: 'Savings · Opening deposit',       type: 'credit', amt: 180000,   bal: 180000 }
];

function seedDemo() {
  const f = assignAccounts({});
  insertUser(DEMO_USER, {
    password: DEMO_PASS, name: 'Barrett leo', email: 'joyg84605@gmail.com', phone: '(555) 010-2026',
    checking: 300916.34, savings: 200564.12, transfers: 0, created: ymd(2020, 4, 1),
    ...f
  });
  for (const h of SEED_HISTORY) insertHistory(DEMO_USER, h.ts, h.desc, h.type, h.amt, h.bal);
  insertNotification(DEMO_USER, Date.now(), 'Welcome to Evervault! Your account is active.');
}

const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (!userCount) seedDemo();

function getPublicUser(username, includePassword) {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u) return null;
  const history = db.prepare('SELECT id,ts,description AS desc,type,amt,bal FROM history WHERE username=? ORDER BY ts DESC, id DESC').all(username);
  const notifications = db.prepare('SELECT id,ts,msg FROM notifications WHERE username=? ORDER BY ts DESC, id DESC').all(username);
  const out = {
    username: u.username, name: u.name, email: u.email || '', phone: u.phone || '',
    checking: u.checking, savings: u.savings, transfers: u.transfers,
    acctCheck: u.acct_check, acctSave: u.acct_save, routing: u.routing,
    cardNum: u.card_num, cardExp: u.card_exp, cardCvv: u.card_cvv,
    created: u.created,
    history, notifications
  };
  if (includePassword) out.password = u.password;
  return out;
}

function createToken(username, role) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO tokens (token,username,role,created) VALUES (?,?,?,?)').run(token, username, role, Date.now());
  return token;
}

function auth(role) {
  return function (req, res, next) {
    const h = req.headers['authorization'] || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const row = token ? db.prepare('SELECT * FROM tokens WHERE token=?').get(token) : null;
    if (!row) return res.status(401).json({ error: 'Not authorized.' });
    if (role && row.role !== role) return res.status(403).json({ error: 'Forbidden.' });
    req.tokenRow = row;
    req.authToken = token;
    next();
  };
}

/* ---------- Customer API ---------- */

app.post('/api/register', function (req, res) {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  const email = String(b.email || '').trim();
  const phone = String(b.phone || '').trim();
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Name, username and password are required.' });
  }
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) {
    return res.status(400).json({ error: 'That username is already taken.' });
  }
  const f = assignAccounts({});
  insertUser(username, { password, name, email, phone, checking: 0, savings: 0, transfers: 0, created: Date.now(), ...f });
  const token = createToken(username, 'user');
  res.json({ ok: true, token, user: getPublicUser(username) });
});

app.post('/api/login', function (req, res) {
  const b = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(b.username || ''));
  if (!u || u.password !== String(b.password || '')) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  const token = createToken(u.username, 'user');
  res.json({ ok: true, token, user: getPublicUser(u.username) });
});

app.post('/api/logout', auth('user'), function (req, res) {
  db.prepare('DELETE FROM tokens WHERE token=?').run(req.authToken);
  res.json({ ok: true });
});

app.get('/api/me', auth('user'), function (req, res) {
  const u = getPublicUser(req.tokenRow.username);
  if (!u) {
    db.prepare('DELETE FROM tokens WHERE token=?').run(req.authToken);
    return res.status(401).json({ error: 'Session expired.' });
  }
  res.json({ ok: true, user: u });
});

app.post('/api/change-password', auth('user'), function (req, res) {
  const password = String((req.body || {}).password || '');
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  db.prepare('UPDATE users SET password=? WHERE username=?').run(password, req.tokenRow.username);
  res.json({ ok: true });
});

app.get('/api/recipient/:number', auth('user'), function (req, res) {
  const num = req.params.number;
  const r = db.prepare('SELECT name FROM recipients WHERE number=?').get(num);
  if (r) return res.json({ name: r.name });
  const u = db.prepare('SELECT name FROM users WHERE acct_check=? OR acct_save=?').get(num, num);
  res.json({ name: u ? u.name : null });
});

app.post('/api/transfer', auth('user'), function (req, res) {
  const username = req.tokenRow.username;
  const b = req.body || {};
  const from = String(b.from || '');
  const recipient = String(b.recipient || '').trim();
  const amount = r2(Number(b.amount));
  if (from !== 'checking' && from !== 'savings') return res.status(400).json({ error: 'Invalid account.' });
  if (!recipient) return res.status(400).json({ error: 'Please enter a recipient account number.' });
  if (!(amount > 0)) return res.status(400).json({ error: 'Please enter a valid amount.' });
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u) return res.status(401).json({ error: 'Session expired.' });
  if (u.transfers >= 3) return res.status(400).json({ error: 'Transfer limit reached. Please try again later.' });
  const col = from === 'checking' ? 'checking' : 'savings';
  if (amount > u[col]) {
    return res.status(400).json({ error: 'Insufficient balance in ' + (col === 'checking' ? 'Checking' : 'Savings') + '.' });
  }
  const newBal = r2(u[col] - amount);
  const txnId = genTxnId();
  const now = Date.now();
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE users SET ' + col + '=?, transfers=transfers+1 WHERE username=?').run(newBal, username);
    insertHistory(username, now, (col === 'checking' ? 'Checking' : 'Savings') + ' · Transfer to ' + recipient + ' (' + txnId + ')', 'debit', amount, newBal);
    insertNotification(username, now, 'Your transfer of ' + money(amount) + ' to •••• ' + recipient.slice(-4) + ' was completed.');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ ok: true, txnId, ts: now, from, to: recipient, amount, balance: newBal, user: getPublicUser(username) });
});

app.post('/api/internal-transfer', auth('user'), function (req, res) {
  const username = req.tokenRow.username;
  const b = req.body || {};
  const from = String(b.from || '');
  const to = String(b.to || '');
  const amount = r2(Number(b.amount));
  if ((from !== 'checking' && from !== 'savings') || (to !== 'checking' && to !== 'savings')) {
    return res.status(400).json({ error: 'Invalid account.' });
  }
  if (from === to) return res.status(400).json({ error: 'Please pick two different accounts.' });
  if (!(amount > 0)) return res.status(400).json({ error: 'Please enter a valid amount.' });
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u) return res.status(401).json({ error: 'Session expired.' });
  if (u.transfers >= 3) return res.status(400).json({ error: 'Transfer limit reached. Please try again later.' });
  if (amount > u[from]) {
    return res.status(400).json({ error: 'Insufficient balance in ' + (from === 'checking' ? 'Checking' : 'Savings') + '.' });
  }
  const newFrom = r2(u[from] - amount);
  const newTo = r2(u[to] + amount);
  const now = Date.now();
  const labelFrom = from === 'checking' ? 'Checking' : 'Savings';
  const labelTo = to === 'checking' ? 'Checking' : 'Savings';
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE users SET checking=?, savings=?, transfers=transfers+1 WHERE username=?').run(newFrom, newTo, username);
    insertHistory(username, now, labelFrom + ' · Transfer to ' + labelTo, 'debit', amount, newFrom);
    insertHistory(username, now + 1, labelTo + ' · Transfer from ' + labelFrom, 'credit', amount, newTo);
    insertNotification(username, now, 'Your transfer of ' + money(amount) + ' from ' + labelFrom + ' to ' + labelTo + ' was completed.');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ ok: true, user: getPublicUser(username) });
});

/* ---------- Admin API ---------- */

app.post('/api/admin/login', function (req, res) {
  const b = req.body || {};
  if (String(b.username || '') === ADMIN_USER && String(b.password || '') === ADMIN_PASS) {
    const token = createToken('__admin__', 'admin');
    return res.json({ ok: true, token });
  }
  res.status(401).json({ error: 'Invalid admin credentials.' });
});

app.get('/api/admin/users', auth('admin'), function (req, res) {
  const rows = db.prepare('SELECT * FROM users ORDER BY created DESC').all();
  const users = rows.map(function (u) {
    return {
      username: u.username, name: u.name, email: u.email || '', phone: u.phone || '',
      password: u.password, checking: u.checking, savings: u.savings, transfers: u.transfers,
      acctCheck: u.acct_check, acctSave: u.acct_save, routing: u.routing,
      cardNum: u.card_num, cardExp: u.card_exp, cardCvv: u.card_cvv, created: u.created
    };
  });
  res.json({ ok: true, users });
});

app.get('/api/admin/users/:username', auth('admin'), function (req, res) {
  const u = getPublicUser(req.params.username, true);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  res.json({ ok: true, user: u });
});

app.post('/api/admin/users', auth('admin'), function (req, res) {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  const checking = r2(Number(b.checking));
  const savings = r2(Number(b.savings));
  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username and password are required.' });
  if (isNaN(checking) || isNaN(savings)) return res.status(400).json({ error: 'Enter valid balances.' });
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return res.status(400).json({ error: 'That username already exists.' });
  const f = assignAccounts({ acctCheck: String(b.acctCheck || ''), acctSave: String(b.acctSave || ''), routing: String(b.routing || '') });
  insertUser(username, {
    password, name, email: String(b.email || '').trim(), phone: String(b.phone || '').trim(),
    checking, savings, transfers: 0, created: Date.now(), ...f
  });
  res.json({ ok: true, user: getPublicUser(username) });
});

app.put('/api/admin/users/:username', auth('admin'), function (req, res) {
  const oldName = req.params.username;
  const b = req.body || {};
  const existing = db.prepare('SELECT * FROM users WHERE username=?').get(oldName);
  if (!existing) return res.status(404).json({ error: 'User not found.' });
  let newName = String(b.newUsername !== undefined ? b.newUsername : (b.username !== undefined ? b.username : oldName)).trim();
  if (!newName) return res.status(400).json({ error: 'Username cannot be empty.' });
  if (newName !== oldName) {
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(newName)) return res.status(400).json({ error: 'That username is already taken.' });
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE users SET username=? WHERE username=?').run(newName, oldName);
      db.prepare('UPDATE history SET username=? WHERE username=?').run(newName, oldName);
      db.prepare('UPDATE notifications SET username=? WHERE username=?').run(newName, oldName);
      db.prepare('UPDATE tokens SET username=? WHERE username=?').run(newName, oldName);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  const v = function (key, fallback) { return b[key] !== undefined ? b[key] : fallback; };
  db.prepare(`UPDATE users SET name=?,email=?,phone=?,checking=?,savings=?,transfers=?,password=?,acct_check=?,acct_save=?,routing=?,card_num=?,card_exp=?,card_cvv=? WHERE username=?`)
    .run(
      String(v('name', existing.name)).trim(), String(v('email', existing.email || '')).trim(), String(v('phone', existing.phone || '')).trim(),
      r2(Number(v('checking', existing.checking))), r2(Number(v('savings', existing.savings))), Number(v('transfers', existing.transfers)) || 0,
      String(v('password', existing.password)),
      String(v('acctCheck', existing.acct_check)).trim() || existing.acct_check, String(v('acctSave', existing.acct_save)).trim() || existing.acct_save,
      String(v('routing', existing.routing)).trim() || existing.routing, String(v('cardNum', existing.card_num)).trim() || existing.card_num,
      String(v('cardExp', existing.card_exp)).trim() || existing.card_exp, String(v('cardCvv', existing.card_cvv)).trim() || existing.card_cvv,
      newName
    );
  res.json({ ok: true, user: getPublicUser(newName, true) });
});

app.delete('/api/admin/users/:username', auth('admin'), function (req, res) {
  const username = req.params.username;
  if (username === DEMO_USER) return res.status(400).json({ error: 'You cannot delete the main demo account.' });
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM history WHERE username=?').run(username);
    db.prepare('DELETE FROM notifications WHERE username=?').run(username);
    db.prepare('DELETE FROM tokens WHERE username=?').run(username);
    db.prepare('DELETE FROM users WHERE username=?').run(username);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ ok: true });
});

app.post('/api/admin/users/:username/suspend', auth('admin'), function (req, res) {
  db.prepare('UPDATE users SET transfers=3 WHERE username=?').run(req.params.username);
  res.json({ ok: true });
});

app.post('/api/admin/users/:username/reinstate', auth('admin'), function (req, res) {
  db.prepare('UPDATE users SET transfers=0 WHERE username=?').run(req.params.username);
  res.json({ ok: true });
});

app.post('/api/admin/users/:username/history', auth('admin'), function (req, res) {
  const b = req.body || {};
  const ts = Number(b.ts);
  const desc = String(b.desc || '').trim();
  const amt = r2(Number(b.amt));
  const type = b.type === 'credit' ? 'credit' : 'debit';
  if (!ts || !desc || !(amt > 0)) return res.status(400).json({ error: 'Enter a valid date, description and amount.' });
  const bal = b.bal !== undefined && b.bal !== '' ? r2(Number(b.bal)) : null;
  insertHistory(req.params.username, ts, desc, type, amt, bal === null ? amt : bal);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:username/history/:id', auth('admin'), function (req, res) {
  db.prepare('DELETE FROM history WHERE id=? AND username=?').run(Number(req.params.id), req.params.username);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:username/history', auth('admin'), function (req, res) {
  db.prepare('DELETE FROM history WHERE username=?').run(req.params.username);
  res.json({ ok: true });
});

app.post('/api/admin/users/:username/notifications', auth('admin'), function (req, res) {
  const msg = String((req.body || {}).msg || '').trim();
  if (!msg) return res.status(400).json({ error: 'Enter a notification message.' });
  insertNotification(req.params.username, Date.now(), msg);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:username/notifications/:id', auth('admin'), function (req, res) {
  db.prepare('DELETE FROM notifications WHERE id=? AND username=?').run(Number(req.params.id), req.params.username);
  res.json({ ok: true });
});

app.get('/api/admin/recipients', auth('admin'), function (req, res) {
  const rows = db.prepare('SELECT * FROM recipients ORDER BY number').all();
  res.json({ ok: true, recipients: rows });
});

app.post('/api/admin/recipients', auth('admin'), function (req, res) {
  const b = req.body || {};
  const number = String(b.number || '').trim();
  const name = String(b.name || '').trim();
  if (!number || !name) return res.status(400).json({ error: 'Enter both an account number and a name.' });
  db.prepare('INSERT OR REPLACE INTO recipients (number,name) VALUES (?,?)').run(number, name);
  res.json({ ok: true });
});

app.delete('/api/admin/recipients/:number', auth('admin'), function (req, res) {
  db.prepare('DELETE FROM recipients WHERE number=?').run(req.params.number);
  res.json({ ok: true });
});

app.post('/api/admin/reset', auth('admin'), function (req, res) {
  db.exec("DELETE FROM users; DELETE FROM history; DELETE FROM notifications; DELETE FROM recipients; DELETE FROM tokens WHERE role='user';");
  seedDemo();
  res.json({ ok: true });
});

/* ---------- Email API ---------- */

app.post('/api/send-email', function (req, res) {
  var b = req.body || {};
  var toEmail = String(b.to_email || '').trim();
  var toName = String(b.to_name || 'User').trim();
  var subject = String(b.subject || 'Evervault Notification').trim();
  var message = String(b.message || '').trim();
  if (!toEmail) return res.status(400).json({ error: 'to_email is required.' });
  if (!SMTP_EMAIL || !SMTP_PASS) return res.status(500).json({ error: 'SMTP not configured on the server.' });
  var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: SMTP_EMAIL, pass: SMTP_PASS }
  });
  transporter.sendMail({
    from: '"Evervault" <' + SMTP_EMAIL + '>',
    to: toEmail,
    subject: subject,
    text: 'Hello ' + toName + ',\n\n' + message + '\n\n— Evervault Security Team',
    html: '<p>Hello ' + escHtml(toName) + ',</p><p>' + escHtml(message) + '</p><p>— Evervault Security Team</p>'
  }).then(function (info) {
    res.json({ ok: true, messageId: info.messageId });
  }).catch(function (err) {
    console.error('Email send error:', err);
    res.status(500).json({ error: 'Email send failed: ' + err.message });
  });
});

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ---------- Static pages ---------- */

app.get('/', function (req, res) { res.sendFile(path.join(__dirname, 'bankingsite.html')); });
app.get('/bankingsite.html', function (req, res) { res.sendFile(path.join(__dirname, 'bankingsite.html')); });
app.get('/admin.html', function (req, res) { res.sendFile(path.join(__dirname, 'admin.html')); });
app.get('/bankingsite.js', function (req, res) { res.sendFile(path.join(__dirname, 'bankingsite.js')); });
app.get('/admin.js', function (req, res) { res.sendFile(path.join(__dirname, 'admin.js')); });
app.get('/receipt.html', function (req, res) { res.sendFile(path.join(__dirname, 'receipt.html')); });
app.get('/firebase-config.js', function (req, res) { res.sendFile(path.join(__dirname, 'firebase-config.js')); });
app.get('/test-email.html', function (req, res) { res.sendFile(path.join(__dirname, 'test-email.html')); });

app.use(function (err, req, res, next) {
  if (err) return res.status(500).json({ error: 'Server error.' });
  next();
});

app.listen(PORT, '0.0.0.0', function () {
  console.log('Evervault running at http://localhost:' + PORT);
  console.log('Banking site: http://localhost:' + PORT + '/');
  console.log('Admin panel:  http://localhost:' + PORT + '/admin.html');
});
