/**
 * useGenerationRecovery.ts
 * 
 * Custom hook that checks for nodes in 'loading' status and polls
 * the backend to see if their generation has finished.
 */

import { useEffect, useCallback, useRef } from 'react';
import { NodeData, NodeStatus } from '../types';
import { extractVideoLastFrame } from '../utils/videoHelpers';
import { fetchGenerationStatus, GenerationStatusResult } from '../services/generationService';

interface UseGenerationRecoveryOptions {
    nodes: NodeData[];
    updateNode: (id: string, updates: Partial<NodeData>) => void;
    onStatusChange?: (nodeId: string, status: GenerationStatusResult | null) => void;
}

export const useGenerationRecovery = ({
    nodes,
    updateNode,
    onStatusChange
}: UseGenerationRecoveryOptions) => {
    // Use a ref to access current nodes without causing re-renders
    const nodesRef = useRef<NodeData[]>(nodes);
    nodesRef.current = nodes;

    const checkStatus = useCallback(async (nodeId: string) => {
        try {
            const data = await fetchGenerationStatus(nodeId);

            if (data.status === 'success' && data.resultUrl) {
                // Access nodes via ref to avoid stale closure
                const node = nodesRef.current.find(n => n.id === nodeId);

                // Race condition check: If node has a generationStartTime, compare with result's createdAt
                // This prevents applying stale results from previous generations
                if (node?.generationStartTime && data.createdAt) {
                    const resultCreatedAt = new Date(data.createdAt).getTime();
                    if (resultCreatedAt < node.generationStartTime) {
                        // Stale result, skip silently (don't spam console)
                        return;
                    }
                }

                console.log(`[Recovery] Found new result for node ${nodeId}`);
                onStatusChange?.(nodeId, null);

                // Update node with success status and result URL
                const updates: Partial<NodeData> = {
                    status: NodeStatus.SUCCESS,
                    resultUrl: data.resultUrl,
                    errorMessage: undefined,
                    generationStartTime: undefined // Clear the timestamp after successful recovery
                };

                // If it's a video, extract the last frame for chaining
                if (data.type === 'video') {
                    try {
                        const lastFrame = await extractVideoLastFrame(data.resultUrl);
                        updates.lastFrame = lastFrame;
                    } catch (err) {
                        console.error(`[Recovery] Failed to extract last frame for node ${nodeId}:`, err);
                    }
                }

                updateNode(nodeId, updates);
                return;
            }

            if (data.status === 'error') {
                onStatusChange?.(nodeId, data);
                updateNode(nodeId, {
                    status: NodeStatus.ERROR,
                    errorMessage: data.errorMessage || data.detail || 'Generation failed',
                    generationStartTime: undefined
                });
                return;
            }

            onStatusChange?.(nodeId, data.status === 'pending' ? data : null);
        } catch (error) {
            console.error(`[Recovery] Error checking status for node ${nodeId}:`, error);
        }
    }, [onStatusChange, updateNode]); // Only stable callbacks as deps, nodes accessed via ref

    // Track loading node IDs for stable dependency
    const loadingNodeIds = nodes
        .filter(n => n.status === NodeStatus.LOADING)
        .map(n => n.id)
        .join(',');

    useEffect(() => {
        if (!loadingNodeIds) return;

        const nodeIds = loadingNodeIds.split(',');

        // Check each loading node every 10 seconds
        const checkAll = () => {
            nodeIds.forEach(nodeId => checkStatus(nodeId));
        };

        checkAll(); // Initial check

        const interval = setInterval(checkAll, 10000); // Check every 10s

        return () => clearInterval(interval);
    }, [loadingNodeIds, checkStatus]); // Stable string dependency instead of nodes array
};
