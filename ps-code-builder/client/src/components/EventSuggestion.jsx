import React from 'react';

const EVENT_COLOURS = {
  FieldEdit:      { bg: 'rgba(255, 149, 0, 0.1)',  text: '#ff9500' },
  FieldChange:    { bg: 'rgba(0, 122, 255, 0.1)',  text: '#007aff' },
  SavePreChange:  { bg: 'rgba(175, 82, 222, 0.1)', text: '#af52de' },
  SavePostChange: { bg: 'rgba(52, 199, 89, 0.1)',  text: '#34c759' },
  RowInit:        { bg: 'rgba(52, 199, 89, 0.1)',  text: '#34c759' },
  RowInsert:      { bg: 'rgba(0, 122, 255, 0.1)',  text: '#007aff' },
  FieldDefault:   { bg: 'rgba(255, 204, 0, 0.1)',  text: '#ffcc00' },
  PostBuild:      { bg: 'rgba(0, 122, 255, 0.1)',  text: '#007aff' },
  PreBuild:       { bg: 'rgba(0, 122, 255, 0.1)',  text: '#007aff' },
  Activate:       { bg: 'rgba(52, 199, 89, 0.1)',  text: '#34c759' },
  Deactivate:     { bg: 'rgba(255, 59, 48, 0.1)',  text: '#ff3b30' },
};

const CONFIDENCE_COLOURS = {
  high:   { color: 'var(--success)', label: 'High' },
  medium: { color: 'var(--accent)',  label: 'Medium' },
  low:    { color: 'var(--error)',   label: 'Low' },
};

export default function EventSuggestion({ codeBlock }) {
  if (!codeBlock?.suggestedEvent) return null;

  const {
    suggestedEvent,
    suggestedRecord,
    suggestedField,
    confidence,
    location,
    suggestedPage,
  } = codeBlock;

  const colours = EVENT_COLOURS[suggestedEvent] ?? { bg: 'var(--bg-input)', text: 'var(--text-secondary)' };
  const conf    = CONFIDENCE_COLOURS[confidence] ?? CONFIDENCE_COLOURS.medium;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        {/* Main Event Badge */}
        <span style={{
          fontSize: '11px', fontWeight: 700, padding: '2px 8px',
          background: colours.bg, color: colours.text,
          borderRadius: 'var(--radius-sm)', border: `1px solid ${colours.text}44`,
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {suggestedEvent}
        </span>

        {/* Confidence pill */}
        <span style={{ fontSize: '12px', fontWeight: 500, color: conf.color, opacity: 0.8 }}>
          • {conf.label} Confidence
        </span>
      </div>

      <div style={{
        background: 'var(--bg-input)',
        padding: '12px 16px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Target</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)' }}>
            {location || `${suggestedRecord}${suggestedField ? `.${suggestedField}` : ''}`}
          </span>
        </div>

        {suggestedPage && (
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '12px', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Scope</span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Component Page: <span style={{ fontFamily: 'var(--font-mono)' }}>{suggestedPage}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
