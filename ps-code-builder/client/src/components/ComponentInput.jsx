import React from 'react';

const MARKETS = ['GBL', 'USA', 'CAN', 'GBR', 'AUS', 'DEU', 'FRA', 'JPN'];

export default function ComponentInput({ componentName, market, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div className="ide-field">
        <label className="ide-label">Component Name</label>
        <input
          type="text"
          className="ide-input"
          value={componentName}
          placeholder="e.g. PURCHASE_ORDER"
          onChange={(e) => onChange({ componentName: e.target.value.toUpperCase() })}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="ide-field">
        <label className="ide-label">Target Market</label>
        <select
          className="ide-select"
          value={market}
          onChange={(e) => onChange({ market: e.target.value })}
        >
          {MARKETS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
