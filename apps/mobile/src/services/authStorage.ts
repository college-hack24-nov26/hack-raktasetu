let SecureStoreModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SecureStoreModule = require('expo-secure-store');
} catch {
  SecureStoreModule = null;
}

const TOKEN_KEY = 'raktasetu_donor_token';
const USER_KEY = 'raktasetu_donor_user';
const ACTIVE_SESSION_KEY = 'raktasetu_active_session_id';
const CONSENT_KEY = 'raktasetu_consent_data';
const CAMP_ASSIGNMENTS_KEY = 'raktasetu_cached_camp_assignments';

export interface StoredDonorUser {
  id: string;
  phoneNumber: string;
  name?: string | null;
  bloodGroup?: string | null;
  stateCode?: number | null;
  districtCode?: number | null;
  cityOrLocality?: string | null;
}

export interface StoredConsentData {
  consentGranted: boolean;
  consentVersion: string;
  consentGrantedAt: string;
}

// Fallback memory store for environments where SecureStore native module is mocked or unavailable
const memoryStore = new Map<string, string>();

async function setItem(key: string, value: string): Promise<void> {
  if (SecureStoreModule?.setItemAsync) {
    try {
      await SecureStoreModule.setItemAsync(key, value);
      return;
    } catch {
      // fallback to memory
    }
  }
  memoryStore.set(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (SecureStoreModule?.getItemAsync) {
    try {
      return await SecureStoreModule.getItemAsync(key);
    } catch {
      // fallback to memory
    }
  }
  return memoryStore.get(key) || null;
}

async function deleteItem(key: string): Promise<void> {
  if (SecureStoreModule?.deleteItemAsync) {
    try {
      await SecureStoreModule.deleteItemAsync(key);
      return;
    } catch {
      // fallback to memory
    }
  }
  memoryStore.delete(key);
}

export class AuthStorage {
  static async saveToken(token: string): Promise<void> {
    await setItem(TOKEN_KEY, token);
  }

  static async getToken(): Promise<string | null> {
    return await getItem(TOKEN_KEY);
  }

  static async removeToken(): Promise<void> {
    await deleteItem(TOKEN_KEY);
  }

  static async saveUser(user: StoredDonorUser): Promise<void> {
    await setItem(USER_KEY, JSON.stringify(user));
  }

  static async getUser(): Promise<StoredDonorUser | null> {
    const raw = await getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static async removeUser(): Promise<void> {
    await deleteItem(USER_KEY);
  }

  static async saveActiveSessionId(sessionId: string): Promise<void> {
    await setItem(ACTIVE_SESSION_KEY, sessionId);
  }

  static async getActiveSessionId(): Promise<string | null> {
    return await getItem(ACTIVE_SESSION_KEY);
  }

  static async removeActiveSessionId(): Promise<void> {
    await deleteItem(ACTIVE_SESSION_KEY);
  }

  static async saveConsent(consent: StoredConsentData): Promise<void> {
    await setItem(CONSENT_KEY, JSON.stringify(consent));
  }

  static async getConsent(): Promise<StoredConsentData | null> {
    const raw = await getItem(CONSENT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static async saveCachedAssignments(assignments: any[]): Promise<void> {
    await setItem(CAMP_ASSIGNMENTS_KEY, JSON.stringify(assignments));
  }

  static async getCachedAssignments(): Promise<any[] | null> {
    const raw = await getItem(CAMP_ASSIGNMENTS_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static async removeCachedAssignments(): Promise<void> {
    await deleteItem(CAMP_ASSIGNMENTS_KEY);
  }

  static async clearAll(): Promise<void> {
    await Promise.all([
      this.removeToken(),
      this.removeUser(),
      this.removeActiveSessionId(),
      this.removeCachedAssignments(),
    ]);
  }
}
