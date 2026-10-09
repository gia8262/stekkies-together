/* View state and the actions that change it. Anything that would outlive a page refresh —
   accounts, invitations, conversations, households — belongs to db.js; this file holds only
   what is true about the current screen. */
(function (root) {
  'use strict';
  const data = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.DemoData;
  const matching = typeof module !== 'undefined' && module.exports ? require('./matching.js') : root.DemoMatching;
  const DB = typeof module !== 'undefined' && module.exports ? require('./db.js') : root.DemoDB;
  const fmt = typeof module !== 'undefined' && module.exports ? require('./format.js') : root.DemoFormat;

  const listeners = [];
  const notify = () => listeners.forEach(fn => fn());
  // Bumped by a full reset, so a reply or a confirmation scheduled before it cannot write into
  // the fresh database that replaced the one it was scheduled for.
  let epoch = 0;
  const SIZES = [2, 3, 4];

  const view = {
    route: 'home',
    openProfile: null,
    openListing: null,
    openThread: null,
    celebration: null,
    justJoined: null,
    toast: null,
    // A one-off hint for the screen that something worth animating just happened.
    flourish: null,
    openHouse: null,
    // The people grid: who it shows, and how far down you have paged.
    people: 'workable',
    shown: 12,
    switching: false,
    notifying: false,
    filter: 'all',
    openWhy: null
  };

  /* ---------- derived ---------- */

  const me = () => DB.me();

  /* A searcher runs several households at once on purpose: one aiming at a two-bedroom, one
     at a three. Each is its own group with its own reach, and because a household of n can
     only take an n-bedroom home those reaches never overlap. */
  const myHouseholds = () => DB.householdsOf(me().id)
    .slice()
    .sort((a, b) => (b.id === view.justJoined) - (a.id === view.justJoined)
      || a.size - b.size || a.at - b.at);
  const membersOf = house => house.members.map(DB.profile);
  const readyHouseholds = () => myHouseholds().filter(DB.isReady);

  // What a household reaches, but only once it is actually ready — a half-built one is still
  // hypothetical and must not be counted as if it could apply.
  const reachFor = house => (DB.isReady(house)
    ? matching.reachableHomes(membersOf(house), data.homes) : []);
  const reachableAlone = () => matching.reachableHomes([me()], data.homes);
  const pooledBudget = group => (group || [me()]).reduce((t, p) => t + p.budget, 0);
  const pooledIncome = (home, group) => (group || [me()]).reduce((t, p) =>
    t + (!home || home.guarantorsAllowed ? Math.max(p.income, p.guarantorIncome || 0) : p.income), 0);

  /* What a household is called. Machine labels like "2-bedroom household" told you the
     schema, not which of your searches this is — so a household carries a name you choose,
     and falls back to the people in it rather than to its size.

     People are called by the name they show, "Mina B." and not "Mina": two of the people who
     invite you on day one are called Mina, and first names alone made their two households
     read as one person's. */
  const shortName = person => String((person && person.name) || '');
  function defaultName(house) {
    const first = membersOf(house).filter(Boolean).map(shortName);
    if (first.length > 1) return `${first.slice(0, -1).join(', ')} & ${first[first.length - 1]}`;
    // One person is named from where the reader stands: yours, or theirs. Every invitation in
    // a fresh bell used to call the sender's household "Your 2-bedroom search".
    const owner = DB.profile(house.members[0]);
    return !owner || owner.id === me().id
      ? `Your ${house.size}-bedroom search`
      : `${shortName(owner)}’s ${house.size}-bedroom search`;
  }
  const nameOf = house => (house && house.name ? house.name : house ? defaultName(house) : '');
  // The same name inside a sentence: "sent to Luca for your 2-bedroom search", not "Your".
  const nameIn = house => (house && !house.name ? defaultName(house).replace(/^Your /, 'your ') : nameOf(house));
  function siblingsOf(house) {
    // Someone you have invited but who has not answered counts: "also searching with Mina as
    // a 3-bedroom" is true from the moment you ask her, which is when the two cards would
    // otherwise start looking like two unrelated searches.
    const involved = group => new Set([...group.members,
      ...DB.invitesFor(group.id).map(i => i.to)]);
    const here = involved(house);
    return myHouseholds()
      .filter(other => other.id !== house.id)
      .map(other => ({ house: other,
        shared: [...involved(other)].filter(id => here.has(id) && id !== me().id).map(DB.profile) }))
      .filter(entry => entry.shared.length);
  }

  /* The size chip is only worth showing when the name does not already say it — a card
     reading "Your 2-bedroom search · 2 bedrooms" tells you the same thing twice. */
  const needsSizeChip = house => Boolean(house.name) || membersOf(house).length > 1;
  const sizeLabel = house => `${house.size} bedrooms`;

  /* People a household is waiting on. Without this an open place and a place with an
     invitation out look identical, which is what made sending one feel like nothing happened. */
  const pendingFor = house => DB.invitesFor(house.id).map(i => ({ invite: i, person: DB.profile(i.to) }));

  /* What a member says they bring. Falls back to the figures the fixtures already carry, so
     an untouched household still adds up. */
  function declared(house, id) {
    const person = DB.profile(id);
    const saved = (house.finances || {})[id] || {};
    const salary = saved.salary !== undefined ? saved.salary : person.income;
    const guarantor = saved.guarantor !== undefined ? saved.guarantor : (person.guarantorIncome || 0);
    const mode = saved.mode || (person.guarantorIncome ? 'both' : 'salary');
    const counts = mode === 'salary' ? salary
      : mode === 'guarantor' ? guarantor
      : mode === 'both' ? Math.max(salary, guarantor) : 0;
    return { id, person, mode, salary, guarantor, counts, budget: person.budget };
  }
  const declarations = house => house.members.map(id => declared(house, id));

  /* Two limits bind an application: what the landlord will accept on income, and what the
     members will actually pay. The lower one is the real ceiling, and saying which is which
     is the difference between a number and an explanation. */
  function ceiling(house) {
    const rows = declarations(house);
    const income = rows.reduce((t, r) => t + r.counts, 0);
    const budget = rows.reduce((t, r) => t + r.budget, 0);
    const fromIncome = Math.floor(income / 3);
    return { rows, income, budget, fromIncome, max: Math.min(budget, fromIncome),
      bindingIs: budget <= fromIncome ? 'budget' : 'income' };
  }

  /* What a household's own declarations put on the table for one particular home: the
     engine's rule — a guarantor counts only where the listing accepts one — applied to what
     each member said instead of to the fixture's figures. Untouched declarations reproduce
     the engine exactly, so no pinned figure moves. */
  function contribution(row, home) {
    const guarantor = home.guarantorsAllowed ? row.guarantor : 0;
    return row.mode === 'salary' ? row.salary
      : row.mode === 'guarantor' ? guarantor
      : row.mode === 'both' ? Math.max(row.salary, guarantor) : 0;
  }
  const declaredIncome = (house, home) =>
    declarations(house).reduce((t, row) => t + contribution(row, home), 0);

  /* The homes a household can actually apply for: in the engine's reach, and cleared by what
     its members declared. Its page, its card, Listings, Messages and the celebration all count
     with this — before, declaring "neither yet" dropped the ceiling on one screen while every
     other screen still offered the same homes. */
  const homesFor = house => reachFor(house)
    .filter(home => declaredIncome(house, home) >= home.rent * home.incomeMultiple);

  // Places nobody has been asked into yet. An invited place is promised, not free.
  const freePlaces = house => Math.max(0, DB.openSlots(house) - DB.invitesFor(house.id).length);

  /* Sizes this plan could also run at: not running already, big enough for everyone involved,
     and only when somebody would carry over — on your own, "also try as a 3-bedroom" is just
     "start a household", which already exists. */
  function alsoSizesFor(house) {
    if (conflicts(house).length) return [];
    const involved = new Set([...house.members, ...DB.invitesFor(house.id).map(i => i.to)]);
    if (involved.size < 2) return [];
    const taken = new Set(myHouseholds().map(h => h.size));
    return SIZES.filter(n => !taken.has(n) && n >= involved.size);
  }

  // The letter a household applies with. Stored on the household, so editing it once is what
  // "having it copied down" means.
  function letterFor(house, home) {
    if (house.letter) return house.letter;
    const people = membersOf(house);
    const money = ceiling(house);
    const place = home ? home.street : 'the home you have listed';
    const who = people.length > 1
      ? `We are ${people.length} tenants — ${fmt.names(people)} — looking to rent together from`
      : `I am ${people[0].name}, looking to rent from`;
    const plural = people.length > 1;
    return `Good afternoon,\n\n`
      + `${plural ? 'We' : 'I'} would like to view ${place}. ${who} `
      + `${fmt.monthName(people[0].moveMonth)}. ${plural ? 'Our combined monthly' : 'My monthly'} `
      + `income and guarantor support comes to ${fmt.euros(money.income)}.\n\n`
      + `${plural ? 'We' : 'I'} can view at short notice and can provide documents for `
      + `${plural ? 'everyone named' : 'the application'}.`;
  }

  const CHECKS = [
    ['finances', 'Finances declared'],
    ['letter', 'Happy with the letter'],
    ['viewing', 'Can view at short notice']
  ];
  const ticked = (house, id) => ((house.checklist || {})[id]) || {};
  const allTicked = house => house.members.every(id => CHECKS.every(([k]) => ticked(house, id)[k]));

  /* Two people you invited separately can still be wrong for each other: on habits, or by
     moving in different months or searching different areas, which no single home can
     satisfy. Any of them makes a household that is full and agreed but reaches nothing, so
     each is named rather than shown as "needs 1 more" or a cheerful "Ready" above a zero. */
  function conflicts(house) {
    const people = membersOf(house), clashes = [];
    const clash = (group, reason) => Object.assign(group, { reason });
    people.forEach((p, i) => people.slice(i + 1).forEach(o => {
      if (!matching.mutuallySuitable(p, o)) clashes.push(clash([p, o], 'habits'));
      else if (p.moveMonth !== o.moveMonth) clashes.push(clash([p, o], 'month'));
      else if (!p.districts.some(d => o.districts.includes(d))) clashes.push(clash([p, o], 'areas'));
    }));
    // Three people can each share an area with one another and still have none in common.
    if (!clashes.length && people.length > 2
      && !people[0].districts.some(d => people.every(p => p.districts.includes(d)))) {
      clashes.push(clash(people.slice(), 'areas'));
    }
    return clashes;
  }
  function clashText(group) {
    const who = fmt.names(group.map(p => ({ name: shortName(p) })));
    return group.reason === 'month' ? `${who} move in different months`
      : group.reason === 'areas' ? `${who} ${group.length > 2 ? 'have no area in common' : 'search different areas'}`
      : `${who} are not a match`;
  }

  /* Whether you could apply with everyone already in a household, in one line — what the bell
     shows under an invitation, so accepting one is a decision rather than a guess. Five of
     the eight people who ask Alex on day one could never apply with him. */
  function fitWith(house) {
    const mine = me();
    const others = membersOf(house).filter(p => p && p.id !== mine.id);
    for (const person of others) {
      if (matching.mutuallySuitable(mine, person) && canSearchTogether(mine, person)) continue;
      const reason = blockers(person)[0] || 'Not a match on habits';
      return { tone: 'no', text: others.length > 1 ? `${shortName(person)}: ${reason}` : reason };
    }
    // Asked into a pair: what the two of you would reach, in the grid's own words.
    if (house.size === 2 && others.length === 1) {
      const n = matching.reachableHomes([mine, others[0]], data.homes).length;
      return n ? { tone: 'ok', text: `+${n} two-bed home${n === 1 ? '' : 's'} together` }
        : { tone: 'meh', text: 'A good match, but no two-bed homes in reach yet' };
    }
    return { tone: 'ok', text: others.length > 1 ? 'You could apply with all of them' : 'You could apply together' };
  }

  // Two people can only ever apply together if they move in the same month and share an area.
  const canSearchTogether = (a, b) => a.moveMonth === b.moveMonth && a.districts.some(d => b.districts.includes(d));

  // Why a person would not work, in words, so browsing is a decision and not a lottery.
  function blockers(person) {
    const mine = me(), reasons = [];
    const clash = key => mine.lifestyle[key] !== person.lifestyle[key];
    if (mine.dealbreaker && clash(mine.dealbreaker)) {
      reasons.push(`Your dealbreaker: ${data.labels[mine.dealbreaker][mine.lifestyle[mine.dealbreaker]].toLowerCase()}`);
    }
    if (person.dealbreaker && clash(person.dealbreaker)) {
      reasons.push(`Their dealbreaker: ${data.labels[person.dealbreaker][person.lifestyle[person.dealbreaker]].toLowerCase()}`);
    }
    const shared = ['smoking', 'cleanliness', 'routine', 'sociability'].filter(k => !clash(k)).length;
    if (shared < data.SETTINGS.requiredMatches && !reasons.length) {
      reasons.push(`Only ${shared} of 4 household preferences line up`);
    }
    if (person.moveMonth !== mine.moveMonth) {
      reasons.push(`Moving in ${fmt.monthName(person.moveMonth)}, you in ${fmt.monthName(mine.moveMonth)}`);
    }
    if (!person.districts.some(d => mine.districts.includes(d))) reasons.push('Looking in different areas');
    return reasons;
  }

  function candidates() {
    const mine = me();
    /* Who you have already dealt with: anyone in one of your households, anyone with a live
       invitation either way, and anyone you said "not for me" about. That last one carries no
       household — declining a particular household's invitation is narrower and leaves them
       suggestible for a different one. */
    const inMine = new Set(myHouseholds().flatMap(h => h.members));
    const decided = new Set([
      ...inMine,
      ...DB.state.invites
        .filter(i => (i.from === mine.id || i.to === mine.id)
          && (i.status === 'pending' || i.status === 'accepted'
            || (i.status === 'declined' && !i.householdId)))
        .map(i => (i.from === mine.id ? i.to : i.from))
    ]);
    /* Where and when before who — the same principle suggestSet() uses. Somebody who moves in
       a different month, or searches none of your areas, can never apply with you, however well
       you would get on; they used to take grid places ahead of dozens of people who could. */
    return data.tenants
      .filter(p => p.id !== mine.id && !decided.has(p.id))
      .map(person => {
        const suitable = matching.mutuallySuitable(mine, person);
        return {
          person,
          suitable,
          together: canSearchTogether(mine, person),
          workable: suitable && canSearchTogether(mine, person),
          fit: matching.compatibility(mine, person),
          blockers: blockers(person),
          unlocks: matching.reachableHomes([mine, person], data.homes).length
        };
      })
      .sort((a, b) =>
        b.workable - a.workable || b.suitable - a.suitable || b.fit - a.fit || b.unlocks - a.unlocks ||
        a.person.id.localeCompare(b.person.id, undefined, { numeric: true }));
  }

  /* Every listing, always — with what it would take to get it. Showing only what you can
     already afford makes the market look smaller the moment you team up, which is the
     opposite of what is happening. */
  function listings() {
    const mine = me();
    const alone = new Set(reachableAlone().map(h => h.id));
    // Which household reaches which home. Only one can, since a household of n only fits an
    // n-bedroom place — so the tag can name it rather than saying a vague "together".
    const byHome = new Map(), shortBy = new Map();
    readyHouseholds().forEach(house => {
      const clears = new Set(homesFor(house).map(h => h.id));
      reachFor(house).forEach(home => {
        // In the household's reach, but not covered by what its members declared: shown for
        // what it is, rather than offered as something you can apply for.
        const into = clears.has(home.id) ? byHome : shortBy;
        if (!into.has(home.id)) into.set(home.id, house);
      });
    });
    const rows = data.homes.map(home => {
      const status = alone.has(home.id) ? 'alone' : byHome.has(home.id) ? 'together'
        : shortBy.has(home.id) ? 'short' : 'out';
      // A home you can take on your own is shown as yours alone, not as a household's.
      const house = status === 'alone' ? null : byHome.get(home.id) || shortBy.get(home.id) || null;
      // What size of household would put this home in range, if any?
      let needs = null;
      if (status === 'out') {
        for (let n = 2; n <= home.bedrooms; n++) {
          // Three people cannot share a Kralingen home however the rent divides.
          if (matching.sharingStatus(home, n) === 'permit-required') continue;
          if (mine.budget >= home.rent / n) { needs = n; break; }
        }
      }
      return { home, status, house, needs, share: home.rent / (house ? house.members.length : 1) };
    });
    // Most useful first: what you can take now, then what teaming up would open, then the
    // rest. Raw inventory order buries every actionable listing under twenty studios.
    const rank = e => (e.status === 'alone' ? 0 : e.status === 'together' ? 1
      : e.status === 'short' ? 2 : e.needs ? 3 : 4);
    return rows.sort((a, b) => rank(a) - rank(b) || a.home.rent - b.home.rent
      || a.home.id.localeCompare(b.home.id, undefined, { numeric: true }));
  }

  // Whether a home has been applied for, by the household that would take it or by you alone.
  // The application sheet turns into the hand-off once this is true.
  function applicationSent(homeId) {
    const row = listings().find(e => e.home.id === homeId);
    return DB.applied(row && row.house ? row.house.id : me().id, homeId);
  }

  /* A household going live is worth announcing — but a fixed, full-screen modal raised on a
     timer can land on a screen the user has already moved on to. So the modal is only raised
     where it makes sense, and everywhere else the news arrives as a line of text. */
  function announce(house, before) {
    const payload = { householdId: house.id, members: house.members.slice(),
      before, after: homesFor(house).length };
    /* A household everyone agreed to that reaches nothing is not a party: a full-screen
       "0 homes you can now apply for" looked broken. It is said plainly, with the reason. */
    if (!payload.after) {
      view.celebration = null;
      const clash = conflicts(house)[0];
      toast(`${nameOf(house)} is confirmed, but ${clash ? `${clashText(clash)}, so no home is open to all of you`
        : reachFor(house).length ? 'nothing in reach clears what you declared yet'
        : 'no home is in reach for your budgets yet'}.`);
      return;
    }
    if (view.route === 'roommates' || view.route === 'household') {
      view.celebration = payload;
    } else {
      view.celebration = null;
      toast(`${nameOf(house)} is ready: ${payload.after} home${payload.after === 1 ? '' : 's'} you can now apply for.`);
    }
  }

  /* ---------- actions ---------- */

  const toTop = () => { if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' }); };

  // What belongs to the moment rather than to the account: open sheets, the celebration, which
  // card was just joined, which menu is open. Not the toast: it confirms what you just did, and
  // its Undo has to survive you moving to another page while you read it.
  function clearTransient() {
    view.openProfile = view.openListing = view.celebration = null;
    view.justJoined = null;
    view.switching = view.notifying = false;
  }
  // And what belonged to the previous person, for when the person changes. Without this the
  // next account could open, and rename, a household it is not in.
  function clearPerson() {
    clearTransient();
    view.openHouse = view.openThread = view.openWhy = null;
    view.toast = null; undoable = null;
    view.people = 'workable'; view.shown = PAGE;
  }

  /* Feedback for an event is a toast. Where the action can be taken back it offers Undo, which
     beats asking "are you sure?" beforehand: the snapshot is the whole database, so Undo is
     exact, and it is refused once anything else has been written, because restoring then
     would silently throw that newer change away. */
  const PAGE = 12;
  let toastSeq = 0, undoable = null;
  function toast(text, snap) {
    view.toast = { id: ++toastSeq, text, undo: Boolean(snap) };
    undoable = snap ? { snap, after: DB.writes } : null;
  }
  // Undo is only offered while it would work: once anything else has been written, the button
  // goes, rather than staying on screen to be refused.
  const canUndo = () => Boolean(undoable && DB.writes === undoable.after);

  /* What happened while you were signed in as somebody else, in a sentence or two. Switching
     back to Alex after answering as Luca used to show nothing: the household had quietly
     filled, and the screen never said who had said yes. */
  function newsFor(id, since) {
    if (!since) return [];
    const news = [];
    const answered = status => DB.state.invites
      .filter(i => i.from === id && i.status === status && i.answered > since);
    const who = list => fmt.names(list.map(p => ({ name: shortName(p) })));
    // A household named after its people reads oddly as an object ("said yes to Alex & Luca"),
    // so here it is the search it is, unless someone has given it a name.
    const search = house => (house.name ? house.name : `your ${house.size}-bedroom search`);
    DB.householdsOf(id).forEach(house => {
      const joined = answered('accepted').filter(i => i.householdId === house.id).map(i => DB.profile(i.to));
      const left = (house.departures || []).filter(d => d.seq > since && d.id !== id).map(d => DB.profile(d.id));
      const ready = DB.isReady(house) && house.readyAt > since;
      const n = homesFor(house).length;
      const homes = `${n} home${n === 1 ? '' : 's'} to apply for`;
      if (joined.length && ready) news.push(`${who(joined)} said yes, and ${nameOf(house)} is ready with ${homes}.`);
      else if (joined.length) news.push(`${who(joined)} said yes to ${search(house)}.`);
      else if (ready) news.push(`${nameOf(house)} is ready, with ${homes}.`);
      if (left.length) news.push(`${who(left)} left ${search(house)}.`);
    });
    answered('declined').forEach(i => news.push(`${shortName(DB.profile(i.to))} declined your invitation.`));
    const from = new Map();
    Object.entries(DB.state.threads).forEach(([key, lines]) => {
      if (!key.split('|').includes(id)) return;
      lines.filter(m => m.from !== id && m.seq > since)
        .forEach(m => from.set(m.from, (from.get(m.from) || 0) + 1));
    });
    from.forEach((n, sender) => news.push(`${n === 1 ? 'A new message' : `${n} new messages`} from ${shortName(DB.profile(sender))}.`));
    return news;
  }

  // The people grid as a page: by default the people you could actually apply with, everyone on
  // request, a dozen at a time.
  function peopleGrid() {
    const all = candidates();
    const workable = all.filter(c => c.workable);
    const list = view.people === 'everyone' ? all : workable;
    return { list, shown: list.slice(0, view.shown), more: Math.max(0, list.length - view.shown),
      counts: { workable: workable.length, everyone: all.length } };
  }

  const actions = {
    repaint: notify,
    go(route) {
      view.route = route;
      // Leaving a screen closes what was open on it. The celebration used to survive this
      // (fixed, full-screen, locking the body), so the route changed underneath it and the app
      // looked frozen. The people grid starts from the top again.
      clearTransient();
      if (route !== 'messages') view.openThread = null;
      view.shown = PAGE;
      notify();
      toTop();
    },
    setFilter(f) { view.filter = f; notify(); },
    toggleSwitcher(on) { view.switching = on === undefined ? !view.switching : on; view.notifying = false; notify(); },
    toggleNotifications(on) { view.notifying = on === undefined ? !view.notifying : on; view.switching = false; notify(); },

    signIn(id) {
      const since = (DB.state.accounts[id] || {}).left;
      DB.signIn(id); clearPerson(); view.route = 'home';
      const news = newsFor(id, since);
      if (news.length) toast(`While you were away: ${news.slice(0, 3).join(' ')}`);
      notify(); toTop();
    },
    createAccount(id, patch) { DB.createAccount(id, patch); clearPerson(); view.route = 'profile'; notify(); toTop(); },
    setRoommateMode(on) {
      const mine = me().id;
      const snap = DB.snapshot();
      const left = on ? 0 : myHouseholds().length;
      if (!on) {
        // Hiding your profile while staying in households would leave you invisible but still
        // committed, and still seeing their listings. Leaving is the honest reading of "off".
        myHouseholds().forEach(h => DB.leaveHousehold(h.id, mine));
        DB.invitesTo(mine).forEach(i => DB.respond(i.id, 'declined'));
        view.route = 'profile';
      }
      DB.update(mine, { roommateMode: on });
      // Switching off takes you out of every household at once, so it is the one that most
      // needs a way back.
      if (!on && left) toast(`Roommate matching is off, and you left ${left} household${left === 1 ? '' : 's'}.`, snap);
      // Switching on is the moment people can find you, and some already have.
      const askers = on ? new Set(DB.invitesTo(mine).map(i => i.from)).size : 0;
      if (askers) {
        toast(`You are visible to other searchers now. ${askers === 1 ? 'Someone has'
          : `${askers} people have`} already asked to team up: see the bell, top right.`);
      }
      notify();
    },
    editMe(patch) { DB.update(me().id, patch); notify(); },
    editLifestyle(key, value) {
      // Re-picking the option already chosen is a no-op, so it does not get written.
      if (me().lifestyle[key] === value) return;
      DB.update(me().id, { lifestyle: { [key]: value } });
      notify();
    },

    openProfile(id) { view.openProfile = id; notify(); },
    skip(id) {
      // Recorded so they stop being suggested — and nothing else. It used to create a
      // household just to have something to attach the decline to.
      const snap = DB.snapshot();
      DB.decline(me().id, id);
      clearTransient();
      toast(`${DB.profile(id).name} will not be suggested to you again.`, snap);
      notify();
    },
    /* An invitation is always for a household, so the recipient knows what size of place they
       are being asked into. Several can be picked at once — two sizes is a thing you say once,
       not two trips through the sheet — and "new" starts one at the size picked. */
    sendInvite(id, picks, message, legacyMessage) {
      // Also accepts the single-household form, sendInvite(id, householdId, size, message).
      const chosen = Array.isArray(picks)
        ? picks.filter(Boolean)
        : [{ id: picks, size: message }];
      const text = Array.isArray(picks) ? message : legacyMessage;
      const snap = DB.snapshot();
      const sentTo = [];
      chosen.forEach(pick => {
        const house = pick.id === 'new'
          ? DB.createHousehold(me().id, Number(pick.size) || 2)
          : DB.householdById(pick.id);
        // A place someone has already been asked into is promised, so it is not offered twice.
        if (!house || freePlaces(house) < 1) return;
        if (DB.invite(me().id, id, house.id, text)) sentTo.push(house);
      });
      clearTransient();
      view.route = 'roommates';
      // Saying so is the whole fix: the person vanishes from the grid, so without this
      // nothing on screen acknowledges that anything happened.
      if (sentTo.length) {
        toast(`Invitation sent to ${DB.profile(id).name}, for ${fmt.names(sentTo.map(h => ({ name: nameIn(h) })))}.`, snap);
        // The screen shows where it went: the households it was for, with their new name tag.
        view.flourish = { kind: 'invited', personId: id, householdIds: sentTo.map(h => h.id) };
      } else {
        toast('Nothing was sent. Pick at least one household with a place free.');
      }
      notify();
    },
    withdrawInvite(inviteId) {
      const snap = DB.snapshot(), before = DB.writes;
      const invite = DB.withdraw(inviteId);
      // DB.withdraw hands the invitation back whether or not it was still open; whether
      // anything was written is the honest test of whether it was withdrawn.
      if (!invite) toast('That invitation no longer exists.');
      else if (DB.writes === before) toast(`${DB.profile(invite.to).name} has already answered that invitation.`);
      else toast(`Invitation to ${DB.profile(invite.to).name} withdrawn.`, snap);
      notify();
    },
    // Through go(), so whatever was open closes: "Edit it" on the application sheet used to
    // open the household underneath the sheet, which then covered the letter.
    openHousehold(id) { view.openHouse = id; actions.go('household'); },
    rename(householdId, name) { DB.rename(householdId, name, me().id); },
    declare(householdId, patch) { DB.declare(householdId, me().id, patch); notify(); },
    setLetter(householdId, text) { DB.setLetter(householdId, text, me().id); },
    tick(householdId, key, on) { DB.tick(householdId, me().id, key, on); notify(); },
    respondInvite(inviteId, status) {
      const stored = DB.state.invites.find(i => i.id === inviteId);
      const wasOpen = Boolean(stored && stored.status === 'pending');
      const snap = DB.snapshot();
      const invite = DB.respond(inviteId, status);
      clearTransient();
      if (!invite) {
        toast('That invitation no longer exists.');
      } else if (!wasOpen) {
        // Withdrawn, or answered in another tab, while the bell was still showing it.
        toast('That invitation is no longer open. It was withdrawn or already answered.');
      } else if (status === 'declined') {
        toast(`You declined ${DB.profile(invite.from).name}’s invitation.`, snap);
      } else if (invite.status === 'full') {
        // The place may have gone while the invitation sat there. Say so rather than
        // reporting success and quietly not adding them.
        toast('That household filled up before you answered.');
      } else if (invite.status === 'gone') {
        toast('That household no longer exists.');
      } else {
        /* Landing in a chat meant the household you had just joined was never shown. You stay
           where the households are, with the one you joined pulled to the top. */
        const house = DB.householdById(invite.householdId);
        view.route = 'roommates';
        view.openThread = null;
        view.justJoined = invite.householdId;
        view.flourish = { kind: 'join', householdId: invite.householdId };
        if (house) toast(`You joined ${nameIn(house)}. Confirm your place to make it live.`);
      }
      notify();
    },
    undo() {
      if (!undoable || DB.writes !== undoable.after) {
        undoable = null;
        toast('That can no longer be undone, because something has changed since.');
      } else {
        DB.restore(undoable.snap);
        undoable = null;
        toast('Undone.');
      }
      notify();
    },
    // Dismissing a particular toast only if it is still the one showing, so a timer that fires
    // late never closes a newer one.
    dismissToast(id) {
      if (id && (!view.toast || view.toast.id !== id)) return;
      view.toast = null; undoable = null;
      notify();
    },
    setPeople(mode) { view.people = mode === 'everyone' ? 'everyone' : 'workable'; view.shown = PAGE; notify(); },
    showMore() { view.shown += PAGE; notify(); },
    openThread(id) { view.openThread = id; actions.go('messages'); },
    say(to, text) {
      if (!text.trim()) return;
      // Captured now: if you switch accounts in the next second, the reply still goes to the
      // person who wrote, not to whoever happens to be signed in when it arrives.
      const mine = me().id, at = epoch, said = text.trim();
      DB.say(mine, to, said);
      notify();
      // They answer a moment later, so a conversation is possible before anyone commits.
      setTimeout(() => {
        if (at !== epoch) return;
        const line = reply(to, DB.thread(mine, to).length, mine, said);
        if (!line) return;
        DB.say(to, mine, line.text);
        // A household waiting only on them: they confirm as they say so, the same way the
        // others answer a moment after you confirm. Re-read, since it may have changed.
        const live = line.confirm && DB.householdById(line.confirm);
        if (live && live.members.includes(to) && live.members.includes(mine)) {
          const before = homesFor(live).length;
          DB.confirmHousehold(live.id, to);
          if (DB.isReady(live) && me().id === mine) announce(live, before);
        }
        notify();
      }, 950);
    },

    /* "We might also look for a third" — without rebuilding the group by hand. */
    alsoSearch(householdId, size) {
      const snap = DB.snapshot();
      const clone = DB.cloneHousehold(householdId, size, me().id);
      clearTransient();
      view.route = 'roommates';
      if (!clone) {
        // Each reason it can refuse, said as itself.
        const source = DB.householdById(householdId);
        toast(!source || !source.members.includes(me().id) ? 'That household no longer exists.'
          : myHouseholds().some(h => h.size === Number(size)) ? `You already run a ${size}-bedroom search.`
          : `A ${size}-bedroom is too small for everyone in ${nameIn(source)}.`);
      } else {
        const asked = DB.invitesFor(clone.id).map(i => DB.profile(i.to));
        view.justJoined = clone.id;
        toast(asked.length
          ? `Started a ${size}-bedroom search with the same plan. ${fmt.names(asked)} ${
              asked.length === 1 ? 'has' : 'have'} been invited to it too.`
          : `Started a ${size}-bedroom search.`, snap);
      }
      notify();
      toTop();
    },

    startHousehold(size) {
      const wanted = Number(size);
      clearTransient();
      view.route = 'roommates';
      // One household per size: the button is disabled for sizes you run, and this holds the
      // same line for anything that calls it directly.
      if (myHouseholds().some(h => h.size === wanted)) {
        toast(`You already run a ${wanted}-bedroom search.`);
      } else {
        DB.createHousehold(me().id, wanted);
      }
      notify();
    },
    /* Confirming is the commitment, and it is what unlocks homes — but only when the
       household is also full. Confirming into a half-empty one changes nothing yet, which is
       honest: two people cannot rent a three-bedroom. */
    confirmHousehold(householdId) {
      const mine = me().id, at = epoch;
      const house = DB.householdById(householdId);
      if (!house) return;
      const before = homesFor(house).length;
      DB.confirmHousehold(house.id, mine);
      // "Confirm your place to make it live" is done now; leaving it up contradicts the card.
      view.toast = null; undoable = null;
      // Everyone else answers a moment later, so the card visibly completes.
      const others = house.members.filter(m => m !== mine && !house.confirmedBy.includes(m));
      if (others.length) {
        setTimeout(() => {
          if (at !== epoch) return;
          // Re-read it: in that second it may have been left, or someone else signed in.
          const live = DB.householdById(householdId);
          if (!live) return;
          others.forEach(m => DB.confirmHousehold(live.id, m));
          if (DB.isReady(live) && live.members.includes(mine) && me().id === mine) announce(live, before);
          notify();
        }, 1100);
      } else if (DB.isReady(house)) {
        announce(house, before);
      }
      notify();
    },
    leaveHousehold(householdId) {
      if (view.celebration && view.celebration.householdId === householdId) view.celebration = null;
      if (view.justJoined === householdId) view.justJoined = null;
      const house = DB.householdById(householdId);
      const snap = DB.snapshot();
      const name = house ? nameIn(house) : 'the household';
      DB.leaveHousehold(householdId, me().id);
      // Leaving used to be one click with no way back. Undo makes it safe without an
      // "are you sure?" in front of every other click.
      if (house) toast(`You left ${name}.`, snap);
      notify();
    },
    /* Closing a modal — the ✕, the backdrop, Escape — only closes it. It used to share the
       celebration's "See the listings" path, so dismissing it moved you to another page. */
    closeOverlay() {
      view.openProfile = view.openListing = view.celebration = null;
      notify();
    },
    dismissCelebration() {
      view.celebration = null;
      view.route = 'listings';
      notify();
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' });
    },

    applyTo(homeId) { view.openListing = homeId; notify(); },
    toggleWhy(homeId) { view.openWhy = view.openWhy === homeId ? null : homeId; notify(); },
    confirmApplication(homeId) {
      const row = listings().find(e => e.home.id === homeId);
      DB.apply(row && row.house ? row.house.id : me().id, homeId);
      notify();
    },

    reset() {
      // In front of an audience the footer link is one stray click from wiping the run-through,
      // so a reset can be taken back like everything else.
      const snap = DB.snapshot();
      DB.reset();
      epoch++;
      clearPerson();
      view.route = 'home';
      view.filter = 'all';
      toast('Everything is back to the start.', snap);
      notify();
      toTop();
    }
  };

  /* What the other person says back. Canned, but about where the two of you actually stand:
     the old opener asked "what are you looking for?" of someone already in your household,
     whatever you had written. A day you mention is answered first. */
  const WHEN = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|this week|next week|weekend)\b/i;
  function reply(id, turn, mine, text) {
    const person = DB.profile(id);
    const day = String(text || '').match(WHEN);
    const lead = !day ? '' : /weekend/i.test(day[0]) ? 'The weekend works for me. '
      : `${day[0][0].toUpperCase()}${day[0].slice(1).toLowerCase()} works for me. `;
    const say = (line, confirm) => ({ text: lead + line, confirm });
    const shared = DB.householdsOf(mine).filter(h => h.members.includes(id));
    const house = shared.find(DB.isReady) || shared[0];
    if (!house) {
      return turn <= 2
        ? say(`Good to hear from you. I can go up to ${fmt.euros(person.budget)} a month. What are you looking for?`)
        : say('Sounds good. Which places are you looking at?');
    }
    if (conflicts(house).length) return say(`I am not sure ${nameIn(house)} works for all of us. ${clashText(conflicts(house)[0])}.`);
    if (DB.isReady(house)) {
      // A real home: one you have applied for together, or the first you could.
      const applied = DB.state.applications.filter(a => a.householdId === house.id)
        .map(a => data.homes.find(h => h.id === a.homeId)).filter(Boolean);
      const home = applied[0] || homesFor(house)[0];
      if (!home) return say('We are all confirmed, but nothing clears what we declared yet. Shall we look at the household page together?');
      return applied.length
        ? say(`Fingers crossed for ${home.street}. I can do viewings most evenings.`)
        : say(`We are all set. ${home.street} would be ${fmt.euros(home.rent / house.members.length)} each. Shall we apply?`);
    }
    const short = DB.openSlots(house);
    if (short) return say(`I am in. We still need ${short} more for the ${house.size}-bedroom.`);
    const waiting = house.members.filter(m => !house.confirmedBy.includes(m));
    if (waiting.includes(mine)) return say('Confirm your place and I will do the same.');
    if (waiting.includes(id)) return say('Just confirmed my place.', house.id);
    return say('We are only waiting on the others to confirm now.');
  }

  const api = {
    view, actions, DB,
    me, myHouseholds, readyHouseholds, membersOf, reachFor,
    nameOf, nameIn, defaultName, shortName, sizeLabel, needsSizeChip, siblingsOf, names: fmt.names,
    clashText, fitWith, newsFor, canUndo,
    homesFor, declaredIncome, freePlaces, alsoSizesFor,
    reachableAlone, pooledBudget, pooledIncome,
    candidates, blockers, listings, conflicts, peopleGrid, canSearchTogether, applicationSent,
    pendingFor, declared, declarations, ceiling, letterFor, ticked, allTicked, CHECKS,
    subscribe(fn) { listeners.push(fn); },
    // Read once: the screen takes the hint, and it is gone.
    takeFlourish() { const hint = view.flourish; view.flourish = null; return hint; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DemoStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
