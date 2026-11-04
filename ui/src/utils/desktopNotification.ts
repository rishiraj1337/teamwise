// Desktop Notifications and PWA Support for Teamwise Platform

const NOTIFICATIONS_ENABLED_KEY = 'teamwise_desktop_notifications_enabled';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function areNotificationsEnabled(): boolean {
  if (!isNotificationSupported()) return false;
  const stored = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
  return stored === 'true' && Notification.permission === 'granted';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;

  if (Notification.permission === 'granted') {
    localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'true');
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, granted ? 'true' : 'false');
    return granted;
  }

  return false;
}

export function setNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? 'true' : 'false');
}

export function sendDesktopNotification(
  title: string,
  options: {
    body?: string;
    icon?: string;
    tag?: string;
    data?: Record<string, unknown>;
  } = {}
): Notification | null {
  if (!areNotificationsEnabled()) return null;

  try {
    const notification = new Notification(title, {
      body: options.body || '',
      icon: options.icon || '/favicon.svg',
      badge: '/favicon.svg',
      tag: options.tag || 'review-alert',
      data: options.data || {},
      silent: false,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return notification;
  } catch (err) {
    console.warn('Failed to dispatch desktop notification:', err);
    return null;
  }
}

export function registerServiceWorker(): void {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.debug('Service Worker registered successfully:', reg.scope);
        })
        .catch((err) => {
          console.debug('Service Worker registration skipped or failed:', err);
        });
    });
  }
}
