'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../../core/logger');
const env = require('../../config/env');

class FileWatcher {
  constructor(options = {}) {
    this.uploadsDir = options.uploadsDir || env.UPLOADS_DIR;
    this.processedDir = options.processedDir || env.PROCESSED_DIR;
    this.failedDir = options.failedDir || env.FAILED_DIR;
    this.nonSupportDir = options.nonSupportDir || env.NON_SUPPORT_DIR;
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.uploadsDir, this.processedDir, this.failedDir, this.nonSupportDir].forEach(dir => {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      } catch (err) {
        logger.warn({ error: err.message, dir }, 'Unable to ensure directory existence (may require elevated permissions)');
      }
    });
  }

  listPendingFiles() {
    this.ensureDirectories();
    try {
      const entries = fs.readdirSync(this.uploadsDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('.'))
        .map(entry => ({
          name: entry.name,
          path: path.join(this.uploadsDir, entry.name),
        }));
    } catch (err) {
      logger.error({ error: err.message, dir: this.uploadsDir }, 'Failed to list uploads directory');
      return [];
    }
  }

  validateFilename(filename) {
    if (!filename || typeof filename !== 'string') {
      throw new Error('Invalid filename provided');
    }
    if (filename.includes('..') || path.basename(filename) !== filename || filename.includes('/') || filename.includes('\\') || filename.includes('\0')) {
      throw new Error('Access denied: directory traversal detected');
    }
    const safePath = path.resolve(this.uploadsDir, filename);
    if (!safePath.startsWith(path.resolve(this.uploadsDir))) {
      throw new Error('Access denied: directory traversal detected');
    }
    return safePath;
  }

  readFileContent(filename) {
    const fullPath = this.validateFilename(filename);
    return fs.readFileSync(fullPath, 'utf8');
  }

  moveToProcessed(filename) {
    this.moveFile(filename, this.processedDir, 'processed');
  }

  moveToFailed(filename, reason = 'Unknown error') {
    this.moveFile(filename, this.failedDir, 'failed', reason);
  }

  moveToNonSupport(filename, reason = 'Non-support mail filtered', metadata = null) {
    this.moveFile(filename, this.nonSupportDir, 'non-support', reason, metadata);
  }

  moveFile(filename, destinationDir, statusLabel, reason = null, metadata = null) {
    try {
      const sourcePath = this.validateFilename(filename);
      if (!fs.existsSync(sourcePath)) {
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const targetName = `${timestamp}_${path.basename(filename)}`;
      const targetPath = path.join(destinationDir, targetName);

      fs.renameSync(sourcePath, targetPath);

      if (reason) {
        const errorLogPath = `${targetPath}.meta.txt`;
        const logContent = [
          `Timestamp: ${new Date().toISOString()}`,
          `Status: ${statusLabel}`,
          `Reason: ${reason}`,
          metadata ? `Metadata: ${JSON.stringify(metadata, null, 2)}` : null,
        ].filter(Boolean).join('\n');
        fs.writeFileSync(errorLogPath, `${logContent}\n`, 'utf8');
      }

      logger.info({ file: path.basename(filename), targetName, status: statusLabel }, `File moved to ${statusLabel} directory`);
    } catch (err) {
      logger.error({ error: err.message, file: filename }, 'Failed to move file');
      if (err.message.includes('directory traversal')) {
        throw err;
      }
    }
  }
}

const fileWatcher = new FileWatcher();

module.exports = {
  FileWatcher,
  fileWatcher,
};
