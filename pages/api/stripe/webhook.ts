import { NextApiRequest, NextApiResponse } from 'next';
import type Stripe from 'stripe';
import { getStripe, toEventInput } from '../../../lib/stripe';
import { handleStripeEvent, mongoBillingStore } from '../../../lib/billing';
import { ensureIndexes } from '../../../lib/db';

// Podpis se ověřuje nad syrovým tělem, takže parser musí zůstat vypnutý.
export const config = {
  api: { bodyParser: false },
};

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('webhook: chybí STRIPE_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Not configured' });
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ error: 'Missing signature' });

  let event: Stripe.Event;
  try {
    const raw = await readRawBody(req);
    event = getStripe().webhooks.constructEvent(raw, signature as string, secret);
  } catch (err) {
    // Neplatný podpis = požadavek není od Stripe. Nic se nezpracovává.
    console.warn('webhook: neplatný podpis');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    await ensureIndexes();
    const outcome = await handleStripeEvent(toEventInput(event), mongoBillingStore);
    // Logujeme jen metadata události, nikdy její obsah.
    console.info(`webhook ${event.type} ${event.id} → ${outcome}`);
    return res.status(200).json({ received: true, outcome });
  } catch (error) {
    // 500 přiměje Stripe k opakovanému doručení; díky idempotenci je to bezpečné.
    console.error(`webhook ${event.id} selhal:`, (error as Error).message);
    return res.status(500).json({ error: 'Processing failed' });
  }
}
