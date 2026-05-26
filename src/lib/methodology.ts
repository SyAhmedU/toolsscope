// ToolsScope methodology registry — the single source of truth for citations,
// "when to use", assumptions, reporting standards, and effect-size benchmarks
// for every analysis in the workbench.
//
// Everything reads from here:
//   • UI: `MethodologyCard` displays the entry above each analysis section
//   • Result chips: effect-size benchmarks (Cohen, 1988) annotate d, η², r, V, etc.
//   • AI write-up: api/interpret.js receives the methodology so the APA prose
//     uses correct in-text citations
//   • .docx report: References section is auto-derived from the methodologies
//     of the analyses the user actually captured — no orphan citations, no
//     missing ones.
//
// Citation keys are stable; entries are immutable. Adding an analysis means
// adding (a) its citation keys here and (b) its METHODS entry. Nowhere else.

export interface Citation {
  key: string;
  inline: string;     // "Cronbach, 1951"
  parenthetical: string; // "(Cronbach, 1951)"
  full: string;       // APA 7 full reference
  doi?: string;
}

export interface EffectSizeBenchmark {
  metric: string;          // "Cohen's d"
  small: number;
  medium: number;
  large: number;
  sourceKey: string;       // citation key for benchmark source
  note?: string;
}

export interface Methodology {
  id: string;
  name: string;
  whenToUse: string;          // one tight sentence — the answer to "should I run this?"
  assumptions: string[];      // bullets
  reportingTemplate: string;  // literal APA reporting line
  effectSizes?: EffectSizeBenchmark[];
  primary: string[];          // foundational citation keys (1–3)
  supporting?: string[];      // optional: ω, KMO, post-hoc, bootstrap, etc.
}

// ---- Citation library (APA 7) ----------------------------------------------
export const CITATIONS: Record<string, Citation> = {
  apa2020: { key: 'apa2020', inline: 'American Psychological Association, 2020', parenthetical: '(APA, 2020)',
    full: 'American Psychological Association. (2020). Publication manual of the American Psychological Association (7th ed.). American Psychological Association.' },
  cohen1988: { key: 'cohen1988', inline: 'Cohen, 1988', parenthetical: '(Cohen, 1988)',
    full: 'Cohen, J. (1988). Statistical power analysis for the behavioral sciences (2nd ed.). Lawrence Erlbaum Associates.' },
  cohen1992: { key: 'cohen1992', inline: 'Cohen, 1992', parenthetical: '(Cohen, 1992)',
    full: 'Cohen, J. (1992). A power primer. Psychological Bulletin, 112(1), 155–159. https://doi.org/10.1037/0033-2909.112.1.155', doi: '10.1037/0033-2909.112.1.155' },
  cronbach1951: { key: 'cronbach1951', inline: 'Cronbach, 1951', parenthetical: '(Cronbach, 1951)',
    full: 'Cronbach, L. J. (1951). Coefficient alpha and the internal structure of tests. Psychometrika, 16(3), 297–334. https://doi.org/10.1007/BF02310555', doi: '10.1007/BF02310555' },
  mcdonald1999: { key: 'mcdonald1999', inline: 'McDonald, 1999', parenthetical: '(McDonald, 1999)',
    full: 'McDonald, R. P. (1999). Test theory: A unified treatment. Lawrence Erlbaum Associates.' },
  dunn1961: { key: 'dunn1961', inline: 'Dunn, 1961', parenthetical: '(Dunn, 1961)',
    full: 'Dunn, O. J. (1961). Multiple comparisons among means. Journal of the American Statistical Association, 56(293), 52–64. https://doi.org/10.1080/01621459.1961.10482090', doi: '10.1080/01621459.1961.10482090' },
  tukey1949: { key: 'tukey1949', inline: 'Tukey, 1949', parenthetical: '(Tukey, 1949)',
    full: 'Tukey, J. W. (1949). Comparing individual means in the analysis of variance. Biometrics, 5(2), 99–114. https://doi.org/10.2307/3001913', doi: '10.2307/3001913' },
  welch1947: { key: 'welch1947', inline: 'Welch, 1947', parenthetical: '(Welch, 1947)',
    full: 'Welch, B. L. (1947). The generalization of "Student\'s" problem when several different population variances are involved. Biometrika, 34(1/2), 28–35. https://doi.org/10.1093/biomet/34.1-2.28', doi: '10.1093/biomet/34.1-2.28' },
  student1908: { key: 'student1908', inline: 'Student, 1908', parenthetical: '(Student, 1908)',
    full: 'Student. (1908). The probable error of a mean. Biometrika, 6(1), 1–25. https://doi.org/10.1093/biomet/6.1.1', doi: '10.1093/biomet/6.1.1' },
  fisher1925: { key: 'fisher1925', inline: 'Fisher, 1925', parenthetical: '(Fisher, 1925)',
    full: 'Fisher, R. A. (1925). Statistical methods for research workers. Oliver and Boyd.' },
  pearson1900: { key: 'pearson1900', inline: 'Pearson, 1900', parenthetical: '(Pearson, 1900)',
    full: 'Pearson, K. (1900). On the criterion that a given system of deviations from the probable in the case of a correlated system of variables is such that it can be reasonably supposed to have arisen from random sampling. Philosophical Magazine, Series 5, 50(302), 157–175. https://doi.org/10.1080/14786440009463897', doi: '10.1080/14786440009463897' },
  pearson1904: { key: 'pearson1904', inline: 'Pearson, 1904', parenthetical: '(Pearson, 1904)',
    full: 'Pearson, K. (1904). Mathematical contributions to the theory of evolution. XIII. On the theory of contingency and its relation to association and normal correlation. Drapers\' Company Research Memoirs, Biometric Series I.' },
  spearman1904: { key: 'spearman1904', inline: 'Spearman, 1904', parenthetical: '(Spearman, 1904)',
    full: 'Spearman, C. (1904). The proof and measurement of association between two things. The American Journal of Psychology, 15(1), 72–101. https://doi.org/10.2307/1412159', doi: '10.2307/1412159' },
  mannwhitney1947: { key: 'mannwhitney1947', inline: 'Mann & Whitney, 1947', parenthetical: '(Mann & Whitney, 1947)',
    full: 'Mann, H. B., & Whitney, D. R. (1947). On a test of whether one of two random variables is stochastically larger than the other. The Annals of Mathematical Statistics, 18(1), 50–60. https://doi.org/10.1214/aoms/1177730491', doi: '10.1214/aoms/1177730491' },
  wilcoxon1945: { key: 'wilcoxon1945', inline: 'Wilcoxon, 1945', parenthetical: '(Wilcoxon, 1945)',
    full: 'Wilcoxon, F. (1945). Individual comparisons by ranking methods. Biometrics Bulletin, 1(6), 80–83. https://doi.org/10.2307/3001968', doi: '10.2307/3001968' },
  kruskalwallis1952: { key: 'kruskalwallis1952', inline: 'Kruskal & Wallis, 1952', parenthetical: '(Kruskal & Wallis, 1952)',
    full: 'Kruskal, W. H., & Wallis, W. A. (1952). Use of ranks in one-criterion variance analysis. Journal of the American Statistical Association, 47(260), 583–621. https://doi.org/10.1080/01621459.1952.10483441', doi: '10.1080/01621459.1952.10483441' },
  kaiser1958: { key: 'kaiser1958', inline: 'Kaiser, 1958', parenthetical: '(Kaiser, 1958)',
    full: 'Kaiser, H. F. (1958). The varimax criterion for analytic rotation in factor analysis. Psychometrika, 23(3), 187–200. https://doi.org/10.1007/BF02289233', doi: '10.1007/BF02289233' },
  kaiser1974: { key: 'kaiser1974', inline: 'Kaiser, 1974', parenthetical: '(Kaiser, 1974)',
    full: 'Kaiser, H. F. (1974). An index of factorial simplicity. Psychometrika, 39(1), 31–36. https://doi.org/10.1007/BF02291575', doi: '10.1007/BF02291575' },
  bartlett1954: { key: 'bartlett1954', inline: 'Bartlett, 1954', parenthetical: '(Bartlett, 1954)',
    full: 'Bartlett, M. S. (1954). A note on the multiplying factors for various χ² approximations. Journal of the Royal Statistical Society: Series B (Methodological), 16(2), 296–298. https://doi.org/10.1111/j.2517-6161.1954.tb00174.x', doi: '10.1111/j.2517-6161.1954.tb00174.x' },
  fabrigar1999: { key: 'fabrigar1999', inline: 'Fabrigar et al., 1999', parenthetical: '(Fabrigar et al., 1999)',
    full: 'Fabrigar, L. R., Wegener, D. T., MacCallum, R. C., & Strahan, E. J. (1999). Evaluating the use of exploratory factor analysis in psychological research. Psychological Methods, 4(3), 272–299. https://doi.org/10.1037/1082-989X.4.3.272', doi: '10.1037/1082-989X.4.3.272' },
  costello2005: { key: 'costello2005', inline: 'Costello & Osborne, 2005', parenthetical: '(Costello & Osborne, 2005)',
    full: 'Costello, A. B., & Osborne, J. W. (2005). Best practices in exploratory factor analysis: Four recommendations for getting the most from your analysis. Practical Assessment, Research, and Evaluation, 10, Article 7. https://doi.org/10.7275/jyj1-4868', doi: '10.7275/jyj1-4868' },
  tabachnick2019: { key: 'tabachnick2019', inline: 'Tabachnick & Fidell, 2019', parenthetical: '(Tabachnick & Fidell, 2019)',
    full: 'Tabachnick, B. G., & Fidell, L. S. (2019). Using multivariate statistics (7th ed.). Pearson.' },
  field2018: { key: 'field2018', inline: 'Field, 2018', parenthetical: '(Field, 2018)',
    full: 'Field, A. (2018). Discovering statistics using IBM SPSS Statistics (5th ed.). Sage.' },
  hayes2022: { key: 'hayes2022', inline: 'Hayes, 2022', parenthetical: '(Hayes, 2022)',
    full: 'Hayes, A. F. (2022). Introduction to mediation, moderation, and conditional process analysis: A regression-based approach (3rd ed.). Guilford Press.' },
  baronkenny1986: { key: 'baronkenny1986', inline: 'Baron & Kenny, 1986', parenthetical: '(Baron & Kenny, 1986)',
    full: 'Baron, R. M., & Kenny, D. A. (1986). The moderator–mediator variable distinction in social psychological research: Conceptual, strategic, and statistical considerations. Journal of Personality and Social Psychology, 51(6), 1173–1182. https://doi.org/10.1037/0022-3514.51.6.1173', doi: '10.1037/0022-3514.51.6.1173' },
  sobel1982: { key: 'sobel1982', inline: 'Sobel, 1982', parenthetical: '(Sobel, 1982)',
    full: 'Sobel, M. E. (1982). Asymptotic confidence intervals for indirect effects in structural equation models. Sociological Methodology, 13, 290–312. https://doi.org/10.2307/270723', doi: '10.2307/270723' },
  preacherhayes2008: { key: 'preacherhayes2008', inline: 'Preacher & Hayes, 2008', parenthetical: '(Preacher & Hayes, 2008)',
    full: 'Preacher, K. J., & Hayes, A. F. (2008). Asymptotic and resampling strategies for assessing and comparing indirect effects in multiple mediator models. Behavior Research Methods, 40(3), 879–891. https://doi.org/10.3758/BRM.40.3.879', doi: '10.3758/BRM.40.3.879' },
  mackinnon2008: { key: 'mackinnon2008', inline: 'MacKinnon, 2008', parenthetical: '(MacKinnon, 2008)',
    full: 'MacKinnon, D. P. (2008). Introduction to statistical mediation analysis. Routledge.' },
  aikenwest1991: { key: 'aikenwest1991', inline: 'Aiken & West, 1991', parenthetical: '(Aiken & West, 1991)',
    full: 'Aiken, L. S., & West, S. G. (1991). Multiple regression: Testing and interpreting interactions. Sage.' },
  braunclarke2006: { key: 'braunclarke2006', inline: 'Braun & Clarke, 2006', parenthetical: '(Braun & Clarke, 2006)',
    full: 'Braun, V., & Clarke, V. (2006). Using thematic analysis in psychology. Qualitative Research in Psychology, 3(2), 77–101. https://doi.org/10.1191/1478088706qp063oa', doi: '10.1191/1478088706qp063oa' },
  saldana2021: { key: 'saldana2021', inline: 'Saldaña, 2021', parenthetical: '(Saldaña, 2021)',
    full: 'Saldaña, J. (2021). The coding manual for qualitative researchers (4th ed.). Sage.' },
  miles2020: { key: 'miles2020', inline: 'Miles et al., 2020', parenthetical: '(Miles et al., 2020)',
    full: 'Miles, M. B., Huberman, A. M., & Saldaña, J. (2020). Qualitative data analysis: A methods sourcebook (4th ed.). Sage.' },
  toolsscope2026: { key: 'toolsscope2026', inline: 'Ahmed, 2026', parenthetical: '(Ahmed, 2026)',
    full: 'Ahmed, S. (2026). ToolsScope: An in-browser analysis and visualization workbench. https://toolsscope.vercel.app' },
};

// ---- Per-analysis methodology ----------------------------------------------
// Effect-size thresholds follow Cohen (1988). Where Cohen did not specify a
// metric directly, the conventional adaptation is documented in `note`.
const COHEN_D: EffectSizeBenchmark = { metric: "Cohen's d", small: 0.2, medium: 0.5, large: 0.8, sourceKey: 'cohen1988' };
const COHEN_R: EffectSizeBenchmark = { metric: 'r', small: 0.1, medium: 0.3, large: 0.5, sourceKey: 'cohen1988' };
const COHEN_F2: EffectSizeBenchmark = { metric: 'f²', small: 0.02, medium: 0.15, large: 0.35, sourceKey: 'cohen1988' };
const ETA_SQ: EffectSizeBenchmark = { metric: 'η²', small: 0.01, medium: 0.06, large: 0.14, sourceKey: 'cohen1988', note: 'Conventional ANOVA adaptation of Cohen (1988).' };
const CRAMERS_V: EffectSizeBenchmark = { metric: "Cramér's V", small: 0.1, medium: 0.3, large: 0.5, sourceKey: 'cohen1988', note: 'For df* = min(rows−1, cols−1) = 1; thresholds scale with df.' };
const RANK_BISERIAL: EffectSizeBenchmark = { metric: 'rank-biserial r', small: 0.1, medium: 0.3, large: 0.5, sourceKey: 'cohen1988' };
const EPSILON_SQ: EffectSizeBenchmark = { metric: 'ε²', small: 0.01, medium: 0.08, large: 0.26, sourceKey: 'tabachnick2019', note: 'Kruskal-Wallis ε²; conventions reported in Tabachnick & Fidell (2019).' };

export const METHODS: Record<string, Methodology> = {
  descriptives: {
    id: 'descriptives',
    name: 'Descriptive statistics',
    whenToUse: 'Always report before inferential tests, to characterise the sample and check distributional assumptions.',
    assumptions: ['Variables are at least interval-level for M/SD/skew/kurt to be meaningful.', 'For Likert-type items, treat as ordinal unless the multi-item composite is approximately interval.'],
    reportingTemplate: 'M = X.XX, SD = X.XX, range [min, max]; skewness X.XX, kurtosis X.XX.',
    primary: ['apa2020', 'field2018'],
  },
  reliability: {
    id: 'reliability',
    name: "Cronbach's α (with item-total + α-if-deleted) and McDonald's ω",
    whenToUse: 'For a multi-item composite measure where all items are intended to reflect one construct.',
    assumptions: ["Items are tau-equivalent (Cronbach's α); congeneric structure for McDonald's ω.", 'Items scored in the same direction (reverse-keyed items must be recoded first).'],
    reportingTemplate: "Cronbach's α = .XX (ω = .XX) for N = X complete cases across X items.",
    primary: ['cronbach1951', 'mcdonald1999'],
  },
  correlation_pearson: {
    id: 'correlation_pearson',
    name: 'Pearson product–moment correlation',
    whenToUse: 'Two continuous variables, linear relationship, no extreme outliers.',
    assumptions: ['Linearity', 'Bivariate normality (for inferential p-values)', 'Homoscedasticity'],
    reportingTemplate: 'r(df) = .XX, p = .XXX, 95% CI [.XX, .XX].',
    effectSizes: [COHEN_R],
    primary: ['pearson1904', 'cohen1988'],
  },
  correlation_spearman: {
    id: 'correlation_spearman',
    name: 'Spearman rank correlation',
    whenToUse: 'When data are ordinal, monotonic but not linear, or contain outliers — the nonparametric analogue of Pearson r.',
    assumptions: ['Monotonic relationship', 'Pairs of independent observations'],
    reportingTemplate: 'rₛ(df) = .XX, p = .XXX.',
    effectSizes: [COHEN_R],
    primary: ['spearman1904'],
  },
  ttest_independent: {
    id: 'ttest_independent',
    name: "Welch's independent-samples t-test",
    whenToUse: 'Compare means of one continuous outcome between two independent groups. Welch is preferred over Student t because it does not assume equal variances.',
    assumptions: ['Approximately normal within each group (robust if N ≥ ~30 per group)', 'Observations are independent', 'Outcome is interval-level'],
    reportingTemplate: "t(df) = X.XX, p = .XXX, Cohen's d = X.XX, 95% CI of mean diff [X.XX, X.XX].",
    effectSizes: [COHEN_D],
    primary: ['welch1947', 'student1908'],
    supporting: ['cohen1988'],
  },
  ttest_paired: {
    id: 'ttest_paired',
    name: 'Paired-samples t-test',
    whenToUse: 'Compare two related measurements on the same units (pre/post; matched pairs).',
    assumptions: ['Differences are approximately normally distributed (robust at N ≥ 30)', 'Pairs are independent'],
    reportingTemplate: 't(df) = X.XX, p = .XXX, dz = X.XX.',
    effectSizes: [COHEN_D],
    primary: ['student1908'],
    supporting: ['cohen1988'],
  },
  anova: {
    id: 'anova',
    name: 'One-way ANOVA',
    whenToUse: 'Compare means of one continuous outcome across three or more independent groups.',
    assumptions: ['Approximately normal within each group', 'Homogeneity of variance (else use Welch ANOVA)', 'Independent observations'],
    reportingTemplate: 'F(df1, df2) = X.XX, p = .XXX, η² = .XX. Post-hoc with Bonferroni-adjusted p.',
    effectSizes: [ETA_SQ],
    primary: ['fisher1925', 'cohen1988'],
    supporting: ['dunn1961', 'tukey1949'],
  },
  regression: {
    id: 'regression',
    name: 'Multiple linear regression (OLS)',
    whenToUse: 'Predict a continuous outcome from one or more continuous/dummy-coded predictors.',
    assumptions: ['Linearity in parameters', 'Independence of residuals', 'Homoscedasticity', 'Approximately normal residuals', 'No severe multicollinearity (inspect VIF; >5 problematic, >10 serious)'],
    reportingTemplate: 'R² = .XX (adj R² = .XX), F(df1, df2) = X.XX, p = .XXX. For each predictor: B = X.XX, SE = X.XX, β = X.XX, t = X.XX, p = .XXX.',
    effectSizes: [COHEN_F2],
    primary: ['cohen1988', 'tabachnick2019', 'field2018'],
  },
  chisquare: {
    id: 'chisquare',
    name: 'Chi-square test of independence',
    whenToUse: 'Test association between two categorical variables.',
    assumptions: ['Cell expected counts ≥ 5 in at least 80% of cells (else use Fisher\'s exact)', 'Independent observations', 'Mutually exclusive categories'],
    reportingTemplate: 'χ²(df, N = X) = X.XX, p = .XXX, Cramér\'s V = .XX.',
    effectSizes: [CRAMERS_V],
    primary: ['pearson1900'],
    supporting: ['cohen1988'],
  },
  factor_pca: {
    id: 'factor_pca',
    name: 'Principal Component Analysis',
    whenToUse: 'Data reduction — find linear combinations of observed variables that capture maximum variance. Use when components are formative summaries, not latent causes.',
    assumptions: ['Adequate sample (N ≥ 5–10 per item; preferably ≥ 200)', 'KMO ≥ .60 (preferably ≥ .70)', 'Bartlett\'s test of sphericity significant'],
    reportingTemplate: 'KMO = .XX, Bartlett\'s χ²(df) = X.XX, p = .XXX. Retained X components on Kaiser criterion (eigenvalue ≥ 1), accounting for X.X% of variance. Loadings reported after varimax rotation.',
    primary: ['kaiser1958', 'kaiser1974', 'bartlett1954'],
    supporting: ['fabrigar1999', 'costello2005', 'tabachnick2019'],
  },
  factor_efa: {
    id: 'factor_efa',
    name: 'Exploratory Factor Analysis (principal-axis factoring)',
    whenToUse: 'Identify latent constructs underlying a set of observed items. PAF is preferred over PCA when the goal is to model a common-factor structure (Fabrigar et al., 1999; Costello & Osborne, 2005).',
    assumptions: ['Same as PCA, plus: items reflect underlying common factors (reflective indicators)'],
    reportingTemplate: 'KMO = .XX, Bartlett\'s χ²(df) = X.XX, p = .XXX. Communalities reported; X factors retained, accounting for X.X% of common variance; varimax rotation applied.',
    primary: ['fabrigar1999', 'costello2005'],
    supporting: ['kaiser1958', 'kaiser1974', 'bartlett1954', 'tabachnick2019'],
  },
  mann_whitney: {
    id: 'mann_whitney',
    name: 'Mann-Whitney U test',
    whenToUse: 'Two independent groups, outcome is ordinal or non-normal. The nonparametric counterpart to the independent-samples t-test.',
    assumptions: ['Independent observations', 'Outcome at least ordinal', 'Similar shape across groups for the test to be interpreted as a comparison of medians'],
    reportingTemplate: 'U = X, z = X.XX, p = .XXX, rank-biserial r = .XX.',
    effectSizes: [RANK_BISERIAL],
    primary: ['mannwhitney1947'],
    supporting: ['field2018'],
  },
  wilcoxon: {
    id: 'wilcoxon',
    name: 'Wilcoxon signed-rank test',
    whenToUse: 'Two related measurements when the paired-differences distribution is non-normal or measurement is ordinal. The nonparametric counterpart to the paired t-test.',
    assumptions: ['Paired observations', 'Differences are at least ordinal and symmetrically distributed around the median'],
    reportingTemplate: 'W = X, z = X.XX, p = .XXX, r = .XX.',
    effectSizes: [COHEN_R],
    primary: ['wilcoxon1945'],
    supporting: ['field2018'],
  },
  kruskal_wallis: {
    id: 'kruskal_wallis',
    name: 'Kruskal-Wallis H test',
    whenToUse: 'Three or more independent groups, outcome is ordinal or non-normal. Nonparametric counterpart to one-way ANOVA.',
    assumptions: ['Independent observations', 'Outcome at least ordinal'],
    reportingTemplate: 'H(df) = X.XX, p = .XXX, ε² = .XX.',
    effectSizes: [EPSILON_SQ],
    primary: ['kruskalwallis1952'],
    supporting: ['field2018'],
  },
  mediation: {
    id: 'mediation',
    name: 'Single-mediator analysis (PROCESS Model 4)',
    whenToUse: 'Test whether the relationship between X and Y is transmitted through a mediator M. Modern best practice uses the bootstrap CI of the indirect effect (Hayes, 2022; MacKinnon, 2008); Sobel z is reported for continuity with older literature but should not be the primary inference.',
    assumptions: ['X → M → Y temporal/theoretical order', 'No omitted confounders between M and Y', 'Linear paths; for non-significant Sobel but bootstrap CI excluding zero, trust the bootstrap'],
    reportingTemplate: 'a = X.XX (SE = X.XX); b = X.XX (SE = X.XX); c′ = X.XX (SE = X.XX); c = X.XX (SE = X.XX). Indirect effect a × b = X.XX, 95% percentile bootstrap CI [X.XX, X.XX] (k resamples).',
    primary: ['hayes2022', 'preacherhayes2008'],
    supporting: ['baronkenny1986', 'sobel1982', 'mackinnon2008'],
  },
  moderation: {
    id: 'moderation',
    name: 'Moderated regression (PROCESS Model 1)',
    whenToUse: 'Test whether the effect of X on Y depends on a moderator W. The interaction term X × W carries the moderation evidence; predictors should be mean-centred to reduce non-essential multicollinearity (Aiken & West, 1991).',
    assumptions: ['Same as OLS regression', 'Predictors mean-centred (done automatically here)'],
    reportingTemplate: 'b_XW = X.XX, SE = X.XX, p = .XXX. ΔR² for the interaction = .XX. Simple slopes of Y on X reported at W = M ± 1 SD.',
    primary: ['aikenwest1991', 'hayes2022'],
    supporting: ['cohen1988'],
  },
  qual_coding: {
    id: 'qual_coding',
    name: 'Inductive coding and thematic analysis',
    whenToUse: 'When analysing textual qualitative data (interviews, open-text survey responses, field notes) to surface meanings, patterns, and themes grounded in the data.',
    assumptions: ['Codes evolve iteratively as the researcher reads', 'Themes are interpreted, not statistically derived', 'Trustworthiness depends on transparency about coder, codebook, and decision rules'],
    reportingTemplate: 'X documents were coded inductively (Braun & Clarke, 2006). The final codebook contained X codes organised under X themes; selected exemplar excerpts are reported.',
    primary: ['braunclarke2006', 'saldana2021'],
    supporting: ['miles2020'],
  },
};

// Always present in the .docx references list — they apply to the report itself.
export const ALWAYS_CITED = ['apa2020', 'toolsscope2026'];

// ---- Helpers ---------------------------------------------------------------
export function inlineCite(keys: string[]): string {
  return keys.map(k => CITATIONS[k]?.inline ?? k).join('; ');
}
export function parentheticalCite(keys: string[]): string {
  return '(' + keys.map(k => CITATIONS[k]?.inline ?? k).join('; ') + ')';
}
export function benchmark(value: number, b: EffectSizeBenchmark): string {
  const v = Math.abs(value);
  if (!Number.isFinite(v)) return '';
  if (v < b.small) return 'negligible';
  if (v < b.medium) return 'small';
  if (v < b.large) return 'medium';
  return 'large';
}
export function fullReferences(keys: string[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const k of keys) {
    if (seen.has(k)) continue;
    const c = CITATIONS[k];
    if (c) { out.push(c); seen.add(k); }
  }
  return out.sort((a, b) => a.full.localeCompare(b.full));
}
