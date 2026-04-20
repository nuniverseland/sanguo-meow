// tutorial.js — First-time onboarding tutorial system
// Triggered once per phase, stored in localStorage. Three phases:
//   'index'  → index.html stage-select screen
//   'gacha'  → gacha.html draw page
//   'battle' → game.html first battle

const STORAGE_KEY = 'nunuTutorialDone';

export function isTutorialDone(phase) {
  try {
    return !!JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')[phase];
  } catch { return false; }
}

function markDone(phase) {
  try {
    const done = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    done[phase] = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
  } catch {}
}

function getTarget(step) {
  if (step.targetId)    return document.getElementById(step.targetId);
  if (step.targetQuery) return document.querySelector(step.targetQuery);
  return null;
}

// steps: [{ targetId?, targetQuery?, text, btnText? }]
// onDone callback fires after all steps complete OR when skipped
export function runTutorial(phase, steps, onDone) {
  if (isTutorialDone(phase) || !steps.length) { onDone?.(); return; }

  const tooltip = document.createElement('div');
  tooltip.id = 'tut-tooltip';
  tooltip.innerHTML = `
    <div id="tut-text"></div>
    <div class="tut-buttons">
      <button id="tut-skip">略過</button>
      <button id="tut-next">好！</button>
    </div>`;
  document.body.appendChild(tooltip);

  let idx = 0;
  let prevTarget = null;

  function clearHighlight() {
    if (!prevTarget) return;
    prevTarget.style.boxShadow = prevTarget._tutOrigShadow ?? '';
    prevTarget.style.position  = prevTarget._tutOrigPos    ?? '';
    prevTarget.style.zIndex    = prevTarget._tutOrigZ      ?? '';
    prevTarget = null;
  }

  function finish() {
    clearHighlight();
    tooltip.remove();
    markDone(phase);
    onDone?.();
  }

  function show(i) {
    clearHighlight();
    const step   = steps[i];
    const target = getTarget(step);

    if (target) {
      target._tutOrigShadow = target.style.boxShadow;
      target._tutOrigPos    = target.style.position;
      target._tutOrigZ      = target.style.zIndex;
      target.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.65), 0 0 0 4px #f5c842';
      target.style.position  = 'relative';
      target.style.zIndex    = '1001';
      prevTarget = target;

      // Position tooltip near target
      const rect = target.getBoundingClientRect();
      const TT_W = 284, TT_H = 92;
      const midX = rect.left + rect.width / 2;
      const below = rect.bottom + 12;
      const above = rect.top - TT_H - 12;
      const left  = Math.max(8, Math.min(midX - TT_W / 2, window.innerWidth - TT_W - 8));
      const top   = (below + TT_H < window.innerHeight - 8) ? below : Math.max(8, above);
      tooltip.style.left = left + 'px';
      tooltip.style.top  = top  + 'px';
    }

    document.getElementById('tut-text').textContent = step.text;
    document.getElementById('tut-next').textContent =
      (step.btnText) || (i === steps.length - 1 ? '知道了！' : '好！');

    // Restart pop-in animation on each step
    tooltip.style.animation = 'none';
    tooltip.offsetHeight;
    tooltip.style.animation = '';
  }

  document.getElementById('tut-skip').addEventListener('click', finish);
  document.getElementById('tut-next').addEventListener('click', () => {
    idx++;
    if (idx >= steps.length) finish();
    else show(idx);
  });

  show(0);
}
