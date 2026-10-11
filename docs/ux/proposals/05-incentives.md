# Proposal 05: A reason to use every part of RepVyn

Status: **answered 11 Oct 2026**; each piece is mocked up in Canva for your approval before it is built.

## Your answers (11 Oct)

- Reward: **muscle growth compared with where you started**, not levels or points.
- Streak: replaced by a **weekly plan celebration**, once a week.
- Big moments: a **short full-screen moment**.
- Sharing: **after a workout**, showing its results.
- Paid plan: decided later. Reminders: added later.
- Order: 1) "What RepVyn learned" on the finish screen, 2) the body recovery timeline (shown to you first), 3) the weekly celebration. Each one is designed in Canva and confirmed by you before it goes into the app. Built from the current app (v3 + decisions 01–03 + icons and motion, 11 Oct 2026) and the engine's own outputs.

## The rule: premium gamification, not points

Premium here means the reward is always **something real that happened to your body or your training**. That might be a muscle getting ready again, a harder exercise earned, a record, or a week of the plan done. RepVyn already computes all of these (`readiness`, `hoursToReady`, `ladderLevel`, `regionLevel`, `insights`). There are no coins, no XP and no confetti. Brand check: **Decisive** (one clear next step), **Honest** (only real numbers), **Steady** (rest never breaks anything).

Basis: Self-determination theory links lasting motivation to feeling competent and in control ([Ryan & Deci 2000](https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf)). Rewards that show competence tend to support that, while rewards that feel like control tend to undermine it. This is broad theory, not tested in RepVyn. Every idea below is a hypothesis to check with real users.

## Feature by feature

For each feature: **Why use it**, then where the reason is weak, **However, the user might not use it because…** and **What would make them want to**.

### 1. Opening the app each day (Today)
- **Why use it:** it says what to train today and why, in one sentence.
- **However, the user might not use it because** on a rest day, or once they know their routine, there's nothing new to see.
- **What would make them want to:** a **morning readiness moment**. The figure on Today is lit by what recovered overnight ("Legs ready again. Chest ready at 4 pm"). On rest days the card shows what is recovering and when, so rest is still progress. Every day has a new, true answer.

### 2. Body tab (which muscles are trained or ready)
- **Why use it:** to see which muscles are ready, recovering or resting.
- **However, the user might not use it because** it's a still picture that changes slowly. You can't see it change hour by hour, so there's no reason to come back.
- **What would make them want to:**
  - **A recovery timeline:** drag a slider from "now" to "tomorrow 7 am" and watch the muscles fade from red to ready. The engine already knows `hoursToReady` for each muscle.
  - **A live countdown on each muscle** ("Ready in 5 h").
  - **Muscle levels:** each muscle group has a level from the engine's `regionLevel`, which rises with real strength. "Glutes, level 3" becomes "level 4" only when the numbers say so.

### 3. Daily check-in (how you feel, anything sore)
- **Why use it:** it makes today's plan fit your body.
- **However, the user might not use it because** the answer seems to change nothing. It feels like a form.
- **What would make them want to:** show the effect right away, for example "Lighter legs today because your quads are sore." Over weeks, show what it learned: "You're usually sore for 2 days after legs. Your plan now waits 2 days." This is already in `insights` as soreness.

### 4. Changing time, intensity and equipment
- **Why use it:** to fit the workout to the day.
- **Already done (11 Oct):** rows animate in and out, numbers roll, and a note says what changed. The reward is seeing the plan rebuild instantly. No more needed here.

### 5. During the workout (sets, rest, reps left)
- **Why use it:** it counts sets and rest, so you don't have to.
- **However, the user might not use it because** answering "reps left" after every set feels like admin.
- **What would make them want to:** show that the answer matters. After a set, show a short line when the engine adjusts ("Next set: 2 more reps"), and a **record flash** when a set beats your best. A record is real, so it can be celebrated: a short red sweep and one line, with no confetti.

### 6. Finishing a workout
- **Why use it:** to close the workout.
- **However, the user might not use it because** time, sets and reps are numbers they already know.
- **What would make them want to:** **"What RepVyn learned"**: one to three plain lines from `insights` (calibration done, a record, a muscle levelled up), plus the body figure lighting up what was trained. This was item 4 in the audit order.

### 7. Earned exercises (new)
- **Why it would exist:** the catalog already has progression ladders (push-ups, squats, pull-ups, lunges, and more).
- **Proposal:** when you outgrow an exercise, RepVyn moves you to the next one and says so: "Earned: shrimp squat. Assisted shrimp squat was getting easy." Each ladder is a quiet path you can open and see where you are. This is progress you can't fake, and you can't buy it.

### 8. Consistency (Progress grid and the "streak")
- **Why use it:** to see that you're keeping it up.
- **However, the user might not use it because** a streak eventually breaks, and loss framing goes against Steady.
- **What would make them want to:** a **weekly plan ring** in place of the streak. It fills as you do the week's planned sessions, and planned rest days count as kept. The count becomes "weeks on plan", and missing a week pauses the count instead of resetting it to zero. The 20-week grid becomes the history of those weeks.

### 9. Strength section (Progress)
- **Why use it:** to see that you're getting stronger.
- **However, the user might not use it because** small lines change too slowly to notice.
- **What would make them want to:** **milestones** at real thresholds ("Push-ups: 20 in a row, first time") and a monthly comparison ("September → October: +3 reps on 4 exercises").

### 10. 12-week program
- **Why use it:** it gives the weeks a shape.
- **However, the user might not use it because** "Week 3 of 12" is just a counter.
- **What would make them want to:** **chapters**: base weeks, a build, a lighter week, a test week. Each chapter ends with a one-screen recap (before and after on the body figure), then the next chapter unlocks.

### 11. Reminders
- **Why use it:** so you don't forget to train.
- **However, the user might not use it because** a fixed 6:30 pm reminder becomes noise, and today it isn't sent at all.
- **What would make them want to:** reminders based on **readiness**, not the clock: "Legs are ready. 30-minute workout planned." Only on planned days, and never as guilt. This depends on push notifications from the "Production backend and wiring" thread.

### 12. Profile and settings
- **Why use it:** to set equipment, days and goals.
- **This is fine as a tool.** It needs no reward. One small touch: when equipment is added, show what it unlocks ("Dumbbells add 14 exercises").

### 13. Sharing (optional)
- **Why it would exist:** pride, and free promotion for RepVyn.
- **Proposal:** a monthly recap card (the body figure, weeks on plan, records) that you can save or share. No feed and no leaderboard.

## What we would not do

Points, XP, coins, daily login rewards, leaderboards against strangers, "Don't lose your streak" messages, and confetti for ordinary actions. They fail the brand check (Honest and Steady), and they often attract people to the reward rather than the training.

## Suggested order (after your answers)

1. Finish screen "What RepVyn learned" and record flashes. The engine output already exists.
2. Body recovery timeline, muscle countdowns and the morning readiness moment.
3. Weekly plan ring in place of the streak.
4. Earned exercises (ladders) and muscle levels.
5. Program chapters and the monthly recap card.
6. Readiness reminders, once push notifications exist.
