import React from 'react';

const EVENTS = [
  { group: 'Field Events',     options: ['FieldEdit', 'FieldChange', 'FieldDefault', 'FieldFormula'] },
  { group: 'Record Events',    options: ['RowInit', 'RowInsert', 'RowDelete', 'SavePreChange', 'SavePostChange', 'SaveEdit'] },
  { group: 'Component Events', options: ['PreBuild', 'PostBuild', 'WorkFlow'] },
  { group: 'Page Events',      options: ['Activate', 'Deactivate'] },
];

export default function PasteInput({ pastedCode, eventHint, requirement, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div className="ide-field">
        <label className="ide-label">Existing PeopleCode Block</label>
        <textarea
          className="ide-textarea"
          value={pastedCode}
          placeholder="Paste the complete PeopleCode event block here..."
          onChange={(e) => onChange({ pastedCode: e.target.value })}
          spellCheck={false}
          style={{ minHeight: '200px' }}
        />
      </div>

      <div className="ide-field">
        <label className="ide-label">Event Type</label>
        <select
          className="ide-select"
          value={eventHint}
          onChange={(e) => onChange({ eventHint: e.target.value })}
        >
          <option value="">— Select event —</option>
          {EVENTS.map(({ group, options }) => (
            <optgroup key={group} label={group}>
              {options.map((ev) => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="ide-field">
        <label className="ide-label">New Requirement</label>
        <textarea
          className="ide-textarea"
          value={requirement}
          placeholder="Describe what needs to be added or changed..."
          onChange={(e) => onChange({ requirement: e.target.value })}
          spellCheck={false}
          style={{ minHeight: '90px', fontFamily: 'var(--font-sans)' }}
        />
      </div>
    </div>
  );
}
