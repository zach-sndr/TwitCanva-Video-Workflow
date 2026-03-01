/**
 * useGeneration.ts
 * 
 * Custom hook for handling AI content generation (images and videos).
 * Manages generation state, API calls, and error handling.
 */

import { NodeData, NodeType, NodeStatus, CarouselImageSettings } from '../types';
import { generateImage, generateVideo } from '../services/generationService';
import { generateLocalImage } from '../services/localModelService';
import { extractVideoLastFrame } from '../utils/videoHelpers';
import { getNodeFaceImage } from '../utils/nodeHelpers';
import React from 'react';
import { rememberNodeGenerationPreferences } from '../services/sessionMemory';

interface UseGenerationProps {
    nodes: NodeData[];
    updateNode: (id: string, updates: Partial<NodeData>) => void;
}

export const useGeneration = ({ nodes, updateNode }: UseGenerationProps) => {
    // ============================================================================
    // HELPERS
    // ============================================================================

    /**
     * Convert pixel dimensions to closest standard aspect ratio
     */
    const getClosestAspectRatio = (width: number, height: number): string => {
        const ratio = width / height;
        const standardRatios = [
            { label: '1:1', value: 1 },
            { label: '16:9', value: 16 / 9 },
            { label: '9:16', value: 9 / 16 },
            { label: '4:3', value: 4 / 3 },
            { label: '3:4', value: 3 / 4 },
            { label: '3:2', value: 3 / 2 },
            { label: '2:3', value: 2 / 3 },
            { label: '5:4', value: 5 / 4 },
            { label: '4:5', value: 4 / 5 },
            { label: '21:9', value: 21 / 9 }
        ];

        let closest = standardRatios[0];
        let minDiff = Math.abs(ratio - closest.value);

        for (const r of standardRatios) {
            const diff = Math.abs(ratio - r.value);
            if (diff < minDiff) {
                minDiff = diff;
                closest = r;
            }
        }

        return closest.label;
    };

    /**
     * Detect the actual aspect ratio of an image
     * @param imageUrl - URL or base64 of the image
     * @returns Promise with resultAspectRatio (exact) and aspectRatio (closest standard)
     */
    const getImageAspectRatio = (imageUrl: string): Promise<{ resultAspectRatio: string; aspectRatio: string }> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const resultAspectRatio = `${img.naturalWidth}/${img.naturalHeight}`;
                const aspectRatio = getClosestAspectRatio(img.naturalWidth, img.naturalHeight);
                resolve({ resultAspectRatio, aspectRatio });
            };
            img.onerror = () => {
                resolve({ resultAspectRatio: '16/9', aspectRatio: '16:9' });
            };
            img.src = imageUrl;
        });
    };

    // ============================================================================
    // GENERATION HANDLER
    // ============================================================================

    /**
     * Handles content generation for a node
     * Supports image and video generation with parent node chaining
     * 
     * @param id - ID of the node to generate content for
     */
    const handleGenerate = async (id: string) => {
        const node = nodes.find(n => n.id === id);
        if (!node) return;

        // Get prompts from connected TEXT nodes (if any)
        const getTextNodePrompts = (): string[] => {
            if (!node.parentIds) return [];
            return node.parentIds
                .map(pid => nodes.find(n => n.id === pid))
                .filter(n => n?.type === NodeType.TEXT && n.prompt)
                .map(n => n!.prompt);
        };

        // Get prompts from connected STYLE nodes (if any)
        const getStyleNodePrompts = (): string[] => {
            if (!node.parentIds) return [];
            return node.parentIds
                .map(pid => nodes.find(n => n.id === pid))
                .filter(n => n?.type === NodeType.STYLE && n.prompt)
                .map(n => n!.prompt);
        };

        // Combine prompts: TEXT node prompts + STYLE node prompts + chip prompts + node's own prompt
        const textNodePrompts = getTextNodePrompts();
        const styleNodePrompts = getStyleNodePrompts();
        const chipPrompts = (node.promptChips || []).map(c => c.prompt).filter(Boolean);
        const combinedPrompt = [...textNodePrompts, ...styleNodePrompts, ...chipPrompts, node.prompt].filter(Boolean).join('\n\n');

        // Check if prompt is required
        // For Kling frame-to-frame with both start and end frames, prompt is optional
        const isKlingFrameToFrame =
            node.type === NodeType.VIDEO &&
            node.videoModel?.startsWith('kling-') &&
            (node.parentIds && node.parentIds.length >= 2);

        if (!combinedPrompt && !isKlingFrameToFrame) return;

        // Save previous state before starting generation (for cancel functionality)
        savePreviousState(id);
        rememberNodeGenerationPreferences(node);

        // Snapshot the settings used for this generation run (for carousel sticky settings)
        const settingsSnapshot: CarouselImageSettings = {
            prompt: node.prompt,
            imageModel: node.imageModel,
            aspectRatio: node.aspectRatio,
            resolution: node.resolution,
            variationCount: node.variationCount,
            klingReferenceMode: node.klingReferenceMode,
            klingFaceIntensity: node.klingFaceIntensity,
            klingSubjectIntensity: node.klingSubjectIntensity,
        };

        updateNode(id, { status: NodeStatus.LOADING, generationStartTime: Date.now() });

        try {
            if (node.type === NodeType.IMAGE || node.type === NodeType.IMAGE_EDITOR) {
                // Collect ALL parent images for multi-input generation
                const imageBase64s: string[] = [];

                // Get images from all direct parents (excluding TEXT nodes)
                if (node.parentIds && node.parentIds.length > 0) {
                    for (const parentId of node.parentIds) {
                        let currentId: string | undefined = parentId;

                        // Traverse up the chain to find an image source (skip TEXT nodes)
                        while (currentId && imageBase64s.length < 14) { // Gemini 3 Pro limit
                            const parent = nodes.find(n => n.id === currentId);
                            // Skip TEXT nodes - they provide prompts, not images
                            if (parent?.type === NodeType.TEXT) {
                                break;
                            }
                            const parentImage = getNodeFaceImage(parent);
                            if (parentImage) {
                                imageBase64s.push(parentImage);
                                break; // Found image for this parent chain
                            } else {
                                // Continue up this chain
                                currentId = parent?.parentIds?.[0];
                            }
                        }
                    }
                }

                // Add character reference URLs from storyboard nodes (for maintaining character consistency)
                if (node.characterReferenceUrls && node.characterReferenceUrls.length > 0) {
                    for (const charUrl of node.characterReferenceUrls) {
                        if (imageBase64s.length < 14) { // Respect Gemini's limit
                            imageBase64s.push(charUrl);
                        }
                    }
                }

                const requestedVariations = ([1, 2, 4].includes(node.variationCount || 1) ? (node.variationCount || 1) : 1) as 1 | 2 | 4;
                const normalizedImageModel = (node.imageModel || '').toLowerCase();
                const isGeminiModel = normalizedImageModel.startsWith('gemini-');
                const useParallelGeminiVariations = isGeminiModel && requestedVariations > 1;

                // Capture existing carousel state — new images will be appended, not replacing
                const existingUrls: string[] = node.resultUrls
                    ? [...node.resultUrls]
                    : node.resultUrl ? [node.resultUrl] : [];
                const existingSettings: CarouselImageSettings[] = node.carouselSettings
                    ? [...node.carouselSettings]
                    : [];
                const hasExistingResults = existingUrls.length > 0;

                if (useParallelGeminiVariations) {
                    // Gemini: run N variations in parallel, show per-slot progress on first generation.
                    // On re-generation, keep existing images visible (spinner overlay is sufficient).
                    const slots: Array<{ status: 'generating' | 'success' | 'failed'; url?: string }> =
                        Array.from({ length: requestedVariations }, () => ({ status: 'generating' }));

                    if (!hasExistingResults) {
                        updateNode(id, {
                            imageVariations: [...slots],
                            carouselIndex: 0,
                            resultUrl: undefined,
                            resultUrls: undefined,
                            errorMessage: undefined
                        });
                    }

                    const runVariation = async (index: number) => {
                        try {
                            const result = await generateImage({
                                prompt: combinedPrompt,
                                aspectRatio: node.aspectRatio,
                                resolution: node.resolution,
                                variations: 1,
                                imageBase64: imageBase64s.length > 0 ? imageBase64s : undefined,
                                imageModel: node.imageModel,
                                nodeId: id,
                                klingReferenceMode: node.klingReferenceMode,
                                klingFaceIntensity: node.klingFaceIntensity,
                                klingSubjectIntensity: node.klingSubjectIntensity
                            });

                            const resultUrl = `${result.resultUrl}?t=${Date.now()}`;
                            slots[index] = { status: 'success', url: resultUrl };
                        } catch {
                            slots[index] = { status: 'failed' };
                        }

                        // Only update per-slot progress when showing the imageVariations UI (first generation)
                        if (!hasExistingResults) {
                            const soFarUrls = slots.filter(s => s.status === 'success' && s.url).map(s => s.url as string);
                            const firstSuccessIndex = slots.findIndex(s => s.status === 'success' && s.url);
                            updateNode(id, {
                                imageVariations: [...slots],
                                resultUrl: soFarUrls[0],
                                resultUrls: soFarUrls.length > 1 ? soFarUrls : undefined,
                                carouselIndex: firstSuccessIndex >= 0 ? firstSuccessIndex : 0
                            });
                        }
                    };

                    await Promise.allSettled(Array.from({ length: requestedVariations }, (_, idx) => runVariation(idx)));

                    const newUrls = slots.filter(s => s.status === 'success' && s.url).map(s => s.url as string);
                    if (newUrls.length === 0) {
                        updateNode(id, {
                            status: NodeStatus.ERROR,
                            imageVariations: hasExistingResults ? undefined : [...slots],
                            errorMessage: 'All variation generations failed'
                        });
                        return;
                    }

                    const combinedUrls = [...existingUrls, ...newUrls];
                    const combinedSettings = [
                        ...existingSettings,
                        ...Array.from({ length: requestedVariations }, () => settingsSnapshot)
                    ];
                    const { resultAspectRatio } = await getImageAspectRatio(newUrls[0]);
                    updateNode(id, {
                        status: NodeStatus.SUCCESS,
                        imageVariations: undefined,
                        resultUrl: combinedUrls[0],
                        resultUrls: combinedUrls.length > 1 ? combinedUrls : undefined,
                        carouselIndex: existingUrls.length, // jump to first new image
                        resultAspectRatio,
                        carouselSettings: combinedSettings,
                        errorMessage: newUrls.length < requestedVariations ? 'Some variations failed' : undefined
                    });
                } else {
                    // Native multi-output path (Kie/OpenAI) or single-output path.
                    updateNode(id, { imageVariations: undefined });
                    const result = await generateImage({
                        prompt: combinedPrompt,
                        aspectRatio: node.aspectRatio,
                        resolution: node.resolution,
                        variations: requestedVariations,
                        imageBase64: imageBase64s.length > 0 ? imageBase64s : undefined,
                        imageModel: node.imageModel,
                        nodeId: id,
                        klingReferenceMode: node.klingReferenceMode,
                        klingFaceIntensity: node.klingFaceIntensity,
                        klingSubjectIntensity: node.klingSubjectIntensity
                    });

                    const resultUrl = `${result.resultUrl}?t=${Date.now()}`;
                    const newResultUrls = result.resultUrls?.map(url => `${url}?t=${Date.now()}`) || [resultUrl];
                    const { resultAspectRatio } = await getImageAspectRatio(resultUrl);

                    const combinedUrls = [...existingUrls, ...newResultUrls];
                    const combinedSettings = [
                        ...existingSettings,
                        ...Array.from({ length: newResultUrls.length }, () => settingsSnapshot)
                    ];
                    updateNode(id, {
                        status: NodeStatus.SUCCESS,
                        imageVariations: undefined,
                        resultUrl: combinedUrls[0],
                        resultUrls: combinedUrls.length > 1 ? combinedUrls : undefined,
                        carouselIndex: existingUrls.length, // jump to first new image
                        resultAspectRatio,
                        carouselSettings: combinedSettings,
                        errorMessage: undefined
                    });
                }


            } else if (node.type === NodeType.LOCAL_IMAGE_MODEL) {
                // --- LOCAL MODEL GENERATION ---
                // Check if model is selected
                if (!node.localModelId && !node.localModelPath) {
                    updateNode(id, {
                        status: NodeStatus.ERROR,
                        errorMessage: 'No local model selected. Please select a model first.'
                    });
                    return;
                }

                // Get parent images if any
                const imageBase64s: string[] = [];
                if (node.parentIds && node.parentIds.length > 0) {
                    for (const parentId of node.parentIds) {
                        const parent = nodes.find(n => n.id === parentId);
                        const parentImage = getNodeFaceImage(parent);
                        if (parent?.type !== NodeType.TEXT && parentImage) {
                            imageBase64s.push(parentImage);
                        }
                    }
                }

                // Call local generation API
                const result = await generateLocalImage({
                    modelId: node.localModelId,
                    modelPath: node.localModelPath,
                    prompt: combinedPrompt,
                    aspectRatio: node.aspectRatio,
                    resolution: node.resolution || '512'
                });

                if (result.success && result.resultUrl) {
                    // Add cache-busting parameter
                    const resultUrl = `${result.resultUrl}?t=${Date.now()}`;

                    // Detect actual image dimensions
                    const { resultAspectRatio } = await getImageAspectRatio(resultUrl);

                    updateNode(id, {
                        status: NodeStatus.SUCCESS,
                        resultUrl,
                        resultAspectRatio,
                        errorMessage: undefined
                    });
                } else {
                    throw new Error(result.error || 'Local generation failed');
                }

            } else if (node.type === NodeType.VIDEO) {
                // Get first parent image for video generation (start frame)
                let imageBase64: string | undefined;
                let lastFrameBase64: string | undefined;

                // Get non-TEXT parent nodes
                const nonTextParentIds = node.parentIds?.filter(pid => {
                    const parent = nodes.find(n => n.id === pid);
                    return parent?.type !== NodeType.TEXT;
                }) || [];

                // Image-like parents for frame-to-frame mode.
                // Only include nodes that actually have an image URL to contribute.
                const imageParentNodes = nonTextParentIds
                    .map(pid => nodes.find(n => n.id === pid))
                    .filter((p): p is NodeData =>
                        !!p &&
                        (
                            ((p.type === NodeType.IMAGE || p.type === NodeType.IMAGE_EDITOR || p.type === NodeType.LOCAL_IMAGE_MODEL) && !!p.resultUrl) ||
                            (p.type === NodeType.VIDEO && !!p.lastFrame)
                        )
                    );
                const imageParentIds = imageParentNodes.map(p => p.id);

                console.log('[Video Gen] imageParentNodes debug', {
                    nodeId: id,
                    videoModel: node.videoModel,
                    parentIds: node.parentIds,
                    nonTextParentIds,
                    imageParentIds,
                    imageParentTypes: imageParentNodes.map(p => ({ id: p.id, type: p.type, hasResult: !!p.resultUrl, hasLastFrame: !!p.lastFrame }))
                });

                // Check for frame-to-frame mode (explicit or auto-detected from 2+ image parents)
                const hasMultipleInputs = imageParentIds.length >= 2;
                const hasExplicitFrameInputs = node.frameInputs && node.frameInputs.length >= 2;

                // Motion Reference logic (Kling 2.6)
                let motionReferenceUrl: string | undefined;
                let isMotionControl = false;
                const isMotionControlModel =
                    node.videoModel === 'kling-v2-6' ||
                    node.videoModel === 'kie-kling-2.6-motion-control' ||
                    node.videoModel === 'kie-veo3-extend';

                if (isMotionControlModel) {
                    // Find a parent video node that has a result
                    const videoParent = node.parentIds
                        ?.map(pid => nodes.find(n => n.id === pid))
                        .find(n => n?.type === NodeType.VIDEO && n.resultUrl);

                    if (videoParent) {
                        motionReferenceUrl = videoParent.resultUrl;
                        isMotionControl = true;
                    }
                }

                // Only evaluate as frame-to-frame if NOT in motion control mode
                const isFrameToFrame = !isMotionControl && (node.videoMode === 'frame-to-frame' || hasMultipleInputs || hasExplicitFrameInputs);

                // Reference mode: 3+ image parents (ingredients mode)
                const isReferenceMode = !isMotionControl && (node.videoMode === 'reference' || imageParentIds.length >= 3);

                // Collect reference images for reference mode
                let referenceImages: string[] | undefined;
                if (isReferenceMode && imageParentIds.length >= 3) {
                    referenceImages = [];
                    for (const parentId of imageParentIds) {
                        const parent = nodes.find(n => n.id === parentId);
                        if (parent) {
                            const parentImage = getNodeFaceImage(parent);
                            if (parentImage) {
                                referenceImages.push(parentImage);
                            }
                        }
                    }
                    // Limit to 3 (API constraint)
                    referenceImages = referenceImages.slice(0, 3);
                    console.log('[Video Gen] Reference mode detected:', {
                        imageParentCount: imageParentIds.length,
                        referenceImagesCount: referenceImages.length
                    });
                }

                if (isFrameToFrame && imageParentIds.length >= 2) {
                    // Get start and end frames from frameInputs (if user reordered) or default order
                    const parent1 = nodes.find(n => n.id === imageParentIds[0]);
                    const parent2 = nodes.find(n => n.id === imageParentIds[1]);

                    // For frame inputs, VIDEO nodes contribute their lastFrame (not resultUrl)
                    const getFrameImage = (n: NodeData | undefined | null): string | undefined => {
                        if (!n) return undefined;
                        if (n.type === NodeType.VIDEO) return n.lastFrame;
                        return getNodeFaceImage(n);
                    };

                    // Check if user has explicitly set frame order
                    if (node.frameInputs && node.frameInputs.length >= 2) {
                        const startFrameInput = node.frameInputs.find(f => f.order === 'start');
                        const endFrameInput = node.frameInputs.find(f => f.order === 'end');

                        if (startFrameInput) {
                            const startNode = nodes.find(n => n.id === startFrameInput.nodeId);
                            const startImage = getFrameImage(startNode);
                            if (startImage) {
                                imageBase64 = startImage;
                            }
                        }

                        if (endFrameInput) {
                            const endNode = nodes.find(n => n.id === endFrameInput.nodeId);
                            const endImage = getFrameImage(endNode);
                            if (endImage) {
                                lastFrameBase64 = endImage;
                            }
                        }

                        // Fallback if frameInputs references are stale/missing
                        if (!imageBase64 || !lastFrameBase64) {
                            const p1Image = getFrameImage(parent1);
                            const p2Image = getFrameImage(parent2);
                            if (!imageBase64 && p1Image) imageBase64 = p1Image;
                            if (!lastFrameBase64 && p2Image) lastFrameBase64 = p2Image;
                        }
                    } else {
                        // Default: first parent = start, second parent = end
                        const p1Image = getFrameImage(parent1);
                        const p2Image = getFrameImage(parent2);
                        if (p1Image) imageBase64 = p1Image;
                        if (p2Image) lastFrameBase64 = p2Image;
                    }
                } else if (nonTextParentIds.length > 0) {
                    // Standard mode or Motion Control: get character reference or first parent image
                    if (isMotionControl) {
                        // For Motion Control, look specifically for an IMAGE parent as character reference
                        const characterParent = node.parentIds
                            ?.map(pid => nodes.find(n => n.id === pid))
                            .find(n => n?.type === NodeType.IMAGE && n.resultUrl);

                        const charImage = getNodeFaceImage(characterParent);
                        if (charImage) {
                            imageBase64 = charImage;
                        }
                    } else {
                        // Standard mode: get first parent image or video last frame
                        // Use nonTextParentIds (filtered to exclude TEXT nodes) instead of raw parentIds
                        const parent = nodes.find(n => n.id === nonTextParentIds[0]);

                        if (parent?.type === NodeType.VIDEO && parent.lastFrame) {
                            // Use last frame from parent video
                            imageBase64 = parent.lastFrame;
                        } else {
                            // Use parent image (carousel-aware)
                            const parentImage = getNodeFaceImage(parent);
                            if (parentImage) {
                                imageBase64 = parentImage;
                            }
                        }
                    }
                }

                console.log('[Video Gen] Pre-generate frame state', {
                    nodeId: id,
                    isFrameToFrame,
                    hasMultipleInputs,
                    imageParentCount: imageParentIds.length,
                    imageBase64Present: !!imageBase64,
                    lastFrameBase64Present: !!lastFrameBase64,
                    imageBase64Preview: imageBase64?.slice(0, 80),
                    lastFrameBase64Preview: lastFrameBase64?.slice(0, 80),
                    frameInputs: node.frameInputs
                });

                // Generate video
                const rawResultUrl = await generateVideo({
                    prompt: combinedPrompt,
                    imageBase64: isReferenceMode ? undefined : imageBase64, // Reference mode uses referenceImages instead
                    lastFrameBase64: isReferenceMode ? undefined : lastFrameBase64,
                    referenceImages: isReferenceMode ? referenceImages : undefined,
                    aspectRatio: node.aspectRatio,
                    resolution: node.resolution,
                    duration: node.videoDuration,
                    videoModel: node.videoModel,
                    motionReferenceUrl,
                    generateAudio: node.generateAudio, // For Kling 2.6 and Veo 3.1 native audio
                    grokImagineMode: node.grokImagineMode,
                    nodeId: id
                });

                // Add cache-busting parameter to force browser to fetch new video
                // (Backend uses nodeId as filename, so URL is the same for regenerated videos)
                const resultUrl = `${rawResultUrl}?t=${Date.now()}`;

                // Extract last frame for chaining
                const lastFrame = await extractVideoLastFrame(resultUrl);

                // Detect video aspect ratio
                let resultAspectRatio: string | undefined;
                let aspectRatio: string | undefined;
                try {
                    const video = document.createElement('video');
                    await new Promise<void>((resolve) => {
                        video.onloadedmetadata = () => {
                            resultAspectRatio = `${video.videoWidth}/${video.videoHeight}`;
                            aspectRatio = getClosestAspectRatio(video.videoWidth, video.videoHeight);
                            resolve();
                        };
                        video.onerror = () => resolve();
                        video.src = resultUrl;
                    });
                } catch (e) {
                    // Ignore errors, use undefined aspect ratio
                }

                updateNode(id, {
                    status: NodeStatus.SUCCESS,
                    resultUrl,
                    resultAspectRatio,
                    aspectRatio,
                    lastFrame,
                    errorMessage: undefined // Clear any previous error
                });


            }
        } catch (error: any) {
            // Handle errors
            const msg = error.toString().toLowerCase();
            let errorMessage = error.message || 'Generation failed';

            if (msg.includes('permission_denied') || msg.includes('403')) {
                errorMessage = 'Permission denied. Check API Key configuration.';
            } else if (msg.includes('unable to process input image') || msg.includes('invalid_argument')) {
                errorMessage = '⚠️ Input image incompatible. Veo requires: JPEG format, 16:9 or 9:16 aspect ratio. Try a different image or generate without input.';
            }

            updateNode(id, { status: NodeStatus.ERROR, errorMessage });
            console.error('Generation failed:', error);
        }
    };

    // ============================================================================
    // RETURN
    // ============================================================================

    // Track previous state for each node before generation (for cancel functionality)
    const previousStateRef = React.useRef<Map<string, {
        status: NodeStatus;
        resultUrl?: string;
        resultUrls?: string[];
        imageVariations?: { status: 'generating' | 'success' | 'failed'; url?: string }[];
        errorMessage?: string;
    }>>(new Map());

    /**
     * Cancel an in-progress generation
     * Reverts the node to its previous state
     */
    const handleCancelGeneration = React.useCallback((id: string) => {
        const previousState = previousStateRef.current.get(id);
        if (previousState) {
            updateNode(id, {
                status: previousState.status,
                resultUrl: previousState.resultUrl,
                resultUrls: previousState.resultUrls,
                imageVariations: previousState.imageVariations,
                errorMessage: previousState.errorMessage
            });
            previousStateRef.current.delete(id);
        } else {
            // No previous state, just reset to idle
                updateNode(id, {
                    status: NodeStatus.IDLE,
                    resultUrl: undefined,
                    resultUrls: undefined,
                    imageVariations: undefined,
                    errorMessage: undefined
                });
        }
    }, [updateNode]);

    // Save previous state before starting generation
    const savePreviousState = React.useCallback((id: string) => {
        const node = nodes.find(n => n.id === id);
        if (node) {
            previousStateRef.current.set(id, {
                status: node.status,
                resultUrl: node.resultUrl,
                resultUrls: node.resultUrls,
                imageVariations: node.imageVariations,
                errorMessage: node.errorMessage
            });
        }
    }, [nodes]);

    return {
        handleGenerate,
        handleCancelGeneration
    };
};
