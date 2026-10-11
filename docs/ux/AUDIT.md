# RepVyn brand-led UX audit

Date: 10 Oct 2026, revised the same day. Method: built the app from your folder's current source (v3), walked it at 390 × 844 in light and dark (first run → program → Today → workout → rest → done → Body, Progress, Profile), and read PRODUCT.md, DESIGN.md and docs/design-spec.md. Screens are in [screens/](screens/).

Nothing here has been tested with real users. "Observed" means I saw it in the build; everything else is labelled as a hypothesis or judgment.

## What already works

- One clear job per screen, and the Today card states its reason in one sentence ("Your first workout. Every set teaches RepVyn what you can do."). This is the product's real point of difference.
- The body figure is the strongest brand asset: it appears on Today, the workout page, Body, Progress and the finish screen, so the app has one picture language.
- "Red means effort" is held consistently, including the rest-screen reps-in-reserve scale.
- Dark mode is a true mirror; nothing broke.
- The in-workout panel puts every control in thumb reach with an oversized rep count.

## Brand-swap test

Remove the name and the red, and most screens read as a well-made generic iOS fitness app: system greys, Geist, pills, big titles. What survives the swap is the body figure and the one-sentence reason. The voice is almost absent by design ("no captions"), so the app's personality has to come from those two things plus motion. Verdict: **partly passes**. The fix is not more decoration; it is giving the readiness idea and the figure more of the moments that matter (first run, finishing, the first week).

## Findings, by flow

Severity: **A** blocks trust or launch, **B** weakens the core promise, **C** polish.

| # | Flow | Observed | Sev |
|---|---|---|---|
| 1 | First run | Opens straight on "Your goal". The name RepVyn and the promise ("the app decides what to train, you train") never appear before four questions. | B |
| 2 | First run | Body weight is asked in kg before units exist. RepVyn launches in the US, where most people think in lb. | A |
| 3 | Today ↔ Workout page | ~~Today card and workout page showed different times.~~ Only in an older copy; v3 shows 30 min on both. | Fixed |
| 4 | Progress | ~~Showed 0 sets after a workout.~~ Not a real bug: my test finished a workout in 20 seconds, inside the app's one-minute clock tick. After the tick, Progress counts every set correctly. | Not a bug |
| 5 | Progress, first week | An empty grey grid with one red square is the "payoff" screen. Product principle 3 says progress should be visible from day one. | B |
| 6 | Finish | "Workout done" shows time/sets/reps but not what the engine learned, even though the first workout is pitched as calibration. | B |
| 7 | Profile | "Reminders 6:30 pm" looks live but reminders are stored, not sent (README). That is a broken promise if shipped. | A |
| 8 | Progress | "1-week streak · day 1" counts weeks, which is kind to rest days, but "streak" framing invites loss feelings later. Worth a deliberate decision. | C |
| 9 | Workout | Video and thumbnails are placeholders; the camera icon is the dominant visual during a set. | B (launch) |
| 10 | Program picker | Tabs read "Upper body / Legs" but bars read "Upper body / Lower body / Core". Small vocabulary mismatch. | C |
| 11 | Access | v3 already moved light `faint` to #85858B, which is 3.29:1 on the ground: passes 3:1 for large title halves. Keep it off small text. | Fixed |
| 12 | Money | There is no paid tier, offer or Razorpay flow yet. Business model is undecided in the docs. | A (launch) |
| 14 | Workout | Ending a workout early with X lands on the workout page. After 10 sets it reads "Rest day" with engine text: "Systemic fatigue high: 16.6 vs typical session 12.0" (from `src/engine/state.ts`), and a disabled Start button; after 3 sets it offers a new workout instead. Raw engine jargon is ruled out in PRODUCT.md. | A |
| 13 | Docs | PRODUCT.md listed the older v1 palette. Corrected in decision 01. | Fixed |

## Proposed order of decisions

Each is one dialog: proposal, why, how, trade-off, then Add / Revise / Skip.

1. **Brand brief and voice** (foundation for everything below).
2. **First run that states the promise**, with units chosen by region (fixes 1, 2).
3. **First-week Progress payoff** (5). Built 11 Oct.
4. **End early lands on Today, plain-word rest days** (14). Added 11 Oct as a launch blocker.
5. **"What RepVyn learned" on the finish screen** (6).
6. **Reminders: send them or remove the row** (7).
7. **Consistency framing: streak vs weekly plan** (8).
8. **Paid offer and Razorpay checkout** (12) — needs your business model first.
9. **Exercise media direction** (9) — needs real footage or a decision on illustration.

## Sources used so far

- Apple, [Communicate your brand identity on iOS](https://developer.apple.com/videos/play/wwdc2026/251/) (WWDC26), accessed 10 Oct 2026. Brand belongs in the content layer; keep navigation familiar. iOS guidance, not proof of outcomes.
- Ryan & Deci (2000), [Self-Determination Theory](https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf). Autonomy and competence as motivation considerations. Broad theory, not app validation.
- Frontiers in Psychology (2026), [fitness-app need support and women's exercise adherence](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1752995/full), accessed 10 Oct 2026. Cross-sectional survey, n=721, China; need support associated with adherence via self-efficacy. Correlational only; did not separate autonomy from competence.
- ScreensDesign, [Fitbod flow showcase](https://screensdesign.com/showcase/fitbod-gym-fitness-planner), accessed 10 Oct 2026. Observed pattern: 14-step onboarding, body recovery map that explains the day's workout, soft paywall after the first workout is generated. Adoption, not evidence it works.
- W3C, [SC 1.4.3 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
