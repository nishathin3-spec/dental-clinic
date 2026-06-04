/**
 * ClinicSphere SaaS Platform - Secure Tenant Sign In Logic (login.js)
 * Resolves credential inputs, checks associated tenant clinicIds,
 * and boots administrative dashboard workspaces with full data isolation.
 */

import { auth, db } from "../firebase/firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  initAdminLogin();
});

function initAdminLogin() {
  const form = document.getElementById("admin-login-form");
  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  const errorBanner = document.getElementById("login-error");
  const errorText = document.getElementById("login-error-text");
  const submitBtn = document.getElementById("btn-login-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    errorBanner.style.display = "none";
    submitBtn.classList.add("loading");
    submitBtn.disabled = true;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
      const isPlaceholderConfig = auth.app.options.apiKey === "YOUR_API_KEY" || !auth.app.options.apiKey;

      if (isPlaceholderConfig) {
        // --- MULTI-TENANT MOCK AUTH FALLBACK (DEMO MODE) ---
        await simulateDelay(800);

        // Load seed users + any new registered practices
        let mockUsers = JSON.parse(localStorage.getItem("mock_admin_users") || "[]");
        if (mockUsers.length === 0) {
          mockUsers = [
            { email: "sns@clinic.com", password: "admin", clinicId: "sns-dental", role: "admin" },
            { email: "smile@clinic.com", password: "admin", clinicId: "smilecare", role: "admin" }
          ];
          localStorage.setItem("mock_admin_users", JSON.stringify(mockUsers));
        }

        const match = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);

        if (match) {
          // Set Sandbox multi-tenant credentials in session
          sessionStorage.setItem("sns_admin_session", "demo_active");
          sessionStorage.setItem("clinicId", match.clinicId); // Locked tenant slug
          
          console.log(`[SaaS Sandbox Sign In] Authenticated for Tenant: ${match.clinicId}`);
          window.location.href = "admin.html";
        } else {
          showAuthError("Invalid credentials! Use 'sns@clinic.com' or 'smile@clinic.com' with password 'admin' to explore isolated demo dashboards.");
        }
      } else {
        // --- REAL LIVE CLOUD FIREBASE TENANT AUTHENTICATION ---
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Fetch associated clinicId mapping from the 'users' collection
        const userDocRef = doc(db, "users", user.email.replace(/\./g, "_"));
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
          const userData = docSnap.data();
          
          // Securely lock this session to their specific clinicId
          sessionStorage.setItem("clinicId", userData.clinicId);
          console.log(`[SaaS Live Sign In] Authenticated for Clinic: ${userData.clinicId}`);
          
          window.location.href = "admin.html";
        } else {
          // Fallback / Triage if user is authenticated but not registered under a clinic slug
          showAuthError("Your account is verified but no associated clinic directory was found. Contact system admin.");
          await auth.signOut();
        }
      }

    } catch (err) {
      console.error("Staff Sign In Failure: ", err);
      
      let message = "An error occurred during authentication. Please try again.";
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        message = "Incorrect email address or password. Please verify and retry.";
      } else if (err.code === "auth/too-many-requests") {
        message = "Access temporarily locked due to excessive failed attempts. Reset your password.";
      }
      
      showAuthError(message);
    } finally {
      submitBtn.classList.remove("loading");
      submitBtn.disabled = false;
    }
  });

  function showAuthError(msg) {
    errorText.innerText = msg;
    errorBanner.style.display = "flex";
    passwordInput.value = ""; 
  }

  function simulateDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
