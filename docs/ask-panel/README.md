# Ask panel (fork feature)

A shortcut-opened panel for asking one MausBot bot a question about the window you were using. This folder holds the
feature's decisions and evidence; upstream documentation elsewhere in `docs/` is unchanged.

- [DECISIONS.md](DECISIONS.md) — every decision, its status and the evidence that changed any of them
- [ARCHITECTURE.md](ARCHITECTURE.md) — processes, container and sequence diagrams, trust marks
- [PROTOCOLS_AND_APIS.md](PROTOCOLS_AND_APIS.md) — IPC channels, HTTP routes, SSE frames, error codes
- [PRIVACY_AND_SECURITY.md](PRIVACY_AND_SECURITY.md) — permission, screenshot lifecycle, what deletion removes
- [TEST_PLAN.md](TEST_PLAN.md) — acceptance matrix and benchmark method
- [DEMO_SCRIPT.md](DEMO_SCRIPT.md) — setup, one-minute demo, troubleshooting
- [CI_CD.md](CI_CD.md) — the workflow and what it cannot prove
- [REPO_MAP.md](REPO_MAP.md) — what the fork changed against upstream
- [SPIKES.md](SPIKES.md) — feasibility spikes with commands and observed results
- [GLOSSARY.md](GLOSSARY.md) — product terms
- [adr/](adr/) — the two hard-to-reverse decisions
- [LEARNING_TRACKER.md](LEARNING_TRACKER.md) — concepts taught and teach-back answers
- [spikes/](spikes/) — throwaway scripts that reproduce the spike evidence

Branches: `companion` is upstream `c175749a` with this fork's work on top; feature work happens on short branches
merged into it.
