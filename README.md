# UniExamAI 🎓
### University Exam Preparation — Powered by AI

AI-driven exam prep for Indian university students. Syllabus-grounded answers, PYQ access, and AI-generated practice questions — built for RGPV and DAVV engineering students.

---

## 📁 Repo Structure

```
uniexamai/
├── .gitignore                      ← keeps secrets out of git, see below
├── .env.example                    ← safe to commit — placeholders only
├── package.json
│
├── backend/
│   ├── server.js                   ← Express entry point
│   ├── routes/
│   │   ├── auth.js                 ← register/login, bcrypt + JWT issuance
│   │   ├── query.js                ← /api/query, /api/practice, /api/subjects
│   │   └── payment.js              ← Razorpay order + verify + webhook
│   ├── middleware/
│   │   ├── auth.js                 ← JWT verification + device-limit check
│   │   └── rateLimit.js            ← 10/day free, 100/day premium
│   ├── services/
│   │   └── ragService.js           ← RAG search + Claude API + prompt logic
│   └── jobs/
│       └── syllabusDiffChecker.js  ← monthly syllabus drift detection
│
├── frontend/
│   ├── landing.html                ← marketing/landing page
│   ├── app.html                    ← the actual product
│   └── login.html                  ← auth page
│
└── data/
    └── processed/
        └── knowledge_base.json     ← 144 indexed syllabus documents
```

> ⚠️ Note: `backend/routes/auth.js` (login/register endpoints) and
> `backend/middleware/auth.js` (token verification) are two **different**
> files that happen to share a filename in different folders. This is
> intentional and standard — Node resolves them by full path, not just
> filename. Don't merge them.

---

## 🔒 Security — Read Before Making This Repo Public

**What's safe to make public:** Every single file currently in this repo.
There are no real API keys, passwords, or credentials anywhere in the
code — confirmed by scanning before packaging this. `.env.example`
contains only placeholder text like `sk-ant-xxxxxxxxxxxxxxxxxxxx`, not a
real key.

**What keeps it safe going forward:**

1. **`.env` is gitignored.** Your real secrets — `JWT_SECRET`,
   `ANTHROPIC_API_KEY`, `RAZORPAY_KEY_SECRET`, database URLs — live only
   in a local `.env` file (copy `.env.example` → `.env` and fill in real
   values) and in Render's environment variable settings. Never in code,
   never committed.
2. **Never `git add .env`.** The `.gitignore` blocks this automatically,
   but if you ever manually force-add it, that secret is in git history
   forever — even after deleting the file in a later commit. If this
   ever happens: rotate every exposed key immediately (generate new ones,
   revoke old ones) rather than trying to scrub git history.
3. **Enable GitHub secret scanning.** Free on both public and private
   repos. Settings → Code security → Secret scanning → enable push
   protection. GitHub will block a commit on the spot if it detects an
   API key pattern.
4. **Razorpay's `KEY_ID` is meant to be public** — it's sent to the
   frontend checkout widget by design. Only `KEY_SECRET` and
   `WEBHOOK_SECRET` are sensitive. The code already keeps this separation
   correctly.
5. **`data/knowledge_base.json` is not sensitive** — it's processed
   syllabus content, not credentials. Safe in a public repo. If you'd
   rather keep your processed dataset private while open-sourcing the
   code, move this one folder to a private repo or cloud bucket instead
   — that's a business decision, not a security requirement.

---

## ✅ Current Status

**Backend:** Structurally complete. Auth (bcrypt + JWT + brute-force
lockout), RAG query engine, rate limiting, Razorpay integration all
real and tested. Database layer (Supabase) is stubbed — see TODOs in
`backend/routes/auth.js`.

**Frontend:** Fully interactive in demo mode. `CONFIG.DEMO_MODE = true`
in `app.html` and `login.html` — flip to `false` once the backend is
deployed and `CONFIG.API_BASE_URL` points to it.

**Data:** 144 syllabus documents indexed — 110 single-subject, 26
full-scheme documents, 8 flagged for manual subject-name review.

---

## 🚀 Local Development

```bash
git clone <your-repo-url>
cd uniexamai
npm install
cp .env.example .env
# Fill in real values in .env
npm run dev
```

Server runs on `http://localhost:4000` — confirm with:
```bash
curl http://localhost:4000/health
```

---

## Tech Stack

| Layer | Tool | Cost |
|---|---|---|
| Backend hosting | Render.com | Free tier |
| Frontend hosting | GitHub Pages | Free |
| Database | Supabase (PostgreSQL) | Free tier |
| Cache / rate limit | Upstash (Redis) | Free tier |
| AI | Claude API | Pay per query |
| Payments | Razorpay | % per transaction |

---

*Built by Addy — Founder, UniExamAI*
