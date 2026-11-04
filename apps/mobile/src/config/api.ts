export const CURRENT_CONSENT_VERSION = '1.0';

// Default development API targets
const EMULATOR_API_URL = 'http://10.0.2.2:4000/api/v1';
const LOCALHOST_API_URL = 'http://localhost:4000/api/v1';

let runtimeApiUrl: string | null = null;

function getPlatformOS(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN = require('react-native');
    return RN?.Platform?.OS || 'android';
  } catch {
    return 'node';
  }
}

export function getApiBaseUrl(): string {
  if (runtimeApiUrl) {
    return runtimeApiUrl;
  }

  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  if (getPlatformOS() === 'android') {
    return EMULATOR_API_URL;
  }

  return LOCALHOST_API_URL;
}

export function setCustomApiBaseUrl(url: string | null) {
  if (!url) {
    runtimeApiUrl = null;
  } else {
    runtimeApiUrl = url.trim().replace(/\/+$/, '');
  }
}

export const setRuntimeApiUrl = setCustomApiBaseUrl;

export function resolveHostForDevice(url: string, isEmulator: boolean): string {
  if (isEmulator && (url.includes('localhost') || url.includes('127.0.0.1'))) {
    return url.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2');
  }
  return url;
}
