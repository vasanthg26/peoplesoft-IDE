import React from 'react';

export default function GenerateButton({ loading, disabled, onClick }) {
  const isDisabled = disabled || loading;

  return (
    <button
      className="ide-button ide-button-primary ide-button-full"
      disabled={isDisabled}
      onClick={onClick}
    >
      {loading ? (
        <>
          <LoadingSpinner />
          <span>Generating...</span>
        </>
      ) : (
        <span>▷ Generate PeopleCode</span>
      )}
    </button>
  );
}

function LoadingSpinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" className="spinner">
      <style>{`
        .spinner { animation: rotate 1s linear infinite; }
        @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <circle
        cx="12" cy="12" r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="30 60"
        strokeLinecap="round"
      />
    </svg>
  );
}
