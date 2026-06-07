import React, { useState, useCallback } from 'react';
import EventSuggestion from './EventSuggestion.jsx';

// ── PeopleCode Syntax Tokenization ──────────────────────────────────────────
const KEYWORDS = new Set([
  'Local', 'Global', 'Component', 'If', 'Then', 'Else', 'ElseIf', 'End-If',
  'For', 'End-For', 'While', 'End-While', 'Repeat', 'Until',
  'Function', 'End-Function', 'Return', 'Break', 'Continue',
  'Try', 'Catch', 'Throw', 'End-Try', 'And', 'Or', 'Not', 'True', 'False',
  'Select', 'When', 'When-Other', 'End-Select', 'import', 'class', 'extends', 'method', 'end-class',
  'get', 'set', 'property',
]);

const BUILTINS = new Set([
  'Error', 'Warning', 'WinMessage', 'MsgGet', 'MsgGetText', 'SQLExec', 'CreateSQL', 'CreateRowset', 'CreateRecord',
  'GetRecord', 'GetField', 'GetRow', 'GetLevel0', 'SetDefault', 'SetCursorPos', 'TransferPage',
]);

const TYPES = new Set([
  'string', 'number', 'boolean', 'date', 'datetime', 'time', 'integer', 'float', 'object', 'any',
  'Rowset', 'Row', 'Record', 'Field', 'SQL', 'ApiObject',
]);

function highlightLine(line, lineIdx) {
  const tokens = [];
  let i = 0;

  while (i < line.length) {
    if (line.slice(i, i + 2) === '--') {
      tokens.push(<span key={`${lineIdx}-c${i}`} style={{ color: 'var(--syn-comment)' }}>{line.slice(i)}</span>);
      break;
    }
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') j++;
      tokens.push(<span key={`${lineIdx}-s${i}`} style={{ color: 'var(--syn-string)' }}>{line.slice(i, j + 1)}</span>);
      i = j + 1; continue;
    }
    if (line[i] === '&') {
      let j = i + 1;
      while (j < line.length && /[\w]/.test(line[j])) j++;
      tokens.push(<span key={`${lineIdx}-v${i}`} style={{ color: 'var(--syn-variable)' }}>{line.slice(i, j)}</span>);
      i = j; continue;
    }
    if (/[0-9]/.test(line[i]) && (i === 0 || /\W/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[0-9.]/.test(line[j])) j++;
      tokens.push(<span key={`${lineIdx}-n${i}`} style={{ color: 'var(--syn-number)' }}>{line.slice(i, j)}</span>);
      i = j; continue;
    }
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_-]/.test(line[j])) j++;
      const word = line.slice(i, j);
      let colour = null;
      if (KEYWORDS.has(word))       colour = 'var(--syn-keyword)';
      else if (BUILTINS.has(word))  colour = 'var(--syn-builtin)';
      else if (TYPES.has(word))     colour = 'var(--syn-type)';
      tokens.push(colour
        ? <span key={`${lineIdx}-w${i}`} style={{ color: colour }}>{word}</span>
        : <span key={`${lineIdx}-w${i}`}>{word}</span>
      );
      i = j; continue;
    }
    tokens.push(<span key={`${lineIdx}-p${i}`}>{line[i]}</span>);
    i++;
  }
  return tokens;
}

// ── Lint Findings Panel ─────────────────────────────────────────────────────
const SEVERITY_META = {
  error:   { color: 'var(--error, #e5484d)',   icon: '✕', label: 'Error' },
  warning: { color: 'var(--warning, #f5a623)', icon: '!', label: 'Warning' },
  info:    { color: 'var(--text-muted)',        icon: 'i', label: 'Info' },
};

function LintPanel({ lint }) {
  if (!lint || !Array.isArray(lint.findings) || lint.findings.length === 0) return null;

  const { errors = 0, warnings = 0, info = 0 } = lint.summary || {};
  const order = { error: 0, warning: 1, info: 2 };
  const findings = [...lint.findings].sort(
    (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9)
  );

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      overflow: 'hidden',
      fontSize: '12.5px',
    }}>
      <div style={{
        display: 'flex', gap: '12px', alignItems: 'center',
        padding: '8px 12px',
        background: 'var(--bg-subtle, rgba(255,255,255,0.03))',
        borderBottom: '1px solid var(--border)',
        fontWeight: 600,
      }}>
        <span>Validation</span>
        {errors > 0   && <span style={{ color: SEVERITY_META.error.color }}>✕ {errors} error{errors !== 1 ? 's' : ''}</span>}
        {warnings > 0 && <span style={{ color: SEVERITY_META.warning.color }}>! {warnings} warning{warnings !== 1 ? 's' : ''}</span>}
        {info > 0     && <span style={{ color: SEVERITY_META.info.color }}>i {info} info</span>}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {findings.map((f, i) => {
          const meta = SEVERITY_META[f.severity] || SEVERITY_META.info;
          return (
            <li key={i} style={{
              display: 'flex', gap: '8px', alignItems: 'baseline',
              padding: '6px 12px',
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              lineHeight: 1.45,
            }}>
              <span style={{ color: meta.color, fontWeight: 700, minWidth: '14px' }}>{meta.icon}</span>
              {f.line != null && (
                <span style={{ color: 'var(--text-muted)', minWidth: '46px' }}>line {f.line}</span>
              )}
              <span style={{ color: 'var(--text-secondary)' }}>
                {f.message}
                <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>({f.rule})</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Single Code Panel ───────────────────────────────────────────────────────
function CodePanel({ codeBlock, label }) {
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const code = codeBlock?.generatedCode ?? '';

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch((err) => console.error('Clipboard write failed', err));
  }, [code]);

  const handleDownload = useCallback(() => {
    const filename = `${(label || 'output').toUpperCase()}.peoplecode`;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [code, label]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <EventSuggestion codeBlock={codeBlock} />

      <div className="ide-code-wrap">
        <div className="ide-code-header">
          <span className="ide-code-lang">PeopleCode</span>
          <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setWordWrap(v => !v)}
              className="ide-button-icon"
              style={{ color: wordWrap ? 'var(--accent)' : undefined }}
              title="Toggle word wrap"
            >
              ⏎ Wrap
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="ide-button-icon"
              title={`Download as .peoplecode file`}
              disabled={!code}
            >
              ↓ Save
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="ide-button-icon"
              style={{ color: copied ? 'var(--success)' : undefined }}
            >
              {copied ? '✓ Copied' : '⎘ Copy'}
            </button>
          </div>
        </div>
        <div className="ide-code-body">
          <pre
            className="ide-pre"
            style={wordWrap ? { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } : {}}
          >
            {code ? code.split('\n').map((line, i) => (
              <div key={i} className="line-row">
                <span className="line-num">{i + 1}</span>
                <span>{highlightLine(line, i)}</span>
              </div>
            )) : (
              <div className="line-row">
                <span className="line-num">1</span>
                <span style={{ color: 'var(--text-muted)' }}>-- Code will appear here...</span>
              </div>
            )}
          </pre>
        </div>
      </div>

      <LintPanel lint={codeBlock?.lint} />

      {codeBlock?.explanation && (
        <div style={{
          fontSize: '13px',
          color: 'var(--text-secondary)',
          padding: '0 8px',
          borderLeft: '2px solid var(--accent)',
          lineHeight: '1.5',
        }}>
          {codeBlock.explanation}
        </div>
      )}
    </div>
  );
}

// ── Main Output Component ───────────────────────────────────────────────────
export default function CodeOutput({ codeBlocks, label }) {
  const [activeTab, setActiveTab] = useState(0);
  const blocks = Array.isArray(codeBlocks) ? codeBlocks : [];

  if (blocks.length === 0) return <CodePanel codeBlock={null} label={label} />;

  const safeTab = activeTab < blocks.length ? activeTab : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <div style={{
        fontSize: '16px',
        fontWeight: 600,
        color: 'var(--text-primary)',
        padding: '0 0 16px 0',
        borderBottom: '1px solid var(--border)',
        marginBottom: '16px',
      }}>
        Generated Implementation
      </div>

      {blocks.length > 1 && (
        <div className="code-filetabs" style={{ marginBottom: '16px', borderRadius: 'var(--radius-sm)' }}>
          {blocks.map((block, i) => (
            <button
              key={i}
              className={`code-filetab ${i === safeTab ? 'active' : 'inactive'}`}
              onClick={() => setActiveTab(i)}
            >
              <span style={{ fontSize: '11px', color: i === safeTab ? 'var(--syn-string)' : 'var(--text-muted)' }}>◆</span>
              {block.location || `Block ${i + 1}`}
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>.peoplecode</span>
            </button>
          ))}
        </div>
      )}

      <CodePanel codeBlock={blocks[safeTab]} label={label} />
    </div>
  );
}
