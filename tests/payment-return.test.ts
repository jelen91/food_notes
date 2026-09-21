import { describe, expect, it } from 'vitest';
import { paymentClaimSucceeded } from '../lib/payment-return';

describe('payment return waits for verified access', () => {
  it('does not mistake an HTTP-successful pending response for a completed purchase', () => {
    expect(paymentClaimSucceeded(202, { pending: true })).toBe(false);
    expect(paymentClaimSucceeded(202, { success: true })).toBe(false);
  });
  it('requires the explicit server success signal', () => {
    expect(paymentClaimSucceeded(200, { success: true })).toBe(true);
    expect(paymentClaimSucceeded(200, { requiresLogin: true })).toBe(false);
    expect(paymentClaimSucceeded(200, {})).toBe(false);
    expect(paymentClaimSucceeded(403, { success: true })).toBe(false);
  });
});
