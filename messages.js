/* Conversations with the people you have matched or share a household with, and where each
   household you share with them stands. Talking comes first; committing is separate. */
const DemoMessages = (() => {
  'use strict';
  const { esc, euros, avatar } = DemoFormat;
  const S = DemoStore, DB = DemoStore.DB;

  /* Every household this conversation is about — with sibling households, the same two people
     can share a two-bedroom and a three-bedroom search, and both belong here. Confirming is the
     commitment; it only unlocks homes once the household is also full. */
  function householdBoxes(other) {
    const shared = S.myHouseholds().filter(h => h.members.includes(other.id));
    if (!shared.length) {
      return `<div class="propose">
        <strong>Not in a household together</strong>
        <span>Invite them into one from the roommates page.</span>
        <button type="button" class="ghost small" data-go="roommates">Your households</button>
      </div>`;
    }
    return shared.map(householdBox).join('');
  }

  function householdBox(house) {
    const mine = S.me();
    const empty = DB.openSlots(house);
    const free = S.freePlaces(house);
    const reach = S.homesFor(house).length;
    if (DB.isReady(house)) {
      return `<div class="propose done">
        <strong>✓ ${esc(S.nameOf(house))} is ready</strong>
        <span>${reach} home${reach === 1 ? '' : 's'} in range</span>
        <button type="button" class="ghost small" data-go="listings">See them</button>
      </div>`;
    }
    if (empty) {
      return `<div class="propose">
        <strong>${esc(S.nameOf(house))} · ${house.members.length} of ${house.size}</strong>
        <span>Still ${empty} place${empty === 1 ? '' : 's'} to fill before you can apply${
          free < empty ? `, ${empty - free} with an invitation out` : ''}.</span>
        ${free ? `<button type="button" class="ghost small" data-go="roommates">Find ${free} more</button>` : ''}
      </div>`;
    }
    if (!house.confirmedBy.includes(mine.id)) {
      return `<div class="propose waiting">
        <strong>Full — ${esc(S.nameOf(house))} just needs you</strong>
        <span>Confirm and you can start applying together.</span>
        <button type="button" class="primary" data-confirm-household="${house.id}">Confirm your place</button>
      </div>`;
    }
    return `<div class="propose waiting">
      <strong>Waiting on the others to confirm</strong>
      <span>A household only counts once everyone has agreed.</span>
    </div>`;
  }

  function thread(id) {
    const other = DB.profile(id), mine = S.me();
    const messages = DB.thread(mine.id, id);
    return `
      <section class="thread">
        <header class="thread-head">
          ${avatar(other, 44)}
          <div>
            <h2>${esc(other.name)}, ${other.age}</h2>
            <p>${esc(other.role)} · ${euros(other.budget)} a month · ${esc(other.email)}</p>
          </div>
        </header>

        <div class="bubbles">
          ${messages.length
            ? messages.map(m => `<p class="bubble ${m.from === mine.id ? 'mine' : 'theirs'}">${esc(m.text)}</p>`).join('')
            : '<p class="thread-empty">You are connected. Say hello.</p>'}
        </div>

        <form class="composer" data-say="${other.id}">
          <label class="visually-hidden" for="msg-${other.id}">Message ${esc(other.name)}</label>
          <textarea id="msg-${other.id}" rows="2" placeholder="Write a message…"></textarea>
          <button type="submit" class="primary">Send</button>
        </form>

        ${householdBoxes(other)}
      </section>`;
  }

  function screen() {
    const mine = S.me();
    const people = DB.connections(mine.id);
    if (!people.length) {
      return `<div class="empty"><h2>No conversations yet</h2>
        <p>When someone accepts your invitation — or you accept theirs — a conversation opens
          here with their contact details.</p>
        <button type="button" class="${mine.roommateMode ? 'primary' : 'ghost'}"
                data-go="${mine.roommateMode ? 'roommates' : 'profile'}">
          ${mine.roommateMode ? 'Find roommates' : 'Turn on roommate matching'} <span>↗</span></button></div>`;
    }
    const open = S.view.openThread && people.includes(S.view.openThread) ? S.view.openThread : people[0];
    return `
      <div class="screen-head"><div><h1>Messages</h1>
        <p class="sub">${people.length} connection${people.length === 1 ? '' : 's'}. Contact details
          are shared because you both said yes.</p></div></div>
      ${people.length > 1 ? `<div class="thread-tabs">${people.map(id => {
        const p = DB.profile(id);
        return `<button type="button" class="thread-tab ${id === open ? 'on' : ''}" data-thread="${id}">
          ${avatar(p, 26)}${esc(p.name)}</button>`;
      }).join('')}</div>` : ''}
      ${thread(open)}`;
  }

  return { screen };
})();
