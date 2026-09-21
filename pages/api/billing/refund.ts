import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAccount } from '../../../lib/apiAuth';
import { getEntitlement } from '../../../lib/billing';
import { enforceRateLimit, requireSameOrigin } from '../../../lib/rateLimit';
import { getRefundStatus, receiveWithdrawal, requestGuaranteeRefund } from '../../../lib/refunds/service';

export const config = { api: { bodyParser: { sizeLimit: '2kb' } }, maxDuration: 120 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.method === 'POST' && !requireSameOrigin(req, res)) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  if (req.method === 'POST') {
    if (
      !String(req.headers['content-type'] ?? '')
        .toLowerCase()
        .startsWith('application/json')
    ) {
      return res.status(415).json({ error: 'Požadavek musí mít formát JSON.' });
    }
    if (!['guarantee_refund', 'withdrawal_request'].includes(req.body?.operation)) {
      return res.status(400).json({ error: 'Vyberte vrácení peněz nebo odstoupení od smlouvy.' });
    }
    if (req.body.operation === 'withdrawal_request' && req.body.confirm !== true) {
      return res.status(400).json({ error: 'Odstoupení od smlouvy je potřeba výslovně potvrdit.' });
    }
  }
  try {
    if (
      !(await enforceRateLimit(req, res, {
        key: `refund:${req.method}:${account.accountId}`,
        max: req.method === 'POST' ? 20 : 120,
        windowSeconds: 3600,
      }))
    )
      return;
    const context = {
      accountId: account.accountId,
      email: account.email,
      entitlement: await getEntitlement(account.accountId),
    };
    const result =
      req.method === 'GET'
        ? await getRefundStatus(context)
        : req.body.operation === 'withdrawal_request'
          ? await receiveWithdrawal(context)
          : await requestGuaranteeRefund(context);
    return res.status(200).json(result);
  } catch {
    // Never print provider objects, financial IDs, email addresses or journal content.
    return res
      .status(503)
      .json({
        error:
          'Stav požadavku se teď nepodařilo ověřit. Obnovte stav; opakované podání stejného požadavku nevytvoří druhé vrácení platby.',
      });
  }
}
