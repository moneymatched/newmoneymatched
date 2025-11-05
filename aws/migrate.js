#!/usr/bin/env node

/**
 * AWS Database Migration Runner
 * 
 * This script runs database migrations against AWS RDS PostgreSQL.
 * It tracks applied migrations in a migrations table to ensure
 * migrations are only run once.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Configuration
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATIONS_TABLE = 'schema_migrations';

// Database connection configuration
const getDbConfig = () => {
  const isLocal = process.argv.includes('--local');
  
  if (isLocal) {
    return {
      host: process.env.LOCAL_DB_HOST || 'localhost',
      port: process.env.LOCAL_DB_PORT || 5432,
      database: process.env.LOCAL_DB_NAME || 'postgres',
      user: process.env.LOCAL_DB_USER || 'postgres',
      password: process.env.LOCAL_DB_PASSWORD || 'password',
      ssl: false
    };
  }
  
  return {
    host: process.env.AWS_DB_HOST,
    port: process.env.AWS_DB_PORT || 5432,
    database: process.env.AWS_DB_NAME || 'postgres',
    user: process.env.AWS_DB_USER,
    password: process.env.AWS_DB_PASSWORD,
    ssl: process.env.AWS_DB_SSL === 'require' ? { rejectUnauthorized: false } : false
  };
};

/**
 * Initialize the migrations table
 */
async function initMigrationsTable(client) {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      version VARCHAR(255) UNIQUE NOT NULL,
      filename VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  await client.query(createTableQuery);
  console.log('✅ Migrations table initialized');
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(client) {
  const result = await client.query(`SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version`);
  return result.rows.map(row => row.version);
}

/**
 * Get list of migration files
 */
function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('📁 No migrations directory found');
    return [];
  }
  
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort();
    
  return files;
}

/**
 * Run a single migration
 */
async function runMigration(client, filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const version = filename.split('_')[0]; // Extract timestamp from filename
  
  console.log(`🔄 Running migration: ${filename}`);
  
  try {
    // Read and execute the migration file
    const sql = fs.readFileSync(filepath, 'utf8');
    await client.query(sql);
    
    // Record the migration as applied
    await client.query(
      `INSERT INTO ${MIGRATIONS_TABLE} (version, filename) VALUES ($1, $2)`,
      [version, filename]
    );
    
    console.log(`✅ Migration applied: ${filename}`);
    return true;
  } catch (error) {
    console.error(`❌ Migration failed: ${filename}`);
    console.error(error.message);
    return false;
  }
}

/**
 * Main migration function
 */
async function runMigrations() {
  const config = getDbConfig();
  const isLocal = process.argv.includes('--local');
  
  console.log(`🚀 Starting migrations for ${isLocal ? 'local' : 'AWS'} database`);
  console.log(`📡 Connecting to: ${config.host}:${config.port}/${config.database}`);
  
  const client = new Client(config);
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Initialize migrations table
    await initMigrationsTable(client);
    
    // Get applied and available migrations
    const appliedMigrations = await getAppliedMigrations(client);
    const migrationFiles = getMigrationFiles();
    
    console.log(`📋 Found ${migrationFiles.length} migration files`);
    console.log(`📋 Applied migrations: ${appliedMigrations.length}`);
    
    // Find migrations to run
    const migrationsToRun = migrationFiles.filter(file => {
      const version = file.split('_')[0];
      return !appliedMigrations.includes(version);
    });
    
    if (migrationsToRun.length === 0) {
      console.log('✅ No new migrations to run');
      return;
    }
    
    console.log(`🔄 Running ${migrationsToRun.length} new migrations:`);
    
    // Run migrations in order
    let successCount = 0;
    for (const filename of migrationsToRun) {
      const success = await runMigration(client, filename);
      if (success) {
        successCount++;
      } else {
        console.log('❌ Migration failed, stopping execution');
        break;
      }
    }
    
    console.log(`✅ Migrations completed: ${successCount}/${migrationsToRun.length} successful`);
    
  } catch (error) {
    console.error('❌ Migration process failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

/**
 * Show migration status
 */
async function showStatus() {
  const config = getDbConfig();
  const client = new Client(config);
  
  try {
    await client.connect();
    
    const appliedMigrations = await getAppliedMigrations(client);
    const migrationFiles = getMigrationFiles();
    
    console.log('\n📊 Migration Status:');
    console.log('==================');
    
    for (const file of migrationFiles) {
      const version = file.split('_')[0];
      const status = appliedMigrations.includes(version) ? '✅ Applied' : '⏳ Pending';
      console.log(`${status} ${file}`);
    }
    
    console.log(`\n📈 Summary: ${appliedMigrations.length}/${migrationFiles.length} migrations applied`);
    
  } catch (error) {
    console.error('❌ Failed to get status:', error.message);
  } finally {
    await client.end();
  }
}

// CLI interface
const command = process.argv[2];

switch (command) {
  case 'status':
    showStatus();
    break;
  case 'migrate':
  default:
    runMigrations();
    break;
}

// Help text
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
AWS Database Migration Runner

Usage:
  node aws/migrate.js [command] [options]

Commands:
  migrate    Run pending migrations (default)
  status     Show migration status

Options:
  --local    Use local database instead of AWS
  --help     Show this help message

Environment Variables (AWS):
  AWS_DB_HOST       Database host
  AWS_DB_PORT       Database port (default: 5432)
  AWS_DB_NAME       Database name (default: postgres)
  AWS_DB_USER       Database username
  AWS_DB_PASSWORD   Database password
  AWS_DB_SSL        SSL mode (require/false)

Environment Variables (Local):
  LOCAL_DB_HOST     Local database host (default: localhost)
  LOCAL_DB_PORT     Local database port (default: 5432)
  LOCAL_DB_NAME     Local database name (default: postgres)
  LOCAL_DB_USER     Local database user (default: postgres)
  LOCAL_DB_PASSWORD Local database password (default: password)

Examples:
  node aws/migrate.js                    # Run migrations on AWS
  node aws/migrate.js --local            # Run migrations on local DB
  node aws/migrate.js status             # Show migration status
  node aws/migrate.js status --local     # Show local migration status
`);
  process.exit(0);
}
