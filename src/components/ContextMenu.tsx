import React, { useEffect, useRef, useState } from 'react';
import {
  Type,
  Image as ImageIcon,
  Video,
  Film,
  Music,
  PenTool,
  Layout,
  Upload,
  Trash2,
  Plus,
  Undo2,
  Redo2,
  Clipboard,
  Copy,
  Files,
  Layers,
  ChevronRight,
  HardDrive,
  Check,
  ChevronsUpDown,
  Share2,
  Download,
  Maximize2,
  SlidersHorizontal,
  Star,
  MessageCircle
} from 'lucide-react';
import { ContextMenuState, NodeData, NodeType } from '../types';
import { ScrambleText } from './ScrambleText';
import { useMenuSounds } from '../hooks/useMenuSounds';
import { motion, AnimatePresence } from 'motion/react';

interface ContextMenuProps {
  state: ContextMenuState;
  sourceNode?: NodeData | null;
  onClose: () => void;
  onSelectType: (type: NodeType | 'DELETE') => void;
  onUpload: (file: File) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onPaste?: () => void;
  onCopy?: () => void;
  onDuplicate?: () => void;
  onCreateAsset?: () => void;
  onAddAssets?: () => void;
  onNodeShare?: () => void;
  onNodeDownload?: () => void;
  onNodeExpand?: () => void;
  onNodeChangeAngle?: () => void;
  onNodeSaveStyle?: () => Promise<void> | void;
  onNodeShareToTikTok?: () => void;
  onNodeAddToChat?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  canvasTheme?: 'dark' | 'light';
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  state,
  sourceNode,
  onClose,
  onSelectType,
  onUpload,
  onUndo,
  onRedo,
  onPaste,
  onCopy,
  onDuplicate,
  onCreateAsset,
  onAddAssets,
  onNodeShare,
  onNodeDownload,
  onNodeExpand,
  onNodeChangeAngle,
  onNodeSaveStyle,
  onNodeShareToTikTok,
  onNodeAddToChat,
  canUndo = false,
  canRedo = false,
  canvasTheme = 'dark'
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<'main' | 'add-nodes'>('main');
  const [hoveredSubmenu, setHoveredSubmenu] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
    const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { playClickSound, playHoverSound } = useMenuSounds();

  const handleSubmenuEnter = (id: string) => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = null;
    }
    setHoveredSubmenu(id);
  };

  const handleSubmenuLeave = () => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current);
    }
    submenuTimeoutRef.current = setTimeout(() => {
      setHoveredSubmenu(null);
    }, 200);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    if (state.isOpen && state.type === 'global') {
      setView('main');
      setIsOpen(true);
      playClickSound();
    }
  }, [state, playClickSound]);

  const handleClose = () => {
    setIsOpen(false);
    onClose();
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      handleClose();
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleUndo = () => {
    if (onUndo && canUndo) {
      onUndo();
      handleClose();
    }
  };

  const handleRedo = () => {
    if (onRedo && canRedo) {
      onRedo();
      handleClose();
    }
  };

  const handlePaste = () => {
    if (onPaste) {
      onPaste();
      handleClose();
    }
  };

  const handleMenuItemClick = (action: () => void) => {
    playClickSound();
    action();
  };

  const handleMenuItemHover = () => {
    playHoverSound();
  };

  if (!state.isOpen) return null;

  // 1. Right Click on Node
  if (state.type === 'node-options') {
    const hasMedia = Boolean(sourceNode?.resultUrl);
    const isImageNode = sourceNode?.type === NodeType.IMAGE;
    const isCameraAngleNode = sourceNode?.type === NodeType.CAMERA_ANGLE;
    const isVideoNode = sourceNode?.type === NodeType.VIDEO;
    const canChangeAngle = (isImageNode || isCameraAngleNode) && hasMedia && !(sourceNode?.prompt && sourceNode.prompt.startsWith('Extract panel #'));
    const canSaveStyle = isImageNode && hasMedia;
    const canShare = hasMedia && (isImageNode || isVideoNode || isCameraAngleNode);
    const canShareToTikTok = isVideoNode && hasMedia;
    const canExpand = hasMedia;
    const canDownload = hasMedia;
    const canAddToChat = hasMedia;
    const hasNodeActions = canChangeAngle || canSaveStyle || canShare || canShareToTikTok || canExpand || canDownload || canAddToChat;

    return (
      <AnimatePresence>
        <motion.div
          ref={menuRef}
          style={{ position: 'absolute', left: state.x, top: state.y, zIndex: 1000 }}
          initial={{ height: 0, opacity: 0, filter: 'blur(4px)' }}
          animate={{ height: 'auto', opacity: 1, filter: 'blur(0)' }}
          exit={{ height: 0, opacity: 0, filter: 'blur(4px)' }}
          transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
          className="w-52 border border-white/0 bg-[#111] overflow-hidden font-pixel"
        >
          <div className="p-0.5 flex flex-col gap-0">
            <BrutalistMenuItem
              icon={<ImageIcon size={14} />}
              label="Create Asset"
              onClick={() => {
                if (onCreateAsset) {
                  onCreateAsset();
                  handleClose();
                }
              }}
              onHover={handleMenuItemHover}
            />

            {hasNodeActions && <div className="border-t border-white/10 mx-1" />}

            {canChangeAngle && (
              <BrutalistMenuItem
                icon={<SlidersHorizontal size={14} />}
                label="Change Angle"
                onClick={() => {
                  if (onNodeChangeAngle) {
                    onNodeChangeAngle();
                    handleClose();
                  }
                }}
                onHover={handleMenuItemHover}
              />
            )}

            {canSaveStyle && (
              <BrutalistMenuItem
                icon={<Star size={14} />}
                label="Save Style"
                warning
                onClick={async () => {
                  if (onNodeSaveStyle) {
                    await onNodeSaveStyle();
                    handleClose();
                  }
                }}
                onHover={handleMenuItemHover}
              />
            )}

            {canShare && (
              <BrutalistMenuItem
                icon={<Share2 size={14} />}
                label="Share"
                onClick={() => {
                  if (onNodeShare) {
                    onNodeShare();
                    handleClose();
                  }
                }}
                onHover={handleMenuItemHover}
              />
            )}

            {canShareToTikTok && (
              <BrutalistMenuItem
                icon={<Share2 size={14} />}
                label="Share to TikTok"
                onClick={() => {
                  if (onNodeShareToTikTok) {
                    onNodeShareToTikTok();
                    handleClose();
                  }
                }}
                onHover={handleMenuItemHover}
              />
            )}

            {canExpand && (
              <BrutalistMenuItem
                icon={<Maximize2 size={14} />}
                label="View Full Size"
                onClick={() => {
                  if (onNodeExpand) {
                    onNodeExpand();
                    handleClose();
                  }
                }}
                onHover={handleMenuItemHover}
              />
            )}

            {canDownload && (
              <BrutalistMenuItem
                icon={<Download size={14} />}
                label="Download"
                onClick={() => {
                  if (onNodeDownload) {
                    onNodeDownload();
                    handleClose();
                  }
                }}
                onHover={handleMenuItemHover}
              />
            )}

            {canAddToChat && (
              <BrutalistMenuItem
                icon={<MessageCircle size={14} />}
                label="Add to Chat"
                onClick={() => {
                  if (onNodeAddToChat) {
                    onNodeAddToChat();
                    handleClose();
                  }
                }}
                onHover={handleMenuItemHover}
              />
            )}

            <div className="border-t border-white/10 mx-1" />

            <BrutalistMenuItem
              icon={<Copy size={14} />}
              label="Copy"
              shortcut="CtrlC"
              onClick={() => {
                if (onCopy) {
                  onCopy();
                  handleClose();
                }
              }}
              onHover={handleMenuItemHover}
            />
            <BrutalistMenuItem
              icon={<Clipboard size={14} />}
              label="Paste"
              shortcut="CtrlV"
              onClick={handlePaste}
              disabled={true}
              onHover={handleMenuItemHover}
            />
            <BrutalistMenuItem
              icon={<Files size={14} />}
              label="Duplicate"
              shortcut="CtrlD"
              onClick={() => {
                if (onDuplicate) {
                  onDuplicate();
                  handleClose();
                }
              }}
              onHover={handleMenuItemHover}
            />

            <div className="border-t border-white/10 mx-1" />

            <BrutalistMenuItem
              icon={<Trash2 size={14} />}
              label="Delete"
              shortcut="Del"
              onClick={() => onSelectType('DELETE')}
              onHover={handleMenuItemHover}
              danger
            />
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // 2. Connector Drag Drop (Add Next)
  const isConnector = state.type === 'node-connector';

  // If it's the Global Menu (Right Click on Blank), we show the specific options
  if (state.type === 'global' && view === 'main') {
    return (
      <AnimatePresence>
        <motion.div
          ref={menuRef}
          style={{ position: 'absolute', left: state.x, top: state.y, zIndex: 1000 }}
          initial={{ height: 0, opacity: 0, filter: 'blur(4px)' }}
          animate={{ height: 'auto', opacity: 1, filter: 'blur(0)' }}
          exit={{ height: 0, opacity: 0, filter: 'blur(4px)' }}
          transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
          className="w-56 border border-white/0 bg-[#111] overflow-visible font-pixel"
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*,video/*"
            onChange={handleFileChange}
          />
          <div className="p-0.5 flex flex-col gap-0">
            <BrutalistMenuItem
              icon={<Upload size={14} />}
              label="Upload"
              onClick={handleUploadClick}
              onHover={handleMenuItemHover}
            />
            <BrutalistMenuItem
              icon={<Layers size={14} />}
              label="Add Assets"
              onClick={() => {
                if (onAddAssets) {
                  onAddAssets();
                  handleClose();
                }
              }}
              onHover={handleMenuItemHover}
            />
            <div className="border-t border-white/10 mx-1" />

            <BrutalistMenuItem
              icon={<ImageIcon size={14} />}
              label="Image Node"
              onClick={() => {
                onSelectType(NodeType.IMAGE);
                handleClose();
              }}
              onHover={handleMenuItemHover}
            />
            <BrutalistMenuItem
              icon={<Video size={14} />}
              label="Video Node"
              onClick={() => {
                onSelectType(NodeType.VIDEO);
                handleClose();
              }}
              onHover={handleMenuItemHover}
            />
            <BrutalistMenuItem
              icon={<Plus size={14} />}
              label="More Nodes"
              rightSlot={<ChevronRight size={12} className="text-neutral-500" />}
              onClick={() => {}}
              onMouseEnter={() => handleSubmenuEnter('more-nodes')}
              onMouseLeave={handleSubmenuLeave}
              onHover={handleMenuItemHover}
            />

            <div className="border-t border-white/10 mx-1" />

            <BrutalistMenuItem
              icon={<Undo2 size={14} />}
              label="Undo"
              shortcut="CtrlZ"
              onClick={handleUndo}
              disabled={!canUndo}
              onHover={handleMenuItemHover}
            />
            <BrutalistMenuItem
              icon={<Redo2 size={14} />}
              label="Redo"
              shortcut="SC+Z"
              onClick={handleRedo}
              disabled={!canRedo}
              onHover={handleMenuItemHover}
            />
            <div className="border-t border-white/10 mx-1" />

            <BrutalistMenuItem
              icon={<Clipboard size={14} />}
              label="Paste"
              shortcut="CtrlV"
              onClick={handlePaste}
              onHover={handleMenuItemHover}
            />
          </div>

          {/* Nested Submenu for "More Nodes" */}
          {hoveredSubmenu === 'more-nodes' && (
            <motion.div
              initial={{ height: 0, opacity: 0, filter: 'blur(4px)' }}
              animate={{ height: 'auto', opacity: 1, filter: 'blur(0)' }}
              exit={{ height: 0, opacity: 0, filter: 'blur(4px)' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              style={{ position: 'absolute', left: 'calc(100% + 4px)', top: 0, zIndex: 1001 }}
              className="w-48 border border-white/0 bg-[#111] overflow-hidden font-pixel"
              onMouseEnter={() => handleSubmenuEnter('more-nodes')}
              onMouseLeave={handleSubmenuLeave}
            >
              <div className="p-0.5 flex flex-col gap-0">
                <BrutalistMenuItem
                  icon={<Type size={14} />}
                  label="Text"
                  onClick={() => {
                    onSelectType(NodeType.TEXT);
                    handleClose();
                  }}
                  onHover={handleMenuItemHover}
                  speed="fast"
                    />
                <BrutalistMenuItem
                  icon={<PenTool size={14} />}
                  label="Image Editor"
                  onClick={() => {
                    onSelectType(NodeType.IMAGE_EDITOR);
                    handleClose();
                  }}
                  onHover={handleMenuItemHover}
                  speed="fast"
                    />
                <BrutalistMenuItem
                  icon={<Film size={14} />}
                  label="Video Editor"
                  onClick={() => {
                    onSelectType(NodeType.VIDEO_EDITOR);
                    handleClose();
                  }}
                  onHover={handleMenuItemHover}
                  speed="fast"
                    />
                <div className="border-t border-white/10 mx-1" />
                <div className="px-2 py-1 text-[10px] text-neutral-500 uppercase tracking-wider">
                  Local Models
                </div>
                <BrutalistMenuItem
                  icon={<HardDrive size={14} />}
                  label="Local Image Model"
                  onClick={() => {
                    onSelectType(NodeType.LOCAL_IMAGE_MODEL);
                    handleClose();
                  }}
                  onHover={handleMenuItemHover}
                  speed="fast"
                    />
                <BrutalistMenuItem
                  icon={<HardDrive size={14} />}
                  label="Local Video Model"
                  onClick={() => {
                    onSelectType(NodeType.LOCAL_VIDEO_MODEL);
                    handleClose();
                  }}
                  onHover={handleMenuItemHover}
                  speed="fast"
                    />
              </div>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  // 3. Add Nodes Menu (Global Submenu OR Connector Default)
  const title = isConnector ? "Generate from this node" : "Add Nodes";

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        style={{
          position: 'absolute',
          left: state.x,
          top: state.y,
          zIndex: 1000
        }}
        initial={{ height: 0, opacity: 0, filter: 'blur(4px)' }}
        animate={{ height: 'auto', opacity: 1, filter: 'blur(0)' }}
        exit={{ height: 0, opacity: 0, filter: 'blur(4px)' }}
        transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
        className="w-56 border border-white/0 bg-[#111] overflow-hidden font-pixel"
      >
        <div className="px-3 py-2 text-xs text-neutral-400 border-b border-white/10 uppercase tracking-wider">
          {title}
        </div>

        <div className="p-0.5 flex flex-col gap-0 max-h-[320px] overflow-y-auto">
          <BrutalistMenuItem
            icon={<Type size={14} />}
            label={isConnector ? "Text Generation" : "Text"}
            desc={isConnector ? "Script, Ad copy, Brand text" : undefined}
            onClick={() => onSelectType(NodeType.TEXT)}
            onHover={handleMenuItemHover}
          />
          <BrutalistMenuItem
            icon={<ImageIcon size={14} />}
            label={isConnector ? "Image Generation" : "Image"}
            desc={!isConnector ? "Promotional image, poster, cover" : undefined}
            onClick={() => onSelectType(NodeType.IMAGE)}
            onHover={handleMenuItemHover}
          />
          <BrutalistMenuItem
            icon={<Video size={14} />}
            label={isConnector ? "Video Generation" : "Video"}
            onClick={() => onSelectType(NodeType.VIDEO)}
            onHover={handleMenuItemHover}
          />

          {!isConnector && (
            <BrutalistMenuItem
              icon={<PenTool size={14} />}
              label="Image Editor"
              onClick={() => onSelectType(NodeType.IMAGE_EDITOR)}
              onHover={handleMenuItemHover}
            />
          )}

          {!isConnector && (
            <BrutalistMenuItem
              icon={<Film size={14} />}
              label="Video Editor"
              onClick={() => onSelectType(NodeType.VIDEO_EDITOR)}
              onHover={handleMenuItemHover}
            />
          )}

          <div className="border-t border-white/10 mx-1 my-1" />
          <div className="px-2 py-0.5 text-[10px] text-neutral-500 uppercase tracking-wider">
            Local Models (Open Source)
          </div>

          <BrutalistMenuItem
            icon={<HardDrive size={14} />}
            label="Local Image Model"
            desc="Use downloaded open-source models"
            badge="NEW"
            onClick={() => onSelectType(NodeType.LOCAL_IMAGE_MODEL)}
            onHover={handleMenuItemHover}
          />
          <BrutalistMenuItem
            icon={<HardDrive size={14} />}
            label="Local Video Model"
            desc="AnimateDiff, SVD, and more"
            badge="NEW"
            onClick={() => onSelectType(NodeType.LOCAL_VIDEO_MODEL)}
            onHover={handleMenuItemHover}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

interface BrutalistMenuItemProps {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  badge?: string;
  shortcut?: string;
  rightSlot?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  warning?: boolean;
  onClick: () => void;
  onHover?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  speed?: 'slow' | 'fast';
}

const BrutalistMenuItem: React.FC<BrutalistMenuItemProps> = ({
  icon,
  label,
  desc,
  badge,
  shortcut,
  rightSlot,
  disabled,
  danger,
  warning,
  onClick,
  onHover,
  onMouseEnter,
  onMouseLeave,
  speed = 'slow'
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => {
        setIsHovered(true);
        if (onHover) onHover();
        if (onMouseEnter) onMouseEnter();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        if (onMouseLeave) onMouseLeave();
      }}
      disabled={disabled}
      className={`
        group flex items-center gap-2 w-full p-2 text-left transition-all duration-75
        font-pixel text-xs
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
        ${isHovered && !disabled
          ? 'bg-white text-black'
          : 'bg-transparent text-white hover:bg-white/10'}
        ${danger && isHovered && !disabled ? 'bg-red-600 text-white' : ''}
        ${warning && isHovered && !disabled ? 'bg-orange-500 text-white' : ''}
      `}
    >
      <div className={`
        flex items-center justify-center w-6 h-6 transition-colors
        ${isHovered && !disabled ? 'text-black' : 'text-neutral-400'}
        ${disabled ? 'text-neutral-600' : ''}
      `}>
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate ${disabled ? 'text-neutral-600' : ''}`}>
            <ScrambleText text={label} isHovered={isHovered} speed={speed} />
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {badge && (
              <span className={`
                text-[9px] px-1 py-0.5 border
                ${isHovered && !disabled
                  ? 'border-black text-black'
                  : 'border-white/30 text-neutral-400'}
              `}>
                {badge}
              </span>
            )}
            {shortcut && (
              <span className={`text-[10px] ${isHovered && !disabled ? 'text-black/60' : 'text-neutral-600'}`}>
                {shortcut}
              </span>
            )}
            {rightSlot}
          </div>
        </div>
        {desc && (
          <p className={`text-[10px] mt-0.5 truncate ${isHovered && !disabled ? 'text-black/60' : 'text-neutral-500'}`}>
            {desc}
          </p>
        )}
      </div>
    </button>
  );
};
