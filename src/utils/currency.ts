/** Auction/retention amounts are stored as plain rupee numbers but always displayed in Lakhs (1 Lakh = 100,000). */
export function formatLakh(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return `${(amount / 100_000).toFixed(2)} Lakh`
}
