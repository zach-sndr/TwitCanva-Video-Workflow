/**
 * ChatPanel.tsx
 *
 * Agent chat panel that slides in from the right side.
 * Shows greeting, inspiration suggestions, chat messages, and input.
 * Supports drag-drop of image/video nodes from canvas.
 * Includes chat history panel for viewing past conversations.
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, History, Paperclip, Globe, Send, Plus, Loader2, ChevronLeft, Trash2, MessageSquare } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { useChatAgent, ChatMessage as ChatMessageType, ChatSession } from '../hooks/useChatAgent';

// ============================================================================
// TYPES
// ============================================================================

interface AttachedMedia {
    type: 'image' | 'video';
    url: string;
    nodeId: string;
    base64?: string;
}

export interface QueuedChatMedia {
    type: 'image' | 'video';
    url: string;
    nodeId: string;
    nodeData?: import('../types').NodeData; // Full node entity for chat agent context
}

interface ChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
    userName?: string;
    queuedMedia?: QueuedChatMedia[];
    onQueuedMediaConsumed?: () => void;
    canvasTheme?: 'dark' | 'light';
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ChatPanel: React.FC<ChatPanelProps> = ({
    isOpen,
    onClose,
    userName = 'Creator',
    queuedMedia = [],
    onQueuedMediaConsumed,
    canvasTheme = 'dark',
}) => {
    // --- State ---
    const [message, setMessage] = useState('');
    const [showTip, setShowTip] = useState(true);
    const [attachedMedia, setAttachedMedia] = useState<AttachedMedia[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    // Theme helper
    const isDark = canvasTheme === 'dark';

    // Chat agent hook
    const {
        messages,
        topic,
        isLoading,
        error,
        sessions,
        isLoadingSessions,
        sendMessage,
        startNewChat,
        loadSession,
        deleteSession,
        hasMessages,
    } = useChatAgent();

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // --- Effects ---

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // --- Event Handlers ---

    const toImageBase64 = async (url: string): Promise<string | undefined> => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = reader.result as string;
                    const base64 = result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (err) {
            console.error('Failed to convert image to base64:', err);
            return undefined;
        }
    };

    const addMediaAttachments = async (items: QueuedChatMedia[]) => {
        if (!items.length) return;

        const prepared = await Promise.all(items.map(async (item) => {
            const base64 = item.type === 'image' ? await toImageBase64(item.url) : undefined;
            return { ...item, base64 };
        }));

        setAttachedMedia(prev => {
            const seen = new Set(prev.map(m => `${m.nodeId}::${m.url}`));
            const next = [...prev];
            for (const item of prepared) {
                const key = `${item.nodeId}::${item.url}`;
                if (seen.has(key)) continue;
                seen.add(key);
                next.push(item);
            }
            return next;
        });
    };

    useEffect(() => {
        if (!queuedMedia.length) return;

        let cancelled = false;
        (async () => {
            if (cancelled) return;
            await addMediaAttachments(queuedMedia);
            if (!cancelled) {
                onQueuedMediaConsumed?.();
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [queuedMedia, onQueuedMediaConsumed]);

    const removeAttachment = (nodeId: string) => {
        setAttachedMedia(prev => prev.filter(m => m.nodeId !== nodeId));
    };

    const handleSend = async () => {
        if ((!message.trim() && attachedMedia.length === 0) || isLoading) return;

        const currentMessage = message;
        const currentMedia = attachedMedia;

        // Clear input immediately for better UX
        setMessage('');
        setAttachedMedia([]);

        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        // Hide tip after first message
        if (showTip) {
            setShowTip(false);
        }

        await sendMessage(
            currentMessage,
            currentMedia.length > 0 ? currentMedia.map(m => ({
                type: m.type,
                url: m.url,
                base64: m.base64,
            })) : undefined
        );
    };

    const handleNewChat = () => {
        startNewChat();
        setMessage('');
        setAttachedMedia([]);
        setShowTip(true);
        setShowHistory(false);
    };

    const handleLoadSession = async (sessionId: string) => {
        await loadSession(sessionId);
        setShowHistory(false);
        setShowTip(false);
    };

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        await deleteSession(sessionId);
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return date.toLocaleDateString();
        }
    };

    // --- Render ---

    if (!isOpen) return null;

    return (
        <div
            className="fixed top-0 right-0 w-[400px] h-full flex flex-col z-40 transition-all duration-300 border-l border-white/10 bg-white/5 backdrop-blur-xl font-pixel"
        >

            {/* History Panel */}
            {showHistory && (
                <div className="absolute inset-0 z-20 flex flex-col bg-[#111]">
                    {/* History Header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
                        <button
                            onClick={() => setShowHistory(false)}
                            className="p-1.5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span className="font-medium text-sm text-white">Chat History</span>
                    </div>

                    {/* History List */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {isLoadingSessions ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 text-white animate-spin" />
                            </div>
                        ) : sessions.length === 0 ? (
                            <div className="text-center py-8">
                                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-white/30" />
                                <p className="text-white/50 text-sm">No chat history yet</p>
                                <p className="text-white/30 text-xs mt-1">Start a conversation to see it here</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {sessions.map((session: ChatSession) => (
                                    <div
                                        key={session.id}
                                        onClick={() => handleLoadSession(session.id)}
                                        role="button"
                                        tabIndex={0}
                                        className="w-full text-left p-3 hover:bg-white/5 transition-colors cursor-pointer group"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate text-white">
                                                    {session.topic}
                                                </p>
                                                <p className="text-xs mt-1 text-white/40">
                                                    {session.messageCount} messages · {formatDate(session.updatedAt || session.createdAt)}
                                                </p>
                                            </div>
                                            <button
                                                onClick={(e) => handleDeleteSession(e, session.id)}
                                                className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all text-white/40 hover:text-red-400"
                                                title="Delete chat"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* New Chat Button */}
                    <div className="p-4 border-t border-white/10">
                        <button
                            onClick={handleNewChat}
                            className="w-full py-2.5 bg-white hover:bg-neutral-200 text-black font-medium text-sm transition-colors flex items-center justify-center gap-2"
                        >
                            <Plus size={16} />
                            New Chat
                        </button>
                    </div>
                </div>
            )
            }

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                    {/* Topic or default title */}
                    <span className="font-medium text-sm truncate max-w-[180px] text-white">
                        {topic || (hasMessages ? 'New Chat' : 'Infiknit Agent')}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {/* New Chat button - only show after messages exist */}
                    {hasMessages && (
                        <button
                            onClick={handleNewChat}
                            className="p-1.5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                            title="New Chat"
                        >
                            <Plus size={18} />
                        </button>
                    )}
                    <button
                        onClick={() => setShowHistory(true)}
                        className="p-1.5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                        title="Chat History"
                    >
                        <History size={18} />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {/* Show greeting and tip if no messages */}
                {!hasMessages ? (
                    <>
                        {/* Greeting */}
                        <h1 className="text-2xl font-bold mb-1 text-white">
                            Hi, {userName}
                        </h1>
                        <p className="text-white/60 text-sm mb-6">
                            Looking for inspiration?
                        </p>

                        {/* Tip Card */}
                        {showTip && (
                            <div className="p-4 mb-4">
                                <div className="mb-3 flex items-center justify-center">
                                    <img
                                        src="/chat-preview.gif"
                                        alt="Drag and drop preview"
                                        className="w-full h-auto object-cover"
                                    />
                                </div>
                                <p className="text-sm leading-relaxed mb-3 text-white/50">
                                    Drag image/video nodes into the chat dialog to unlock advanced features like prompt generation based on node content, providing more inspiration for your creativity~
                                </p>
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => setShowTip(false)}
                                        className="px-4 py-1.5 bg-white hover:bg-neutral-200 text-black text-sm transition-colors"
                                    >
                                        Got it
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    /* Chat Messages */
                    <div className="space-y-1">
                        {messages.map((msg: ChatMessageType) => (
                            <ChatMessage
                                key={msg.id}
                                role={msg.role}
                                content={msg.content}
                                media={msg.media}
                                timestamp={msg.timestamp}
                            />
                        ))}

                        {/* Loading indicator */}
                        {isLoading && (
                            <div className="flex justify-start mb-4">
                                <div className="px-4 py-3 bg-white/10">
                                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                                </div>
                            </div>
                        )}

                        {/* Error message */}
                        {error && (
                            <div className="flex justify-center mb-4">
                                <div className="bg-red-500/20 border border-red-500/50 px-4 py-2 text-red-400 text-sm">
                                    {error}
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 pt-0 border-t border-white/10">
                {/* Attached Media Preview */}
                {attachedMedia.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {attachedMedia.map((media) => (
                            <div key={media.nodeId} className="relative">
                                {media.type === 'image' ? (
                                    <img
                                        src={media.url}
                                        alt="Attached"
                                        className="w-14 h-14 object-cover"
                                    />
                                ) : (
                                    <video
                                        src={media.url}
                                        className="w-14 h-14 object-cover"
                                    />
                                )}
                                <button
                                    onClick={() => removeAttachment(media.nodeId)}
                                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 hover:bg-red-400 flex items-center justify-center text-white text-[10px]"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Chat Input - Seamless full width */}
                <div className="relative">
                    <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="get assistance"
                        className="w-full bg-transparent text-white text-sm outline-none resize-none min-h-[48px] max-h-[120px] p-3 pr-24 placeholder:text-white/30"
                        rows={1}
                        style={{ scrollbarWidth: 'none' }}
                        disabled={isLoading}
                        onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            const newHeight = Math.min(target.scrollHeight, 120);
                            target.style.height = newHeight + 'px';
                            target.style.overflowY = target.scrollHeight > 120 ? 'auto' : 'hidden';
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                    />
                    {/* Action buttons overlay */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button className="p-1.5 hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                            <Paperclip size={16} />
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={isLoading || (!message.trim() && !attachedMedia)}
                            className={`p-2 transition-colors text-white/30 ${isLoading || (!message.trim() && !attachedMedia)
                                ? 'cursor-not-allowed'
                                : 'hover:text-white/50'
                                }`}
                        >
                            {isLoading ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <Send size={14} />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div >
    );
};

// ============================================================================
// CHAT BUBBLE
// ============================================================================

/**
 * ChatBubble - Floating button to open chat
 */
interface ChatBubbleProps {
    onClick: () => void;
    isOpen: boolean;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ onClick, isOpen }) => {
    if (isOpen) return null;

    return (
        <button
            onClick={onClick}
            className="fixed bottom-6 right-6 h-10 px-4 bg-transparent hover:bg-white/10 border border-white/20 flex items-center justify-center transition-all hover:scale-105 z-50 font-pixel text-xs text-white"
        >
            AGENT
        </button>
    );
};
