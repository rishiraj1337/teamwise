'use strict';

/**
 * Evaluates whether an incoming email is a legitimate customer support/review email,
 * or if it is non-support (automated bounce, auto-reply, newsletter, marketing spam, false positive).
 */
function evaluateSupportEmail(emailData) {
  const from = String(emailData.from || '').toLowerCase();
  const subject = String(emailData.subject || '').toLowerCase();
  const body = String(emailData.bodyText || emailData.body || '').toLowerCase();
  const fullText = `${subject} ${body}`;

  // 1. Check automated / bounce / no-reply sender addresses
  if (/@(?:no-?reply|donotreply|mailer-daemon|postmaster|bounce|notifications?|newsletter|marketing|promo)\b/i.test(from) ||
      /^(?:no-?reply|mailer-daemon|postmaster|bounce|newsletter)/i.test(from)) {
    return {
      isSupport: false,
      supportFlag: 'not_support',
      rejectionReason: 'Automated system or no-reply sender address',
    };
  }

  // 2. Check delivery failure notices and bounces
  if (/undeliver(?:ed|able)|delivery status notification|failure notice|returned to sender|mail delivery subsystem|550 [0-9\.]+|user unknown/i.test(subject) ||
      /message could not be delivered|diagnostic-code:|final-recipient:|original-recipient:/i.test(body)) {
    return {
      isSupport: false,
      supportFlag: 'not_support',
      rejectionReason: 'Email delivery failure / bounce notification',
    };
  }

  // 3. Check out of office / automated auto-responder
  if (/automatic reply:|out of office:|auto-reply:|vacation responder|on leave until|away from my desk/i.test(subject) ||
      /i am currently (?:out of the office|on (?:annual )?leave|away)|will have limited access to email|thank you for your email\. i am out/i.test(body)) {
    return {
      isSupport: false,
      supportFlag: 'not_support',
      rejectionReason: 'Out-of-office / automated auto-responder',
    };
  }

  // 4. Check marketing newsletters, promotional offers, unsolicited pitches
  const isNewsletter = /unsubscribe|opt-out|view in browser|privacy policy.*terms of service.*unsubscribe|click here to unsubscribe/i.test(body);
  const isMarketingSubject = /weekly digest|monthly newsletter|special discount|% off|promo code|webinar invitation|sponsored/i.test(subject);
  if ((isNewsletter && isMarketingSubject) ||
      /(?:seo ranking service|guest post submission|increase your website traffic|business proposal|crypto investment offer)/i.test(fullText)) {
    return {
      isSupport: false,
      supportFlag: 'not_support',
      rejectionReason: 'Marketing newsletter, promotional offer, or unsolicited spam',
    };
  }

  // 5. Positive indicators for genuine customer support, complaints, reviews, bug reports
  const supportIndicators = /help|issue|bug|error|fail|problem|cannot|can't|unable|login|sign in|otp|password|bill|payment|charge|refund|invoice|deducted|transaction|crash|freeze|slow|feature|suggest|feedback|complaint|worst|terrible|awesome|great|love|thank you|fraud|dispute|money|wallet|balance|account|stolen|hacked|broken|unusable/i;

  if (!supportIndicators.test(fullText) && fullText.trim().length > 0) {
    return {
      isSupport: false,
      supportFlag: 'not_support',
      rejectionReason: 'No customer support or review intent detected (false positive / irrelevant)',
    };
  }

  return {
    isSupport: true,
    supportFlag: 'support',
    rejectionReason: null,
  };
}

function heuristicClassify(emailData, categories = [], subcategories = {}) {
  const filterResult = evaluateSupportEmail(emailData);
  const text = `${emailData.subject || ''} ${emailData.bodyText || emailData.body || ''}`.toLowerCase();

  // 1. Star Rating
  let starRatings = 3;
  if (/love|great|excellent|awesome|fantastic|perfect|good|thank you|thanks|helpful|wonderful|superb/.test(text)) {
    starRatings = /best|love|excellent|fantastic|perfect/.test(text) ? 5 : 4;
  } else if (/terrible|worst|horrible|useless|scam|fraud|hate|broken|disaster|unusable|money deducted/.test(text)) {
    starRatings = 1;
  } else if (/bad|poor|issue|bug|error|fail|problem|annoying|crash|not working|slow|unable/.test(text)) {
    starRatings = 2;
  }

  // 2. Priority (Low, Medium, High, Urgent)
  let priority = 'Medium';
  if (/urgent|asap|critical|emergency|immediately|blocked|stolen|hacked/.test(text)) {
    priority = 'Urgent';
  } else if (/minor|suggestion|enhancement/.test(text)) {
    priority = 'Low';
  } else if (starRatings <= 2) {
    priority = 'High';
  }

  // 3. Category & Department (timePayReview operational taxonomy)
  let detectedCategory = 'Status Enquiry';
  let department = 'Customer Support';

  if (/lite wallet|upi lite|risk threshold|activate lite/.test(text)) {
    detectedCategory = 'UPI Lite';
    department = 'Customer Support';
  } else if (/refund|failed transaction|success|rrn|txn id|payment status|bill payment/.test(text)) {
    detectedCategory = 'Status Enquiry';
    department = 'Customer Support';
  } else if (/login|otp|password|register|crash|bug|error|performance|sim select|device integrity|proceed to pay/.test(text)) {
    detectedCategory = 'Technical';
    department = 'Engineering';
  }

  if (categories.length > 0 && !categories.includes(detectedCategory)) {
    detectedCategory = categories.includes('Status Enquiry') ? 'Status Enquiry' : categories[0];
  }

  // 4. Subcategory selection
  let subcategory = 'Elaborate';
  const validSubs = subcategories[detectedCategory] || [];

  if (validSubs.length > 0) {
    // Attempt match
    const matched = validSubs.find(sub => text.includes(sub.toLowerCase()));
    subcategory = matched || validSubs[0];
  }

  // 5. Review text summary
  let cleanSummary = (emailData.subject ? `${emailData.subject}: ` : '') + (emailData.bodyText || emailData.body || '');
  cleanSummary = cleanSummary.replace(/\s+/g, ' ').trim().slice(0, 950);

  return {
    is_support: filterResult.isSupport,
    support_flag: filterResult.supportFlag,
    rejection_reason: filterResult.rejectionReason,
    star_ratings: starRatings,
    category: detectedCategory,
    subcategory,
    priority,
    department,
    status: 'New',
    review_text: cleanSummary || 'No review text provided',
    resolution: starRatings <= 2 ? 'Investigate issue and respond to customer within SLA.' : 'N/A',
    review_link: 'N/A',
    classificationSource: 'heuristic-engine',
  };
}

module.exports = {
  heuristicClassify,
  evaluateSupportEmail,
};
