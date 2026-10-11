# Critique log

One critic for the whole job, briefed with the concept, the colour roles, the binding v2 rules, the refused defaults and the keep list. It saw the rendered PNGs and the "before" screenshots, not the reasoning.

## Scores by round

| # | Line | R1 | R2 |
|---|---|---|---|
| 1 | Concept on the pixel | 4 | 4 |
| 2 | Not the category average | 3 | 4 |
| 3 | Not this skill's average | 3 | 4 |
| 4 | Hierarchy | 4 | 4 |
| 5 | Typography | 4 | 4 |
| 6 | Colour | 4 | 4 |
| 7 | Richness | 4 | 4 |
| 8 | Rhythm and space | 3 | 4 |
| 9 | Craft details | 3 | 3 |
| 10 | Native fluency | 3 | 4 |
| 11 | Signature | 4 | 4 |
| 12 | The feature test | 3 | 3 |
| 13 | Fidelity | 4 | 4 |
| | Lines at 4 or above (of 12) | 6 | 10 |

Round 2 met the stop rule (no line below 3, at least 9 of 12 at 4 or above). Round 3 fixes the defects the critic still named and was **not re-scored**.

## Round 1 (`shots/r1`)

| # | Line | Score | Evidence |
|---|---|---|---|
| 1 | Concept on the pixel | 4 | Today's card reads as an atlas plate; the set screen and icon carry none of it. |
| 2 | Not the category average | 3 | Workout and Body are another app's skeleton: two small grey mannequins, a recovery list. |
| 3 | Not this skill's average | 3 | Still grey paper, one red, ruled rows; the Recovering list is a generic swatch list. |
| 4 | Hierarchy | 4 | One landing point per screen; in dark the pink Monday pill outshines today's ring. |
| 5 | Typography | 4 | One face with a voice and real scale contrast. |
| 6 | Colour | 4 | A one-red palette with a legible work scale; the dark "hot" pink reads pastel. |
| 7 | Richness | 4 | The cropped figure carries the hero and the thumbnails; the set screen has none. |
| 8 | Rhythm and space | 3 | Body strands its lower third; the hero has a 118pt empty band and one plan row shows. |
| 9 | Craft details | 3 | Four data mismatches, a soft raster figure, a ghost hand behind the title, a thumbnail sliver by the nav. |
| 10 | Native fluency | 3 | Nav and panel read as paint, not glass; no scroll-edge fade; home indicator on the panel edge. |
| 11 | Signature | 4 | Clear and born from the concept; its only affordance is five anonymous dashes. |
| 12 | The feature test | 3 | An editor would screenshot Today, not the other three. |
| 13 | Fidelity | 4 | Everything kept; the plan list is harder to reach behind a taller hero. |

6 of 12 at 4 or above, none below 3. Not done.

**The five asks, and what happened**

1. Fix four data mismatches (set screen exercise, abs on the workout page, upper back on Body, shoulders in the "tomorrow" frame). Done.
2. Rebuild the hero figure: sharper, no ghost arm, both legs clear of the edge, card shorter so two plan rows show, title outdented. Done. There is no vector source, so the figure is resampled at 3x from the region map with re-sharpened edges.
3. Make the workout page a plate: figures cropped to the trained region. Done, cut under the chest so the abs stay in.
4. Body: thumbnails in the Recovering rows, day initials for the scrubber, bigger figures when everything is ready. Thumbnails and initials done. **Declined:** the 1.2x figures, because two figures at that size are wider than the content column.
5. Make the glass read as glass: translucent nav, scroll-edge fade, lighter panel, home indicator clear, top scrim. Done.

Also changed in round 2: the set screen uses a frame of the split-squat clip instead of the standing portrait; the dark hardest-day colour is `#FF6B7D`; dark thumbnail tiles are `#2C2C2E`; the icon's third capsule is `#6E0F1F`; the small-phone hero no longer lets the legs touch the title.

## Round 2 (`shots/r2`)

All five round-1 asks were judged landed (the glass one "mostly": the light nav still reads close to opaque). Evidence for the two lines still at 3:

- **Craft (3).** Data now agrees, but the set screen had an implausible clock, a dark foot fragment beside the panel, and the workout plates sliced muscle shapes flat.
- **Feature test (3).** Today and the workout plates are screenshot-worthy; the set screen, where the user spends most time, had none of the picture language and hid its own subject.

**The next five asks, and what happened in round 3**

1. Set screen: show the whole movement above the panel, tighten the panel, nothing dark in the gutter. Done. The clip is fitted to the width and the panel is about 36pt shorter.
2. Set screen: believable clock. Done (02:10, status bar 7:44).
3. Set screen: the exercise's muscle thumbnail at the panel's top right. Done.
4. Workout plates: whole shapes only, abs at the secondary tint to match the Today card. Done. The front plate starts at the top of the abs, the back plate at the top of the glutes.
5. Cleanups: stronger top scrim and segments; row 3 fully under the fade; hero figure drawn at 6x and downsampled; ready-state figures moved down in the storyboard. Done.

## Round 3 (`shots/r3`, unscored)

Changes only, listed above. No FAILs at 402 x 874 or at 375 x 667.

**Scan warnings answered**

- *6 distinct left edges on Today.* The title is outdented 3pt on purpose so its stem lines up optically with the sentence; the rest are the capsule letters.
- *"10" and "reps each side" under 2pt apart.* The scan measures the 96px line box; the drawn gap is 12pt.
- *Storyboard has two text sizes.* It is a storyboard panel, not a screen.
- *Row text under the home indicator on the workout page (small phone).* The list scrolls under the pinned button.

**Known and left**

- On a 375 x 667 phone the set panel covers the legs in the clip. The panel was not redesigned for that size.
- The storyboard's "Everything is ready" frame is still half empty.
- The light nav is 66% white; over a white list it reads nearly opaque.
