#!/usr/bin/env node

/**
 * Generate sample claims data for testing the billing simulator
 * Updated to match the new PayerClaim JSON schema specification
 * Usage: node scripts/generate-claims.js [count] [output-file]
 */

const fs = require('fs');
const path = require('path');

// Updated to match schema enum values
const PAYER_IDS = ['medicare', 'united_health_group', 'anthem'];
const PROCEDURE_CODES = [
  '99213', '99214', '99215', // Office visits
  '71020', '71030', '73000', // X-rays
  '80053', '85025', '80061', // Lab tests
  '93000', '93010', '93015', // EKGs
  '99281', '99282', '99283', // Emergency visits
];

const FIRST_NAMES = [
  'John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa',
  'Christopher', 'Amy', 'Daniel', 'Michelle', 'Matthew', 'Jennifer', 'Mark', 'Jessica'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas'
];

const ORGANIZATION_NAMES = [
  'Metropolitan Medical Center', 'Riverside Healthcare', 'Central Valley Clinic',
  'Northside Family Practice', 'Downtown Medical Associates', 'Suburban Health Center'
];

const STATES = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI'];
const CITIES = ['Los Angeles', 'New York', 'Houston', 'Miami', 'Chicago', 'Philadelphia', 'Columbus', 'Atlanta', 'Charlotte', 'Detroit'];

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

function generateNPI() {
  // Generate a 10-digit NPI number
  let npi = '';
  for (let i = 0; i < 10; i++) {
    npi += Math.floor(Math.random() * 10);
  }
  return npi;
}

function generateAddress() {
  return {
    street: `${Math.floor(Math.random() * 9999) + 1} ${randomChoice(['Main', 'Oak', 'Pine', 'Cedar', 'Elm'])} St`,
    city: randomChoice(CITIES),
    state: randomChoice(STATES),
    zip: String(Math.floor(Math.random() * 90000) + 10000),
    country: 'US'
  };
}

function generateDate() {
  // Generate birth date between 18-80 years ago
  const now = new Date();
  const minAge = 18;
  const maxAge = 80;
  const ageInMs = (minAge + Math.random() * (maxAge - minAge)) * 365.25 * 24 * 60 * 60 * 1000;
  const birthDate = new Date(now.getTime() - ageInMs);
  return birthDate.toISOString().split('T')[0]; // YYYY-MM-DD format
}

function generateServiceLine() {
  const procedureCode = randomChoice(PROCEDURE_CODES);
  const unitChargeAmount = randomAmount(50, 500);
  
  return {
    service_line_id: generateRandomId('SL'),
    procedure_code: procedureCode,
    units: Math.floor(Math.random() * 3) + 1,
    details: `${procedureCode} - Medical procedure`,
    unit_charge_currency: 'USD',
    unit_charge_amount: unitChargeAmount,
  };
}

function generateClaim() {
  const claimId = generateRandomId('CLM');
  const payerId = randomChoice(PAYER_IDS);
  
  // Generate patient data
  const patient = {
    first_name: randomChoice(FIRST_NAMES),
    last_name: randomChoice(LAST_NAMES),
    gender: randomChoice(['m', 'f']),
    dob: generateDate(),
    address: generateAddress()
  };
  
  // Generate organization data
  const organization = {
    name: randomChoice(ORGANIZATION_NAMES),
    billing_npi: generateNPI(),
    ein: `${Math.floor(Math.random() * 90) + 10}-${String(Math.floor(Math.random() * 9000000) + 1000000)}`,
    contact: {
      first_name: randomChoice(FIRST_NAMES),
      last_name: randomChoice(LAST_NAMES),
      phone_number: `${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`
    },
    address: generateAddress()
  };
  
  // Generate rendering provider
  const renderingProvider = {
    first_name: randomChoice(FIRST_NAMES),
    last_name: randomChoice(LAST_NAMES),
    npi: generateNPI()
  };
  
  // Generate insurance data
  const insurance = {
    payer_id: payerId,
    patient_member_id: generateRandomId('MEM', 12)
  };
  
  // Generate 1-5 service lines per claim
  const serviceLineCount = Math.floor(Math.random() * 5) + 1;
  const serviceLines = [];
  
  for (let i = 0; i < serviceLineCount; i++) {
    serviceLines.push(generateServiceLine());
  }
  
  return {
    claim_id: claimId,
    place_of_service_code: Math.floor(Math.random() * 99) + 1, // 1-99 valid range
    insurance: insurance,
    patient: patient,
    organization: organization,
    rendering_provider: renderingProvider,
    service_lines: serviceLines,
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
  
  console.log('\nNote: Generated claims now match the new PayerClaim JSON schema format');
  console.log('- Service lines include unit_charge_currency and unit_charge_amount');
  console.log('- Claims include patient, organization, and rendering_provider objects');
  console.log('- Insurance info is nested under insurance object');
  console.log('- Place of service code is included');
}

if (require.main === module) {
  main();
}