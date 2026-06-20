/**
 * UniExamAI — Syllabus Drift Checker
 *
 * PURPOSE:
 * Universities revise syllabi every 1-3 years. This job periodically re-fetches
 * the OFFICIAL syllabus PDF for each university/branch/semester from their
 * website, compares it against what's stored in our knowledge_base.json,
 * and flags meaningful differences for manual review — BEFORE they ever
 * reach a student as a wrong answer.
 *
 * WHY MANUAL REVIEW, NOT AUTO-MERGE:
 * Auto-merging scraped content straight into the live knowledge base is how
 * you accidentally ship garbage (broken OCR, wrong page, outdated PDF) to
 * paying users. Every drift gets queued, never auto-applied.
 *
 * SCHEDULE: Run monthly via cron (not on every request — this is NOT in the
 * user-facing query path). Suggested: 1st of every month, 3 AM IST.
 */

const fs = require("fs");
const path = require("path");

const KB_PATH = path.join(__dirname, "../../data/processed/knowledge_base.json");
const PENDING_PATH = path.join(__dirname, "../../data/processed/pending_syllabus_updates.json");

// Official syllabus source URLs to monitor — extend this as we add universities
const SYLLABUS_SOURCES = [
  {
    university: "RGPV",
    branch: "CSE",
    checkUrl: "https://www.rgpv.ac.in/", // Navigate to Academics > Scheme & Syllabus
    notes: "RGPV publishes scheme PDFs under Academics section. URL structure changes — verify manually if fetch fails."
  },
  {
    university: "RGPV",
    branch: "EC",
    checkUrl: "https://www.rgpv.ac.in/",
    notes: "Same portal as CSE, different branch code in PDF filename."
  },
  {
    university: "DAVV",
    branch: "CSE",
    checkUrl: "https://ietdavv.edu.in/index.php/academics/syllabus",
    notes: "IET-DAVV syllabus page — has direct PDF links per year."
  },
  {
    university: "DAVV",
    branch: "ECE",
    checkUrl: "https://ietdavv.edu.in/index.php/academics/syllabus",
    notes: "Electronics & Telecommunication, not Instrumentation."
  }
];

/**
 * Simple text similarity scorer (Jaccard on word sets)
 * Production-grade replacement: use embedding cosine similarity via Pinecone
 */
function similarityScore(textA, textB) {
  const setA = new Set(textA.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const setB = new Set(textB.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;

  return union === 0 ? 0 : intersection / union;
}

/**
 * Extract probable topic/unit names from new text using simple heading heuristics
 * Looks for lines like "UNIT 1", "Unit-I:", numbered topic lists
 */
function extractTopics(text) {
  const lines = text.split("\n");
  const topics = [];
  const unitPattern = /^(unit[\s\-]*[ivx\d]+|module[\s\-]*\d+)[\s:.\-]+(.+)/i;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(unitPattern);
    if (match && match[2] && match[2].length > 3 && match[2].length < 200) {
      topics.push(match[2].trim());
    }
  }
  return topics;
}

/**
 * Compare freshly fetched syllabus text against stored knowledge base
 * for a given university + branch + semester + subject
 */
function checkDrift({ university, branch, semester, subject, newText }) {
  const raw = fs.readFileSync(KB_PATH, "utf8");
  const kb = JSON.parse(raw);

  const existingDoc = kb.documents.find(
    d =>
      d.university.toUpperCase() === university.toUpperCase() &&
      d.branch.toUpperCase() === branch.toUpperCase() &&
      String(d.semester) === String(semester) &&
      d.subject.toLowerCase().includes(subject.toLowerCase())
  );

  if (!existingDoc) {
    return {
      status: "NEW_SUBJECT",
      message: `No existing record for ${university} ${branch} Sem ${semester} — "${subject}". This is entirely new content.`,
      newTopics: extractTopics(newText),
      requiresReview: true
    };
  }

  const score = similarityScore(existingDoc.content, newText);
  const DRIFT_THRESHOLD = 0.70; // below 70% overlap = meaningful syllabus change

  if (score < DRIFT_THRESHOLD) {
    const newTopics = extractTopics(newText);
    return {
      status: "DRIFT_DETECTED",
      similarityScore: Math.round(score * 100) + "%",
      message: `Syllabus drift detected for ${university} ${branch} Sem ${semester} — "${subject}". Only ${Math.round(score * 100)}% content overlap with stored data.`,
      newTopics,
      oldDocId: existingDoc.id,
      requiresReview: true
    };
  }

  return {
    status: "STABLE",
    similarityScore: Math.round(score * 100) + "%",
    message: `No meaningful drift. ${Math.round(score * 100)}% match — syllabus is current.`,
    requiresReview: false
  };
}

/**
 * Queue a flagged change for manual review by Addy + dev team
 * Does NOT touch the live knowledge base — purely additive to a review queue
 */
function queueForReview(driftResult, metadata) {
  let pending = [];
  if (fs.existsSync(PENDING_PATH)) {
    pending = JSON.parse(fs.readFileSync(PENDING_PATH, "utf8"));
  }

  const entry = {
    id: pending.length + 1,
    flaggedAt: new Date().toISOString(),
    ...metadata,
    ...driftResult,
    reviewed: false
  };

  pending.push(entry);
  fs.writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2));

  console.log(`🚩 [SYLLABUS DRIFT QUEUED] ${entry.university} | ${entry.branch} | Sem ${entry.semester} | ${entry.subject}`);
  console.log(`   Status: ${entry.status} | Similarity: ${entry.similarityScore || "N/A"}`);

  return entry;
}

/**
 * Send notification to admin(s) when drift is queued
 * Stub — wire to Resend email or a Slack/Discord webhook in production
 */
async function notifyAdmins(entry) {
  const message = `
🚩 SYLLABUS UPDATE NEEDED — UniExamAI

University: ${entry.university}
Branch: ${entry.branch}
Semester: ${entry.semester}
Subject: ${entry.subject}
Status: ${entry.status}
${entry.similarityScore ? `Similarity: ${entry.similarityScore}` : ""}

${entry.newTopics?.length ? `New/changed topics detected:\n${entry.newTopics.map(t => `  • ${t}`).join("\n")}` : ""}

Action needed: Review pending_syllabus_updates.json entry #${entry.id} and manually
verify before merging into the live knowledge base.
`;

  console.log(message);

  // TODO (production): replace console.log with real notification
  // await sendEmail({ to: ["addy@uniexai.in", "dev@uniexai.in"], subject: "Syllabus drift detected", body: message });
  // OR send to a Slack/Discord webhook for instant visibility

  return true;
}

/**
 * Main entry point — run monthly via cron job
 * Note: Actual PDF fetching from university sites needs Puppeteer or similar
 * for sites with redirects/JS. This function shows the orchestration logic;
 * the fetch step itself should reuse the lazy-cache scraper architecture
 * already built for PYQs.
 */
async function runDriftCheck() {
  console.log("🔍 Starting monthly syllabus drift check...");

  for (const source of SYLLABUS_SOURCES) {
    console.log(`Checking ${source.university} - ${source.branch}...`);

    // PLACEHOLDER: In production, this fetches + OCRs the live PDF
    // const newText = await fetchAndExtractSyllabus(source.checkUrl);
    // For now this is a manual trigger point — Addy runs this after
    // re-downloading official PDFs once a semester and feeding them in.

    console.log(`  ⏭️  Skipped — awaiting manual PDF re-check for this source.`);
    console.log(`  Notes: ${source.notes}`);
  }

  console.log("✅ Drift check pass complete. Run checkDrift() manually with new PDF text to test.");
}

module.exports = {
  checkDrift,
  queueForReview,
  notifyAdmins,
  runDriftCheck,
  similarityScore,
  extractTopics
};
