const generationStates = new Map();

const FINAL_STATUS_TTL_MS = 15 * 60 * 1000;

function nowIso() {
    return new Date().toISOString();
}

function scheduleCleanup(nodeId, status) {
    if (!nodeId) return;
    const delay = status === 'pending' ? FINAL_STATUS_TTL_MS * 2 : FINAL_STATUS_TTL_MS;
    setTimeout(() => {
        const current = generationStates.get(nodeId);
        if (current && current.status === status) {
            generationStates.delete(nodeId);
        }
    }, delay).unref?.();
}

export function startGeneration(nodeId, payload = {}) {
    if (!nodeId) return null;

    const entry = {
        nodeId,
        status: 'pending',
        phase: 'queued',
        label: 'Preparing request',
        detail: 'Starting generation',
        startedAt: nowIso(),
        updatedAt: nowIso(),
        ...payload
    };

    generationStates.set(nodeId, entry);
    scheduleCleanup(nodeId, 'pending');
    return entry;
}

export function updateGeneration(nodeId, payload = {}) {
    if (!nodeId) return null;

    const current = generationStates.get(nodeId) || startGeneration(nodeId);
    const next = {
        ...current,
        ...payload,
        nodeId,
        updatedAt: nowIso()
    };

    generationStates.set(nodeId, next);
    return next;
}

export function completeGeneration(nodeId, payload = {}) {
    if (!nodeId) return null;

    const next = updateGeneration(nodeId, {
        status: 'success',
        phase: 'complete',
        label: payload.label || 'Generation complete',
        detail: payload.detail || 'Result saved',
        ...payload,
        completedAt: nowIso()
    });

    scheduleCleanup(nodeId, 'success');
    return next;
}

export function failGeneration(nodeId, payload = {}) {
    if (!nodeId) return null;

    const next = updateGeneration(nodeId, {
        status: 'error',
        phase: 'failed',
        label: payload.label || 'Task failed',
        detail: payload.detail || payload.errorMessage || 'Generation failed',
        ...payload,
        completedAt: nowIso()
    });

    scheduleCleanup(nodeId, 'error');
    return next;
}

export function getGeneration(nodeId) {
    if (!nodeId) return null;
    return generationStates.get(nodeId) || null;
}
