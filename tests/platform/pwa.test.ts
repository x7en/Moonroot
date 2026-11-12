// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPwaServiceWorker } from '../../platform/pwa';

interface CapacitorWindow extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
}

describe('PWA service worker registration', () => {
  let capacitorDescriptor: PropertyDescriptor | undefined;
  let serviceWorkerDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    capacitorDescriptor = Object.getOwnPropertyDescriptor(window, 'Capacitor');
    serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    Reflect.deleteProperty(window, 'Capacitor');
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    });
  });

  afterEach(() => {
    if (capacitorDescriptor) {
      Object.defineProperty(window, 'Capacitor', capacitorDescriptor);
    } else {
      Reflect.deleteProperty(window, 'Capacitor');
    }
    if (serviceWorkerDescriptor) {
      Object.defineProperty(navigator, 'serviceWorker', serviceWorkerDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });

  it('registers on web when Capacitor is absent and skips native WebViews', () => {
    const registerSW = vi.fn();
    registerPwaServiceWorker(registerSW);
    expect(registerSW).toHaveBeenCalledTimes(1);

    const isNativePlatform = vi.fn(() => true);
    (window as CapacitorWindow).Capacitor = { isNativePlatform };
    registerPwaServiceWorker(registerSW);

    expect(isNativePlatform).toHaveBeenCalledOnce();
    expect(registerSW).toHaveBeenCalledTimes(1);
  });
});
