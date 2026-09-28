/* Playback and visualization only. Market state and decisions live in simulation.js. */
const DemoMarketView = (() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const euros = value => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
  let market, timer = null;
  const personIcon = '<svg viewBox="0 0 16 20" aria-hidden="true"><circle cx="8" cy="5" r="3"/><path d="M2 19v-6a6 6 0 0 1 12 0v6z"/></svg>';
  const homeLabel = home => `Home ${home.id.slice(1)}`;
  const names = people => people.map(p => p.name).join(' + ');

  function controls() {
    const finished = market.round === market.rounds;
    $('run-simulation').textContent = timer ? 'Ⅱ Pause' : finished ? '↺ Replay' : market.round ? '▶ Resume' : '▶ Start';
    $('step-simulation').disabled = finished || Boolean(timer);
    $('pool-size').disabled = Boolean(timer);
    $('round-slider').value = market.round;
    $('round-slider').style.setProperty('--progress', `${market.round / market.rounds * 100}%`);
    $('round-slider').setAttribute('aria-valuetext', `Round ${market.round} of ${market.rounds}`);
    $('round-value').textContent = `${market.round} / ${market.rounds}`;
  }

  function pause() {
    if (timer) clearInterval(timer);
    timer = null;
    if (market) controls();
  }

  function reset() {
    pause();
    market = DemoSimulation.createMarket(Number($('pool-size').value));
    render();
  }

  function advance() {
    DemoSimulation.stepMarket(market);
    if (market.round === market.rounds) pause();
    render();
  }

  function play() {
    if (timer) { pause(); return; }
    if (market.round === market.rounds) reset();
    advance();
    if (market.round < market.rounds) timer = setInterval(advance, 2600);
    controls();
  }

  function waitingPeople(branch) {
    if (!market.round) return `<div class="waiting-dots placeholders" aria-hidden="true">${Array.from({length:12}, () => `<span>${personIcon}</span>`).join('')}</div>`;
    return `<div class="waiting-dots">${branch.waiting.slice(0, 12).map(person => `
      <span class="${market.arrivals.includes(person) ? 'new-arrival' : ''}" title="${esc(person.name)} · ${euros(person.budget)} budget · ${person.moveMonth}">${personIcon}</span>
    `).join('')}${branch.waiting.length > 12 ? `<small>+${branch.waiting.length - 12}</small>` : ''}${!branch.waiting.length ? '<small>No one waiting</small>' : ''}</div>`;
  }

  function homeGrid(key) {
    const branch = market[key];
    const assignments = new Map(branch.allocations.map(a => [a.home.id, a]));
    const recent = new Set(branch.latest.map(a => a.home.id));
    return `<div class="home-grid" aria-label="${key === 'baseline' ? 'Individual search' : 'Together'} housing inventory">
      ${DemoData.homes.map(home => {
        const assignment = assignments.get(home.id);
        const state = assignment ? (assignment.formation === 'platform' ? 'group-home' : 'solo-home') : '';
        const title = `${homeLabel(home)} · ${home.district} · ${home.bedrooms} bed · ${euros(home.rent)} · ${assignment ? names(assignment.people) : 'Unassigned'}`;
        return `<span class="home-tile ${state} ${recent.has(home.id) ? 'just-matched' : ''} "
          title="${esc(title)}" role="img" aria-label="${esc(title)}">
          <strong>${home.bedrooms}</strong>
        </span>`;
      }).join('')}
    </div>`;
  }

  function marketPanel(key, title, description) {
    const branch = market[key];
    const matched = market.arrived.length - branch.waiting.length;
    const alex = branch.allocations.find(a => a.people.some(t => t.id === DemoData.focalTenant.id));
    return `<article class="live-market ${key}">
      <div class="market-panel-heading"><div><h2>${title}</h2><p>${description}</p></div><span>${matched}<small> matched</small></span></div>
      <div class="queue-heading"><strong>${branch.waiting.length} waiting</strong><span>Each figure is a person</span></div>
      ${waitingPeople(branch)}
      <div class="matching-arrow"><span>↓</span>${key === 'baseline' ? 'Search alone or arrange roommates yourself' : 'Pool budgets · Check preferences · Form groups'}</div>
      ${homeGrid(key)}
      <div class="inventory-count">${branch.allocations.length} / ${DemoData.homes.length} homes assigned <span>${branch.allocations.filter(a => a.formation === 'informal').length} self-organized${key === 'enhanced' ? ` · ${branch.allocations.filter(a => a.formation === 'platform').length} platform groups` : ' groups'}</span></div>
      <div class="alex-tracker"><span class="mini-avatar">A</span><p><strong>Alex</strong> ${alex ? `→ ${homeLabel(alex.home)}${alex.people.length > 1 ? ` with ${esc(names(alex.people.filter(t => t.id !== DemoData.focalTenant.id)))}` : ' · searching alone'}` : market.round ? 'is still looking' : 'has not arrived yet'}</p></div>
    </article>`;
  }

  function roundActivity() {
    if (!market.round) return '<p class="round-empty">Round activity appears here when you start or move the slider.</p>';
    const rows = market.enhanced.latest;
    return `<div class="activity-heading"><strong>Round ${market.round}: ${market.arrivals.length} new seekers</strong><span>${rows.length} households assigned with matching</span></div>
      <div class="arrival-strip"><span>Arriving →</span>${market.arrivals.slice(0, 6).map(t => `<span class="arrival-person">${esc(t.name)} <small>${euros(t.budget)}</small></span>`).join('')}${market.arrivals.length > 6 ? `<small>+${market.arrivals.length - 6} more</small>` : ''}</div>
      <div class="match-events">${rows.length ? rows.map(a => `
        <div class="match-event"><span>${esc(names(a.people))}</span><span class="event-arrow">→</span><span>${homeLabel(a.home)} <small>${euros(a.home.rent / a.people.length)} each</small></span></div>
      `).join('') : '<p>No new household could be formed this round. Unmatched seekers stay available for the next arrivals.</p>'}</div>`;
  }

  function render() {
    const arrived = market.arrived.length;
    const baselineMatched = arrived - market.baseline.waiting.length;
    const enhancedMatched = arrived - market.enhanced.waiting.length;
    $('simulation-results').innerHTML = `
      <div class="market-meta"><div class="market-legend"><span><i></i>Unassigned</span><span><i class="solo-key"></i>Direct / self-organized</span><span><i class="group-key"></i>Platform-matched</span><span class="bedroom-key"><b>3</b> Bedrooms per home</span></div><span class="round-status">${arrived} / ${market.size} arrived${market.round === market.rounds ? ' · Complete' : ''}</span></div>
      <div class="live-markets">${marketPanel('baseline', 'Without roommate matching', 'Solo search + occasional self-organized groups')}${marketPanel('enhanced', 'With roommate matching', 'Same seekers and homes')}</div>
      <div class="live-outcome" role="status">${!market.round ? 'Both markets start empty. Matching is recalculated after each batch of arrivals.' : `<strong>${enhancedMatched - baselineMatched >= 0 ? '+' : ''}${enhancedMatched - baselineMatched} people matched with the feature</strong><span>${baselineMatched} / ${arrived} without matching · ${enhancedMatched} / ${arrived} with matching</span>`}</div>
      <section class="round-activity" aria-label="Current round activity">${roundActivity()}</section>
`;
    controls();
  }

  function init() {
    $('run-simulation').onclick = play;
    $('step-simulation').onclick = () => { pause(); advance(); };
    $('reset-simulation').onclick = reset;
    $('pool-size').onchange = reset;
    $('round-slider').oninput = () => {
      const round = Number($('round-slider').value);
      pause();
      market = DemoSimulation.seekMarket(Number($('pool-size').value), round);
      render();
    };
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    reset();
  }
  return { init, pause, reset };
})();
