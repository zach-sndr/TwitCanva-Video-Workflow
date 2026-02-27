/**
 * generation.js
 * 
 * Routes for AI image and video generation.
 * Supports Gemini, Veo, Kling AI, Hailuo AI, and OpenAI GPT Image providers.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { generateKlingVideo, generateKlingImage, generateKlingMultiImage } from '../services/kling.js';
import { generateGeminiImage, generateVeoVideo } from '../services/gemini.js';
import { generateHailuoVideo } from '../services/hailuo.js';
import { generateOpenAIImage } from '../services/openai.js';
import {
    generateKieVeoVideo,
    extendKieVeoVideo,
    generateKieKlingMotionControlVideo,
    generateKieKlingVideo,
    generateKieGrokVideo,
    generateKieGrokTextToImage,
    generateKieGrokImageToImage,
    uploadBase64MediaToKie
} from '../services/kie.js';
import { resolveImageToBase64, saveBufferToFile } from '../utils/imageHelpers.js';

const router = express.Router();

// ============================================================================
// LOCAL HELPERS
// ============================================================================

function extractLibraryVideoFilename(inputUrl) {
    if (!inputUrl || typeof inputUrl !== 'string') return null;

    let pathname = inputUrl;
    if (inputUrl.startsWith('http://') || inputUrl.startsWith('https://')) {
        try {
            pathname = new URL(inputUrl).pathname;
        } catch {
            return null;
        }
    }

    const cleanPath = pathname.split('?')[0];
    const match = cleanPath.match(/\/library\/videos\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
}

function findProviderTaskIdByVideoFilename(videosDir, filename) {
    if (!filename) return null;
    try {
        const metadataFiles = fs.readdirSync(videosDir).filter(file => file.endsWith('.json'));
        for (const file of metadataFiles) {
            const fullPath = path.join(videosDir, file);
            const metadata = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            if (metadata?.filename === filename && metadata?.providerTaskId) {
                return metadata.providerTaskId;
            }
        }
    } catch (error) {
        console.warn(`[Video Gen] Failed to scan metadata for provider task ID: ${error.message}`);
    }
    return null;
}

function stripQuery(input) {
    if (!input || typeof input !== 'string') return input;
    return input.split('?')[0];
}

/**
 * Resolve media input for Kie.ai URL-based endpoints.
 * Strategy:
 * 1) Use absolute public URL when provided
 * 2) Use configured public base URL for /library or /assets when available
 * 3) Fallback: convert to base64 and upload to Kie file API (works in local dev)
 */
async function resolveKieMediaUrl(input, req, apiKey, uploadPath = 'media') {
    if (!input || typeof input !== 'string') return null;

    if (!apiKey) {
        throw new Error('KIE_API_KEY is required to resolve Kie media URLs.');
    }

    if (input.startsWith('data:')) {
        return await uploadBase64MediaToKie(input, apiKey, uploadPath);
    }

    const configuredBase = process.env.KIE_ASSET_BASE_URL || process.env.PUBLIC_BASE_URL;

    // Absolute URL: return as-is if public, otherwise try configured base or upload fallback.
    if (input.startsWith('http://') || input.startsWith('https://')) {
        try {
            const u = new URL(input);
            const cleanPath = stripQuery(u.pathname);
            const isLocalhost = /(localhost|127\.0\.0\.1)/i.test(u.hostname);
            if (!isLocalhost) {
                return `${u.origin}${cleanPath}`;
            }

            if (configuredBase) {
                return `${configuredBase.replace(/\/$/, '')}${cleanPath}`;
            }

            const asBase64 = resolveImageToBase64(input);
            if (!asBase64) {
                throw new Error('Could not read localhost media for Kie upload.');
            }
            return await uploadBase64MediaToKie(asBase64, apiKey, uploadPath);
        } catch {
            const asBase64 = resolveImageToBase64(input);
            if (!asBase64) return null;
            return await uploadBase64MediaToKie(asBase64, apiKey, uploadPath);
        }
    }

    // Relative path (e.g. /library/images/...)
    const pathOnly = stripQuery(input.startsWith('/') ? input : `/${input}`);
    const isLibraryPath = pathOnly.startsWith('/library/') || pathOnly.startsWith('/assets/');
    if (isLibraryPath && configuredBase) {
        const base = configuredBase.replace(/\/$/, '');
        return `${base}${pathOnly}`;
    }

    // Final fallback: resolve local file and upload to Kie.
    const asBase64 = resolveImageToBase64(input);
    if (!asBase64) {
        return null;
    }
    return await uploadBase64MediaToKie(asBase64, apiKey, uploadPath);
}

// ============================================================================
// IMAGE GENERATION
// ============================================================================

router.post('/generate-image', async (req, res) => {
    try {
        const { nodeId, prompt, aspectRatio, resolution, imageBase64: rawImageBase64, imageModel, variations, klingReferenceMode, klingFaceIntensity, klingSubjectIntensity } = req.body;
        const { GEMINI_API_KEY, KLING_ACCESS_KEY, KLING_SECRET_KEY, OPENAI_API_KEY, KIE_API_KEY, IMAGES_DIR } = req.app.locals;
        const requestedVariations = [1, 2, 4].includes(Number(variations)) ? Number(variations) : 1;

        const normalizedImageModel = String(imageModel || '').trim().toLowerCase();

        // Determine provider
        const isKlingModel = normalizedImageModel.startsWith('kling-');
        const isOpenAIModel = normalizedImageModel.startsWith('gpt-image-');
        const isKieModel = normalizedImageModel.startsWith('grok-imagine-');
        const isKieGrokTextToImage = normalizedImageModel === 'grok-imagine-text-to-image';

        let imageBuffer;
        let imageFormat = 'png';

        if (isKlingModel) {
            // --- KLING AI IMAGE GENERATION ---
            if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
                return res.status(500).json({
                    error: "Kling API credentials not configured. Add KLING_ACCESS_KEY and KLING_SECRET_KEY to .env"
                });
            }

            console.log(`Using Kling AI model for image: ${imageModel}`);

            // Resolve images if provided
            let resolvedImages = null;
            if (rawImageBase64) {
                const rawImages = Array.isArray(rawImageBase64) ? rawImageBase64 : [rawImageBase64];
                resolvedImages = rawImages.map(img => resolveImageToBase64(img)).filter(Boolean);
            }

            let klingImageUrl;

            // Determine which API to use based on model and reference images:
            // - kling-v1-5: Uses standard API with image_reference parameter
            // - kling-v2, kling-v2-1: Use Multi-Image API (image_reference not supported)
            const isV2Model = imageModel === 'kling-v2' || imageModel === 'kling-v2-1' || imageModel === 'kling-v2-new';
            const hasReferenceImages = resolvedImages && resolvedImages.length > 0;

            if (hasReferenceImages && isV2Model) {
                // V2 models: Use Multi-Image API for image-to-image
                console.log(`Using Kling Multi-Image API for ${imageModel} with ${resolvedImages.length} subject image(s)`);
                klingImageUrl = await generateKlingMultiImage({
                    prompt,
                    subjectImages: resolvedImages,
                    modelId: imageModel,
                    aspectRatio,
                    resolution,
                    accessKey: KLING_ACCESS_KEY,
                    secretKey: KLING_SECRET_KEY
                });
            } else if (hasReferenceImages && resolvedImages.length > 1) {
                // Multiple images with non-V2 model: Use Multi-Image API
                console.log(`Using Kling Multi-Image API with ${resolvedImages.length} subject images`);
                klingImageUrl = await generateKlingMultiImage({
                    prompt,
                    subjectImages: resolvedImages,
                    modelId: imageModel,
                    aspectRatio,
                    resolution,
                    accessKey: KLING_ACCESS_KEY,
                    secretKey: KLING_SECRET_KEY
                });
            } else {
                // V1.5 or text-to-image: Use standard API (V1.5 supports image_reference)
                klingImageUrl = await generateKlingImage({
                    prompt,
                    imageBase64: resolvedImages,
                    modelId: imageModel,
                    aspectRatio,
                    resolution,
                    klingReferenceMode,
                    klingFaceIntensity,
                    klingSubjectIntensity,
                    accessKey: KLING_ACCESS_KEY,
                    secretKey: KLING_SECRET_KEY
                });
            }

            // Download from Kling's URL
            const imageResponse = await fetch(klingImageUrl);
            if (!imageResponse.ok) {
                throw new Error('Failed to download image from Kling');
            }
            imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

            if (klingImageUrl.includes('.jpg') || klingImageUrl.includes('.jpeg')) {
                imageFormat = 'jpg';
            }

        } else if (isOpenAIModel) {
            // --- OPENAI GPT IMAGE GENERATION ---
            if (!OPENAI_API_KEY) {
                return res.status(500).json({
                    error: "OpenAI API key not configured. Add OPENAI_API_KEY to .env"
                });
            }

            console.log(`Using OpenAI GPT Image model: ${imageModel}`);

            // Resolve images if provided
            let imageBase64Array = null;
            if (rawImageBase64) {
                const rawImages = Array.isArray(rawImageBase64) ? rawImageBase64 : [rawImageBase64];
                imageBase64Array = rawImages.map(img => resolveImageToBase64(img)).filter(Boolean);
            }

            imageBuffer = await generateOpenAIImage({
                prompt,
                imageBase64Array,
                aspectRatio,
                resolution,
                variations: requestedVariations,
                apiKey: OPENAI_API_KEY
            });

            // OpenAI can return multiple images natively via `n`.
            if (Array.isArray(imageBuffer)) {
                const savedUrls = [];
                for (let i = 0; i < imageBuffer.length; i++) {
                    const saved = saveBufferToFile(imageBuffer[i], IMAGES_DIR, 'img', imageFormat);
                    savedUrls.push(saved.url);

                    const metadataId = nodeId ? `${nodeId}_${i}` : `${saved.id}_${i}`;
                    const metadata = {
                        id: metadataId,
                        filename: saved.filename,
                        prompt: prompt,
                        model: imageModel || 'gpt-image-1.5',
                        createdAt: new Date().toISOString(),
                        type: 'images',
                        index: i
                    };
                    fs.writeFileSync(path.join(IMAGES_DIR, `${metadataId}.json`), JSON.stringify(metadata, null, 2));
                }

                console.log(`[Image Gen] OpenAI saved ${savedUrls.length} images`);
                return res.json({
                    resultUrl: savedUrls[0],
                    resultUrls: savedUrls
                });
            }

        } else if (isKieModel) {
            // --- KIE.AI GROK IMAGINE GENERATION ---
            if (!KIE_API_KEY) {
                return res.status(500).json({
                    error: "Kie.ai API key not configured. Add KIE_API_KEY to .env"
                });
            }

            console.log(`Using Kie.ai Grok Imagine model: ${imageModel}`);

            // Resolve images if provided - handle both single image and arrays
            let resolvedImage = null;
            if (rawImageBase64) {
                if (Array.isArray(rawImageBase64)) {
                    // Handle array of images - resolve each one
                    const resolvedImages = rawImageBase64.map(img => resolveImageToBase64(img)).filter(Boolean);
                    resolvedImage = resolvedImages.length > 0 ? resolvedImages[0] : null; // Use first image for I2I
                } else {
                    resolvedImage = resolveImageToBase64(rawImageBase64);
                }
            }

            let kieImageUrls;

            if (normalizedImageModel === 'grok-imagine-image-to-image' && !resolvedImage) {
                return res.status(400).json({
                    error: 'Grok Imagine (I2I) requires a source image'
                });
            }

            if (normalizedImageModel === 'grok-imagine-image-to-image' && resolvedImage) {
                // Image-to-Image
                console.log('[Image Gen] Using Kie.ai Grok Imagine I2I');
                kieImageUrls = await generateKieGrokImageToImage({
                    prompt,
                    imageBase64: resolvedImage,
                    aspectRatio,
                    resolution,
                    apiKey: KIE_API_KEY
                });
            } else {
                // Text-to-Image (default)
                console.log('[Image Gen] Using Kie.ai Grok Imagine T2I');
                kieImageUrls = await generateKieGrokTextToImage({
                    prompt,
                    aspectRatio,
                    resolution,
                    apiKey: KIE_API_KEY
                });
            }

            // Ensure we have enough variations:
            // - T2I often returns 6 (slice to requested count)
            // - I2I often returns 2 (run multiple requests when user asks for 4)
            const isKieI2I = normalizedImageModel === 'grok-imagine-image-to-image';
            const targetVariations = isKieGrokTextToImage ? null : requestedVariations;
            let imageUrlArray = Array.isArray(kieImageUrls) ? kieImageUrls : [kieImageUrls];

            if (isKieI2I && targetVariations && targetVariations > imageUrlArray.length) {
                const maxAttempts = 3;
                let attempts = 0;

                while (imageUrlArray.length < targetVariations && attempts < maxAttempts) {
                    attempts += 1;
                    console.log(`[Image Gen] Kie.ai I2I top-up attempt ${attempts} for variations`);
                    const extraUrls = await generateKieGrokImageToImage({
                        prompt,
                        imageBase64: resolvedImage,
                        aspectRatio,
                        resolution,
                        apiKey: KIE_API_KEY
                    });
                    const extraArray = Array.isArray(extraUrls) ? extraUrls : [extraUrls];
                    imageUrlArray.push(...extraArray);
                }
            }

            if (targetVariations) {
                imageUrlArray = imageUrlArray.slice(0, targetVariations);
                console.log(`[Image Gen] Kie.ai returning ${imageUrlArray.length}/${targetVariations} requested variation(s)`);
            } else {
                console.log(`[Image Gen] Kie.ai returning ${imageUrlArray.length} default variation(s) for Grok T2I`);
            }

            // Download all images from Kie.ai's URLs
            const savedUrls = [];
            for (let i = 0; i < imageUrlArray.length; i++) {
                const kieImageUrl = imageUrlArray[i];
                const imageResponse = await fetch(kieImageUrl);
                if (!imageResponse.ok) {
                    throw new Error(`Failed to download image ${i + 1} from Kie.ai`);
                }
                const imageBufferItem = Buffer.from(await imageResponse.arrayBuffer());

                // Determine format from URL
                let format = 'png';
                if (kieImageUrl.includes('.jpg') || kieImageUrl.includes('.jpeg')) {
                    format = 'jpg';
                }

                // Save each image to library
                const saved = saveBufferToFile(imageBufferItem, IMAGES_DIR, 'img', format);
                savedUrls.push(saved.url);

                // Save metadata for each image
                const metadataId = nodeId ? `${nodeId}_${i}` : `${saved.id}_${i}`;
                const metadata = {
                    id: metadataId,
                    filename: saved.filename,
                    prompt: prompt,
                    model: imageModel || 'grok-imagine',
                    createdAt: new Date().toISOString(),
                    type: 'images',
                    index: i
                };
                fs.writeFileSync(path.join(IMAGES_DIR, `${metadataId}.json`), JSON.stringify(metadata, null, 2));
            }

            // Return all saved URLs - include both resultUrl (first image) and resultUrls (all images)
            console.log(`[Image Gen] Kie.ai saved ${savedUrls.length} images`);
            return res.json({
                resultUrl: savedUrls[0], // First image for backward compatibility
                resultUrls: savedUrls   // All images for carousel support
            });

        } else {
            // --- GEMINI IMAGE GENERATION (Default) ---
            if (!GEMINI_API_KEY) {
                return res.status(500).json({ error: "Server missing API Key config" });
            }

            let imageBase64Array = null;
            if (rawImageBase64) {
                const rawImages = Array.isArray(rawImageBase64) ? rawImageBase64 : [rawImageBase64];
                imageBase64Array = rawImages.map(img => resolveImageToBase64(img)).filter(Boolean);
            }

            console.log(`[Image Gen] Using Google Gemini (${imageModel})`);

            imageBuffer = await generateGeminiImage({
                prompt,
                imageBase64Array,
                aspectRatio,
                resolution,
                apiKey: GEMINI_API_KEY,
                modelId: normalizedImageModel
            });
        }

        // Save to library - use unique filename to preserve previous generations
        const saved = saveBufferToFile(imageBuffer, IMAGES_DIR, 'img', imageFormat);

        // Determine metadata ID: use nodeId for recovery if available, otherwise use file ID
        const metadataId = nodeId || saved.id;

        // Save metadata (id must match the metadata filename for delete to work)
        const metadata = {
            id: metadataId,  // Must match the filename for delete API to find it
            filename: saved.filename,
            prompt: prompt,
            model: imageModel || 'gemini-pro',
            createdAt: new Date().toISOString(),
            type: 'images'
        };
        fs.writeFileSync(path.join(IMAGES_DIR, `${metadataId}.json`), JSON.stringify(metadata, null, 2));

        console.log(`Image saved: ${saved.url} (model: ${imageModel || 'gemini-pro'})`);
        return res.json({ resultUrl: saved.url });

    } catch (error) {
        console.error("Server Image Gen Error:", error);
        res.status(500).json({ error: error.message || "Image generation failed" });
    }
});

// ============================================================================
// VIDEO GENERATION
// ============================================================================

router.post('/generate-video', async (req, res) => {
    try {
        const { nodeId, prompt, imageBase64: rawImageBase64, lastFrameBase64: rawLastFrameBase64, referenceImages: rawReferenceImages, motionReferenceUrl: rawMotionReferenceUrl, aspectRatio, resolution, duration, videoModel } = req.body;
        const { GEMINI_API_KEY, KLING_ACCESS_KEY, KLING_SECRET_KEY, HAILUO_API_KEY, KIE_API_KEY, VIDEOS_DIR } = req.app.locals;

        const normalizedVideoModel = String(videoModel || '').trim().toLowerCase();

        // Resolve file URLs to base64
        const imageBase64 = resolveImageToBase64(rawImageBase64);
        const lastFrameBase64 = resolveImageToBase64(rawLastFrameBase64);
        const motionReferenceUrl = resolveImageToBase64(rawMotionReferenceUrl);

        // Resolve reference images for reference mode
        let referenceImages;
        if (rawReferenceImages && Array.isArray(rawReferenceImages)) {
            referenceImages = rawReferenceImages.map(img => resolveImageToBase64(img)).filter(Boolean);
            console.log(`[Video Gen] Reference images: ${referenceImages.length} images provided`);
        }

        // Determine provider
        const isKlingModel = normalizedVideoModel.startsWith('kling-');
        const isHailuoModel = normalizedVideoModel.startsWith('hailuo-');
        const isKieModel = normalizedVideoModel.startsWith('kie-');

        let videoBuffer;
        let providerTaskId;

        if (isKlingModel) {
            // --- KLING AI VIDEO GENERATION ---

            // Check if this is a Kling 2.6 model (route to Fal.ai - official API doesn't support v2.6)
            const isKling26 = videoModel === 'kling-v2-6';
            // Check if this is a motion control request (kling-v2-6 with motion reference)
            const isMotionControl = isKling26 && motionReferenceUrl;

            let resultVideoUrl;

            if (isKling26) {
                // --- KLING 2.6 VIDEO GENERATION ---
                const { FAL_API_KEY } = req.app.locals;

                if (isMotionControl) {
                    // Motion Control mode via Fal.ai
                    console.log(`\n[Route] Kling 2.6 Motion Control detected - routing to fal.ai`);
                    console.log(`[Route] Motion Reference: ${motionReferenceUrl ? 'YES (' + Math.round(motionReferenceUrl.length / 1024) + ' KB)' : 'NO'}`);
                    console.log(`[Route] Character Image: ${imageBase64 ? 'YES (' + Math.round(imageBase64.length / 1024) + ' KB)' : 'NO'}`);
                    console.log(`[Route] Prompt: ${prompt ? prompt.substring(0, 50) + '...' : '(none)'}`);

                    if (!FAL_API_KEY) {
                        return res.status(500).json({
                            error: "FAL_API_KEY not configured. Add FAL_API_KEY to .env for Kling 2.6."
                        });
                    }

                    const { generateFalMotionControl } = await import('../services/fal.js');

                    resultVideoUrl = await generateFalMotionControl({
                        prompt,
                        characterImageBase64: imageBase64,
                        motionVideoBase64: motionReferenceUrl,
                        characterOrientation: 'video',
                        apiKey: FAL_API_KEY
                    });
                } else {
                    // Standard Image-to-Video mode via Fal.ai
                    if (!FAL_API_KEY) {
                        return res.status(500).json({
                            error: "FAL_API_KEY not configured. Add FAL_API_KEY to .env for Kling 2.6."
                        });
                    }

                    console.log(`\n[Route] Kling 2.6 Image-to-Video - routing to fal.ai`);
                    console.log(`[Route] Image: ${imageBase64 ? 'YES (' + Math.round(imageBase64.length / 1024) + ' KB)' : 'NO'}`);
                    console.log(`[Route] Duration: ${duration || 5}s`);
                    console.log(`[Route] Generate Audio: ${req.body.generateAudio !== false}`);

                    const { generateFalImageToVideo } = await import('../services/fal.js');

                    resultVideoUrl = await generateFalImageToVideo({
                        prompt,
                        imageBase64,
                        duration: String(duration || 5),
                        generateAudio: req.body.generateAudio !== false,
                        apiKey: FAL_API_KEY
                    });
                }
            } else {
                // --- STANDARD KLING VIDEO GENERATION ---
                if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
                    return res.status(500).json({
                        error: "Kling API credentials not configured. Add KLING_ACCESS_KEY and KLING_SECRET_KEY to .env"
                    });
                }

                console.log(`Using Kling AI model: ${videoModel}, duration: ${duration || 5}s`);

                resultVideoUrl = await generateKlingVideo({
                    prompt,
                    imageBase64,
                    lastFrameBase64,
                    modelId: videoModel,
                    aspectRatio,
                    duration: duration || 5,
                    motionReferenceUrl,
                    accessKey: KLING_ACCESS_KEY,
                    secretKey: KLING_SECRET_KEY
                });
            }

            // Download from the result URL
            const videoResponse = await fetch(resultVideoUrl);
            if (!videoResponse.ok) {
                throw new Error('Failed to download generated video');
            }
            videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

        } else if (isKieModel) {
            // --- KIE.AI VEO VIDEO GENERATION ---
            if (!KIE_API_KEY) {
                return res.status(500).json({
                    error: "Kie.ai API key not configured. Add KIE_API_KEY to .env"
                });
            }

            const isKieMotionControlModel = normalizedVideoModel === 'kie-kling-2.6-motion-control';
            const isKieVeoExtendModel = normalizedVideoModel === 'kie-veo3-extend';
            const isKieKlingVideoModel = [
                'kie-kling-2.6-text-to-video',
                'kie-kling-2.6-image-to-video',
                'kie-kling-3.0'
            ].includes(normalizedVideoModel);
            const isKieGrokVideoModel = [
                'kie-grok-imagine-text-to-video',
                'kie-grok-imagine-image-to-video'
            ].includes(normalizedVideoModel);
            const callBackUrl = req.body.callBackUrl || process.env.KIE_CALLBACK_URL;

            let kieResult;

            if (isKieMotionControlModel) {
                console.log(`Using Kie.ai Kling Motion Control: ${videoModel}`);

                const characterImageUrl = await resolveKieMediaUrl(rawImageBase64, req, KIE_API_KEY, 'kie-motion-character');
                const motionVideoPublicUrl = await resolveKieMediaUrl(rawMotionReferenceUrl, req, KIE_API_KEY, 'kie-motion-video');

                if (!characterImageUrl) {
                    throw new Error('Kie.ai Kling Motion Control requires a character image URL input.');
                }
                if (!motionVideoPublicUrl) {
                    throw new Error('Kie.ai Kling Motion Control requires a motion reference video URL input.');
                }

                kieResult = await generateKieKlingMotionControlVideo({
                    prompt,
                    characterImageUrl,
                    motionVideoUrl: motionVideoPublicUrl,
                    resolution,
                    characterOrientation: 'image',
                    callBackUrl,
                    apiKey: KIE_API_KEY
                });
            } else if (isKieKlingVideoModel) {
                console.log(`Using Kie.ai Kling video model: ${videoModel}`);
                const imageUrl = rawImageBase64 ? await resolveKieMediaUrl(rawImageBase64, req, KIE_API_KEY, 'kie-kling-image') : null;

                if (normalizedVideoModel === 'kie-kling-2.6-image-to-video' && !imageUrl) {
                    throw new Error('Kie Kling 2.6 image-to-video requires an image input URL.');
                }

                kieResult = await generateKieKlingVideo({
                    prompt,
                    imageUrl,
                    modelId: normalizedVideoModel,
                    aspectRatio,
                    duration: duration || 5,
                    generateAudio: req.body.generateAudio !== false,
                    callBackUrl,
                    apiKey: KIE_API_KEY
                });
            } else if (isKieGrokVideoModel) {
                console.log(`Using Kie.ai Grok video model: ${videoModel}`);
                const imageUrl = rawImageBase64 ? await resolveKieMediaUrl(rawImageBase64, req, KIE_API_KEY, 'kie-grok-i2v') : null;

                if (normalizedVideoModel === 'kie-grok-imagine-image-to-video' && !imageUrl) {
                    throw new Error('Kie Grok Imagine image-to-video requires an image input URL.');
                }

                kieResult = await generateKieGrokVideo({
                    prompt,
                    imageUrl,
                    modelId: normalizedVideoModel,
                    aspectRatio,
                    duration: duration || 6,
                    resolution,
                    mode: req.body.grokImagineMode,
                    callBackUrl,
                    apiKey: KIE_API_KEY
                });
            } else if (isKieVeoExtendModel) {
                // Resolve source task ID in priority order:
                // 1) explicit request body taskId/veoTaskId
                // 2) metadata lookup from connected parent video URL
                const explicitTaskId = req.body.taskId || req.body.veoTaskId;
                const sourceFilename = extractLibraryVideoFilename(rawMotionReferenceUrl);
                const metadataTaskId = sourceFilename ? findProviderTaskIdByVideoFilename(VIDEOS_DIR, sourceFilename) : null;
                const sourceTaskId = explicitTaskId || metadataTaskId;

                if (!sourceTaskId) {
                    throw new Error('Kie Veo Extend requires a source taskId. Connect a previous Kie Veo output video or pass taskId.');
                }

                console.log(`Using Kie.ai Veo Extend: sourceTaskId=${sourceTaskId}`);
                kieResult = await extendKieVeoVideo({
                    sourceTaskId,
                    prompt,
                    seeds: typeof req.body.seeds === 'number' ? req.body.seeds : undefined,
                    watermark: req.body.watermark,
                    extendModel: req.body.extendModel || 'fast',
                    callBackUrl,
                    apiKey: KIE_API_KEY
                });
            } else {
                console.log(`Using Kie.ai Veo model: ${videoModel}, duration: ${duration || 8}s`);
                console.log(`[Kie Veo] rawImageBase64: ${rawImageBase64 ? rawImageBase64.substring(0, 60) + '…' : 'null'}`);
                console.log(`[Kie Veo] rawLastFrameBase64: ${rawLastFrameBase64 ? rawLastFrameBase64.substring(0, 60) + '…' : 'null/undefined'}`);

                const imageUrl = rawImageBase64 ? await resolveKieMediaUrl(rawImageBase64, req, KIE_API_KEY, 'kie-veo-first-frame') : null;
                const lastFrameUrl = rawLastFrameBase64 ? await resolveKieMediaUrl(rawLastFrameBase64, req, KIE_API_KEY, 'kie-veo-last-frame') : null;
                console.log(`[Kie Veo] imageUrl: ${imageUrl}, lastFrameUrl: ${lastFrameUrl}`);

                if (rawImageBase64 && !imageUrl) {
                    throw new Error('Kie.ai Veo requires a valid input image (URL or resolvable library asset).');
                }
                if (rawLastFrameBase64 && !lastFrameUrl) {
                    throw new Error('Kie.ai Veo requires a valid last-frame image (URL or resolvable library asset).');
                }

                // Resolve reference images to public URLs for Kie.ai
                let referenceImageUrls;
                if (referenceImages && referenceImages.length > 0) {
                    const resolvedRefs = await Promise.all(
                        referenceImages.map(async (img) => {
                            try {
                                return await resolveKieMediaUrl(img, req, KIE_API_KEY, 'kie-veo-reference');
                            } catch (e) {
                                console.warn('[Kie Veo] Failed to convert reference image to public URL:', e.message);
                                return null;
                            }
                        })
                    );
                    referenceImageUrls = resolvedRefs.filter(Boolean);
                    console.log(`[Kie Veo] Reference image URLs: ${referenceImageUrls.length} images`);
                }

                kieResult = await generateKieVeoVideo({
                    prompt,
                    imageUrl,
                    lastFrameUrl,
                    referenceImageUrls,
                    modelId: videoModel,
                    aspectRatio,
                    duration: duration || 8,
                    generateAudio: req.body.generateAudio !== false,
                    apiKey: KIE_API_KEY
                });
            }

            const kieVideoUrl = kieResult.videoUrl;
            providerTaskId = kieResult.taskId;

            // Download from Kie.ai's URL
            const videoResponse = await fetch(kieVideoUrl);
            if (!videoResponse.ok) {
                throw new Error('Failed to download video from Kie.ai');
            }
            videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

        } else if (isHailuoModel) {
            // --- HAILUO AI VIDEO GENERATION ---
            if (!HAILUO_API_KEY) {
                return res.status(500).json({
                    error: "Hailuo API key not configured. Add HAILUO_API_KEY to .env"
                });
            }

            console.log(`Using Hailuo AI model: ${videoModel}, duration: ${duration || 6}s`);

            const hailuoVideoUrl = await generateHailuoVideo({
                prompt,
                imageBase64,
                lastFrameBase64,
                modelId: videoModel,
                aspectRatio,
                resolution,
                duration: duration || 6,
                apiKey: HAILUO_API_KEY
            });

            // Download from Hailuo's URL
            const videoResponse = await fetch(hailuoVideoUrl);
            if (!videoResponse.ok) {
                throw new Error('Failed to download video from Hailuo');
            }
            videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

        } else {
            // --- VEO VIDEO GENERATION (Default) ---
            if (!GEMINI_API_KEY) {
                return res.status(500).json({ error: "Server missing API Key config" });
            }

            console.log(`Using Google Veo model: ${videoModel || 'veo-3.1'}, duration: ${duration || 8}s, generateAudio: ${req.body.generateAudio !== false}`);

            videoBuffer = await generateVeoVideo({
                prompt,
                imageBase64,
                lastFrameBase64,
                referenceImages,
                aspectRatio,
                resolution,
                duration: duration || 8,
                generateAudio: req.body.generateAudio !== false, // Default to true
                apiKey: GEMINI_API_KEY,
                modelId: normalizedVideoModel || 'veo-3.1'
            });
        }

        // Save to library - use unique filename to preserve previous generations
        const saved = saveBufferToFile(videoBuffer, VIDEOS_DIR, 'vid', 'mp4');

        // Determine metadata ID: use nodeId for recovery if available, otherwise use file ID
        const metadataId = nodeId || saved.id;

        // Save metadata (id must match the metadata filename for delete to work)
        const metadata = {
            id: metadataId,  // Must match the filename for delete API to find it
            filename: saved.filename,
            prompt: prompt,
            model: videoModel || 'veo-3.1',
            aspectRatio: aspectRatio || 'Auto',
            resolution: resolution || 'Auto',
            createdAt: new Date().toISOString(),
            type: 'videos'
        };
        if (providerTaskId) {
            metadata.providerTaskId = providerTaskId;
        }
        fs.writeFileSync(path.join(VIDEOS_DIR, `${metadataId}.json`), JSON.stringify(metadata, null, 2));

        console.log(`Video saved: ${saved.url} (model: ${videoModel || 'veo-3.1'})`);
        return res.json({ resultUrl: saved.url });

    } catch (error) {
        console.error("Server Video Gen Error:", error);
        res.status(500).json({ error: error.message || "Video generation failed" });
    }
});

// ============================================================================
// GENERATION STATUS / RECOVERY
// ============================================================================

/**
 * Check if a generation has finished for a specific nodeId.
 * Returns the resultUrl if it exists.
 */
router.get('/generation-status/:nodeId', async (req, res) => {
    try {
        const { nodeId } = req.params;
        const { IMAGES_DIR, VIDEOS_DIR } = req.app.locals;

        // Check images metadata
        const imageMetaPath = path.join(IMAGES_DIR, `${nodeId}.json`);
        if (fs.existsSync(imageMetaPath)) {
            const meta = JSON.parse(fs.readFileSync(imageMetaPath, 'utf8'));
            return res.json({ status: 'success', resultUrl: `/library/images/${meta.filename}`, type: 'image', createdAt: meta.createdAt });
        }

        // Check videos metadata
        const videoMetaPath = path.join(VIDEOS_DIR, `${nodeId}.json`);
        if (fs.existsSync(videoMetaPath)) {
            const meta = JSON.parse(fs.readFileSync(videoMetaPath, 'utf8'));
            return res.json({ status: 'success', resultUrl: `/library/videos/${meta.filename}`, type: 'video', createdAt: meta.createdAt });
        }

        res.json({ status: 'pending' });
    } catch (error) {
        console.error("Status Check Error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
