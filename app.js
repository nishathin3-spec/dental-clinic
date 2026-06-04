/**
 * ClinicSphere SaaS Platform - Public Website & Router Logic (app.js)
 * Coordinates dynamic multi-clinic routing, practice registrations,
 * isolated booking submissions, Dark Mode, and Toast notifications.
 */

import { db } from "../firebase/firebase-config.js";
import { collection, addDoc, getDocs, doc, setDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Active tenant tracking state
let currentClinicId = null;
let currentClinicData = null;

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  initMobileMenu();
  routeTenantView();
});

/* =========================================================================
   1. TOAST NOTIFICATIONS ENGINE
   ========================================================================= */
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast-alert ${type}`;
  
  let icon = '<i class="fa-solid fa-circle-check"></i>';
  if (type === "warning") icon = '<i class="fa-solid fa-circle-exclamation"></i>';
  if (type === "error") icon = '<i class="fa-solid fa-triangle-exclamation"></i>';

  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);

  // Auto-remove toast from DOM after animations complete (4.5s total)
  setTimeout(() => {
    toast.remove();
  }, 4500);
}

/* =========================================================================
   2. DYNAMIC TENANT ROUTER & RENDERING
   ========================================================================= */
async function routeTenantView() {
  const params = new URLSearchParams(window.location.search);
  const clinicSlug = params.get("clinic");

  const platformView = document.getElementById("platform-view");
  const clinicView = document.getElementById("clinic-view");
  
  const platLinks = document.querySelectorAll(".plat-nav");
  const clinicLinks = document.querySelectorAll(".clinic-nav");

  if (clinicSlug) {
    // --- MODE B: RENDER SPECIFIC CLINIC PROFILE ---
    currentClinicId = clinicSlug.toLowerCase();
    
    // Toggle active view states
    platformView.style.display = "none";
    clinicView.style.display = "block";
    platLinks.forEach(el => el.style.display = "none");
    clinicLinks.forEach(el => el.style.display = "block");

    const loaded = await fetchAndRebrandClinic(currentClinicId);
    if (loaded) {
      initReviewsCarousel();
      initClinicDoctors(currentClinicId);
      initBookingForm(currentClinicId);
    } else {
      // Revert if slug is invalid
      showToast(`Clinic '${clinicSlug}' not registered. Redirecting to platform.`, "error");
      setTimeout(() => { window.location.href = "index.html"; }, 3000);
    }
  } else {
    // --- MODE A: RENDER DENTSAS PLATFORM HOMEPAGE ---
    platformView.style.display = "block";
    clinicView.style.display = "none";
    platLinks.forEach(el => el.style.display = "block");
    clinicLinks.forEach(el => el.style.display = "none");

    initPlatformRegistry();
    loadClinicListSelector();
  }
}

// Rebrands site layouts with custom clinic parameters
async function fetchAndRebrandClinic(slug) {
  const isPlaceholderConfig = db.app.options.apiKey === "YOUR_API_KEY" || !db.app.options.apiKey;

  try {
    let clinic = null;

    if (isPlaceholderConfig) {
      // Sandbox Mock Clinic fetch
      const mockClinics = JSON.parse(localStorage.getItem("mock_clinics") || "[]");
      clinic = mockClinics.find(c => c.slug === slug);
      
      // Seed default sandbox clinics if none exist
      if (!clinic && (slug === "sns-dental" || slug === "smilecare")) {
        const defaultClinics = seedSandboxClinics();
        clinic = defaultClinics.find(c => c.slug === slug);
      }
    } else {
      // Live Firestore Clinic Fetch
      const q = query(collection(db, "clinics"), where("slug", "==", slug));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        clinic = querySnap.docs[0].data();
      }
    }

    if (!clinic) return false;

    currentClinicData = clinic;

    // Apply Brand customizations to DOM
    document.title = `${clinic.name} - Modern Dental Services`;
    
    // Header brand logo text
    const headerBrandText = document.getElementById("header-brand-text");
    headerBrandText.innerHTML = `${clinic.name.split(" ")[0]}<span>${clinic.name.split(" ").slice(1).join(" ") || "Dental"}</span>`;
    
    // Header brand logo icon
    const logoIcon = document.getElementById("logo-icon");
    logoIcon.className = "fa-solid fa-tooth";

    // Rebrand Footer logo
    const footerBrandText = document.getElementById("footer-brand-text");
    footerBrandText.innerHTML = `${clinic.name.split(" ")[0]}<span>${clinic.name.split(" ").slice(1).join(" ") || "Dental"}</span>`;
    
    // Body headings and details
    document.getElementById("clinic-title-heading").innerHTML = `${clinic.name.split(" ")[0]} <span>${clinic.name.split(" ").slice(1).join(" ") || "Dental Practice"}</span>`;
    document.getElementById("clinic-tagline-text").innerText = `Providing premier dental health pathways at ${clinic.name}. Our clinic is dedicated to clean, gentle, and highly personalized cosmetic treatments.`;
    
    document.getElementById("clinic-location-address").innerText = clinic.address;
    document.getElementById("clinic-phone-number").innerText = clinic.phone || "+1 (555) 234-9876";
    document.getElementById("clinic-email-address").innerText = clinic.email;
    document.getElementById("footer-about-text").innerText = `Proudly serving patients at our ${clinic.name} location: ${clinic.address}. Feel confident in your smile with our expert dentists.`;
    document.getElementById("footer-copyright-text").innerHTML = `&copy; 2026 ${clinic.name}. All Rights Reserved. Powered by ClinicSphere.`;

    // Configure specific clinic links inside the footer
    const footerLinksList = document.getElementById("footer-links-list");
    footerLinksList.innerHTML = `
      <li><a href="#home" class="f-link-item"><i class="fa-solid fa-chevron-right"></i> Home</a></li>
      <li><a href="#about" class="f-link-item"><i class="fa-solid fa-chevron-right"></i> About Us</a></li>
      <li><a href="#services" class="f-link-item"><i class="fa-solid fa-chevron-right"></i> Services</a></li>
      <li><a href="login.html" class="f-link-item"><i class="fa-solid fa-chevron-right"></i> Clinic Login</a></li>
      <li><a href="index.html" class="f-link-item" style="color:var(--primary-light);"><i class="fa-solid fa-chevron-right"></i> Back to SaaS Platform</a></li>
    `;

    return true;

  } catch (err) {
    console.error("Clinic Rebranding Error:", err);
    return false;
  }
}

// Queries and renders the custom active doctors representing this clinic
async function initClinicDoctors(clinicId) {
  const doctorsGrid = document.getElementById("clinic-doctors-grid");
  doctorsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 20px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading specialists...</div>`;

  const isPlaceholderConfig = db.app.options.apiKey === "YOUR_API_KEY" || !db.app.options.apiKey;

  try {
    let docsList = [];

    if (isPlaceholderConfig) {
      // Sandbox mock doctors
      const allMockDocs = JSON.parse(localStorage.getItem("mock_doctors") || "[]");
      docsList = allMockDocs.filter(d => d.clinicId === clinicId && d.status === "active");

      // Seed defaults if mock lists are clean
      if (docsList.length === 0 && (clinicId === "sns-dental" || clinicId === "smilecare")) {
        const seededDocs = seedSandboxDoctors();
        docsList = seededDocs.filter(d => d.clinicId === clinicId && d.status === "active");
      }
    } else {
      // Live Firestore queries
      const q = query(collection(db, "doctors"), where("clinicId", "==", clinicId), where("status", "==", "active"));
      const querySnap = await getDocs(q);
      querySnap.forEach(docSnap => {
        docsList.push({ id: docSnap.id, ...docSnap.data() });
      });
    }

    if (docsList.length === 0) {
      doctorsGrid.innerHTML = `
        <div class="empty-doctors-state">
          <i class="fa-solid fa-user-doctor" style="font-size:2.5rem; margin-bottom:12px; color:#cbd5e1;"></i>
          <h4>Our Doctor Roster is Currently Being Scheduled</h4>
          <p>Please check back soon or book an appointment directly with our duty dentists.</p>
        </div>
      `;
      return;
    }

    doctorsGrid.innerHTML = "";
    docsList.forEach((doc, idx) => {
      const card = document.createElement("div");
      card.className = "doctor-card";

      // Use generated visual assets matching our mock portfolio
      let imgPath = `images/doc-${(idx % 2) + 1}.png`;

      card.innerHTML = `
        <div class="doctor-image">
          <img src="${imgPath}" alt="${doc.name}">
        </div>
        <div class="doctor-info">
          <span class="specialization">${doc.specialization}</span>
          <h3>${doc.name}</h3>
          <p class="qualification">${doc.qualification}</p>
          <span class="experience">${doc.experience} Experience</span>
        </div>
      `;
      doctorsGrid.appendChild(card);
    });

  } catch (err) {
    console.error("Doctor Roster Fetch Error:", err);
    doctorsGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--danger);">Error loading team doctors.</div>`;
  }
}

/* =========================================================================
   3. SAAS CLINIC REGISTRATION PANEL
   ========================================================================= */
function initPlatformRegistry() {
  const form = document.getElementById("clinic-registration-form");
  const submitBtn = document.getElementById("btn-register-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    submitBtn.disabled = true;
    submitBtn.innerHTML = `Registering Portal... <i class="fa-solid fa-spinner fa-spin"></i>`;

    const name = document.getElementById("reg-name").value.trim();
    const slug = document.getElementById("reg-slug").value.toLowerCase().trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const address = document.getElementById("reg-address").value.trim();

    if (!name || !slug || !email || !password || !address) {
      showToast("All fields are strictly required.", "warning");
      submitBtn.disabled = false;
      submitBtn.innerHTML = `Register & Open Portal <i class="fa-solid fa-arrow-pointer"></i>`;
      return;
    }

    const isPlaceholderConfig = db.app.options.apiKey === "YOUR_API_KEY" || !db.app.options.apiKey;

    try {
      if (isPlaceholderConfig) {
        // --- SANDBOX MOCK SIGN UP ---
        await simulateDelay(1200);

        const mockClinics = JSON.parse(localStorage.getItem("mock_clinics") || "[]");
        
        // Prevent duplicate slugs
        if (mockClinics.some(c => c.slug === slug) || slug === "sns-dental" || slug === "smilecare") {
          showToast(`The url slug '${slug}' is already registered. Choose another slug.`, "error");
          submitBtn.disabled = false;
          submitBtn.innerHTML = `Register & Open Portal <i class="fa-solid fa-arrow-pointer"></i>`;
          return;
        }

        const newClinic = {
          id: slug,
          slug,
          name,
          email,
          phone: "+1 (555) 303-9988",
          address,
          createdAt: new Date().toISOString()
        };

        mockClinics.push(newClinic);
        localStorage.setItem("mock_clinics", JSON.stringify(mockClinics));

        // Create standard mock admin user logins in local DB
        const mockUsers = JSON.parse(localStorage.getItem("mock_admin_users") || "[]");
        mockUsers.push({ email, password, clinicId: slug, role: "admin" });
        localStorage.setItem("mock_admin_users", JSON.stringify(mockUsers));

        showToast(`Congratulations! '${name}' is registered. Redirecting to your public page...`, "success");
        setTimeout(() => {
          window.location.href = `index.html?clinic=${slug}`;
        }, 2200);

      } else {
        // --- REAL LIVE FIRESTORE REGISTRY ---
        // 1. Create unique document linked to slug
        const docRef = doc(db, "clinics", slug);
        await setDoc(docRef, {
          name,
          slug,
          email,
          phone: "+1 (555) 303-9988",
          address,
          createdAt: serverTimestamp()
        });

        // 2. Also register credentials mapping record (for user query routing)
        // Normally users would be created in Auth, and their mapping details saved.
        const userRef = doc(db, "users", email.replace(/\./g, "_"));
        await setDoc(userRef, {
          email,
          clinicId: slug,
          role: "admin"
        });

        showToast(`'${name}' registered in Cloud Firestore successfully! Proceed to sign up admin owner in Firebase Auth console.`, "success");
        setTimeout(() => {
          window.location.href = `index.html?clinic=${slug}`;
        }, 3000);
      }

    } catch (err) {
      console.error("Platform Registration Failure:", err);
      showToast(`Registration failed: ${err.message}`, "error");
      submitBtn.disabled = false;
      submitBtn.innerHTML = `Register & Open Portal <i class="fa-solid fa-arrow-pointer"></i>`;
    }
  });
}

// Loads list of registered clinics into selector dropdown
async function loadClinicListSelector() {
  const selector = document.getElementById("platform-clinic-finder");
  const btnGo = document.getElementById("btn-go-to-clinic");
  if (!selector) return;

  const isPlaceholderConfig = db.app.options.apiKey === "YOUR_API_KEY" || !db.app.options.apiKey;

  try {
    let list = [];

    if (isPlaceholderConfig) {
      // Sandbox mock list
      list = JSON.parse(localStorage.getItem("mock_clinics") || "[]");
      
      // Ensure defaults are represented
      if (!list.some(c => c.slug === "sns-dental")) {
        list = seedSandboxClinics().concat(list);
      }
    } else {
      // Live Firestore list
      const querySnap = await getDocs(collection(db, "clinics"));
      querySnap.forEach(docSnap => {
        list.push(docSnap.data());
      });
    }

    list.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.slug;
      opt.innerText = c.name;
      selector.appendChild(opt);
    });

    btnGo.addEventListener("click", () => {
      const val = selector.value;
      if (val) {
        window.location.href = `index.html?clinic=${val}`;
      } else {
        showToast("Please choose a registered clinic from the directory.", "warning");
      }
    });

  } catch (err) {
    console.error("Finder Dropdown Loader Error:", err);
  }
}

/* =========================================================================
   4. TENANT APPOINTMENT BOOKING PROCESS
   ========================================================================= */
function initBookingForm(clinicId) {
  const form = document.getElementById("appointment-form");
  const submitBtn = document.getElementById("btn-booking-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    submitBtn.disabled = true;
    submitBtn.innerHTML = `Scheduling... <i class="fa-solid fa-spinner fa-spin"></i>`;

    const name = document.getElementById("book-name").value.trim();
    const phone = document.getElementById("book-phone").value.trim();
    const email = document.getElementById("book-email").value.trim();
    const service = document.getElementById("book-service").value;
    const date = document.getElementById("book-date").value;
    const time = document.getElementById("book-time").value;
    const message = document.getElementById("book-message").value.trim();

    if (!name || !phone || !email || !service || !date || !time) {
      showToast("All fields marked (*) are required.", "warning");
      submitBtn.disabled = false;
      submitBtn.innerHTML = `Submit Request <i class="fa-solid fa-arrow-right-long"></i>`;
      return;
    }

    const isPlaceholderConfig = db.app.options.apiKey === "YOUR_API_KEY" || !db.app.options.apiKey;

    try {
      if (isPlaceholderConfig) {
        // --- SANDBOX LIVE SCHEDULER ---
        await simulateDelay(900);

        const localAppointments = JSON.parse(localStorage.getItem("mock_appointments") || "[]");
        
        // Auto-assign doctor based on sandbox list
        const doctorsList = JSON.parse(localStorage.getItem("mock_doctors") || "[]").filter(d => d.clinicId === clinicId);
        const assignedDoc = doctorsList.find(d => d.status === "active") || { id: "unassigned", name: "Unassigned Clinic Dentist" };

        const newRecord = {
          id: "mock_" + Date.now(),
          clinicId, // Tenant Isolated Tag
          name,
          phone,
          email,
          service,
          date,
          time,
          message,
          status: "pending",
          assignedDoctorId: assignedDoc.id,
          assignedDoctorName: assignedDoc.name,
          treatmentNotes: "",
          createdAt: new Date().toISOString()
        };

        localAppointments.push(newRecord);
        localStorage.setItem("mock_appointments", JSON.stringify(localAppointments));
      } else {
        // --- REAL LIVE CLOUD FIRESTORE SCHEDULER ---
        await addDoc(collection(db, "appointments"), {
          clinicId, // Tenant Isolated Tag
          name,
          phone,
          email,
          service,
          date,
          time,
          message,
          status: "pending",
          assignedDoctorId: "unassigned",
          assignedDoctorName: "Unassigned Clinic Dentist",
          treatmentNotes: "",
          createdAt: serverTimestamp()
        });
      }

      showToast(`Thank you, ${name}! Your booking request was saved. The clinic team will reach out shortly.`, "success");
      form.reset();

    } catch (err) {
      console.error("Booking Submission Failure:", err);
      showToast(`Booking failed: ${err.message}`, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `Submit Request <i class="fa-solid fa-arrow-right-long"></i>`;
    }
  });
}

/* =========================================================================
   5. SANDBOX INITIAL SEED DATA
   ========================================================================= */
function seedSandboxClinics() {
  const defaults = [
    {
      id: "sns-dental",
      slug: "sns-dental",
      name: "SNS Dental Clinic",
      email: "support@snsdentalclinic.com",
      phone: "+1 (555) 234-9876",
      address: "120 Healthcare Avenue, Medical District, NY 10016"
    },
    {
      id: "smilecare",
      slug: "smilecare",
      name: "SmileCare Center",
      email: "frontdesk@smilecare.com",
      phone: "+1 (555) 909-4455",
      address: "808 Century Plaza, Los Angeles, CA 90024"
    }
  ];
  localStorage.setItem("mock_clinics", JSON.stringify(defaults));
  return defaults;
}

function seedSandboxDoctors() {
  const docs = [
    { id: "doc_1", clinicId: "sns-dental", name: "Dr. Sarah Jenkins", specialization: "Lead Cosmetic Dentist", qualification: "DDS, Harvard Medicine", experience: "12+ Yrs", status: "active" },
    { id: "doc_2", clinicId: "sns-dental", name: "Dr. Marcus Chen", specialization: "Senior Orthodontist", qualification: "MDS, Columbia University", experience: "9+ Yrs", status: "active" },
    { id: "doc_3", clinicId: "smilecare", name: "Dr. Alan Turing", specialization: "Dental Implants Specialist", qualification: "PhD, Cambridge Surgery", experience: "15+ Yrs", status: "active" },
    { id: "doc_4", clinicId: "smilecare", name: "Dr. Ada Lovelace", specialization: "General Oral Hygienist", qualification: "DDS, Oxford Surgery", experience: "7+ Yrs", status: "active" }
  ];
  localStorage.setItem("mock_doctors", JSON.stringify(docs));
  return docs;
}

/* =========================================================================
   6. UI/UX HELPERS (DARK MODE, MOBILE NAVIGATION)
   ========================================================================= */
function initThemeToggle() {
  const toggleBtn = document.getElementById("theme-toggle");
  const icon = toggleBtn.querySelector("i");

  // Load selection
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
      showToast("Dark Mode Enabled", "success");
    } else {
      localStorage.setItem("theme_pref", "light");
      icon.className = "fa-solid fa-moon";
      showToast("Light Mode Enabled", "success");
    }
  });
}

function initMobileMenu() {
  const hamburger = document.getElementById("hamburger-menu");
  const navMenu = document.getElementById("nav-menu");
  const navLinks = document.querySelectorAll(".nav-link");

  hamburger.addEventListener("click", () => {
    hamburger.classList.toggle("active");
    navMenu.classList.toggle("active");
  });

  navLinks.forEach(link => {
    link.addEventListener("click", () => {
      hamburger.classList.remove("active");
      navMenu.classList.remove("active");
    });
  });
}

function initReviewsCarousel() {
  const track = document.getElementById("reviews-carousel-track");
  const slides = Array.from(track.children);
  const indicators = document.querySelectorAll(".indicator");
  let currentSlideIndex = 0;
  let autoSlideTimer;

  function moveToSlide(index) {
    track.style.transform = `translateX(-${index * 100}%)`;
    indicators.forEach(ind => ind.classList.remove("active"));
    indicators[index].classList.add("active");
    currentSlideIndex = index;
  }

  function startAutoSlide() {
    autoSlideTimer = setInterval(() => {
      let nextIndex = (currentSlideIndex + 1) % slides.length;
      moveToSlide(nextIndex);
    }, 5000);
  }

  function resetAutoSlide() {
    clearInterval(autoSlideTimer);
    startAutoSlide();
  }

  indicators.forEach(indicator => {
    indicator.addEventListener("click", (e) => {
      const targetIndex = parseInt(e.target.getAttribute("data-slide"));
      moveToSlide(targetIndex);
      resetAutoSlide();
    });
  });

  startAutoSlide();
}

function simulateDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
