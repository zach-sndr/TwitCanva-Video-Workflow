/**
 * grok-kie.js
 *
 * Grok Imagine integration via Kie.ai Market API.
 * Docs:
 * - https://docs.kie.ai/market/grok-imagine/text-to-image.md
 * - https://docs.kie.ai/market/grok-imagine/image-to-image.md
 * - https://docs.kie.ai/market/grok-imagine/text-to-video.md
 * - https://docs.kie.ai/market/grok-imagine/image-to-video.md
 * - https://docs.kie.ai/market/common/get-task-detail.md
 */

const DEFAULT_KIE_BASE_URL = 'https://api.kie.ai/v1';
const DEFAULT_POLL_INTERVAL_MS = 5000;

function resolveKieMarketBaseUrl(kieBaseUrl = DEFAULT_KIE_BASE_URL) {
    const raw = (kieBaseUrl || DEFAULT_KIE_BASE_URL).replace(/\/+$/, '');

    if (raw.endsWith('/api/v1')) {
        return raw;
    }

    // Convert OpenAI-compatible base URL (e.g., https://api.kie.ai/v1) to Market API base URL.
    const withoutV1 = raw.replace(/\/v1$/, '');
    return `${withoutV1}/api/v1`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeBase64Input(fileData, fileType = 'image') {
    if (!fileData || typeof fileData !== 'string') return null;
    if (fileData.startsWith('data:') || fileData.startsWith('http://') || fileData.startsWith('https://')) {
        return fileData;
    }

    const mimeType = fileType === 'video' ? 'video/mp4' : 'image/jpeg';
    return `data:${mimeType};base64,${fileData}`;
}

async function parseJsonResponse(response, context) {
    const text = await response.text();
    let json;

    try {
        json = JSON.parse(text);
    } catch (error) {
        throw new Error(`${context} returned non-JSON response (${response.status}): ${text.slice(0, 200)}`);
    }

    if (!response.ok) {
        const message = json?.message || json?.msg || json?.error || text;
        throw new Error(`${context} failed (${response.status}): ${message}`);
    }

    return json;
}

function extractFirstUrl(payload) {
    const visited = new Set();

    const findUrl = (value) => {
        if (!value || visited.has(value)) return null;
        if (typeof value === 'object') visited.add(value);

        if (typeof value === 'string') {
            if (/^https?:\/\//i.test(value)) return value;

            const trimmed = value.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                    return findUrl(JSON.parse(trimmed));
                } catch (error) {
                    return null;
                }
            }

            return null;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                const found = findUrl(item);
                if (found) return found;
            }
            return null;
        }

        if (typeof value === 'object') {
            const directCandidates = [
                value.url,
                value.file_url,
                value.fileUrl,
                value.resultUrl,
                value.result_url,
                value.videoUrl,
                value.video_url,
                value.imageUrl,
                value.image_url
            ];

            for (const candidate of directCandidates) {
                if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
                    return candidate;
                }
            }

            const listCandidates = [
                value.resultUrls,
                value.result_urls,
                value.urls,
                value.video_urls,
                value.image_urls
            ];

            for (const list of listCandidates) {
                if (Array.isArray(list) && list.length > 0) {
                    const found = findUrl(list[0]);
                    if (found) return found;
                }
            }

            const nestedCandidates = [
                value.data,
                value.result,
                value.output,
                value.resultJson
            ];

            for (const nested of nestedCandidates) {
                const found = findUrl(nested);
                if (found) return found;
            }
        }

        return null;
    };

    return findUrl(payload);
}

async function uploadFileToKie({ fileData, fileType, apiKey, kieBaseUrl }) {
    const normalized = normalizeBase64Input(fileData, fileType);
    if (!normalized) {
        throw new Error(`Invalid ${fileType} input for upload`);
    }

    // Already a public URL; no upload needed.
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
        return normalized;
    }

    const marketBaseUrl = resolveKieMarketBaseUrl(kieBaseUrl);
    const response = await fetch(`${marketBaseUrl}/files/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            file: normalized,
            file_type: fileType
        })
    });

    const result = await parseJsonResponse(response, `Kie.ai ${fileType} upload`);

    if (result?.code && result.code !== 200) {
        throw new Error(`Kie.ai ${fileType} upload error: ${result.msg || result.message || 'Unknown error'}`);
    }

    const fileUrl = extractFirstUrl(result);
    if (!fileUrl) {
        throw new Error(`Kie.ai ${fileType} upload succeeded but no file URL was returned`);
    }

    return fileUrl;
}

async function createKieMarketTask({ model, input, apiKey, kieBaseUrl }) {
    const marketBaseUrl = resolveKieMarketBaseUrl(kieBaseUrl);
    const response = await fetch(`${marketBaseUrl}/jobs/createTask`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            input
        })
    });

    const result = await parseJsonResponse(response, `Kie.ai createTask (${model})`);

    if (result?.code && result.code !== 200) {
        throw new Error(`Kie.ai createTask failed: ${result.msg || result.message || 'Unknown error'}`);
    }

    const taskId = result?.data?.taskId || result?.data?.task_id || result?.taskId || result?.task_id;
    if (!taskId) {
        throw new Error(`Kie.ai createTask succeeded but no taskId was returned for model ${model}`);
    }

    return taskId;
}

async function pollKieMarketTaskResultUrl({ taskId, apiKey, kieBaseUrl, maxWaitMs = 600000 }) {
    const marketBaseUrl = resolveKieMarketBaseUrl(kieBaseUrl);
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        await sleep(DEFAULT_POLL_INTERVAL_MS);

        const response = await fetch(`${marketBaseUrl}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await parseJsonResponse(response, `Kie.ai recordInfo (${taskId})`);

        if (result?.code && result.code !== 200) {
            throw new Error(`Kie.ai recordInfo failed: ${result.msg || result.message || 'Unknown error'}`);
        }

        const state = String(
            result?.data?.state ||
            result?.state ||
            result?.status ||
            ''
        ).toLowerCase();

        if (['success', 'succeed', 'completed'].includes(state)) {
            const resultUrl =
                extractFirstUrl(result?.data?.resultJson) ||
                extractFirstUrl(result?.data) ||
                extractFirstUrl(result);

            if (!resultUrl) {
                throw new Error(`Kie.ai task ${taskId} completed but no result URL was returned`);
            }

            return resultUrl;
        }

        if (['fail', 'failed', 'error'].includes(state)) {
            const failMessage =
                result?.data?.failMsg ||
                result?.data?.message ||
                result?.msg ||
                result?.message ||
                'Unknown task failure';
            throw new Error(`Kie.ai task ${taskId} failed: ${failMessage}`);
        }
    }

    throw new Error(`Kie.ai task ${taskId} timed out`);
}

function mapGrokImageAspectRatio(aspectRatio) {
    const supported = new Set(['2:3', '3:2', '1:1', '16:9', '9:16']);
    if (!aspectRatio || aspectRatio === 'Auto') return '1:1';
    return supported.has(aspectRatio) ? aspectRatio : '1:1';
}

function mapGrokVideoAspectRatio(aspectRatio) {
    const supported = new Set(['2:3', '3:2', '1:1', '16:9', '9:16']);
    if (!aspectRatio || aspectRatio === 'Auto') return '16:9';
    return supported.has(aspectRatio) ? aspectRatio : '16:9';
}

function mapGrokVideoResolution(resolution) {
    if (!resolution) return '480p';
    return String(resolution).toLowerCase() === '720p' ? '720p' : '480p';
}

function mapGrokVideoDuration(duration) {
    const durationNum = Number(duration);
    return durationNum >= 8 ? '10' : '6';
}

export async function generateGrokImagineImage({
    prompt,
    imageBase64Array,
    aspectRatio,
    apiKey,
    kieBaseUrl,
    imageModel
}) {
    if (!apiKey) {
        throw new Error('Kie.ai API key is required for Grok Imagine image generation');
    }

    const hasInputImage = Array.isArray(imageBase64Array) && imageBase64Array.length > 0;
    const firstInputImage = hasInputImage ? imageBase64Array.find(Boolean) : null;

    const requestedModel = imageModel?.startsWith('grok-imagine/') ? imageModel : null;
    const model = requestedModel || (firstInputImage ? 'grok-imagine/image-to-image' : 'grok-imagine/text-to-image');
    const isImageToImage = model === 'grok-imagine/image-to-image';

    const input = {};

    if (isImageToImage) {
        if (!firstInputImage) {
            throw new Error('Grok Imagine image-to-image requires one input image');
        }

        const imageUrl = await uploadFileToKie({
            fileData: firstInputImage,
            fileType: 'image',
            apiKey,
            kieBaseUrl
        });

        input.image_urls = [imageUrl];
        if (prompt?.trim()) {
            input.prompt = prompt.trim();
        }
    } else {
        if (!prompt?.trim()) {
            throw new Error('Prompt is required for Grok Imagine text-to-image');
        }

        input.prompt = prompt.trim();
        input.aspect_ratio = mapGrokImageAspectRatio(aspectRatio);
    }

    console.log('[Grok Imagine Image] Creating task:', {
        model,
        hasPrompt: !!input.prompt,
        hasInputImage: !!input.image_urls,
        aspectRatio: input.aspect_ratio || '(default)'
    });

    const taskId = await createKieMarketTask({
        model,
        input,
        apiKey,
        kieBaseUrl
    });

    return await pollKieMarketTaskResultUrl({
        taskId,
        apiKey,
        kieBaseUrl
    });
}

export async function generateGrokImagineVideo({
    prompt,
    imageBase64,
    aspectRatio,
    resolution,
    duration,
    apiKey,
    kieBaseUrl,
    videoModel
}) {
    if (!apiKey) {
        throw new Error('Kie.ai API key is required for Grok Imagine video generation');
    }

    const hasInputImage = !!imageBase64;
    const requestedModel = videoModel?.startsWith('grok-imagine/') ? videoModel : null;
    const model = requestedModel || (hasInputImage ? 'grok-imagine/image-to-video' : 'grok-imagine/text-to-video');
    const isImageToVideo = model === 'grok-imagine/image-to-video';

    const input = {
        mode: 'normal',
        aspect_ratio: mapGrokVideoAspectRatio(aspectRatio),
        resolution: mapGrokVideoResolution(resolution),
        duration: mapGrokVideoDuration(duration)
    };

    if (prompt?.trim()) {
        input.prompt = prompt.trim();
    } else if (model === 'grok-imagine/text-to-video') {
        throw new Error('Prompt is required for Grok Imagine text-to-video');
    }

    if (isImageToVideo) {
        if (!imageBase64) {
            throw new Error('Grok Imagine image-to-video requires one input image');
        }

        const imageUrl = await uploadFileToKie({
            fileData: imageBase64,
            fileType: 'image',
            apiKey,
            kieBaseUrl
        });

        input.image_urls = [imageUrl];
    }

    console.log('[Grok Imagine Video] Creating task:', {
        model,
        hasPrompt: !!input.prompt,
        hasInputImage: !!input.image_urls,
        aspectRatio: input.aspect_ratio,
        resolution: input.resolution,
        duration: input.duration
    });

    const taskId = await createKieMarketTask({
        model,
        input,
        apiKey,
        kieBaseUrl
    });

    return await pollKieMarketTaskResultUrl({
        taskId,
        apiKey,
        kieBaseUrl
    });
}
