import Image from 'next/image';
import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

interface ProjectCardProps {
    title: string;
    date: string;
    imageUrl?: string;
    onRename?: () => void;
    onDelete?: () => void;
}

export function ProjectCard({ title, date, imageUrl, onRename, onDelete }: ProjectCardProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        }

        if (menuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [menuOpen]);

    return (
        <div className="group relative bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-lg transition-all duration-300 cursor-pointer">
            <div className="aspect-[4/3] bg-gray-50 relative overflow-hidden">
                {imageUrl ? (
                    <Image
                        src={imageUrl}
                        alt={title}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 25vw"
                        className="object-cover"
                        unoptimized={imageUrl.startsWith('data:')}
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center text-gray-300">
                        <div className="flex flex-col items-center gap-3 text-center">
                            <div className="w-14 h-14 rounded-full bg-black text-white flex items-center justify-center text-xl font-bold shadow-sm">D</div>
                            <div>
                                <div className="text-sm font-medium text-gray-500">暂无封面</div>
                                <div className="text-xs text-gray-400 mt-1 truncate max-w-[180px]">{title}</div>
                            </div>
                        </div>
                    </div>
                )}

                {(onRename || onDelete) && (
                    <div
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                        ref={menuRef}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                setMenuOpen((prev) => !prev);
                            }}
                            className="p-1.5 bg-white/90 backdrop-blur-sm rounded-lg hover:bg-white shadow-sm"
                        >
                            <MoreHorizontal size={16} className="text-gray-600" />
                        </button>

                        {menuOpen && (
                            <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                                {onRename && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setMenuOpen(false);
                                            onRename();
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        <Pencil size={14} />
                                        重命名
                                    </button>
                                )}
                                {onDelete && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setMenuOpen(false);
                                            onDelete();
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
                                    >
                                        <Trash2 size={14} />
                                        删除项目
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="p-4">
                <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">{title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{date}</p>
            </div>
        </div>
    );
}
