'use strict';

const https = require('https');
const axios = require('axios');
const logger = require('../../core/logger');

class TimepayChatbotClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || 'https://notification.timepayonline.com:8443').replace(/\/+$/, '');
    this.insecureTls = options.insecureTls !== false;
    this.timeout = options.timeout || 15000;

    this.httpsAgent = new https.Agent({
      rejectUnauthorized: !this.insecureTls,
    });
  }

  getHeaders(customApiKey = '') {
    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
      'branchCode': 'NaN',
      'descCode': 'undefined',
      'stNo': 'undefined',
      'username': 'undefined',
      'Origin': this.baseUrl,
      'Referer': `${this.baseUrl}/`,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    };

    if (customApiKey) {
      headers['Authorization'] = `Bearer ${customApiKey}`;
    }

    return headers;
  }

  resolveRequestUrl(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      return pathOrUrl;
    }
    const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${this.baseUrl}${path}`;
  }

  async fetchCategories(categoriesPath = '/api/categories') {
    const url = this.resolveRequestUrl(categoriesPath);
    try {
      const response = await axios.get(url, {
        headers: this.getHeaders(),
        httpsAgent: this.httpsAgent,
        timeout: this.timeout,
      });

      const items = response.data?.data?.items || [];
      logger.debug({ count: items.length }, 'Fetched chatbot categories from TimePay API');
      return items;
    } catch (err) {
      logger.debug(`Chatbot categories request failed: ${err.message}`);
      throw err;
    }
  }

  async fetchChatbotList({
    listPath = '/webListChatBot',
    page = 0,
    size = 20,
    txnType = ['BBPS', 'P2M', 'P2P'],
    complainId = '',
    fromDate = '',
    toDate = '',
    status = '',
    ticketCategory = [],
    apiKey = '',
  } = {}) {
    const url = `${this.resolveRequestUrl(listPath)}?page=${page}&size=${size}`;
    const payload = {
      complainId: complainId || '',
      toDate: toDate || '',
      fromDate: fromDate || '',
      status: status !== null && status !== undefined ? String(status) : '',
      txnType: Array.isArray(txnType) ? txnType : [txnType],
      ticketCategory: Array.isArray(ticketCategory) ? ticketCategory : [],
    };

    try {
      const response = await axios.post(url, payload, {
        headers: this.getHeaders(apiKey),
        httpsAgent: this.httpsAgent,
        timeout: this.timeout,
      });

      const items = response.data?.data?.items || [];
      const pageInfo = response.data?.data?.pageInfo || { size, currentPage: page, totalElements: items.length };

      return {
        items,
        pageInfo,
      };
    } catch (err) {
      logger.debug({ error: err.message, url, payload }, 'Failed to fetch chatbot feedback from TimePay API');
      throw err;
    }
  }
}

module.exports = {
  TimepayChatbotClient,
};
