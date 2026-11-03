'use strict';

const logger = require('../core/logger');

class NotificationDispatcher {
  constructor() {
    this.sseClients = new Set();
  }

  registerSseClient(res) {
    this.sseClients.add(res);
    logger.debug({ totalClients: this.sseClients.size }, 'New desktop notification SSE client connected');

    res.on('close', () => {
      this.sseClients.delete(res);
      logger.debug({ totalClients: this.sseClients.size }, 'SSE client disconnected');
    });
  }

  broadcastAlert(payload) {
    const message = {
      id: Date.now().toString(),
      title: payload.title || 'Platform Notification',
      body: payload.body || '',
      url: payload.url || '/dashboard',
      priority: payload.priority || 'Normal',
      timestamp: new Date().toISOString(),
    };

    const sseFormattedData = `data: ${JSON.stringify(message)}\n\n`;

    for (const client of this.sseClients) {
      try {
        client.write(sseFormattedData);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }

    logger.debug({ title: message.title, recipientCount: this.sseClients.size }, 'Desktop notification alert broadcasted');
  }
}

const notificationDispatcher = new NotificationDispatcher();

module.exports = {
  NotificationDispatcher,
  notificationDispatcher,
};
