'use strict';

const axios = require('axios');
const logger = require('../core/logger');
const { buildExtractionSystemPrompt, buildUserPrompt } = require('./promptBuilder');
const { heuristicClassify, evaluateSupportEmail } = require('./heuristicClassifier');

class AiService {
  async extractReview(emailData, aiConfig) {
    const config = aiConfig || {};
    const enabled = config.enabled !== false;
    const provider = config.provider || 'openrouter';
    const categories = Array.isArray(config.categories) && config.categories.length > 0 ? config.categories : [];
    const subcategories = config.subcategories || {};

    if (!enabled || provider === 'heuristic') {
      logger.debug('Using heuristic fallback classifier (AI disabled or set to heuristic)');
      return heuristicClassify(emailData, categories, subcategories);
    }

    const apiKey = config.apiKey;
    if (!apiKey) {
      logger.warn('AI API key is missing. Using heuristic classifier fallback');
      return heuristicClassify(emailData, categories, subcategories);
    }

    const systemPrompt = buildExtractionSystemPrompt(categories, subcategories);
    const userPrompt = buildUserPrompt(emailData);

    try {
      const response = await axios.post(
        `${(config.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')}/chat/completions`,
        {
          model: config.model || 'meta-llama/llama-3.3-70b-instruct',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://automation.internal',
            'X-Title': 'Enterprise-Review-Automation',
          },
          timeout: Number(config.timeoutMs) || 30000,
        }
      );

      const rawContent = response.data?.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new Error('Empty AI response received from model endpoint');
      }

      let parsed;
      try {
        const cleanJson = rawContent
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```$/i, '')
          .trim();
        parsed = JSON.parse(cleanJson);
      } catch (parseErr) {
        logger.warn({ error: parseErr.message, rawContent: rawContent.slice(0, 200) }, 'Failed to parse AI JSON response');
        return heuristicClassify(emailData, categories, subcategories);
      }

      // Enforce constraints & enums
      const validated = this.validateAndNormalize(parsed, categories, subcategories, emailData);
      validated.classificationSource = `ai:${config.model || 'openrouter'}`;
      return validated;
    } catch (err) {
      logger.warn({ error: err.message }, 'AI extraction failed. Engaging heuristic classifier');
      return heuristicClassify(emailData, categories, subcategories);
    }
  }

  validateAndNormalize(parsed, categories, subcategories, emailData) {
    // 1. Evaluate support flag
    const heuristicCheck = evaluateSupportEmail(emailData);
    let isSupport = heuristicCheck.isSupport;
    let supportFlag = heuristicCheck.supportFlag;
    let rejectionReason = heuristicCheck.rejectionReason;

    if (parsed.is_support !== undefined) {
      isSupport = Boolean(parsed.is_support);
      supportFlag = isSupport ? 'support' : 'not_support';
      rejectionReason = isSupport ? null : (parsed.rejection_reason || 'Non-support mail filtered');
    } else if (parsed.support_flag !== undefined) {
      supportFlag = String(parsed.support_flag).toLowerCase() === 'support' ? 'support' : 'not_support';
      isSupport = supportFlag === 'support';
      rejectionReason = isSupport ? null : (parsed.rejection_reason || 'Non-support mail filtered');
    }

    let rating = Number(parsed.star_ratings);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      rating = 3;
    }

    let category = String(parsed.category || '').trim();
    if (categories.length > 0 && !categories.includes(category)) {
      // Find case-insensitive match or fallback
      const found = categories.find(c => c.toLowerCase() === category.toLowerCase());
      category = found || categories[0];
    }

    let subcategory = String(parsed.subcategory || '').trim();
    const validSubs = subcategories[category] || [];
    if (validSubs.length > 0 && !validSubs.includes(subcategory)) {
      const foundSub = validSubs.find(s => s.toLowerCase() === subcategory.toLowerCase());
      subcategory = foundSub || validSubs[0];
    }

    let priority = String(parsed.priority || 'Medium').trim();
    if (!['Urgent', 'High', 'Medium', 'Low'].includes(priority)) {
      priority = rating <= 2 ? 'High' : 'Medium';
    }

    let reviewText = String(parsed.review_text || '').trim();
    if (!reviewText || reviewText === 'N/A') {
      reviewText = `${emailData.subject ? emailData.subject + ': ' : ''}${emailData.bodyText || ''}`.trim();
    }
    reviewText = reviewText.slice(0, 1000);

    return {
      is_support: isSupport,
      support_flag: supportFlag,
      rejection_reason: rejectionReason,
      star_ratings: rating,
      category,
      subcategory,
      priority,
      department: String(parsed.department || 'Customer Support').slice(0, 100),
      status: 'New',
      review_text: reviewText || 'N/A',
      resolution: String(parsed.resolution || 'N/A').slice(0, 1000),
      review_link: String(parsed.review_link || 'N/A').slice(0, 255),
    };
  }
}

const aiService = new AiService();

module.exports = {
  AiService,
  aiService,
};
