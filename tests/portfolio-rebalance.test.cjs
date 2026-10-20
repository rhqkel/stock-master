const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/portfolio-rebalance.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, context);
const { migrateRebalance, calculateRebalance } = context.exports;
const holding = (id, category, value) => ({ id, name: id, category, quantity: 1,
  currentPriceKrw: value, currentPriceUsd: value / 1000, avgPriceKrw: value, avgPriceUsd: value / 1000 });
const assets = [holding('BTC', '가상자산', 600), holding('AAPL', '미국주식', 300), holding('MSFT', '미국주식', 100)];

test('legacy exclusions and target totals survive migration; targets stay fixed after price changes', () => {
  const migrated = migrateRebalance(assets, { '가상자산': 50, '미국주식': 50 }, { '가상자산': false });
  assert.equal(migrated.rebalanceEnabled['asset:BTC'], false);
  assert.equal(migrated.targetWeights['asset:AAPL'], 37.5);
  assert.equal(migrated.targetWeights['asset:MSFT'], 12.5);
  const later = migrateRebalance(assets.map(a => ({ ...a, name: 'renamed', currentPriceKrw: 999 })), migrated.targetWeights, migrated.rebalanceEnabled);
  assert.equal(later.targetWeights['asset:AAPL'], 37.5);
  assert.equal(later.rebalanceEnabled['asset:BTC'], false);
});

test('excluded holdings leave denominator, targets, actions and selected chart holdings in both currencies', () => {
  const weights = { 'asset:BTC': 80, 'asset:AAPL': 50, 'asset:MSFT': 50 };
  const enabled = { 'asset:BTC': false };
  for (const currency of ['KRW', 'USD']) {
    const result = calculateRebalance(assets, weights, enabled, currency);
    assert.equal(result.total, currency === 'KRW' ? 400 : 0.4);
    assert.equal(result.targetTotal, 100);
    assert.equal(result.selectedAssets.length, 2);
    assert.equal(result.rows[0].currentWeight, 0);
    assert.equal(result.rows[0].difference, 0);
    assert.ok(Math.abs(result.rows[1].currentWeight - 75) < 1e-10);
    assert.ok(Math.abs(result.rows.reduce((s, row) => s + row.currentWeight, 0) - 100) < 1e-10);
    assert.ok(Math.abs(result.rows[1].difference - (currency === 'KRW' ? -100 : -0.1)) < 1e-10);
  }
  const one = calculateRebalance(assets, weights, { ...enabled, 'asset:AAPL': false }, 'KRW');
  assert.equal(one.rows[2].currentWeight, 100);
  assert.equal(assets.length, 3);
});

test('all excluded, empty holdings, and zero value stay finite with no trade action', () => {
  for (const result of [calculateRebalance([], {}, {}, 'KRW'),
    calculateRebalance(assets, {}, Object.fromEntries(assets.map(a => [`asset:${a.id}`, false])), 'KRW'),
    calculateRebalance([holding('zero', '현금', 0)], { 'asset:zero': 100 }, {}, 'KRW')]) {
    assert.equal(result.total, 0);
    result.rows.forEach(row => { assert.equal(row.currentWeight, 0); assert.equal(row.difference, 0); });
  }
});

test('stable IDs separate identical names; deleted targets do not count; new holdings start at zero', () => {
  const sameNames = assets.map(a => ({ ...a, name: 'same' }));
  const migrated = migrateRebalance(sameNames, { 'asset:AAPL': 70, 'asset:MSFT': 30 }, { 'asset:AAPL': false });
  const afterDelete = calculateRebalance(sameNames.filter(a => a.id !== 'AAPL'), migrated.targetWeights, migrated.rebalanceEnabled, 'KRW');
  assert.equal(afterDelete.targetTotal, 30);
  assert.equal(migrated.rebalanceEnabled['asset:MSFT'], true);
  const added = migrateRebalance([...sameNames, holding('new', '미국주식', 200)], migrated.targetWeights, migrated.rebalanceEnabled);
  assert.equal(added.targetWeights['asset:new'], 0);
  assert.equal(added.rebalanceEnabled['asset:new'], true);
});
