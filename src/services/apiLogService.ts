export interface ApiLogEntry {
    id: string;
    timestamp: string;
    operation: string;
    method: string;
    url: string;
    status: number | null;
    ok: boolean;
    durationMs: number;
    outcome: 'Passed' | 'Failed';
    model?: string;
    error?: string;
}

const STORAGE_KEY = 'twitcanva.api.logs.v1';
const MAX_ENTRIES = 500;

let listeners: Array<(logs: ApiLogEntry[]) => void> = [];
let installed = false;

const readLogs = (): ApiLogEntry[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const persistLogs = (logs: ApiLogEntry[]) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_ENTRIES)));
    } catch {
        // Ignore localStorage failures.
    }
};

const notify = (logs: ApiLogEntry[]) => {
    for (const listener of listeners) {
        listener(logs);
    }
};

const addLog = (entry: ApiLogEntry) => {
    const next = [entry, ...readLogs()].slice(0, MAX_ENTRIES);
    persistLogs(next);
    notify(next);
};

const resolveUrl = (input: RequestInfo | URL): string => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    return input.url;
};

const resolvePath = (url: string): string => {
    try {
        return new URL(url, window.location.origin).pathname;
    } catch {
        return url;
    }
};

const AI_OPERATION_MAP: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\/api\/generate-image$/i, label: 'Image Generation' },
    { pattern: /\/api\/generate-video$/i, label: 'Video Generation' },
    { pattern: /\/api\/local-models\/generate$/i, label: 'Local Model Generation' },
    { pattern: /\/api\/storyboard\/generate-composite$/i, label: 'Storyboard Composite' },
    { pattern: /\/api\/storyboard\/generate-scripts$/i, label: 'Storyboard Script Generation' },
    { pattern: /\/api\/storyboard\/brainstorm-story$/i, label: 'Storyboard Brainstorm' },
    { pattern: /\/api\/storyboard\/optimize-story$/i, label: 'Storyboard Optimization' },
    { pattern: /\/api\/gemini\/describe-image$/i, label: 'Image Description' },
    { pattern: /\/api\/gemini\/optimize-prompt$/i, label: 'Prompt Optimization' }
];

const resolveOperation = (url: string): string | null => {
    const path = resolvePath(url);
    const match = AI_OPERATION_MAP.find(item => item.pattern.test(path));
    return match?.label || null;
};

const extractModelFromBody = (init?: RequestInit): string | undefined => {
    const rawBody = init?.body;
    if (!rawBody || typeof rawBody !== 'string') return undefined;
    try {
        const parsed = JSON.parse(rawBody);
        return parsed?.imageModel || parsed?.videoModel || parsed?.modelId || parsed?.model || undefined;
    } catch {
        return undefined;
    }
};

export const subscribeApiLogs = (listener: (logs: ApiLogEntry[]) => void): (() => void) => {
    listeners.push(listener);
    listener(readLogs());
    return () => {
        listeners = listeners.filter(l => l !== listener);
    };
};

export const clearApiLogs = () => {
    persistLogs([]);
    notify([]);
};

export const installApiLogging = () => {
    if (typeof window === 'undefined' || installed) return;
    installed = true;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const method = (init?.method || 'GET').toUpperCase();
        const url = resolveUrl(input);
        const operation = resolveOperation(url);
        if (!operation) {
            return originalFetch(input, init);
        }
        const model = extractModelFromBody(init);
        const started = performance.now();
        const timestamp = new Date().toISOString();
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        try {
            const response = await originalFetch(input, init);
            addLog({
                id,
                timestamp,
                operation,
                method,
                url,
                status: response.status,
                ok: response.ok,
                durationMs: Math.round(performance.now() - started),
                outcome: response.ok ? 'Passed' : 'Failed',
                model
            });
            return response;
        } catch (error: any) {
            addLog({
                id,
                timestamp,
                operation,
                method,
                url,
                status: null,
                ok: false,
                durationMs: Math.round(performance.now() - started),
                outcome: 'Failed',
                model,
                error: error?.message || 'Network error'
            });
            throw error;
        }
    };
};
