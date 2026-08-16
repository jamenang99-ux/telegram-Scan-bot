import React, { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '../api';

const s = {
  section: {
    marginBottom: 20,
    background: 'var(--tg-section-bg, #fff)',
    borderRadius: 12,
    padding: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 14,
    color: 'var(--tg-text, #000)',
  },
  field: {
    marginBottom: 14,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--tg-hint, #999)',
    marginBottom: 4,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--tg-border, #e0e0e0)',
    borderRadius: 8,
    fontSize: 14,
    backgroundColor: 'var(--tg-bg, #fff)',
    color: 'var(--tg-text, #000)',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--tg-border, #e0e0e0)',
    borderRadius: 8,
    fontSize: 14,
    backgroundColor: 'var(--tg-bg, #fff)',
    color: 'var(--tg-text, #000)',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    minHeight: 60,
    resize: 'vertical',
  },
  toggleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
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
  saveBtn: {
    width: '100%',
    padding: '12px',
    border: 'none',
    borderRadius: 10,
    backgroundColor: 'var(--tg-button, #2481cc)',
    color: 'var(--tg-button-text, #fff)',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
    fontFamily: 'inherit',
  },
  saved: {
    textAlign: 'center',
    fontSize: 13,
    color: 'var(--tg-button, #2481cc)',
    marginTop: 8,
  },
  error: {
    textAlign: 'center',
    fontSize: 13,
    color: 'var(--tg-destructive, #d32f2f)',
    marginTop: 8,
  },
};

export default function Dashboard({ chatId }) {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings(chatId)
      .then((data) => {
        setSettings(data.settings);
        setForm({
          flood_limit: data.settings.flood_limit,
          flood_seconds: data.settings.flood_seconds,
          max_warns: data.settings.max_warns,
          mute_duration_min: data.settings.mute_duration_min,
          captcha_enabled: !!data.settings.captcha_enabled,
          welcome_template: data.settings.welcome_template,
        });
        setLoading(false);
      })
      .catch((err) => {
        setMessage({ type: 'error', text: err.message });
        setLoading(false);
      });
  }, [chatId]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await updateSettings(chatId, {
        flood_limit: parseInt(form.flood_limit, 10),
        flood_seconds: parseInt(form.flood_seconds, 10),
        max_warns: parseInt(form.max_warns, 10),
        mute_duration_min: parseInt(form.mute_duration_min, 10),
        captcha_enabled: form.captcha_enabled ? 1 : 0,
        welcome_template: form.welcome_template,
      });
      setSettings(result.settings);
      setMessage({ type: 'saved', text: 'Settings saved!' });
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setSaving(false);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--tg-hint, #999)' }}>Loading settings...</div>;
  }

  return (
    <div>
      {/* Flood settings */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Flood Control</div>
        <div style={s.field}>
          <label style={s.label}>Message limit</label>
          <input
            style={s.input}
            type="number"
            min={1}
            value={form.flood_limit}
            onChange={(e) => handleChange('flood_limit', e.target.value)}
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Time window (seconds)</label>
          <input
            style={s.input}
            type="number"
            min={1}
            value={form.flood_seconds}
            onChange={(e) => handleChange('flood_seconds', e.target.value)}
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Mute duration (minutes)</label>
          <input
            style={s.input}
            type="number"
            min={1}
            value={form.mute_duration_min}
            onChange={(e) => handleChange('mute_duration_min', e.target.value)}
          />
        </div>
      </div>

      {/* Warn settings */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Warning System</div>
        <div style={s.field}>
          <label style={s.label}>Max warns before auto-ban</label>
          <input
            style={s.input}
            type="number"
            min={1}
            max={10}
            value={form.max_warns}
            onChange={(e) => handleChange('max_warns', e.target.value)}
          />
        </div>
      </div>

      {/* CAPTCHA toggle */}
      <div style={s.section}>
        <div style={s.sectionTitle}>New Member Captcha</div>
        <div style={s.toggleRow}>
          <span style={{ fontSize: 14 }}>Require CAPTCHA for new members</span>
          <button
            style={s.toggle(form.captcha_enabled)}
            onClick={() => handleChange('captcha_enabled', !form.captcha_enabled)}
          >
            <div
              style={{
                ...s.toggleKnob,
                left: form.captcha_enabled ? 22 : 2,
              }}
            />
          </button>
        </div>
      </div>

      {/* Welcome message */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Welcome Message</div>
        <div style={s.field}>
          <label style={s.label}>Template (use {'{name}'} and {'{chat}'})</label>
          <textarea
            style={s.textarea}
            value={form.welcome_template}
            onChange={(e) => handleChange('welcome_template', e.target.value)}
          />
        </div>
      </div>

      <button style={s.saveBtn} onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Settings'}
      </button>

      {message && (
        <div style={message.type === 'saved' ? s.saved : s.error}>
          {message.text}
        </div>
      )}
    </div>
  );
}