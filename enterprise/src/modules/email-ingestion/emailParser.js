'use strict';

function stripHtml(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseEmailPayload(rawJson) {
  if (!rawJson || typeof rawJson !== 'object') {
    throw new Error('Email payload must be a non-null object');
  }

  // Handle either direct email object or wrapped Power Automate / SFTP payload
  const email = (rawJson.email && typeof rawJson.email === 'object')
    ? rawJson.email
    : (rawJson.body && typeof rawJson.body === 'object')
      ? rawJson.body
      : rawJson;

  const subject = String(email.subject || email.Subject || '').trim();
  const from = String(
    email.from ||
    email.From ||
    email.sender?.emailAddress?.address ||
    email.fromAddress ||
    'anonymous@domain.com'
  ).trim();

  let bodyText = '';
  if (typeof email.bodyText === 'string' && email.bodyText.length > 0) {
    bodyText = email.bodyText;
  } else if (typeof email.bodyPreview === 'string' && email.bodyPreview.length > 0) {
    bodyText = email.bodyPreview;
  } else if (typeof email.body === 'string') {
    bodyText = email.body.includes('<') ? stripHtml(email.body) : email.body;
  } else if (email.body && typeof email.body.content === 'string') {
    bodyText = stripHtml(email.body.content);
  } else if (typeof email.text === 'string') {
    bodyText = email.text;
  }

  bodyText = bodyText.replace(/\r\n/g, '\n').trim();

  const receivedDateTime = email.receivedDateTime || email.date || email.timestamp || new Date().toISOString();
  const importance = (email.importance || email.priority || 'normal').toLowerCase();
  const messageId = String(email.id || email.messageId || email.internetMessageId || '').trim();

  return {
    messageId,
    subject: subject || 'No Subject',
    from,
    bodyText,
    receivedDateTime,
    importance,
    rawMetadata: {
      hasAttachments: Boolean(email.hasAttachments),
      conversationId: email.conversationId || null,
    },
  };
}

module.exports = {
  stripHtml,
  parseEmailPayload,
};
