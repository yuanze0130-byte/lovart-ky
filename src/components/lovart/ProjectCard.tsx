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
        <div className="group relative cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white transition-all duration-300 hover:shadow-lg">
            <div className="relative aspect-[4/3] overflow-hidden bg-gray-50">
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
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-300">
                        <div className="flex flex-col items-center gap-3 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black text-xl font-bold text-white shadow-sm">D</div>
                            <div>
                                <div className="text-sm font-medium text-gray-500">暂无封面</div>
                                <div className="mt-1 max-w-[180px] truncate text-xs text-gray-400">{title}</div>
                            </div>
                        </div>
                    </div>
                )}

                {(onRename || onDelete) && (
                    <div
                        className="absolute right-2 top-2 z-20 opacity-0 transition-opacity group-hover:opacity-100"
                        ref={menuRef}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                setMenuOpen((prev) => !prev);
                            }}
                            className="rounded-lg bg-white/90 p-1.5 shadow-sm backdrop-blur-sm hover:bg-white"
                        >
                            <MoreHorizontal size={16} className="text-gray-600" />
                        </button>

                        {menuOpen && (
                            <div className="absolute right-0 mt-2 w-40 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
                                {onRename && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setMenuOpen(false);
                                            onRename();
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
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
                                        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
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
                <h3 className="truncate font-medium text-gray-900">{title}</h3>
                <p className="mt-1 text-xs text-gray-500">{date}</p>
            </div>
        </div>
    );
}
