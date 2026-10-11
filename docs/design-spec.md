# Design Specification: why each screen is built the way it is

This document walks through every screen from top to bottom and explains what each element is for and why it looks the way it does. The visual rules themselves (colours, type, spacing, motion) are in `DESIGN.md` at the project root. The product goals are in `PRODUCT.md`.

All numbers on the screens are mock data. Section 9 lists where the mock data or the flow does not yet add up.

## 1. The idea every screen serves

The user should open the app, see what to do today, and do it. They should never have to work out how hard yesterday was or which muscles are sore. The engine works that out. The design therefore follows four rules:

1. **One decision per screen.** Each screen has one large element and one obvious action.
2. **The app states its conclusion, not its working.** It says "your legs are recovered", never "fatigue 2.1 units".
3. **Red means effort, everywhere.** More work is a darker red. Rest is grey.
4. **Almost no explanatory text.** A number and a short label, or a picture.

## 2. Today (the Home tab)

This is the first screen after a program is chosen. Its one job is to get the user into today's workout.

### 2.1 "Week 3 of 12"

- **What it is.** The page title, in the largest type on the screen. "Week 3" is in the text colour and "of 12" is in grey.
- **Why it is here.** A program is a commitment over weeks. The first thing a returning user wants to know is "where am I?", and this answers it before anything else.
- **Why it is so large.** It replaces a generic greeting. A greeting says nothing; this is the one fact that changes week to week. Size tells the user it is the anchor of the page.
- **Why two tones.** "Week 3" is the answer; "of 12" is context. Greying the context lets the eye land on the answer first.

### 2.2 "Balanced program ›"

- **What it is.** The name of the current program, as a quiet link under the title.
- **Why it is here.** "Week 3" needs "of what?". The program name completes the sentence.
- **Why it is small and grey.** It rarely changes, so it should not compete with the title.
- **Why it has an arrow.** It is tappable and opens the program picker. Changing program is a rare action, so it gets a link, not a button.

### 2.3 The 12-segment bar

- **What it is.** Twelve short segments, one per week. Finished weeks are dark, the current week is red, the rest are grey.
- **Why segments and not one continuous bar.** A program is made of weeks, which are countable steps. Segments let the user count where they are; a smooth bar would only say "about a fifth".
- **Why the current week is red.** Red marks "now" here, the same way it marks today on the strip below.

### 2.4 The week strip

- **What it is.** Seven tall capsules, Monday to Sunday.
- **Why it is here.** It answers "how is this week going?" at a glance, and it puts today in the context of the days around it.
- **Why capsules.** A tall capsule gives room for both the weekday letter and the date or a check, and seven of them make a strong rhythm across the screen.
- **How the states work.**
  - **Workout done:** filled red with a check. The shade shows how hard that day was, using the same scale as the Progress grid: darker is harder. Monday is dark red (hard), Wednesday is the standard red (medium).
  - **Today:** a red outline with the date. It is outlined, not filled, because nothing has been done yet. When the workout is finished it fills in.
  - **Rest day in the past:** a grey outline. Rest is not a failure, so it is quiet, not marked as missed.
  - **Upcoming:** a plain card with the date.
- **Why the colours match Progress.** A day should look the same wherever it appears. A dark red Monday here is a dark red square on the Progress grid.

### 2.5 The workout card

- **What it is.** A red card with "Lower body" in large white type, one sentence, a body figure, the time and exercise count, and a round arrow button.
- **Why it is the only red block.** It is the reason the screen exists. One saturated element among neutrals tells the user where to go without a word.
- **Why this red is slightly deeper than the button red.** At card size the brighter red glares and overpowers the page.
- **"Lower body".** The name of today's session, as large as the layout allows, on two lines.
- **"Your legs are fully recovered. Chest and shoulders rest today."** This is the app showing its conclusion. It answers "why this workout?" in one sentence, which is what lets the user trust the plan without checking anything.
- **The body figure.** It shows the same answer as a picture: legs in white are today's muscles, the rest of the body is a darker red. It sits directly on the card with no box around it.
- **"40 min" and "5 exercises".** The two facts a person checks before committing: how long, and how much.
- **The round arrow.** The whole card is tappable, and the arrow says so. It is white with a red arrow so it reads on the red card. It opens the workout page; it does not start the workout, so it is an arrow and not a "Start" label.

### 2.6 "Today's plan"

- **What it is.** The five exercises in one white card: a thumbnail, the name, and "3 sets · 10 reps each side".
- **Why it is here.** It makes the workout concrete before the user commits, so there are no surprises.
- **Why it is below the card.** It is detail. The decision is made in the card; this is for the user who wants to look first.
- **Why the name is bold and the sets are grey.** People recognise exercises by name. The numbers matter once they are doing it.
- **Why there is no "5 exercises, bodyweight" label.** The card above already says how many, and the equipment can change.

### 2.7 The bottom bar

- **What it is.** A floating pill with four tabs. The active tab opens into a filled pill with its icon and label; the others show an icon only.
- **Why it floats.** Content scrolls under it, which keeps the full height of the screen for content.
- **Why only the active tab has a label.** It tells the user where they are without four labels competing for space.
- **Why these four.** Today (do), Body (how am I), Progress (what have I built), Profile (settings). They follow the order a session happens in.

## 3. Workout page (opens from the Today card)

It slides in from the right, the standard signal that the user has gone one level deeper and can go back.

- **Back button.** Top-left, floating, so it stays put while the page scrolls. The user can always get out.
- **"Lower body" and the muscle list.** The title repeats the card so the user knows they are in the same place, with the muscles named in words.
- **Front and back figures.** Today's muscles in red on a grey body. This is the full version of the small figure on the card.
- **Three chips: time, intensity, equipment.** Each shows the current choice ("40 min", "Normal", "Bodyweight"). Tapping one opens its options underneath.
  - **Why chips and not open controls.** Most days the defaults are right. Showing only the current choices keeps the page calm and still makes them one tap from changing.
  - **Why here and not on Today.** These are adjustments to a workout the user has already decided to do. Putting them on Today would turn it into a settings page.
- **Exercise list.** The same rows as Today, and it updates live: time changes the sets, intensity changes the reps, equipment swaps an exercise or adds weight. The user sees the effect of a choice immediately.
- **"Start workout".** One red button pinned to the bottom. It is the only red action on the page, and it is always reachable without scrolling.

## 4. In-workout screen (opens from "Start workout")

It slides up from the bottom and covers everything. A workout is a focused task, so it is presented as a modal with its own way out.

### 4.1 During a set

- **Video behind everything.** The user is watching a demonstration while moving. The video is the content; the controls float on top.
- **Close and timer at the very top.** Small and out of the way. They are needed rarely.
- **Progress bar.** One segment per exercise. Each segment fills by sets: a third after the first of three sets, full after the last. This shows both "how far through the workout" and "how far through this exercise" in one row.
- **Frosted panel at the bottom.** Everything the user touches is in the lower third, within thumb reach, on glass so the video stays visible.
  - **"Exercise 2 of 5 · Set 2 of 3"** in small text: orientation.
  - **Exercise name** in large type.
  - **Rep count, very large**, with "reps each side" directly under it. It is the largest element because it is read at arm's length, mid-movement.
  - **Minus and plus.** The engine learns from what was actually done, so the user can correct the count with one tap. They are beside the number they change.
  - **"Set done".** One red button. It is the only action that matters during a set.

### 4.2 Resting

- **The same scene.** The video stays and dims. The user has not left the workout, so the screen should not look like a different place.
- **Countdown in a ring.** The number says how long; the draining red ring says the same thing without reading.
- **"How did that set feel?"** Easy, Right, Hard. This is the one question the app asks, at the moment the answer is fresh and the user's hands are free. It replaces the soreness check-in the old demo asked before a workout.
- **"Up next".** The next set or exercise, so the user can get into position.
- **"+15 sec" and "Skip rest".** The two things a person wants during a rest: more time or no more waiting.

### 4.3 Set-complete animation

The segment turns red, thickens for a moment, and slides to its new length with a small overshoot, then fades back. Finishing a set is the one place the app celebrates, because it is the moment that deserves it.

### 4.4 Finished

A red check, "Workout done", and one line with time, sets and exercises. "Finish" returns to Today, where today's capsule is now filled.

## 5. Body

This tab answers "how is my body right now?".

- **Front and back figures, large.** Grey muscles are ready. Used muscles are red; the more used, the darker. The picture is the answer, so it gets most of the screen and no card around it.
- **No summary numbers.** They were removed because the figure already says it.
- **"Recovering" list.** Only the muscles that are not ready, most used first. Each row has a square in the same red as that muscle on the figure, its name, and when it is ready ("Ready tomorrow"). The colour square is what links the list to the picture.
- **Why there is no "ready" list.** Grey on the figure already means ready.

## 6. Progress

This tab is the payoff: proof that the work is adding up.

- **"Progress".** The page title.
- **"9-week streak · day 138".** One two-tone line under the title, in the same style as "Week 3 of 12". These are the two numbers that describe consistency. They are type, not a card, so they read as part of the heading.
- **Activity grid.** One square per day, weeks as columns, Monday to Sunday as rows. Grey is rest; red is a workout, darker for harder. It opens on today at the right edge and scrolls left into earlier months.
  - **Why a grid.** It shows consistency as a pattern. Gaps and streaks are visible without reading anything.
  - **Why it runs edge to edge with no card.** It is wide by nature, and running it off the left edge shows there is more to scroll to.
  - **The "Rest … Hard" key.** The only caption on the page, kept because the colour scale would otherwise be a guess.
- **"Muscles this week".** The same figures as Body, coloured by work done this week: the most-trained muscle is darkest, untrained muscles are grey. Under it, a list with matching colour squares and sets done against target ("9/12 sets").
  - **Why the figure again.** One picture language across the app. On Body it shows fatigue; here it shows work.
- **"Strength".** One row per exercise: name, first and latest best set ("8 → 12 reps"), a small trend line, and the change. Green with an up arrow is an increase; red with a down arrow is a decrease.
  - **Why green and red here.** This is the one list where "better or worse" is the question, and the arrow carries the meaning for anyone who cannot tell the colours apart.

## 7. Profile

This tab holds the things that are set once and adjusted rarely.

- **Avatar and name.** Confirms whose settings these are.
- **Program card.** The current program, its week, one line about it, and "Change program". It is first because the program shapes everything else.
- **Three groups: Training, About you, App.** Grouped by what they affect: the plan, the person, the app.
- **Each row shows its current value.** The user can read all their settings without opening anything.
- **Tapping a row opens its options underneath.** Only one row is open at a time, so the page never becomes a wall of controls.
- **Options sit in even rows.** Short sets fill one row; longer sets use two equal columns, with "Off" or "Bodyweight only" on a full row of its own. No option is left alone on a line.
- **Body weight uses minus and plus.** It is a number that moves by small steps.

## 8. Program picker

It is the first screen for a new user, and it opens from Today or Profile for an existing one.

- **"Choose your program".** Two-tone title.
- **Three-way switch.** Balanced, Upper body, Legs. There are only three programs, so they are all visible and one tap apart.
- **One large showcase card.** Showing one program at a time gives the figure room to be large.
  - **Front and back figures** coloured by what that program trains most.
  - **Name and one-line description.**
  - **Three bars:** Upper body, Lower body, Core, each labelled More, Standard or Maintenance. This is the comparison a person actually makes between programs.
- **The button names the choice.** "Start Balanced", "Switch to Upper body". The user sees exactly what the tap will do.

## 9. Logical inconsistencies found

These are places where the screens, the mock data or the flow contradict each other. The first group is fixed. The second group is open and needs a decision.

### Fixed in this pass

| Issue | Fix |
|---|---|
| Profile options wrapped unevenly (three on one row, two on the next). | Options now sit in even grids. |
| The same uneven wrapping on the workout page's equipment options. | Same grid. |
| Bottom buttons were 64px on some screens and 68px in the workout. | All 64px. |
| List rows were 56, 60 and 68px in different lists. | 60px for simple rows, 64px for rows with a trend line, 80px for rows with a thumbnail. |
| Body had "Front" and "Back" captions under the figures; Progress and the workout page did not. | Captions removed. |
| Strength showed a best split squat of 11 reps while today's plan asked for 10. | Mock best is now 10. |
| The workout card's entrance animation replayed on every tab change. | Tabs now only fade. |
| The workout panel entered from above although it sits at the bottom. | It now rises from below. |
| Page transitions used four slightly different timings. | One timing: 480ms in, 400ms out. |
| With reduced motion on, everything snapped with no feedback. | Movement is replaced by short fades. |

### Open

1. **First-run screen against the mock history.** The canvas opens on the program picker as a brand-new user would see it, but the screens behind it show week 3, a 9-week streak and day 138. Both cannot be true for one user. Decide whether the canvas should open on Today, or whether a separate new-user state with empty data should be designed.
2. **Week 3 of a program against day 138.** A 12-week program in its third week and 138 days of history only fit together if this is the user's second or third program. Nothing on screen says so.
3. **Choosing a different program does not change today's workout.** Home shows "Week 1" and the new program name, but the card is still "Lower body" with the same exercises.
4. **Finishing a workout only updates the week strip.** The workout card, the Body figures and the Progress numbers do not change.
5. **The workout page says "Quads, glutes, hamstrings and calves", but the list ends with Plank.** The figure does not highlight the abs.
6. **Red carries two readings.** On Body it is fatigue (a reason to rest); on Progress it is work done (an achievement). Both are "effort", but a red chest means "don't train" on one tab and "well done" on the other.
7. **Dark mode and the work scale.** The darkest red is the hardest day, but on a black background it is dimmer than the medium red, so the hardest days stand out least.
8. **Effort after a set is recorded but does nothing.** Easy, Right and Hard do not change the next set or the rest time.
9. **The close button in a workout ends it at once.** There is no confirmation and no way to resume.
10. **Top controls in the workout sit 16px from the top.** On a real phone the clock and camera cutout occupy that space.
11. **Level shows "Auto" with manual choices.** The engine infers level from workouts, so offering Beginner, Intermediate and Advanced contradicts that unless it is an override.
12. **Body weight can be changed, but nothing shows what it affects.**
13. **Exercise thumbnails and the workout video are placeholders.**

### Animation review

Checked against the Apple fluid-interface principles and the Emil Kowalski audit rules.

| Area | Result |
|---|---|
| Press feedback on touch-down, scale 0.97, 160ms | Correct |
| Easing: strong ease-out for interface, iOS sheet curve for pages, linear for the rest ring | Correct |
| Pages enter and leave along the same path | Correct |
| Only transform and opacity animate | Correct |
| No hover-only motion | Correct |
| Tab changes | Fixed: fade only |
| Panel direction | Fixed |
| Timing consistency | Fixed |
| Reduced motion | Fixed |
| Set-complete overshoot | Kept on purpose. The rules reserve bounce for gesture-driven motion; this is the one playful moment and was asked for. |
| Interruptibility | Open. Page moves are fixed animations, so tapping Back mid-slide jumps. A real build should use the platform's own navigation, which handles this. |
| Swipe gestures | Open. There is no swipe-back or swipe-down to dismiss. |
