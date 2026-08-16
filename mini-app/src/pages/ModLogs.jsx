import React, { useState, useEffect, useCallback } from 'react';
import { getModLogs } from '../api';

const ACTION_COLORS = {
  auto_mute: { bg: '#fff3e0', text: '#e65100' },
  auto_ban: { bg: '#ffebee', text: '#c62828' },
  ban: { bg: '#ffebee', text: '#c62828' },
  kick: { bg: '#fce4ec', text: '#880e4f' },
  mute: { bg: '#fff3e0', text: '#e65100' },
  unmute: { bg: '#e8f5e9', text: '#2e7d32' },
  unban: { bg: '#e8f5e9', text: '#2e7d32' },
  warn: { bg: '#fff8e1', text: '#f57f17' },
  unwarn: { bg: '#e8f5e9', text: '#2e7d32' },
  delete_file: { bg: '#fce4ec', text: '#b71c1c' },
  delete_link: { bg: '#fce4ec', text: '#b71c1c' },
  captcha_passed: { bg: '#e8f5e9', text: '#2e7d32' },
  captcha_timeout_kick: { bg: '#ffebee', text: '#c62828' },
};

const s = {
  controls: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  count: {
    fontSize: 13,
    color: 'var(--tg-hint, #999)',
  },
  loadMore: {
    padding: '8px 16px',
    border: '1px solid var(--tg-border, #e0e0e0)',
    borderRadius: 8,
    backgroundColor: 'var(--tg-section-bg, #fff)',
    color: 'var(--tg-button, #2481cc)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  logItem: {
    padding: '10px 14px',
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: 'var(--tg-section-bg, #fff)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
    border: '1px solid var(--tg-border, #e0e0e0)',
  },
  logHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionBadge: (action) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    backgroundColor: ACTION_COLORS[action]?.bg || '#f0f0f0',
    color: ACTION_COLORS[action]?.text || '#333',
  }),
  logMeta: {
    fontSize: 12,
    color: 'var(--tg-hint, #999)',
  },
  logReason: {
    fontSize: 13,
    color: 'var(--tg-text, #000)',
    marginTop: 2,
    wordBreak: 'break-word',
  },
  empty: {
    textAlign: 'center',
    padding: 40,
    color: 'var(--tg-hint, #999)',
    fontSize: 14,
  },
  loading: {
    textAlign: 'center',
    padding: 40,
    color: 'var(--tg-hint, #999)',
  },
};

export default function ModLogs({ chatId }) {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (offset = 0) => {
    try {
      const data = await getModLogs(chatId, 50, offset);
      if (offset === 0) {
        setLogs(data.logs);
      } else {
        setLogs((prev) => [...prev, ...data.logs]);
      }
      setPagination(data.pagination);
    } catch (err) {
      console.error('Failed to load mod logs:', err);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => { load(0); }, [load]);

  const handleLoadMore = () => {
    if (pagination && pagination.has_more) {
      load(pagination.offset + pagination.limit);
    }
  };

  const formatTime = (ts) => {
    try {
      const d = new Date(ts + 'Z');
      return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  if (loading) {
    return <div style={s.loading}>Loading mod logs...</div>;
  }

  if (logs.length === 0) {
    return <div style={s.empty}>No moderation actions recorded yet</div>;
  }

  return (
    <div>
      <div style={s.controls}>
        <span style={s.count}>{pagination?.total || logs.length} total actions</span>
      </div>

      {logs.map((log) => (
        <div key={log.id} style={s.logItem}>
          <div style={s.logHeader}>
            <span style={s.actionBadge(log.action)}>{log.action}</span>
            <span style={s.logMeta}>{formatTime(log.created_at)}</span>
          </div>
          <div style={s.logMeta}>
            {log.target_id ? `Target: ${log.target_id}` : ''}
            {log.actor_id ? ` · By: ${log.actor_id}` : ' · Auto'}
          </div>
          {log.reason && (
            <div style={s.logReason}>{log.reason}</div>
          )}
        </div>
      ))}

      {pagination?.has_more && (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <button style={s.loadMore} onClick={handleLoadMore}>
            Load More ({pagination.total - logs.length} remaining)
          </button>
        </div>
      )}
    </div>
  );
}