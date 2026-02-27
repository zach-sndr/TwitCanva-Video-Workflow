/**
 * kie.js
 *
 * Kie.ai API service for video and image generation.
 * Handles:
 * - Veo 3.1 generate + extend
 * - Kling 2.6 motion-control
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
        throw new Error(`Kie.ai returned non-JSON response (HTTP ${response.status})`);
    }
}

/**
 * Poll Kie.ai generic jobs endpoint until complete and return result URLs
 */
async function pollKieJobResultUrls(taskId, apiKey, label = 'Kie.ai task', maxWaitMs = 300000) {
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
async function pollKieVeoTask(taskId, apiKey, maxWaitMs = 300000) {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < maxWaitMs) {
        const response = await fetch(`${KIE_BASE_URL}/api/v1/veo/taskInfo?taskId=${taskId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        });

        const result = await safeJson(response);

        if (result.code !== 200) {
            throw new Error(`Kie.ai Veo API error: ${result.msg || 'Unknown error'}`);
        }

        const status = result.data?.taskStatus;
        console.log(`Kie.ai Veo task ${taskId} status: ${status}`);

        if (status === 'completed') {
            const videoUrl = result.data?.taskResult?.resultUrls?.[0];
            if (!videoUrl) {
                throw new Error('No video URL in successful response');
            }
            return videoUrl;
        } else if (status === 'failed') {
            throw new Error(`Kie.ai Veo generation failed: ${result.data?.taskStatusMsg || 'Unknown error'}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Kie.ai Veo generation timed out');
}

/**
 * Generate video using Kie.ai Veo 3.1 API
 */
export async function generateKieVeoVideo({ prompt, imageUrl, lastFrameUrl, modelId, aspectRatio, duration, generateAudio, apiKey }) {
    // Determine model: veo3 for quality, veo3_fast for fast
    const modelName = modelId === 'kie-veo3' ? 'veo3' : 'veo3_fast';

    // Map aspect ratio
    const mappedAspectRatio = mapAspectRatio(aspectRatio);

    // Determine generation type based on inputs
    let generationType = 'TEXT_2_VIDEO';

    // Build request body
    const body = {
        prompt: prompt || '',
        model: modelName,
        aspectRatio: mappedAspectRatio,
        enableTranslation: true
    };

    // Kie.ai Veo expects publicly accessible image URLs for image-conditioned generation.
    if (imageUrl && lastFrameUrl) {
        generationType = 'FIRST_AND_LAST_FRAMES_2_VIDEO';
        body.imageUrls = [imageUrl, lastFrameUrl];
        body.generationType = generationType;
    } else if (imageUrl) {
        generationType = 'FIRST_AND_LAST_FRAMES_2_VIDEO';
        body.imageUrls = [imageUrl];
        body.generationType = generationType;
    } else {
        body.generationType = generationType;
    }

    console.log(`Kie.ai Veo Video Gen: Using model ${modelName}, generationType: ${body.generationType}, aspectRatio: ${mappedAspectRatio}`);

    // Create task
    const response = await fetch(`${KIE_BASE_URL}/api/v1/veo/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    const result = await safeJson(response);

    if (result.code !== 200) {
        throw new Error(`Kie.ai Veo API error: ${result.msg || 'Failed to create task'}`);
    }

    const taskId = result.data?.taskId;
    if (!taskId) {
        throw new Error('No task ID returned from Kie.ai Veo API');
    }

    console.log(`Kie.ai Veo task created: ${taskId}`);

    // Poll for completion
    const videoUrl = await pollKieVeoTask(taskId, apiKey);
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
    apiKey
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

    const videoUrl = await pollKieVeoTask(taskId, apiKey);
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
    apiKey
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

    const resultUrls = await pollKieJobResultUrls(taskId, apiKey, 'Kie.ai Kling Motion Control');
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
 * Upload an image to Kie.ai and get a URL for use in I2I
 */
async function uploadImageToKie(imageBase64, apiKey) {
    // Extract raw base64 if it's a data URL
    let base64Data = imageBase64;
    let mimeType = 'image/png';

    if (imageBase64.startsWith('data:')) {
        const match = imageBase64.match(/^data:(image\/\w+);base64,/);
        if (match) {
            mimeType = match[1];
        }
        base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
    }

    // File upload API is on a different domain
    const uploadUrl = 'https://kieai.redpandaai.co/api/file-base64-upload';
    console.log(`Uploading to: ${uploadUrl}`);
    const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            base64Data: `data:${mimeType};base64,${base64Data}`,
            uploadPath: 'grok-i2i',
            fileName: `input_${Date.now()}.${mimeType.split('/')[1]}`
        })
    });

    const uploadResult = await safeJson(uploadResponse);
    console.log(`Kie.ai upload response:`, uploadResult);

    const uploadedImageUrl = uploadResult.data?.downloadUrl || uploadResult.data?.fileUrl;

    if (uploadResult.code !== 200 || !uploadedImageUrl) {
        throw new Error(`Failed to upload image: ${uploadResult.msg || uploadResult.message || JSON.stringify(uploadResult)}`);
    }

    console.log(`Kie.ai image uploaded: ${uploadedImageUrl}`);
    return uploadedImageUrl;
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
