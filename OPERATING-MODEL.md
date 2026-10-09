# Operating model: how roommate matching actually runs

Written for the report, not the demo. This is the business process behind the prototype —
what happens at each step, which decisions the system makes and which the tenant makes, what
each step costs, and where a human has to be standing. It supports §4 Economics and
§7 Governance of *Transforming Stekkies*.

All monetary figures are the illustrative estimates from that proposal. All volume figures
come from the market model in `simulation.js` and are reproduced by `node tests.cjs`.

---

## 1. The process, end to end

| # | Step | Who decides | Cost driver |
|---|---|---|---|
| 1 | Tenant turns roommate matching on | **Tenant** | — |
| 2 | Tenant writes a profile: description, budget, dates, areas, four household preferences, one dealbreaker | **Tenant** | Profile data pipeline (fixed) |
| 3 | Stekkies ranks other searchers: same move month, then overlapping areas, then household preferences, then closest budget. Anyone clashing on either side's dealbreaker is never shown as a fit | **Algorithm** | AI inference per run |
| 4 | Tenant reviews suggestions with the reason shown, and skips or asks to team up | **Tenant** | — |
| 5 | Both sides having asked = a match. Only now are names and contact details exchanged | **Algorithm** (mechanical) | Identity verification per member |
| 6 | Pooled budget and income re-run the tenant's existing alerts | **Algorithm** | AI inference |
| 7 | Listings are checked for sharing permission, the municipal room-rental permit, occupancy and combined income; anything failing is shown **with the reason** rather than hidden | **Algorithm** | AI inference |
| 8 | Household applies together. Stekkies hands off to the agent's own site | **Tenant** | — |
| 9 | Disputes, reports of fake profiles, harassment or discrimination | **Human moderator** | Moderation per tenant set |

The split at steps 3–4 is deliberate and follows the prediction/judgment distinction
(Agrawal et al., 2022): **the engine predicts who fits, the tenant judges whether to live with
them.** Suggestions, rankings and alerts can therefore run automatically, because a poor
suggestion costs nothing to decline. Step 8 is different — it can lead to a joint lease — so
it never happens without explicit tenant action. If Stekkies later adds agents that respond or
book viewings automatically, they must not contact an agent, share documents or make a payment
without confirmation: automated systems are hard to stop once running (Iansiti & Lakhani, 2020),
and responding is the step where a mistake is hardest to undo.

---

## 2. Unit economics per confirmed household

Fixed, one-time: matching algorithm **€80,000–120,000**, profile data pipeline
**€20,000–30,000**.

Variable, per confirmed household:

| Household size | AI inference | Identity verification | Moderation & disputes | **Total** |
|---|---|---|---|---|
| 2 people | €1–3 | €6–10 | €10–15 | **€17–28** |
| 3 people | €1–3 | €9–15 | €10–15 | **€20–33** |
| 4 people | €1–3 | €12–20 | €10–15 | **€23–38** |

Against a Tenant Set pass of **€120–150 per confirmed group**, split between members:

| Household size | Contribution per group |
|---|---|
| 2 people | €92–133 |
| 3 people | €87–130 |
| 4 people | €82–127 |

**Break-even on the build:** between **~750 confirmed groups** (best case: €100k build,
€133 contribution) and **~1,830** (worst case: €150k build, €82 contribution).

The number that matters for the report is the shape, not the precision: **the dominant new
cost is human, not algorithmic.** Inference is €1–3; verification and moderation are €16–35.
This corrects the common assumption that an AI feature scales at near-zero marginal cost
across the board — the algorithm does, the trust layer around it does not.

---

## 3. What scales and what does not

| System | Scales with volume? |
|---|---|
| Matching algorithm and profile infrastructure | Yes — near-zero marginal cost |
| Identity verification | No — roughly linear in members |
| Moderation, disputes, appeals | No — roughly linear in households |
| Legal accountability across shared leases | No — case by case |

AI support for moderators (drafted case summaries, clustering duplicate reports) can slow that
growth without replacing judgment; AI assistance raised customer-support productivity by about
15% on average (Brynjolfsson et al., 2025). It changes the slope, not the shape.

---

## 4. Where the money is triggered

A household counts as **confirmed** only once every member has approved it. Payment attaches
to that moment, not to elapsed time. This matters for two reasons:

- **Economically**, it aligns price with the moment value is delivered, and shifts the
  existing flat subscription toward usage-based pricing.
- **Ethically**, it means revenue follows a choice the tenants made, never a suggestion the
  algorithm made. An algorithm that could bill by producing suggestions would have an
  incentive to produce more of them.

The existing alert-only subscription becomes the entry tier, and the Tenant Set tier sits
above it — second-degree price discrimination by versioning, with tenants self-selecting.

> **Check before submission.** The proposal quotes the alert tier at ≈€50/month or
> €100/season. Stekkies' public pricing is **€29.95 for one month, €19.95/month for two, and
> €16.65/month for three**, with a second user free. The Tenant Set pass should be positioned
> against the real figures, or the €120–150 group fee looks disproportionate.

---

## 5. Failure modes and where each is caught

| Failure | Caught by | In the prototype |
|---|---|---|
| Members do not trust each other enough to apply | Verification before matching; contact shared only on mutual yes | Names and contact appear only after both sides say yes |
| Household responds too slowly | Criteria and letter agreed in advance so any member can send | Joint application is pre-filled with both profiles |
| Unsuitable suggestions | Dealbreakers enforced both ways; reason shown on every non-fit | Blockers are displayed on the tile and in the profile |
| Too few compatible searchers | Honest empty state rather than padding the list | "That's everyone for now" |
| Ranking disadvantages international tenants | No nationality, ethnicity or religion collected; outcomes monitored per group | Not collected anywhere in `data.js` |
| Fake profiles, document misuse | Identity verification per member; owner-controlled document access | Contact withheld until mutual interest |
| Listing does not permit sharing | Permit and sharing status checked per listing | `sharingStatus()` returns allowed / unclear / permit-required |
| Disagreement after signing | Out of scope — Stekkies is not a party to the lease | Stated at handoff |

The last row is the boundary of the product. Stekkies hands off to the agent and never touches
the application or the lease. Until a lease is signed any member can leave; after it is signed
all members are jointly liable for the full rent, and the prototype says so at the handoff
rather than burying it.

---

## 6. Governance obligations this creates

- **A data protection impact assessment before launch.** The engine systematically evaluates
  personal preferences, which triggers the Dutch DPA's requirement (Autoriteit
  Persoonsgegevens, 2019).
- **Fixed preference options, no free text in the model.** Household preferences can reveal
  Article 9 special-category data — religion through dietary requirements, for instance — so
  the matched attributes are a closed list. The written description is shown to people but is
  not an input the matcher reads.
- **One named owner of the matching process,** with escalation paths, logged decisions and an
  appeals route for moderation outcomes (Mantia et al., 2025).
- **Outcome monitoring by group,** specifically whether tenants moving from abroad form
  households as often and as quickly as tenants already in the Netherlands. The feature exists
  to undo exclusion; it must be measured for reproducing it.
- **Staying outside EU AI Act Annex III.** This remains true while Stekkies matches tenants to
  each other. It would likely change if Stekkies assessed, on a landlord's behalf, whether a
  household can afford the rent — that is credit scoring, and high-risk.

---

## 7. What the market model supports, and what it does not

At 150 seekers against 100 homes, the model produces:

| | Searching alone | With roommate matching |
|---|---|---|
| People housed | 26 (17%) | **90 (60%)** |
| Homes let | 15 of 100 | **40 of 100** |
| Shared households formed | 5 | **30** |

These are corrected figures; an earlier version read 96, 42 and 32. The engine had been housing
groups in Kralingen homes that need a room-rental permit Rotterdam does not grant
(*Verordening samenstelling Woningvoorraad 2025*, art. 2.2.2 and 2.2.3(1)(d)). With the rule
applied, matching houses about 3.5 times as many people as searching alone, not 3.7.

**Supported:** pooling budgets reaches homes that single incomes cannot, and the effect grows
with the size of the searcher pool because there are more compatible combinations to find.

**Not supported:** any claim about speed. On average people are housed in round 7.3 alone and
round 6.8 with matching, and the difference is noise. The feature does not make housing faster; it makes housing
*possible* for people who had no route to it. Any "X times faster" claim should be cut.

**Also not supported:** absolute numbers for Rotterdam. The data is fictional, arrival order is
fixed, mutual acceptance is assumed, and allocation is greedy rather than optimal. It is a
controlled counterfactual demonstrating a mechanism, not a forecast.
