/**
 * UniExamAI — Database Service (Supabase)
 *
 * This file replaces every stub function that previously lived inline in
 * auth-routes.js and middleware/auth.js. Once this is wired in, accounts
 * actually persist — no more re-registering after every browser restart.
 *
 * SECURITY NOTE: This uses the Supabase *service role* key, which bypasses
 * Row Level Security by design. That's correct here because only this
 * backend talks to Supabase — never the frontend directly. This key must
 * NEVER be sent to the browser or used in any frontend code.
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ── User functions ──────────────────────────────────── */

async function findUserByEmail(email) {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, password_hash, name, plan")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("[DB ERROR] findUserByEmail:", error.message);
    throw new Error("Database error while looking up user.");
  }

  if (!data) return null;

  // normalize to the shape auth-routes.js expects (passwordHash, camelCase)
  return {
    id: data.id,
    email: data.email,
    passwordHash: data.password_hash,
    name: data.name,
    plan: data.plan
  };
}

async function createUser({ email, passwordHash, name }) {
  const { data, error } = await supabase
    .from("users")
    .insert({ email, password_hash: passwordHash, name: name || null, plan: "free" })
    .select("id, email, name, plan")
    .single();

  if (error) {
    console.error("[DB ERROR] createUser:", error.message);
    throw new Error("Database error while creating account.");
  }

  return data;
}

/* ── Device functions (2-device limit enforcement) ──── */

async function getActiveDevices(userId) {
  const { data, error } = await supabase
    .from("user_devices")
    .select("id, device_id, registered_at, last_seen")
    .eq("user_id", userId)
    .order("last_seen", { ascending: false });

  if (error) {
    console.error("[DB ERROR] getActiveDevices:", error.message);
    return []; // fail open rather than locking someone out on a DB hiccup
  }

  return data.map(d => ({ deviceId: d.device_id, lastSeen: d.last_seen }));
}

async function registerDevice(userId, deviceId) {
  const { error } = await supabase
    .from("user_devices")
    .upsert(
      { user_id: userId, device_id: deviceId, last_seen: new Date().toISOString() },
      { onConflict: "user_id,device_id" }
    );

  if (error) {
    console.error("[DB ERROR] registerDevice:", error.message);
  }
}

async function removeOldestDevice(userId) {
  const devices = await getActiveDevices(userId);
  if (devices.length === 0) return;

  const oldest = devices[devices.length - 1]; // last_seen ascending at the end
  const { error } = await supabase
    .from("user_devices")
    .delete()
    .eq("user_id", userId)
    .eq("device_id", oldest.deviceId);

  if (error) {
    console.error("[DB ERROR] removeOldestDevice:", error.message);
  }
}

/* ── Syllabus issue reports ──────────────────────────── */

async function logSyllabusReport({ userId, university, branch, semester, query, note }) {
  const { error } = await supabase
    .from("syllabus_reports")
    .insert({
      user_id: userId || null,
      university: university || null,
      branch: branch || null,
      semester: semester || null,
      query,
      note: note || null
    });

  if (error) {
    console.error("[DB ERROR] logSyllabusReport:", error.message);
    throw new Error("Could not save your report. Please try again.");
  }
}
module.exports = {
  findUserByEmail,
  createUser,
  getActiveDevices,
  registerDevice,
  removeOldestDevice,
  logSyllabusReport
};
