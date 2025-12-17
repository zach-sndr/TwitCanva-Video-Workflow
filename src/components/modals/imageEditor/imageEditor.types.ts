/**
 * imageEditor.types.ts
 * 
 * Shared types and constants for the Image Editor modal.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Arrow element for annotations
 */
export interface ArrowElement {
    id: string;
    type: 'arrow';
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    color: string;
    lineWidth: number;
}

/**
 * Text element for annotations
 */
export interface TextElement {
    id: string;
    type: 'text';
    x: number;
    y: number;
    text: string;
    fontSize: number;
    color: string;
    fontFamily: string;
}

/**
 * Union type for all drawable elements
 */
export type EditorElement = ArrowElement | TextElement;

/**
 * Snapshot of editor state for undo/redo
 */
export interface HistoryState {
    canvasData: string | null; // Base64 image data of brush canvas
    elements: EditorElement[];
}

/**
 * Props for the main ImageEditorModal component
 */
export interface ImageEditorModalProps {
    isOpen: boolean;
    nodeId: string;
    imageUrl?: string;
    initialPrompt?: string;
    initialModel?: string;
    initialAspectRatio?: string;
    initialResolution?: string;
    onClose: () => void;
    onGenerate: (id: string, prompt: string, count: number) => void;
    onUpdate: (id: string, updates: any) => void;
}

/**
 * Image model configuration
 */
export interface ImageModel {
    id: string;
    name: string;
    provider: 'google' | 'kling';
    supportsImageToImage: boolean;
    supportsMultiImage: boolean;
    recommended?: boolean;
    resolutions: string[];
    aspectRatios: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Available image generation models
 */
export const IMAGE_MODELS: ImageModel[] = [
    { id: 'gemini-pro', name: 'Nano Banana Pro', provider: 'google', supportsImageToImage: true, supportsMultiImage: true, resolutions: ["1K", "2K", "4K"], aspectRatios: ["Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9"] },
    { id: 'kling-v1', name: 'Kling V1', provider: 'kling', supportsImageToImage: true, supportsMultiImage: false, resolutions: ["1K", "2K"], aspectRatios: ["Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "21:9"] },
    { id: 'kling-v1-5', name: 'Kling V1.5', provider: 'kling', supportsImageToImage: true, supportsMultiImage: false, resolutions: ["1K", "2K"], aspectRatios: ["Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "21:9"] },
    { id: 'kling-v2', name: 'Kling V2', provider: 'kling', supportsImageToImage: true, supportsMultiImage: true, resolutions: ["1K", "2K"], aspectRatios: ["Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "21:9"] },
    { id: 'kling-v2-new', name: 'Kling V2 New', provider: 'kling', supportsImageToImage: true, supportsMultiImage: false, resolutions: ["1K", "2K"], aspectRatios: ["Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "21:9"] },
    { id: 'kling-v2-1', name: 'Kling V2.1', provider: 'kling', supportsImageToImage: false, supportsMultiImage: true, recommended: true, resolutions: ["1K", "2K"], aspectRatios: ["Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "21:9"] },
];

/**
 * Preset brush colors
 */
export const PRESET_COLORS = ['#ff0000', '#3b82f6', '#22c55e', '#eab308', '#ec4899', '#8b5cf6'];
