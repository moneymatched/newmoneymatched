#!/usr/bin/env node

/**
 * Scan all CSV files in a folder (recursively) for commas inside quoted fields.
 *
 * Usage: node find-bad-commas.js <folder>
 */

import { readdir, stat, readFile } from "fs/promises";
import { join } from "path";

async function findCsvFiles(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await findCsvFiles(fullPath, files);
    } else if (entry.name.toLowerCase().endsWith(".csv")) {
      files.push(fullPath);
    }
  }
  return files;
}

function hasCommaInsideQuotes(line) {
  // Match quoted sections
  const regex = /"([^"]*)"/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    if (match[1].includes(",")) {
      return true;
    }
  }
  return false;
}

async function scanFile(filePath) {
  const content = await readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (hasCommaInsideQuotes(line)) {
    //   console.log(`${filePath}:${idx + 1}: ${line}`);
    }
  });
}

async function main() {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error("Usage: node find-bad-commas.js <folder>");
    process.exit(1);
  }

  const csvFiles = await findCsvFiles(targetDir);
  if (csvFiles.length === 0) {
    console.log("No CSV files found.");
    return;
  }

  for (const file of csvFiles) {
    await scanFile(file);
  }
}

main().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
