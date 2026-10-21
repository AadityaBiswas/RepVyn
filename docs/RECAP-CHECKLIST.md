# Recap screens: build checklist

After "Workout done", the phone app walks through what the workout changed, then back to Today.

Flow: **Workout done → Next → What RepVyn learned → Growth since day 1 (from week 2) → Week on plan (only when this workout completes the week) → Today**. Share is on every recap screen.

## Build
- [x] "Workout done" button becomes **Next** and opens the recap (Back still saves and closes)
- [x] **What RepVyn learned**: title · exercises · reps, one-line summary, list of each exercise with today → next time and an up/down/same arrow
- [x] **Growth since day 1**: shown only when something grew; body front and back with contour lines on the muscles that grew most, list with +% per muscle
- [x] **Week on plan**: red screen, ring with one segment per planned workout, "Week N on plan", sets · reps · weeks on plan, body lit with the week's muscles
- [x] Button reads **Next** or **Finish** depending on whether another screen follows
- [x] **Share sheet**: the story card (RepVyn mark, date and week, workout title, body figures, highlight pill, exercise list, time · sets · reps) with **Share** (phone share sheet, as an image; saving is one of its targets, so there is no separate Save button)
- [x] Android Back steps back one recap screen, then leaves

## Check
- [x] Phone app typechecks
- [x] Shared logic tests: not affected (no shared code changed)
- [x] Runs in the browser preview: finish a workout, step through every screen, open Share
- [ ] Dark mode and the largest font size don't clip text
- [ ] Release build on the phone: Share opens the Android share sheet with the image (needs `npx expo prebuild -p android` first: expo-sharing and react-native-view-shot are new native modules)
- [ ] Android Back through the recap on the phone (the browser preview has no Back button)
