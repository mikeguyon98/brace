#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the test file and validate it
const testFile = 'test-new-schema.jsonl';
const lines = fs.readFileSync(testFile, 'utf8').split('\n').filter(line => line.trim());

console.log(`Found ${lines.length} claims in ${testFile}`);

// Parse and validate first few claims
for (let i = 0; i < Math.min(3, lines.length); i++) {
  try {
    const claim = JSON.parse(lines[i]);
    console.log(`Claim ${i + 1}: ${claim.claim_id} -> ${claim.insurance.payer_id}`);
    console.log(`  Patient: ${claim.patient.first_name} ${claim.patient.last_name}`);
    console.log(`  Service lines: ${claim.service_lines.length}`);
    console.log(`  Total amount: $${claim.service_lines.reduce((sum, line) => sum + (line.unit_charge_amount * line.units), 0).toFixed(2)}`);
  } catch (error) {
    console.error(`Error parsing claim ${i + 1}:`, error.message);
  }
}

console.log('\nFile appears to be valid. The simulator should be able to process these claims.'); 