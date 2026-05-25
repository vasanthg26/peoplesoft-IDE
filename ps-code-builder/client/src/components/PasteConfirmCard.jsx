import React from 'react';

function MetaField({ label, value, mono = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span className="ide-label">{label}</span>
      <span style={{
        fontSize: '13px',
        color: 'var(--text-primary)',
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        background: 'var(--bg-input)',
        padding: '5px 9px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        wordBreak: 'break-all',
      }}>
        {value || '—'}
      </span>
    </div>
  );
}

export default function PasteConfirmCard({ parsedContext, eventHint, onConfirm, onCancel, loading }) {
  const { primaryRecord, records = [], fields = [], variables = [], scrollLevel, summary } = parsedContext;
  const otherRecords = records.filter((r) => r !== primaryRecord);

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      animation: 'ideFadeIn 0.2s ease-out',
    }}>
      <div style={{
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--text-primary)',
        paddingBottom: '12px',
        borderBottom: '1px solid var(--border)',
      }}>
        Code Analysis Complete
        <div style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)', marginTop: '4px' }}>
          Review the extracted context, then confirm to generate.
        </div>
      </div>

      {summary && (
        <div style={{
          padding: '10px 12px',
          background: 'var(--accent-dim)',
          border: '1px solid rgba(0, 122, 204, 0.3)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '12px',
          color: 'var(--text-primary)',
          lineHeight: '1.5',
        }}>
          <span style={{ fontWeight: 600, marginRight: '6px' }}>Summary:</span>{summary}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <MetaField label="Primary Record" value={primaryRecord} mono />
        <MetaField label="Event" value={eventHint} mono />
        <MetaField label="Scroll Level" value={`L${scrollLevel ?? 0}`} />
        <MetaField label="Other Records" value={otherRecords.length > 0 ? otherRecords.join(', ') : '(none)'} mono />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <span className="ide-label">Fields Referenced ({fields.length})</span>
        <div style={{
          padding: '8px 10px',
          background: 'var(--bg-input)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--text-primary)',
          lineHeight: '1.8',
          maxHeight: '72px',
          overflowY: 'auto',
        }}>
          {fields.length > 0 ? fields.join('  ·  ') : '(none extracted)'}
        </div>
      </div>

      {variables.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span className="ide-label">Variables Detected ({variables.length})</span>
          <div style={{
            padding: '8px 10px',
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--text-primary)',
            lineHeight: '1.8',
            maxHeight: '90px',
            overflowY: 'auto',
          }}>
            {variables.map((v) => (
              <div key={v.name}>
                <span style={{ color: 'var(--syn-variable)' }}>{v.name}</span>
                {': '}
                <span style={{ color: 'var(--syn-type)' }}>{v.type}</span>
                {v.record ? <span style={{ color: 'var(--text-secondary)' }}> → {v.record}</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          className="ide-button ide-button-primary"
          onClick={onConfirm}
          disabled={loading}
          style={{ flex: 1 }}
        >
          {loading ? 'Generating...' : '▷ Generate Code'}
        </button>
        <button
          className="ide-button ide-button-secondary"
          onClick={onCancel}
          disabled={loading}
        >
          Back
        </button>
      </div>
    </div>
  );
}
