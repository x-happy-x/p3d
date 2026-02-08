import React from "react";

type HistoryEntry = {
  key: string;
  label: string;
  time: number;
  index: number;
  disabled: boolean;
};

type Props = {
  entries: HistoryEntry[];
  onJump: (index: number) => void;
  formatTime: (time: number) => string;
};

export default function HistoryPanel({ entries, onJump, formatTime }: Props) {
  return (
    <div className="history-list">
      {entries.length ? (
        [...entries].reverse().map((entry) => (
          <button
            key={entry.key}
            className={`history-item${entry.disabled ? " disabled" : ""}`}
            type="button"
            disabled={entry.disabled}
            onClick={() => {
              onJump(entry.index);
            }}
          >
            <span className="history-title">{entry.label}</span>
            <span className="history-time">{formatTime(entry.time)}</span>
          </button>
        ))
      ) : (
        <div className="history-empty">История пуста.</div>
      )}
    </div>
  );
}
