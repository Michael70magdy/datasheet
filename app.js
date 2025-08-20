import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where,
  orderBy, serverTimestamp, increment, limit
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const page = document.body.dataset.page;

// Utilities
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };
const fmt = (n) => new Intl.NumberFormat().format(n);
const when = (cond, fn) => cond && fn();

// Admin check via admins/{uid} doc
async function isAdmin(uid) {
  if (!uid) return false;
  const snap = await getDoc(doc(db, "admins", uid));
  return snap.exists();
}

// Find team doc linked to an auth UID
async function getTeamDocByAuthUid(uid) {
  if (!uid) return null;
  const teamQuery = query(collection(db, "teams"), where("authUid", "==", uid), limit(1));
  const teamSnap = await getDocs(teamQuery);
  return teamSnap.empty ? null : teamSnap.docs[0];
}

// Leaderboard
async function initLeaderboard() {
  const list = $("#leaderboard");
  list.innerHTML = "<p class='small'>Loading...</p>";
  const teamsSnap = await getDocs(query(collection(db, "teams"), orderBy("points", "desc")));
  list.innerHTML = "";
  teamsSnap.forEach((d) => {
    const t = d.data();
    const item = el("div", "item");
    const left = el("div", "", `
      <strong>${t.name || "Unnamed team"}</strong>
      <div class="small">ID: ${d.id}</div>
    `);
    const right = el("div", "badge", `${fmt(t.points || 0)} pts`);
    item.append(left, right);
    list.appendChild(item);
  });
}

// Team portal
function bindTeamAuth() {
  const form = $("#signin-form");
  const err = $("#signin-error");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    const email = $("#email").value.trim();
    const password = $("#password").value;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      $("#email").value = ""; $("#password").value = "";
    } catch (e) {
      err.textContent = e.code?.replace("auth/", "").replace(/-/g, " ") || "Sign-in failed";
      err.hidden = false;
    }
  });
}

async function loadTeamDashboard(user) {
  const panel = $("#team-dashboard");
  const gate = $("#team-auth");
  const nameEl = $("#team-name");
  const ptsEl = $("#team-points");
  const activity = $("#team-activity");

  // Find the team doc mapped to this auth UID
  const q = query(collection(db, "teams"), where("authUid", "==", user.uid), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) {
    gate.hidden = false; panel.hidden = true;
    $("#signin-error").textContent = "No team is linked to this account."; $("#signin-error").hidden = false;
    return;
  }
  const teamDoc = snap.docs[0];
  const team = teamDoc.data();

  nameEl.textContent = team.name || "Team";
  ptsEl.textContent = fmt(team.points || 0);

  // Load transactions for this team
  activity.innerHTML = "<p class='small'>Loading...</p>";
  const txQ = query(
    collection(db, "transactions"),
    where("teamId", "==", teamDoc.id),
    orderBy("ts", "desc"),
    limit(50)
  );
  const txSnap = await getDocs(txQ);
  activity.innerHTML = "";
  if (txSnap.empty) {
    activity.innerHTML = "<p class='small'>No activity yet.</p>";
  } else {
    txSnap.forEach((d) => {
      const tx = d.data();
      const signCls = tx.delta >= 0 ? "positive" : "negative";
      const item = el("div", "item", `
        <div>
          <strong class="${signCls}">${tx.delta >= 0 ? "+" : ""}${tx.delta}</strong>
          <span class="small"> — ${escapeHtml(tx.comment || "")}</span>
          <div class="small time">${tx.ts?.toDate ? tx.ts.toDate().toLocaleString() : ""}</div>
        </div>
        <div class="badge ${signCls}">${tx.delta >= 0 ? "Added" : "Removed"}</div>
      `);
      activity.appendChild(item);
    });
  }

  // Toggle UI
  $("#team-auth").hidden = true;
  panel.hidden = false;

  $("#signout").onclick = () => signOut(auth);
}

// Admin panel
function bindAdminAuth() {
  const form = $("#admin-signin-form");
  const err = $("#admin-signin-error");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    try {
      await signInWithEmailAndPassword(auth, $("#admin-email").value.trim(), $("#admin-password").value);
      $("#admin-email").value = ""; $("#admin-password").value = "";
    } catch (e) {
      err.textContent = e.code?.replace("auth/", "").replace(/-/g, " ") || "Sign-in failed";
      err.hidden = false;
    }
  });
}

async function initAdminPanel(user) {
  const panel = $("#admin-panel");
  const notAdmin = $("#not-admin");
  const gate = $("#admin-auth");

  if (!(await isAdmin(user.uid))) {
    // If a non-admin but linked to a team, route them to the team dashboard
    const teamDoc = await getTeamDocByAuthUid(user.uid);
    if (teamDoc) { window.location.href = "./team.html"; return; }
    gate.hidden = true; panel.hidden = true; notAdmin.hidden = false;
    return;
  }

  // Populate teams
  const teamSelect = $("#team-select");
  teamSelect.innerHTML = "";
  const teamsSnap = await getDocs(query(collection(db, "teams"), orderBy("name")));
  teamsSnap.forEach((d) => {
    const opt = el("option");
    opt.value = d.id;
    const t = d.data();
    opt.textContent = `${t.name || "Unnamed"} — ${fmt(t.points || 0)} pts`;
    teamSelect.appendChild(opt);
  });

  // Bind adjust form
  $("#points-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const teamId = teamSelect.value;
    const delta = parseInt($("#delta").value, 10);
    const comment = $("#comment").value.trim();
    if (!teamId || !Number.isFinite(delta) || !comment) return;

    try {
      // 1) update team points
      await updateDoc(doc(db, "teams", teamId), { points: increment(delta) });
      // 2) log transaction
      await addDoc(collection(db, "transactions"), {
        teamId, delta, comment, ts: serverTimestamp(), adminUid: user.uid
      });
      // 3) UI feedback
      $("#delta").value = ""; $("#comment").value = "";
      await refreshRecent();
      await refreshTeamOptions(teamSelect); // reflect updated totals in dropdown
    } catch (e) {
      alert("Failed to apply change: " + (e.message || e));
    }
  });

  // Recent activity
  async function refreshRecent() {
    const box = $("#recent-activity");
    box.innerHTML = "<p class='small'>Loading...</p>";
    const txQ = query(collection(db, "transactions"), orderBy("ts", "desc"), limit(25));
    const snap = await getDocs(txQ);
    box.innerHTML = "";
    snap.forEach((d) => {
      const tx = d.data();
      const signCls = tx.delta >= 0 ? "positive" : "negative";
      const item = el("div", "item", `
        <div>
          <strong class="${signCls}">${tx.delta >= 0 ? "+" : ""}${tx.delta}</strong>
          <span class="small"> — ${escapeHtml(tx.comment || "")}</span>
          <div class="small">Team: <code>${tx.teamId}</code></div>
          <div class="small time">${tx.ts?.toDate ? tx.ts.toDate().toLocaleString() : ""}</div>
        </div>
        <div class="badge ${signCls}">${tx.delta >= 0 ? "Added" : "Removed"}</div>
      `);
      box.appendChild(item);
    });
  }
  async function refreshTeamOptions(sel) {
    const snap = await getDocs(query(collection(db, "teams"), orderBy("name")));
    const current = sel.value;
    sel.innerHTML = "";
    snap.forEach((d) => {
      const t = d.data();
      const opt = el("option");
      opt.value = d.id;
      opt.textContent = `${t.name || "Unnamed"} — ${fmt(t.points || 0)} pts`;
      sel.appendChild(opt);
    });
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
  }

  $("#admin-signout").onclick = () => signOut(auth);
  $("#admin-auth").hidden = true;
  panel.hidden = false;
  await refreshRecent();
}

// Page boot
if (page === "leaderboard") {
  initLeaderboard();
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    if (await isAdmin(user.uid)) { window.location.href = "./admin.html"; return; }
    const teamDoc = await getTeamDocByAuthUid(user.uid);
    if (teamDoc) window.location.href = "./team.html";
  });
}

if (page === "team") {
  bindTeamAuth();
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      if (await isAdmin(user.uid)) { window.location.href = "./admin.html"; return; }
      await loadTeamDashboard(user);
    } else { $("#team-dashboard").hidden = true; $("#team-auth").hidden = false; }
  });
}

if (page === "admin") {
  bindAdminAuth();
  onAuthStateChanged(auth, (user) => {
    if (user) initAdminPanel(user);
    else {
      $("#admin-panel").hidden = true; $("#not-admin").hidden = true; $("#admin-auth").hidden = false;
    }
  });
}

// Simple HTML escaping for comments display
function escapeHtml(s){
  return s.replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
