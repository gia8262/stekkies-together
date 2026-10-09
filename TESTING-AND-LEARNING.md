# Testing and learning

## Current prototype: a roommate-matching layer inside Stekkies

The prototype is now the product, not a diagram of it. A searcher turns roommate matching on,
writes a profile, browses other searchers, matches with one, messages them and applies to a
home with them. Nothing is scripted — the people, the matches and the homes all come out of the
matching engine, so a different choice gives a different and equally real result.

The market model below is retained, but headless: it no longer has a screen of its own. Its
figures appear on the product's home screen as the reason to try the feature, and a test pins
them so the claim cannot drift from what the model produces.

## The market model behind those figures

Seekers arrive in 12 batches. Individual search and roommate matching receive identical profiles and draw on the same fixed 100-home inventory, which neither market modifies. Each market tracks its own assignments, so the two allocate independently and a home can be let to different people, or to nobody, in each. Each round recalculates matches for the waiting pool. Allocated people and homes remain reserved; people without a match stay available for subsequent arrivals.

The interface shows these events directly: incoming seekers, waiting queues, assigned homes, named households and rent shares. Playback, pause, single-step, a round slider and reset are presentation controls over the same simulation engine.

## Calculated outcomes after 12 rounds

| Seekers | Without platform matching | With grouping | Matched share with grouping | Potential groups |
|---:|---:|---:|---:|---:|
| 50 | 15 (30.0%) | 24 | 48.0% | 10 |
| 150 | 26 (17.3%) | 90 | 60.0% | 30 |
| 300 | 26 (8.7%) | 143 | 47.7% | 46 |

**Corrected figures.** These rows used to read 25, 96 and 163. The engine had been placing
shared groups in Kralingen homes that, under Rotterdam's *Verordening samenstelling
Woningvoorraad 2025* (in force 1 July 2025), cannot legally be shared: a permit is required from
three room occupants (art. 2.2.2), and none are granted in Kralingen Oost or Kralingen West
(art. 2.2.3(1)(d) and bijlage 2). Listings already flagged those homes; the engine did not
check. Ten of the simulation's 94 groups were in them. The conclusion stands at about 3.5 times
as many people housed with matching as without, instead of 3.7.

All figures use fictional input distributions, fixed arrival order and assumed mutual acceptance. They are calculated results, not hardcoded output or evidence of real rental outcomes. Replaying a run is not a new independent trial.

## Learning and iteration

The original prototype calculated all-at-once market snapshots and displayed totals. User review found that this concealed the mechanism: it looked like static statistics rather than a simulation.

The revision introduces explicit arrivals, retained waiting pools and persistent allocations. The visualization follows actual engine state rather than animating predetermined totals. This changes the outcomes: at 150 seekers, the earlier all-at-once calculation matched 98 people; the sequential version matched 96, and 90
once the permit rule above was applied. Earlier assignments constrain later options. These versions are different experiments, so their figures should not be presented as directly interchangeable.

Tests demonstrate that later arrivals can complete groups with earlier waiting seekers. At the same time, larger populations do not guarantee a rising matched share when housing supply stays fixed. Both effects are visible without a separate stress-testing feature.

## Automated verification

Sixty-four checks pass (`node tests.cjs`):

1. The curated tenant trio qualifies for the featured home; Alex cannot rent it alone.
2. Dealbreakers apply in both directions.
3. Budget, location, move date, student rules, sharing and occupancy can each block a match.
4. Guarantor support counts only where permitted by the listing.
5. Empty or insufficient pools produce no invented group.
6. A group cannot contain duplicate people.
7. Final allocations for all three population sizes satisfy eligibility, respect capacity and keep platform formation out of the baseline while permitting eligible self-organized groups.
8. Repeated runs are deterministic and do not mutate source profiles or homes.
9. At every round, prior assignments persist and all arrived seekers are accounted for exactly once as matched or waiting in each market. Stepping after completion does nothing.
10. At least one group includes a person who waited from an earlier round, verifying that the pool is reconsidered.
11. Changing population changes the arrival schedule; invalid population sizes are rejected.
12. Seeking to every round reproduces forward playback exactly; seeking backwards and resuming cannot retain future assignments.
13. Informal groups occur only on seeded opportunity rounds, never more than one per round per market, and still satisfy full eligibility.
14. The outcome figures published in this document are reproduced exactly. This pins the numbers against refactoring: the engine may be rewritten, never made to calculate something else.
15. Self-organized formation is the shared counterfactual. Each market spends the same single informal budget, spends it before any systematic search, and the baseline never produces a platform match.
16. A tenant set forms without reference to any listing: every pair is mutually suitable, nobody unsuitable is suggested, and members share a move month and at least one district, because a set that cannot search together can never apply together.
17. Pooling budgets is what makes listings reachable. Alex reaches none of the 100 listings alone and the confirmed set reaches two, including the featured home at an equal €750 share.
18. A sharing claim on a listing is not treated as a fact. A Kralingen three-bedroom that advertises sharing is returned as permit-required for three tenants and allowed for two, and a listing that is simply silent on sharing is marked unclear rather than hidden.
19. Every profile is browsable: a description over 40 characters, a contact address, an avatar colour, and a name that reads like a name rather than a database row. Descriptions must also genuinely vary, or the grid reads as mail-merge.
20. A description never contradicts the attributes the matcher reads. A profile that says it is up early is an early riser in the data; one that says it smokes, smokes.
21. An invitation names the household it is for, and joining is not agreeing: accepting adds you to that household and opens a conversation, and the household is still not live.
22. A household is ready only when it is both full and agreed. It is the last confirmation — not the invitation, and not the acceptance — that unlocks homes.
23. Several households run in parallel and cover different homes. A household of *n* can only take an *n*-bedroom home, so a two and a three reach disjoint sets and the totals are strictly additive.
24. An invitation into one household does not block one into another.
25. Leaving removes you, and empties the household when you were the last person in it.
26. Every listing is always shown. All 100 are classified as reachable alone, reachable with the household, or out of reach, and an out-of-reach home carries the household size that would make it affordable.
27. Nobody who clashes on a dealbreaker is ever presented as a fit, in either direction, and anyone shown as unsuitable carries a stated reason. You are never suggested to yourself.
28. Signing in as another account shows the same database from their side, with your invitation and its message sitting in their bell.
29. Saying "not for me" records a decline and nothing else — no phantom household, and the person does not return to the grid.
30. An invitation cannot overfill a household, and says so rather than failing silently.
31. Turning roommate matching off leaves the households it hid you from, instead of leaving live households nobody can see.
32. A household whose members clash is reported as a clash, not shown as ready over a reach of zero.
33. Edge cases that would otherwise crash a screen: inviting yourself, an unknown signed-in account, and applications orphaned by a deleted household.
34. **An invitation that is out is visible against the household it was sent for.** The regression check for the worst bug this demo had: sending an invitation changed the stored database and nothing a user could see. The person vanished from the grid, the card still read *"needs 1 more"*, and the invitation rendered nowhere at all. The check now holds that the household can list its own outstanding invitations, that the sender can list what they sent, that the send is confirmed on screen, and that promised places plus free places account for every empty slot.
35. Withdrawing an invitation frees the place and returns that person to the grid, and withdrawing twice or withdrawing an invented id does nothing rather than throwing.
36. Only you can declare your own finances. A non-member has no row to change; declaring salary only counts the salary, and declaring neither counts nothing.
37. The ceiling is the lower of the income rule and the pooled budgets, it says which of the two binds, and it is always a number — never NaN.
38. The shared letter is stored on the household, not regenerated per application. Both members read the same text, the edit is attributed, clearing it falls back to a drafted letter, and the letter is never ungrammatical for a household of one.
39. The readiness checklist belongs to each member separately: your tick is yours and not theirs, and everyone ticking everything is what makes the household ready.
40. Leaving a household with an invitation still outstanding takes the invitation with it, so nobody is left holding an invitation into a household that no longer exists.

41. **Storage written by an older build is repaired, not rendered as undefined.** Households
    only gained a `size` when parallel households were added, and the stored schema version was
    never bumped — so a browser that had opened the demo earlier loaded size-less records and
    showed *"undefined-bedroom household"*, open slots of `NaN`, and a household that could
    never become ready or reach a single home. The load path now migrates: every field the
    current code reads is filled in, a household is at least big enough to hold the people in
    it, and records pointing at people or households that no longer exist are dropped rather
    than rendered.
42. A household is called something a person would recognise, and can be renamed. It is never
    "undefined", it is named after its members once it has any, both members see the same name,
    clearing it restores the default instead of leaving it untitled, and it cannot be pasted a
    novel.

43. **A celebration can never strand the page.** The overlay it lives in is fixed,
    full-screen and locks the body, and it used to be cleared only by its own button — so it
    survived every navigation, the route changed underneath it, and the app looked frozen.
    It is now cleared by navigating, by a close button, by the backdrop and by Escape; leaving
    a household clears its own; and when the 1.1-second timer fires on a screen the reader has
    already moved on to, the news arrives as a line of text instead of a modal.
44. **Accepting leaves you looking at the household you just joined.** It used to route to
    Messages, so the household was never shown and its *confirm your place* button sat on a
    screen you had no reason to visit. You now stay on Roommates with that household pulled to
    the top and flagged, you really are in it, you have not confirmed yet, and the conversation
    still exists — it is simply no longer forced on you. The flag does not follow you around.
45. Searching at a second size carries the people you already have: the sibling household is
    distinct, everyone already with you is invited to it automatically, a duplicate size is
    refused with a reason, and the two cards know they are one plan at two sizes.
46. One invitation can cover several households at once — exactly one invitation per
    household, none into a household with no place free, and it says so rather than failing
    quietly.

47. Inviting someone again after withdrawing really sends a new invitation. The data layer used
    to hand back the withdrawn record, so nothing was pending while the screen said "sent".
    Record ids no longer come from the clock alone, so two made in the same millisecond differ.
48. An invitation that is no longer open cannot be taken up — withdrawn while the recipient's
    bell was still showing it — and the recipient is told why. Declining is acknowledged too.
49. Leaving a household that carries on takes back the invitations you sent into it, so the
    others are not left with someone they never asked on their card. Leaving as the last
    member still marks every invitation into it as gone.
50. Switching accounts leaves nothing of the previous person behind: no household held open,
    no notice about what they did, and only a member can rename a household.
51. A household is named from where the reader stands. Every invitation in a fresh bell used to
    call the sender's household "Your 2-bedroom search"; three people read as a list.
52. **What a household declares is what every screen counts.** Declaring "neither yet" used to
    lower the ceiling on the household page while Listings, the card and the application kept
    offering the same homes. One rule now serves every screen — the engine's own, with a
    guarantor counted only where a listing accepts one — so untouched declarations reproduce
    the engine exactly and no published figure moves.
53. Closing a sheet only closes it — the celebration's ✕ used to send you to Listings — and
    "Edit it" on the application sheet closes the sheet instead of opening the household
    underneath it.
54. Sharing a household is enough to message each other. In a household of three, the member
    who joined last had no conversation with the first, and "Message" opened somebody else's.
55. Also searching at another size carries the people still deciding, refuses a size too small
    for everyone involved, and says which reason applies.
56. A place someone has been invited into is not offered to a second person, a second household
    of the same size is refused, and a notice does not follow you to another page.
57. Nothing scheduled before "Reset everything" writes into the database after it.
58. A reply reaches whoever wrote, even if they switched accounts in the second before it came.
59. **No group is placed in a home it would need an unobtainable permit to share**, in the
    engine or in any of the three simulated markets.
60. **People you could actually apply with come before people you never could.** Someone who
    moves in a different month, or searches none of your areas, used to rank 16th while a
    workable match sat at 102; the ranking now puts where and when before who, the principle
    the engine's own `suggestSet` already followed.
61. Undo puts back exactly what an action changed, compared byte for byte, and refuses once
    anything else has been written, because restoring then would throw that newer change away.
62. Leaving a household, and switching roommate matching off (which leaves every household at
    once), can both be undone.
63. Everyone you could live with can be reached a page at a time. The grid used to stop at 24
    with no way further while 49 workable people sat below.
64. Withdrawing an invitation that was accepted a moment earlier says so, instead of claiming
    it was withdrawn.

**Each of checks 47–64 was run against the code from before they were written, and each fails
there** — on the exact behaviour it names, or, for 61–62, because the behaviour did not exist —
then passes on the fixed code. A check that passes either way proves nothing.

Six harnesses run against the real page, in a DOM and in headless Chrome:

- a **crawler** that clicks every control on every screen in four different account states and
  reports anything that changes stored state without changing the screen;
- an **adversarial pass** of twenty-six scenarios: withdrawing twice, declaring on a household
  you left, both members editing the letter, a race between accepting and withdrawing,
  declaring that nobody can pay, confirming and navigating away, accepting then leaving at
  once, cloning a household twice, a household that fills while the invitation sheet is open,
  the bell's wording and grouping, the household page after an account switch, the message
  link in a household of three, the picker with every place promised, declarations on
  Listings, the checklist's finished state, closing the celebration, "Edit it", and a solo
  application. Against the code from before the latest fixes it reports eighteen problems;
  against the current code, none;
- a **width sweep** from 360px to 1920px that fails on any horizontal overflow not inside a
  scroll container;
- a **boot against storage left by the previous schema**, scanning every rendered screen for a
  raw `undefined` or `NaN`;
- an **accessibility pass in real Chrome**: the sheet is a true modal and Tab never reaches the
  page behind it; Escape closes it and leaves you where you were; the card menu opens from the
  keyboard, under its button, and Escape closes it; every target on the feature's screens is
  at least 24×24px (WCAG 2.2, 2.5.8); Show more reaches every workable person; clicking Undo
  restores exactly the earlier state and is refused after a later change; a hovered toast is
  held past its seven seconds and leaves once let go;
- and the **README's demo script**, performed with real clicks (see below), run twice: with
  animation, and with reduced motion. Both must reach the same end state.

All six are clean.

A separate harness drives the real page in a DOM through the whole product: the empty alert
feed, turning roommate matching on, typing a description and seeing it appear on your own card,
the populated grid, opening a profile, matching, the unlock counter's before and after, the
drafted first message and the reply, the household's pooled figures, the joint application and
the handoff. It also uses the app wrongly on purpose — skipping all 298 other searchers, which
must end in a proper empty state rather than a blank screen.

Layout is checked at 360, 414, 768, 1024, 1440 and 1920 pixels across all five screens: no
horizontal overflow anywhere, and no text rendering below 11px. Every text and background pair
in the palette is checked against WCAG AA 4.5:1. The tenant experience continues to use the same eligibility rules. No external-user acceptance study has been conducted.

## Interpretation boundaries

- This is a controlled demonstration of a grouping mechanism, not a Rotterdam housing forecast.
- Greedy matching is not globally optimal. Both branches evolve separately, so the enhanced branch no longer mechanically preserves every baseline placement.
- Each home is allocated at most once per branch. Each tenant is allocated at most once per branch. A home can have different outcomes across the two counterfactual markets.
- Mutual acceptance is assumed. Real agent checks, willingness to pay, tenant rejection, departures, new listings and real elapsed days are not modeled.
- The fictional mix of housing, incomes and preferences strongly affects the observed improvement.

## Next evidence

A useful subsequent test would observe real prospective users reviewing suggested groups and validate sharing and eligibility assumptions with agents. Neither has been represented as completed.

Browser verification uses the local HTTP preview. The files are ordinary local scripts and styles and open from the filesystem in a normal browser, but font requests are CORS-checked and Chrome and Firefox treat a `file://` page as an opaque origin, so the bundled Inter and Poppins files are refused there and the page silently falls back to system fonts. Serving the folder over local HTTP is the reliable way to see it as designed.

The compact layout revision removes home inspection, places navigation in the header, replaces bedroom dots with numerals and enlarges the colour legend. Official logo and font files are bundled locally.

## Informal roommate formation

The baseline now includes self-organized groups: a shared, fixed-seed 25% chance per round to search for at most one informal group. A successful opportunity still requires a complete group satisfying every budget, landlord and mutual roommate condition. Both counterfactual markets receive the same opportunity schedule; only the feature searches systematically beyond that limit. The setting is an illustrative modelling assumption, not a measured probability of finding roommates.

In the current data, the baseline forms five shared households at each population size. At 150 seekers it matches 26 people versus 90 with the feature, which forms 30 groups in total. Blue tiles identify direct/self-organized placements; green tiles identify platform placements.

The feature's market spends the same informal budget before it searches systematically, so five of its shared households are also shown as self-organized. That is deliberate and conservative: those five are the households the model says would have formed anyway, so the green tiles count only what the feature is responsible for. Checks 13 and 15 hold that attribution in place.

### Structural audits

Two checks look at the code rather than the behaviour, because the worst bug of this project
was an edit that silently deleted five working functions:

- **Every reference resolves.** All twelve modules are loaded live and every `X.y` reference
  in every file is checked against what actually exists, along with every bare function call.
  In the other direction, anything exported or defined that nothing reaches is reported — the
  sign of a caller that was lost. Four long-dead exports and two superseded actions were
  removed this way.
- **Every control is wired.** Every `data-*` attribute any screen renders has a handler and
  every handler's attribute is rendered somewhere; every element id looked up exists; every
  route anything navigates to has a screen; and the click handler's selector and its branches
  match one for one.

Contrast is measured on the rendered page, not from a list of token pairs: every element that
renders text, on every screen, in four account states with the bell and account menu open —
seventy-seven states in all. A hand-picked list is how an 11px label on a non-text token slipped
through once.

Finally, the demo script in the README is performed the way a person performs it — real clicks
and real typing in Chrome, no calls into the store — and the visible result is checked after
each of its ten steps.

### Modelling simplifications, stated

The engine is a controlled mechanism, not a forecast. These choices are deliberate and visible:

- **Income is pooled.** A shared application is judged on everyone's monthly income together
  against three times the rent, the common Dutch rule; some landlords ask four times.
- **A guarantor counts like a salary**, and only where a listing accepts guarantors. In practice
  a guarantor usually has to earn several times the rent themselves; the model does not check
  the guarantor's own income.
- **Permits are modelled by district.** Rotterdam refuses permits in seven named
  neighbourhoods. At the district level the model uses, Kralingen (Oost and West) is the one
  wholly covered; Bergpolder, in Noord, and Oud-Mathenesse, in Delfshaven, are also on the list
  but are not separated out.
- **Rent splits equally**, however the rooms differ.
- **Acceptance is assumed**, allocation is greedy rather than optimal, and arrival order is
  fixed, so a replay is not a new trial.
