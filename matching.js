(function (root) {
  'use strict';
  const data = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.DemoData;
  const attributes = ['smoking', 'cleanliness', 'routine', 'sociability'];
  function compatibility(a, b) {
    return attributes.filter(key => a.lifestyle[key] === b.lifestyle[key]).length / attributes.length;
  }
  function mutuallySuitable(a, b) {
    const essential = [a.dealbreaker, b.dealbreaker].filter(Boolean);
    return essential.every(key => a.lifestyle[key] === b.lifestyle[key]) && compatibility(a, b) >= data.SETTINGS.compatibilityFloor;
  }
  function basicEligibility(person, home, occupants) {
    return occupants <= home.maxOccupants && person.budget >= home.rent / occupants &&
      person.districts.includes(home.district) && person.moveMonth === home.moveMonth &&
      (home.studentsAllowed || !person.role.toLowerCase().includes('student'));
  }
  function incomeContribution(person, home) {
    return home.guarantorsAllowed ? Math.max(person.income, person.guarantorIncome || 0) : person.income;
  }
  function eligibleGroup(group, home) {
    if (!group.length || new Set(group.map(t => t.id)).size !== group.length) return false;
    if (group.length > 1 && (!home.sharingAllowed || group.length !== home.bedrooms)) return false;
    if (!group.every(person => basicEligibility(person, home, group.length))) return false;
    if (group.reduce((sum, person) => sum + incomeContribution(person, home), 0) < home.rent * home.incomeMultiple) return false;
    return group.every((person, i) => group.slice(i + 1).every(other => mutuallySuitable(person, other)));
  }
  function score(group) {
    let sum = 0, pairs = 0;
    group.forEach((person, i) => group.slice(i + 1).forEach(other => { sum += compatibility(person, other); pairs++; }));
    return pairs ? sum / pairs : 1;
  }
  // Small, deterministic greedy search, not a claim of globally optimal allocation.
  // Candidate anchors provide alternatives; all final groups pass the same full checks.
  function findGroup(home, people, requiredPersonId) {
    if (!home.sharingAllowed || home.bedrooms < 2) return null;
    const candidates = people.filter(person => basicEligibility(person, home, home.bedrooms));
    const anchors = requiredPersonId ? candidates.filter(t => t.id === requiredPersonId) : candidates.slice(0, data.SETTINGS.anchorLimit);
    let best = null, bestScore = -1;
    for (const anchor of anchors) {
      const group = [anchor];
      const remaining = candidates.filter(t => t.id !== anchor.id).sort((a, b) =>
        compatibility(anchor, b) - compatibility(anchor, a) || incomeContribution(b, home) - incomeContribution(a, home) || a.id.localeCompare(b.id, undefined, { numeric: true }));
      for (const candidate of remaining) {
        if (group.length === home.bedrooms) break;
        if (group.every(member => mutuallySuitable(member, candidate))) group.push(candidate);
      }
      if (group.length === home.bedrooms && eligibleGroup(group, home) && score(group) > bestScore) {
        best = group; bestScore = score(group);
      }
    }
    return best;
  }
  function allocateSolo(people, homes) {
    const usedPeople = new Set(), allocations = [];
    for (const home of [...homes].sort((a, b) => a.rent - b.rent || a.id.localeCompare(b.id))) {
      const eligible = people.filter(t => !usedPeople.has(t.id) && eligibleGroup([t], home)).sort((a, b) => a.budget - b.budget || a.id.localeCompare(b.id));
      if (eligible.length) { usedPeople.add(eligible[0].id); allocations.push({ home, people: [eligible[0]] }); }
    }
    return allocations;
  }
  const api = { compatibility, mutuallySuitable, basicEligibility, eligibleGroup, findGroup, allocateSolo, score };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DemoMatching = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
