#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration mapping
const payerMapping = {
  'AETNA_001': 'anthem',
  'BCBS_001': 'united_health_group', 
  'CIGNA_001': 'medicare',
  'HUMANA_001': 'medicare',
  'MEDICARE_001': 'medicare'
};

const nameMapping = {
  'Aetna (Strict)': 'Anthem (Strict)',
  'Blue Cross Blue Shield (High Rejection)': 'United Health Group (High Rejection)',
  'Cigna (Lenient)': 'Medicare (Denial Demo)',
  'Humana (Standard)': 'Medicare (Denial Demo)',
  'Medicare (Denial Demo)': 'Medicare (Denial Demo)'
};

// Get all JSON files in config directory
const configDir = path.join(__dirname, 'config');
const files = fs.readdirSync(configDir).filter(file => file.endsWith('.json'));

console.log('Updating config files...');

files.forEach(file => {
  const filePath = path.join(configDir, file);
  console.log(`Processing ${file}...`);
  
  try {
    // Read the file
    const content = fs.readFileSync(filePath, 'utf8');
    let config = JSON.parse(content);
    
    // Update payer IDs and names
    if (config.payers && Array.isArray(config.payers)) {
      // Remove duplicates and update IDs
      const updatedPayers = [];
      const seenIds = new Set();
      
      config.payers.forEach(payer => {
        const newId = payerMapping[payer.payer_id] || payer.payer_id;
        const newName = nameMapping[payer.name] || payer.name;
        
        if (!seenIds.has(newId)) {
          seenIds.add(newId);
          updatedPayers.push({
            ...payer,
            payer_id: newId,
            name: newName
          });
        }
      });
      
      config.payers = updatedPayers;
    }
    
    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    console.log(`✅ Updated ${file}`);
    
  } catch (error) {
    console.error(`❌ Error processing ${file}:`, error.message);
  }
});

console.log('Config update complete!'); 