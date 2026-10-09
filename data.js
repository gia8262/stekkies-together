/* Fixtures. This is the file to edit to change the scenario: budgets, rents, the housing
   mix, the demo trio and the model's tuning all live here.

   Everything is generated from one fixed seed, so the whole demo replays identically.
   That makes the generator order-sensitive: the random draws below happen in source
   order, and `sharingAllowed` only draws for multi-bedroom homes. Reordering or adding
   a property that draws changes every profile after it. Change values freely; move
   lines only if you mean to regenerate the dataset. */
(function (root) {
  'use strict';

  // requiredMatches is a count, not a fraction: with four lifestyle attributes the only
  // reachable compatibility scores are 0, .25, .5, .75 and 1, so a fractional threshold
  // silently changes meaning the moment an attribute is added or removed.
  const SETTINGS = Object.freeze({
    sizes: [50, 150, 300],
    homeCount: 100,
    rounds: 12,
    seed: 2026,
    requiredMatches: 3,
    anchorLimit: 24,
    informalOpportunityRate: 0.25,
    // Rotterdam requires a room-rental permit to share with 3+ tenants and issues no new
    // ones in these districts, so a listing there cannot be taken at its word.
    permitDistricts: ['Kralingen']
  });

  const labels = {
    smoking: { no: 'No indoor smoking', yes: 'Indoor smoking OK' },
    cleanliness: { tidy: 'Tidy', relaxed: 'Relaxed' },
    routine: { early: 'Early routine', late: 'Late routine' },
    sociability: { quiet: 'Quiet home', social: 'Social home' }
  };

  const districts = ['Kralingen', 'Delfshaven', 'Noord', 'Centrum'];
  // Listings are addressed and attributed like the real thing, so two homes with the same
  // rent and size still read as two different properties. Both are indexed, never drawn,
  // so adding them leaves every seeded value untouched.
  const streets = [
    'Vierambachtsstraat', 'Oostzeedijk', 'Nieuwe Binnenweg', 'Bergweg', 'Schiedamseweg',
    'Claes de Vrieselaan', 'Goudsesingel', 'Beukelsdijk', 'Rochussenstraat', 'Voorschoterlaan',
    'Mathenesserlaan', 'Jonker Fransstraat', 'Hoflaan', 'Zwaanshals', 'Aelbrechtskade',
    'Boergoensevliet', 'Noordsingel', 'Havenstraat', 'Pleinweg', 'Statensingel'
  ];
  const agents = [
    'Woonstad Rotterdam', 'Ooms Makelaars', 'Rotterdam Apartments', 'De Vries Wonen',
    'Maas Vastgoed', 'Kolpa Makelaars'
  ];
  const names = [
    'Alex', 'Mina', 'Luca', 'Noor', 'Sam', 'Iris', 'Ravi', 'Emma', 'Jules', 'Nina',
    'Omar', 'Liv', 'Robin', 'Tess', 'Dani', 'Sasha', 'Ari', 'Mika', 'Ellis', 'Lena'
  ];
  // A surname initial rather than a number, so the grid reads "Mina V." and never "Alex 11".
  const surnames = ['V', 'D', 'B', 'K', 'S', 'M', 'J', 'R', 'T', 'H', 'L', 'P', 'N', 'W', 'G'];

  /* Profile descriptions. Every sentence is keyed to an attribute the matcher actually
     reads, so a tidy early riser's description says so and the text explains the match
     rather than decorating it. Assembled from the profile index with plain arithmetic —
     no random draws — so adding this leaves every seeded value in the dataset untouched. */
  const lines = {
    Student: [
      'Second-year psychology student at EUR.',
      'Doing my master’s in urban planning.',
      'Architecture student, mostly living in the studio.',
      'Law student, here until at least next summer.',
      'Finishing my thesis this year, so I’m home a lot.',
      'Research master in economics, two days on campus.',
      'Design student — usually covered in paint.',
      'Studying medicine, long days at Erasmus MC.'
    ],
    'Young professional': [
      'Just started at an engineering firm in the centre.',
      'Work in marketing, three days a week in the office.',
      'Junior developer, mostly working from home.',
      'Nurse at Erasmus MC, so my shifts move around.',
      'Work at a gallery near Witte de Withstraat.',
      'Consultant — away for work some weeks.',
      'Teach at a secondary school here in the city.',
      'Work in logistics down at the port.'
    ],
    cleanliness: {
      tidy: [
        'I clean as I go and I’d like a kitchen we can all actually use.',
        'I’m tidy without being intense about it.',
        'I like the shared rooms clear; my own room is my own problem.'
      ],
      relaxed: [
        'I’m relaxed about mess, as long as the kitchen doesn’t get out of hand.',
        'Not the tidiest person alive, but I do my share when it’s my turn.',
        'I’d rather we agree a rota than all pretend we’re spotless.'
      ]
    },
    routine: {
      early: [
        'I’m up early most days.',
        'Early riser — usually out of the door before nine.',
        'Mornings are my good hours; I fade after ten at night.'
      ],
      late: [
        'I’m a night person and I work late.',
        'I come alive around ten in the evening.',
        'Late sleeper, so I’m very quiet in the mornings.'
      ]
    },
    sociability: {
      social: [
        'I like people around and I always cook too much.',
        'Happy to share dinners and have friends over now and then.',
        'I’d like a house where we actually talk to each other.'
      ],
      quiet: [
        'I keep to myself on weeknights.',
        'I want a calm house — friendly, but not a party flat.',
        'I’m sociable, but I need quiet when I’m working.'
      ]
    },
    smoking: 'I smoke, but strictly outside.',
    dealbreaker: {
      smoking: 'No smoking indoors — that one’s firm for me.',
      cleanliness: 'Sharing the cleaning properly matters more to me than anything else.',
      routine: 'Matching daily rhythms is the thing I care most about.',
      sociability: 'How sociable the house is, is the bit I won’t compromise on.'
    }
  };

  // Two of the three lifestyle sentences, chosen by index so bios vary in shape and length.
  function writeBio(person, i) {
    const of = (list, step) => list[(i * step) % list.length];
    const traits = ['cleanliness', 'routine', 'sociability'];
    const skipped = traits[i % traits.length];
    // Steps must be coprime with the list length (3) or every profile picks the same line.
    const step = { cleanliness: 7, routine: 5, sociability: 11 };
    const body = traits
      .filter(trait => trait !== skipped)
      .map(trait => of(lines[trait][person.lifestyle[trait]], step[trait]));
    const extras = [];
    if (person.lifestyle.smoking === 'yes') extras.push(lines.smoking);
    if (i % 4 === 0) extras.push(lines.dealbreaker[person.dealbreaker]);
    const role = /student/i.test(person.role) ? 'Student' : 'Young professional';
    return [of(lines[role], 7), ...body, ...extras].join(' ');
  }

  // All amounts and distributions below are teaching assumptions, not market estimates.
  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }
  const rng = random(SETTINGS.seed);
  const pick = values => values[Math.floor(rng() * values.length)];

  const tenants = Array.from({ length: 300 }, (_, i) => ({
    id: `t${i + 1}`,
    name: `${names[i % names.length]}${i >= names.length ? ' ' + surnames[Math.floor(i / names.length) % surnames.length] + '.' : ''}`,
    age: 22 + (i % 8),
    role: rng() < 0.65 ? 'Student' : 'Young professional',
    budget: pick([650, 750, 850, 950, 1100, 1300]),
    income: pick([800, 1200, 1800, 2500, 3500]),
    guarantorIncome: rng() < 0.65 ? 3000 : 0,
    districts: [districts[i % 4], districts[(i + 1) % 4]],
    moveMonth: pick(['Oct', 'Oct', 'Nov']),
    lifestyle: {
      smoking: rng() < 0.85 ? 'no' : 'yes',
      cleanliness: pick(['tidy', 'relaxed']),
      routine: pick(['early', 'late']),
      sociability: pick(['quiet', 'social'])
    },
    dealbreaker: pick(['smoking', 'cleanliness', 'routine', 'sociability'])
  }));

  // Three deliberately legible profiles for the scripted tenant journey. Applied after
  // generation, so overwriting them does not shift anyone else's draws.
  const baseLifestyle = { smoking: 'no', cleanliness: 'tidy', routine: 'early', sociability: 'social' };
  ['Alex', 'Mina', 'Luca'].forEach((name, i) => Object.assign(tenants[i], {
    name,
    age: [24, 23, 25][i],
    role: ['Master’s student', 'Master’s student', 'Young professional'][i],
    budget: [850, 800, 900][i],
    income: [1200, 1000, 2800][i],
    guarantorIncome: i < 2 ? 3000 : 0,
    districts: ['Delfshaven', 'Centrum'],
    moveMonth: 'Oct',
    lifestyle: { ...baseLifestyle },
    dealbreaker: ['smoking', 'cleanliness', 'routine'][i]
  }));

  /* Everything a person needs to be browsable: a description, a contact address, an avatar
     colour, and whether they already asked to team up with you. All indexed, never drawn.
     `likesYou` is written from Alex's point of view because Alex is who you sign in as. */
  tenants.forEach((person, i) => {
    person.bio = writeBio(person, i);
    person.email = `${person.name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.$/, '')}@mail.example`;
    person.avatarHue = (i * 47) % 360;
    // Rare on purpose: a badge everyone carries is not a signal.
    person.likesYou = i > 0 && i % 41 === 0;
  });

  // The two people the scripted journey leans on get descriptions written by hand, because
  // they are the ones anyone trying the demo is most likely to read in full.
  tenants[1].bio = 'Thesis year in psychology, so I’m home most days with my laptop. I cook '
    + 'almost every night and I’d genuinely like to eat together sometimes. Tidy in the '
    + 'kitchen, calm on weeknights, and completely fine with Friday being loud.';
  tenants[2].bio = 'Just started at an engineering firm near Blaak. Up early, out by eight, '
    + 'and usually cooking by seven. I like a house where people actually talk to each other '
    + 'rather than three strangers sharing a fridge.';
  tenants[1].likesYou = true;
  tenants[2].likesYou = false;
  // Alex's own starter text, which you are meant to rewrite on the profile screen.
  tenants[0].bio = '';

  // The first 20 homes are single-bedroom; the rest cycle through 2-4 bedrooms.
  const homes = Array.from({ length: SETTINGS.homeCount }, (_, i) => {
    const bedrooms = i < 20 ? 1 : 2 + (i % 3);
    return {
      id: `h${i + 1}`,
      title: bedrooms === 1 ? 'A place of your own' : 'Room to share',
      street: `${streets[i % streets.length]} ${7 + (i * 13) % 180}`,
      agent: agents[i % agents.length],
      listedMinutesAgo: 3 + (i * 7) % 55,
      district: districts[i % 4],
      bedrooms,
      maxOccupants: bedrooms,
      rent: bedrooms === 1 ? pick([1000, 1150, 1250]) : bedrooms * pick([650, 750, 850, 950]),
      area: bedrooms === 1 ? 35 + i % 15 : 35 + bedrooms * 18,
      moveMonth: pick(['Oct', 'Oct', 'Nov']),
      sharingAllowed: bedrooms > 1 && rng() < 0.9,
      studentsAllowed: rng() < 0.8,
      guarantorsAllowed: rng() < 0.75,
      incomeMultiple: 3
    };
  });

  // A deliberate teaching case, not the featured home: a 3-bedroom in Kralingen whose
  // listing claims sharing is allowed. Sharing it with three tenants needs a room-rental
  // permit that Rotterdam no longer issues there, so the extension flags it rather than
  // taking the listing at its word. The featured home is h38, in Delfshaven.
  Object.assign(homes[20], {
    title: 'A little more room. Together.',
    district: 'Kralingen',
    bedrooms: 3,
    maxOccupants: 3,
    rent: 2250,
    area: 92,
    moveMonth: 'Oct',
    sharingAllowed: true,
    studentsAllowed: true,
    guarantorsAllowed: true
  });

  const api = { SETTINGS, labels, districts, tenants, homes, focalTenant: tenants[0], focalHome: homes[37] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DemoData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
