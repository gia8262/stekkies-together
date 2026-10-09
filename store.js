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
     and falls back to the people in it rather than to its size. */
  const firstName = person => String(person.name || '').split(/[\s,]+/)[0];
  function defaultName(house) {
    const first = membersOf(house).filter(Boolean).map(firstName);
    if (first.length > 1) return `${first.slice(0, -1).join(', ')} & ${first[first.length - 1]}`;
    // One person is named from where the reader stands: yours, or theirs. Every invitation in
    // a fresh bell used to call the sender's household "Your 2-bedroom search".
    const owner = DB.profile(house.members[0]);
    return !owner || owner.id === me().id
      ? `Your ${house.size}-bedroom search`
      : `${firstName(owner)}’s ${house.size}-bedroom search`;
  }
  const nameOf = house => (house && house.name ? house.name : house ? defaultName(house) : '');
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

  /* Two people you invited separately can still be wrong for each other, which makes a
     household that is full and agreed but reaches nothing. Name them rather than showing a
     cheerful "Ready" above a zero. */
  function conflicts(house) {
    const people = membersOf(house), clashes = [];
    people.forEach((p, i) => people.slice(i + 1).forEach(o => {
      if (!matching.mutuallySuitable(p, o)) clashes.push([p, o]);
    }));
    return clashes;
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

    signIn(id) { DB.signIn(id); clearPerson(); view.route = 'home'; notify(); toTop(); },
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
        toast(`Invitation sent to ${DB.profile(id).name}: ${fmt.names(sentTo.map(h => ({ name: nameOf(h) })))}.`, snap);
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
        if (house) toast(`You joined ${nameOf(house)}. Confirm your place to make it live.`);
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
      const mine = me().id, at = epoch;
      DB.say(mine, to, text.trim());
      notify();
      // They answer a moment later, so a conversation is possible before anyone commits.
      setTimeout(() => {
        if (at !== epoch) return;
        const line = reply(to, DB.thread(mine, to).length, mine);
        if (line) { DB.say(to, mine, line); notify(); }
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
          : `A ${size}-bedroom is too small for everyone in ${nameOf(source)}.`);
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
      const name = house ? nameOf(house) : 'the household';
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
      DB.reset();
      epoch++;
      clearPerson();
      view.route = 'home';
      view.filter = 'all';
      notify();
      toTop();
    }
  };

  function reply(id, turn, mine) {
    const person = DB.profile(id);
    const shared = DB.householdsOf(mine).find(h => h.members.includes(id));
    if (turn <= 2) return `Good to hear from you. I can go up to ${fmt.euros(person.budget)} a month — what are you looking for?`;
    if (turn <= 4) {
      if (!shared) return 'Sounds good. Which places are you looking at?';
      const short = DB.openSlots(shared);
      return short
        ? `Works for me. We still need ${short} more for a ${shared.size}-bedroom, but I am in.`
        : `Works for me — that is the ${shared.size}-bedroom full. Confirm and I will too.`;
    }
    if (turn <= 6) return 'Confirm your side and I will do the same.';
    return 'Sounds good 👍';
  }

  const api = {
    view, actions, DB,
    me, myHouseholds, readyHouseholds, membersOf, reachFor,
    nameOf, defaultName, sizeLabel, needsSizeChip, siblingsOf, names: fmt.names,
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
