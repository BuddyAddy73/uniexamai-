/**
 * UniExamAI — Main Server
 * Express.js backend entry point
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const queryRoutes = require("./routes/query");
const paymentRoutes = require("./routes/payment");
const authRoutes = require("./routes/auth");
const { loadKnowledgeBase } = require("./services/ragService");

const app = express();
const PORT = process.env.PORT || 4000;

// Render/most cloud hosts sit behind a reverse proxy — without this,
// req.ip always returns the proxy's IP, breaking login rate limiting.
app.set("trust proxy", 1);

// ── Security ──────────────────────────────────────────
app.use(helmet());
app.use(cors({
  // ⚠️ Set FRONTEND_URL to your real deployed domain in production.
  // The localhost fallback only works for local development.
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

// ── Body parsing ──────────────────────────────────────
// Raw body for Razorpay webhook signature verification
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));

// ── Root — friendly response so the bare domain doesn't look broken ──
app.get("/", (req, res) => {
  res.json({
    service: "UniExamAI API",
    status: "running",
    note: "This is a backend API, not a webpage. Try /health for a status check."
  });
});

// ── Health check ──────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "UniExamAI API", timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api", queryRoutes);
app.use("/api/payment", paymentRoutes);

// ── 404 handler ───────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Global error handler ──────────────────────────────
app.use((err, req, res, next) => {
  console.error("[SERVER ERROR]", err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 UniExamAI API running on port ${PORT}`);
  // Pre-load knowledge base into memory at startup
  loadKnowledgeBase();

  // Diagnostic only — confirms the key is actually present without ever
  // logging the real value. Remove this once the Gemini issue is confirmed fixed.
  const key = process.env.GEMINI_API_KEY;
  console.log(`🔑 GEMINI_API_KEY present: ${!!key} | length: ${key?.length || 0}`);
});

module.exports = app;
