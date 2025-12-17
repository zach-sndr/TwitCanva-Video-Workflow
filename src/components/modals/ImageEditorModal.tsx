/**
 * ImageEditorModal.tsx
 * 
 * Full-screen image editor modal with drawing tools, model selection,
 * and image generation controls. Refactored into modular components.
 */

import React, { useState, useRef, useEffect } from 'react';

// Types and constants
import {
    ImageEditorModalProps,
    EditorElement,
    IMAGE_MODELS
} from './imageEditor/imageEditor.types';

// Custom hooks
import { useImageEditorHistory } from '../../hooks/useImageEditorHistory';
import { useImageEditorDrawing } from '../../hooks/useImageEditorDrawing';
import { useImageEditorArrows, drawArrowWithStyle } from '../../hooks/useImageEditorArrows';
import { useImageEditorSelection } from '../../hooks/useImageEditorSelection';
import { useImageEditorText } from '../../hooks/useImageEditorText';

// Sub-components
import { DrawingToolbar } from './imageEditor/DrawingToolbar';
import { BottomToolbar } from './imageEditor/BottomToolbar';
import { PromptBar } from './imageEditor/PromptBar';

// ============================================================================
// COMPONENT
// ============================================================================

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
    isOpen,
    nodeId,
    imageUrl,
    initialPrompt,
    initialModel,
    initialAspectRatio,
    initialResolution,
    onClose,
    onGenerate,
    onUpdate
}) => {
    // --- Prompt & Generation State ---
    const [prompt, setPrompt] = useState(initialPrompt || '');
    const [batchCount, setBatchCount] = useState(4);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [showAspectDropdown, setShowAspectDropdown] = useState(false);
    const [showResolutionDropdown, setShowResolutionDropdown] = useState(false);

    // --- Model State ---
    const [selectedModel, setSelectedModel] = useState(initialModel || 'gemini-pro');
    const [selectedAspectRatio, setSelectedAspectRatio] = useState(initialAspectRatio || 'Auto');
    const [selectedResolution, setSelectedResolution] = useState(initialResolution || '1K');

    // --- Element State ---
    const [elements, setElements] = useState<EditorElement[]>([]);

    // --- Refs ---
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const arrowCanvasRef = useRef<HTMLCanvasElement>(null);
    const selectCanvasRef = useRef<HTMLCanvasElement>(null);
    const textCanvasRef = useRef<HTMLCanvasElement>(null);
    const imageContainerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const textInputRef = useRef<HTMLInputElement>(null);

    // --- Custom Hooks ---

    const {
        historyStack,
        redoStack,
        saveState,
        handleUndo,
        handleRedo
    } = useImageEditorHistory({
        canvasRef,
        elements,
        setElements,
        setSelectedElementId: (id) => selection.setSelectedElementId(id)
    });

    const drawing = useImageEditorDrawing({
        canvasRef,
        imageRef,
        saveState
    });

    const arrows = useImageEditorArrows({
        arrowCanvasRef,
        imageRef,
        saveState,
        setElements
    });

    const selection = useImageEditorSelection({
        selectCanvasRef,
        elements,
        setElements,
        saveState
    });

    const text = useImageEditorText({
        imageRef,
        saveState,
        setElements
    });

    const currentModel = IMAGE_MODELS.find(m => m.id === selectedModel) || IMAGE_MODELS[0];
    const hasInputImage = !!imageUrl;

    // --- Effects ---

    // Reset state when modal opens with new data
    useEffect(() => {
        setPrompt(initialPrompt || '');
        setSelectedModel(initialModel || 'gemini-pro');
        setSelectedAspectRatio(initialAspectRatio || 'Auto');
        setSelectedResolution(initialResolution || '1K');
    }, [initialPrompt, initialModel, initialAspectRatio, initialResolution]);

    // --- Handlers ---

    const handleGenerateClick = () => {
        onUpdate(nodeId, {
            prompt,
            imageModel: selectedModel,
            aspectRatio: selectedAspectRatio,
            resolution: selectedResolution
        });
        onGenerate(nodeId, prompt, batchCount);
    };

    const handleModelChange = (modelId: string) => {
        setSelectedModel(modelId);
        const newModel = IMAGE_MODELS.find(m => m.id === modelId);

        if (newModel?.aspectRatios && !newModel.aspectRatios.includes(selectedAspectRatio)) {
            setSelectedAspectRatio('Auto');
        }

        onUpdate(nodeId, { imageModel: modelId });
        setShowModelDropdown(false);
    };

    const handleAspectChange = (ratio: string) => {
        setSelectedAspectRatio(ratio);
        onUpdate(nodeId, { aspectRatio: ratio });
        setShowAspectDropdown(false);
    };

    const handleResolutionChange = (res: string) => {
        setSelectedResolution(res);
        onUpdate(nodeId, { resolution: res });
        setShowResolutionDropdown(false);
    };

    // --- Early Return ---
    if (!isOpen) return null;

    // --- Render ---
    return (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
            {/* Top Bar */}
            <div className="h-14 flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded flex items-center justify-center text-neutral-400">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                    </div>
                    <span className="text-sm text-neutral-300">Image Editor</span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Download Button */}
                    <button
                        className="w-10 h-10 rounded hover:bg-neutral-800 flex items-center justify-center text-neutral-400"
                        title="Download"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </button>
                    {/* Exit Button */}
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded hover:bg-neutral-800 flex items-center justify-center text-neutral-400"
                        title="Exit Image Editor"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Drawing Sub-Toolbar */}
                {drawing.isDrawingMode && (
                    <DrawingToolbar
                        drawingTool={drawing.drawingTool}
                        setDrawingTool={drawing.setDrawingTool}
                        brushWidth={drawing.brushWidth}
                        setBrushWidth={drawing.setBrushWidth}
                        eraserWidth={drawing.eraserWidth}
                        setEraserWidth={drawing.setEraserWidth}
                        brushColor={drawing.brushColor}
                        setBrushColor={drawing.setBrushColor}
                        showToolSettings={drawing.showToolSettings}
                        setShowToolSettings={drawing.setShowToolSettings}
                        presetColors={drawing.presetColors}
                    />
                )}

                <div className="w-0"></div>

                {/* Canvas Area */}
                <div className="flex-1 flex items-center justify-center bg-black p-8">
                    {imageUrl ? (
                        <div ref={imageContainerRef} className="relative">
                            <img
                                ref={imageRef}
                                src={imageUrl}
                                alt="Editing"
                                className="max-w-full max-h-full object-contain"
                                onLoad={(e) => {
                                    const img = e.currentTarget;
                                    const canvas = canvasRef.current;
                                    const arrowCanvas = arrowCanvasRef.current;
                                    if (canvas) {
                                        canvas.width = img.clientWidth;
                                        canvas.height = img.clientHeight;
                                    }
                                    if (arrowCanvas) {
                                        arrowCanvas.width = img.clientWidth;
                                        arrowCanvas.height = img.clientHeight;
                                    }
                                }}
                            />
                            {/* Main Canvas - For persistent brush drawings */}
                            <canvas
                                ref={canvasRef}
                                className={`absolute inset-0 ${drawing.isDrawingMode ? '' : 'pointer-events-none'}`}
                                style={drawing.isDrawingMode ? {
                                    cursor: drawing.drawingTool === 'eraser'
                                        ? `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="${drawing.eraserWidth}" height="${drawing.eraserWidth}" viewBox="0 0 ${drawing.eraserWidth} ${drawing.eraserWidth}"><circle cx="${drawing.eraserWidth / 2}" cy="${drawing.eraserWidth / 2}" r="${drawing.eraserWidth / 2 - 1}" fill="rgba(255,255,255,0.3)" stroke="white" stroke-width="1"/></svg>') ${drawing.eraserWidth / 2} ${drawing.eraserWidth / 2}, auto`
                                        : 'crosshair'
                                } : {}}
                                onMouseDown={drawing.isDrawingMode ? drawing.startDrawing : undefined}
                                onMouseMove={drawing.isDrawingMode ? drawing.draw : undefined}
                                onMouseUp={drawing.isDrawingMode ? drawing.stopDrawing : undefined}
                                onMouseLeave={drawing.isDrawingMode ? drawing.stopDrawing : undefined}
                            />
                            {/* Arrow Canvas Overlay */}
                            {arrows.isArrowMode && (
                                <canvas
                                    ref={arrowCanvasRef}
                                    className="absolute inset-0 cursor-crosshair"
                                    onMouseDown={arrows.startArrow}
                                    onMouseMove={arrows.drawArrowPreview}
                                    onMouseUp={arrows.finishArrow}
                                    onMouseLeave={arrows.finishArrow}
                                />
                            )}
                            {/* Elements Canvas - Renders all stored elements (arrows and text) */}
                            <canvas
                                className="absolute inset-0 pointer-events-none"
                                ref={(canvas) => {
                                    if (canvas && imageRef.current) {
                                        canvas.width = imageRef.current.clientWidth;
                                        canvas.height = imageRef.current.clientHeight;
                                        const ctx = canvas.getContext('2d');
                                        if (ctx) {
                                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                                            elements.forEach(element => {
                                                if (element.type === 'arrow') {
                                                    drawArrowWithStyle(
                                                        ctx,
                                                        element.startX,
                                                        element.startY,
                                                        element.endX,
                                                        element.endY,
                                                        element.color,
                                                        element.lineWidth
                                                    );
                                                } else if (element.type === 'text' && element.id !== text.editingTextId) {
                                                    // Render text elements (skip if currently editing)
                                                    ctx.font = `${element.fontSize}px ${element.fontFamily}`;
                                                    ctx.fillStyle = element.color;
                                                    ctx.textBaseline = 'top';
                                                    ctx.fillText(element.text, element.x, element.y);
                                                }
                                            });
                                        }
                                    }
                                }}
                            />
                            {/* Text Mode Canvas - Click to place text */}
                            {text.isTextMode && (
                                <canvas
                                    ref={(canvas) => {
                                        (textCanvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = canvas;
                                        if (canvas && imageRef.current) {
                                            canvas.width = imageRef.current.clientWidth;
                                            canvas.height = imageRef.current.clientHeight;
                                        }
                                    }}
                                    className="absolute inset-0 cursor-text"
                                    onClick={text.handleTextCanvasClick}
                                />
                            )}
                            {/* Text Editing Overlay */}
                            {text.editingTextId && elements.filter(el => el.type === 'text' && el.id === text.editingTextId).map(el => {
                                if (el.type !== 'text') return null;
                                return (
                                    <input
                                        key={el.id}
                                        ref={textInputRef}
                                        type="text"
                                        value={el.text}
                                        onChange={(e) => text.handleTextChange(el.id, e.target.value)}
                                        onBlur={text.handleTextBlur}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === 'Escape') {
                                                text.handleTextBlur();
                                            }
                                        }}
                                        autoFocus
                                        className="absolute bg-transparent border-2 border-blue-500 outline-none text-white"
                                        style={{
                                            left: el.x,
                                            top: el.y,
                                            fontSize: el.fontSize,
                                            fontFamily: el.fontFamily,
                                            color: el.color,
                                            minWidth: '50px',
                                            padding: '2px 4px'
                                        }}
                                    />
                                );
                            })}
                            {/* Select Mode Canvas */}
                            {selection.isSelectMode && (
                                <canvas
                                    ref={(canvas) => {
                                        (selectCanvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = canvas;
                                        if (canvas && imageRef.current) {
                                            canvas.width = imageRef.current.clientWidth;
                                            canvas.height = imageRef.current.clientHeight;
                                        }
                                    }}
                                    className="absolute inset-0"
                                    style={{ cursor: selection.isDraggingElement || selection.isResizing ? 'grabbing' : 'default' }}
                                    onMouseDown={selection.handleSelectMouseDown}
                                    onMouseMove={selection.handleSelectMouseMove}
                                    onMouseUp={selection.handleSelectMouseUp}
                                    onMouseLeave={selection.handleSelectMouseUp}
                                />
                            )}
                            {/* Selection UI - Shows handles for selected element */}
                            {selection.isSelectMode && selection.selectedElementId && (
                                <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
                                    {elements.filter(el => el.id === selection.selectedElementId).map(el => {
                                        if (el.type === 'arrow') {
                                            return (
                                                <g key={el.id}>
                                                    <line
                                                        x1={el.startX}
                                                        y1={el.startY}
                                                        x2={el.endX}
                                                        y2={el.endY}
                                                        stroke="#3b82f6"
                                                        strokeWidth="5"
                                                        strokeDasharray="5,5"
                                                        opacity="0.6"
                                                    />
                                                    <circle
                                                        cx={el.startX}
                                                        cy={el.startY}
                                                        r="8"
                                                        fill="#3b82f6"
                                                        stroke="white"
                                                        strokeWidth="2"
                                                        style={{ pointerEvents: 'auto', cursor: 'grab' }}
                                                    />
                                                    <circle
                                                        cx={el.endX}
                                                        cy={el.endY}
                                                        r="8"
                                                        fill="#3b82f6"
                                                        stroke="white"
                                                        strokeWidth="2"
                                                        style={{ pointerEvents: 'auto', cursor: 'grab' }}
                                                    />
                                                </g>
                                            );
                                        }
                                        // Text selection box (future enhancement)
                                        return null;
                                    })}
                                </svg>
                            )}
                        </div>
                    ) : (
                        <div className="w-[600px] h-[400px] bg-neutral-100 rounded flex items-center justify-center">
                            <span className="text-neutral-400">No image loaded</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Floating Controls */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 w-full max-w-6xl px-4 pointer-events-none">
                {/* Floating Tools Palette */}
                <BottomToolbar
                    isSelectMode={selection.isSelectMode}
                    setIsSelectMode={selection.setIsSelectMode}
                    isDrawingMode={drawing.isDrawingMode}
                    setIsDrawingMode={drawing.setIsDrawingMode}
                    isArrowMode={arrows.isArrowMode}
                    setIsArrowMode={arrows.setIsArrowMode}
                    isTextMode={text.isTextMode}
                    setIsTextMode={text.setIsTextMode}
                    setShowToolSettings={drawing.setShowToolSettings}
                    setSelectedElementId={selection.setSelectedElementId}
                    setDrawingTool={drawing.setDrawingTool}
                    setShowTextSettings={text.setShowTextSettings}
                    historyStackLength={historyStack.length}
                    redoStackLength={redoStack.length}
                    handleUndo={handleUndo}
                    handleRedo={handleRedo}
                />

                {/* Prompt Bar */}
                <PromptBar
                    prompt={prompt}
                    setPrompt={setPrompt}
                    selectedModel={selectedModel}
                    onModelChange={handleModelChange}
                    showModelDropdown={showModelDropdown}
                    setShowModelDropdown={setShowModelDropdown}
                    selectedAspectRatio={selectedAspectRatio}
                    onAspectChange={handleAspectChange}
                    showAspectDropdown={showAspectDropdown}
                    setShowAspectDropdown={setShowAspectDropdown}
                    selectedResolution={selectedResolution}
                    onResolutionChange={handleResolutionChange}
                    showResolutionDropdown={showResolutionDropdown}
                    setShowResolutionDropdown={setShowResolutionDropdown}
                    batchCount={batchCount}
                    setBatchCount={setBatchCount}
                    onGenerate={handleGenerateClick}
                    hasInputImage={hasInputImage}
                />
            </div>
        </div>
    );
};
