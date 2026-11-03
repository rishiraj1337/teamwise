'use strict';

const fs = require('fs');
const path = require('path');
const { getPool } = require('./connection');
const logger = require('../core/logger');

async function runSqlFile(filePath, connection) {
  if (!fs.existsSync(filePath)) {
    logger.warn({ filePath }, 'Migration SQL file not found');
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const withoutLineComments = content
    .split('\n')
    .map(line => {
      const commentStart = line.indexOf('--');
      return commentStart === -1 ? line : line.slice(0, commentStart);
    })
    .join('\n');
  const statements = withoutLineComments
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    try {
      await connection.query(statement);
    } catch (err) {
      // Ignore table already exists or column already exists errors
      if (!err.message.includes('already exists') && !err.message.includes('Duplicate entry')) {
        logger.error({ error: err.message, statement: statement.slice(0, 100) }, 'Error executing SQL statement');
      }
    }
  }
}

async function runMigrations() {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    logger.debug('Starting schema verification and database migrations');

    const schemaPath = path.resolve(__dirname, '../../sql/01_init_schema.sql');
    await runSqlFile(schemaPath, conn);

    const seedPath = path.resolve(__dirname, '../../sql/02_seed_data.sql');
    await runSqlFile(seedPath, conn);

    const taxonomySyncPath = path.resolve(__dirname, '../../sql/03_review_taxonomy_sync.sql');
    await runSqlFile(taxonomySyncPath, conn);

    const ingestionTaxonomyPath = path.resolve(__dirname, '../../sql/04_ingestion_taxonomy.sql');
    await runSqlFile(ingestionTaxonomyPath, conn);

    const [legacyChatbotCat] = await conn.query(
      `SELECT 1 AS ok FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'chatbot_categories'
       LIMIT 1`,
    );
    if (legacyChatbotCat.length > 0) {
      const chatbotCategoriesMigratePath = path.resolve(
        __dirname,
        '../../sql/05_migrate_chatbot_categories.sql',
      );
      await runSqlFile(chatbotCategoriesMigratePath, conn);
    }

    const classificationFksPath = path.resolve(__dirname, '../../sql/06_review_classification_fks.sql');
    await runSqlFile(classificationFksPath, conn);

    const playstorePriorityPath = path.resolve(
      __dirname,
      '../../sql/07_playstore_priority_from_star_rating.sql',
    );
    await runSqlFile(playstorePriorityPath, conn);

    const reviewLinkWidenPath = path.resolve(__dirname, '../../sql/08_review_link_widen.sql');
    await runSqlFile(reviewLinkWidenPath, conn);

    const pollingMinutesPath = path.resolve(__dirname, '../../sql/09_polling_interval_minutes.sql');
    await runSqlFile(pollingMinutesPath, conn);

    const dropEnterpriseUsersPath = path.resolve(__dirname, '../../sql/10_drop_enterprise_user_tables.sql');
    await runSqlFile(dropEnterpriseUsersPath, conn);

    const { loadTaxonomy } = require('./taxonomyRepository');
    await loadTaxonomy(true);

    logger.debug('Database migrations and schema verification completed successfully');
  } catch (err) {
    logger.error({ error: err.message }, 'Failed during database migration');
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  runMigrations,
};
