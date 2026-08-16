import React, { useState, useEffect } from 'react';
import { getLocks, setLock } from '../api';

const LOCK_LABELS = {
  links: 'Links',
  media: 'Media',
  forwards: 'Forwards',
  stickers: 'Stickers',
  gifs: 'GIFs',
  inline_bots: 'Inline Bots',
  polls: 'Polls',
  games: 'Games',
};

const LOCK_ICONS = {
  links: '🔗',
  media: '📷',
  forwards: '↪️',
  stickers: '🏷️',
  gifs: '🎞️',
  inline_bots: '🤖',
  polls: '📊',
  games: '🎮',
};

const s = {
  section: {
    background: 'var(--tg-section-bg, #fff)',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  lockRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid var(--tg-border, #e0e0e0)',
  },
  lockInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  lockIcon: {
    fontSize: 18,
    width: 28,
    textAlign: 'center',
  },
  lockLabel: {
    fontSize: 14,
    fontWeight: 500,
  },
  toggle: (on) => ({
    width: 44,
    height: 24,
    borderRadius: 12,
    border: 'none',
    backgroundColor: on ? 'var(--tg-button, #2481cc)' : 'var(--tg-border, #e0e0e0)',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background-color 0.2s',
    flexShrink: 0,
  }),
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    backgroundColor: '#fff',
    position: 'absolute',
    top: 2,
    transition: 'left 0.2s',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  },
  hint: {
    textAlign: 'center',
    fontSize: 12,
    color: 'var(--tg-hint, #999)',
    padding: '12px 16px',
  },
};

export default function Locks({ chatId }) {
  const [locks, setLocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    getLocks(chatId)
      .then((data) => {
        setLocks(data.locks);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load locks:', err);
        setLoading(false);
      });
  }, [chatId]);

  const handleToggle = async (lockType, currentEnabled) => {
    setUpdating(lockType);
    setLocks((prev) =>
      prev.map((l) =>
        l.lock_type === lockType ? { ...l, enabled: currentEnabled ? 0 : 1 } : l
      )
    );
    try {
      await setLock(chatId, lockType, !currentEnabled);
    } catch (err) {
      // Revert on error
      setLocks((prev) =>
        prev.map((l) =>
          l.lock_type === lockType ? { ...l, enabled: currentEnabled } : l
        )
      );
    }
    setUpdating(null);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--tg-hint, #999)' }}>Loading locks...</div>;
  }

  return (
    <div>
      <div style={s.section}>
        {locks.map((lock) => (
          <div key={lock.lock_type} style={s.lockRow}>
            <div style={s.lockInfo}>
              <span style={s.lockIcon}>{LOCK_ICONS[lock.lock_type] || '🔒'}</span>
              <span style={s.lockLabel}>{LOCK_LABELS[lock.lock_type] || lock.lock_type}</span>
            </div>
            <button
              style={s.toggle(!!lock.enabled)}
              onClick={() => handleToggle(lock.lock_type, !!lock.enabled)}
              disabled={updating === lock.lock_type}
            >
              <div
                style={{
                  ...s.toggleKnob,
                  left: lock.enabled ? 22 : 2,
                }}
              />
            </button>
          </div>
        ))}
      </div>
      <div style={s.hint}>
        When a lock is enabled, that type of content is automatically deleted
      </div>
    </div>
  );
}