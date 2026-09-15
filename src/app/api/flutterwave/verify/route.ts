import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { transaction_id } = await req.json();

    if (!transaction_id) {
      return NextResponse.json({ success: false, error: 'Missing transaction_id' }, { status: 400 });
    }

    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!secretKey) {
      console.error('FLUTTERWAVE_SECRET_KEY is not set');
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }

    const response = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();

    if (data.status === 'success' && data.data.status === 'successful') {
      return NextResponse.json({
        success: true,
        data: {
          transaction_id: data.data.id,
          tx_ref: data.data.tx_ref,
          amount: data.data.amount,
          currency: data.data.currency,
          customer: data.data.customer,
          payment_type: data.data.payment_type,
          meta: data.data.meta,
        },
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Transaction not successful',
      status: data.data?.status,
    });
  } catch (error: any) {
    console.error('Flutterwave verification error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Verification failed' },
      { status: 500 }
    );
  }
}
