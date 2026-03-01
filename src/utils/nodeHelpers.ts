/**
 * nodeHelpers.ts
 *
 * Utility functions for working with canvas nodes.
 */

import { NodeData, NodeStatus, NodeType } from '../types';

/**
 * Get the rendered width of a node card based on its type and content.
 * Mirrors the logic in ConnectionsLayer.tsx.
 */
export function getNodeCardWidth(node: NodeData, parentNode?: NodeData): number {
    const customWidth = node.customWidth;

    if (node.type === NodeType.IMAGE_EDITOR) {
        const hasInput = parentNode && parentNode.status === NodeStatus.SUCCESS && parentNode.resultUrl;
        if (hasInput && parentNode.resultAspectRatio) {
            const parts = parentNode.resultAspectRatio.split('/');
            if (parts.length === 2) {
                const ar = parseFloat(parts[0]) / parseFloat(parts[1]);
                return ar < 1 ? 500 * ar : 500;
            }
        }
        return 340;
    }
    if (node.type === NodeType.VIDEO_EDITOR) {
        const hasInput = parentNode && parentNode.status === NodeStatus.SUCCESS && parentNode.resultUrl;
        return hasInput ? 500 : 340;
    }
    if (typeof customWidth === 'number' && Number.isFinite(customWidth)) {
        return customWidth;
    }
    if (node.type === NodeType.VIDEO) return 385;
    if (node.type === NodeType.CAMERA_ANGLE) return 340;
    if (node.type === NodeType.STYLE) return 180;
    return 365;
}

/**
 * Get the rendered height of a node card based on its type, content, and aspect ratio.
 * Mirrors the logic in ConnectionsLayer.tsx.
 */
export function getNodeCardHeight(node: NodeData, parentNode?: NodeData): number {
    const baseWidth = getNodeCardWidth(node, parentNode);
    const hasContent = node.status === NodeStatus.SUCCESS && node.resultUrl;

    if (node.type === NodeType.IMAGE_EDITOR) {
        const hasInput = parentNode && parentNode.status === NodeStatus.SUCCESS && parentNode.resultUrl;
        if (hasInput && parentNode.resultAspectRatio) {
            const parts = parentNode.resultAspectRatio.split('/');
            if (parts.length === 2) {
                const ar = parseFloat(parts[0]) / parseFloat(parts[1]);
                return ar < 1 ? 500 : 500 / ar;
            }
        }
        return 380;
    }
    if (node.type === NodeType.VIDEO_EDITOR) {
        const hasInput = parentNode && parentNode.status === NodeStatus.SUCCESS && parentNode.resultUrl;
        return hasInput ? Math.min(baseWidth / (16 / 9), 500) : 380;
    }
    if (node.type === NodeType.CAMERA_ANGLE) {
        if (hasContent && node.resultAspectRatio) {
            const parts = node.resultAspectRatio.split('/');
            if (parts.length === 2) return 340 / (parseFloat(parts[0]) / parseFloat(parts[1]));
        }
        return 340;
    }
    if (node.type === NodeType.STYLE) return 215;

    let aspectRatio: number;
    if (hasContent && node.resultAspectRatio) {
        const parts = node.resultAspectRatio.split('/');
        aspectRatio = parts.length === 2 ? parseFloat(parts[0]) / parseFloat(parts[1]) : 16 / 9;
    } else if (hasContent && node.aspectRatio && node.aspectRatio !== 'Auto') {
        const parts = node.aspectRatio.split(':');
        aspectRatio = parts.length === 2 ? parseFloat(parts[0]) / parseFloat(parts[1]) : 16 / 9;
    } else {
        aspectRatio = 4 / 3;
    }

    return baseWidth / aspectRatio;
}

/**
 * Gets the "face" image URL from a node - the primary image used for I2I and I2V operations.
 * If the node has a carousel (resultUrls), returns the image at carouselIndex.
 * Otherwise returns the resultUrl.
 *
 * @param node - The node data
 * @returns The face image URL, or undefined if no image exists
 */
export function getNodeFaceImage(node: NodeData | undefined | null): string | undefined {
    if (!node) return undefined;

    // If variation slots exist, prefer the selected successful slot.
    if (node.imageVariations && node.imageVariations.length > 0) {
        const selectedIndex = node.carouselIndex ?? 0;
        const selected = node.imageVariations[selectedIndex];
        if (selected?.status === 'success' && selected.url) {
            return selected.url;
        }
        const firstSuccess = node.imageVariations.find(v => v.status === 'success' && v.url);
        if (firstSuccess?.url) {
            return firstSuccess.url;
        }
    }

    // If there's a carousel with multiple images, use the current carousel index
    if (node.resultUrls && node.resultUrls.length > 0) {
        const index = node.carouselIndex ?? 0;
        return node.resultUrls[index];
    }

    // Otherwise use the primary resultUrl
    return node.resultUrl;
}
