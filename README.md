# UniExamAI 🎓

**AI-powered exam preparation for Indian university students.**

UniExamAI gives engineering students syllabus-grounded, source-cited answers instead of generic AI responses — built specifically around RGPV (Bhopal) and DAVV (Indore) curricula, with previous-year question access and AI-generated practice questions.

---

## Why This Exists

Generic AI tools don't know what's actually in your university's syllabus. UniExamAI indexes real, official syllabus documents and answers strictly from that content — every response cites its exact source (university, branch, semester, subject), and the system is designed to say "not in your syllabus" rather than hallucinate an answer.

---

## Features

- **Syllabus-grounded AI** — answers sourced only from indexed official course material
- **Previous year questions** — organized by subject, unit, and year
- **AI-generated practice questions** — unlimited, scaled to 2/5/10-mark exam formats
- **Smart deep-dive links** — auto-routes coding topics to GeeksforGeeks, math topics to WolframAlpha
- **Built for the Indian student budget** — free tier + ₹199/month premium

---

## Tech Stack

| Layer | Tool |
|---|---|
| Backend | Node.js + Express |
| Frontend | HTML / CSS / vanilla JS |
| AI | Gemini API |
| Auth | JWT + bcrypt |
| Payments | Razorpay |
| Hosting | Render (backend) + GitHub Pages (frontend) |

---

## Project Structure

```
uniexamai/
├── backend/
│   ├── server.js
│   ├── routes/        → auth, query, payment endpoints
│   ├── middleware/     → JWT verification, rate limiting
│   ├── services/       → RAG search + AI integration
│   └── jobs/           → syllabus update monitoring
├── frontend/            → landing page, app, login
└── data/processed/      → indexed syllabus knowledge base
```

---

## Local Setup

```bash
git clone https://github.com/YOUR_USERNAME/uniexamai.git
cd uniexamai
npm install
cp .env.example .env   # fill in your own API keys
npm run dev
```

Server runs on `http://localhost:4000`. Check it's alive:
```bash
curl http://localhost:4000/health
```

---

## Coverage (V1)

| University | Branches | Semesters |
|---|---|---|
| RGPV  | CSE, ECE | 1–8 |
| DAVV  | CSE, ECE, IT | 1–8 |

More universities and branches are added as the dataset grows.

---

## License

Proprietary — all rights reserved. This codebase is shared publicly for transparency and learning purposes; commercial use or redistribution requires permission.

---

## Contact

Built by Addy — Servionix.
