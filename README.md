# Kuntur — cross-border finance agent for international students

**2026 Shenzhen International FinTechathon · International Track · Topic C (Cross-border & Student Finance)**
Theme: *AI as a Financial Participant*.

Kuntur is an AI agent that completes a real financial task end to end: it reads what a student owes abroad, compares transfer providers on total cost (FX markup + fees), refuses unlicensed providers and manipulated invoices, prepares the payment and executes it under a permission tier the student controls. Everything runs in a sandbox with simulated money and is recorded in a tamper-evident audit log.

- Live demo: https://YOUR-PROJECT.vercel.app
- Documentation: https://YOUR-USER.github.io/kuntur/
- Demo video: YOUR-VIDEO-LINK

## Features

- **Agent with tools**: tool-use loop on any OpenAI-compatible model (Groq, Gemini, OpenRouter) or Claude, with a deterministic planner when no key is set.
- **Total-cost comparison**: mid-market cost, hidden FX markup, fees, speed, licence.
- **Policy engine outside the model**: 9 checks; deny, human approval or auto-execute.
- **Permission tiers 0–3**: read-only, advise, confirm, autonomous within limits.
- **Prompt-injection defence**: untrusted-data wrapping; the scanner is a blocking check.
- **Signed stateless sandbox**: HMAC-SHA256; edited browser state is rejected.
- **Hash-chained audit log**: SHA-256 chain, PII masked, exportable as evidence.
- **English and Spanish.**

## Quick start

```bash
git clone https://github.com/YOUR-USER/kuntur.git
cd kuntur
npm install
cp .env.example .env.local      # set STATE_SECRET; ANTHROPIC_API_KEY is optional
npm run dev                     # http://localhost:3000
npm test                        # 28 tests
npm run demo                    # writes evidence/sandbox-run.json
```

Requires Node.js 18.18 or later.

## Deployment (Vercel)

1. Import the GitHub repository in Vercel (framework preset: Next.js).
2. Add environment variables: `STATE_SECRET` (random 64-hex string). For the language-model agent, either `LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL` (any OpenAI-compatible provider, e.g. Groq or Gemini free tiers) or `ANTHROPIC_API_KEY`.
3. Deploy. Every push to `main` redeploys.

## Test cases to try

| Prompt | Expected result |
|---|---|
| Pay my tuition the cheapest safe way | SwiftLite proposed, authorization card appears |
| Paga el depósito de vivienda | Injection warning, payment denied |
| Pay the housing deposit with QuickRemit | Denied: unverified payee, flagged document, unlicensed provider |
| (Tier 3) Paga la cuota de intercambio en China | Auto-executed under the PEN 2,000 limit |
| Alert me if USD drops below 3.76, then Simulate market move | Alert triggers |

## Project structure

```
app/        UI (page.tsx) and API routes (agent, confirm, settings, tick, session)
lib/        agent, tools, policy engine, sandbox ledger, guards, audit chain, signing
tests/      Vitest suites (policy, security, agent)
scripts/    headless evidence run
docs/       GitHub Pages site: architecture, security self-assessment, testing
evidence/   generated sandbox logs
```

## License

MIT. All names, accounts and providers are fictional; no real money moves.
