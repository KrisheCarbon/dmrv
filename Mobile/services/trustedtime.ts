// src/services/trustedTime.js

let loginPerfTime = null;
let loginISTMillis = null;

/**
 * Call ONCE at app start or login
 */
export function initISTClock() {
  const now = new Date();

  // Convert device time to IST at login
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  loginISTMillis = now.getTime() + IST_OFFSET_MS;

  // Monotonic clock
  loginPerfTime = performance.now();
}

/**
 * Get current IST time using internal clock
 */
export function getCurrentIST() {
  if (loginPerfTime === null || loginISTMillis === null) {
    throw new Error("IST clock not initialized. Call initISTClock()");
  }

  const elapsed = performance.now() - loginPerfTime;
  return new Date(loginISTMillis + elapsed).toISOString();
}
