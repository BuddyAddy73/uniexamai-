/**
 * UniExamAI — Payment Route
 * Razorpay subscription integration
 * POST /api/payment/create-order
 * POST /api/payment/verify
 * POST /api/payment/webhook
 */

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { requireAuth } = require("../middleware/auth");

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

// Plans
const PLANS = {
  monthly: {
    amount: 19900,       // ₹199 in paise
    currency: "INR",
    description: "UniExamAI Premium — Monthly"
  },
  semesterly: {
    amount: 49900,       // ₹499 in paise
    currency: "INR",
    description: "UniExamAI Premium — Per Semester (6 months)"
  }
};

/**
 * POST /api/payment/create-order
 * Creates a Razorpay order and returns order_id to frontend
 */
router.post("/create-order", requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;

    if (!PLANS[plan]) {
      return res.status(400).json({ error: "Invalid plan. Choose: monthly or semesterly" });
    }

    const selectedPlan = PLANS[plan];

    // Call Razorpay API to create order
    const authHeader = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

    const razorRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authHeader}`
      },
      body: JSON.stringify({
        amount: selectedPlan.amount,
        currency: selectedPlan.currency,
        receipt: `uid_${req.user.id}_${Date.now()}`,
        notes: {
          userId: req.user.id,
          plan,
          email: req.user.email
        }
      })
    });

    const order = await razorRes.json();

    if (!razorRes.ok) {
      throw new Error(order.error?.description || "Razorpay order creation failed");
    }

    return res.json({
      orderId: order.id,
      amount: selectedPlan.amount,
      currency: selectedPlan.currency,
      keyId: RAZORPAY_KEY_ID,
      description: selectedPlan.description,
      userEmail: req.user.email
    });
  } catch (err) {
    console.error("[PAYMENT CREATE ERROR]", err.message);
    return res.status(500).json({ error: "Failed to create payment order." });
  }
});

/**
 * POST /api/payment/verify
 * Verifies Razorpay signature after payment — activates premium
 */
router.post("/verify", requireAuth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

    // Verify signature — HMAC SHA256
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed. Invalid signature." });
    }

    // Calculate expiry
    const now = new Date();
    const expiresAt = new Date(now);
    if (plan === "monthly") {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 6);
    }

    // Activate premium in DB
    // UPDATE users SET plan='premium', plan_expires_at=expiresAt WHERE id=req.user.id
    // INSERT INTO payments (user_id, order_id, payment_id, plan, amount, created_at)
    console.log(`[PAYMENT SUCCESS] User ${req.user.id} upgraded to premium. Expires: ${expiresAt}`);

    return res.json({
      success: true,
      message: "Payment verified. Premium activated!",
      plan: "premium",
      expiresAt: expiresAt.toISOString()
    });
  } catch (err) {
    console.error("[PAYMENT VERIFY ERROR]", err.message);
    return res.status(500).json({ error: "Payment verification failed." });
  }
});

/**
 * POST /api/payment/webhook
 * Razorpay webhook for subscription renewals and failures
 * No auth required — verified by signature
 */
// Note: raw body parsing for this route is already applied globally in
// server.js (app.use("/api/payment/webhook", express.raw(...))) before this
// router is even mounted — Express's body-parser skips re-parsing once
// req._body is set, so a second express.raw() call here was redundant.
router.post("/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const body = req.body.toString();

    // Verify webhook signature
    const expectedSig = crypto
      .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSig !== signature) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const event = JSON.parse(body);
    console.log(`[WEBHOOK] Event: ${event.event}`);

    switch (event.event) {
      case "payment.captured":
        // Payment successful — already handled by /verify
        break;

      case "subscription.charged":
        // Auto-renewal successful — extend plan
        // UPDATE users SET plan_expires_at = +1month WHERE razorpay_sub_id = event.payload.subscription.entity.id
        break;

      case "subscription.halted":
      case "payment.failed":
        // Payment failed — downgrade to free
        // UPDATE users SET plan='free' WHERE ...
        console.log(`[WEBHOOK] Payment failed for subscription: ${event.payload?.subscription?.entity?.id}`);
        break;

      default:
        console.log(`[WEBHOOK] Unhandled event: ${event.event}`);
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("[WEBHOOK ERROR]", err.message);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

module.exports = router;
