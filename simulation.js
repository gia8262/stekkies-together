(function (root) {
  'use strict';
  const data = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.DemoData;
  const matching = typeof module !== 'undefined' && module.exports ? require('./matching.js') : root.DemoMatching;
  function run(size) {
    const state = createMarket(size);
    while (state.round < state.rounds) stepMarket(state);
    const people = state.arrived;
    const allocations = { baseline: state.baseline.allocations, enhanced: state.enhanced.allocations };
    const summarize = values => {
      const matched = values.reduce((sum, a) => sum + a.people.length, 0);
      return {
        matched,
        rate: matched / people.length * 100,
        groups: values.filter(a => a.people.length > 1).length,
        homes: values.length,
        unmatched: people.length - matched
      };
    };
    return { size: people.length, baseline: summarize(allocations.baseline), enhanced: summarize(allocations.enhanced), allocations };
  }
  function runAll() { return data.SETTINGS.sizes.map(run); }
  function createMarket(size, rounds = data.SETTINGS.rounds) {
    if (!Number.isInteger(size) || size < 1 || size > data.tenants.length) throw new RangeError('Invalid population');
    if (!Number.isInteger(rounds) || rounds < 1) throw new RangeError('Invalid round count');
    const branch = () => ({ allocations: [], waiting: [], latest: [] });
    return { size, rounds, round: 0, arrived: [], arrivals: [], baseline: branch(), enhanced: branch(), history: [] };
  }

  // A limited informal search opportunity, not a guaranteed group or an empirical
  // success rate. Both markets receive the identical seeded opportunity schedule.
  function informalOpportunity(round) {
    let seed = (data.SETTINGS.seed + 7919) >>> 0;
    for (let i = 0; i < round; i++) seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296 < data.SETTINGS.informalOpportunityRate;
  }

  // One round settles in the order the model describes. Solo rentals first, available to
  // both markets. Then shared sharing homes are walked once, cheapest rent per bedroom
  // first. Both markets spend the same informal (self-organized) budget on that walk:
  // at most one group, and only on a seeded opportunity round. Together alone keeps
  // walking afterwards, and those later groups are the ones the platform is responsible
  // for. The 'informal' allocations are therefore the counterfactual — the households
  // that would have formed without the feature — not a second kind of platform match.
  function settle(branch, homes, allowGroups, round, informalSearch) {
    const usedHomes = new Set(branch.allocations.map(a => a.home.id));
    const usedPeople = new Set();
    const added = [];
    const record = (home, people, formation) => {
      people.forEach(person => usedPeople.add(person.id));
      usedHomes.add(home.id);
      added.push({ home, people, formation });
    };
    const stillWaiting = () => branch.waiting.filter(person => !usedPeople.has(person.id));

    matching.allocateSolo(branch.waiting, homes.filter(h => !usedHomes.has(h.id)))
      .forEach(a => record(a.home, a.people, 'individual'));

    const sharable = homes.filter(h => !usedHomes.has(h.id) && h.sharingAllowed)
      .sort((a, b) => a.rent / a.bedrooms - b.rent / b.bedrooms || a.id.localeCompare(b.id));
    let informalBudget = informalSearch ? 1 : 0;
    for (const home of sharable) {
      if (!informalBudget && !allowGroups) break;
      const group = matching.findGroup(home, stillWaiting());
      if (!group) continue;
      record(home, group, informalBudget ? 'informal' : 'platform');
      if (informalBudget) informalBudget--;
    }

    branch.latest = added.map(a => ({ ...a, round }));
    branch.allocations.push(...branch.latest);
    branch.waiting = stillWaiting();
  }

  // A stateful round: new seekers enter, waiting seekers are reconsidered, and
  // allocations remain reserved. Both branches read the same shared, never-mutated home
  // fixtures; independence comes from each branch tracking its own assigned homes, so a
  // home can end up let to different people — or to nobody — in the two markets.
  function stepMarket(state) {
    if (state.round >= state.rounds) return state;
    state.round++;
    const end = Math.ceil(state.size * state.round / state.rounds);
    state.arrivals = data.tenants.slice(state.arrived.length, end);
    state.arrived.push(...state.arrivals);
    for (const [key, allowGroups] of [['baseline', false], ['enhanced', true]]) {
      state[key].waiting.push(...state.arrivals);
      settle(state[key], data.homes, allowGroups, state.round, informalOpportunity(state.round));
    }
    state.history.push({ round: state.round, arrived: state.arrived.length,
      baseline: state.arrived.length - state.baseline.waiting.length,
      enhanced: state.arrived.length - state.enhanced.waiting.length });
    return state;
  }
  // Rebuild the same deterministic timeline when scrubbing in either direction.
  function seekMarket(size, round, rounds = data.SETTINGS.rounds) {
    if (!Number.isInteger(round) || round < 0 || round > rounds) throw new RangeError('Invalid round');
    const state = createMarket(size, rounds);
    while (state.round < round) stepMarket(state);
    return state;
  }
  const api = { run, runAll, createMarket, stepMarket, seekMarket, informalOpportunity };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DemoSimulation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
