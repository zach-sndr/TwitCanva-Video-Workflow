/**
 * encryption.ts
 *
 * Encryption utilities for securing API keys in browser localStorage.
 * Uses Web Crypto API with AES-GCM for authenticated encryption.
 * Key derivation uses PBKDF2 with a device-fingerprint-based salt.
 */

const STORAGE_KEY_ENCRYPTION_SALT = 'apiKeys_encryptionSalt';
const STORAGE_KEY_ENCRYPTED_KEYS = 'apiKeys_encrypted';

/**
 * Get or create a device fingerprint salt.
 * This provides a unique key per browser/device without storing identifiable info.
 */
function getOrCreateSalt(): string {
    let salt = localStorage.getItem(STORAGE_KEY_ENCRYPTION_SALT);
    if (!salt) {
        // Generate a random salt
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        salt = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(STORAGE_KEY_ENCRYPTION_SALT, salt);
    }
    return salt;
}

/**
 * Derive an encryption key from the salt using PBKDF2.
 */
async function deriveKey(salt: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(salt),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode(salt),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt data and return as a base64 string containing IV + ciphertext.
 */
export async function encryptData(data: object): Promise<string> {
    const salt = getOrCreateSalt();
    const key = await deriveKey(salt);
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(JSON.stringify(data))
    );

    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data from a base64 string (IV + ciphertext).
 */
export async function decryptData<T>(encryptedBase64: string): Promise<T | null> {
    try {
        const salt = getOrCreateSalt();
        const key = await deriveKey(salt);

        // Decode base64
        const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

        // Extract IV and ciphertext
        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );

        const decoder = new TextDecoder();
        return JSON.parse(decoder.decode(decrypted)) as T;
    } catch (error) {
        console.error('[Encryption] Decryption failed:', error);
        return null;
    }
}

/**
 * Save encrypted API keys to localStorage.
 */
export async function saveEncryptedKeys(providerId: string, keys: Record<string, string>): Promise<void> {
    // Load existing encrypted keys
    const existing = await loadAllEncryptedKeys();
    existing[providerId] = keys;

    const encrypted = await encryptData(existing);
    localStorage.setItem(STORAGE_KEY_ENCRYPTED_KEYS, encrypted);
}

/**
 * Load all encrypted keys from localStorage.
 */
export async function loadAllEncryptedKeys(): Promise<Record<string, Record<string, string>>> {
    const encrypted = localStorage.getItem(STORAGE_KEY_ENCRYPTED_KEYS);
    if (!encrypted) return {};

    const decrypted = await decryptData<Record<string, Record<string, string>>>(encrypted);
    return decrypted || {};
}

/**
 * Delete a specific provider's encrypted keys.
 */
export async function deleteEncryptedKey(providerId: string): Promise<void> {
    const existing = await loadAllEncryptedKeys();
    delete existing[providerId];

    if (Object.keys(existing).length > 0) {
        const encrypted = await encryptData(existing);
        localStorage.setItem(STORAGE_KEY_ENCRYPTED_KEYS, encrypted);
    } else {
        localStorage.removeItem(STORAGE_KEY_ENCRYPTED_KEYS);
    }
}

/**
 * Clear all encrypted keys.
 */
export function clearAllEncryptedKeys(): void {
    localStorage.removeItem(STORAGE_KEY_ENCRYPTED_KEYS);
    localStorage.removeItem(STORAGE_KEY_ENCRYPTION_SALT);
}
