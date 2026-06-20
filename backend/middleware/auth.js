/**
 * UniExamAI — Auth Middleware
 * JWT verification + device fingerprint enforcement (2-device limit)
 */

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const MAX_DEVICES = 2;

/**
 * Verify JWT token from Authorization header
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      plan: decoded.plan,        // "free" | "premium"
      deviceId: decoded.deviceId // fingerprint of this device
    };

    // Device limit check — max 2 devices per account
    const activeDevices = await getActiveDevices(decoded.userId);
    const isKnownDevice = activeDevices.some(d => d.deviceId === decoded.deviceId);

    if (!isKnownDevice) {
      if (activeDevices.length >= MAX_DEVICES) {
        // Kick oldest device
        await removeOldestDevice(decoded.userId);
      }
      await registerDevice(decoded.userId, decoded.deviceId);
    }

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }
    return res.status(401).json({ error: "Invalid token." });
  }
}

/**
 * Check if user has active paid subscription
 */
async function requireActiveSubscription(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required." });
  }

  if (req.user.plan !== "premium") {
    return res.status(403).json({
      error: "This feature requires a premium subscription.",
      upgradeUrl: "/pricing"
    });
  }

  next();
}

// --- Device Management Helpers ---
// In production these hit PostgreSQL via Supabase
// Stubbed here for structure clarity

async function getActiveDevices(userId) {
  // SELECT * FROM user_devices WHERE user_id = userId ORDER BY last_seen DESC
  return []; // stub
}

async function registerDevice(userId, deviceId) {
  // INSERT INTO user_devices (user_id, device_id, registered_at, last_seen)
  // ON CONFLICT UPDATE last_seen
  return true; // stub
}

async function removeOldestDevice(userId) {
  // DELETE FROM user_devices WHERE id = (
  //   SELECT id FROM user_devices WHERE user_id = userId ORDER BY last_seen ASC LIMIT 1
  // )
  return true; // stub
}

module.exports = { requireAuth, requireActiveSubscription };
