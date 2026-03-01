/**
 * NodeControls.tsx
 * 
 * Control panel for canvas nodes.
 * Handles prompt input, model selection, size/ratio settings, and generation button.
 * For Video nodes: includes Advanced Settings for frame-to-frame mode.
 */

import React, { useState, useRef, useEffect, memo } from 'react';
import { Sparkles, Banana, Settings2, Check, ChevronDown, ChevronUp, GripVertical, Image as ImageIcon, Film, Clock, Monitor, Crop, HardDrive } from 'lucide-react';
import { NodeData, NodeStatus, NodeType } from '../../types';
import { OpenAIIcon, GoogleIcon, KlingIcon, HailuoIcon, KieIcon } from '../icons/BrandIcons';
import { useFaceDetection } from '../../hooks/useFaceDetection';
import { ChangeAnglePanel } from './ChangeAnglePanel';
import { LocalModel, getLocalModels } from '../../services/localModelService';
import { IMAGE_MODELS, VIDEO_MODELS } from '../../config/providers';
import { PromptEditor } from './PromptEditor';
import {
    getRememberedSettingsForModel,
    rememberModelForNodeType,
    rememberSettingsForModel
} from '../../services/sessionMemory';

interface NodeControlsProps {
    data: NodeData;
    inputUrl?: string;
    isLoading: boolean;
    isSuccess: boolean;
    connectedImageNodes?: { id: string; url: string; type?: NodeType }[]; // Connected parent nodes
    connectedStyleNodes?: NodeData[]; // Connected STYLE nodes (if any)
    onUpdate: (id: string, updates: Partial<NodeData>) => void;
    onGenerate: (id: string) => void;
    onChangeAngleGenerate?: (nodeId: string) => void;
    onSelect: (id: string) => void;
    zoom: number;
    canvasTheme?: 'dark' | 'light';
    enabledModels?: Set<string>;
}

const IMAGE_RATIOS = [
    "Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9"
];

const VIDEO_RESOLUTIONS = [
    "Auto", "4K", "1080p", "768p", "720p", "512p"
];

// Video durations in seconds
const VIDEO_DURATIONS = [5, 6, 8, 10];
const IMAGE_VARIATION_OPTIONS: Array<1 | 2 | 4> = [1, 2, 4];

// Video model versions with metadata
// supportsTextToVideo: Can generate video from text prompt only
// supportsImageToVideo: Can use a single input image (start frame)
// supportsMultiImage: Can use multiple input images (frame-to-frame)
// durations: Supported video durations in seconds
// resolutions: Supported resolutions (model-specific)
// aspectRatios: Supported aspect ratios (most video models support 16:9 and 9:16)
const VIDEO_ASPECT_RATIOS = ["16:9", "9:16"];

// VIDEO_MODELS imported from config/providers.ts

// Image model versions with metadata
// supportsImageToImage: Can use a single reference image (for image-to-image transformation)
// supportsMultiImage: Can use multiple reference images (2-4) via Multi-Image API
// Note: Kling V1 and V2-new don't support reference images in standard API
// Note: Kling V1.5 is the only Kling model supporting single-image reference via image_reference
// Note: Kling V2/V2.1 only support references via Multi-Image API
// aspectRatios: Supported aspect ratios for the model
// IMAGE_MODELS imported from config/providers.ts

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build a prompt that includes angle transformation instructions
 * for generating the image from a different viewing angle
 */
function buildAnglePrompt(
    basePrompt: string,
    settings: { rotation: number; tilt: number; scale: number; wideAngle: boolean }
): string {
    const parts: string[] = [];

    // Base instruction
    parts.push('Generate this same image from a different camera angle.');

    // Rotation (horizontal)
    if (settings.rotation !== 0) {
        const direction = settings.rotation > 0 ? 'right' : 'left';
        parts.push(`The camera has rotated ${Math.abs(settings.rotation)}° to the ${direction}.`);
    }

    // Tilt (vertical)
    if (settings.tilt !== 0) {
        const direction = settings.tilt > 0 ? 'upward' : 'downward';
        parts.push(`The camera has tilted ${Math.abs(settings.tilt)}° ${direction}.`);
    }

    // Scale
    if (settings.scale !== 0) {
        if (settings.scale > 50) {
            parts.push('The camera is positioned closer to the subject.');
        } else if (settings.scale < 50 && settings.scale > 0) {
            parts.push('The camera is positioned slightly closer.');
        }
    }

    // Wide-angle lens
    if (settings.wideAngle) {
        parts.push('Use a wide-angle lens perspective with visible distortion at the edges.');
    }

    // Add original prompt context if provided
    if (basePrompt.trim()) {
        parts.push(`Original scene description: ${basePrompt}`);
    }

    return parts.join(' ');
}

const NodeControlsComponent: React.FC<NodeControlsProps> = ({
    data,
    inputUrl,
    isLoading,
    isSuccess,
    connectedImageNodes = [],
    connectedStyleNodes,
    onUpdate,
    onGenerate,
    onChangeAngleGenerate,
    onSelect,
    zoom,
    canvasTheme = 'dark',
    enabledModels
}) => {
    // Filter models by enabledModels prop (backward compatible: show all if not provided)
    const filteredImageModels = enabledModels ? IMAGE_MODELS.filter(m => enabledModels.has(m.id)) : IMAGE_MODELS;
    const filteredVideoModels = enabledModels ? VIDEO_MODELS.filter(m => enabledModels.has(m.id)) : VIDEO_MODELS;

    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showSizeDropdown, setShowSizeDropdown] = useState(false);
    const [showAspectRatioDropdown, setShowAspectRatioDropdown] = useState(false);
    const [showDurationDropdown, setShowDurationDropdown] = useState(false);
    const [showResolutionDropdown, setShowResolutionDropdown] = useState(false);
    const [showVariationsDropdown, setShowVariationsDropdown] = useState(false);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [localPrompt, setLocalPrompt] = useState(data.prompt || '');
    const localPromptRef = useRef(localPrompt);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const aspectRatioDropdownRef = useRef<HTMLDivElement>(null);
    const durationDropdownRef = useRef<HTMLDivElement>(null);
    const resolutionDropdownRef = useRef<HTMLDivElement>(null);
    const variationsDropdownRef = useRef<HTMLDivElement>(null);
    const modelDropdownRef = useRef<HTMLDivElement>(null);
    const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSentPromptRef = useRef<string | undefined>(data.prompt); // Track what we sent

    // Local model state for LOCAL_IMAGE_MODEL and LOCAL_VIDEO_MODEL nodes
    const [localModels, setLocalModels] = useState<LocalModel[]>([]);
    const [isLoadingLocalModels, setIsLoadingLocalModels] = useState(false);
    const isLocalModelNode = data.type === NodeType.LOCAL_IMAGE_MODEL || data.type === NodeType.LOCAL_VIDEO_MODEL;

    // Fetch local models when node is a local model type
    useEffect(() => {
        if (!isLocalModelNode) return;

        const fetchModels = async () => {
            setIsLoadingLocalModels(true);
            try {
                const models = await getLocalModels();
                // Filter based on node type
                const filtered = data.type === NodeType.LOCAL_VIDEO_MODEL
                    ? models.filter(m => m.type === 'video')
                    : models.filter(m => m.type === 'image' || m.type === 'lora' || m.type === 'controlnet');
                setLocalModels(filtered);
            } catch (error) {
                console.error('Error fetching local models:', error);
            } finally {
                setIsLoadingLocalModels(false);
            }
        };
        fetchModels();
    }, [isLocalModelNode, data.type]);

    // Face detection hook for Kling V1.5 Face mode
    const { detectFaces, isModelLoaded: isFaceModelLoaded } = useFaceDetection();

    // Trigger face detection when Face mode is selected
    useEffect(() => {
        const runFaceDetection = async () => {
            if (
                data.klingReferenceMode === 'face' &&
                data.faceDetectionStatus === 'loading' &&
                connectedImageNodes?.[0]?.url &&
                isFaceModelLoaded
            ) {
                try {
                    const faces = await detectFaces(connectedImageNodes[0].url);
                    onUpdate(data.id, {
                        detectedFaces: faces,
                        faceDetectionStatus: faces.length > 0 ? 'success' : 'error'
                    });
                } catch (err) {
                    console.error('Face detection failed:', err);
                    onUpdate(data.id, { detectedFaces: [], faceDetectionStatus: 'error' });
                }
            }
        };
        runFaceDetection();
    }, [data.klingReferenceMode, data.faceDetectionStatus, connectedImageNodes, isFaceModelLoaded, detectFaces, onUpdate, data.id]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowSizeDropdown(false);
            }
            if (aspectRatioDropdownRef.current && !aspectRatioDropdownRef.current.contains(event.target as Node)) {
                setShowAspectRatioDropdown(false);
            }
            if (durationDropdownRef.current && !durationDropdownRef.current.contains(event.target as Node)) {
                setShowDurationDropdown(false);
            }
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
                setShowModelDropdown(false);
            }
            if (resolutionDropdownRef.current && !resolutionDropdownRef.current.contains(event.target as Node)) {
                setShowResolutionDropdown(false);
            }
            if (variationsDropdownRef.current && !variationsDropdownRef.current.contains(event.target as Node)) {
                setShowVariationsDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Sync local prompt with data.prompt ONLY when it changes externally (not from our own update)
    useEffect(() => {
        if (data.prompt !== lastSentPromptRef.current) {
            setLocalPrompt(data.prompt || '');
            lastSentPromptRef.current = data.prompt;
        }
    }, [data.prompt]);

    // Cleanup timeout on unmount - flush any pending prompt update immediately
    const onUpdateRef = useRef(onUpdate);
    const dataIdRef = useRef(data.id);
    useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
    useEffect(() => { dataIdRef.current = data.id; }, [data.id]);
    useEffect(() => {
        return () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
                onUpdateRef.current(dataIdRef.current, { prompt: localPromptRef.current });
            }
        };
    }, []);

    // Auto-open Advanced Settings when:
    // 1. 2+ images are connected to a video node (frame-to-frame)
    // 2. Kling 2.6 with an input image (has audio toggle)
    useEffect(() => {
        if (data.type === NodeType.VIDEO) {
            const isAdvancedMotionModel =
                data.videoModel === 'kling-v2-6' ||
                data.videoModel === 'kie-kling-2.6-motion-control' ||
                data.videoModel === 'kie-veo3-extend';
            const shouldAutoExpand = connectedImageNodes.length >= 2 ||
                (isAdvancedMotionModel && connectedImageNodes.length > 0);
            if (shouldAutoExpand) {
                setShowAdvanced(true);
            }
        }
    }, [data.type, connectedImageNodes.length, data.videoModel]);

    // Handle prompt change with debounce
    const handlePromptChange = (value: string) => {
        setLocalPrompt(value); // Update local state immediately for responsive typing
        localPromptRef.current = value; // Keep ref in sync for flush-on-unmount
        lastSentPromptRef.current = value; // Track that we're about to send this

        // Debounce the parent update
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }
        updateTimeoutRef.current = setTimeout(() => {
            onUpdate(data.id, { prompt: value });
        }, 300); // 300ms debounce - increased for smoother typing
    };

    const handleSizeSelect = (value: string) => {
        if (data.type === NodeType.VIDEO) {
            onUpdate(data.id, { resolution: value });
        } else {
            onUpdate(data.id, { aspectRatio: value });
        }
        setShowSizeDropdown(false);
    };

    const handleAspectRatioSelect = (value: string) => {
        onUpdate(data.id, { aspectRatio: value });
        setShowAspectRatioDropdown(false);
    };

    const handleVideoModeChange = (mode: 'standard' | 'frame-to-frame') => {
        if (mode === 'frame-to-frame') {
            // Initialize frameInputs from connected nodes
            const initialFrameInputs = connectedImageNodes.slice(0, 2).map((node, idx) => ({
                nodeId: node.id,
                order: idx === 0 ? 'start' : 'end' as 'start' | 'end'
            }));
            onUpdate(data.id, { videoMode: mode, frameInputs: initialFrameInputs });
        } else {
            onUpdate(data.id, { videoMode: mode, frameInputs: undefined });
        }
    };

    const handleFrameReorder = (fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex || connectedImageNodes.length < 2) return;

        // Get the two connected nodes
        const node1 = connectedImageNodes[0];
        const node2 = connectedImageNodes[1];

        // Get current orders (from saved data or default)
        const current1Order = data.frameInputs?.find(f => f.nodeId === node1.id)?.order || 'start';
        const current2Order = data.frameInputs?.find(f => f.nodeId === node2.id)?.order || 'end';

        // Swap the orders
        const updatedFrameInputs = [
            { nodeId: node1.id, order: current1Order === 'start' ? 'end' : 'start' as 'start' | 'end' },
            { nodeId: node2.id, order: current2Order === 'start' ? 'end' : 'start' as 'start' | 'end' }
        ];

        onUpdate(data.id, { frameInputs: updatedFrameInputs });
    };

    const currentSizeLabel = (data.type === NodeType.VIDEO || data.type === NodeType.LOCAL_VIDEO_MODEL)
        ? (data.resolution || "Auto")
        : (data.aspectRatio || "Auto");

    // For image nodes, use model-specific aspect ratios (sizeOptions for video computed later with availableResolutions)
    const currentImageModelForRatios = IMAGE_MODELS.find(m => m.id === data.imageModel) || IMAGE_MODELS[0];
    const imageAspectRatioOptions = currentImageModelForRatios.aspectRatios || IMAGE_RATIOS;
    const inputCount = connectedImageNodes.length;
    const isTextToImageMode = inputCount === 0;
    const imageAspectRatioOptionsForMode = isTextToImageMode
        ? imageAspectRatioOptions.filter(option => option !== 'Auto')
        : imageAspectRatioOptions;
    const isVideoNode = data.type === NodeType.VIDEO || data.type === NodeType.LOCAL_VIDEO_MODEL;
    const isImageNode = data.type === NodeType.IMAGE || data.type === NodeType.LOCAL_IMAGE_MODEL;
    const hasConnectedImages = connectedImageNodes.length > 0;

    // Video model selection logic
    const currentVideoModel = VIDEO_MODELS.find(m => m.id === data.videoModel) || VIDEO_MODELS[0];
    const isFrameToFrame = data.videoMode === 'frame-to-frame';

    // Determine video generation mode based on inputs and settings
    // 1. Motion Control: If any parent is a video node
    // 2. Reference (Ingredients): If 3+ image parents
    // 3. Frame-to-Frame: If exactly 2 image parents or explicitly set
    // 4. Image-to-Video: If single image parent or inputUrl (last frame)
    // 5. Text-to-Video: Otherwise
    const hasVideoParent = connectedImageNodes.some(n => n.type === NodeType.VIDEO);
    const imageInputCount = connectedImageNodes.filter(n => n.type === NodeType.IMAGE).length;

    const videoGenerationMode = hasVideoParent ? 'motion-control'
        : (imageInputCount >= 3) ? 'reference'
            : (isFrameToFrame || imageInputCount === 2) ? 'frame-to-frame'
                : (inputUrl || imageInputCount > 0) ? 'image-to-video'
                    : 'text-to-video';

    // Reference mode lock flags - disable controls based on API constraints
    const isReferenceMode = videoGenerationMode === 'reference';
    const isGoogleReferenceMode = isReferenceMode && currentVideoModel?.provider === 'google';
    const isKieReferenceMode = isReferenceMode && currentVideoModel?.provider === 'kie';

    // Filter video models based on mode
    // These models are intended for video-to-video flows only.
    const videoToVideoOnlyModels = new Set([
        'kie-kling-2.6-motion-control',
        'kie-veo3-extend'
    ]);
    const availableVideoModels = filteredVideoModels.filter(model => {
        if (videoToVideoOnlyModels.has(model.id) && !hasVideoParent) {
            return false;
        }
        if (videoGenerationMode === 'motion-control') {
            return [
                'kling-v2-6',
                'kie-kling-2.6-motion-control',
                'kie-veo3-extend'
            ].includes(model.id);
        }
        // Reference mode: only show models that support reference images
        if (videoGenerationMode === 'reference') {
            return model.supportsReferenceImages === true;
        }
        if (videoGenerationMode === 'text-to-video') return model.supportsTextToVideo;
        if (videoGenerationMode === 'image-to-video') return model.supportsImageToVideo;
        return model.supportsMultiImage; // frame-to-frame
    });

    const requiresCharacterImageForMotion = ['kling-v2-6', 'kie-kling-2.6-motion-control'].includes(currentVideoModel.id);
    const motionEmptyStateText = currentVideoModel.id === 'kie-veo3-extend'
        ? 'Connect a source Kie Veo video to continue/extend it'
        : 'Connect video and image nodes as references';

    // Auto-select first available video model when current is no longer valid
    useEffect(() => {
        if (data.type !== NodeType.VIDEO) return;

        const isCurrentModelAvailable = availableVideoModels.some(m => m.id === data.videoModel);
        if (!isCurrentModelAvailable && availableVideoModels.length > 0) {
            onUpdate(data.id, { videoModel: availableVideoModels[0].id });
        }
    }, [videoGenerationMode, data.videoModel, data.type, data.id, availableVideoModels, onUpdate]);

    // Auto-set locked values when entering reference mode
    useEffect(() => {
        if (data.type !== NodeType.VIDEO) return;
        if (!isReferenceMode) return;

        const updates: Partial<typeof data> = {};

        // Google reference mode: lock duration to 8s
        if (isGoogleReferenceMode && data.videoDuration !== 8) {
            updates.videoDuration = 8;
        }

        // Kie reference mode: lock aspect ratio to 16:9
        if (isKieReferenceMode && data.aspectRatio !== '16:9') {
            updates.aspectRatio = '16:9';
        }

        if (Object.keys(updates).length > 0) {
            onUpdate(data.id, updates);
        }
    }, [isReferenceMode, isGoogleReferenceMode, isKieReferenceMode, data.type, data.videoDuration, data.aspectRatio, data.id, onUpdate]);

    const handleVideoModelChange = (modelId: string) => {
        const newModel = VIDEO_MODELS.find(m => m.id === modelId);
        const remembered = getRememberedSettingsForModel(modelId);
        const updates: Partial<typeof data> = {
            videoModel: modelId,
            ...remembered
        };
        const isKieGrokVideoModel = modelId.startsWith('kie-grok-imagine-');
        const isKieKlingVideoModel = [
            'kie-kling-2.6-text-to-video',
            'kie-kling-2.6-image-to-video',
            'kie-kling-3.0'
        ].includes(modelId);

        // Reset duration if current duration is not supported by new model
        const nextDuration = updates.videoDuration || data.videoDuration;
        if (newModel?.durations && nextDuration && !newModel.durations.includes(nextDuration)) {
            updates.videoDuration = newModel.durations[0];
        }

        // Reset resolution if current resolution is not supported by new model
        // Normalize to lowercase for comparison
        if (newModel?.resolutions && data.resolution) {
            const currentRes = (updates.resolution || data.resolution).toLowerCase();
            const supportedRes = newModel.resolutions.map(r => r.toLowerCase());
            if (!supportedRes.includes(currentRes)) {
                updates.resolution = newModel.resolutions[0];
            }
        }
        if (isKieGrokVideoModel) {
            updates.grokImagineMode = (updates.grokImagineMode || data.grokImagineMode || 'normal') as 'fun' | 'normal' | 'spicy';
        } else {
            updates.grokImagineMode = undefined;
        }
        if (isKieKlingVideoModel) {
            updates.generateAudio = updates.generateAudio ?? data.generateAudio ?? true;
        }

        rememberModelForNodeType(NodeType.VIDEO, modelId);
        onUpdate(data.id, updates);
        setShowModelDropdown(false);
    };

    // Get available durations for current model
    const availableDurations = currentVideoModel.durations || [5];
    const currentDuration = data.videoDuration || availableDurations[0];

    // Get available resolutions for current model (considering duration for models with durationResolutionMap)
    const getAvailableResolutions = () => {
        const model = currentVideoModel as any;
        if (model.durationResolutionMap && currentDuration) {
            return model.durationResolutionMap[currentDuration] || model.resolutions || VIDEO_RESOLUTIONS;
        }
        return model.resolutions || VIDEO_RESOLUTIONS;
    };
    const availableResolutions = getAvailableResolutions();
    const shouldHideAutoForTextToVideoStartNode =
        videoGenerationMode === 'text-to-video' &&
        !inputUrl &&
        connectedImageNodes.length === 0;
    const videoResolutionOptionsForMode = shouldHideAutoForTextToVideoStartNode
        ? availableResolutions.filter(option => option !== 'Auto')
        : availableResolutions;
    const videoAspectRatiosForMode = shouldHideAutoForTextToVideoStartNode
        ? (currentVideoModel?.aspectRatios || VIDEO_ASPECT_RATIOS).filter(option => option !== 'Auto')
        : (currentVideoModel?.aspectRatios || VIDEO_ASPECT_RATIOS);
    const hasVideoResolutionOptions = availableResolutions.length > 0;
    const hasVideoAspectRatioOptions = videoAspectRatiosForMode.length > 0;
    const isKieGrokI2VModel =
        currentVideoModel.id === 'kie-grok-imagine-image-to-video' &&
        videoGenerationMode === 'image-to-video';
    const isKieKlingVideoModel = [
        'kie-kling-2.6-text-to-video',
        'kie-kling-2.6-image-to-video',
        'kie-kling-3.0'
    ].includes(currentVideoModel.id);

    // sizeOptions: For video nodes use model-specific resolutions, for image nodes use aspect ratios
    const sizeOptions = (data.type === NodeType.VIDEO || data.type === NodeType.LOCAL_VIDEO_MODEL)
        ? videoResolutionOptionsForMode
        : imageAspectRatioOptionsForMode;
    const showUnifiedSizeDropdown = !(isVideoNode && videoGenerationMode === 'motion-control') && sizeOptions.length > 0;

    const handleDurationChange = (duration: number) => {
        const model = currentVideoModel as any;
        const updates: Partial<typeof data> = { videoDuration: duration };

        // If model has duration-specific resolutions, reset resolution if needed
        if (model.durationResolutionMap) {
            const allowedResolutions = model.durationResolutionMap[duration] || model.resolutions;
            if (data.resolution && !allowedResolutions.includes(data.resolution.toLowerCase())) {
                updates.resolution = allowedResolutions[0];
            }
        }

        onUpdate(data.id, updates);
        setShowDurationDropdown(false);
    };

    // Image model selection logic
    const currentImageModel = IMAGE_MODELS.find(m => m.id === data.imageModel) || IMAGE_MODELS[0];

    // Filter image models based on connected inputs
    // 0 inputs = all models, 1 input = needs supportsImageToImage, 2+ inputs = needs supportsMultiImage
    const availableImageModels = filteredImageModels.filter(model => {
        if (isTextToImageMode) {
            // Text-to-image mode: hide pure image-to-image-only variants (e.g. Grok I2I).
            return model.id !== 'grok-imagine-image-to-image';
        }
        if (inputCount === 1) return model.supportsImageToImage; // Single ref: filter out V2.1
        return model.supportsMultiImage; // Multi-ref: filter out V1, V1.5, V2 New
    });

    // Auto-select first available model when current model is no longer valid for the mode
    useEffect(() => {
        if (data.type !== NodeType.IMAGE && data.type !== NodeType.IMAGE_EDITOR) return;

        const isCurrentModelAvailable = availableImageModels.some(m => m.id === data.imageModel);
        if (!isCurrentModelAvailable && availableImageModels.length > 0) {
            // Auto-select first available model
            onUpdate(data.id, { imageModel: availableImageModels[0].id });
        }
    }, [inputCount, data.imageModel, data.type, data.id, availableImageModels, onUpdate]);

    // Determine current generation mode for display
    const imageGenerationMode = inputCount === 0 ? 'text-to-image'
        : inputCount === 1 ? 'image-to-image'
            : 'multi-image';
    const imageResolutionOptionsForMode = isTextToImageMode
        ? ((currentImageModel as any).resolutions || []).filter((option: string) => option !== 'Auto')
        : ((currentImageModel as any).resolutions || []);

    const handleImageModelChange = (modelId: string) => {
        const newModel = IMAGE_MODELS.find(m => m.id === modelId);
        const remembered = getRememberedSettingsForModel(modelId);
        const updates: Partial<typeof data> = {
            imageModel: modelId,
            ...remembered
        };

        // Reset aspect ratio if current ratio is not supported by new model
        const nextAspectRatio = updates.aspectRatio || data.aspectRatio;
        if (newModel?.aspectRatios && nextAspectRatio && !newModel.aspectRatios.includes(nextAspectRatio)) {
            updates.aspectRatio = 'Auto';
        }

        // Reset resolution if current resolution is not supported by new model
        const nextResolution = updates.resolution || data.resolution;
        if (newModel?.resolutions && nextResolution && !newModel.resolutions.includes(nextResolution)) {
            updates.resolution = newModel.resolutions[0] || 'Auto';
        }

        rememberModelForNodeType(NodeType.IMAGE, modelId);
        onUpdate(data.id, updates);
        setShowModelDropdown(false);
    };

    const supportsImageVariations =
        (data.type === NodeType.IMAGE || data.type === NodeType.IMAGE_EDITOR) &&
        ['kie', 'google', 'openai'].includes(currentImageModel.provider);
    const isLockedKieGrokT2I = currentImageModel.id === 'grok-imagine-text-to-image';
    const currentVariationCount = (data.variationCount || 1) as 1 | 2 | 4;
    const displayedVariationCount = isLockedKieGrokT2I ? 'Auto' : String(currentVariationCount);
    const handleVariationSelect = (value: 1 | 2 | 4) => {
        if (isLockedKieGrokT2I) return;
        onUpdate(data.id, { variationCount: value });
        setShowVariationsDropdown(false);
    };

    // Handle local model selection
    const handleLocalModelChange = (model: LocalModel) => {
        rememberModelForNodeType(data.type, model.id);
        rememberSettingsForModel(model.id, {
            aspectRatio: data.aspectRatio,
            resolution: data.resolution
        });
        onUpdate(data.id, {
            localModelId: model.id,
            localModelPath: model.path,
            localModelType: model.type as NodeData['localModelType'],
            localModelArchitecture: model.architecture
        });
        setShowModelDropdown(false);
    };

    // Get selected local model for display
    const selectedLocalModel = localModels.find(m => m.id === data.localModelId);

    const handleResolutionSelect = (value: string) => {
        onUpdate(data.id, { resolution: value });
        setShowResolutionDropdown(false);
    };

    // Get frame inputs with their image URLs
    // Auto-assign order: first connected = start, second = end
    // If user has explicitly set frameInputs, use those orders, otherwise auto-assign
    const frameInputsWithUrls = connectedImageNodes.slice(0, 2).map((node, idx) => {
        // Check if there's an explicit order from user reordering
        const existingInput = data.frameInputs?.find(f => f.nodeId === node.id);
        return {
            nodeId: node.id,
            url: node.url,
            type: node.type,
            order: existingInput?.order || (idx === 0 ? 'start' : 'end') as 'start' | 'end'
        };
    }).sort((a, b) => {
        // Sort by order: 'start' first, 'end' second
        if (a.order === 'start' && b.order === 'end') return -1;
        if (a.order === 'end' && b.order === 'start') return 1;
        return 0;
    });

    // Inverse scaling for the prompt bar to keep it readable when zooming out
    // When zooming in (zoom > 0.8), we let it zoom 1:1 with the canvas (localScale = 1)
    // When zooming out (zoom < 0.8), we keep it at least at 0.8 effective scale
    const minEffectiveScale = 0.8;
    const effectiveScale = Math.max(zoom, minEffectiveScale);
    const localScale = effectiveScale / zoom;

    // Theme helper
    const isDark = canvasTheme === 'dark';

    // Handle angle mode generate - creates a new connected node
    const handleAngleGenerate = () => {
        if (onChangeAngleGenerate) {
            onChangeAngleGenerate(data.id);
        }
    };

    // For starting nodes, force explicit ratio/resolution values (no Auto).
    useEffect(() => {
        if (isImageNode && isTextToImageMode) {
            const updates: Partial<typeof data> = {};
            if (!data.aspectRatio || data.aspectRatio === 'Auto') {
                updates.aspectRatio = imageAspectRatioOptionsForMode[0] || '16:9';
            }
            if (!data.resolution || data.resolution === 'Auto') {
                updates.resolution = imageResolutionOptionsForMode[0] || '1K';
            }
            if (Object.keys(updates).length > 0) {
                onUpdate(data.id, updates);
            }
        }
    }, [
        isImageNode,
        isTextToImageMode,
        data.id,
        data.aspectRatio,
        data.resolution,
        imageAspectRatioOptionsForMode,
        imageResolutionOptionsForMode,
        onUpdate
    ]);

    useEffect(() => {
        if (isVideoNode && shouldHideAutoForTextToVideoStartNode) {
            const updates: Partial<typeof data> = {};
            if (hasVideoAspectRatioOptions && (!data.aspectRatio || data.aspectRatio === 'Auto')) {
                updates.aspectRatio = videoAspectRatiosForMode[0] || '16:9';
            }
            if (hasVideoResolutionOptions && (!data.resolution || data.resolution === 'Auto')) {
                updates.resolution = videoResolutionOptionsForMode[0] || '720p';
            }
            if (Object.keys(updates).length > 0) {
                onUpdate(data.id, updates);
            }
        }
    }, [
        isVideoNode,
        shouldHideAutoForTextToVideoStartNode,
        data.id,
        data.aspectRatio,
        data.resolution,
        hasVideoAspectRatioOptions,
        hasVideoResolutionOptions,
        videoAspectRatiosForMode,
        videoResolutionOptionsForMode,
        onUpdate
    ]);

    // If in angle mode for Image nodes with result, show ChangeAnglePanel
    if (data.angleMode && data.type === NodeType.IMAGE && isSuccess && data.resultUrl) {
        return (
            <div
                style={{
                    transform: `scale(${localScale})`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.1s ease-out'
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(data.id)}
            >
                <ChangeAnglePanel
                    imageUrl={data.resultUrl}
                    settings={data.angleSettings || { rotation: 0, tilt: 0, scale: 0, wideAngle: false }}
                    onSettingsChange={(settings) => onUpdate(data.id, { angleSettings: settings })}
                    onClose={() => onUpdate(data.id, { angleMode: false })}
                    onGenerate={handleAngleGenerate}
                    isLoading={isLoading}
                    canvasTheme={canvasTheme}
                />
            </div>
        );
    }

    return (
        <div
            className={`p-4 rounded-lg cursor-default w-full transition-colors duration-300 bg-white/5 backdrop-blur-md border border-white/10`}
            style={{
                transform: `scale(${localScale})`,
                transformOrigin: 'top center',
                transition: 'transform 0.1s ease-out'
            }}
            onPointerDown={(e) => e.stopPropagation()} // Allow selecting text/interacting without dragging
            onClick={() => onSelect(data.id)} // Ensure clicking here selects the node
        >
            {/* Prompt Editor with Chips - Hidden for storyboard-generated scenes */}
            {!(data.prompt && data.prompt.startsWith('Extract panel #')) && (
                <div className="mb-3">
                    <PromptEditor
                        value={localPrompt}
                        onChange={handlePromptChange}
                        chips={data.promptChips || []}
                        onChipsChange={(newChips) => onUpdate(data.id, { promptChips: newChips })}
                        placeholder={
                            data.type === NodeType.VIDEO && isFrameToFrame && currentVideoModel.provider === 'kling'
                                ? "Prompt optional for Kling frame-to-frame..."
                                : data.type === NodeType.VIDEO && inputUrl
                                    ? "Describe how to animate this frame..."
                                    : "Describe what you want to generate..."
                        }
                        rows={data.isPromptExpanded ? 12 : 4}
                        isDark={isDark}
                        disabled={false}
                        connectedStyleNodes={connectedStyleNodes}
                        isExpanded={data.isPromptExpanded}
                        onToggleExpand={() => onUpdate(data.id, { isPromptExpanded: !data.isPromptExpanded })}
                    />
                </div>
            )}

            {data.errorMessage && (
                <div className="text-red-400 text-xs mb-2 p-1 bg-red-900/20 rounded border border-red-900/50">
                    {data.errorMessage}
                </div>
            )}

            {/* Motion Control Warning - when motion mode detected but no character image */}
            {isVideoNode && videoGenerationMode === 'motion-control' && requiresCharacterImageForMotion && imageInputCount === 0 && (
                <div className="text-amber-400 text-xs mb-2 p-2 bg-amber-900/20 rounded border border-amber-700/50 flex items-start gap-2">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>
                        <strong>Motion Control</strong> requires a character image. Please connect an Image node to define the character appearance.
                    </span>
                </div>
            )}

            {/* Controls - Hidden for storyboard-generated scenes */}
            {!(data.prompt && data.prompt.startsWith('Extract panel #')) && (
                <div className="flex items-center justify-between relative">
                    <div className="flex items-center gap-2">
                        {/* Model Selector - Local, Video, and Image nodes get different dropdowns */}
                        {isLocalModelNode ? (
                            <div className="relative" ref={modelDropdownRef}>
                                <button
                                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                                    className="flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 transition-colors"
                                >
                                    <HardDrive size={12} className="text-purple-400" />
                                    <span className="font-medium">{selectedLocalModel?.name || 'Select Model'}</span>
                                    <ChevronDown size={12} className="ml-0.5 opacity-50" />
                                </button>

                                {/* Local Model Dropdown Menu */}
                                {showModelDropdown && (
                                    <div className="absolute top-full mt-1 left-0 w-56 bg-[#111] border border-white/20 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100 max-h-64 overflow-y-auto">
                                        {/* Header */}
                                        <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider bg-[#1a1a1a] border-b border-white/20 flex items-center gap-1.5">
                                            <HardDrive size={10} />
                                            Local Models
                                        </div>

                                        {isLoadingLocalModels ? (
                                            <div className="px-3 py-4 text-xs text-white/50 text-center">Loading models...</div>
                                        ) : localModels.length === 0 ? (
                                            <div className="px-3 py-4 text-xs text-white/50 text-center">
                                                <p>No models found</p>
                                                <p className="text-[10px] mt-1">Add .safetensors files to models/</p>
                                            </div>
                                        ) : (
                                            localModels.map(model => (
                                                <button
                                                    key={model.id}
                                                    onClick={() => handleLocalModelChange(model)}
                                                    className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-white/10 transition-colors ${data.localModelId === model.id ? 'text-purple-400' : 'text-white/60'}`}
                                                >
                                                    <span className="flex flex-col items-start gap-0.5">
                                                        <span className="flex items-center gap-2">
                                                            <HardDrive size={12} className="text-purple-400" />
                                                            {model.name}
                                                            {model.architecture && model.architecture !== 'unknown' && (
                                                                <span className="text-[9px] px-1 py-0.5 bg-purple-600/30 text-purple-400 rounded">{model.architecture.toUpperCase()}</span>
                                                            )}
                                                        </span>
                                                        <span className="text-[10px] text-white/50 ml-5">{model.sizeFormatted}</span>
                                                    </span>
                                                    {data.localModelId === model.id && <Check size={12} />}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : data.type === NodeType.VIDEO ? (
                            <div className="relative" ref={modelDropdownRef}>
                                <button
                                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                                    className="flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 transition-colors"
                                >
                                    {currentVideoModel.provider === 'google' ? (
                                        <GoogleIcon size={12} className="text-white" />
                                    ) : currentVideoModel.provider === 'kling' ? (
                                        <KlingIcon size={14} />
                                    ) : currentVideoModel.provider === 'kie' ? (
                                        <KieIcon size={14} />
                                    ) : (
                                        <Film size={12} className="text-white" />
                                    )}
                                    <span className="font-medium">{currentVideoModel.name}</span>
                                    <ChevronDown size={12} className="ml-0.5 opacity-50" />
                                </button>

                                {/* Model Dropdown Menu */}
                                {showModelDropdown && (
                                    <div className="absolute top-full mt-1 left-0 w-52 bg-[#111] border border-white/20 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                                        {/* Mode indicator */}
                                        <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider bg-[#1a1a1a] border-b border-white/20 flex items-center gap-1.5">
                                            <span className={`w-1.5 h-1.5 ${videoGenerationMode === 'text-to-video' ? 'bg-white' :
                                                videoGenerationMode === 'image-to-video' ? 'bg-green-400' :
                                                    videoGenerationMode === 'motion-control' ? 'bg-orange-400' :
                                                        videoGenerationMode === 'reference' ? 'bg-blue-400' : 'bg-purple-400'
                                                }`} />
                                            {videoGenerationMode === 'text-to-video' ? 'Text → Video' :
                                                videoGenerationMode === 'image-to-video' ? 'Image → Video' :
                                                    videoGenerationMode === 'motion-control' ? 'Motion Control' :
                                                        videoGenerationMode === 'reference' ? 'References' :
                                                            'Frame-to-Frame'}
                                        </div>
                                        {/* Google Models */}
                                        {availableVideoModels.filter(m => m.provider === 'google').length > 0 && (
                                            <>
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-white/50 uppercase tracking-wider bg-white/5">
                                                    Google
                                                </div>
                                                {availableVideoModels.filter(m => m.provider === 'google').map(model => (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => handleVideoModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-white/10 transition-colors ${currentVideoModel.id === model.id ? 'text-white' : 'text-white/60'
                                                            }`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            {model.provider === 'google' ? (
                                                                <GoogleIcon size={12} className="text-white" />
                                                            ) : (
                                                                <Film size={12} className="text-white" />
                                                            )}
                                                            {model.name}
                                                        </span>
                                                        {currentVideoModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}

                                        {/* Kling Models */}
                                        {availableVideoModels.filter(m => m.provider === 'kling').length > 0 && (
                                            <>
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-white/50 uppercase tracking-wider bg-white/5 border-t border-white/20">
                                                    Kling AI
                                                </div>
                                                {availableVideoModels.filter(m => m.provider === 'kling').map(model => (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => handleVideoModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-white/10 transition-colors ${currentVideoModel.id === model.id ? 'text-white' : 'text-white/60'
                                                            }`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <KlingIcon size={14} />
                                                            {model.name}
                                                            {model.recommended && (
                                                                <span className="text-[9px] px-1 py-0.5 bg-green-600/30 text-green-400 rounded">REC</span>
                                                            )}
                                                        </span>
                                                        {currentVideoModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}

                                        {/* Hailuo Models */}
                                        {availableVideoModels.filter(m => m.provider === 'hailuo').length > 0 && (
                                            <>
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-white/50 uppercase tracking-wider bg-white/5 border-t border-white/20">
                                                    Hailuo AI
                                                </div>
                                                {availableVideoModels.filter(m => m.provider === 'hailuo').map(model => (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => handleVideoModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-white/10 transition-colors ${currentVideoModel.id === model.id ? 'text-white' : 'text-white/60'
                                                            }`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <HailuoIcon size={14} />
                                                            {model.name}
                                                        </span>
                                                        {currentVideoModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}

                                        {/* Kie.ai Models */}
                                        {availableVideoModels.filter(m => m.provider === 'kie').length > 0 && (
                                            <>
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-[#1f1f1f] border-t border-neutral-700">
                                                    Kie.ai
                                                </div>
                                                {availableVideoModels.filter(m => m.provider === 'kie').map(model => (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => handleVideoModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-[#333] transition-colors ${currentVideoModel.id === model.id ? 'text-blue-400' : 'text-neutral-300'
                                                            }`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <KieIcon size={14} />
                                                            {model.name}
                                                            {model.recommended && (
                                                                <span className="text-[9px] px-1 py-0.5 bg-green-600/30 text-green-400 rounded">REC</span>
                                                            )}
                                                        </span>
                                                        {currentVideoModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="relative" ref={modelDropdownRef}>
                                <button
                                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                                    className="flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 transition-colors"
                                >
                                    {currentImageModel.id === 'google-veo' ? ( // Keeping consistency if there was one, but mainly checking provider
                                        <GoogleIcon size={12} className="text-white" />
                                    ) : currentImageModel.id === 'gemini-pro' || currentImageModel.id === 'gemini-flash' ? (
                                        <Banana size={12} className="text-yellow-400" />
                                    ) : currentImageModel.provider === 'openai' ? (
                                        <OpenAIIcon size={12} className="text-green-400" />
                                    ) : currentImageModel.provider === 'kling' ? (
                                        <KlingIcon size={14} />
                                    ) : currentImageModel.provider === 'kie' ? (
                                        <KieIcon size={14} />
                                    ) : (
                                        <ImageIcon size={12} className="text-white" />
                                    )}
                                    <span className="font-medium">{currentImageModel.name}</span>
                                    <ChevronDown size={12} className="ml-0.5 opacity-50" />
                                </button>

                                {/* Image Model Dropdown Menu */}
                                {showModelDropdown && (
                                    <div className="absolute top-full mt-1 left-0 w-48 bg-[#111] border border-white/20 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                                        {/* Mode indicator */}
                                        <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider bg-[#1a1a1a] border-b border-white/20 flex items-center gap-1.5">
                                            <span className={`w-1.5 h-1.5 ${imageGenerationMode === 'text-to-image' ? 'bg-white' :
                                                imageGenerationMode === 'image-to-image' ? 'bg-green-400' : 'bg-purple-400'
                                                }`} />
                                            {imageGenerationMode === 'text-to-image' ? 'Text → Image' :
                                                imageGenerationMode === 'image-to-image' ? `Image → Image` :
                                                    `${inputCount} Images → Image`}
                                        </div>
                                        {/* OpenAI Models */}
                                        {availableImageModels.filter(m => m.provider === 'openai').length > 0 && (
                                            <>
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-white/50 uppercase tracking-wider bg-white/5">
                                                    OpenAI
                                                </div>
                                                {availableImageModels.filter(m => m.provider === 'openai').map(model => (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => handleImageModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-white/10 transition-colors ${currentImageModel.id === model.id ? 'text-white' : 'text-white/60'
                                                            }`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <OpenAIIcon size={12} className="text-green-400" />
                                                            {model.name}
                                                            {model.recommended && (
                                                                <span className="text-[9px] px-1 py-0.5 bg-green-600/30 text-green-400 rounded">REC</span>
                                                            )}
                                                        </span>
                                                        {currentImageModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                        {/* Google Models */}
                                        {availableImageModels.filter(m => m.provider === 'google').length > 0 && (
                                            <>
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-white/50 uppercase tracking-wider bg-white/5 border-t border-white/20">
                                                    Google
                                                </div>
                                                {availableImageModels.filter(m => m.provider === 'google').map(model => (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => handleImageModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-white/10 transition-colors ${currentImageModel.id === model.id ? 'text-white' : 'text-white/60'
                                                            }`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            {model.id === 'gemini-pro' || model.id === 'gemini-flash' ? (
                                                                <Banana size={12} className="text-yellow-400" />
                                                            ) : (
                                                                <GoogleIcon size={12} className="text-white" />
                                                            )}
                                                            {model.name}
                                                        </span>
                                                        {currentImageModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}

                                        {/* Kling Models */}
                                        {availableImageModels.filter(m => m.provider === 'kling').length > 0 && (
                                            <>
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-white/50 uppercase tracking-wider bg-white/5 border-t border-white/20">
                                                    Kling AI
                                                </div>
                                                {availableImageModels.filter(m => m.provider === 'kling').map(model => (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => handleImageModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-white/10 transition-colors ${currentImageModel.id === model.id ? 'text-white' : 'text-white/60'
                                                            }`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <KlingIcon size={14} />
                                                            {model.name}
                                                            {model.recommended && (
                                                                <span className="text-[9px] px-1 py-0.5 bg-green-600/30 text-green-400 rounded">REC</span>
                                                            )}
                                                        </span>
                                                        {currentImageModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}

                                        {/* Kie.ai Models */}
                                        {availableImageModels.filter(m => m.provider === 'kie').length > 0 && (
                                            <>
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-[#1f1f1f] border-t border-neutral-700">
                                                    Kie.ai
                                                </div>
                                                {availableImageModels.filter(m => m.provider === 'kie').map(model => (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => handleImageModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-[#333] transition-colors ${currentImageModel.id === model.id ? 'text-blue-400' : 'text-neutral-300'
                                                            }`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <KieIcon size={14} />
                                                            {model.name}
                                                            {model.recommended && (
                                                                <span className="text-[9px] px-1 py-0.5 bg-green-600/30 text-green-400 rounded">REC</span>
                                                            )}
                                                        </span>
                                                        {currentImageModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>

                    <div className="flex items-center gap-2">
                        {/* Unified Size/Ratio Dropdown (hidden for video nodes in motion-control mode) */}
                        {/* Disabled for Kie reference mode - aspect ratio locked to 16:9 */}
                        {showUnifiedSizeDropdown && !isKieReferenceMode && (
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setShowSizeDropdown(!showSizeDropdown)}
                                    className="flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 transition-colors"
                                >
                                    {isVideoNode && <Monitor size={12} className="text-green-400" />}
                                    {!isVideoNode && <Crop size={12} className="text-white" />}
                                    {isVideoNode && currentSizeLabel === 'Auto' ? 'Auto' : currentSizeLabel}
                                </button>

                                {/* Dropdown Menu */}
                                {showSizeDropdown && (
                                    <div
                                        className="absolute bottom-full mb-2 right-0 w-32 bg-[#111] border border-white/20 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-60 overflow-y-auto"
                                        onWheel={(e) => e.stopPropagation()}
                                    >
                                        <div className="px-3 py-2 text-[10px] font-bold text-white/50 uppercase tracking-wider bg-white/5">
                                            {isVideoNode ? 'Resolution' : 'Aspect Ratio'}
                                        </div>
                                        {sizeOptions.map(option => (
                                            <button
                                                key={option}
                                                onClick={() => handleSizeSelect(option)}
                                                className={`flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-white/10 transition-colors ${currentSizeLabel === option ? 'text-white' : 'text-white/60'
                                                    }`}
                                            >
                                                <span>{option}</span>
                                                {currentSizeLabel === option && <Check size={12} />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Kie Reference Mode - Locked Aspect Ratio Display */}
                        {showUnifiedSizeDropdown && isKieReferenceMode && (
                            <div className="flex items-center gap-1.5 text-xs font-medium bg-white/5 text-white/50 px-2.5 py-1.5 cursor-not-allowed" title="Aspect ratio locked to 16:9 for reference mode">
                                {isVideoNode && <Monitor size={12} className="text-green-400" />}
                                {!isVideoNode && <Crop size={12} className="text-white" />}
                                16:9
                            </div>
                        )}

                        {/* Image Resolution Dropdown - Only for Image nodes */}
                        {!isVideoNode && (currentImageModel as any).resolutions && (
                            <div className="relative" ref={resolutionDropdownRef}>
                                <button
                                    onClick={() => setShowResolutionDropdown(!showResolutionDropdown)}
                                    className="flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 transition-colors"
                                >
                                    <Monitor size={12} className="text-green-400" />
                                    {data.resolution || 'Auto'}
                                </button>

                                {/* Dropdown Menu */}
                                {showResolutionDropdown && (
                                    <div
                                        className="absolute bottom-full mb-2 right-0 w-24 bg-[#111] border border-white/20 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100"
                                        onWheel={(e) => e.stopPropagation()}
                                    >
                                        <div className="px-3 py-2 text-[10px] font-bold text-white/50 uppercase tracking-wider bg-white/5">
                                            Quality
                                        </div>
                                        {imageResolutionOptionsForMode.map((res: string) => (
                                            <button
                                                key={res}
                                                onClick={() => handleResolutionSelect(res)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-xs text-left hover:bg-white/10 transition-colors ${(data.resolution || 'Auto') === res ? 'text-white' : 'text-white/60'}`}
                                            >
                                                <span>{res}</span>
                                                {(data.resolution || 'Auto') === res && <Check size={12} />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Image Variations - Supported providers: Kie, Google, OpenAI */}
                        {supportsImageVariations && (
                            <div className="relative group/variations" ref={variationsDropdownRef}>
                                <button
                                    onClick={() => {
                                        if (!isLockedKieGrokT2I) {
                                            setShowVariationsDropdown(!showVariationsDropdown);
                                        }
                                    }}
                                    className={`flex items-center gap-1.5 text-xs font-medium text-white px-2.5 py-1.5 transition-colors ${isLockedKieGrokT2I
                                        ? 'bg-white/5 cursor-not-allowed opacity-80'
                                        : 'bg-white/10 hover:bg-white/20'
                                        }`}
                                    title={!isLockedKieGrokT2I ? 'Number of variations to generate' : undefined}
                                >
                                    <Sparkles size={12} className="text-blue-400" />
                                    x{displayedVariationCount}
                                </button>

                                {isLockedKieGrokT2I && (
                                    <div className="pointer-events-none absolute bottom-full right-0 mb-2 px-2 py-1 text-[10px] leading-tight text-white bg-black/90 border border-white/20 whitespace-nowrap opacity-0 group-hover/variations:opacity-100 transition-opacity duration-150 z-[70]">
                                        Kie Grok Imagine text-to-image returns multiple images by default
                                    </div>
                                )}

                                {showVariationsDropdown && !isLockedKieGrokT2I && (
                                    <div
                                        className="absolute bottom-full mb-2 right-0 w-24 bg-[#111] border border-white/20 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100"
                                        onWheel={(e) => e.stopPropagation()}
                                    >
                                        <div className="px-3 py-2 text-[10px] font-bold text-white/50 uppercase tracking-wider bg-white/5">
                                            Variations
                                        </div>
                                        {IMAGE_VARIATION_OPTIONS.map((count) => (
                                            <button
                                                key={count}
                                                onClick={() => handleVariationSelect(count)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-xs text-left hover:bg-white/10 transition-colors ${currentVariationCount === count ? 'text-white' : 'text-white/60'}`}
                                            >
                                                <span>{count}</span>
                                                {currentVariationCount === count && <Check size={12} />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Video Aspect Ratio Dropdown - Only for video nodes (hidden in motion-control mode) */}
                        {/* Disabled for Kie reference mode - aspect ratio locked to 16:9 */}
                        {isVideoNode && videoGenerationMode !== 'motion-control' && hasVideoAspectRatioOptions && !isKieReferenceMode && (
                            <div className="relative" ref={aspectRatioDropdownRef}>
                                <button
                                    onClick={() => setShowAspectRatioDropdown(!showAspectRatioDropdown)}
                                    className="flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 transition-colors"
                                >
                                    <Film size={12} className="text-purple-400" />
                                    {data.aspectRatio || '16:9'}
                                </button>

                                {/* Aspect Ratio Dropdown Menu */}
                                {showAspectRatioDropdown && (
                                    <div className="absolute bottom-full mb-2 right-0 w-28 bg-[#111] border border-white/20 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                                        <div className="px-3 py-2 text-[10px] font-bold text-white/50 uppercase tracking-wider bg-white/5">
                                            Size
                                        </div>
                                        {videoAspectRatiosForMode.map((option: string) => (
                                            <button
                                                key={option}
                                                onClick={() => handleAspectRatioSelect(option)}
                                                className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-white/10 transition-colors ${data.aspectRatio === option ? 'text-white' : 'text-white/60'}`}
                                            >
                                                <span>{option}</span>
                                                {data.aspectRatio === option && <Check size={12} />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Kie Reference Mode - Locked Aspect Ratio Display */}
                        {isVideoNode && videoGenerationMode !== 'motion-control' && hasVideoAspectRatioOptions && isKieReferenceMode && (
                            <div className="flex items-center gap-1.5 text-xs font-medium bg-white/5 text-white/50 px-2.5 py-1.5 cursor-not-allowed" title="Aspect ratio locked to 16:9 for reference mode">
                                <Film size={12} className="text-purple-400" />
                                16:9
                            </div>
                        )}

                        {/* Duration Dropdown - Only for video nodes (hidden in motion-control mode) */}
                        {/* Disabled for Google reference mode - duration locked to 8s */}
                        {isVideoNode && videoGenerationMode !== 'motion-control' && availableDurations.length > 0 && !isGoogleReferenceMode && (
                            <div className="relative" ref={durationDropdownRef}>
                                <button
                                    onClick={() => setShowDurationDropdown(!showDurationDropdown)}
                                    className="flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 transition-colors"
                                >
                                    <Clock size={12} className="text-white" />
                                    {currentDuration}s
                                </button>

                                {/* Duration Dropdown Menu */}
                                {showDurationDropdown && (
                                    <div className="absolute bottom-full mb-2 right-0 w-24 bg-[#111] border border-white/20 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                                        <div className="px-3 py-2 text-[10px] font-bold text-white/50 uppercase tracking-wider bg-white/5">
                                            Duration
                                        </div>
                                        {availableDurations.map((dur: number) => (
                                            <button
                                                key={dur}
                                                onClick={() => handleDurationChange(dur)}
                                                className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-white/10 transition-colors ${currentDuration === dur ? 'text-white' : 'text-white/60'}`}
                                            >
                                                <span>{dur}s</span>
                                                {currentDuration === dur && <Check size={12} />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Google Reference Mode - Locked Duration Display */}
                        {isVideoNode && videoGenerationMode !== 'motion-control' && availableDurations.length > 0 && isGoogleReferenceMode && (
                            <div className="flex items-center gap-1.5 text-xs font-medium bg-white/5 text-white/50 px-2.5 py-1.5 cursor-not-allowed" title="Duration locked to 8s for reference mode">
                                <Clock size={12} className="text-white" />
                                8s
                            </div>
                        )}

                        {/* Grok Imagine Mode - only for Kie Grok I2V */}
                        {isVideoNode && isKieGrokI2VModel && (
                            <div className="inline-flex items-center text-xs font-medium bg-white/10 text-white px-2 py-1.5">
                                <select
                                    value={data.grokImagineMode || 'normal'}
                                    onChange={(e) => onUpdate(data.id, { grokImagineMode: e.target.value as 'fun' | 'normal' | 'spicy' })}
                                    className="bg-transparent text-white text-xs focus:outline-none"
                                >
                                    <option value="fun" className="text-black">Funny</option>
                                    <option value="normal" className="text-black">Normal</option>
                                    <option value="spicy" className="text-black">Spicy</option>
                                </select>
                            </div>
                        )}

                        {/* Kie Kling Audio Selector */}
                        {isVideoNode && isKieKlingVideoModel && (
                            <div className="inline-flex items-center text-xs font-medium bg-white/10 text-white px-2 py-1.5">
                                <select
                                    value={data.generateAudio === false ? 'without-audio' : 'with-audio'}
                                    onChange={(e) => onUpdate(data.id, { generateAudio: e.target.value === 'with-audio' })}
                                    className="bg-transparent text-white text-xs focus:outline-none"
                                >
                                    <option value="with-audio" className="text-black">With Audio</option>
                                    <option value="without-audio" className="text-black">Without Audio</option>
                                </select>
                            </div>
                        )}

                        {/* Generate Button - Active even after success to allow re-generation */}
                        {!isLoading && (() => {
                            // Check if generation is blocked due to no face detected in Face mode
                            const isFaceModeBlocked = !isVideoNode &&
                                data.imageModel === 'kling-v1-5' &&
                                data.klingReferenceMode === 'face' &&
                                (data.faceDetectionStatus === 'error' || data.faceDetectionStatus === 'loading');

                            return (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isFaceModeBlocked) {
                                            // Show a warning - this is handled by the warning component
                                            return;
                                        }
                                        onGenerate(data.id);
                                    }}
                                    disabled={isFaceModeBlocked}
                                    className={`group w-9 h-9 flex items-center justify-center transition-all duration-200 ${isFaceModeBlocked
                                        ? 'bg-white/10 cursor-not-allowed opacity-50'
                                        : 'bg-white text-black hover:bg-neutral-200 active:scale-95'
                                        }`}
                                    title={isFaceModeBlocked ? 'Cannot generate: No face detected in reference image' : 'Generate'}
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        className="w-4 h-4 transition-transform duration-200"
                                        fill="currentColor"
                                    >
                                        <polygon points="5 3 19 12 5 21 5 3" />
                                    </svg>
                                </button>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Kling V1.5 Reference Settings - For Image nodes with connected input */}
            {!isVideoNode && data.imageModel === 'kling-v1-5' && connectedImageNodes.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/20">
                    <div className="text-[10px] text-white/50 uppercase tracking-wider mb-2">Reference Settings</div>

                    {/* Mode Tabs */}
                    <div className="flex gap-1 mb-3 p-1 bg-white/5">
                        <button
                            onClick={() => onUpdate(data.id, { klingReferenceMode: 'subject', detectedFaces: undefined, faceDetectionStatus: undefined })}
                            className={`flex-1 px-3 py-1.5 text-xs transition-colors ${(data.klingReferenceMode || 'subject') === 'subject'
                                ? 'bg-neutral-700 text-white font-medium'
                                : 'text-white/50 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            Subject
                        </button>
                        <button
                            onClick={() => {
                                // Just switch mode, face detection will be triggered by effect
                                onUpdate(data.id, { klingReferenceMode: 'face', faceDetectionStatus: 'loading', detectedFaces: undefined });
                            }}
                            className={`flex-1 px-3 py-1.5 text-xs transition-colors ${data.klingReferenceMode === 'face'
                                ? 'bg-neutral-700 text-white font-medium'
                                : 'text-white/50 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            Face
                        </button>
                    </div>

                    {/* Reference Image Preview with Face Detection Overlay */}
                    {connectedImageNodes[0]?.url && (
                        <div className="mb-3">
                            {/* Main image with face highlight */}
                            <div className="overflow-hidden bg-black relative flex items-center justify-center" style={{ maxHeight: '200px' }}>
                                <div className="relative">
                                    <img
                                        src={connectedImageNodes[0].url}
                                        alt="Reference"
                                        className="max-h-[200px] w-auto h-auto block object-contain"
                                    />
                                    {/* Face detection corner brackets - Kling style */}
                                    {data.klingReferenceMode === 'face' && data.faceDetectionStatus === 'success' && data.detectedFaces && data.detectedFaces.length > 0 && (
                                        <>
                                            {data.detectedFaces.map((face, idx) => (
                                                <div
                                                    key={idx}
                                                    className="absolute pointer-events-none"
                                                    style={{
                                                        left: `${face.x}%`,
                                                        top: `${face.y}%`,
                                                        width: `${face.width}%`,
                                                        height: `${face.height}%`,
                                                    }}
                                                >
                                                    {/* Corner brackets - larger with glow */}
                                                    <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-white" style={{ filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.5))' }} />
                                                    <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-white" style={{ filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.5))' }} />
                                                    <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-white" style={{ filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.5))' }} />
                                                    <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-white" style={{ filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.5))' }} />
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {/* Loading indicator */}
                                    {data.klingReferenceMode === 'face' && data.faceDetectionStatus === 'loading' && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                            <div className="text-xs text-white">Detecting faces...</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Face thumbnail below - Kling style */}
                            {data.klingReferenceMode === 'face' && data.faceDetectionStatus === 'success' && data.detectedFaces && data.detectedFaces.length > 0 && (
                                <div className="flex justify-center mt-3">
                                    <div className="w-14 h-14 border-2 border-white overflow-hidden bg-black">
                                        <img
                                            src={connectedImageNodes[0].url}
                                            alt="Detected face"
                                            className="w-full h-full object-cover"
                                            style={{
                                                objectPosition: `${data.detectedFaces[0].x + data.detectedFaces[0].width / 2}% ${data.detectedFaces[0].y + data.detectedFaces[0].height / 2}%`,
                                                transform: `scale(${100 / Math.max(data.detectedFaces[0].width, data.detectedFaces[0].height) * 0.8})`
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* No Face Detected Warning */}
                    {data.klingReferenceMode === 'face' && data.faceDetectionStatus === 'error' && (
                        <div className="mb-3 p-2 bg-white/5 border border-white/20">
                            <div className="flex items-start gap-2 text-amber-400 text-xs">
                                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span>No face detected. Please use a reference image with a clearer face.</span>
                            </div>
                        </div>
                    )}

                    {/* Subject Mode: Show BOTH Face Reference and Subject Reference sliders */}
                    {(data.klingReferenceMode || 'subject') === 'subject' && (
                        <>
                            <div className="space-y-1 mb-3">
                                <div className="flex justify-between text-[10px]">
                                    <span className="text-neutral-400">Face Reference</span>
                                    <span className="text-white font-medium">{data.klingFaceIntensity ?? 65}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={data.klingFaceIntensity ?? 65}
                                    onChange={(e) => onUpdate(data.id, { klingFaceIntensity: parseInt(e.target.value) })}
                                    className="w-full h-1.5 bg-white/20 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md"
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                    <span className="text-neutral-400">Subject Reference</span>
                                    <span className="text-white font-medium">{data.klingSubjectIntensity ?? 50}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={data.klingSubjectIntensity ?? 50}
                                    onChange={(e) => onUpdate(data.id, { klingSubjectIntensity: parseInt(e.target.value) })}
                                    className="w-full h-1.5 bg-white/20 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md"
                                />
                            </div>
                        </>
                    )}

                    {/* Face Mode: Show single Reference Strength slider */}
                    {data.klingReferenceMode === 'face' && data.faceDetectionStatus === 'success' && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px]">
                                <span className="text-neutral-400">Reference Strength</span>
                                <span className="text-white font-medium">{data.klingFaceIntensity ?? 42}</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={data.klingFaceIntensity ?? 42}
                                onChange={(e) => onUpdate(data.id, { klingFaceIntensity: parseInt(e.target.value) })}
                                className="w-full h-1.5 bg-neutral-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Advanced Settings Drawer - Only for Video nodes */}
            {
                isVideoNode && (
                    <div className="mt-2 pt-2 border-t border-white/20">
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="w-full flex items-center justify-center gap-1 cursor-pointer"
                        >
                            <span className="text-[10px] text-white/40 uppercase tracking-widest hover:text-neutral-400">
                                Advanced Settings
                            </span>
                            {showAdvanced ? (
                                <ChevronUp size={12} className="text-white/40" />
                            ) : (
                                <ChevronDown size={12} className="text-white/40" />
                            )}
                        </button>

                        {/* Advanced Settings Content - Only for Video nodes */}
                        {showAdvanced && isVideoNode && (
                            <div className="mt-3 space-y-3">
                                {/* Audio Toggle - Only for Kling 2.6 (Veo 3.1 SDK doesn't support generateAudio yet) */}
                                {data.videoModel === 'kling-v2-6' && (
                                    <div className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-white/5 w-fit">
                                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                        </svg>
                                        <span className="text-[11px] text-white/60">Audio</span>
                                        <button
                                            onClick={() => onUpdate(data.id, { generateAudio: !(data.generateAudio !== false) })}
                                            className={`relative w-8 h-4 transition-colors ${data.generateAudio !== false ? 'bg-white' : 'bg-white/20'}`}
                                        >
                                            <span
                                                className={`absolute top-0.5 w-3 h-3 bg-black transition-transform shadow-md ${data.generateAudio !== false ? 'left-4' : 'left-0.5'}`}
                                            />
                                        </button>
                                    </div>
                                )}

                                {/* Frame Inputs - Only show for Motion Control mode (frame-to-frame handled in NodeContent) */}
                                {connectedImageNodes.length >= 2 && videoGenerationMode === 'motion-control' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-white/50 uppercase tracking-wider">
                                            Input References
                                        </label>

                                        {frameInputsWithUrls.length === 0 ? (
                                            <div className="text-xs text-white/40 italic py-2">
                                                {motionEmptyStateText}
                                            </div>
                                        ) : (
                                            /* Horizontal layout for Motion Control */
                                            <div className="flex gap-2">
                                                {frameInputsWithUrls.map((input, index) => (
                                                    <div
                                                        key={input.nodeId}
                                                        className="flex-1 flex flex-col items-center gap-2 p-2 bg-white/5 border border-white/20"
                                                    >
                                                        <div className="relative w-full aspect-video overflow-hidden rounded bg-black flex items-center justify-center">
                                                            {input.url ? (
                                                                <img
                                                                    src={input.url}
                                                                    alt={input.type === NodeType.VIDEO ? 'Motion Ref' : 'Character Ref'}
                                                                    className="w-full h-full object-contain"
                                                                />
                                                            ) : (
                                                                <div className="text-[10px] text-white/40">No Preview</div>
                                                            )}
                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                                            <div className="absolute bottom-1 left-1 right-1">
                                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded block text-center truncate ${input.type === NodeType.VIDEO
                                                                    ? 'bg-purple-600/80 text-white'
                                                                    : 'bg-white/20 text-white'
                                                                    }`}>
                                                                    {input.type === NodeType.VIDEO ? 'MOTION REF' : 'CHARACTER REF'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )
            }
        </div >
    );
};

// Memoize to prevent re-renders when parent state changes
export const NodeControls = memo(NodeControlsComponent);
