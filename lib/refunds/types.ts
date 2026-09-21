/** Public DTOs contain no payment-provider IDs or journal content. */
export type RefundStatus =
  | 'available'
  | 'unavailable'
  | 'processing'
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'review_required'
  | 'withdrawal_requested';

export type RefundOperation = 'guarantee_refund' | 'withdrawal_request';

export interface WithdrawalReceipt {
  reference: string;
  accountEmail: string;
  operation: 'withdrawal_request';
  acceptedAt: string;
  statement: string;
  paidAt: string | null;
  emailStatus: 'sent' | 'unavailable' | 'failed' | 'pending';
}

export interface RefundResponse {
  status: RefundStatus;
  accountEmail: string;
  paidAt: string | null;
  guarantee: { eligible: boolean; endsAt: string | null; hours: 72 };
  canRequestWithdrawal: boolean;
  statutoryNotice: string;
  withdrawalStatement: string;
  withdrawalReceipt?: WithdrawalReceipt;
  requestedAt?: string;
  updatedAt?: string;
  retryable: boolean;
  message: string;
}

export const STATUTORY_NOTICE =
  'Třídenní garance je dobrovolná výhoda navíc. Neomezuje vaše zákonná práva, včetně práva na odstoupení od smlouvy, je-li dáno. Odstoupení můžete odeslat samostatně; podmínky a vrácení platby se posuzují podle zákona.';

export const WITHDRAWAL_STATEMENT =
  'Tímto odstupuji od smlouvy o poskytnutí služby zdravotního deníku zakoupené prostřednictvím tohoto účtu. Žádám o potvrzení přijetí tohoto odstoupení a vypořádání plateb v souladu se zákonem.';
