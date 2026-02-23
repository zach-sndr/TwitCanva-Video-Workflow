/**
 * ChangeAnglePanel.tsx
 * 
 * Panel for adjusting image viewing angle with 3D orbit camera control.
 * Users drag balls on arcs to adjust rotation, tilt, and zoom.
 */

import React, { useState, useCallback } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { OrbitCameraControl } from './OrbitCameraControl';

// ============================================================================
// TYPES
// ============================================================================

interface AngleSettings {
    rotation: number;  // -180 to 180 degrees
    tilt: number;      // -90 to 90 degrees
    scale: number;     // 0 to 100
    wideAngle: boolean;
}

interface ChangeAnglePanelProps {
    imageUrl: string;
    settings: AngleSettings;
    onSettingsChange: (settings: AngleSettings) => void;
    onClose: () => void;
    onGenerate: () => void;
    isLoading?: boolean;
    canvasTheme?: 'dark' | 'light';
}

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

const DEFAULT_SETTINGS: AngleSettings = {
    rotation: 0,
    tilt: 0,
    scale: 0,
    wideAngle: false
};

// ============================================================================
// COMPONENT
// ============================================================================

export const ChangeAnglePanel: React.FC<ChangeAnglePanelProps> = ({
    imageUrl,
    settings,
    onSettingsChange,
    onClose,
    onGenerate,
    isLoading = false,
    canvasTheme = 'dark'
}) => {
    const isDark = canvasTheme === 'dark';

    // --- Event Handlers ---
    const handleRotationChange = useCallback((value: number) => {
        onSettingsChange({ ...settings, rotation: value });
    }, [settings, onSettingsChange]);

    const handleTiltChange = useCallback((value: number) => {
        onSettingsChange({ ...settings, tilt: value });
    }, [settings, onSettingsChange]);

    const handleScaleChange = useCallback((value: number) => {
        onSettingsChange({ ...settings, scale: value });
    }, [settings, onSettingsChange]);

    const handleReset = useCallback(() => {
        onSettingsChange(DEFAULT_SETTINGS);
    }, [onSettingsChange]);

    // --- Render ---
    return (
        <div
            className={`p-4 cursor-default w-[500px] transition-colors duration-300 ${isDark ? 'bg-[#111] border border-white/20' : 'bg-white border border-white/20'}`}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                    3D Camera Control
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleReset}
                        className={`flex items-center gap-1.5 px-2 py-1 text-xs transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-500 hover:text-neutral-900'}`}
                    >
                        <RotateCcw size={12} />
                        Reset
                    </button>
                    <button
                        onClick={onClose}
                        className={`p-1.5 transition-colors ${isDark ? 'hover:bg-white/10 text-white/60 hover:text-white' : 'hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900'}`}
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* 3D Orbit Camera Control */}
            <OrbitCameraControl
                imageUrl={imageUrl}
                rotation={settings.rotation}
                tilt={settings.tilt}
                zoom={settings.scale}
                onRotationChange={handleRotationChange}
                onTiltChange={handleTiltChange}
                onZoomChange={handleScaleChange}
            />

            {/* Generate Button */}
            <button
                onClick={onGenerate}
                disabled={isLoading}
                className={`group w-full mt-4 py-3 font-medium text-sm flex items-center justify-center gap-2.5 transition-all duration-200 ${isLoading
                    ? 'bg-white/10 text-white/50 cursor-not-allowed'
                    : 'bg-white text-black hover:bg-neutral-200 active:scale-[0.98]'
                    }`}
            >
                {isLoading ? (
                    <>
                        <div className="w-4 h-4 border-2 border-white/40 border-t-transparent animate-spin" />
                        Generating...
                    </>
                ) : (
                    <>
                        <svg
                            viewBox="0 0 24 24"
                            className="w-4 h-4 transition-transform duration-200 group-hover:rotate-12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                        </svg>
                        Generate New Angle
                    </>
                )}
            </button>
        </div>
    );
};

export default ChangeAnglePanel;

