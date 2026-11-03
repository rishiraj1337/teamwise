'use strict';

let gplay = null;
try {
  const loaded = require('google-play-scraper');
  gplay = loaded?.default ?? loaded;
} catch (e) {
  // Scraper optional or mockable
}

const PAGE_SIZE = 150;

class GooglePlayClient {
  constructor({ scraper = gplay, pageSize = PAGE_SIZE } = {}) {
    if (!scraper || typeof scraper.reviews !== 'function' || !scraper.sort?.NEWEST) {
      throw new Error('Google Play scraper is not configured correctly (google-play-scraper)');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE) {
      throw new Error(`Google Play page size must be between 1 and ${PAGE_SIZE}`);
    }
    this.scraper = scraper;
    this.pageSize = Math.min(pageSize, PAGE_SIZE);
  }

  async fetchReviews({ appPackageName, country = 'in', language = 'en', dateFrom, maxItems = 1000 }) {
    if (!this.scraper || typeof this.scraper.reviews !== 'function') {
      throw new Error('Google Play scraper module is not available or not properly loaded');
    }

    const cutoff = new Date(dateFrom);
    if (Number.isNaN(cutoff.getTime())) {
      throw new Error('Invalid cutoff date provided for review collection');
    }

    const reviews = [];
    const seenTokens = new Set();
    let nextPaginationToken = undefined;

    while (true) {
      const page = await this.scraper.reviews({
        appId: appPackageName,
        country,
        lang: language,
        sort: this.scraper.sort ? this.scraper.sort.NEWEST : 2,
        num: this.pageSize,
        paginate: true,
        nextPaginationToken,
      });

      if (!page || !Array.isArray(page.data)) {
        throw new Error(`Google Play returned an invalid ${language} reviews page`);
      }

      let reachedDateBoundary = false;
      for (const review of page.data) {
        if (!review.date) {
          throw new Error('Google Play returned a review with an invalid publication date');
        }
        const reviewDate = new Date(review.date);
        if (Number.isNaN(reviewDate.getTime())) {
          throw new Error('Google Play returned a review with an invalid publication date');
        }

        if (reviewDate < cutoff) {
          reachedDateBoundary = true;
          break;
        }

        reviews.push(review);
        if (reviews.length >= maxItems) {
          return reviews;
        }
      }

      if (reachedDateBoundary || !page.nextPaginationToken) {
        return reviews;
      }

      if (seenTokens.has(page.nextPaginationToken)) {
        throw new Error(`Google Play repeated a pagination token for ${language} reviews`);
      }

      seenTokens.add(page.nextPaginationToken);
      nextPaginationToken = page.nextPaginationToken;
    }
  }
}

module.exports = {
  GooglePlayClient,
};
