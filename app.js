/* UI only. Change fixtures in data.js, rules in matching.js, summaries in simulation.js. */
(() => {
  'use strict';
  const { focalTenant, focalHome, tenants, labels } = DemoData;
  const $ = id => document.getElementById(id);
  const money = amount => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const monthName = value => ({ Oct: 'October', Nov: 'November' }[value] || value);
  const group = DemoMatching.findGroup(focalHome, tenants.slice(0, 3), focalTenant.id);
  // Hydrate the static layout from the same editable fixtures used by the matcher.
  function populateFixtures() {
    const profile = document.querySelector('.profile-card');
    profile.querySelector('.avatar').textContent = focalTenant.name[0];
    profile.querySelector('h2').textContent = `${focalTenant.name}, ${focalTenant.age}`;
    profile.querySelector('.profile-top p').textContent = focalTenant.role;
    const facts = [money(focalTenant.budget), monthName(focalTenant.moveMonth), focalTenant.districts.join(' · ')];
    profile.querySelectorAll('.profile-line strong').forEach((node, i) => { node.textContent = facts[i]; });
    profile.querySelector('.chips').innerHTML = ['cleanliness', 'routine', 'sociability'].map(key => `<span>${escape(labels[key][focalTenant.lifestyle[key]])}</span>`).join('');
    profile.querySelector('.essential p').textContent = focalTenant.dealbreaker ? labels[focalTenant.dealbreaker][focalTenant.lifestyle[focalTenant.dealbreaker]] : 'No essential preference';
    document.querySelector('.home-heading .eyebrow').textContent = `${focalHome.district}, Rotterdam`;
    document.querySelector('.price strong').textContent = money(focalHome.rent);
    document.querySelector('.home-heading h2').textContent = `${focalHome.bedrooms}-bedroom apartment`;
    document.querySelector('.home-facts').innerHTML = [
      `${focalHome.bedrooms} bedrooms`, `${focalHome.area} m²`, `Available ${monthName(focalHome.moveMonth)}`,
      focalHome.sharingAllowed ? 'Sharing allowed' : 'No sharing'
    ].map(text => `<span>${escape(text)}</span>`).join('');
    const rentPanels = document.querySelectorAll('.rent-comparison > div');
    rentPanels[0].querySelector('strong').innerHTML = `${money(focalHome.rent)} <small>${focalHome.rent > focalTenant.budget ? 'over budget' : 'within budget'}</small>`;
    rentPanels[1].querySelector('span').textContent = `With ${focalHome.bedrooms - 1} roommates`;
    rentPanels[1].querySelector('strong').innerHTML = `${money(focalHome.rent / focalHome.bedrooms)} <small>each / month</small>`;
    $('pool-size').innerHTML = DemoData.SETTINGS.sizes.map(size => `<option value="${size}"${size === DemoData.SETTINGS.sizes[1] ? ' selected' : ''}>${size} seekers</option>`).join('');
  }
  function switchView(view) {
    const isTenant = view === 'tenant';
    if (isTenant) DemoMarketView.pause();
    $('tenant-view').hidden = !isTenant; $('simulation-view').hidden = isTenant;
    [['tenant-tab', isTenant], ['simulation-tab', !isTenant]].forEach(([id, active]) => {
      $(id).classList.toggle('active', active);
      if (active) $(id).setAttribute('aria-current', 'page'); else $(id).removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function stage(name) {
    ['home', 'people', 'ready'].forEach((key, index) => {
      $(`${key}-stage`).hidden = key !== name;
      $(`step-${key}`).classList.toggle('current', key === name);
      $(`step-${key}`).classList.toggle('done', index < ['home', 'people', 'ready'].indexOf(name));
      if (key === name) $(`step-${key}`).setAttribute('aria-current', 'step'); else $(`step-${key}`).removeAttribute('aria-current');
    });
    const heading = $(`${name}-stage`).querySelector('h2');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }
  function detailRows(rows) {
    return rows.map(([label, value]) => `
      <div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>
    `).join('');
  }

  function roommateCard(person, index) {
    const preference = person.dealbreaker
      ? labels[person.dealbreaker][person.lifestyle[person.dealbreaker]]
      : 'None specified';
    return `
      <article class="roommate-card">
        <div class="roommate-top">
          <span class="avatar ${index ? 'avatar-luca' : 'avatar-mina'}">${escape(person.name[0])}</span>
          <div><h3>${escape(person.name)}, ${person.age}</h3><p>${escape(person.role)}</p></div>
        </div>
        <dl class="profile-details">${detailRows([
          ['Monthly budget', money(person.budget)],
          ['Move-in', monthName(person.moveMonth)],
          ['Required preference', preference]
        ])}</dl>
      </article>`;
  }

  function preferenceComparison() {
    const fields = [
      ['smoking', 'Smoking'], ['cleanliness', 'Cleanliness'],
      ['routine', 'Daily routine'], ['sociability', 'Sociability']
    ];
    return `
      <section class="match-section" aria-labelledby="preferences-heading">
        <h3 id="preferences-heading">Household preferences</h3>
        <div class="preference-table-wrap">
          <table class="preference-table">
            <thead><tr><th scope="col">Preference</th>${group.map(person => `
              <th scope="col">${escape(person.id === focalTenant.id ? 'You' : person.name)}</th>
            `).join('')}</tr></thead>
            <tbody>${fields.map(([key, title]) => `
              <tr><th scope="row">${title}</th>${group.map(person => `
                <td>${escape(labels[key][person.lifestyle[key]])}${person.dealbreaker === key
                  ? '<span class="required-marker" aria-label="Required preference" title="Required preference">*</span>' : ''}</td>
              `).join('')}</tr>
            `).join('')}</tbody>
          </table>
        </div>
        <p class="table-key">* Required preference</p>
      </section>`;
  }

  function listingRequirements() {
    const incomeSupport = group.reduce((total, person) => total + (focalHome.guarantorsAllowed
      ? Math.max(person.income, person.guarantorIncome || 0) : person.income), 0);
    return `
      <details class="listing-requirements">
        <summary><span>Rental requirements</span><span class="requirements-status">Meets stated criteria <span aria-hidden="true">⌄</span></span></summary>
        <dl class="detail-list">${detailRows([
          ['Occupants', `${group.length} people / ${focalHome.maxOccupants} allowed`],
          ['Students', focalHome.studentsAllowed ? 'Accepted' : 'Not accepted'],
          ['Guarantors', focalHome.guarantorsAllowed ? 'Accepted' : 'Not accepted'],
          ['Income required', `${money(focalHome.rent * focalHome.incomeMultiple)} / month combined`],
          ['Income / guarantor support', `${money(incomeSupport)} / month combined`],
          ['Move-in', monthName(focalHome.moveMonth)]
        ])}</dl>
        <p class="table-key">Based on profile information. Documents still need to be checked by the agent.</p>
      </details>`;
  }

  function renderGroup() {
    if (!group) {
      $('people-stage').innerHTML = `
        <div class="group-panel"><h2>No matching roommates</h2>
          <p class="panel-lede">No complete group currently meets this home’s requirements and your household preferences.</p>
          <button class="secondary" id="back-home">Back to the home</button>
        </div>`;
      $('back-home').onclick = () => stage('home');
      stage('people');
      return;
    }
    const roommates = group.filter(person => person.id !== focalTenant.id);
    $('people-stage').innerHTML = `
      <article class="group-panel">
        <h2>Suggested roommates</h2>
        <p class="panel-lede">${escape(focalHome.district)} · ${focalHome.bedrooms}-bedroom apartment · ${escape(monthName(focalHome.moveMonth))} move-in</p>
        <div class="roommate-grid">${roommates.map(roommateCard).join('')}</div>
        <section class="match-section" aria-labelledby="rent-heading">
          <h3 id="rent-heading">Rent split</h3>
          <dl class="detail-list rent-details">${detailRows([
            ['Total monthly rent', money(focalHome.rent)],
            [`Your share · ${group.length} equal shares`, `${money(focalHome.rent / group.length)} / month`],
            ['Bills', 'Not included']
          ])}</dl>
        </section>
        ${preferenceComparison()}
        ${listingRequirements()}
        <div class="group-actions">
          <button class="text-button" id="back-home">← Back to the home</button>
          <button class="primary" id="accept-group">I’m interested <span>↗</span></button>
        </div>
      </article>`;
    $('back-home').onclick = () => stage('home');
    $('accept-group').onclick = renderReady;
    stage('people');
  }

  function renderReady() {
    $('ready-stage').innerHTML = `
      <article class="ready-panel">
        <h2>Group summary</h2>
        <p class="panel-lede">${escape(focalHome.district)} · ${focalHome.bedrooms}-bedroom apartment</p>
        <dl class="detail-list">${detailRows([
          ['Group members', group.map(person => person.name).join(', ')],
          ['Your monthly rent', money(focalHome.rent / group.length)],
          ['Bills', 'Not included'],
          ['Move-in', monthName(focalHome.moveMonth)],
          ['Application status', 'Not submitted']
        ])}</dl>
        <div class="next-card">
          <strong>Contact the estate agent</strong>
          <p>Prepare income or guarantor documents for each applicant and request a viewing. The agent will need to confirm eligibility and availability.</p>
        </div>
        <button class="primary" id="see-impact">Open market simulation <span>↗</span></button>
      </article>`;
    $('see-impact').onclick = () => { switchView('simulation'); $('run-simulation').focus({ preventScroll: true }); };
    stage('ready');
  }
  $('tenant-tab').onclick = () => switchView('tenant');
  $('simulation-tab').onclick = () => switchView('simulation');
  $('find-roommates').onclick = renderGroup;
  document.querySelector('.brand').onclick = event => { event.preventDefault(); switchView('tenant'); };
  $('reset-demo').onclick = () => {
    $('pool-size').value = String(DemoData.SETTINGS.sizes[1]);
    DemoMarketView.reset();
    document.querySelector('.assumptions').open = false;
    switchView('tenant'); stage('home');
  };
  populateFixtures();
  DemoMarketView.init();
})();
