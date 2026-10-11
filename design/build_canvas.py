import re, os, json, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extra import DB, CHECKIN, KGROW, SORE, ONBOARD, exrow, QS
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'project'))

HEAD = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Home</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&amp;family=Geist+Mono:wght@500;600&amp;display=swap">
<style>
body{margin:0;background:#F2F2F7;font-family:'Geist',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
button{font-family:inherit;-webkit-tap-highlight-color:transparent}
.v2{--spring:linear(0, 0.292, 0.499, 0.645, 0.749, 0.823, 0.875, 0.912, 0.938, 0.956, 0.969, 0.979, 0.985, 0.99, 0.993, 0.995, 0.997, 0.998, 0.999, 1, 1);--bg:#F2F2F7;--surface:#FFFFFF;--ink:#1C1C1E;--muted:#636366;--faint:#8E8E93;--line:#D1D1D6;--track:#E1E1E6;--accent:#D91E36;--accent-text:#D91E36;--soft:rgba(0,0,0,0.05);--tile-on:#FFFFFF;--hero:#C4223A;--hero-ink:#FFFFFF;--hero-card-shadow:0 18px 36px -24px rgba(196,34,58,0.5);--glass:rgba(255,255,255,0.76);--glass-ink:#1C1C1E;--glass-inv:#FFFFFF;--glass-muted:rgba(28,28,30,0.64);--glass-btn:rgba(0,0,0,0.07);--glass-step:#FFFFFF;--glass-edge:rgba(255,255,255,0.95);--glass-shadow:0 24px 48px -20px rgba(0,0,0,0.28);--v-track:rgba(0,0,0,0.14);--v-fill:#1C1C1E;--v-ink:#1C1C1E;--v-muted:rgba(28,28,30,0.62);--video:linear-gradient(165deg,#F4F4F8,#DCDCE2 55%,#C9C9CF);--video-ink:rgba(0,0,0,0.32);--nav:#FFFFFF;--nav-on:#1C1C1E;--nav-on-ink:#FFFFFF;--nav-ink:#636366;--nav-shadow:0 1px 2px rgba(0,0,0,0.06),0 18px 36px -16px rgba(0,0,0,0.3);--hero-shadow:0 26px 48px -22px rgba(217,30,54,0.6);--cta:#FFFFFF;--cta-ink:#1C1C1E;--cta-on:#1C1C1E;--cta-on-ink:#FFFFFF;--hero2:#1C1C1E;--hero2-shadow:0 26px 48px -22px rgba(0,0,0,0.7);--ring:#FF5068;--bar:#FFFFFF;--bar-shadow:0 1px 2px rgba(0,0,0,0.06),0 18px 40px -16px rgba(0,0,0,0.32);--up:#1A6B3B;--up-bg:rgba(31,122,68,0.14);--down:#B0152B;--down-bg:rgba(217,30,54,0.11);--m-today:#D91E36;--m-ready:#1C1C1E;--m-rec:#9AA6AD;--card-shadow:0 1px 3px rgba(0,0,0,0.05),0 22px 44px -18px rgba(0,0,0,0.25);--mono:'Geist Mono',ui-monospace,Consolas,monospace}
.v2[data-theme="dark"]{--tile-on:rgba(0,0,0,0.35);--hero:#B8233A;--hero-ink:#FFFFFF;--hero-card-shadow:0 18px 36px -24px rgba(184,35,58,0.4);--glass:rgba(28,28,30,0.58);--glass-ink:#FFFFFF;--glass-inv:#1C1C1E;--glass-muted:rgba(255,255,255,0.72);--glass-btn:rgba(255,255,255,0.16);--glass-step:rgba(255,255,255,0.18);--glass-edge:rgba(255,255,255,0.18);--glass-shadow:0 24px 48px -20px rgba(0,0,0,0.6);--v-track:rgba(255,255,255,0.3);--v-fill:#FFFFFF;--v-ink:#FFFFFF;--v-muted:rgba(255,255,255,0.72);--video:linear-gradient(165deg,#5A5A5E,#2C2C2E 55%,#1C1C1E);--video-ink:rgba(255,255,255,0.45);--bg:#000000;--surface:#1C1C1E;--ink:#F5F5F7;--muted:#A1A1A6;--faint:#8E8E93;--line:#3A3A3C;--track:#2C2C2E;--accent:#E22A40;--accent-text:#FF6B7B;--soft:rgba(255,255,255,0.09);--nav:#2C2C2E;--nav-on:#F5F5F7;--nav-on-ink:#000000;--nav-ink:rgba(245,245,247,0.66);--nav-shadow:0 18px 36px -14px rgba(0,0,0,0.9);--hero-shadow:0 26px 48px -22px rgba(226,42,64,0.55);--card-shadow:none;--up:#3DD68C;--up-bg:rgba(61,214,140,0.16);--down:#FF6B7B;--down-bg:rgba(255,107,123,0.16);--hero2-shadow:none;color:#F5F5F7}
.v2 ::selection{background:rgba(217,30,54,0.22)}
.v2 :focus{outline:none}
.v2 :focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.v2 nav :focus-visible{outline-color:var(--accent)}
.seg{transition:transform 420ms cubic-bezier(0.34,1.56,0.64,1)}\n.fill{transform-origin:left center;transition-property:transform,background-color;transition-timing-function:cubic-bezier(0.34,1.4,0.64,1),ease}\n.ring{transition:stroke-dashoffset 1s linear}\n.knob{transform-origin:155px 155px;transition:rotate 1s linear}\n.holdbar{transform-origin:left center;transition:transform 1s linear}\n.timer-in{animation:timer-in 560ms var(--spring) both}\n@keyframes timer-in{from{opacity:0;scale:0.88}}\n.next-in{animation:next-in 600ms var(--spring) 200ms both}\n@keyframes next-in{from{opacity:0;translate:0 18px}}\n.scroll::-webkit-scrollbar{display:none}
.v2 .on-dark{display:none !important}
.v2[data-theme="dark"] .on-dark{display:block !important}
.v2[data-theme="dark"] .on-light{display:none !important}
.press{transition:scale 160ms cubic-bezier(0.23,1,0.32,1)}
.press:active{scale:0.97}
.tab{transition:background-color 200ms cubic-bezier(0.23,1,0.32,1),color 200ms cubic-bezier(0.23,1,0.32,1),scale 160ms cubic-bezier(0.23,1,0.32,1)}
.tab:active{scale:0.95}
@media (prefers-reduced-motion:no-preference){
.pane{animation:pane 200ms cubic-bezier(0.23,1,0.32,1) both}
}
@keyframes pane{from{opacity:0}to{opacity:1}}
.pop{animation:pop 200ms cubic-bezier(0.23,1,0.32,1) both}\n.lift{animation:lift 420ms var(--spring) both}\n.f-flood{clip-path:circle(150% at 50% 90%);animation:f-flood 820ms cubic-bezier(0.32,0.72,0,1) both}\n@keyframes f-flood{from{clip-path:circle(0% at 50% 90%)}}\n.f-draw{animation:f-draw 600ms cubic-bezier(0.65,0,0.35,1) both}\n@keyframes f-draw{from{stroke-dashoffset:var(--len)}}\n.f-line{display:block;animation:f-line 720ms var(--spring) both}\n@keyframes f-line{from{translate:0 110%}}\n.f-up{animation:f-up 620ms var(--spring) both}\n@keyframes f-up{from{opacity:0;translate:0 18px}}\n.f-fig{animation:f-fig 820ms var(--spring) both}\n@keyframes f-fig{from{opacity:0;scale:0.9}}\n.f-lit{animation:f-lit 900ms cubic-bezier(0.23,1,0.32,1) both}\n@keyframes f-lit{from{opacity:0}}\n.swap{animation:swap 360ms var(--spring) both}\n@keyframes swap{from{opacity:0;scale:0.96}}\n.capfill{animation:capfill 620ms var(--spring) 560ms both}\n@keyframes capfill{from{background-color:transparent;color:var(--ink);scale:0.8}}\n@keyframes lift{from{opacity:0;translate:0 16px}}
@keyframes pop{from{opacity:0;translate:0 -6px}}
.page-in{animation:page-in 480ms cubic-bezier(0.32,0.72,0,1) both;box-shadow:-24px 0 48px -24px rgba(0,0,0,0.35)}\n.page-out{animation:page-out 400ms cubic-bezier(0.32,0.72,0,1) both;box-shadow:-24px 0 48px -24px rgba(0,0,0,0.35)}\n.page-fwd{animation:page-fwd 480ms cubic-bezier(0.32,0.72,0,1) both}\n.under-in{animation:under-in 480ms cubic-bezier(0.32,0.72,0,1) both}\n.under-out{animation:under-out 400ms cubic-bezier(0.32,0.72,0,1) both}\n.under-fwd{animation:under-fwd 480ms cubic-bezier(0.32,0.72,0,1) both}\n.sheet-in{animation:sheet-in 480ms cubic-bezier(0.32,0.72,0,1) both}\n.sheet-out{animation:sheet-out 400ms cubic-bezier(0.32,0.72,0,1) both}\n@keyframes sheet-in{from{transform:translateY(100%)}to{transform:none}}\n@keyframes sheet-out{from{transform:none}to{transform:translateY(100%)}}\n@keyframes page-in{from{transform:translateX(100%)}to{transform:none}}\n@keyframes page-out{from{transform:none}to{transform:translateX(100%)}}\n@keyframes page-fwd{from{transform:none;opacity:1}to{transform:translateX(-30%);opacity:0}}\n@keyframes under-in{from{transform:none;opacity:1}to{transform:translateX(-28%);opacity:0.55}}\n@keyframes under-out{from{transform:translateX(-28%);opacity:0.55}to{transform:none;opacity:1}}\n@keyframes under-fwd{from{transform:translateX(100%)}to{transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media (prefers-reduced-transparency:reduce){.glass{background:var(--surface) !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important}}\n@media (prefers-reduced-motion:reduce){.fin *,.capfill{animation:none !important}.timer-in,.next-in{animation:pane 200ms ease both}.knob,.holdbar{transition:none}.swap{animation:pane 200ms ease both}.fill,.seg,.ring{transition:none}.page-out,.page-fwd,.under-in,.under-out,.sheet-out{animation:none}.page-in,.sheet-in,.under-fwd,.pop,.lift,.pane{animation:pane 200ms ease both}.cta,.knob{transition:none}}
</style>
</helmet>
'''

ROOT_OPEN = '''<div class="v2" data-theme="{{themeName}}" style="width: 390px; height: 844px; position: relative; overflow: hidden; background: var(--bg); color: var(--ink); font-family: 'Geist', system-ui, sans-serif; font-variant-numeric: tabular-nums;">
'''


def svg(p, w=22, sw=1.8):
    return '<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">%s</svg>' % (w, w, sw, p)


ICONS = {
    'today': '<path d="M7 7v10M17 7v10M3.5 9.5v5M20.5 9.5v5M7 12h10"></path>',
    'body': '<circle cx="12" cy="5" r="2.2"></circle><path d="M6 9.5c2 .8 4 1.2 6 1.2s4-.4 6-1.2M12 10.7V15M12 15l-3 5.5M12 15l3 5.5"></path>',
    'progress': '<path d="M4 19.5h16M6.5 15l3.5-4 3 2.500L17.500 7"></path><path d="M14 7h3.500v3.500"></path>',
    'profile': '<circle cx="12" cy="8.500" r="3.500"></circle><path d="M5 19.500c1.200-3.200 3.800-4.800 7-4.800s5.800 1.600 7 4.800"></path>',
    'clock': '<circle cx="12" cy="12" r="8.500"></circle><path d="M12 7.500V12l3 2"></path>',
    'list': '<path d="M9 6.500h11M9 12h11M9 17.500h11M4.500 6.500h.01M4.500 12h.01M4.500 17.500h.01"></path>',
    'flame': '<path d="M12 21c3.600 0 6-2.500 6-6 0-3.400-2.300-5.300-3.600-7.700-.500-.900-.800-2-.900-3.300-2.600 1.400-4.100 3.600-4.300 6.300-.900-.700-1.500-1.500-1.800-2.500C6.300 9.500 6 11.300 6 15c0 3.500 2.400 6 6 6z"></path>',
    'calendar': '<rect x="4" y="5" width="16" height="15" rx="3"></rect><path d="M4 10h16M8.500 3v4M15.500 3v4"></path>',
}


def tab(key, label):
    return ('<button type="button" class="tab" onClick="{{nav.K.go}}" aria-current="{{nav.K.cur}}" aria-label="L" style="height: 52px; min-width: 62px; padding: 0 {{nav.K.pad}}px; border: 0; border-radius: 999px; cursor: pointer; background: {{nav.K.bg}}; color: {{nav.K.fg}}; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 14px; font-weight: 600; letter-spacing: -0.01em;">'
            + svg(ICONS[key], 22, 2) + '<span style="display: {{nav.K.label}};">L</span></button>').replace('K', key).replace('>L<', '>' + label + '<').replace('aria-label="L"', 'aria-label="%s"' % label)


NAV = ('<nav aria-label="Main" style="position: absolute; z-index: 3; left: 50%; bottom: 28px; transform: translateX(-50%); width: max-content; box-sizing: border-box; padding: 6px; border-radius: 999px; display: flex; gap: 2px; background: var(--nav); box-shadow: var(--nav-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.12);">\n'
       + '\n'.join(tab(k, l) for k, l in (('today', 'Today'), ('body', 'Body'), ('progress', 'Progress'), ('profile', 'Profile'))) + '\n</nav>\n')

THUMB = ('<span role="img" aria-label="Exercise photo placeholder" style="width: 56px; height: 56px; flex-shrink: 0; border-radius: 16px; background: var(--bg); color: var(--faint); display: flex; align-items: center; justify-content: center;">'
         '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="M20.5 15.5l-4.5-4.5-8.5 8.5"></path></svg></span>')
EXTEXT = ('<span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px;"><span style="font-size: 17px; line-height: 1.2; font-weight: 700; letter-spacing: -0.015em;">%s</span>'
          '<span style="font-size: 14px; color: var(--muted);">%s</span></span>')

PANE_OPEN = '<div class="scroll pane" style="height: 844px; overflow-y: auto; scrollbar-width: none;">\n<div style="box-sizing: border-box; padding: 56px 20px 136px; display: flex; flex-direction: column;">\n'
PANE_CLOSE = '</div>\n</div>\n'
CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>'

# ---------- Today ----------
segs = ''.join('<span style="height: 6px; border-radius: 999px; background: %s;"></span>' % ('var(--ink)' if i < 2 else 'var(--accent)' if i == 2 else 'var(--track)') for i in range(12))


def day(letter, n, state, label):
    base = 'height: 72px; border-radius: 999px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;'
    if state == 'done':
        st, lc, inner = 'background: ' + {28: '#7A0E1E', 30: '#D91E36'}[n] + '; color: #FFFFFF;', 'opacity: 0.8;', CHECK
    elif state == 'today':
        st, lc = 'border: 2px solid var(--accent); background: {{td.bg}}; color: {{td.fg}};', ''
        inner = '<sc-if value="{{td.done}}" hint-placeholder-val="{{false}}">' + CHECK + '</sc-if><sc-if value="{{td.todo}}" hint-placeholder-val="{{true}}">' + str(n) + '</sc-if>'
    elif state == 'future':
        st, lc, inner = 'background: var(--surface); color: var(--ink);', 'color: var(--muted);', str(n)
    else:
        st, lc, inner = 'border: 1.5px solid var(--line); color: var(--muted);', '', str(n)
    return ('<div role="listitem" aria-label="%s" style="%s %s">\n<span aria-hidden="true" style="font-size: 11px; font-weight: 600; %s">%s</span>\n'
            '<span aria-hidden="true" style="height: 18px; display: flex; align-items: center; font-size: 16px; font-weight: 700; letter-spacing: -0.02em;">%s</span>\n</div>') % (label, base, st, lc, letter, inner)


days = [('M', 28, 'done', 'Monday, workout done'), ('T', 29, 'rest', 'Tuesday, rest day'), ('W', 30, 'done', 'Wednesday, workout done'),
        ('T', 1, 'rest', 'Thursday, rest day'), ('F', 2, 'today', 'Friday, today'), ('S', 3, 'future', 'Saturday'), ('S', 4, 'future', 'Sunday')]
week = '\n'.join(day(*d) for d in days).replace('<div role="listitem" aria-label="Friday, today"', '<div class="{{td.cls}}" role="listitem" aria-label="Friday, today"')

plan = [('Split squat', '3 sets · 10 reps each side'), ('Single-leg glute bridge', '3 sets · 12 reps each side'), ('Reverse lunge', '3 sets · 10 reps each side'),
        ('Single-leg calf raise', '3 sets · 15 reps each side'), ('Plank', '3 sets · 40 sec')]
rows = []
for i, (n, d) in enumerate(plan):
    div = '' if i == len(plan) - 1 else ' border-bottom: 1px solid var(--soft);'
    rows.append('<li style="min-height: 80px; box-sizing: border-box; display: flex; align-items: center; gap: 14px;' + div + '">\n' + THUMB + '\n' + EXTEXT % (n, d) + '\n</li>')

TODAY = PANE_OPEN + '''<header style="display: flex; flex-direction: column;">
<h1 style="margin: 0; font-size: 48px; line-height: 1; font-weight: 800; letter-spacing: -0.04em;">Week {{program.week}} <span style="color: var(--faint);">of 12</span></h1>
<button type="button" class="press" onClick="{{openPrograms}}" style="margin-top: 8px; align-self: flex-start; min-height: 32px; padding: 0; border: 0; background: transparent; cursor: pointer; display: flex; align-items: center; gap: 2px; font-size: 15px; font-weight: 500; color: var(--muted);">
{{program.title}}
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
</button>
<div role="progressbar" aria-label="Weeks completed" aria-valuemin="0" aria-valuemax="12" aria-valuenow="{{program.done}}" style="margin-top: 16px; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 4px;">@@SEGS@@</div>
</header>

<div role="list" aria-label="This week" style="margin-top: 28px; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px;">
@@WEEK@@
</div>

@@CHECKIN@@<section class="rise press" onClick="{{openSetup}}" aria-label="Today's workout" style="margin-top: 20px; border-radius: 32px; background: var(--hero); color: var(--hero-ink); padding: 24px 20px 20px 24px; display: flex; flex-direction: column; cursor: pointer; box-shadow: var(--hero-card-shadow);">
<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
<div style="min-width: 0; display: flex; flex-direction: column;">
<h2 style="margin: 0; font-size: 48px; line-height: 0.96; font-weight: 800; letter-spacing: -0.04em;">Lower<br>body</h2>
<p style="margin: 14px 0 0; max-width: 20ch; font-size: 15px; line-height: 1.4; font-weight: 500; text-wrap: pretty;">Your legs are fully recovered. Chest and shoulders rest today.</p>
</div>
<div style="width: 92px; flex-shrink: 0;"><img src="/_blob/e601d1613a51b8ea182f6a78489461a8" alt="Front of the body with the legs highlighted." style="display: block; width: 100%; height: 168px; object-fit: contain;"></div>
</div>
<div style="margin-top: 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
<p style="margin: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 14px; font-weight: 600;"><span style="display: flex; align-items: center; gap: 6px;">@@CLOCK@@{{minutes}} min</span><span style="display: flex; align-items: center; gap: 6px;">@@LIST@@5 exercises</span></p>
<button type="button" class="press" onClick="{{openSetup}}" aria-label="View workout" style="width: 56px; height: 56px; flex-shrink: 0; padding: 0; border: 0; border-radius: 999px; background: #FFFFFF; color: var(--hero); display: flex; align-items: center; justify-content: center; cursor: pointer;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></button>
</div>
</section>

<section style="margin-top: 32px; display: flex; flex-direction: column; gap: 12px;">
<h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">Today's plan</h2>
<ol style="margin: 0; padding: 0 16px; list-style: none; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column;">
@@ROWS@@
</ol>
</section>
''' + PANE_CLOSE
TODAY = TODAY.replace('@@CLOCK@@', svg(ICONS['clock'], 16, 2)).replace('@@LIST@@', svg(ICONS['list'], 16, 2)).replace('@@SEGS@@', '<sc-for list="{{segs}}" as="g" hint-placeholder-count="12"><span style="height: 6px; border-radius: 999px; background: {{g.bg}};"></span></sc-for>').replace('@@WEEK@@', week).replace('@@CHECKIN@@', CHECKIN).replace('@@ROWS@@', '\n'.join(rows))

# ---------- Progress ----------
# 20 weeks ending this week. 0 = rest, 1-3 = how hard the workout was, 'today', None = not happened yet.
HIST = []
for w in range(17):
    days = [] if w == 10 else [[0, 2, 4], [0, 1, 4], [0, 2, 4, 5], [1, 3, 5]][w % 4]
    HIST.append([1 + (w * 3 + d * 5) % 3 if d in days else 0 for d in range(7)])
HIST += [[2, 0, 1, 0, 3, 1, 0], [2, 2, 0, 0, 3, 0, 0], [3, 0, 2, 0, 'today', None, None]]
CELL = 'width: 30px; height: 30px; box-sizing: border-box; border-radius: 8px;'
LEVEL = {1: '#EE8794', 2: '#D91E36', 3: '#7A0E1E'}


def cell(v):
    if v == 'today':
        return CELL + ' border: 2.5px solid var(--ink);'
    if v is None:
        return CELL
    if v == 0:
        return CELL + ' background: var(--track);'
    return CELL + ' background: ' + LEVEL[v] + ';'


months = {0: 'May', 2: 'Jun', 7: 'Jul', 11: 'Aug', 16: 'Sep', 19: 'Oct'}
mrow = ''.join('<span style="width: 30px; font-size: 11px; font-weight: 600; color: var(--muted); white-space: nowrap;">%s</span>' % months.get(i, '') for i in range(len(HIST)))
cells = ''.join('<span style="%s"></span>' % cell(v) for wk in HIST for v in wk)
dlab = ''.join('<span style="height: 30px; display: flex; align-items: center; font-size: 11px; font-weight: 600; color: var(--muted);">%s</span>' % l for l in ['M', '', 'W', '', 'F', '', 'S'])
legend = ''.join('<span style="width: 12px; height: 12px; border-radius: 4px; background: %s;"></span>' % c for c in ('var(--track)', '#EE8794', '#D91E36', '#7A0E1E'))
grid = ('<div role="img" aria-label="Workout history, one square per day, for the last 20 weeks. Workouts in each of the last 9 weeks." style="margin: 28px -20px 0 0; display: flex; gap: 8px;">\n'
        '<div aria-hidden="true" style="flex-shrink: 0; padding-top: 22px; display: flex; flex-direction: column; gap: 6px;">' + dlab + '</div>\n'
        # direction: rtl makes the strip open at its right end (today); scroll left for older weeks.
        '<div class="scroll" aria-hidden="true" style="flex: 1 1 0; min-width: 0; overflow-x: auto; scrollbar-width: none; direction: rtl;">\n'
        '<div style="direction: ltr; width: max-content; padding-right: 20px; display: flex; flex-direction: column; gap: 6px;">\n'
        '<div style="height: 16px; display: flex; gap: 6px;">' + mrow + '</div>\n'
        '<div style="display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 30px); gap: 6px;">' + cells + '</div>\n'
        '</div>\n</div>\n</div>\n'
        '<div aria-hidden="true" style="margin-top: 14px; display: flex; align-items: center; justify-content: flex-end; gap: 5px; font-size: 12px; font-weight: 500; color: var(--muted);"><span style="margin-right: 3px;">Rest</span>' + legend + '<span style="margin-left: 3px;">Hard</span></div>')
grid = [grid]

WEEKBLOB = {('Front', 'light'): '/_blob/20ed4789768f4454c706563f2dc56047', ('Back', 'light'): '/_blob/ed3694c6a8f724f0970c2872ba14ca02',
            ('Front', 'dark'): '/_blob/766f74a4201bfebffcf75a4323e2fbda', ('Back', 'dark'): '/_blob/4726cb278cf21ee2c7c454698cd74143'}


def wslot(label):
    img = 'display: block; width: 100%; height: 260px; object-fit: contain;'
    alt = label + ' of the body, darker red where more sets were done this week. Legs are grey: not trained yet.'
    return ('<figure style="margin: 0;">'
            '<img class="on-light" src="' + WEEKBLOB[(label, 'light')] + '" alt="' + alt + '" style="' + img + '">'
            '<img class="on-dark" src="' + WEEKBLOB[(label, 'dark')] + '" alt="' + alt + '" style="' + img + '"></figure>')


REDS = [(0.0, 'F7CDD2'), (0.5, 'E8596B'), (0.75, 'D91E36'), (1.0, '7A0E1E')]


def shade(v):
    # same ramp as assets/body/make.py REDS, relative to the most-trained muscle (0.75 of its target)
    t = v / 0.75
    for (a, ca), (b, cb) in zip(REDS, REDS[1:]):
        if t <= b:
            return '#' + ''.join('%02X' % round(int(ca[i:i + 2], 16) + (int(cb[i:i + 2], 16) - int(ca[i:i + 2], 16)) * (t - a) / (b - a)) for i in (0, 2, 4))
    return '#' + REDS[-1][1]


SW = 'width: 16px; height: 16px; flex-shrink: 0; border-radius: 5px;'
muscles = [('Chest', 9, 12, 0.75), ('Triceps', 6, 9, 0.67), ('Front shoulders', 5, 8, 0.63), ('Upper back', 8, 14, 0.57), ('Biceps', 4, 9, 0.44), ('Abs', 3, 9, 0.33), ('Legs', 0, 16, 0)]
mrows = []
for i, (n, sets, target, v) in enumerate(muscles):
    div = '' if i == len(muscles) - 1 else ' border-bottom: 1px solid var(--soft);'
    lc, dc = (shade(v),) * 2 if v else ('#AEAEB2', '#48484A')
    mrows.append('<li style="min-height: 60px; box-sizing: border-box; display: flex; align-items: center; gap: 12px;' + div + '">'
                 '<span class="on-light" aria-hidden="true" style="' + SW + ' background: ' + lc + ';"></span><span class="on-dark" aria-hidden="true" style="' + SW + ' background: ' + dc + ';"></span>'
                 '<span style="flex: 1 1 0; min-width: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.01em;">' + n + '</span>'
                 '<span style="flex-shrink: 0; font-family: var(--mono); font-size: 13px; color: var(--muted);"><span style="font-size: 15px; font-weight: 600; color: var(--ink);">' + str(sets) + '</span>/' + str(target) + ' sets</span></li>')

lifts = [('Push-up', 'reps', [8, 9, 9, 10, 11, 11, 12]), ('Split squat', 'reps each side', [7, 8, 8, 9, 9, 10]), ('Bent-knee table row', 'reps', [10, 11, 12, 12, 13, 14]),
         ('Plank', 'sec', [30, 32, 35, 38, 40, 45]), ('Pike push-up', 'reps', [7, 8, 7, 6, 5, 4])]
lrows = []
for i, (n, unit, vals) in enumerate(lifts):
    lo, hi = min(vals), max(vals)
    pts = [(2 + j * 60 / (len(vals) - 1), 25 - (v - lo) / max(hi - lo, 1) * 22) for j, v in enumerate(vals)]
    d = 'M' + ' L'.join('%.1f %.1f' % p for p in pts)
    diff = vals[-1] - vals[0]
    up = diff >= 0
    col = 'var(--up)' if up else 'var(--down)'
    pill = ('background: var(--up-bg); color: var(--up);' if up else 'background: var(--down-bg); color: var(--down);')
    arrow = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform: rotate(' + ('0' if up else '180') + 'deg);"><path d="M12 19V5M6 11l6-6 6 6"></path></svg>'
    div = '' if i == len(lifts) - 1 else ' border-bottom: 1px solid var(--soft);'
    lrows.append('<li style="min-height: 64px; box-sizing: border-box; display: flex; align-items: center; gap: 12px;' + div + '">\n'
                 '<span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 16px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + n + '</span>'
                 '<span style="font-size: 13px; color: var(--muted);"><span style="font-family: var(--mono); font-weight: 600; color: var(--ink);">' + str(vals[0]) + ' → ' + str(vals[-1]) + '</span> ' + unit + '</span></span>\n'
                 '<svg width="64" height="28" viewBox="0 0 64 28" aria-hidden="true" style="flex-shrink: 0; overflow: visible; color: ' + col + ';"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="%.1f" cy="%.1f" r="3" fill="currentColor"></circle></svg>\n' % pts[-1]
                 + '<span aria-label="' + ('Up ' if up else 'Down ') + str(abs(diff)) + '" style="flex-shrink: 0; min-width: 44px; box-sizing: border-box; height: 28px; padding: 0 10px; border-radius: 999px; ' + pill + ' display: flex; align-items: center; justify-content: center; gap: 3px; font-family: var(--mono); font-size: 13px; font-weight: 600;">' + arrow + str(abs(diff)) + '</span>\n</li>')

PROGRESS = PANE_OPEN + '''<header style="display: flex; flex-direction: column;">
<h1 style="margin: 0; font-size: 48px; line-height: 1; font-weight: 800; letter-spacing: -0.04em;">Progress</h1>
</header>

<p style="margin: 10px 0 0; font-size: 22px; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em;">9-week streak <span style="color: var(--faint);">· day 138</span></p>
@@GRID@@

<section style="margin-top: 36px; display: flex; flex-direction: column; gap: 12px;">
<h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">Muscles this week</h2>
<div style="margin-top: 4px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">
@@WSLOTS@@
</div>
<ul style="margin: 8px 0 0; padding: 4px 20px; list-style: none; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column;">
@@MUSCLES@@
</ul>
</section>

<section style="margin-top: 32px; display: flex; flex-direction: column; gap: 12px;">
<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px;">
<h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">Strength</h2>
</div>
<ul style="margin: 0; padding: 4px 20px; list-style: none; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column;">
@@LIFTS@@
</ul>
</section>
''' + PANE_CLOSE
PROGRESS = PROGRESS.replace('@@FLAME@@', svg(ICONS['flame'], 20, 2)).replace('@@CAL@@', svg(ICONS['calendar'], 20, 2)).replace('@@GRID@@', '\n'.join(grid)).replace('@@MUSCLES@@', '\n'.join(mrows)).replace('@@WSLOTS@@', wslot('Front') + '\n' + wslot('Back')).replace('@@LIFTS@@', '\n'.join(lrows))


CHEVR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform: rotate({{st.K.rot}}deg); transition: transform 200ms cubic-bezier(0.23,1,0.32,1);"><path d="M9 6l6 6-6 6"></path></svg>'
OPTBTN = 'height: 44px; padding: 0 6px; border: 0; border-radius: 999px; cursor: pointer; font-size: 14px; font-weight: 600; grid-column: {{d.span}};'
STEP = 'width: 44px; height: 44px; padding: 0; border: 0; border-radius: 999px; background: var(--bg); color: var(--ink); font-size: 22px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center;'


def setting(key, label, last):
    div = '' if last or key in ('equip', 'dumbbells') else ' border-bottom: 1px solid var(--soft);'
    if key == 'goal':
        panel = ('<div class="pop" role="group" aria-label="Goal" style="padding: 0 0 16px; display: flex; flex-direction: column; gap: 8px;">'
                 '<sc-for list="{{st.goal.opts}}" as="d" hint-placeholder-count="2"><button type="button" class="tab" onClick="{{d.pick}}" aria-pressed="{{d.pressed}}" style="min-height: 62px; padding: 10px 16px; border: 0; border-radius: 18px; cursor: pointer; text-align: left; background: {{d.bg}}; color: {{d.fg}}; display: flex; flex-direction: column; justify-content: center; gap: 2px;">'
                 '<span style="font-size: 15px; font-weight: 700; letter-spacing: -0.01em;">{{d.label}}</span><span style="font-size: 13px; opacity: 0.72;">{{d.sub}}</span></button></sc-for></div>')
    elif key == 'dumbbells':
        panel = '<div class="pop" style="padding: 0 0 16px;">' + DB + '</div>'
    elif key == 'weight':
        panel = ('<div class="pop" role="group" aria-label="Body weight" style="padding: 0 0 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">'
                 '<button type="button" class="press" onClick="{{st.weight.dec}}" aria-label="Lower body weight" style="' + STEP + '">−</button>'
                 '<span style="font-family: var(--mono); font-size: 20px; font-weight: 600;">{{st.weight.value}}</span>'
                 '<button type="button" class="press" onClick="{{st.weight.inc}}" aria-label="Raise body weight" style="' + STEP + '">+</button></div>')
    else:
        panel = ('<div class="pop" role="group" aria-label="' + label + '" style="padding: 0 0 16px; display: grid; grid-template-columns: repeat({{st.K.cols}}, minmax(0, 1fr)); gap: 8px;">'
                 '<sc-for list="{{st.K.opts}}" as="d" hint-placeholder-count="4"><button type="button" class="tab" onClick="{{d.pick}}" aria-pressed="{{d.pressed}}" style="' + OPTBTN + ' background: {{d.bg}}; color: {{d.fg}};">{{d.label}}</button></sc-for></div>')
    out = ('<li style="display: flex; flex-direction: column;' + div + '"><button type="button" class="press" onClick="{{st.K.toggle}}" aria-expanded="{{st.K.expanded}}" style="min-height: 60px; padding: 0; border: 0; background: transparent; color: var(--ink); display: flex; align-items: center; gap: 8px; font-size: 16px; text-align: left; cursor: pointer;">'
            '<span style="flex-grow: 1; font-weight: 600; letter-spacing: -0.01em;">' + label + '</span><span style="color: var(--muted);">{{st.K.value}}</span><span style="color: var(--faint); display: flex;">' + CHEVR + '</span></button>'
            '<sc-if value="{{st.K.open}}" hint-placeholder-val="{{false}}">' + panel + '</sc-if></li>').replace('K', key)
    if key in ('dumbbells', 'avoid'):
        out = out.replace('<li style="', '<li style="border-top: 1px solid var(--soft); ', 1)
    if key == 'dumbbells':
        out = '<sc-if value="{{st.' + key + '.show}}" hint-placeholder-val="{{false}}">' + out + '</sc-if>'
    return out


def group(title, items):
    return ('<section style="margin-top: 32px; display: flex; flex-direction: column; gap: 12px;">\n<h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">' + title + '</h2>\n'
            '<ul style="margin: 0; padding: 4px 20px; list-style: none; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column;">\n'
            + '\n'.join(setting(k, l, i == len(items) - 1) for i, (k, l) in enumerate(items)) + '\n</ul>\n</section>\n')


PROFILE = PANE_OPEN + '''<header style="display: flex; align-items: center; gap: 16px;">
<span aria-hidden="true" style="width: 64px; height: 64px; flex-shrink: 0; border-radius: 999px; background: var(--ink); color: var(--bg); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 700; letter-spacing: -0.01em;">AR</span>
<h1 style="margin: 0; font-size: 48px; line-height: 1; font-weight: 800; letter-spacing: -0.04em;">Aarav</h1>
</header>

<section aria-label="Your program" style="margin-top: 24px; border-radius: 32px; background: var(--surface); padding: 24px 24px 20px; display: flex; flex-direction: column; box-shadow: var(--card-shadow);">
<h2 style="margin: 0; font-size: 24px; line-height: 1.15; font-weight: 700; letter-spacing: -0.02em;">{{program.title}}</h2>
<p style="margin: 8px 0 0; font-size: 15px; line-height: 1.4; color: var(--muted); text-wrap: pretty;">Week {{program.week}} of 12. {{program.desc}}</p>
<button type="button" class="press" onClick="{{openPrograms}}" style="margin-top: 20px; height: 52px; border: 0; border-radius: 999px; background: var(--ink); color: var(--bg); font-size: 16px; font-weight: 600; letter-spacing: -0.01em; cursor: pointer;">Change program</button>
</section>
''' + group('Training', [('days', 'Days per week'), ('length', 'Workout length'), ('equip', 'Equipment'), ('dumbbells', 'Dumbbells'), ('avoid', 'Muscles to avoid')]) + group('About you', [('goal', 'Goal'), ('level', 'Level'), ('weight', 'Body weight')]) + group('App', [('units', 'Units'), ('remind', 'Reminders'), ('look', 'Appearance')]) + PANE_CLOSE


# ---------- Program picker (first screen, and from Change program) ----------
PROGBLOB = {('balanced', 'light'): '/_blob/ee65043c53bafe72be67cfdc6a8fca01', ('balanced', 'dark'): '/_blob/5f3763a7f59f3f374691f55a8906aff7',
            ('upper', 'light'): '/_blob/5aeffcb0553f00236f177216d6907534', ('upper', 'dark'): '/_blob/54adde4b8be274630b9d609933c96ba8',
            ('legs', 'light'): '/_blob/6fba0f3f1bc0381b8fc20a47382e2826', ('legs', 'dark'): '/_blob/8b26499deecb282e6c834dbdad9ac620'}


PROGBACK = {('balanced', 'light'): '/_blob/40162546ddccc52c0b8dd75289180e42', ('balanced', 'dark'): '/_blob/1f21f5c551b5a1cb91704d5233ef33aa',
            ('upper', 'light'): '/_blob/88ae0654306ae3d540bf8e6a85e1f1ad', ('upper', 'dark'): '/_blob/e836c8342255ad1fae1e23bd6486fcc8',
            ('legs', 'light'): '/_blob/b33176f1a5aa6f993e9affb7f0ca81c6', ('legs', 'dark'): '/_blob/0d1918db4a0e583494a21ad1680f4680'}


def pfig(key, what):
    # One program's front and back figures; only the selected program's pair is mounted.
    img = 'display: block; width: 100%; height: 232px; object-fit: contain;'
    out = ''
    for side, blobs in (('Front', PROGBLOB), ('Back', PROGBACK)):
        alt = side + ' of the body, darker red where this program trains most: ' + what + '.'
        out += ('<img class="on-light" src="' + blobs[(key, 'light')] + '" alt="' + alt + '" style="' + img + '">'
                '<img class="on-dark" src="' + blobs[(key, 'dark')] + '" alt="' + alt + '" style="' + img + '">')
    return ('<sc-if value="{{pgIs.K}}" hint-placeholder-val="{{false}}"><div class="swap" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px;">' + out + '</div></sc-if>').replace('K', key)


PROGRAMS = '''<div class="{{programsCls}}" role="dialog" aria-label="Choose a program" style="position: absolute; inset: 0; z-index: 6; background: var(--bg);">
<div class="scroll" style="height: 844px; overflow-y: auto; scrollbar-width: none;">
<div style="box-sizing: border-box; padding: {{programsTop}}px 20px 132px; display: flex; flex-direction: column;">
<h1 style="margin: 0; font-size: 48px; line-height: 1; font-weight: 800; letter-spacing: -0.04em;">Choose your <span style="color: var(--faint);">program</span></h1>

<div role="group" aria-label="Programs" style="margin-top: 22px; padding: 4px; border-radius: 999px; background: var(--surface); display: flex; gap: 2px;">
<sc-for list="{{pgTabs}}" as="d" hint-placeholder-count="3"><button type="button" class="tab" onClick="{{d.pick}}" aria-pressed="{{d.pressed}}" style="flex: 1 1 0; height: 44px; padding: 0; border: 0; border-radius: 999px; cursor: pointer; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; background: {{d.bg}}; color: {{d.fg}};">{{d.label}}</button></sc-for>
</div>

<section aria-label="Selected program" style="margin-top: 12px; border-radius: 32px; background: var(--surface); padding: 20px 20px 22px; display: flex; flex-direction: column; box-shadow: var(--card-shadow);">
@@FIGS@@
<h2 style="margin: 14px 0 0; font-size: 30px; line-height: 1.08; font-weight: 800; letter-spacing: -0.03em;">{{pgSel.name}}</h2>
<p style="margin: 6px 0 0; font-size: 15px; line-height: 1.4; color: var(--muted); text-wrap: pretty;">{{pgSel.desc}}</p>
<div style="margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--soft); display: flex; flex-direction: column; gap: 12px;">
<sc-for list="{{pgSel.meters}}" as="m" hint-placeholder-count="3"><div style="display: flex; align-items: center; gap: 12px;">
<span style="width: 92px; flex-shrink: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.01em;">{{m.label}}</span>
<span role="meter" aria-label="{{m.label}} emphasis" aria-valuemin="0" aria-valuemax="100" aria-valuenow="{{m.pct}}" style="flex: 1 1 0; height: 8px; border-radius: 999px; background: var(--track); overflow: hidden;"><span class="fill" style="display: block; height: 8px; border-radius: 999px; background-color: {{m.color}}; transform: scaleX({{m.frac}}); transition-duration: 600ms, 400ms;"></span></span>
<span style="width: 84px; flex-shrink: 0; text-align: right; font-size: 13px; color: var(--muted);">{{m.word}}</span>
</div></sc-for>
</div>
</section>
</div>
</div>
<sc-if value="{{canBack}}" hint-placeholder-val="{{false}}"><button type="button" class="press" onClick="{{closePrograms}}" aria-label="Back" style="position: absolute; z-index: 3; top: 56px; left: 20px; width: 48px; height: 48px; padding: 0; border: 0; border-radius: 999px; background: var(--surface); color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: var(--card-shadow);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button></sc-if>
<div aria-hidden="true" style="position: absolute; z-index: 2; left: 0; right: 0; bottom: 0; height: 120px; pointer-events: none; background: linear-gradient(transparent, var(--bg) 62%);"></div>
<button type="button" class="press" onClick="{{startProgram}}" style="position: absolute; z-index: 3; left: 20px; right: 20px; bottom: 28px; height: 64px; border: 0; border-radius: 999px; background: var(--accent); color: #FFFFFF; font-size: 17px; font-weight: 700; letter-spacing: -0.01em; cursor: pointer; box-shadow: var(--hero-shadow);">{{programCta}}</button>
</div>
'''.replace('@@FIGS@@', pfig('balanced', 'the whole body evenly') + '\n' + pfig('upper', 'chest, back, shoulders and arms') + '\n' + pfig('legs', 'glutes, hamstrings, quads and calves'))


# ---------- Body ----------
BLOB = {('Front', 'light'): '/_blob/751976e770520190138885595a84d5a2', ('Back', 'light'): '/_blob/f351b78af74b4dadd4cddbb6495a8182',
        ('Front', 'dark'): '/_blob/ce034c9b9fc91297668e2fdf3cd3f2b6', ('Back', 'dark'): '/_blob/d0a1a8878b6aa53f9e91cfe4e571e79f'}
ALT = {'Front': 'Front of the body. Chest is fully used, front shoulders are mostly used, the rest is ready.',
       'Back': 'Back of the body. Triceps and upper back are partly used, the rest is ready.'}


def slot(label):
    img = 'display: block; width: 100%; height: 330px; object-fit: contain;'
    return ('<figure style="margin: 0; display: flex; flex-direction: column; gap: 10px;">'
            '<img class="on-light" src="' + BLOB[(label, 'light')] + '" alt="' + ALT[label] + '" style="' + img + '">'
            '<img class="on-dark" src="' + BLOB[(label, 'dark')] + '" alt="' + ALT[label] + '" style="' + img + '">'
            '</figure>')


# Swatch colours are the same reds make.py paints on the figure.
rec = [('Chest', '#8D1122', 'Ready tomorrow'), ('Front shoulders', '#DC2940', 'Ready tomorrow'), ('Triceps', '#E8596B', 'Ready tonight'), ('Upper back', '#EE8794', 'Ready tonight')]
rrows = []
for i, (n, col, when) in enumerate(rec):
    div = '' if i == len(rec) - 1 else ' border-bottom: 1px solid var(--soft);'
    rrows.append('<li style="min-height: 60px; box-sizing: border-box; display: flex; align-items: center; gap: 12px;' + div + '">'
                 '<span aria-hidden="true" style="width: 16px; height: 16px; flex-shrink: 0; border-radius: 5px; background: ' + col + ';"></span>'
                 '<span style="flex: 1 1 0; min-width: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.01em;">' + n + '</span>'
                 '<span style="flex-shrink: 0; font-size: 14px; color: var(--muted);">' + when + '</span></li>')

BODY = PANE_OPEN + '''<header style="display: flex; flex-direction: column;">
<h1 style="margin: 0; font-size: 48px; line-height: 1; font-weight: 800; letter-spacing: -0.04em;">Body</h1>
</header>

<div style="margin-top: 28px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">
@@SLOTS@@
</div>

<section style="margin-top: 32px; display: flex; flex-direction: column; gap: 12px;">
<h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">Recovering</h2>
<ul style="margin: 0; padding: 4px 20px; list-style: none; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column;">
@@REC@@
</ul>
</section>
''' + PANE_CLOSE
BODY = BODY.replace('@@SLOTS@@', slot('Front') + '\n' + slot('Back')).replace('@@REC@@', '\n'.join(rrows))


# ---------- Workout setup (opens from Start workout) ----------
TODAYBLOB = {('Front', 'light'): '/_blob/866fa7380ac9956eb4876b92cac9c37a', ('Back', 'light'): '/_blob/c95a73ae9abfda7a225a45f9172b7a69',
             ('Front', 'dark'): '/_blob/d0214dd485975633e55ce33cb0d11633', ('Back', 'dark'): '/_blob/140698807d10efd901ccf7261a4d3b86'}


def tslot(label, muscles):
    img = 'display: block; width: 100%; height: 230px; object-fit: contain;'
    alt = label + ' of the body with ' + muscles + ' highlighted.'
    return ('<figure style="margin: 0;">'
            '<img class="on-light" src="' + TODAYBLOB[(label, 'light')] + '" alt="' + alt + '" style="' + img + '">'
            '<img class="on-dark" src="' + TODAYBLOB[(label, 'dark')] + '" alt="' + alt + '" style="' + img + '"></figure>')


OPT = 'font-size: 13px; font-weight: 600; color: var(--muted);'
SEG = 'flex: 1 1 0; height: 40px; padding: 0; border: 0; border-radius: 999px; cursor: pointer; font-size: 14px; font-weight: 600;'
CHEV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform: rotate({{chips.K.rot}}deg); transition: transform 200ms cubic-bezier(0.23,1,0.32,1);"><path d="M6 9l6 6 6-6"></path></svg>'


def chip(key, name):
    return ('<button type="button" class="tab" onClick="{{chips.K.toggle}}" aria-expanded="{{chips.K.expanded}}" aria-label="N" style="height: 44px; padding: 0 12px 0 16px; border: 0; border-radius: 999px; cursor: pointer; background: {{chips.K.bg}}; color: {{chips.K.fg}}; display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; white-space: nowrap;">{{chips.K.label}}'
            + CHEV + '</button>').replace('K', key).replace('aria-label="N"', 'aria-label="%s"' % name)


PANEL = 'margin-top: 10px; padding: 16px; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column; gap: 12px;'
SETUP = '''<div class="{{setupCls}}" role="dialog" aria-label="Today's workout" style="position: absolute; inset: 0; z-index: 5; background: var(--bg);">
<div class="scroll" style="height: 844px; overflow-y: auto; scrollbar-width: none;">
<div class="setup-in" style="box-sizing: border-box; padding: 120px 20px 150px; display: flex; flex-direction: column;">
<h1 style="margin: 0; font-size: 48px; line-height: 1; font-weight: 800; letter-spacing: -0.04em;">Lower body</h1>
<p style="margin: 10px 0 0; font-size: 15px; line-height: 1.4; color: var(--muted);">Quads, glutes, hamstrings and calves</p>

<div style="margin-top: 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">
@@TSLOTS@@
</div>

<div style="margin-top: 24px; display: flex; flex-wrap: wrap; gap: 8px;">
@@CHIPS@@
</div>
<sc-if value="{{openDuration}}" hint-placeholder-val="{{false}}"><div class="pop" role="group" aria-label="Duration" style="@@PANEL@@">
<span style="@@OPT@@">Duration</span>
<div style="padding: 4px; border-radius: 999px; background: var(--bg); display: flex; gap: 2px;">
<sc-for list="{{durations}}" as="d" hint-placeholder-count="4"><button type="button" class="tab" onClick="{{d.pick}}" aria-pressed="{{d.pressed}}" style="@@SEG@@ background: {{d.bg}}; color: {{d.fg}};">{{d.label}}</button></sc-for>
</div>
</div></sc-if>
<sc-if value="{{openIntensity}}" hint-placeholder-val="{{false}}"><div class="pop" role="group" aria-label="Intensity" style="@@PANEL@@">
<span style="@@OPT@@">Intensity</span>
<div style="padding: 4px; border-radius: 999px; background: var(--bg); display: flex; gap: 2px;">
<sc-for list="{{intensities}}" as="d" hint-placeholder-count="3"><button type="button" class="tab" onClick="{{d.pick}}" aria-pressed="{{d.pressed}}" style="@@SEG@@ background: {{d.bg}}; color: {{d.fg}};">{{d.label}}</button></sc-for>
</div>
</div></sc-if>
<sc-if value="{{openEquip}}" hint-placeholder-val="{{false}}"><div class="pop" role="group" aria-label="Equipment" style="@@PANEL@@">
<span style="@@OPT@@">Equipment</span>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">
<sc-for list="{{equipment}}" as="d" hint-placeholder-count="7"><button type="button" class="tab" onClick="{{d.pick}}" aria-pressed="{{d.pressed}}" style="height: 44px; padding: 0 6px; border: 0; border-radius: 999px; cursor: pointer; font-size: 14px; font-weight: 600; grid-column: {{d.span}}; background: {{d.bg}}; color: {{d.fg}};">{{d.label}}</button></sc-for>
</div>
</div></sc-if>

<section style="margin-top: 32px; display: flex; flex-direction: column; gap: 12px;">
<h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">{{exerciseCount}} exercises</h2>
<ol style="margin: 0; padding: 0 16px; list-style: none; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column;">
<sc-for list="{{exercises}}" as="x" hint-placeholder-count="5">@@EXROW@@</sc-for>
</ol>
</section>
</div>
</div>
<button type="button" class="press setup-ui" onClick="{{closeSetup}}" aria-label="Back to home" style="position: absolute; z-index: 3; top: 56px; left: 20px; width: 48px; height: 48px; padding: 0; border: 0; border-radius: 999px; background: var(--surface); color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: var(--card-shadow);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button>
<div class="setup-ui" aria-hidden="true" style="position: absolute; z-index: 2; left: 0; right: 0; bottom: 0; height: 130px; pointer-events: none; background: linear-gradient(transparent, var(--bg) 60%);"></div>
<button type="button" class="press setup-ui" onClick="{{startWorkout}}" style="position: absolute; z-index: 3; left: 20px; right: 20px; bottom: 28px; height: 64px; border: 0; border-radius: 999px; background: var(--accent); color: #FFFFFF; font-size: 17px; font-weight: 700; letter-spacing: -0.01em; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; box-shadow: var(--hero-shadow);">
<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 4.5v15l12-7.5z"></path></svg>
Start workout
</button>
</div>
'''.replace('@@OPT@@', OPT).replace('@@SEG@@', SEG).replace('@@PANEL@@', PANEL).replace('@@EXROW@@', exrow(THUMB, EXTEXT % ('{{x.name}}', '{{x.detail}}')))
SETUP = SETUP.replace('@@CHIPS@@', chip('duration', 'Duration') + '\n' + chip('intensity', 'Intensity') + '\n' + chip('equip', 'Equipment')).replace('@@TSLOTS@@', tslot('Front', 'quads and calves') + '\n' + tslot('Back', 'glutes, hamstrings and calves'))


# ---------- In-workout (slides up over the workout page) ----------
GLASS = 'background: var(--glass); backdrop-filter: blur(28px) saturate(170%); -webkit-backdrop-filter: blur(28px) saturate(170%);'
CHROME = 'height: 40px; flex-shrink: 0; border: 0; border-radius: 999px; background: {{wk.chromeBg}}; color: {{wk.chromeFg}}; backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%); display: flex; align-items: center; justify-content: center;'
PANEL2 = 'position: absolute; z-index: 2; left: 12px; right: 12px; bottom: 12px; box-sizing: border-box; padding: 22px 20px 20px; border-radius: 36px; ' + GLASS + ' box-shadow: inset 0 1px 0 var(--glass-edge), var(--glass-shadow); color: var(--glass-ink); display: flex; flex-direction: column;'
GBTN = 'width: 56px; height: 56px; flex-shrink: 0; padding: 0; border: 0; border-radius: 999px; background: var(--glass-btn); color: var(--glass-ink); display: flex; align-items: center; justify-content: center; cursor: pointer;'
BIG = 'flex-shrink: 0; border: 0; border-radius: 999px; font-weight: 700; letter-spacing: -0.01em; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer;'
PHOTO = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="M20.5 15.5l-4.5-4.5-8.5 8.5"></path></svg>'
WORKOUT = '''<div class="{{workoutCls}}" role="dialog" aria-label="Workout in progress" style="position: absolute; inset: 0; z-index: 8; overflow: hidden; background: var(--bg); box-sizing: border-box; padding: 16px 20px 28px; display: flex; flex-direction: column;">
<sc-if value="{{wk.hasVideo}}" hint-placeholder-val="{{true}}">
<div role="img" aria-label="Exercise video placeholder" style="position: absolute; inset: 0; z-index: 0; background: var(--video); color: var(--video-ink); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding-bottom: 240px; box-sizing: border-box; font-size: 13px; font-weight: 600; opacity: {{wk.videoOp}}; transition: opacity 400ms ease;"><span style="display: flex; flex-direction: column; align-items: center; gap: 10px; opacity: {{wk.labelOp}};"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5.5" width="13" height="13" rx="3"></rect><path d="M15.5 10.5l6-3v9l-6-3"></path></svg>Exercise video</span></div>
</sc-if>
<sc-if value="{{wk.hasVideo}}" hint-placeholder-val="{{true}}">
<div style="position: relative; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
<button type="button" class="press" onClick="{{closeWorkout}}" aria-label="End workout" style="width: 40px; padding: 0; cursor: pointer; @@CHROME@@"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>
<span aria-label="Time elapsed" style="padding: 0 14px; font-family: var(--mono); font-size: 15px; font-weight: 600; @@CHROME@@">{{wk.elapsed}}</span>
</div>
<div role="progressbar" aria-label="Workout progress" aria-valuemin="0" aria-valuemax="{{wk.setsTotal}}" aria-valuenow="{{wk.setsDone}}" style="position: relative; z-index: 2; margin-top: 14px; display: flex; gap: 4px;">
<sc-for list="{{wk.segs}}" as="g" hint-placeholder-count="5"><span class="seg" style="flex: 1 1 0; height: 5px; border-radius: 999px; background: var(--v-track); overflow: hidden; transform: scaleY({{g.pop}});"><span class="fill" style="display: block; height: 5px; border-radius: 999px; background-color: {{g.bg}}; transform: scaleX({{g.done}}); transition-duration: 800ms, {{g.fade}}ms;"></span></span></sc-for>
</div>
</sc-if>

<sc-if value="{{wk.isWork}}" hint-placeholder-val="{{true}}">
<section class="glass lift" aria-label="Current set" style="@@PANEL2@@">
<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
<span style="font-size: 13px; font-weight: 600; letter-spacing: 0.01em; color: var(--glass-muted);">{{wk.exLine}}</span>
<span style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; letter-spacing: 0.01em; color: var(--glass-muted);">{{wk.setLine}}<span aria-hidden="true" style="display: flex; gap: 3px;"><sc-for list="{{wk.pips}}" as="p" hint-placeholder-count="3"><span style="width: 16px; height: 6px; border-radius: 999px; background: {{p.bg}};"></span></sc-for></span></span>
</div>
<h1 style="margin: 8px 0 0; font-size: 30px; line-height: 1.08; font-weight: 800; letter-spacing: -0.03em; text-wrap: balance;">{{wk.name}}</h1>
@@KGROW@@<div role="group" aria-label="{{wk.trayLabel}}" style="margin-top: 16px; padding: 10px; border-radius: 30px; background: var(--glass-btn); display: flex; flex-direction: column; gap: 10px;">
<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
<button type="button" class="press" onClick="{{wk.less}}" aria-label="{{wk.lessLabel}}" style="width: 60px; height: 60px; flex-shrink: 0; padding: 0; border: 0; border-radius: 999px; background: var(--glass-step); color: var(--glass-ink); display: flex; align-items: center; justify-content: center; cursor: pointer; visibility: {{wk.stepVis}};"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"></path></svg></button>
<span style="display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0;"><span style="font-size: 68px; line-height: 0.84; font-weight: 800; letter-spacing: -0.04em;">{{wk.big}}</span><span style="font-size: 13px; line-height: 1.2; font-weight: 600; color: var(--glass-muted); white-space: nowrap;">{{wk.unit}}</span></span>
<button type="button" class="press" onClick="{{wk.more}}" aria-label="{{wk.moreLabel}}" style="width: 60px; height: 60px; flex-shrink: 0; padding: 0; border: 0; border-radius: 999px; background: var(--glass-step); color: var(--glass-ink); display: flex; align-items: center; justify-content: center; cursor: pointer; visibility: {{wk.stepVis}};"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12M12 6v12"></path></svg></button>
</div>
<sc-if value="{{wk.showBar}}" hint-placeholder-val="{{false}}"><span aria-hidden="true" style="margin: 0 10px 6px; height: 6px; border-radius: 999px; background: var(--glass-btn); overflow: hidden;"><span class="holdbar" style="display: block; height: 6px; border-radius: 999px; background: var(--accent); transform: scaleX({{wk.holdFrac}});"></span></span></sc-if>
</div>
<button type="button" class="press tab" onClick="{{wk.act}}" style="margin-top: 10px; height: 64px; font-size: 17px; @@BIG@@ background: {{wk.ctaBg}}; color: {{wk.ctaFg}};">
<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" style="display: {{wk.icPlay}};"><path d="M8 4.5v15l12-7.5z"></path></svg>
<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" style="display: {{wk.icPause}};"><rect x="6" y="5" width="4.5" height="14" rx="1.5"></rect><rect x="13.5" y="5" width="4.5" height="14" rx="1.5"></rect></svg>
<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display: {{wk.icCheck}};"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>
<span>{{wk.cta}}</span></button>
</section>
</sc-if>

<sc-if value="{{wk.isRest}}" hint-placeholder-val="{{false}}">
<div style="position: relative; z-index: 2; flex: 1 1 0; min-height: 0; display: flex; align-items: center; justify-content: center; padding-bottom: {{wk.restPad}}px;">
<div class="timer-in" role="timer" aria-label="Rest time left" style="position: relative; width: 310px; height: 310px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--v-ink);">
<svg width="310" height="310" viewBox="0 0 310 310" fill="none" aria-hidden="true" style="position: absolute; inset: 0; rotate: -90deg;">
<circle cx="155" cy="155" r="149" stroke="var(--v-track)" stroke-width="9" stroke-dasharray="2 13.603"></circle>
<circle cx="155" cy="155" r="126" stroke="var(--v-track)" stroke-width="14"></circle>
<circle class="ring" cx="155" cy="155" r="126" stroke="var(--accent)" stroke-width="14" stroke-linecap="round" stroke-dasharray="791.700" stroke-dashoffset="{{wk.ringOff}}"></circle>
<g class="knob" style="rotate: {{wk.knobDeg}}deg;"><circle cx="281" cy="155" r="12" fill="#FFFFFF" stroke="var(--accent)" stroke-width="6"></circle></g>
</svg>
<span style="font-size: 15px; font-weight: 600; letter-spacing: 0.01em; color: var(--v-muted);">Rest</span>
<span style="font-size: 92px; line-height: 0.95; font-weight: 800; letter-spacing: -0.04em;">{{wk.rest}}</span>
</div>
</div>
<sc-if value="{{wk.showNext}}" hint-placeholder-val="{{false}}"><div class="glass next-in" role="group" aria-label="Up next" style="position: absolute; z-index: 2; right: 12px; bottom: {{wk.nextBottom}}px; width: max-content; max-width: 366px; box-sizing: border-box; padding: 10px 18px 10px 10px; border-radius: 18px; @@GLASS@@ box-shadow: inset 0 1px 0 var(--glass-edge), var(--glass-shadow); color: var(--glass-ink); display: flex; align-items: center; gap: 12px;">
<span role="img" aria-label="Exercise photo placeholder" style="width: 44px; height: 44px; flex-shrink: 0; border-radius: 10px; background: var(--glass-btn); color: var(--glass-muted); display: flex; align-items: center; justify-content: center;">@@PHOTO@@</span>
<span style="min-width: 0; display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 12px; font-weight: 600; letter-spacing: 0.01em; color: var(--glass-muted);">Up next</span><span style="font-size: 16px; line-height: 1.15; font-weight: 700; letter-spacing: -0.015em; white-space: nowrap;">{{wk.nextName}}</span></span>
</div>
</sc-if>
<section class="glass lift" aria-label="Rest" style="@@PANEL2@@">
@@QS@@<div style="margin-top: {{wk.nextGap}}px; display: flex; gap: 8px;">
<button type="button" class="press" onClick="{{wk.addRest}}" style="width: 112px; height: 64px; font-size: 17px; @@BIG@@ background: var(--glass-btn); color: var(--glass-ink);">+15 sec</button>
<button type="button" class="press" onClick="{{wk.skip}}" style="flex: 1 1 0; height: 64px; font-size: 17px; @@BIG@@ background: var(--glass-ink); color: var(--glass-inv);">Skip rest</button>
</div>
</section>
</sc-if>

<sc-if value="{{wk.isAsk}}" hint-placeholder-val="{{false}}">
<section class="glass lift" aria-label="Last set" style="@@PANEL2@@">
<p style="margin: 0 0 14px; font-size: 20px; line-height: 1.15; font-weight: 800; letter-spacing: -0.02em;">Last set done</p>
@@QS@@</section>
</sc-if>

<sc-if value="{{wk.isDone}}" hint-placeholder-val="{{false}}">
<div class="fin" style="position: absolute; inset: 0; z-index: 4; color: #FFFFFF;">
<div class="f-flood" aria-hidden="true" style="position: absolute; inset: 0; background: var(--hero);"></div>
<div style="position: relative; height: 844px; box-sizing: border-box; padding: 56px 20px 28px; display: flex; flex-direction: column;">
<svg width="64" height="64" viewBox="0 0 72 72" fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform: rotate(-90deg);"><circle class="f-draw" cx="36" cy="36" r="33" stroke-width="5" style="--len: 208; stroke-dasharray: 208; animation-delay: 380ms; animation-duration: 640ms;"></circle><path class="f-draw" d="M22 36.500l9.500 9.500 19-20" stroke-width="6" transform="rotate(90 36 36)" style="--len: 44; stroke-dasharray: 44; animation-delay: 900ms; animation-duration: 340ms;"></path></svg>
<h1 style="margin: 22px 0 0; font-size: 64px; line-height: 0.94; font-weight: 800; letter-spacing: -0.04em;"><span style="display: block; overflow: hidden; padding-bottom: 0.06em;"><span class="f-line" style="animation-delay: 520ms;">Workout</span></span><span style="display: block; overflow: hidden; padding-bottom: 0.12em;"><span class="f-line" style="animation-delay: 610ms; color: rgba(255, 255, 255, 0.62);">done</span></span></h1>
<div style="margin-top: 18px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px;">
<div class="f-up" style="display: flex; flex-direction: column; gap: 4px; animation-delay: 900ms;"><span style="font-family: var(--mono); font-size: 34px; line-height: 1; font-weight: 600; letter-spacing: -0.03em;">{{wk.doneTime}}</span><span style="font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.74);">time</span></div>
<div class="f-up" style="display: flex; flex-direction: column; gap: 4px; animation-delay: 980ms;"><span style="font-family: var(--mono); font-size: 34px; line-height: 1; font-weight: 600; letter-spacing: -0.03em;">{{wk.doneSets}}</span><span style="font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.74);">sets</span></div>
<div class="f-up" style="display: flex; flex-direction: column; gap: 4px; animation-delay: 1060ms;"><span style="font-family: var(--mono); font-size: 34px; line-height: 1; font-weight: 600; letter-spacing: -0.03em;">{{wk.doneReps}}</span><span style="font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.74);">reps</span></div>
</div>
<div class="f-fig" style="margin-top: 20px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; animation-delay: 1150ms;">
<div style="position: relative;"><img src="/_blob/a0fc86536ad24699a637e0f6cb3ea3dd" alt="Front of the body: quads and calves trained." style="display: block; width: 100%; height: 270px; object-fit: contain;"><img class="f-lit" src="/_blob/e601d1613a51b8ea182f6a78489461a8" alt="" style="position: absolute; inset: 0; display: block; width: 100%; height: 270px; object-fit: contain; animation-delay: 1750ms;"></div>
<div style="position: relative;"><img src="/_blob/71fa65168a8fb2cc88b987f8c71b9556" alt="Back of the body: glutes, hamstrings and calves trained." style="display: block; width: 100%; height: 270px; object-fit: contain;"><img class="f-lit" src="/_blob/e49aa56fe4811273a0622ce03db0f99d" alt="" style="position: absolute; inset: 0; display: block; width: 100%; height: 270px; object-fit: contain; animation-delay: 1900ms;"></div>
</div>
<div style="flex: 1 1 0; min-height: 12px;"></div>
<button type="button" class="press f-up" onClick="{{wk.finish}}" style="height: 64px; font-size: 17px; @@BIG@@ background: #FFFFFF; color: var(--hero); animation-delay: 2500ms;">Finish</button>
</div>
</div>
</sc-if>
</div>
'''.replace('@@CHROME@@', CHROME).replace('@@PANEL2@@', PANEL2).replace('@@GBTN@@', GBTN).replace('@@BIG@@', BIG).replace('@@PHOTO@@', PHOTO).replace('@@GLASS@@', GLASS).replace('@@KGROW@@', KGROW).replace('@@QS@@', QS)


def empty(title):
    return PANE_OPEN + '<h1 style="margin: 0; font-size: 48px; line-height: 1; font-weight: 800; letter-spacing: -0.04em;">' + title + '</h1>\n<p style="margin: 12px 0 0; font-size: 15px; color: var(--muted);">This screen is not designed yet.</p>\n' + PANE_CLOSE


def pane(flag, html, hint):
    return '<sc-if value="{{' + flag + '}}" hint-placeholder-val="{{' + hint + '}}">\n' + html + '</sc-if>\n'


SCRIPT = '''</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"dark":{"editor":"boolean","default":false},"$preview":{"width":390,"height":844}}'>
// Mock plan for the Lower template; names from catalog/library. `swap` = the variant planned when that equipment
// is owned (first match wins); `kg` = one dumbbell, snapped to a weight the user owns; `pair` = two dumbbells in use.
const EXERCISES = [
  { name: 'Split squat', reps: 10, each: true, allOut: true, swap: { dumbbell: { name: 'Dumbbell split squat', reps: 10, each: true, kg: 10, pair: true } } },
  { name: 'Single-leg glute bridge', reps: 12, each: true, swap: { dumbbell: { name: 'Dumbbell glute bridge', reps: 12, kg: 12 }, chair: { name: 'Shoulder-elevated hip thrust', reps: 12 } } },
  { name: 'Reverse lunge', reps: 10, each: true, swap: { dumbbell: { name: 'Dumbbell reverse lunge', reps: 10, each: true, kg: 8, pair: true }, chair: { name: 'Chair step-up', reps: 10, each: true } } },
  { name: 'Single-leg calf raise', reps: 15, each: true, swap: { dumbbell: { name: 'Dumbbell calf raise', reps: 15, kg: 12 } } },
  { name: 'Plank', reps: 40, hold: true },
];
// The engine's six equipment tags (src/library).
const EQUIPMENT = [['dumbbell', 'Dumbbells'], ['bench', 'Bench'], ['resistance_band', 'Band'], ['pullup_bar', 'Pull-up bar'], ['table', 'Table'], ['chair', 'Chair']];
// Fixed dumbbell pairs offered, kg (Profile.dumbbells, kind "fixed").
const DB_WEIGHTS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];
// Daily check-in: `feel` values and the 12 muscle regions of the engine's `checkin` event.
const FEEL = [['fresh', 'Fresh'], ['normal', 'Normal'], ['beat_up', 'Worn out']];
const REGIONS = [['chest', 'Chest'], ['upper_back', 'Upper back'], ['front_delt', 'Front shoulders'], ['side_rear_delt', 'Rear shoulders'], ['biceps', 'Biceps'], ['triceps', 'Triceps'],
  ['abs', 'Abs'], ['lower_back', 'Lower back'], ['quads', 'Quads'], ['hamstrings', 'Hamstrings'], ['glutes', 'Glutes'], ['calves', 'Calves']];
const SETS = { 20: 2, 30: 3, 40: 3, 50: 4 };
const INTENSITY = [['easy', 'Easy', -2], ['normal', 'Normal', 0], ['hard', 'Hard', 1]];
// Programs from catalog/programs.json. Balanced is the mock's running program (week 3); switching starts at week 1.
const PROGRAMS = {
  // focus: emphasis for upper body, lower body and core, from catalog/programs.json (1 = standard target).
  balanced: { title: 'Balanced program', name: 'Balanced', tab: 'Balanced', desc: 'Every muscle group at its standard weekly target.', focus: [1, 1, 1] },
  upper: { title: 'Upper body focus', name: 'Upper body focus', tab: 'Upper body', desc: 'More chest, back, shoulders and arms. Legs kept at maintenance.', focus: [1.3, 0.7, 1] },
  legs: { title: 'Legs and glutes', name: 'Legs and glutes', tab: 'Legs', desc: 'More glutes, hamstrings and quads. Upper body kept at maintenance.', focus: [0.7, 1.3, 1] },
};
const GOALS = [['Build muscle', 'Full weekly volume'], ['General fitness', 'Lighter weeks']];
const LEVELS = ['Auto', 'Beginner', 'Intermediate', 'Advanced'];
const REMINDERS = ['Off', '6:30 am', '12:30 pm', '6:30 pm', '9:00 pm'];
const PAGE_MS = 400;
const REST = 45;
// Reps left in the tank after a set, the engine's scale: 0 is too hard, 5+ is too easy. Colours follow the work scale.
const LEFT = [['0', '#7A0E1E', '#FFFFFF', '0 more, too hard'], ['1', '#D91E36', '#FFFFFF', '1 more'], ['2', '#E8596B', '#FFFFFF', '2 more'], ['3', '#EE8794', '#1C1C1E', '3 more'], ['4', '#F7CDD2', '#1C1C1E', '4 more'], ['5+', 'var(--glass-btn)', 'var(--glass-ink)', '5 or more, too easy']];
const clock = (t) => Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
const still = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
class Component extends DCLogic {
  constructor(props) {
    super(props);
    // page: which pushed page is up (null | 'setup' | 'programs'); move: how it is animating.
    this.state = {
      tab: 'today', page: 'onboard', move: 'first', open: null, edit: null, ob: 0,
      // db: dumbbells owned. ci: today's check-in. sore: muscles marked sore.
      db: { type: 'fixed', fixed: { 5: true, 10: true }, min: 2, max: 20, step: 2 }, ci: { feel: null, done: false }, sore: {},
      // fb: like / dislike per exercise. avoid: muscles to avoid. row: the open exercise row.
      fb: {}, avoid: {}, row: null,
      program: 'balanced', pick: 'balanced', week: 3,
      minutes: 40, intensity: 'normal', equip: {},
      days: 4, goal: 'Build muscle', level: 'Auto', kg: 72, units: 'Metric', remind: '6:30 pm', look: null,
      // sheet: the in-workout screen (null | 'in' | 'out'); wk: where the user is in the workout.
      sheet: null, wk: null, finished: false,
    };
  }
  componentWillUnmount() { clearTimeout(this.timer); clearTimeout(this.flashTimer); clearInterval(this.tick); clearInterval(this.cnt); }
  push(page, extra) {
    clearTimeout(this.timer);
    this.setState(Object.assign({ page, move: 'in', open: null }, extra));
  }
  leave(move, extra) {
    if (!this.state.page || this.state.move === 'out' || this.state.move === 'fwd') return;
    this.setState(Object.assign({ move }, extra));
    this.timer = setTimeout(() => this.setState({ page: null, move: null }), still() ? 0 : PAGE_MS);
  }
  startWorkout(plan) {
    clearInterval(this.tick);
    this.setState({ sheet: 'in', wk: { ex: 0, set: 1, phase: 'work', reps: plan[0].reps, hold: plan[0].hold ? plan[0].reps : 0, hmode: 'idle', ready: 0, rest: 0, restTotal: REST, elapsed: 0, effort: null, sets: 0 } });
    this.tick = setInterval(() => {
      const w = this.state.wk;
      if (!w || w.phase === 'done') return clearInterval(this.tick);
      if (w.phase === 'rest' && w.rest <= 1) return this.nextSet(this.plan, { elapsed: w.elapsed + 1 });
      // a timed hold counts itself down while the set is on
      // a timed hold: 3 second get-ready count, then the hold itself; it never starts or advances on its own
      let hmode = w.hmode, ready = w.ready, hold = w.hold;
      if (w.phase === 'work' && hmode === 'ready') { ready -= 1; if (ready <= 0) hmode = 'run'; }
      else if (w.phase === 'work' && hmode === 'run') { hold -= 1; if (hold <= 0) { hold = 0; hmode = 'over'; } }
      this.setState({ wk: Object.assign({}, w, { elapsed: w.elapsed + 1, hmode, ready, hold, rest: w.phase === 'rest' ? w.rest - 1 : w.rest }) });
    }, 1000);
  }
  setDone(plan) {
    const w = this.state.wk, last = w.ex === plan.length - 1 && w.set === plan[w.ex].sets;
    // The last set has no rest, so it gets its own step for the reps-left question.
    this.setState({ wk: Object.assign({}, w, { sets: w.sets + 1, reps_total: (w.reps_total || 0) + (plan[w.ex].unit.indexOf('sec') === 0 ? 0 : w.reps), phase: last ? 'ask' : 'rest', rest: REST, restTotal: REST, effort: null, flash: true }) });
    if (last && plan[w.ex].allOut) setTimeout(() => this.finishUp(), 0);
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => { if (this.state.wk) this.setState({ wk: Object.assign({}, this.state.wk, { flash: false }) }); }, 1100);
  }
  nextSet(plan, extra) {
    const w = this.state.wk, sameEx = w.set < plan[w.ex].sets;
    const ex = sameEx ? w.ex : w.ex + 1;
    const set = sameEx ? w.set + 1 : 1;
    // An all-out set opens on what the user should reach: the usual target plus the 2 reps normally left in the tank.
    const reps = plan[ex].reps + (plan[ex].allOut && set === plan[ex].sets ? 2 : 0);
    this.setState({ wk: Object.assign({}, w, extra, { ex, set, phase: 'work', reps, hold: plan[ex].hold ? plan[ex].reps : 0, hmode: 'idle', ready: 0 }) });
  }
  // Finished screen: the three numbers count up once the title has landed.
  finishUp() {
    clearInterval(this.tick);
    const quick = still();
    this.setState({ wk: Object.assign({}, this.state.wk, { phase: 'done', count: quick ? 1 : 0 }) });
    if (quick) return;
    const t0 = Date.now() + 950, dur = 1100;
    this.cnt = setInterval(() => {
      const w = this.state.wk, k = Math.min(1, Math.max(0, (Date.now() - t0) / dur));
      if (!w || w.phase !== 'done') return clearInterval(this.cnt);
      if (k !== w.count) this.setState({ wk: Object.assign({}, w, { count: k }) });
      if (k >= 1) clearInterval(this.cnt);
    }, 40);
  }
  closeWorkout(extra) {
    clearInterval(this.tick);
    clearInterval(this.cnt);
    this.setState({ sheet: 'out' });
    this.timer = setTimeout(() => this.setState(Object.assign({ sheet: null, wk: null }, extra)), still() ? 0 : PAGE_MS);
  }
  renderVals() {
    const s = this.state;
    const item = (key) => {
      const on = s.tab === key;
      return { go: () => this.setState({ tab: key, edit: null }), cur: on ? 'page' : 'false', bg: on ? 'var(--nav-on)' : 'transparent', fg: on ? 'var(--nav-on-ink)' : 'var(--nav-ink)', pad: on ? 22 : 0, label: on ? 'inline' : 'none' };
    };
    const opt = (label, on, pick, offBg, span) => ({ label, pick, span: span || 'auto', pressed: on ? 'true' : 'false', bg: on ? 'var(--ink)' : offBg, fg: on ? 'var(--bg)' : 'var(--ink)' });
    const chip = (key, label) => {
      const on = s.open === key;
      return { label, toggle: () => this.setState({ open: on ? null : key }), expanded: on ? 'true' : 'false', rot: on ? 180 : 0, bg: on ? 'var(--ink)' : 'var(--surface)', fg: on ? 'var(--bg)' : 'var(--ink)' };
    };
    const level = INTENSITY.find((i) => i[0] === s.intensity);
    const picked = EQUIPMENT.filter((e) => s.equip[e[0]]);
    const equipLabel = picked.length === 0 ? 'Bodyweight' : picked.length === 1 ? picked[0][1] : picked.length + ' items';
    const equipOpts = (offBg) => [opt('Bodyweight only', picked.length === 0, () => this.setState({ equip: {} }), offBg, '1 / -1')].concat(
      EQUIPMENT.map((e) => opt(e[1], !!s.equip[e[0]], () => this.setState({ equip: Object.assign({}, s.equip, { [e[0]]: !s.equip[e[0]] }) }), offBg)));
    // Dumbbells owned: fixed pairs, or every step of an adjustable set.
    const D = s.db, setDb = (patch) => this.setState({ db: Object.assign({}, D, patch) });
    const owned = D.type === 'fixed' ? DB_WEIGHTS.filter((k) => D.fixed[k]) : Array.from({ length: Math.floor((D.max - D.min) / D.step) + 1 }, (_, i) => D.min + i * D.step);
    const span = (lo, hi) => (lo === hi ? lo + ' kg' : lo + '–' + hi + ' kg');
    const db = {
      types: [opt('Fixed pairs', D.type === 'fixed', () => setDb({ type: 'fixed' }), 'transparent'), opt('Adjustable', D.type === 'adjustable', () => setDb({ type: 'adjustable' }), 'transparent')],
      fixed: D.type === 'fixed', adjustable: D.type === 'adjustable',
      weights: DB_WEIGHTS.map((k) => opt(k + ' kg', !!D.fixed[k], () => setDb({ fixed: Object.assign({}, D.fixed, { [k]: !D.fixed[k] }) }), 'var(--bg)')),
      ranges: [
        { label: 'Lightest', value: D.min + ' kg', dec: () => setDb({ min: Math.max(1, D.min - 1) }), inc: () => setDb({ min: Math.min(D.max, D.min + 1) }) },
        { label: 'Heaviest', value: D.max + ' kg', dec: () => setDb({ max: Math.max(D.min, D.max - 1) }), inc: () => setDb({ max: Math.min(60, D.max + 1) }) },
        { label: 'Step', value: D.step + ' kg', dec: () => setDb({ step: Math.max(0.5, D.step - 0.5) }), inc: () => setDb({ step: Math.min(5, D.step + 0.5) }) },
      ],
      label: owned.length ? span(owned[0], owned[owned.length - 1]) : 'None',
    };
    // The engine plans a dumbbell exercise only when dumbbells are owned (canLoad).
    const have = (k) => !!s.equip[k] && (k !== 'dumbbell' || owned.length > 0);
    const nearest = (kg) => owned.reduce((a, b) => (Math.abs(b - kg) < Math.abs(a - kg) ? b : a));
    const exercises = EXERCISES.map((base, i) => {
      const key = Object.keys(base.swap || {}).find(have);
      const ex = key ? base.swap[key] : base;
      const reps = ex.reps + (ex.hold ? level[2] * 5 : level[2]);
      const kg = ex.kg ? nearest(ex.kg) : null;
      const unit = (ex.hold ? 'sec' : 'reps') + (ex.each ? ' each side' : '');
      const mark = s.fb[i], open = s.row === i;
      const flag = (k) => Object.assign(opt('', mark === k, () => this.setState({ fb: Object.assign({}, s.fb, { [i]: mark === k ? null : k }), row: null }), 'var(--bg)'));
      return { bi: i, allOut: !!base.allOut && !ex.hold, open, expanded: open ? 'true' : 'false', toggle: () => this.setState({ row: open ? null : i }),
        aria: ex.name + (mark === 'like' ? ', liked' : mark === 'dislike' ? ', disliked' : ''),
        up: mark === 'like' ? 'block' : 'none', down: mark === 'dislike' ? 'block' : 'none', dots: mark ? 'none' : 'block',
        like: flag('like'), dislike: flag('dislike'),
        name: ex.name, hold: !!ex.hold, kg, pair: !!ex.pair, sets: SETS[s.minutes], reps, unit, detail: SETS[s.minutes] + ' sets · ' + reps + ' ' + unit + (kg ? ' · ' + kg + ' kg' : ''), rule: i === 0 ? 'transparent' : 'var(--soft)' };
    });
    this.plan = exercises;
    // In-workout view model.
    const w = s.wk || { ex: 0, set: 1, phase: 'work', reps: exercises[0].reps, rest: 0, restTotal: REST, elapsed: 0, effort: null, sets: 0 };
    const cur = exercises[w.ex];
    const sameEx = w.set < cur.sets;
    const nxt = sameEx ? cur : exercises[Math.min(w.ex + 1, exercises.length - 1)];
    const setW = (patch) => this.setState({ wk: Object.assign({}, w, patch) });
    // Reps left is asked once per exercise: after its last set, or one set earlier when the last set is all out
    // (an all-out set has 0 left by definition).
    const qLeft = (w.phase === 'rest' || w.phase === 'ask') && w.set === cur.sets - (cur.allOut ? 1 : 0), tall = qLeft;
    const allOutNow = cur.allOut && w.set === cur.sets;
    const later = () => { clearTimeout(this.timer); this.timer = setTimeout(() => this.finishUp(), 520); };
    const kc = w.count == null ? 1 : w.count, ease = 1 - Math.pow(1 - kc, 3);
    const wk = {
      isWork: w.phase === 'work', isRest: w.phase === 'rest', isAsk: w.phase === 'ask', isDone: w.phase === 'done',
      qLeft, nextGap: tall ? 18 : 0,
      doneTime: clock(Math.round(w.elapsed * ease)), doneSets: Math.round(w.sets * ease), doneReps: Math.round((w.reps_total || 0) * ease),
      elapsed: clock(w.elapsed), total: exercises.length, index: w.ex,
      // One segment per exercise; it fills by the share of that exercise's sets already done.
      // A just-finished set lands in red with a little bounce, then fades back to the normal fill.
      segs: exercises.map((e, i) => {
        const hot = !!w.flash && i === w.ex;
        return { done: w.phase === 'done' || w.phase === 'ask' || i < w.ex ? 1 : i > w.ex ? 0 : (w.phase === 'work' ? w.set - 1 : w.set) / e.sets, bg: hot ? 'var(--accent)' : 'var(--v-fill)', fade: hot ? 0 : 1400, pop: hot ? 2.2 : 1 };
      }),
      hasVideo: w.phase !== 'done', videoOp: w.phase === 'work' ? 1 : 0.55, labelOp: w.phase === 'work' ? 1 : 0,
      ringOff: (791.7 * (1 - w.rest / w.restTotal)).toFixed(1), knobDeg: (360 * w.rest / w.restTotal).toFixed(1),
      setsTotal: exercises.reduce((t, e) => t + e.sets, 0), setsDone: w.sets,
      // Over the video the controls are glass and white; on the rest and done screens they follow the theme.
      chromeBg: 'var(--glass)', chromeFg: 'var(--glass-ink)',
      exLine: 'Exercise ' + (w.ex + 1) + ' of ' + exercises.length, setLine: 'Set ' + w.set + ' of ' + cur.sets,
      pips: Array.from({ length: cur.sets }, (_, i) => ({ bg: i < w.set - 1 ? 'var(--glass-ink)' : i === w.set - 1 ? 'var(--accent)' : 'var(--glass-btn)' })),
      // Up next sits just above the bottom panel, which is taller when the reps-left question shows (229px against 106px).
      // Up next shows only when the next thing is a new exercise; it sits 10px above the panel (229px tall with the question).
      showNext: w.phase === 'rest' && w.set === cur.sets, nextBottom: 251, restPad: w.set === cur.sets ? 299 : tall ? 213 : 90,
      ...(() => {
        const red = { ctaBg: 'var(--accent)', ctaFg: '#FFFFFF' }, quiet = { ctaBg: 'var(--glass-btn)', ctaFg: 'var(--glass-ink)' };
        const icon = (k) => ({ icPlay: k === 'play' ? 'block' : 'none', icPause: k === 'pause' ? 'block' : 'none', icCheck: k === 'check' ? 'block' : 'none' });
        if (!cur.hold) {
          return Object.assign({ trayLabel: 'Reps done', lessLabel: 'One fewer', moreLabel: 'One more', stepVis: 'visible', big: w.reps, unit: allOutNow ? 'max ' + cur.unit : cur.unit, showBar: false, holdFrac: 1,
            less: () => setW({ reps: Math.max(0, w.reps - 1) }), more: () => setW({ reps: w.reps + 1 }), cta: 'Set done', act: () => this.setDone(exercises) }, red, icon('check'));
        }
        // Timed hold. idle: adjust the time, then Start. ready: 3-2-1. run / paused: locked. over: Set done.
        const m = w.hmode || 'idle', idle = m === 'idle';
        const adjust = (d) => () => { if (idle) { const t = Math.max(5, w.reps + d); setW({ reps: t, hold: t }); } };
        const base = { trayLabel: 'Hold time', lessLabel: '5 seconds less', moreLabel: '5 seconds more', stepVis: idle ? 'visible' : 'hidden', less: adjust(-5), more: adjust(5),
          big: m === 'ready' ? w.ready : idle ? w.reps : w.hold, showBar: m === 'run' || m === 'paused' || m === 'over', holdFrac: (w.hold / w.reps).toFixed(3) };
        if (idle) return Object.assign(base, { unit: 'seconds', cta: 'Start timer', act: () => setW({ hmode: 'ready', ready: 3, hold: w.reps }) }, red, icon('play'));
        if (m === 'ready') return Object.assign(base, { unit: 'get ready', cta: 'Cancel', act: () => setW({ hmode: 'idle' }) }, quiet, icon('none'));
        if (m === 'run') return Object.assign(base, { unit: 'seconds left', cta: 'Pause timer', act: () => setW({ hmode: 'paused' }) }, quiet, icon('pause'));
        if (m === 'paused') return Object.assign(base, { unit: 'paused', cta: 'Resume timer', act: () => setW({ hmode: 'run' }) }, red, icon('play'));
        return Object.assign(base, { unit: 'done', cta: 'Set done', act: () => this.setDone(exercises) }, red, icon('check'));
      })(),
      name: cur.name,
      ...(() => {
        const kg = (w.kgs || {})[w.ex] || cur.kg, at = owned.indexOf(kg);
        const to = (i) => () => { if (owned[i] !== undefined) setW({ kgs: Object.assign({}, w.kgs, { [w.ex]: owned[i] }) }); };
        return { hasKg: !!cur.kg, kg, kgNote: cur.pair ? 'each hand' : '', lighter: to(at - 1), heavier: to(at + 1) };
      })(),
      rest: clock(w.rest), restPct: Math.round((w.rest / w.restTotal) * 100),
      efforts: LEFT.map((e) => {
        const on = w.effort === e[0], dim = w.effort !== null && !on;
        return { label: e[0], aria: e[3], pressed: on ? 'true' : 'false', bg: e[1], fg: e[2], ring: on ? 'var(--glass-ink)' : 'transparent', op: dim ? 0.4 : 1,
          pick: () => { setW({ effort: e[0] }); if (w.phase === 'ask') later(); } };
      }),
      nextName: nxt.name, nextDetail: sameEx ? 'Set ' + (w.set + 1) + ' of ' + cur.sets + ' · ' + cur.reps + ' ' + cur.unit : 'Set 1 of ' + nxt.sets + ' · ' + nxt.reps + ' ' + nxt.unit,
      addRest: () => setW({ rest: w.rest + 15, restTotal: w.restTotal + 15 }), skip: () => this.nextSet(exercises),
      summary: clock(w.elapsed) + ' · ' + w.sets + ' sets · ' + exercises.length + ' exercises',
      // Finishing closes the workout and the workout page, and marks today done on Home.
      finish: () => {
        this.closeWorkout({ page: null, move: null, tab: 'today', finished: true, justFinished: true });
        // the capsule fill plays once, on the first return to Home
        setTimeout(() => this.setState({ justFinished: false }), 2400);
      },
    };
    // Profile rows: one open at a time, each with its own options.
    const row = (key, value, opts, cols) => {
      const on = s.edit === key;
      return { value, opts, cols, open: on, expanded: on ? 'true' : 'false', rot: on ? 90 : 0, toggle: () => this.setState({ edit: on ? null : key }) };
    };
    // wide: the first option (a none / off choice) takes a full row, the rest fill an even grid below it
    const choose = (field, list, fmt, wide) => list.map((v, i) => opt(fmt ? fmt(v) : String(v), s[field] === v, () => this.setState({ [field]: v }), 'var(--bg)', wide && i === 0 ? '1 / -1' : 'auto'));
    const dark = s.look ? s.look === 'Dark' : this.props.dark === true;
    const weight = s.units === 'Metric' ? s.kg + ' kg' : Math.round(s.kg * 2.2046) + ' lb';
    const st = {
      days: row('days', String(s.days), choose('days', [2, 3, 4, 5, 6]), 5),
      length: row('length', s.minutes + ' min', choose('minutes', [20, 30, 40, 50], (m) => m + ' min'), 4),
      equip: row('equip', equipLabel, equipOpts('var(--bg)'), 2),
      dumbbells: Object.assign(row('dumbbells', db.label, [], 1), { show: !!s.equip.dumbbell }),
      avoid: row('avoid', REGIONS.filter((r) => s.avoid[r[0]]).length || 'None', REGIONS.map((r) => opt(r[1], !!s.avoid[r[0]], () => this.setState({ avoid: Object.assign({}, s.avoid, { [r[0]]: !s.avoid[r[0]] }) }), 'var(--bg)')), 2),
      goal: row('goal', s.goal, GOALS.map((g) => Object.assign(opt(g[0], s.goal === g[0], () => this.setState({ goal: g[0] }), 'var(--bg)'), { sub: g[1] })), 1),
      level: row('level', s.level, choose('level', LEVELS), 2),
      weight: Object.assign(row('weight', weight, [], 1), { dec: () => this.setState({ kg: Math.max(30, s.kg - 1) }), inc: () => this.setState({ kg: Math.min(200, s.kg + 1) }) }),
      units: row('units', s.units, choose('units', ['Metric', 'Imperial']), 2),
      remind: row('remind', s.remind, choose('remind', REMINDERS, null, true), 2),
      look: row('look', dark ? 'Dark' : 'Light', ['Light', 'Dark'].map((v) => opt(v, (dark ? 'Dark' : 'Light') === v, () => this.setState({ look: v }), 'var(--bg)')), 2),
    };
    const sel = PROGRAMS[s.pick];
    // Same scale as the figures: more work is a darker red.
    const meter = (label, f) => ({ label, pct: Math.round((f / 1.3) * 100), frac: (f / 1.3).toFixed(3), color: f > 1 ? '#7A0E1E' : f < 1 ? '#EE8794' : '#D91E36', word: f > 1 ? 'More' : f < 1 ? 'Maintenance' : 'Standard' });
    const pageCls = (page) => (s.page !== page ? '' : s.move === 'in' ? 'page-in' : s.move === 'out' ? 'page-out' : s.move === 'fwd' ? 'page-fwd' : '');
    const first = s.move === 'first';
    // First-run set-up: goal, week, equipment (and dumbbells), body weight. Then the program picker.
    const on = (field, list, fmt) => list.map((v) => opt(fmt ? fmt(v) : String(v), s[field] === v, () => this.setState({ [field]: v }), 'var(--bg)'));
    const ob = {
      is0: s.ob === 0, is1: s.ob === 1, is2: s.ob === 2, is3: s.ob === 3, now: s.ob + 1,
      canBack: s.ob > 0, back: () => this.setState({ ob: s.ob - 1 }), segLeft: s.ob > 0 ? 84 : 20,
      next: () => this.setState(s.ob < 3 ? { ob: s.ob + 1 } : { page: 'programs', move: 'first', pick: s.program }),
      segs: [0, 1, 2, 3].map((i) => ({ bg: i <= s.ob ? 'var(--ink)' : 'var(--track)' })),
      goals: GOALS.map((g) => Object.assign(opt(g[0], s.goal === g[0], () => this.setState({ goal: g[0] }), 'var(--surface)'), { sub: g[1] })),
      days: on('days', [2, 3, 4, 5, 6]), lengths: on('minutes', [20, 30, 40, 50], (m) => m + ' min'),
      equipment: equipOpts('var(--bg)'), hasDb: !!s.equip.dumbbell,
    };
    // Daily check-in: how you feel, then whether anything is sore. "Yes" opens the muscle list.
    const C = s.ci, setCi = (patch) => this.setState({ ci: Object.assign({}, C, patch) });
    const ci = C.feel === null
      ? { show: true, q: 'How do you feel today?', cols: 3, opts: FEEL.map((f) => opt(f[1], false, () => setCi({ feel: f[0] }), 'var(--bg)')) }
      : { show: !C.done, q: 'Anything sore?', cols: 2, opts: [opt('Nothing', false, () => this.setState({ ci: Object.assign({}, C, { done: true }), sore: {} }), 'var(--bg)'), opt('Yes', false, () => this.push('sore'), 'var(--bg)')] };
    const done = s.week - 1;
    return {
      themeName: dark ? 'dark' : 'light',
      baseCls: s.move === 'in' ? 'under-in' : s.move === 'out' ? 'under-out' : s.move === 'fwd' ? 'under-fwd' : '',
      onSetup: s.page === 'setup', onPrograms: s.page === 'programs', onWorkout: !!s.sheet, onOnboard: s.page === 'onboard', onSore: s.page === 'sore',
      ob, obCls: '', db, ci, soreCls: pageCls('sore'), 
      soreList: REGIONS.map((r) => opt(r[1], !!s.sore[r[0]], () => this.setState({ sore: Object.assign({}, s.sore, { [r[0]]: !s.sore[r[0]] }) }), 'var(--surface)')),
      closeSore: () => this.leave('out'), soreDone: () => this.leave('out', { ci: Object.assign({}, C, { done: true }) }),
      workoutCls: s.sheet === 'out' ? 'sheet-out' : 'sheet-in', wk,
      startWorkout: () => this.startWorkout(exercises), closeWorkout: () => this.closeWorkout(),
      td: s.finished ? { bg: 'var(--accent)', fg: '#FFFFFF', done: true, todo: false, cls: s.justFinished ? 'capfill' : '' } : { bg: 'transparent', fg: 'var(--ink)', done: false, todo: true, cls: '' },
      setupCls: pageCls('setup'), programsCls: first ? 'pane' : pageCls('programs'),
      onToday: s.tab === 'today', onBody: s.tab === 'body', onProgress: s.tab === 'progress', onProfile: s.tab === 'profile',
      nav: { today: item('today'), body: item('body'), progress: item('progress'), profile: item('profile') },
      minutes: s.minutes,
      program: Object.assign({ week: s.week, done }, PROGRAMS[s.program]),
      segs: Array.from({ length: 12 }, (_, i) => ({ bg: i < done ? 'var(--ink)' : i === done ? 'var(--accent)' : 'var(--track)' })),
      openSetup: () => this.push('setup'),
      closeSetup: () => this.leave('out'),
      openPrograms: () => this.push('programs', { pick: s.program, edit: null }),
      closePrograms: () => this.leave('out'),
      // Choosing a program always lands on Home; a different program starts at week 1.
      startProgram: () => this.leave(first ? 'fwd' : 'out', { program: s.pick, week: s.pick === s.program ? s.week : 1, tab: 'today' }),
      canBack: !first, programsTop: first ? 64 : 120,
      programCta: first ? 'Start ' + sel.tab : s.pick === s.program ? 'Keep ' + sel.tab : 'Switch to ' + sel.tab,
      pgTabs: Object.keys(PROGRAMS).map((id) => opt(PROGRAMS[id].tab, s.pick === id, () => this.setState({ pick: id }), 'transparent')),
      pgIs: { balanced: s.pick === 'balanced', upper: s.pick === 'upper', legs: s.pick === 'legs' },
      pgSel: { name: sel.name, desc: sel.desc, meters: [meter('Upper body', sel.focus[0]), meter('Lower body', sel.focus[1]), meter('Core', sel.focus[2])] },
      chips: { duration: chip('duration', s.minutes + ' min'), intensity: chip('intensity', level[1]), equip: chip('equip', equipLabel) },
      openDuration: s.open === 'duration', openIntensity: s.open === 'intensity', openEquip: s.open === 'equip',
      durations: Object.keys(SETS).map((m) => opt(m + ' min', +m === s.minutes, () => this.setState({ minutes: +m }), 'transparent')),
      intensities: INTENSITY.map((i) => opt(i[1], i[0] === s.intensity, () => this.setState({ intensity: i[0] }), 'transparent')),
      equipment: equipOpts('var(--bg)'),
      exercises, exerciseCount: exercises.length,
      st,
    };
  }
}
</script>
</body>
</html>
'''

full = (HEAD + ROOT_OPEN + '<div class="{{baseCls}}" style="position: absolute; inset: 0;">\n' + NAV + pane('onToday', TODAY, 'true') + pane('onBody', BODY, 'false')
        + pane('onProgress', PROGRESS, 'false') + pane('onProfile', PROFILE, 'false') + '</div>\n'
        + pane('onSetup', SETUP, 'false') + pane('onSore', SORE, 'false') + pane('onPrograms', PROGRAMS, 'false') + pane('onOnboard', ONBOARD, 'false') + pane('onWorkout', WORKOUT, 'false') + SCRIPT)
open('Main.dc.html', 'w', encoding='utf-8').write(full)
if os.path.exists('Progress.dc.html'):
    os.remove('Progress.dc.html')

c = json.load(open('canvas.json', encoding='utf-8'))
c['boards'].pop('Progress.dc.html', None)
c['boards']['Main.dc.html']['title'] = 'Home'
c['order'] = ['Main.dc.html']
json.dump(c, open('canvas.json', 'w', encoding='utf-8'), indent=2)


# ---------- local preview: project/support.js is a local stand-in for the canvas runtime (never published)
blobs = {}
for kind, d in (('body', BLOB), ('week', WEEKBLOB), ('today', TODAYBLOB)):
    for (lab_, th_), u in d.items():
        blobs[u] = '../img/%s-%s-%s.png' % (kind, lab_.lower(), th_)
for (k_, th_), u in PROGBLOB.items():
    blobs[u] = '../img/prog-%s-front-%s.png' % (k_, th_)
for (k_, th_), u in PROGBACK.items():
    blobs[u] = '../img/prog-%s-back-%s.png' % (k_, th_)
blobs['/_blob/e601d1613a51b8ea182f6a78489461a8'] = '../img/hero-front-light.png'
blobs['/_blob/e49aa56fe4811273a0622ce03db0f99d'] = '../img/hero-back-light.png'
blobs['/_blob/a0fc86536ad24699a637e0f6cb3ea3dd'] = '../img/heroff-front-light.png'
blobs['/_blob/71fa65168a8fb2cc88b987f8c71b9556'] = '../img/heroff-back-light.png'
open('support.js', 'w', encoding='utf-8').write('window.__BLOBS = ' + json.dumps(blobs) + ';\n' + open('../shim.js', encoding='utf-8').read())
print('ok', len(full))
