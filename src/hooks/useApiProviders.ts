/**
 * useApiProviders.ts
 *
 * State management hook for API provider keys and model selection.
 * Handles validation, persistence (localStorage + backend), and model toggling.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { PROVIDERS, ALL_MODEL_IDS } from '../config/providers';
import { saveEncryptedKeys, loadAllEncryptedKeys, deleteEncryptedKey } from '../config/encryption';

export type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

export interface ProviderState {
    keyValues: Record<string, string>; // e.g. { GEMINI_API_KEY: 'sk-...' }
    status: ValidationStatus;
    error?: string;
    maskedKeys?: Record<string, string>; // e.g. { GEMINI_API_KEY: '••••abc1' }
}

const STORAGE_KEY_STATUS = 'apiProviders_status';
const STORAGE_KEY_MODELS = 'apiProviders_enabledModels';

function loadCachedStatus(): Record<string, { status: ValidationStatus; maskedKeys?: Record<string, string> }> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_STATUS);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveCachedStatus(data: Record<string, { status: ValidationStatus; maskedKeys?: Record<string, string> }>) {
    localStorage.setItem(STORAGE_KEY_STATUS, JSON.stringify(data));
}

function loadEnabledModels(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_MODELS);
        if (raw) {
            return new Set(JSON.parse(raw));
        }
    } catch { /* ignore */ }
    // Default: all models enabled
    return new Set(ALL_MODEL_IDS);
}

function saveEnabledModels(models: Set<string>) {
    localStorage.setItem(STORAGE_KEY_MODELS, JSON.stringify([...models]));
}

export function useApiProviders() {
    const [providers, setProviders] = useState<Record<string, ProviderState>>(() => {
        const cached = loadCachedStatus();
        const initial: Record<string, ProviderState> = {};
        for (const p of PROVIDERS) {
            initial[p.id] = {
                keyValues: {},
                status: cached[p.id]?.status === 'valid' ? 'valid' : 'idle',
                maskedKeys: cached[p.id]?.maskedKeys
            };
        }
        return initial;
    });

    const [enabledModels, setEnabledModels] = useState<Set<string>>(loadEnabledModels);

    // On mount: load encrypted keys from localStorage and sync with backend
    useEffect(() => {
        const initializeKeys = async () => {
            try {
                // First, try to load encrypted keys from localStorage
                const encryptedKeys = await loadAllEncryptedKeys();

                // If we have encrypted keys, send them to backend for session use
                if (Object.keys(encryptedKeys).length > 0) {
                    for (const [providerId, keys] of Object.entries(encryptedKeys)) {
                        await fetch('/api/keys/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ providerId, keys })
                        }).catch(() => { /* ignore errors */ });
                    }
                }

                // Then check backend status to see what's actually loaded
                const r = await fetch('/api/keys/status');
                const data = await r.json();

                setProviders(prev => {
                    const next = { ...prev };
                    for (const [providerId, info] of Object.entries(data)) {
                        if (next[providerId] && info.hasKeys) {
                            // If backend has keys, mark as valid (server loaded them)
                            next[providerId] = {
                                ...next[providerId],
                                status: 'valid',
                                maskedKeys: info.maskedKeys || next[providerId].maskedKeys
                            };
                        }
                    }
                    // Cache updated status
                    const cacheData: Record<string, { status: ValidationStatus; maskedKeys?: Record<string, string> }> = {};
                    for (const [id, state] of Object.entries(next)) {
                        cacheData[id] = { status: state.status, maskedKeys: state.maskedKeys };
                    }
                    saveCachedStatus(cacheData);
                    return next;
                });
            } catch {
                // Backend not reachable; rely on cached status
            }
        };

        initializeKeys();
    }, []);

    // Ensure new models added to the registry default to enabled
    useEffect(() => {
        setEnabledModels(prev => {
            let changed = false;
            const next = new Set(prev);
            for (const id of ALL_MODEL_IDS) {
                if (!next.has(id)) {
                    next.add(id);
                    changed = true;
                }
            }
            if (changed) {
                saveEnabledModels(next);
                return next;
            }
            return prev;
        });
    }, []);

    // Keep a ref to providers for the validateProvider callback to avoid stale closures
    const providersRef = useRef(providers);
    useEffect(() => { providersRef.current = providers; }, [providers]);

    const updateKeyValue = useCallback((providerId: string, keyName: string, value: string) => {
        setProviders(prev => ({
            ...prev,
            [providerId]: {
                ...prev[providerId],
                keyValues: { ...prev[providerId].keyValues, [keyName]: value },
                status: 'idle',
                error: undefined
            }
        }));
    }, []);

    const validateProvider = useCallback(async (providerId: string) => {
        const state = providersRef.current[providerId];
        if (!state) return;

        setProviders(prev => ({
            ...prev,
            [providerId]: { ...prev[providerId], status: 'validating', error: undefined }
        }));

        try {
            // Validate
            const validateRes = await fetch('/api/keys/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ providerId, keys: state.keyValues })
            });

            // Check if response is OK before parsing JSON
            if (!validateRes.ok) {
                let errorMsg = `HTTP ${validateRes.status}`;
                try {
                    const errorData = await validateRes.json();
                    errorMsg = errorData.error || errorMsg;
                } catch {
                    // Response wasn't JSON, try to get text
                    const text = await validateRes.text().catch(() => '');
                    if (text) errorMsg = text.substring(0, 100);
                }
                setProviders(prev => ({
                    ...prev,
                    [providerId]: {
                        ...prev[providerId],
                        status: 'invalid',
                        error: errorMsg
                    }
                }));
                return;
            }

            const validateData = await validateRes.json();

            if (!validateRes.ok || !validateData.valid) {
                setProviders(prev => ({
                    ...prev,
                    [providerId]: {
                        ...prev[providerId],
                        status: 'invalid',
                        error: validateData.error || 'Invalid API key'
                    }
                }));
                return;
            }

            // Save to backend
            const saveRes = await fetch('/api/keys/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ providerId, keys: state.keyValues })
            });
            if (!saveRes.ok) {
                throw new Error('Key validated but failed to save. Try again.');
            }

            // Also save encrypted keys to localStorage for persistence
            await saveEncryptedKeys(providerId, state.keyValues);

            // Build masked keys for display
            const maskedKeys: Record<string, string> = {};
            for (const [k, v] of Object.entries(state.keyValues)) {
                maskedKeys[k] = v.length > 4 ? '••••' + v.slice(-4) : '••••';
            }

            setProviders(prev => {
                const next = {
                    ...prev,
                    [providerId]: {
                        ...prev[providerId],
                        keyValues: {}, // Clear raw keys from memory
                        status: 'valid' as ValidationStatus,
                        maskedKeys
                    }
                };
                // Cache
                const cacheData: Record<string, { status: ValidationStatus; maskedKeys?: Record<string, string> }> = {};
                for (const [id, s] of Object.entries(next)) {
                    cacheData[id] = { status: s.status, maskedKeys: s.maskedKeys };
                }
                saveCachedStatus(cacheData);
                return next;
            });
        } catch (err: any) {
            setProviders(prev => ({
                ...prev,
                [providerId]: {
                    ...prev[providerId],
                    status: 'invalid',
                    error: err.message || 'Validation failed'
                }
            }));
        }
    }, []);

    const deleteProvider = useCallback(async (providerId: string) => {
        // Delete from encrypted localStorage
        await deleteEncryptedKey(providerId);

        // Also tell backend to clear keys for this session
        fetch('/api/keys/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providerId })
        }).catch(() => { /* ignore errors */ });

        setProviders(prev => {
            const next = {
                ...prev,
                [providerId]: {
                    keyValues: {},
                    status: 'idle' as ValidationStatus,
                    maskedKeys: undefined,
                    error: undefined
                }
            };
            const cacheData: Record<string, { status: ValidationStatus; maskedKeys?: Record<string, string> }> = {};
            for (const [id, s] of Object.entries(next)) {
                cacheData[id] = { status: s.status, maskedKeys: s.maskedKeys };
            }
            saveCachedStatus(cacheData);
            return next;
        });
    }, []);

    const toggleModel = useCallback((modelId: string) => {
        setEnabledModels(prev => {
            const next = new Set(prev);
            if (next.has(modelId)) {
                next.delete(modelId);
            } else {
                next.add(modelId);
            }
            saveEnabledModels(next);
            return next;
        });
    }, []);

    const validProviderIds = Object.entries(providers)
        .filter(([, s]) => s.status === 'valid')
        .map(([id]) => id);

    return {
        providers,
        enabledModels,
        validProviderIds,
        updateKeyValue,
        validateProvider,
        deleteProvider,
        toggleModel
    };
}
