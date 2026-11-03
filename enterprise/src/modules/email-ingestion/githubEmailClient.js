'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const logger = require('../../core/logger');
const env = require('../../config/env');

class GithubEmailClient {
  constructor(options = {}) {
    const rawUrl = options.repoUrl || env.GITHUB_EMAIL_REPO_URL || '';
    const parsed = this._parseRepoUrl(rawUrl);

    this.owner = options.owner || env.GITHUB_REPO_OWNER || parsed.owner;
    this.repo = options.repo || env.GITHUB_REPO_NAME || parsed.repo;
    this.pat = options.pat || env.GITHUB_PAT || '';
    this.branch = options.branch || env.GITHUB_EMAIL_BRANCH || 'main';
    this.folderPath = (options.folderPath || env.GITHUB_EMAIL_FOLDER_PATH || 'data/incoming-emails').replace(/^\/+|\/+$/g, '');

    this.baseIntervalMs = (options.baseIntervalSeconds || env.EMAIL_POLL_INTERVAL_SECONDS || 30) * 1000;
    this.maxIntervalMs = (options.maxIntervalSeconds || env.EMAIL_MAX_POLL_INTERVAL_SECONDS || 180) * 1000;
    this.currentIntervalMs = this.baseIntervalMs;

    this.lastCommitSha = null;
    this.processedFileShas = new Set();
    this.processedContentHashes = new Set();
    this.lastCheckedAt = null;
    this.lastError = null;

    // Optional local repository path fallback
    this.localFolderPath = path.resolve(process.cwd(), this.folderPath);
    if (!fs.existsSync(this.localFolderPath)) {
      const parentLocal = path.resolve(process.cwd(), '..', this.folderPath);
      if (fs.existsSync(parentLocal)) {
        this.localFolderPath = parentLocal;
      }
    }
  }

  _parseRepoUrl(url) {
    if (!url) return { owner: '', repo: '' };
    try {
      const clean = url.trim().replace(/\.git$/, '');
      const parts = clean.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return {
          owner: parts[parts.length - 2],
          repo: parts[parts.length - 1],
        };
      }
    } catch {
      // fallback
    }
    return { owner: '', repo: '' };
  }

  isConfigured() {
    return Boolean(this.owner && this.repo);
  }

  getHeaders() {
    const headers = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'TeamWise-Enterprise-Email-Ingestion/2.0',
    };
    if (this.pat && this.pat.trim()) {
      const token = this.pat.trim();
      headers.Authorization = token.startsWith('Bearer ') || token.startsWith('token ') ? token : `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Smart polling cycle:
   * 1. Query latest commit SHA for the email folder path to avoid pulling content when unchanged.
   * 2. If unchanged, back off dynamic poll interval.
   * 3. If changed, reset interval and fetch new email payloads.
   */
  async checkAndFetchNewEmails() {
    this.lastCheckedAt = new Date().toISOString();

    if (!this.isConfigured()) {
      return this._checkLocalFolderFallback();
    }

    try {
      // Step 1: Check latest commit SHA on GitHub for the target folder
      const commitUrl = `https://api.github.com/repos/${this.owner}/${this.repo}/commits?path=${encodeURIComponent(this.folderPath)}&sha=${encodeURIComponent(this.branch)}&per_page=1`;
      
      const commitRes = await axios.get(commitUrl, {
        headers: this.getHeaders(),
        timeout: 10000,
        validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
      });

      // Handle Rate Limiting gracefully
      const remainingRate = commitRes.headers['x-ratelimit-remaining'];
      if (remainingRate !== undefined && Number(remainingRate) === 0) {
        const resetEpoch = Number(commitRes.headers['x-ratelimit-reset'] || 0) * 1000;
        const waitMs = Math.max(5000, resetEpoch - Date.now());
        logger.warn({ waitSeconds: Math.round(waitMs / 1000) }, 'GitHub API rate limit reached, backing off');
        this.currentIntervalMs = Math.min(waitMs, this.maxIntervalMs);
        return { newEmails: [], nextIntervalMs: this.currentIntervalMs, rateLimited: true };
      }

      if (commitRes.status === 404 || !commitRes.data || !Array.isArray(commitRes.data) || commitRes.data.length === 0) {
        // Folder or commits not found yet on GitHub, check local fallback
        return this._checkLocalFolderFallback();
      }

      const latestCommitSha = commitRes.data[0].sha;

      // If commit SHA is identical to last checked, no new email dispatch happened!
      if (this.lastCommitSha && this.lastCommitSha === latestCommitSha) {
        // Dynamic backoff
        this.currentIntervalMs = Math.min(Math.round(this.currentIntervalMs * 1.25), this.maxIntervalMs);
        logger.debug(
          { commitSha: latestCommitSha.slice(0, 7), intervalSeconds: Math.round(this.currentIntervalMs / 1000) },
          'No new email commits in repository; dynamically backing off',
        );
        return {
          newEmails: [],
          nextIntervalMs: this.currentIntervalMs,
          latestCommitSha,
          unchanged: true,
        };
      }

      // New commit found! Reset dynamic interval to base
      this.currentIntervalMs = this.baseIntervalMs;
      logger.info(
        { previousSha: this.lastCommitSha ? this.lastCommitSha.slice(0, 7) : 'none', newSha: latestCommitSha.slice(0, 7) },
        'Discovered new commit in incoming emails repository path; fetching contents',
      );

      // Step 2: Fetch contents of the incoming-emails folder
      const contentsUrl = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(this.folderPath)}?ref=${encodeURIComponent(this.branch)}`;
      const contentsRes = await axios.get(contentsUrl, {
        headers: this.getHeaders(),
        timeout: 15000,
      });

      if (!Array.isArray(contentsRes.data)) {
        this.lastCommitSha = latestCommitSha;
        return { newEmails: [], nextIntervalMs: this.currentIntervalMs };
      }

      const emailFiles = contentsRes.data.filter(
        (item) => item.type === 'file' && item.name.endsWith('.json') && !item.name.startsWith('.'),
      );

      const newEmails = [];

      for (const file of emailFiles) {
        // Skip if this file SHA was already ingested in this runtime session
        if (this.processedFileShas.has(file.sha)) {
          continue;
        }

        let rawContent = '';
        if (file.content && file.encoding === 'base64') {
          rawContent = Buffer.from(file.content, 'base64').toString('utf8');
        } else if (file.download_url) {
          const downloadRes = await axios.get(file.download_url, {
            headers: this.getHeaders(),
            timeout: 10000,
            responseType: 'text',
          });
          rawContent = typeof downloadRes.data === 'string' ? downloadRes.data : JSON.stringify(downloadRes.data);
        }

        if (!rawContent || !rawContent.trim()) {
          this.processedFileShas.add(file.sha);
          continue;
        }

        // Deduplicate using SHA256 content hash
        const contentHash = crypto.createHash('sha256').update(rawContent).digest('hex');
        if (this.processedContentHashes.has(contentHash)) {
          this.processedFileShas.add(file.sha);
          continue;
        }

        let parsedJson;
        try {
          parsedJson = JSON.parse(rawContent);
        } catch (err) {
          logger.warn({ file: file.name, error: err.message }, 'Failed to parse JSON from GitHub repository file');
          this.processedFileShas.add(file.sha);
          continue;
        }

        newEmails.push({
          source: 'github-repository',
          filename: file.name,
          sha: file.sha,
          contentHash,
          rawJson: parsedJson,
        });

        this.processedFileShas.add(file.sha);
        this.processedContentHashes.add(contentHash);
      }

      this.lastCommitSha = latestCommitSha;
      this.lastError = null;

      return {
        newEmails,
        nextIntervalMs: this.currentIntervalMs,
        latestCommitSha,
      };
    } catch (err) {
      this.lastError = err.message;
      logger.warn({ error: err.message }, 'GitHub email polling error, falling back to local files check');
      return this._checkLocalFolderFallback();
    }
  }

  /**
   * Fallback to check local directory on disk (if repo is cloned locally or offline testing)
   */
  _checkLocalFolderFallback() {
    if (!fs.existsSync(this.localFolderPath)) {
      return { newEmails: [], nextIntervalMs: this.currentIntervalMs };
    }

    try {
      const entries = fs.readdirSync(this.localFolderPath, { withFileTypes: true });
      const jsonEntries = entries.filter(
        (e) => e.isFile() && e.name.endsWith('.json') && !e.name.startsWith('.'),
      );

      const newEmails = [];
      for (const entry of jsonEntries) {
        const fullPath = path.join(this.localFolderPath, entry.name);
        try {
          const rawContent = fs.readFileSync(fullPath, 'utf8');
          const contentHash = crypto.createHash('sha256').update(rawContent).digest('hex');
          if (this.processedContentHashes.has(contentHash)) {
            continue;
          }

          const parsedJson = JSON.parse(rawContent);
          newEmails.push({
            source: 'local-repository-folder',
            filename: entry.name,
            sha: `local_${entry.name}`,
            contentHash,
            rawJson: parsedJson,
          });

          this.processedContentHashes.add(contentHash);
        } catch {
          // ignore corrupted files
        }
      }

      return {
        newEmails,
        nextIntervalMs: this.currentIntervalMs,
      };
    } catch (err) {
      logger.debug({ error: err.message }, 'Local folder fallback read error');
      return { newEmails: [], nextIntervalMs: this.currentIntervalMs };
    }
  }

  getStats() {
    return {
      isConfigured: this.isConfigured(),
      owner: this.owner,
      repo: this.repo,
      branch: this.branch,
      folderPath: this.folderPath,
      lastCommitSha: this.lastCommitSha ? this.lastCommitSha.slice(0, 7) : null,
      currentIntervalSeconds: Math.round(this.currentIntervalMs / 1000),
      processedFilesCount: this.processedFileShas.size,
      lastCheckedAt: this.lastCheckedAt,
      lastError: this.lastError,
    };
  }
}

const githubEmailClient = new GithubEmailClient();

module.exports = {
  GithubEmailClient,
  githubEmailClient,
};
