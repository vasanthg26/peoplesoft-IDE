import React, { useState } from 'react';

export default function Explanation({ explanation, ragSources, processingSteps }) {
  const [showSteps, setShowSteps] = useState(false);

  const hasSources = ragSources?.length > 0;
  const hasSteps = processingSteps?.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {explanation && (
        <div style={{
          fontSize: '13px',
          lineHeight: '1.6',
          color: 'var(--text-secondary)',
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px',
        }}>
          {explanation}
        </div>
      )}

      {hasSources && (
        <div>
          <div className="ide-section-title" style={{ marginBottom: '8px' }}>Sources Used</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {ragSources.map((src, i) => (
              <span key={i} className="ide-tag">{src}</span>
            ))}
          </div>
        </div>
      )}

      {hasSteps && (
        <div>
          <button
            type="button"
            className="ide-button-icon"
            onClick={() => setShowSteps((s) => !s)}
          >
            <span>{showSteps ? '▾' : '▸'}</span>
            <span>{showSteps ? 'Hide' : 'Show'} processing trace</span>
          </button>

          {showSteps && (
            <div style={{
              marginTop: '8px',
              padding: '12px',
              background: 'var(--bg-code)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}>
              {processingSteps.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--text-muted)', minWidth: '20px' }}>{(i + 1).toString().padStart(2, '0')}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
