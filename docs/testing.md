---
layout: default
title: Testing and evidence
---

[← Overview](index.md)

# Testing and execution evidence

## Automated tests

`npm test` runs 32 Vitest tests in four suites:

- `tests/policy.test.ts`: quote maths, recommender excludes unlicensed providers, every policy check, the tier-3 auto-approve boundary, the full propose → approve → duplicate-block lifecycle, re-check at approval, rejection.
- `tests/security.test.ts`: injection scanner (positive and negative), forged `</untrusted>` tag, PII masking in outputs and audit log, input caps, hash-chain tamper detection, forged-state rejection, tool gating by tier, unknown tools.
- `tests/agent.test.ts`: five end-to-end tasks in English and Spanish.
- `tests/fx.test.ts`: live-rate parsing (inversion to PEN per unit), validation of bad responses, fallback on HTTP errors and network failure.

## Headless sandbox run

`npm run demo` replays a full scenario and writes `evidence/sandbox-run.json`:

1. Lists invoices (housing deposit flagged).
2. “Pay my tuition the cheapest safe way” → compares 4 providers → excludes QuickRemit (unlicensed) → proposes SwiftLite → **human approves** → paid.
3. “Paga el depósito de vivienda” → injection warning → **denied** (unverified payee, flagged document).
4. “Pay the housing deposit with QuickRemit” → **denied** (also unlicensed provider).
5. Tier 0 → comparison **blocked** by tier.
6. Tier 3 → CNY 1,500 exchange fee (PEN 791.70, under PEN 2,000) → **auto-executed**.
7. FX alert created; a simulated market move triggers it.

The file contains the transcript, transactions, final balances, the complete audit log and the chain verification result.

## Evidence from the live demo

Use **Export evidence** in the audit panel after a session to download the same structure from the deployed app.
