# Testing and learning

## Current prototype: a stateful market simulation

Seekers arrive in 12 batches. Individual search and roommate matching receive identical profiles and independent copies of the same 100-home inventory. Each round recalculates matches for the waiting pool. Allocated people and homes remain reserved; people without a match stay available for subsequent arrivals.

The interface shows these events directly: incoming seekers, waiting queues, assigned homes, named households and rent shares. Playback, pause, single-step, a round slider and reset are presentation controls over the same simulation engine.

## Calculated outcomes after 12 rounds

| Seekers | Without platform matching | With grouping | Matched share with grouping | Potential groups |
|---:|---:|---:|---:|---:|
| 50 | 16 (32.0%) | 26 | 52.0% | 11 |
| 150 | 24 (16.0%) | 92 | 61.3% | 31 |
| 300 | 26 (8.7%) | 163 | 54.3% | 52 |

All figures use fictional input distributions, fixed arrival order and assumed mutual acceptance. They are calculated results, not hardcoded output or evidence of real rental outcomes. Replaying a run is not a new independent trial.

## Learning and iteration

The original prototype calculated all-at-once market snapshots and displayed totals. User review found that this concealed the mechanism: it looked like static statistics rather than a simulation.

The revision introduces explicit arrivals, retained waiting pools and persistent allocations. The visualization follows actual engine state rather than animating predetermined totals. This changes the outcomes: at 150 seekers, the earlier all-at-once calculation matched 98 people; the sequential version matches 92. Earlier assignments constrain later options. These versions are different experiments, so their figures should not be presented as directly interchangeable.

Tests demonstrate that later arrivals can complete groups with earlier waiting seekers. At the same time, larger populations do not guarantee a rising matched share when housing supply stays fixed. Both effects are visible without a separate stress-testing feature.

## Automated verification

Thirteen checks pass:

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

Browser checks cover the visual market, manual steps, automatic playback through completion, slider navigation and the controls. The tenant experience continues to use the same eligibility rules. No external-user acceptance study has been conducted.

## Interpretation boundaries

- This is a controlled demonstration of a grouping mechanism, not a Rotterdam housing forecast.
- Greedy matching is not globally optimal. Both branches evolve separately, so the enhanced branch no longer mechanically preserves every baseline placement.
- Each home is allocated at most once per branch. Each tenant is allocated at most once per branch. A home can have different outcomes across the two counterfactual markets.
- Mutual acceptance is assumed. Real agent checks, willingness to pay, tenant rejection, departures, new listings and real elapsed days are not modeled.
- The fictional mix of housing, incomes and preferences strongly affects the observed improvement.

## Next evidence

A useful subsequent test would observe real prospective users reviewing suggested groups and validate sharing and eligibility assumptions with agents. Neither has been represented as completed.

Browser verification uses the local HTTP preview. Direct file navigation is blocked by the app browser; the portable files use ordinary local scripts and styles and are designed for opening in a normal browser after extraction.

The compact layout revision removes home inspection, places navigation in the header, replaces bedroom dots with numerals and enlarges the colour legend. Official logo and font files are bundled locally.

## Informal roommate formation

The baseline now includes self-organized groups: a shared, fixed-seed 25% chance per round to search for at most one informal group. A successful opportunity still requires a complete group satisfying every budget, landlord and mutual roommate condition. Both counterfactual markets receive the same opportunity schedule; only the feature searches systematically beyond that limit. The setting is an illustrative modelling assumption, not a measured probability of finding roommates.

In the current data, the baseline forms five shared households at each population size. At 150 seekers it matches 24 people versus 92 with the feature, which forms 31 groups in total. Blue tiles identify direct/self-organized placements; green tiles identify platform placements.

Check 13 verifies that informal groups occur only on seeded opportunity rounds, never more than one per round per market, and still satisfy full eligibility.
