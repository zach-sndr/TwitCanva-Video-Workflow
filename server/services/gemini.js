/**
 * gemini.js
 *
 * Google Gemini/Veo API service for image and video generation.
 * Now supports Kie.ai as the primary provider (OpenAI-compatible API).
 */

import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

// ============================================================================
// CLIENT SETUP
// ============================================================================

let _ai = null;
let _openai = null;

/**
 * Get or create Gemini AI client (fallback - direct Google)
 */
export function getGeminiClient(apiKey) {
    if (!_ai) {
        if (!apiKey) {
            throw new Error('Gemini API key not configured');
        }
        _ai = new GoogleGenAI({ apiKey });
    }
    return _ai;
}

/**
 * Get or create Kie.ai OpenAI-compatible client
 */
export function getKieClient(baseUrl, apiKey) {
    if (!_openai) {
        if (!apiKey) {
            throw new Error('Kie.ai API key not configured');
        }
        _openai = new OpenAI({
            baseURL: baseUrl || 'https://api.kie.ai/v1',
            apiKey: apiKey
        });
    }
    return _openai;
}

// ============================================================================
// IMAGE GENERATION
// ============================================================================

/**
 * Generate image using Gemini (via Kie.ai or direct Google)
 * @returns {Promise<Buffer>} Image buffer
 */
export async function generateGeminiImage({ prompt, imageBase64Array, aspectRatio, resolution, apiKey, useKie = false, kieBaseUrl }) {
    // Use Kie.ai if available, otherwise use direct Google
    if (useKie && kieBaseUrl && apiKey) {
        return await generateGeminiImageViaKie({ prompt, imageBase64Array, aspectRatio, resolution, apiKey, baseUrl: kieBaseUrl });
    }

    // Fallback to direct Google
    const ai = getGeminiClient(apiKey);
    const modelName = 'gemini-3-pro-image-preview';

    const parts = [];

    // Add input images
    if (imageBase64Array && imageBase64Array.length > 0) {
        for (const img of imageBase64Array) {
            const match = img.match(/^data:(image\/\w+);base64,/);
            const mimeType = match ? match[1] : "image/png";
            const base64Clean = img.replace(/^data:image\/\w+;base64,/, "");
            parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: base64Clean
                }
            });
        }
    }

    parts.push({ text: prompt });

    // Map aspect ratio - Gemini supports: "1:1", "3:4", "4:3", "9:16", "16:9"
    // Default to 16:9 for video-ready format
    const ratioMap = {
        'Auto': '16:9',
        '1:1': '1:1',
        '3:4': '3:4',
        '4:3': '4:3',
        '3:2': '3:2',
        '2:3': '2:3',
        '4:5': '4:5',
        '5:4': '5:4',
        '9:16': '9:16',
        '16:9': '16:9',
        '21:9': '16:9' // Fallback for ultra-wide
    };
    const mappedRatio = ratioMap[aspectRatio] || '1:1';

    // Map resolution - Supports 1K, 2K, 4K (must be uppercase)
    // Default to 1K if not specified or 'Auto'
    const resolutionMap = {
        'Auto': '1K',
        '1K': '1K',
        '2K': '2K',
        '4K': '4K'
    };
    const mappedResolution = resolutionMap[resolution] || '1K';

    console.log('[Gemini Image] Generating with:', {
        model: modelName,
        hasInputImages: imageBase64Array?.length || 0,
        aspectRatio: mappedRatio,
        resolution: mappedResolution,
        promptPreview: prompt?.substring(0, 80) + '...'
    });

    let response;
    try {
        response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: parts
            },
            config: {
                responseModalities: ["TEXT", "IMAGE"],
                temperature: 1.0,
                imageConfig: {
                    aspectRatio: mappedRatio,
                    imageSize: mappedResolution
                }
            }
        });
    } catch (error) {
        console.error('[Gemini Image] API Error Details:', {
            message: error.message,
            status: error.status,
            hasInputImages: imageBase64Array?.length || 0,
            aspectRatio: mappedRatio,
            resolution: mappedResolution
        });
        throw error;
    }

    const candidates = response.candidates || [];
    if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
        for (const part of candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return Buffer.from(part.inlineData.data, 'base64');
            }
        }
    }

    throw new Error("No image data returned from Gemini");
}

/**
 * Generate image using Kie.ai (OpenAI-compatible API)
 * Note: Using direct Google API for Gemini is preferred for better results
 */
async function generateGeminiImageViaKie({ prompt, imageBase64Array, aspectRatio, resolution, apiKey, baseUrl }) {
    const client = getKieClient(baseUrl, apiKey);

    // Kie.ai model for Gemini image generation
    const modelName = 'gemini/gemini-3-pro';

    console.log('[Gemini Image via Kie.ai] Generating with:', {
        model: modelName,
        hasInputImages: imageBase64Array?.length || 0,
        aspectRatio: aspectRatio || '16:9',
        resolution: resolution || '1K',
        promptPreview: prompt?.substring(0, 80) + '...'
    });

    // Build messages for OpenAI-compatible API
    const messages = [];

    // Add image inputs as base64
    if (imageBase64Array && imageBase64Array.length > 0) {
        const contentParts = [];
        for (const img of imageBase64Array) {
            const match = img.match(/^data:(image\/\w+);base64,/);
            const mimeType = match ? match[1] : "image/png";
            const base64Clean = img.replace(/^data:image\/\w+;base64,/, "");
            contentParts.push({
                type: "image_url",
                image_url: {
                    url: `data:${mimeType};base64,${base64Clean}`
                }
            });
        }
        messages.push({ role: "user", content: contentParts });
    }

    // Add text prompt
    messages.push({ role: "user", content: prompt });

    try {
        const response = await client.chat.completions.create({
            model: modelName,
            messages: messages,
            temperature: 1.0,
            max_tokens: 4096
        });

        // Extract image from response
        const content = response.choices?.[0]?.message?.content;

        if (content) {
            // Try to find base64 image in response
            const base64Match = content.match(/data:image\/(\w+);base64,([A-Za-z0-9+/=]+)/);
            if (base64Match) {
                return Buffer.from(base64Match[2], 'base64');
            }

            // Try to find URL
            const urlMatch = content.match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp))/i);
            if (urlMatch) {
                // Download the image
                const imgResponse = await fetch(urlMatch[1]);
                return Buffer.from(await imgResponse.arrayBuffer());
            }
        }

        throw new Error("No image data returned from Kie.ai Gemini");
    } catch (error) {
        console.error('[Gemini Image via Kie.ai] API Error:', error.message);
        throw error;
    }
}

// ============================================================================
// VIDEO GENERATION
// ============================================================================

/**
 * Generate video using Veo (via Kie.ai or direct Google)
 * @returns {Promise<Buffer>} Video buffer
 */
export async function generateVeoVideo({ prompt, imageBase64, lastFrameBase64, aspectRatio, resolution, duration, generateAudio = true, apiKey, useKie = false, kieBaseUrl }) {
    // Use Kie.ai if available, otherwise use direct Google
    if (useKie && kieBaseUrl && apiKey) {
        return await generateVeoVideoViaKie({ prompt, imageBase64, lastFrameBase64, aspectRatio, resolution, duration, apiKey, baseUrl: kieBaseUrl });
    }

    // Fallback to direct Google Veo
    const ai = getGeminiClient(apiKey);
    const model = 'veo-3.1-fast-generate-preview';

    // Map resolution
    const resolutionMap = {
        '1080p': '1080p',
        '720p': '720p',
        '512p': '512p',
        'Auto': '720p'
    };
    const mappedResolution = resolutionMap[resolution] || '720p';

    // Map aspect ratio
    const ratioMap = {
        'Auto': '16:9',
        '16:9': '16:9',
        '9:16': '9:16'
    };
    const mappedRatio = ratioMap[aspectRatio] || '16:9';

    // Map duration - Veo 3 supports 4, 6, or 8 seconds only
    const validDurations = [4, 6, 8];
    const mappedDuration = validDurations.includes(duration) ? duration : 8;

    // Build API arguments
    // Note: generateAudio is NOT supported by @google/genai library yet (throws error)
    // Even though Veo 3.1 API docs mention it, the SDK doesn't expose this parameter
    const args = {
        model: model,
        prompt: prompt,
        config: {
            numberOfVideos: 1,
            durationSeconds: mappedDuration,
            resolution: mappedResolution,
            aspectRatio: mappedRatio
            // generateAudio: not available in current @google/genai SDK
        }
    };

    // Add image inputs
    if (imageBase64) {
        const match = imageBase64.match(/^data:(image\/\w+);base64,/);
        let mimeType = match ? match[1] : "image/png";
        let base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");

        // Veo prefers JPEG, but accepts other formats
        // Just update the mimeType header - the API handles conversion
        if (mimeType === 'image/png' || mimeType === 'image/webp') {
            mimeType = 'image/jpeg';
        }

        args.image = {
            imageBytes: base64Clean,
            mimeType: mimeType
        };
    }

    // Add last frame for interpolation
    if (lastFrameBase64) {
        const match = lastFrameBase64.match(/^data:(image\/\w+);base64,/);
        let mimeType = match ? match[1] : "image/png";
        let base64Clean = lastFrameBase64.replace(/^data:image\/\w+;base64,/, "");

        // Veo prefers JPEG
        if (mimeType === 'image/png' || mimeType === 'image/webp') {
            mimeType = 'image/jpeg';
        }

        args.referenceImages = [{
            referenceId: 1,
            referenceType: 'REFERENCE_TYPE_LAST_FRAME',
            image: {
                imageBytes: base64Clean,
                mimeType: mimeType
            }
        }];
    }

    console.log('Calling Veo API with args:', {
        model: args.model,
        prompt: args.prompt.substring(0, 100) + '...',
        config: args.config,
        image: args.image ? { mimeType: args.image.mimeType, length: args.image.imageBytes?.length } : undefined,
        requestedDuration: duration,
        mappedDuration: mappedDuration
    });

    // Start generation
    let operation = await ai.models.generateVideos(args);

    // Poll for completion
    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.get({ operation: operation });
    }

    // Get video data - Veo returns either a URI or direct bytes
    const response = operation.response;
    const generatedVideo = response?.generatedVideos?.[0];

    if (!generatedVideo) {
        console.error('Veo API response structure:', JSON.stringify(response, null, 2));
        throw new Error('No video generated by Veo');
    }

    // Check if we got a URI (need to download) or direct bytes
    if (generatedVideo.video?.uri) {
        // Download video from URI - need to add API key for authentication
        console.log('Downloading video from Veo URI...');
        const downloadUrl = new URL(generatedVideo.video.uri);
        downloadUrl.searchParams.set('key', apiKey);

        const videoResponse = await fetch(downloadUrl.toString());
        if (!videoResponse.ok) {
            throw new Error(`Failed to download video from Veo: ${videoResponse.status}`);
        }
        return Buffer.from(await videoResponse.arrayBuffer());
    } else if (generatedVideo.video?.videoBytes) {
        // Direct bytes
        return Buffer.from(generatedVideo.video.videoBytes, 'base64');
    } else if (generatedVideo.videoBytes) {
        return Buffer.from(generatedVideo.videoBytes, 'base64');
    }

    console.error('Veo API response structure:', JSON.stringify(response, null, 2));
    throw new Error('No video data in response');
}

/**
 * Generate video using Kie.ai Veo 3.1 API
 * API: https://docs.kie.ai/veo3-api/generate-veo-3-video.md
 */
async function generateVeoVideoViaKie({ prompt, imageBase64, lastFrameBase64, aspectRatio, resolution, duration, apiKey, baseUrl }) {
    // Use Kie.ai's direct Veo API endpoint
    const baseUrlClean = (baseUrl || 'https://api.kie.ai').replace('/v1', '');

    // Kie.ai models: veo3 (quality) or veo3_fast (fast)
    const modelName = 'veo3';

    // Map duration - Veo 3 supports 4, 6, or 8 seconds
    const validDurations = [4, 6, 8];
    const mappedDuration = validDurations.includes(duration) ? duration : 8;

    console.log('[Veo 3.1 via Kie.ai] Generating with:', {
        model: modelName,
        prompt: prompt?.substring(0, 100) + '...',
        aspectRatio: aspectRatio || '16:9',
        resolution: resolution || '720p',
        duration: mappedDuration,
        hasImage: !!imageBase64,
        hasLastFrame: !!lastFrameBase64
    });

    try {
        // Build request body per Kie.ai Veo 3.1 API
        const requestBody = {
            model: modelName,
            prompt: prompt || '',
            aspect_ratio: aspectRatio === '9:16' ? '9:16' : '16:9'
        };

        // Determine generation type based on inputs
        if (imageBase64 && lastFrameBase64) {
            // First and Last frame mode
            requestBody.generationType = 'FIRST_AND_LAST_FRAMES_2_VIDEO';
            // For now, just use first image - last frame requires additional handling
            requestBody.imageUrls = [imageBase64];
        } else if (imageBase64) {
            // Image-to-video
            requestBody.generationType = 'REFERENCE_2_VIDEO';
            requestBody.imageUrls = [imageBase64];
        } else {
            // Text-to-video
            requestBody.generationType = 'TEXT_2_VIDEO';
        }

        console.log('[Veo via Kie.ai] Submitting request to:', `${baseUrlClean}/api/v1/veo/generate`);
        console.log('[Veo via Kie.ai] Request:', JSON.stringify({ ...requestBody, imageUrls: requestBody.imageUrls ? ['[BASE64]'] : [] }));

        // Direct API call with Bearer token
        const response = await fetch(`${baseUrlClean}/api/v1/veo/generate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Kie.ai Veo API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('[Veo via Kie.ai] Response:', JSON.stringify(result));

        // Check for task ID and poll for completion
        const taskId = result.taskId;
        if (!taskId) {
            // Check if video is directly returned
            if (result.videoUrl) {
                console.log('[Veo via Kie.ai] Downloading video from:', result.videoUrl);
                const videoResponse = await fetch(result.videoUrl);
                return Buffer.from(await videoResponse.arrayBuffer());
            }
            throw new Error("No taskId or videoUrl in Kie.ai Veo response");
        }

        // Poll for task completion
        console.log('[Veo via Kie.ai] Polling for task:', taskId);
        const videoUrl = await pollKieVeoTask(taskId, apiKey, baseUrlClean);

        // Download the video
        console.log('[Veo via Kie.ai] Downloading video from:', videoUrl);
        const videoResponse = await fetch(videoUrl);
        return Buffer.from(await videoResponse.arrayBuffer());

    } catch (error) {
        console.error('[Veo via Kie.ai] API Error:', error.message);
        throw error;
    }
}

/**
 * Poll Kie.ai Veo task for completion
 */
async function pollKieVeoTask(taskId, apiKey, baseUrl, maxWaitMs = 600000) {
    const startTime = Date.now();
    const pollInterval = 5000;

    while (Date.now() - startTime < maxWaitMs) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const response = await fetch(`${baseUrl}/api/v1/veo/taskInfo?taskId=${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to poll Veo task: ${response.status}`);
        }

        const result = await response.json();
        console.log('[Veo via Kie.ai] Task status:', result.status);

        if (result.status === 'completed' || result.status === 'succeed') {
            return result.videoUrl;
        } else if (result.status === 'failed' || result.status === 'error') {
            throw new Error(`Veo generation failed: ${result.message || 'Unknown error'}`);
        }
    }

    throw new Error('Veo generation timed out');
}
