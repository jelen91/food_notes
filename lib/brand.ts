/** Veřejná značka. Technické identifikátory existujících účtů a dat se nemění. */
export const BRAND = {
  name: 'Rozumím tělu',
  domain: 'rozumimtelu.cz',
  origin: 'https://rozumimtelu.cz',
  tagline: 'Váš osobní deník. Souvislosti, které vám mohly unikat.',
  description:
    'Osobní deník sestavený pomocí AI. Zachyťte, co jíte, jak spíte a jak vám je, a hledejte souvislosti pro svůj další krok.',
  themeColor: '#f8f8f2',
} as const;

export function brandTitle(title: string): string {
  return title === BRAND.name ? BRAND.name : `${title} | ${BRAND.name}`;
}
