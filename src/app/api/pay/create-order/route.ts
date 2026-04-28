import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { createCreditOrder, getCreditPackageByCode, updateCreditOrderPaymentRequest } from '@/lib/payments/orders';
import { createXunhuPayment } from '@/lib/payments/xunhu';
import type { Json } from '@/lib/supabase';

function getAppBaseUrl(request: NextRequest) {
  return process.env.XUNHU_NOTIFY_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as { packageCode?: string };
    const packageCode = String(body.packageCode || '').trim();

    if (!packageCode) {
      return NextResponse.json({ error: 'packageCode is required' }, { status: 400 });
    }

    const packageRow = await getCreditPackageByCode(packageCode);
    if (!packageRow) {
      return NextResponse.json({ error: '套餐不存在或已下架' }, { status: 404 });
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const userAgent = request.headers.get('user-agent');
    const order = await createCreditOrder({
      userId: user.id,
      packageRow,
      clientIp,
      userAgent,
    });

    const baseUrl = getAppBaseUrl(request);
    const notifyUrl = `${baseUrl.replace(/\/+$/, '')}/api/pay/xunhu/notify`;
    const returnUrl = `${baseUrl.replace(/\/+$/, '')}/credits`;

    const payment = await createXunhuPayment({
      orderNo: order.order_no,
      amount: Number(order.amount),
      title: order.title || `${packageRow.name} 积分充值`,
      notifyUrl,
      returnUrl,
    });

    const providerOrderId = (() => {
      if (!payment.raw || typeof payment.raw !== 'object') return null;
      const record = payment.raw as Record<string, unknown>;
      const data = record.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : null;
      const candidate = data?.trade_order_id || data?.order_id || record.trade_order_id || record.order_id;
      return typeof candidate === 'string' ? candidate : null;
    })();

    await updateCreditOrderPaymentRequest(order.order_no, {
      xunhuCreateOrderRequest: payment.request as unknown as Json,
      xunhuCreateOrderResponse: payment.raw as Json,
      payUrl: payment.payUrl,
    }, providerOrderId);

    return NextResponse.json({
      success: true,
      orderNo: order.order_no,
      amount: order.amount,
      credits: order.credits,
      bonusCredits: order.bonus_credits,
      totalCredits: order.credits + order.bonus_credits,
      status: order.status,
      paymentProvider: order.payment_provider,
      paymentChannel: order.payment_channel,
      payUrl: payment.payUrl,
      paymentResponse: payment.response,
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: 'Failed to create payment order',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
