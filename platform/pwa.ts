interface CapacitorWindow extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
}

/**
 * Registers the PWA service worker on the web, but leaves native WebViews to
 * Capacitor's bundled assets instead of caching them with Workbox.
 */
export function registerPwaServiceWorker(register: () => void): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const capacitor = (window as CapacitorWindow).Capacitor;
  if (capacitor?.isNativePlatform?.()) return;

  register();
}
