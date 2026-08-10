"use client";

import React, { useState, useRef } from 'react';
import { MousePointer2, PlusSquare, Square, Type, Pencil, Image as ImageIcon, Video, Circle, Triangle, Hand, MapPin, Sparkles, Columns2, Paintbrush, Axis3D, Globe2, PersonStanding, Table2, Film, ScanSearch, AlignHorizontalSpaceAround } from 'lucide-react';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { getCreateMenuNodeDefinitions, type NodeCreateAction } from '@/lib/node-definitions';

interface FloatingToolbarProps {
    activeTool: string;
    onToolChange: (tool: string) => void;
    onAddImage: (file: File) => void;
    onAddVideo: (file: File) => void;
    onAddText: () => void;
    onAddShape: (type: 'square' | 'circle' | 'triangle' | 'star' | 'message' | 'arrow-left' | 'arrow-right') => void;
    onOpenImageGenerator: () => void;
    onOpenImageCompare?: () => void;
    onOpen3DDirector?: () => void;
    onOpenGlobalView?: () => void;
    onOpenMotionTransfer?: () => void;
    onOpenTableEditor?: () => void;
    onOpenVideoFrames?: () => void;
    onOpenVideoBreakdown?: () => void;
    onOpenNodeAlignment?: () => void;
    onOpenInpaint?: () => void;
    onOpenVideoGenerator?: () => void;
}

export function FloatingToolbar({ activeTool, onToolChange, onAddImage, onAddVideo, onAddText, onAddShape, onOpenImageGenerator, onOpenImageCompare, onOpen3DDirector, onOpenGlobalView, onOpenMotionTransfer, onOpenTableEditor, onOpenVideoFrames, onOpenVideoBreakdown, onOpenNodeAlignment, onOpenInpaint, onOpenVideoGenerator }: FloatingToolbarProps) {
    const [showUploadMenu, setShowUploadMenu] = useState(false);
    const [showShapeMenu, setShowShapeMenu] = useState(false);
    const [showSelectMenu, setShowSelectMenu] = useState(false);
    const [showTextMenu, setShowTextMenu] = useState(false);
    const [showDrawMenu, setShowDrawMenu] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const createMenuDefinitions = isFeatureEnabled('nodeRegistryMenus') ? getCreateMenuNodeDefinitions() : [];

    const createActions: Partial<Record<NodeCreateAction, (() => void) | undefined>> = {
        'image-generator': onOpenImageGenerator,
        'video-generator': onOpenVideoGenerator,
        'image-compare': onOpenImageCompare,
        'global-view': onOpenGlobalView,
        'motion-transfer': onOpenMotionTransfer,
        'table-editor': onOpenTableEditor,
        'video-frames': onOpenVideoFrames,
        'video-breakdown': onOpenVideoBreakdown,
        inpaint: onOpenInpaint,
    };

    const createMenuIcon = (icon: 'sparkles' | 'video' | 'compare' | 'globe' | 'motion' | 'table' | 'frames' | 'breakdown' | 'paintbrush') => {
        if (icon === 'video') return <Video size={16} />;
        if (icon === 'compare') return <Columns2 size={16} />;
        if (icon === 'globe') return <Globe2 size={16} />;
        if (icon === 'motion') return <PersonStanding size={16} />;
        if (icon === 'table') return <Table2 size={16} />;
        if (icon === 'frames') return <Film size={16} />;
        if (icon === 'breakdown') return <ScanSearch size={16} />;
        if (icon === 'paintbrush') return <Paintbrush size={16} />;
        return <Sparkles size={16} />;
    };

    const handleImageUploadClick = () => {
        imageInputRef.current?.click();
        setShowUploadMenu(false);
    };

    const handleVideoUploadClick = () => {
        videoInputRef.current?.click();
        setShowUploadMenu(false);
    };

    const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onAddImage(file);
        }
    };

    const handleVideoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onAddVideo(file);
        }
    };

    const handleShapeClick = (type: 'square' | 'circle' | 'triangle' | 'star' | 'message' | 'arrow-left' | 'arrow-right') => {
        onAddShape(type);
        setShowShapeMenu(false);
        onToolChange('select'); // Switch back to select after adding shape
    };

    return (
        <div className="absolute left-4 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-4">
            <div className="flex w-14 flex-col items-center gap-2 rounded-[1.25rem] border border-gray-200 bg-white/95 p-2 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-black/72 dark:shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
                {/* Select / Hand / Mark Tool */}
                <div
                    className="relative"
                    onMouseEnter={() => setShowSelectMenu(true)}
                    onMouseLeave={() => setShowSelectMenu(false)}
                >
                    <button
                        className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${['select', 'hand', 'mark'].includes(activeTool)
                            ? 'bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/8 dark:hover:text-white'
                            }`}
                        title="Select / Hand"
                    >
                        {activeTool === 'hand' ? <Hand size={20} /> : activeTool === 'mark' ? <MapPin size={20} /> : <MousePointer2 size={20} />}
                    </button>

                    {/* Select Submenu */}
                    {showSelectMenu && (
                        <div className="absolute left-full top-0 pl-3 z-50">
                            <div className="min-w-[160px] flex flex-col gap-1 rounded-xl border border-gray-100 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-gray-950/96 dark:shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
                                <button
                                    onClick={() => { onToolChange('select'); setShowSelectMenu(false); }}
                                    className={`flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/8 text-sm transition-colors text-left ${activeTool === 'select' ? 'bg-gray-50 text-black font-medium dark:bg-white/10 dark:text-white' : 'text-gray-700 dark:text-gray-200'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <MousePointer2 size={16} />
                                        <span>Select</span>
                                    </div>
                                    <span className="text-xs text-gray-400">V</span>
                                </button>
                                <button
                                    onClick={() => { onToolChange('hand'); setShowSelectMenu(false); }}
                                    className={`flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/8 text-sm transition-colors text-left ${activeTool === 'hand' ? 'bg-gray-50 text-black font-medium dark:bg-white/10 dark:text-white' : 'text-gray-700 dark:text-gray-200'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Hand size={16} />
                                        <span>Hand tool</span>
                                    </div>
                                    <span className="text-xs text-gray-400">H</span>
                                </button>
                                <button
                                    onClick={() => { onToolChange('mark'); setShowSelectMenu(false); }}
                                    className={`flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/8 text-sm transition-colors text-left ${activeTool === 'mark' ? 'bg-gray-50 text-black font-medium dark:bg-white/10 dark:text-white' : 'text-gray-700 dark:text-gray-200'} opacity-50 cursor-not-allowed`}
                                    disabled
                                    title="Temporarily disabled"
                                >
                                    <div className="flex items-center gap-3">
                                        <MapPin size={16} />
                                        <span>Mark</span>
                                    </div>
                                    <span className="text-xs text-gray-400">M</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Add/Upload Tool */}
                <div
                    className="relative"
                    onMouseEnter={() => setShowUploadMenu(true)}
                    onMouseLeave={() => setShowUploadMenu(false)}
                >
                    <button
                        className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${showUploadMenu ? 'bg-blue-50 text-blue-600 dark:bg-sky-400/14 dark:text-sky-200' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/8 dark:hover:text-gray-100'
                            }`}
                        title="Add / Upload"
                    >
                        <PlusSquare size={20} />
                    </button>

                    {/* Upload Menu */}
                    {showUploadMenu && (
                        <div className="absolute left-full top-1/2 z-50 -translate-y-1/2 pl-3">
                            <div className="flex max-h-[calc(100vh-80px)] min-w-[180px] flex-col gap-1 overflow-y-auto rounded-xl border border-gray-100 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-gray-950/96 dark:shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
                                <button
                                    onClick={handleImageUploadClick}
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/8 text-sm text-gray-700 dark:text-gray-200 transition-colors text-left"
                                >
                                    <ImageIcon size={16} />
                                    <span>上传图片</span>
                                </button>
                                <button
                                    onClick={handleVideoUploadClick}
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/8 text-sm text-gray-700 dark:text-gray-200 transition-colors text-left"
                                >
                                    <Video size={16} />
                                    <span>上传视频</span>
                                </button>
                                <div className="h-px bg-gray-200 my-1" />
                                {createMenuDefinitions.map((definition) => {
                                    const menu = definition.createMenu;
                                    if (!menu) return null;
                                    const action = createActions[menu.action];
                                    if (!action) return null;
                                    return (
                                        <React.Fragment key={definition.type}>
                                            <button
                                                onClick={() => {
                                                    action();
                                                    setShowUploadMenu(false);
                                                }}
                                                className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/8"
                                            >
                                                {createMenuIcon(menu.icon)}
                                                <span>{menu.label}</span>
                                            </button>
                                            {definition.type === 'image-compare' && onOpen3DDirector && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        onOpen3DDirector();
                                                        setShowUploadMenu(false);
                                                    }}
                                                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/8"
                                                >
                                                    <Axis3D size={16} />
                                                    <span>3D导演台</span>
                                                </button>
                                            )}
                                            {definition.type === 'video-breakdown' && onOpenNodeAlignment && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        onOpenNodeAlignment();
                                                        setShowUploadMenu(false);
                                                    }}
                                                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/8"
                                                >
                                                    <AlignHorizontalSpaceAround size={16} />
                                                    <span>节点对齐</span>
                                                </button>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Shape Tool */}
                <div
                    className="relative"
                    onMouseEnter={() => setShowShapeMenu(true)}
                    onMouseLeave={() => setShowShapeMenu(false)}
                >
                    <button
                        className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${activeTool === 'shape' || showShapeMenu
                            ? 'bg-gray-100 text-gray-900'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                        title="Shape"
                    >
                        <Square size={20} />
                    </button>

                    {/* Shape Submenu */}
                    {showShapeMenu && (
                        <div className="absolute left-full top-0 pl-3 z-50">
                            <div className="min-w-[200px] rounded-xl border border-gray-100 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-gray-950/96 dark:shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
                                <div className="mb-2 text-xs text-gray-500 font-medium">Shapes</div>
                                <div className="flex gap-2 mb-4">
                                    <button onClick={() => handleShapeClick('square')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><Square size={20} /></button>
                                    <button onClick={() => handleShapeClick('circle')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><Circle size={20} /></button>
                                    <button onClick={() => handleShapeClick('triangle')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><Triangle size={20} /></button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Text Tool */}
                <div
                    className="relative"
                    onMouseEnter={() => setShowTextMenu(true)}
                    onMouseLeave={() => setShowTextMenu(false)}
                >
                    <button
                        className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${activeTool === 'text' || showTextMenu
                            ? 'bg-blue-50 text-blue-600 dark:bg-sky-400/14 dark:text-sky-200'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/8 dark:hover:text-gray-100'
                            }`}
                        title="Text"
                    >
                        <Type size={20} />
                    </button>

                    {/* Text Submenu */}
                    {showTextMenu && (
                        <div className="absolute left-full top-0 pl-3 z-50">
                            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 p-2 min-w-[160px] flex flex-col gap-1">
                                <button
                                    onClick={() => {
                                        onToolChange('text');
                                        onAddText();
                                        setShowTextMenu(false);
                                    }}
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 transition-colors text-left"
                                >
                                    <Type size={16} />
                                    <span>Default Text</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                {/* Draw Tool */}
                <div
                    className="relative"
                    onMouseEnter={() => setShowDrawMenu(true)}
                    onMouseLeave={() => setShowDrawMenu(false)}
                >
                    <button
                        className={`flex items-center justify-center rounded-xl p-2.5 transition-all ${activeTool === 'draw' || showDrawMenu
                            ? 'bg-blue-50 text-blue-600 shadow-[0_0_0_1px_rgba(59,130,246,0.14)] dark:bg-sky-400/14 dark:text-sky-200 dark:shadow-[0_0_0_1px_rgba(56,189,248,0.18)]'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-100'
                            }`}
                        title="Draw"
                    >
                        <Pencil size={20} />
                    </button>

                    {/* Draw Submenu */}
                    {showDrawMenu && (
                        <div className="absolute left-full top-0 pl-3 z-50">
                            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 p-2 min-w-[160px] flex flex-col gap-1">
                                <button
                                    onClick={() => {
                                        onToolChange('draw');
                                        setShowDrawMenu(false);
                                    }}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-sm transition-colors text-left ${activeTool === 'draw' ? 'bg-gray-50 dark:bg-gray-800 text-black dark:text-white font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                                >
                                    <Pencil size={16} />
                                    <span>Pen</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Hidden File Inputs */}
                <input
                    type="file"
                    ref={imageInputRef}
                    className="hidden"
                    onChange={handleImageFileChange}
                    accept="image/*"
                />
                <input
                    type="file"
                    ref={videoInputRef}
                    className="hidden"
                    onChange={handleVideoFileChange}
                    accept="video/*"
                />
            </div>
        </div>
    );
}
