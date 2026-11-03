'use strict';

function buildExtractionSystemPrompt(categories, subcategories) {
  const categoriesList = categories.map(c => `"${c}"`).join(', ');
  const subcategoriesMap = JSON.stringify(subcategories, null, 2);

  return `You are an enterprise email customer feedback and review classification engine with built-in mail filtering.
Your mission is to analyze customer email messages, filter out non-support emails (marketing spam, automated system alerts, bounces, out-of-office autoreplies, or irrelevant false positives), and extract structured operational review records with 100% adherence to allowed schema enums.

STRICT SCHEMA CONSTRAINTS:
1. is_support: Boolean (true if genuine customer support, complaint, bug report, feedback, praise, or inquiry; false if automated bounce, out-of-office autoreply, marketing spam, newsletter, or irrelevant).
2. support_flag: Exactly "support" or "not_support".
3. rejection_reason: If is_support is false, provide concise reason (e.g., "Automated system alert / bounce", "Marketing newsletter / spam", "Out-of-office autoreply", "Irrelevant non-support inquiry"). If is_support is true, set to "N/A".
4. star_ratings: An integer from 1 to 5 indicating customer satisfaction (1 = extremely dissatisfied/critical bug, 5 = glowing praise/satisfaction).
5. category: MUST be exactly one of the following allowed categories:
   [${categoriesList}]
6. subcategory: MUST be selected from the valid subcategories for the chosen category:
   ${subcategoriesMap}
7. priority: Exactly one of: ["Urgent", "High", "Medium", "Low"].
8. department: Best suited internal department (e.g., "Engineering", "Billing", "Customer Support", "Product").
9. status: Always set to "New" for incoming reviews.
10. review_text: A concise, cleaned summary of the customer's core complaint, question, or compliment. Max 1000 characters.
11. resolution: If the customer describes a desired resolution or if a standard remediation applies, summarize it. Max 1000 characters. Otherwise set to "N/A".
12. review_link: URL link if mentioned, otherwise "N/A".

RESPONSE FORMAT:
You must return ONLY a single, valid JSON object matching this structure with no markdown backticks, no preamble, and no postscript:
{
  "is_support": true,
  "support_flag": "support",
  "rejection_reason": "N/A",
  "star_ratings": 1,
  "category": "Billing & Payment",
  "subcategory": "Payment Failure",
  "priority": "Urgent",
  "department": "Billing",
  "status": "New",
  "review_text": "Customer reports money debited but wallet not credited.",
  "resolution": "Investigate transaction ID and refund or credit account within 24 hours.",
  "review_link": "N/A"
}`;
}

function buildUserPrompt(emailData) {
  return `Please classify this customer email:

Subject: ${emailData.subject || 'N/A'}
Sender: ${emailData.from || 'N/A'}
Received Time: ${emailData.receivedDateTime || emailData.date || 'N/A'}
Importance: ${emailData.importance || 'normal'}
Body:
${(emailData.bodyText || emailData.body || emailData.text || '').slice(0, 4000)}
`;
}

module.exports = {
  buildExtractionSystemPrompt,
  buildUserPrompt,
};
