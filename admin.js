/**
 * ClinicSphere SaaS Platform - Admin Dashboard Controller (admin.js)
 * Coordinates isolated tenant data snapshot synchronizations, Chart.js analytics,
 * Excel/PDF exports, doctor rosters, patient timelines, and booking triages.
 */

import { auth, db } from "../firebase/firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  collection, 
  onSnapshot, 
  doc, 
  addDoc,
  updateDoc, 
  deleteDoc, 
  getDocs,
  query, 
  where,
  orderBy 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Global isolated state values
let currentClinicId = null;
let globalAppointments = [];
let globalDoctors = [];
let globalPatients = [];
let analyticsChartInstance = null; // Destroys prior canvas overlays

document.addEventListener("DOMContentLoaded", () => {
  verifyAdminSession();
});

/* =========================================================================
   1. SESSION GUARD & INITIALIZATION
   ========================================================================= */
function verifyAdminSession() {
  const isPlaceholderConfig = auth.app.options.apiKey === "YOUR_API_KEY" || !auth.app.options.apiKey;
  
  // Extract locked tenant slug from session
  currentClinicId = sessionStorage.getItem("clinicId");

  if (!currentClinicId) {
    console.warn("[SaaS Admin] No active clinic session found. Redirecting to login portal.");
    window.location.href = "login.html";
    return;
  }

  if (isPlaceholderConfig) {
    const demoSession = sessionStorage.getItem("sns_admin_session");
    if (demoSession !== "demo_active") {
      window.location.href = "login.html";
      return;
    }
    
    // Boot sandbox pipeline
    console.log(`[SaaS Sandbox Admin] Booting Dashboard for Practice: ${currentClinicId}`);
    initSaaSDashboard();
  } else {
    // Boot live cloud database pipeline
    auth.onAuthStateChanged(user => {
      if (!user) {
        window.location.href = "login.html";
      } else {
        console.log(`[SaaS Live Admin] Booting Dashboard for Practice: ${currentClinicId} (Admin: ${user.email})`);
        initSaaSDashboard();
      }
    });
  }
}

function initSaaSDashboard() {
  initThemeToggle();
  initMobileMenu();
  initTabNavigation();
  initLogoutTrigger();
  
  // Dynamic modular synchronization loops
  syncClinicProfile();
  syncDoctorsRoster();
  syncAppointmentsDatabase();

  // Dialog configurations
  initEditBookingModal();
  initAddDoctorModal();
  initPatientHistoryModal();
  initExportControllers();
}

/* =========================================================================
   2. DYNAMIC BRAND REBRANDING
   ========================================================================= */
async function syncClinicProfile() {
  const isPlaceholderConfig = db.app.options.apiKey === "YOUR_API_KEY" || !db.app.options.apiKey;

  try {
    let clinic = null;

    if (isPlaceholderConfig) {
      const mockClinics = JSON.parse(localStorage.getItem("mock_clinics") || "[]");
      clinic = mockClinics.find(c => c.slug === currentClinicId);
    } else {
      const docRef = doc(db, "clinics", currentClinicId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) clinic = docSnap.data();
    }

    if (clinic) {
      // Apply rebranded title properties
      document.title = `${clinic.name} Admin Portal - ClinicSphere`;
      document.getElementById("sidebar-clinic-name").innerText = clinic.name;
      document.getElementById("clinic-avatar-badge").innerText = clinic.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2);
      document.getElementById("dashboard-main-heading").innerText = `${clinic.name} Overview`;
      document.getElementById("dashboard-main-subtext").innerText = `Manage directories, bookings, and treatment history for ${clinic.name}.`;
    }
  } catch (err) {
    console.error("Clinic Profile Fetch Failed:", err);
  }
}

/* =========================================================================
   3. TOAST BANNERS SYSTEM
   ========================================================================= */
function triggerToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast-alert ${type}`;
  
  let icon = '<i class="fa-solid fa-circle-check"></i>';
  if (type === "warning") icon = '<i class="fa-solid fa-circle-exclamation"></i>';
  if (type === "error") icon = '<i class="fa-solid fa-triangle-exclamation"></i>';

  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => { toast.remove(); }, 4500);
}

/* =========================================================================
   4. TAB WORKSPACE TOGGLE SYSTEM
   ========================================================================= */
function initTabNavigation() {
  const tabs = document.querySelectorAll(".sidebar-link");
  const sections = document.querySelectorAll(".tab-section");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetTab = tab.getAttribute("data-tab");

      tabs.forEach(t => t.classList.remove("active"));
      sections.forEach(s => s.classList.remove("active"));

      tab.classList.add("active");
      document.getElementById(`tab-${targetTab}`).classList.add("active");

      // Smooth sidebar drawer close on mobile clicks
      document.getElementById("dashboard-sidebar").classList.remove("active");
    });
  });
}

/* =========================================================================
   5. REAL-TIME DATA LISTENERS (ISOLATED SYNC)
   ========================================================================= */

// Roster Directory Synchronizer
function syncDoctorsRoster() {
  const isPlaceholderConfig = db.app.options.apiKey === "YOUR_API_KEY" || !db.app.options.apiKey;

  if (isPlaceholderConfig) {
    // Sandbox doctors loader
    loadSandboxDoctors();
  } else {
    // Live Cloud isolated query: select where clinicId == currentClinicId
    const docsQuery = query(collection(db, "doctors"), where("clinicId", "==", currentClinicId));
    onSnapshot(docsQuery, (snapshot) => {
      globalDoctors = [];
      snapshot.forEach(docSnap => {
        globalDoctors.push({ id: docSnap.id, ...docSnap.data() });
      });
      renderDoctorsGrid();
      updateDoctorSelectDropdowns();
    });
  }
}

function loadSandboxDoctors() {
  const allDocs = JSON.parse(localStorage.getItem("mock_doctors") || "[]");
  globalDoctors = allDocs.filter(d => d.clinicId === currentClinicId);
  renderDoctorsGrid();
  updateDoctorSelectDropdowns();
}

// Appointments Database Synchronizer
function syncAppointmentsDatabase() {
  const isPlaceholderConfig = db.app.options.apiKey === "YOUR_API_KEY" || !db.app.options.apiKey;

  if (isPlaceholderConfig) {
    loadSandboxAppointments();
    
    // Listen for public form storage bookings on other tabs
    window.addEventListener("storage", (e) => {
      if (e.key === "mock_appointments") {
        loadSandboxAppointments();
      }
    });
  } else {
    // Live Cloud isolated query: select where clinicId == currentClinicId
    const appQuery = query(collection(db, "appointments"), where("clinicId", "==", currentClinicId));
    onSnapshot(appQuery, (snapshot) => {
      globalAppointments = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        globalAppointments.push({
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString()
        });
      });
      processAppointmentsData();
    });
  }
}

function loadSandboxAppointments() {
  const allApps = JSON.parse(localStorage.getItem("mock_appointments") || "[]");
  globalAppointments = allApps.filter(a => a.clinicId === currentClinicId);
  processAppointmentsData();
}

function processAppointmentsData() {
  calculateStats();
  renderAnalyticsChart();
  filterAndRenderAppointmentsTable();
  compileAndRenderPatientRegistry();
}

/* =========================================================================
   6. CALCULATE ADVANCED METRICS STATISTICS
   ========================================================================= */
function calculateStats() {
  const totalDisplay = document.getElementById("stats-total");
  const todayDisplay = document.getElementById("stats-today");
  const pendingDisplay = document.getElementById("stats-pending");
  const confirmedDisplay = document.getElementById("stats-confirmed");
  const completedDisplay = document.getElementById("stats-completed");

  const todayStr = new Date().toISOString().split("T")[0];

  let totalCount = globalAppointments.length;
  let todayCount = 0;
  let pendingCount = 0;
  let confirmedCount = 0;
  let completedCount = 0;

  globalAppointments.forEach(app => {
    if (app.date === todayStr) todayCount++;
    if (app.status === "pending") pendingCount++;
    if (app.status === "confirmed") confirmedCount++;
    if (app.status === "completed") completedCount++;
  });

  totalDisplay.innerText = totalCount;
  todayDisplay.innerText = todayCount;
  pendingDisplay.innerText = pendingCount;
  confirmedDisplay.innerText = confirmedCount;
  completedDisplay.innerText = completedCount;
}

/* =========================================================================
   7. REAL-TIME GRAPH CHART PLOTTING (Chart.js)
   ========================================================================= */
function renderAnalyticsChart() {
  const ctx = document.getElementById("analyticsChart");
  if (!ctx) return;

  // Process data: Group completed vs. cancelled consultations by month
  const monthMap = {};
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Seed default 6 months of data
  const currentMonthIdx = new Date().getMonth();
  for (let i = 5; i >= 0; i--) {
    let idx = (currentMonthIdx - i + 12) % 12;
    monthMap[monthNames[idx]] = { completed: 0, cancelled: 0 };
  }

  globalAppointments.forEach(app => {
    if (!app.date) return;
    const dateObj = new Date(app.date);
    const mName = monthNames[dateObj.getMonth()];
    
    if (monthMap[mName]) {
      if (app.status === "completed") {
        monthMap[mName].completed++;
      } else if (app.status === "cancelled") {
        monthMap[mName].cancelled++;
      }
    }
  });

  const labels = Object.keys(monthMap);
  const completedData = labels.map(l => monthMap[l].completed);
  const cancelledData = labels.map(l => monthMap[l].cancelled);

  // Destroy previous instance to clean canvas overlays
  if (analyticsChartInstance) {
    analyticsChartInstance.destroy();
  }

  analyticsChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Completed Bookings",
          data: completedData,
          backgroundColor: "#10b981", // Emerald Green
          borderRadius: 6
        },
        {
          label: "Cancelled Bookings",
          data: cancelledData,
          backgroundColor: "#ef4444", // Red Danger
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: document.body.classList.contains("dark-theme") ? "#22314d" : "#e2e8f0"
          },
          ticks: {
            color: document.body.classList.contains("dark-theme") ? "#94a3b8" : "#475569"
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: document.body.classList.contains("dark-theme") ? "#94a3b8" : "#475569"
          }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: document.body.classList.contains("dark-theme") ? "#f8fafc" : "#0f172a",
            font: { family: "'Inter', sans-serif" }
          }
        }
      }
    }
  });
}

/* =========================================================================
   8. FILTER PIPELINE & APPOINTMENTS GRID RENDERING
   ========================================================================= */
function initControlsAndFilters() {
  const searchInput = document.getElementById("search-input");
  const serviceFilter = document.getElementById("filter-service");
  const statusFilter = document.getElementById("filter-status");
  const sortOrder = document.getElementById("sort-order");

  searchInput.addEventListener("input", filterAndRenderAppointmentsTable);
  serviceFilter.addEventListener("change", filterAndRenderAppointmentsTable);
  statusFilter.addEventListener("change", filterAndRenderAppointmentsTable);
  sortOrder.addEventListener("change", filterAndRenderAppointmentsTable);
}

// Global filter access list to feed CSV/PDF exporters
let activeFilteredAppointmentsList = [];

function filterAndRenderAppointmentsTable() {
  const queryText = document.getElementById("search-input").value.toLowerCase().trim();
  const serviceVal = document.getElementById("filter-service").value;
  const statusVal = document.getElementById("filter-status").value;
  const sortVal = document.getElementById("sort-order").value;
  const tbody = document.getElementById("appointments-tbody");

  // 1. Filter metrics
  let filtered = globalAppointments.filter(app => {
    const matchesSearch = app.name.toLowerCase().includes(queryText) || 
                          app.email.toLowerCase().includes(queryText) || 
                          app.phone.includes(queryText);
                          
    const matchesService = serviceVal === "all" || app.service === serviceVal;
    const matchesStatus = statusVal === "all" || app.status === statusVal;

    return matchesSearch && matchesService && matchesStatus;
  });

  // 2. Sort chronologically
  filtered.sort((a, b) => {
    const datetimeA = new Date(`${a.date}T${a.time}`);
    const datetimeB = new Date(`${b.date}T${b.time}`);
    return sortVal === "date-desc" ? datetimeB - datetimeA : datetimeA - datetimeB;
  });

  activeFilteredAppointmentsList = filtered; // Bind references

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          <i class="fa-regular fa-folder-open empty-state-icon"></i>
          <h3>No Patient Appointments Found</h3>
          <p>Try refining your filters or search keywords.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";
  filtered.forEach(app => {
    const tr = document.createElement("tr");

    // Patient Details Cell
    const patientTd = document.createElement("td");
    patientTd.setAttribute("data-label", "Patient");
    patientTd.innerHTML = `
      <div class="patient-cell">
        <span class="patient-name">${escapeHTML(app.name)}</span>
        <span class="patient-contact"><i class="fa-solid fa-phone" style="font-size:0.7rem;"></i> ${escapeHTML(app.phone)} | <i class="fa-regular fa-envelope" style="font-size:0.7rem;"></i> ${escapeHTML(app.email)}</span>
      </div>
    `;

    // Treatment Cell
    const serviceTd = document.createElement("td");
    serviceTd.setAttribute("data-label", "Dental Treatment");
    serviceTd.innerText = app.service;

    // Schedule Cell
    const dateTd = document.createElement("td");
    dateTd.setAttribute("data-label", "Schedule");
    dateTd.innerHTML = `
      <div style="font-weight:600; color:var(--dark-title);"><i class="fa-regular fa-calendar"></i> ${formatLocalDate(app.date)}</div>
      <div style="font-size:0.8rem;"><i class="fa-regular fa-clock"></i> ${app.time}</div>
    `;

    // Assigned Doctor Cell
    const docTd = document.createElement("td");
    docTd.setAttribute("data-label", "Assigned Dentist");
    docTd.innerText = app.assignedDoctorName || "Unassigned Clinic Dentist";

    // Status Badge Cell
    const statusTd = document.createElement("td");
    statusTd.setAttribute("data-label", "Workflow Status");
    statusTd.innerHTML = `<span class="status-badge ${app.status}">${app.status.replace("_", " ")}</span>`;

    // Action Menu Cell
    const actionsTd = document.createElement("td");
    actionsTd.setAttribute("data-label", "Actions");
    actionsTd.style.textAlign = "right";

    const btnGroup = document.createElement("div");
    btnGroup.className = "action-btn-group";

    // Confirm Booking
    if (app.status === "pending") {
      const confirmBtn = document.createElement("button");
      confirmBtn.className = "action-btn confirm";
      confirmBtn.title = "Confirm Appointment";
      confirmBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i>`;
      confirmBtn.addEventListener("click", () => updateAppointmentStatus(app.id, "confirmed"));
      btnGroup.appendChild(confirmBtn);
    }

    // Move to In-Progress
    if (app.status === "confirmed") {
      const progBtn = document.createElement("button");
      progBtn.className = "action-btn confirm";
      progBtn.style.backgroundColor = "rgba(6, 182, 212, 0.08)";
      progBtn.style.color = "var(--info)";
      progBtn.title = "Mark In-Progress";
      progBtn.innerHTML = `<i class="fa-solid fa-spinner"></i>`;
      progBtn.addEventListener("click", () => updateAppointmentStatus(app.id, "in_progress"));
      btnGroup.appendChild(progBtn);
    }

    // Complete Booking
    if (app.status === "in_progress") {
      const compBtn = document.createElement("button");
      compBtn.className = "action-btn confirm";
      compBtn.style.backgroundColor = "rgba(16, 185, 129, 0.08)";
      compBtn.style.color = "var(--success)";
      compBtn.title = "Mark Completed";
      compBtn.innerHTML = `<i class="fa-solid fa-check"></i>`;
      compBtn.addEventListener("click", () => updateAppointmentStatus(app.id, "completed"));
      btnGroup.appendChild(compBtn);
    }

    // Edit Profile Modal
    const editBtn = document.createElement("button");
    editBtn.className = "action-btn edit";
    editBtn.title = "Edit Details";
    editBtn.innerHTML = `<i class="fa-regular fa-pen-to-square"></i>`;
    editBtn.addEventListener("click", () => openEditBookingModal(app));
    btnGroup.appendChild(editBtn);

    // Cancel Booking
    if (app.status !== "completed" && app.status !== "cancelled") {
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "action-btn cancel";
      cancelBtn.title = "Cancel Appointment";
      cancelBtn.innerHTML = `<i class="fa-solid fa-ban"></i>`;
      cancelBtn.addEventListener("click", () => updateAppointmentStatus(app.id, "cancelled"));
      btnGroup.appendChild(cancelBtn);
    }

    // Delete Record
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "action-btn delete";
    deleteBtn.title = "Delete Record";
    deleteBtn.innerHTML = `<i class="fa-regular fa-trash-can"></i>`;
    deleteBtn.addEventListener("click", () => deleteAppointmentRecord(app.id, app.name));
    btnGroup.appendChild(deleteBtn);

    actionsTd.appendChild(btnGroup);

    // Append cells
    tr.appendChild(patientTd);
    tr.appendChild(serviceTd);
    tr.appendChild(dateTd);
    tr.appendChild(docTd);
    tr.appendChild(statusTd);
    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  });
}

// Triggers status updates across Firestore or Sandbox
async function updateAppointmentStatus(docId, newStatus) {
  const isPlaceholderConfig = db.app.options.apiKey === "YOUR_API_KEY" || !db.app.options.apiKey;

  try {
    if (isPlaceholderConfig) {
      globalAppointments = globalAppointments.map(app => {
        if (app.id === docId) app.status = newStatus;
        return app;
      });
      localStorage.setItem("mock_appointments", JSON.stringify(globalAppointments));
      loadSandboxAppointments();
    } else {
      const recordRef = doc(db, "appointments", docId);
      await updateDoc(recordRef, { status: newStatus });
    }
    triggerToast(`Appointment status updated to '${newStatus.replace("_", " ")}'`, "success");
  } catch (err) {
    console.error("Status Update Failed:", err);
    triggerToast("Failed to update status in the database.", "error");
  }
}

async function deleteAppointmentRecord(docId, patientName) {
  const confirmDelete = confirm(`Are you sure you want to permanently delete the appointment record for ${patientName}?`);
  if (!confirmDelete) return;

  const isPlaceholderConfig = db.app.options.apiKey === "YOUR_API_KEY" || !db.app.options.apiKey;

  try {
    if (isPlaceholderConfig) {
      globalAppointments = globalAppointments.filter(app => app.id !== docId);
      localStorage.setItem("mock_appointments", JSON.stringify(globalAppointments));
      loadSandboxAppointments();
    } else {
      const recordRef = doc(db, "appointments", docId);
      await deleteDoc(recordRef);
    }
    triggerToast(`Appointment record for ${patientName} deleted successfully.`, "warning");
  } catch (err) {
    console.error("Deletion Operation Failed:", err);
    triggerToast("Failed to delete record from the database.", "error");
  }
}

/* =========================================================================
   9. EDIT CONSULTATION MODAL DIALOG
   ========================================================================= */
function initEditBookingModal() {
  const overlay = document.getElementById("edit-booking-modal-overlay");
  const closeIcon = document.getElementById("edit-modal-close-icon");
  const closeBtn = document.getElementById("btn-edit-modal-close");
  const form = document.getElementById("edit-booking-form");

  const closeModal = () => { overlay.style.display = "none"; };
  
  closeIcon.addEventListener("click", closeModal);
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const docId = document.getElementById("edit-booking-id").value;
    const name = document.getElementById("edit-name").value.trim();
    const phone = document.getElementById("edit-phone").value.trim();
    const email = document.getElementById("edit-email").value.trim();
    const service = document.getElementById("edit-service").value;
    const date = document.getElementById("edit-date").value;
    const time = document.getElementById("edit-time").value;
    
    // Doctor details extract
    const docSelect = document.getElementById("edit-assign-doctor");
    const assignedDoctorId = docSelect.value;
    const assignedDoctorName = docSelect.options[docSelect.selectedIndex].text;
    const treatmentNotes = document.getElementById("edit-treatment-notes").value.trim();

    const isPlaceholderConfig = db.app.options.apiKey === "YOUR_API_KEY" || !db.app.options.apiKey;

    try {
      if (isPlaceholderConfig) {
        globalAppointments = globalAppointments.map(app => {
          if (app.id === docId) {
            return { ...app, name, phone, email, service, date, time, assignedDoctorId, assignedDoctorName, treatmentNotes };
          }
          return app;
        });
        localStorage.setItem("mock_appointments", JSON.stringify(globalAppointments));
        loadSandboxAppointments();
      } else {
        const recordRef = doc(db, "appointments", docId);
        await updateDoc(recordRef, {
          name, phone, email, service, date, time, assignedDoctorId, assignedDoctorName, treatmentNotes
        });
      }

      triggerToast(`Consultation record for ${name} updated successfully.`, "success");
      closeModal();
    } catch (err) {
      console.error("Consultation Update Failure:", err);
      triggerToast("Could not save changes.", "error");
    }
  });
}

function updateDoctorSelectDropdowns() {
  const select = document.getElementById("edit-assign-doctor");
  if (!select) return;

  select.innerHTML = `<option value="unassigned">Unassigned Clinic Dentist</option>`;
  globalDoctors.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.innerText = d.name;
    select.appendChild(opt);
  });
}

function openEditBookingModal(app) {
  const overlay = document.getElementById("edit-booking-modal-overlay");
  
  document.getElementById("edit-booking-id").value = app.id;
  document.getElementById("edit-name").value = app.name;
  document.getElementById("edit-phone").value = app.phone;
  document.getElementById("edit-email").value = app.email;
  document.getElementById("edit-service").value = app.service;
  document.getElementById("edit-date").value = app.date;
  document.getElementById("edit-time").value = app.time;
  document.getElementById("edit-assign-doctor").value = app.assignedDoctorId || "unassigned";
  document.getElementById("edit-treatment-notes").value = app.treatmentNotes || "";

  overlay.style.display = "flex";
}

/* =========================================================================
   10. DOCTORS DIRECTORY TAB CRUD
   ========================================================================= */
function initAddDoctorModal() {
  const overlay = document.getElementById("add-doctor-modal-overlay");
  const closeIcon = document.getElementById("add-doc-modal-close-icon");
  const closeBtn = document.getElementById("btn-add-doc-modal-close");
  const triggerBtn = document.getElementById("btn-add-doctor-trigger");
  const form = document.getElementById("add-doctor-form");

  const closeModal = () => { overlay.style.display = "none"; };
  
  triggerBtn.addEventListener("click", () => {
    form.reset();
    overlay.style.display = "flex";
  });
  
  closeIcon.addEventListener("click", closeModal);
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("doc-name").value.trim();
    const specialization = document.getElementById("doc-specialization").value;
    const qualification = document.getElementById("doc-qualification").value.trim();
    const experience = document.getElementById("doc-experience").value.trim();

    const isPlaceholderConfig = db.app.options.apiKey === "YOUR_API_KEY" || !db.app.options.apiKey;

    try {
      if (isPlaceholderConfig) {
        // Sandbox write
        const allDocs = JSON.parse(localStorage.getItem("mock_doctors") || "[]");
        const newDoc = {
          id: "doc_" + Date.now(),
          clinicId: currentClinicId,
          name,
          specialization,
          qualification,
          experience,
          status: "active"
        };
        allDocs.push(newDoc);
        localStorage.setItem("mock_doctors", JSON.stringify(allDocs));
        loadSandboxDoctors();
      } else {
        // Live cloud write
        await addDoc(collection(db, "doctors"), {
          clinicId: currentClinicId,
          name,
          specialization,
          qualification,
          experience,
          status: "active"
        });
      }

      triggerToast(`${name} added to practice Roster.`, "success");
      closeModal();
    } catch (err) {
      console.error("Doctor Roster Insertion Failed:", err);
      triggerToast("Could not add doctor.", "error");
    }
  });
}

function renderDoctorsGrid() {
  const grid = document.getElementById("admin-doctors-grid");
  if (!grid) return;

  if (globalDoctors.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding: 40px; color:#94a3b8;">
        <i class="fa-solid fa-user-doctor" style="font-size:2.5rem; margin-bottom:12px;"></i>
        <h4>Roster is Empty</h4>
        <p>Click 'Add Specialist' to add doctors specifically serving your clinic.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = "";
  globalDoctors.forEach(doc => {
    const card = document.createElement("div");
    card.className = "doc-management-card";

    const nameInitial = doc.name.split(" ").pop()[0] || "D";

    card.innerHTML = `
      <div class="doc-card-avatar">${nameInitial}</div>
      <div class="doc-card-body">
        <h4>${escapeHTML(doc.name)}</h4>
        <p class="spec"><i class="fa-solid fa-heart-pulse"></i> ${doc.specialization}</p>
        <p><i class="fa-solid fa-graduation-cap"></i> ${escapeHTML(doc.qualification)}</p>
        <p><i class="fa-solid fa-business-time"></i> ${escapeHTML(doc.experience)} Exp</p>
      </div>
      <div class="doc-card-actions">
        <button class="action-btn delete" title="Remove Doctor" id="btn-del-doc-${doc.id}">
          <i class="fa-regular fa-trash-can"></i>
        </button>
      </div>
    `;

    // Click handler for doctor delete
    card.querySelector(`#btn-del-doc-${doc.id}`).addEventListener("click", () => deleteDoctorRecord(doc.id, doc.name));
    
    grid.appendChild(card);
  });
}

async function deleteDoctorRecord(docId, docName) {
  const verify = confirm(`Are you sure you want to permanently remove ${docName} from the practice Roster?`);
  if (!verify) return;

  const isPlaceholderConfig = db.app.options.apiKey === "YOUR_API_KEY" || !db.app.options.apiKey;

  try {
    if (isPlaceholderConfig) {
      let allDocs = JSON.parse(localStorage.getItem("mock_doctors") || "[]");
      allDocs = allDocs.filter(d => d.id !== docId);
      localStorage.setItem("mock_doctors", JSON.stringify(allDocs));
      loadSandboxDoctors();
    } else {
      const docRef = doc(db, "doctors", docId);
      await deleteDoc(docRef);
    }
    triggerToast(`${docName} removed from Roster.`, "warning");
  } catch (err) {
    console.error("Doctor Deletion Failed:", err);
    triggerToast("Failed to remove doctor.", "error");
  }
}

/* =========================================================================
   11. PATIENT REGISTRY & CLINICAL VISITS TIMELINE
   ========================================================================= */
function compileAndRenderPatientRegistry() {
  const grid = document.getElementById("admin-patients-grid");
  if (!grid) return;

  // Group unique patients by email or phone
  const patientsMap = {};

  globalAppointments.forEach(app => {
    const key = app.email.toLowerCase().trim();
    if (!patientsMap[key]) {
      patientsMap[key] = {
        name: app.name,
        email: app.email,
        phone: app.phone,
        visitsCount: 0,
        lastCheckupDate: app.date,
        visits: []
      };
    }

    patientsMap[key].visitsCount++;
    
    // Set most recent checkup date
    if (new Date(app.date) > new Date(patientsMap[key].lastCheckupDate)) {
      patientsMap[key].lastCheckupDate = app.date;
    }

    patientsMap[key].visits.push({
      date: app.date,
      time: app.time,
      service: app.service,
      notes: app.treatmentNotes || "No treatment notes or prescriptions added."
    });
  });

  const registry = Object.values(patientsMap);
  globalPatients = registry; // Bind reference

  if (registry.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;">
        <i class="fa-solid fa-users" style="font-size:2.5rem; margin-bottom:12px;"></i>
        <h4>Patient Directory Empty</h4>
        <p>Patient profiles will aggregate automatically as soon as consultations are booked.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = "";
  registry.forEach((pat, idx) => {
    const card = document.createElement("div");
    card.className = "patient-profile-card";

    const initials = pat.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

    card.innerHTML = `
      <div class="patient-profile-header">
        <div class="patient-profile-avatar">${initials}</div>
        <div class="patient-profile-info">
          <h4>${escapeHTML(pat.name)}</h4>
          <p>${escapeHTML(pat.email)} | ${escapeHTML(pat.phone)}</p>
        </div>
      </div>
      
      <div class="patient-profile-stats">
        <div class="p-stat-box">
          <label>Total Visits</label>
          <span>${pat.visitsCount} consultations</span>
        </div>
        <div class="p-stat-box">
          <label>Last Consult</label>
          <span>${formatLocalDate(pat.lastCheckupDate)}</span>
        </div>
      </div>

      <button class="btn-view-history" id="btn-history-pat-${idx}">
        View Visit History <i class="fa-solid fa-clock-rotate-left"></i>
      </button>
    `;

    card.querySelector(`#btn-history-pat-${idx}`).addEventListener("click", () => openPatientHistoryModal(pat));
    grid.appendChild(card);
  });
}

function initPatientHistoryModal() {
  const overlay = document.getElementById("history-modal-overlay");
  const closeIcon = document.getElementById("hist-modal-close-icon");
  const closeBtn = document.getElementById("btn-hist-modal-close");

  const closeModal = () => { overlay.style.display = "none"; };

  closeIcon.addEventListener("click", closeModal);
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
}

function openPatientHistoryModal(pat) {
  const overlay = document.getElementById("history-modal-overlay");
  
  document.getElementById("hist-patient-name").innerText = pat.name;
  document.getElementById("hist-patient-contact").innerText = `${pat.email} | ${pat.phone}`;
  document.getElementById("hist-avatar").innerText = pat.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  // Render vertical visits timeline
  const timeline = document.getElementById("patient-visits-timeline");
  timeline.innerHTML = "";

  // Sort visits chronologically newest first
  pat.visits.sort((a,b) => new Date(b.date) - new Date(a.date));

  pat.visits.forEach(v => {
    const item = document.createElement("div");
    item.className = "timeline-item";
    
    item.innerHTML = `
      <div class="timeline-details">
        <h5>${v.service}</h5>
        <p><i class="fa-regular fa-calendar"></i> ${formatLocalDate(v.date)} at ${v.time}</p>
        <div style="font-size: 0.8rem; margin-top: 6px; font-weight: 500; font-style: italic; color: var(--dark-body);">
          <i class="fa-regular fa-clipboard"></i> Notes: ${escapeHTML(v.notes)}
        </div>
      </div>
    `;
    timeline.appendChild(item);
  });

  overlay.style.display = "flex";
}

/* =========================================================================
   12. EXCEL CSV & PRINT PDF CONTROLLERS
   ========================================================================= */
function initExportControllers() {
  const btnExcel = document.getElementById("btn-export-excel");
  const btnPDF = document.getElementById("btn-export-pdf");

  btnExcel.addEventListener("click", exportToCSV);
  btnPDF.addEventListener("click", () => {
    window.print(); // Sleekly formatted using @media print overrides
  });
}

function exportToCSV() {
  if (activeFilteredAppointmentsList.length === 0) {
    triggerToast("No filtered appointments available to export.", "warning");
    return;
  }

  // Define headers
  let csv = "Patient Name,Email Address,Phone Number,Dental Treatment,Date,Time,Assigned Dentist,Workflow Status,Clinical Diagnosis Notes\n";

  activeFilteredAppointmentsList.forEach(app => {
    const name = `"${app.name.replace(/"/g, '""')}"`;
    const email = `"${app.email.replace(/"/g, '""')}"`;
    const phone = `"${app.phone.replace(/"/g, '""')}"`;
    const service = `"${app.service.replace(/"/g, '""')}"`;
    const date = `"${app.date}"`;
    const time = `"${app.time}"`;
    const docName = `"${(app.assignedDoctorName || "Unassigned").replace(/"/g, '""')}"`;
    const status = `"${app.status.replace("_", " ")}"`;
    const notes = `"${(app.treatmentNotes || "").replace(/"/g, '""').replace(/\n/g, " ")}"`;

    csv += `${name},${email},${phone},${service},${date},${time},${docName},${status},${notes}\n`;
  });

  // Trigger spreadsheet file download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  const dateStr = new Date().toISOString().split("T")[0];
  link.setAttribute("href", url);
  link.setAttribute("download", `ClinicSphere_Appointments_${currentClinicId}_${dateStr}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  triggerToast("Spreadsheet downloaded successfully.", "success");
}

/* =========================================================================
   13. SIGNOUT MANAGEMENT
   ========================================================================= */
function initLogoutTrigger() {
  const logoutBtn = document.getElementById("btn-logout-trigger");

  logoutBtn.addEventListener("click", async () => {
    const isPlaceholderConfig = auth.app.options.apiKey === "YOUR_API_KEY" || !auth.app.options.apiKey;

    try {
      if (isPlaceholderConfig) {
        sessionStorage.removeItem("sns_admin_session");
        sessionStorage.removeItem("clinicId");
      } else {
        await signOut(auth);
        sessionStorage.removeItem("clinicId");
      }
      console.log("[SaaS Admin] Session cleared. Redirecting to login portal.");
      window.location.href = "login.html";
    } catch (err) {
      console.error("Sign Out Operation Failed: ", err);
      window.location.href = "login.html"; 
    }
  });
}

/* =========================================================================
   14. INTERACTION AND UTILITY FORMATTERS
   ========================================================================= */
function initThemeToggle() {
  const toggleBtn = document.getElementById("theme-toggle");
  const icon = toggleBtn.querySelector("i");

  if (localStorage.getItem("theme_pref") === "dark") {
    document.body.classList.add("dark-theme");
    icon.className = "fa-solid fa-sun";
  }

  toggleBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark-theme");
    const isDark = document.body.classList.contains("dark-theme");
    
    if (isDark) {
      localStorage.setItem("theme_pref", "dark");
      icon.className = "fa-solid fa-sun";
      triggerToast("Dark Mode Enabled", "success");
    } else {
      localStorage.setItem("theme_pref", "light");
      icon.className = "fa-solid fa-moon";
      triggerToast("Light Mode Enabled", "success");
    }

    // Refresh analytics chart colors if active
    if (globalAppointments.length > 0) {
      renderAnalyticsChart();
    }
  });
}

function initMobileMenu() {
  const menuToggle = document.getElementById("menu-toggle");
  const sidebar = document.getElementById("dashboard-sidebar");

  menuToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    sidebar.classList.toggle("active");
  });

  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 1024 && !sidebar.contains(e.target) && e.target !== menuToggle) {
      sidebar.classList.remove("active");
    }
  });
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function formatLocalDate(dateStr) {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
