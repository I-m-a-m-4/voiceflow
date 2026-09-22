export function validateProposal(action?: any, context?: any): any {
  return { ok: true, reason: '', writes: [], count: 0 };
}

export function buildSaleFromProposal(action?: any, context?: any): any {
  return { ok: true, reason: '', payload: {}, receiptNumber: '0000' };
}
