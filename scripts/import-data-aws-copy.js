#!/usr/bin/env node

/**
 * California Unclaimed Property Data Import Script (AWS PostgreSQL COPY Version)
 * 
 * This script downloads the latest data from California State Controller's Office
 * and imports it into our AWS RDS PostgreSQL database using optimized COPY operations.
 * 
 * Key optimizations:
 * - Uses COPY FROM STDIN for bulk loading (10-100x faster than INSERT)
 * - Streams ZIP → CSV → DB without touching disk or building JS arrays
 * - Creates indexes AFTER data load to avoid per-row overhead
 * - Uses staging table with TEXT columns for fastest COPY path
 * - Transforms data in SQL rather than JavaScript
 * 
 * Usage: node scripts/import-data-aws-copy.js [--local] [--local-files <folder_path>]
 * 
 * Environment Variables Required:
 * - AWS_DB_HOST: AWS RDS endpoint
 * - AWS_DB_PORT: Database port (default: 5432)
 * - AWS_DB_NAME: Database name
 * - AWS_DB_USER: Database username
 * - AWS_DB_PASSWORD: Database password
 * - AWS_DB_SSL: SSL mode (default: require)
 */

import pg from 'pg';
import https from 'https';
import { from as copyFrom } from 'pg-copy-streams';
import unzipper from 'unzipper';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { parse as csvParse } from 'csv-parse';
import { stringify as csvStringify } from 'csv-stringify';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdir, stat, writeFile } from 'fs/promises';
import { createReadStream } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Argument parsing for --local and --local-files flags
const isLocal = process.argv.includes('--local');
const localFilesIndex = process.argv.indexOf('--local-files');
const localFilesPath = localFilesIndex !== -1 && process.argv[localFilesIndex + 1] 
  ? process.argv[localFilesIndex + 1] 
  : null;

// Configuration
const DATA_URLS = [
    'https://dpupd.sco.ca.gov/04_From_500_To_Beyond.zip',
    'https://dpupd.sco.ca.gov/03_From_100_To_Below_500.zip'
];

// AWS PostgreSQL configuration
const AWS_DB_CONFIG = {
  host: "database-1.cluster-czq6sce0s79v.us-west-1.rds.amazonaws.com",
  port: 5432,
  database: "postgres",
  user: "moneymatcheddb",
  password: "zekdef-xywmic-bypWo3",
  ssl: { rejectUnauthorized: false },
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 300000, // 5 minutes for long operations
  connectionTimeoutMillis: 10000, // 10 seconds
  statement_timeout: 0, // No statement timeout for long COPY operations
};

// Local PostgreSQL configuration (for development)
const LOCAL_DB_CONFIG = {
  host: 'localhost',
  port: 5432,
  database: 'unclaimed_properties',
  user: 'postgres',
  password: 'postgres',
  ssl: false,
  max: 20,
  idleTimeoutMillis: 300000, // 5 minutes for long operations
  connectionTimeoutMillis: 10000, // 10 seconds
  statement_timeout: 0, // No statement timeout for long COPY operations
};

const DB_CONFIG = isLocal ? LOCAL_DB_CONFIG : AWS_DB_CONFIG;

// Validate --local-files argument
if (localFilesIndex !== -1 && !localFilesPath) {
  console.error('❌ Error: --local-files requires a folder path');
  console.error('Usage: node scripts/import-data-aws-copy.js [--local] [--local-files <folder_path>]');
  process.exit(1);
}

if (isLocal) {
  console.log('--- Using LOCAL PostgreSQL instance ---');
  console.log(`Host: ${DB_CONFIG.host}:${DB_CONFIG.port}`);
  console.log(`Database: ${DB_CONFIG.database}`);
} else {
  console.log('--- Using AWS RDS PostgreSQL instance ---');
  console.log(`Host: ${DB_CONFIG.host}:${DB_CONFIG.port}`);
  console.log(`Database: ${DB_CONFIG.database}`);
}

// Initialize PostgreSQL client pool
const pool = new pg.Pool(DB_CONFIG);

// Expected CSV column order matching `raw_unclaimed_properties`
const CSV_COLUMNS = [
  'PROPERTY_ID',
  'PROPERTY_TYPE',
  'CASH_REPORTED',
  'SHARES_REPORTED',
  'NAME_OF_SECURITIES_REPORTED',
  'NO_OF_OWNERS',
  'OWNER_NAME',
  'OWNER_STREET_1',
  'OWNER_STREET_2',
  'OWNER_STREET_3',
  'OWNER_CITY',
  'OWNER_STATE',
  'OWNER_ZIP',
  'OWNER_COUNTRY_CODE',
  'CURRENT_CASH_BALANCE',
  'NUMBER_OF_PENDING_CLAIMS',
  'NUMBER_OF_PAID_CLAIMS',
  'HOLDER_NAME',
  'HOLDER_STREET_1',
  'HOLDER_STREET_2',
  'HOLDER_STREET_3',
  'HOLDER_CITY',
  'HOLDER_STATE',
  'HOLDER_ZIP',
  'CUSIP'
];

/**
 * Download a file from URL and return as a readable stream
 */
async function downloadFileStream(url) {
  return new Promise((resolve, reject) => {
    console.log(`📥 Downloading ${url}...`);
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        console.log(`✅ Download started for ${url}`);
        resolve(response);
      } else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        // Handle redirects
        console.log(`↗️ Redirecting to ${response.headers.location}`);
        downloadFileStream(response.headers.location).then(resolve).catch(reject);
      } else {
        reject(new Error(`Download failed with status code: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Create database tables with optimized schema
 */
async function createTables(client) {
  console.log('🗑️ Dropping existing tables...');
  await client.query('DROP TABLE IF EXISTS unclaimed_properties CASCADE');
  await client.query('DROP TABLE IF EXISTS raw_unclaimed_properties CASCADE');
  await client.query('DROP TABLE IF EXISTS data_imports CASCADE');
  console.log('✅ Existing tables dropped');
  
  // Note: Schema migrations should be run separately using:
  // node aws/migrate.js
  // This ensures proper versioning and tracking of schema changes

  // Create data_imports table
  await client.query(`
    CREATE TABLE data_imports (
      id SERIAL PRIMARY KEY,
      source_url TEXT NOT NULL,
      total_records INTEGER NOT NULL,
      successful_records INTEGER DEFAULT 0,
      failed_records INTEGER DEFAULT 0,
      import_status TEXT DEFAULT 'pending',
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create final table (no indexes yet for fastest load)
  await client.query(`
    CREATE TABLE unclaimed_properties (
      id TEXT NOT NULL,
      property_type TEXT,
      cash_reported DECIMAL(15,2) DEFAULT 0,
      shares_reported DECIMAL(15,2) DEFAULT 0,
      name_of_securities_reported TEXT,
      number_of_owners TEXT DEFAULT '1',
      owner_name TEXT NOT NULL,
      owner_street_1 TEXT,
      owner_street_2 TEXT,
      owner_street_3 TEXT,
      owner_city TEXT,
      owner_state TEXT,
      owner_zip TEXT,
      owner_country_code TEXT,
      current_cash_balance DECIMAL(15,2) DEFAULT 0,
      number_of_pending_claims INTEGER DEFAULT 0,
      number_of_paid_claims INTEGER DEFAULT 0,
      holder_name TEXT NOT NULL,
      holder_street_1 TEXT,
      holder_street_2 TEXT,
      holder_street_3 TEXT,
      holder_city TEXT,
      holder_state TEXT,
      holder_zip TEXT,
      cusip TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, owner_name)
    );
  `);

  // Create UNLOGGED staging table with TEXT columns that mirror CSV headers
  await client.query(`
    CREATE UNLOGGED TABLE raw_unclaimed_properties (
      PROPERTY_ID TEXT,
      PROPERTY_TYPE TEXT,
      CASH_REPORTED TEXT,
      SHARES_REPORTED TEXT,
      NAME_OF_SECURITIES_REPORTED TEXT,
      NO_OF_OWNERS TEXT,
      OWNER_NAME TEXT,
      OWNER_STREET_1 TEXT,
      OWNER_STREET_2 TEXT,
      OWNER_STREET_3 TEXT,
      OWNER_CITY TEXT,
      OWNER_STATE TEXT,
      OWNER_ZIP TEXT,
      OWNER_COUNTRY_CODE TEXT,
      CURRENT_CASH_BALANCE TEXT,
      NUMBER_OF_PENDING_CLAIMS TEXT,
      NUMBER_OF_PAID_CLAIMS TEXT,
      HOLDER_NAME TEXT,
      HOLDER_STREET_1 TEXT,
      HOLDER_STREET_2 TEXT,
      HOLDER_STREET_3 TEXT,
      HOLDER_CITY TEXT,
      HOLDER_STATE TEXT,
      HOLDER_ZIP TEXT,
      CUSIP TEXT
    );
  `);

  console.log('✅ Database tables created');
}

/**
 * Check if database connection is healthy
 */
async function checkConnectionHealth(client) {
  try {
    await client.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('❌ Database connection health check failed:', error.message);
    return false;
  }
}

/**
 * Set session parameters for optimal performance
 * Note: Some parameters can only be set outside of a transaction
 */
async function setSessionParameters(client) {
  console.log('⚙️ Setting session parameters for optimal performance...');
  
  // Check connection health first
  if (!(await checkConnectionHealth(client))) {
    throw new Error('Database connection is not healthy');
  }
  
  // Set parameters that can be set in any context
  await client.query("SET work_mem = '256MB'");
  console.log('✅ Work memory set to 256MB');
  
  // Try to set parameters that require no active transaction
  try {
    await client.query("SET maintenance_work_mem = '1GB'");
    console.log('✅ Maintenance work memory set to 1GB');
  } catch (error) {
    console.log('⚠️ Could not set maintenance_work_mem (may require superuser or custom parameter group)');
  }
  
  // Try to enable WAL compression (may not be available on all RDS instances)
  try {
    await client.query("SET wal_compression = on");
    console.log('✅ WAL compression enabled');
  } catch (error) {
    console.log('⚠️ WAL compression not available (requires custom parameter group)');
  }
  
  console.log('✅ Session parameters configured');
}

/**
 * Copy CSV stream directly into staging table using COPY
 * Uses more flexible CSV parsing to handle malformed data
 */
async function copyCsvStreamIntoStaging(csvReadable, client, csvName = 'unknown.csv', failedRecords = []) {
  let lineNumber = 0;
  
  try {
    const cleaner = new Transform({
      transform(chunk, _enc, cb) {
        let str = chunk.toString('utf8');
    
        // Fix malformed zip codes: ,""9520 → ,"9520
        str = str.replace(/,""(\d+)/g, ',"$1');
    
        // Fix broken zip codes like ,"00"95 → ,"0095
        str = str.replace(/,"00"(\d{2})/g, ',"00$1');
    
        cb(null, str);
      }
    });

    // Build a tolerant CSV cleaning pipeline: CSV → parse (relaxed) → normalize → stringify → COPY
    const parser = csvParse({
      // Use the file's header row but normalize header names to uppercase to match our columns
      columns: header => header.map(h => (h || '').toString().trim().toUpperCase()),
      relax_quotes: true,
      relax_column_count: true,
      relax_column_count_less: true,
      relax_column_count_more: true,
      skip_records_with_error: false, // Changed to false to capture errors
      bom: true,
      trim: true
    });

    // Track parsing errors
    parser.on('error', (error) => {
      failedRecords.push({
        file: csvName,
        line: lineNumber,
        error: error.message,
        data: null
      });
    });

    // Ensure we output exactly the columns we expect, in order, filling missing fields with ''
    const normalizer = new Transform({
      objectMode: true,
      transform(record, _enc, cb) {
        lineNumber++;
        
        try {
          const normalized = {};
          for (const col of CSV_COLUMNS) {
            // Use empty string for missing values to keep COPY happy with NULL ''
            normalized[col] = Object.prototype.hasOwnProperty.call(record, col) ? record[col] : '';
          }
          cb(null, normalized);
        } catch (error) {
          // Track normalization errors
          failedRecords.push({
            file: csvName,
            line: lineNumber,
            error: `Normalization error: ${error.message}`,
            data: record
          });
          cb(null, null); // Skip this record
        }
      }
    });

    const stringifier = csvStringify({
      header: true,
      columns: CSV_COLUMNS,
      quoted: true,
      // Keep empty fields unquoted behavior to align with COPY NULL ''
      quoted_empty: false
    });

    const copy = client.query(
      copyFrom(`
        COPY raw_unclaimed_properties (
          PROPERTY_ID, PROPERTY_TYPE, CASH_REPORTED, SHARES_REPORTED, NAME_OF_SECURITIES_REPORTED,
          NO_OF_OWNERS, OWNER_NAME, OWNER_STREET_1, OWNER_STREET_2, OWNER_STREET_3,
          OWNER_CITY, OWNER_STATE, OWNER_ZIP, OWNER_COUNTRY_CODE, CURRENT_CASH_BALANCE,
          NUMBER_OF_PENDING_CLAIMS, NUMBER_OF_PAID_CLAIMS, HOLDER_NAME, HOLDER_STREET_1,
          HOLDER_STREET_2, HOLDER_STREET_3, HOLDER_CITY, HOLDER_STATE, HOLDER_ZIP, CUSIP
        )
        FROM STDIN WITH (FORMAT csv, HEADER true, QUOTE '"', ESCAPE '"', NULL '', DELIMITER ',')
      `)
    );

    // Track COPY errors
    copy.on('error', (error) => {
      failedRecords.push({
        file: csvName,
        line: 'COPY operation',
        error: `Database COPY error: ${error.message}`,
        data: null
      });
    });

    await pipeline(csvReadable, cleaner, parser, normalizer, stringifier, copy);
  } catch (error) {
    console.error(`❌ Failed to process CSV ${csvName}:`, error.message);
    failedRecords.push({
      file: csvName,
      line: lineNumber,
      error: `Pipeline error: ${error.message}`,
      data: null
    });
    throw error;
  }
}

/**
 * Process a ZIP URL and stream CSV files directly into staging table
 */
async function processZipUrlToCopy(url, client, counters, failedRecords = []) {
  console.log(`🔄 Processing ZIP: ${url}`);
  
  try {
    // Download ZIP and stream entries without writing to disk
    const zipStream = await downloadFileStream(url);
    
    const directory = zipStream.pipe(unzipper.Parse({ forceStream: true }));
    
    for await (const entry of directory) {
      const name = entry.path.toLowerCase();
      if (name.endsWith('.csv')) {
        console.log(`📄 Processing CSV: ${entry.path}`);
        try {
          await copyCsvStreamIntoStaging(entry, client, entry.path, failedRecords);
          counters.files++;
          console.log(`✅ Completed CSV: ${entry.path}`);
        } catch (error) {
          console.error(`❌ Failed to process CSV ${entry.path}:`, error.message);
          // Continue with next file instead of failing completely
          entry.autodrain();
          // Don't increment counters.files for failed files
        }
      } else {
        entry.autodrain();
      }
    }
    
    console.log(`✅ Completed ZIP: ${url}`);
  } catch (error) {
    console.error(`❌ Failed to process ZIP ${url}:`, error.message);
    throw error;
  }
}

/**
 * Recursively find all CSV files in a directory tree
 */
async function findCsvFilesRecursively(dirPath, csvFiles = [], basePath = null) {
  if (!basePath) {
    basePath = dirPath;
  }
  
  try {
    const items = await readdir(dirPath);
    
    for (const item of items) {
      const itemPath = join(dirPath, item);
      const itemStat = await stat(itemPath);
      
      if (itemStat.isDirectory()) {
        // Recursively search subdirectories
        await findCsvFilesRecursively(itemPath, csvFiles, basePath);
      } else if (item.toLowerCase().endsWith('.csv')) {
        // Add CSV file to the list
        const relativePath = itemPath.replace(basePath, '').replace(/^[\/\\]/, ''); // Remove leading slash/backslash
        csvFiles.push({
          filename: item,
          fullPath: itemPath,
          relativePath: relativePath
        });
      }
    }
  } catch (error) {
    console.error(`⚠️ Error reading directory ${dirPath}:`, error.message);
  }
  
  return csvFiles;
}

/**
 * Process local CSV files from a directory and stream them directly into staging table
 */
async function processLocalCsvFiles(folderPath, client, counters, failedRecords = []) {
  console.log(`🔄 Processing local CSV files from: ${folderPath}`);
  
  try {
    // Check if the folder exists
    const folderStat = await stat(folderPath);
    if (!folderStat.isDirectory()) {
      throw new Error(`Path is not a directory: ${folderPath}`);
    }
    
    // Recursively find all CSV files
    console.log(`🔍 Searching for CSV files recursively in: ${folderPath}`);
    const csvFiles = await findCsvFilesRecursively(folderPath);
    
    if (csvFiles.length === 0) {
      throw new Error(`No CSV files found in directory tree: ${folderPath}`);
    }
    
    console.log(`📁 Found ${csvFiles.length} CSV files to process (searched recursively)`);
    
    // Show the list of files found
    csvFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.relativePath}`);
    });
    
    // Process each CSV file
    for (const csvFile of csvFiles) {
      console.log(`📄 Processing CSV: ${csvFile.relativePath}`);
      
      try {
        // Create a readable stream from the local file
        const fileStream = createReadStream(csvFile.fullPath);
        await copyCsvStreamIntoStaging(fileStream, client, csvFile.relativePath, failedRecords);
        counters.files++;
        console.log(`✅ Completed CSV: ${csvFile.relativePath}`);
      } catch (error) {
        console.error(`❌ Failed to process CSV ${csvFile.relativePath}:`, error.message);
        // Continue with next file instead of failing completely
        // Don't increment counters.files for failed files
      }
    }
    
    console.log(`✅ Completed processing local CSV files from: ${folderPath}`);
  } catch (error) {
    console.error(`❌ Failed to process local CSV files from ${folderPath}:`, error.message);
    throw error;
  }
}

/**
 * Transform staging data to final table using SQL
 */
async function transformStageToFinal(client) {
  console.log('🔄 Transforming staging data to final table...');
  
  // All casting/dedup is done in one SQL — much faster than per-row JS
  const result = await client.query(`
    INSERT INTO unclaimed_properties (
      id, property_type, cash_reported, shares_reported, name_of_securities_reported,
      number_of_owners, owner_name, owner_street_1, owner_street_2, owner_street_3,
      owner_city, owner_state, owner_zip, owner_country_code, current_cash_balance,
      number_of_pending_claims, number_of_paid_claims, holder_name, holder_street_1,
      holder_street_2, holder_street_3, holder_city, holder_state, holder_zip, cusip
    )
    SELECT DISTINCT ON (PROPERTY_ID, OWNER_NAME)
      COALESCE(NULLIF(PROPERTY_ID,''), gen_random_uuid()::text) AS id,
      NULLIF(PROPERTY_TYPE,''),
      COALESCE(NULLIF(CASH_REPORTED,''),'0')::numeric(15,2),
      COALESCE(NULLIF(SHARES_REPORTED,''),'0')::numeric(15,2),
      NULLIF(NAME_OF_SECURITIES_REPORTED,''),
      COALESCE(NULLIF(NO_OF_OWNERS,''), '1'),
      COALESCE(NULLIF(OWNER_NAME,''), ''),
      NULLIF(OWNER_STREET_1,''),
      NULLIF(OWNER_STREET_2,''),
      NULLIF(OWNER_STREET_3,''),
      NULLIF(OWNER_CITY,''),
      NULLIF(OWNER_STATE,''),
      NULLIF(OWNER_ZIP,''),
      NULLIF(OWNER_COUNTRY_CODE,''),
      COALESCE(NULLIF(CURRENT_CASH_BALANCE,''),'0')::numeric(15,2),
      COALESCE(NULLIF(NUMBER_OF_PENDING_CLAIMS,''),'0')::int,
      COALESCE(NULLIF(NUMBER_OF_PAID_CLAIMS,''),'0')::int,
      COALESCE(NULLIF(HOLDER_NAME,''), ''),
      NULLIF(HOLDER_STREET_1,''),
      NULLIF(HOLDER_STREET_2,''),
      NULLIF(HOLDER_STREET_3,''),
      NULLIF(HOLDER_CITY,''),
      NULLIF(HOLDER_STATE,''),
      NULLIF(HOLDER_ZIP,''),
      NULLIF(CUSIP,'')
    FROM raw_unclaimed_properties
    WHERE COALESCE(NULLIF(OWNER_NAME,''), '') <> ''
    ORDER BY PROPERTY_ID, OWNER_NAME
  `);
  
  console.log(`✅ Transformed ${result.rowCount.toLocaleString()} records to final table`);
  return result.rowCount;
}

/**
 * Create indexes after data load for optimal performance
 */
async function createIndexesAfterLoad(client) {
  console.log('🔨 Creating indexes after data load...');
  
  // Analyze the table first for better query planning
  await client.query(`ANALYZE unclaimed_properties;`);
  console.log('✅ Table analyzed');
  
  // Create indexes concurrently to avoid blocking reads
  await client.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unclaimed_properties_current_cash_balance 
    ON unclaimed_properties(current_cash_balance);
  `);
  console.log('✅ Created cash balance index');
  
  await client.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unclaimed_properties_owner_name_tsv 
    ON unclaimed_properties USING gin (to_tsvector('english', owner_name));
  `);
  console.log('✅ Created owner name full-text index');
  
  await client.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unclaimed_properties_holder_name_tsv 
    ON unclaimed_properties USING gin (to_tsvector('english', holder_name));
  `);
  console.log('✅ Created holder name full-text index');
  
  console.log('✅ All indexes created successfully');
}

/**
 * Create import tracking record
 */
async function createImportRecord(client, totalRecords, sourceUrl) {
  const result = await client.query(`
    INSERT INTO data_imports (source_url, total_records, import_status)
    VALUES ($1, $2, $3)
    RETURNING id
  `, [sourceUrl, totalRecords, 'in_progress']);
  
  return result.rows[0].id;
}

/**
 * Update import record
 */
async function updateImportRecord(client, importId, updates) {
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = $${paramIndex}`);
    values.push(value);
    paramIndex++;
  }

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(importId);

  const query = `
    UPDATE data_imports 
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex}
  `;

  await client.query(query, values);
}

/**
 * Count records in staging table
 */
async function countStagingRecords(client) {
  const result = await client.query('SELECT COUNT(*) FROM raw_unclaimed_properties');
  return parseInt(result.rows[0].count);
}

/**
 * Write failed records to a text file
 */
async function writeFailedRecordsToFile(failedRecords, outputPath) {
  if (failedRecords.length === 0) {
    console.log('✅ No failed records to write');
    return;
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `failed_records_${timestamp}.txt`;
    const fullPath = join(outputPath, filename);
    
    const content = [
      `Failed Records Report - ${new Date().toISOString()}`,
      `Total Failed Records: ${failedRecords.length}`,
      '='.repeat(80),
      '',
      ...failedRecords.map((record, index) => [
        `Record ${index + 1}:`,
        `  File: ${record.file}`,
        `  Line: ${record.line || 'Unknown'}`,
        `  Error: ${record.error}`,
        `  Data: ${JSON.stringify(record.data, null, 2)}`,
        '-'.repeat(40)
      ].join('\n'))
    ].join('\n');

    await writeFile(fullPath, content, 'utf8');
    console.log(`📝 Failed records written to: ${fullPath}`);
    console.log(`📊 Total failed records: ${failedRecords.length}`);
  } catch (error) {
    console.error('❌ Failed to write failed records file:', error.message);
  }
}

/**
 * Main import function using optimized COPY approach
 */
async function main() {
  console.log('🚀 Starting California Unclaimed Property Data Import (COPY Optimized)');
  
  // Determine data source based on command line arguments
  let dataSource;
  if (localFilesPath) {
    console.log('📁 Using local CSV files:');
    console.log(`  Directory: ${localFilesPath}`);
    dataSource = `Local files from: ${localFilesPath}`;
  } else {
    console.log('🌐 Using remote ZIP files:');
    DATA_URLS.forEach((url, index) => {
      console.log(`  ${index + 1}. ${url}`);
    });
    dataSource = DATA_URLS.join('; ');
  }
  
  const client = await pool.connect();
  let importId = null;
  const counters = { files: 0 };
  const failedRecords = [];
  
  try {
    // Step 1: Set session parameters for optimal performance (outside transaction)
    await setSessionParameters(client);
    
    // Step 3: Create tables
    await createTables(client);
    
    // Step 4: Clear staging table
    await client.query('TRUNCATE raw_unclaimed_properties');
    console.log('✅ Cleared staging table');
    
    // Step 5: Process data files and stream CSV data directly into staging
    
    if (localFilesPath) {
      await processLocalCsvFiles(localFilesPath, client, counters, failedRecords);
    } else {
      for (const url of DATA_URLS) {
        await processZipUrlToCopy(url, client, counters, failedRecords);
      }
    }

    // Step 2: Begin transaction
    await client.query('BEGIN');
    
    // Step 6: Count records in staging
    const stagingCount = await countStagingRecords(client);
    console.log(`📊 Total records in staging: ${stagingCount.toLocaleString()}`);
    
    // Step 7: Create import tracking record
    importId = await createImportRecord(client, stagingCount, dataSource);
    console.log(`📝 Created import record with ID: ${importId}`);
    
    // Step 8: Transform staging data to final table
    const finalCount = await transformStageToFinal(client);
    
    // Step 9: Update import record with success
    await updateImportRecord(client, importId, {
      successful_records: finalCount,
      failed_records: stagingCount - finalCount,
      import_status: 'completed'
    });
    
    // Step 10: Commit the transaction
    await client.query('COMMIT');
    console.log('✅ Transaction committed');
    
    // Step 11: Create indexes after data is loaded (outside transaction)
    await createIndexesAfterLoad(client);
    
    // Step 12: Write failed records to file
    const outputPath = localFilesPath ? localFilesPath : __dirname;
    await writeFailedRecordsToFile(failedRecords, outputPath);
    
    console.log('\n✅ Import completed successfully!');
    console.log(`📊 Final Summary:`);
    console.log(`   Staging records: ${stagingCount.toLocaleString()}`);
    console.log(`   Final records: ${finalCount.toLocaleString()}`);
    console.log(`   Files processed: ${counters.files}`);
    console.log(`   Failed records: ${failedRecords.length}`);
    console.log(`   Success rate: ${((finalCount / stagingCount) * 100).toFixed(2)}%`);
    
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    
    try {
      await client.query('ROLLBACK');
      console.log('✅ Transaction rolled back');
    } catch (rollbackError) {
      console.error('❌ Rollback failed:', rollbackError.message);
    }
    
    if (importId) {
      try {
        await updateImportRecord(client, importId, {
          import_status: 'failed',
          error_message: error.message
        });
      } catch (updateError) {
        console.error('❌ Failed to update import record:', updateError.message);
      }
    }
    
    // Write failed records even if import failed
    try {
      const outputPath = localFilesPath ? localFilesPath : __dirname;
      await writeFailedRecordsToFile(failedRecords, outputPath);
    } catch (writeError) {
      console.error('❌ Failed to write failed records file:', writeError.message);
    }
    
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the import
main().catch(console.error);
