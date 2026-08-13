'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  Coins,
  ImageIcon,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
} from 'lucide-react';
import { DashboardSidebar } from '@/components/lovart/DashboardSidebar';
import type { ModelPricingCatalog, PricingMediaType } from '@/lib/model-pricing-catalog';
import { AI_TOOL_CREDIT_COSTS } from '@/lib/ai-tool-pricing';

type MediaFilter = 'all' | PricingMediaType;

const MEDIA_FILTERS: Array<{ id: MediaFilter; label: string }> = [
  { id: 'all', label: '全部模型' },
  { id: 'image', label: '图片生成' },
  { id: 'video', label: '视频生成' },
];

function PricingCard({ item }: { item: ModelPricingCatalog['items'][number] }) {
  const MediaIcon = item.mediaType === 'image' ? ImageIcon : Video;

  return (
    <article className={`rounded-3xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${item.available ? 'border-slate-200' : 'border-amber-200 bg-amber-50/40'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.mediaType === 'image' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
            <MediaIcon size={19} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-950">{item.label}</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">{item.provider}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.available ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
          {item.available ? '可用' : '待核价'}
        </span>
      </div>

      <p className="mt-4 min-h-10 text-sm leading-5 text-slate-600">{item.description}</p>

      {item.available ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
          {item.specs.map((spec, index) => (
            <div
              key={`${spec.label}-${spec.credits}`}
              className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${index > 0 ? 'border-t border-slate-200' : ''}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700">{spec.label}</p>
                {spec.note && <p className="mt-0.5 text-[11px] text-slate-500">{spec.note}</p>}
              </div>
              <div className="flex shrink-0 items-baseline gap-1 text-violet-700">
                <strong className="text-lg tabular-nums">{spec.credits}</strong>
                <span className="text-xs font-medium">积分/次</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-white/70 px-3.5 py-3 text-xs leading-5 text-amber-900">
          {item.note}
        </div>
      )}

      {item.available && item.note && (
        <p className="mt-3 text-xs leading-5 text-slate-500">{item.note}</p>
      )}
    </article>
  );
}

export default function ModelPricingClient({ catalog }: { catalog: ModelPricingCatalog }) {
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [providerFilter, setProviderFilter] = useState('全部渠道');
  const [query, setQuery] = useState('');

  const providers = useMemo(() => [
    '全部渠道',
    ...Array.from(new Set(catalog.items.map((item) => item.provider))).sort((a, b) => a.localeCompare(b)),
  ], [catalog.items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return catalog.items.filter((item) => {
      if (mediaFilter !== 'all' && item.mediaType !== mediaFilter) return false;
      if (providerFilter !== '全部渠道' && item.provider !== providerFilter) return false;
      if (!normalizedQuery) return true;
      return `${item.label} ${item.provider} ${item.description}`.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [catalog.items, mediaFilter, providerFilter, query]);

  const availableCount = catalog.items.filter((item) => item.available).length;

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="hidden lg:block"><DashboardSidebar /></div>

      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-slate-950">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-black text-white">
              <Sparkles size={18} />
            </span>
            <span>Doodleverse 帮助中心</span>
          </Link>
          <Link href="/canvas" className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800">
            返回画布
            <ArrowLeft className="rotate-180" size={15} />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 pb-20 pt-10 lg:px-8 lg:pl-24">
        <section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white px-6 py-10 shadow-sm sm:px-10 lg:px-14">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-200/50 blur-3xl" />
          <div className="absolute -bottom-28 right-40 h-64 w-64 rounded-full bg-sky-200/50 blur-3xl" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
              <Coins size={14} />
              模型积分文档
            </span>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">透明、可核验的模型价格</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
              这里展示 Doodleverse 当前图片与视频模型的生成积分。生成按钮上的实时报价与服务端实际扣分使用同一套价格配置。
            </p>
            <div className="mt-7 flex flex-wrap gap-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3.5 py-2"><CheckCircle2 size={15} className="text-emerald-600" />{availableCount} 个已核价模型</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3.5 py-2"><ShieldCheck size={15} className="text-sky-600" />失败任务自动退还积分</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3.5 py-2">更新于 {catalog.updatedAt}</span>
            </div>
          </div>
        </section>

        <section id="models" className="pt-12">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">Pricing</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">模型价格目录</h2>
              <p className="mt-2 text-sm text-slate-500">批量生成按实际生成张数或任务数计费。</p>
            </div>
            <div className="relative w-full lg:w-80">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索模型或渠道"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {MEDIA_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setMediaFilter(filter.id)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${mediaFilter === filter.id ? 'bg-black text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-400"
              aria-label="按渠道筛选"
            >
              {providers.map((provider) => <option key={provider}>{provider}</option>)}
            </select>
          </div>

          <div className="mt-3 text-xs text-slate-500">共找到 {filteredItems.length} 个模型</div>
          {filteredItems.length > 0 ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => <PricingCard key={`${item.mediaType}-${item.id}`} item={item} />)}
            </div>
          ) : (
            <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-500">没有找到匹配的模型</div>
          )}
        </section>

        <section className="pt-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">Canvas AI</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">画布 AI 工具积分</h2>
            <p className="mt-2 text-sm text-slate-500">只有实际调用上游 AI 时扣分；本地抽帧、表格编辑和普通画布操作不扣分。</p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              ['Agent 创意对话', AI_TOOL_CREDIT_COSTS.agentChat, '仅创意问答扣分；Agent 发起图片或视频任务时按对应模型另行计费。'],
              ['剧本创作', AI_TOOL_CREDIT_COSTS.scriptWriting, '生成结构化片名、角色、场次和分镜建议。'],
              ['视频拆解', AI_TOOL_CREDIT_COSTS.videoBreakdown, '上传关键帧进行镜头、运镜、画面与旁白分析。'],
            ].map(([title, credits, description]) => (
              <div key={title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-semibold text-slate-950">{title}</h3>
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">{credits} 积分/次</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="billing" className="pt-14">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><ShieldCheck size={20} /></span>
                <h2 className="text-xl font-semibold">计费与退款规则</h2>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  ['生成前报价', '选择模型、分辨率、时长和参考图后，按钮会显示本次准确积分。'],
                  ['服务端扣分', '实际扣分由服务端重新核算，浏览器不能自行修改价格。'],
                  ['失败自动退款', '已扣分任务若生成失败，系统会按原请求退回对应积分。'],
                  ['未核价即停用', '上游没有可靠价格的模型不会发起任务，也不会发生错误扣分。'],
                ].map(([title, description]) => (
                  <div key={title} className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{description}</p>
                  </div>
                ))}
              </div>
            </div>

            <aside className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
              <CircleHelp size={24} className="text-violet-300" />
              <h2 className="mt-5 text-xl font-semibold">价格为什么会变化？</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                上游模型会调整价格或规格。Doodleverse 更新价格版本后，本页与生成器报价会同步变化，已经完成的历史任务不会补扣。
              </p>
              <div className="mt-6 border-t border-white/10 pt-5 text-[11px] leading-5 text-slate-400">
                图片价格版本：{catalog.imagePriceVersion}<br />
                视频价格版本：{catalog.videoPriceVersion}
              </div>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}
