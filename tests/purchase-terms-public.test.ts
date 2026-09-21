import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getServerSideProps } from '../pages/podminky';

const values = {
  SELLER_NAME: 'Testovací provozovatel',
  SELLER_ICO: 'TEST-ICO',
  SELLER_ADDRESS: 'Testovací adresa',
  SUPPORT_EMAIL: 'podpora@example.test',
};
beforeEach(() => {
  Object.entries(values).forEach(([key, value]) => vi.stubEnv(key, ` ${value} `));
  vi.stubEnv('RESEND_API_KEY', 'private-test-mail-key');
  vi.stubEnv('STRIPE_SECRET_KEY', 'private-test-payment-key');
});
afterEach(() => vi.unstubAllEnvs());

describe('public operator information', () => {
  it('publishes only the complete public identity, not payment or mail keys', async () => {
    const result = await getServerSideProps({} as any);
    expect(result).toEqual({
      props: {
        seller: {
          name: values.SELLER_NAME,
          ico: values.SELLER_ICO,
          address: values.SELLER_ADDRESS,
          email: values.SUPPORT_EMAIL,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('private-test');
  });
  it.each(Object.keys(values))('does not publish an incomplete identity when %s is empty', async (key) => {
    vi.stubEnv(key, '  ');
    expect(await getServerSideProps({} as any)).toEqual({ props: { seller: null } });
  });
});
