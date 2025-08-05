#!/usr/bin/env node

/**
 * Generate sample claims data for testing the billing simulator
 * Usage: node scripts/generate-claims.js [count] [output-file]
 */

const fs = require('fs');
const path = require('path');

const PAYER_IDS = ['AETNA_001', 'BCBS_001', 'CIGNA_001', 'HUMANA_001', 'MEDICARE_001'];
const PROCEDURE_CODES = [
  '99213', '99214', '99215', // Office visits
  '71020', '71030', '73000', // X-rays
  '80053', '85025', '80061', // Lab tests
  '93000', '93010', '93015', // EKGs
  '99281', '99282', '99283', // Emergency visits
];

function generateRandomId(prefix, length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = prefix;
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomAmount(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function generateServiceLine() {
  return {
    service_line_id: generateRandomId('SL'),
    procedure_code: randomChoice(PROCEDURE_CODES),
    billed_amount: randomAmount(50, 5000),
    units: Math.floor(Math.random() * 3) + 1,
  };
}

function generateClaim() {
  const claimId = generateRandomId('CLM');
  const patientId = generateRandomId('PAT');
  const providerId = generateRandomId('PRV');
  const payerId = randomChoice(PAYER_IDS);
  
  // Generate 1-5 service lines per claim
  const serviceLineCount = Math.floor(Math.random() * 5) + 1;
  const serviceLines = [];
  
  for (let i = 0; i < serviceLineCount; i++) {
    serviceLines.push(generateServiceLine());
  }
  
  // Generate submission date within the last 30 days
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 30);
  const submissionDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  
  return {
    claim_id: claimId,
    patient_id: patientId,
    payer_id: payerId,
    provider_id: providerId,
    service_lines: serviceLines,
    submission_date: submissionDate.toISOString(),
  };
}

function main() {
  const args = process.argv.slice(2);
  const count = parseInt(args[0]) || 1000;
  const outputFile = args[1] || 'claims.jsonl';
  
  console.log(`Generating ${count} claims to ${outputFile}...`);
  
  const writeStream = fs.createWriteStream(outputFile);
  
  for (let i = 0; i < count; i++) {
    const claim = generateClaim();
    writeStream.write(JSON.stringify(claim) + '\n');
    
    if ((i + 1) % 100 === 0) {
      console.log(`Generated ${i + 1} claims...`);
    }
  }
  
  writeStream.end();
  
  console.log(`Successfully generated ${count} claims in ${outputFile}`);
  
  // Print sample stats
  const sampleClaim = generateClaim();
  console.log('\nSample claim:');
  console.log(JSON.stringify(sampleClaim, null, 2));
  
  console.log('\nPayer distribution:');
  PAYER_IDS.forEach(payerId => {
    console.log(`  ${payerId}: ~${Math.round(100 / PAYER_IDS.length)}%`);
  });
}

if (require.main === module) {
  main();
}