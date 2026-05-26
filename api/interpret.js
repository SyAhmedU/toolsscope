// POST /api/interpret — narrate an analysis result in APA-style prose.
// Body: { analysis: string, result: object }
// Returns: { text, _source: 'groq' | 'fallback' }
//
// Mirrors the scalebase / theoryscope pattern: Groq when GROQ_API_KEY is set,
// otherwise a deterministic template assembled from the numbers. The result
// object is whatever lib/stats.ts produced for that analysis.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { analysis, result } = body || {};
  if (!analysis || !result) return res.status(400).json({ error: 'Missing analysis or result' });

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return res.status(200).json({ text: fallback(analysis, result), _source: 'fallback' });
  }

  const sys = `You are a meticulous quantitative methods editor. Given a statistical result as JSON, write a concise, accurate APA-7 style results paragraph (2–4 sentences). Report the exact statistics provided (test statistic, df, p, effect size) using correct APA notation and italics conventions described in words. Do not invent numbers not present. Do not add interpretation beyond what the statistics support.`;
  const user = `Analysis: ${analysis}\nResult JSON:\n${JSON.stringify(result).slice(0, 4000)}`;

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        temperature: 0.3, max_tokens: 400,
      }),
    });
    if (!r.ok) throw new Error(`Groq ${r.status}`);
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('empty');
    return res.status(200).json({ text, _source: 'groq' });
  } catch (err) {
    return res.status(200).json({ text: fallback(analysis, result), _source: 'fallback', _error: String(err?.message || err) });
  }
}

const f = (x, d = 2) => (typeof x === 'number' && isFinite(x) ? x.toFixed(d) : '—');
const p = (x) => (typeof x === 'number' && isFinite(x) ? (x < 0.001 ? 'p < .001' : 'p = ' + x.toFixed(3).replace(/^0/, '')) : 'p = —');

function fallback(analysis, r) {
  const a = analysis.toLowerCase();
  try {
    if (a.includes('reliab')) {
      return `The ${r.k}-item scale showed ${r.alpha >= 0.8 ? 'good' : r.alpha >= 0.7 ? 'acceptable' : 'questionable'} internal consistency, Cronbach's α = ${f(r.alpha, 2)}${r.omega != null ? ` (McDonald's ω ≈ ${f(r.omega, 2)})` : ''}, based on N = ${r.n} complete cases.${r.reversedSuggestions?.length ? ` Note: ${r.reversedSuggestions.join(', ')} showed negative item-total correlations and may be reverse-keyed.` : ''}`;
    }
    if (a.includes('t-test')) {
      return `An ${r.kind} t-test indicated that the difference was ${r.p < 0.05 ? 'statistically significant' : 'not statistically significant'}, t(${f(r.df, 1)}) = ${f(r.t)}, ${p(r.p)}, with ${Math.abs(r.cohensD) < 0.2 ? 'a negligible' : Math.abs(r.cohensD) < 0.5 ? 'a small' : Math.abs(r.cohensD) < 0.8 ? 'a medium' : 'a large'} effect size (Cohen's d = ${f(r.cohensD)}). Group means were ${f(r.m1)} (SD = ${f(r.sd1)}) and ${f(r.m2)} (SD = ${f(r.sd2)}).`;
    }
    if (a.includes('anova')) {
      return `A one-way ANOVA showed ${r.p < 0.05 ? 'a significant' : 'no significant'} effect of ${r.factor} on ${r.dv}, F(${r.dfBetween}, ${r.dfWithin}) = ${f(r.fStat)}, ${p(r.p)}, η² = ${f(r.etaSquared, 3)}.`;
    }
    if (a.includes('regression')) {
      const sig = (r.coefficients || []).filter(c => c.term !== 'intercept' && c.p < 0.05).map(c => `${c.term} (β = ${f(c.beta)}, ${p(c.p)})`);
      return `The model explained ${f(r.r2 * 100, 1)}% of the variance in ${r.dv} (R² = ${f(r.r2, 3)}, adjusted R² = ${f(r.adjR2, 3)}), F(${r.dfModel}, ${r.dfResid}) = ${f(r.fStat)}, ${p(r.pModel)}.${sig.length ? ` Significant predictors: ${sig.join('; ')}.` : ' No individual predictor reached significance.'}`;
    }
    if (a.includes('chi')) {
      return `A chi-square test of independence ${r.p < 0.05 ? 'indicated a significant association' : 'found no significant association'} between ${r.rowVar} and ${r.colVar}, χ²(${r.df}) = ${f(r.chi2)}, ${p(r.p)}, Cramér's V = ${f(r.cramersV, 3)}.`;
    }
    if (a.includes('correlation')) {
      const vars = r.vars || [];
      const strong = [];
      for (let i = 0; i < vars.length; i++) for (let j = 0; j < i; j++) { const rv = r.r[i][j]; if (isFinite(rv) && Math.abs(rv) >= 0.3 && r.p[i][j] < 0.05) strong.push(`${vars[i]}–${vars[j]} (r = ${f(rv)}, ${p(r.p[i][j])})`); }
      return `A ${r.method} correlation matrix was computed across ${vars.length} variables.${strong.length ? ` Notable significant associations: ${strong.slice(0, 6).join('; ')}.` : ' No correlations reached |r| ≥ .30 at p < .05.'}`;
    }
    if (a.includes('descriptive')) {
      const rows = Array.isArray(r) ? r : [];
      const parts = rows.slice(0, 6).map(d => `${d.variable} (M = ${f(d.mean)}, SD = ${f(d.sd)})`);
      return `Descriptive statistics were computed. ${parts.join('; ')}.`;
    }
  } catch { /* fall through */ }
  return `Result computed for ${analysis}. (Set GROQ_API_KEY on the server for an AI-written APA paragraph.)`;
}
