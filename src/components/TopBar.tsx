/**
 * TopBar.tsx
 * 
 * Top navigation bar component with canvas title, save button, and other controls.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Save, Loader2, Folder, Clock, X } from 'lucide-react';

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
    lastAutoSaveTime?: number;
    // Layout
    isChatOpen?: boolean;
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
    isChatOpen = false,
    canvasTheme,
    onToggleTheme,
    onLoadWorkflow,
    onDeleteWorkflow
}) => {
    const [showNewConfirm, setShowNewConfirm] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isRecentOpen, setIsRecentOpen] = useState(false);
    const [recentWorkflows, setRecentWorkflows] = useState<RecentWorkflow[]>([]);
    const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
    const logoRef = useRef<HTMLDivElement>(null);

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
        };

        if (isRecentOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isRecentOpen]);

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
            setIsSaving(true);
            await onSave();
            setShowNewConfirm(false);
            onNew();
        } catch (error) {
            console.error("Failed to save and new:", error);
        } finally {
            setIsSaving(false);
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
                <div className="flex items-center gap-3 pointer-events-auto">
                    {/* Logo with Recent Projects Dropdown */}
                    <div className="relative" ref={logoRef}>
                        <button
                            onClick={() => setIsRecentOpen(!isRecentOpen)}
                            className="block hover:opacity-80 transition-opacity"
                        >
                            <img src="/TwitCanva-logo.png" alt="TwitCanva Logo" className="w-8 h-8 rounded-lg object-contain bg-black/20" />
                        </button>

                        {/* Recent Projects Dropdown */}
                        {isRecentOpen && (
                            <div className={`absolute left-0 top-12 rounded-lg shadow-2xl py-2 min-w-[300px] max-h-[400px] overflow-y-auto z-50 ${canvasTheme === 'dark' ? 'bg-[#1a1a1a] border border-neutral-700' : 'bg-white border border-neutral-200'}`}>
                                <div className={`px-3 py-2 border-b ${canvasTheme === 'dark' ? 'border-neutral-700' : 'border-neutral-200'}`}>
                                    <p className={`text-sm font-medium ${canvasTheme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>Recent Projects</p>
                                    <p className={`text-xs ${canvasTheme === 'dark' ? 'text-neutral-500' : 'text-neutral-400'}`}>Click to switch project</p>
                                </div>

                                {isLoadingWorkflows ? (
                                    <div className={`px-3 py-4 text-center ${canvasTheme === 'dark' ? 'text-neutral-500' : 'text-neutral-400'}`}>
                                        Loading...
                                    </div>
                                ) : recentWorkflows.length === 0 ? (
                                    <div className={`px-3 py-4 text-center ${canvasTheme === 'dark' ? 'text-neutral-500' : 'text-neutral-400'}`}>
                                        No recent projects
                                    </div>
                                ) : (
                                    recentWorkflows.map(workflow => (
                                        <div
                                            key={workflow.id}
                                            onClick={() => {
                                                onLoadWorkflow?.(workflow.id);
                                                setIsRecentOpen(false);
                                            }}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors group cursor-pointer ${canvasTheme === 'dark' ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'}`}
                                        >
                                            <div className={`w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 ${canvasTheme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-200'}`}>
                                                {workflow.coverUrl ? (
                                                    <img src={workflow.coverUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Folder size={18} className={canvasTheme === 'dark' ? 'text-neutral-500' : 'text-neutral-400'} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-left flex-1 min-w-0">
                                                <p className={`text-sm truncate ${canvasTheme === 'dark' ? 'text-neutral-200 group-hover:text-white' : 'text-neutral-700 group-hover:text-neutral-900'}`}>
                                                    {workflow.title || 'Untitled'}
                                                </p>
                                                <div className={`flex items-center gap-2 text-xs ${canvasTheme === 'dark' ? 'text-neutral-500' : 'text-neutral-400'}`}>
                                                    <Clock size={10} />
                                                    <span>{new Date(workflow.updatedAt).toLocaleDateString()}</span>
                                                    <span>•</span>
                                                    <span>{workflow.nodeCount} nodes</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => handleDeleteWorkflow(e, workflow.id)}
                                                className={`p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${canvasTheme === 'dark' ? 'hover:bg-neutral-700 text-neutral-500 hover:text-red-400' : 'hover:bg-neutral-200 text-neutral-400 hover:text-red-500'}`}
                                                title="Delete project"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
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

                {/* Right: Actions */}
                <div className="flex items-center gap-3 pointer-events-auto">
                    {/* Auto-save notification - before save button */}
                    {lastAutoSaveTime && !hasUnsavedChanges && (
                        <div className={`text-[10px] font-medium px-2 py-1 rounded border animate-in fade-in duration-500 ${canvasTheme === 'dark'
                            ? 'text-neutral-500 border-neutral-800'
                            : 'text-neutral-400 border-neutral-100'
                            }`}>
                            Auto-saved {new Date(lastAutoSaveTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    )}
                    <button
                        onClick={() => onSave()}
                        className={`text-sm px-5 py-2.5 rounded-full flex items-center gap-2 transition-colors font-medium border ${canvasTheme === 'dark'
                            ? 'bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-600'
                            : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-900 border-neutral-300 shadow-sm'
                            }`}
                    >
                        <Save size={16} />
                        Save
                    </button>
                    <button
                        onClick={handleNewClick}
                        className={`text-sm px-4 py-2.5 rounded-full flex items-center gap-2 transition-colors font-medium border ${canvasTheme === 'dark'
                            ? 'bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-600'
                            : 'bg-neutral-200 hover:bg-neutral-300 text-neutral-900 border-neutral-300'
                            }`}
                    >
                        <Plus size={16} />
                        New
                    </button>
                    <button
                        onClick={onToggleTheme}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border ${canvasTheme === 'dark'
                            ? 'bg-neutral-900 border-neutral-700 text-yellow-400 hover:bg-neutral-800'
                            : 'bg-white border-neutral-200 text-orange-500 hover:bg-neutral-50 shadow-sm'
                            }`}
                        title={canvasTheme === 'dark' ? "Switch to Day Mode" : "Switch to Night Mode"}
                    >
                        {canvasTheme === 'dark' ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                        )}
                    </button>
                </div>
            </div>

            {/* Unsaved Changes Confirmation Modal */}
            {showNewConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]">
                    <div className="bg-[#1a1a1a] border border-neutral-700 rounded-2xl p-6 w-[400px] shadow-2xl">
                        <h3 className="text-lg font-semibold text-white mb-2">Unsaved Changes</h3>
                        <p className="text-neutral-400 text-sm mb-6">
                            You have unsaved changes. Would you like to save before creating a new canvas?
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowNewConfirm(false)}
                                disabled={isSaving}
                                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDiscardAndNew}
                                disabled={isSaving}
                                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Discard
                            </button>
                            <button
                                onClick={handleSaveAndNew}
                                disabled={isSaving}
                                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    'Save & New'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
