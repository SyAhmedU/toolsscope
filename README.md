# ToolsScope

**The analysis bench of the Research Suite.** Bring in cleaned data — a Cadence
export or any CSV/Excel file — and run the analyses and figures researchers
actually report in papers. Everything runs **client-side in the browser**;
nothing is uploaded.

Suite flow: **Cadence** (collect) → **ToolsScope** (analyze) → **JournalTime** (write).

## What it does

**Data** — drag-drop a `.csv` / `.tsv` / `.xlsx` file (or paste a table, or load
the built-in demo). Columns get auto-typed (numeric / Likert / categorical /
text / id); override any type by hand. Excel parsing is lazy-loaded so it only
costs bandwidth when you actually open a spreadsheet.

**Analyze** — the quantitative core, each computed from a real distribution
(no normal-approximation shortcuts):
- Descriptives (M, SD, min/max, median, skew, kurtosis, missing)
- Reliability — Cronbach's α, McDonald's ω (approx.), corrected item-total r, α-if-deleted
- Correlation matrix — Pearson / Spearman, with significance stars and pairwise N
- t-tests — independent (Welch) and paired, with Cohen's d and CI of the difference
- One-way ANOVA — F, η², and Bonferroni-corrected pairwise post-hoc
- Multiple / hierarchical regression — B, SE, β, t, p, R², adj R², VIF
- Chi-square test of independence — χ², Cramér's V, observed/expected

Each result has a **✎ Write up (APA)** button that narrates the numbers in
APA-7 prose (Groq server-side; deterministic offline template otherwise).

**Visualize** — the figures that go in papers: histogram, group means ± 95% CI,
boxplot, scatter + OLS fit, correlation heatmap, and Likert stacked bars. Pure
SVG — right-click → *Save image as…*.

## Stack
React 19 + Vite + TypeScript. Statistics engine is hand-written and
dependency-free (`src/lib/stats.ts`, verified against textbook values). Excel
parsing via SheetJS (CDN distribution). Optional AI write-up via a Vercel
serverless function (`api/interpret.js`) calling Groq.

```bash
npm install
npm run dev      # local dev
npm run build    # tsc -b && vite build
npm run preview
```

### Environment
- `GROQ_API_KEY` (optional) — set on the Vercel project to enable AI-written APA
  paragraphs. Without it, the deterministic template still produces useful prose.

## Roadmap (v2)
- EFA/PCA (loadings, scree, KMO/Bartlett) and CFA fit indices
- PROCESS-style mediation & moderation with bootstrap CIs
- Qualitative module — coding, code frequency, theme hierarchy, word frequency, co-occurrence
- Direct, structured Cadence-export ingest (scales/waves/items aware)

Part of Syed's Research Suite. Sibling of ScaleScope and TheoryScope.
