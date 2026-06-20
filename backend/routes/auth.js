/**
 * UniExamAI — Auth Routes
 * Real password hashing (bcrypt) + JWT issuance + login brute-force protection.
 *
 * NOTE ON WHAT'S REAL VS STUBBED:
 * - Password hashing, comparison, JWT signing: REAL, production-correct logic.
 * - Database reads/writes (findUserByEmail, createUser, etc.): STUBBED.
 *   Wire these to Supabase/PostgreSQL queries before going live — see TODOs.
 * Without that DB wiring, registering/logging in won't actually persist
 * users between server restarts. This file is the security-correct
 * skeleton; the missing piece is purely the storage layer.
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = "7d";

/* ── Login brute-force protection ─────────────────────
   Separate, stricter limiter than the general query rate limit.
   Keyed by email+IP so an attacker can't just rotate one or the other. */
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginThrottle(key) {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record) return { allowed: true };

  if (now - record.firstAttempt > LOCKOUT_MS) {
    loginAttempts.delete(key);
    return { allowed: true };
  }

  if (record.count >= MAX_ATTEMPTS) {
    const retryInMs = LOCKOUT_MS - (now - record.firstAttempt);
    return { allowed: false, retryInSeconds: Math.ceil(retryInMs / 1000) };
  }

  return { allowed: true };
}

function recordFailedLogin(key) {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || now - record.firstAttempt > LOCKOUT_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
  } else {
    record.count += 1;
  }
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

/* ── Input validation ──────────────────────────────── */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8;
}

/* ── DB stubs — replace with real Supabase/PostgreSQL queries ──── */
async function findUserByEmail(email) {
  // SELECT * FROM users WHERE email = $1
  // TODO: wire to real database
  return null; // stub — always "not found" until DB is connected
}

async function createUser({ email, passwordHash, name }) {
  // INSERT INTO users (email, password_hash, name, plan, created_at)
  // VALUES ($1, $2, $3, 'free', NOW()) RETURNING id, email, plan
  // TODO: wire to real database
  return { id: "stub-id", email, plan: "free", name };
}

/* ── Token signing ─────────────────────────────────── */
function signToken(user, deviceId) {
  return jwt.sign(
    { userId: user.id, email: user.email, plan: user.plan, deviceId },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * POST /api/auth/register
 * Body: { email, password, name, deviceId }
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, deviceId } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    if (!deviceId) {
      return res.status(400).json({ error: "Missing device fingerprint." });
    }

    const existing = await findUserByEmail(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await createUser({ email: email.toLowerCase(), passwordHash, name });

    const token = signToken(user, deviceId);

    return res.status(201).json({
      success: true,
      token,
      user: { id: user.id, email: user.email, plan: user.plan, name: user.name }
    });
  } catch (err) {
    console.error("[REGISTER ERROR]", err.message);
    return res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password, deviceId }
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;
    const throttleKey = `${email}:${req.ip}`;

    const throttle = checkLoginThrottle(throttleKey);
    if (!throttle.allowed) {
      return res.status(429).json({
        error: `Too many failed login attempts. Try again in ${Math.ceil(throttle.retryInSeconds / 60)} minute(s).`
      });
    }

    if (!email || !password || !deviceId) {
      return res.status(400).json({ error: "Email, password, and device info are required." });
    }

    const user = await findUserByEmail(email.toLowerCase());

    // IMPORTANT: even if user doesn't exist, we still run a dummy bcrypt.compare
    // against a fixed hash. This prevents timing attacks that could let an
    // attacker tell "user doesn't exist" apart from "wrong password" by
    // measuring response time (bcrypt.compare is intentionally slow).
    const hashToCheck = user?.passwordHash || "$2a$12$0000000000000000000000000000000000000000000000000";
    const passwordMatches = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordMatches) {
      recordFailedLogin(throttleKey);
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    clearLoginAttempts(throttleKey);
    const token = signToken(user, deviceId);

    return res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, plan: user.plan, name: user.name }
    });
  } catch (err) {
    console.error("[LOGIN ERROR]", err.message);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

module.exports = router;
