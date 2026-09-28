(function (root) {
  'use strict';
  const SETTINGS = Object.freeze({ sizes: [50, 150, 300], homeCount: 100, seed: 2026, compatibilityFloor: 0.62, anchorLimit: 24, informalOpportunityRate: 0.25 });
  const labels = {
    smoking: { no: 'No indoor smoking', yes: 'Indoor smoking OK' },
    cleanliness: { tidy: 'Tidy', relaxed: 'Relaxed' },
    routine: { early: 'Early routine', late: 'Late routine' },
    sociability: { quiet: 'Quiet home', social: 'Social home' }
  };
  const districts = ['Kralingen', 'Delfshaven', 'Noord', 'Centrum'];
  // Fixed-seed fixtures: identical people, listings and outcomes on every run.
  // All amounts and distributions below are teaching assumptions, not market estimates.
  function random(seed) {
    let state = seed >>> 0;
    return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  }
  const rng = random(SETTINGS.seed);
  const pick = values => values[Math.floor(rng() * values.length)];
  const names = ['Alex', 'Mina', 'Luca', 'Noor', 'Sam', 'Iris', 'Ravi', 'Emma', 'Jules', 'Nina', 'Omar', 'Liv', 'Robin', 'Tess', 'Dani', 'Sasha', 'Ari', 'Mika', 'Ellis', 'Lena'];
  const baseLifestyle = { smoking: 'no', cleanliness: 'tidy', routine: 'early', sociability: 'social' };
  const tenants = Array.from({ length: 300 }, (_, i) => ({
    id: `t${i + 1}`, name: `${names[i % names.length]}${i >= names.length ? ' ' + (Math.floor(i / names.length) + 1) : ''}`,
    age: 22 + (i % 8), role: rng() < 0.65 ? 'Student' : 'Young professional',
    budget: pick([650, 750, 850, 950, 1100, 1300]), income: pick([800, 1200, 1800, 2500, 3500]),
    guarantorIncome: rng() < 0.65 ? 3000 : 0,
    districts: [districts[i % 4], districts[(i + 1) % 4]], moveMonth: pick(['Oct', 'Oct', 'Nov']),
    lifestyle: { smoking: rng() < 0.85 ? 'no' : 'yes', cleanliness: pick(['tidy', 'relaxed']), routine: pick(['early', 'late']), sociability: pick(['quiet', 'social']) },
    dealbreaker: pick(['smoking', 'cleanliness', 'routine', 'sociability'])
  }));
  // Three deliberately legible profiles for the scripted tenant journey.
  ['Alex', 'Mina', 'Luca'].forEach((name, i) => Object.assign(tenants[i], {
    name, age: [24, 23, 25][i], role: ['Master’s student', 'Master’s student', 'Young professional'][i],
    budget: [850, 800, 900][i], income: [1200, 1000, 2800][i], guarantorIncome: i < 2 ? 3000 : 0,
    districts: ['Kralingen', 'Centrum'], moveMonth: 'Oct', lifestyle: { ...baseLifestyle },
    dealbreaker: ['smoking', 'cleanliness', 'routine'][i]
  }));
  const homes = Array.from({ length: SETTINGS.homeCount }, (_, i) => {
    const bedrooms = i < 20 ? 1 : 2 + (i % 3);
    return {
      id: `h${i + 1}`, title: bedrooms === 1 ? 'A place of your own' : 'Room to share',
      district: districts[i % 4], bedrooms, maxOccupants: bedrooms,
      rent: bedrooms === 1 ? pick([1000, 1150, 1250]) : bedrooms * pick([650, 750, 850, 950]),
      area: bedrooms === 1 ? 35 + i % 15 : 35 + bedrooms * 18,
      moveMonth: pick(['Oct', 'Oct', 'Nov']), sharingAllowed: bedrooms > 1 && rng() < 0.9,
      studentsAllowed: rng() < 0.8, guarantorsAllowed: rng() < 0.75, incomeMultiple: 3
    };
  });
  Object.assign(homes[20], { title: 'A little more room. Together.', district: 'Kralingen', bedrooms: 3, maxOccupants: 3, rent: 2250, area: 92, moveMonth: 'Oct', sharingAllowed: true, studentsAllowed: true, guarantorsAllowed: true });
  const api = { SETTINGS, labels, districts, tenants, homes, focalTenant: tenants[0], focalHome: homes[20] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DemoData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
