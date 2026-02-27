import React, { useEffect, useMemo, useState } from 'react';
import { X, User, Wallet, Bell, Activity, Trash2, Pencil } from 'lucide-react';
import { ApiLogEntry, clearApiLogs, subscribeApiLogs } from '../../services/apiLogService';
import { ScrambleText } from '../ScrambleText';

interface AccountModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type AccountTab = 'account' | 'balance' | 'logs' | 'updates';

const tabs: Array<{ id: AccountTab; label: string; icon: React.ReactNode }> = [
    { id: 'account', label: 'Account', icon: <User size={14} /> },
    { id: 'balance', label: 'Balance', icon: <Wallet size={14} /> },
    { id: 'logs', label: 'Logs', icon: <Activity size={14} /> },
    { id: 'updates', label: 'Updates', icon: <Bell size={14} /> }
];

const formatTime = (iso: string) => {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
};

const prettyUrl = (url: string) => {
    try {
        const parsed = new URL(url, window.location.origin);
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return url;
    }
};

export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<AccountTab>('account');
    const [logs, setLogs] = useState<ApiLogEntry[]>([]);
    const [hoveredTab, setHoveredTab] = useState<AccountTab | null>(null);
    const [hoveredSocial, setHoveredSocial] = useState<string | null>(null);
    const [hoveredUpdateButton, setHoveredUpdateButton] = useState(false);
    const [isProfileEditing, setIsProfileEditing] = useState(true);
    const [profileDraft, setProfileDraft] = useState({
        name: 'Sachin',
        email: 'sachin@yourcompany.com',
        workspace: 'AI Canvas',
        role: 'Owner'
    });
    const [profileSaved, setProfileSaved] = useState(profileDraft);

    useEffect(() => {
        if (!isOpen) return;
        const unsubscribe = subscribeApiLogs(setLogs);
        return unsubscribe;
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
    }, [isOpen, onClose]);

    const stats = useMemo(() => {
        const failed = logs.filter(l => !l.ok).length;
        const avgMs = logs.length > 0 ? Math.round(logs.reduce((sum, l) => sum + l.durationMs, 0) / logs.length) : 0;
        return { total: logs.length, failed, avgMs };
    }, [logs]);

    const activeTabLabel = tabs.find(t => t.id === activeTab)?.label || 'Account';

    const socialPlatforms = [
        { id: 'x', label: 'Connect to X', bg: 'bg-[#111111]', hoverBg: 'hover:bg-[#FFFFFF]', hoverText: 'hover:text-black' },
        { id: 'instagram', label: 'Connect to Instagram', bg: 'bg-[#2d1633]', hoverBg: 'hover:bg-[#E4405F]', hoverText: 'hover:text-white' },
        { id: 'tiktok', label: 'Connect to TikTok', bg: 'bg-[#0f0f10]', hoverBg: 'hover:bg-[#25F4EE]', hoverText: 'hover:text-black' },
        { id: 'youtube', label: 'Connect to YouTube', bg: 'bg-[#2a1111]', hoverBg: 'hover:bg-[#FF0000]', hoverText: 'hover:text-white' },
        { id: 'pinterest', label: 'Connect to Pinterest', bg: 'bg-[#2a0f14]', hoverBg: 'hover:bg-[#E60023]', hoverText: 'hover:text-white' },
        { id: 'linkedin', label: 'Connect to LinkedIn', bg: 'bg-[#0f1d2a]', hoverBg: 'hover:bg-[#0A66C2]', hoverText: 'hover:text-white' }
    ];

    const handleSaveProfile = () => {
        setProfileSaved(profileDraft);
        setIsProfileEditing(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80]">
            <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />

            <div className="absolute left-20 top-1/2 -translate-y-1/2 w-[980px] max-w-[calc(100vw-7rem)] h-[640px] max-h-[calc(100vh-4rem)] bg-[#111] text-white rounded-xl shadow-2xl overflow-hidden flex">
                <aside className="w-60 bg-[#0f0f0f] p-3">
                    <div className="mb-3 px-2 py-2">
                        <p className="text-xs text-neutral-500 uppercase tracking-wider">Settings Panel</p>
                        <p className="text-sm text-white">Lifetime Plan</p>
                    </div>

                    <nav className="space-y-1">
                        {tabs.map(tab => {
                            const isActive = activeTab === tab.id;
                            const isHovered = hoveredTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    onMouseEnter={() => setHoveredTab(tab.id)}
                                    onMouseLeave={() => setHoveredTab((prev) => (prev === tab.id ? null : prev))}
                                    className={`group flex items-center gap-2 w-full p-2 text-left transition-all duration-75 text-xs font-pixel ${isActive || isHovered
                                            ? 'bg-white text-black'
                                            : 'bg-transparent text-white hover:bg-white/10'
                                        }`}
                                >
                                    <div className={`${isActive || isHovered ? 'text-black' : 'text-neutral-400'}`}>
                                        {tab.icon}
                                    </div>
                                    <span className="truncate">
                                        <ScrambleText text={tab.label} isHovered={isHovered} speed="slow" />
                                    </span>
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                <section className="flex-1 bg-[#151515] p-5 overflow-y-auto">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-semibold text-white">{activeTabLabel}</h2>
                            <p className="text-xs text-neutral-500">Workspace controls and telemetry.</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {activeTab === 'account' && (
                        <div className="space-y-4">
                            <div className="bg-[#1a1a1a] rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs text-neutral-500 uppercase tracking-wider">Profile</p>
                                    {!isProfileEditing && (
                                        <button
                                            onClick={() => {
                                                setProfileDraft(profileSaved);
                                                setIsProfileEditing(true);
                                            }}
                                            className="w-7 h-7 rounded-md bg-[#232323] hover:bg-white hover:text-black flex items-center justify-center transition-colors text-neutral-300"
                                            title="Edit profile"
                                        >
                                            <Pencil size={12} />
                                        </button>
                                    )}
                                </div>
                                {isProfileEditing ? (
                                    <>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div>
                                                <p className="text-xs text-neutral-500 mb-1">Name</p>
                                                <input
                                                    value={profileDraft.name}
                                                    onChange={(e) => setProfileDraft(prev => ({ ...prev, name: e.target.value }))}
                                                    className="w-full bg-[#232323] text-neutral-100 px-3 py-2 rounded-md outline-none focus:ring-1 focus:ring-white/30"
                                                />
                                            </div>
                                            <div>
                                                <p className="text-xs text-neutral-500 mb-1">Email</p>
                                                <input
                                                    value={profileDraft.email}
                                                    onChange={(e) => setProfileDraft(prev => ({ ...prev, email: e.target.value }))}
                                                    className="w-full bg-[#232323] text-neutral-100 px-3 py-2 rounded-md outline-none focus:ring-1 focus:ring-white/30"
                                                />
                                            </div>
                                            <div>
                                                <p className="text-xs text-neutral-500 mb-1">Workspace</p>
                                                <input
                                                    value={profileDraft.workspace}
                                                    onChange={(e) => setProfileDraft(prev => ({ ...prev, workspace: e.target.value }))}
                                                    className="w-full bg-[#232323] text-neutral-100 px-3 py-2 rounded-md outline-none focus:ring-1 focus:ring-white/30"
                                                />
                                            </div>
                                            <div>
                                                <p className="text-xs text-neutral-500 mb-1">Role</p>
                                                <select
                                                    value={profileDraft.role}
                                                    onChange={(e) => setProfileDraft(prev => ({ ...prev, role: e.target.value }))}
                                                    className="w-full bg-[#232323] text-neutral-100 px-3 py-2 rounded-md outline-none focus:ring-1 focus:ring-white/30"
                                                >
                                                    <option>Owner</option>
                                                    <option>Admin</option>
                                                    <option>User</option>
                                                    <option>Shared View</option>
                                                    <option>Editor</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex justify-end">
                                            <button
                                                onClick={handleSaveProfile}
                                                className="px-3 py-2 rounded-md bg-[#252525] hover:bg-white hover:text-black text-xs font-medium transition-colors"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <p className="text-xs text-neutral-500">Name</p>
                                            <p className="text-neutral-100">{profileSaved.name}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-neutral-500">Email</p>
                                            <p className="text-neutral-100">{profileSaved.email}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-neutral-500">Workspace</p>
                                            <p className="text-neutral-100">{profileSaved.workspace}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-neutral-500">Role</p>
                                            <p className="text-neutral-100">{profileSaved.role}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="bg-[#1a1a1a] rounded-lg p-4">
                                <p className="text-xs text-neutral-500 mb-3 uppercase tracking-wider">Social Connections</p>
                                <div className="grid grid-cols-3 gap-3">
                                    {socialPlatforms.map(platform => {
                                        const isHovered = hoveredSocial === platform.id;
                                        return (
                                            <button
                                                key={platform.id}
                                                onMouseEnter={() => setHoveredSocial(platform.id)}
                                                onMouseLeave={() => setHoveredSocial((prev) => (prev === platform.id ? null : prev))}
                                                className={`h-14 rounded-md text-xs font-pixel transition-all duration-75 ${platform.bg} ${platform.hoverBg} ${platform.hoverText} text-white`}
                                            >
                                                <ScrambleText text={platform.label} isHovered={isHovered} speed="slow" />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'balance' && (
                        <div className="space-y-3">
                            <div className="bg-[#1a1a1a] rounded-lg p-4">
                                <p className="text-xs text-neutral-500 mb-2 uppercase tracking-wider">Plan</p>
                                <p className="text-base text-white font-medium">Lifetime Plan</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-[#1a1a1a] rounded-lg p-4">
                                    <p className="text-xs text-neutral-500 uppercase tracking-wider">Google Credits</p>
                                    <p className="text-2xl text-white font-semibold mt-1">$142.80</p>
                                </div>
                                <div className="bg-[#1a1a1a] rounded-lg p-4">
                                    <p className="text-xs text-neutral-500 uppercase tracking-wider">OpenAI Credits</p>
                                    <p className="text-2xl text-white font-semibold mt-1">$84.20</p>
                                </div>
                                <div className="bg-[#1a1a1a] rounded-lg p-4">
                                    <p className="text-xs text-neutral-500 uppercase tracking-wider">Kling Balance</p>
                                    <p className="text-2xl text-white font-semibold mt-1">9,250</p>
                                </div>
                                <div className="bg-[#1a1a1a] rounded-lg p-4">
                                    <p className="text-xs text-neutral-500 uppercase tracking-wider">Kie.ai Credits</p>
                                    <p className="text-2xl text-white font-semibold mt-1">$61.00</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'updates' && (
                        <div className="space-y-3">
                            <div className="bg-[#1a1a1a] rounded-lg p-4">
                                <p className="text-xs text-neutral-500 uppercase tracking-wider">Currently on version</p>
                                <p className="text-sm text-neutral-200 mt-1">v0.0.0.1</p>
                                <p className="text-xs text-neutral-500 uppercase tracking-wider mt-3">Latest check target</p>
                                <p className="text-sm text-neutral-200 mt-1">v0.0.0.2</p>
                                <button
                                    onMouseEnter={() => setHoveredUpdateButton(true)}
                                    onMouseLeave={() => setHoveredUpdateButton(false)}
                                    className="w-full mt-4 h-16 rounded-md bg-[#232323] hover:bg-white hover:text-black transition-all duration-75 text-sm font-pixel text-white"
                                >
                                    <ScrambleText text="Check for Updates" isHovered={hoveredUpdateButton} speed="slow" />
                                </button>
                            </div>

                            <div className="bg-[#1a1a1a] rounded-lg p-3 max-h-[260px] overflow-y-auto space-y-3">
                                <div className="bg-[#202020] rounded-md p-3">
                                    <p className="text-xs text-neutral-400 uppercase tracking-wider">v0.0.0.2</p>
                                    <p className="text-sm text-neutral-100 mt-1">Added account popup with logs and provider-focused balance cards.</p>
                                </div>
                                <div className="bg-[#202020] rounded-md p-3">
                                    <p className="text-xs text-neutral-400 uppercase tracking-wider">v0.0.0.1</p>
                                    <p className="text-sm text-neutral-100 mt-1">Improved node controls and added enhanced generation model options.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'logs' && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-[#1a1a1a] rounded-lg p-3">
                                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider">AI Calls</p>
                                    <p className="text-2xl text-white font-semibold">{stats.total}</p>
                                </div>
                                <div className="bg-[#1a1a1a] rounded-lg p-3">
                                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Failed</p>
                                    <p className="text-2xl text-white font-semibold">{stats.failed}</p>
                                </div>
                                <div className="bg-[#1a1a1a] rounded-lg p-3">
                                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Avg Latency</p>
                                    <p className="text-2xl text-white font-semibold">{stats.avgMs}ms</p>
                                </div>
                            </div>

                            <p className="text-xs text-neutral-500">
                                Showing only AI generation-related calls made through the app.
                            </p>

                            <div className="flex justify-end">
                                <button
                                    onClick={clearApiLogs}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1f1f1f] hover:bg-white hover:text-black text-xs font-medium transition-colors"
                                >
                                    <Trash2 size={12} />
                                    Clear Logs
                                </button>
                            </div>

                            <div className="bg-[#1a1a1a] rounded-lg overflow-hidden">
                                <div className="grid grid-cols-[160px_1fr_160px_90px] text-[11px] text-neutral-500 uppercase tracking-wide bg-[#202020]">
                                    <div className="p-2">Time</div>
                                    <div className="p-2">Operation</div>
                                    <div className="p-2">Status</div>
                                    <div className="p-2">Duration</div>
                                </div>

                                <div className="max-h-[330px] overflow-y-auto">
                                    {logs.length === 0 && (
                                        <div className="p-4 text-sm text-neutral-500">No AI generation calls logged yet in this browser session.</div>
                                    )}
                                    {logs.map(log => (
                                        <div
                                            key={log.id}
                                            className="grid grid-cols-[160px_1fr_160px_90px] text-xs text-neutral-300 hover:bg-white/5 transition-colors"
                                        >
                                            <div className="p-2">{formatTime(log.timestamp)}</div>
                                            <div className="p-2 truncate" title={`${log.operation}${log.model ? ` • ${log.model}` : ''}`}>
                                                <span className="font-medium text-neutral-100">{log.operation}</span>
                                                {log.model && <span className="text-neutral-500"> • {log.model}</span>}
                                            </div>
                                            <div className={`p-2 font-medium ${log.outcome === 'Passed' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {log.outcome}
                                                <span className="text-neutral-500 ml-1">({log.status ?? 'ERR'})</span>
                                            </div>
                                            <div className="p-2">{log.durationMs}ms</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};
