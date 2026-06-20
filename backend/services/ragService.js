/**
 * UniExamAI — RAG Service
 * Handles all AI query processing with strict syllabus-only context
 * Version: 1.0 | Stack: Node.js
 */

const fs = require("fs");
const path = require("path");

// Load knowledge base once at startup — stays in memory
const KB_PATH = path.join(__dirname, "../../data/processed/knowledge_base.json");
let knowledgeBase = null;

function loadKnowledgeBase() {
  if (!knowledgeBase) {
    const raw = fs.readFileSync(KB_PATH, "utf8");
    knowledgeBase = JSON.parse(raw);
    console.log(`✅ Knowledge base loaded: ${knowledgeBase.metadata.total_documents} documents`);
  }
  return knowledgeBase;
}

/**
 * Keyword search over knowledge base
 * Production: replace with vector embeddings via Pinecone
 */
function searchDocuments({ query, university, branch, semester, topK = 4 }) {
  const kb = loadKnowledgeBase();
  const queryWords = new Set(query.toLowerCase().split(/\s+/));

  const scores = [];

  for (const doc of kb.documents) {
    // Metadata filters
    if (university && doc.university.toUpperCase() !== university.toUpperCase()) continue;
    if (branch && doc.branch.toUpperCase() !== branch.toUpperCase()) continue;
    if (semester && String(doc.semester) !== String(semester)) continue;

    // Score: keyword overlap + subject title boost
    const contentWords = new Set(doc.content.toLowerCase().split(/\s+/));
    const subjectWords = new Set(doc.subject.toLowerCase().split(/\s+/));

    const contentOverlap = [...queryWords].filter(w => contentWords.has(w)).length;
    const subjectBoost = [...queryWords].filter(w => subjectWords.has(w)).length * 3;
    const score = contentOverlap + subjectBoost;

    if (score > 0) scores.push({ score, doc });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK).map(s => s.doc);
}

/**
 * Build context string from retrieved documents for AI prompt
 */
function buildContext(docs) {
  return docs
    .map(
      (doc, i) =>
        `[Source ${i + 1}: ${doc.university} | ${doc.branch} | Sem ${doc.semester} | ${doc.subject}]\n${doc.content.slice(0, 1500)}`
    )
    .join("\n\n---\n\n");
}

/**
 * Detect if a subject/query is CS/coding-related vs pure-math related
 * Used to route to GeeksforGeeks vs WolframAlpha
 */
const CODING_SUBJECTS = [
  "data structure", "algorithm", "programming", "oop", "dbms", "database",
  "operating system", "computer network", "software engineering", "compiler",
  "java", "python", "c++", "sql", "web technology", "machine learning"
];

const MATH_SUBJECTS = [
  "mathematics", "calculus", "algebra", "differential", "integral",
  "probability", "statistics", "matrix", "vector", "numerical method"
];

function detectDomain(query, subject = "") {
  const text = `${query} ${subject}`.toLowerCase();
  const isCoding = CODING_SUBJECTS.some(s => text.includes(s));
  const isMath = MATH_SUBJECTS.some(s => text.includes(s));
  return { isCoding, isMath };
}

/**
 * Build a GeeksforGeeks search deep-link for a coding/CS topic
 */
function buildGFGLink(topic) {
  const cleaned = topic.trim().replace(/\s+/g, "-").toLowerCase();
  return `https://www.geeksforgeeks.org/?s=${encodeURIComponent(topic.trim())}`;
}

/**
 * Build a WolframAlpha deep-link for a math/numerical topic
 */
function buildWolframLink(topic) {
  return `https://www.wolframalpha.com/input?i=${encodeURIComponent(topic.trim())}`;
}

/**
 * Build strict RAG system prompt
 * Forces AI to answer ONLY from provided syllabus context — no hallucination
 */
function buildSystemPrompt(context, domainHint = {}) {
  return `You are UniExamAI, a university exam preparation assistant for Indian engineering students.

STRICT RULES — NEVER BREAK THESE:
1. Answer ONLY using the syllabus context provided below. Never use general knowledge.
2. If the answer is not in the context, respond: "This topic isn't covered in your syllabus data. Try rephrasing or check your subject selection."
3. Be direct and concise. No preamble. No "Great question!" No filler.
4. Always cite your source at the end: "📄 Source: [University] | [Branch] | Sem [X] | [Subject]"
5. ROUTING RULE for deep-dive links — choose ONE based on topic type:
   a. If the topic is a CODING/CS concept (data structures, algorithms, OOP, DBMS, OS, networks, programming languages) → append: "💻 Deep dive on GeeksforGeeks: https://www.geeksforgeeks.org/?s=[encoded_topic]"
   b. If the topic is MATHEMATICAL/numerical (calculus, algebra, probability, matrices, equations) → append: "🔗 Verify on WolframAlpha: https://www.wolframalpha.com/input?i=[encoded_topic]"
   c. Never show both links in the same answer — pick whichever is more relevant.
6. Structure answers clearly: definition → explanation → example if applicable.
7. If multiple sources apply, combine them and cite all.

SYLLABUS CONTEXT:
${context}`;
}

/**
 * Generate practice questions for a topic from syllabus
 * Used for DAVV (no PYQs) and as premium feature for all users
 */
function buildPracticePrompt(context, difficulty = "medium") {
  const difficultyMap = {
    easy: "2-mark short answer",
    medium: "5-mark medium answer",
    hard: "10-mark long answer or numerical"
  };

  return `You are UniExamAI generating exam practice questions.

Generate 5 ${difficultyMap[difficulty]} questions based ONLY on the syllabus content below.
Format each as:
Q[n]. [Question]
Expected answer length: [X] marks
Unit/Topic: [topic name]

Do NOT generate questions on topics not present in the syllabus context.
Do NOT provide answers — only questions.

SYLLABUS CONTEXT:
${context}`;
}

/**
 * Main query handler
 */
async function processQuery({ query, university, branch, semester, mode = "explain" }) {
  // Step 1: Retrieve relevant docs
  const docs = searchDocuments({ query, university, branch, semester });

  if (docs.length === 0) {
    return {
      success: false,
      answer: "No syllabus data found for your selection. Please check your university, branch, and semester settings.",
      sources: [],
      docsFound: 0
    };
  }

  // Step 2: Build context
  const context = buildContext(docs);

  // Step 2b: Pre-compute domain hint (coding vs math) — used both to steer
  // the prompt AND as a deterministic fallback below, since LLMs don't
  // always follow formatting instructions 100% of the time.
  const domainHint = detectDomain(query, docs[0]?.subject || "");

  // Step 3: Build appropriate prompt
  const systemPrompt =
    mode === "practice"
      ? buildPracticePrompt(context)
      : buildSystemPrompt(context, domainHint);

  // Step 4: Call AI API
  // ⚠️ Currently hardcoded to Claude (api.anthropic.com). To switch to
  // Gemini (e.g. reusing your CodeQuest API key) or OpenRouter, only this
  // fetch call needs to change — request/response shape differs per
  // provider, but everything else in this file (search, prompts, caching)
  // stays identical.
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: query }]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Claude API error: ${data.error?.message || "Unknown error"}`);
  }

  const answer = data.content?.[0]?.text || "No response generated.";

  // Step 5b: Deterministic safety net — if the model didn't include a
  // deep-dive link despite the system prompt instruction, add one ourselves
  // based on the pre-computed domain hint. This makes the feature reliable
  // instead of depending entirely on LLM instruction-following.
  let finalAnswer = answer;
  const alreadyHasLink = /wolframalpha\.com|geeksforgeeks\.org/i.test(answer);

  if (!alreadyHasLink && mode === "explain") {
    if (domainHint.isCoding) {
      finalAnswer += `\n\n💻 Deep dive on GeeksforGeeks: ${buildGFGLink(query)}`;
    } else if (domainHint.isMath) {
      finalAnswer += `\n\n🔗 Verify on WolframAlpha: ${buildWolframLink(query)}`;
    }
  }

  // Step 6: Return structured response
  return {
    success: true,
    answer: finalAnswer,
    sources: docs.map(d => ({
      university: d.university,
      branch: d.branch,
      semester: d.semester,
      subject: d.subject
    })),
    docsFound: docs.length,
    mode
  };
}

module.exports = { processQuery, searchDocuments, loadKnowledgeBase, detectDomain, buildGFGLink, buildWolframLink };
