import React from 'react';

export default function ProposalView({ proposal, onConfirm, onCancel, loading }) {
  if (!proposal) return null;

  return (
    <div className="ide-proposal">
      <div className="ide-proposal-title">Technical Review</div>

      <div className="ide-proposal-body">
        {proposal.split('\n').map((line, i) => {
          if (line.startsWith('###')) {
            return (
              <div key={i} className="ide-proposal-h3">
                {line.replace('###', '').trim()}
              </div>
            );
          }
          if (line.startsWith('-')) {
            return (
              <div key={i} className="ide-proposal-bullet">
                <span className="ide-proposal-bullet-dot">›</span>
                <span>{line.replace(/^-\s*/, '')}</span>
              </div>
            );
          }
          if (line.trim() === '') return <div key={i} style={{ height: '10px' }} />;
          return <p key={i} style={{ marginBottom: '10px' }}>{line}</p>;
        })}
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          className="ide-button ide-button-secondary"
          onClick={onCancel}
          disabled={loading}
        >
          Discard
        </button>
        <button
          className="ide-button ide-button-primary"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Executing...' : 'Proceed to Code'}
        </button>
      </div>
    </div>
  );
}
