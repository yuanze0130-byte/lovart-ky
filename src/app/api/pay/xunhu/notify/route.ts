import { NextRequest, NextResponse } from 'next/server';
import { getCreditOrderByOrderNo, grantCreditsForPaidOrder, recordPaymentEvent } from '@/lib/payments/orders';
import { verifyXunhuNotification } from '@/lib/payments/xunhu';

function toPlainRecord(formData: FormData) {
  const record: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    record[key] = typeof value === 'string' ? value : value.name;
  }
  return record;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const payload = toPlainRecord(formData);
    const verified = verifyXunhuNotification(payload);
    const orderNo = String(payload.trade_order_id || payload.order_no || '').trim() || null;
    const providerOrderId = String(payload.trade_order_id || '').trim() || null;
    const providerTradeNo = String(payload.transaction_id || payload.open_order_id || payload.pay_order_id || '').trim() || null;
    const providerStatus = String(payload.status || '').trim() || null;

    await recordPaymentEvent({
      provider: 'xunhu',
      eventType: 'notify',
      orderNo,
      providerOrderId,
      providerTradeNo,
      verified,
      processed: false,
      payload,
    });

    if (!verified) {
      return new NextResponse('invalid', { status: 400 });
    }

    if (!orderNo) {
      return new NextResponse('missing order', { status: 400 });
    }

    const order = await getCreditOrderByOrderNo(orderNo);
    if (!order) {
      await recordPaymentEvent({
        provider: 'xunhu',
        eventType: 'notify_error',
        orderNo,
        providerOrderId,
        providerTradeNo,
        verified: true,
        processed: false,
        payload,
        processingResult: { error: 'CREDIT_ORDER_NOT_FOUND' },
      });
      return new NextResponse('order not found', { status: 404 });
    }

    const paidStatuses = new Set(['OD', 'SUCCESS', 'PAID']);
    if (!providerStatus || !paidStatuses.has(providerStatus.toUpperCase())) {
      await recordPaymentEvent({
        provider: 'xunhu',
        eventType: 'notify_ignored',
        orderNo,
        providerOrderId,
        providerTradeNo,
        verified: true,
        processed: false,
        payload,
        processingResult: { reason: 'UNPAID_OR_UNSUPPORTED_STATUS', providerStatus },
      });
      return new NextResponse('success');
    }

    const callbackAmount = Number(payload.total_fee || payload.money || 0);
    if (!Number.isFinite(callbackAmount) || callbackAmount <= 0) {
      return new NextResponse('invalid amount', { status: 400 });
    }

    if (Number(order.amount).toFixed(2) !== callbackAmount.toFixed(2)) {
      await recordPaymentEvent({
        provider: 'xunhu',
        eventType: 'notify_error',
        orderNo,
        providerOrderId,
        providerTradeNo,
        verified: true,
        processed: false,
        payload,
        processingResult: {
          error: 'AMOUNT_MISMATCH',
          expected: Number(order.amount).toFixed(2),
          actual: callbackAmount.toFixed(2),
        },
      });
      return new NextResponse('amount mismatch', { status: 400 });
    }

    const result = await grantCreditsForPaidOrder({
      orderNo,
      providerStatus,
      providerTradeNo,
      providerOrderId,
      notifyVerified: true,
      payload,
    });

    await recordPaymentEvent({
      provider: 'xunhu',
      eventType: 'notify_processed',
      orderNo,
      providerOrderId,
      providerTradeNo,
      verified: true,
      processed: true,
      payload,
      processingResult: {
        alreadyGranted: result.alreadyGranted,
        totalGrantedCredits: result.totalGrantedCredits,
      },
    });

    return new NextResponse('success');
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : 'notify error', { status: 500 });
  }
}
