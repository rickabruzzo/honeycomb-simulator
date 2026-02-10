#!/usr/bin/env node
/**
 * Validates simulator.config.json structure and schema.
 *
 * Usage: node scripts/validate-config.js
 * Exit code: 0 on success, 1 on failure
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../lib/simulator.config.json');

function validateConfig() {
  console.log('🔍 Validating simulator.config.json...\n');

  // 1. Check file exists
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ ERROR: simulator.config.json not found at', CONFIG_PATH);
    process.exit(1);
  }

  // 2. Parse JSON
  let config;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(raw);
    console.log('✅ Valid JSON syntax');
  } catch (err) {
    console.error('❌ ERROR: Invalid JSON syntax');
    console.error(err.message);
    process.exit(1);
  }

  // 3. Validate top-level structure
  const requiredKeys = [
    'simulator_name',
    'version',
    'state_order',
    'states',
    'conversation_rules',
    'mql_cues',
    'stakeholder_types',
    'grading_criteria'
  ];

  const missing = requiredKeys.filter(key => !(key in config));
  if (missing.length > 0) {
    console.error('❌ ERROR: Missing required top-level keys:', missing.join(', '));
    process.exit(1);
  }
  console.log('✅ All required top-level keys present');

  // 4. Validate states structure
  const states = config.states;
  const stateOrder = config.state_order;

  if (!Array.isArray(stateOrder) || stateOrder.length === 0) {
    console.error('❌ ERROR: state_order must be a non-empty array');
    process.exit(1);
  }

  for (const stateName of stateOrder) {
    if (!(stateName in states)) {
      console.error(`❌ ERROR: State "${stateName}" in state_order not found in states object`);
      process.exit(1);
    }

    const state = states[stateName];
    if (!state.description) {
      console.error(`❌ ERROR: State "${stateName}" missing description`);
      process.exit(1);
    }
  }
  console.log('✅ State structure valid');

  // 5. Validate OUTCOME state
  const outcome = states.OUTCOME;
  if (!outcome) {
    console.error('❌ ERROR: OUTCOME state not found');
    process.exit(1);
  }

  if (!Array.isArray(outcome.possible_outcomes) || outcome.possible_outcomes.length === 0) {
    console.error('❌ ERROR: OUTCOME.possible_outcomes must be a non-empty array');
    process.exit(1);
  }

  const requiredOutcomes = ['DEMO_READY', 'SELF_SERVICE_READY', 'MQL_READY', 'POLITE_EXIT'];
  for (const required of requiredOutcomes) {
    if (!outcome.possible_outcomes.includes(required)) {
      console.error(`❌ ERROR: Missing required outcome: ${required}`);
      process.exit(1);
    }
  }
  console.log('✅ OUTCOME state valid with all required outcomes');

  // 6. Validate MQL configuration
  if (!Array.isArray(config.mql_cues) || config.mql_cues.length === 0) {
    console.error('❌ ERROR: mql_cues must be a non-empty array');
    process.exit(1);
  }
  console.log(`✅ MQL cues configured (${config.mql_cues.length} cues)`);

  // 7. Validate stakeholder types
  const stakeholders = config.stakeholder_types;
  if (!stakeholders.executive || !stakeholders.ic_without_authority) {
    console.error('❌ ERROR: stakeholder_types must include executive and ic_without_authority');
    process.exit(1);
  }

  if (!Array.isArray(stakeholders.executive.titles) || stakeholders.executive.titles.length === 0) {
    console.error('❌ ERROR: stakeholder_types.executive.titles must be a non-empty array');
    process.exit(1);
  }

  if (!Array.isArray(stakeholders.ic_without_authority.titles) || stakeholders.ic_without_authority.titles.length === 0) {
    console.error('❌ ERROR: stakeholder_types.ic_without_authority.titles must be a non-empty array');
    process.exit(1);
  }
  console.log('✅ Stakeholder types configured');

  // 8. Validate grading criteria
  const grading = config.grading_criteria;
  if (!grading.A_B || !grading.C || !grading.D || !grading.F) {
    console.error('❌ ERROR: grading_criteria must include A_B, C, D, and F');
    process.exit(1);
  }

  if (!grading.mql_grading_rules) {
    console.error('❌ ERROR: grading_criteria missing mql_grading_rules');
    process.exit(1);
  }

  if (!Array.isArray(grading.F.exclusions) || grading.F.exclusions.length === 0) {
    console.error('❌ ERROR: grading_criteria.F.exclusions must be a non-empty array');
    process.exit(1);
  }

  const hasMLQExclusion = grading.F.exclusions.some(ex =>
    ex.includes('MQL_READY') && ex.includes('never')
  );
  const hasSelfServiceExclusion = grading.F.exclusions.some(ex =>
    ex.includes('SELF_SERVICE_READY') && ex.includes('never')
  );

  if (!hasMLQExclusion) {
    console.error('❌ ERROR: MQL_READY must be excluded from F grade');
    process.exit(1);
  }

  if (!hasSelfServiceExclusion) {
    console.error('❌ ERROR: SELF_SERVICE_READY must be excluded from F grade');
    process.exit(1);
  }
  console.log('✅ Grading criteria valid with proper exclusions');

  // 9. Validate turn limits
  const turnLimits = config.conversation_rules?.turn_limits;
  if (!turnLimits || !turnLimits.easy || !turnLimits.medium || !turnLimits.hard) {
    console.error('❌ ERROR: conversation_rules.turn_limits must include easy, medium, and hard');
    process.exit(1);
  }
  console.log('✅ Turn limits configured');

  console.log('\n🎉 All validation checks passed!\n');
  console.log('Summary:');
  console.log(`  - States: ${stateOrder.length}`);
  console.log(`  - Outcomes: ${outcome.possible_outcomes.length}`);
  console.log(`  - MQL cues: ${config.mql_cues.length}`);
  console.log(`  - Self-service cues: ${config.self_service_cues?.length || 0}`);
  console.log(`  - Stakeholder types: ${Object.keys(stakeholders).length}`);
  console.log(`  - Banned keywords: ${config.keyword_restrictions?.banned_product_keywords?.length || 0}`);
  console.log(`  - Turn limits: easy=${turnLimits.easy}, medium=${turnLimits.medium}, hard=${turnLimits.hard}`);
}

try {
  validateConfig();
} catch (err) {
  console.error('❌ UNEXPECTED ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
}
