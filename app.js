/* App shell: navigation, accounts, the home screen, the profile editor, and all wiring.
   View state is in store.js; anything that survives a refresh is in db.js. */
(() => {
  'use strict';
  const { esc, euros, avatar, monthName, names } = DemoFormat;
  const S = DemoStore, DB = DemoStore.DB;
  const $ = id => document.getElementById(id);

  // Evidence for the home screen, from the same engine the tests pin, so the claim on the
  // front page cannot drift away from what the model produces.
  const EVIDENCE = (() => {
    const r = DemoSimulation.run(150);
    return { alone: r.baseline.matched, together: r.enhanced.matched, of: r.size,
      homesAlone: r.baseline.homes, homesTogether: r.enhanced.homes };
  })();

  /* ---------- home ---------- */

  /* Two people walk in from opposite sides, meet, a house draws itself around them and a
     heart pops. Every element is correct at rest, so with motion off it is still a picture. */
  const ILLUSTRATION = `
    <svg class="hero-art" viewBox="0 0 260 168" role="img"
         aria-label="Two people meeting and a house drawing itself around them">
      <g class="hero-house">
        <path class="hero-roof" d="M34 84 L130 22 L226 84" fill="none" stroke="currentColor"
          stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <path class="hero-walls" d="M54 80 V148 H206 V80" fill="none" stroke="currentColor"
          stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <g class="hero-person hero-left"><circle cx="104" cy="104" r="14"/>
        <path d="M84 148v-12a20 20 0 0 1 40 0v12z"/></g>
      <g class="hero-person hero-right"><circle cx="156" cy="104" r="14"/>
        <path d="M136 148v-12a20 20 0 0 1 40 0v12z"/></g>
      <g class="hero-heart" aria-hidden="true">
        <path d="M130 70c-9-9-18-3-18 5 0 8 11 14 18 20 7-6 18-12 18-20 0-8-9-14-18-5z"/></g>
    </svg>`;

  function homeScreen() {
    const me = S.me();
    const singles = DemoData.homes.filter(h => h.bedrooms === 1);
    const nearby = singles.filter(h => me.districts.includes(h.district));
    const cheapest = nearby.length ? Math.min(...nearby.map(h => h.rent)) : 0;
    const alone = S.reachableAlone().length;
    const houses = S.myHouseholds();
    const ready = S.readyHouseholds();
    const reach = ready.reduce((n, h) => n + S.homesFor(h).length, 0);
    // People, not invitations: one person asking you into two households is one person. And
    // nobody can have found you while your profile is hidden.
    const askers = me.roommateMode ? [...new Set(DB.invitesTo(me.id).map(i => i.from))] : [];

    return `
      <section class="alerts">
        <div class="screen-head">
          <div><h1>Your search</h1>
            <p class="sub">${euros(me.budget)} · ${esc(me.districts.join(' and '))} · from ${esc(monthName(me.moveMonth))}</p></div>
          <button type="button" class="ghost small" data-go="profile">Edit search</button>
        </div>
        <div class="alertbox">
          <p class="alert-count">${alone} new match${alone === 1 ? '' : 'es'} this week</p>
          <p class="alert-why">${nearby.length} one-bedroom homes in your areas${cheapest
            ? `, and none inside ${euros(me.budget)} — the cheapest is ${euros(cheapest)}` : ''}.
            ${alone ? '' : 'On your own, that is the whole market.'}</p>
          <button type="button" class="ghost small" data-go="listings">See all listings ↗</button>
        </div>
      </section>

      ${askers.length ? `<p class="nudge">
        <strong>${askers.length === 1 ? `${esc(DB.profile(askers[0]).name)} has` : `${askers.length} people have`}
          invited you to team up.</strong>
        <button type="button" class="primary" data-open-bell>Take a look</button></p>` : ''}

      ${ready.length ? `
        <section class="hero hero-done">
          <div class="hero-copy">
            <p class="kicker">${ready.length === 1 ? 'Your household' : `Your ${ready.length} households`}</p>
            <h2>${reach} home${reach === 1 ? '' : 's'} in reach</h2>
            <p>${ready.map(h => `${h.size}-bedroom with ${esc(names(S.membersOf(h).filter(p => p.id !== me.id)))}`).join(', and a ')}.
              ${ready.length > 1 ? 'Each covers a different apartment size, so they search in parallel.' : ''}</p>
            <button type="button" class="primary big" data-go="listings">See your listings <span>↗</span></button>
          </div>
          ${ILLUSTRATION}
        </section>`
      : `
        <section class="hero">
          <div class="hero-copy">
            <p class="kicker">${houses.length ? 'Almost there' : 'New on Stekkies'}</p>
            <h2>${houses.length ? 'Finish your household' : 'Find your perfect roommate'}</h2>
            <p>${houses.length
              ? 'A household has to be full and agreed by everyone before it can apply. Keep one going for each apartment size you would take — they search in parallel.'
              : 'Most homes in Rotterdam have more than one bedroom, and most are out of reach on one income. Team up with someone who wants the same kind of house, and apply together.'}</p>
            <button type="button" class="primary big" data-go="${me.roommateMode ? 'roommates' : 'profile'}">
              ${houses.length ? 'Open your households' : me.roommateMode ? 'Find roommates' : 'Turn on roommate matching'} <span>↗</span>
            </button>
          </div>
          ${ILLUSTRATION}
        </section>

        <section class="evidence">
          <p><strong>${EVIDENCE.together} of ${EVIDENCE.of}</strong> searchers found a home in our
            Rotterdam model when they could team up, against <strong>${EVIDENCE.alone}</strong>
            searching alone — and ${EVIDENCE.homesTogether} of ${DemoData.homes.length} homes were let instead of
            ${EVIDENCE.homesAlone}.</p>
          <p class="fineprint">Fictional data, fixed arrival order, mutual acceptance assumed.
            It tests the mechanism, not the Rotterdam market.</p>
          <button type="button" class="ghost small" data-go="market">See the market impact ↗</button>
        </section>`}`;
  }

  /* ---------- profile ---------- */

  const CHOICES = {
    cleanliness: ['Tidiness', [['tidy', 'Tidy'], ['relaxed', 'Relaxed']]],
    routine: ['Your day', [['early', 'Early riser'], ['late', 'Night person']]],
    sociability: ['The house', [['social', 'Sociable'], ['quiet', 'Quiet']]],
    smoking: ['Smoking', [['no', 'Not indoors'], ['yes', 'Fine indoors']]]
  };
  const SUGGESTION = 'Master’s student, home most afternoons. I cook a lot, I keep the kitchen '
    + 'clear, and I would rather share a house than just split one.';

  function profileScreen() {
    const me = S.me(), on = me.roommateMode;
    return `
      <div class="screen-head"><div><h1>Your profile</h1>
        <p class="sub">This card is what other searchers see. Your email stays private until you both say yes.</p></div></div>

      <div class="profile-grid">
        <div class="profile-form">
          <section class="switchbox ${on ? 'on' : ''}">
            <div><h2>Roommate matching</h2>
              <p>${on
                ? 'On. Your profile is visible to searchers looking in your areas, and you can see theirs. Turning it off also leaves any households you are in.'
                : 'Off. Turn it on to see other searchers — and to let them see you.'}</p></div>
            <button type="button" class="switch" role="switch" aria-checked="${on}" id="mode-toggle">
              <span class="knob"></span><span class="visually-hidden">Roommate matching</span></button>
          </section>

          <fieldset ${on ? '' : 'disabled'}>
            <legend class="visually-hidden">Your details</legend>
            <div class="field">
              <label class="label" for="bio">About you</label>
              <textarea id="bio" rows="5" maxlength="320" placeholder="${esc(SUGGESTION)}">${esc(me.bio)}</textarea>
              <span class="hint"><span id="bio-count">${me.bio.length}</span>/320 ·
                <button type="button" class="linkbutton" id="use-suggestion">use the example</button></span>
            </div>
            <div class="field-row">
              <div class="field"><label class="label" for="role">You are</label>
                <select id="role">
                  <option value="Master’s student" ${/student/i.test(me.role) ? 'selected' : ''}>A student</option>
                  <option value="Young professional" ${/student/i.test(me.role) ? '' : 'selected'}>Working</option>
                </select></div>
              <div class="field"><label class="label" for="budget">Budget each month</label>
                <input type="range" id="budget" min="500" max="1400" step="50" value="${me.budget}">
                <output for="budget" id="budget-out">${euros(me.budget)}</output></div>
            </div>
            ${Object.entries(CHOICES).map(([key, [title, options]]) => `
              <div class="field"><span class="label">${title}</span>
                <div class="segmented" role="radiogroup" aria-label="${title}">
                  ${options.map(([v, t]) => `<button type="button" role="radio"
                    aria-checked="${me.lifestyle[key] === v}" data-set="${key}" data-value="${v}">${t}</button>`).join('')}
                </div></div>`).join('')}
            <div class="field">
              <label class="label" for="dealbreaker">The one thing you cannot live with</label>
              <select id="dealbreaker">
                ${[['smoking', 'Smoking indoors'], ['cleanliness', 'A different standard of tidiness'],
                   ['routine', 'A different daily rhythm'], ['sociability', 'A different kind of house']]
                  .map(([v, t]) => `<option value="${v}" ${me.dealbreaker === v ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
              <span class="hint">Nobody who clashes with this is suggested to you, in either direction.</span>
            </div>
          </fieldset>
        </div>

        <aside class="preview">
          <p class="preview-label">How you appear</p>
          <article class="person preview-card">
            <div class="person-top">${avatar(me, 52)}
              <div class="person-id"><h3>${esc(me.name)}, ${me.age}</h3>
                <p>${esc(me.role)} · ${euros(me.budget)}</p></div></div>
            <p class="person-bio">${me.bio ? esc(me.bio) : '<em>Write something about yourself and it appears here.</em>'}</p>
            <div class="person-tags">${['cleanliness', 'routine', 'sociability']
              .map(k => `<span>${esc(DemoData.labels[k][me.lifestyle[k]])}</span>`).join('')}</div>
          </article>
          ${on ? '<button type="button" class="primary full" data-go="roommates">See who is looking <span>↗</span></button>' : ''}
          <p class="preview-note">Stekkies never asks for your nationality, ethnicity or religion,
            and never for documents. Your email is shared only with people you both said yes to.</p>
        </aside>
      </div>`;
  }

  /* ---------- accounts ---------- */

  // The account menu is what makes the demo two-sided: send an invitation as one person, sign
  // in as another, and answer it.
  function accountMenu() {
    const me = S.me();
    const waiting = DB.state.invites.filter(i => i.status === 'pending');
    // People you are waiting on come first: after sending an invitation, the account you
    // want to become is the one that has to answer it.
    const owed = id => waiting.filter(i => i.to === id).length;
    const fromMe = id => waiting.some(i => i.to === id && i.from === me.id);
    const others = Object.values(DB.state.accounts)
      .map(a => DB.profile(a.id))
      .filter(p => p && p.id !== me.id)
      .sort((a, b) => (fromMe(b.id) - fromMe(a.id)) || (owed(b.id) - owed(a.id))
        || a.id.localeCompare(b.id, undefined, { numeric: true }))
      .slice(0, 8);
    const suggestions = DemoData.tenants
      .filter(p => p.id !== me.id && !DB.hasAccount(p.id))
      .slice(0, 4);
    return `
      <p class="menu-label">Signed in as</p>
      <div class="menu-me">${avatar(me, 34)}<div><strong>${esc(me.name)}</strong>
        <span>${esc(me.email)}</span></div></div>
      <button type="button" class="menu-item" data-go="profile">Your profile</button>
      <hr>
      <p class="menu-label">Switch account</p>
      ${others.length ? others.map(p => {
        const n = waiting.filter(i => i.to === p.id).length;
        return `<button type="button" class="menu-item" data-signin="${p.id}">
          ${avatar(p, 24)}<span>${esc(p.name)}</span>
          ${n ? `<em class="menu-badge">${n}</em>` : ''}</button>`;
      }).join('') : '<p class="menu-empty">No other accounts yet.</p>'}
      <hr>
      <p class="menu-label">Create an account</p>
      ${suggestions.map(p => `<button type="button" class="menu-item" data-create="${p.id}">
        ${avatar(p, 24)}<span>${esc(p.name)}, ${p.age}</span><em class="menu-new">new</em></button>`).join('')}
      <p class="menu-note">Accounts are stored in this browser only. “Reset everything”
        at the bottom of the page clears them.</p>`;
  }

  // Invitations, out of the page body and into the top bar. Each row says which household it
  // is for, so the recipient knows whether they are being asked into a 2- or a 3-bedroom.
  function bellMenu() {
    const mine = S.me();
    const waiting = DB.invitesTo(mine.id);
    const sent = DB.invitesFrom(mine.id);
    // Several invitations between the same two people — a two- and a three-bedroom, say — are
    // one card with a row per household, not a stack of near-identical cards.
    const byPerson = (list, key) => list.reduce((acc, invite) => {
      const entry = acc.find(e => e.id === invite[key]);
      if (entry) entry.invites.push(invite); else acc.push({ id: invite[key], invites: [invite] });
      return acc;
    }, []);
    const houseLine = house => (house
      ? `${esc(S.nameOf(house))}${S.needsSizeChip(house) ? ` · ${esc(S.sizeLabel(house))}` : ''}`
      : 'A household that no longer exists');
    // Outgoing invitations had nowhere to live, so sending one looked like nothing happened.
    // They come first: the list is always the shorter one, and it is what you open the bell
    // to check straight after inviting someone.
    const sentBlock = sent.length ? `
      <p class="menu-label">Waiting on ${sent.length === 1 ? 'an answer' : 'answers'}</p>
      ${byPerson(sent, 'to').map(({ id, invites }) => {
        const to = DB.profile(id);
        return `<article class="note sent">
          <div class="note-top">${avatar(to, 32)}<div><strong>${esc(to.name)}</strong></div></div>
          ${invites.map(invite => `<div class="note-row">
            <span class="note-house">${houseLine(DB.householdById(invite.householdId))}</span>
            <button type="button" class="linkbutton" data-withdraw="${invite.id}">Withdraw</button>
          </div>`).join('')}
        </article>`;
      }).join('')}` : '';

    if (!waiting.length) {
      return `${sentBlock}${sent.length ? '<hr>' : ''}<p class="menu-label">Invitations</p>
        <p class="menu-empty">Nothing waiting on you. When someone asks you into a household it
          shows up here.</p>`;
    }
    return `${sentBlock}${sent.length ? '<hr>' : ''}
      <p class="menu-label">${waiting.length} invitation${waiting.length === 1 ? '' : 's'} for you</p>
      ${byPerson(waiting, 'from').map(({ id, invites }) => {
        const from = DB.profile(id);
        const message = invites.map(i => i.message).find(Boolean);
        // Whether you could apply with them, said on the invitation itself: five of the eight
        // people who ask Alex on day one could never apply with him. Once per card when every
        // household reads the same, per row when they differ.
        const fits = invites.map(i => { const h = DB.householdById(i.householdId); return h ? S.fitWith(h) : null; });
        const same = fits.every(f => f && fits[0] && f.text === fits[0].text);
        const fit = f => (f ? `<p class="note-fit note-fit-${f.tone}">${f.tone === 'ok' ? '✓ ' : ''}${esc(f.text)}</p>` : '');
        return `<article class="note">
          <div class="note-top">
            ${avatar(from, 36)}
            <div>
              <strong>${esc(from.name)}, ${from.age}</strong>
              <span>${esc(from.role)} · ${euros(from.budget)} · ${esc(from.districts.join(' and '))}</span>
            </div>
          </div>
          ${same ? fit(fits[0]) : ''}
          ${message ? `<p class="note-msg">“${esc(message)}”</p>` : ''}
          ${invites.map((invite, k) => {
            const house = DB.householdById(invite.householdId);
            return `<div class="note-row note-row-in">
              <p class="note-house">${houseLine(house)}${house ? ` · ${house.members.length} of ${house.size} so far` : ''}</p>
              ${same ? '' : fit(fits[k])}
              <div class="note-actions">
                <button type="button" class="ghost small" data-decline="${invite.id}">Decline</button>
                <button type="button" class="primary" data-accept="${invite.id}">Accept</button>
              </div>
            </div>`;
          }).join('')}
        </article>`;
      }).join('')}`;
  }

  /* ---------- render ---------- */

  const SCREENS = {
    home: homeScreen,
    profile: profileScreen,
    listings: () => DemoListings.screen(),
    roommates: () => DemoRoommates.screen(),
    messages: () => DemoMessages.screen(),
    market: () => DemoMarket.screen(),
    household: () => DemoHousehold.screen()
  };

  function render() {
    const route = S.view.route, me = S.me();
    if (route !== 'market') DemoMarket.leave();
    $('screen').innerHTML = (SCREENS[route] || homeScreen)();

    document.querySelectorAll('.navlink').forEach(link => {
      const active = link.dataset.go === route;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    $('nav-roommates').hidden = !me.roommateMode;
    $('nav-messages').hidden = !DB.connections(me.id).length;

    const invites = DB.invitesTo(me.id).length;
    $('bell').hidden = !me.roommateMode;
    $('invite-badge').hidden = !invites;
    $('invite-badge').textContent = invites || '';
    $('bell').setAttribute('aria-expanded', String(S.view.notifying));
    $('bell-menu').hidden = !S.view.notifying;
    if (S.view.notifying) $('bell-menu').innerHTML = bellMenu();

    $('account-chip').innerHTML = `${avatar(me, 28)}<span>${esc(me.name)}</span>`;
    $('account-chip').setAttribute('aria-expanded', String(S.view.switching));
    $('account-menu').hidden = !S.view.switching;
    if (S.view.switching) $('account-menu').innerHTML = accountMenu();

    $('storage-note').textContent = DB.persists
      ? 'Stekkies concept demo · AI Strategy Lab · accounts saved in this browser'
      : 'Stekkies concept demo · AI Strategy Lab · storage unavailable, this session only';

    renderOverlay();
    renderToast();
    rememberPlace();
  }

  /* Sheets live in a native <dialog>, opened with showModal(): focus stays inside, the page
     behind becomes inert, and Escape arrives as a 'cancel' event. It is only rebuilt when what
     it shows changes. Rebuilding on every render used to wipe a half-typed invitation message,
     and throw focus back to the top, whenever anything else on the page updated. */
  let overlayKey = '';
  function renderOverlay() {
    const box = $('overlay');
    const { celebration, openProfile, openListing } = S.view;
    const key = celebration ? `celebration:${celebration.householdId}`
      : openListing ? `listing:${openListing}:${S.applicationSent(openListing)}`
      : openProfile ? `profile:${openProfile}` : '';
    document.body.classList.toggle('locked', Boolean(key));
    if (key === overlayKey) return;
    overlayKey = key;
    if (!key) {
      if (box.open && typeof box.close === 'function') box.close();
      box.removeAttribute('open');
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.innerHTML = celebration ? DemoRoommates.celebration(celebration)
      : openListing ? DemoListings.application(openListing)
      : DemoRoommates.sheet(openProfile);
    const sheet = box.firstElementChild;
    box.setAttribute('aria-label', (sheet && sheet.getAttribute('aria-label')) || 'Details');
    box.hidden = false;
    if (!box.open) {
      try { box.showModal(); } catch (error) { box.setAttribute('open', ''); }
    }
    const focus = box.querySelector('textarea') || box.querySelector('.primary') || box.querySelector('button');
    if (focus) focus.focus({ preventScroll: true });
    if (celebration) { countUp(box.querySelector('.unlock-count')); burst(box.querySelector('.unlock')); }
  }

  /* Toasts: what just happened, and Undo where it can be taken back. Seven seconds, held while
     the pointer or keyboard focus is on it (WCAG 2.2.1), one at a time. The region is always in
     the page, so screen readers announce what is put into it. */
  let toastShowing = 0, toastTimer = null, toastHeld = false;
  function renderToast() {
    const region = $('toasts');
    const toast = S.view.toast;
    if (!toast) {
      if (toastShowing) { region.innerHTML = ''; toastShowing = 0; clearTimeout(toastTimer); }
      return;
    }
    // Undo is offered only while it would work. Once anything else has been written the
    // button goes, rather than staying up to be refused. Removed, not re-rendered, so a
    // screen reader does not hear the message twice.
    const undo = toast.undo && S.canUndo();
    if (toast.id === toastShowing) {
      const button = region.querySelector('.toast-undo');
      if (button && !undo) button.remove();
      return;
    }
    toastShowing = toast.id;
    region.innerHTML = `<div class="toast">
      <p>${esc(toast.text)}</p>
      ${undo ? '<button type="button" class="toast-undo" data-undo>Undo</button>' : ''}
      <button type="button" class="toast-close" data-dismiss-toast aria-label="Dismiss">✕</button>
    </div>`;
    expireToast(toast.id);
  }
  function expireToast(id) {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (toastHeld) expireToast(id);
      else S.actions.dismissToast(id);
    }, 7000);
  }
  const toastRegion = $('toasts');
  toastRegion.addEventListener('pointerenter', () => { toastHeld = true; });
  toastRegion.addEventListener('pointerleave', () => { toastHeld = false; });
  toastRegion.addEventListener('focusin', () => { toastHeld = true; });
  toastRegion.addEventListener('focusout', () => { toastHeld = false; });

  // Escape on a native dialog fires 'cancel'; closing it is the store's decision, not the
  // browser's, so the view state and the dialog can never disagree.
  $('overlay').addEventListener('cancel', event => { event.preventDefault(); S.actions.closeOverlay(); });

  /* Clipboard access differs by browser, and inside a framed page it can be refused, so this
     tries the old in-gesture copy first, then the modern call, and reports only what happened.
     The previous version said "Copied." even when all it had managed was to select the text.
     The scratch box goes inside the open dialog, if there is one: everything outside a modal
     dialog is inert and cannot be selected. */
  function copyText(text) {
    const host = $('overlay').open ? $('overlay') : document.body;
    const was = document.activeElement;
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    host.appendChild(box);
    box.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
    box.remove();
    // Selecting the scratch box took focus; give it back to whatever had it.
    if (was && typeof was.focus === 'function') was.focus({ preventScroll: true });
    if (copied || !(navigator.clipboard && navigator.clipboard.writeText)) return Promise.resolve(copied);
    return navigator.clipboard.writeText(text).then(() => true, () => false);
  }

  // Copying the letter is the point of having a shared one, so it has to actually work and
  // say whether it did.
  function copyLetter() {
    const box = $('house-letter');
    const note = $('copy-note');
    if (!box) return;
    copyText(box.value).then(copied => {
      if (!note) return;
      note.textContent = copied ? 'Copied.' : 'Copying is blocked here. Select the letter and press Ctrl+C or ⌘C.';
      setTimeout(() => { note.textContent = ''; }, copied ? 2200 : 6000);
    });
  }

  // Applying copies the letter for real, so the hand-off can say it is on the clipboard. It is
  // reported into the hand-off once the copy has settled, and only as what happened.
  function sendApplication(homeId) {
    const copying = copyText(DemoListings.letterText(homeId));
    S.actions.confirmApplication(homeId);
    copying.then(copied => {
      const note = $('handoff-copy');
      if (note) {
        note.textContent = copied ? '✓ Your letter is copied, ready to paste into their form.'
          : 'Copying is blocked in this window, so copy the letter yourself before you paste it there.';
        note.classList.toggle('is-copied', copied);
      }
    });
  }

  /* A household going live: a brief burst of small houses in the brand colour around the
     count, gone in under a second. Nothing at all for anyone who asked for less motion. */
  const HOUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 3 10.5V21h6v-6h6v6h6V10.5z"/></svg>';
  function burst(anchor) {
    if (!anchor || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = document.createElement('div');
    layer.className = 'burst';
    layer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + 0.3;
      const reach = 70 + (i % 3) * 22;
      const piece = document.createElement('span');
      piece.innerHTML = HOUSE;
      piece.style.setProperty('--x', `${Math.cos(angle) * reach}px`);
      piece.style.setProperty('--y', `${Math.sin(angle) * reach * 0.6}px`);
      piece.style.setProperty('--d', `${(i % 4) * 40}ms`);
      layer.appendChild(piece);
    }
    anchor.appendChild(layer);
    setTimeout(() => layer.remove(), 1100);
  }

  // The unlocked count is the moment the whole thing exists for, so it animates — unless the
  // reader asked for less motion, in which case it simply shows the number.
  function countUp(node) {
    if (!node) return;
    const to = Number(node.dataset.to), from = Number(node.dataset.from);
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm || to === from || typeof requestAnimationFrame !== 'function') { node.textContent = to; return; }
    const started = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - started) / 900);
      node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- events ---------- */

  document.addEventListener('click', event => {
    const t = event.target;
    if (S.view.route === 'market') DemoMarket.handle(event);

    if (t.closest('#bell')) { S.actions.toggleNotifications(); return; }
    // "Take a look" on the home screen opens the bell itself: that is where invitations live.
    if (t.closest('[data-open-bell]')) { S.actions.toggleNotifications(true); return; }
    if (t.closest('#account-chip')) { S.actions.toggleSwitcher(); return; }
    if (S.view.switching && !t.closest('#account-menu') && !t.closest('#account-chip')) S.actions.toggleSwitcher(false);
    if (S.view.notifying && !t.closest('#bell-menu') && !t.closest('#bell')) S.actions.toggleNotifications(false);

    // Choosing which household an invitation is for, inside the open sheet.
    const pick = t.closest('[data-pick]');
    if (pick) {
      const on = pick.getAttribute('aria-pressed') === 'true';
      pick.setAttribute('aria-pressed', String(!on));
      return;
    }
    // A click on the dimmed backdrop itself — not on the sheet sitting inside it — closes.
    // It is the first thing anyone reaches for when a modal is in the way.
    if (t.id === 'overlay') { S.actions.closeOverlay(); return; }
    if (t.closest('#mode-toggle')) { S.actions.setRoommateMode(!S.me().roommateMode); return; }
    if (t.closest('#use-suggestion')) { S.actions.editMe({ bio: SUGGESTION }); return; }
    if (t.closest('#reset-demo')) { S.actions.reset(); return; }

    const el = t.closest('[data-go],[data-person],[data-invite],[data-skip],[data-close],[data-apply],'
      + '[data-confirm-apply],[data-celebrate-done],[data-set],[data-accept],[data-decline],[data-thread],'
      + '[data-confirm-household],[data-leave-household],[data-signin],[data-create],'
      + '[data-filter],[data-why],[data-start],[data-open-house],[data-undo],[data-dismiss-toast],'
      + '[data-withdraw],[data-declare],[data-copy-letter],[data-also],[data-people],[data-more],'
      + '[data-rename-focus]');
    if (!el) return;
    const d = el.dataset;
    if (d.go !== undefined) { event.preventDefault(); S.actions.go(d.go); }
    else if (d.celebrateDone !== undefined) S.actions.dismissCelebration();
    else if (d.close !== undefined) S.actions.closeOverlay();
    else if (d.invite) {
      const box = document.getElementById('invite-msg');
      // Exactly what is ticked. Falling back to "the first one" could pick a greyed-out
      // household, and guessing is worse than saying nothing was picked.
      const chosen = [...document.querySelectorAll('.pick [data-pick][aria-pressed="true"]')];
      S.actions.sendInvite(d.invite,
        chosen.map(b => ({ id: b.dataset.pick, size: b.dataset.size })),
        box && box.value.trim());
    }
    else if (d.skip) S.actions.skip(d.skip);
    else if (d.accept) S.actions.respondInvite(d.accept, 'accepted');
    else if (d.decline) S.actions.respondInvite(d.decline, 'declined');
    else if (d.thread) S.actions.openThread(d.thread);
    else if (d.undo !== undefined) S.actions.undo();
    else if (d.dismissToast !== undefined) S.actions.dismissToast();
    else if (d.people) S.actions.setPeople(d.people);
    else if (d.more !== undefined) S.actions.showMore();
    else if (d.renameFocus !== undefined) { const box = $('house-name'); if (box) { box.focus(); box.select(); } }
    else if (d.openHouse) S.actions.openHousehold(d.openHouse);
    else if (d.withdraw) S.actions.withdrawInvite(d.withdraw);
    else if (d.declare) S.actions.declare(d.declare, { mode: d.mode });
    else if (d.copyLetter) copyLetter(d.copyLetter);
    else if (d.also) S.actions.alsoSearch(d.also, Number(d.size));
    else if (d.start) S.actions.startHousehold(d.start);
    else if (d.confirmHousehold) S.actions.confirmHousehold(d.confirmHousehold);
    else if (d.leaveHousehold) S.actions.leaveHousehold(d.leaveHousehold);
    else if (d.signin) S.actions.signIn(d.signin);
    else if (d.create) S.actions.createAccount(d.create, {});
    else if (d.filter) S.actions.setFilter(d.filter);
    else if (d.why) S.actions.toggleWhy(d.why);
    else if (d.apply) S.actions.applyTo(d.apply);
    else if (d.confirmApply) sendApplication(d.confirmApply);
    else if (d.set) S.actions.editLifestyle(d.set, d.value);
    else if (d.person) S.actions.openProfile(d.person);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!$('overlay').hidden) {
        S.actions.closeOverlay();
        return;
      }
      if (S.view.switching) { S.actions.toggleSwitcher(false); return; }
      if (S.view.notifying) { S.actions.toggleNotifications(false); return; }
    }
    // Native buttons activate themselves; handling them here too opened things twice.
    const tile = event.target.closest('[data-person]');
    if (tile && tile.tagName !== 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      S.actions.openProfile(tile.dataset.person);
      return;
    }
    const card = event.target.closest('[data-open-house]');
    if (card && card.tagName !== 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      S.actions.openHousehold(card.dataset.openHouse);
    }
  });

  // Typing must not re-render the field under the cursor, so these patch in place.
  document.addEventListener('input', event => {
    const el = event.target;
    if (el.id === 'round') { DemoMarket.scrub(event); return; }
    // Typed straight into the household, without re-rendering the box under the cursor.
    if (el.dataset.letter) { S.actions.setLetter(el.dataset.letter, el.value); return; }
    if (el.dataset.rename) { S.actions.rename(el.dataset.rename, el.value); return; }
    if (el.id === 'bio') {
      DB.update(S.me().id, { bio: el.value });
      $('bio-count').textContent = el.value.length;
      livePreview();
    } else if (el.id === 'budget') {
      DB.update(S.me().id, { budget: Number(el.value) });
      $('budget-out').textContent = euros(el.value);
      livePreview();
    }
  });

  document.addEventListener('focusin', event => {
    if (event.target.classList && event.target.classList.contains('titlebox')) event.target.select();
  });

  document.addEventListener('change', event => {
    const el = event.target;
    if (el.dataset.tick) { S.actions.tick(el.dataset.tick, el.dataset.key, el.checked); return; }
    if (el.id === 'role') S.actions.editMe({ role: el.value });
    else if (el.id === 'dealbreaker') S.actions.editMe({ dealbreaker: el.value });
  });

  document.addEventListener('submit', event => {
    const form = event.target.closest('[data-say]');
    if (!form) return;
    event.preventDefault();
    const box = form.querySelector('textarea');
    S.actions.say(form.dataset.say, box.value);
    box.value = '';
  });

  function livePreview() {
    const card = document.querySelector('.preview-card');
    if (!card) return;
    const me = S.me();
    card.querySelector('.person-bio').innerHTML = me.bio
      ? esc(me.bio) : '<em>Write something about yourself and it appears here.</em>';
    card.querySelector('.person-id p').textContent = `${me.role} · ${euros(me.budget)}`;
  }

  /* ---------- motion ---------- */

  /* Movement only where it shows what happened, only between our own screens, and none at all
     for anyone who asked for less. The Stekkies screens change exactly as they always have. */
  const FEATURE = new Set(['roommates', 'household', 'messages']);
  const calm = () => !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const named = (el, name) => { if (el) el.style.viewTransitionName = name; };

  /* A refresh in the middle of a presentation comes back to the same screen, for the same
     person, instead of dropping everyone back on Home. Per tab, and only a convenience: with
     storage unavailable the demo simply starts on Home. */
  const PLACE = 'stekkies.demo.place';
  function rememberPlace() {
    try {
      sessionStorage.setItem(PLACE, JSON.stringify({ user: S.me().id, route: S.view.route,
        house: S.view.openHouse, thread: S.view.openThread }));
    } catch (error) { /* a convenience, nothing more */ }
  }
  (function returnToPlace() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(PLACE) || 'null'); } catch (error) { return; }
    if (!saved || saved.user !== S.me().id || !SCREENS[saved.route]) return;
    S.view.route = saved.route;
    S.view.openHouse = saved.house || null;
    S.view.openThread = saved.thread || null;
  })();
  const houseCard = id => document.querySelector(`.house[data-house="${String(id).replace(/"/g, '')}"]`);
  let lastRoute = S.view.route;

  function paint() {
    const from = lastRoute, to = S.view.route;
    lastRoute = to;
    const hint = S.takeFlourish();
    const flourish = hint && hint.kind === 'join' ? hint : null;
    const invited = hint && hint.kind === 'invited' ? hint : null;
    const moving = from !== to && FEATURE.has(from) && FEATURE.has(to);
    if (!(moving || flourish) || typeof document.startViewTransition !== 'function' || calm()) {
      render();
      if (invited) showInvited(invited);
      return;
    }
    // Name, in the old picture, what should travel...
    const leaving = document.querySelector('.hh-summary');
    const leavingHouse = leaving && leaving.dataset.house;
    if (moving && to === 'household') named(houseCard(S.view.openHouse), 'vt-house');
    if (moving && from === 'household') named(leaving, 'vt-house');
    if (flourish) named(document.querySelector('#account-chip .avatar'), 'vt-me');
    const transition = document.startViewTransition(() => {
      render();
      // ...and in the new one, where it lands: a card grows into its page and shrinks back,
      // and on joining, your face flies from the account chip onto your name tag.
      if (moving && to === 'household') named(document.querySelector('.hh-summary'), 'vt-house');
      if (moving && from === 'household' && to === 'roommates') named(houseCard(leavingHouse), 'vt-house');
      if (flourish) named(document.querySelector(`.house[data-house="${flourish.householdId}"] [data-person-tag="me"] .avatar`), 'vt-me');
    });
    transition.finished.finally(() => {
      document.querySelectorAll('[style*="view-transition-name"]').forEach(el => { el.style.viewTransitionName = ''; });
    });
  }

  /* After an invitation goes out, the screen shows where it went: the household it was for,
     scrolled into view, with the new name tag lit once. It used to stay on the grid, where the
     only sign of it was the person disappearing. */
  function showInvited({ personId, householdIds }) {
    const quote = value => String(value).replace(/["\\]/g, '');
    const tags = householdIds
      .map(id => document.querySelector(`.house[data-house="${quote(id)}"] [data-person-tag="${quote(personId)}"]`))
      .filter(Boolean);
    if (!tags.length) return;
    tags.forEach(tag => tag.classList.add('is-new'));
    const card = tags[0].closest('.house');
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' });
    }
  }

  // A popover opens centred in the top layer by default; put the card menu under its button,
  // inside the viewport, and close it if the page scrolls away from it.
  document.addEventListener('toggle', event => {
    const pop = event.target;
    if (!pop.classList || !pop.classList.contains('menu')) return;
    if (event.newState !== 'open') { pop.classList.remove('is-placed'); return; }
    const invoker = document.querySelector(`[popovertarget="${pop.id}"]`);
    if (!invoker) return;
    const r = invoker.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const below = r.bottom + 6 + h <= window.innerHeight - 8;
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))}px`;
    pop.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px`;
    pop.classList.add('is-placed');
  }, true);
  window.addEventListener('scroll', () => {
    document.querySelectorAll('.menu.is-placed').forEach(pop => {
      if (typeof pop.hidePopover === 'function') pop.hidePopover();
    });
  }, { passive: true });

  S.subscribe(paint);
  render();
})();
