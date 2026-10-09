/* Every listing on Stekkies, always — marked with what it would take to get it.
   Showing only what you can already afford makes the market look like it shrank the moment
   you teamed up, which is the opposite of what happened. */
const DemoListings = (() => {
  'use strict';
  const { esc, euros, avatar, names, monthName } = DemoFormat;
  const S = DemoStore, DB = DemoStore.DB;

  const FILTERS = [
    ['all', 'All listings'],
    ['alone', 'In reach on your own'],
    ['together', 'In reach with your household'],
    ['out', 'Out of reach']
  ];

  // Why a home is or is not open to this household. Every reason is a rule from matching.js,
  // and a household's income is what its members declared, not the fixture's figure.
  function review(home, group, house) {
    const status = DemoMatching.sharingStatus(home, group.length);
    const share = home.rent / group.length;
    const blocks = [], checks = [];
    if (group.length > 1 && home.bedrooms !== group.length) {
      blocks.push(['Size', `Listed for ${home.bedrooms} tenants, you are ${group.length}.`]);
    }
    if (status === 'permit-required') {
      blocks.push(['Permit', `Sharing with ${group.length} tenants needs a room-rental permit, and Rotterdam issues no new ones in ${home.district}.`]);
    } else if (status === 'unclear') {
      blocks.push(['Sharing', 'The listing does not say whether sharing is allowed — worth a call first.']);
    }
    if (!group.every(p => p.districts.includes(home.district))) blocks.push(['Area', 'Outside the areas you are searching.']);
    if (!group.every(p => p.moveMonth === home.moveMonth)) blocks.push(['Date', `Free from ${monthName(home.moveMonth)}.`]);
    const short = group.filter(p => p.budget < share);
    if (short.length) blocks.push(['Budget', `${euros(share)} each is over ${names(short)}’s budget.`]);
    const income = house ? S.declaredIncome(house, home) : S.pooledIncome(home, group);
    const needed = home.rent * home.incomeMultiple;
    if (income < needed) {
      blocks.push(['Income', house
        ? `Together you declare ${euros(income)}; the landlord asks ${euros(needed)}. Change it on your household page.`
        : `You show ${euros(income)}; the landlord asks ${euros(needed)}.`]);
    }
    else checks.push(['Income', `${euros(income)} against ${euros(needed)} required`]);
    if (!blocks.length) {
      checks.unshift(['Sharing', group.length > 1 ? 'Allowed, and no permit needed here' : 'Renting on your own']);
      checks.push(['Your share', `${euros(share)} each a month`]);
    }
    return { status, share, blocks, checks, open: !blocks.length };
  }

  function card(entry, expanded) {
    const { home, status, needs, house } = entry;
    const group = house ? S.membersOf(house) : [S.me()];
    const detail = review(home, group, house);
    // Applying on your own is recorded against you, so the card has to look there too — it
    // only ever checked households, and a solo application never showed as applied.
    const applied = DB.applied(house ? house.id : S.me().id, home.id);
    const badge = status === 'alone' ? '<span class="tag tag-you">In reach on your own</span>'
      : status === 'together' ? `<span class="tag tag-team">${esc(S.nameOf(house))}</span>`
      : status === 'short' ? `<span class="tag tag-need">${esc(S.nameOf(house))} · short on declared income</span>`
      : needs ? `<span class="tag tag-need">Would need ${needs} tenants</span>`
      : '<span class="tag tag-out">Out of reach</span>';
    return `
      <article class="home ${status === 'out' ? 'home-blocked' : ''}">
        <div class="home-head">
          <div>
            ${badge}
            <h3>${esc(home.street)}</h3>
            <p class="home-where">Rotterdam ${esc(home.district)} · ${home.area} m² · ${home.bedrooms} bedroom${home.bedrooms === 1 ? '' : 's'} · from ${esc(monthName(home.moveMonth))}</p>
          </div>
          <div class="home-price"><strong>${euros(home.rent)}</strong><span>per month</span>
            ${group.length > 1 ? `<small>${euros(home.rent / group.length)} each</small>` : ''}</div>
        </div>
        ${expanded ? `<dl class="home-checks">
          ${detail.checks.map(([l, t]) => `<div class="ok"><dt>✓ ${esc(l)}</dt><dd>${esc(t)}</dd></div>`).join('')}
          ${detail.blocks.map(([l, t]) => `<div class="flag"><dt>⚠ ${esc(l)}</dt><dd>${esc(t)}</dd></div>`).join('')}
        </dl>` : ''}
        <div class="home-foot">
          <span class="home-source">Via ${esc(home.agent)} · listed ${home.listedMinutesAgo} min ago</span>
          ${applied ? '<span class="applied-tag">✓ Applied</span>'
            : detail.open ? `<button type="button" class="primary" data-apply="${home.id}">
                 ${group.length > 1 ? 'Apply together' : 'Apply'} <span>↗</span></button>`
            : `<button type="button" class="linkbutton" data-why="${home.id}">${expanded ? 'Hide why' : 'Why not?'}</button>`}
        </div>
      </article>`;
  }

  // Applying alone still needs words, and there is no household to store them on.
  function defaultLetter(home, group) {
    return `Good afternoon,\nI would like to view ${home.street}. I am ${group[0].name}, looking `
      + `to rent from ${monthName(home.moveMonth)}. My monthly income and guarantor support comes `
      + `to ${euros(S.pooledIncome(home, group))}, against the ${euros(home.rent * home.incomeMultiple)} required.`
      + `\nI can view at short notice.`;
  }

  // Who would apply for a home, and the question its listing leaves open, if any.
  function applying(homeId) {
    const home = DemoData.homes.find(h => h.id === homeId);
    const row = S.listings().find(e => e.home.id === homeId);
    const house = row && row.house;
    const group = house ? S.membersOf(house) : [S.me()];
    const status = DemoMatching.sharingStatus(home, group.length);
    const question = status === 'permit-required'
      ? `Does the property hold a valid room-rental permit for ${group.length} tenants?`
      : status === 'unclear' ? 'Is sharing with independent tenants allowed here?' : '';
    return { home, house, group, question };
  }

  // The exact words an application sends, for the clipboard: the same letter the sheet shows.
  function letterText(homeId) {
    const { home, house, group, question } = applying(homeId);
    return [house ? S.letterFor(house, home) : defaultLetter(home, group), question].filter(Boolean).join('\n\n');
  }

  function application(homeId) {
    const { home, house, group, question } = applying(homeId);
    const detail = review(home, group, house);
    const sent = DB.applied(house ? house.id : S.me().id, homeId);
    if (sent) {
      return `<div class="sheet handoff" aria-label="Application sent">
        <button type="button" class="sheet-close" data-close aria-label="Close">✕</button>
        <span class="handoff-mark" aria-hidden="true">↗</span>
        <h2>Off to the agent</h2>
        <p class="sheet-sub">${esc(home.agent)} takes applications for ${esc(home.street)} on
          <strong>${esc(home.agent.toLowerCase().replace(/[^a-z]/g, ''))}.nl</strong>, so that is
          where you finish. Stekkies never handles the application or the lease — it gets you to
          the front of the queue.</p>
        <!-- Filled in once the copy has actually happened, so it never claims one that failed. -->
        <p class="handoff-copy" id="handoff-copy" role="status"></p>
        <dl class="pairs">
          <div><dt>Applying as</dt><dd>${esc(names(group))}</dd></div>
          <div><dt>Your share</dt><dd>${euros(home.rent / group.length)} a month</dd></div>
          <div><dt>Marked</dt><dd>Applied, on ${group.length > 1 ? 'all your accounts' : 'your account'}</dd></div>
        </dl>
        <p class="sheet-note">${group.length > 1
          ? 'Any of you can still walk away until a lease is signed. After that you are all liable for the full rent.'
          : 'Nothing is committed until you sign.'}</p>
        <button type="button" class="ghost" data-close>Back to listings</button>
      </div>`;
    }
    return `<div class="sheet" aria-label="Apply">
      <button type="button" class="sheet-close" data-close aria-label="Close">✕</button>
      <h2>${group.length > 1 ? 'Apply together' : 'Apply'}</h2>
      <p class="sheet-sub">${esc(home.street)} · Rotterdam ${esc(home.district)} · ${euros(home.rent)} a month</p>
      <div class="applicants">
        ${group.map(p => {
          const row = house ? S.declared(house, p.id) : null;
          const said = !row ? `income ${euros(p.income)}${p.guarantorIncome ? ` · guarantor ${euros(p.guarantorIncome)}` : ''}`
            : row.mode === 'none' ? 'has not declared how they cover the rent'
            : row.mode === 'salary' ? `own salary ${euros(row.salary)}`
            : row.mode === 'guarantor' ? `guarantor ${euros(row.guarantor)}`
            : `salary ${euros(row.salary)} · guarantor ${euros(row.guarantor)}`;
          return `<div class="applicant">${avatar(p, 40)}
            <div><strong>${esc(p.name)}, ${p.age}</strong>
              <span>${esc(p.role)} · ${said}</span>
            </div></div>`;
        }).join('')}
      </div>
      <blockquote class="letter">
        ${esc(house ? S.letterFor(house, home) : defaultLetter(home, group))
          .split('\n').filter(Boolean).map(line => `<p>${line}</p>`).join('')}
        ${question ? `<p class="letter-question">${esc(question)}</p>` : ''}
      </blockquote>
      ${house ? `<p class="sheet-note">This is your household's shared letter.
        <button type="button" class="linkbutton" data-open-house="${house.id}">Edit it</button></p>` : ''}
      ${question ? '<p class="sheet-note">A question was added automatically because this listing’s sharing status could not be verified.</p>' : ''}
      <div class="sheet-actions">
        <button type="button" class="ghost" data-close>Not yet</button>
        <button type="button" class="primary" data-confirm-apply="${home.id}">Copy letter and apply <span>↗</span></button>
      </div>
    </div>`;
  }

  function screen() {
    const ready = S.readyHouseholds();
    const all = S.listings();
    // A home that is short on declared income is out of reach today, so it counts as out.
    const bucket = e => (e.status === 'short' ? 'out' : e.status);
    const counts = all.reduce((acc, e) => (acc[bucket(e)]++, acc), { alone: 0, together: 0, out: 0 });
    const filter = S.view.filter;
    const shown = filter === 'all' ? all : all.filter(e => bucket(e) === filter);
    return `
      <div class="screen-head">
        <div><h1>Listings</h1>
          <p class="sub">All ${all.length} homes Stekkies is watching${ready.length
            ? `, priced for your ${ready.map(h => h.size + '-bedroom').join(' and ')} household${ready.length > 1 ? 's' : ''}`
            : ''}. Nothing is hidden from you.</p></div>
      </div>

      <div class="reach-strip">
        <div><strong>${counts.alone}</strong><span>on your own</span></div>
        <div class="${ready.length ? 'lit' : ''}"><strong>${counts.together}</strong>
          <span>${ready.length ? 'with your households' : 'with a household'}</span></div>
        <div><strong>${counts.out}</strong><span>out of reach</span></div>
      </div>

      <div class="filters" role="tablist" aria-label="Filter listings">
        ${FILTERS.map(([key, label]) => `
          <button type="button" role="tab" aria-selected="${filter === key}" data-filter="${key}">
            ${label}${key !== 'all' ? ` <span class="count">${counts[key]}</span>` : ''}
          </button>`).join('')}
      </div>

      ${shown.length
        ? shown.map(e => card(e, S.view.openWhy === e.home.id)).join('')
        : filter === 'together' && !ready.length
          ? `<div class="empty small"><h2>No household ready yet</h2>
               <p>Homes appear here once one of your households is full and everyone in it has
                 confirmed.</p>
               <button type="button" class="primary" data-go="roommates">Your households <span>↗</span></button></div>`
          : filter === 'together'
            ? `<div class="empty small"><h2>Nothing your households can apply for yet</h2>
                 <p>Check what each of you has declared — that is usually what is holding it back.</p>
                 <button type="button" class="primary" data-open-house="${ready[0].id}">Open ${esc(S.nameOf(ready[0]))} <span>↗</span></button></div>`
            : `<div class="empty small"><h2>Nothing here</h2>
                 <p>No listings in this group right now.</p>
                 <button type="button" class="ghost small" data-filter="all">Show all listings</button></div>`}`;
  }

  return { screen, application, review, letterText };
})();
