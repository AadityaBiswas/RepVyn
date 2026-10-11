# RepVyn UX decision log

Working record for the brand-led UX pass started 10 Oct 2026. Audit: [AUDIT.md](AUDIT.md).

## Known facts

- Mobile-first web app (Preact, `app/`), wired to `src/engine`. Launch markets US and India. Payments via Razorpay.
- Brand commitments in DESIGN.md (greys, one red for effort, Geist, body figure) were approved earlier and are kept.

## Open questions

- Business model: what is free and what is paid (needed before decision 9).
- Native wrapper or web/PWA at launch.

## Decisions

| ID | Decision | Status | Your answer |
|---|---|---|---|
| 01 | Brand brief and voice ([proposal](proposals/01-brand-brief.md)) | Implemented 10 Oct: DESIGN.md "Brand and voice", PRODUCT.md palette corrected | Add this |
| 02 | First run that states the promise, with kg or lb ([proposal](proposals/02-first-run.md)) | Implemented and tested 10 Oct ([screens](screens/5-first-run-built.png)): welcome screen, Units row on About you (lb default on US devices), 1 lb / 1 kg steps | Add this |
| 03 | First-week Progress payoff ([proposal](proposals/03-first-week-progress.md)) | Implemented and tested 11 Oct ([screens](screens/6-progress-built.png)): outlined days before you joined, Strength "starting point" list, strength in your units | Add this |
| 04 | Ending early lands on Today, rest days in plain words ([proposal](proposals/04-end-early.md)) | Awaiting answer | — |
| 05 | A reason to use every feature: premium, real-progress incentives ([plan](proposals/05-incentives.md)) | Answered 11 Oct: growth vs start, weekly celebration, full-screen moment, share after workout; Canva mockup before each build. Part 1 built 11 Oct: finish flow (Workout done with kcal and most-worked contour lines, What RepVyn learned, growth since day 1, share card) ([screens](screens/11-finish-flow.png)). Parts 2 and 3 built 11 Oct after three mockup rounds (proposals/05-recovery-week-v3): Body tab strain bars (bar = strain, dark red 75%+, red 30-75%, light red under 30%, then muted Ready), original time slider that snaps silently to ready times; Progress This week and Weeks on plan cards coloured by workout intensity; red Week N on plan moment after the week's last planned workout ([screens](screens/13-recovery-week.png)) | Built |
