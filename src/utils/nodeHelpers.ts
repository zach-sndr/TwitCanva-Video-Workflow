/**
 * nodeHelpers.ts
 *
 * Utility functions for working with canvas nodes.
 */

import { NodeData } from '../types';

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
