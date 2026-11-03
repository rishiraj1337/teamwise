'use strict';

const assert = require('assert');
const { SettingsRepository } = require('../src/database/settingsRepository');

const repo = new SettingsRepository();
repo.cache.set('polling_email_interval_minutes', 25);
repo.cache.set('polling_playstore_interval_minutes', 720);
repo.lastFetched = Date.now();

const cached = repo._wrapCachedSettings();
assert.strictEqual(cached.polling_email_interval_minutes.value, 25);
assert.strictEqual(cached.polling_playstore_interval_minutes.value, 720);

console.log('Passed: settings cache returns { value } shape for getPollingConfig.');
