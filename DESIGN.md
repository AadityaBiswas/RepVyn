---
name: Home Workout App
description: Readiness-based home workouts. The app decides what to train; the user trains.
colors:
  bg: "#F2F2F7"
  surface: "#FFFFFF"
  ink: "#1C1C1E"
  muted: "#636366"
  faint: "#8E8E93"
  line: "#D1D1D6"
  track: "#E1E1E6"
  accent: "#D91E36"
  hero: "#C4223A"
  work-1: "#EE8794"
  work-2: "#D91E36"
  work-3: "#7A0E1E"
  muscle-idle: "#AEAEB2"
  up: "#1A6B3B"
  down: "#B0152B"
  dark-bg: "#000000"
  dark-surface: "#1C1C1E"
  dark-ink: "#F5F5F7"
  dark-muted: "#A1A1A6"
  dark-faint: "#8E8E93"
  dark-line: "#3A3A3C"
  dark-track: "#2C2C2E"
  dark-accent: "#E22A40"
  dark-hero: "#B8233A"
  dark-muscle-idle: "#48484A"
typography:
  page-title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "48px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.04em"
  section-title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  row-title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  caption:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.01em"
  number:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
rounded:
  cell: "8px"
  thumb: "16px"
  card: "24px"
  hero: "32px"
  panel: "36px"
  pill: "999px"
spacing:
  gutter: "20px"
  stack: "12px"
  section: "32px"
  card-pad: "20px"
  hero-pad: "24px"
components:
  hero-card:
    backgroundColor: "{colors.hero}"
    textColor: "#FFFFFF"
    rounded: "{rounded.hero}"
    padding: "24px 20px 20px 24px"
  list-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "4px 20px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    height: "64px"
  button-secondary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    rounded: "{rounded.pill}"
    height: "52px"
  button-round:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "48px"
  option:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "44px"
  option-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
  nav-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    height: "64px"
  nav-tab-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    height: "52px"
---

# Design System

The source of truth for the app's look is the canvas "Home Screen v2" (https://claude.ai/artifact/HgfqYBUm5ZZXKKc2TWdnZq). A copy of its markup is in `design/Main.dc.html`. The reasoning behind each screen is in `docs/design-spec.md`.

**v3 (approved 10 October 2026, built into `app/`).** The frames titled "v3 ·" on the same canvas replace v2 for Today, the workout page, the in-set screen, Body and the app icon. Their working files and the reasons are in `design/app-designer/` (`DIRECTION.md`, `CRITIQUE.md`). Where this file and v3 disagree, the v3 section below wins. Progress, Profile, the program picker, the onboarding questions, the rest screen and the finish sequence are still v2.

## v3 changes

- **One hero per screen.** Page titles are 34px (weight 800, −0.035em). The Today card's title is the display size, 64px on a legs day and 44px otherwise.
- **The figure at three scales.** On a legs day the Today card and the workout page show the legs alone (torso and legs, no arms, starting at a whole muscle); other days show the whole figure. Every exercise row and every Recovering row carries a close-up of its muscle (`Muscle` in `app/src/ui/kit.tsx`). The maps are drawn at 2x (`assets/body/make_map_hd.py`).
- **Targets and helpers.** On the card a target muscle is white; on the workout page it is the accent red. The core on a legs day is a helper and takes a lighter tint.
- **Work scale by theme.** More work is further from the ground: light runs `#EE8794`, `#D91E36`, `#7A0E1E`; dark runs `#6B1524`, `#E22A40`, `#FF6B7D`. Each step has its own ink (`--on-w1` to `--on-w3`), because white fails on the pale step.
- **Frost.** Everything that floats (nav, back button, workout controls, workout panel) is one material: `--frost` with a lit top edge and an offset shadow. The panel blurs more and casts a deeper shadow than the small controls.
- **Week strip.** Capsules are 64px. Today is the one raised day: filled, red ring, soft red shadow.
- **In a set.** Close, the exercise segments and the clock share one row. The panel reads top to bottom: muscle close-up, name, "Set n of m" and set bars; the count at 104px on the left with its unit beside it and one minus/plus capsule on the right; then the red action.
- **Body.** The title's grey word is the day shown ("now", "tomorrow", a weekday). Dragging across the figures peeks forward a day per 48px and returns to now on release; the five-day track under them selects a day and stays.
- **Icon.** The Repvyn mark, white on `#DE223D`, traced from the logo picture until the vector file replaces it.
- **Light `faint` is `#85858B`** (was `#8E8E93`, which fell under 3:1 on the ground).
- **The card on every kind of day.** The display title and the cut-off figure are not only for legs days. Any other day draws the whole figure 500px tall, running off the card's right and bottom edges, from the side most of the day's muscles are on. The title is 64px when its longest word has five letters or fewer and it is at most two words, then 44px, then 36px. On the workout page whole figures are 310px tall.
- **Motion runs on Motion** (motion.dev), in `app/src/ui/motion.ts`. This replaces the timings in the Motion section below for everything except the last line of this bullet. Pages and the workout sheet are springs with no overshoot (0.4s to arrive); a move starts from wherever the last one had got to, so Back mid-push turns the page round. Entrances are refs (`fade`, `pop`, `lift`, …); the finish sequence is the same choreography with `data-delay`. Only `transform`, `opacity`, `clip-path` and one stroke are animated, as whole values. With reduced motion, things that arrive fade in 200ms and nothing slides. CSS keeps press feedback (scale 0.97, 160ms) and the transitions that follow state: the workout segments, the rest ring and the hold bar.
- **One muscle list, one colouring function.** The catalog's `MUSCLES` (`src/library/schema.ts`) is the list; the region maps carry one code per entry in that order; `figure()` and `thumb()` in `app/src/figure.ts` colour any of them from a `{muscle: value}` record. A muscle shows once the artwork draws it as its own shape and `assets/body/make.py` lists that shape: today the twelve engine regions and the forearms. Traps, obliques, adductors and hip flexors are tagged in the catalog but not drawn separately.
- **Activation has three levels** (`activation()` in `app/src/model.ts`): high 1, moderate 0.5, light 0.25, shown dark red, red and light red (reversed in dark). Exercise pictures and the workout page use them; a muscle the catalog only lists under `alsoUses` counts as light.
- **The card lights half a body at a time** (`planValues()`): any upper-body target turns the whole upper body white, forearms included; any lower-body target the whole lower body; a full-body day both. Everything else stays dark red. The figure always faces front.
- **First run opens on a welcome** (decision 02, `docs/ux/`). The RepVyn mark, the front figure with the legs in red, "You train. **RepVyn plans.**", one sentence and "Get started". It is not a numbered step. "About you" asks Units (kg / lb) above body weight; a US device starts on lb, every other region on kg. The stepper moves 1 of the shown unit.
- **Icons and micro-interactions** (11 Oct, `app/src/ui/icons.tsx`, `motion.ts`). One icon family, 24 px grid and 2 px round strokes like the tab bar: workout length is a clock, intensity is three rising bars lit to its level. Equipment is shown as round "profile pictures" in the app's greys (a solid ink picture on a grey disc; bodyweight is a person), and chosen equipment overlaps like a row of profile pictures (three at most, then "+4"). The same avatars appear on the workout chip (which is exactly as wide as its stack), the Profile row, the picker tiles (red check when chosen) and each exercise row that needs equipment. No colours: the only colour stays the red. The Today card shows time and exercises as two pills under the reason. On the workout page, a changed choice rolls the chip value, cross-fades the figures, opens new rows (wash, "New" tag, the picture landing with a bounce, one after another), closes removed rows, and rolls and pops the count on the Start button ("Start 7 exercises"), so the change shows without scrolling and without words. The tab bar keeps one width: the chosen tab widens, the others slide aside and the dark pill glides under it; segmented switches use the same sliding pill. A light vibration (Android only) marks a choice landing. Reduced motion keeps every change as a fade.
- **Figures are painted, not encoded.** `app/src/figure.ts` describes a figure and `Paint` in `kit.tsx` draws it into a canvas at the resolution it is shown at. Do not go back to data-URL images: encoding one froze a phone-speed CPU for about half a second per screen.

## Overview

A phone app (390 × 844 design frame) with four tabs: Today, Body, Progress, Profile. Three more screens sit on top of the tabs: the program picker, the workout page, and the in-workout screen.

The character is bold and quiet at once. Very large, heavy type carries the hierarchy. Colour is almost absent: neutral greys, near-black, and one red. Red always means one thing, effort. Nothing explains itself with captions; numbers and short labels do the work.

Light and dark themes are mirror images. Every colour has a counterpart at the same role, and every screen follows the active theme.

## Colors

**Neutrals.** Light: ground `#F2F2F7`, cards `#FFFFFF`, text `#1C1C1E`. Dark: ground `#000000`, cards `#1C1C1E`, text `#F5F5F7`. Secondary text is `#636366` (light) and `#A1A1A6` (dark). `faint` is for large two-tone headline halves and icons only, never small text.

**Red is the only colour, and it means effort.**
- `accent` `#D91E36`: primary action buttons, today's outline on the week strip, the rest timer ring.
- `hero` `#C4223A`: the Today workout card. It is one step deeper than `accent` because a full card of the brighter red glares.
- The work scale, used wherever the app shows how much work was done: `#EE8794` light, `#D91E36` medium, `#7A0E1E` hardest. Grey (`track`, or `muscle-idle` on figures) means rest or untrained.

**Green and red text** appear only in the Strength list: `up` for an increase, `down` for a decrease, always with an arrow.

**Do not add a second hue.** No navy, no blue tints, no gradients on surfaces.

## Typography

One family, Geist, plus Geist Mono for measured numbers (sets, reps, times, counts).

- Page titles are 48px, weight 800, tight tracking. Two-tone titles put the secondary half in `faint` ("Week 3 **of 12**", "Choose your **program**").
- Section titles are 20px, weight 700.
- Row titles are 17px, weight 700; the detail line under them is 14px in `muted`.
- Body copy is 15px. Captions and small labels are 13px, weight 600.
- The in-workout rep count is the one oversized number (84px), because it is read from arm's length mid-exercise.

Tracking tightens as size grows: −0.04em at 48px, −0.02em at 20px, none at body sizes.

## Layout

- 20px side gutters on every screen. 56px top inset on tab pages; back buttons sit at that line.
- Sections are separated by 32px; a section title sits 12px above its card.
- One hero element per screen, then lists. Nothing competes with the hero.
- Lists are single cards with hairline dividers, not one card per item.
- Option sets never wrap unevenly. Up to five short options sit in one equal row. Longer sets use an even two-column grid, and a "none / off" choice takes a full row on top.
- Scrolling pages keep 132px of bottom padding so the floating bar never covers the last row.

## Elevation & Depth

Depth is used sparingly and declared once per element, shadow or nothing.

- List cards are flat: white on the grey ground in light, dark grey on black in dark.
- The Today hero and the Profile program card carry a soft, wide shadow in light mode. Dark mode uses no shadows; separation comes from the surface step.
- The floating nav bar has a soft shadow so content can scroll under it.
- Frosted glass (background blur) is used only over the exercise video, for the workout panel and the top controls. With reduced transparency it becomes a solid surface.

## Shapes

- Pills (`999px`) for every button, option, chip and the nav bar.
- Cards: `32px` for hero cards, `24px` for list cards, `36px` for the floating workout panel.
- Small tiles: `16px` for thumbnails, `8px` for activity-grid squares.
- Week-strip days are tall capsules, 72px high.
- Icons are drawn as 24px line icons with a 2px round stroke: dumbbell (Today), figure (Body), rising line (Progress), person (Profile).

## Components

- **Nav bar.** A floating pill. The active tab opens into a filled pill with icon and label; the others are icon-only. Light: white bar, black active pill. Dark: dark grey bar, light active pill.
- **Hero card.** One per tab. Today: red, with the body figure and a white round arrow button. Profile: white program card with a black button.
- **Body figure.** The user's own artwork in `assets/body/`, tinted per muscle by `assets/body/make.py`. Variants: `body` (fatigue), `week` (weekly work), `today` (today's targets), `prog-*` (program emphasis), `hero` (for the red card: targets in white).
- **Week strip.** Seven capsules. Done days are filled with the work-scale red for how hard that day was. Today is a red outline. Rest days are a grey outline. Upcoming days are plain cards.
- **Activity grid.** One 30px square per day, weeks as columns, opening on today and scrolling left into history.
- **Option controls.** Selected is ink on any theme; unselected is the ground colour.
- **Primary action.** One red pill, 64px high, pinned to the bottom of pushed pages.
- **Workout panel.** Frosted panel pinned to the bottom over the video. It holds everything the user touches during a set.

### Motion

- **Push** (workout page, program picker): slides in from the right over 480ms, out over 400ms, curve `cubic-bezier(0.32, 0.72, 0, 1)`. The page underneath shifts left and dims.
- **Modal** (in-workout): slides up from the bottom with the same timing.
- **Tab change**: 200ms fade. No movement, because tabs are tapped many times a day.
- **Press**: every pressable scales to 0.97 on touch-down, 160ms, curve `cubic-bezier(0.23, 1, 0.32, 1)`.
- **Panels**: option panels drop 6px from the chip or row that opened them (200ms). The workout panel rises 14px (260ms).
- **Set complete**: the progress segment turns red, thickens, and slides to its new length with a slight overshoot, then fades back to the normal fill over 1.4s. This is the one playful moment.
- **Rest ring**: drains linearly, one step per second.
- **Workout finished**: the longest sequence in the app, about 2.5 seconds, because it is rare and earned. The red floods up from the bottom as a growing circle; a ring and check draw themselves; "Workout" and "done" rise out from behind a mask; time, sets and reps rise in and count up; the body figure scales in and its trained muscles light up in white; the Finish button arrives last. The screen is red in both themes, the same red as the Today card.
- **Program switch**: the figures fade and scale in from 0.97 over 280ms; the emphasis bars slide to their new length.
- **Today's capsule**: after a finished workout it fills red with a small overshoot, once, on the first return to Today.
- **Reduced motion**: movement is replaced by 200ms fades. Press feedback stays.

## Brand and voice

Approved 10 October 2026 (decision 01 in `docs/ux/DECISION-LOG.md`).

**Promise.** For people training at home between other things, RepVyn decides what to train today from what they have already done, so they never track recovery themselves.

**What premium means here.** Expertise without admin: a coach who has already done the thinking. Calm, confident and fast. Not luxury materials, not hype.

**Three traits.** Every new screen and line of copy is checked against them.

| Trait | Means in the product | Say | Don't say |
|---|---|---|---|
| **Decisive** | State a conclusion and offer one action. Choices exist but sit one tap away. | "Legs today. They're recovered." | "You might want to try a leg day?" |
| **Honest** | Every number is real. Celebrate only what happened. Say why in one sentence. | "First workout. RepVyn learns your level from every set." | "You're crushing it! 🔥" |
| **Steady** | Rest is part of the plan, never a failure. No guilt, no loss framing. | "Rest day. Chest is still recovering." | "Don't break your streak!" |

**Voice rules.**
- Second person, present tense, short sentences. No exclamation marks.
- Labels are a number plus a noun ("6 sets", "Ready tomorrow"). Buttons name their action ("Start workout").
- Plain international English with no slang or idioms, so readers in the US and India read it the same way.
- Body talk stays neutral: no "burning", "punishing" or appearance language.
- Muscle states are always "ready / recovering / resting".

The look does not change for this: identity shows up through the body figure, the one-sentence reason, and motion at the moments that matter.

## Do's and Don'ts

**Do**
- Keep one hero per screen and let type size carry importance.
- Use the work scale for anything that shows effort: days, muscles, programs.
- Change a token in both themes together.
- Write labels as a number plus a short noun. Controls name their action.

**Don't**
- Don't add explanatory captions ("Each square is a day…").
- Don't force a dark screen in light mode, or the reverse.
- Don't use red for decoration, or as a "bad" signal outside the Strength list.
- Don't put a box or border around the body figure.
- Don't let option chips wrap into uneven rows.
- Don't animate tab changes with movement.
