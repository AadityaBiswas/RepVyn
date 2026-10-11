# Markup for the screens that collect what the engine needs: first-run set-up, daily check-in, sore muscles, dumbbells.
# Imported by gen3.py (build_canvas.py).

STEP = 'width: 44px; height: 44px; flex-shrink: 0; padding: 0; border: 0; border-radius: 999px; background: var(--bg); color: var(--ink); font-size: 22px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center;'
H1 = 'margin: 0; font-size: 48px; line-height: 1; font-weight: 800; letter-spacing: -0.04em;'
PILL = 'height: 44px; padding: 0 6px; border: 0; border-radius: 999px; cursor: pointer; font-size: 14px; font-weight: 600; grid-column: {{d.span}}; background: {{d.bg}}; color: {{d.fg}};'
CARD = 'padding: 16px; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column; gap: 12px;'
LAB = 'font-size: 13px; font-weight: 600; color: var(--muted);'
CTA = 'position: absolute; z-index: 3; left: 20px; right: 20px; bottom: 28px; height: 64px; border: 0; border-radius: 999px; background: var(--accent); color: #FFFFFF; font-size: 17px; font-weight: 700; letter-spacing: -0.01em; cursor: pointer; box-shadow: var(--hero-shadow);'
FADE = '<div aria-hidden="true" style="position: absolute; z-index: 2; left: 0; right: 0; bottom: 0; height: 120px; pointer-events: none; background: linear-gradient(transparent, var(--bg) 62%);"></div>'


def back(handler):
    return ('<button type="button" class="press" onClick="{{' + handler + '}}" aria-label="Back" style="position: absolute; z-index: 3; top: 56px; left: 20px; width: 48px; height: 48px; padding: 0; border: 0; border-radius: 999px; background: var(--surface); color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: var(--card-shadow);">'
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button>')


def pills(lst, cols, n):
    return ('<div style="display: grid; grid-template-columns: repeat(' + str(cols) + ', minmax(0, 1fr)); gap: 8px;">'
            '<sc-for list="{{' + lst + '}}" as="d" hint-placeholder-count="' + str(n) + '"><button type="button" class="tab" onClick="{{d.pick}}" aria-pressed="{{d.pressed}}" style="' + PILL + '">{{d.label}}</button></sc-for></div>')


# Dumbbells owned: fixed pairs or an adjustable set (Profile.dumbbells in the engine).
# No capital k in this markup: gen3's setting() swaps that letter for the row's name.
DB = ('''<div role="group" aria-label="Dumbbells" style="display: flex; flex-direction: column; gap: 12px;">
<div style="padding: 4px; border-radius: 999px; background: var(--bg); display: flex; gap: 2px;">
<sc-for list="{{db.types}}" as="d" hint-placeholder-count="2"><button type="button" class="tab" onClick="{{d.pick}}" aria-pressed="{{d.pressed}}" style="flex: 1 1 0; height: 40px; padding: 0; border: 0; border-radius: 999px; cursor: pointer; font-size: 14px; font-weight: 600; background: {{d.bg}}; color: {{d.fg}};">{{d.label}}</button></sc-for>
</div>
<sc-if value="{{db.fixed}}" hint-placeholder-val="{{true}}"><div class="pop" role="group" aria-label="Weights you own" style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px;">
<sc-for list="{{db.weights}}" as="d" hint-placeholder-count="12"><button type="button" class="tab" onClick="{{d.pick}}" aria-pressed="{{d.pressed}}" style="height: 44px; padding: 0; border: 0; border-radius: 999px; cursor: pointer; font-family: var(--mono); font-size: 14px; font-weight: 600; background: {{d.bg}}; color: {{d.fg}};">{{d.label}}</button></sc-for>
</div></sc-if>
<sc-if value="{{db.adjustable}}" hint-placeholder-val="{{false}}"><div class="pop" style="display: flex; flex-direction: column; gap: 8px;">
<sc-for list="{{db.ranges}}" as="d" hint-placeholder-count="3"><div role="group" aria-label="{{d.label}}" style="display: flex; align-items: center; gap: 8px;">
<span style="flex-grow: 1; font-size: 15px; font-weight: 600; letter-spacing: -0.01em;">{{d.label}}</span>
<button type="button" class="press" onClick="{{d.dec}}" aria-label="Less" style="@@STEP@@">−</button>
<span style="width: 72px; text-align: center; font-family: var(--mono); font-size: 16px; font-weight: 600;">{{d.value}}</span>
<button type="button" class="press" onClick="{{d.inc}}" aria-label="More" style="@@STEP@@">+</button>
</div></sc-for>
</div></sc-if>
</div>''').replace('@@STEP@@', STEP)

# Today: the daily check-in (the engine's `checkin` event). One question at a time; gone once answered.
CHECKIN = '''<sc-if value="{{ci.show}}" hint-placeholder-val="{{true}}"><section class="pop" aria-label="Daily check-in" style="margin-top: 20px; padding: 16px; border-radius: 24px; background: var(--surface); display: flex; flex-direction: column; gap: 12px;">
<h2 style="margin: 0; font-size: 17px; line-height: 1.2; font-weight: 700; letter-spacing: -0.015em;">{{ci.q}}</h2>
<div role="group" aria-label="{{ci.q}}" style="display: grid; grid-template-columns: repeat({{ci.cols}}, minmax(0, 1fr)); gap: 8px;">
<sc-for list="{{ci.opts}}" as="d" hint-placeholder-count="3"><button type="button" class="tab" onClick="{{d.pick}}" aria-pressed="{{d.pressed}}" style="height: 44px; padding: 0 6px; border: 0; border-radius: 999px; cursor: pointer; font-size: 14px; font-weight: 600; background: {{d.bg}}; color: {{d.fg}};">{{d.label}}</button></sc-for>
</div>
</section></sc-if>
'''

# In-workout: the dumbbell for this set (logged as weightKg, one dumbbell). Steps through the weights the user owns.
KGBTN = 'width: 36px; height: 36px; flex-shrink: 0; padding: 0; border: 0; border-radius: 999px; background: var(--glass-step); color: var(--glass-ink); display: flex; align-items: center; justify-content: center; cursor: pointer;'
KGROW = ('''<sc-if value="{{wk.hasKg}}" hint-placeholder-val="{{false}}"><div role="group" aria-label="Dumbbell weight" style="margin-top: 14px; height: 48px; box-sizing: border-box; padding: 0 6px 0 18px; border-radius: 999px; background: var(--glass-btn); display: flex; align-items: center; gap: 6px;">
<span style="flex-grow: 1; font-size: 15px; font-weight: 600; letter-spacing: -0.01em;"><span style="font-family: var(--mono);">{{wk.kg}}</span> kg <span style="font-weight: 500; color: var(--glass-muted);">{{wk.kgNote}}</span></span>
<button type="button" class="press" onClick="{{wk.lighter}}" aria-label="Lighter dumbbell" style="@@B@@"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"></path></svg></button>
<button type="button" class="press" onClick="{{wk.heavier}}" aria-label="Heavier dumbbell" style="@@B@@"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12M12 6v12"></path></svg></button>
</div></sc-if>
''').replace('@@B@@', KGBTN)

# Sore muscles: the body-map part of the check-in (soreRegions, sorenessChecked).
SORE = ('''<div class="{{soreCls}}" role="dialog" aria-label="Sore muscles" style="position: absolute; inset: 0; z-index: 5; background: var(--bg);">
<div class="scroll" style="height: 844px; overflow-y: auto; scrollbar-width: none;">
<div style="box-sizing: border-box; padding: 120px 20px 132px; display: flex; flex-direction: column;">
<h1 style="@@H1@@">What's <span style="color: var(--faint);">sore</span></h1>
<div role="group" aria-label="Muscles" style="margin-top: 24px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">
<sc-for list="{{soreList}}" as="d" hint-placeholder-count="12"><button type="button" class="tab" onClick="{{d.pick}}" aria-pressed="{{d.pressed}}" style="height: 52px; padding: 0 6px; border: 0; border-radius: 999px; cursor: pointer; font-size: 15px; font-weight: 600; background: {{d.bg}}; color: {{d.fg}};">{{d.label}}</button></sc-for>
</div>
</div>
</div>
''' + back('closeSore') + '\n' + FADE + '''
<button type="button" class="press" onClick="{{soreDone}}" style="@@CTA@@">Done</button>
</div>
''').replace('@@H1@@', H1).replace('@@CTA@@', CTA)


def step(i, title, faint, body):
    return ('<sc-if value="{{ob.is' + str(i) + '}}" hint-placeholder-val="{{' + ('true' if i == 0 else 'false') + '}}"><div class="pane" style="display: flex; flex-direction: column;">\n'
            '<h1 style="' + H1 + '">' + title + ' <span style="color: var(--faint);">' + faint + '</span></h1>\n' + body + '\n</div></sc-if>\n')


GOALS = ('<div role="group" aria-label="Goal" style="margin-top: 24px; display: flex; flex-direction: column; gap: 8px;">'
         '<sc-for list="{{ob.goals}}" as="d" hint-placeholder-count="2"><button type="button" class="tab" onClick="{{d.pick}}" aria-pressed="{{d.pressed}}" style="min-height: 76px; padding: 12px 20px; border: 0; border-radius: 24px; cursor: pointer; text-align: left; background: {{d.bg}}; color: {{d.fg}}; display: flex; flex-direction: column; justify-content: center; gap: 3px;">'
         '<span style="font-size: 17px; font-weight: 700; letter-spacing: -0.015em;">{{d.label}}</span><span style="font-size: 14px; opacity: 0.72;">{{d.sub}}</span></button></sc-for></div>')
WEEK = ('<div style="margin-top: 24px; ' + CARD + '"><span style="' + LAB + '">Days per week</span>' + pills('ob.days', 5, 5) + '</div>\n'
        '<div style="margin-top: 12px; ' + CARD + '"><span style="' + LAB + '">Workout length</span>' + pills('ob.lengths', 4, 4) + '</div>')
HAVE = ('<div style="margin-top: 24px; ' + CARD + '">' + pills('ob.equipment', 2, 7) + '</div>\n'
        '<sc-if value="{{ob.hasDb}}" hint-placeholder-val="{{false}}"><div class="pop" style="margin-top: 12px; ' + CARD + '"><span style="' + LAB + '">Dumbbells</span>' + DB + '</div></sc-if>')
YOU = ('<div style="margin-top: 24px; ' + CARD + '"><span style="' + LAB + '">Body weight</span>'
       '<div role="group" aria-label="Body weight" style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">'
       '<button type="button" class="press" onClick="{{st.weight.dec}}" aria-label="Lower body weight" style="' + STEP + '">−</button>'
       '<span style="font-family: var(--mono); font-size: 28px; font-weight: 600; letter-spacing: -0.02em;">{{st.weight.value}}</span>'
       '<button type="button" class="press" onClick="{{st.weight.inc}}" aria-label="Raise body weight" style="' + STEP + '">+</button></div></div>')

# First-run set-up: the engine cannot plan without a profile (goal, days, minutes, equipment, dumbbells, body weight).
ONBOARD = ('''<div class="{{obCls}}" role="dialog" aria-label="Set up" style="position: absolute; inset: 0; z-index: 7; background: var(--bg);">
<div class="scroll" style="height: 844px; overflow-y: auto; scrollbar-width: none;">
<div style="box-sizing: border-box; padding: 132px 20px 132px; display: flex; flex-direction: column;">
''' + step(0, 'Your', 'goal', GOALS) + step(1, 'Your', 'week', WEEK) + step(2, 'Your', 'equipment', HAVE) + step(3, 'About', 'you', YOU) + '''</div>
</div>
<sc-if value="{{ob.canBack}}" hint-placeholder-val="{{false}}">''' + back('ob.back') + '''</sc-if>
<div role="progressbar" aria-label="Set-up steps" aria-valuemin="1" aria-valuemax="4" aria-valuenow="{{ob.now}}" style="position: absolute; z-index: 3; top: 77px; left: {{ob.segLeft}}px; right: 20px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; transition: left 280ms cubic-bezier(0.23,1,0.32,1);">
<sc-for list="{{ob.segs}}" as="g" hint-placeholder-count="4"><span style="height: 6px; border-radius: 999px; background: {{g.bg}}; transition: background-color 280ms ease;"></span></sc-for>
</div>
''' + FADE + '''
<button type="button" class="press" onClick="{{ob.next}}" style="''' + CTA + '''">Continue</button>
</div>
''')

# Workout page: one exercise row. Tapping it opens Like / Dislike (the engine's `exercise_feedback.liked`).
# The row then carries the chosen thumb in place of the dots.
UP = '<path d="M7 10v12"></path><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"></path>'
DOWN = '<path d="M17 14V2"></path><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"></path>'


def thumb_icon(path, size, style=''):
    return ('<svg width="' + str(size) + '" height="' + str(size) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0;' + style + '">' + path + '</svg>')


DOTS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex-shrink: 0; color: var(--faint); display: {{x.dots}};"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>'
FB = 'height: 48px; padding: 0; border: 0; border-radius: 999px; cursor: pointer; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; display: flex; align-items: center; justify-content: center; gap: 8px;'


def fbtn(key, label, path):
    return ('<button type="button" class="tab" onClick="{{x.' + key + '.pick}}" aria-pressed="{{x.' + key + '.pressed}}" style="' + FB + ' background: {{x.' + key + '.bg}}; color: {{x.' + key + '.fg}};">' + thumb_icon(path, 18) + label + '</button>')


def exrow(thumb, extext):
    return ('<li style="display: flex; flex-direction: column; border-top: 1px solid {{x.rule}};">\n'
            '<button type="button" class="press" onClick="{{x.toggle}}" aria-expanded="{{x.expanded}}" aria-label="{{x.aria}}" style="min-height: 80px; padding: 0; border: 0; background: transparent; color: var(--ink); display: flex; align-items: center; gap: 14px; text-align: left; cursor: pointer;">\n'
            + thumb + '\n' + extext + '\n' + thumb_icon(UP, 20, ' display: {{x.up}};') + thumb_icon(DOWN, 20, ' color: var(--muted); display: {{x.down}};') + DOTS + '</button>\n'
            '<sc-if value="{{x.open}}" hint-placeholder-val="{{false}}"><div class="pop" role="group" aria-label="Your take on this exercise" style="padding: 0 0 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">'
            + fbtn('like', 'Like', UP) + fbtn('dislike', 'Dislike', DOWN) + '</div></sc-if>\n</li>')


# After an exercise: reps left, the engine's 0 to 5+.
QBTN = 'height: 52px; padding: 0; border: 0; border-radius: 14px; cursor: pointer; font-weight: 600; background: {{d.bg}}; color: {{d.fg}}; box-shadow: 0 0 0 3px {{d.ring}}; opacity: {{d.op}}; transition: opacity 200ms ease, box-shadow 200ms ease, transform 160ms cubic-bezier(0.23,1,0.32,1);'
QLAB = 'font-size: 13px; font-weight: 600; letter-spacing: 0.01em; color: var(--glass-muted);'
QS = ('''<sc-if value="{{wk.qLeft}}" hint-placeholder-val="{{false}}"><div role="group" aria-label="Reps left in the tank" style="display: flex; flex-direction: column; gap: 10px;">
<span style="''' + QLAB + '''">How many more reps could you do?</span>
<div style="display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px;">
<sc-for list="{{wk.efforts}}" as="d" hint-placeholder-count="6"><button type="button" class="press" onClick="{{d.pick}}" aria-pressed="{{d.pressed}}" aria-label="{{d.aria}}" style="''' + QBTN + ''' font-family: var(--mono); font-size: 16px;">{{d.label}}</button></sc-for>
</div>
<div aria-hidden="true" style="display: flex; justify-content: space-between; font-size: 12px; line-height: 15px; font-weight: 500; color: var(--glass-muted);"><span>Too hard</span><span>Too easy</span></div>
</div></sc-if>
''')
