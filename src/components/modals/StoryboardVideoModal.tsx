/**
 * StoryboardVideoModal.tsx
 * 
 * Modal for batch generating videos from storyboard scene images.
 * Allows users to write/generate prompts for each scene and configure video settings.
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Film, Loader2, Play, Check, ChevronDown, Wand2 } from 'lucide-react';
import { NodeData } from '../../types';
import { GoogleIcon, KlingIcon, HailuoIcon } from '../icons/BrandIcons';

interface StoryboardVideoModalProps {
    isOpen: boolean;
    onClose: () => void;
    scenes: NodeData[];
    onCreateVideos: (
        prompts: Record<string, string>,
        settings: {
            model: string;
            duration: number;
            resolution: string;
        }
    ) => void;
}

const VIDEO_MODELS = [
    { id: 'veo-3.1', name: 'Veo 3.1', provider: 'google', durations: [4, 6, 8] },
    { id: 'kling-v2-1', name: 'Kling V2.1', provider: 'kling', recommended: true, durations: [5, 10] },
    { id: 'kling-v2-1-master', name: 'Kling V2.1 Master', provider: 'kling', durations: [5, 10] },
    { id: 'kling-v2-5-turbo', name: 'Kling V2.5 Turbo', provider: 'kling', durations: [5, 10] },
    { id: 'kling-v2-6', name: 'Kling 2.6 (Motion)', provider: 'kling', durations: [5, 10] },
    { id: 'hailuo-2.3', name: 'Hailuo 2.3', provider: 'hailuo', durations: [5] },
    { id: 'hailuo-2.3-fast', name: 'Hailuo 2.3 Fast', provider: 'hailuo', durations: [5] },
    { id: 'hailuo-02', name: 'Hailuo 02', provider: 'hailuo', durations: [5] },
];

export const StoryboardVideoModal: React.FC<StoryboardVideoModalProps> = ({
    isOpen,
    onClose,
    scenes,
    onCreateVideos
}) => {
    // Sort scenes by X position to maintain story order
    const sortedScenes = [...scenes].sort((a, b) => a.x - b.x);

    const [prompts, setPrompts] = useState<Record<string, string>>({});
    const [settings, setSettings] = useState({
        model: 'veo-3.1',
        duration: 5,
        resolution: '1080p' // Default for Veo
    });
    const [generatingPrompts, setGeneratingPrompts] = useState<Record<string, boolean>>({});
    const [optimizingPrompts, setOptimizingPrompts] = useState<Record<string, boolean>>({});
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const modelDropdownRef = useRef<HTMLDivElement>(null);

    // Initial settings sync
    useEffect(() => {
        // Ensure duration is valid for initial model
        const model = VIDEO_MODELS.find(m => m.id === settings.model);
        if (model && !model.durations.includes(settings.duration)) {
            setSettings(prev => ({ ...prev, duration: model.durations[0] }));
        }
    }, []); // Only run once on mount

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
                setShowModelDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Initialize prompts with existing node prompts or empty
    useEffect(() => {
        if (isOpen) {
            const initialPrompts: Record<string, string> = {};
            sortedScenes.forEach(scene => {
                // If the scene prompt is an "Extract panel" command, we probably want a fresh description
                // If it's a creative prompt, use it
                if (scene.prompt && !scene.prompt.startsWith('Extract panel')) {
                    initialPrompts[scene.id] = scene.prompt;
                } else {
                    initialPrompts[scene.id] = '';
                }
            });
            setPrompts(initialPrompts);
        }
    }, [isOpen, scenes]);

    // Handle single prompt generation using Gemini
    const handleGeneratePrompt = async (nodeId: string) => {
        const scene = scenes.find(s => s.id === nodeId);
        if (!scene || !scene.resultUrl) return;

        setGeneratingPrompts(prev => ({ ...prev, [nodeId]: true }));

        try {
            // Using a simple text generation endpoint that supports image input
            // We'll treat this as "Describe this image for video generation"
            const response = await fetch('/api/gemini/describe-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl: scene.resultUrl,
                    prompt: "Describe this image in detail to be used as a prompt for video generation. Focus on the action, movement, and atmosphere. Keep it under 50 words."
                })
            });

            if (!response.ok) throw new Error('Failed to generate prompt');

            const data = await response.json();
            setPrompts(prev => ({ ...prev, [nodeId]: data.description }));
        } catch (error) {
            console.error('Prompt generation failed:', error);
            // Fallback or error notification could go here
        } finally {
            setGeneratingPrompts(prev => ({ ...prev, [nodeId]: false }));
        }
    };

    // Handle optimizing manually entered prompts using Gemini
    const handleOptimizePrompt = async (nodeId: string) => {
        const currentPrompt = prompts[nodeId];
        if (!currentPrompt) return; // Nothing to optimize

        setOptimizingPrompts(prev => ({ ...prev, [nodeId]: true }));

        try {
            const response = await fetch('/api/gemini/optimize-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: currentPrompt
                })
            });

            if (!response.ok) throw new Error('Failed to optimize prompt');

            const data = await response.json();
            setPrompts(prev => ({ ...prev, [nodeId]: data.optimizedPrompt }));
        } catch (error) {
            console.error('Prompt optimization failed:', error);
            // Fallback or error notification could go here
        } finally {
            setOptimizingPrompts(prev => ({ ...prev, [nodeId]: false }));
        }
    };

    const handleModelChange = (modelId: string) => {
        const newModel = VIDEO_MODELS.find(m => m.id === modelId);
        if (!newModel) return;

        setSettings(prev => ({
            ...prev,
            model: modelId,
            // Reset duration if not supported
            duration: newModel.durations.includes(prev.duration) ? prev.duration : newModel.durations[0]
        }));
        setShowModelDropdown(false);
    };

    const currentModel = VIDEO_MODELS.find(m => m.id === settings.model) || VIDEO_MODELS[0];

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

            {/* Modal */}
            <div className="relative bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-neutral-800 flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-[#1a1a1a] z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
                            <Film size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Create Story Videos</h2>
                            <p className="text-xs text-neutral-500">Generate video clips for each scene</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-500 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content - Scrollable List of Scenes */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {sortedScenes.map((scene, index) => (
                        <div key={scene.id} className="flex gap-4 bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 hover:border-neutral-700 transition-colors">
                            {/* Scene Image Helper */}
                            <div className="w-48 aspect-video bg-black rounded-lg overflow-hidden border border-neutral-800 shrink-0 relative group">
                                {scene.resultUrl ? (
                                    <img src={scene.resultUrl} alt={`Scene ${index + 1}`} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-neutral-700">No Image</div>
                                )}
                                <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-[10px] font-medium text-white border border-white/10">
                                    Scene {index + 1}
                                </div>
                            </div>

                            {/* Prompt Input Area */}
                            <div className="flex-1 flex flex-col gap-2 relative">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-medium text-neutral-400">Video Prompt</label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleOptimizePrompt(scene.id)}
                                            disabled={generatingPrompts[scene.id] || optimizingPrompts[scene.id] || !prompts[scene.id]}
                                            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                                            title="Enhance your prompt with AI"
                                        >
                                            {optimizingPrompts[scene.id] ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <Wand2 size={12} />
                                            )}
                                            Optimize
                                        </button>
                                    </div>
                                </div>
                                <div className="relative flex-1">
                                    <textarea
                                        value={prompts[scene.id] || ''}
                                        onChange={(e) => setPrompts(prev => ({ ...prev, [scene.id]: e.target.value }))}
                                        placeholder="Describe the motion for this scene (e.g., 'Slow pan right, character smiles')..."
                                        className="w-full h-full min-h-[100px] bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-sm text-neutral-200 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 resize-none"
                                    />

                                    {/* Auto-Generate Overlay Button */}
                                    {(!prompts[scene.id] || prompts[scene.id].trim() === '') && (
                                        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                                            <button
                                                onClick={() => handleGeneratePrompt(scene.id)}
                                                disabled={generatingPrompts[scene.id]}
                                                className="pointer-events-auto flex items-center gap-2 text-purple-400 hover:text-purple-300 hover:scale-105 transition-all opacity-80 hover:opacity-100"
                                            >
                                                {generatingPrompts[scene.id] ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <Sparkles size={14} />
                                                )}
                                                <span className="text-sm font-medium">Auto-Generate</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer - Global Settings & Action */}
                <div className="px-6 py-4 border-t border-neutral-800 bg-[#151515]">
                    <div className="flex items-center justify-between">
                        {/* Settings */}
                        <div className="flex items-center gap-4">
                            {/* Model Selector */}
                            <div className="flex flex-col gap-1" ref={modelDropdownRef}>
                                <label className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Model</label>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                                        className="flex items-center gap-2 bg-neutral-800 text-white text-xs px-3 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-700 transition-colors min-w-[160px] justify-between"
                                    >
                                        <div className="flex items-center gap-2">
                                            {currentModel.id === 'veo-3.1' ? <GoogleIcon size={14} className="text-white" /> :
                                                currentModel.provider === 'kling' ? <KlingIcon size={16} /> :
                                                    currentModel.provider === 'hailuo' ? <HailuoIcon size={16} /> :
                                                        <Film size={14} />}
                                            <span>{currentModel.name}</span>
                                        </div>
                                        <ChevronDown size={14} className="opacity-50" />
                                    </button>

                                    {/* Dropdown */}
                                    {showModelDropdown && (
                                        <div className="absolute bottom-full mb-2 left-0 w-64 bg-[#1f1f1f] border border-neutral-700 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col max-h-[400px] overflow-y-auto">

                                            {/* Google */}
                                            <div className="px-3 py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-[#1a1a1a]">Google</div>
                                            {VIDEO_MODELS.filter(m => m.provider === 'google').map(model => (
                                                <button
                                                    key={model.id}
                                                    onClick={() => handleModelChange(model.id)}
                                                    className={`w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-[#2a2a2a] transition-colors ${settings.model === model.id ? 'text-blue-400 bg-blue-500/10' : 'text-neutral-300'}`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <GoogleIcon size={14} className={settings.model === model.id ? 'text-blue-400' : 'text-neutral-400'} />
                                                        {model.name}
                                                    </div>
                                                    {settings.model === model.id && <Check size={14} />}
                                                </button>
                                            ))}

                                            {/* Kling */}
                                            <div className="px-3 py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-[#1a1a1a] border-t border-neutral-700">Kling AI</div>
                                            {VIDEO_MODELS.filter(m => m.provider === 'kling').map(model => (
                                                <button
                                                    key={model.id}
                                                    onClick={() => handleModelChange(model.id)}
                                                    className={`w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-[#2a2a2a] transition-colors ${settings.model === model.id ? 'text-blue-400 bg-blue-500/10' : 'text-neutral-300'}`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <KlingIcon size={16} />
                                                        {model.name}
                                                        {model.recommended && (
                                                            <span className="text-[9px] px-1 py-0.5 bg-green-500/20 text-green-400 rounded font-medium">REC</span>
                                                        )}
                                                    </div>
                                                    {settings.model === model.id && <Check size={14} />}
                                                </button>
                                            ))}

                                            {/* Hailuo */}
                                            <div className="px-3 py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-[#1a1a1a] border-t border-neutral-700">Hailuo AI</div>
                                            {VIDEO_MODELS.filter(m => m.provider === 'hailuo').map(model => (
                                                <button
                                                    key={model.id}
                                                    onClick={() => handleModelChange(model.id)}
                                                    className={`w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-[#2a2a2a] transition-colors ${settings.model === model.id ? 'text-blue-400 bg-blue-500/10' : 'text-neutral-300'}`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <HailuoIcon size={16} />
                                                        {model.name}
                                                    </div>
                                                    {settings.model === model.id && <Check size={14} />}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Duration Selector - Dynamic based on model */}
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Duration</label>
                                <select
                                    value={settings.duration}
                                    onChange={(e) => setSettings(prev => ({ ...prev, duration: Number(e.target.value) }))}
                                    className="bg-neutral-800 text-white text-xs px-3 py-2 rounded-lg border border-neutral-700 focus:outline-none focus:border-purple-500 min-w-[80px]"
                                >
                                    {currentModel.durations.map(d => (
                                        <option key={d} value={d}>{d}s</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Generate Action */}
                        <div className="flex items-center gap-3">
                            <div className="text-right mr-2">
                                <div className="text-xs text-neutral-400">Est. cost</div>
                                <div className="text-sm font-medium text-white">~{(scenes.length * 0.1 * (settings.duration / 5)).toFixed(2)} credits</div>
                            </div>
                            <button
                                onClick={() => onCreateVideos(prompts, settings)}
                                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white pl-4 pr-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-lg shadow-purple-900/40 flex items-center gap-2"
                            >
                                <Play size={16} fill="currentColor" />
                                Generate Story Videos
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
