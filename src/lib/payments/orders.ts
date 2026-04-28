import { ensureUserCredits } from '@/lib/credits';
import { createServiceRoleSupabaseClient, type Json } from '@/lib/supabase';

export type CreditPackageRow = {
  id: string;
  code: string;
  name: string;
  price: number;
  credits: number;
  bonus_credits: number;
  currency: string;
  payment_provider: string;
  payment_channel: string;
  enabled: boolean;
  is_recommended: boolean;
  sort_order: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type CreditOrderRow = {
  id: string;
  order_no: string;
  user_id: string;
  package_id: string | null;
  package_code: string | null;
  title: string | null;
  amount: number;
  credits: number;
  bonus_credits: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded';
  payment_provider: string;
  payment_channel: string;
  provider_order_id: string | null;
  provider_trade_no: string | null;
  provider_status: string | null;
  notify_verified: boolean;
  paid_at: string | null;
  credits_granted_at: string | null;
  refunded_at: string | null;
  client_ip: string | null;
  user_agent: string | null;
  extra: Json;
  created_at: string;
  updated_at: string;
};

function createOrderNo() {
  const now = new Date();
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = Math.random().toString().slice(2, 8);
  return `CR${timestamp}${suffix}`;
}

export async function listEnabledCreditPackages() {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from('credit_packages' as never)
    .select('*')
    .eq('enabled', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as CreditPackageRow[];
}

export async function getCreditPackageByCode(code: string) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from('credit_packages' as never)
    .select('*')
    .eq('code', code)
    .eq('enabled', true)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as CreditPackageRow | null;
}

export async function createCreditOrder(params: {
  userId: string;
  packageRow: CreditPackageRow;
  title?: string;
  clientIp?: string | null;
  userAgent?: string | null;
}) {
  const supabase = createServiceRoleSupabaseClient();
  const orderNo = createOrderNo();
  const title = params.title?.trim() || `${params.packageRow.name} - ${params.packageRow.credits + params.packageRow.bonus_credits}积分`;

  const payload = {
    order_no: orderNo,
    user_id: params.userId,
    package_id: params.packageRow.id,
    package_code: params.packageRow.code,
    title,
    amount: Number(params.packageRow.price),
    credits: params.packageRow.credits,
    bonus_credits: params.packageRow.bonus_credits,
    currency: params.packageRow.currency,
    status: 'pending',
    payment_provider: params.packageRow.payment_provider,
    payment_channel: params.packageRow.payment_channel,
    client_ip: params.clientIp || null,
    user_agent: params.userAgent || null,
  };

  const { data, error } = await supabase
    .from('credit_orders' as never)
    .insert(payload as never)
    .select('*')
    .single();

  if (error) throw error;
  return data as CreditOrderRow;
}

export async function updateCreditOrderPaymentRequest(orderNo: string, extra: Record<string, Json>, providerOrderId?: string | null) {
  const supabase = createServiceRoleSupabaseClient();
  const updatePayload: Record<string, unknown> = {
    extra,
  };
  if (providerOrderId) {
    updatePayload.provider_order_id = providerOrderId;
  }

  const { data, error } = await supabase
    .from('credit_orders' as never)
    .update(updatePayload as never)
    .eq('order_no', orderNo)
    .select('*')
    .single();

  if (error) throw error;
  return data as CreditOrderRow;
}

export async function getCreditOrderByOrderNo(orderNo: string) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from('credit_orders' as never)
    .select('*')
    .eq('order_no', orderNo)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as CreditOrderRow | null;
}

export async function listUserCreditOrders(userId: string, limit = 20) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from('credit_orders' as never)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as CreditOrderRow[];
}

export async function recordPaymentEvent(params: {
  provider?: string;
  eventType?: string;
  orderNo?: string | null;
  providerOrderId?: string | null;
  providerTradeNo?: string | null;
  verified?: boolean;
  processed?: boolean;
  payload: Json;
  processingResult?: Json;
}) {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase.from('payment_events' as never).insert({
    provider: params.provider || 'xunhu',
    event_type: params.eventType || 'notify',
    order_no: params.orderNo || null,
    provider_order_id: params.providerOrderId || null,
    provider_trade_no: params.providerTradeNo || null,
    verified: params.verified ?? false,
    processed: params.processed ?? false,
    payload: params.payload,
    processing_result: params.processingResult || null,
  } as never);

  if (error) throw error;
}

export async function grantCreditsForPaidOrder(params: {
  orderNo: string;
  providerStatus?: string | null;
  providerTradeNo?: string | null;
  providerOrderId?: string | null;
  notifyVerified?: boolean;
  payload?: Json;
}) {
  const supabase = createServiceRoleSupabaseClient();
  const order = await getCreditOrderByOrderNo(params.orderNo);
  if (!order) {
    throw new Error('CREDIT_ORDER_NOT_FOUND');
  }

  if (order.credits_granted_at) {
    return {
      order,
      alreadyGranted: true as const,
      totalGrantedCredits: order.credits + order.bonus_credits,
    };
  }

  const totalGrantedCredits = order.credits + order.bonus_credits;
  const nowIso = new Date().toISOString();
  const currentCredits = await ensureUserCredits(order.user_id);
  const nextCredits = currentCredits.credits + totalGrantedCredits;

  const { data: updatedCredits, error: updateCreditsError } = await supabase
    .from('user_credits')
    .update({ credits: nextCredits })
    .eq('user_id', order.user_id)
    .eq('credits', currentCredits.credits)
    .select('*')
    .maybeSingle();

  if (updateCreditsError) {
    throw updateCreditsError;
  }

  if (!updatedCredits) {
    throw new Error('CREDIT_BALANCE_CONFLICT');
  }

  const nextExtra = {
    ...(order.extra && typeof order.extra === 'object' && !Array.isArray(order.extra) ? order.extra as Record<string, Json> : {}),
    xunhuNotifyPayload: params.payload || null,
  };

  const { data: updatedOrder, error: updateOrderError } = await supabase
    .from('credit_orders' as never)
    .update({
      status: 'paid',
      paid_at: order.paid_at || nowIso,
      credits_granted_at: nowIso,
      notify_verified: params.notifyVerified ?? true,
      provider_status: params.providerStatus || order.provider_status,
      provider_trade_no: params.providerTradeNo || order.provider_trade_no,
      provider_order_id: params.providerOrderId || order.provider_order_id,
      extra: nextExtra,
    } as never)
    .eq('order_no', order.order_no)
    .is('credits_granted_at', null)
    .select('*')
    .maybeSingle();

  if (updateOrderError) {
    throw updateOrderError;
  }

  if (!updatedOrder) {
    return {
      order: await getCreditOrderByOrderNo(order.order_no),
      alreadyGranted: true as const,
      totalGrantedCredits,
    };
  }

  await supabase.from('credit_transactions' as never).insert({
    user_id: order.user_id,
    amount: totalGrantedCredits,
    type: 'recharge',
    description: `充值订单 ${order.order_no} 到账 ${totalGrantedCredits} 积分`,
    reference_id: order.id,
    order_no: order.order_no,
    meta: {
      package_code: order.package_code,
      credits: order.credits,
      bonus_credits: order.bonus_credits,
      amount: order.amount,
      payment_provider: order.payment_provider,
      payment_channel: order.payment_channel,
    },
  } as never);

  return {
    order: updatedOrder as CreditOrderRow,
    alreadyGranted: false as const,
    totalGrantedCredits,
  };
}
