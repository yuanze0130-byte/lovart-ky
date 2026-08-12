import type { Metadata } from 'next';
import ModelPricingClient from '@/components/help/ModelPricingClient';
import { buildModelPricingCatalog } from '@/lib/model-pricing-catalog';

export const metadata: Metadata = {
  title: '模型价格与计费帮助 | Doodleverse',
  description: '查看 Doodleverse 图片与视频模型的实时积分价格、计费规则和退款说明。',
};

export default function HelpPage() {
  return <ModelPricingClient catalog={buildModelPricingCatalog()} />;
}
