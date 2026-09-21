/** HTTP 202 means the webhook is pending, even though fetch().ok is true. */
export function paymentClaimSucceeded(status: number, body: unknown): boolean {
  return status === 200 && Boolean(body && typeof body === 'object' && (body as { success?: unknown }).success === true);
}
