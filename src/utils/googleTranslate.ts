/**
 * Headless Google Translate Element Utilities
 * Supports zero-cost real-time multi-language translation across 10 languages:
 * 1. English (en, default)
 * 2. Nepali (ne, नेपाली)
 * 3. Chinese (zh-CN, 简体中文)
 * 4. Hindi (hi, हिन्दी)
 * 5. Korean (ko, 한국어)
 * 6. Japanese (ja, 日本語)
 * 7. Thai (th, ภาษาไทย)
 * 8. Filipino (tl, Filipino)
 * 9. Sinhala (si, සිංහල)
 * 10. Tamil (ta, தமிழ்)
 */

export interface SupportedLanguage {
  code: string;
  label: string;
  nativeLabel: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'ne', label: 'Nepali', nativeLabel: 'नेपाली' },
  { code: 'zh-CN', label: 'Chinese (Simplified)', nativeLabel: '简体中文' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'th', label: 'Thai', nativeLabel: 'ภาษาไทย' },
  { code: 'tl', label: 'Filipino', nativeLabel: 'Filipino' },
  { code: 'si', label: 'Sinhala', nativeLabel: 'සිංහල' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
];

export const INCLUDED_LANGUAGES_PARAM = 'en,ne,zh-CN,hi,ko,ja,th,tl,si,ta';
export const CUSTOMER_LANGUAGE_STORAGE_KEY = 'serveflow_customer_language';

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: any;
  }
}

/**
 * Read the customer's manually chosen language from localStorage if any
 */
export function getSavedCustomerLanguage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = localStorage.getItem(CUSTOMER_LANGUAGE_STORAGE_KEY);
    if (val && SUPPORTED_LANGUAGES.some((l) => l.code === val)) {
      return val;
    }
  } catch (e) {
    console.warn('Failed to read customer language from localStorage:', e);
  }
  return null;
}

/**
 * Persist the customer's choice in localStorage
 */
export function saveCustomerLanguage(code: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (SUPPORTED_LANGUAGES.some((l) => l.code === code)) {
      localStorage.setItem(CUSTOMER_LANGUAGE_STORAGE_KEY, code);
    }
  } catch (e) {
    console.warn('Failed to save customer language to localStorage:', e);
  }
}

/**
 * Thoroughly purges all googtrans cookies across domain and path variants
 */
export function clearGoogleTranslateCookie(): void {
  if (typeof document === 'undefined') return;

  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  const domainParts = (!isLocalhost && host && host.includes('.')) ? host.split('.') : [];
  const rootDomain = domainParts.length > 1 ? `.${domainParts.slice(-2).join('.')}` : (host ? `.${host}` : '');

  const domains = ['', host, `.${host}`];
  if (rootDomain && !domains.includes(rootDomain)) domains.push(rootDomain);
  if (rootDomain && !domains.includes(`.${rootDomain.replace(/^\./, '')}`)) {
    domains.push(`.${rootDomain.replace(/^\./, '')}`);
  }

  const paths = ['/', '', typeof window !== 'undefined' ? window.location.pathname : ''];

  domains.forEach((d) => {
    paths.forEach((p) => {
      const dAttr = d ? `; domain=${d}` : '';
      const pAttr = p ? `; path=${p}` : '';
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; max-age=0${pAttr}${dAttr};`;
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0${pAttr}${dAttr};`;
    });
  });

  if (document.cookie.includes('googtrans')) {
    document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=/;';
    document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0;';
  }
}

/**
 * Configure the googtrans cookie used by Google Translate
 */
export function setGoogleTranslateCookie(langCode: string): void {
  if (typeof document === 'undefined') return;

  // Clear existing cookies first across all scopes
  clearGoogleTranslateCookie();

  // If English (native language), do NOT write any googtrans cookie at all!
  // Writing '/en/en' confuses Google Translate and prevents reverting to English.
  if (langCode === 'en') {
    return;
  }

  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  const domainParts = (!isLocalhost && host && host.includes('.')) ? host.split('.') : [];
  const rootDomain = domainParts.length > 1 ? `.${domainParts.slice(-2).join('.')}` : (host ? `.${host}` : '');

  const targetVal = `/en/${langCode}`;
  document.cookie = `googtrans=${targetVal}; path=/;`;
  if (!isLocalhost && host) {
    document.cookie = `googtrans=${targetVal}; path=/; domain=.${host};`;
  }
  if (rootDomain && rootDomain !== `.${host}`) {
    document.cookie = `googtrans=${targetVal}; path=/; domain=${rootDomain};`;
  }
}

/**
 * Dispatches a change event on the hidden Google Translate select combo
 */
export function triggerGoogleTranslateCombo(langCode: string): boolean {
  if (typeof document === 'undefined') return false;

  const select = document.querySelector('.goog-te-combo') as HTMLSelectElement | null;
  if (!select) return false;

  // Find matching option
  let targetOption: HTMLOptionElement | null = null;
  for (let i = 0; i < select.options.length; i++) {
    const opt = select.options[i];
    if (opt.value === langCode) {
      targetOption = opt;
      break;
    }
  }

  // If resetting to English and no explicit 'en' option, the original language is typically ''
  if (!targetOption && langCode === 'en') {
    for (let i = 0; i < select.options.length; i++) {
      const opt = select.options[i];
      if (opt.value === '' || opt.value.toLowerCase() === 'en') {
        targetOption = opt;
        break;
      }
    }
  }

  if (targetOption) {
    select.value = targetOption.value;
  } else {
    select.value = langCode;
  }

  // Dispatch change event with bubbling and cancellation
  select.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  if (typeof (select as any).onchange === 'function') {
    try {
      (select as any).onchange(new Event('change', { bubbles: true }));
    } catch {}
  }
  return true;
}

/**
 * Applies a target language immediately via cookie and DOM event
 * Retries for several seconds if Google script is still initializing
 */
export function applyLanguage(langCode: string): void {
  if (langCode === 'en') {
    // English is the native page language. Purge all translation cookies so Google Translate remains dormant.
    clearGoogleTranslateCookie();

    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('translated-ltr', 'translated-rtl');
      document.body?.classList.remove('translated-ltr', 'translated-rtl');
    }

    const select = document.querySelector('.goog-te-combo') as HTMLSelectElement | null;
    if (select && select.value !== '') {
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      if (typeof (select as any).onchange === 'function') {
        try {
          (select as any).onchange(new Event('change', { bubbles: true }));
        } catch {}
      }
    }
    return;
  }

  // Non-English language: Set cookie, ensure widget is mounted, and trigger combo
  setGoogleTranslateCookie(langCode);
  initGoogleTranslate();

  const applied = triggerGoogleTranslateCombo(langCode);
  if (!applied) {
    let attempts = 0;
    const maxAttempts = 35; // 35 * 150ms = 5.25 seconds
    const interval = setInterval(() => {
      attempts++;
      const success = triggerGoogleTranslateCombo(langCode);
      if (success || attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 150);
  }
}

/**
 * Ensures Google Translate element script is attached and initialized
 */
export function initGoogleTranslate(): void {
  if (typeof window === 'undefined') return;

  // Mount container if missing
  let container = document.getElementById('google_translate_element');
  if (!container) {
    container = document.createElement('div');
    container.id = 'google_translate_element';
    container.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;z-index:-9999;';
    document.body.prepend(container);
  }

  const createWidget = () => {
    try {
      if (window.google?.translate?.TranslateElement && !document.querySelector('.goog-te-combo')) {
        new window.google.translate.TranslateElement(
          {
            pageLanguage: 'en',
            includedLanguages: INCLUDED_LANGUAGES_PARAM,
            autoDisplay: false,
          },
          'google_translate_element'
        );
      }
    } catch (e) {
      console.warn('Google translate init warning:', e);
    }
  };

  if (window.google?.translate?.TranslateElement) {
    createWidget();
  } else {
    const prevInit = window.googleTranslateElementInit;
    window.googleTranslateElementInit = () => {
      if (typeof prevInit === 'function') {
        try { prevInit(); } catch {}
      }
      createWidget();
    };
  }

  // If script tag is missing, append it
  if (!document.getElementById('google-translate-script')) {
    const script = document.createElement('script');
    script.id = 'google-translate-script';
    script.type = 'text/javascript';
    script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }
}
