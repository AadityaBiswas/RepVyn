# Proposal 03: A Progress screen that pays off in week one

Status: **approved and built** (11 Oct 2026). Built screens: [6-progress-built.png](../screens/6-progress-built.png). Early preview: [03-progress-preview.png](03-progress-preview.png).

Build note: placeholders are drawn as outlined squares, not a lighter fill, because a lighter fill looked almost the same as a rest day.

## Problem (observed in the v3 build after one workout)

- The 20-week grid draws every day before you joined as a grey rest day: about 140 grey squares and one red one. It reads as "you've rested for months".
- The Strength section stays hidden until you've done an exercise twice, so the first week has no strength numbers at all.
- Weighted strength rows always say "kg", even with lb chosen.

## Proposal

1. **Days before you started are drawn as faint placeholders**, lighter than a rest day. The grid keeps its shape, but only your own days carry weight.
2. **Strength shows your starting point** until a trend exists: up to five exercises you've done once, with your best set ("Deficit push-up · 12 reps") and a grey "First" tag. Below the card is one line: "Each one gets a trend the next time you do it." Once an exercise has two sessions, the normal trend row replaces it.
3. **Strength follows your units**, so it shows lb when lb is chosen.

## Why

- Brief: Honest (real numbers only, nothing celebrated that didn't happen) and Steady (no fake rest history).
- Self-determination theory links visible, honest progress to a sense of competence ([Ryan & Deci 2000](https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf)). This is broad theory, not proof that this screen raises retention.
- NN/g: a blank or misleading empty state causes confusion about whether the system is working. A good one shows status and how it fills ([empty states](https://www.nngroup.com/articles/empty-state-interface-design/)).

## Trade-off and check

The one-line note goes against DESIGN.md's "no explanatory captions" rule. It is kept to one line, and it disappears once trends exist. Check: after a first workout, people can say what Strength will show next time.
