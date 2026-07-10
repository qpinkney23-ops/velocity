import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const introPriceId = process.env.STRIPE_INTRO_PRICE_ID || "";

export async function POST() {
  try {
    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY environment variable." },
        { status: 500 }
      );
    }

    if (!introPriceId) {
      return NextResponse.json(
        { error: "Missing STRIPE_INTRO_PRICE_ID environment variable." },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2026-01-28.clover",
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: introPriceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/admin?checkout=success`,
      cancel_url: `${appUrl}/admin?checkout=cancelled`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      metadata: {
        product: "Velocity",
        plan: "intro_partner",
      },
      subscription_data: {
        metadata: {
          product: "Velocity",
          plan: "intro_partner",
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("Stripe checkout error:", e?.message || e);

    return NextResponse.json(
      { error: e?.message || "Failed to create Stripe checkout session." },
      { status: 500 }
    );
  }
}