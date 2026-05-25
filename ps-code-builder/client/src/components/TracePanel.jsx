import React, { useEffect, useRef } from 'react';

const TracePanel = ({ trace }) => {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [trace]);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-code)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      overflow: 'hidden',
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
    }}>
      {/* Terminal header */}
      <div style={{
        padding: '8px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
      }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56', display: 'inline-block' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e', display: 'inline-block' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f', display: 'inline-block' }} />
        <span style={{
          color: 'var(--text-muted)',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginLeft: '4px',
        }}>
          Terminal — Sparky Agent
        </span>
      </div>

      <div ref={scrollRef} style={{
        flex: 1,
        padding: '14px 16px',
        overflowY: 'auto',
        scrollbarWidth: 'thin',
      }}>
        {trace.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--text-muted)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: 'rotate 1s linear infinite', flexShrink: 0 }}>
              <style>{`@keyframes rotate { to { transform: rotate(360deg); } }`}</style>
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="30 60" strokeLinecap="round" />
            </svg>
            <span>Initializing agents...</span>
          </div>
        ) : (
          trace.map((msg, i) => (
            <div key={i} style={{
              marginBottom: '6px',
              lineHeight: '1.5',
              animation: 'ideFadeIn 0.2s ease-out',
            }}>
              <span style={{ color: 'var(--text-muted)', marginRight: '10px' }}>
                [{new Date(msg.timestamp).toLocaleTimeString()}]
              </span>
              <span style={{
                color: msg.type === 'STATUS' ? 'var(--accent)' : 'var(--text-primary)',
              }}>
                {msg.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TracePanel;
