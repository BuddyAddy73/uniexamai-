/**
 * UniExamAI — Rate Limit Middleware
 * Free: 10 queries/day | Premium: 100 queries/day
 * Uses in-memory store for dev — Redis in production
 */

const queryStore = new Map(); // userId -> { count, resetAt }

const LIMITS = {
  free: 10,
  premium: 100
};

async function queryRateLimit(req, res, next) {
  // Admin accounts skip rate limiting entirely — for live testing.
  if (req.user.isAdmin) {
    res.setHeader("X-RateLimit-Limit", "unlimited");
    res.setHeader("X-RateLimit-Remaining", "unlimited");
    return next();
  }

  const userId = req.user.id;
  const plan = req.user.plan;
  const limit = LIMITS[plan] || LIMITS.free;

  const now = Date.now();
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  const resetAt = midnight.getTime();

  let record = queryStore.get(userId);

  // Reset if day has passed
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt };
  }

  if (record.count >= limit) {
    return res.status(429).json({
      error: `Daily query limit reached (${limit} queries/day on ${plan} plan).`,
      resetsAt: new Date(record.resetAt).toISOString(),
      upgradeUrl: plan === "free" ? "/pricing" : null
    });
  }

  record.count += 1;
  queryStore.set(userId, record);

  // Attach usage info to response headers
  res.setHeader("X-RateLimit-Limit", limit);
  res.setHeader("X-RateLimit-Remaining", limit - record.count);
  res.setHeader("X-RateLimit-Reset", record.resetAt);

  next();
}

module.exports = { queryRateLimit };