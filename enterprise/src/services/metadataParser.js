'use strict';

/**
 * Extracts operational non-PII metadata ONLY from the customer's main message.
 * Strictly excludes developer/support replies or internal triage notes.
 *
 * @param {object} review Review record with review_text, channel, subcategory, etc.
 * @returns {object} Extracted customer metadata
 */
function extractCustomerMetadata(review) {
  if (!review) return {};

  const text = String(review.review_text || '');

  // 1. Extract Amount (e.g. ₹100, 100 rs, Rs. 500, INR 250)
  let amount = null;
  const amountMatch = text.match(/(?:(?:rs\.?|inr|₹)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:rs|rupees|inr|bucks|\/-))/i);
  if (amountMatch) {
    const rawVal = amountMatch[1] || amountMatch[2];
    amount = `₹${rawVal}`;
  }

  // 2. Extract Transaction ID / RRN / UTR
  let txnId = null;
  let rrn = null;
  const txnMatch = text.match(/\b(?:txn\s*(?:id|no)?|transaction\s*(?:id|no|ref)?|utr|ref\s*(?:no)?|reference)[:\s#]*([a-zA-Z0-9_\-]{6,36})\b/i);
  if (txnMatch) {
    txnId = txnMatch[1];
  }
  const rrnMatch = text.match(/\b(?:rrn[:\s#]*)?(\d{12})\b/i);
  if (rrnMatch) {
    rrn = rrnMatch[1];
    if (!txnId) txnId = rrn;
  }

  // 3. Extract Payment Mode / Channel
  let paymentMode = null;
  const modeMatch = text.match(/\b(UPI|BBPS|P2P|P2M|IMPS|NEFT|RTGS|Credit Card|Debit Card|Net Banking|Wallet|Fastag|AutoPay)\b/i);
  if (modeMatch) {
    paymentMode = modeMatch[1].toUpperCase();
  } else if (review.subcategory && review.subcategory !== 'N/A') {
    paymentMode = review.subcategory;
  }

  // 4. Extract Complaint / Thread Reference from message
  let threadRef = null;
  const threadMatch = text.match(/(?:TPR\d{4}|CBL\d+|CMP\d+)/i);
  if (threadMatch && threadMatch[0] !== review.unique_id) {
    threadRef = threadMatch[0];
  }

  // 5. Build dynamic tags from main message only
  const tags = [];
  if (amount) tags.push(`Amount: ${amount}`);
  if (txnId) tags.push(`Txn: ${txnId}`);
  if (rrn && rrn !== txnId) tags.push(`RRN: ${rrn}`);
  if (paymentMode) tags.push(`Mode: ${paymentMode}`);
  if (threadRef) tags.push(`Linked: ${threadRef}`);
  if (/crash|freeze|bug|error|broken/i.test(text)) tags.push('Issue: App Crash/Bug');
  if (/deduct|debit|fail|failed|pending|stuck/i.test(text)) tags.push('Issue: Deduction/Failure');
  if (/refund|chargeback/i.test(text)) tags.push('Intent: Refund Request');

  return {
    amount: amount || 'N/A',
    txn_id: txnId || 'N/A',
    rrn: rrn || 'N/A',
    payment_mode: paymentMode || 'N/A',
    thread_reference: threadRef || null,
    source_channel: review.channel === 'Email-SFTP' ? 'Email' : (review.channel || 'Email'),
    app_version: review.app_version_name && review.app_version_name !== 'N/A'
      ? `${review.app_version_name} (build ${review.app_version_code || 'N/A'})`
      : 'N/A',
    ingest_time: review.review_timestamp || review.created_at || null,
    extracted_tags: tags.length > 0 ? tags : ['General Feedback'],
  };
}

module.exports = {
  extractCustomerMetadata,
};
