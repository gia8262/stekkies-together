const assert = require('node:assert/strict');
const data = require('./data.js');
const matching = require('./matching.js');
const simulation = require('./simulation.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
// Checks that need real timers run after the rest, one at a time.
const deferred = [];
function later(name, fn) { deferred.push([name, fn]); }
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
test('Published outcome figures are reproduced exactly', () => {
  // These are the numbers quoted in README.md, TESTING-AND-LEARNING.md and OPERATING-MODEL.md.
  // A refactor is allowed to change how the engine is written, never what it calculates.
  // Changed once, deliberately: the engine used to place groups in Kralingen homes that need a
  // permit Rotterdam does not grant (150: 96 -> 90 housed, 300: 163 -> 143, 50: 25 -> 24).
  const expected = {
    50: { baseline: [15, 5, 8], enhanced: [24, 10, 13] },
    150: { baseline: [26, 5, 15], enhanced: [90, 30, 40] },
    300: { baseline: [26, 5, 15], enhanced: [143, 46, 56] }
  };
  for (const result of simulation.runAll()) {
    for (const mode of ['baseline', 'enhanced']) {
      const [matched, groups, homes] = expected[result.size][mode];
      assert.deepEqual([result[mode].matched, result[mode].groups, result[mode].homes], [matched, groups, homes],
        `${result.size} ${mode}`);
    }
  }
});
test('Self-organized formation is the shared counterfactual, never a platform result', () => {
  for (const result of simulation.runAll()) {
    for (const key of ['baseline', 'enhanced']) {
      const shared = result.allocations[key].filter(a => a.people.length > 1);
      for (const round of new Set(shared.map(a => a.round))) {
        const inRound = shared.filter(a => a.round === round);
        // Both markets spend the same single informal budget, and spend it first.
        assert.equal(inRound.filter(a => a.formation === 'informal').length,
          simulation.informalOpportunity(round) ? 1 : 0, `round ${round} informal budget`);
        if (simulation.informalOpportunity(round)) assert.equal(inRound[0].formation, 'informal', `round ${round} order`);
      }
      assert(result.allocations[key].every(a => (a.people.length > 1) === (a.formation !== 'individual')));
    }
    assert.equal(result.allocations.baseline.some(a => a.formation === 'platform'), false);
  }
});
test('A tenant set forms without reference to any listing', () => {
  const alex = data.focalTenant;
  const { set, candidates } = matching.suggestSet(alex, data.tenants, 3);
  assert.equal(set.length, 3);
  assert.equal(set[0].id, alex.id, 'the searcher anchors their own set');
  // Every pair must hold, not just each against the anchor.
  set.forEach((person, i) => set.slice(i + 1).forEach(other =>
    assert(matching.mutuallySuitable(person, other), `${person.name} + ${other.name}`)));
  assert(candidates.every(t => matching.mutuallySuitable(alex, t)), 'nobody unsuitable is ever suggested');
  assert.equal(candidates.some(t => t.id === alex.id), false, 'the searcher is not suggested to themselves');
  // Set members must actually be able to search together, or the set can never apply.
  assert(set.every(t => t.moveMonth === alex.moveMonth), 'same move month');
  assert(set.every(t => t.districts.some(d => alex.districts.includes(d))), 'overlapping districts');
});
test('Pooling budgets is what makes listings reachable', () => {
  const alex = data.focalTenant;
  const { set } = matching.suggestSet(alex, data.tenants, 3);
  const alone = matching.reachableHomes([alex], data.homes);
  const together = matching.reachableHomes(set, data.homes);
  assert.equal(alone.length, 0, 'Alex can reach nothing on his own budget');
  assert(together.length > 0, 'the set can reach something');
  assert(together.some(h => h.id === data.focalHome.id), 'including the featured home');
  // Reachable means genuinely eligible, not merely affordable.
  assert(together.every(h => matching.eligibleGroup(set, h)));
  assert.equal(data.focalHome.rent / set.length, 750);
});
test('A sharing claim on a listing is not treated as a fact', () => {
  const kralingen = data.homes.find(h => h.district === 'Kralingen' && h.bedrooms >= 3 && h.sharingAllowed);
  // The listing says sharing is allowed; Rotterdam issues no room-rental permit there.
  assert.equal(kralingen.sharingAllowed, true);
  assert.equal(matching.sharingStatus(kralingen, 3), 'permit-required');
  assert.equal(matching.sharingStatus(kralingen, 2), 'allowed', 'the permit rule starts at three tenants');
  assert.equal(matching.sharingStatus(data.focalHome, 3), 'allowed', 'the featured home is outside those districts');
  const silent = data.homes.find(h => h.bedrooms > 1 && !h.sharingAllowed);
  assert.equal(matching.sharingStatus(silent, 2), 'unclear', 'marked, not hidden');
  assert.equal(matching.sharingStatus(silent, 1), 'allowed', 'sharing rules do not apply to one tenant');
});
const store = require('./store.js');
// What the last action said on screen: a toast's text, or nothing.
const said = () => (store.view.toast || {}).text || '';
test('Every profile is browsable: a description, contact and avatar', () => {
  for (const person of data.tenants.slice(1)) {
    assert(person.bio.length > 40, `${person.name} has no description`);
    assert(/@/.test(person.email), `${person.name} has no contact address`);
    assert(Number.isInteger(person.avatarHue), `${person.name} has no avatar colour`);
    assert.equal(/\d/.test(person.name), false, `${person.name} reads like a database row`);
  }
  // Descriptions must actually vary, or the grid reads as mail-merge.
  const bios = data.tenants.slice(1).map(p => p.bio);
  assert(new Set(bios).size > bios.length * 0.6, 'descriptions repeat too often');
});
test('A description never contradicts the attributes the matcher reads', () => {
  for (const person of data.tenants.slice(3)) {
    const claimsEarly = /up early|early riser|mornings are my good/i.test(person.bio);
    const claimsLate = /night person|come alive around ten|late sleeper/i.test(person.bio);
    if (claimsEarly) assert.equal(person.lifestyle.routine, 'early', `${person.name} says early`);
    if (claimsLate) assert.equal(person.lifestyle.routine, 'late', `${person.name} says late`);
    if (/I smoke/i.test(person.bio)) assert.equal(person.lifestyle.smoking, 'yes', `${person.name} says smokes`);
  }
});
test('An invitation names a household, and joining is not agreeing', () => {
  store.actions.reset();
  const me = store.me();
  const other = data.tenants.find(p => p.id !== me.id && matching.mutuallySuitable(me, p)
    && !store.DB.householdsOf(p.id).length);

  const house = store.DB.createHousehold(me.id, 3);
  assert.equal(house.size, 3);
  assert.equal(store.DB.openSlots(house), 2, 'a 3-bedroom starts with two places to fill');
  assert.equal(store.DB.isReady(house), false, 'one person is not a household');

  const invite = store.DB.invite(me.id, other.id, house.id, 'Room for one more');
  assert.equal(invite.householdId, house.id, 'the invitation names the household');
  assert.equal(store.DB.householdsOf(other.id).length, 0, 'inviting does not move anyone');

  store.DB.respond(invite.id, 'accepted');
  assert(store.DB.householdsOf(other.id).some(h => h.id === house.id), 'accepting joins them');
  assert.equal(house.confirmedBy.includes(other.id), false, 'but joining is not agreeing');
  assert(store.DB.thread(me.id, other.id).length > 0, 'and opens the conversation');
  store.actions.reset();
});
test('A household is ready only when it is both full and agreed', () => {
  store.actions.reset();
  const me = store.me();
  const pair = data.tenants.find(p => p.id !== me.id && matching.mutuallySuitable(me, p)
    && matching.reachableHomes([me, p], data.homes).length > 0);

  const house = store.DB.createHousehold(me.id, 2);
  assert.deepEqual(store.reachFor(house), [], 'a household of one reaches nothing');

  store.DB.addToHousehold(house.id, pair.id);
  assert.equal(store.DB.isFull(house), true, 'full');
  assert.equal(store.DB.isReady(house), false, 'full is not ready without agreement');
  assert.deepEqual(store.reachFor(house), [], 'and an unagreed household still reaches nothing');

  store.DB.confirmHousehold(house.id, pair.id);
  assert.equal(store.DB.isReady(house), true, 'everyone has agreed');
  assert(store.reachFor(house).length > store.reachableAlone().length,
    'agreeing is what unlocks homes');
  store.actions.reset();
});
test('Several households run in parallel and cover different homes', () => {
  store.actions.reset();
  const me = store.me();
  const pool = data.tenants.filter(p => p.id !== me.id && matching.mutuallySuitable(me, p));

  // One aiming at a two-bedroom, one at a three.
  const two = store.DB.createHousehold(me.id, 2);
  store.DB.addToHousehold(two.id, pool[0].id);
  store.DB.confirmHousehold(two.id, pool[0].id);

  const three = store.DB.createHousehold(me.id, 3);
  const mates = pool.filter(p => p.id !== pool[0].id
    && matching.mutuallySuitable(pool[0], p)).slice(0, 2);
  const third = pool.find(p => p.id !== pool[0].id && p.id !== mates[0].id
    && matching.mutuallySuitable(p, mates[0]));
  store.DB.addToHousehold(three.id, mates[0].id);
  store.DB.addToHousehold(three.id, third.id);
  three.members.forEach(m => store.DB.confirmHousehold(three.id, m));

  assert.equal(store.myHouseholds().length, 2, 'a searcher holds both at once');
  assert.deepEqual(store.myHouseholds().map(h => h.size), [2, 3], 'sorted by size');

  const reachTwo = store.reachFor(two).map(h => h.id);
  const reachThree = store.reachFor(three).map(h => h.id);
  // A household of n only fits an n-bedroom home, so the two sets can never overlap.
  assert.equal(reachTwo.filter(id => reachThree.includes(id)).length, 0,
    'the two households reach disjoint homes');
  assert(store.reachFor(two).every(h => h.bedrooms === 2));
  assert(store.reachFor(three).every(h => h.bedrooms === 3));

  // Which is the whole point: running both reaches more than either alone.
  const union = new Set([...reachTwo, ...reachThree]);
  assert(union.size >= Math.max(reachTwo.length, reachThree.length),
    'the union is at least as large as either');
  if (reachTwo.length && reachThree.length) {
    assert(union.size > reachTwo.length, 'and strictly larger when both reach something');
  }
  store.actions.reset();
});
test('An invitation to one household does not block one to another', () => {
  store.actions.reset();
  const me = store.me();
  const other = data.tenants.find(p => p.id !== me.id && !store.DB.householdsOf(p.id).length);
  const a = store.DB.createHousehold(me.id, 2);
  const b = store.DB.createHousehold(me.id, 3);

  const first = store.DB.invite(me.id, other.id, a.id, 'two-bed?');
  const second = store.DB.invite(me.id, other.id, b.id, 'or a three-bed?');
  assert.notEqual(first.id, second.id, 'the same pair can be invited to two households');
  assert.equal(store.DB.invitesTo(other.id).filter(i => i.from === me.id).length, 2);

  // Asking twice about the same household is still one invitation.
  assert.equal(store.DB.invite(me.id, other.id, a.id, 'again').id, first.id);
  store.actions.reset();
});
test('Leaving removes you, and empties the household when you were the last', () => {
  store.actions.reset();
  const me = store.me();
  const other = data.tenants.find(p => p.id !== me.id && matching.mutuallySuitable(me, p));
  const house = store.DB.createHousehold(me.id, 2);
  store.DB.addToHousehold(house.id, other.id);

  store.DB.leaveHousehold(house.id, other.id);
  assert.equal(store.DB.householdById(house.id).members.length, 1, 'they are out');
  assert.equal(store.DB.openSlots(store.DB.householdById(house.id)), 1, 'their place reopens');

  store.DB.leaveHousehold(house.id, me.id);
  assert.equal(store.DB.householdById(house.id), null, 'the last one out deletes it');
  store.actions.reset();
});
test('Every listing is always shown, with what it would take to get it', () => {
  store.actions.reset();
  const all = store.listings();
  assert.equal(all.length, data.homes.length, 'nothing is hidden from the searcher');
  assert(all.every(e => ['alone', 'together', 'out'].includes(e.status)), 'every listing is classified');
  assert(all.every(e => e.status !== 'together' || e.house), 'a reachable listing names which household');
  // Out-of-reach homes carry the household size that would change that, where one exists.
  const needy = all.filter(e => e.status === 'out' && e.needs);
  assert(needy.length > 0, 'some homes are reachable with more tenants');
  assert(needy.every(e => e.needs >= 2 && e.needs <= e.home.bedrooms), 'and the number is plausible');
  assert(needy.every(e => store.me().budget >= e.home.rent / e.needs), 'and would actually be affordable');
  store.actions.reset();
});
test('Nobody who clashes on a dealbreaker is ever presented as a fit', () => {
  store.actions.reset();
  for (const entry of store.candidates()) {
    if (!entry.suitable) { assert(entry.blockers.length, `${entry.person.name} unsuitable with no reason`); continue; }
    assert(matching.mutuallySuitable(store.me(), entry.person));
  }
  assert.equal(store.candidates().some(c => c.person.id === store.me().id), false,
    'you are not suggested to yourself');
  store.actions.reset();
});
test('Signing in as someone else shows their side of the same database', () => {
  store.actions.reset();
  const me = store.me();
  const other = data.tenants.find(p => p.id !== me.id && matching.mutuallySuitable(me, p)
    && !store.DB.householdsOf(p.id).length);
  store.actions.sendInvite(other.id, 'new', 2, 'Hello');

  store.actions.signIn(other.id);
  assert.equal(store.me().id, other.id, 'you are now them');
  const waiting = store.DB.invitesTo(other.id);
  assert(waiting.some(i => i.from === me.id && i.message === 'Hello'),
    'and your invitation is sitting in their inbox, with the message');

  // Nobody is suggested to themselves, and an open invitation takes them out of browsing.
  assert.equal(store.candidates().some(c => c.person.id === me.id), false,
    'someone with a pending invitation is not also offered in the grid');
  store.actions.reset();
});
test('Saying "not for me" records a decline and nothing else', () => {
  store.actions.reset();
  const me = store.me();
  const target = data.tenants.find(p => p.id !== me.id && !store.DB.householdsOf(p.id).length);
  store.actions.skip(target.id);
  assert.equal(store.myHouseholds().length, 0, 'declining must not invent a household');
  assert.equal(store.candidates().some(c => c.person.id === target.id), false, 'they stop being suggested');
  store.actions.reset();
});
test('An invitation cannot overfill a household, and says so', () => {
  store.actions.reset();
  const me = store.me();
  const house = store.DB.createHousehold(me.id, 2);
  const free = data.tenants.filter(p => p.id !== me.id && !store.DB.householdsOf(p.id).length);
  const first = store.DB.invite(me.id, free[0].id, house.id, 'a');
  const second = store.DB.invite(me.id, free[1].id, house.id, 'b');

  store.DB.respond(first.id, 'accepted');
  assert.equal(house.members.length, 2, 'the first one in takes the place');

  const late = store.DB.respond(second.id, 'accepted');
  assert.equal(house.members.length, 2, 'the household cannot overfill');
  assert.equal(late.status, 'full', 'and the late acceptance is reported, not silently dropped');

  // A household that has been deleted is reported too, rather than throwing.
  const gone = store.DB.createHousehold(me.id, 3);
  const third = store.DB.invite(me.id, free[2].id, gone.id, 'c');
  store.DB.leaveHousehold(gone.id, me.id);
  assert.equal(store.DB.respond(third.id, 'accepted').status, 'gone');
  store.actions.reset();
});
test('Turning matching off leaves the households it hid you from', () => {
  store.actions.reset();
  const me = store.me();
  const mate = data.tenants.find(p => p.id !== me.id && matching.mutuallySuitable(me, p));
  const house = store.DB.createHousehold(me.id, 2);
  store.DB.addToHousehold(house.id, mate.id);
  store.DB.confirmHousehold(house.id, mate.id);
  assert(store.reachFor(house).length > 0, 'it was reaching homes');

  store.actions.setRoommateMode(false);
  assert.equal(store.myHouseholds().length, 0,
    'staying in a household while invisible would leave you committed and unfindable');
  assert.equal(store.DB.invitesTo(me.id).length, 0, 'and pending invitations are answered');
  store.actions.reset();
});
test('A household whose members clash is reported, not shown as ready', () => {
  store.actions.reset();
  const me = store.me();
  const first = data.tenants.find(p => p.id !== me.id && matching.mutuallySuitable(me, p));
  const second = data.tenants.find(p => p.id !== me.id && p.id !== first.id
    && matching.mutuallySuitable(me, p) && !matching.mutuallySuitable(first, p));
  assert(second, 'the fixtures contain two people who suit you but not each other');

  const house = store.DB.createHousehold(me.id, 3);
  store.DB.addToHousehold(house.id, first.id);
  store.DB.addToHousehold(house.id, second.id);
  house.members.forEach(m => store.DB.confirmHousehold(house.id, m));

  assert.equal(store.DB.isReady(house), true, 'it is full and agreed');
  assert.equal(store.reachFor(house).length, 0, 'yet it reaches nothing');
  const clash = store.conflicts(house);
  assert.equal(clash.length, 1, 'and the clash is identified so the UI can explain it');
  assert.deepEqual(clash[0].map(p => p.id).sort(), [first.id, second.id].sort());
  store.actions.reset();
});
test('Edge cases that would otherwise crash a screen', () => {
  store.actions.reset();
  const me = store.me();
  assert.equal(store.DB.invite(me.id, me.id, 'x', 'hi'), null, 'you cannot invite yourself');

  // A stored account that no longer exists must not leave every screen reading me().id off null.
  store.DB.state.currentUser = 'nobody';
  assert(store.me(), 'an unknown current user falls back to a real profile');
  assert.equal(store.me().id, data.focalTenant.id);

  store.actions.reset();
  // Deleting a household takes its applications and open invitations with it.
  const house = store.DB.createHousehold(store.me().id, 2);
  store.DB.apply(house.id, data.homes[30].id);
  store.DB.leaveHousehold(house.id, store.me().id);
  assert.equal(store.DB.state.applications.some(a => a.householdId === house.id), false,
    'no application left pointing at a household nobody is in');
  store.actions.reset();
});
test('An invitation that is out is visible against the household it was sent for', () => {
  // This is the regression. Sending an invitation used to change nothing a user could see:
  // the person vanished from the grid, the card still read "needs 1 more", and the
  // invitation itself was rendered nowhere at all.
  store.actions.reset();
  const me = store.me();
  store.actions.startHousehold(2);
  const house = store.myHouseholds()[0];
  const target = store.candidates()[0].person;

  store.actions.sendInvite(target.id, house.id, 2, 'hello');

  const pending = store.pendingFor(house);
  assert.equal(pending.length, 1, 'the household knows about its own outstanding invitation');
  assert.equal(pending[0].person.id, target.id, 'and who it went to');
  assert.equal(store.DB.invitesFrom(me.id).length, 1, 'the sender can list what they sent');
  assert(said(), 'and the send is confirmed on screen');

  // Places promised plus places free must never exceed the household's size.
  assert.equal(pending.length + Math.max(0, store.DB.openSlots(house) - pending.length),
    house.size - house.members.length, 'promised and free places account for every empty slot');

  store.actions.reset();
});
test('Withdrawing an invitation frees the place and returns the person to the grid', () => {
  store.actions.reset();
  store.actions.startHousehold(2);
  const house = store.myHouseholds()[0];
  const target = store.candidates()[0].person;
  store.actions.sendInvite(target.id, house.id, 2, 'hello');
  assert.equal(store.candidates().some(c => c.person.id === target.id), false,
    'while it is out they are not offered again');

  const invite = store.DB.invitesFrom(store.me().id)[0];
  store.actions.withdrawInvite(invite.id);
  assert.equal(store.pendingFor(house).length, 0, 'the place is free again');
  assert.equal(store.candidates().some(c => c.person.id === target.id), true,
    'and they can be invited again');
  store.actions.reset();
});
test('Only you can declare your own finances', () => {
  store.actions.reset();
  const me = store.me();
  store.actions.startHousehold(2);
  const house = store.myHouseholds()[0];
  const other = store.candidates()[0].person;

  // Someone outside the household cannot be declared for at all.
  assert.equal(store.DB.declare(house.id, other.id, { mode: 'salary' }), null,
    'a non-member has no row to change');

  store.actions.declare(house.id, { mode: 'salary' });
  assert.equal(store.declared(house, me.id).mode, 'salary');
  assert.equal(store.declared(house, me.id).counts, me.income,
    'declaring salary only counts the salary');

  store.actions.declare(house.id, { mode: 'none' });
  assert.equal(store.declared(house, me.id).counts, 0, 'declaring neither counts nothing');
  store.actions.reset();
});
test('The ceiling is the lower of the income rule and the pooled budgets', () => {
  store.actions.reset();
  const house = store.DB.createHousehold(store.me().id, 2);
  const mate = data.tenants.find(t => t.id !== store.me().id);
  store.DB.addToHousehold(house.id, mate.id);

  const c = store.ceiling(store.DB.householdById(house.id));
  assert.equal(c.rows.length, 2, 'one row per member');
  assert.equal(c.budget, c.rows.reduce((t, r) => t + r.budget, 0), 'budgets add up');
  assert.equal(c.fromIncome, Math.floor(c.income / 3), 'landlords ask three times the rent');
  assert.equal(c.max, Math.min(c.budget, c.fromIncome), 'the ceiling is the lower of the two');
  assert.equal(c.bindingIs, c.budget <= c.fromIncome ? 'budget' : 'income',
    'and it says which one binds');
  assert(Number.isFinite(c.max), 'the ceiling is a number, never NaN');
  store.actions.reset();
});
test('The shared letter is stored on the household and is what an application sends', () => {
  store.actions.reset();
  const me = store.me();
  store.actions.startHousehold(2);
  const house = store.myHouseholds()[0];
  const target = store.candidates()[0].person;
  store.actions.sendInvite(target.id, house.id, 2, 'hi');
  store.actions.respondInvite(store.DB.invitesTo(target.id)[0].id, 'accepted');

  const before = store.letterFor(store.DB.householdById(house.id));
  assert(before.includes('Good afternoon'), 'there is a letter before anyone writes one');
  assert.equal(before.includes('1 tenants'), false, 'and it is never ungrammatical');

  store.actions.setLetter(house.id, 'We are quiet, we pay on time, and we can view tomorrow.');
  const saved = store.DB.householdById(house.id);
  assert.equal(store.letterFor(saved), 'We are quiet, we pay on time, and we can view tomorrow.',
    'what you typed is what is kept');
  assert.equal(saved.letterBy, me.id, 'and it records who last edited it');

  // The other member signs in and sees the same letter — the point of it being shared.
  store.actions.signIn(target.id);
  assert.equal(store.letterFor(store.DB.householdById(house.id)),
    'We are quiet, we pay on time, and we can view tomorrow.',
    'both sides of the household read the same letter');
  store.actions.reset();
});
test('The readiness checklist belongs to each member separately', () => {
  store.actions.reset();
  const me = store.me();
  const house = store.DB.createHousehold(me.id, 2);
  const mate = data.tenants.find(t => t.id !== me.id);
  store.DB.addToHousehold(house.id, mate.id);

  store.actions.tick(house.id, 'letter', true);
  const saved = store.DB.householdById(house.id);
  assert.equal(store.ticked(saved, me.id).letter, true, 'your tick is yours');
  assert.equal(Boolean(store.ticked(saved, mate.id).letter), false, 'and not theirs');
  assert.equal(store.allTicked(saved), false, 'one tick is not everyone ready');

  store.CHECKS.forEach(([key]) => {
    store.DB.tick(house.id, me.id, key, true);
    store.DB.tick(house.id, mate.id, key, true);
  });
  assert.equal(store.allTicked(store.DB.householdById(house.id)), true,
    'everyone ticking everything is');
  store.actions.reset();
});
test('Leaving with an invitation outstanding takes the invitation with it', () => {
  store.actions.reset();
  store.actions.startHousehold(2);
  const house = store.myHouseholds()[0];
  const target = store.candidates()[0].person;
  store.actions.sendInvite(target.id, house.id, 2, 'hi');
  assert.equal(store.DB.invitesTo(target.id).length, 1);

  store.actions.leaveHousehold(house.id);
  assert.equal(store.DB.invitesTo(target.id).length, 0,
    'nobody is left holding an invitation into a household that is gone');
  store.actions.reset();
});
test('Storage written by an older build is repaired, not rendered as undefined', () => {
  // The worst bug a returning visitor could hit: households predate the `size` field, so the
  // title read "undefined-bedroom household", open slots came out NaN, and the household
  // could never become ready or reach a single home. The version number alone did not catch
  // it, because it had never been bumped.
  store.actions.reset();
  const house = store.DB.createHousehold(store.me().id, 2);
  const mate = data.tenants.find(t => t.id !== store.me().id);
  store.DB.addToHousehold(house.id, mate.id);

  const stale = JSON.parse(JSON.stringify(store.DB.state));
  stale.version = 1;
  stale.households.forEach(h => {
    delete h.size; delete h.name; delete h.letter; delete h.finances; delete h.checklist;
  });
  stale.households.push({ id: 'h-junk', members: ['no-such-person'], confirmedBy: [] });
  stale.invites.push({ id: 'i-junk', from: 'ghost', to: 'phantom', householdId: 'h-gone',
    status: 'pending', at: 1 });
  stale.applications.push({ householdId: 'h-gone', homeId: data.homes[0].id, at: 1 });
  stale.currentUser = 'deleted-account';

  const fixed = store.DB.migrate(stale);
  assert.equal(fixed.version, 2, 'the schema is brought forward');

  const repaired = fixed.households.find(h => h.members.length > 1);
  assert(repaired, 'a real household survives the upgrade rather than being wiped');
  assert.equal(Number.isFinite(repaired.size), true, 'it has a numeric size');
  assert(repaired.size >= repaired.members.length, 'big enough to hold the people in it');
  assert.equal(repaired.name, '', 'and every field the current code reads');
  assert.deepEqual(repaired.finances, {});
  assert.deepEqual(repaired.checklist, {});
  assert.equal(repaired.letter, '');

  assert.equal(fixed.households.some(h => h.id === 'h-junk'), false,
    'a household of people who do not exist is dropped');
  assert.equal(fixed.invites.some(i => i.id === 'i-junk'), false,
    'an invitation between people who do not exist is dropped');
  assert.equal(fixed.applications.some(a => a.householdId === 'h-gone'), false,
    'an application to a household that is gone is dropped');
  assert.equal(fixed.currentUser, data.focalTenant.id, 'a deleted account falls back to a real one');

  // And nothing downstream produces NaN off it.
  assert.equal(store.DB.openSlots(repaired), repaired.size - repaired.members.length);
  assert.equal(Number.isNaN(store.DB.openSlots(repaired)), false);
  store.actions.reset();
});
test('A household is called something a person would recognise, and can be renamed', () => {
  store.actions.reset();
  const me = store.me();
  store.actions.startHousehold(2);
  const house = store.myHouseholds()[0];

  assert.equal(store.nameOf(house).includes('undefined'), false, 'never undefined');
  assert.equal(store.nameOf(house), `Your 2-bedroom search`, 'a solo household says what it is for');

  const mate = store.candidates()[0].person;
  store.actions.sendInvite(mate.id, house.id, 2, 'hi');
  store.actions.respondInvite(store.DB.invitesTo(mate.id).find(i => i.householdId === house.id).id, 'accepted');
  const pair = store.DB.householdById(house.id);
  assert.equal(store.nameOf(pair), `${me.name.split(' ')[0]} & ${mate.name.split(' ')[0]}`,
    'once there are people in it, it is named after them');

  store.actions.rename(house.id, 'The Delfshaven plan');
  assert.equal(store.nameOf(store.DB.householdById(house.id)), 'The Delfshaven plan',
    'and you can call it whatever you like');
  // Both members see the same name — it belongs to the household, not to you.
  store.actions.signIn(mate.id);
  assert.equal(store.nameOf(store.DB.householdById(house.id)), 'The Delfshaven plan');
  store.actions.signIn(me.id);

  store.actions.rename(house.id, '');
  assert.equal(store.nameOf(store.DB.householdById(house.id)).length > 0, true,
    'clearing it restores the default rather than leaving it untitled');
  store.actions.rename(house.id, 'x'.repeat(500));
  assert(store.nameOf(store.DB.householdById(house.id)).length <= 48, 'and it cannot be pasted a novel');
  store.actions.reset();
});
test('A celebration can never strand the page', () => {
  // The overlay it lives in is fixed, full-screen and locks the body. It used to survive
  // every navigation, so the route changed underneath it and the whole app looked frozen.
  store.actions.reset();
  store.actions.setRoommateMode(true);
  store.actions.respondInvite(store.DB.invitesTo(store.me().id)[0].id, 'accepted');
  const house = store.myHouseholds()[0];

  store.actions.go('roommates');
  store.actions.confirmHousehold(house.id);
  assert(store.view.celebration, 'confirming on the roommates page raises it');

  store.actions.go('listings');
  assert.equal(store.view.celebration, null, 'and navigating anywhere puts it away');

  // Raised on a 1.1s timer, it could land on a screen the reader had already moved on to.
  store.actions.reset();
  store.actions.setRoommateMode(true);
  store.actions.respondInvite(store.DB.invitesTo(store.me().id)[0].id, 'accepted');
  const second = store.myHouseholds()[0];
  store.actions.go('market');
  store.actions.confirmHousehold(second.id);
  assert.equal(store.view.celebration, null, 'no modal over an unrelated screen');
  assert(/ready/.test(said()), 'the news still arrives, in words');

  // Leaving takes its own celebration with it.
  store.actions.reset();
  store.actions.setRoommateMode(true);
  store.actions.respondInvite(store.DB.invitesTo(store.me().id)[0].id, 'accepted');
  const third = store.myHouseholds()[0];
  store.actions.go('roommates');
  store.actions.confirmHousehold(third.id);
  assert(store.view.celebration);
  store.actions.leaveHousehold(third.id);
  assert.equal(store.view.celebration, null, 'and leaving clears it');
  store.actions.reset();
});
test('Accepting leaves you looking at the household you just joined', () => {
  // It used to route to Messages, so the household you had joined was never shown and its
  // "confirm your place" button sat on a screen you had no reason to visit.
  store.actions.reset();
  store.actions.setRoommateMode(true);
  store.actions.startHousehold(4);            // an older household, to prove the sort
  const invite = store.DB.invitesTo(store.me().id)[0];

  store.actions.respondInvite(invite.id, 'accepted');

  assert.equal(store.view.route, 'roommates', 'you stay where the households are');
  assert.notEqual(store.view.route, 'messages', 'and are not dropped into a chat');
  assert.equal(store.view.justJoined, invite.householdId, 'the one you joined is flagged');
  assert.equal(store.myHouseholds()[0].id, invite.householdId, 'and sorted to the top');
  assert(/confirm/i.test(said()), 'with what to do next said out loud');

  const joined = store.DB.householdById(invite.householdId);
  assert(joined.members.includes(store.me().id), 'you really are in it');
  assert.equal(joined.confirmedBy.includes(store.me().id), false, 'but have not confirmed yet');

  // The conversation is still there, it is just no longer forced on you.
  assert(store.DB.thread(store.me().id, invite.from).length, 'the thread exists, seeded');

  store.actions.go('listings');
  assert.equal(store.view.justJoined, null, 'the highlight does not follow you around');
  store.actions.reset();
});
test('Searching at a second size carries the people you already have', () => {
  store.actions.reset();
  store.actions.setRoommateMode(true);
  store.actions.respondInvite(store.DB.invitesTo(store.me().id)[0].id, 'accepted');
  const pair = store.myHouseholds()[0];
  const mate = pair.members.find(id => id !== store.me().id);

  store.actions.alsoSearch(pair.id, 3);
  const sibling = store.myHouseholds().find(h => h.size === 3);
  assert(sibling, 'a second household exists at the new size');
  assert.notEqual(sibling.id, pair.id, 'and it is a distinct household');
  assert.equal(sibling.members.length, 1, 'it starts with you');

  const asked = store.DB.invitesFor(sibling.id);
  assert.equal(asked.length, 1, 'everyone already with you is invited to it');
  assert.equal(asked[0].to, mate, 'namely them');
  assert(/invited/.test(said()), 'and it says so');

  // One household per size is the model, so it refuses to make a duplicate.
  const before = store.myHouseholds().length;
  store.actions.alsoSearch(pair.id, 3);
  assert.equal(store.myHouseholds().length, before, 'no second 3-bedroom');
  assert(/already/.test(said()), 'and says why');

  // The two cards know they are one plan at two sizes.
  const siblings = store.siblingsOf(pair);
  assert.equal(siblings.length, 1);
  assert.equal(siblings[0].house.id, sibling.id);
  store.actions.reset();
});
test('One invitation can cover several households at once', () => {
  store.actions.reset();
  store.actions.setRoommateMode(true);
  store.actions.startHousehold(2);
  store.actions.startHousehold(3);
  const [two, three] = store.myHouseholds();
  const target = store.candidates()[0].person;

  store.actions.sendInvite(target.id, [{ id: two.id }, { id: three.id }], 'either works');

  assert.equal(store.DB.invitesFor(two.id).length, 1, 'exactly one per household');
  assert.equal(store.DB.invitesFor(three.id).length, 1);
  assert.equal(store.DB.invitesTo(target.id).length, 2, 'and they see both');
  assert(said().includes('and'), 'the confirmation names them all');

  // A household with no place free takes none.
  store.actions.reset();
  store.actions.setRoommateMode(true);
  const full = store.DB.createHousehold(store.me().id, 2);
  store.DB.addToHousehold(full.id, data.tenants.find(t => t.id !== store.me().id).id);
  const other = store.candidates()[0].person;
  store.actions.sendInvite(other.id, [{ id: full.id }], 'hi');
  assert.equal(store.DB.invitesFor(full.id).length, 0, 'nothing is sent into a full household');
  assert(/Nothing was sent/.test(said()), 'and it says so rather than failing quietly');
  store.actions.reset();
});
test('Inviting someone again after withdrawing really sends a new invitation', () => {
  // It used to hand back the withdrawn record: nothing was pending, yet the screen said "sent".
  store.actions.reset();
  store.actions.setRoommateMode(true);
  store.actions.startHousehold(2);
  const house = store.myHouseholds()[0];
  const target = store.candidates()[0].person;
  store.actions.sendInvite(target.id, [{ id: house.id }], 'first');
  const first = store.DB.invitesFor(house.id)[0];
  store.actions.withdrawInvite(first.id);
  assert.equal(store.DB.invitesFor(house.id).length, 0);

  store.actions.sendInvite(target.id, [{ id: house.id }], 'second');
  const now = store.DB.invitesFor(house.id);
  assert.equal(now.length, 1, 'there is a live invitation again');
  assert.notEqual(now[0].id, first.id, 'a new record, even within the same millisecond');
  assert.equal(now[0].message, 'second');
  assert.equal(store.DB.invitesTo(target.id).filter(i => i.householdId === house.id).length, 1,
    'and they see exactly one');
  store.actions.reset();
});
test('An invitation that is no longer open cannot be taken up', () => {
  store.actions.reset();
  store.actions.setRoommateMode(true);
  store.actions.startHousehold(2);
  const house = store.myHouseholds()[0];
  const target = store.candidates()[0].person;
  store.actions.sendInvite(target.id, [{ id: house.id }], 'hi');
  const invite = store.DB.invitesFor(house.id)[0];
  store.actions.withdrawInvite(invite.id);

  store.actions.signIn(target.id);              // their bell was still showing it
  store.actions.respondInvite(invite.id, 'accepted');
  assert.equal(store.DB.householdById(house.id).members.includes(target.id), false,
    'they are not added to a household that took the invitation back');
  assert(/no longer open/.test(said()), 'and they are told why');

  // Declining something that is open says so too, rather than closing the bell in silence.
  store.actions.reset();
  store.actions.setRoommateMode(true);
  const incoming = store.DB.invitesTo(store.me().id)[0];
  store.actions.respondInvite(incoming.id, 'declined');
  assert(/declined/.test(said()), 'a decline is acknowledged');
  store.actions.reset();
});
test('Leaving takes back what you sent into a household that carries on', () => {
  store.actions.reset();
  store.actions.setRoommateMode(true);
  const me = store.me();
  const house = store.DB.createHousehold(me.id, 3);
  const mate = data.tenants.find(t => t.id !== me.id);
  store.DB.addToHousehold(house.id, mate.id);
  const stranger = store.candidates().find(c => c.person.id !== mate.id).person;
  store.actions.sendInvite(stranger.id, [{ id: house.id }], 'hi');
  assert.equal(store.DB.invitesFor(house.id).length, 1);

  store.actions.leaveHousehold(house.id);
  assert(store.DB.householdById(house.id), 'the household carries on with the others');
  assert.equal(store.DB.invitesFor(house.id).length, 0,
    'and nobody sits on their card, invited by someone who has gone');
  store.actions.reset();
});
test('Switching accounts leaves nothing of the previous person behind', () => {
  store.actions.reset();
  store.actions.setRoommateMode(true);
  const me = store.me();
  store.actions.startHousehold(2);
  const mine = store.myHouseholds()[0];
  store.actions.openHousehold(mine.id);
  store.actions.sendInvite(store.candidates()[0].person.id, [{ id: mine.id }], 'hi');
  assert(said());

  const other = data.tenants.find(t => t.id !== me.id && !store.DB.householdsOf(t.id).length);
  store.actions.signIn(other.id);
  assert.equal(store.view.openHouse, null, 'a household is not held open for the next person');
  assert.equal(store.view.toast, null, 'nor a line about what the last one did');

  store.actions.rename(mine.id, 'Not yours');
  assert.notEqual(store.DB.householdById(mine.id).name, 'Not yours', 'and only a member can rename it');
  store.actions.reset();
});
test('A household is named from where the reader stands', () => {
  store.actions.reset();
  store.actions.setRoommateMode(true);
  const me = store.me();
  const invite = store.DB.invitesTo(me.id)[0];
  const theirs = store.DB.householdById(invite.householdId);
  const owner = store.DB.profile(invite.from);
  assert.equal(store.nameOf(theirs), `${owner.name.split(/[\s,]+/)[0]}’s ${theirs.size}-bedroom search`,
    'an invitation into their household calls it theirs, not "yours"');

  const trio = data.tenants.slice(0, 3).filter(t => t.id !== me.id);
  const big = store.DB.createHousehold(me.id, 3);
  trio.forEach(t => store.DB.addToHousehold(big.id, t.id));
  const name = store.nameOf(store.DB.householdById(big.id));
  assert.equal((name.match(/&/g) || []).length, 1, `three people read as a list: ${name}`);
  assert(name.includes(', '), `with a comma between the first two: ${name}`);
  store.actions.reset();
});
test('What a household declares is what every screen counts', () => {
  // Declaring "neither yet" used to lower the ceiling on the household page while Listings,
  // the card and the application kept offering the same homes.
  store.actions.reset();
  store.actions.setRoommateMode(true);
  const me = store.me();
  store.actions.respondInvite(store.DB.invitesTo(me.id)[0].id, 'accepted');
  const house = store.myHouseholds()[0];
  house.members.forEach(m => store.DB.confirmHousehold(house.id, m));
  const engine = store.reachFor(house).length;
  assert(engine > 0, 'the engine reaches homes for this household');
  const together = () => store.listings().filter(e => e.status === 'together').length;
  assert.equal(together(), engine, 'untouched declarations: Listings offers exactly those');

  house.members.forEach(m => store.DB.declare(house.id, m, { mode: 'none' }));
  assert.equal(together(), 0, 'declaring nothing: Listings stops offering them to apply for');
  assert.equal(store.homesFor(house).length, 0, 'and every other screen counts the same zero');
  const short = store.listings().filter(e => e.status === 'short');
  assert.equal(short.length, engine, 'they are shown as short on declared income, not hidden');
  assert(short.every(e => e.house && e.house.id === house.id), 'and say whose household');

  // A guarantor only counts where the listing accepts one, exactly as in the engine.
  house.members.forEach(m => store.DB.declare(house.id, m, { mode: 'guarantor' }));
  const refuses = store.reachFor(house).filter(h => !h.guarantorsAllowed);
  refuses.forEach(home => assert.equal(store.declaredIncome(house, home),
    0, 'a guarantor-only declaration counts nothing where guarantors are refused'));
  store.actions.reset();
});
test('Closing a sheet only closes it, and opening a household from one closes it first', () => {
  store.actions.reset();
  store.actions.setRoommateMode(true);
  store.actions.respondInvite(store.DB.invitesTo(store.me().id)[0].id, 'accepted');
  const house = store.myHouseholds()[0];
  house.members.forEach(m => store.DB.confirmHousehold(house.id, m));
  const home = store.reachFor(house)[0];
  store.actions.go('listings');
  store.actions.applyTo(home.id);
  store.actions.openHousehold(house.id);       // "Edit it" on the application sheet
  assert.equal(store.view.openListing, null, 'the sheet no longer covers the letter you came to edit');

  store.actions.go('listings');
  store.actions.applyTo(home.id);
  store.actions.closeOverlay();
  assert.equal(store.view.openListing, null, 'the ✕, the backdrop and Escape close it');
  assert.equal(store.view.route, 'listings', 'and leave you where you were');

  store.actions.go('roommates');
  store.actions.confirmHousehold(house.id);
  store.view.celebration = { householdId: house.id, members: house.members.slice(), before: 0, after: 1 };
  store.actions.closeOverlay();
  assert.equal(store.view.route, 'roommates', 'closing the celebration does not send you to Listings');
  store.actions.reset();
});
test('Sharing a household is enough to message each other', () => {
  store.actions.reset();
  const me = store.me();
  const house = store.DB.createHousehold(me.id, 3);
  const [a, b] = data.tenants.filter(t => t.id !== me.id).slice(0, 2);
  store.DB.addToHousehold(house.id, a.id);
  store.DB.addToHousehold(house.id, b.id);
  assert(store.DB.connections(a.id).includes(b.id),
    'two members who never exchanged an invitation can still open a conversation');
  store.actions.reset();
});
test('Also searching at another size fits the people, and carries the ones still deciding', () => {
  store.actions.reset();
  store.actions.setRoommateMode(true);
  store.actions.startHousehold(2);
  const solo = store.myHouseholds()[0];
  const target = store.candidates()[0].person;
  store.actions.sendInvite(target.id, [{ id: solo.id }], 'hi');
  store.actions.alsoSearch(solo.id, 3);
  const three = store.myHouseholds().find(h => h.size === 3);
  assert(store.DB.invitesFor(three.id).some(i => i.to === target.id),
    'the person still deciding is asked into the new one too');
  store.actions.reset();
  store.actions.setRoommateMode(true);
  store.actions.startHousehold(2);
  const alone = store.myHouseholds()[0];
  assert.deepEqual(store.alsoSizesFor(alone), [],
    'on your own it would just be "start a household", so it is not offered');
  store.actions.sendInvite(store.candidates()[0].person.id, [{ id: alone.id }], 'hi');
  assert.deepEqual(store.alsoSizesFor(alone), [3, 4], 'with someone asked, the bigger sizes are');

  store.actions.reset();
  store.actions.setRoommateMode(true);
  const me = store.me();
  const big = store.DB.createHousehold(me.id, 3);
  data.tenants.slice(0, 3).filter(t => t.id !== me.id).forEach(t => store.DB.addToHousehold(big.id, t.id));
  assert.equal(store.conflicts(store.DB.householdById(big.id)).length, 0, 'a compatible trio');
  assert.equal(store.DB.cloneHousehold(big.id, 2, me.id), null, 'three people cannot run as a two-bedroom');
  assert.equal(store.alsoSizesFor(big).includes(2), false, 'so it is not offered either');
  store.actions.alsoSearch(big.id, 2);
  assert(/too small/.test(said()), 'with the actual reason, not "you already run one"');
  store.actions.reset();
});
test('A place someone has been asked into is not offered to a second person', () => {
  store.actions.reset();
  store.actions.setRoommateMode(true);
  store.actions.startHousehold(2);
  const house = store.myHouseholds()[0];
  const [first, second] = store.candidates().map(c => c.person);
  store.actions.sendInvite(first.id, [{ id: house.id }], 'hi');
  store.actions.sendInvite(second.id, [{ id: house.id }], 'hi');
  assert.equal(store.DB.invitesFor(house.id).length, 1, 'its one place is promised, so no second invitation goes in');
  assert.equal(store.freePlaces(house), 0, 'and it reads as having no free place');
  assert(/Nothing was sent/.test(said()));

  store.actions.startHousehold(2);
  assert.equal(store.myHouseholds().filter(h => h.size === 2).length, 1, 'nor a second 2-bedroom');
  assert(/already/.test(said()));

  store.actions.go('market');
  const shown = store.view.toast;
  store.actions.go('market');
  assert.equal(store.view.toast, shown, 'a toast stays with you to the next page, so its Undo is not lost by moving');
  store.actions.reset();
});
test('No group is placed in a home it would need an unobtainable permit to share', () => {
  // Rotterdam, Verordening samenstelling Woningvoorraad 2025: a permit is needed from three room
  // occupants (art. 2.2.2), and none are granted in Kralingen Oost or West (art. 2.2.3(1)(d),
  // bijlage 2). Listings already flagged these homes; the engine still filled them.
  const blocked = data.homes.filter(h => h.sharingAllowed && h.bedrooms >= 3
    && matching.sharingStatus(h, h.bedrooms) === 'permit-required');
  assert(blocked.length > 0, 'the fixtures contain such homes');
  blocked.forEach(home => {
    assert.equal(matching.findGroup(home, data.tenants), null,
      `${home.id} in ${home.district} cannot be shared by ${home.bedrooms} people`);
  });
  for (const size of data.SETTINGS.sizes) {
    const run = simulation.run(size);
    const illegal = [...run.allocations.baseline, ...run.allocations.enhanced]
      .filter(a => a.people.length > 1 && matching.sharingStatus(a.home, a.people.length) === 'permit-required');
    assert.equal(illegal.length, 0, `${size} seekers: ${illegal.length} groups placed in permit-blocked homes`);
  }
});
test('People you could actually search with come before people you never could', () => {
  // A person who moves in a different month, or searches none of your areas, can never apply
  // with you. They used to take grid places ahead of dozens of people who could.
  store.actions.reset();
  const me = store.me();
  const together = p => p.moveMonth === me.moveMonth && p.districts.some(d => me.districts.includes(d));
  const order = store.candidates().map(c => c.suitable && together(c.person));
  const lastWorkable = order.lastIndexOf(true);
  const firstUnworkable = order.indexOf(false);
  assert(order.includes(true) && order.includes(false), 'the pool has both kinds');
  assert(lastWorkable < firstUnworkable,
    `someone you could never live with is ranked at ${firstUnworkable}, above a workable match at ${lastWorkable}`);
  store.actions.reset();
});
test('Undo puts back exactly what an action changed, and only while nothing else has', () => {
  store.actions.reset();
  store.actions.setRoommateMode(true);
  store.actions.startHousehold(2);
  const house = store.myHouseholds()[0];
  const target = store.candidates()[0].person;

  const before = JSON.stringify(store.DB.state);
  store.actions.sendInvite(target.id, [{ id: house.id }], 'hi');
  assert(store.view.toast && store.view.toast.undo, 'sending an invitation offers Undo');
  store.actions.undo();
  assert.equal(JSON.stringify(store.DB.state), before, 'Undo restores the state exactly as it was');
  assert.equal(store.DB.invitesFor(house.id).length, 0, 'the invitation is gone');

  // Once anything else is written, restoring would throw that away, so Undo refuses.
  store.actions.sendInvite(target.id, [{ id: house.id }], 'hi');
  store.actions.editMe({ bio: 'written after the invitation' });
  store.actions.undo();
  assert.equal(store.DB.invitesFor(house.id).length, 1, 'Undo after a later change does nothing');
  assert.equal(store.me().bio, 'written after the invitation', 'and the later change survives');
  assert(/no longer be undone/.test(said()), 'and it says why');
  store.actions.reset();
});
test('Leaving a household, or switching matching off, can be undone', () => {
  store.actions.reset();
  store.actions.setRoommateMode(true);
  const me = store.me();
  store.actions.respondInvite(store.DB.invitesTo(me.id)[0].id, 'accepted');
  const house = store.myHouseholds()[0];

  store.actions.leaveHousehold(house.id);
  assert.equal(store.DB.householdById(house.id).members.includes(me.id), false);
  assert(store.view.toast.undo, 'leaving offers Undo instead of a confirmation in front of it');
  store.actions.undo();
  assert(store.DB.householdById(house.id).members.includes(me.id), 'and Undo puts you back in');

  // Switching matching off leaves every household at once.
  store.actions.setRoommateMode(false);
  assert.equal(store.myHouseholds().length, 0);
  assert(store.view.toast && store.view.toast.undo, 'switching off says what it did, with Undo');
  store.actions.undo();
  assert.equal(store.myHouseholds().length, 1, 'Undo brings the households back');
  assert.equal(store.me().roommateMode, true, 'and matching back on');
  store.actions.reset();
});
test('Everyone you could live with can be reached, a page at a time', () => {
  // The grid used to stop at 24 with no way further, while 49 workable people sat below.
  store.actions.reset();
  store.actions.setRoommateMode(true);
  const workable = store.candidates().filter(c => c.workable).length;
  assert(workable > 24, 'there are more workable people than the old fixed grid could show');
  let page = store.peopleGrid();
  assert(page.shown.every(c => c.workable), 'the default view is the people you could actually apply with');
  while (page.more) { store.actions.showMore(); page = store.peopleGrid(); }
  assert.equal(page.shown.length, workable, 'Show more reaches every one of them');
  store.actions.setPeople('everyone');
  page = store.peopleGrid();
  assert.equal(page.counts.everyone, store.candidates().length, 'and Everyone counts the whole pool');
  assert.equal(page.shown.length, 12, 'starting again from the first page');
  store.actions.reset();
});
test('Withdrawing an invitation that was already answered says so', () => {
  store.actions.reset();
  store.actions.setRoommateMode(true);
  store.actions.startHousehold(2);
  const house = store.myHouseholds()[0];
  const target = store.candidates()[0].person;
  store.actions.sendInvite(target.id, [{ id: house.id }], 'hi');
  const invite = store.DB.invitesFor(house.id)[0];
  store.DB.respond(invite.id, 'accepted');          // they said yes a second earlier
  store.actions.withdrawInvite(invite.id);
  assert(store.DB.householdById(house.id).members.includes(target.id), 'they stay in');
  assert(/already answered/.test(said()), 'and the screen does not claim it was withdrawn');
  store.actions.reset();
});
const waitFor = ms => new Promise(r => setTimeout(r, ms));
later('Nothing scheduled before a reset writes into the database after it', async () => {
  store.actions.reset();
  store.actions.setRoommateMode(true);
  const me = store.me();
  store.actions.respondInvite(store.DB.invitesTo(me.id)[0].id, 'accepted');
  const other = store.myHouseholds()[0].members.find(m => m !== me.id);
  store.actions.say(other, 'hello');
  store.actions.reset();
  await waitFor(1300);
  assert.equal(store.DB.thread(me.id, other).length, 0, 'the reply to a reset conversation never appears');
  assert.equal(store.view.celebration, null);
  store.actions.reset();
});
later('A reply reaches whoever wrote, even if they switched accounts meanwhile', async () => {
  store.actions.reset();
  store.actions.setRoommateMode(true);
  const me = store.me();
  store.actions.respondInvite(store.DB.invitesTo(me.id)[0].id, 'accepted');
  const other = store.myHouseholds()[0].members.find(m => m !== me.id);
  store.actions.say(other, 'hello');
  const someoneElse = data.tenants.find(t => t.id !== me.id && t.id !== other).id;
  store.actions.signIn(someoneElse);
  await waitFor(1300);
  assert.equal(store.DB.thread(me.id, other).length, 3, 'their invitation, your hello, and their reply');
  assert.equal(store.DB.thread(someoneElse, other).length, 0, 'nothing lands on the account you switched to');
  store.actions.reset();
});
(async () => {
  for (const [name, fn] of deferred) { await fn(); passed++; console.log(`PASS ${name}`); }
  console.log(`\n${passed} checks passed.`);
  console.log(JSON.stringify(simulation.runAll().map(({ size, baseline, enhanced }) => ({ size, baseline, enhanced })), null, 2));
})().catch(error => { console.error(error); process.exit(1); });
