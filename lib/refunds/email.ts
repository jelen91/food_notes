import type { WithdrawalReceipt } from './types';

export function withdrawalReceiptText(receipt: WithdrawalReceipt): string {
  return [
    'Potvrzení přijetí odstoupení od smlouvy',
    `Potvrzení: ${receipt.reference}`,
    `Účet: ${receipt.accountEmail}`,
    `Přijato: ${receipt.acceptedAt}`,
    `Nákup uhrazen: ${receipt.paidAt ?? 'neuvedeno'}`,
    '',
    'Přijaté prohlášení:',
    receipt.statement,
    '',
    'Odstoupení jsme přijali. Vypořádání platby se posuzuje podle zákona. Toto potvrzení neznamená, že peníze již dorazily na váš účet.',
  ].join('\n');
}

export async function sendWithdrawalReceipt(
  to: string,
  receipt: WithdrawalReceipt
): Promise<WithdrawalReceipt['emailStatus']> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return 'unavailable';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `withdrawal-${receipt.reference}`,
      },
      body: JSON.stringify({
        from,
        to,
        subject: 'Potvrzení přijetí odstoupení od smlouvy',
        text: withdrawalReceiptText(receipt),
      }),
    });
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}
