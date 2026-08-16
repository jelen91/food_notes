// Odesílání e-mailů přes Resend (HTTP API, bez další závislosti).
//
// Do e-mailů nepatří nic ze zdravotního obsahu – jen odkaz a nutné minimum. Když není
// RESEND_API_KEY nastavený (lokální vývoj), odkaz se vypíše do konzole a nic se neposílá.

interface SendArgs {
  to: string;
  subject: string;
  text: string;
}

function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

async function send({ to, subject, text }: SendArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    // Bez poskytovatele se e-mail nezahazuje potichu – vývojář odkaz najde v logu.
    console.info(`[e-mail vypnutý] pro ${to}: ${subject}\n${text}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!res.ok) {
    // Do logu jen stavový kód – tělo odpovědi může obsahovat adresu příjemce.
    throw new Error(`Odeslání e-mailu selhalo (HTTP ${res.status}).`);
  }
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${appUrl()}/app/overeni?token=${encodeURIComponent(token)}`;
  await send({
    to,
    subject: 'Ověření e-mailu',
    text: `Dobrý den,\n\npotvrďte prosím svůj e-mail otevřením odkazu:\n${link}\n\nOdkaz platí 3 dny. Pokud jste si účet nezakládali, tento e-mail ignorujte.`,
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${appUrl()}/app/nove-heslo?token=${encodeURIComponent(token)}`;
  await send({
    to,
    subject: 'Obnovení hesla',
    text: `Dobrý den,\n\nnové heslo si nastavíte na tomto odkazu:\n${link}\n\nOdkaz platí 1 hodinu a lze ho použít jednou. Pokud jste o změnu hesla nežádali, nic nedělejte.`,
  });
}

/**
 * Po zaplacení, když účet teprve vznikl. Odkaz na nastavení hesla je zároveň jediná
 * cesta zpět do deníku z jiného zařízení, proto chodí ke každé takové platbě.
 */
export async function sendAccountReadyEmail(to: string, token: string): Promise<void> {
  const link = `${appUrl()}/app/nove-heslo?token=${encodeURIComponent(token)}`;
  await send({
    to,
    subject: 'Váš deník je připravený',
    text: `Dobrý den,\n\nplatba proběhla a deník je připravený. Nastavte si prosím heslo, kterým se do něj budete přihlašovat:\n${link}\n\nOdkaz platí 7 dní; když vyprší, nové heslo si vyžádáte na ${appUrl()}/app/zapomenute-heslo.\n\nDěkujeme.`,
  });
}

export async function sendPaymentConfirmationEmail(to: string): Promise<void> {
  await send({
    to,
    subject: 'Platba potvrzena',
    text: `Dobrý den,\n\nplatba byla potvrzena a přístup je aktivní. Pokračovat můžete zde:\n${appUrl()}/app\n\nDěkujeme.`,
  });
}
