import React, { useState, useEffect } from 'react';
import { getBlocklist, addToBlocklist, removeFromBlocklist } from '../api';

const s = {
  section: {
    marginBottom: 16,
    background: 'var(--tg-section-bg, #fff)',
    borderRadius: 12,
    padding: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 10,
  },
  tagContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 20,
    fontSize: 13,
    backgroundColor: 'var(--tg-secondary-bg, #f0f0f0)',
    color: 'var(--tg-text, #000)',
    border: '1px solid var(--tg-border, #e0e0e0)',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--tg-destructive, #d32f2f)',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
    padding: 0,
    marginLeft: 2,
  },
  addRow: {
    display: 'flex',
    gap: 8,
    marginTop: 12,
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid var(--tg-border, #e0e0e0)',
    borderRadius: 8,
    fontSize: 14,
    backgroundColor: 'var(--tg-bg, #fff)',
    color: 'var(--tg-text, #000)',
    fontFamily: 'inherit',
  },
  addBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 8,
    backgroundColor: 'var(--tg-button, #2481cc)',
    color: 'var(--tg-button-text, #fff)',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  typeSelect: {
    padding: '8px',
    border: '1px solid var(--tg-border, #e0e0e0)',
    borderRadius: 8,
    fontSize: 14,
    backgroundColor: 'var(--tg-bg, #fff)',
    color: 'var(--tg-text, #000)',
    fontFamily: 'inherit',
  },
  empty: {
    fontSize: 13,
    color: 'var(--tg-hint, #999)',
    padding: '8px 0',
  },
  hint: {
    fontSize: 12,
    color: 'var(--tg-hint, #999)',
    marginTop: 12,
    textAlign: 'center',
  },
};

export default function Blocklist({ chatId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addType, setAddType] = useState('extension');
  const [addValue, setAddValue] = useState('');

  const load = () => {
    getBlocklist(chatId)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [chatId]);

  const handleAdd = async () => {
    if (!addValue.trim()) return;
    try {
      await addToBlocklist(chatId, addType, addValue.trim());
      setAddValue('');
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemove = async (type, value) => {
    try {
      await removeFromBlocklist(chatId, type, value);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--tg-hint, #999)' }}>Loading blocklist...</div>;
  }

  const renderTagList = (items, type, label) => (
    <div style={s.section}>
      <div style={s.sectionTitle}>{label}</div>
      {items.length === 0 ? (
        <div style={s.empty}>None</div>
      ) : (
        <div style={s.tagContainer}>
          {items.map((item) => {
            const val = typeof item === 'string' ? item : item.domain || item.value || item.file_name || item.file_id;
            return (
              <span key={val} style={s.tag}>
                {val}
                <button style={s.removeBtn} onClick={() => handleRemove(type, val)}>
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* Add new item */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Add to Blocklist</div>
        <div style={s.addRow}>
          <select style={s.typeSelect} value={addType} onChange={(e) => setAddType(e.target.value)}>
            <option value="extension">Extension</option>
            <option value="domain">Domain</option>
            <option value="allowed_domain">Allowed Domain</option>
          </select>
          <input
            style={s.input}
            placeholder={addType === 'extension' ? '.exe' : addType === 'domain' ? 'example.com' : 'example.com'}
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button style={s.addBtn} onClick={handleAdd}>Add</button>
        </div>
      </div>

      {/* Blocked extensions */}
      {data?.blocked_extensions && renderTagList(
        data.blocked_extensions.map((e) => ({ value: e })),
        'extension',
        'Blocked Extensions'
      )}

      {/* Blocked domains */}
      {data?.blocked_domains && renderTagList(data.blocked_domains, 'domain', 'Blocked Domains')}

      {/* Allowed domains */}
      {data?.allowed_domains && renderTagList(data.allowed_domains, 'allowed_domain', 'Allowed Domains')}

      {/* Blocked files */}
      {data?.blocked_files && data.blocked_files.length > 0 && renderTagList(
        data.blocked_files.map((f) => ({ ...f, value: f.file_name || f.file_id })),
        'file',
        'Blocked Files'
      )}

      <div style={s.hint}>
        Blocked extensions/domains are checked against every new message
      </div>
    </div>
  );
}