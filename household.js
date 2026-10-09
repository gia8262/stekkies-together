/* One household, in full: who is in it, what each person brings, what that lets you carry,
   and the letter you apply with. Deliberately no document uploads — a concept demo has no
   business asking anyone for a passport.

   The page reads top-down as a summary, then the detail: the doorbell plate, where things
   stand, three facts and the one next thing to do, then the sections that explain them. */
const DemoHousehold = (() => {
  'use strict';
  const { esc, euros, avatar, names } = DemoFormat;
  const S = DemoStore, DB = DemoStore.DB;
  const first = person => String(person.name).split(/[\s,]+/)[0];

  // Said in words, because a line through a number does not explain itself.
  const EXPLAIN = {
    salary: () => 'Your salary counts toward the rent. Your guarantor does not.',
    guarantor: () => 'Your guarantor counts toward the rent. Your own salary does not.',
    both: r => `The higher of the two counts, ${euros(r.counts)}, not the sum.`,
    none: () => 'Nothing from your row counts toward the rent yet, so it reads €0.'
  };

  const MODES = [
    ['salary', 'My own salary'],
    ['guarantor', 'A guarantor'],
    ['both', 'Both'],
    ['none', 'Neither yet']
  ];

  /* Where things stand, and the one next action. The same household can need confirming, be
     waiting on someone else, or be ready to apply; the page should say which before anything. */
  function nextStep(house) {
    const me = S.me().id;
    const clash = S.conflicts(house)[0];
    const homes = S.homesFor(house).length;
    const free = S.freePlaces(house);
    const pending = S.pendingFor(house);
    const unconfirmed = house.members.filter(m => !house.confirmedBy.includes(m));
    const list = ids => S.names(ids.map(id => ({ name: first(DB.profile(id)) })));
    if (clash) {
      return { tone: 'clash', text: `${first(clash[0])} and ${first(clash[1])} are not a match, so nothing is open to all of you`, action: '' };
    }
    if (DB.isReady(house)) {
      return homes
        ? { tone: 'ready', text: 'Ready to apply',
            action: `<button type="button" class="primary" data-go="listings">See ${homes} home${homes === 1 ? '' : 's'} <span>↗</span></button>` }
        : { tone: 'wait', text: 'Ready, but nothing clears what you declared yet',
            action: '<a class="ghost button-link" href="#money">Check what you bring</a>' };
    }
    if (DB.isFull(house)) {
      return unconfirmed.includes(me)
        ? { tone: 'act', text: 'Everyone is here. Confirm your place and this household goes live',
            action: `<button type="button" class="primary" data-confirm-household="${house.id}">Confirm my place</button>` }
        : { tone: 'wait', text: `Waiting on ${list(unconfirmed)} to confirm`, action: '' };
    }
    if (pending.length && !free) {
      return { tone: 'wait', text: `${list(pending.map(x => x.person.id))} ${pending.length === 1 ? 'has' : 'have'} not answered yet`, action: '' };
    }
    return { tone: 'act', text: `${house.members.length} of ${house.size} · ${free} room${free === 1 ? '' : 's'} free`,
      action: `<button type="button" class="primary" data-go="roommates">Find someone to invite</button>` };
  }

  function summary(house) {
    const step = nextStep(house);
    const c = S.ceiling(house);
    const homes = S.homesFor(house).length;
    const ticks = house.members.reduce((t, id) => t + S.CHECKS.filter(([k]) => S.ticked(house, id)[k]).length, 0);
    const of = house.members.length * S.CHECKS.length;
    return `
      <section class="hh-summary" data-house="${house.id}">
        <div class="hh-title">
          <!-- The editable box is for the eye; the heading is what a screen reader lands on,
               so replacing the h1 with an input does not cost the page its heading. -->
          <h1 class="visually-hidden">${esc(S.nameOf(house))}</h1>
          <label class="visually-hidden" for="house-name">Household name</label>
          <input id="house-name" class="titlebox" maxlength="48" data-rename="${house.id}"
            size="${Math.max(8, S.nameOf(house).length)}"
            value="${esc(S.nameOf(house))}" aria-describedby="rename-hint">
          ${S.needsSizeChip(house) ? `<span class="chip">${esc(S.sizeLabel(house))}</span>` : ''}
          <!-- A real control, always there. A hint that appeared on hover or focus moved the page
               by a line as focus left the name, so the next click landed somewhere else. -->
          <button type="button" class="linkbutton rename-button" data-rename-focus>Rename</button>
          <span class="visually-hidden" id="rename-hint">Type a new name; it saves as you type.</span>
        </div>
        ${DemoRoommates.plate(house, 32)}
        <p class="pill pill-${step.tone}">${esc(step.text)}</p>
        <dl class="facts">
          <div><dt>Your ceiling</dt><dd>${euros(c.max)}</dd></div>
          <div><dt>Homes to apply for</dt><dd>${DB.isReady(house) ? homes : '–'}</dd></div>
          <div><dt>Ready to apply</dt><dd>${ticks} of ${of}</dd></div>
        </dl>
        ${step.action ? `<div class="hh-action">${step.action}</div>` : ''}
      </section>`;
  }

  /* Who brings what. Each row is editable only by the person it belongs to — you cannot
     declare someone else's income — and the combined column is what a landlord is shown. */
  function money(house) {
    const c = S.ceiling(house);
    const mine = S.me().id;
    const own = S.declared(house, mine);
    return `
      <section class="panel" id="money">
        <h2>What each of you brings</h2>
        <p class="sub">Only you can change your own row.</p>

        <div class="moneytable-wrap">
          <table class="moneytable">
            <thead><tr><th scope="col">Per month</th>
              ${c.rows.map(r => `<th scope="col">${esc(first(r.person))}${r.id === mine ? ' <em>(you)</em>' : ''}</th>`).join('')}
              <th scope="col" class="total">Together</th></tr></thead>
            <tbody>
              <tr><th scope="row">Budget</th>
                ${c.rows.map(r => `<td>${euros(r.budget)}</td>`).join('')}
                <td class="total">${euros(c.budget)}</td></tr>
              <tr><th scope="row">Own salary</th>
                ${c.rows.map(r => {
                  const off = r.mode === 'guarantor' || r.mode === 'none';
                  return `<td class="${off ? 'unused' : ''}">${euros(r.salary)}${off ? '<small>not counted</small>' : ''}</td>`;
                }).join('')}
                <td class="total">${euros(c.rows.reduce((t, r) => t + r.salary, 0))}</td></tr>
              <tr><th scope="row">Guarantor</th>
                ${c.rows.map(r => {
                  const off = r.mode === 'salary' || r.mode === 'none';
                  return `<td class="${r.guarantor && off ? 'unused' : ''}">${
                    r.guarantor ? euros(r.guarantor) : '–'}${r.guarantor && off ? '<small>not counted</small>' : ''}</td>`;
                }).join('')}
                <td class="total">${euros(c.rows.reduce((t, r) => t + r.guarantor, 0))}</td></tr>
              <tr class="counts"><th scope="row">Counts toward rent</th>
                ${c.rows.map(r => `<td>${euros(r.counts)}</td>`).join('')}
                <td class="total">${euros(c.income)}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="field">
          <span class="label">How you cover the rent</span>
          <div class="segmented" role="radiogroup" aria-label="How you cover the rent">
            ${MODES.map(([value, text]) => `<button type="button" role="radio"
              aria-checked="${own.mode === value}"
              data-declare="${house.id}" data-mode="${value}">${text}</button>`).join('')}
          </div>
          <span class="hint">${EXPLAIN[own.mode](own)}</span>
        </div>
        <details class="why"><summary>How is this counted?</summary>
          <p>Landlords judge a shared application on everyone's monthly income together. Where a
            listing accepts guarantors, a guarantor can stand in for a salary that is too low;
            where it does not, only the salary counts. Each of you says which applies to you.</p>
        </details>
      </section>`;
  }

  // Two limits, and which one actually binds: a number with the reason attached.
  function limits(house) {
    const c = S.ceiling(house);
    const open = S.reachFor(house);
    /* The homes listed here must actually clear the ceiling stated directly above them, and
       must be the same homes Listings offers — so they are counted by the store's one rule,
       per home, guarantors included only where a listing accepts them. */
    const clearing = S.homesFor(house);
    const noGuarantors = open.filter(h => !h.guarantorsAllowed && h.rent <= c.max
      && !clearing.includes(h)).length;
    const priciest = clearing.length ? Math.max(...clearing.map(h => h.rent)) : 0;
    const undeclared = c.rows.filter(r => r.mode === 'none');

    return `
      <section class="panel">
        <h2>What that lets you carry</h2>
        <ul class="limits">
          <li><span>Landlords ask three times the rent</span><strong>${euros(c.fromIncome)}</strong></li>
          <li><span>Your budgets together</span><strong>${euros(c.budget)}</strong></li>
          <li class="binding"><span>Your ceiling, set by ${c.bindingIs === 'budget' ? 'your budgets' : 'the income rule'}</span>
            <strong>${euros(c.max)}</strong></li>
        </ul>
        ${!DB.isReady(house)
          ? '<p class="limits-note">Once everyone has joined and confirmed, the homes this reaches appear here.</p>'
          : clearing.length
            ? `<p class="limits-note">${clearing.length === open.length
                  ? `All ${open.length} home${open.length === 1 ? '' : 's'} open to you clear${open.length === 1 ? 's' : ''} it`
                  : `${clearing.length} of the ${open.length} homes open to you clear${clearing.length === 1 ? 's' : ''} it`}${
                priciest ? `, the priciest at ${euros(priciest)}` : ''}.
                <button type="button" class="linkbutton" data-go="listings">See them</button></p>`
            : `<p class="limits-note">None of the ${open.length} home${open.length === 1 ? '' : 's'} open to you
                clears it yet.${undeclared.length
                ? ` ${esc(undeclared.map(r => r.id === S.me().id ? 'You' : r.person.name).join(' and '))}
                    ${undeclared.length === 1 && undeclared[0].id !== S.me().id ? 'has' : 'have'} not said
                    how to cover the rent, which is what is holding it down.`
                : noGuarantors
                  ? ` ${noGuarantors} of them ${noGuarantors === 1 ? 'is' : 'are'} under it but ${noGuarantors === 1 ? 'does' : 'do'} not accept a guarantor.`
                  : ' Raising a budget or adding a guarantor is what moves it.'}</p>`}
        <details class="why"><summary>Why the lower of the two?</summary>
          <p>A landlord will accept you up to a third of your combined income. But you only want to
            pay what your budgets add up to. Whichever is lower is the most you can take on.</p>
        </details>
      </section>`;
  }

  function letter(house) {
    const text = S.letterFor(house);
    const by = house.letterBy ? DB.profile(house.letterBy) : null;
    return `
      <section class="panel panel-wide">
        <h2>Your shared letter</h2>
        <p class="sub">One letter for the household, sent whenever any of you applies.${
          by ? ` Last edited by ${esc(first(by))}.` : ''}</p>
        <label class="visually-hidden" for="house-letter">Shared application letter</label>
        <textarea id="house-letter" class="letterbox" rows="8"
          data-letter="${house.id}">${esc(text)}</textarea>
        <div class="letter-actions">
          <button type="button" class="ghost small" data-copy-letter="${house.id}">Copy letter</button>
          <span class="hint" id="copy-note"></span>
        </div>
      </section>`;
  }

  function checklist(house) {
    const mine = S.me().id;
    const done = S.allTicked(house);
    const ticks = house.members.reduce((t, id) => t + S.CHECKS.filter(([k]) => S.ticked(house, id)[k]).length, 0);
    const of = house.members.length * S.CHECKS.length;
    return `
      <section class="panel panel-wide ${done ? 'panel-done' : ''}">
        <div class="panel-head">
          <h2>${done ? 'Everyone is ready to apply' : 'Ready to apply'}</h2>
          <span class="progress" role="img" aria-label="${ticks} of ${of} ticked">
            <span class="progress-bar" style="--done:${of ? Math.round(ticks / of * 100) : 0}%"></span>
            <span class="progress-text">${ticks} of ${of}</span>
          </span>
        </div>
        <p class="sub">${done
          ? 'When a listing opens, you can be among the first replies.'
          : 'Each of you ticks your own. Agents move on the first replies, so being ready early is most of the advantage.'}</p>
        <div class="checkgrid">
          ${house.members.map(id => {
            const person = DB.profile(id);
            const own = id === mine;
            return `<div class="checkcol">
              <div class="checkwho">${avatar(person, 28)}<strong>${esc(first(person))}${own ? ' (you)' : ''}</strong></div>
              ${S.CHECKS.map(([key, text]) => {
                const on = Boolean(S.ticked(house, id)[key]);
                return `<label class="check ${own ? '' : 'readonly'}">
                  <input type="checkbox" ${on ? 'checked' : ''} ${own ? '' : 'disabled'}
                    data-tick="${house.id}" data-key="${key}">
                  <span>${text}</span></label>`;
              }).join('')}
            </div>`;
          }).join('')}
        </div>
        <p class="hint">Stekkies never asks for passports, payslips or bank statements. Those go to
          the agent, directly from you, after they invite you to view.</p>
      </section>`;
  }

  function screen() {
    // Only ever a household you are in. Without the check, switching accounts could leave the
    // next person looking at, and renaming, somebody else's.
    const asked = DB.householdById(S.view.openHouse);
    const house = asked && asked.members.includes(S.me().id) ? asked : S.myHouseholds()[0];
    if (!house) {
      return `<div class="empty"><h2>No household open</h2>
        <p>Start one from the roommates page and it gets a page like this.</p>
        <button type="button" class="primary" data-go="roommates">Your households <span>↗</span></button></div>`;
    }
    const others = S.membersOf(house).filter(p => p.id !== S.me().id);
    const also = DemoRoommates.alsoSearch(house);
    const step = nextStep(house);

    return `
      <nav class="hh-back" aria-label="Breadcrumb">
        <button type="button" class="linkbutton" data-go="roommates">← All households</button>
      </nav>
      ${summary(house)}
      <div class="hh-sections">
        ${money(house)}
        ${limits(house)}
        ${letter(house)}
        ${checklist(house)}
      </div>
      <div class="household-foot">
        ${others.map(p => `<button type="button" class="linkbutton" data-thread="${p.id}">Message ${esc(first(p))}</button>`).join('')}
        ${also}
        <button type="button" class="linkbutton" data-leave-household="${house.id}">Leave this household</button>
      </div>
      ${step.action ? `<!-- On a phone the next step stays at the foot of the screen. It sits last in the
        page because a sticky-bottom bar only sticks when its place in the flow is below the fold.
        Only one copy is ever displayed, so screen readers never meet it twice. -->
      <div class="hh-actionbar">${step.action}</div>` : ''}`;
  }

  return { screen };
})();
