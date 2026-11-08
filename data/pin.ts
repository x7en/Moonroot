import type { Profile } from '../core/model/types';

const PIN_PBKDF2_ITERATIONS = 600_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function derivePinBits(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Browser crypto is unavailable.');
  }
  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PIN_PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function createPinLock(pin: string): Promise<Profile['lock']> {
  const clean = pin.trim();
  if (clean.length < 4) {
    throw new Error('PIN must be at least 4 digits.');
  }
  const salt = new Uint8Array(new ArrayBuffer(16));
  globalThis.crypto.getRandomValues(salt);
  const hashBytes = await derivePinBits(clean, salt);
  return {
    type: 'pin',
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hashBytes),
  };
}

export async function verifyPin(pin: string, lock: Profile['lock']): Promise<boolean> {
  if (lock.type !== 'pin' || !lock.salt || !lock.hash) return true;
  const clean = pin.trim();
  const salt = base64ToBytes(lock.salt);
  const actual = await derivePinBits(clean, salt);
  const expected = base64ToBytes(lock.hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= (actual[i] as number) ^ (expected[i] as number);
  }
  return diff === 0;
}
