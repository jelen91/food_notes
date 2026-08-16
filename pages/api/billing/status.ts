import { NextApiRequest, NextApiResponse } from 'next';
import { requireAccount } from '../../../lib/apiAuth';
import { getEntitlement, hasAccess, toBillingStatus } from '../../../lib/billing';
import { nextStepPath } from '../../../lib/onboarding';
import { toPublicAccount } from '../../../lib/accounts';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Identita jen ze session – `accountId` z query nebo těla se ignoruje.
  const account = await requireAccount(req, res);
  if (!account) return;

  try {
    const entitlement = await getEntitlement(account.accountId);
    return res.json({
      account: toPublicAccount(account),
      billing: toBillingStatus(entitlement),
      next: nextStepPath(account.onboarding, hasAccess(entitlement), account.slug),
    });
  } catch (error) {
    console.error('stav platby se nepodařilo načíst:', (error as Error).message);
    return res.status(500).json({ error: 'Stav se nepodařilo načíst.' });
  }
}
