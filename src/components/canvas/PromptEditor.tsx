/**
 * PromptEditor.tsx
 *
 * Rich prompt editor with slash commands and inline chips.
 * - Slash command (`/`) opens an asset picker
 * - Selected assets become inline chips in the prompt area
 * - Node-linked chips are locked; slash-command chips are backspace-deletable
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PromptChip, NodeData } from '../../types';

interface StyleAsset {
    id: string;
    name: string;
    url: string;
    prompt?: string;
    styleId?: string;
    category: string;
}

interface PromptEditorProps {
    value: string;                           // plain text portion
    onChange: (text: string) => void;       // text change callback
    chips: PromptChip[];                     // slash-command chips
    onChipsChange: (chips: PromptChip[]) => void; // chip updates
    placeholder?: string;
    rows?: number;
    isDark?: boolean;
    disabled?: boolean;
    connectedStyleNodes?: NodeData[];       // locked chips from node connections
}

interface SlashMenuProps {
    query: string;
    position: { x: number; y: number };
    onSelect: (asset: StyleAsset) => void;
    onClose: () => void;
    isDark?: boolean;
}

// Slash Menu Dropdown
const SlashMenu: React.FC<SlashMenuProps> = ({ query, position, onSelect, onClose, isDark = true }) => {
    const [assets, setAssets] = useState<StyleAsset[]>([]);
    const [filteredAssets, setFilteredAssets] = useState<StyleAsset[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Fetch library assets on mount
        const fetchAssets = async () => {
            try {
                const res = await fetch('http://localhost:3001/api/library');
                const data = await res.json();
                setAssets(data);
            } catch (e) {
                console.error('Failed to fetch library:', e);
            }
        };
        fetchAssets();
    }, []);

    useEffect(() => {
        // Filter assets based on query
        if (!query.trim()) {
            setFilteredAssets(assets.slice(0, 10));
        } else {
            const lowerQuery = query.toLowerCase();
            const filtered = assets.filter(asset =>
                asset.name.toLowerCase().includes(lowerQuery) ||
                asset.category.toLowerCase().includes(lowerQuery)
            ).slice(0, 10);
            setFilteredAssets(filtered);
        }
        setSelectedIndex(0);
    }, [query, assets]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(i => Math.min(i + 1, filteredAssets.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(i => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredAssets[selectedIndex]) {
                    onSelect(filteredAssets[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [filteredAssets, selectedIndex, onSelect, onClose]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    if (filteredAssets.length === 0) {
        return null;
    }

    // Group assets by category
    const grouped = filteredAssets.reduce((acc, asset) => {
        if (!acc[asset.category]) acc[asset.category] = [];
        acc[asset.category].push(asset);
        return acc;
    }, {} as Record<string, StyleAsset[]>);

    return (
        <div
            ref={menuRef}
            className={`absolute z-50 w-72 max-h-60 overflow-y-auto rounded-lg border shadow-xl ${
                isDark ? 'bg-[#1a1a1a] border-neutral-700' : 'bg-white border-neutral-200'
            }`}
            style={{ left: position.x, top: position.y }}
        >
            {Object.entries(grouped).map(([category, categoryAssets]) => (
                <div key={category}>
                    <div className={`px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider ${
                        isDark ? 'text-neutral-500' : 'text-neutral-400'
                    }`}>
                        {category}
                    </div>
                    {categoryAssets.map((asset) => {
                        const globalIndex = filteredAssets.indexOf(asset);
                        const fullUrl = asset.url.startsWith('http') ? asset.url : `http://localhost:3001${asset.url}`;
                        return (
                            <div
                                key={asset.id}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${
                                    globalIndex === selectedIndex
                                        ? isDark ? 'bg-neutral-700' : 'bg-neutral-100'
                                        : 'hover:bg-neutral-800'
                                }`}
                                onClick={() => onSelect(asset)}
                                onMouseEnter={() => setSelectedIndex(globalIndex)}
                            >
                                <img
                                    src={fullUrl}
                                    alt={asset.name}
                                    className="w-8 h-8 rounded object-cover shrink-0"
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.onerror = null;
                                        target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIHZpZXdCb3g9IjAgMCA4IDgiPjxjaXJjbGUgY3g9IjQiIGN5PSI0IiByPSIzIiBmaWxsPSIjNDQ0Ii8+PC9zdmc+';
                                    }}
                                />
                                <div className="min-w-0">
                                    <span className={`text-xs truncate block ${isDark ? 'text-neutral-200' : 'text-neutral-700'}`}>
                                        {asset.name}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

export const PromptEditor: React.FC<PromptEditorProps> = ({
    value,
    onChange,
    chips,
    onChipsChange,
    placeholder = 'Enter your prompt...',
    rows = 4,
    isDark = true,
    disabled = false,
    connectedStyleNodes = []
}) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [slashMenu, setSlashMenu] = useState<{
        query: string;
        position: { x: number; y: number };
    } | null>(null);
    const [slashQuery, setSlashQuery] = useState('');

    // Build the HTML content for the editor
    const buildEditorContent = useCallback(() => {
        const fragments: React.ReactNode[] = [];

        // Node-linked chips (locked, if connected)
        connectedStyleNodes.forEach((connectedStyleNode, index) => {
            const fullUrl = connectedStyleNode.resultUrl?.startsWith('http')
                ? connectedStyleNode.resultUrl
                : connectedStyleNode.resultUrl
                    ? `http://localhost:3001${connectedStyleNode.resultUrl}`
                    : '';
            fragments.push(
                <span
                    key={`node-linked-chip-${connectedStyleNode.id}`}
                    className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-full text-xs bg-amber-500/15 border border-amber-500/30 text-amber-300 cursor-default"
                >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    {fullUrl && <img src={fullUrl} className="w-3.5 h-3.5 rounded-full object-cover" alt="" />}
                    <span>{connectedStyleNode.title || 'Style'}</span>
                    <span className="text-[9px] text-amber-400/60">{connectedStyleNode.styleId}</span>
                </span>
            );
        });

        // Slash-command chips
        chips.forEach(chip => {
            const fullUrl = chip.thumbnailUrl?.startsWith('http')
                ? chip.thumbnailUrl
                : chip.thumbnailUrl
                    ? `http://localhost:3001${chip.thumbnailUrl}`
                    : '';
            fragments.push(
                <span
                    key={chip.id}
                    data-chip-id={chip.id}
                    className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-full text-xs bg-amber-400/15 border border-amber-400/30 text-amber-300 cursor-default chip-span"
                >
                    {fullUrl && <img src={fullUrl} className="w-3.5 h-3.5 rounded-full object-cover" alt="" />}
                    <span>{chip.name}</span>
                    {chip.styleId && <span className="text-[9px] text-amber-400/60">{chip.styleId}</span>}
                    <button
                        className="ml-0.5 text-amber-400/60 hover:text-amber-300 chip-remove"
                        data-chip-id={chip.id}
                        onClick={(e) => {
                            e.stopPropagation();
                            onChipsChange(chips.filter(c => c.id !== chip.id));
                        }}
                    >
                        ×
                    </button>
                </span>
            );
        });

        // Text content
        fragments.push(<span key="text-content">{value}</span>);

        return fragments;
    }, [value, chips, connectedStyleNodes, onChipsChange]);

    // Initialize editor content on mount
    useEffect(() => {
        if (editorRef.current && !editorRef.current.innerHTML) {
            editorRef.current.innerHTML = '';
            // Add a placeholder text node if empty
            if (!value && !chips.length && connectedStyleNodes.length === 0) {
                const placeholderSpan = document.createElement('span');
                placeholderSpan.className = 'text-neutral-500';
                placeholderSpan.textContent = placeholder;
                placeholderSpan.dataset.placeholder = 'true';
                editorRef.current.appendChild(placeholderSpan);
            }
        }
    }, []);

    // Rebuild content when value, chips, or connectedStyleNodes changes
    // Only do this when the editor is not focused to avoid disrupting user input
    useEffect(() => {
        if (editorRef.current && document.activeElement !== editorRef.current) {
            // Clear and rebuild
            editorRef.current.innerHTML = '';
            const container = editorRef.current;

            // Node-linked chips
            connectedStyleNodes.forEach((connectedStyleNode) => {
                const chipSpan = document.createElement('span');
                chipSpan.className = 'inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-full text-xs bg-amber-500/15 border border-amber-500/30 text-amber-300 cursor-default';
                const fullUrl = connectedStyleNode.resultUrl?.startsWith('http')
                    ? connectedStyleNode.resultUrl
                    : connectedStyleNode.resultUrl
                        ? `http://localhost:3001${connectedStyleNode.resultUrl}`
                        : '';
                chipSpan.innerHTML = `
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    ${fullUrl ? `<img src="${fullUrl}" class="w-3.5 h-3.5 rounded-full object-cover" />` : ''}
                    <span>${connectedStyleNode.title || 'Style'}</span>
                    <span class="text-[9px] text-amber-400/60">${connectedStyleNode.styleId || ''}</span>
                `;
                container.appendChild(chipSpan);
            });

            // Slash chips
            chips.forEach(chip => {
                const chipSpan = document.createElement('span');
                chipSpan.dataset.chipId = chip.id;
                chipSpan.className = 'inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-full text-xs bg-amber-400/15 border border-amber-400/30 text-amber-300 cursor-default chip-span';
                const fullUrl = chip.thumbnailUrl?.startsWith('http')
                    ? chip.thumbnailUrl
                    : chip.thumbnailUrl
                        ? `http://localhost:3001${chip.thumbnailUrl}`
                        : '';
                chipSpan.innerHTML = `
                    ${fullUrl ? `<img src="${fullUrl}" class="w-3.5 h-3.5 rounded-full object-cover" />` : ''}
                    <span>${chip.name}</span>
                    ${chip.styleId ? `<span class="text-[9px] text-amber-400/60">${chip.styleId}</span>` : ''}
                    <button class="ml-0.5 text-amber-400/60 hover:text-amber-300 chip-remove" data-chip-id="${chip.id}">×</button>
                `;
                container.appendChild(chipSpan);
            });

            // Text
            const textSpan = document.createElement('span');
            textSpan.textContent = value;
            container.appendChild(textSpan);
        }
    }, [value, chips, connectedStyleNodes]);

    // Handle input events
    const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const selection = window.getSelection();
        if (!selection || !selection.anchorNode) return;

        // Get the text content before the caret
        const textBeforeCaret = selection.anchorNode.textContent || '';
        const caretOffset = selection.anchorOffset;

        // Check if we're at a slash command position
        // Look backwards from caret to find a word boundary
        let slashStart = -1;
        for (let i = caretOffset - 1; i >= 0; i--) {
            if (textBeforeCaret[i] === '/') {
                slashStart = i;
                break;
            }
            if (textBeforeCaret[i] === ' ' || textBeforeCaret[i] === '\n') {
                break;
            }
        }

        if (slashStart >= 0) {
            // Extract the query after the slash
            const query = textBeforeCaret.substring(slashStart + 1, caretOffset);

            // Get caret position for menu
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const editorRect = target.getBoundingClientRect();

            setSlashMenu({
                query,
                position: {
                    x: rect.left - editorRect.left,
                    y: rect.bottom - editorRect.top + 4
                }
            });
            setSlashQuery(query);
        } else {
            setSlashMenu(null);
        }

        // Extract plain text (remove chip spans)
        const clone = target.cloneNode(true) as HTMLElement;
        const chipSpans = clone.querySelectorAll('[data-chip-id]');
        chipSpans.forEach(span => span.remove());
        const text = clone.innerText || '';

        onChange(text);
    }, [onChange]);

    // Handle slash menu selection
    const handleSlashSelect = useCallback((asset: StyleAsset) => {
        if (!editorRef.current) return;

        const selection = window.getSelection();
        if (!selection || !selection.anchorNode) return;

        // Find the slash in the text
        const textContent = editorRef.current.innerText || '';
        const caretOffset = selection.anchorOffset;

        // Find slash position before caret
        let slashStart = -1;
        for (let i = caretOffset - 1; i >= 0; i--) {
            if (textContent[i] === '/') {
                slashStart = i;
                break;
            }
            if (textContent[i] === ' ' || textContent[i] === '\n') {
                break;
            }
        }

        if (slashStart >= 0) {
            // Create the new chip
            const newChip: PromptChip = {
                id: crypto.randomUUID(),
                assetId: asset.id,
                name: asset.name,
                thumbnailUrl: asset.url,
                prompt: asset.prompt || '',
                source: 'slash',
                styleId: asset.styleId || asset.id.substring(0, 6).toUpperCase()
            };

            // Add to chips
            onChipsChange([...chips, newChip]);

            // Clear the slash and query from text
            const textNode = selection.anchorNode;
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                const text = textNode.textContent || '';
                const beforeSlash = text.substring(0, slashStart);
                const afterCaret = text.substring(caretOffset);
                textNode.textContent = beforeSlash + afterCaret;
            }

            setSlashMenu(null);
        }
    }, [chips, onChipsChange]);

    // Handle keydown for backspace on chips
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Backspace') {
            const selection = window.getSelection();
            if (!selection || !selection.anchorNode) return;

            // Check if cursor is right after a chip
            const node = selection.anchorNode;
            const offset = selection.anchorOffset;

            if (node && node.nodeType === Node.TEXT_NODE && offset > 0) {
                // Check if there's a chip element before the cursor
                const parent = node.parentElement;
                if (parent) {
                    const children = Array.from(parent.childNodes);
                    let charIndex = 0;
                    let chipFound = false;

                    for (let i = 0; i < children.length; i++) {
                        const child = children[i];
                        if (child === node) {
                            charIndex += offset;
                            break;
                        }
                        if (child.nodeType === Node.TEXT_NODE) {
                            charIndex += (child.textContent || '').length;
                        } else if (child instanceof HTMLElement && child.dataset.chipId) {
                            // Chip found before this text node
                            if (charIndex === offset || charIndex + (child.textContent || '').length >= offset) {
                                chipFound = true;
                                break;
                            }
                            charIndex += (child.textContent || '').length;
                        }
                    }

                    if (chipFound) {
                        // Remove the chip
                        const chipId = (node.previousSibling as HTMLElement)?.dataset?.chipId ||
                                      (node.parentElement?.querySelector(`[data-chip-id]`) as HTMLElement)?.dataset?.chipId;

                        if (chipId) {
                            onChipsChange(chips.filter(c => c.id !== chipId));
                        }
                    }
                }
            }
        }
    }, [chips, onChipsChange]);

    // Compute height based on rows
    const height = rows * 24 + 16; // ~24px per row + padding

    return (
        <div className="relative">
            <div
                ref={editorRef}
                contentEditable={!disabled}
                className={`w-full rounded-lg border p-2 overflow-y-auto outline-none transition-colors ${
                    isDark
                        ? 'bg-[#0f0f0f] border-neutral-700 text-neutral-200 focus:border-blue-500'
                        : 'bg-white border-neutral-300 text-neutral-900 focus:border-blue-500'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{ minHeight: `${height}px`, height: `${height}px` }}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                data-placeholder={placeholder}
            />

            {slashMenu && (
                <SlashMenu
                    query={slashQuery}
                    position={slashMenu.position}
                    onSelect={handleSlashSelect}
                    onClose={() => setSlashMenu(null)}
                    isDark={isDark}
                />
            )}
        </div>
    );
};
