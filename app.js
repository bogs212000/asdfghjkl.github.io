import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBv--OyWCKhjbQO5RXpZECp_0GecNd9GQY",
  authDomain: "emarket-95a0f.firebaseapp.com",
  projectId: "emarket-95a0f",
  storageBucket: "emarket-95a0f.firebasestorage.app",
  messagingSenderId: "914851018970",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const state = {
  admin: null,
  adminProfile: null,
  isAdmin: false,
  section: "overview",
  search: "",
  users: [],
  listings: [],
  reports: [],
  chats: [],
  adsConfig: {},
  unsubscribers: [],
};

const els = {
  homeView: document.querySelector("#homeView"),
  loginView: document.querySelector("#loginView"),
  dashboardView: document.querySelector("#dashboardView"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  loginForm: document.querySelector("#loginForm"),
  emailInput: document.querySelector("#emailInput"),
  passwordInput: document.querySelector("#passwordInput"),
  loginError: document.querySelector("#loginError"),
  logoutButton: document.querySelector("#logoutButton"),
  adminName: document.querySelector("#adminName"),
  sectionTitle: document.querySelector("#sectionTitle"),
  globalSearch: document.querySelector("#globalSearch"),
  refreshButton: document.querySelector("#refreshButton"),
  toast: document.querySelector("#toast"),
  dialog: document.querySelector("#detailDialog"),
  dialogKicker: document.querySelector("#dialogKicker"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogBody: document.querySelector("#dialogBody"),
  closeDialog: document.querySelector("#closeDialog"),
  verificationBadge: document.querySelector("#verificationBadge"),
  reportsBadge: document.querySelector("#reportsBadge"),
};

const sections = {
  overview: document.querySelector("#overviewSection"),
  verification: document.querySelector("#verificationSection"),
  reports: document.querySelector("#reportsSection"),
  users: document.querySelector("#usersSection"),
  listings: document.querySelector("#listingsSection"),
  chats: document.querySelector("#chatsSection"),
  ads: document.querySelector("#adsSection"),
};

const sectionLabels = {
  overview: "Overview",
  verification: "Verification",
  reports: "Reports",
  users: "Users",
  listings: "Listings",
  chats: "Chats",
  ads: "Ads",
};

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.loginError.textContent = "";
  setLoading(true, "Signing in...");
  try {
    await signInWithEmailAndPassword(
      auth,
      els.emailInput.value.trim(),
      els.passwordInput.value,
    );
  } catch (error) {
    els.loginError.textContent = readableError(error);
    setLoading(false);
  }
});

els.logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

document.querySelectorAll("[data-open-admin]").forEach((button) => {
  button.addEventListener("click", () => {
    window.location.hash = "admin";
    showLogin();
  });
});

document.querySelector("#backHomeButton")?.addEventListener("click", () => {
  window.location.hash = "";
  showHome();
});

els.closeDialog.addEventListener("click", () => els.dialog.close());

els.globalSearch.addEventListener("input", (event) => {
  state.search = event.target.value.trim().toLowerCase();
  renderCurrentSection();
});

els.refreshButton.addEventListener("click", () => {
  toast("Dashboard data refreshes live from Firestore.");
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => setSection(button.dataset.section));
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, uid, listingId, reportId, roomId, status } = button.dataset;

  try {
    requireAdmin();
    if (action === "view-user") openUserDetails(uid);
    if (action === "notify-user") openNotifyDialog(uid);
    if (action === "message-user") openAdminMessageDialog(uid);
    if (action === "approve-user") await updateVerification(uid, true);
    if (action === "reject-user") await updateVerification(uid, false);
    if (action === "block-user") await blockUser(uid);
    if (action === "unblock-user") await unblockUser(uid);
    if (action === "view-listing") openListingDetails(listingId);
    if (action === "listing-status") await updateListingStatus(listingId, status);
    if (action === "view-report") openReportDetails(reportId);
    if (action === "report-status") await updateReportStatus(reportId, status);
    if (action === "view-chat") await openChatDetails(roomId);
    if (action === "send-notification") await sendNotificationFromDialog(uid);
    if (action === "send-admin-message") await sendAdminMessageFromDialog(uid);
    if (action === "save-ads") await saveAdsConfig();
  } catch (error) {
    toast(readableError(error), true);
  }
});

onAuthStateChanged(auth, async (user) => {
  cleanupSubscriptions();
  state.admin = null;
  state.adminProfile = null;
  state.isAdmin = false;
  if (!user) {
    setLoading(false);
    if (window.location.hash === "#admin") {
      showLogin();
    } else {
      showHome();
    }
    return;
  }

  setLoading(true, "Checking admin access...");
  try {
    const token = await user.getIdTokenResult(true);
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const profile = userSnap.exists() ? { id: userSnap.id, ...userSnap.data() } : null;
    const isAdmin = token.claims.admin === true || profile?.role === "admin";
    if (!isAdmin) {
      await signOut(auth);
      showLogin();
      els.loginError.textContent = "This account is not allowed to access admin.";
      return;
    }
    state.admin = user;
    state.adminProfile = profile;
    state.isAdmin = true;
    showDashboard();
    subscribeDashboardData();
  } catch (error) {
    await signOut(auth);
    showLogin();
    els.loginError.textContent = readableError(error);
  } finally {
    setLoading(false);
  }
});

function subscribeDashboardData() {
  state.unsubscribers = [
    onSnapshot(collection(db, "users"), (snap) => {
      state.users = snap.docs.map((item) => normalizeDoc(item));
      renderAll();
    }, handleSnapshotError),
    onSnapshot(collection(db, "listings"), (snap) => {
      state.listings = snap.docs.map((item) => normalizeDoc(item));
      renderAll();
    }, handleSnapshotError),
    onSnapshot(collection(db, "reports"), (snap) => {
      state.reports = snap.docs.map((item) => normalizeDoc(item));
      renderAll();
    }, handleSnapshotError),
    onSnapshot(collection(db, "chatRooms"), (snap) => {
      state.chats = snap.docs.map((item) => normalizeDoc(item));
      renderAll();
    }, handleSnapshotError),
    onSnapshot(doc(db, "appConfig", "ads"), (snap) => {
      state.adsConfig = snap.exists() ? snap.data() : {};
      renderAll();
    }, handleSnapshotError),
  ];
}

function handleSnapshotError(error) {
  toast(`Firebase read blocked: ${readableError(error)}`, true);
}

function requireAdmin() {
  if (!state.admin || state.isAdmin !== true) {
    throw new Error("Admin access is required. Sign in with an admin account.");
  }
}

function cleanupSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
}

function showLogin() {
  els.homeView.classList.add("hidden");
  els.dashboardView.classList.add("hidden");
  els.loginView.classList.remove("hidden");
}

function showHome() {
  els.homeView.classList.remove("hidden");
  els.loginView.classList.add("hidden");
  els.dashboardView.classList.add("hidden");
  els.loginError.textContent = "";
}

function showDashboard() {
  els.homeView.classList.add("hidden");
  els.loginView.classList.add("hidden");
  els.dashboardView.classList.remove("hidden");
  els.adminName.textContent =
    state.adminProfile?.displayName || state.admin?.email || "Admin";
  renderAll();
}

function setLoading(show, text = "Loading...") {
  els.loadingOverlay.classList.toggle("show", show);
  els.loadingOverlay.querySelector("span").textContent = text;
}

function setSection(section) {
  state.section = section;
  els.sectionTitle.textContent = sectionLabels[section] || "Dashboard";
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.section === section);
  });
  Object.entries(sections).forEach(([key, element]) => {
    element.classList.toggle("hidden", key !== section);
  });
  renderCurrentSection();
}

function renderAll() {
  updateBadges();
  renderCurrentSection();
}

function renderCurrentSection() {
  if (!state.admin) return;
  const renderers = {
    overview: renderOverview,
    verification: renderVerification,
    reports: renderReports,
    users: renderUsers,
    listings: renderListings,
    chats: renderChats,
    ads: renderAds,
  };
  renderers[state.section]();
  refreshIcons();
}

function updateBadges() {
  const pending = pendingVerificationUsers().length;
  const openReports = state.reports.filter((report) =>
    ["open", "reviewing"].includes(report.status || "open"),
  ).length;
  setBadge(els.verificationBadge, pending);
  setBadge(els.reportsBadge, openReports);
}

function setBadge(element, count) {
  element.textContent = count;
  element.classList.toggle("show", count > 0);
}

function renderOverview() {
  const users = state.users;
  const listings = state.listings;
  const reports = state.reports;
  const chats = state.chats;
  const pendingUsers = pendingVerificationUsers();
  const openReports = reports.filter((report) =>
    ["open", "reviewing"].includes(report.status || "open"),
  );
  const blockedUsers = users.filter((user) => user.accountStatus === "blocked");

  sections.overview.innerHTML = `
    <div class="stats-grid">
      ${statCard("Users", users.length, "users")}
      ${statCard("Active listings", listings.filter((item) => item.status === "active").length, "store")}
      ${statCard("Open reports", openReports.length, "flag")}
      ${statCard("Pending verification", pendingUsers.length, "badge-check")}
      ${statCard("Ad units", adUnitCount(), "badge-dollar-sign")}
    </div>
    <div class="grid-list">
      <div class="panel">
        <div class="panel-header">
          <h2>Verification queue</h2>
          <button class="soft-btn" data-section-link="verification">Review all</button>
        </div>
        <div class="panel-body grid-list">
          ${pendingUsers.slice(0, 4).map(userCard).join("") || emptyState("No pending verification.")}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <h2>Reports to review</h2>
          <button class="soft-btn" data-section-link="reports">Open reports</button>
        </div>
        <div class="panel-body grid-list">
          ${openReports.slice(0, 4).map(reportCard).join("") || emptyState("No open reports.")}
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h2>Marketplace health</h2>
        <span class="chip">${blockedUsers.length} blocked users</span>
      </div>
      <div class="panel-body grid-list">
        ${listings.slice().sort(byCreatedDesc).slice(0, 8).map(listingCard).join("") || emptyState("No listings yet.")}
      </div>
    </div>
  `;

  sections.overview.querySelectorAll("[data-section-link]").forEach((button) => {
    button.addEventListener("click", () => setSection(button.dataset.sectionLink));
  });
}

function renderVerification() {
  const users = filterItems(pendingVerificationUsers(), userSearchText);
  sections.verification.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <h2>ID and selfie verification</h2>
        <span class="chip warning">${users.length} pending</span>
      </div>
      <div class="panel-body grid-list">
        ${users.map(userCard).join("") || emptyState("No verification request matches your search.")}
      </div>
    </div>
  `;
}

function renderReports() {
  const reports = filterItems(
    state.reports.slice().sort(byCreatedDesc),
    reportSearchText,
  );
  sections.reports.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <h2>Reports</h2>
        <span class="chip">${reports.length} total</span>
      </div>
      <div class="panel-body grid-list">
        ${reports.map(reportCard).join("") || emptyState("No reports match your search.")}
      </div>
    </div>
  `;
}

function renderUsers() {
  const users = filterItems(state.users.slice().sort(byCreatedDesc), userSearchText);
  sections.users.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <h2>Users</h2>
        <span class="chip">${users.length} total</span>
      </div>
      <div class="panel-body grid-list">
        ${users.map(userCard).join("") || emptyState("No users match your search.")}
      </div>
    </div>
  `;
}

function renderListings() {
  const listings = filterItems(
    state.listings.slice().sort(byCreatedDesc),
    listingSearchText,
  );
  sections.listings.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <h2>Listings</h2>
        <span class="chip">${listings.length} total</span>
      </div>
      <div class="panel-body grid-list">
        ${listings.map(listingCard).join("") || emptyState("No listings match your search.")}
      </div>
    </div>
  `;
}

function renderChats() {
  const chats = filterItems(state.chats.slice().sort(byChatDesc), chatSearchText);
  sections.chats.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <h2>Chat rooms</h2>
        <span class="chip">${chats.length} rooms</span>
      </div>
      <div class="panel-body table-wrap">
        <table>
          <thead>
            <tr>
              <th>Room</th>
              <th>Participants</th>
              <th>Latest message</th>
              <th>Updated</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${chats.map(chatRow).join("") || `<tr><td colspan="5">${emptyState("No chats match your search.")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAds() {
  const config = state.adsConfig || {};
  const knownFields = [
    ["home", "Home banner"],
    ["browse", "Browse banner"],
    ["item_details", "Item details banner"],
    ["my_listings", "My listings banner"],
    ["post_listing_success", "Post listing success banner"],
    ["rewarded_listing_boost", "Rewarded listing boost"],
    ["app_open", "App open"],
    ["interstitial", "Interstitial"],
  ];
  const extraKeys = Object.keys(config)
    .filter((key) => !knownFields.some(([field]) => field === key))
    .filter((key) => !["enabled", "testMode", "updatedAt", "updatedBy"].includes(key))
    .sort();
  sections.ads.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2>Ad unit management</h2>
          <p class="muted panel-note">Saved to <strong>appConfig/ads</strong>. Your app can read these values anytime from Firebase.</p>
        </div>
        <span class="chip ${config.enabled === false ? "danger" : "success"}">${config.enabled === false ? "Ads disabled" : "Ads enabled"}</span>
      </div>
      <div class="panel-body">
        <form id="adsForm" class="settings-form">
          <div class="switch-row">
            <label>
              <input id="adsEnabled" type="checkbox" ${config.enabled === false ? "" : "checked"} />
              Enable ads
            </label>
            <label>
              <input id="adsTestMode" type="checkbox" ${config.testMode === true ? "checked" : ""} />
              Test mode
            </label>
          </div>
          <div class="field-grid">
            ${knownFields.map(([field, label]) => adInput(field, label, config[field])).join("")}
            ${extraKeys.map((field) => adInput(field, prettyLabel(field), config[field])).join("")}
          </div>
          <label>
            Add custom ad key
            <div class="inline-fields">
              <input id="newAdKey" type="text" placeholder="Example: seller_profile" />
              <input id="newAdValue" type="text" placeholder="Ad unit ID" />
            </div>
          </label>
          <div class="card-actions">
            <button class="primary-btn" type="button" data-action="save-ads">
              <i data-lucide="save"></i> Save ad units
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function statCard(label, value, icon) {
  return `
    <div class="stat-card">
      <span><i data-lucide="${icon}"></i> ${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function userCard(user) {
  const name = displayName(user);
  const status = user.accountStatus || "active";
  const verified = user.isFullyVerified === true || user.verificationStatus === "verified";
  const pending = hasVerificationFiles(user) && !verified;
  const statusClass = status === "blocked" ? "danger" : verified ? "success" : pending ? "warning" : "";
  const listingCount = state.listings.filter((item) => item.ownerId === user.id).length;
  return `
    <article class="item-card clickable">
      <div class="card-top">
        <div class="avatar">${avatarContent(user, name)}</div>
        <span class="chip ${statusClass}">${escapeHtml(statusLabel(user))}</span>
      </div>
      <div>
        <h3 class="item-title">${escapeHtml(name)}</h3>
        <div class="meta">
          <span>${escapeHtml(user.email || "No email")}</span>
          <span>${listingCount} listings</span>
          <span>${escapeHtml(user.municipality || user.province || "No area")}</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="soft-btn" data-action="view-user" data-uid="${escapeAttr(user.id)}">
          <i data-lucide="eye"></i> Details
        </button>
        <button class="soft-btn" data-action="notify-user" data-uid="${escapeAttr(user.id)}">
          <i data-lucide="bell"></i> Notify
        </button>
        <button class="soft-btn" data-action="message-user" data-uid="${escapeAttr(user.id)}">
          <i data-lucide="message-circle"></i> Message
        </button>
        ${
          pending
            ? `<button class="primary-btn" data-action="approve-user" data-uid="${escapeAttr(user.id)}">
                <i data-lucide="check"></i> Approve
              </button>
              <button class="danger-btn" data-action="reject-user" data-uid="${escapeAttr(user.id)}">
                <i data-lucide="x"></i> Reject
              </button>`
            : ""
        }
        ${
          status === "blocked"
            ? `<button class="soft-btn" data-action="unblock-user" data-uid="${escapeAttr(user.id)}">
                <i data-lucide="unlock"></i> Unblock
              </button>`
            : `<button class="danger-btn" data-action="block-user" data-uid="${escapeAttr(user.id)}">
                <i data-lucide="ban"></i> Block
              </button>`
        }
      </div>
    </article>
  `;
}

function listingCard(listing) {
  const owner = userById(listing.ownerId);
  const status = listing.status || "active";
  const statusClass =
    status === "active" ? "success" : status === "removed" ? "danger" : "warning";
  const title = listing.title || "Untitled listing";
  return `
    <article class="item-card clickable">
      <div class="card-top">
        <div class="thumb">${thumbContent(listing)}</div>
        <span class="chip ${statusClass}">${escapeHtml(status)}</span>
      </div>
      <div>
        <h3 class="item-title">${escapeHtml(title)}</h3>
        <div class="meta">
          <span>${formatMoney(listing.price)}</span>
          <span>${escapeHtml(listing.listingType || "sale")}</span>
          <span>${escapeHtml(listing.categoryId || "No category")}</span>
          <span>${escapeHtml(owner ? displayName(owner) : listing.ownerId || "Unknown seller")}</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="soft-btn" data-action="view-listing" data-listing-id="${escapeAttr(listing.id)}">
          <i data-lucide="eye"></i> View
        </button>
        <button class="primary-btn" data-action="listing-status" data-listing-id="${escapeAttr(listing.id)}" data-status="active">
          <i data-lucide="check-circle"></i> Active
        </button>
        <button class="soft-btn" data-action="listing-status" data-listing-id="${escapeAttr(listing.id)}" data-status="paused">
          <i data-lucide="pause-circle"></i> Pause
        </button>
        <button class="danger-btn" data-action="listing-status" data-listing-id="${escapeAttr(listing.id)}" data-status="removed">
          <i data-lucide="shield-x"></i> Remove
        </button>
      </div>
    </article>
  `;
}

function reportCard(report) {
  const reporter = userById(report.reporterId);
  const reported = userById(report.reportedUserId);
  const status = report.status || "open";
  const statusClass =
    status === "resolved" ? "success" : status === "rejected" ? "danger" : "warning";
  return `
    <article class="item-card clickable">
      <div class="card-top">
        <span class="chip">${escapeHtml(report.type || "general")}</span>
        <span class="chip ${statusClass}">${escapeHtml(status)}</span>
      </div>
      <div>
        <h3 class="item-title">${escapeHtml(report.reason || "No reason")}</h3>
        <div class="meta">
          <span>Reporter: ${escapeHtml(reporter ? displayName(reporter) : report.reporterId || "Unknown")}</span>
          <span>Reported: ${escapeHtml(reported ? displayName(reported) : report.reportedUserId || "Not set")}</span>
          <span>${formatDate(report.createdAt)}</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="soft-btn" data-action="view-report" data-report-id="${escapeAttr(report.id)}">
          <i data-lucide="eye"></i> Review
        </button>
        <button class="primary-btn" data-action="report-status" data-report-id="${escapeAttr(report.id)}" data-status="reviewing">
          <i data-lucide="search-check"></i> Reviewing
        </button>
        <button class="soft-btn" data-action="report-status" data-report-id="${escapeAttr(report.id)}" data-status="resolved">
          <i data-lucide="check-circle"></i> Resolve
        </button>
        <button class="danger-btn" data-action="report-status" data-report-id="${escapeAttr(report.id)}" data-status="rejected">
          <i data-lucide="x-circle"></i> Reject
        </button>
      </div>
    </article>
  `;
}

function chatRow(chat) {
  const participants = (chat.participantIds || [])
    .map((uid) => displayName(userById(uid)) || uid)
    .join(", ");
  return `
    <tr>
      <td><strong>${escapeHtml(shortId(chat.id))}</strong></td>
      <td>${escapeHtml(participants || "No participants")}</td>
      <td>${escapeHtml(chat.lastMessageText || "No message yet")}</td>
      <td>${formatDate(chat.lastMessageAt || chat.updatedAt || chat.createdAt)}</td>
      <td>
        <button class="soft-btn" data-action="view-chat" data-room-id="${escapeAttr(chat.id)}">
          <i data-lucide="messages-square"></i> Open
        </button>
      </td>
    </tr>
  `;
}

function openUserDetails(uid) {
  const user = userById(uid);
  if (!user) return toast("User not found.", true);
  const listings = state.listings.filter((item) => item.ownerId === uid).sort(byCreatedDesc);
  showDialog("User details", displayName(user), `
    <div class="detail-grid">
      ${detailRow("UID", user.id)}
      ${detailRow("Email", user.email)}
      ${detailRow("Phone", user.phoneNumber)}
      ${detailRow("Messenger", user.messengerLink)}
      ${detailRow("Address", [user.barangay, user.municipality, user.province].filter(Boolean).join(", "))}
      ${detailRow("Account status", user.accountStatus || "active")}
      ${detailRow("Verification", statusLabel(user))}
      ${detailRow("Created", formatDate(user.createdAt))}
    </div>
    <div class="media-grid">
      ${verificationMedia(user)}
    </div>
    <div class="card-actions">
      <button class="soft-btn" data-action="notify-user" data-uid="${escapeAttr(user.id)}">
        <i data-lucide="bell"></i> Send notification
      </button>
      <button class="primary-btn" data-action="message-user" data-uid="${escapeAttr(user.id)}">
        <i data-lucide="message-circle"></i> Message user
      </button>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h2>User listings</h2>
        <span class="chip">${listings.length} listings</span>
      </div>
      <div class="panel-body grid-list">
        ${listings.map(listingCard).join("") || emptyState("This user has no listings.")}
      </div>
    </div>
  `);
}

function openListingDetails(listingId) {
  const listing = listingById(listingId);
  if (!listing) return toast("Listing not found.", true);
  const owner = userById(listing.ownerId);
  showDialog("Listing details", listing.title || "Untitled listing", `
    <div class="media-grid">
      ${(listing.imageUrls || []).map(safeUrl).filter(Boolean).map((url) => `
        <div class="media-tile">
          <img src="${escapeAttr(url)}" alt="Listing image" />
          <a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">Open image</a>
        </div>
      `).join("") || emptyState("No listing images.")}
    </div>
    <div class="detail-grid">
      ${detailRow("Listing ID", listing.id)}
      ${detailRow("Seller", owner ? displayName(owner) : listing.ownerId)}
      ${detailRow("Price", formatMoney(listing.price))}
      ${detailRow("Status", listing.status)}
      ${detailRow("Type", listing.listingType)}
      ${detailRow("Category", listing.categoryId)}
      ${detailRow("Condition", listing.condition)}
      ${detailRow("Payment", listing.paymentMethod)}
      ${detailRow("Meet-up / Delivery", listing.meetupOption)}
      ${detailRow("Area", [listing.barangay, listing.municipality, listing.province].filter(Boolean).join(", "))}
      ${detailRow("Created", formatDate(listing.createdAt))}
      ${detailRow("Metrics", `${listing.viewCount || 0} views, ${listing.favoriteCount || 0} favorites, ${listing.inquiryCount || 0} inquiries`)}
    </div>
    <div class="detail-row">
      <span>Description</span>
      <div>${escapeHtml(listing.description || "This item has no description.")}</div>
    </div>
    <div class="card-actions">
      <button class="primary-btn" data-action="listing-status" data-listing-id="${escapeAttr(listing.id)}" data-status="active">Set active</button>
      <button class="soft-btn" data-action="listing-status" data-listing-id="${escapeAttr(listing.id)}" data-status="paused">Pause</button>
      <button class="danger-btn" data-action="listing-status" data-listing-id="${escapeAttr(listing.id)}" data-status="removed">Remove</button>
    </div>
  `);
}

function openReportDetails(reportId) {
  const report = reportById(reportId);
  if (!report) return toast("Report not found.", true);
  const reporter = userById(report.reporterId);
  const reported = userById(report.reportedUserId);
  const listing = listingById(report.listingId);
  showDialog("Report review", report.reason || "Report", `
    <div class="detail-grid">
      ${detailRow("Report ID", report.id)}
      ${detailRow("Type", report.type)}
      ${detailRow("Status", report.status || "open")}
      ${detailRow("Reporter", reporter ? displayName(reporter) : report.reporterId)}
      ${detailRow("Reported user", reported ? displayName(reported) : report.reportedUserId)}
      ${detailRow("Listing", listing ? listing.title : report.listingId)}
      ${detailRow("Chat room", report.chatRoomId)}
      ${detailRow("Created", formatDate(report.createdAt))}
    </div>
    <div class="detail-row">
      <span>Details</span>
      <div>${escapeHtml(report.details || "No details added.")}</div>
    </div>
    <div class="card-actions">
      ${
        report.chatRoomId
          ? `<button class="soft-btn" data-action="view-chat" data-room-id="${escapeAttr(report.chatRoomId)}">
              <i data-lucide="messages-square"></i> View conversation
            </button>`
          : ""
      }
      ${
        report.listingId
          ? `<button class="soft-btn" data-action="view-listing" data-listing-id="${escapeAttr(report.listingId)}">
              <i data-lucide="store"></i> View listing
            </button>`
          : ""
      }
      <button class="primary-btn" data-action="report-status" data-report-id="${escapeAttr(report.id)}" data-status="reviewing">Set reviewing</button>
      <button class="soft-btn" data-action="report-status" data-report-id="${escapeAttr(report.id)}" data-status="resolved">Resolve</button>
      <button class="danger-btn" data-action="report-status" data-report-id="${escapeAttr(report.id)}" data-status="rejected">Reject</button>
    </div>
  `);
}

async function openChatDetails(roomId) {
  const room = state.chats.find((item) => item.id === roomId);
  setLoading(true, "Loading conversation...");
  try {
    const messagesSnap = await getDocs(
      query(
        collection(db, "chatRooms", roomId, "messages"),
        orderBy("createdAt"),
        limit(200),
      ),
    );
    const messages = messagesSnap.docs.map((item) => normalizeDoc(item));
    const participants = (room?.participantIds || [])
      .map((uid) => displayName(userById(uid)) || uid)
      .join(", ");
    showDialog("Conversation", participants || shortId(roomId), `
      <div class="detail-grid">
        ${detailRow("Chat room", roomId)}
        ${detailRow("Participants", participants)}
        ${detailRow("Listing", room?.listingId || "")}
        ${detailRow("Latest", room?.lastMessageText || "")}
      </div>
      <div class="chat-thread">
        ${messages.map(messageBubble).join("") || emptyState("No messages in this room.")}
      </div>
    `);
  } finally {
    setLoading(false);
  }
}

function openNotifyDialog(uid) {
  const user = userById(uid);
  if (!user) return toast("User not found.", true);
  showDialog("Notify user", displayName(user), `
    <div class="field-group">
      <label>
        Title
        <input id="notifyTitle" type="text" value="Message from eMarket PH admin" />
      </label>
      <label>
        Body
        <textarea id="notifyBody" placeholder="Write your message to the user..."></textarea>
      </label>
    </div>
    <div class="card-actions">
      <button class="primary-btn" data-action="send-notification" data-uid="${uid}">
        <i data-lucide="send"></i> Send notification
      </button>
    </div>
  `);
}

function openAdminMessageDialog(uid) {
  const user = userById(uid);
  if (!user) return toast("User not found.", true);
  showDialog("Message user", displayName(user), `
    <div class="field-group">
      <label>
        Message
        <textarea id="adminMessageBody" placeholder="Write a message that will appear in the user's chat..."></textarea>
      </label>
      <label>
        Also send notification title
        <input id="adminMessageTitle" type="text" value="Message from eMarket PH admin" />
      </label>
    </div>
    <div class="card-actions">
      <button class="primary-btn" data-action="send-admin-message" data-uid="${uid}">
        <i data-lucide="send"></i> Send message
      </button>
    </div>
  `);
}

async function sendNotificationFromDialog(uid) {
  const title = document.querySelector("#notifyTitle")?.value.trim();
  const body = document.querySelector("#notifyBody")?.value.trim();
  if (!title || !body) return toast("Add a title and message.", true);
  await addDoc(collection(db, "users", uid, "notifications"), {
    type: "admin",
    title,
    body,
    read: false,
    senderId: state.admin.uid,
    createdAt: serverTimestamp(),
  });
  els.dialog.close();
  toast("Notification sent.");
}

async function sendAdminMessageFromDialog(uid) {
  const message = document.querySelector("#adminMessageBody")?.value.trim();
  const title = document.querySelector("#adminMessageTitle")?.value.trim() ||
    "Message from eMarket PH admin";
  if (!message) return toast("Write a message first.", true);
  const roomId = await createOrReuseAdminRoom(uid);
  const messageRef = doc(collection(db, "chatRooms", roomId, "messages"));
  const batch = writeBatch(db);
  batch.set(messageRef, {
    id: messageRef.id,
    senderId: state.admin.uid,
    type: "text",
    text: message,
    imageUrl: null,
    latitude: null,
    longitude: null,
    readBy: [state.admin.uid],
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, "chatRooms", roomId), {
    lastMessageText: message,
    lastMessageAt: serverTimestamp(),
    unreadBy: [uid],
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, "users", uid, "notifications")), {
    type: "chat",
    chatRoomId: roomId,
    listingId: null,
    title,
    body: message,
    read: false,
    senderId: state.admin.uid,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  els.dialog.close();
  toast("Message and notification sent.");
}

async function createOrReuseAdminRoom(uid) {
  const existing = state.chats.find((chat) => {
    const participants = chat.participantIds || [];
    return participants.includes(uid) && participants.includes(state.admin.uid);
  });
  if (existing) return existing.id;
  const roomRef = doc(collection(db, "chatRooms"));
  await setDoc(roomRef, {
    id: roomRef.id,
    listingId: null,
    listingIds: [],
    participantIds: [state.admin.uid, uid],
    blockedBy: [],
    unreadBy: [],
    createdAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
    lastMessageText: "",
  });
  return roomRef.id;
}

async function saveAdsConfig() {
  const form = document.querySelector("#adsForm");
  if (!form) return;
  const payload = {
    enabled: document.querySelector("#adsEnabled")?.checked === true,
    testMode: document.querySelector("#adsTestMode")?.checked === true,
    updatedAt: serverTimestamp(),
    updatedBy: state.admin.uid,
  };
  form.querySelectorAll("[data-ad-field]").forEach((input) => {
    payload[input.dataset.adField] = input.value.trim();
  });
  const newKey = document.querySelector("#newAdKey")?.value.trim();
  const newValue = document.querySelector("#newAdValue")?.value.trim();
  if (newKey) {
    payload[sanitizeAdKey(newKey)] = newValue || "";
  }
  await setDoc(doc(db, "appConfig", "ads"), payload, { merge: true });
  toast("Ad unit settings saved.");
}

async function updateVerification(uid, verified) {
  const user = userById(uid);
  if (!user) return;
  const action = verified ? "approve" : "reject";
  if (!confirm(`Are you sure you want to ${action} ${displayName(user)}?`)) return;
  const batch = writeBatch(db);
  batch.update(doc(db, "users", uid), {
    verificationStatus: verified ? "verified" : "rejected",
    isFullyVerified: verified,
    verificationReviewedAt: serverTimestamp(),
    verificationReviewedBy: state.admin.uid,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, "users", uid, "notifications")), {
    type: "system",
    title: verified ? "Identification approved" : "Identification rejected",
    body: verified
      ? "Your ID and selfie verification was approved. You can now sell on eMarket PH."
      : "Your ID and selfie verification was rejected. Please review your uploaded documents and submit again.",
    read: false,
    senderId: state.admin.uid,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  toast(verified ? "Verification approved." : "Verification rejected.");
}

async function blockUser(uid) {
  const user = userById(uid);
  if (!user) return;
  if (!confirm(`Block ${displayName(user)} and remove active listings?`)) return;
  setLoading(true, "Blocking user...");
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "users", uid), {
      accountStatus: "blocked",
      blockedAt: serverTimestamp(),
      blockedBy: state.admin.uid,
      updatedAt: serverTimestamp(),
    });
    const listingSnap = await getDocs(
      query(collection(db, "listings"), where("ownerId", "==", uid)),
    );
    listingSnap.docs.forEach((listingDoc) => {
      batch.update(listingDoc.ref, {
        status: "removed",
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    toast("User blocked and listings removed.");
  } finally {
    setLoading(false);
  }
}

async function unblockUser(uid) {
  const user = userById(uid);
  if (!user) return;
  if (!confirm(`Unblock ${displayName(user)}?`)) return;
  await updateDoc(doc(db, "users", uid), {
    accountStatus: "active",
    unblockedAt: serverTimestamp(),
    unblockedBy: state.admin.uid,
    updatedAt: serverTimestamp(),
  });
  toast("User unblocked.");
}

async function updateListingStatus(listingId, status) {
  const listing = listingById(listingId);
  if (!listing) return;
  if (!confirm(`Set "${listing.title || listing.id}" to ${status}?`)) return;
  await updateDoc(doc(db, "listings", listingId), {
    status,
    updatedAt: serverTimestamp(),
  });
  toast("Listing status updated.");
}

async function updateReportStatus(reportId, status) {
  const report = reportById(reportId);
  if (!report) return;
  if (!confirm(`Set report to ${status}?`)) return;
  await updateDoc(doc(db, "reports", reportId), {
    status,
    reviewedBy: state.admin.uid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  toast("Report status updated.");
}

function showDialog(kicker, title, body) {
  els.dialogKicker.textContent = kicker;
  els.dialogTitle.textContent = title;
  els.dialogBody.innerHTML = body;
  if (!els.dialog.open) els.dialog.showModal();
  refreshIcons();
}

function messageBubble(message) {
  const sender = userById(message.senderId);
  const isAdmin = message.senderId === state.admin.uid;
  const imageUrl = safeUrl(message.imageUrl);
  const image = imageUrl
    ? `<div class="media-tile"><img src="${escapeAttr(imageUrl)}" alt="Chat image" /></div>`
    : "";
  const location =
    message.type === "location" && message.latitude && message.longitude
      ? `<a href="https://maps.google.com/?q=${message.latitude},${message.longitude}" target="_blank" rel="noreferrer">Open shared location</a>`
      : "";
  return `
    <div class="message-bubble ${isAdmin ? "admin-side" : ""}">
      <small>${escapeHtml(sender ? displayName(sender) : message.senderId || "Unknown")} - ${formatDate(message.createdAt)}</small>
      <div>${escapeHtml(message.text || message.type || "")}</div>
      ${image}
      ${location}
    </div>
  `;
}

function detailRow(label, value) {
  return `
    <div class="detail-row">
      <span>${escapeHtml(label)}</span>
      <div>${escapeHtml(value || "Not set")}</div>
    </div>
  `;
}

function verificationMedia(user) {
  const media = [
    ["ID front", user.validIdFrontUrl],
    ["ID back", user.validIdBackUrl],
    ["Selfie", user.verificationSelfieUrl],
  ];
  return media
    .map(([label, url]) => [label, safeUrl(url)])
    .map(([label, url]) => {
      if (!url) return "";
      return `
        <div class="media-tile">
          <img src="${escapeAttr(url)}" alt="${escapeAttr(label)}" />
          <a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>
        </div>
      `;
    })
    .join("") || emptyState("No verification images uploaded.");
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function adInput(field, label, value) {
  return `
    <label>
      ${escapeHtml(label)}
      <input data-ad-field="${escapeAttr(field)}" type="text" value="${escapeAttr(value || "")}" placeholder="ca-app-pub-..." />
    </label>
  `;
}

function adUnitCount() {
  return Object.entries(state.adsConfig || {})
    .filter(([key, value]) => !["enabled", "testMode", "updatedAt", "updatedBy"].includes(key) && value)
    .length;
}

function prettyLabel(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function sanitizeAdKey(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pendingVerificationUsers() {
  return state.users.filter((user) => {
    const verified = user.isFullyVerified === true || user.verificationStatus === "verified";
    return hasVerificationFiles(user) && !verified;
  });
}

function hasVerificationFiles(user) {
  return Boolean(user.validIdFrontUrl || user.validIdBackUrl || user.verificationSelfieUrl);
}

function normalizeDoc(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

function filterItems(items, toText) {
  if (!state.search) return items;
  return items.filter((item) => toText(item).includes(state.search));
}

function userSearchText(user) {
  return [
    user.id,
    user.displayName,
    user.username,
    user.email,
    user.phoneNumber,
    user.messengerLink,
    user.accountStatus,
    user.verificationStatus,
    user.barangay,
    user.municipality,
    user.province,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function listingSearchText(listing) {
  return [
    listing.id,
    listing.title,
    listing.description,
    listing.categoryId,
    listing.listingType,
    listing.status,
    listing.ownerId,
    listing.barangay,
    listing.municipality,
    listing.province,
    displayName(userById(listing.ownerId)),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function reportSearchText(report) {
  return [
    report.id,
    report.type,
    report.status,
    report.reason,
    report.details,
    report.reporterId,
    report.reportedUserId,
    displayName(userById(report.reporterId)),
    displayName(userById(report.reportedUserId)),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function chatSearchText(chat) {
  return [
    chat.id,
    chat.lastMessageText,
    ...(chat.participantIds || []),
    ...(chat.participantIds || []).map((uid) => displayName(userById(uid))),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function userById(uid) {
  return state.users.find((user) => user.id === uid);
}

function listingById(id) {
  return state.listings.find((listing) => listing.id === id);
}

function reportById(id) {
  return state.reports.find((report) => report.id === id);
}

function displayName(user) {
  if (!user) return "";
  return user.displayName || user.username || user.email || user.id || "Unknown user";
}

function statusLabel(user) {
  if (user.accountStatus === "blocked") return "blocked";
  if (user.isFullyVerified === true || user.verificationStatus === "verified") {
    return "verified";
  }
  if (hasVerificationFiles(user)) return user.verificationStatus || "pending_review";
  return "not verified";
}

function avatarContent(user, name) {
  const photoUrl = safeUrl(user.photoUrl);
  if (photoUrl) {
    return `<img src="${escapeAttr(photoUrl)}" alt="${escapeAttr(name)}" />`;
  }
  return escapeHtml((name || "U").slice(0, 1).toUpperCase());
}

function thumbContent(listing) {
  const url = Array.isArray(listing.imageUrls) ? listing.imageUrls[0] : "";
  const imageUrl = safeUrl(url);
  if (imageUrl) {
    return `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(listing.title || "Listing")}" />`;
  }
  return `<i data-lucide="image"></i>`;
}

function byCreatedDesc(a, b) {
  return timestampMillis(b.createdAt || b.updatedAt) - timestampMillis(a.createdAt || a.updatedAt);
}

function byChatDesc(a, b) {
  return timestampMillis(b.lastMessageAt || b.updatedAt || b.createdAt) -
    timestampMillis(a.lastMessageAt || a.updatedAt || a.createdAt);
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return 0;
}

function formatDate(value) {
  const millis = timestampMillis(value);
  if (!millis) return "Not set";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(millis));
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function shortId(id = "") {
  return id.length > 10 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}

function safeUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch (_) {
    return "";
  }
}

function readableError(error) {
  const message = error?.message || String(error);
  return message
    .replace("Firebase: ", "")
    .replace(/\(auth\/.*?\)\.?/g, "")
    .replace(/\[FirebaseError: /g, "")
    .replace(/\]$/g, "")
    .trim();
}

let toastTimer = null;
function toast(message, isError = false) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.style.background = isError ? "var(--danger)" : "var(--ink)";
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3600);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

refreshIcons();
