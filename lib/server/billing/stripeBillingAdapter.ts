import "server-only";
import Stripe from "stripe";
import { getFirestore } from "firebase-admin/firestore";
import { defaultAdminApp } from "../auth/firebaseAdminAuthAdapter";
import type { BillingCommandRepository, BillingConfigurationRepository, BillingProviderGateway } from "./stripeBillingService";

export class ProductionStripeGateway implements BillingProviderGateway {
  private client?: Stripe;
  private stripe(): Stripe { const key = process.env.STRIPE_SECRET_KEY; if (!key) throw new Error("billing provider unavailable"); return this.client ??= new Stripe(key, { apiVersion: "2026-01-28.clover" }); }
  async createCheckoutSession(i: Parameters<BillingProviderGateway["createCheckoutSession"]>[0]) { const s = await this.stripe().checkout.sessions.create({ mode: "subscription", customer: i.customerId, line_items: [{ price: i.priceId, quantity: 1 }], success_url: i.successUrl, cancel_url: i.cancelUrl, allow_promotion_codes: true }, { idempotencyKey: i.providerIdempotencyKey }); if (!s.url) throw new Error("provider response invalid"); return Object.freeze({ redirectUrl: s.url, providerReference: s.id }); }
  async createPortalSession(i: Parameters<BillingProviderGateway["createPortalSession"]>[0]) { const s = await this.stripe().billingPortal.sessions.create({ customer: i.customerId, return_url: i.returnUrl }, { idempotencyKey: i.providerIdempotencyKey }); return Object.freeze({ redirectUrl: s.url, providerReference: s.id }); }
}
export class FirestoreBillingConfigurationRepository implements BillingConfigurationRepository {
  async getForTenant(tenantId: string) { const snap = await getFirestore(defaultAdminApp()).doc(`tenants/${tenantId}/billing/account`).get(); if (!snap.exists) return; const d = snap.data()!; return Object.freeze({ tenantId, customerId: d.stripeCustomerId, mappingVersion: d.mappingVersion, checkoutPriceId: d.checkoutPriceId || process.env.STRIPE_INTRO_PRICE_ID }); }
}
export class FirestoreBillingCommandRepository implements BillingCommandRepository {
  private db = getFirestore(defaultAdminApp());
  private ref(i: { tenantId: string; action: string; idempotencyKey: string }) { return this.db.doc(`tenants/${i.tenantId}/billingCommands/${i.action}:${i.idempotencyKey}`); }
  reserve(i: Parameters<BillingCommandRepository["reserve"]>[0]) { return this.db.runTransaction(async tx => { const ref = this.ref(i), snap = await tx.get(ref); if (!snap.exists) { tx.create(ref, { schemaVersion: "billing-command.v1", action: i.action, fingerprint: i.fingerprint, commandId: i.commandId, status: "running", createdAt: i.createdAt }); return { status: "started" as const }; } const d = snap.data()!; if (d.fingerprint !== i.fingerprint) return { status: "conflict" as const }; if (d.status === "completed" && d.receipt?.redirectUrl && d.receipt?.commandId) return { status: "completed" as const, receipt: Object.freeze(d.receipt) }; return { status: "running" as const }; }); }
  complete(i: Parameters<BillingCommandRepository["complete"]>[0]) { return this.db.runTransaction(async tx => { const ref = this.ref(i), snap = await tx.get(ref); if (!snap.exists || snap.data()?.fingerprint !== i.fingerprint || snap.data()?.status !== "running") return false; tx.update(ref, { status: "completed", receipt: i.receipt, completedAt: i.completedAt }); return true; }); }
  async abandon(i: Parameters<BillingCommandRepository["abandon"]>[0]) { await this.db.runTransaction(async tx => { const ref = this.ref(i), snap = await tx.get(ref); if (snap.exists && snap.data()?.fingerprint === i.fingerprint && snap.data()?.status === "running") tx.delete(ref); }); }
}
