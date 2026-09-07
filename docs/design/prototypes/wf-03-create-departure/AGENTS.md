# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

Keep the business surface free of prototype-only state rails and duplicate relationship cards. The three columns must express object, conversation, and artifact relationships directly; workflow states advance through real business actions, and selecting a related conversation must update the visible conversation.

In review state, keep the return and confirm actions fixed at the bottom of the right pane; only the review content above them scrolls.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Current design authority (2026-09-07)

Use PRD #483 and its current source/resource specs. Preserve the stable left object pane in review, edit, and result states. Do not reintroduce global chat, required guest age/phone type, capacity as a resource form field or cost-entry blocker, or receivables selected before source creation. Resource amounts are totals; details belong in notes. Initial receivables confirm the whole source; initial payables follow explicit selection of successfully created resources. Static mockups and historical QA do not override these rules.
