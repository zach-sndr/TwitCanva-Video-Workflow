/**
 * TopBar.tsx
 * 
 * Top navigation bar component with canvas title, save button, and other controls.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Save, Folder, Clock, X, KeyRound, Settings, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMenuSounds } from '../hooks/useMenuSounds';

interface RecentWorkflow {
    id: string;
    title: string;
    updatedAt: string;
    nodeCount: number;
    coverUrl?: string;
}

interface TopBarProps {
    // Title
    canvasTitle: string;
    isEditingTitle: boolean;
    editingTitleValue: string;
    canvasTitleInputRef: React.RefObject<HTMLInputElement>;
    setCanvasTitle: (title: string) => void;
    setIsEditingTitle: (editing: boolean) => void;
    setEditingTitleValue: (value: string) => void;
    // Actions
    onSave: () => void | Promise<void>;
    onNew: () => void;
    hasUnsavedChanges: boolean;
    // Autosave
    lastAutoSaveTime?: number;
    onAutoSave?: () => void | Promise<void>;
    // Layout
    isChatOpen?: boolean;
    // API Providers
    onOpenApiProviders: () => void;
    // Theme
    canvasTheme: 'dark' | 'light';
    onToggleTheme: () => void;
    // Workflows
    onLoadWorkflow?: (id: string) => void;
    onDeleteWorkflow?: (id: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
    canvasTitle,
    isEditingTitle,
    editingTitleValue,
    canvasTitleInputRef,
    setCanvasTitle,
    setIsEditingTitle,
    setEditingTitleValue,
    onSave,
    onNew,
    hasUnsavedChanges,
    lastAutoSaveTime,
    onAutoSave,
    isChatOpen = false,
    onOpenApiProviders,
    canvasTheme,
    onToggleTheme,
    onLoadWorkflow,
    onDeleteWorkflow
}) => {
    const [showNewConfirm, setShowNewConfirm] = useState(false);
    const [showSavedStatus, setShowSavedStatus] = useState(false);
    const [isRecentOpen, setIsRecentOpen] = useState(false);
    const [recentWorkflows, setRecentWorkflows] = useState<RecentWorkflow[]>([]);
    const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [hoveredSettingsItem, setHoveredSettingsItem] = useState<string | null>(null);
    const logoRef = useRef<HTMLDivElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const { playClickSound, playHoverSound } = useMenuSounds();

    // Fetch recent workflows when dropdown opens
    useEffect(() => {
        if (isRecentOpen && recentWorkflows.length === 0 && !isLoadingWorkflows) {
            setIsLoadingWorkflows(true);
            fetch('http://localhost:3001/api/workflows/recent?limit=10')
                .then(res => res.json())
                .then(data => {
                    setRecentWorkflows(Array.isArray(data) ? data : []);
                    setIsLoadingWorkflows(false);
                })
                .catch(err => {
                    console.error('Failed to load recent workflows:', err);
                    setIsLoadingWorkflows(false);
                });
        }
    }, [isRecentOpen]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (logoRef.current && !logoRef.current.contains(e.target as Node)) {
                setIsRecentOpen(false);
            }
            if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
                setIsSettingsOpen(false);
            }
        };

        if (isRecentOpen || isSettingsOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isRecentOpen, isSettingsOpen]);

    const handleDeleteWorkflow = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (onDeleteWorkflow) {
            onDeleteWorkflow(id);
            setRecentWorkflows(prev => prev.filter(w => w.id !== id));
        }
    };

    const handleTitleBlur = () => {
        if (editingTitleValue.trim()) {
            setCanvasTitle(editingTitleValue.trim());
        } else {
            setEditingTitleValue(canvasTitle);
        }
        setIsEditingTitle(false);
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (editingTitleValue.trim()) {
                setCanvasTitle(editingTitleValue.trim());
            }
            setIsEditingTitle(false);
        } else if (e.key === 'Escape') {
            setEditingTitleValue(canvasTitle);
            setIsEditingTitle(false);
        }
    };

    const handleTitleDoubleClick = () => {
        setEditingTitleValue(canvasTitle);
        setIsEditingTitle(true);
    };

    const handleNewClick = () => {
        if (hasUnsavedChanges) {
            setShowNewConfirm(true);
        } else {
            onNew();
        }
    };

    const handleSaveAndNew = async () => {
        try {
            await onSave();
            setShowNewConfirm(false);
            onNew();
        } catch (error) {
            console.error("Failed to save and new:", error);
        }
    };

    const handleDiscardAndNew = () => {
        setShowNewConfirm(false);
        onNew();
    };

    return (
        <>
            <div
                className="fixed top-0 left-0 h-14 flex items-center justify-between px-6 z-50 pointer-events-none transition-all duration-300"
                style={{ width: isChatOpen ? 'calc(100% - 400px)' : '100%' }}
            >
                {/* Left: Logo & Title */}
                <div className="flex items-center gap-4 pointer-events-auto">
                    {/* Logo with Recent Projects Dropdown */}
                    <div className="relative" ref={logoRef}>
                        <button
                            onClick={() => {
                                playClickSound();
                                setIsRecentOpen(!isRecentOpen);
                            }}
                            className="block hover:opacity-80 transition-opacity"
                        >
                            <img src="/TwitCanva-logo.png" alt="TwitCanva Logo" className="w-8 h-8 object-contain bg-black/20" />
                        </button>

                        {/* Recent Projects Dropdown */}
                        <AnimatePresence>
                            {isRecentOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0, filter: 'blur(4px)' }}
                                    animate={{ height: 'auto', opacity: 1, filter: 'blur(0)' }}
                                    exit={{ height: 0, opacity: 0, filter: 'blur(4px)' }}
                                    transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                                    className="absolute left-0 top-12 w-80 border border-white/0 bg-black/40 backdrop-blur-xl overflow-hidden font-pixel z-50"
                                >
                                    <div className="p-0.5 flex flex-col gap-0 max-h-[400px] overflow-y-auto">
                                        <div className="px-3 py-2 border-b border-white/10">
                                            <p className="text-sm font-medium text-white">Recent Projects</p>
                                            <p className="text-xs text-neutral-500">Click to switch project</p>
                                        </div>

                                        {isLoadingWorkflows ? (
                                            <div className="px-3 py-4 text-center text-neutral-500">
                                                Loading...
                                            </div>
                                        ) : recentWorkflows.length === 0 ? (
                                            <div className="px-3 py-4 text-center text-neutral-500">
                                                No recent projects
                                            </div>
                                        ) : (
                                            recentWorkflows.map(workflow => (
                                                <div
                                                    key={workflow.id}
                                                    onClick={() => {
                                                        playClickSound();
                                                        onLoadWorkflow?.(workflow.id);
                                                        setIsRecentOpen(false);
                                                    }}
                                                    onMouseEnter={() => playHoverSound()}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer text-white hover:bg-white/10"
                                                >
                                                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-neutral-800">
                                                        {workflow.coverUrl ? (
                                                            <img src={workflow.coverUrl} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <Folder size={18} className="text-neutral-500" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-left flex-1 min-w-0">
                                                        <p className="text-sm truncate text-neutral-200 hover:text-white">
                                                            {workflow.title || 'Untitled'}
                                                        </p>
                                                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                                                            <Clock size={10} />
                                                            <span>{new Date(workflow.updatedAt).toLocaleDateString()}</span>
                                                            <span>•</span>
                                                            <span>{workflow.nodeCount} nodes</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={(e) => handleDeleteWorkflow(e, workflow.id)}
                                                        className="p-1.5 rounded-full opacity-0 hover:opacity-100 transition-opacity hover:bg-neutral-700 text-neutral-500 hover:text-red-400"
                                                        title="Delete project"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {isEditingTitle ? (
                        <input
                            ref={canvasTitleInputRef as React.RefObject<HTMLInputElement>}
                            type="text"
                            value={editingTitleValue}
                            onChange={(e) => setEditingTitleValue(e.target.value)}
                            onBlur={handleTitleBlur}
                            onKeyDown={handleTitleKeyDown}
                            className="font-semibold text-neutral-300 bg-transparent border-b border-blue-500 outline-none min-w-[100px]"
                        />
                    ) : (
                        <span
                            className={`font-semibold cursor-pointer transition-colors ${canvasTheme === 'dark' ? 'text-neutral-300 hover:text-white' : 'text-neutral-900 hover:text-neutral-600'}`}
                            onDoubleClick={handleTitleDoubleClick}
                            title="Double-click to rename"
                        >
                            {canvasTitle}
                        </span>
                    )}
                </div>

                {/* Right: Actions - Settings Menu */}
                <div className="flex items-center gap-3 pointer-events-auto">
                    {/* Settings Button */}
                    <div className="relative" ref={settingsRef}>
                        <button
                            onClick={() => {
                                playClickSound();
                                setIsSettingsOpen(!isSettingsOpen);
                            }}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${canvasTheme === 'dark'
                                ? 'bg-transparent text-neutral-400 hover:text-white hover:bg-white/10'
                                : 'bg-transparent text-neutral-500 hover:text-neutral-800 hover:bg-black/5'
                                } ${isSettingsOpen ? 'bg-white/10 text-white' : ''}`}
                            title="Settings"
                        >
                            <Settings size={18} />
                        </button>

                        {/* Settings Dropdown Menu */}
                        <AnimatePresence>
                            {isSettingsOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0, filter: 'blur(4px)' }}
                                    animate={{ height: 'auto', opacity: 1, filter: 'blur(0)' }}
                                    exit={{ height: 0, opacity: 0, filter: 'blur(4px)' }}
                                    transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                                    className="absolute right-0 top-12 w-56 border border-white/0 bg-black/40 backdrop-blur-xl overflow-hidden font-pixel z-50"
                                >
                                    <div className="p-0.5 flex flex-col gap-0">
                                        {/* Autosave Status */}
                                        {lastAutoSaveTime ? (
                                            <div className="px-3 py-2.5 text-xs text-white/50 flex items-center gap-2">
                                                <Clock size={12} />
                                                <span>Last saved: {new Date(lastAutoSaveTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        ) : onAutoSave ? (
                                            <button
                                                onClick={() => {
                                                    playClickSound();
                                                    onAutoSave();
                                                }}
                                                onMouseEnter={() => {
                                                    setHoveredSettingsItem('autosave');
                                                    playHoverSound();
                                                }}
                                                onMouseLeave={() => setHoveredSettingsItem(null)}
                                                className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left ${
                                                    hoveredSettingsItem === 'autosave'
                                                        ? 'bg-white text-black'
                                                        : 'text-white hover:bg-white/10'
                                                }`}
                                            >
                                                <Clock size={14} />
                                                <span className="text-xs">Save now</span>
                                            </button>
                                        ) : null}

                                        {(lastAutoSaveTime || onAutoSave) && <div className="border-t border-white/10 mx-1 my-1" />}

                                        {/* Save */}
                                        <button
                                            onClick={async () => {
                                                playClickSound();
                                                await onSave();
                                                setShowSavedStatus(true);
                                                setTimeout(() => {
                                                    setShowSavedStatus(false);
                                                }, 1500);
                                            }}
                                            onMouseEnter={() => {
                                                setHoveredSettingsItem('save');
                                                playHoverSound();
                                            }}
                                            onMouseLeave={() => setHoveredSettingsItem(null)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left ${
                                                hoveredSettingsItem === 'save'
                                                    ? 'bg-white text-black'
                                                    : showSavedStatus
                                                        ? 'text-green-400'
                                                        : 'text-white hover:bg-white/10'
                                            }`}
                                        >
                                            <Save size={14} />
                                            <span className="text-xs">{showSavedStatus ? 'Saved successfully' : 'Save'}</span>
                                        </button>

                                        {/* New */}
                                        <button
                                            onClick={() => {
                                                playClickSound();
                                                handleNewClick();
                                                setIsSettingsOpen(false);
                                            }}
                                            onMouseEnter={() => {
                                                setHoveredSettingsItem('new');
                                                playHoverSound();
                                            }}
                                            onMouseLeave={() => setHoveredSettingsItem(null)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left ${
                                                hoveredSettingsItem === 'new'
                                                    ? 'bg-white text-black'
                                                    : 'text-white hover:bg-white/10'
                                            }`}
                                        >
                                            <Plus size={14} />
                                            <span className="text-xs">New</span>
                                        </button>

                                        <div className="border-t border-white/10 mx-1 my-1" />

                                        {/* API Providers */}
                                        <button
                                            onClick={() => {
                                                playClickSound();
                                                onOpenApiProviders();
                                                setIsSettingsOpen(false);
                                            }}
                                            onMouseEnter={() => {
                                                setHoveredSettingsItem('api');
                                                playHoverSound();
                                            }}
                                            onMouseLeave={() => setHoveredSettingsItem(null)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left ${
                                                hoveredSettingsItem === 'api'
                                                    ? 'bg-white text-black'
                                                    : 'text-white hover:bg-white/10'
                                            }`}
                                        >
                                            <KeyRound size={14} />
                                            <span className="text-xs">API Providers</span>
                                        </button>

                                        {/* Theme Toggle */}
                                        <button
                                            onClick={() => {
                                                playClickSound();
                                                onToggleTheme();
                                                setIsSettingsOpen(false);
                                            }}
                                            onMouseEnter={() => {
                                                setHoveredSettingsItem('theme');
                                                playHoverSound();
                                            }}
                                            onMouseLeave={() => setHoveredSettingsItem(null)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left ${
                                                hoveredSettingsItem === 'theme'
                                                    ? 'bg-white text-black'
                                                    : 'text-white hover:bg-white/10'
                                            }`}
                                        >
                                            {canvasTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                                            <span className="text-xs">{canvasTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Unsaved Changes Confirmation Modal */}
            {showNewConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]">
                    <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 w-[400px] shadow-2xl">
                        <h3 className="text-lg font-semibold text-white mb-2">Unsaved Changes</h3>
                        <p className="text-neutral-400 text-sm mb-6">
                            You have unsaved changes. Would you like to save before creating a new canvas?
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowNewConfirm(false)}
                                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDiscardAndNew}
                                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm transition-colors"
                            >
                                Discard
                            </button>
                            <button
                                onClick={handleSaveAndNew}
                                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm transition-colors flex items-center gap-2"
                            >
                                Save & New
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
