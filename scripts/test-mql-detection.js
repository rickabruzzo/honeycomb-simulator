#!/usr/bin/env node
/**
 * Test MQL and stakeholder detection logic.
 *
 * Usage: node scripts/test-mql-detection.js
 */

const fs = require('fs');
const path = require('path');

// Simple recreation of detection logic for testing
const CONFIG_PATH = path.join(__dirname, '../lib/simulator.config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectMQLCues(text) {
  const normalized = normalizeText(text);
  const cues = config.mql_cues || [];
  const matched = [];

  for (const cue of cues) {
    const normalizedCue = normalizeText(cue);
    if (normalized.includes(normalizedCue)) {
      matched.push(cue);
    }
  }

  const patterns = [
    { pattern: /scan\s+(my\s+)?badge/, label: 'scan badge' },
    { pattern: /follow\s+up/, label: 'follow up' },
    { pattern: /talk\s+(to\s+|with\s+)?(sales|leadership|manager)/, label: 'talk to sales/leadership' },
    { pattern: /\b(pricing|budget|cost\s+savings?|roi)\b/, label: 'pricing/budget/roi' },
    { pattern: /connect\s+(with\s+)?(my\s+)?(manager|lead|team)/, label: 'connect with decision maker' },
    { pattern: /(don\s?t|do\s+not)\s+make\s+(the\s+)?decision/, label: 'IC without authority' },
    { pattern: /help\s+(me\s+)?make\s+(the\s+)?case/, label: 'help advocate' },
  ];

  for (const { pattern, label } of patterns) {
    if (pattern.test(normalized) && !matched.includes(label)) {
      matched.push(label);
    }
  }

  return { detected: matched.length > 0, matched: matched.slice(0, 5) };
}

function detectStakeholderType(personaProfile, transcript = '') {
  const normalized = normalizeText(personaProfile);
  const stakeholders = config.stakeholder_types || {};

  const executiveTitles = stakeholders.executive?.titles || [];
  for (const title of executiveTitles) {
    const normalizedTitle = normalizeText(title);
    if (normalized.includes(normalizedTitle)) {
      return 'executive';
    }
  }

  const icTitles = stakeholders.ic_without_authority?.titles || [];
  for (const title of icTitles) {
    const normalizedTitle = normalizeText(title);
    if (normalized.includes(normalizedTitle)) {
      return 'ic_without_authority';
    }
  }

  if (transcript) {
    const normalizedTranscript = normalizeText(transcript);
    const icSignals = stakeholders.ic_without_authority?.signals || [];

    for (const signal of icSignals) {
      const normalizedSignal = normalizeText(signal);
      if (normalizedTranscript.includes(normalizedSignal)) {
        return 'ic_without_authority';
      }
    }
  }

  return 'unknown';
}

console.log('🧪 Testing MQL Detection Logic\n');

// Test cases
const testCases = [
  {
    name: 'Badge scan request',
    message: 'This looks interesting. Can you scan my badge and follow up?',
    expectedMQL: true,
  },
  {
    name: 'Pricing inquiry',
    message: 'I would like to talk about pricing and see if this fits our budget.',
    expectedMQL: true,
  },
  {
    name: 'IC without authority',
    message: 'I love this, but I do not make the decision. Can you connect with my manager?',
    expectedMQL: true,
  },
  {
    name: 'Executive - cost focus',
    message: 'What kind of cost savings are we talking about? Lets schedule a call.',
    expectedMQL: true,
  },
  {
    name: 'Self-service (not MQL)',
    message: 'Is there a free tier I can try out on my own?',
    expectedMQL: false,
  },
  {
    name: 'Demo interest (not MQL)',
    message: 'I would love to see a quick demo of how this works.',
    expectedMQL: false,
  },
];

console.log('MQL Detection Tests:');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const result = detectMQLCues(test.message);
  const success = result.detected === test.expectedMQL;

  if (success) {
    passed++;
    console.log(`✅ PASS: ${test.name}`);
    if (result.detected) {
      console.log(`   Matched: ${result.matched.join(', ')}`);
    }
  } else {
    failed++;
    console.log(`❌ FAIL: ${test.name}`);
    console.log(`   Expected: ${test.expectedMQL}, Got: ${result.detected}`);
    if (result.matched.length > 0) {
      console.log(`   Matched: ${result.matched.join(', ')}`);
    }
  }
  console.log();
}

console.log('Stakeholder Detection Tests:');
console.log('='.repeat(60));

const stakeholderTests = [
  {
    name: 'CTO (executive)',
    profile: 'Persona: CTO\nModifiers: Budget conscious',
    expected: 'executive',
  },
  {
    name: 'VP Engineering (executive)',
    profile: 'Persona: VP of Engineering\nModifiers: Cost optimization focus',
    expected: 'executive',
  },
  {
    name: 'Director (executive)',
    profile: 'Persona: Director of Platform\nModifiers: Strategic planning',
    expected: 'executive',
  },
  {
    name: 'SRE (IC)',
    profile: 'Persona: SRE\nModifiers: Alert fatigue',
    expected: 'ic_without_authority',
  },
  {
    name: 'Senior Engineer (IC)',
    profile: 'Persona: Senior Engineer\nModifiers: Observability champion',
    expected: 'ic_without_authority',
  },
  {
    name: 'IC revealed through conversation',
    profile: 'Persona: Engineer\nModifiers: Curious',
    transcript: 'I really like this but I do not make the decision. Can you follow up with my manager?',
    expected: 'ic_without_authority',
  },
];

for (const test of stakeholderTests) {
  const result = detectStakeholderType(test.profile, test.transcript || '');
  const success = result === test.expected;

  if (success) {
    passed++;
    console.log(`✅ PASS: ${test.name}`);
    console.log(`   Type: ${result}`);
  } else {
    failed++;
    console.log(`❌ FAIL: ${test.name}`);
    console.log(`   Expected: ${test.expected}, Got: ${result}`);
  }
  console.log();
}

console.log('='.repeat(60));
console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}

console.log('\n🎉 All detection tests passed!\n');
