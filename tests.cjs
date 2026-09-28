const assert = require('node:assert/strict');
const data = require('./data.js');
const matching = require('./matching.js');
const simulation = require('./simulation.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
test('Curated tenant journey forms an eligible three-person group', () => {
  const group = matching.findGroup(data.focalHome, data.tenants.slice(0, 3), data.focalTenant.id);
  assert.equal(group.length, 3); assert(matching.eligibleGroup(group, data.focalHome));
  assert.equal(matching.eligibleGroup([data.focalTenant], data.focalHome), false);
});
test('A dealbreaker is checked in both directions', () => {
  const a = { ...data.tenants[0], dealbreaker: 'smoking' };
  const b = { ...data.tenants[1], dealbreaker: 'routine', lifestyle: { ...a.lifestyle, routine: 'late' } };
  assert.equal(matching.mutuallySuitable(a, b), false);
  assert.equal(matching.mutuallySuitable(b, a), false);
});
test('Budget, student rules, timing, location and sharing permission can each prevent a group', () => {
  const group = data.tenants.slice(0, 3);
  for (const patch of [{ rent: 9000 }, { studentsAllowed: false }, { moveMonth: 'Dec' }, { district: 'Elsewhere' }, { sharingAllowed: false }, { maxOccupants: 2 }]) {
    assert.equal(matching.eligibleGroup(group, { ...data.focalHome, ...patch }), false, JSON.stringify(patch));
  }
});
test('Guarantors only count when the listing explicitly allows them', () => {
  const group = data.tenants.slice(0, 3);
  assert(matching.eligibleGroup(group, data.focalHome));
  assert.equal(matching.eligibleGroup(group, { ...data.focalHome, guarantorsAllowed: false }), false);
});
test('No group is fabricated for an empty or insufficient pool', () => {
  assert.equal(matching.findGroup(data.focalHome, []), null);
  assert.equal(matching.findGroup(data.focalHome, [data.focalTenant]), null);
  assert.deepEqual(matching.allocateSolo([], data.homes), []);
});
test('No allocation can repeat a person inside a group', () => {
  assert.equal(matching.eligibleGroup([data.tenants[0], data.tenants[0], data.tenants[1]], data.focalHome), false);
});
test('All three market sizes respect eligibility, capacity and unassisted baseline rules', () => {
  for (const result of simulation.runAll()) {
    for (const mode of ['baseline', 'enhanced']) {
      const values = result.allocations[mode], people = values.flatMap(a => a.people.map(t => t.id)), homes = values.map(a => a.home.id);
      assert.equal(new Set(people).size, people.length); assert.equal(new Set(homes).size, homes.length);
      assert(values.every(a => matching.eligibleGroup(a.people, a.home)));
      assert.equal(result[mode].matched + result[mode].unmatched, result.size);
      assert(result[mode].rate >= 0 && result[mode].rate <= 100);
    }
    assert(result.allocations.baseline.every(a => a.formation !== 'platform'));
    assert(result.allocations.baseline.some(a => a.formation === 'informal' && a.people.length > 1));
  }
});
test('Runs are repeatable and never mutate source fixtures', () => {
  const before = JSON.stringify({ tenants: data.tenants, homes: data.homes });
  assert.deepEqual(simulation.runAll(), simulation.runAll());
  assert.equal(JSON.stringify({ tenants: data.tenants, homes: data.homes }), before);
});
test('Each round preserves assignments and conserves all arrived seekers in each market', () => {
  const state = simulation.createMarket(150);
  let priorBaseline = [], priorEnhanced = [];
  for (let i = 0; i < 12; i++) {
    simulation.stepMarket(state);
    assert.equal(state.round, i + 1);
    assert.equal(state.arrived.length, Math.ceil(150 * state.round / 12));
    for (const key of ['baseline', 'enhanced']) {
      const ids = state[key].allocations.flatMap(a => a.people.map(t => t.id));
      const waiting = state[key].waiting.map(t => t.id);
      assert.equal(new Set([...ids, ...waiting]).size, state.arrived.length);
      assert.equal(ids.length + waiting.length, state.arrived.length);
      assert(state[key].allocations.every(a => matching.eligibleGroup(a.people, a.home)));
    }
    assert.deepEqual(state.baseline.allocations.slice(0, priorBaseline.length), priorBaseline);
    assert.deepEqual(state.enhanced.allocations.slice(0, priorEnhanced.length), priorEnhanced);
    priorBaseline = state.baseline.allocations.slice();
    priorEnhanced = state.enhanced.allocations.slice();
  }
  const finished = JSON.stringify(state);
  simulation.stepMarket(state);
  assert.equal(JSON.stringify(state), finished);
});
test('New seekers can form a group with people who were waiting from an earlier round', () => {
  const state = simulation.createMarket(150);
  let reusedWaiting = false;
  while (state.round < state.rounds) {
    const waitingBefore = new Set(state.enhanced.waiting.map(t => t.id));
    simulation.stepMarket(state);
    if (state.enhanced.latest.some(a => a.people.length > 1 && a.people.some(t => waitingBefore.has(t.id)))) reusedWaiting = true;
  }
  assert(reusedWaiting);
});
test('Population size changes the arrival schedule; invalid inputs are rejected', () => {
  const small = simulation.createMarket(50), large = simulation.createMarket(300);
  simulation.stepMarket(small); simulation.stepMarket(large);
  assert.equal(small.arrived.length, 5); assert.equal(large.arrived.length, 25);
  assert.throws(() => simulation.createMarket(0), RangeError);
  assert.throws(() => simulation.createMarket(301), RangeError);
});
test('Seeking forwards and backwards reproduces the original timeline without stale allocations', () => {
  for (const size of data.SETTINGS.sizes) {
    const forward = simulation.createMarket(size);
    for (let round = 0; round <= 12; round++) {
      assert.deepEqual(simulation.seekMarket(size, round), forward);
      simulation.stepMarket(forward);
    }
    const back = simulation.seekMarket(size, 3);
    assert.equal(back.round, 3);
    while (back.round < 12) simulation.stepMarket(back);
    assert.deepEqual(back, simulation.seekMarket(size, 12));
    assert.equal(simulation.seekMarket(size, 0).enhanced.allocations.length, 0);
  }
  assert.throws(() => simulation.seekMarket(150, -1), RangeError);
  assert.throws(() => simulation.seekMarket(150, 13), RangeError);
});
test('Informal groups form only on opportunity rounds, at most once per round in either market', () => {
  for (const result of simulation.runAll()) {
    for (const key of ['baseline', 'enhanced']) {
      const informal = result.allocations[key].filter(a => a.formation === 'informal');
      assert.equal(new Set(informal.map(a => a.round)).size, informal.length);
      assert(informal.every(a => simulation.informalOpportunity(a.round)));
      assert(informal.every(a => a.people.length > 1 && matching.eligibleGroup(a.people, a.home)));
    }
  }
});
console.log(`\n${passed} checks passed.`);
console.log(JSON.stringify(simulation.runAll().map(({ size, baseline, enhanced }) => ({ size, baseline, enhanced })), null, 2));
