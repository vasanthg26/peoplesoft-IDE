import React, { useState, useRef, useEffect } from 'react';

const TEMPLATES = [
  {
    label: 'Validate field on FieldEdit',
    text: 'On FieldEdit, validate that the field is not blank. If blank, display an appropriate error message and prevent the user from leaving the field.',
  },
  {
    label: 'Derive value on FieldChange',
    text: 'On FieldChange, use SQLExec to look up related data from a secondary record and populate the corresponding derived fields on the current record.',
  },
  {
    label: 'Default values on RowInit',
    text: 'On RowInit, default key fields to appropriate values. Set status to "A" (Active), date fields to the current date, and numeric amounts to 0.',
  },
  {
    label: 'Pre-save validation',
    text: 'On SavePreChange, validate all required fields on the primary record. If any are blank or fail business rules, issue an error message to prevent the save.',
  },
  {
    label: 'Post-save audit log',
    text: 'On SavePostChange, write an audit record to the audit table capturing the operator ID, date/time, and the values that were changed.',
  },
  {
    label: 'Row insert defaults',
    text: 'On RowInsert, copy key fields from the parent row and default numeric fields to 0, status fields to "A", and effective dates to today.',
  },
  {
    label: 'Conditional field visibility',
    text: 'Based on the value of a status field, use SetDisplayOnly to control which fields are editable or visible to the user on the page.',
  },
];

export default function RequirementInput({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const applyTemplate = (text) => {
    onChange(text);
    setOpen(false);
  };

  return (
    <div className="ide-field">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
        <label className="ide-label" style={{ margin: 0 }}>Development Requirement</label>
        <div className="templates-container" ref={containerRef}>
          <button
            type="button"
            className="ide-button-icon"
            style={{ fontSize: '11px', padding: '2px 7px' }}
            onClick={() => setOpen(v => !v)}
            title="Insert a requirement template"
          >
            Templates ▾
          </button>
          {open && (
            <div className="templates-dropdown">
              {TEMPLATES.map((t) => (
                <div key={t.label} className="template-item" onClick={() => applyTemplate(t.text)}>
                  <div className="template-item-label">{t.label}</div>
                  <div className="template-item-preview">{t.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <textarea
        className="ide-textarea"
        value={value}
        placeholder={`Describe what you need in plain English, e.g.:\n\n• Validate vendor ID on field change\n• Before save, verify all required fields on PO_HDR\n• When a new row is inserted, default quantity to 1`}
        onChange={(e) => onChange(e.target.value)}
        style={{ minHeight: '140px' }}
        spellCheck={false}
      />
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        Sparky will analyze this to generate a surgical PeopleCode plan.
      </div>
    </div>
  );
}
