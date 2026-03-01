/**
 * NodeContent.tsx
 * 
 * Displays the content area of a canvas node.
 * Handles result display (image/video) and placeholder states.
 */

import React, { useRef, useState, useEffect } from 'react';
import { Loader2, Maximize2, ImageIcon as ImageIcon, Film, Upload, Pencil, Video, GripVertical, Download, Expand, Shrink, HardDrive, ArrowLeftRight, Play } from 'lucide-react';
import { NodeData, NodeStatus, NodeType } from '../../types';
import { ScrambleText } from '../ScrambleText';
import { extractVideoFrameAtTime, getConnectedVideoInputsBreakdown, getVideoGenerationVariant } from '../../utils/videoHelpers';
import { GenerationStatusResult } from '../../services/generationService';

const MAX_IMAGE_INPUTS = 8;

function getImageInputGridClass(count: number): string {
    if (count <= 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count <= 4) return 'grid-cols-2 grid-rows-2';
    if (count <= 6) return 'grid-cols-3 grid-rows-2';
    return 'grid-cols-4 grid-rows-2';
}

function getImageInputLabel(index: number, total: number): string {
    if (total === 1) return 'Image';
    return `Image ${index + 1}`;
}

function formatTime(totalSeconds: number): string {
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0:00';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface NodeContentProps {
    data: NodeData;
    inputUrl?: string;
    connectedVideoSourceUrl?: string;
    connectedVideoSourceNodeId?: string;
    selected: boolean;
    isIdle: boolean;
    isLoading: boolean;
    isSuccess: boolean;
    liveGenerationStatus?: GenerationStatusResult;
    getAspectRatioStyle: () => { aspectRatio: string };
    onUpload?: (nodeId: string, imageDataUrl: string) => void;
    onExpand?: (imageUrl: string) => void;
    // Text node callbacks
    onWriteContent?: (nodeId: string) => void;
    onTextToVideo?: (nodeId: string) => void;
    onTextToImage?: (nodeId: string) => void;
    // Image node callbacks
    onImageToImage?: (nodeId: string) => void;
    onImageToVideo?: (nodeId: string) => void;
    connectedImageNodes?: { id: string; url: string; type?: NodeType }[];
    onUpdate?: (nodeId: string, updates: Partial<NodeData>) => void;
    onCancelGeneration?: (nodeId: string) => void;
    // Social sharing
    onPostToX?: (nodeId: string, mediaUrl: string, mediaType: 'image' | 'video') => void;
}

export const NodeContent: React.FC<NodeContentProps> = ({
    data,
    inputUrl,
    connectedVideoSourceUrl,
    connectedVideoSourceNodeId,
    selected,
    isIdle,
    isLoading,
    isSuccess,
    liveGenerationStatus,
    getAspectRatioStyle,
    onUpload,
    onExpand,
    onWriteContent,
    onTextToVideo,
    onTextToImage,
    connectedImageNodes,
    onImageToImage,
    onImageToVideo,
    onUpdate,
    onCancelGeneration,
    onPostToX
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const inlineFrameVideoRef = useRef<HTMLVideoElement>(null);

    // Local state for text node textarea to prevent lag
    const [localPrompt, setLocalPrompt] = useState(data.prompt || '');
    const [cancelHovered, setCancelHovered] = useState(false);
    const [isVideoHovered, setIsVideoHovered] = useState(false);
    const [videoFrameDuration, setVideoFrameDuration] = useState(0);
    const [videoFrameTime, setVideoFrameTime] = useState(data.selectedVideoFrameTime || 0);
    const [isInlineVideoFrameEditing, setIsInlineVideoFrameEditing] = useState(false);
    const [isSavingInlineVideoFrame, setIsSavingInlineVideoFrame] = useState(false);
    const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSentPromptRef = useRef<string | undefined>(data.prompt); // Track what we sent

    // Helper: Check if node is image-type (includes local image model)
    const isImageType = data.type === NodeType.IMAGE || data.type === NodeType.LOCAL_IMAGE_MODEL;
    // Helper: Check if node is video-type (includes local video model)
    const isVideoType = data.type === NodeType.VIDEO || data.type === NodeType.LOCAL_VIDEO_MODEL;
    // Helper: Check if node is local model
    const isLocalModel = data.type === NodeType.LOCAL_IMAGE_MODEL || data.type === NodeType.LOCAL_VIDEO_MODEL;
    const isVideoFrameVariant = isImageType && !!connectedVideoSourceUrl;
    const videoFramePreviewUrl = data.selectedVideoFrameUrl || inputUrl;
    const isUploadedImageVariant = isImageType && !!data.isUploadedAsset && !!data.resultUrl && !isVideoFrameVariant;

    const imageConnections = (connectedImageNodes?.filter(n => n.type !== NodeType.VIDEO) || []).slice(0, MAX_IMAGE_INPUTS);
    const videoConnections = connectedImageNodes?.filter(n => n.type === NodeType.VIDEO) || [];
    const { hasMixedInputs } = getConnectedVideoInputsBreakdown(connectedImageNodes);
    const videoGenerationVariant = isVideoType
        ? getVideoGenerationVariant({
            connectedNodes: connectedImageNodes,
            inputUrl,
            videoMode: data.videoMode,
            modelId: data.videoModel
        })
        : 'text-to-video';
    const isFrameToFrame = isVideoType && videoGenerationVariant === 'frame-to-frame';
    const isReferenceMode = isVideoType && videoGenerationVariant === 'reference';
    const isMotionControl = isVideoType && videoGenerationVariant === 'motion-control';
    const isExtendMode = isVideoType && videoGenerationVariant === 'extend';

    // Derive ordered start/end frame URLs respecting data.frameInputs order
    let startFrameUrl: string | undefined;
    let endFrameUrl: string | undefined;
    if (isFrameToFrame) {
        const frameInputsMap = new Map((data.frameInputs || []).map(f => [f.nodeId, f.order]));
        const ordered = imageConnections.slice(0, 2).map((node, idx) => ({
            url: node.url,
            order: frameInputsMap.get(node.id) || (idx === 0 ? 'start' : 'end') as 'start' | 'end'
        })).sort((a, b) => (a.order === 'start' ? -1 : 1));
        startFrameUrl = ordered[0]?.url;
        endFrameUrl = ordered[1]?.url;
    }

    const handleSwapFrames = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (imageConnections.length < 2) return;
        const node1 = imageConnections[0];
        const node2 = imageConnections[1];
        const frameInputsMap = new Map((data.frameInputs || []).map(f => [f.nodeId, f.order]));
        const order1 = frameInputsMap.get(node1.id) || 'start';
        const order2 = frameInputsMap.get(node2.id) || 'end';
        onUpdate?.(data.id, {
            frameInputs: [
                { nodeId: node1.id, order: (order1 === 'start' ? 'end' : 'start') as 'start' | 'end' },
                { nodeId: node2.id, order: (order2 === 'start' ? 'end' : 'start') as 'start' | 'end' }
            ]
        });
    };

    // Sync local state ONLY when data.prompt changes externally (not from our own update)
    useEffect(() => {
        if (data.prompt !== lastSentPromptRef.current) {
            setLocalPrompt(data.prompt || '');
            lastSentPromptRef.current = data.prompt;
        }
    }, [data.prompt]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!isVideoType || !videoRef.current) return;

        const video = videoRef.current;

        if (selected) {
            return;
        }

        if (isVideoHovered) {
            void video.play().catch(() => undefined);
            return;
        }

        video.pause();
    }, [isVideoHovered, selected, isVideoType]);

    useEffect(() => {
        setVideoFrameTime(data.selectedVideoFrameTime || 0);
        setVideoFrameDuration(0);
        setIsInlineVideoFrameEditing(false);
    }, [data.id, data.selectedVideoFrameTime, connectedVideoSourceUrl]);

    useEffect(() => {
        if (!inlineFrameVideoRef.current) return;
        inlineFrameVideoRef.current.pause();
        if (Number.isFinite(videoFrameTime)) {
            inlineFrameVideoRef.current.currentTime = Math.min(
                videoFrameTime,
                Math.max(videoFrameDuration - 0.05, 0)
            );
        }
    }, [videoFrameTime, videoFrameDuration]);

    const handleTextChange = (value: string) => {
        setLocalPrompt(value); // Update local state immediately
        lastSentPromptRef.current = value; // Track that we're about to send this

        // Debounce parent update
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }
        updateTimeoutRef.current = setTimeout(() => {
            onUpdate?.(data.id, { prompt: value });
        }, 150);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onUpload) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            onUpload(data.id, reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleInlineVideoFrameSave = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!connectedVideoSourceUrl) return;

        if (!isInlineVideoFrameEditing) {
            setIsInlineVideoFrameEditing(true);
            return;
        }

        setIsSavingInlineVideoFrame(true);
        try {
            const frameUrl = await extractVideoFrameAtTime(connectedVideoSourceUrl, videoFrameTime);
            onUpdate?.(data.id, {
                selectedVideoFrameUrl: frameUrl,
                selectedVideoFrameTime: videoFrameTime,
                selectedVideoFrameSourceNodeId: connectedVideoSourceNodeId,
                isUploadedAsset: false
            });
            setIsInlineVideoFrameEditing(false);
        } catch (error) {
            console.error('Failed to extract selected video frame:', error);
        } finally {
            setIsSavingInlineVideoFrame(false);
        }
    };

    const preventNativeDrag = (e: React.DragEvent<HTMLElement>) => {
        e.preventDefault();
    };

    // Carousel helpers
    const totalCarouselItems = data.imageVariations?.length || data.resultUrls?.length || 0;
    const hasCarousel = totalCarouselItems > 1;
    const clampedCarouselIndex = totalCarouselItems > 0
        ? Math.max(0, Math.min(data.carouselIndex ?? 0, totalCarouselItems - 1))
        : 0;
    const loadingStatusLabel = liveGenerationStatus?.label || 'Generating...';
    const loadingStatusDetail = liveGenerationStatus?.detail || 'Task is still running. Keep this open.';

    return (
        <div className={`transition-all duration-200 ${!selected ? 'p-0 overflow-hidden' : 'p-1'}`}>
            {/* Hidden File Input - Always rendered for upload functionality (image types only) */}
            {isImageType && onUpload && (
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                />
            )}

            {isVideoFrameVariant ? (
                <div
                    className={`relative w-full bg-black group/image ${!selected ? '' : 'overflow-hidden'}`}
                    style={getAspectRatioStyle()}
                >
                    {isInlineVideoFrameEditing && connectedVideoSourceUrl ? (
                        <video
                            ref={inlineFrameVideoRef}
                            src={connectedVideoSourceUrl}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            controls={false}
                            draggable={false}
                            onDragStart={preventNativeDrag}
                            onLoadedMetadata={(event) => {
                                const duration = event.currentTarget.duration || 0;
                                const nextTime = Math.min(data.selectedVideoFrameTime || 0, Math.max(duration - 0.05, 0));
                                setVideoFrameDuration(duration);
                                setVideoFrameTime(nextTime);
                                event.currentTarget.currentTime = nextTime;
                                event.currentTarget.pause();
                            }}
                            onTimeUpdate={(event) => {
                                if (!isInlineVideoFrameEditing) return;
                                setVideoFrameTime(event.currentTarget.currentTime);
                            }}
                        />
                    ) : videoFramePreviewUrl ? (
                        <img
                            src={videoFramePreviewUrl}
                            alt="Locked frame"
                            className="w-full h-full object-cover"
                            draggable={false}
                            onDragStart={preventNativeDrag}
                        />
                    ) : (
                        <div className="absolute inset-0 bg-[#111]" />
                    )}

                    <div className={`absolute inset-x-0 top-0 z-10 p-3 transition-opacity ${isInlineVideoFrameEditing ? 'opacity-100' : 'opacity-0 group-hover/image:opacity-100'}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="px-2 py-1 bg-black/60 text-[10px] font-medium uppercase tracking-wide text-white">
                                Locked Frame
                            </div>
                            <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={handleInlineVideoFrameSave}
                                className="px-2.5 py-1 bg-black/60 text-xs font-medium text-white transition-colors hover:bg-black/75 disabled:opacity-50"
                                disabled={isSavingInlineVideoFrame}
                            >
                                {isSavingInlineVideoFrame ? 'Saving...' : isInlineVideoFrameEditing ? 'Done' : 'Edit'}
                            </button>
                        </div>
                    </div>

                    {isInlineVideoFrameEditing && (
                        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-3">
                            <input
                                type="range"
                                min={0}
                                max={Math.max(videoFrameDuration, 0.01)}
                                step={0.01}
                                value={Math.min(videoFrameTime, Math.max(videoFrameDuration, 0.01))}
                                disabled={isSavingInlineVideoFrame}
                                onPointerDown={(e) => e.stopPropagation()}
                                onChange={(event) => {
                                    const nextTime = Number(event.target.value);
                                    setVideoFrameTime(nextTime);
                                    if (inlineFrameVideoRef.current) {
                                        inlineFrameVideoRef.current.currentTime = nextTime;
                                        inlineFrameVideoRef.current.pause();
                                    }
                                }}
                                className="w-full accent-white disabled:opacity-40"
                            />
                            <div className="mt-1 flex items-center justify-between text-[11px] text-white/70">
                                <span>{formatTime(videoFrameTime)}</span>
                                <span>{formatTime(videoFrameDuration)}</span>
                            </div>
                        </div>
                    )}
                </div>
            ) : isUploadedImageVariant ? (
                <div
                    className={`relative w-full bg-black group/image ${!selected ? '' : 'overflow-hidden'}`}
                    style={getAspectRatioStyle()}
                >
                    <img
                        src={data.resultUrl}
                        alt="Uploaded"
                        className="w-full h-full object-cover"
                        draggable={false}
                        onDragStart={preventNativeDrag}
                    />
                    <div className="absolute inset-x-0 top-0 z-10 p-3 opacity-0 transition-opacity group-hover/image:opacity-100">
                        <div className="inline-flex px-2 py-1 bg-black/60 text-[10px] font-medium uppercase tracking-wide text-white">
                            Uploaded
                        </div>
                    </div>
                </div>
            ) : (
            /* Result View - Show when successful OR when regenerating (loading with existing content) */
            (isSuccess || isLoading) && (data.resultUrl || (data.imageVariations && data.imageVariations.length > 0)) ? (
                <div
                    className={`relative w-full bg-black group/image ${!selected ? '' : 'overflow-hidden'}`}
                    style={getAspectRatioStyle()}
                >
                    {isVideoType ? (
                        <>
                            <video
                                ref={videoRef}
                                src={data.resultUrl}
                                controls={selected}
                                loop
                                playsInline
                                className="w-full h-full object-cover"
                                onMouseEnter={() => setIsVideoHovered(true)}
                                onMouseLeave={() => setIsVideoHovered(false)}
                            />
                            {!selected && !isVideoHovered && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                                    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-black/45 backdrop-blur-sm">
                                        <Play size={24} className="text-white fill-white ml-1" />
                                    </div>
                                </div>
                            )}
                            {isLoading && (
                                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60">
                                    <Loader2 size={32} className="animate-spin text-blue-400" />
                                    <span className="text-xs text-white/70 font-medium mt-2">{loadingStatusLabel}</span>
                                    <span className="mt-1 text-[11px] text-white/45">{loadingStatusDetail}</span>
                                    {onCancelGeneration && (
                                        <button
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onCancelGeneration(data.id);
                                            }}
                                            onMouseEnter={() => setCancelHovered(true)}
                                            onMouseLeave={() => setCancelHovered(false)}
                                            className={`mt-2 px-3 py-1 text-xs font-pixel transition-all duration-75 ${cancelHovered ? 'bg-red-600 text-white' : 'bg-white/10 text-white'}`}
                                        >
                                            <ScrambleText text="Cancel" isHovered={cancelHovered} speed="fast" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {data.imageVariations && data.imageVariations.length > 0 ? (
                                (() => {
                                    const slot = data.imageVariations[clampedCarouselIndex];

                                    if (slot?.status === 'success' && slot.url) {
                                        return (
                                            <img
                                                src={slot.url}
                                                alt="Generated"
                                                className="w-full h-full object-cover pointer-events-none"
                                            />
                                        );
                                    }

                                    if (slot?.status === 'failed') {
                                        return (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-white/80 bg-neutral-900">
                                                <svg viewBox="0 0 24 24" className="w-8 h-8 mb-2" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <circle cx="12" cy="12" r="10" />
                                                    <line x1="15" y1="9" x2="9" y2="15" />
                                                    <line x1="9" y1="9" x2="15" y2="15" />
                                                </svg>
                                                <span className="text-xs uppercase tracking-wide">Failed</span>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-white/80 bg-neutral-900 animate-pulse">
                                            <Loader2 size={28} className="animate-spin mb-2 text-blue-300" />
                                            <span className="text-xs uppercase tracking-wide">{loadingStatusLabel}</span>
                                        </div>
                                    );
                                })()
                            ) : (
                                /* Carousel: Show image at carouselIndex, or resultUrl if no carousel */
                                <img
                                    src={data.resultUrls?.[clampedCarouselIndex] || data.resultUrl}
                                    alt="Generated"
                                    className="w-full h-full object-cover pointer-events-none"
                                />
                            )}

                            {/* Carousel Navigation Arrows - Only show when there are multiple images */}
                            {hasCarousel && (
                                <>
                                    {/* Left Arrow */}
                                    <button
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const total = totalCarouselItems || 1;
                                            const newIndex = (clampedCarouselIndex - 1 + total) % total;
                                            onUpdate?.(data.id, { carouselIndex: newIndex, ...data.carouselSettings?.[newIndex] });
                                        }}
                                        className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/65 hover:bg-black/85 rounded-full text-white opacity-0 group-hover/image:opacity-100 transition-opacity z-10"
                                        title="Previous image"
                                    >
                                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="15 18 9 12 15 6" />
                                        </svg>
                                    </button>

                                    {/* Right Arrow */}
                                    <button
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const total = totalCarouselItems || 1;
                                            const newIndex = (clampedCarouselIndex + 1) % total;
                                            onUpdate?.(data.id, { carouselIndex: newIndex, ...data.carouselSettings?.[newIndex] });
                                        }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/65 hover:bg-black/85 rounded-full text-white opacity-0 group-hover/image:opacity-100 transition-opacity z-10"
                                        title="Next image"
                                    >
                                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="9 18 15 12 9 6" />
                                        </svg>
                                    </button>

                                    {/* Image Counter */}
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/60 rounded-full text-xs text-white opacity-0 group-hover/image:opacity-100 transition-opacity">
                                        {clampedCarouselIndex + 1} / {totalCarouselItems}
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {/* Regenerating Overlay - Shows when loading with existing content */}
                    {isLoading && !(data.imageVariations && data.imageVariations.length > 0) && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                            <Loader2 size={40} className="animate-spin text-blue-400" />
                            <span className="mt-3 text-sm text-white font-medium">{loadingStatusLabel}</span>
                            <span className="mt-1 text-[11px] text-white/45">{loadingStatusDetail}</span>
                            {onCancelGeneration && (
                                <button
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCancelGeneration(data.id);
                                    }}
                                    onMouseEnter={() => setCancelHovered(true)}
                                    onMouseLeave={() => setCancelHovered(false)}
                                    className={`mt-2 px-3 py-1 text-xs font-pixel transition-all duration-75 ${cancelHovered ? 'bg-red-600 text-white' : 'bg-white/10 text-white'}`}
                                >
                                    <ScrambleText text="Cancel" isHovered={cancelHovered} speed="fast" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ) : data.type === NodeType.TEXT ? (
                /* Text Node - Menu or Editing Mode */
                <div className={`relative w-full bg-[#111] overflow-hidden ${selected ? 'ring-1 ring-white/30' : ''}`}>
                    {data.textMode === 'editing' ? (
                        /* Editing Mode - Text Area */
                        <div className="p-4">
                            <textarea
                                value={localPrompt}
                                onChange={(e) => handleTextChange(e.target.value)}
                                onPointerDown={(e) => e.stopPropagation()}
                                onWheel={(e) => e.stopPropagation()}
                                onBlur={() => {
                                    // Ensure final value is saved on blur
                                    if (updateTimeoutRef.current) {
                                        clearTimeout(updateTimeoutRef.current);
                                    }
                                    if (localPrompt !== data.prompt) {
                                        onUpdate?.(data.id, { prompt: localPrompt });
                                    }
                                }}
                                placeholder="Write your text content here..."
                                className="w-full bg-transparent text-white text-sm resize-none outline-none placeholder:text-white/30"
                                style={{ minHeight: data.isPromptExpanded ? '300px' : '150px' }}
                                autoFocus
                            />
                            {/* Expand/Shrink Button */}
                            <div className="flex justify-end mt-2">
                                <button
                                    onClick={() => onUpdate?.(data.id, { isPromptExpanded: !data.isPromptExpanded })}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                                    title={data.isPromptExpanded ? 'Shrink text area' : 'Expand text area'}
                                >
                                    {data.isPromptExpanded ? <Shrink size={12} /> : <Expand size={12} />}
                                    <span>{data.isPromptExpanded ? 'Shrink' : 'Expand'}</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Menu Mode - Show Options */
                        <div className="p-5 flex flex-col gap-4">
                            {/* Header */}
                            <div className="text-white/50 text-sm font-medium">
                                Try to:
                            </div>

                            {/* Menu Options */}
                            <div className="flex flex-col gap-1">
                                <TextNodeMenuItem
                                    icon={<Pencil size={16} />}
                                    label="Write your own content"
                                    onClick={() => onWriteContent?.(data.id)}
                                />
                                <TextNodeMenuItem
                                    icon={<Video size={16} />}
                                    label="Text to Video"
                                    onClick={() => onTextToVideo?.(data.id)}
                                />
                                <TextNodeMenuItem
                                    icon={<ImageIcon size={16} />}
                                    label="Text to Image"
                                    onClick={() => onTextToImage?.(data.id)}
                                />
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Placeholder / Empty State for Image/Video */
                <div className={`relative w-full aspect-[4/3] bg-[#111] flex flex-col items-center justify-center gap-3 overflow-hidden
            ${isLoading ? 'animate-pulse' : ''}
            ${!selected ? '' : 'border border-dashed border-white/20'}`}>
                    {/* Input Image Preview for Video Nodes */}
                    {isReferenceMode ? (
                        /* Three-column grid for reference/ingredients mode */
                        <div className="absolute inset-0 z-0">
                            <div className="absolute inset-0 grid grid-cols-3 gap-px bg-white/10">
                                {imageConnections.slice(0, 3).map((conn, idx) => (
                                    <div key={conn.id} className="relative overflow-hidden">
                                        <img src={conn.url} alt={`Reference ${idx + 1}`} className="w-full h-full object-cover opacity-30 blur-sm" />
                                        <div className="absolute inset-0 bg-black/40" />
                                    </div>
                                ))}
                            </div>
                            <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white font-medium flex items-center gap-1">
                                <ImageIcon size={10} />
                                Reference Images
                            </div>
                        </div>
                    ) : isFrameToFrame ? (
                        /* Split background: start frame left, end frame right */
                        <div className="absolute inset-0 z-0">
                            {/* Left half - Start Frame */}
                            <div className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
                                {startFrameUrl && <img src={startFrameUrl} alt="Start Frame" className="w-full h-full object-cover opacity-30 blur-sm" />}
                                <div className="absolute inset-0 bg-black/40" />
                                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white font-medium flex items-center gap-1">
                                    <ImageIcon size={10} />
                                    Start Frame
                                </div>
                            </div>
                            {/* Divider */}
                            <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
                            {/* Right half - End Frame */}
                            <div className="absolute inset-y-0 right-0 w-1/2 overflow-hidden">
                                {endFrameUrl && <img src={endFrameUrl} alt="End Frame" className="w-full h-full object-cover opacity-30 blur-sm" />}
                                <div className="absolute inset-0 bg-black/40" />
                                <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white font-medium flex items-center gap-1">
                                    <ImageIcon size={10} />
                                    End Frame
                                </div>
                            </div>
                        </div>
                    ) : isMotionControl && hasMixedInputs ? (
                        <div className="absolute inset-0 z-0">
                            <div className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
                                {imageConnections[0]?.url && (
                                    <img src={imageConnections[0].url} alt="Image Input" className="w-full h-full object-cover opacity-30 blur-sm" />
                                )}
                                <div className="absolute inset-0 bg-black/40" />
                                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white font-medium flex items-center gap-1">
                                    <ImageIcon size={10} />
                                    Image
                                </div>
                            </div>
                            <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
                            <div className="absolute inset-y-0 right-0 w-1/2 overflow-hidden">
                                {connectedVideoSourceUrl ? (
                                    <video
                                        src={connectedVideoSourceUrl}
                                        className="w-full h-full object-cover opacity-30 blur-sm"
                                        muted
                                        playsInline
                                        autoPlay
                                        loop
                                    />
                                ) : videoConnections[0]?.url ? (
                                    <img src={videoConnections[0].url} alt="Video Input" className="w-full h-full object-cover opacity-30 blur-sm" />
                                ) : null}
                                <div className="absolute inset-0 bg-black/40" />
                                <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white font-medium flex items-center gap-1">
                                    <Film size={10} />
                                    Video
                                </div>
                            </div>
                        </div>
                    ) : isExtendMode && videoConnections.length > 0 ? (
                        <div className="absolute inset-0 z-0">
                            {connectedVideoSourceUrl ? (
                                <video
                                    src={connectedVideoSourceUrl}
                                    className="w-full h-full object-cover opacity-30 blur-sm"
                                    muted
                                    playsInline
                                    autoPlay
                                    loop
                                />
                            ) : videoConnections[0]?.url ? (
                                <img src={videoConnections[0].url} alt="Source Video" className="w-full h-full object-cover opacity-30 blur-sm" />
                            ) : null}
                            <div className="absolute inset-0 bg-black/40" />
                            <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white font-medium flex items-center gap-1">
                                <Film size={10} />
                                Source Video
                            </div>
                        </div>
                    ) : !isVideoType && imageConnections.length > 0 ? (
                        <div className="absolute inset-0 z-0">
                            <div className={`absolute inset-0 grid ${getImageInputGridClass(imageConnections.length)} gap-px bg-white/10`}>
                                {imageConnections.map((conn, idx) => (
                                    <div key={conn.id} className="relative overflow-hidden">
                                        <img src={conn.url} alt={getImageInputLabel(idx, imageConnections.length)} className="w-full h-full object-cover opacity-30 blur-sm" />
                                        <div className="absolute inset-0 bg-black/40" />
                                        <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white font-medium flex items-center gap-1">
                                            <ImageIcon size={10} />
                                            {getImageInputLabel(idx, imageConnections.length)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : inputUrl ? (
                        <div className="absolute inset-0 z-0">
                            <img src={inputUrl} alt="Input Preview" className="w-full h-full object-cover opacity-30 blur-sm" />
                            <div className="absolute inset-0 bg-black/40" />
                            <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white font-medium flex items-center gap-1">
                                <ImageIcon size={10} />
                                {isVideoType ? 'Start Frame' : videoConnections.length > 0 ? 'Locked Frame' : 'Input Image'}
                            </div>
                        </div>
                    ) : null}

                    {isLoading ? (
                        <div className="relative z-10 flex flex-col items-center gap-2">
                            <Loader2 size={32} className="animate-spin text-blue-400" />
                            <span className="text-xs text-white/70 font-medium">{loadingStatusLabel}</span>
                            <span className="text-[11px] text-white/45">{loadingStatusDetail}</span>
                            {onCancelGeneration && (
                                <button
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCancelGeneration(data.id);
                                    }}
                                    onMouseEnter={() => setCancelHovered(true)}
                                    onMouseLeave={() => setCancelHovered(false)}
                                    className={`mt-1 px-3 py-1 text-xs font-pixel transition-all duration-75 ${cancelHovered ? 'bg-red-600 text-white' : 'bg-white/10 text-white'}`}
                                >
                                    <ScrambleText text="Cancel" isHovered={cancelHovered} speed="fast" />
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="relative z-10 flex flex-col items-center gap-3">
                            <div className="text-white/50">
                                {isVideoType ? (
                                    isReferenceMode ? (
                                        <div className="relative">
                                            <Film size={40} />
                                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
                                                <span className="text-[8px] font-bold text-white">3+</span>
                                            </div>
                                        </div>
                                    ) : isFrameToFrame ? (
                                        <ArrowLeftRight size={40} />
                                    ) : isLocalModel ? (
                                        <><Film size={40} /><HardDrive size={16} className="absolute -bottom-1 -right-1 text-purple-400" /></>
                                    ) : (
                                        <Film size={40} />
                                    )
                                ) : (
                                    isLocalModel ? <><ImageIcon size={40} /><HardDrive size={16} className="absolute -bottom-1 -right-1 text-purple-400" /></> : <ImageIcon size={40} />
                                )}
                            </div>
                            {selected && (
                                isReferenceMode ? (
                                    <div className="text-blue-400 text-sm font-medium">
                                        {imageConnections.length} reference images
                                    </div>
                                ) : !isVideoType && imageConnections.length > 0 ? (
                                    <div className="text-white/50 text-sm font-medium">
                                        {imageConnections.length} image input{imageConnections.length === 1 ? '' : 's'}
                                    </div>
                                ) : isFrameToFrame ? (
                                    <button
                                        onClick={handleSwapFrames}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        className="text-white/50 hover:text-white/80 text-sm font-medium transition-colors"
                                    >
                                        Switch Places
                                    </button>
                                ) : (
                                    <div className="text-white/50 text-sm font-medium">
                                        {isVideoType && inputUrl
                                            ? "Ready to animate"
                                            : !isVideoType && videoConnections.length > 0 && data.selectedVideoFrameUrl
                                                ? "Frame locked"
                                                : !isVideoType && videoConnections.length > 0
                                                    ? "Pick a frame below"
                                            : isVideoType
                                                ? "Waiting for input..."
                                                : isLocalModel
                                                    ? "Select a model and enter prompt"
                                                    : "Waiting for input..."
                                        }
                                    </div>
                                )
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

interface TextNodeMenuItemProps {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
}

/**
 * Menu item component for Text node options
 */
const TextNodeMenuItem: React.FC<TextNodeMenuItemProps> = ({ icon, label, onClick }) => (
    <button
        className="flex items-center gap-3 w-full p-2.5 text-left text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClick}
    >
        <span className="text-white/50">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
    </button>
);
