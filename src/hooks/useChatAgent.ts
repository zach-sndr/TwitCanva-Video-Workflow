/**
 * useChatAgent.ts
 *
 * Custom hook for chat agent interactions.
 * Manages messages, sessions, topics, and API communication.
 * Supports canvas callbacks for agent-driven node creation.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { NodeType, CanvasCallbacks, CanvasAction } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    media?: {
        type: 'image' | 'video';
        url: string;
    }[]; // Array of media attachments
    timestamp: Date;
}

export interface ChatSession {
    id: string;
    topic: string;
    createdAt: string;
    updatedAt?: string;
    messageCount: number;
}

interface ChatApiResponse {
    success: boolean;
    response: string;
    topic?: string;
    messageCount: number;
    canvasActions?: CanvasAction[];
}

interface UseChatAgentReturn {
    messages: ChatMessage[];
    topic: string | null;
    sessionId: string | null;
    isLoading: boolean;
    error: string | null;
    sessions: ChatSession[];
    isLoadingSessions: boolean;
    sendMessage: (content: string, media?: { type: 'image' | 'video'; url: string; base64?: string }[]) => Promise<void>;
    startNewChat: () => void;
    loadSession: (sessionId: string) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;
    refreshSessions: () => Promise<void>;
    hasMessages: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
    return `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// HOOK
// ============================================================================

export function useChatAgent(canvasCallbacks?: CanvasCallbacks): UseChatAgentReturn {
    // --- State ---
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [topic, setTopic] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);

    // Use ref to track if we've initialized a session
    const hasInitializedRef = useRef(false);

    // Ref for mapping tempId → real nodeId across canvas actions
    const tempIdToNodeIdRef = useRef<Map<string, string>>(new Map());

    // --- Canvas Actions Processing ---

    const processCanvasActions = useCallback(async (actions: CanvasAction[]) => {
        if (!canvasCallbacks || !actions?.length) return;

        // Runtime validation: reject if too many actions or any are malformed
        const MAX_ACTIONS = 20;
        if (actions.length > MAX_ACTIONS) {
            console.warn(`[Canvas Actions] Rejected: too many actions (${actions.length})`);
            return;
        }
        const validTypes = new Set(['CREATE_NODE', 'TRIGGER_GENERATION']);
        const allValid = actions.every(a => {
            if (!validTypes.has(a.type)) return false;
            if (a.type === 'CREATE_NODE') {
                return !!(a.nodeType && a.prompt && a.tempId);
            }
            if (a.type === 'TRIGGER_GENERATION') {
                return !!a.targetTempId;
            }
            return false;
        });
        if (!allValid) {
            console.warn('[Canvas Actions] Rejected: one or more actions failed validation');
            return;
        }

        tempIdToNodeIdRef.current = new Map();
        let rightStackCount = 0;
        const NODE_WIDTH = 340;
        const GAP = 100;
        const NODE_HEIGHT = 300;

        for (const action of actions) {
            if (action.type === 'CREATE_NODE') {
                const viewport = canvasCallbacks.getViewport();
                const selectedPos = canvasCallbacks.getSelectedNodePosition();
                const nodeType = action.nodeType === 'Video' ? NodeType.VIDEO : NodeType.IMAGE;

                // Compute target canvas position
                let targetCanvasX: number, targetCanvasY: number;
                if (action.positionHint === 'right-of-selected' && selectedPos) {
                    targetCanvasX = selectedPos.x + NODE_WIDTH + GAP;
                    targetCanvasY = selectedPos.y + rightStackCount * (NODE_HEIGHT + GAP);
                    rightStackCount++;
                } else {
                    targetCanvasX = (window.innerWidth / 2 - viewport.x) / viewport.zoom + (Math.random() * 100 - 50);
                    targetCanvasY = (window.innerHeight / 2 - viewport.y) / viewport.zoom + (Math.random() * 100 - 50);
                }

                // addNode without parentId subtracts 170 from x and 100 from y (useNodeManagement.ts:44-45)
                // Compensate so node lands at exactly targetCanvas coords
                const screenX = (targetCanvasX + 170) * viewport.zoom + viewport.x;
                const screenY = (targetCanvasY + 100) * viewport.zoom + viewport.y;

                const newNodeId = canvasCallbacks.onAddNode(nodeType, screenX, screenY, undefined, viewport);

                // image nodes use imageModel; video nodes use videoModel (useGeneration.ts:114, 156)
                const modelUpdates = action.model
                    ? nodeType === NodeType.IMAGE
                        ? { model: action.model, imageModel: action.model }
                        : { model: action.model, videoModel: action.model }
                    : {};

                canvasCallbacks.onUpdateNode(newNodeId, {
                    prompt: action.prompt,
                    ...modelUpdates,
                    ...(action.aspectRatio ? { aspectRatio: action.aspectRatio } : {}),
                });
                tempIdToNodeIdRef.current.set(action.tempId, newNodeId);

            } else if (action.type === 'TRIGGER_GENERATION') {
                const realNodeId = tempIdToNodeIdRef.current.get(action.targetTempId);
                if (realNodeId) {
                    // Wait for React state to settle before triggering generation
                    await new Promise(resolve => setTimeout(resolve, 150));
                    canvasCallbacks.onTriggerGeneration(realNodeId);
                }
            }
        }
    }, [canvasCallbacks]);

    // --- Callbacks ---

    /**
     * Initialize a new session if needed
     */
    const ensureSession = useCallback(() => {
        if (!sessionId) {
            const newSessionId = generateSessionId();
            setSessionId(newSessionId);
            return newSessionId;
        }
        return sessionId;
    }, [sessionId]);

    /**
     * Fetch all chat sessions from the server
     */
    const refreshSessions = useCallback(async () => {
        setIsLoadingSessions(true);
        try {
            const response = await fetch('/api/chat/sessions');
            if (response.ok) {
                const data = await response.json();
                setSessions(data);
            }
        } catch (err) {
            console.error('Failed to fetch sessions:', err);
        } finally {
            setIsLoadingSessions(false);
        }
    }, []);

    /**
     * Load a specific session by ID
     */
    const loadSession = useCallback(async (targetSessionId: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/chat/sessions/${targetSessionId}`);
            if (!response.ok) {
                throw new Error('Session not found');
            }

            const data = await response.json();

            // Convert messages to ChatMessage format
            const loadedMessages: ChatMessage[] = data.messages.map((msg: any, index: number) => ({
                id: `loaded-${targetSessionId}-${index}`,
                role: msg.role,
                content: msg.content,
                media: msg.media,
                timestamp: new Date(msg.timestamp || data.createdAt),
            }));

            setSessionId(targetSessionId);
            setMessages(loadedMessages);
            setTopic(data.topic);
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load session';
            setError(errorMessage);
            console.error('Load session error:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Delete a session
     */
    const deleteSession = useCallback(async (targetSessionId: string) => {
        try {
            await fetch(`/api/chat/sessions/${targetSessionId}`, {
                method: 'DELETE',
            });

            // Refresh sessions list
            await refreshSessions();

            // If we deleted the current session, start a new one
            if (targetSessionId === sessionId) {
                setMessages([]);
                setTopic(null);
                setSessionId(generateSessionId());
            }
        } catch (err) {
            console.error('Failed to delete session:', err);
        }
    }, [sessionId, refreshSessions]);

    /**
     * Send a message to the chat agent
     */
    const sendMessage = useCallback(async (
        content: string,
        media?: { type: 'image' | 'video'; url: string; base64?: string }[]
    ) => {
        const currentSessionId = ensureSession();
        setError(null);
        setIsLoading(true);

        // Add user message immediately
        const userMessage: ChatMessage = {
            id: generateMessageId(),
            role: 'user',
            content,
            media: media ? media.map(m => ({ type: m.type, url: m.url })) : undefined,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMessage]);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    message: content,
                    media: media ? media.map(m => ({
                        type: m.type,
                        base64: m.base64 || m.url, // Use base64 if available, otherwise URL
                    })) : undefined,
                    canvasContext: {
                        selectedNode: canvasCallbacks?.getSelectedNode() ?? null,
                    },
                }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || response.statusText);
            }

            const data: ChatApiResponse = await response.json();

            // Add AI response
            const aiMessage: ChatMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: data.response,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, aiMessage]);

            // Update topic if returned
            if (data.topic) {
                setTopic(data.topic);
            }

            // Process canvas actions after a brief delay so React can render the AI message
            if (data.canvasActions && data.canvasActions.length > 0) {
                setTimeout(() => {
                    try {
                        processCanvasActions(data.canvasActions!);
                    } catch (err) {
                        console.error('[Canvas Actions] Failed to process actions:', err);
                        setMessages(prev => [...prev, {
                            id: generateMessageId(),
                            role: 'assistant',
                            content: '⚠️ Canvas actions could not be applied. Please try again.',
                            timestamp: new Date(),
                        }]);
                    }
                }, 50);
            }

            // Refresh sessions list to show the new/updated session
            await refreshSessions();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
            setError(errorMessage);
            console.error('Chat error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [ensureSession, refreshSessions, canvasCallbacks, processCanvasActions]);

    /**
     * Start a new chat session
     */
    const startNewChat = useCallback(() => {
        setMessages([]);
        setTopic(null);
        setSessionId(generateSessionId());
        setError(null);
        hasInitializedRef.current = false;
    }, []);

    // Load sessions on mount
    useEffect(() => {
        refreshSessions();
    }, [refreshSessions]);

    return {
        messages,
        topic,
        sessionId,
        isLoading,
        error,
        sessions,
        isLoadingSessions,
        sendMessage,
        startNewChat,
        loadSession,
        deleteSession,
        refreshSessions,
        hasMessages: messages.length > 0,
    };
}

export default useChatAgent;
