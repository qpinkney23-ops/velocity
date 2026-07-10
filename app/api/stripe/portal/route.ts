import { NextResponse } from "next/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
})

export async function POST() {
  try {
    // ⚠️ For now: use a fixed test customer
    // Later this will be dynamic per company
    const customerId = process.env.STRIPE_TEST_CUSTOMER_ID

    if (!customerId) {
      return NextResponse.json(
        { error: "Missing STRIPE_TEST_CUSTOMER_ID" },
        { status: 500 }
      )
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error("Stripe portal error:", err.message)

    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    )
  }
}