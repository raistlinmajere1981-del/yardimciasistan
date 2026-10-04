/** Access generations cannot be restored. Retrying this transport intent cannot authorize it. */
export class DealerWebOrderAccessRejected extends Error {
  constructor() { super("Bayi web erişimi geçersiz veya kapalı."); }
}
