(function (root) {
  'use strict';
  const data = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.DemoData;
  const attributes = ['smoking', 'cleanliness', 'routine', 'sociability'];
  const sharedAttributes = (a, b) => attributes.filter(key => a.lifestyle[key] === b.lifestyle[key]).length;
  // A fraction for ranking candidates; the pass/fail test below counts attributes instead.
  function compatibility(a, b) {
    return sharedAttributes(a, b) / attributes.length;
  }
  function mutuallySuitable(a, b) {
    const essential = [a.dealbreaker, b.dealbreaker].filter(Boolean);
    return essential.every(key => a.lifestyle[key] === b.lifestyle[key]) &&
      sharedAttributes(a, b) >= data.SETTINGS.requiredMatches;
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
    // Rotterdam, Verordening samenstelling Woningvoorraad 2025: three or more room occupants
    // need a permit (art. 2.2.2), and none are granted in Kralingen (art. 2.2.3(1)(d),
    // bijlage 2). Listings flagged these homes all along; the engine used to fill them anyway,
    // which put 10 of the simulation's 94 groups in homes they could not legally share.
    if (group.length > 1 && sharingStatus(home, group.length) === 'permit-required') return false;
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
    const anchors = requiredPersonId
      ? candidates.filter(t => t.id === requiredPersonId)
      : candidates.slice(0, data.SETTINGS.anchorLimit);
    let best = null, bestScore = -1;
    for (const anchor of anchors) {
      // Best fit for the anchor first, then the strongest finances, then id for a stable
      // order — the tie-break is what keeps the whole simulation reproducible.
      const remaining = candidates.filter(t => t.id !== anchor.id).sort((a, b) =>
        compatibility(anchor, b) - compatibility(anchor, a) ||
        incomeContribution(b, home) - incomeContribution(a, home) ||
        a.id.localeCompare(b.id, undefined, { numeric: true }));
      const group = [anchor];
      for (const candidate of remaining) {
        if (group.length === home.bedrooms) break;
        if (group.every(member => mutuallySuitable(member, candidate))) group.push(candidate);
      }
      if (group.length !== home.bedrooms || !eligibleGroup(group, home)) continue;
      const groupScore = score(group);
      if (groupScore > bestScore) { best = group; bestScore = groupScore; }
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
  // A tenant set is formed before any listing exists, so this takes no home: it ranks the
  // people a searcher could live with, which is the question the set-building screen asks.
  // findGroup answers the different, listing-first question and is still what the market
  // simulation uses.
  const sharedDistricts = (a, b) => a.districts.filter(d => b.districts.includes(d)).length;
  function suggestSet(anchor, people, size) {
    // Sets form on where and when people are searching before they form on who they are:
    // two ideally compatible people who want different districts or months are not a set,
    // because the group would never clear basicEligibility on the same listing.
    const rank = (a, b) =>
      (b.moveMonth === anchor.moveMonth) - (a.moveMonth === anchor.moveMonth) ||
      sharedDistricts(anchor, b) - sharedDistricts(anchor, a) ||
      compatibility(anchor, b) - compatibility(anchor, a) ||
      // Closest budget, not highest: a set is only as reachable as its lowest budget.
      Math.abs(a.budget - anchor.budget) - Math.abs(b.budget - anchor.budget) ||
      a.id.localeCompare(b.id, undefined, { numeric: true });
    const candidates = people
      .filter(person => person.id !== anchor.id && mutuallySuitable(anchor, person))
      .sort(rank);
    const set = [anchor];
    for (const candidate of candidates) {
      if (set.length === size) break;
      if (set.every(member => mutuallySuitable(member, candidate))) set.push(candidate);
    }
    return { set, candidates };
  }
  // What this set can reach. Run against a set of one, it is what the searcher can reach
  // alone — which is the comparison the whole proposal rests on.
  function reachableHomes(set, homes) {
    return homes.filter(home => eligibleGroup(set, home));
  }
  // Listings rarely state sharing permission reliably, so a claim is not a fact.
  // 'unclear' is forwarded rather than hidden, because a call to the landlord settles it.
  function sharingStatus(home, occupants) {
    if (occupants < 2) return 'allowed';
    if (occupants >= 3 && data.SETTINGS.permitDistricts.includes(home.district)) return 'permit-required';
    if (!home.sharingAllowed) return 'unclear';
    return 'allowed';
  }
  const api = { compatibility, mutuallySuitable, basicEligibility, eligibleGroup, findGroup, allocateSolo, score, suggestSet, reachableHomes, sharingStatus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DemoMatching = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
