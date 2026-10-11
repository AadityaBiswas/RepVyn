# RepVyn: direction for the app-designer pass (on top of Home Screen v2)

## Brief (self-authored from the repo)

Nobody was asked; every answer comes from `PRODUCT.md`, `DESIGN.md`, `docs/design-spec.md` and the running app in `app/`.

1. **App and audience.** RepVyn, a home-workout app. The engine works out which muscles are recovered and plans the workout; the user trains. For people who do not want to track recovery themselves.
2. **Core action.** Open the app, see today's workout, start it.
3. **Feel.** Bold, quiet, premium. References from the repo's own words: very large heavy type, colour almost absent, one red.
4. **What exists.** The name, the Geist typeface, the palette, the body-figure artwork in `assets/body/`, one trainer still and one clip in `assets/exercises/`, and a working build of Home Screen v2.
5. **What is needed.** A preview of the app-designer treatment built on top of v2. Screens to look at; no code change to `app/`.
6. **Image generation.** Not used. No credits spent.

The instruction "on top of the homescreen v2" outranks the skill where the two disagree. That means: the palette, Geist, the red-means-effort rule, the pill shapes, the floating nav and every rejected idea in the project memory are binding. The skill's rule that a redesign must differ from the current look on three of five columns is therefore not applied, and the exploration varies ground, composition, type treatment and richness inside the v2 system instead of swapping typefaces and hues.

## Current app

Real screenshots of the build are in `before/` (a new user, week 1). `shoot.mjs` scans `.screen` mockups, not a running app, so the tells below were read by eye.

**Tells it hits (slop.md)**

- *Grey placeholder boxes with a mountain glyph.* Every exercise row has one, on Today and on the workout page.
- *Two heroes.* "Week 1 of 12" and "Full body" are both 48px weight 800. The red wins by colour, not by size.
- *The richness is small.* The body figure is the one piece of artwork the app owns, and on the first screen it is 92px wide, dark red on red.
- *A dead middle in the hero card,* between the sentence and the meta row.
- *Type scale of about ten sizes* (48, 24, 22, 20, 17, 16, 15, 14, 13, 12, 11).
- *Failing contrast in two places:* white on the pale-pink work-1 capsule (2.5:1), and the faint half of the two-tone title in light mode (2.9:1).
- *No app icon.*
- Open issues the spec already lists and this pass can fix: the top controls of the workout sit under the status bar (#10); in dark mode the hardest day is the dimmest (#7).

It hits neither of the two named faces. It is close to the skill's own overcorrection (light grey, near-black, one red, mono numbers, ruled rows), which is why the richness has to grow.

**Keep / lose / unknown**

| Item | Verdict |
|---|---|
| "Week N of 12", program name as a link, 12-segment bar | keep |
| Week strip: done (work-scale colour), rest, today, upcoming | keep |
| Red workout card: title, why-sentence, figure, time, count, round arrow | keep |
| "Today's plan" list | keep |
| Daily check-in card, "Done for today" card | keep (states of the same card; not redrawn) |
| Four-tab floating nav, active tab labelled | keep |
| Workout page: back, title, muscles, front and back figures, three chips, list with more, pinned Start | keep (figures cropped to the trained region) |
| In-set: video, close, clock, segments, frosted panel, big count with minus and plus, Set done | keep |
| Rest ring, reps-left question, finish sequence | keep (not redrawn) |
| Body: figures, Recovering list | keep |
| Progress: streak line, activity grid, muscles this week, strength | keep (not redrawn) |
| Profile, program picker, onboarding | keep (not redrawn) |
| Grey thumbnail placeholders | lose |
| White text on the pale work-1 capsule | lose |
| Geist Mono outside the workout clock | unknown: v2 uses it for measured numbers; this pass only shows the clock |

**Harvested assets.** `assets/body/map-front.png` and `map-back.png` (the region maps the app tints at runtime), tinted for the mockups by `fig.py`; `assets/exercises/trainer.jpg`; the nav icons from `app/src/ui/app.tsx`.

**Decisions for the user**

1. The page title drops from 48 to 34 so the workout card is the only hero (its title rises from 48 to 64).
2. "Balanced program ›" becomes "Balanced ›" on the title row.
3. Exercise thumbnails become the muscle each exercise trains, cropped from the body figure, until real photos exist.
4. In dark mode the work scale runs dim to bright, so the hardest day is the brightest. Pale pink then means "light" in light mode and "hard" in dark mode.
5. The nav becomes translucent so the list shows through as it scrolls under.
6. The week strip capsules go from 72 to 64 high.
7. In the workout, the segments sit between the close button and the clock, below the status bar.
8. The workout page shows the trained region as two cropped plates (front from the abs down, back from the glutes down), not two whole figures. The abs are a lighter red because they are secondary today.
9. The set screen fits the clip to the width so the whole movement shows, and carries the exercise's muscle thumbnail in the panel.
10. The Recovering rows on Body use the muscle thumbnail in that muscle's work colour, in place of a colour square.
11. New: dragging across the Body figures runs recovery forward (the signature below), with the next five days as initials under the figures.
12. New: an app icon.

## Exploration (`explore.html`, `shots/explore/sheet.png`)

| | Concept | Family | Ground | Type | Richness |
|---|---|---|---|---|---|
| A | RepVyn is a plate from an anatomy atlas. | printed | light | Geist 800, one 64px title | illustration (the figure, 528px tall) |
| B | RepVyn is a thermal camera. | object | dark | Geist Mono readouts | colour and material (heat) |
| C | RepVyn is a fight-night poster. | media | colour field | Geist 900 at 84px | the red itself |

Type family and hue are locked by the brief, so the three differ in face treatment and in what the red does, not in family or hue.

**Chosen: A, built with C's composition, inside v2's card.**

- **A won** because it is the most *this app*: the engine's whole answer is "these muscles, today", and the figure says that without a word. It also turns the owned artwork into a system: big crop on the card, small crop as each exercise's thumbnail, whole on Body.
- **C lost** as a ground: v2 keeps the full-screen red for "Workout done", and a red wall every morning spends that reward. It also swallows the work scale (red capsules on red). Its scale and its crop were kept: the 64px title and the figure cut by the card edge come from C.
- **B lost** because it puts a dark page in light mode (rejected before), reads as engine jargon (`WK 03/12`, a three-stat row), and makes the whole app mono. One thing was kept: in the dark theme, more work is brighter.

**Why this is not the overcorrection.** It is light grey, near-black and one red by instruction. What keeps it from the grey-paper form: the first screen is half illustration and a saturated field; lists carry pictures; nothing is ruled except row dividers; mono appears once, on a clock.

**History check.** `~/.app-designer/history.md` was empty, so there is no earlier row to differ from.

## The category default being refused

The top home-workout apps share a near-black ground with a neon lime or orange accent, activity rings, a dashboard of stat tiles, a motivational greeting, stock gym photography and a streak flame. RepVyn does none of them. The category colour cliché is neon on black; RepVyn's red was the user's choice before this pass and it carries meaning (effort), so it stays.

## Tokens

| Role | Light | Dark |
|---|---|---|
| ground (`bg`) | `#F2F2F7` | `#000000` |
| raised (`surface`) | `#FFFFFF` | `#1C1C1E` |
| ink | `#1C1C1E` | `#F5F5F7` |
| ink-2 (`muted`) | `#636366` | `#A1A1A6` |
| ink-3 (`faint`, large type only) | `#85858B` (was `#8E8E93`, 2.9:1) | `#8E8E93` |
| rule (`line`, `soft`) | `#D1D1D6`, ink at 7% | `#3A3A3C`, white at 10% |
| track | `#E1E1E6` | `#2C2C2E` |
| accent (action, today) | `#D91E36` | `#E22A40` |
| hero (today's card) | `#C4223A` | `#B8233A` |
| work 1 / 2 / 3 | `#EE8794` / `#D91E36` / `#7A0E1E` | `#6B1524` / `#E22A40` / `#FF6B7D` |
| ink on work 1 / 2 / 3 | `#5E0A17` / white / white | white / white / `#3A0810` |
| thumbnail tile | `#F2F2F7` | `#2C2C2E` |
| nav glass | white at 66% | `#2C2C2E` at 66% |
| on-accent | `#FFFFFF` | `#FFFFFF` |

One hue. Red means effort; the system tint is ink (selected tab, selected option), and red is kept for the action and for work.

**Type.** Geist. Sizes: 96 (rep count, weight 800, −0.05em), 64 (the screen's hero, 800, −0.045em, leading 0.94), 34 (page title, 800, −0.035em), 20 (section, 700, −0.02em), 17 (row title, 700), 15 (body and detail), 13 (meta, 600), 11 (weekday letters, 600). Geist Mono 15 for the workout clock only.

**Layout.** 20 side margin. Radius family: 8 (grid cells), 16 (thumbnails), 24 (lists), 32 (hero card), 43 (workout panel, concentric with the display corner at a 12 inset), capsule for every control. Spacing: 4, 6, 8, 12, 14, 18, 20, 24, 28.

## Richness source: one figure, three scales

The user's anatomy figure, flat shapes, no outline box, tinted from the region maps.

- **Card scale.** Torso and legs only, no arms, 403px tall inside a 340px card, cut by the card's top edge with the feet running off the bottom, so the card shows only what is trained today. On red: today's muscles white, secondary muscles `#D4586A`, other muscles `#9B1B2E`, the rest of the body one step off the card colour.
- **Plate scale.** On the workout page, the trained region alone, front and back, starting at a whole muscle so nothing is sliced flat.
- **Thumbnail scale.** A square crop of the one muscle the exercise trains, red on the grey figure, 56px.
- **Whole.** Front and back on Body only, grey for ready, the work ramp for used.

A frame of the split-squat clip is the only photograph, and only behind the workout panel.

The figures are resampled from the 468px region maps (drawn at 6x with re-sharpened edges, saved at 3x). A vector original would be sharper.

## Signature: drag the body forward

Born from the product's one claim: it knows when each muscle is ready.

- **Where.** Body tab, on the figures.
- **Trigger.** A horizontal drag anywhere on the figures.
- **Frames.** 1 touch: title reads "Body now". 2 one day of travel: the grey word becomes "tomorrow", every red steps down the ramp, rows whose muscle is ready leave the list. 3 two days: "Monday", all grey, the list reads "Everything is ready". Five day initials under the figures (S S M T W) mark today and the next four days; the day shown sits in an ink circle.
- **Timing.** The reds follow the finger 1:1 between days. On release everything springs back to now in 350ms, no overshoot.
- **Haptic.** One selection tick per day crossed. Nothing on release.
- **Reduced motion.** Days cross-fade in 200ms; release cross-fades back.
- **Needs from the engine.** Recovery projected forward with no new training. `src/engine/recovery.ts` holds the recovery model; whether it can be asked for a future day was not checked.

## Content

Saturday 10 October, week 3 of 12, Balanced. Monday legs (hard), Wednesday pull (light), Thursday push (medium), Tuesday and Friday rest.

**Today.** Week 3 of 12 · Balanced › · 12 segments (2 done, 1 current) · M 5 done hard, T 6 rest, W 7 done light, T 8 done medium, F 9 rest, S 10 today, S 11 upcoming · Card: "Lower body" / "Your legs are fully recovered. Chest and shoulders rest today." / 40 min / 5 exercises / arrow · "Today's plan": Split squat, 3 sets · 10 reps each side; Single-leg RDL, 3 sets · 8 reps each side; Glute bridge, 3 sets · 15 reps; Single-leg calf raise, 3 sets · 12 reps each side; Plank, 3 sets · 40 sec.

**Workout page.** Back · "Lower body" · "Quads, glutes, hamstrings, calves and abs" · front and back figures · 40 min, Normal, Bodyweight · "5 exercises" · the same five rows with a more control · "Start workout".

**In a set.** 7:44 · close · five segments (first a third full) · 02:10 · "Exercise 1 of 5 · Set 2 of 3" · "Split squat" · quads thumbnail · 10 · "reps each side" · minus, plus · "Set done".

**Body.** "Body now" · figures: chest deep red, shoulders red, triceps pink · S S M T W · "Recovering": Chest, Ready Monday; Shoulders, Ready tomorrow; Triceps, Ready tomorrow.

**Icon.** Three week-strip capsules on the hero red: white, pink `#F4A3AE`, deep red `#6E0F1F`.

Not designed in this pass: Progress, Profile, program picker, onboarding, the rest screen, the finish sequence, the check-in and done states of the Today card.
