import { IMAGE_MODELS, VIDEO_MODELS } from '../config/providers';
import { NodeData, NodeType } from '../types';

const STORAGE_KEY = 'twitcanva.session.memory.v1';

type RememberedNodeModelMap = Partial<Record<NodeType, string>>;

type RememberedModelSettings = Partial<Pick<
    NodeData,
    | 'aspectRatio'
    | 'resolution'
    | 'videoDuration'
    | 'generateAudio'
    | 'variationCount'
    | 'videoMode'
    | 'grokImagineMode'
    | 'klingReferenceMode'
    | 'klingFaceIntensity'
    | 'klingSubjectIntensity'
>>;

interface SessionMemoryState {
    lastWorkflowId: string | null;
    nodeModelByType: RememberedNodeModelMap;
    modelSettings: Record<string, RememberedModelSettings>;
}

const DEFAULT_STATE: SessionMemoryState = {
    lastWorkflowId: null,
    nodeModelByType: {},
    modelSettings: {}
};

const readState = (): SessionMemoryState => {
    if (typeof window === 'undefined') return DEFAULT_STATE;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_STATE;
        const parsed = JSON.parse(raw);
        return {
            lastWorkflowId: typeof parsed?.lastWorkflowId === 'string' ? parsed.lastWorkflowId : null,
            nodeModelByType: parsed?.nodeModelByType || {},
            modelSettings: parsed?.modelSettings || {}
        };
    } catch {
        return DEFAULT_STATE;
    }
};

const writeState = (state: SessionMemoryState) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Ignore write failures (private mode/quota)
    }
};

const updateState = (updater: (state: SessionMemoryState) => SessionMemoryState) => {
    const next = updater(readState());
    writeState(next);
};

export const getLastWorkflowId = (): string | null => readState().lastWorkflowId;

export const setLastWorkflowId = (workflowId: string) => {
    updateState((state) => ({ ...state, lastWorkflowId: workflowId }));
};

export const clearLastWorkflowId = () => {
    updateState((state) => ({ ...state, lastWorkflowId: null }));
};

export const getRememberedModelForNodeType = (nodeType: NodeType): string | undefined =>
    readState().nodeModelByType[nodeType];

export const rememberModelForNodeType = (nodeType: NodeType, modelId: string) => {
    if (!modelId) return;
    updateState((state) => ({
        ...state,
        nodeModelByType: {
            ...state.nodeModelByType,
            [nodeType]: modelId
        }
    }));
};

export const getRememberedSettingsForModel = (modelId: string): RememberedModelSettings | undefined => {
    if (!modelId) return undefined;
    return readState().modelSettings[modelId];
};

export const rememberSettingsForModel = (modelId: string, settings: RememberedModelSettings) => {
    if (!modelId) return;
    updateState((state) => ({
        ...state,
        modelSettings: {
            ...state.modelSettings,
            [modelId]: {
                ...(state.modelSettings[modelId] || {}),
                ...settings
            }
        }
    }));
};

export const rememberNodeGenerationPreferences = (node: NodeData) => {
    const modelId = getModelIdForNode(node);
    if (!modelId) return;

    rememberModelForNodeType(node.type, modelId);
    rememberSettingsForModel(modelId, {
        aspectRatio: node.aspectRatio,
        resolution: node.resolution,
        videoDuration: node.videoDuration,
        generateAudio: node.generateAudio,
        variationCount: node.variationCount,
        videoMode: node.videoMode,
        grokImagineMode: node.grokImagineMode,
        klingReferenceMode: node.klingReferenceMode,
        klingFaceIntensity: node.klingFaceIntensity,
        klingSubjectIntensity: node.klingSubjectIntensity
    });
};

const getModelIdForNode = (node: NodeData): string | undefined => {
    if (node.type === NodeType.VIDEO || node.type === NodeType.LOCAL_VIDEO_MODEL) {
        return node.videoModel || node.model;
    }
    if (node.type === NodeType.IMAGE || node.type === NodeType.IMAGE_EDITOR || node.type === NodeType.CAMERA_ANGLE) {
        return node.imageModel || node.model;
    }
    if (node.type === NodeType.LOCAL_IMAGE_MODEL) {
        return node.localModelId || node.model;
    }
    return node.model;
};

const defaultImageModel = IMAGE_MODELS[0]?.id || 'gpt-image-1.5';
const defaultVideoModel = VIDEO_MODELS[0]?.id || 'veo-3.1';

export const getNodeDefaultsForType = (nodeType: NodeType): Partial<NodeData> => {
    if (nodeType === NodeType.VIDEO) {
        const videoModel = getRememberedModelForNodeType(NodeType.VIDEO) || defaultVideoModel;
        return {
            model: videoModel,
            videoModel,
            ...getRememberedSettingsForModel(videoModel)
        };
    }

    if (nodeType === NodeType.IMAGE || nodeType === NodeType.IMAGE_EDITOR || nodeType === NodeType.CAMERA_ANGLE) {
        const imageModel = getRememberedModelForNodeType(NodeType.IMAGE) || defaultImageModel;
        return {
            model: imageModel,
            imageModel,
            ...getRememberedSettingsForModel(imageModel)
        };
    }

    if (nodeType === NodeType.LOCAL_IMAGE_MODEL) {
        const localModelId = getRememberedModelForNodeType(NodeType.LOCAL_IMAGE_MODEL);
        return {
            model: localModelId || 'local',
            localModelId
        };
    }

    if (nodeType === NodeType.LOCAL_VIDEO_MODEL) {
        const localVideoModel = getRememberedModelForNodeType(NodeType.LOCAL_VIDEO_MODEL);
        return {
            model: localVideoModel || 'local',
            videoModel: localVideoModel,
            videoDuration: 5
        };
    }

    return {};
};
