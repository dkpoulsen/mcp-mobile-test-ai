#!/usr/bin/env node
/**
 * Smart Test Selector CLI
 * Standalone CLI for selecting tests based on code changes
 */

import { main } from '../services/smart-test-selector/cli.js';

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
