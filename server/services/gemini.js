/**
 * gemini.js
 *
 * Google Gemini/Veo API service for image and video generation.
 */

import { GoogleGenAI } from '@google/genai';
import { normalizeImageForVeo } from '../utils/veoImage.js';
import { saveBufferToFile } from '../utils/imageHelpers.js';

// ============================================================================
// CLIENT SETUP
// ============================================================================

let _ai = null;

function serializeProviderError(error) {
    if (!error) return null;

    const plain = {};
    for (const key of Object.getOwnPropertyNames(error)) {
        plain[key] = error[key];
    }

    plain.name = error.name;
    plain.message = error.message;
    plain.status = error.status;

    return plain;
}

function createVeoError(message, { providerError, debugAssets, requestSummary } = {}) {
    const error = new Error(message);
    error.providerError = providerError || null;
    error.debugAssets = debugAssets || null;
    error.requestSummary = requestSummary || null;
    return error;
}

function saveNormalizedDebugImage(normalizedImage, imagesDir, nodeId, label) {
    if (!normalizedImage?.buffer || !imagesDir || !nodeId) return null;

    const saved = saveBufferToFile(
        normalizedImage.buffer,
        imagesDir,
        'veo_debug',
        'jpg',
        `veo_debug_${nodeId}_${label}`
    );

    return {
        label,
        url: saved.url,
        mimeType: normalizedImage.mimeType,
        outputWidth: normalizedImage.outputWidth,
        outputHeight: normalizedImage.outputHeight,
        sourceWidth: normalizedImage.sourceWidth,
        sourceHeight: normalizedImage.sourceHeight,
        targetAspectRatio: normalizedImage.targetAspectRatio,
        targetResolution: normalizedImage.targetResolution
    };
}

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

// ============================================================================
// IMAGE GENERATION
// ============================================================================

/**
 * Generate image using Google Gemini.
 * @returns {Promise<Buffer>} Image buffer
 */
export async function generateGeminiImage({ prompt, imageBase64Array, aspectRatio, resolution, apiKey, modelId }) {
    const ai = getGeminiClient(apiKey);
    const modelMap = {
        'gemini-flash': 'gemini-3.1-flash-image-preview',
        'gemini-pro': 'gemini-3-pro-image-preview',
    };
    const modelName = modelMap[modelId] || 'gemini-3-pro-image-preview';

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

// ============================================================================
// VIDEO GENERATION
// ============================================================================

/**
 * Generate video using Google Veo.
 * @returns {Promise<Buffer>} Video buffer
 */
export async function generateVeoVideo({
    prompt,
    imageBase64,
    lastFrameBase64,
    referenceImages,
    aspectRatio,
    resolution,
    duration,
    generateAudio = true,
    apiKey,
    modelId,
    onStatus,
    debugImagesDir,
    debugNodeId
}) {
    const ai = getGeminiClient(apiKey);
    const modelMap = {
        'veo-3.1': 'veo-3.1-generate-preview',
        'veo-3.1-fast': 'veo-3.1-fast-generate-preview'
    };
    const model = modelMap[modelId] || 'veo-3.1-generate-preview';

    // Map resolution
    const resolutionMap = {
        '4K': '4K',
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
    const debugAssets = {};
    const requestSummary = {
        model,
        mappedRatio,
        mappedResolution,
        requestedDuration: duration,
        mappedDuration
    };

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
    if (referenceImages && referenceImages.length > 0) {
        // Reference mode (ingredients): 3+ reference images
        // Limit to 3 (API constraint)
        const limitedRefs = referenceImages.slice(0, 3);
        console.log(`[Veo] Reference mode: ${limitedRefs.length} reference images`);

        // Force 8s duration for reference mode (API requirement)
        args.config.durationSeconds = 8;
        console.log('[Veo] Reference mode: forcing 8s duration');

        // Normalize each reference image
        args.config.referenceImages = [];
        for (const refImg of limitedRefs) {
            const normalizedRef = await normalizeImageForVeo(refImg, mappedRatio, mappedResolution);
            const debugRef = saveNormalizedDebugImage(
                normalizedRef,
                debugImagesDir,
                debugNodeId,
                `reference_${args.config.referenceImages.length + 1}`
            );
            if (debugRef) {
                debugAssets.referenceImages = [...(debugAssets.referenceImages || []), debugRef];
            }
            args.config.referenceImages.push({
                image: {
                    imageBytes: normalizedRef.imageBytes,
                    mimeType: normalizedRef.mimeType
                },
                referenceType: 'asset'
            });
        }
        console.log('[Veo] Reference mode: args.config.referenceImages set');
    } else if (imageBase64 && lastFrameBase64) {
        // First+last frame interpolation:
        // - args.image = start frame (GenerateVideosParameters.image)
        // - args.config.lastFrame = end frame (GenerateVideosConfig.lastFrame)
        const normalizedFirst = await normalizeImageForVeo(imageBase64, mappedRatio, mappedResolution);
        const normalizedLast = await normalizeImageForVeo(lastFrameBase64, mappedRatio, mappedResolution);
        debugAssets.firstFrame = saveNormalizedDebugImage(normalizedFirst, debugImagesDir, debugNodeId, 'first');
        debugAssets.lastFrame = saveNormalizedDebugImage(normalizedLast, debugImagesDir, debugNodeId, 'last');
        args.image = {
            imageBytes: normalizedFirst.imageBytes,
            mimeType: normalizedFirst.mimeType
        };
        args.config.lastFrame = {
            imageBytes: normalizedLast.imageBytes,
            mimeType: normalizedLast.mimeType
        };
        console.log('[Veo] Frame-to-frame mode: args.image (first frame) + config.lastFrame (last frame)');
    } else if (imageBase64) {
        // Standard image-to-video: set args.image only
        const normalizedImage = await normalizeImageForVeo(imageBase64, mappedRatio, mappedResolution);
        debugAssets.firstFrame = saveNormalizedDebugImage(normalizedImage, debugImagesDir, debugNodeId, 'first');
        args.image = {
            imageBytes: normalizedImage.imageBytes,
            mimeType: normalizedImage.mimeType
        };
        console.log('[Veo] Image-to-video mode: args.image (single start frame)');
    }

    console.log('Calling Veo API with args:', {
        model: args.model,
        prompt: args.prompt.substring(0, 100) + '...',
        config: args.config,
        hasImage: !!args.image,
        hasLastFrame: !!args.config?.lastFrame,
        hasReferenceImages: !!args.config?.referenceImages,
        referenceImageCount: args.config?.referenceImages?.length || 0,
        requestedDuration: duration,
        mappedDuration: mappedDuration
    });
    if (Object.keys(debugAssets).length > 0) {
        console.log('[Veo] Normalized debug assets:', debugAssets);
    }

    onStatus?.({
        phase: 'submitting',
        label: 'Submitting to Google Veo',
        detail: 'Creating provider task'
    });

    // Start generation
    let operation;
    try {
        operation = await ai.models.generateVideos(args);
    } catch (error) {
        const providerError = serializeProviderError(error);
        console.error('[Veo] generateVideos request failed:', {
            requestSummary,
            providerError,
            debugAssets
        });
        throw createVeoError(
            `Veo generation request failed: ${error.message || 'Unknown Google Veo error'}`,
            { providerError, debugAssets, requestSummary }
        );
    }

    // Poll for completion
    let pollCount = 0;
    while (!operation.done) {
        pollCount += 1;
        onStatus?.({
            phase: 'running',
            label: 'Waiting on Google Veo',
            detail: pollCount === 1 ? 'Provider task is running' : `Still running after ${pollCount * 5}s`
        });
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation });
    }

    if (operation.error) {
        console.error('[Veo] operation error:', JSON.stringify(operation.error, null, 2));
        const message = operation.error.message || operation.error.status || 'Unknown Veo operation error';
        throw createVeoError(`Veo generation failed: ${message}`, {
            providerError: operation.error,
            debugAssets,
            requestSummary
        });
    }

    // Get video data - Veo returns either a URI or direct bytes
    const response = operation.response;
    const generatedVideo = response?.generatedVideos?.[0];

    if (!generatedVideo) {
        console.error('Veo API response structure:', JSON.stringify(response, null, 2));
        if (response?.raiMediaFilteredCount > 0) {
            const reasons = Array.isArray(response.raiMediaFilteredReasons)
                ? response.raiMediaFilteredReasons.join(', ')
                : 'Unknown safety filtering reason';
            throw createVeoError(`Veo output filtered by safety policy: ${reasons}`, {
                providerError: response,
                debugAssets,
                requestSummary
            });
        }
        throw createVeoError('No video generated by Veo', {
            providerError: response,
            debugAssets,
            requestSummary
        });
    }

    // Check if we got a URI (need to download) or direct bytes
    if (generatedVideo.video?.uri) {
        onStatus?.({
            phase: 'downloading',
            label: 'Downloading result',
            detail: 'Google Veo finished. Fetching video file'
        });
        // Download video from URI - need to add API key for authentication
        console.log('Downloading video from Veo URI...');
        const downloadUrl = new URL(generatedVideo.video.uri);
        downloadUrl.searchParams.set('key', apiKey);

        const videoResponse = await fetch(downloadUrl.toString());
        if (!videoResponse.ok) {
            throw createVeoError(`Failed to download video from Veo: ${videoResponse.status}`, {
                providerError: { status: videoResponse.status },
                debugAssets,
                requestSummary
            });
        }
        return Buffer.from(await videoResponse.arrayBuffer());
    } else if (generatedVideo.video?.videoBytes) {
        // Direct bytes
        return Buffer.from(generatedVideo.video.videoBytes, 'base64');
    } else if (generatedVideo.videoBytes) {
        return Buffer.from(generatedVideo.videoBytes, 'base64');
    }

    console.error('Veo API response structure:', JSON.stringify(response, null, 2));
    throw createVeoError('No video data in response', {
        providerError: response,
        debugAssets,
        requestSummary
    });
}
