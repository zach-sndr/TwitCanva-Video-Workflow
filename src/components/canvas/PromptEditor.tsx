/**
 * PromptEditor.tsx
 *
 * Clean prompt editor with slash commands and chips.
 * - Chips (node-linked and slash-command) rendered as pure React elements
 * - Standard controlled textarea for text input — no contentEditable
 * - Slash command '/' opens an asset picker dropdown
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { PromptChip, NodeData } from '../../types';
import { Expand, Shrink } from 'lucide-react';

interface StyleAsset {
    id: string;
    name: string;
    url: string;
    prompt?: string;
    styleId?: string;
    category: string;
}

interface PromptEditorProps {
    value: string;
    onChange: (text: string) => void;
    chips: PromptChip[];
    onChipsChange: (chips: PromptChip[]) => void;
    placeholder?: string;
    rows?: number;
    isDark?: boolean;
    disabled?: boolean;
    connectedStyleNodes?: NodeData[];
    isExpanded?: boolean;
    onToggleExpand?: () => void;
}

// ─── Slash Menu ───────────────────────────────────────────────────────────────

interface SlashMenuProps {
    query: string;
    onSelect: (asset: StyleAsset) => void;
    onClose: () => void;
    onNavigate: (index: number) => void;
    isDark?: boolean;
    assets: StyleAsset[];
    selectedIndex: number;
}

const SlashMenu: React.FC<SlashMenuProps> = ({
    query,
    onSelect,
    onClose,
    onNavigate,
    isDark = true,
    assets,
    selectedIndex,
}) => {
    const menuRef = useRef<HTMLDivElement>(null);

    const filtered = useMemo(() => {
        if (!query.trim()) return assets.slice(0, 10);
        const q = query.toLowerCase();
        return assets
            .filter(a => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q))
            .slice(0, 10);
    }, [query, assets]);

    // Close on outside mousedown (but menu items use preventDefault so this won't fire for them)
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    if (filtered.length === 0) return null;

    const grouped = filtered.reduce((acc, asset) => {
        if (!acc[asset.category]) acc[asset.category] = [];
        acc[asset.category].push(asset);
        return acc;
    }, {} as Record<string, StyleAsset[]>);

    return (
        <div
            ref={menuRef}
            className={`absolute bottom-full left-0 mb-1 z-50 w-72 max-h-60 overflow-y-auto rounded-lg border shadow-xl ${
                isDark ? 'bg-[#1a1a1a] border-neutral-700' : 'bg-white border-neutral-200'
            }`}
        >
            {Object.entries(grouped).map(([category, categoryAssets]) => (
                <div key={category}>
                    <div className={`px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider ${
                        isDark ? 'text-neutral-500' : 'text-neutral-400'
                    }`}>
                        {category}
                    </div>
                    {categoryAssets.map(asset => {
                        const globalIndex = filtered.indexOf(asset);
                        const fullUrl = asset.url.startsWith('http')
                            ? asset.url
                            : `http://localhost:3001${asset.url}`;
                        return (
                            <div
                                key={asset.id}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${
                                    globalIndex === selectedIndex
                                        ? isDark ? 'bg-neutral-700' : 'bg-neutral-100'
                                        : isDark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-50'
                                }`}
                                // Prevent textarea from losing focus on click
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => onSelect(asset)}
                                onMouseEnter={() => onNavigate(globalIndex)}
                            >
                                <img
                                    src={fullUrl}
                                    alt={asset.name}
                                    className="w-8 h-8 rounded object-cover shrink-0"
                                    onError={e => {
                                        const t = e.target as HTMLImageElement;
                                        t.onerror = null;
                                        t.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIHZpZXdCb3g9IjAgMCA4IDgiPjxjaXJjbGUgY3g9IjQiIGN5PSI0IiByPSIzIiBmaWxsPSIjNDQ0Ii8+PC9zdmc+';
                                    }}
                                />
                                <span className={`text-xs truncate ${isDark ? 'text-neutral-200' : 'text-neutral-700'}`}>
                                    {asset.name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

// ─── PromptEditor ─────────────────────────────────────────────────────────────

export const PromptEditor: React.FC<PromptEditorProps> = ({
    value,
    onChange,
    chips,
    onChipsChange,
    placeholder = 'Enter your prompt...',
    rows = 4,
    isDark = true,
    disabled = false,
    connectedStyleNodes = [],
    isExpanded = false,
    onToggleExpand,
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Slash menu state
    const [slashMenuOpen, setSlashMenuOpen] = useState(false);
    const [slashQuery, setSlashQuery] = useState('');
    const [slashStart, setSlashStart] = useState(-1);
    const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
    const [slashAssets, setSlashAssets] = useState<StyleAsset[]>([]);

    // Cursor restore after slash selection
    const pendingCursorRef = useRef<number | null>(null);

    // Fetch library assets once
    useEffect(() => {
        fetch('http://localhost:3001/api/library')
            .then(r => r.json())
            .then(setSlashAssets)
            .catch(console.error);
    }, []);

    // Restore cursor position after React re-renders the textarea value
    useEffect(() => {
        if (pendingCursorRef.current !== null && textareaRef.current) {
            const pos = pendingCursorRef.current;
            pendingCursorRef.current = null;
            // Use rAF to ensure the DOM has settled after the controlled value update
            requestAnimationFrame(() => {
                if (textareaRef.current) {
                    textareaRef.current.selectionStart = pos;
                    textareaRef.current.selectionEnd = pos;
                }
            });
        }
    }, [value]);

    // Filtered assets for the slash menu
    const filteredAssets = useMemo(() => {
        if (!slashQuery.trim()) return slashAssets.slice(0, 10);
        const q = slashQuery.toLowerCase();
        return slashAssets
            .filter(a => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q))
            .slice(0, 10);
    }, [slashQuery, slashAssets]);

    // ── Text change handler ────────────────────────────────────────────────────
    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        const pos = e.target.selectionStart ?? text.length;

        // Detect slash command: walk backwards from cursor looking for '/'
        let found = -1;
        for (let i = pos - 1; i >= 0; i--) {
            if (text[i] === '/') {
                found = i;
                break;
            }
            if (text[i] === ' ' || text[i] === '\n') break;
        }

        if (found >= 0) {
            const query = text.substring(found + 1, pos);
            setSlashStart(found);
            setSlashQuery(query);
            setSlashSelectedIndex(0);
            setSlashMenuOpen(true);
        } else {
            setSlashMenuOpen(false);
            setSlashStart(-1);
        }

        onChange(text);
    }, [onChange]);

    // ── Auto-eject slash chips that are superseded by a node chip ─────────────
    // Runs whenever connectedStyleNodes changes. Node chips have priority: if a
    // slash chip represents the same style as a connected node, remove it.
    useEffect(() => {
        if (chips.length === 0) return;
        const nodeStyleIds = new Set(
            connectedStyleNodes.map(n => n.styleId).filter((id): id is string => Boolean(id))
        );
        if (nodeStyleIds.size === 0) return;
        const kept = chips.filter(c => !c.styleId || !nodeStyleIds.has(c.styleId));
        if (kept.length !== chips.length) {
            onChipsChange(kept);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectedStyleNodes]);

    // ── Slash asset selection ──────────────────────────────────────────────────
    const handleSlashSelect = useCallback((asset: StyleAsset) => {
        if (slashStart < 0 || !textareaRef.current) return;

        const pos = textareaRef.current.selectionStart ?? value.length;
        // Always remove the slash+query from the text, regardless of dedup result
        const newText = value.substring(0, slashStart) + value.substring(pos);
        pendingCursorRef.current = slashStart;

        // Dedup check 1: same slash chip already exists (by assetId)
        const alreadySlash = chips.some(c => c.assetId === asset.id);
        // Dedup check 2: a connected node chip already covers this style (node wins)
        const assetStyleId = asset.styleId || asset.id.substring(0, 6).toUpperCase();
        const alreadyNode = connectedStyleNodes.some(
            n => n.styleId && n.styleId === assetStyleId
        );

        if (!alreadySlash && !alreadyNode) {
            const newChip: PromptChip = {
                id: crypto.randomUUID(),
                assetId: asset.id,
                name: asset.name,
                thumbnailUrl: asset.url,
                prompt: asset.prompt || '',
                source: 'slash',
                styleId: assetStyleId,
            };
            onChipsChange([...chips, newChip]);
        }

        onChange(newText);
        setSlashMenuOpen(false);
        setSlashStart(-1);
        textareaRef.current.focus();
    }, [slashStart, value, chips, connectedStyleNodes, onChange, onChipsChange]);

    // ── Keyboard handler ───────────────────────────────────────────────────────
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Always stop canvas-level shortcuts from firing while typing
        e.stopPropagation();

        if (slashMenuOpen) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSlashSelectedIndex(i => Math.min(i + 1, filteredAssets.length - 1));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSlashSelectedIndex(i => Math.max(i - 1, 0));
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredAssets[slashSelectedIndex]) {
                    handleSlashSelect(filteredAssets[slashSelectedIndex]);
                }
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setSlashMenuOpen(false);
                return;
            }
        }
    }, [slashMenuOpen, filteredAssets, slashSelectedIndex, handleSlashSelect]);

    // ── Chip removal ───────────────────────────────────────────────────────────
    const removeChip = useCallback((chipId: string) => {
        onChipsChange(chips.filter(c => c.id !== chipId));
    }, [chips, onChipsChange]);

    const hasChips = chips.length > 0 || connectedStyleNodes.length > 0;

    return (
        <div className="relative">
            <div
                className={`rounded-md overflow-hidden backdrop-blur-sm transition-colors ${
                    isDark
                        ? 'bg-black/35 focus-within:bg-black/45'
                        : 'bg-white/75 focus-within:bg-white/85'
                }`}
            >
                {/* Chips row — only rendered when chips exist */}
                {hasChips && (
                    <div className="flex flex-wrap gap-1 px-2 pt-2">
                        {/* Node-linked chips (immutable) */}
                        {connectedStyleNodes.map(node => {
                            const fullUrl = node.resultUrl?.startsWith('http')
                                ? node.resultUrl
                                : node.resultUrl
                                    ? `http://localhost:3001${node.resultUrl}`
                                    : '';
                            return (
                                <span
                                    key={node.id}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs bg-amber-500/15 border border-amber-500/30 text-amber-300 select-none"
                                >
                                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    {fullUrl && (
                                        <img
                                            src={fullUrl}
                                            className="w-3.5 h-3.5 rounded-full object-cover"
                                            alt=""
                                        />
                                    )}
                                    <span>{node.title || 'Style'}</span>
                                    {node.styleId && (
                                        <span className="text-[9px] text-amber-400/60">{node.styleId}</span>
                                    )}
                                </span>
                            );
                        })}

                        {/* Slash-command chips (removable) */}
                        {chips.map(chip => {
                            const fullUrl = chip.thumbnailUrl?.startsWith('http')
                                ? chip.thumbnailUrl
                                : chip.thumbnailUrl
                                    ? `http://localhost:3001${chip.thumbnailUrl}`
                                    : '';
                            return (
                                <span
                                    key={chip.id}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs bg-amber-400/15 border border-amber-400/30 text-amber-300 select-none"
                                >
                                    {fullUrl && (
                                        <img
                                            src={fullUrl}
                                            className="w-3.5 h-3.5 rounded-full object-cover"
                                            alt=""
                                        />
                                    )}
                                    <span>{chip.name}</span>
                                    {chip.styleId && (
                                        <span className="text-[9px] text-amber-400/60">{chip.styleId}</span>
                                    )}
                                    <button
                                        type="button"
                                        className="ml-0.5 leading-none text-amber-400/60 hover:text-amber-200 transition-colors"
                                        // Prevent textarea blur on click
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => removeChip(chip.id)}
                                    >
                                        ×
                                    </button>
                                </span>
                            );
                        })}
                    </div>
                )}

                {/* Text input */}
                <div className="flex items-stretch">
                    <textarea
                        ref={textareaRef}
                        value={value}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        placeholder={placeholder}
                        rows={rows}
                        className={`flex-1 px-2 py-2 bg-transparent outline-none resize-none text-sm ${
                            isDark
                                ? 'text-neutral-200 placeholder:text-neutral-500'
                                : 'text-neutral-900 placeholder:text-neutral-400'
                        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                    {onToggleExpand && (
                        <button
                            onClick={onToggleExpand}
                            className={`flex items-center justify-center px-2 transition-colors ${
                                isDark
                                    ? 'text-white/50 hover:text-white hover:bg-white/10'
                                    : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200'
                            }`}
                            title={isExpanded ? 'Shrink prompt' : 'Expand prompt'}
                        >
                            {isExpanded ? <Shrink size={14} /> : <Expand size={14} />}
                        </button>
                    )}
                </div>
            </div>

            {/* Slash menu — positioned above the editor */}
            {slashMenuOpen && (
                <SlashMenu
                    query={slashQuery}
                    onSelect={handleSlashSelect}
                    onClose={() => setSlashMenuOpen(false)}
                    onNavigate={setSlashSelectedIndex}
                    isDark={isDark}
                    assets={slashAssets}
                    selectedIndex={slashSelectedIndex}
                />
            )}
        </div>
    );
};
