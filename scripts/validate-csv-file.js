#!/usr/bin/env node

/**
 * CSV Validation Script for From_100_To_Below_500_10_of_11.csv
 * 
 * This script will analyze the problematic CSV file to understand:
 * - Column count variations
 * - Data format issues
 * - Line ending problems
 * - Quote/escape character issues
 * - Specific problematic rows
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the problematic CSV file
const CSV_FILE_PATH = '/Users/sblatt/dev/getmoneyclaude/temp/debug/extracted/debug_data_2/From_100_To_Below_500_10_of_11.csv';

/**
 * Analyze CSV file structure and identify issues
 */
async function validateCSVFile(filePath) {
  console.log('🔍 CSV File Validation Tool');
  console.log(`📁 Analyzing: ${path.basename(filePath)}`);
  console.log(`📍 Full path: ${filePath}\n`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    console.log('\n💡 Make sure to run the debug-csv-structure.js script first to extract the files.');
    return;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    console.log(`📊 File Statistics:`);
    console.log(`   File size: ${(fs.statSync(filePath).size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Total lines: ${lines.length.toLocaleString()}`);
    console.log(`   Total characters: ${content.length.toLocaleString()}\n`);

    // Analyze header
    const headerLine = lines[0];
    const headerColumns = headerLine.split(',');
    console.log(`📋 Header Analysis:`);
    console.log(`   Header columns: ${headerColumns.length}`);
    console.log(`   Header: ${headerColumns.slice(0, 5).join(', ')}${headerColumns.length > 5 ? '...' : ''}`);
    console.log(`   Full header: ${headerLine}\n`);

    // Analyze first few data rows
    console.log(`📄 Data Row Analysis (first 10 rows):`);
    const columnCounts = new Map();
    const problematicRows = [];
    
    for (let i = 1; i <= Math.min(10, lines.length - 1); i++) {
      if (lines[i].trim()) {
        const columns = lines[i].split(',');
        const columnCount = columns.length;
        
        columnCounts.set(columnCount, (columnCounts.get(columnCount) || 0) + 1);
        
        console.log(`   Row ${i}: ${columnCount} columns`);
        if (columnCount !== headerColumns.length) {
          problematicRows.push({ row: i, expected: headerColumns.length, actual: columnCount });
          console.log(`     ⚠️  MISMATCH: Expected ${headerColumns.length}, got ${columnCount}`);
          console.log(`     Sample: ${columns.slice(0, 3).join(', ')}...`);
        }
      }
    }

    // Analyze column count distribution
    console.log(`\n📊 Column Count Distribution:`);
    for (const [count, frequency] of columnCounts.entries()) {
      console.log(`   ${count} columns: ${frequency} rows`);
    }

    // Find all problematic rows
    console.log(`\n🔍 Scanning entire file for column mismatches...`);
    let totalMismatches = 0;
    const mismatchRows = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const columns = lines[i].split(',');
        if (columns.length !== headerColumns.length) {
          totalMismatches++;
          if (mismatchRows.length < 10) {
            mismatchRows.push({
              row: i,
              expected: headerColumns.length,
              actual: columns.length,
              sample: columns.slice(0, 3).join(', ')
            });
          }
        }
      }
    }

    console.log(`   Total rows with column mismatches: ${totalMismatches.toLocaleString()}`);
    console.log(`   Percentage of problematic rows: ${((totalMismatches / (lines.length - 1)) * 100).toFixed(2)}%`);

    if (mismatchRows.length > 0) {
      console.log(`\n⚠️  Sample Problematic Rows:`);
      mismatchRows.forEach(({ row, expected, actual, sample }) => {
        console.log(`   Row ${row}: Expected ${expected}, got ${actual} - ${sample}...`);
      });
    }

    // Analyze specific problematic row in detail
    if (mismatchRows.length > 0) {
      const firstProblematicRow = mismatchRows[0];
      console.log(`\n🔬 Detailed Analysis of Row ${firstProblematicRow.row}:`);
      
      const problematicLine = lines[firstProblematicRow.row];
      const columns = problematicLine.split(',');
      
      console.log(`   Full line: ${problematicLine}`);
      console.log(`   Column breakdown:`);
      columns.forEach((col, index) => {
        console.log(`     ${index + 1}: "${col}"`);
      });
      
      // Check for extra columns
      if (columns.length > headerColumns.length) {
        console.log(`\n   Extra columns (${columns.length - headerColumns.length}):`);
        for (let i = headerColumns.length; i < columns.length; i++) {
          console.log(`     Extra ${i - headerColumns.length + 1}: "${columns[i]}"`);
        }
      }
    }

    // Check for common CSV issues
    console.log(`\n🔍 Common CSV Issues Check:`);
    
    // Line endings
    if (content.includes('\r\n')) {
      console.log(`   ⚠️  Windows line endings (\\r\\n) detected`);
    } else if (content.includes('\r')) {
      console.log(`   ⚠️  Mac line endings (\\r) detected`);
    } else {
      console.log(`   ✅ Unix line endings (\\n) detected`);
    }

    // Quote issues
    const quoteCount = (content.match(/"/g) || []).length;
    const escapedQuoteCount = (content.match(/""/g) || []).length;
    console.log(`   Quote characters: ${quoteCount.toLocaleString()}`);
    console.log(`   Escaped quotes (""): ${escapedQuoteCount.toLocaleString()}`);

    // Check for unescaped quotes in data
    const unescapedQuotes = content.match(/[^"]"[^"]/g) || [];
    if (unescapedQuotes.length > 0) {
      console.log(`   ⚠️  Potential unescaped quotes: ${unescapedQuotes.length}`);
    }

    // Check for commas in quoted fields
    const quotedCommas = content.match(/"[^"]*,[^"]*"/g) || [];
    if (quotedCommas.length > 0) {
      console.log(`   ⚠️  Commas inside quoted fields: ${quotedCommas.length}`);
    }

    // File encoding check
    console.log(`\n📝 File Encoding:`);
    try {
      const buffer = fs.readFileSync(filePath);
      const encoding = buffer.toString('utf8') === content ? 'UTF-8' : 'Other';
      console.log(`   Encoding: ${encoding}`);
    } catch (error) {
      console.log(`   Encoding: Could not determine`);
    }

    // Recommendations
    console.log(`\n💡 Recommendations:`);
    if (totalMismatches > 0) {
      console.log(`   1. The file has ${totalMismatches} rows with column mismatches`);
      console.log(`   2. Consider using a more flexible CSV parser that can handle variable columns`);
      console.log(`   3. Or preprocess the file to fix column counts before importing`);
      console.log(`   4. Check if the extra columns contain important data that should be preserved`);
    }
    
    if (quoteCount > 0) {
      console.log(`   5. File contains quoted fields - ensure proper quote/escape handling`);
    }

    console.log(`\n✅ Validation complete!`);

  } catch (error) {
    console.error(`❌ Error analyzing file: ${error.message}`);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting CSV Validation...\n');
  
  await validateCSVFile(CSV_FILE_PATH);
  
  console.log('\n📋 Summary:');
  console.log('This validation helps identify the exact issues with the CSV file structure.');
  console.log('Use this information to either:');
  console.log('1. Fix the CSV file before importing');
  console.log('2. Modify the import script to handle the specific issues');
  console.log('3. Use a different CSV parsing approach for this file');
}

// Run the validation
main().catch(console.error);
