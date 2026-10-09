# Stekkies · roommate matching

A working prototype of a roommate-matching layer inside Stekkies. Alex already has a Stekkies
account and already gets listing alerts — that part is the backdrop. The new thing is that he
can turn on roommate matching, write a profile, browse other searchers, match with one, message
them, and **apply to a home together** that neither of them could reach alone.

The demo has **two sides**. There is a simulated database behind it, so you can send an
invitation as one person, switch accounts, find it waiting as the other, answer it, and talk
before either of you commits to anything. Nothing is scripted: the people, the invitations and
the homes all come out of the matching engine and a real store, so anyone who picks a different
roommate gets a different and equally real result.

## Open it

```
python3 -m http.server 8000     # then open http://localhost:8000
```

Double-clicking `index.html` works too, but browsers apply CORS rules to font requests and
treat a `file://` page as an opaque origin, so Chrome and Firefox refuse the bundled Inter and
Poppins files and fall back to system fonts. Safari is fine either way. No installation,
account or internet connection is needed.

## Before you present

Click **Reset everything**, bottom right, so the demo opens on Alex's empty search. If you
click it by accident later, **Undo** in the notice brings everything back. A refresh returns to
the screen you were on. Short on time? Turn matching on, open the bell, **Accept** Mina's
invitation and **Confirm**: the household goes live in two clicks, because Mina has already
confirmed her side.

## What to show

1. **Home.** Alex's search returns *0 new matches this week*, and the box says why: 10
   one-bedroom homes in his areas, none inside his €850, the cheapest is €1,000. That is not a
   bad search — it is the market.
2. **Profile.** Turn roommate matching on. It is off by default and the copy says what turning
   it on means: other searchers can see you. Write a description; it appears live on your card.
   A notice says eight people searching your areas have already asked to team up; they are in
   the bell, top right. Every invitation says whether you could actually apply with that
   person, in the grid's own words: Mina's reads *+6 two-bed homes together*, Mina B.'s reads
   *Moving in November, you in October*. Five of the eight could never apply with Alex, so
   accepting is a decision rather than a guess.
3. **Start a household, or two.** Roommates opens on *Your households*. Each one is drawn as a
   **doorbell plate**, the panel of name tags by the door of every Dutch shared house: one tag
   per bedroom, filling as people join, and each tag's bell lights once that person has
   confirmed. One line says where the household stands, one button says what to do next, and
   everything else (message, also search at another size, leave) sits in its ⋯ menu. Each
   household carries a name you choose (*Rename* on its page); left alone it names itself after
   the people in it. Start one for a two-bedroom and another for a three-bedroom: a household
   of *n* can only take an *n*-bedroom home, so running both covers more of the market.
   Below, the people grid is ranked by **who can actually apply with you** (same move month, a
   shared area) and then by fit, a dozen at a time with *Show more*. Each card says what
   teaming up would open (*+4 two-bed homes together*) and what sets this person apart.
   *Everyone* shows the rest, each with the reason they cannot apply with you.
4. **Invite someone into one of them.** Open a profile, compare household preferences side by
   side, and tick **as many of your households as you would consider** — one invitation covers
   a two-bedroom and a three-bedroom at once, rather than two trips through the sheet. Their
   name tag appears on each plate straight away, dashed and marked *invited*, and the card
   reads *"Luca has not answered yet"*. A toast confirms it with **Undo**, and the page scrolls
   up to the households so you can watch the tag land. The bell lists it under *Waiting on an
   answer*, where it can still be withdrawn.
5. **Become them.** Open the account menu, top right, and switch to the person you just
   invited — they are first in the list because they owe you an answer. Your invitation is in
   their bell with your message — several invitations from one person arrive as one card with
   a row per household, each answered on its own. Accepting leaves you looking at the
   household you have just joined: it is pulled to the top of *Your households*, badged
   **Just joined**, with **Confirm my place** as its button. With motion on, your face flies
   from the account chip onto your new name tag. Switch back to Alex afterwards and a notice
   says what happened while he was away: *Luca said yes, and Alex & Luca is ready with 6 homes
   to apply for.*
6. **Confirm.** Joining is not agreeing: the household is not live until **every member
   confirms**. When the second one does, the counter runs **0 → 6 homes you can now apply
   for**.
7. **Open the household.** Click the card, and it grows into the household's page: the plate,
   one line on where you stand, three facts (your ceiling, the homes you can apply for, how
   ready you are) and the one next step. Below, each member declares how they cover the rent — own
   salary, a guarantor, both, or neither yet — and only their own row. A figure that does not
   count is labelled *not counted* and a line underneath says why, in words. The combined
   column is what a landlord is shown, and the page states the two limits and which one
   actually binds: the income rule allows €1,933, the pooled budgets cap it at €1,750, so
   €1,750 is the real ceiling. Change a declaration and every screen moves with it — this
   page, the card, Listings and the application. Pick *Neither yet* and the homes are marked
   *short on declared income* everywhere, with the reason, instead of being offered. Below it, one shared letter either of
   you can edit and copy, and a readiness checklist each member ticks for themselves.
   No documents are uploaded anywhere: the page says so, because a concept demo has no
   business asking for a passport.
8. **Apply together.** The application is pre-filled with the household's own letter — not a
   fresh one generated and thrown away. **Copy letter and apply** puts it on the clipboard for
   real, and the hand-off says so (or says copying was blocked), then sends you to the agent's
   own site, because Stekkies never handles the application itself.
   **Messages** work the same way: write to your housemate and they answer about where you
   stand, a day you mention first (*"Saturday works for me. Fingers crossed for Oostzeedijk
   160."*). If the household is only waiting on them, they confirm as they say so.
9. **Market impact.** The same 150 people and the same 100 homes, run twice — once where
   everyone searches alone, once where they can team up. Watch both grids fill over 12 rounds.
   At 150 seekers, 26 are housed searching alone and 90 when they can team up. Under each grid
   a line says where Alex ends up: at 300 seekers, alone he is housed only in the last round,
   by the one self-organised group the model allows; with matching he is housed in round 1,
   on Claes de Vrieselaan with Iris, Ari and Luca. That is one person's story, not the
   evidence; the counts above the grids are. Open the caveats panel before anyone asks:
   fictional data, mutual acceptance assumed, greedy allocation.

**Every reversible action can be undone.** Sending, withdrawing and declining invitations,
*Not for me*, leaving a household, switching roommate matching off and *Reset everything* each
confirm themselves in a toast with **Undo**, instead of an "are you sure?" in front of every
click. Undo puts the whole demo back exactly as it was. Once anything else has changed, the
button goes, so it never throws away newer work.

**One household per size, without doing everything twice.** A household of *n* can only take
an *n*-bedroom home, so considering two sizes means two households. *Also try as a
3-bedroom* on any household builds the second one for you — same name, same people, with the
invitations already sent, including to anyone you asked who has not answered yet. It only
offers sizes everyone fits into (three people are never offered a two-bedroom), and only
when there is someone to carry over. The two cards say they are one plan at two sizes rather
than reading as unrelated searches. A place someone has already been invited into is
promised, so it is never offered to a second person.

**Listings always shows all 100 homes.** Teaming up never makes the market look smaller — it
re-prices it. Homes out of reach carry the household size that would change that
(*"Would need 2 tenants"*), which is the pitch stated as a fact rather than a slogan.

Try it wrongly too: decline everyone, invite someone into a household that clashes, withdraw
an invitation, declare that nobody can pay, leave a household with an invitation still out,
turn roommate matching off, refresh mid-flow. Each has its own honest state.

## How it is built

No libraries, no build step, no network calls. Every file is plain ES5-compatible JavaScript
loaded with `defer`.

| File | Responsibility |
|---|---|
| `data.js` | Fixed-seed profiles, descriptions, listings and settings |
| `matching.js` | Compatibility, dealbreakers, eligibility, reachable homes, sharing status |
| `simulation.js` | Headless market model; supplies the evidence figures on the home screen |
| `db.js` | The simulated database: accounts, invitations, conversations, households. Persists to localStorage |
| `store.js` | View state and the actions that change it |
| `format.js` | Currency, months, HTML escaping, generated avatars |
| `roommates.js` | Your households, the people grid, the profile sheet |
| `messages.js` | Conversations between people who have matched |
| `listings.js` | Every listing, its reachability, and the joint application |
| `household.js` | One household in full: declarations, the binding ceiling, the shared letter, readiness |
| `market.js` | Market impact: the same people and homes run twice, side by side |
| `app.js` | Shell, navigation, home screen, profile editor |
| `theme.css` | Design tokens and local fonts — the only file that defines a colour |
| `styles.css` | Everything else |
| `tests.cjs` | 77 checks over the engine, the fixtures, the database and the store |
| `OPERATING-MODEL.md` | The business process behind the feature: AI/human split, unit costs, governance |

Colours, type sizes and radii are tokens in `theme.css`. Every text pair clears WCAG AA
(4.5:1), the type scale is fluid and stays in `rem` so browser text-size settings still work,
and nothing renders below 11px. The home illustration and the match counter both stop moving
under `prefers-reduced-motion`.

Change budgets, rents, the housing mix and the model's tuning in `data.js`; change the matching
policy in `matching.js`. Everything on screen is computed from those two files — including the
figures quoted on the home screen, which come from `simulation.js` and are pinned by a test, so
a claim on the front page cannot drift away from what the model produces.

Profile descriptions are assembled from sentence banks keyed to each person's real attributes,
so a tidy early riser's description says so. They are generated by arithmetic on the profile
index, never by a random draw, which is why adding them left the seeded dataset untouched.

## Model boundaries

- 100 fictional homes: 20 one-bedroom and 80 multi-bedroom, some unsuitable for sharing.
- Hard checks: budget, district, moving month, occupancy, student and sharing permission,
  income or permitted guarantor support, and every tenant's own dealbreaker.
- Other lifestyle preferences rank candidates; each pair must match on at least 3 of the 4
  (`SETTINGS.requiredMatches`).
- A household of *n* fills an *n*-bedroom home and splits the rent equally. Income and
  guarantor rules are fictional teaching assumptions.
- A listing's own claim that sharing is allowed is not treated as fact. Sharing three or more
  bedrooms in a district in `SETTINGS.permitDistricts` is reported as needing a room-rental
  permit, and a listing silent on sharing is marked unclear rather than hidden, because a call
  to the landlord settles it.
- A household of *n* can only take an *n*-bedroom home. Relaxing that to "*n* or more" changes
  the outcome for 15 of 1,904 compatible pairs, because affordability binds long before the
  bedroom count does — so the stricter rule stays.
- Accounts, invitations, conversations and households live in `localStorage` under one key.
  "Reset everything" clears them. Nothing leaves the browser.
- Mutual acceptance is assumed. No real applications, leases, withdrawals or new listings
  occur, and the market figures test a mechanism, not the Rotterdam market.
- No live AI service is used. The rules run in the browser. Fixed data makes replay
  deterministic; repeating a run is not additional independent evidence.

Academic concept only; not affiliated with Stekkies. Fonts, the logo and the bundled photo are
stored locally, so the demo makes no remote asset requests.

## Credits

The [official Stekkies wordmark](https://www.stekkies.com/static/roomraider/img/logo-text-red.svg),
[Poppins Bold](https://www.stekkies.com/cf-fonts/s/poppins/5.2.7/latin/700/normal.woff2) and
[Inter variable](https://www.stekkies.com/cf-fonts/v/inter/5.2.8/latin/wght/normal.woff2) are
served by the [official site](https://www.stekkies.com/en/) and saved locally for offline use.
The logo remains a Stekkies brand asset; the brand colour `#f16259` is taken from it. Font
families are open source: [Poppins](https://github.com/itfoundry/Poppins) and
[Inter](https://github.com/rsms/inter).

`assets/apartment-living-room.jpg` is
[an interior in Amsterdam](https://unsplash.com/photos/interior-photograph-of-a-living-room-NzESioIWtvA)
by Ben den Engelsen under the [Unsplash License](https://unsplash.com/license). It is bundled
but not currently displayed — one photograph cannot stand in for several distinct listings.
