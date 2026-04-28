import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { getCreditOrderByOrderNo } from '@/lib/payments/orders';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const orderNo = request.nextUrl.searchParams.get('orderNo')?.trim();

    if (!orderNo) {
      return NextResponse.json({ error: 'orderNo is required' }, { status: 400 });
    }

    const order = await getCreditOrderByOrderNo(orderNo);
    if (!order || order.user_id !== user.id) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      orderNo: order.order_no,
      status: order.status,
      amount: order.amount,
      credits: order.credits,
      bonusCredits: order.bonus_credits,
      totalCredits: order.credits + order.bonus_credits,
      paidAt: order.paid_at,
      creditsGranted: Boolean(order.credits_granted_at),
      creditsGrantedAt: order.credits_granted_at,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: 'Failed to query order status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
