/* A simulated database, so the demo has two sides.

   Everything a real backend would hold lives here: accounts, invitations, conversations and
   households. It persists to localStorage, which is what lets you send an invitation as one
   person, switch accounts, and find it waiting as the other. Storage can be unavailable or
   throw (private windows, blocked site data), so every access is guarded and the app falls
   back to memory rather than breaking. */
(function (root) {
  'use strict';
  const data = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.DemoData;

  const KEY = 'stekkies.demo.v1';
  // Declared up here because the migration runs while the store is still loading.
  const base = id => data.tenants.find(person => person.id === id);
  const SCHEMA = 2;   // 2 added a size, a name, a letter, declarations and a checklist to a household
  const pairKey = (a, b) => [a, b].sort().join('|');
  // Ids built from the clock alone collided within a millisecond — withdraw and re-invite, or
  // delete and recreate a household — and a lookup then found the old record. A counter
  // breaks the tie; the clock keeps ids unique across reloads.
  let seq = 0;
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}`;

  let store = null;        // in-memory fallback, and the live copy
  let canPersist = true;
  // Every write counts, persisted or not, so an Undo can tell whether anything has changed
  // since the action it would reverse.
  let writes = 0;

  function blank() {
    return {
      version: SCHEMA,
      currentUser: data.focalTenant.id,
      accounts: {},
      invites: [],
      threads: {},
      households: [],
      applications: []
    };
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version >= 1 && parsed.version <= SCHEMA) return migrate(parsed);
      }
    } catch (error) {
      canPersist = false;
    }
    return seed(blank());
  }

  /* A browser that opened this demo before households had a size still holds those records,
     and the version number alone did not catch it: the title read "undefined-bedroom
     household", open slots came out NaN, and the household could never become ready or reach
     a single home. Repairing beats discarding — somebody's household survives the upgrade —
     and every field the current code reads is filled in whether or not the version says so. */
  function migrate(state) {
    const safe = { ...blank(), ...state, version: SCHEMA };
    safe.accounts = safe.accounts || {};
    safe.threads = safe.threads || {};
    safe.invites = Array.isArray(safe.invites) ? safe.invites : [];
    safe.applications = Array.isArray(safe.applications) ? safe.applications : [];
    safe.households = (Array.isArray(safe.households) ? safe.households : [])
      .filter(h => h && h.id && Array.isArray(h.members))
      .map(h => {
        const members = h.members.filter(id => base(id));
        const size = Number(h.size);
        return {
          ...h,
          members,
          // A household must hold at least the people already in it, and at least two.
          size: Number.isFinite(size) && size >= members.length && size >= 2
            ? size : Math.max(2, members.length),
          confirmedBy: (Array.isArray(h.confirmedBy) ? h.confirmedBy : []).filter(id => members.includes(id)),
          name: typeof h.name === 'string' ? h.name : '',
          letter: typeof h.letter === 'string' ? h.letter : '',
          finances: h.finances && typeof h.finances === 'object' ? h.finances : {},
          checklist: h.checklist && typeof h.checklist === 'object' ? h.checklist : {},
          at: h.at || Date.now()
        };
      })
      .filter(h => h.members.length);
    // An invitation into a household that no longer exists is not an invitation.
    const live = new Set(safe.households.map(h => h.id));
    safe.invites = safe.invites.filter(i => i && i.id && base(i.from) && base(i.to))
      .map(i => (i.status === 'pending' && i.householdId && !live.has(i.householdId)
        ? { ...i, status: 'gone' } : i));
    safe.applications = safe.applications.filter(a => a && live.has(a.householdId));
    if (!base(safe.currentUser)) safe.currentUser = data.focalTenant.id;
    return safe;
  }

  function save() {
    writes++;
    if (!canPersist) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(store));
    } catch (error) {
      canPersist = false;
    }
  }

  /* People who were already looking before you arrived. Without these your inbox is empty on
     a fresh install and there is nobody to accept your first invitation. */
  function seed(fresh) {
    // Each of them is already looking for a particular size of place, so the invitation says
    // which. A spread of 2s, 3s and 4s makes the parallel-household idea visible immediately.
    const sizes = [2, 3, 2, 4, 3, 2, 3, 4];
    data.tenants.filter(person => person.likesYou).forEach((person, index) => {
      fresh.accounts[person.id] = { id: person.id, roommateMode: true };
      const house = {
        id: `h-seed-${person.id}`,
        size: sizes[index % sizes.length],
        name: '',
        members: [person.id],
        confirmedBy: [person.id],
        letter: '',
        finances: {},
        checklist: {},
        at: Date.now()
      };
      fresh.households.push(house);
      fresh.invites.push({
        id: `i-${person.id}`,
        from: person.id,
        to: data.focalTenant.id,
        householdId: house.id,
        message: openingLine(person, index),
        status: 'pending',
        at: Date.now()
      });
    });
    return fresh;
  }

  /* Opening lines that say something true about the two of you. Eight identical greetings
     read as a mail merge, which is exactly what a roommate feature cannot afford to look
     like. Chosen by index, so they are fixed per person. */
  function openingLine(person, i) {
    const me = data.focalTenant;
    const same = key => person.lifestyle[key] === me.lifestyle[key];
    const area = person.districts.find(d => me.districts.includes(d));
    const options = [];
    if (same('routine') && person.lifestyle.routine === 'early') {
      options.push('Hi! Another early riser — mine is the only light on at seven. Fancy looking at places together?');
    }
    if (same('routine') && person.lifestyle.routine === 'late') {
      options.push('Hey! I saw we are both night people. Might save us both an argument. Want to team up?');
    }
    if (same('cleanliness') && person.lifestyle.cleanliness === 'tidy') {
      options.push('Hi! We both want a kitchen that stays usable, which already puts us ahead. Interested?');
    }
    if (same('sociability') && person.lifestyle.sociability === 'social') {
      options.push('Hi! I would like a house where people actually eat together. Sounds like you would too?');
    }
    if (same('sociability') && person.lifestyle.sociability === 'quiet') {
      options.push('Hi — I am after somewhere calm on weeknights, same as you by the look of it. Shall we look together?');
    }
    if (area) {
      options.push(`Hi! I am searching ${area} too and getting nowhere on my own. Want to pool budgets?`);
    }
    options.push(`Hi! Our budgets are close enough to share something decent. ${euroish(person.budget + me.budget)} between us opens up a lot more. Interested?`);
    options.push('Hi! Nothing in my price range on my own. Two of us and suddenly there is a list. Up for it?');
    return options[i % options.length];
  }

  const euroish = n => '\u20ac' + n.toLocaleString('en-IE');

  store = (typeof window !== 'undefined') ? load() : seed(blank());

  /* ---------- reading ---------- */

  // A profile is the seeded person with any account edits laid over the top.
  function profile(id) {
    const person = base(id);
    if (!person) return null;
    const account = store.accounts[id] || {};
    return {
      ...person,
      ...account,
      lifestyle: { ...person.lifestyle, ...(account.lifestyle || {}) },
      bio: account.bio !== undefined ? account.bio : person.bio,
      roommateMode: Boolean(account.roommateMode)
    };
  }

  // Storage can name a user who no longer exists (edited by hand, an older save). Falling
  // back beats every screen reading `me().id` off null.
  const me = () => profile(store.currentUser) || profile(data.focalTenant.id);
  const hasAccount = id => Boolean(store.accounts[id]);

  const invitesTo = id => store.invites.filter(i => i.to === id && i.status === 'pending');
  const invitesFrom = id => store.invites.filter(i => i.from === id && i.status === 'pending');

  // Two people are connected once an invitation between them has been accepted — or once
  // they share a household. In a household of three, the member who joined last never
  // exchanged an invitation with the first, and "Message them" opened somebody else's thread.
  function connections(id) {
    const viaInvites = store.invites
      .filter(i => i.status === 'accepted' && (i.from === id || i.to === id))
      .map(i => (i.from === id ? i.to : i.from));
    const viaHouseholds = store.households
      .filter(h => h.members.includes(id))
      .flatMap(h => h.members.filter(m => m !== id));
    return [...new Set([...viaInvites, ...viaHouseholds])];
  }

  const thread = (a, b) => store.threads[pairKey(a, b)] || [];
  // The invitations a household is waiting on — what lets a card show an open place as
  // "invited" rather than as an identical blank.
  const invitesFor = householdId =>
    store.invites.filter(i => i.householdId === householdId && i.status === 'pending');

  /* You can run several households at once, and that is the point rather than an edge case:
     a household of two can only take a two-bedroom home and a household of three only a
     three-bedroom one, so the two cover different parts of the market. Keeping both alive
     is how a searcher stops betting everything on one apartment size. */
  const householdsOf = id => store.households.filter(h => h.members.includes(id));
  const householdById = hid => store.households.find(h => h.id === hid) || null;
  const isFull = h => h && h.members.length >= h.size;
  const isConfirmed = h => h && h.members.every(m => h.confirmedBy.includes(m));
  const isReady = h => isFull(h) && isConfirmed(h);
  const openSlots = h => (h ? Math.max(0, h.size - h.members.length) : 0);

  /* ---------- writing ---------- */

  const api = {
    get state() { return store; },
    get persists() { return canPersist; },
    get writes() { return writes; },
    // The whole database is a few kilobytes, so a snapshot of all of it makes Undo exact.
    snapshot() { return JSON.stringify(store); },
    restore(snap) { store = JSON.parse(snap); save(); },
    profile, me, base, hasAccount, migrate,
    invitesTo, invitesFrom, invitesFor, connections, thread, pairKey,
    householdsOf, householdById, isFull, isConfirmed, isReady, openSlots,

    signIn(id) {
      if (!store.accounts[id]) store.accounts[id] = { id, roommateMode: true };
      store.currentUser = id;
      save();
    },

    // Creating an account takes over one of the seeded searchers, which is how a second person
    // can exist without inventing a profile the matcher has never seen.
    createAccount(id, patch) {
      store.accounts[id] = { id, roommateMode: true, ...patch };
      store.currentUser = id;
      save();
    },

    update(id, patch) {
      const account = store.accounts[id] || { id };
      store.accounts[id] = { ...account, ...patch,
        lifestyle: { ...(account.lifestyle || {}), ...(patch.lifestyle || {}) } };
      save();
    },

    /* An invitation is always for a specific household, so the recipient knows whether they
       are being asked into a two- or a three-bedroom before they answer. Two invitations
       between the same pair are therefore fine, as long as they are for different
       households. */
    invite(from, to, householdId, message) {
      if (from === to) return null;
      // Only a live invitation is reused. Handing back a withdrawn one meant inviting someone
      // again after withdrawing created nothing, while the screen said it had been sent.
      const existing = store.invites.find(i => i.householdId === householdId && i.status === 'pending'
        && ((i.from === from && i.to === to) || (i.from === to && i.to === from)));
      if (existing) return existing;
      const invite = { id: uid(`i-${from}-${to}`),
        from, to, householdId, message, status: 'pending', at: Date.now() };
      store.invites.push(invite);
      if (!store.accounts[to]) store.accounts[to] = { id: to, roommateMode: true };
      save();
      return invite;
    },

    /* Recording a decline without ever inviting. It carries no household, because saying
       "not for me" should not quietly create a 2-bedroom you never asked for. */
    decline(from, to) {
      if (from === to) return null;
      const existing = store.invites.find(i => i.status === 'pending'
        && ((i.from === from && i.to === to) || (i.from === to && i.to === from)));
      if (existing) { existing.status = 'declined'; save(); return existing; }
      const note = { id: uid(`d-${from}-${to}`), from, to, householdId: null,
        message: '', status: 'declined', at: Date.now() };
      store.invites.push(note);
      save();
      return note;
    },

    // Taking back an invitation you sent, so the place is genuinely free again.
    withdraw(inviteId) {
      const invite = store.invites.find(i => i.id === inviteId);
      if (invite && invite.status === 'pending') { invite.status = 'withdrawn'; save(); }
      return invite;
    },

    respond(inviteId, status) {
      const invite = store.invites.find(i => i.id === inviteId);
      if (!invite) return null;
      // An invitation withdrawn while the bell was still open must not be accepted anyway.
      if (invite.status !== 'pending') return invite;
      invite.status = status;
      if (status === 'accepted') {
        const house = householdById(invite.householdId);
        // Someone else may have taken the last place, or the household may be gone. Saying so
        // beats reporting success and quietly not adding them.
        if (!house) { invite.status = 'gone'; save(); return invite; }
        if (!house.members.includes(invite.to) && isFull(house)) {
          invite.status = 'full'; save(); return invite;
        }
        const key = pairKey(invite.from, invite.to);
        store.threads[key] = store.threads[key] || [];
        // The invitation message becomes the first thing in the conversation.
        if (!store.threads[key].length && invite.message) {
          store.threads[key].push({ from: invite.from, text: invite.message, at: invite.at });
        }
        // Joining is not agreeing: they are in the household but not yet confirmed, which is
        // what leaves room to talk first.
        if (!house.members.includes(invite.to)) house.members.push(invite.to);
      }
      save();
      return invite;
    },

    say(from, to, text) {
      const key = pairKey(from, to);
      store.threads[key] = store.threads[key] || [];
      store.threads[key].push({ from, text, at: Date.now() });
      save();
    },

    /* A household is created for a target apartment size and then filled. The creator is in
       it and has agreed by definition; everyone else joins by accepting an invitation to
       that specific household. */
    createHousehold(ownerId, size) {
      const house = {
        id: uid('h'),
        size,
        name: '',
        members: [ownerId],
        confirmedBy: [ownerId],
        // Shared by everyone in it: one letter, and one declaration per member.
        letter: '',
        finances: {},
        checklist: {},
        at: Date.now()
      };
      store.households.push(house);
      save();
      return house;
    },

    /* Searching at two sizes meant building the second household by hand and re-inviting
       everyone already in the first. This does both: a sibling at the new size, with an
       invitation out to everyone involved in the first — members, and the people you have
       asked who have not answered yet. */
    cloneHousehold(householdId, size, ownerId) {
      const source = householdById(householdId);
      if (!source || !source.members.includes(ownerId)) return null;
      const wanted = Number(size);
      if (!Number.isFinite(wanted) || wanted < 2) return null;
      // One household per size is the model, so a size you already run is not cloned again.
      if (householdsOf(ownerId).some(h => h.size === wanted)) return null;
      const involved = [...new Set([...source.members, ...invitesFor(source.id).map(i => i.to)])];
      // Three people cannot share a two-bedroom, so the plan cannot shrink below its people.
      if (wanted < involved.length) return null;

      const clone = api.createHousehold(ownerId, wanted);
      clone.name = source.name;
      involved
        .filter(id => id !== ownerId)
        .forEach(id => api.invite(ownerId, id, clone.id, `Same plan, as a ${wanted}-bedroom.`));
      save();
      return clone;
    },

    addToHousehold(householdId, personId) {
      const house = householdById(householdId);
      if (!house || house.members.includes(personId) || isFull(house)) return house;
      house.members.push(personId);
      save();
      return house;
    },

    /* A household you can name is a household you recognise. Blank means "use the default",
       so clearing the box restores it rather than leaving an untitled card. Only a member can
       rename it. */
    rename(householdId, name, by) {
      const house = householdById(householdId);
      if (!house || !house.members.includes(by)) return null;
      house.name = String(name || '').slice(0, 48);
      save();
      return house;
    },

    /* How a member covers the rent. Only they can set it — you cannot declare someone else's
       salary — and the combined figure an application is judged on is the sum of these. */
    declare(householdId, personId, patch) {
      const house = householdById(householdId);
      if (!house || !house.members.includes(personId)) return null;
      house.finances = house.finances || {};
      house.finances[personId] = { ...(house.finances[personId] || {}), ...patch };
      save();
      return house;
    },

    setLetter(householdId, text, by) {
      const house = householdById(householdId);
      if (!house || !house.members.includes(by)) return null;
      house.letter = text;
      house.letterBy = by;
      save();
      return house;
    },

    tick(householdId, personId, key, on) {
      const house = householdById(householdId);
      if (!house || !house.members.includes(personId)) return null;
      house.checklist = house.checklist || {};
      house.checklist[personId] = { ...(house.checklist[personId] || {}), [key]: on };
      save();
      return house;
    },

    confirmHousehold(householdId, personId) {
      const house = householdById(householdId);
      if (house && house.members.includes(personId) && !house.confirmedBy.includes(personId)) {
        house.confirmedBy.push(personId);
        save();
      }
      return house;
    },

    // Leaving empties the household rather than leaving a stale one behind when the last
    // member walks out.
    leaveHousehold(householdId, personId) {
      const house = householdById(householdId);
      if (!house) return;
      house.members = house.members.filter(m => m !== personId);
      house.confirmedBy = house.confirmedBy.filter(m => m !== personId);
      if (!house.members.length) {
        // Nobody left: the household goes, and every invitation into it says so.
        store.households = store.households.filter(h => h.id !== house.id);
        store.applications = store.applications.filter(a => a.householdId !== house.id);
        store.invites.forEach(i => { if (i.householdId === house.id && i.status === 'pending') i.status = 'gone'; });
      } else {
        // It carries on without them, so invitations to or from them go. One they sent would
        // otherwise sit on the others' card as somebody they never asked and cannot withdraw.
        store.invites.forEach(i => {
          if (i.householdId === house.id && i.status === 'pending'
            && (i.to === personId || i.from === personId)) i.status = 'withdrawn';
        });
      }
      save();
    },

    apply(householdId, homeId) {
      if (!store.applications.some(a => a.householdId === householdId && a.homeId === homeId)) {
        store.applications.push({ householdId, homeId, at: Date.now() });
      }
      save();
    },
    applied(householdId, homeId) {
      return store.applications.some(a => a.householdId === householdId && a.homeId === homeId);
    },

    reset() {
      store = seed(blank());
      try { window.localStorage.removeItem(KEY); } catch (error) { /* nothing to clear */ }
      save();
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DemoDB = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
