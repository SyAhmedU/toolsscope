import { useState } from 'react';

const KEYFRAMES = `@keyframes syed-glow{0%,100%{box-shadow:0 4px 14px -4px rgba(241,69,117,.45)}50%{box-shadow:0 6px 22px -4px rgba(146,112,244,.55)}}`;
const WARM_GRAD = 'linear-gradient(135deg,#FF9656 0%,#F14575 55%,#9270F4 100%)';

function effectiveTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem('syed-theme');
    if (stored === 'dark' || stored === 'light') return stored;
  } catch { /* ignore */ }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

const bar: React.CSSProperties = {
  position: 'sticky', top: 0, zIndex: 9999,
  display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', height: 48,
  background: 'color-mix(in srgb, var(--bg-elev) 82%, transparent)',
  backdropFilter: 'blur(20px) saturate(150%)', WebkitBackdropFilter: 'blur(20px) saturate(150%)',
  borderBottom: '1px solid var(--line)', flexShrink: 0,
  fontFamily: "'Plus Jakarta Sans','Inter',system-ui,sans-serif",
};
const logo: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', flexShrink: 0 };
const mark: React.CSSProperties = {
  width: 28, height: 28, background: WARM_GRAD, borderRadius: 8,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '.78rem', fontWeight: 800, color: '#fff', flexShrink: 0,
  boxShadow: '0 4px 14px -4px rgba(241,69,117,.55)', animation: 'syed-glow 5s ease-in-out infinite',
};
const nm: React.CSSProperties = { fontSize: '.9rem', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' };
const divider: React.CSSProperties = { width: 1, height: 16, background: 'var(--line)', flexShrink: 0, margin: '0 3px' };
const project: React.CSSProperties = { fontSize: '.74rem', color: 'var(--ink-soft)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 };
const links: React.CSSProperties = { display: 'flex', alignItems: 'center', marginLeft: 'auto', flexShrink: 0, gap: 2 };
const link: React.CSSProperties = { fontSize: '.74rem', color: 'var(--ink-soft)', textDecoration: 'none', padding: '5px 11px', borderRadius: 999, whiteSpace: 'nowrap', fontWeight: 600 };
const toggle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg-soft)', border: '1px solid var(--line)', color: 'var(--ink-soft)',
  cursor: 'pointer', fontSize: '1rem', flexShrink: 0, marginLeft: 4, fontFamily: 'inherit',
};

type SuiteStep = 'rf' | 'ts' | 'ss' | 'cd' | 'to' | 'jt';
const SUITE: { key: SuiteStep; label: string; href: string }[] = [
  { key: 'rf', label: 'ResearchFlow', href: 'https://researchflow-syahmedus-projects.vercel.app' },
  { key: 'ts', label: 'TheoryScope', href: 'https://theoryscope.vercel.app' },
  { key: 'ss', label: 'ScaleScope', href: 'https://scalescope.vercel.app' },
  { key: 'cd', label: 'Cadence', href: 'https://syahmedu.github.io/cadence/' },
  { key: 'to', label: 'ToolsScope', href: 'https://toolsscope.vercel.app' },
  { key: 'jt', label: 'JournalTime', href: 'https://syahmedu.github.io/journaltime/' },
];

const suiteLabel: React.CSSProperties = { fontSize: '.66rem', color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '.08em', marginRight: 6, whiteSpace: 'nowrap' };
const linkActive: React.CSSProperties = { ...link, color: '#fff', background: WARM_GRAD, fontWeight: 700, boxShadow: '0 4px 12px -4px rgba(241,69,117,.45)' };
const linkCaret: React.CSSProperties = { ...link, opacity: 0.4, padding: '5px 4px', fontSize: '.8rem' };

export default function SyedBar({ projectName = 'ToolsScope', currentSuiteStep = 'to' as SuiteStep }: { projectName?: string; currentSuiteStep?: SuiteStep }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(effectiveTheme);
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('syed-theme', next); } catch { /* ignore */ }
    setTheme(next);
  };

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={bar}>
        <a style={logo} href="https://syahmedu.github.io/nexus/" target="_blank" rel="noopener noreferrer">
          <span style={mark}>S</span>
          <span style={nm}>Syed</span>
        </a>
        <span style={divider} />
        <span style={project}>{projectName}</span>
        <nav style={links} aria-label="Research Suite">
          <span style={suiteLabel}>Research Suite</span>
          {SUITE.map((s, i) => (
            <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {i > 0 && <span style={linkCaret} aria-hidden="true">›</span>}
              <a
                style={s.key === currentSuiteStep ? linkActive : link}
                href={s.href}
                aria-current={s.key === currentSuiteStep ? 'page' : undefined}
                target={s.key === currentSuiteStep ? undefined : '_blank'}
                rel={s.key === currentSuiteStep ? undefined : 'noopener noreferrer'}
              >
                {s.label}
              </a>
            </span>
          ))}
        </nav>
        <button style={toggle} onClick={flip} aria-label="Toggle light/dark theme" title="Toggle light/dark">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </>
  );
}
