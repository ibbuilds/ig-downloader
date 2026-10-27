#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Explicit root-level files keep platform-specific fixtures out of core CI.
const tests = fs.readdirSync(path.join(__dirname, '..', 'tests'))
    .filter((file) => file.endsWith('.test.js'))
    .sort()
    .map((file) => path.join(__dirname, '..', 'tests', file));
if (!tests.length) throw new Error('No core test files found.');
const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
