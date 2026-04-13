// dialog.js — RPG dialog box system

let dialogsData = null;

export async function loadDialogs() {
  const res = await fetch('data/dialogs.json');
  dialogsData = await res.json();
}

// Returns a Promise that resolves with the chosen effect object
export function showDialog(dialogId) {
  return new Promise((resolve) => {
    if (!dialogsData) { resolve(null); return; }

    const d = dialogsData.find(x => x.id === dialogId);
    if (!d) { resolve(null); return; }

    const overlay  = document.getElementById('dialog-overlay');
    const nameEl   = document.getElementById('dialog-speaker-name');
    const avatarEl = document.getElementById('dialog-avatar');
    const chengyuEl = document.getElementById('dialog-chengyu');
    const meaningEl = document.getElementById('dialog-chengyu-meaning');
    const textEl   = document.getElementById('dialog-text');
    const choicesEl = document.getElementById('dialog-choices');

    nameEl.textContent   = d.speakerName;
    avatarEl.src         = `assets/heroes/hero_${d.speaker}_base.png`;
    chengyuEl.textContent = d.chengyu || '';
    meaningEl.textContent = d.chengyuMeaning || '';
    textEl.textContent   = d.text;

    choicesEl.innerHTML = '';
    d.choices.forEach((choice, i) => {
      const btn = document.createElement('button');
      btn.className = 'dialog-choice-btn';
      btn.innerHTML = `${['Ａ','Ｂ','Ｃ'][i]}　${choice.text}<span class="dialog-choice-hint">${choice.hint}</span>`;
      btn.addEventListener('click', () => {
        overlay.classList.add('hidden');
        resolve({ label: ['A','B','C'][i], ...choice });
      });
      choicesEl.appendChild(btn);
    });

    overlay.classList.remove('hidden');
  });
}
