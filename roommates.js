/* The roommates screen: your households first, then people to fill them.
   Invitations live in the top-bar bell, not here — they used to push the grid off-screen. */
const DemoRoommates = (() => {
  'use strict';
  const { esc, euros, avatar, monthName } = DemoFormat;
  const S = DemoStore, DB = DemoStore.DB;
  const ATTRS = [
    ['smoking', 'Smoking'], ['cleanliness', 'Cleanliness'],
    ['routine', 'Daily routine'], ['sociability', 'Sociability']
  ];
  const SIZES = [2, 3, 4];
  // The name a person shows, "Mina B.", never a bare first name that two people share.
  const called = S.shortName;

  /* ---------- households ---------- */

  /* The doorbell plate. Every shared house in the Netherlands has one by the front door: a
     name tag per room. Here it is the household itself, one tag per bedroom, filling as
     people join. The round bell beside each name lights up once that person has confirmed,
     so "everyone has agreed" reads as a panel of lit bells rather than a sentence.

     A place with an invitation out never looks like an empty one: that is exactly what made
     sending an invitation feel like nothing had happened. */
  function plate(house, size = 26) {
    const people = S.membersOf(house);
    // Never more tags than the household has rooms, whatever older stored data holds.
    const pending = S.pendingFor(house).slice(0, DB.openSlots(house));
    const free = S.freePlaces(house);
    const me = S.me().id;
    const tag = (person, state) => {
      const confirmed = state === 'member' && house.confirmedBy.includes(person.id);
      const said = state === 'invited' ? 'invited, has not answered yet'
        : confirmed ? 'confirmed' : 'not confirmed yet';
      return `<li class="nametag nametag-${state}${confirmed ? ' is-lit' : ''}"
          data-person-tag="${person.id === me ? 'me' : person.id}">
        <span class="doorbell" aria-hidden="true"></span>
        ${avatar(person, size)}
        <span class="nametag-text">
          <span class="nametag-name">${esc(called(person))}${person.id === me ? ' <small>(you)</small>' : ''}</span>
          ${state === 'invited' ? '<small class="nametag-note" aria-hidden="true">invited</small>' : ''}
        </span>
        <span class="visually-hidden">, ${said}</span>
      </li>`;
    };
    return `<ul class="plate plate-${house.size}" aria-label="${house.size} rooms">
      ${people.map(p => tag(p, 'member')).join('')}
      ${pending.map(({ person }) => tag(person, 'invited')).join('')}
      ${Array.from({ length: free }, () => `<li class="nametag nametag-free">
        <span class="doorbell" aria-hidden="true"></span><span class="nametag-name">Free room</span></li>`).join('')}
    </ul>`;
  }

  /* Where a household stands, in one line, and the one thing to do about it. Every other move
     lives in the card's menu, which is what stopped the card reading as a control panel. */
  function standing(house) {
    const people = S.membersOf(house);
    const me = S.me().id;
    const clash = S.conflicts(house)[0];
    const pending = S.pendingFor(house);
    const free = S.freePlaces(house);
    const reach = S.homesFor(house).length;
    const unconfirmed = house.members.filter(m => !house.confirmedBy.includes(m));
    const names = list => S.names(list.map(p => ({ name: called(p) })));

    if (clash) {
      return { tone: 'clash', text: S.clashText(clash), action: '' };
    }
    if (DB.isReady(house)) {
      return reach
        ? { tone: 'ready', text: `Ready · ${reach} home${reach === 1 ? '' : 's'} to apply for`,
            action: `<button type="button" class="primary small" data-go="listings">See ${reach} home${reach === 1 ? '' : 's'}</button>` }
        : { tone: 'wait', text: 'Ready, but nothing clears your money yet',
            action: `<button type="button" class="ghost small" data-open-house="${house.id}">Check what you declared</button>` };
    }
    if (DB.isFull(house)) {
      return unconfirmed.includes(me)
        ? { tone: 'act', text: 'Your turn to confirm',
            action: `<button type="button" class="primary small" data-confirm-household="${house.id}">Confirm my place</button>` }
        : { tone: 'wait', text: `Waiting on ${names(unconfirmed.map(DB.profile))} to confirm`, action: '' };
    }
    if (pending.length && !free) {
      return { tone: 'wait', text: `${names(pending.map(x => x.person))} ${pending.length === 1 ? 'has' : 'have'} not answered yet`, action: '' };
    }
    return { tone: 'act', text: `${people.length} of ${house.size} · needs ${free} more`,
      action: `<a class="ghost small button-link" href="#people">Find ${free} more</a>` };
  }

  // Secondary moves, out of the card's way. Native popover: keyboard-reachable, Escape and a
  // click outside close it, and it needs no script beyond placing it under its button.
  function menu(house) {
    const others = S.membersOf(house).filter(p => p.id !== S.me().id);
    const id = `menu-${house.id}`;
    return `<button type="button" class="menu-button" popovertarget="${id}"
        aria-label="More for ${esc(S.nameOf(house))}">⋯</button>
      <div class="menu" id="${id}" popover>
        <button type="button" data-open-house="${house.id}">Open household</button>
        ${others.map(p => `<button type="button" data-thread="${p.id}">Message ${esc(called(p))}</button>`).join('')}
        ${S.alsoSizesFor(house).map(n => `<button type="button" data-also="${house.id}" data-size="${n}">Also search as a ${n}-bedroom</button>`).join('')}
        <button type="button" class="menu-danger" data-leave-household="${house.id}">Leave household</button>
      </div>`;
  }

  function householdCard(house) {
    const people = S.membersOf(house);
    const joined = S.view.justJoined === house.id;
    const sibling = S.siblingsOf(house)[0];
    const now = standing(house);
    const meta = [
      S.needsSizeChip(house) ? S.sizeLabel(house) : '',
      // "€850 together" read oddly on a household of one.
      `${euros(S.pooledBudget(people))} ${DB.isFull(house) ? 'together' : 'so far'}`,
      sibling ? `same plan as your ${sibling.house.size}-bedroom` : ''
    ].filter(Boolean);
    // One "open" button stretched over the whole card, with the menu and the action layered
    // above it. The card used to be role="button" with buttons nested inside it, which
    // screen readers cannot make sense of.
    return `
      <article class="house house-${now.tone}${joined ? ' is-joined' : ''}" data-house="${house.id}">
        <div class="house-head">
          <h3><button type="button" class="house-name" data-open-house="${house.id}">${esc(S.nameOf(house))}</button></h3>
          ${joined ? '<span class="tag tag-joined">Just joined</span>' : ''}
          ${menu(house)}
        </div>
        <p class="house-meta">${meta.map(esc).join(' · ')}</p>
        ${plate(house)}
        <div class="house-foot">
          <p class="pill pill-${now.tone}">${esc(now.text)}</p>
          ${now.action}
        </div>
      </article>`;
  }

  /* One household per size is the model, so looking at two sizes means two households. This
     builds the second one for you, members and invitations included. */
  function alsoSearch(house) {
    const options = S.alsoSizesFor(house);
    if (!options.length) return '';
    return `<span class="also">Also try as a
      ${options.map(n => `<button type="button" class="linkbutton"
        data-also="${house.id}" data-size="${n}">${n}-bedroom</button>`).join(' or ')}</span>`;
  }

  function households() {
    const mine = S.myHouseholds();
    const taken = new Set(mine.map(h => h.size));
    const open = SIZES.filter(n => !taken.has(n));
    return `
      <section class="houses">
        <div class="section-head">
          <h2 class="group-title">Your households</h2>
          ${mine.length ? `<details class="why"><summary>Why one per size?</summary>
            <p>A household of two can only take a two-bedroom, and one of three only a
              three-bedroom. Running both puts you in the running for both kinds of home.</p></details>` : ''}
        </div>
        ${mine.length
          ? `<div class="house-grid">${mine.map(householdCard).join('')}</div>`
          : '<p class="sub">Start one for each apartment size you would take. They search in parallel.</p>'}
        ${open.length ? `<div class="house-new">
          <span class="label">${mine.length ? 'Start another for a' : 'Start a household for a'}</span>
          ${open.map(n => `<button type="button" class="ghost small" data-start="${n}">${n}-bedroom</button>`).join('')}
        </div>` : ''}
      </section>`;
  }

  /* ---------- people ---------- */

  /* A card says why it is here. The old ones repeated "No indoor smoking · Tidy · Early
     routine" and "4/4 preferences" on almost every card, since your best matches share the
     same habits by definition, so a third of each card told you nothing. Now: what teaming
     up opens, and what actually distinguishes this person from the next. */
  function why({ person }) {
    const mine = S.me();
    const differs = ATTRS.filter(([k]) => person.lifestyle[k] !== mine.lifestyle[k]);
    const areas = person.districts.filter(d => mine.districts.includes(d));
    const habits = differs.length
      ? `${4 - differs.length} of 4 habits match · differs on ${differs.map(([, t]) => t.toLowerCase()).join(' and ')}`
      : 'All 4 habits match';
    return areas.length ? `${habits} · both search ${areas.join(' and ')}` : habits;
  }

  function tile(entry) {
    const { person, workable, suitable, blockers, unlocks } = entry;
    return `
      <article class="person${workable ? '' : ' person-far'}" data-person="${person.id}"
               tabindex="0" role="button" aria-label="Open ${esc(person.name)}'s profile">
        <div class="person-top">
          ${avatar(person, 48)}
          <div class="person-id">
            <h3>${esc(person.name)}, ${person.age}</h3>
            <p>${esc(person.role)} · ${euros(person.budget)}</p>
          </div>
        </div>
        <p class="person-bio">${esc(person.bio)}</p>
        ${workable && unlocks
          ? `<p class="person-gain">+${unlocks} two-bed home${unlocks === 1 ? '' : 's'} together</p>`
          : `<p class="person-why">${esc(blockers[0] || (suitable ? 'No two-bed homes together yet' : 'Not a match on habits'))}</p>`}
        <p class="person-match">${esc(why(entry))}</p>
      </article>`;
  }

  function people() {
    const grid = S.peopleGrid();
    const choice = S.view.people;
    return `
      <section class="people-section" id="people">
        <div class="section-head">
          <div>
            <h2 class="group-title">People looking</h2>
            <p class="sub">Ranked by who can actually apply with you, then by how well you would get on.</p>
          </div>
          <div class="segmented" role="radiogroup" aria-label="Who to show">
            <button type="button" role="radio" aria-checked="${choice !== 'everyone'}" data-people="workable">
              Can apply with you <span class="count">${grid.counts.workable}</span></button>
            <button type="button" role="radio" aria-checked="${choice === 'everyone'}" data-people="everyone">
              Everyone <span class="count">${grid.counts.everyone}</span></button>
          </div>
        </div>
        ${grid.shown.length
          ? `<div class="people">${grid.shown.map(tile).join('')}</div>
             <div class="people-more">
               ${grid.more ? `<button type="button" class="ghost" data-more>Show ${Math.min(grid.more, 12)} more</button>` : ''}
               <span class="hint">Showing ${grid.shown.length} of ${grid.list.length}</span>
             </div>`
          : choice === 'everyone'
            ? `<div class="empty small"><h2>That’s everyone for now</h2>
                 <p>You have been through every searcher. Stekkies keeps looking and tells you when
                   someone new turns roommate matching on.</p></div>`
            : `<div class="empty small"><h2>Nobody who can apply with you right now</h2>
                 <p>Nobody left moves in when you do and searches your areas. Everyone else is still here.</p>
                 <button type="button" class="ghost small" data-people="everyone">Show everyone</button></div>`}
      </section>`;
  }

  // The invitation sheet: who, how you compare, and which household you are asking them into.
  function sheet(id) {
    const person = DB.profile(id), mine = S.me();
    const entry = S.candidates().find(c => c.person.id === id)
      || { fit: DemoMatching.compatibility(mine, person), blockers: S.blockers(person) };
    const together = DemoMatching.reachableHomes([mine, person], DemoData.homes);
    const open = S.myHouseholds().filter(h => !DB.isFull(h));
    // The first one with room is chosen for you; one whose places are all promised is shown
    // greyed out with the reason, rather than accepting an invitation it cannot honour.
    const firstWithRoom = open.find(h => S.freePlaces(h) > 0);
    const taken = new Set(S.myHouseholds().map(h => h.size));
    return `
      <div class="sheet" aria-label="${esc(person.name)}'s profile">
        <button type="button" class="sheet-close" data-close aria-label="Close">✕</button>
        <div class="sheet-body">
          <div class="sheet-head">
            ${avatar(person, 64)}
            <div>
              <h2>${esc(person.name)}, ${person.age}</h2>
              <p>${esc(person.role)} · ${esc(person.districts.join(' and '))} · from ${esc(monthName(person.moveMonth))}</p>
            </div>
          </div>
          <p class="sheet-bio">${esc(person.bio)}</p>

          <table class="compare">
            <thead><tr><th scope="col">Household habit</th><th scope="col">You</th><th scope="col">${esc(called(person))}</th></tr></thead>
            <tbody>${ATTRS.map(([k, title]) => {
              const same = mine.lifestyle[k] === person.lifestyle[k];
              const flag = mine.dealbreaker === k ? ' <em>your dealbreaker</em>'
                : person.dealbreaker === k ? ` <em>${esc(called(person))}’s dealbreaker</em>` : '';
              return `<tr class="${same ? 'same' : 'diff'}"><th scope="row">${title}${flag}</th>
                <td>${esc(DemoData.labels[k][mine.lifestyle[k]])}</td>
                <td>${same ? '<span class="visually-hidden">same, </span>' : ''}${esc(DemoData.labels[k][person.lifestyle[k]])}</td></tr>`;
            }).join('')}</tbody>
          </table>

          <div class="together ${together.length ? 'together-yes' : 'together-no'}">
            ${together.length
              ? `<strong>${together.length} two-bedroom home${together.length === 1 ? '' : 's'} would come into range</strong>
                 <span>Pooled budget ${euros(mine.budget + person.budget)} · about ${euros(Math.round(together[0].rent / 2))} each</span>`
              : `<strong>No homes in range for the two of you alone</strong>
                 <span>${esc(entry.blockers[0] || 'A bigger household might still work.')}</span>`}
          </div>

          <div class="field">
            <span class="label">Invite them to</span>
            <!-- Several at once, so "I would take a 2-bed or a 3-bed" is one invitation to
                 send rather than two trips through this sheet. -->
            <div class="pick" role="group" aria-label="Which households">
              ${open.map(h => S.freePlaces(h) > 0
                ? `<button type="button" aria-pressed="${h === firstWithRoom}"
                    data-pick="${h.id}">${esc(S.nameOf(h))} <small>${h.members.length} of ${h.size} · ${esc(S.sizeLabel(h))}</small></button>`
                : `<button type="button" disabled aria-disabled="true"
                    title="Every place already has an invitation out">${esc(S.nameOf(h))}
                    <small>every place has an invitation out</small></button>`).join('')}
              ${SIZES.filter(n => !taken.has(n)).map(n => `<button type="button"
                aria-pressed="${!firstWithRoom && n === SIZES.find(s => !taken.has(s))}" data-pick="new" data-size="${n}">
                New ${n}-bedroom</button>`).join('')}
            </div>
            <span class="hint">Pick as many as you would consider.</span>
          </div>

          <label class="field">
            <span class="label">Say something (optional)</span>
            <textarea id="invite-msg" rows="2" maxlength="200"
              placeholder="We seem to want the same kind of house. Shall we look together?"></textarea>
          </label>
          <p class="sheet-note">They see which household they are being asked into before they
            answer. Nothing is shared until they accept, and nobody is committed until everyone
            confirms.</p>
        </div>
        <!-- Sticky, so on a phone the send button never scrolls away under the form. -->
        <div class="sheet-actions">
          <button type="button" class="ghost" data-skip="${person.id}">Not for me</button>
          <button type="button" class="primary" data-invite="${person.id}">Send invitation</button>
        </div>
      </div>`;
  }

  // Fires when a household is complete and everyone has agreed.
  function celebration({ householdId, members, before, after }) {
    const house = DB.householdById(householdId);
    const people = members.map(DB.profile);
    return `
      <div class="sheet match" aria-label="Household ready">
        <button type="button" class="sheet-close" data-close aria-label="Close">✕</button>
        <div class="match-avatars">
          ${people.map(p => avatar(p, 64)).join('<span class="match-heart" aria-hidden="true">♥</span>')}
        </div>
        <h2>${house ? esc(S.nameOf(house)) : 'Your household'} is ready</h2>
        <p class="match-sub">${esc(DemoFormat.names(people))} ${people.length === 2 ? 'both' : 'all'} confirmed.</p>
        <div class="unlock" role="status">
          <span class="unlock-count" data-from="${before}" data-to="${after}">${before}</span>
          <span class="unlock-label">home${after === 1 ? '' : 's'} you can now apply for<br>
            <small>you could reach ${S.reachableAlone().length} on your own</small></span>
        </div>
        <button type="button" class="primary big" data-celebrate-done>See the listings <span>↗</span></button>
      </div>`;
  }

  function screen() {
    const mine = S.me();
    if (!mine.roommateMode) {
      return `<div class="empty"><h2>Roommate matching is off</h2>
        <p>Turn it on from your profile and you will see other searchers, and they will see you.</p>
        <button type="button" class="primary" data-go="profile">Go to your profile <span>↗</span></button></div>`;
    }
    return `${households()}${people()}`;
  }

  return { screen, sheet, celebration, householdCard, alsoSearch, plate };
})();
