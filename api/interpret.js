// POST /api/interpret — narrate an analysis result in APA-style prose.
// Body: { analysis: string, result: object, methodId?: string }
// Returns: { text, _source: 'groq' | 'fallback' }
//
// methodId picks the canonical methodology record (from lib/methodology.ts) so
// the AI is told *exactly* which APA citations to drop inline. Offline
// fallbacks also cite. The result object is whatever lib/stats.ts produced.

const METHOD_PROMPTS = {
  descriptives: { name: 'descriptive statistics', cite: '(American Psychological Association, 2020)' },
  reliability: { name: "Cronbach's alpha (with item-total and alpha-if-deleted)", cite: '(Cronbach, 1951)' },
  correlation_pearson: { name: 'Pearson correlation', cite: '(Pearson, 1904; Cohen, 1988)' },
  correlation_spearman: { name: 'Spearman rank correlation', cite: '(Spearman, 1904)' },
  ttest_independent: { name: "Welch's independent-samples t-test", cite: "(Welch, 1947; Cohen, 1988)" },
  ttest_paired: { name: 'paired-samples t-test', cite: '(Student, 1908; Cohen, 1988)' },
  anova: { name: 'one-way ANOVA', cite: '(Fisher, 1925; Cohen, 1988)' },
  regression: { name: 'multiple linear regression', cite: '(Cohen, 1988; Tabachnick & Fidell, 2019)' },
  chisquare: { name: 'chi-square test of independence', cite: '(Pearson, 1900)' },
  factor_pca: { name: 'principal component analysis with varimax rotation', cite: '(Kaiser, 1958; Kaiser, 1974; Bartlett, 1954)' },
  factor_efa: { name: 'exploratory factor analysis (principal-axis factoring) with varimax rotation', cite: '(Fabrigar et al., 1999; Costello & Osborne, 2005)' },
  mann_whitney: { name: 'Mann-Whitney U test', cite: '(Mann & Whitney, 1947)' },
  wilcoxon: { name: 'Wilcoxon signed-rank test', cite: '(Wilcoxon, 1945)' },
  kruskal_wallis: { name: 'Kruskal-Wallis H test', cite: '(Kruskal & Wallis, 1952)' },
  mediation: { name: 'single-mediator analysis with percentile bootstrap CI for the indirect effect (PROCESS Model 4)', cite: '(Hayes, 2022; Preacher & Hayes, 2008)' },
  moderation: { name: 'moderated regression with mean-centred predictors and simple-slopes analysis (PROCESS Model 1)', cite: '(Aiken & West, 1991; Hayes, 2022)' },
  qual_coding: { name: 'inductive thematic analysis', cite: '(Braun & Clarke, 2006)' },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { analysis, result, methodId } = body || {};
  if (!analysis || !result) return res.status(400).json({ error: 'Missing analysis or result' });

  const method = methodId ? METHOD_PROMPTS[methodId] : null;
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return res.status(200).json({ text: fallback(analysis, result, methodId), _source: 'fallback' });
  }

  const sys = `You are a meticulous quantitative methods editor. Given a statistical result as JSON, write a concise, accurate APA-7 style results paragraph (2–4 sentences). Report the exact statistics provided (test statistic, df, p, effect size) using correct APA notation. ${method ? `The analysis is a ${method.name}. Cite ${method.cite} inline using APA in-text format the first time you name the procedure (e.g., "A Welch's t-test (Welch, 1947) was conducted…"). Do not list references at the end — only in-text citations.` : 'Use appropriate APA in-text citations for the procedure (e.g., Cronbach, 1951 for alpha; Welch, 1947 for the independent t-test).'} Do not invent numbers not present. Do not add interpretation beyond what the statistics support.`;
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
    return res.status(200).json({ text: fallback(analysis, result, methodId), _source: 'fallback', _error: String(err?.message || err) });
  }
}

const f = (x, d = 2) => (typeof x === 'number' && isFinite(x) ? x.toFixed(d) : '—');
const p = (x) => (typeof x === 'number' && isFinite(x) ? (x < 0.001 ? 'p < .001' : 'p = ' + x.toFixed(3).replace(/^0/, '')) : 'p = —');
const band = (v, [s, m, l]) => { const a = Math.abs(v); return a < s ? 'negligible' : a < m ? 'small' : a < l ? 'medium' : 'large'; };

function fallback(analysis, r, mid) {
  const cite = mid && METHOD_PROMPTS[mid] ? ` ${METHOD_PROMPTS[mid].cite}` : '';
  try {
    if (mid === 'reliability' || analysis.toLowerCase().includes('reliab')) {
      return `Internal consistency was assessed using Cronbach's alpha (Cronbach, 1951)${r.omega != null ? ' and McDonald\'s omega (McDonald, 1999)' : ''}. The ${r.k}-item composite showed ${r.alpha >= 0.8 ? 'good' : r.alpha >= 0.7 ? 'acceptable' : 'questionable'} internal consistency, α = ${f(r.alpha, 2)}${r.omega != null ? `, ω ≈ ${f(r.omega, 2)}` : ''} (N = ${r.n}).${r.reversedSuggestions?.length ? ` Items ${r.reversedSuggestions.join(', ')} showed negative corrected item-total correlations and may be reverse-keyed.` : ''}`;
    }
    if (mid === 'ttest_independent' || (analysis.toLowerCase().includes('t-test') && r.kind === 'independent')) {
      return `An independent-samples Welch's t-test (Welch, 1947) compared ${r.groups ? `${r.groups[0]} (M = ${f(r.m1)}, SD = ${f(r.sd1)}, n = ${r.n1}) and ${r.groups[1]} (M = ${f(r.m2)}, SD = ${f(r.sd2)}, n = ${r.n2})` : 'the two groups'}, t(${f(r.df, 1)}) = ${f(r.t)}, ${p(r.p)}, Cohen's d = ${f(r.cohensD)} (${band(r.cohensD, [0.2, 0.5, 0.8])} effect; Cohen, 1988), 95% CI of the mean difference [${f(r.ci95[0])}, ${f(r.ci95[1])}].`;
    }
    if (mid === 'ttest_paired' || (analysis.toLowerCase().includes('t-test') && r.kind === 'paired')) {
      return `A paired-samples t-test (Student, 1908) indicated that the difference was ${r.p < 0.05 ? 'statistically significant' : 'not statistically significant'}, t(${f(r.df, 1)}) = ${f(r.t)}, ${p(r.p)}, dz = ${f(r.cohensD)} (${band(r.cohensD, [0.2, 0.5, 0.8])} effect; Cohen, 1988).`;
    }
    if (mid === 'anova' || analysis.toLowerCase().includes('anova')) {
      return `A one-way ANOVA (Fisher, 1925) examined ${r.dv} across levels of ${r.factor}, F(${r.dfBetween}, ${r.dfWithin}) = ${f(r.fStat)}, ${p(r.p)}, η² = ${f(r.etaSquared, 3)} (${band(r.etaSquared, [0.01, 0.06, 0.14])} effect; Cohen, 1988). Post-hoc pairwise comparisons used Bonferroni-corrected p-values (Dunn, 1961).`;
    }
    if (mid === 'regression' || analysis.toLowerCase().includes('regression')) {
      const sig = (r.coefficients || []).filter(c => c.term !== 'intercept' && c.p < 0.05).map(c => `${c.term} (β = ${f(c.beta)}, ${p(c.p)})`);
      return `A multiple linear regression (Cohen, 1988; Tabachnick & Fidell, 2019) predicted ${r.dv} from ${r.predictors.join(', ')}. The model explained ${f(r.r2 * 100, 1)}% of the variance, R² = ${f(r.r2, 3)} (adjusted R² = ${f(r.adjR2, 3)}), F(${r.dfModel}, ${r.dfResid}) = ${f(r.fStat)}, ${p(r.pModel)}.${sig.length ? ` Significant predictors: ${sig.join('; ')}.` : ' No individual predictor reached significance.'}`;
    }
    if (mid === 'chisquare' || analysis.toLowerCase().includes('chi')) {
      return `A chi-square test of independence (Pearson, 1900) ${r.p < 0.05 ? 'indicated a significant association' : 'found no significant association'} between ${r.rowVar} and ${r.colVar}, χ²(${r.df}) = ${f(r.chi2)}, ${p(r.p)}, Cramér's V = ${f(r.cramersV, 3)} (${band(r.cramersV, [0.1, 0.3, 0.5])} effect; Cohen, 1988).`;
    }
    if (mid === 'correlation_pearson' || mid === 'correlation_spearman' || analysis.toLowerCase().includes('correlation')) {
      const vars = r.vars || [];
      const strong = [];
      for (let i = 0; i < vars.length; i++) for (let j = 0; j < i; j++) { const rv = r.r[i][j]; if (isFinite(rv) && Math.abs(rv) >= 0.3 && r.p[i][j] < 0.05) strong.push(`${vars[i]}–${vars[j]} (r = ${f(rv)}, ${p(r.p[i][j])})`); }
      const meth = r.method === 'spearman' ? 'Spearman rank correlation (Spearman, 1904)' : 'Pearson product–moment correlation (Pearson, 1904)';
      return `A ${meth} matrix was computed across ${vars.length} variables.${strong.length ? ` Notable associations: ${strong.slice(0, 6).join('; ')}.` : ' No correlations reached |r| ≥ .30 at p < .05.'}`;
    }
    if (mid === 'factor_pca' || mid === 'factor_efa' || analysis.toLowerCase().includes('factor') || analysis.toLowerCase().includes('component')) {
      const meth = r.method === 'pca'
        ? 'Principal component analysis (Kaiser, 1958)'
        : 'Exploratory factor analysis with principal-axis factoring (Fabrigar et al., 1999; Costello & Osborne, 2005)';
      const adequacy = r.kmo >= 0.8 ? 'meritorious' : r.kmo >= 0.7 ? 'middling' : r.kmo >= 0.6 ? 'mediocre' : 'unacceptable';
      return `${meth} was conducted on ${r.k} items (N = ${r.n}). Sampling adequacy was ${adequacy} (KMO = ${f(r.kmo, 2)}; Kaiser, 1974), and Bartlett's test of sphericity (Bartlett, 1954) rejected the identity matrix, χ²(${r.bartlettDf}) = ${f(r.bartlettChi2)}, ${p(r.bartlettP)}. ${r.nFactors} ${r.method === 'pca' ? 'components' : 'factors'} were retained on the Kaiser criterion, accounting for ${(r.cumulativeVariance[r.nFactors - 1] * 100).toFixed(1)}% of the variance.${r.rotation === 'varimax' ? ' The solution was rotated with varimax (Kaiser, 1958).' : ''}`;
    }
    if (mid === 'mann_whitney' || analysis.toLowerCase().includes('mann-whitney')) {
      return `A Mann-Whitney U test (Mann & Whitney, 1947) compared ${r.groups[0]} (n = ${r.n1}, mean rank = ${f(r.meanRank1)}) and ${r.groups[1]} (n = ${r.n2}, mean rank = ${f(r.meanRank2)}). U = ${f(r.u, 1)}, z = ${f(r.z)}, ${p(r.p)}, rank-biserial r = ${f(r.rankBiserial)} (${band(r.rankBiserial, [0.1, 0.3, 0.5])} effect; Cohen, 1988).`;
    }
    if (mid === 'wilcoxon' || analysis.toLowerCase().includes('wilcoxon')) {
      return `A Wilcoxon signed-rank test (Wilcoxon, 1945) on ${r.n} non-zero paired differences yielded W = ${f(r.w, 1)}, z = ${f(r.z)}, ${p(r.p)}, matched-pairs r = ${f(r.matchedR)} (${band(r.matchedR, [0.1, 0.3, 0.5])} effect; Cohen, 1988).`;
    }
    if (mid === 'kruskal_wallis' || analysis.toLowerCase().includes('kruskal')) {
      return `A Kruskal-Wallis H test (Kruskal & Wallis, 1952) examined ${r.dv} across levels of ${r.factor}, H(${r.df}) = ${f(r.h)}, ${p(r.p)}, ε² = ${f(r.epsilonSquared, 3)} (${band(r.epsilonSquared, [0.01, 0.08, 0.26])} effect; Tabachnick & Fidell, 2019).`;
    }
    if (mid === 'mediation' || analysis.toLowerCase().includes('mediation')) {
      const sigInd = (r.bootstrapCI95[0] > 0 && r.bootstrapCI95[1] > 0) || (r.bootstrapCI95[0] < 0 && r.bootstrapCI95[1] < 0);
      return `A single-mediator analysis was conducted following Hayes (2022; PROCESS Model 4), with X = ${r.x}, M = ${r.m}, Y = ${r.y}. The path a (X → M) was b = ${f(r.a)} (SE = ${f(r.aSE)}, ${p(r.aP)}); path b (M → Y, controlling for X) was b = ${f(r.b)} (SE = ${f(r.bSE)}, ${p(r.bP)}); direct effect c′ = ${f(r.cPrime)}, total effect c = ${f(r.c)}. The indirect effect a × b = ${f(r.indirect)}, with a percentile bootstrap 95% CI of [${f(r.bootstrapCI95[0])}, ${f(r.bootstrapCI95[1])}] based on ${r.bootstrapN} resamples (Preacher & Hayes, 2008) — ${sigInd ? 'CI excluded zero, indicating a significant indirect effect' : 'CI included zero'}. Sobel z = ${f(r.sobelZ)}, ${p(r.sobelP)} (Sobel, 1982).`;
    }
    if (mid === 'moderation' || analysis.toLowerCase().includes('moderation')) {
      return `A moderated regression (Aiken & West, 1991; Hayes, 2022; PROCESS Model 1) regressed ${r.y} on mean-centred ${r.x}, ${r.w}, and the ${r.x} × ${r.w} interaction. The interaction was b = ${f(r.bXW)} (SE = ${f(r.seXW)}, ${p(r.pXW)}), with the model R² = ${f(r.r2, 3)} (ΔR² for the interaction = ${f(r.r2Change, 3)}). Simple slopes of ${r.y} on ${r.x} were ${r.simpleSlopes.map(s => `${f(s.slope, 2)} at W = ${s.wLevel}`).join('; ')}.`;
    }
    if (mid === 'descriptives' || analysis.toLowerCase().includes('descriptive')) {
      const rows = Array.isArray(r) ? r : [];
      const parts = rows.slice(0, 6).map(d => `${d.variable} (M = ${f(d.mean)}, SD = ${f(d.sd)})`);
      return `Descriptive statistics were computed in accordance with APA 7 (American Psychological Association, 2020). ${parts.join('; ')}.`;
    }
  } catch { /* fall through */ }
  return `Result computed for ${analysis}${cite}. (Set GROQ_API_KEY on the server for an AI-written APA paragraph.)`;
}
