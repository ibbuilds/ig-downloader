'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const provider = require('../../providers/__ID__');
const { assertProvider } = require('../../core/provider.js');

test('__ID__ contract and hostname matching', () => {
    assert.equal(assertProvider(provider), provider);
    assert.equal(provider.match('https://__ID__.example.test/post/1'), true);
    assert.equal(provider.match('https://not-__ID__.example.test/post/1'), false);
});

test('TODO: add sanitized fixtures, provenance, error and access tests', () => {
    assert.fail('Complete the __ID__ provider before submitting a PR.');
});
