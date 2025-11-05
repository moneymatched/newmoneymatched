#!/usr/bin/env node

/**
 * Debug script to extract and inspect CSV file structures
 * This will help us understand the column mismatch issue
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import unzipper from 'unzipper';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const DATA_URLS = [
  'https://dpupd.sco.ca.gov/04_From_500_To_Beyond.zip',
  'https://dpupd.sco.ca.gov/03_From_100_To_Below_500.zip'
];

const DOWNLOAD_DIR = path.join(__dirname, '../temp/debug');
const EXTRACT_DIR = path.join(DOWNLOAD_DIR, 'extracted');

// Create directories
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(EXTRACT_DIR)) {
  fs.mkdirSync(EXTRACT_DIR, { recursive: true });
}

async function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    console.log(`📥 Downloading ${url}...`);
    const file = fs.createWriteStream(destination);
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`✅ Downloaded to ${destination}`);
          resolve();
        });
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        console.log(`↗️ Redirecting to ${redirectUrl}`);
        downloadFile(redirectUrl, destination).then(resolve).catch(reject);
      } else {
        reject(new Error(`Download failed with status code: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function extractZipFile(zipPath, extractDir) {
  console.log(`📦 Extracting ${zipPath}...`);
  
  const zipFileName = path.basename(zipPath, '.zip');
  const uniqueExtractDir = path.join(extractDir, zipFileName);
  
  if (!fs.existsSync(uniqueExtractDir)) {
    fs.mkdirSync(uniqueExtractDir, { recursive: true });
  }
  
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(uniqueExtractDir, true);
  
  // Find CSV files
  const csvFiles = findCSVFilesRecursively(uniqueExtractDir);
  console.log(`✅ Extracted ${path.basename(zipPath)} and found ${csvFiles.length} CSV files`);
  
  return csvFiles;
}

function findCSVFilesRecursively(dir) {
  let csvFiles = [];
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      csvFiles = csvFiles.concat(findCSVFilesRecursively(fullPath));
    } else if (file.toLowerCase().endsWith('.csv')) {
      csvFiles.push(fullPath);
    }
  }
  
  return csvFiles;
}

function inspectCSVFile(filePath) {
  console.log(`\n🔍 Inspecting: ${path.basename(filePath)}`);
  console.log(`   Full path: ${filePath}`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    if (lines.length === 0) {
      console.log('   ❌ File is empty');
      return;
    }
    
    const headerLine = lines[0];
    const firstDataLine = lines[1] || '';
    
    console.log(`   📊 File size: ${(fs.statSync(filePath).size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   📊 Total lines: ${lines.length.toLocaleString()}`);
    console.log(`   📋 Header columns: ${headerLine.split(',').length}`);
    console.log(`   📋 Headers: ${headerLine.split(',').slice(0, 10).join(', ')}${headerLine.split(',').length > 10 ? '...' : ''}`);
    
    if (firstDataLine) {
      console.log(`   📄 First data columns: ${firstDataLine.split(',').length}`);
      console.log(`   📄 Sample data: ${firstDataLine.split(',').slice(0, 5).join(', ')}${firstDataLine.split(',').length > 5 ? '...' : ''}`);
    }
    
    // Check for potential issues
    const headerCols = headerLine.split(',').length;
    const dataCols = firstDataLine.split(',').length;
    
    if (headerCols !== dataCols) {
      console.log(`   ⚠️  COLUMN MISMATCH: Headers have ${headerCols} columns, data has ${dataCols} columns`);
    }
    
    // Look for problematic characters
    if (content.includes('\r\n')) {
      console.log(`   ⚠️  Windows line endings detected`);
    }
    
    if (content.includes('"') && content.includes('""')) {
      console.log(`   ⚠️  Escaped quotes detected`);
    }
    
  } catch (error) {
    console.log(`   ❌ Error reading file: ${error.message}`);
  }
}

async function main() {
  console.log('🔍 CSV Structure Debug Tool');
  console.log('This will download and extract ZIP files to inspect CSV structures\n');
  
  for (let i = 0; i < DATA_URLS.length; i++) {
    const url = DATA_URLS[i];
    const zipFile = path.join(DOWNLOAD_DIR, `debug_data_${i + 1}.zip`);
    
    console.log(`\n🔄 Processing ZIP ${i + 1}/${DATA_URLS.length}: ${path.basename(zipFile)}`);
    
    try {
      // Download if not exists
      if (!fs.existsSync(zipFile)) {
        await downloadFile(url, zipFile);
      } else {
        console.log(`🔎 Found existing file: ${path.basename(zipFile)}`);
      }
      
      // Extract
      const csvFiles = await extractZipFile(zipFile, EXTRACT_DIR);
      
      // Inspect each CSV file
      for (const csvFile of csvFiles) {
        inspectCSVFile(csvFile);
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${url}:`, error.message);
    }
  }
  
  console.log('\n✅ Debug complete!');
  console.log(`📁 Files extracted to: ${EXTRACT_DIR}`);
  console.log('\nYou can now use commands like:');
  console.log(`head -5 "${EXTRACT_DIR}/california_data_2/From_100_To_Below_500_10_of_11.csv"`);
  console.log(`wc -l "${EXTRACT_DIR}/california_data_2/From_100_To_Below_500_10_of_11.csv"`);
}

main().catch(console.error);
