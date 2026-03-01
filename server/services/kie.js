/**
 * kie.js
 *
 * Kie.ai API service for video and image generation.
 * Handles:
 * - Veo 3.1 generate + extend
 * - Kling 2.6 motion-control
 * - Kling 2.6/Kling 3.0 video (text-to-video + image-to-video)
 * - Grok Imagine video (text-to-video + image-to-video)
 * - Grok Imagine text-to-image + image-to-image
 */

const KIE_BASE_URL = 'https://api.kie.ai';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract raw base64 from data URL (removes data:image/xxx;base64, prefix)
 */
function extractRawBase64(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    if (dataUrl.startsWith('data:')) {
        return dataUrl.replace(/^data:[^;]+;base64,/, '');
    }
    return dataUrl;
}

/**
 * Map aspect ratio to kie.ai format
 */
function mapAspectRatio(aspectRatio) {
    const mapping = {
        'Auto': 'Auto',
        '1:1': '1:1',
        '16:9': '16:9',
        '9:16': '9:16',
        '3:4': '3:4',
        '4:3': '4:3',
        '3:2': '3:2',
        '2:3': '2:3'
    };
    return mapping[aspectRatio] || '16:9';
}

/**
 * Parse JSON response safely
 */
async function safeJson(response) {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        const preview = text ? text.slice(0, 300) : '(empty body)';
        throw new Error(`Kie.ai returned non-JSON response (HTTP ${response.status}): ${preview}`);
    }
}

/**
 * Poll Kie.ai generic jobs endpoint until complete and return result URLs
 */
async function pollKieJobResultUrls(taskId, apiKey, label = 'Kie.ai task', maxWaitMs = 300000, onStatus) {
    const startTime = Date.now();
    const pollInterval = 3000;

    while (Date.now() - startTime < maxWaitMs) {
        const response = await fetch(`${KIE_BASE_URL}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        });

        const result = await safeJson(response);

        if (result.code !== 200) {
            throw new Error(`${label} polling error: ${result.message || result.msg || 'Unknown error'}`);
        }

        const state = result.data?.state;
        console.log(`${label} ${taskId} state: ${state}`);
        onStatus?.({
            phase: 'running',
            label: 'Waiting on Kie.ai',
            detail: state === 'success' ? 'Provider task finished' : `Task status: ${state || 'running'}`,
            providerTaskId: taskId,
            providerState: state || 'running'
        });

        if (state === 'success') {
            const resultJson = result.data?.resultJson ? JSON.parse(result.data.resultJson) : {};
            const resultUrls = resultJson?.resultUrls || [];

            if (!Array.isArray(resultUrls) || resultUrls.length === 0) {
                throw new Error(`${label} completed but no result URLs found`);
            }

            return resultUrls;
        }

        if (state === 'fail') {
            throw new Error(`${label} failed: ${result.data?.failMsg || 'Unknown error'}`);
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`${label} timed out`);
}

// ============================================================================
// VEO 3.1 VIDEO GENERATION
// ============================================================================

/**
 * Poll Kie.ai Veo task status until complete
 */
async function pollKieVeoTask(taskId, apiKey, maxWaitMs = 300000, onStatus) {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < maxWaitMs) {
        const response = await fetch(`${KIE_BASE_URL}/api/v1/veo/record-info?taskId=${taskId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        });

        const result = await safeJson(response);

        if (result.code !== 200) {
            throw new Error(`Kie.ai Veo status error: ${result.msg || 'Unknown error'}`);
        }

        const successFlag = result.data?.successFlag;
        const errorMessage = result.data?.errorMessage || result.msg || '';
        console.log(`Kie.ai Veo task ${taskId} successFlag: ${successFlag}`);
        const providerState = successFlag === 1 ? 'success' : successFlag === 2 || successFlag === 3 ? 'failed' : 'running';
        onStatus?.({
            phase: 'running',
            label: 'Waiting on Kie.ai',
            detail: providerState === 'running' ? 'Veo task is still running' : `Veo task ${providerState}`,
            providerTaskId: taskId,
            providerState
        });

        if (successFlag === 1) {
            const videoUrl = result.data?.response?.resultUrls?.[0];
            if (!videoUrl) {
                throw new Error('No video URL in successful response');
            }
            return videoUrl;
        }

        if (successFlag === 2 || successFlag === 3) {
            throw new Error(`Kie.ai Veo generation failed: ${errorMessage || 'Unknown error'}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Kie.ai Veo generation timed out');
}

/**
 * Generate video using Kie.ai Veo 3.1 API
 */
export async function generateKieVeoVideo({ prompt, imageUrl, lastFrameUrl, referenceImageUrls, modelId, aspectRatio, duration, generateAudio, apiKey, onStatus }) {
    // Determine model: veo3 for quality, veo3_fast for fast
    let requestedModel;
    if (modelId === 'kie-veo3') {
        requestedModel = 'veo3';
    } else if (modelId === 'kie-veo3-fast') {
        requestedModel = 'veo3_fast';
    } else {
        throw new Error(`Unsupported Kie Veo model: ${modelId || '(empty)'}`);
    }

    // Map aspect ratio
    const mappedAspectRatio = mapAspectRatio(aspectRatio);

    // Determine generation type based on inputs
    let generationType = 'TEXT_2_VIDEO';

    // Build request body
    let modelName = requestedModel;
    // Kie currently supports image-conditioned Veo generation on the fast model.
    if ((imageUrl || lastFrameUrl) && requestedModel === 'veo3') {
        console.log('Kie.ai Veo: image/video reference detected; falling back from veo3 to veo3_fast');
        modelName = 'veo3_fast';
    }

    const body = {
        prompt: prompt || '',
        model: modelName,
        aspect_ratio: mappedAspectRatio,
        enableTranslation: true
    };

    // Kie.ai Veo API: use imageUrls array for all image-conditioned generation.
    // - 1 image  → image-to-video (video unfolds from that image)
    // - 2 images → first frame + last frame transition video
    // - 3+ images → REFERENCE_2_VIDEO (reference/ingredients mode)
    // generationType is optional; system auto-detects from imageUrls length, but we set it explicitly.
    if (referenceImageUrls && referenceImageUrls.length >= 3) {
        // Reference mode (ingredients): 3+ reference images
        generationType = 'REFERENCE_2_VIDEO';
        // Limit to 3 (API constraint)
        const limitedRefs = referenceImageUrls.slice(0, 3);
        body.imageUrls = limitedRefs;
        body.generationType = generationType;
        // Force 16:9 aspect ratio (only supported for reference mode)
        body.aspect_ratio = '16:9';
        console.log(`Kie.ai Veo: Reference mode with ${limitedRefs.length} images, forcing aspect_ratio=16:9`);
    } else if (imageUrl && lastFrameUrl) {
        generationType = 'FIRST_AND_LAST_FRAMES_2_VIDEO';
        body.imageUrls = [imageUrl, lastFrameUrl];
        body.generationType = generationType;
    } else if (imageUrl) {
        generationType = 'FIRST_AND_LAST_FRAMES_2_VIDEO';
        body.imageUrls = [imageUrl];
        body.generationType = generationType;
    } else {
        body.generationType = generationType; // TEXT_2_VIDEO
    }

    console.log('Kie.ai Veo request body:', JSON.stringify({
        model: body.model,
        generationType: body.generationType,
        aspect_ratio: body.aspect_ratio,
        imageUrls: body.imageUrls || null,
        hasPrompt: Boolean(body.prompt)
    }));

    // Create task
    onStatus?.({
        phase: 'submitting',
        label: 'Submitting to Kie.ai',
        detail: 'Creating Veo task'
    });

    const response = await fetch(`${KIE_BASE_URL}/api/v1/veo/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    const result = await safeJson(response);
    console.log(`Kie.ai Veo create response: HTTP ${response.status} ${JSON.stringify(result)}`);

    if (result.code !== 200) {
        throw new Error(`Kie.ai Veo API error: ${result.msg || 'Failed to create task'}`);
    }

    const taskId = result.data?.taskId;
    if (!taskId) {
        throw new Error('No task ID returned from Kie.ai Veo API');
    }

    console.log(`Kie.ai Veo task created: ${taskId}`);
    onStatus?.({
        phase: 'running',
        label: 'Waiting on Kie.ai',
        detail: 'Veo task accepted by provider',
        providerTaskId: taskId,
        providerState: 'queued'
    });

    // Poll for completion
    const videoUrl = await pollKieVeoTask(taskId, apiKey, 300000, onStatus);
    return { videoUrl, taskId };
}

/**
 * Extend a Veo 3.1 video from a previous taskId
 */
export async function extendKieVeoVideo({
    sourceTaskId,
    prompt,
    seeds,
    watermark,
    extendModel = 'fast',
    callBackUrl,
    apiKey,
    onStatus
}) {
    if (!sourceTaskId) {
        throw new Error('Missing source taskId for Kie Veo extend');
    }

    const body = {
        taskId: sourceTaskId,
        prompt: prompt || ''
    };

    if (typeof seeds === 'number') {
        body.seeds = seeds;
    }
    if (watermark) {
        body.watermark = watermark;
    }
    if (callBackUrl) {
        body.callBackUrl = callBackUrl;
    }
    if (extendModel) {
        body.model = extendModel;
    }

    console.log(`Kie.ai Veo Extend: sourceTaskId=${sourceTaskId}, model=${body.model || 'fast'}`);

    onStatus?.({
        phase: 'submitting',
        label: 'Submitting to Kie.ai',
        detail: 'Creating Veo extend task'
    });

    const response = await fetch(`${KIE_BASE_URL}/api/v1/veo/extend`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    const result = await safeJson(response);
    if (result.code !== 200) {
        throw new Error(`Kie.ai Veo Extend API error: ${result.msg || 'Failed to create extend task'}`);
    }

    const taskId = result.data?.taskId;
    if (!taskId) {
        throw new Error('No task ID returned from Kie.ai Veo Extend API');
    }

    onStatus?.({
        phase: 'running',
        label: 'Waiting on Kie.ai',
        detail: 'Extend task accepted by provider',
        providerTaskId: taskId,
        providerState: 'queued'
    });

    const videoUrl = await pollKieVeoTask(taskId, apiKey, 300000, onStatus);
    return { videoUrl, taskId };
}

/**
 * Map frontend resolution to Kie motion-control mode
 */
function mapKieMotionMode(resolution) {
    const mapping = {
        'Auto': '720p',
        '720p': '720p',
        '1080p': '1080p'
    };
    return mapping[resolution] || '720p';
}

/**
 * Generate video using Kie.ai Kling 2.6 motion-control
 */
export async function generateKieKlingMotionControlVideo({
    prompt,
    characterImageUrl,
    motionVideoUrl,
    resolution,
    characterOrientation = 'image',
    callBackUrl,
    apiKey,
    onStatus
}) {
    if (!characterImageUrl) {
        throw new Error('Kie Kling Motion Control requires a character image input');
    }
    if (!motionVideoUrl) {
        throw new Error('Kie Kling Motion Control requires a motion reference video input');
    }

    const body = {
        model: 'kling-2.6/motion-control',
        input: {
            prompt: prompt || '',
            input_urls: [characterImageUrl],
            video_urls: [motionVideoUrl],
            mode: mapKieMotionMode(resolution),
            character_orientation: characterOrientation
        }
    };

    if (callBackUrl) {
        body.callBackUrl = callBackUrl;
    }

    console.log(`Kie.ai Kling Motion Control: mode=${body.input.mode}, orientation=${characterOrientation}`);

    onStatus?.({
        phase: 'submitting',
        label: 'Submitting to Kie.ai',
        detail: 'Creating motion control task'
    });

    const response = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    const result = await safeJson(response);
    if (result.code !== 200) {
        throw new Error(`Kie.ai Kling Motion Control API error: ${result.message || result.msg || 'Failed to create task'}`);
    }

    const taskId = result.data?.taskId;
    if (!taskId) {
        throw new Error('No task ID returned from Kie.ai Kling Motion Control API');
    }

    onStatus?.({
        phase: 'running',
        label: 'Waiting on Kie.ai',
        detail: 'Motion control task accepted by provider',
        providerTaskId: taskId,
        providerState: 'queued'
    });

    const resultUrls = await pollKieJobResultUrls(taskId, apiKey, 'Kie.ai Kling Motion Control', 300000, onStatus);
    return { videoUrl: resultUrls[0], taskId };
}

// ============================================================================
// GROK IMAGINE IMAGE GENERATION
// ============================================================================

/**
 * Poll Kie.ai Grok Imagine task status until complete
 */
async function pollKieGrokTask(taskId, apiKey, maxWaitMs = 180000) {
    return await pollKieJobResultUrls(taskId, apiKey, 'Kie.ai Grok', maxWaitMs);
}

/**
 * Map resolution to kie.ai format
 */
function mapResolution(resolution) {
    const mapping = {
        'Auto': '1K',
        '1K': '1K',
        '2K': '2K',
        '4K': '4K'
    };
    return mapping[resolution] || '1K';
}

/**
 * Map aspect ratio for Grok Imagine
 */
function mapGrokAspectRatio(aspectRatio) {
    const mapping = {
        'Auto': '3:2',
        '1:1': '1:1',
        '3:2': '3:2',
        '2:3': '2:3',
        '16:9': '16:9',
        '9:16': '9:16'
    };
    return mapping[aspectRatio] || '3:2';
}

function mapGrokVideoMode(mode) {
    const normalized = String(mode || '').trim().toLowerCase();
    if (['fun', 'normal', 'spicy'].includes(normalized)) return normalized;
    return 'normal';
}

function mapGrokVideoResolution(resolution) {
    const normalized = String(resolution || '').trim().toLowerCase();
    if (normalized === '480p') return '480p';
    return '720p';
}

function mapGrokVideoDuration(duration) {
    const normalized = String(duration || '').trim();
    if (normalized === '10') return '10';
    return '6';
}

function mapKieKlingDuration(duration, fallback = '5') {
    const value = String(duration || fallback);
    return value;
}

function mapKieKlingAspectRatio(aspectRatio) {
    const mapped = mapAspectRatio(aspectRatio);
    if (mapped === 'Auto') return '1:1';
    if (['1:1', '16:9', '9:16'].includes(mapped)) return mapped;
    return '1:1';
}

/**
 * Generate video using Kie.ai Grok Imagine video APIs
 */
export async function generateKieGrokVideo({
    prompt,
    imageUrl,
    modelId,
    aspectRatio,
    duration,
    resolution,
    mode,
    callBackUrl,
    apiKey,
    onStatus
}) {
    const isImageToVideo = modelId === 'kie-grok-imagine-image-to-video';
    const model = isImageToVideo ? 'grok-imagine/image-to-video' : 'grok-imagine/text-to-video';
    const body = {
        model,
        input: {
            prompt: prompt || '',
            mode: mapGrokVideoMode(mode),
            duration: mapGrokVideoDuration(duration),
            resolution: mapGrokVideoResolution(resolution)
        }
    };

    if (callBackUrl) {
        body.callBackUrl = callBackUrl;
    }

    if (isImageToVideo) {
        if (!imageUrl) {
            throw new Error('Kie Grok Imagine image-to-video requires an input image URL.');
        }
        body.input.image_urls = [imageUrl];
    } else {
        body.input.aspect_ratio = mapGrokAspectRatio(aspectRatio);
    }

    onStatus?.({
        phase: 'submitting',
        label: 'Submitting to Kie.ai',
        detail: 'Creating Grok video task'
    });

    const response = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    const result = await safeJson(response);
    if (result.code !== 200) {
        throw new Error(`Kie.ai Grok video API error: ${result.message || result.msg || 'Failed to create task'}`);
    }

    const taskId = result.data?.taskId;
    if (!taskId) {
        throw new Error('No task ID returned from Kie.ai Grok video API');
    }

    onStatus?.({
        phase: 'running',
        label: 'Waiting on Kie.ai',
        detail: 'Grok video task accepted by provider',
        providerTaskId: taskId,
        providerState: 'queued'
    });

    const resultUrls = await pollKieJobResultUrls(taskId, apiKey, 'Kie.ai Grok Video', 180000, onStatus);
    return { videoUrl: resultUrls[0], taskId };
}

/**
 * Generate video using Kie.ai Kling 2.6 / 3.0 APIs
 */
export async function generateKieKlingVideo({
    prompt,
    imageUrl,
    modelId,
    aspectRatio,
    duration,
    generateAudio,
    callBackUrl,
    apiKey,
    onStatus
}) {
    const modelMapping = {
        'kie-kling-2.6-text-to-video': 'kling-2.6/text-to-video',
        'kie-kling-2.6-image-to-video': 'kling-2.6/image-to-video',
        'kie-kling-3.0': 'kling-3.0/video'
    };
    const selectedModel = modelMapping[modelId];
    if (!selectedModel) {
        throw new Error(`Unsupported Kie Kling model: ${modelId}`);
    }

    const isImageToVideo = modelId === 'kie-kling-2.6-image-to-video' || modelId === 'kie-kling-3.0';
    const body = {
        model: selectedModel,
        input: {
            prompt: prompt || '',
            sound: generateAudio !== false,
            duration: mapKieKlingDuration(duration, '5')
        }
    };

    if (callBackUrl) {
        body.callBackUrl = callBackUrl;
    }

    if (isImageToVideo && imageUrl) {
        body.input.image_urls = [imageUrl];
    }

    if (modelId === 'kie-kling-2.6-text-to-video') {
        body.input.aspect_ratio = mapKieKlingAspectRatio(aspectRatio);
    }

    if (modelId === 'kie-kling-3.0') {
        body.input.mode = 'pro';
        body.input.multi_shots = false;
        if (aspectRatio) {
            body.input.aspect_ratio = mapKieKlingAspectRatio(aspectRatio);
        }
    }

    if (modelId === 'kie-kling-2.6-image-to-video' && !imageUrl) {
        throw new Error('Kie Kling 2.6 image-to-video requires an input image URL.');
    }

    onStatus?.({
        phase: 'submitting',
        label: 'Submitting to Kie.ai',
        detail: 'Creating Kling video task'
    });

    const response = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    const result = await safeJson(response);
    if (result.code !== 200) {
        throw new Error(`Kie.ai Kling video API error: ${result.message || result.msg || 'Failed to create task'}`);
    }

    const taskId = result.data?.taskId;
    if (!taskId) {
        throw new Error('No task ID returned from Kie.ai Kling video API');
    }

    onStatus?.({
        phase: 'running',
        label: 'Waiting on Kie.ai',
        detail: 'Kling video task accepted by provider',
        providerTaskId: taskId,
        providerState: 'queued'
    });

    const resultUrls = await pollKieJobResultUrls(taskId, apiKey, 'Kie.ai Kling Video', 300000, onStatus);
    return { videoUrl: resultUrls[0], taskId };
}

/**
 * Generate image using Kie.ai Grok Imagine Text-to-Image API
 */
export async function generateKieGrokTextToImage({ prompt, aspectRatio, resolution, apiKey }) {
    const mappedResolution = mapResolution(resolution);
    const mappedAspectRatio = mapGrokAspectRatio(aspectRatio);

    const body = {
        model: 'grok-imagine/text-to-image',
        input: {
            prompt: prompt,
            aspect_ratio: mappedAspectRatio,
            image_size: mappedResolution
        }
    };

    console.log(`Kie.ai Grok Text-to-Image: aspectRatio: ${mappedAspectRatio}, resolution: ${mappedResolution}`);

    // Create task
    const response = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    const result = await safeJson(response);

    if (result.code !== 200) {
        throw new Error(`Kie.ai Grok API error: ${result.message || 'Failed to create task'}`);
    }

    const taskId = result.data?.taskId;
    if (!taskId) {
        throw new Error('No task ID returned from Kie.ai Grok API');
    }

    console.log(`Kie.ai Grok task created: ${taskId}`);

    // Poll for completion
    return await pollKieGrokTask(taskId, apiKey);
}

/**
 * Upload base64 media (image/video) to Kie.ai and get a temporary public URL.
 */
export async function uploadBase64MediaToKie(mediaBase64, apiKey, uploadPath = 'media') {
    if (!mediaBase64 || typeof mediaBase64 !== 'string') {
        throw new Error('uploadBase64MediaToKie: mediaBase64 is required');
    }

    let base64Data = mediaBase64;
    let mimeType = 'application/octet-stream';
    if (mediaBase64.startsWith('data:')) {
        const match = mediaBase64.match(/^data:([^;]+);base64,/);
        if (match?.[1]) {
            mimeType = match[1];
        }
        base64Data = mediaBase64.replace(/^data:[^;]+;base64,/, '');
    }

    const extensionByMime = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/quicktime': 'mov'
    };
    const extension = extensionByMime[mimeType] || 'bin';

    // File upload API is on a different domain
    const uploadUrl = 'https://kieai.redpandaai.co/api/file-base64-upload';
    const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            base64Data: `data:${mimeType};base64,${base64Data}`,
            uploadPath,
            fileName: `input_${Date.now()}.${extension}`
        })
    });

    const uploadResult = await safeJson(uploadResponse);
    const uploadedUrl = uploadResult.data?.downloadUrl || uploadResult.data?.fileUrl;
    if (uploadResult.code !== 200 || !uploadedUrl) {
        throw new Error(`Failed to upload media to Kie.ai: ${uploadResult.msg || uploadResult.message || JSON.stringify(uploadResult)}`);
    }

    return uploadedUrl;
}

/**
 * Backward-compatible image upload wrapper.
 */
export async function uploadImageToKie(imageBase64, apiKey) {
    return uploadBase64MediaToKie(imageBase64, apiKey, 'grok-i2i');
}

/**
 * Generate image using Kie.ai Grok Imagine Image-to-Image API
 */
export async function generateKieGrokImageToImage({ prompt, imageBase64, aspectRatio, resolution, apiKey }) {
    const mappedResolution = mapResolution(resolution);
    const mappedAspectRatio = mapGrokAspectRatio(aspectRatio);

    // For image-to-image, we need to upload the image first and get a URL
    let imageUrl = null;
    if (imageBase64) {
        imageUrl = await uploadImageToKie(imageBase64, apiKey);
    }

    const body = {
        model: 'grok-imagine/image-to-image',
        input: {
            prompt: prompt || '',
            aspect_ratio: mappedAspectRatio,
            image_urls: imageUrl ? [imageUrl] : []
        }
    };

    console.log(`Kie.ai Grok Image-to-Image: aspectRatio: ${mappedAspectRatio}, resolution: ${mappedResolution}`);
    console.log(`Kie.ai Grok I2I body:`, JSON.stringify(body, null, 2));

    // Create task
    const response = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    const result = await safeJson(response);
    console.log(`Kie.ai Grok I2I response:`, result);

    if (result.code !== 200) {
        throw new Error(`Kie.ai Grok API error: ${result.msg || result.message || 'Failed to create task'}`);
    }

    const taskId = result.data?.taskId;
    if (!taskId) {
        throw new Error('No task ID returned from Kie.ai Grok API');
    }

    console.log(`Kie.ai Grok I2I task created: ${taskId}`);

    // Poll for completion
    return await pollKieGrokTask(taskId, apiKey);
}
