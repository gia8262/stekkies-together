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
      return { matched, rate: matched / people.length * 100, groups: values.filter(a => a.people.length > 1).length, homes: values.length, unmatched: people.length - matched };
    };
    return { size: people.length, baseline: summarize(allocations.baseline), enhanced: summarize(allocations.enhanced), allocations };
  }
  function runAll() { return data.SETTINGS.sizes.map(run); }
  function createMarket(size, rounds = 12) {
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

  function settle(branch, homes, allowGroups, round, informalSearch) {
    const usedHomes = new Set(branch.allocations.map(a => a.home.id));
    let availableHomes = homes.filter(h => !usedHomes.has(h.id));
    const added = matching.allocateSolo(branch.waiting, availableHomes).map(a => ({ ...a, formation: 'individual' }));
    const usedPeople = new Set(added.flatMap(a => a.people.map(t => t.id)));
    added.forEach(a => usedHomes.add(a.home.id));
    if (informalSearch || allowGroups) {
      availableHomes = homes.filter(h => !usedHomes.has(h.id) && h.sharingAllowed)
        .sort((a, b) => a.rent / a.bedrooms - b.rent / b.bedrooms || a.id.localeCompare(b.id));
      let informalUsed = false;
      for (const home of availableHomes) {
        if (!allowGroups && informalUsed) break;
        const group = matching.findGroup(home, branch.waiting.filter(t => !usedPeople.has(t.id)));
        if (group) {
          group.forEach(t => usedPeople.add(t.id));
          const formation = informalSearch && !informalUsed ? 'informal' : 'platform';
          added.push({ home, people: group, formation });
          if (formation === 'informal') informalUsed = true;
        }
      }
    }
    branch.latest = added.map(a => ({ ...a, round }));
    branch.allocations.push(...branch.latest);
    branch.waiting = branch.waiting.filter(t => !usedPeople.has(t.id));
  }

  // A stateful round: new seekers enter, waiting seekers are reconsidered, and
  // allocations remain reserved. Each counterfactual market owns its inventory.
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
  function seekMarket(size, round, rounds = 12) {
    if (!Number.isInteger(round) || round < 0 || round > rounds) throw new RangeError('Invalid round');
    const state = createMarket(size, rounds);
    while (state.round < round) stepMarket(state);
    return state;
  }
  const api = { run, runAll, createMarket, stepMarket, seekMarket, informalOpportunity };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DemoSimulation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
