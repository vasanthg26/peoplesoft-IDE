import React, { useState, useCallback, useEffect, useRef } from 'react';
import ComponentInput from './components/ComponentInput.jsx';
import RequirementInput from './components/RequirementInput.jsx';
import GenerateButton from './components/GenerateButton.jsx';
import PasteInput from './components/PasteInput.jsx';
import PasteConfirmCard from './components/PasteConfirmCard.jsx';
import CodeOutput from './components/CodeOutput.jsx';
import Explanation from './components/Explanation.jsx';
import ProposalView from './components/ProposalView.jsx';
import TracePanel from './components/TracePanel.jsx';
import { generateCode, parseCode, generatePasteCode } from './api/generate.js';

const MARKETS = ['GBL', 'USA', 'CAN', 'GBR', 'AUS', 'DEU', 'FRA', 'JPN'];

// ── Sparky Logo ──────────────────────────────────────────────────────────────
function SparkyLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sparky-grad" x1="6" y1="2" x2="26" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f7b731" />
          <stop offset="55%" stopColor="#f0932b" />
          <stop offset="100%" stopColor="#eb4d4b" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="rgba(247,183,49,0.10)" />
      <path d="M19.5 3L8 18h8l-3.5 11L28 13h-8.5L19.5 3z" fill="url(#sparky-grad)" strokeLinejoin="round" />
    </svg>
  );
}

// ── Mode Tab ─────────────────────────────────────────────────────────────────
function ModeTab({ mode, current, label, onClick }) {
  return (
    <button onClick={() => onClick(mode)} className={`ide-mode-tab${mode === current ? ' active' : ''}`}>
      {label}
    </button>
  );
}

// ── Editor File Tab ──────────────────────────────────────────────────────────
function EditorTab({ label, fileExt }) {
  return (
    <div className="editor-tab active">
      <span style={{ color: 'var(--syn-string)', fontSize: '11px' }}>◆</span>
      <span style={{ fontSize: '13px' }}>{label}</span>
      {fileExt && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>.{fileExt}</span>}
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ inputMode }) {
  return (
    <div className="ide-empty">
      <div className="ide-empty-logo"><SparkyLogo size={72} /></div>
      <div className="ide-empty-title">
        {inputMode === 'component' ? 'New PeopleCode File' : 'Analyze Existing Code'}
      </div>
      <div className="ide-empty-sub">
        {inputMode === 'component'
          ? 'Fill in the component name and requirement in the panel, then generate.'
          : 'Paste your existing PeopleCode block into the panel, then analyze.'}
      </div>
      <div className="ide-kbd-hint">
        <kbd>Ctrl</kbd><span>+</span><kbd>Enter</kbd>
        <span>to {inputMode === 'component' ? 'generate' : 'analyze'}</span>
      </div>
    </div>
  );
}

// ── Settings Modal ───────────────────────────────────────────────────────────
function SettingsModal({ open, onClose, apiUrl, setApiUrl, defaultMarket, setDefaultMarket, onSave }) {
  if (!open) return null;
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <span>⚙ Settings</span>
          <button className="ide-button-icon" onClick={onClose}>✕</button>
        </div>
        <div className="settings-body">
          <div className="ide-field">
            <label className="ide-label">Server URL</label>
            <input
              className="ide-input"
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              placeholder="http://localhost:4000"
              spellCheck={false}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
              Override the API server URL. Leave blank to use the default (port 4000).
            </div>
          </div>
          <div className="ide-field">
            <label className="ide-label">Default Market</label>
            <select className="ide-select" value={defaultMarket} onChange={e => setDefaultMarket(e.target.value)}>
              {MARKETS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
              Pre-selected market for all new sessions.
            </div>
          </div>
        </div>
        <div className="settings-footer">
          <button className="ide-button ide-button-secondary" onClick={onClose}>Cancel</button>
          <button className="ide-button ide-button-primary" onClick={onSave}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}

// ── Pinned Drawer ────────────────────────────────────────────────────────────
function PinnedDrawer({ open, onClose, items, onLoad, onRemove }) {
  if (!open) return null;
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="pinned-drawer" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <span>⭐ Pinned Sessions ({items.length})</span>
          <button className="ide-button-icon" onClick={onClose}>✕</button>
        </div>
        <div className="pinned-list">
          {items.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No pinned sessions yet.<br />
              Pin a generated output using the ⭐ button in the tab bar.
            </div>
          ) : items.map(pin => (
            <div key={pin.id} className="pinned-item">
              <div className="pinned-item-info">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)' }}>
                  {pin.label}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {pin.market} · {new Date(pin.timestamp).toLocaleDateString()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button
                  className="ide-button ide-button-secondary"
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                  onClick={() => onLoad(pin)}
                >
                  Load
                </button>
                <button className="ide-button-icon" onClick={() => onRemove(pin.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {

  // ── Theme ──
  const [theme, setTheme] = useState(() => localStorage.getItem('sparky-theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sparky-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  // ── Input mode ──
  const [inputMode, setInputMode] = useState('component');

  // ── WebSocket status ──
  const [wsStatus, setWsStatus] = useState('connecting');

  // ── Component mode state ──
  const [componentName, setComponentName] = useState('');
  const [market, setMarket] = useState(() => localStorage.getItem('sparky-default-market') || 'GBL');
  const [requirement, setRequirement] = useState('');

  // ── Paste mode state ──
  const [pastedCode, setPastedCode] = useState('');
  const [eventHint, setEventHint] = useState('');
  const [pasteRequirement, setPasteRequirement] = useState('');
  const [parsedContext, setParsedContext] = useState(null);

  // ── Shared pipeline state ──
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [contextId, setContextId] = useState(null);
  const [error, setError] = useState(null);
  const [trace, setTrace] = useState([]);

  // ── Layout ──
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [panelWidth, setPanelWidth] = useState(380);
  const [splitView, setSplitView] = useState(false);

  // ── Font size ──
  const [fontSize, setFontSize] = useState(() => {
    const saved = parseInt(localStorage.getItem('sparky-font-size') || '13');
    return isNaN(saved) ? 13 : Math.min(20, Math.max(10, saved));
  });
  useEffect(() => {
    document.documentElement.style.setProperty('--editor-font-size', `${fontSize}px`);
    localStorage.setItem('sparky-font-size', fontSize.toString());
  }, [fontSize]);

  // ── Refine / iteration ──
  const [refineInput, setRefineInput] = useState('');

  // ── Settings ──
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsApiUrl, setSettingsApiUrl] = useState(() => localStorage.getItem('sparky-api-url') || '');
  const [settingsDefaultMarket, setSettingsDefaultMarket] = useState(
    () => localStorage.getItem('sparky-default-market') || 'GBL'
  );

  // ── Pinned sessions ──
  const [pinnedItems, setPinnedItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sparky-pins') || '[]'); } catch { return []; }
  });
  const [pinnedOpen, setPinnedOpen] = useState(false);

  // ── WebSocket ──
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:4000`;
    let socket;
    const connect = () => {
      setWsStatus('connecting');
      socket = new WebSocket(wsUrl);
      socket.onopen = () => setWsStatus('connected');
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'TRACE') setTrace(prev => [...prev, data]);
        } catch (e) {
          console.error('Failed to parse WS message', e);
        }
      };
      socket.onclose = () => { setWsStatus('disconnected'); setTimeout(connect, 3000); };
    };
    connect();
    return () => socket?.close();
  }, []);

  // ── Mode switch ──
  const handleModeSwitch = useCallback((m) => {
    setInputMode(m);
    setResult(null); setProposal(null); setParsedContext(null);
    setError(null); setTrace([]); setSplitView(false);
  }, []);

  // ── New Session ──
  const handleNewSession = useCallback(() => {
    setResult(null); setProposal(null); setParsedContext(null);
    setError(null); setTrace([]);
    setComponentName(''); setRequirement('');
    setPastedCode(''); setEventHint(''); setPasteRequirement('');
    setRefineInput(''); setSplitView(false);
  }, []);

  // ── Input change handlers ──
  const handleInputChange = useCallback((patch) => {
    if ('componentName' in patch) setComponentName(patch.componentName);
    if ('market' in patch) setMarket(patch.market);
  }, []);

  const handlePasteChange = useCallback((patch) => {
    if ('pastedCode'  in patch) setPastedCode(patch.pastedCode);
    if ('eventHint'   in patch) setEventHint(patch.eventHint);
    if ('requirement' in patch) setPasteRequirement(patch.requirement);
  }, []);

  // ── Generate (component mode) ──
  const handleGenerate = useCallback(async () => {
    if (!componentName.trim() || !requirement.trim()) {
      setError('Please enter a component name and requirement.'); return;
    }
    setLoading(true); setError(null); setResult(null); setProposal(null); setTrace([]);
    try {
      const data = await generateCode({ componentName, market, requirement, action: 'propose' });
      if (data.phase === 'proposal') {
        setProposal(data.proposal);
        setContextId(data.contextId ?? null);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }, [componentName, market, requirement]);

  const handleConfirm = useCallback(async () => {
    setLoading(true); setError(null); setTrace([]);
    try {
      const data = await generateCode({ componentName, market, requirement, action: 'execute', proposal, contextId });
      setResult(data); setProposal(null); setContextId(null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [componentName, market, requirement, proposal, contextId]);

  const handleCancel = useCallback(() => { setProposal(null); setResult(null); }, []);

  // ── Paste mode handlers ──
  const handlePasteAnalyze = useCallback(async () => {
    if (!pastedCode.trim() || !eventHint || !pasteRequirement.trim()) {
      setError('Please paste code, select an event type, and enter a requirement.'); return;
    }
    setLoading(true); setError(null); setResult(null); setParsedContext(null); setTrace([]);
    try {
      const data = await parseCode({ pastedCode, requirement: pasteRequirement });
      setParsedContext(data.parsedContext);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [pastedCode, eventHint, pasteRequirement]);

  const handlePasteGenerate = useCallback(async () => {
    setLoading(true); setError(null); setTrace([]);
    try {
      const data = await generatePasteCode({
        pastedCode, eventHint, requirement: pasteRequirement,
        parsedContext, action: 'paste-execute',
      });
      setResult(data); setParsedContext(null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [pastedCode, eventHint, pasteRequirement, parsedContext]);

  const handlePasteBack = useCallback(() => {
    setParsedContext(null); setResult(null); setError(null);
  }, []);

  // ── Refine (iteration mode) ──
  const handleRefine = useCallback(async () => {
    if (!refineInput.trim() || loading) return;
    setLoading(true); setError(null); setTrace([]);
    try {
      const data = await generateCode({ componentName, market, requirement: refineInput, action: 'execute' });
      setResult(data); setRefineInput('');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [componentName, market, refineInput, loading]);

  // ── Pin handlers ──
  const handlePin = useCallback(() => {
    if (!result) return;
    const id = componentName.trim() || `session-${Date.now()}`;
    const pin = { id, label: id, market, result, timestamp: Date.now() };
    setPinnedItems(prev => {
      const next = [pin, ...prev.filter(p => p.id !== id)].slice(0, 10);
      localStorage.setItem('sparky-pins', JSON.stringify(next));
      return next;
    });
  }, [result, componentName, market]);

  const handleUnpin = useCallback((id) => {
    setPinnedItems(prev => {
      const next = prev.filter(p => p.id !== id);
      localStorage.setItem('sparky-pins', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleLoadPin = useCallback((pin) => {
    setResult(pin.result); setComponentName(pin.label); setMarket(pin.market);
    setPinnedOpen(false); setSplitView(false);
  }, []);

  // ── Panel resize (drag handle) ──
  const handlePanelDragStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;
    const onMove = (ev) => setPanelWidth(Math.min(600, Math.max(260, startWidth + startX - ev.clientX)));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  // ── Settings save ──
  const handleSaveSettings = useCallback(() => {
    localStorage.setItem('sparky-api-url', settingsApiUrl);
    localStorage.setItem('sparky-default-market', settingsDefaultMarket);
    setMarket(settingsDefaultMarket);
    setSettingsOpen(false);
  }, [settingsApiUrl, settingsDefaultMarket]);

  // ── Ctrl+Enter global shortcut ──
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;
      if (loading) return;
      e.preventDefault();
      if (inputMode === 'component' && componentName.trim() && requirement.trim()) handleGenerate();
      else if (inputMode === 'paste' && pastedCode.trim() && eventHint && pasteRequirement.trim()) handlePasteAnalyze();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inputMode, loading, componentName, requirement, pastedCode, eventHint, pasteRequirement, handleGenerate, handlePasteAnalyze]);

  // ── Derived ──
  const hasResult = Boolean(result);
  const pasteReady = Boolean(pastedCode.trim() && eventHint && pasteRequirement.trim());
  const isPinned = pinnedItems.some(p => p.id === componentName.trim());
  const splitViewActive = splitView && inputMode === 'paste' && hasResult;

  const editorLabel = hasResult
    ? (componentName || 'output')
    : proposal ? 'technical-review'
    : parsedContext ? 'analyze-result'
    : 'untitled';
  const editorExt = hasResult ? 'peoplecode' : (proposal || parsedContext) ? 'md' : null;
  const wsColor = wsStatus === 'connected' ? '#4ec9b0' : wsStatus === 'connecting' ? '#cca700' : '#f44747';

  return (
    <div className="ide-wrapper">

      {/* ── Modals ── */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        apiUrl={settingsApiUrl}
        setApiUrl={setSettingsApiUrl}
        defaultMarket={settingsDefaultMarket}
        setDefaultMarket={setSettingsDefaultMarket}
        onSave={handleSaveSettings}
      />
      <PinnedDrawer
        open={pinnedOpen}
        onClose={() => setPinnedOpen(false)}
        items={pinnedItems}
        onLoad={handleLoadPin}
        onRemove={handleUnpin}
      />

      {/* ── Title Bar ── */}
      <div className="ide-titlebar">
        <div className="ide-titlebar-left">
          <SparkyLogo size={28} />
          <span className="ide-app-name">Sparky</span>
          <span className="ide-app-subtitle">PeopleCode Builder</span>
        </div>
        <div className="ide-titlebar-right">
          {(hasResult || proposal || parsedContext || componentName || requirement) && (
            <button className="ide-new-session" onClick={handleNewSession}>
              + New Session
            </button>
          )}
          <button
            className="apple-nav-btn"
            onClick={() => setPinnedOpen(true)}
            title="View pinned sessions"
            style={{ position: 'relative' }}
          >
            ⭐ Pinned
            {pinnedItems.length > 0 && <span className="pin-badge">{pinnedItems.length}</span>}
          </button>
          <button className="apple-nav-btn" onClick={toggleTheme} title="Toggle light / dark mode">
            {theme === 'dark' ? '☀ Light Mode' : '◑ Dark Mode'}
          </button>
          <button className="apple-nav-btn" onClick={() => setSettingsOpen(true)} title="App settings">
            ⚙ Settings
          </button>
        </div>
      </div>

      <main className="ide-main">

        {/* ── EDITOR PANE ── */}
        <section className="pane-editor">
          <div className="pane-editor-tabs">
            <EditorTab label={editorLabel} fileExt={editorExt} />
            <div className="pane-editor-tab-actions">
              {hasResult && inputMode === 'paste' && (
                <button
                  className="ide-button-icon"
                  onClick={() => setSplitView(v => !v)}
                  title="Toggle split view"
                  style={{ color: splitView ? 'var(--accent)' : undefined }}
                >
                  ⊞
                </button>
              )}
              {hasResult && (
                <button
                  className="ide-button-icon"
                  onClick={handlePin}
                  title={isPinned ? 'Update pin' : 'Pin this session'}
                  style={{ color: isPinned ? '#f7b731' : undefined }}
                >
                  ⭐
                </button>
              )}
              <button
                className="ide-button-icon"
                onClick={() => setPanelCollapsed(p => !p)}
                title={panelCollapsed ? 'Show panel' : 'Hide panel'}
              >
                {panelCollapsed ? '◂' : '▸'}
              </button>
            </div>
          </div>

          {/* Editor content */}
          <div
            className="pane-editor-content"
            style={splitViewActive ? { padding: 0, overflow: 'hidden' } : {}}
          >
            {!proposal && !parsedContext && !hasResult && !loading && (
              <EmptyState inputMode={inputMode} />
            )}

            {loading && !proposal && !parsedContext && !hasResult && (
              <TracePanel trace={trace} />
            )}

            {parsedContext && !hasResult && (
              <PasteConfirmCard
                parsedContext={parsedContext}
                eventHint={eventHint}
                onConfirm={handlePasteGenerate}
                onCancel={handlePasteBack}
                loading={loading}
              />
            )}

            {proposal && !result && (
              <ProposalView
                proposal={proposal}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
                loading={loading}
              />
            )}

            {hasResult && !splitViewActive && (
              <CodeOutput codeBlocks={result.codeBlocks} label={componentName || 'output'} />
            )}

            {splitViewActive && (
              <div className="split-view">
                <div className="split-pane">
                  <div className="split-pane-header">Original Code</div>
                  <div className="split-pane-content">
                    <pre className="ide-pre">
                      {pastedCode.split('\n').map((line, i) => (
                        <div key={i} className="line-row">
                          <span className="line-num">{i + 1}</span>
                          <span style={{ color: 'var(--text-primary)' }}>{line}</span>
                        </div>
                      ))}
                    </pre>
                  </div>
                </div>
                <div className="split-divider" />
                <div className="split-pane">
                  <div className="split-pane-header">Generated Code</div>
                  <div className="split-pane-content">
                    <CodeOutput codeBlocks={result.codeBlocks} label={componentName || 'output'} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Refine Bar (Iteration Mode) ── */}
          {hasResult && !loading && (
            <div className="refine-bar">
              <span className="ide-label" style={{ whiteSpace: 'nowrap' }}>Refine</span>
              <input
                className="ide-input"
                value={refineInput}
                onChange={e => setRefineInput(e.target.value)}
                placeholder="Describe a change or improvement to the generated code..."
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRefine(); } }}
                disabled={loading}
              />
              <button
                className="ide-button ide-button-primary"
                onClick={handleRefine}
                disabled={!refineInput.trim() || loading}
                style={{ whiteSpace: 'nowrap' }}
              >
                ▷ Run
              </button>
            </div>
          )}
        </section>

        {/* ── PANEL (RIGHT) ── */}
        {!panelCollapsed && (
          <>
            <div className="panel-drag-handle" onMouseDown={handlePanelDragStart} />
            <section
              className="pane-panel"
              style={{ width: panelWidth, minWidth: panelWidth, maxWidth: panelWidth }}
            >
              <div className="pane-panel-header">Requirement Setup</div>
              <div className="pane-panel-content">

                <div className="ide-mode-tabs">
                  <ModeTab mode="component" current={inputMode} label="New Component" onClick={handleModeSwitch} />
                  <ModeTab mode="paste"     current={inputMode} label="Edit Existing"  onClick={handleModeSwitch} />
                </div>

                {inputMode === 'component' ? (
                  <>
                    <ComponentInput componentName={componentName} market={market} onChange={handleInputChange} />
                    <RequirementInput value={requirement} onChange={setRequirement} />
                    <GenerateButton loading={loading} disabled={!componentName.trim() || !requirement.trim()} onClick={handleGenerate} />
                  </>
                ) : (
                  <>
                    <PasteInput
                      pastedCode={pastedCode}
                      eventHint={eventHint}
                      requirement={pasteRequirement}
                      onChange={handlePasteChange}
                    />
                    <button
                      className="ide-button ide-button-primary ide-button-full"
                      disabled={!pasteReady || loading}
                      onClick={handlePasteAnalyze}
                    >
                      {loading ? 'Analyzing...' : '⌕ Analyze Code'}
                    </button>
                  </>
                )}

                {error && <div className="ide-error">{error}</div>}

                {hasResult && (
                  <div className="ide-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                    <div className="ide-section-title">Agent Analysis</div>
                    <Explanation ragSources={result.ragSources} processingSteps={result.processingSteps} />
                  </div>
                )}

              </div>
            </section>
          </>
        )}

      </main>

      {/* ── Status Bar ── */}
      <div className="ide-statusbar">
        <div className="statusbar-item">
          <span style={{ color: wsColor }}>●</span>
          <span>{wsStatus === 'connected' ? 'Connected' : wsStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}</span>
        </div>
        <div className="statusbar-item">
          <span>Sparky v1.0</span>
        </div>
        {componentName && (
          <div className="statusbar-item">
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>{componentName}</span>
            {market && <span style={{ color: 'rgba(255,255,255,0.5)' }}> · {market}</span>}
          </div>
        )}
        <div className="statusbar-item" style={{ marginLeft: 'auto' }}>
          <span style={{ opacity: 0.7 }}>Ctrl+Enter to generate</span>
        </div>
        <div className="statusbar-item" style={{ gap: '4px' }}>
          <button className="statusbar-btn" onClick={() => setFontSize(s => Math.max(10, s - 1))} title="Decrease font size">A−</button>
          <span style={{ minWidth: '28px', textAlign: 'center', opacity: 0.85 }}>{fontSize}px</span>
          <button className="statusbar-btn" onClick={() => setFontSize(s => Math.min(20, s + 1))} title="Increase font size">A+</button>
        </div>
      </div>

    </div>
  );
}
