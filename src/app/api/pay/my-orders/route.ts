import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { listUserCreditOrders } from '@/lib/payments/orders';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const limitValue = Number(request.nextUrl.searchParams.get('limit') || 20);
    const limit = Number.isFinite(limitValue) ? Math.min(Math.max(Math.trunc(limitValue), 1), 100) : 20;
    const orders = await listUserCreditOrders(user.id, limit);

    return NextResponse.json({
      success: true,
      orders: orders.map((order) => ({
        ...order,
        total_credits: order.credits + order.bonus_credits,
      })),
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: 'Failed to load orders',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
