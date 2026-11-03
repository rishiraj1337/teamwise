'use strict';

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const env = require('../config/env');

const logFilePath = env.LOG_FILE_PATH;
const logDir = path.dirname(logFilePath);

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const fileStream = fs.createWriteStream(logFilePath, { flags: 'a' });

const useJsonConsole = String(process.env.LOG_CONSOLE_JSON || '').toLowerCase() === 'true';

let stdoutStream = process.stdout;
if (!useJsonConsole) {
  try {
    const pretty = require('pino-pretty');
    stdoutStream = pretty({
      colorize: process.stdout.isTTY,
      singleLine: false,
      hideObject: true,
      ignore: 'pid,hostname,time',
      messageFormat: '{msg}',
      sync: true,
    });
  } catch {
    stdoutStream = process.stdout;
  }
}

const streams = [
  { stream: stdoutStream },
  { stream: fileStream },
];

const logger = pino(
  {
    level: env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label.toUpperCase() };
      },
    },
  },
  pino.multistream(streams),
);

module.exports = logger;
