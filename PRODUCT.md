# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
People doing home workouts (bodyweight, optional bar/bands/backpack) who do not want to track recovery themselves. They should not have to work out how hard they trained yesterday or which muscles are sore. They open the app, see today's workout, and do it.

## Product Purpose
A home-workout app that pushes users to train every muscle group in a balanced way. The engine in `src/engine/` infers fatigue, readiness and level from logged sets and plans the next workout. Success is users completing workouts consistently and seeing clear, visual proof of growth: muscle groups hit and strength gained, shown on the Progress tab.

## Positioning
Readiness-based planning with no manual tracking. A neighbouring app that only logs workouts cannot say "your legs are recovered, train them today" without asking the user.

## Operating Context
Mobile-first, used at home between other things, often mid-workout with sweaty hands. Four tabs: Today, Body, Progress, Profile. The canvas "Home Screen v1" is the incumbent design; it is a design mock, not yet wired to the engine.

## Capabilities and Constraints
- Engine, catalog, and params exist (TypeScript, SQLite storage). Home screen v2 is a design canvas only for now; engine wiring is a later step.
- Soreness check-in exists in the engine (`sorenessChecked`) but must stay optional and off the main path.
- Terminology: "ready / recovering / resting" for muscle states. Avoid "fatigue units" and other engine jargon in the UI.
- Muscle-state colours must not reuse the brand red as a "bad" signal.

## Brand Commitments
The palette, type and components in DESIGN.md are binding (v2 greys, ink `#1C1C1E`, one red `#D91E36` that means effort, Geist, pills, floating frosted nav, light and dark mirrored). The brand traits and voice rules are in DESIGN.md under "Brand and voice". This replaces the v1 palette (`#F2F4F3`, ink `#0D1F2D`) listed here before.

## Evidence on Hand
No real user data, photos, or exercise imagery exist. Exercise thumbnails must be placeholders. The user name "Aarav" and the program "Balanced, week 3 of 12" come from the v1 mock.

## Product Principles
1. The app decides; the user trains. Never ask the user to compute recovery.
2. Show why, briefly: one plain sentence explains today's workout.
3. Progress is the payoff and should be visible from the first screen.
4. Workout quality at home comes first; chrome recedes.

_Assumptions: this record was inferred from the user's brief and the v1 canvas, then approved by the user as a design outline in chat. Platform is mobile web (design canvas), not native._
