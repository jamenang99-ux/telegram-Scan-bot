/**
 * Telegram theme integration
 * Applies Telegram WebApp theme params as CSS custom properties
 * and handles dark/light mode.
 */
(function applyTelegramTheme() {
  const tw = window.Telegram?.WebApp;
  if (!tw) return;

  // Signal readiness
  tw.ready();

  // Expand to full height
  tw.expand();

  // Apply theme params as CSS variables
  const root = document.documentElement;
  const vars = {
    '--tg-bg': tw.themeParams?.bg_color || '#ffffff',
    '--tg-text': tw.themeParams?.text_color || '#000000',
    '--tg-hint': tw.themeParams?.hint_color || '#999999',
    '--tg-link': tw.themeParams?.link_color || '#2481cc',
    '--tg-button': tw.themeParams?.button_color || '#2481cc',
    '--tg-button-text': tw.themeParams?.button_text_color || '#ffffff',
    '--tg-secondary-bg': tw.themeParams?.secondary_bg_color || '#f0f0f0',
    '--tg-section-bg': tw.themeParams?.section_bg_color || '#ffffff',
    '--tg-header-bg': tw.themeParams?.header_bg_color || '#f0f0f0',
    '--tg-accent': tw.themeParams?.accent_text_color || '#2481cc',
    '--tg-destructive': tw.themeParams?.destructive_text_color || '#d32f2f',
    '--tg-border': tw.themeParams?.section_separator_color || '#e0e0e0',
  };

  Object.entries(vars).forEach(([key, val]) => root.style.setProperty(key, val));

  // Toggle class for dark mode
  if (tw.colorScheme === 'dark') {
    root.classList.add('tg-dark');
  } else {
    root.classList.remove('tg-dark');
  }

  // Re-apply when theme changes
  tw.onEvent('themeChanged', () => {
    const newVars = {
      '--tg-bg': tw.themeParams?.bg_color || '#ffffff',
      '--tg-text': tw.themeParams?.text_color || '#000000',
      '--tg-hint': tw.themeParams?.hint_color || '#999999',
      '--tg-link': tw.themeParams?.link_color || '#2481cc',
      '--tg-button': tw.themeParams?.button_color || '#2481cc',
      '--tg-button-text': tw.themeParams?.button_text_color || '#ffffff',
      '--tg-secondary-bg': tw.themeParams?.secondary_bg_color || '#f0f0f0',
      '--tg-section-bg': tw.themeParams?.section_bg_color || '#ffffff',
      '--tg-header-bg': tw.themeParams?.header_bg_color || '#f0f0f0',
      '--tg-accent': tw.themeParams?.accent_text_color || '#2481cc',
      '--tg-destructive': tw.themeParams?.destructive_text_color || '#d32f2f',
      '--tg-border': tw.themeParams?.section_separator_color || '#e0e0e0',
    };
    Object.entries(newVars).forEach(([key, val]) => root.style.setProperty(key, val));
    root.classList.toggle('tg-dark', tw.colorScheme === 'dark');
  });
})();