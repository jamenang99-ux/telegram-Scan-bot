import React, { useState, useEffect } from 'react';
import { initialize, getAuthState } from './api';
import Dashboard from './pages/Dashboard';
import Locks from './pages/Locks';
import Blocklist from './pages/Blocklist';
import ModLogs from './pages/ModLogs';

// Inline styles matching Telegram theme
const styles = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    backgroundColor: 'var(--tg-bg, #fff)',
    color: 'var(--tg-text, #000)',
    minHeight: '100vh',
    margin: 0,
    padding: 0,
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '80vh',
    gap: 12,
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid var(--tg-border, #e0e0e0)',
    borderTopColor: 'var(--tg-button, #2481cc)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  error: {
    padding: 24,
    textAlign: 'center',
    color: 'var(--tg-destructive, #d32f2f)',
    lineHeight: 1.6,
  },
  nav: {
    display: 'flex',
    borderBottom: '1px solid var(--tg-border, #e0e0e0)',
    backgroundColor: 'var(--tg-header-bg, #f0f0f0)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  tab: (active) => ({
    flex: 1,
    minWidth: 0,
    padding: '12px 8px',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--tg-button, #2481cc)' : 'var(--tg-hint, #999)',
    borderBottom: active ? '2px solid var(--tg-button, #2481cc)' : '2px solid transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    background: 'none',
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    fontFamily: 'inherit',
    transition: 'color 0.15s, border-color 0.15s',
  }),
  header: {
    padding: '16px 16px 8px',
    borderBottom: '1px solid var(--tg-border, #e0e0e0)',
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: 600,
    margin: 0,
  },
  userBadge: {
    fontSize: 12,
    color: 'var(--tg-hint, #999)',
    marginTop: 4,
  },
  main: {
    padding: 16,
  },
};

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'locks', label: 'Locks' },
  { key: 'blocklist', label: 'Blocklist' },
  { key: 'modlogs', label: 'Mod Logs' },
];

export default function App() {
  const [authData, setAuthData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    // Parse start_param from URL if present
    const params = new URLSearchParams(window.location.search);
    const startParam = params.get('tgWebAppStartParam') || params.get('start_param');
    let chatId = null;
    if (startParam && startParam.startsWith('chat_')) {
      chatId = parseInt(startParam.slice(5), 10);
    }

    initialize(chatId)
      .then((state) => {
        setAuthData(state);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <div style={{ color: 'var(--tg-hint, #999)', fontSize: 14 }}>
            Connecting to Telegram...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <div><strong>Authentication failed</strong></div>
          <div style={{ marginTop: 8, fontSize: 13 }}>{error}</div>
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--tg-hint, #999)' }}>
            Make sure you opened this app from Telegram
          </div>
        </div>
      </div>
    );
  }

  const chat = authData?.chat;

  const renderPage = () => {
    const chatId = chat?.id;
    if (!chatId) {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--tg-hint, #999)' }}>
          Open this Mini App from a group where the bot is admin
        </div>
      );
    }
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard chatId={chatId} />;
      case 'locks':
        return <Locks chatId={chatId} />;
      case 'blocklist':
        return <Blocklist chatId={chatId} />;
      case 'modlogs':
        return <ModLogs chatId={chatId} />;
      default:
        return null;
    }
  };

  return (
    <div style={styles.container}>
      {/* Chat header */}
      {chat && (
        <div style={styles.header}>
          <h1 style={styles.chatTitle}>{chat.title || `Chat ${chat.id}`}</h1>
          <div style={styles.userBadge}>
            {authData.user?.first_name || 'User'} ·{' '}
            {authData.adminStatus === 'creator' ? 'Creator' : 'Admin'}
          </div>
        </div>
      )}

      {/* Nav tabs */}
      <div style={styles.nav}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            style={styles.tab(activeTab === tab.key)}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Page content */}
      <div style={styles.main}>{renderPage()}</div>
    </div>
  );
}