# Proposal 02: A first run that states the promise, with kg or lb

Status: **approved and built** (10 Oct 2026). Preview: [02-first-run.png](02-first-run.png).

## Problem (observed in the v3 build)

- The app opens straight on "Your goal". RepVyn's name and its promise never appear before four questions.
- Body weight is asked in kg before units exist. Imperial exists in Profile, but a US user has to find it after onboarding.

## Proposal

1. **Welcome screen before "Your goal"** (not counted as a step, no progress bar).
   - RepVyn mark and name at the top. The v3 app icon mark is used, not a new logo.
   - The body figure with today's muscles in red, the one picture the whole app uses.
   - Title, two-tone like every other title: "You train. **RepVyn plans.**"
   - One sentence: "Log your sets. RepVyn works out which muscles are ready and builds today's workout around them."
   - One red button: "Get started". No carousel, no tips, no sign-up.
   - Shown once. Returning users never see it.
2. **Units on "About you"**, above body weight: a two-option row, kg and lb.
   - Default from the device's region: lb in the US, kg everywhere else, including India.
   - The body-weight stepper moves 1 lb at a time in lb, 1 kg in kg. Stored in kg as today.
   - The same choice drives Profile > Units, so there is one setting, not two.

## Not in scope

Dumbbell weights still show in kg (an earlier default). Showing them in lb is a separate, later fix.

## Why

- Voice and brief (decision 01): Decisive and Honest. The first screen says what the app does in one sentence and asks for nothing.
- NN/g advises keeping onboarding short and avoiding instructions people must absorb ([video](https://www.nngroup.com/videos/onboarding-skip-it-when-possible/)). This screen has no instructions, only the promise, and adds one tap.
- Fitbod, the nearest competitor, also opens with a body recovery map that explains the day's workout ([flow showcase](https://screensdesign.com/showcase/fitbod-gym-fitness-planner)). That shows the pattern is used, not that it works.

## Trade-off and check

One extra tap before the first question. Check: people who see the welcome can say in their own words what RepVyn does, and the share who finish set-up does not drop.
