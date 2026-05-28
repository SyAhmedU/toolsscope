// Plan — the ToolsScope "Generate" panel. Describe your study (constructs,
// design, hypotheses) and the suite's shared AI returns a sequenced analysis
// plan with rationales + APA result templates per step. Works without a
// dataset loaded so researchers can plan before they collect.
//
// Calls the suite-wide ResearchFlow /api/generate endpoint (same Groq key,
// same shared backend pattern as cadence/wordmap/papercards Generate panels).

import { useEffect, useRef, useState } from 'react';

const RF_GENERATE_URL = 'https://researchflow-syahmedus-projects.vercel.app/api/generate';

interface PlanStep {
  step: number;
  name: string;          // e.g. "Cronbach's α reliability"
  why: string;           // one sentence on why this step
  toolsscope_section?: string;  // 'reliability' | 'descriptives' | 't-test' | …
  apa_template?: string;
}

interface PlanResult {
  summary?: string;
  steps?: PlanStep[];
  caveats?: string[];
}

export default function Plan({ datasetReady }: { datasetReady: boolean }) {
  // Quick Start hand-off: ?plan=<topic> drops the topic in here and auto-
  // generates so users land on a populated plan instead of a blank textarea.
  const initialQ = (() => {
    try {
      const q = new URLSearchParams(location.search).get('plan') || '';
      if (q) history.replaceState(null, '', location.pathname + location.hash);
      return q;
    } catch { return ''; }
  })();
  const [text, setText] = useState(initialQ);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const ranInitial = useRef(false);
  useEffect(() => {
    if (ranInitial.current || !initialQ) return;
    ranInitial.current = true;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    const desc = text.trim();
    if (!desc) return;
    setLoading(true); setErr(null); setPlan(null);
    try {
      const prompt =
`A researcher is planning the analysis for a study. Their description:
"""${desc}"""

Build an ordered analysis plan they should run in ToolsScope (which supports: descriptives, Cronbach's α + ω + item-total + α-if-deleted, Pearson/Spearman correlations, paired & independent t-tests with Cohen's d, one-way ANOVA + η² + Bonferroni, OLS multiple regression with VIF, chi-square + Cramér's V, Mann-Whitney U, Wilcoxon signed-rank, Kruskal-Wallis, PCA, EFA (principal-axis + varimax + KMO + Bartlett), PROCESS-style mediation (Model 4 with bootstrap CI), and moderation (Model 1 with simple slopes)). Order them logically (cleaning → reliability → descriptives → main inferential → robustness).

Return JSON:
{
  "summary": "1-2 sentence plain-language description of the overall plan",
  "steps": [
    { "step": 1, "name": "step name", "why": "one sentence on why this step now", "toolsscope_section": "reliability | descriptives | correlations | t-test | anova | regression | chi-square | mann-whitney | wilcoxon | kruskal-wallis | pca | efa | mediation | moderation", "apa_template": "the APA-style sentence template with placeholders for the numbers" }
  ],
  "caveats": ["1-3 honest caveats about what this plan ASSUMES (e.g. about your N, distribution, or design)"]
}`;
      const r = await fetch(RF_GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, schema_hint: 'ToolsScope analysis plan', temperature: 0.4 }),
      });
      if (!r.ok) {
        let detail = '';
        try { detail = (await r.json()).detail || ''; } catch { /* ignore */ }
        if (r.status === 503 || /GROQ_API_KEY/i.test(detail)) {
          setErr("AI isn't configured on the shared server yet — set GROQ_API_KEY on ResearchFlow's Vercel.");
          return;
        }
        throw new Error(detail || `HTTP ${r.status}`);
      }
      const { result } = await r.json();
      setPlan(result as PlanResult);
    } catch (e) {
      setErr('Could not generate: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="plan-wrap">
      <div className="plan-card">
        <div className="plan-head">
          <h2 className="plan-title">✨ Plan your analysis</h2>
          <p className="plan-sub">
            Describe your study — constructs, design, hypotheses, sample — and you'll get a sequenced analysis plan with the APA-style write-up for each step. Doesn't need data loaded; plan before you collect, then come back to run it.
          </p>
        </div>
        <textarea
          className="plan-input"
          rows={5}
          placeholder="e.g. Cross-sectional survey, N≈180 nurses. IVs: job demands + job resources. Mediator: work engagement. DV: burnout. H1: resources → engagement (+). H2: engagement → burnout (−). H3: indirect via engagement."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } }}
        />
        <div className="plan-row">
          <span className="muted small">⌘/Ctrl+Enter to generate</span>
          <button className="btn primary" onClick={generate} disabled={loading || !text.trim()}>
            {loading ? 'Thinking…' : '✨ Generate plan'}
          </button>
        </div>
        {err && <div className="plan-err">{err}</div>}
      </div>

      {plan && (
        <div className="plan-result">
          {plan.summary && (
            <div className="plan-summary">{plan.summary}</div>
          )}
          {plan.steps && plan.steps.length > 0 && (
            <ol className="plan-steps">
              {plan.steps.map((s, i) => (
                <li key={i} className="plan-step">
                  <div className="plan-step-head">
                    <span className="plan-step-num">{s.step ?? i + 1}</span>
                    <span className="plan-step-name">{s.name}</span>
                    {s.toolsscope_section && <span className="plan-step-tag">→ {s.toolsscope_section}</span>}
                  </div>
                  {s.why && <div className="plan-step-why">{s.why}</div>}
                  {s.apa_template && (
                    <div className="plan-step-apa"><span className="plan-apa-label">APA:</span> {s.apa_template}</div>
                  )}
                </li>
              ))}
            </ol>
          )}
          {plan.caveats && plan.caveats.length > 0 && (
            <div className="plan-caveats">
              <div className="plan-caveats-label">Caveats</div>
              <ul>{plan.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
          <div className="plan-next">
            {datasetReady
              ? <>Ready when you are — open the <strong>Analyze</strong> tab to run these.</>
              : <>Load your dataset in the <strong>Data</strong> tab whenever it's ready; the plan stays here.</>}
          </div>
        </div>
      )}
    </div>
  );
}
