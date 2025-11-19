// app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Stub de checkout.
 * En producción real aquí se integrará Stripe u otro procesador de pagos.
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      message:
        "Checkout desactivado en esta versión. La integración real con pagos se añadirá más adelante.",
    },
    { status: 501 }
  );
}
