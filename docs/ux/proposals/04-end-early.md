# Proposal 04: Ending a workout early lands on Today, in plain words

Status: **awaiting your answer**. Preview: [04-end-early-preview.png](04-end-early-preview.png). Left is what you see now after X → End workout; right is the Today screen you would land on instead (already built, unchanged).

## Problem (observed in the v3 build, 11 Oct)

- After X → End workout the app goes back to the workout page, not Today.
- After 10 sets it reads "Rest day · Systemic fatigue high: 15.0 vs typical session 12.0" with a faded Start button. That is engine text (`src/engine/state.ts`), which PRODUCT.md rules out.
- After 3 sets it offers a fresh "Full body · 5 exercises · Start workout", which reads as "you didn't finish, start again".
- The same raw engine text is used for any rest day on Today and the workout page (`planWhy` in `app/src/model.ts`, the workout page subtitle in `pages.tsx`), for example "No major muscle group ready."

## Proposal

1. **End workout goes to Today**, exactly like finishing: the day fills in and the card says "Done for today". Sets already logged are kept, as they are now.
2. **Rest days explain themselves in plain words**, on Today and the workout page:
   - Trained today: "Rest now. Your next workout will be ready tomorrow." (the line Today already uses).
   - Otherwise: "Your legs and chest are still recovering. RepVyn plans your next workout once they're ready." (names the most-loaded muscles, ready / recovering / resting words only).
   - Engine reasons stay in the engine; no numbers like "15.0 vs 12.0" reach the screen.

## Why

- Brief: Honest (say why in one sentence) and Steady (rest is part of the plan; quitting early is not a failure to be re-offered).
- Nielsen's heuristics: speak the user's language, not system terms, and keep a clear way out ([10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)). Expert guidance, not tested evidence for this app.

## How

`endWorkout` in `app/src/ui/app.tsx` closes the workout page too and sets the Today tab, like `finishWorkout`. A `restWhy` helper in `model.ts` builds the sentence from readiness; `planWhy` and the workout page use it. One test for each.

## Trade-off and check

- The finish animation would also play after an early end. That is honest (the sets were done), but it is a small celebration of a partial workout.
- Check: end a workout after 3 sets and after 10 sets; both land on Today, and no screen shows a number that isn't sets, reps, minutes or weight.
