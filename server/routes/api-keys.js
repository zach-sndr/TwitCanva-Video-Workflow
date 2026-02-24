/**
 * api-keys.js
 *
 * Backend routes for API key validation, status, and persistence.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const CONFIG_DIR = path.join(__dirname, '..', '..', 'config');
const KEYS_FILE = path.join(CONFIG_DIR, 'api-keys.json');

// ============================================================================
// HELPERS
// ============================================================================

function loadKeysFile() {
    try {
        if (fs.existsSync(KEYS_FILE)) {
            return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
        }
    } catch { /* ignore */ }
    return {};
}

function saveKeysFile(data) {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
}

function maskKey(key) {
    if (!key || key.length <= 4) return '••••';
    return '••••' + key.slice(-4);
}

/** Kling JWT generation (mirrors server/services/kling.js) */
function generateKlingJWT(accessKey, secretKey) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 };

    const b64url = (obj) => {
        const b64 = Buffer.from(JSON.stringify(obj)).toString('base64');
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    };

    const headerEnc = b64url(header);
    const payloadEnc = b64url(payload);
    const sig = crypto.createHmac('sha256', secretKey)
        .update(`${headerEnc}.${payloadEnc}`)
        .digest('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    return `${headerEnc}.${payloadEnc}.${sig}`;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

async function validateGoogle(apiKey) {
    // Skip SDK and go directly to HTTP - more reliable and faster
    const res = await fetch(`https://generativelanguage.googleapis.com/v1/models?pageSize=1&key=${apiKey}`);
    if (!res.ok) {
        const contentType = res.headers.get('content-type') || '';
        // If response is not JSON, it's likely an HTML error page
        if (!contentType.includes('application/json')) {
            throw new Error(`Google API error: HTTP ${res.status}`);
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || `HTTP ${res.status}`);
    }
    return true;
}

async function validateOpenAI(apiKey) {
    const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || `HTTP ${res.status}`);
    }
    return true;
}

async function validateKling(accessKey, secretKey) {
    const jwt = generateKlingJWT(accessKey, secretKey);
    const res = await fetch('https://api-singapore.klingai.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`
        },
        body: JSON.stringify({
            model_name: 'kling-v1',
            prompt: 'test',
            n: 1
        })
    });
    // Even a 400 with a valid error structure means auth succeeded
    // Only 401/403 means bad credentials
    if (res.status === 401 || res.status === 403) {
        throw new Error('Invalid Kling credentials');
    }
    return true;
}

async function validateHailuo(apiKey) {
    const res = await fetch('https://api.minimaxi.chat/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!res.ok) {
        throw new Error(`Hailuo validation failed: HTTP ${res.status}`);
    }
    return true;
}

async function validateFal(apiKey) {
    // Use a lightweight request — submitting to queue and immediately checking status
    // avoids actually running inference. A 401/403 means bad credentials.
    const res = await fetch('https://queue.fal.run/fal-ai/fast-sdxl/requests', {
        method: 'GET',
        headers: { 'Authorization': `Key ${apiKey}` }
    });
    if (res.status === 401 || res.status === 403) {
        throw new Error('Invalid Fal AI key');
    }
    return true;
}

async function validateKie(apiKey) {
    // Validate Kie.ai API key by attempting a simple task creation
    // Using the Grok Imagine text-to-image endpoint with minimal request
    const res = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'grok-imagine/text-to-image',
            input: {
                prompt: 'test',
                aspect_ratio: '1:1'
            }
        })
    });

    // 401/403 means invalid credentials
    if (res.status === 401 || res.status === 403) {
        throw new Error('Invalid Kie.ai API key');
    }

    // Any other error (429, 500, etc.) still means the key is valid - we just got an API error
    // Only check for the specific "no message available" case
    if (!res.ok) {
        const text = await res.text();
        if (text.includes('no message available') || text.includes('No message available')) {
            // Key is valid but API had an issue - that's okay for validation
            return true;
        }
        try {
            const data = JSON.parse(text);
            // If we get a taskId back, the key is valid
            if (data.data?.taskId) {
                return true;
            }
            throw new Error(data.message || data.msg || `HTTP ${res.status}`);
        } catch (e) {
            if (e instanceof SyntaxError) {
                // Non-JSON response - if it's a 400+ error, still might be valid key
                if (res.status >= 400 && res.status < 500) {
                    return true;
                }
                throw new Error(`HTTP ${res.status}: ${text.substring(0, 100)}`);
            }
            throw e;
        }
    }

    // If we get here, check for taskId in response
    const data = await res.json().catch(() => ({}));
    if (data.data?.taskId || data.code === 200) {
        return true;
    }

    throw new Error(data.message || data.msg || 'Kie.ai validation failed');
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/keys/validate
 * Validates API key(s) for a given provider by making a lightweight API call.
 */
router.post('/validate', async (req, res) => {
    // Ensure we always set JSON content type
    res.setHeader('Content-Type', 'application/json');

    try {
        const { providerId, keys } = req.body;

        if (!providerId || !keys) {
            return res.json({ valid: false, error: 'Missing providerId or keys' });
        }

        switch (providerId) {
            case 'google':
                await validateGoogle(keys.GEMINI_API_KEY);
                break;
            case 'openai':
                await validateOpenAI(keys.OPENAI_API_KEY);
                break;
            case 'kling':
                await validateKling(keys.KLING_ACCESS_KEY, keys.KLING_SECRET_KEY);
                break;
            case 'hailuo':
                await validateHailuo(keys.HAILUO_API_KEY);
                break;
            case 'fal':
                await validateFal(keys.FAL_API_KEY);
                break;
            case 'kie':
                await validateKie(keys.KIE_API_KEY);
                break;
            default:
                return res.status(400).json({ valid: false, error: `Unknown provider: ${providerId}` });
        }

        return res.json({ valid: true });
    } catch (error) {
        // Ensure error message is always a string (could be an object)
        const errorMessage = error?.message ? String(error.message) : (error ? String(error) : 'Validation failed');
        console.error(`[API Keys] Validation failed for ${req.body?.providerId}:`, errorMessage);
        console.error(`[API Keys] Stack:`, error.stack);
        return res.json({ valid: false, error: errorMessage });
    }
});

/**
 * POST /api/keys/save
 * Persists validated keys to config/api-keys.json and updates app.locals.
 */
router.post('/save', async (req, res) => {
    try {
        const { providerId, keys } = req.body;

        if (!providerId || !keys) {
            return res.status(400).json({ error: 'Missing providerId or keys' });
        }

        // Load existing, merge, save
        const existing = loadKeysFile();
        existing[providerId] = keys;
        saveKeysFile(existing);

        // Update app.locals and process.env so running server uses new keys immediately
        const locals = req.app.locals;
        for (const [k, v] of Object.entries(keys)) {
            locals[k] = v;
            process.env[k] = v;
        }

        console.log(`[API Keys] Saved keys for ${providerId}`);
        res.json({ success: true });
    } catch (error) {
        console.error('[API Keys] Save error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/keys/status
 * Returns which providers have keys loaded (no key values exposed).
 */
router.get('/status', (req, res) => {
    const locals = req.app.locals;
    const status = {};

    const providerKeyMap = {
        google: ['GEMINI_API_KEY'],
        openai: ['OPENAI_API_KEY'],
        kling: ['KLING_ACCESS_KEY', 'KLING_SECRET_KEY'],
        hailuo: ['HAILUO_API_KEY'],
        fal: ['FAL_API_KEY'],
        kie: ['KIE_API_KEY']
    };

    for (const [providerId, keyNames] of Object.entries(providerKeyMap)) {
        const hasKeys = keyNames.every(k => !!locals[k]);
        const maskedKeys = {};
        if (hasKeys) {
            for (const k of keyNames) {
                maskedKeys[k] = maskKey(locals[k]);
            }
        }
        status[providerId] = { hasKeys, maskedKeys: hasKeys ? maskedKeys : undefined };
    }

    res.json(status);
});

/**
 * POST /api/keys/delete
 * Deletes keys for a provider from memory (session only, does not persist).
 */
router.post('/delete', (req, res) => {
    try {
        const { providerId } = req.body;

        if (!providerId) {
            return res.status(400).json({ error: 'Missing providerId' });
        }

        const providerKeyMap = {
            google: ['GEMINI_API_KEY'],
            openai: ['OPENAI_API_KEY'],
            kling: ['KLING_ACCESS_KEY', 'KLING_SECRET_KEY'],
            hailuo: ['HAILUO_API_KEY'],
            fal: ['FAL_API_KEY'],
            kie: ['KIE_API_KEY']
        };

        const keyNames = providerKeyMap[providerId];
        if (!keyNames) {
            return res.status(400).json({ error: `Unknown provider: ${providerId}` });
        }

        // Clear from app.locals and process.env
        const locals = req.app.locals;
        for (const k of keyNames) {
            delete locals[k];
            delete process.env[k];
        }

        console.log(`[API Keys] Deleted keys for ${providerId} (session only)`);
        res.json({ success: true });
    } catch (error) {
        console.error('[API Keys] Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
