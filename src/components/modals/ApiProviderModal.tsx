/**
 * ApiProviderModal.tsx
 *
 * Modal for managing API provider keys and selecting which models
 * are available on the canvas.
 */

import React, { useState } from 'react';
import { X, Check, Loader2, AlertCircle, Trash2, Image as ImageIcon, Film } from 'lucide-react';
import { PROVIDERS, IMAGE_MODELS, VIDEO_MODELS } from '../../config/providers';
import { ProviderState, ValidationStatus } from '../../hooks/useApiProviders';
import { OpenAIIcon, GoogleIcon, KlingIcon, HailuoIcon, FalIcon, KieIcon } from '../icons/BrandIcons';

interface ApiProviderModalProps {
    isOpen: boolean;
    onClose: () => void;
    providers: Record<string, ProviderState>;
    enabledModels: Set<string>;
    onUpdateKeyValue: (providerId: string, keyName: string, value: string) => void;
    onValidate: (providerId: string) => void;
    onDelete: (providerId: string) => void;
    onToggleModel: (modelId: string) => void;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
    google: <GoogleIcon size={18} />,
    openai: <OpenAIIcon size={18} />,
    kling: <KlingIcon size={18} />,
    hailuo: <HailuoIcon size={18} />,
    fal: <FalIcon size={18} />,
    kie: <KieIcon size={18} />
};

export const ApiProviderModal: React.FC<ApiProviderModalProps> = ({
    isOpen,
    onClose,
    providers,
    enabledModels,
    onUpdateKeyValue,
    onValidate,
    onDelete,
    onToggleModel
}) => {
    if (!isOpen) return null;

    const validProviderIds = new Set(
        Object.entries(providers)
            .filter(([, s]) => s.status === 'valid')
            .map(([id]) => id)
    );

    // Group models by provider
    const allModels = [
        ...IMAGE_MODELS.map(m => ({ ...m, type: 'Image' as const })),
        ...VIDEO_MODELS.map(m => ({ ...m, type: 'Video' as const }))
    ];

    const modelsByProvider = PROVIDERS.map(p => ({
        provider: p,
        models: allModels.filter(m => m.provider === p.id)
    })).filter(g => g.models.length > 0);

    const hasAnyValid = validProviderIds.size > 0;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]">
            <div className="bg-[#1a1a1a] border border-neutral-700 rounded-2xl w-[520px] max-h-[85vh] shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
                    <h2 className="text-lg font-semibold text-white">API Providers</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-4">
                    {/* API Key Inputs */}
                    <div className="space-y-4">
                        {PROVIDERS.map(provider => {
                            const state = providers[provider.id] || { keyValues: {}, status: 'idle' as ValidationStatus };
                            const isValid = state.status === 'valid';
                            const isValidating = state.status === 'validating';
                            const isInvalid = state.status === 'invalid';

                            // Check if all required fields are filled
                            const allFieldsFilled = provider.keyFields.every(
                                f => (state.keyValues[f.key] || '').trim().length > 0
                            );

                            return (
                                <div key={provider.id} className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-neutral-300">{PROVIDER_ICONS[provider.id]}</span>
                                        <span className="text-sm font-medium text-neutral-200">{provider.name}</span>
                                        {isValid && (
                                            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
                                                <Check size={14} />
                                                Connected
                                            </span>
                                        )}
                                    </div>

                                    {isValid ? (
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 flex gap-2">
                                                {provider.keyFields.map(field => (
                                                    <div
                                                        key={field.key}
                                                        className="flex-1 px-3 py-2 bg-neutral-800/50 border border-neutral-700 rounded-lg text-sm text-neutral-500 font-mono"
                                                    >
                                                        {state.maskedKeys?.[field.key] || '••••••••'}
                                                    </div>
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => onDelete(provider.id)}
                                                className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                title="Delete key"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {provider.keyFields.map(field => (
                                                <input
                                                    key={field.key}
                                                    type="password"
                                                    value={state.keyValues[field.key] || ''}
                                                    onChange={e => onUpdateKeyValue(provider.id, field.key, e.target.value)}
                                                    placeholder={field.placeholder}
                                                    className={`w-full px-3 py-2 bg-neutral-800 border rounded-lg text-sm text-white placeholder-neutral-500 outline-none transition-colors ${
                                                        isInvalid ? 'border-red-500/50 focus:border-red-500' : 'border-neutral-700 focus:border-blue-500'
                                                    }`}
                                                    disabled={isValidating}
                                                />
                                            ))}
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => onValidate(provider.id)}
                                                    disabled={!allFieldsFilled || isValidating}
                                                    className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
                                                >
                                                    {isValidating ? (
                                                        <span className="flex items-center gap-1.5">
                                                            <Loader2 size={14} className="animate-spin" />
                                                            Validating...
                                                        </span>
                                                    ) : (
                                                        'Validate'
                                                    )}
                                                </button>
                                                {isInvalid && state.error && (
                                                    <span className="flex items-center gap-1 text-xs text-red-400">
                                                        <AlertCircle size={12} />
                                                        {state.error}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Divider */}
                    <div className="border-t border-neutral-700 my-5" />

                    {/* Model Selection */}
                    <div>
                        <h3 className="text-sm font-medium text-neutral-300 mb-3">Available Models</h3>

                        {!hasAnyValid ? (
                            <p className="text-sm text-neutral-500 italic">
                                Validate at least one provider to see available models.
                            </p>
                        ) : (
                            <div className="space-y-4">
                                {modelsByProvider.map(({ provider, models }) => {
                                    if (!validProviderIds.has(provider.id)) return null;

                                    return (
                                        <div key={provider.id}>
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <span className="text-neutral-400">{PROVIDER_ICONS[provider.id]}</span>
                                                <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                                                    {provider.name}
                                                </span>
                                            </div>
                                            <div className="space-y-1">
                                                {models.map(model => (
                                                    <label
                                                        key={`${model.type}-${model.id}`}
                                                        className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-neutral-800/50 cursor-pointer transition-colors"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={enabledModels.has(model.id)}
                                                            onChange={() => onToggleModel(model.id)}
                                                            className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer accent-blue-500"
                                                        />
                                                        <span className="text-sm text-neutral-200 flex-1">{model.name}</span>
                                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                                            model.type === 'Image'
                                                                ? 'bg-purple-500/15 text-purple-400'
                                                                : 'bg-sky-500/15 text-sky-400'
                                                        }`}>
                                                            {model.type === 'Image' ? <ImageIcon size={10} className="inline mr-0.5" /> : <Film size={10} className="inline mr-0.5" />}
                                                            {model.type}
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
