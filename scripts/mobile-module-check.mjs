#!/usr/bin/env node
/**
 * End-to-end check for mobile modules (farms, pyrolysis, mixing, application, network).
 * Uses Backend service role to obtain a user JWT, then hits the same APIs the mobile app uses.
 *
 * Usage: node scripts/mobile-module-check.mjs [--create] [--email=user@example.com]
 *   --create  Create test records (farm + pyrolysis session start probe only)
 *   --email   Impersonate this user (default: first mobile-capable user)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CREATE = process.argv.includes("--create");
const EMAIL_ARG = process.argv.find((a) => a.startsWith("--email="));
const TARGET_EMAIL = EMAIL_ARG ? EMAIL_ARG.slice("--email=".length).trim() : null;
const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const TAG = `[mobile-check ${new Date().toISOString()}]`;

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const backendEnv = loadEnv(resolve(ROOT, "Backend/.env"));
const mobileEnv = loadEnv(resolve(ROOT, "Mobile/.env"));

const SUPABASE_URL = backendEnv.SUPABASE_URL || mobileEnv.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = backendEnv.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = mobileEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(token, path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${BACKEND}${path}`, { ...init, headers });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { ok: res.ok, status: res.status, body };
}

async function getMobileUserToken() {
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    throw new Error("Missing SUPABASE_URL, SERVICE_ROLE_KEY, or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env files");
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let user;
  if (TARGET_EMAIL) {
    const { data: one, error: oneErr } = await admin
      .from("users")
      .select("id, email, role, full_name")
      .eq("email", TARGET_EMAIL)
      .maybeSingle();
    if (oneErr) throw new Error(`users query failed: ${oneErr.message}`);
    if (!one) throw new Error(`No user with email ${TARGET_EMAIL}`);
    user = one;
  } else {
    const { data: users, error: usersErr } = await admin
      .from("users")
      .select("id, email, role, full_name")
      .in("role", ["admin", "manager", "supervisor", "climapreneur"])
      .not("email", "is", null)
      .limit(5);
    if (usersErr) throw new Error(`users query failed: ${usersErr.message}`);
    if (!users?.length) throw new Error("No mobile-capable users found in users table");
    user = users.find((u) => u.role !== "admin") || users[0];
  }
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });
  if (linkErr) throw new Error(`generateLink failed: ${linkErr.message}`);

  const tokenHash = linkData?.properties?.hashed_token;
  if (!tokenHash) throw new Error("No hashed_token from generateLink");

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: sessionData, error: otpErr } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (otpErr) throw new Error(`verifyOtp failed: ${otpErr.message}`);

  const token = sessionData.session?.access_token;
  if (!token) throw new Error("No access_token after verifyOtp");

  return { token, user };
}

async function main() {
  console.log(`${TAG} backend=${BACKEND} create=${CREATE}`);

  // Health
  try {
    const health = await fetch(`${BACKEND}/health`);
    if (!health.ok) fail("Backend health", `HTTP ${health.status}`);
    else pass("Backend health", "ok");
  } catch (err) {
    fail("Backend health", err.message);
    process.exit(1);
  }

  let token;
  let authUser;
  try {
    ({ token, user: authUser } = await getMobileUserToken());
    pass("Auth", `${authUser.full_name || authUser.email} (${authUser.role})`);
  } catch (err) {
    fail("Auth", err.message);
    printSummary();
    process.exit(1);
  }

  // Mobile network (feeds pyrolysis, mixing, application pickers)
  const network = await api(token, "/mobile-network");
  if (!network.ok) {
    fail("GET /mobile-network", `HTTP ${network.status}`);
  } else {
    const n = network.body;
    pass(
      "GET /mobile-network",
      `kontikkis=${n.kontikkis?.length ?? 0} farms=${n.farms?.length ?? 0} feedstock=${n.feedstock?.length ?? 0}`,
    );
    if (!n.kontikkis?.length) fail("Network kontikkis", "empty — pyrolysis start will fail");
    else pass("Network kontikkis", `${n.kontikkis.length} available`);
    if (!n.farms?.length) fail("Network farms", "empty — mixing/application farm pickers empty");
    else pass("Network farms", `${n.farms.length} available`);
    if (!n.feedstock?.length) fail("Network feedstock", "empty — pyrolysis feedstock picker empty");
    else pass("Network feedstock", `${n.feedstock.length} available`);
  }

  // Farms
  const farmsList = await api(token, "/farms");
  if (!farmsList.ok) fail("GET /farms", `HTTP ${farmsList.status}`);
  else pass("GET /farms", `${Array.isArray(farmsList.body) ? farmsList.body.length : 0} records`);

  let createdFarmId = null;
  if (CREATE) {
    const farmPayload = {
      farmer_name: `${TAG} Test Farmer`,
      mobile_number: "9876543210",
      latitude: 12.9716,
      longitude: 77.5946,
      address: "Mobile check test farm, Bengaluru",
      total_land_size: 2.5,
      crops: [
        {
          crop: "Rice",
          acreage: 2.5,
          sowing_date: "2026-06-01",
          estimated_harvest_date: "2026-10-01",
        },
      ],
      interested_in_biochar: true,
      prior_biochar_exp: false,
      prior_biochar_acreage: null,
      estimated_biomass: 5000,
    };
    const farmCreate = await api(token, "/farms", {
      method: "POST",
      body: JSON.stringify(farmPayload),
    });
    if (!farmCreate.ok) fail("POST /farms (create test)", JSON.stringify(farmCreate.body));
    else {
      createdFarmId = farmCreate.body?.id;
      pass("POST /farms (create test)", createdFarmId || "created");
    }
  }

  // Pyrolysis sessions
  const sessions = await api(token, "/pyrolysis-sessions");
  if (!sessions.ok) fail("GET /pyrolysis-sessions", `HTTP ${sessions.status}`);
  else pass("GET /pyrolysis-sessions", `${Array.isArray(sessions.body) ? sessions.body.length : 0} sessions`);

  const kontikkiId = network.body?.kontikkis?.[0]?.id;
  let sessionId = null;
  if (CREATE && kontikkiId) {
    const start = await api(token, "/pyrolysis-sessions/start", {
      method: "POST",
      body: JSON.stringify({ kontikki_ids: [kontikkiId] }),
    });
    if (!start.ok) {
      const msg = typeof start.body === "object" ? start.body.message : String(start.body);
      if (String(msg).includes("already active")) pass("POST /pyrolysis-sessions/start", "active session exists (ok)");
      else fail("POST /pyrolysis-sessions/start", `HTTP ${start.status} ${JSON.stringify(start.body)}`);
    } else {
      sessionId = start.body?.id;
      pass("POST /pyrolysis-sessions/start", sessionId || "started");
    }
  } else if (CREATE && !kontikkiId) {
    fail("POST /pyrolysis-sessions/start", "skipped — no kontikki");
  } else {
    pass("POST /pyrolysis-sessions/start", "skipped (use --create)");
  }

  // Pyrolysis batches list
  const pyroBatches = await api(token, "/pyrolysis-batches");
  if (!pyroBatches.ok) fail("GET /pyrolysis-batches", `HTTP ${pyroBatches.status}`);
  else pass("GET /pyrolysis-batches", `${Array.isArray(pyroBatches.body) ? pyroBatches.body.length : 0} batches`);

  // Mixing
  const mixingAvail = await api(token, "/mixing-entries/available-pyrolysis-batches");
  if (!mixingAvail.ok) fail("GET /mixing-entries/available-pyrolysis-batches", `HTTP ${mixingAvail.status}`);
  else {
    const count = Array.isArray(mixingAvail.body) ? mixingAvail.body.length : 0;
    pass("GET /mixing-entries/available-pyrolysis-batches", `${count} linkable batches`);
    if (count === 0) fail("Mixing batch links", "no completed pyrolysis batches to link");
  }

  const mixingList = await api(token, "/mixing-entries");
  if (!mixingList.ok) fail("GET /mixing-entries", `HTTP ${mixingList.status}`);
  else pass("GET /mixing-entries", `${Array.isArray(mixingList.body) ? mixingList.body.length : 0} entries`);

  // Application
  const appAvail = await api(token, "/application-entries/available-pyrolysis-batches");
  if (!appAvail.ok) fail("GET /application-entries/available-pyrolysis-batches", `HTTP ${appAvail.status}`);
  else {
    const count = Array.isArray(appAvail.body) ? appAvail.body.length : 0;
    pass("GET /application-entries/available-pyrolysis-batches", `${count} linkable batches`);
    if (count === 0) fail("Application batch links", "no completed pyrolysis batches to link");
  }

  const appList = await api(token, "/application-entries");
  if (!appList.ok) fail("GET /application-entries", `HTTP ${appList.status}`);
  else pass("GET /application-entries", `${Array.isArray(appList.body) ? appList.body.length : 0} entries`);

  // Kiln
  const kiln = await api(token, "/kiln-batches");
  if (!kiln.ok) fail("GET /kiln-batches", `HTTP ${kiln.status}`);
  else pass("GET /kiln-batches", `${Array.isArray(kiln.body) ? kiln.body.length : 0} batches`);

  if (createdFarmId) {
    console.log(`\n${TAG} created farm id: ${createdFarmId}`);
  }
  if (sessionId) {
    console.log(`${TAG} started pyrolysis session id: ${sessionId}`);
  }

  printSummary();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

function printSummary() {
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n--- Summary: ${ok} passed, ${bad} failed ---`);
  if (bad) {
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  • ${r.name}: ${r.detail}`);
    }
  }
}

main().catch((err) => {
  console.error(`${TAG} fatal:`, err);
  process.exit(1);
});
