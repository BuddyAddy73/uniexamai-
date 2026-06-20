/**
 * UniExamAI — Query Route
 * POST /api/query — Main student query endpoint
 * POST /api/practice — Generate practice questions
 */

const express = require("express");
const router = express.Router();
const { processQuery } = require("../services/ragService");
const { requireAuth, requireActiveSubscription } = require("../middleware/auth");
const { queryRateLimit } = require("../middleware/rateLimit");

/**
 * POST /api/query
 * Main AI explanation endpoint
 * Body: { query, university, branch, semester }
 */
router.post("/query", requireAuth, queryRateLimit, async (req, res) => {
  try {
    const { query, university, branch, semester } = req.body;

    // Validate required fields
    if (!query || !university || !branch || !semester) {
      return res.status(400).json({
        error: "Missing required fields: query, university, branch, semester"
      });
    }

    // Sanitize inputs
    const sanitized = {
      query: query.trim().slice(0, 500), // Max 500 chars per query
      university: university.trim().toUpperCase(),
      branch: branch.trim().toUpperCase(),
      semester: String(semester).trim(),
      mode: "explain"
    };

    const result = await processQuery(sanitized);

    // Log query for analytics (no PII stored)
    console.log(`[QUERY] ${sanitized.university}|${sanitized.branch}|Sem${sanitized.semester} — ${sanitized.query.slice(0, 50)}`);

    return res.json(result);
  } catch (err) {
    console.error("[QUERY ERROR]", err.message);
    return res.status(500).json({ error: "Query processing failed. Please try again." });
  }
});

/**
 * POST /api/practice
 * Generate practice questions — Premium only
 * Body: { topic, university, branch, semester, difficulty }
 */
router.post("/practice", requireAuth, requireActiveSubscription, queryRateLimit, async (req, res) => {
  try {
    const { topic, university, branch, semester, difficulty = "medium" } = req.body;

    if (!topic || !university || !branch || !semester) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const validDifficulties = ["easy", "medium", "hard"];
    if (!validDifficulties.includes(difficulty)) {
      return res.status(400).json({ error: "Invalid difficulty. Use: easy, medium, hard" });
    }

    const result = await processQuery({
      query: topic.trim().slice(0, 300),
      university: university.trim().toUpperCase(),
      branch: branch.trim().toUpperCase(),
      semester: String(semester).trim(),
      mode: "practice",
      difficulty
    });

    return res.json(result);
  } catch (err) {
    console.error("[PRACTICE ERROR]", err.message);
    return res.status(500).json({ error: "Practice question generation failed." });
  }
});

/**
 * GET /api/subjects
 * Get available subjects for a university/branch/semester
 * Used to populate dropdowns in frontend
 */
router.get("/subjects", requireAuth, async (req, res) => {
  try {
    const { university, branch, semester } = req.query;
    const { searchDocuments } = require("../services/ragService");

    const docs = searchDocuments({
      query: "syllabus",
      university,
      branch,
      semester,
      topK: 20
    });

    const subjects = [...new Set(docs.map(d => d.subject))];
    return res.json({ subjects, count: subjects.length });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch subjects." });
  }
});

module.exports = router;
