/**
 * ChatMessage.tsx
 *
 * Reusable message bubble component for the chat panel.
 * Displays user and assistant messages with multiple media support.
 * Renders code blocks with copy functionality.
 */

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface ChatMessageProps {
    role: 'user' | 'assistant';
    content: string;
    media?: {
        type: 'image' | 'video';
        url: string;
    }[];
    timestamp?: Date;
}

interface CodeBlockProps {
    code: string;
}

// ============================================================================
// CODE BLOCK COMPONENT
// ============================================================================

/**
 * Renders a code block with a copy button
 */
const CodeBlock: React.FC<CodeBlockProps> = ({ code }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <div className="relative my-2 group">
            <pre className="bg-[#111] border border-white/10 p-3 text-sm overflow-x-auto">
                <code className="text-white whitespace-pre-wrap break-words">{code}</code>
            </pre>
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 transition-colors opacity-0 group-hover:opacity-100"
                title={copied ? 'Copied!' : 'Copy to clipboard'}
            >
                {copied ? (
                    <Check size={14} className="text-green-400" />
                ) : (
                    <Copy size={14} className="text-white/60" />
                )}
            </button>
        </div>
    );
};

// ============================================================================
// CONTENT PARSER
// ============================================================================

/**
 * Parses message content and extracts code blocks
 * Returns an array of content segments (text or code)
 */
function parseContent(content: string): Array<{ type: 'text' | 'code'; content: string }> {
    const segments: Array<{ type: 'text' | 'code'; content: string }> = [];

    // Regex to match code blocks (```...``` or ```language\n...```)
    const codeBlockRegex = /```(?:\w+)?\n?([\s\S]*?)```/g;

    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
        // Add text before the code block
        if (match.index > lastIndex) {
            const text = content.slice(lastIndex, match.index).trim();
            if (text) {
                segments.push({ type: 'text', content: text });
            }
        }

        // Add the code block
        segments.push({ type: 'code', content: match[1].trim() });
        lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last code block
    if (lastIndex < content.length) {
        const text = content.slice(lastIndex).trim();
        if (text) {
            segments.push({ type: 'text', content: text });
        }
    }

    // If no code blocks found, return the entire content as text
    if (segments.length === 0) {
        segments.push({ type: 'text', content: content });
    }

    return segments;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ChatMessage: React.FC<ChatMessageProps> = ({
    role,
    content,
    media,
    timestamp
}) => {
    const isUser = role === 'user';

    // Clean content and parse code blocks
    const cleanedContent = content.replace(/\[IMAGE \d+ ATTACHED\]/g, '').trim();
    const segments = parseContent(cleanedContent);

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
            <div
                className={`max-w-[85%] px-4 py-3 ${isUser
                    ? 'bg-transparent text-white'
                    : 'bg-white/10 text-white'
                    }`}
            >
                {/* Media Attachments */}
                {media && media.length > 0 && (
                    <div className={`mb-2 ${media.length > 1 ? 'grid grid-cols-2 gap-2' : ''}`}>
                        {media.map((m, index) => (
                            <div key={index} className="relative">
                                {m.type === 'image' ? (
                                    <img
                                        src={m.url}
                                        alt={`Attached ${index + 1}`}
                                        className="w-full max-h-32 object-cover"
                                    />
                                ) : (
                                    <video
                                        src={m.url}
                                        className="w-full max-h-32 object-cover"
                                        controls
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Message Content with Code Blocks */}
                <div className="text-sm leading-relaxed select-text cursor-text">
                    {segments.map((segment, index) => (
                        segment.type === 'code' ? (
                            <CodeBlock key={index} code={segment.content} />
                        ) : (
                            <div key={index} className="whitespace-pre-wrap">
                                {segment.content}
                            </div>
                        )
                    ))}
                </div>

                {/* Timestamp (optional) */}
                {timestamp && (
                    <div
                        className={`text-[10px] mt-1 ${isUser ? 'text-white/40' : 'text-white/40'
                            }`}
                    >
                        {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatMessage;
