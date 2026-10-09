/* Market impact: the same people and the same homes, run twice — once where everyone
   searches alone, once where they can team up. The engine is simulation.js, untouched and
   tested; this file only draws it. */
const DemoMarket = (() => {
  'use strict';
  const { esc, euros } = DemoFormat;
  const ROUNDS = DemoData.SETTINGS.rounds;
  let market = null, timer = null, pending = null;

  const size = () => market ? market.size : 150;
  const housed = branch => market.arrived.length - branch.waiting.length;

  /* ---------- drawing ---------- */

  // Where the searcher signed in as would be, in each market. Tells the truth: sometimes
  // both markets house them, sometimes only one, sometimes neither.
  function you(key) {
    const me = DemoData.focalTenant;
    const spot = market[key].allocations.find(a => a.people.some(p => p.id === me.id));
    if (!spot) {
      return `<p class="you-line">${market.arrived.some(p => p.id === me.id)
        ? 'You are still looking' : 'You have not entered the market yet'}</p>`;
    }
    const others = spot.people.filter(p => p.id !== me.id);
    return `<p class="you-line housed">You are housed on ${esc(spot.home.street)}${
      others.length ? ` with ${esc(DemoFormat.names(others))}` : ' on your own'}</p>`;
  }

  function grid(key) {
    const taken = new Map(market[key].allocations.map(a => [a.home.id, a]));
    const justNow = new Set(market[key].latest.map(a => a.home.id));
    return `<div class="market-grid" role="img" aria-label="${
      key === 'baseline' ? 'Homes let when everyone searches alone' : 'Homes let with roommate matching'
    }: ${taken.size} of ${DemoData.homes.length}">
      ${DemoData.homes.map(home => {
        const a = taken.get(home.id);
        const state = !a ? '' : a.people.length > 1 ? ' shared' : ' solo';
        return `<span class="cell${state}${justNow.has(home.id) ? ' fresh' : ''}"></span>`;
      }).join('')}
    </div>`;
  }

  function panel(key, title, note) {
    const branch = market[key];
    const people = housed(branch);
    const share = market.arrived.length ? Math.round(people / market.arrived.length * 100) : 0;
    return `
      <article class="market ${key === 'enhanced' ? 'market-on' : ''}">
        <header>
          <h2>${title}</h2>
          <p class="sub">${note}</p>
        </header>
        <p class="market-figure"><strong>${people}</strong> of ${market.arrived.length || size()} housed
          <span>${share}%</span></p>
        ${grid(key)}
        <p class="market-homes">${branch.allocations.length} of ${DemoData.homes.length} homes let ·
          ${branch.allocations.filter(a => a.people.length > 1).length} shared</p>
        ${you(key)}
      </article>`;
  }

  function screen() {
    if (!market) market = DemoSimulation.createMarket(150);
    const gap = housed(market.enhanced) - housed(market.baseline);
    const done = market.round === ROUNDS;
    return `
      <div class="screen-head">
        <div><h1>Market impact</h1>
          <p class="sub">What happens to everyone, not just you. The same people and the same
            100 homes, run twice.</p></div>
      </div>

      <div class="market-controls">
        <div class="seg-field">
          <span class="label">Seekers</span>
          <div class="segmented" role="radiogroup" aria-label="Number of seekers">
            ${DemoData.SETTINGS.sizes.map(n => `
              <button type="button" role="radio" aria-checked="${n === size()}"
                data-size="${n}" ${timer ? 'disabled' : ''}>${n}</button>`).join('')}
          </div>
        </div>
        <div class="round-field">
          <label class="label" for="round">Round <output id="round-out">${market.round} of ${ROUNDS}</output></label>
          <input type="range" id="round" min="0" max="${ROUNDS}" step="1" value="${market.round}">
        </div>
        <div class="market-buttons">
          <button type="button" class="primary" id="run">${
            timer ? 'Pause' : done ? 'Run again' : market.round ? 'Resume' : 'Run'}</button>
          <button type="button" class="ghost small" id="step" ${done || timer ? 'disabled' : ''}>Next round</button>
        </div>
      </div>

      <div class="markets">
        ${panel('baseline', 'Searching alone', 'Solo lets, plus the occasional group people arrange themselves')}
        ${panel('enhanced', 'With roommate matching', 'The same, plus Stekkies suggesting who fits whom')}
      </div>

      <p class="market-gap" role="status">${market.round
        ? `<strong>${gap >= 0 ? '+' : ''}${gap} more people housed</strong> with roommate matching
           after ${market.round} of ${ROUNDS} rounds`
        : 'Both markets start empty. Press Run.'}</p>

      <div class="legend">
        <span><i></i>Empty</span><span><i class="solo"></i>Let to one tenant</span>
        <span><i class="shared"></i>Let to a household</span>
      </div>

      <details class="disclosure">
        <summary>What this does and does not show</summary>
        <div>
          <p><strong>It is a counterfactual, not a forecast.</strong> Both markets get the same
            people in the same order and draw on the same fixed 100 homes. Only the matching
            rule differs, so the gap between them is caused by that rule and nothing else.</p>
          <p><strong>The data is fictional.</strong> Budgets, incomes, rents and preferences are
            teaching assumptions. The result shows that pooling budgets reaches homes that
            single incomes cannot — not how many people it would house in Rotterdam.</p>
          <p><strong>Mutual acceptance is assumed.</strong> Nobody is rejected by a landlord,
            changes their mind, or pulls out. Real applications fail for all of those reasons.</p>
          <p><strong>Allocation is greedy and order-sensitive.</strong> Early matches take homes
            later ones could have used, so this is a plausible outcome, not the best possible
            one. Rounds are presentation pacing and are not calibrated to real days.</p>
        </div>
      </details>`;
  }

  /* ---------- playback ---------- */

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function advance() {
    DemoSimulation.stepMarket(market);
    if (market.round === ROUNDS) stop();
    DemoStore.actions.repaint();
  }

  // Stepping forward from where we are beats rebuilding the timeline; only a rewind or a
  // population change has to pay for a full replay.
  function seek(round) {
    if (round < market.round) market = DemoSimulation.seekMarket(market.size, round);
    else while (market.round < round) DemoSimulation.stepMarket(market);
    DemoStore.actions.repaint();
  }

  function handle(event) {
    const el = event.target.closest('[data-size],#run,#step');
    if (!el) return;
    if (el.dataset.size) {
      stop();
      market = DemoSimulation.createMarket(Number(el.dataset.size));
    } else if (el.id === 'step') {
      stop(); advance(); return;
    } else if (el.id === 'run') {
      if (timer) { stop(); DemoStore.actions.repaint(); return; }
      if (market.round === ROUNDS) market = DemoSimulation.createMarket(market.size);
      advance();
      if (market.round < ROUNDS) timer = setInterval(advance, 1700);
    }
    DemoStore.actions.repaint();
  }

  // A drag fires far more events than there are rounds, so seeks are coalesced to one a frame.
  function scrub(event) {
    if (event.target.id !== 'round') return;
    const round = Number(event.target.value);
    stop();
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => { pending = null; seek(round); });
  }

  function leave() { stop(); if (pending) cancelAnimationFrame(pending); pending = null; }

  return { screen, handle, scrub, leave, dragging: () => Boolean(pending) };
})();
