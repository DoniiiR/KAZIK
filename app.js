'use strict';
const START_BALANCE = 1000;
const STORAGE_KEY = 'kazik_nikon_balance';

const MINES_SIZE = 5;
const MINES_TILES = MINES_SIZE * MINES_SIZE;
const MINES_COUNT = 5;
const HOUSE_EDGE = 0.99;

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
                     5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const SLICE = 360 / WHEEL_ORDER.length;
const SPIN_MS = 4200;
const ROULETTE_COEF = { red: 2, black: 2, green: 14 };

/*-- Состояние --*/
const state = {
  balance: START_BALANCE,
  mines: { active: false, positions: [], opened: 0, bet: 0 },
  roulette: { busy: false, rotation: 0, history: [], hubFrame: null },
};

/*-- Элементы --*/
const el = {};
const ids = [
  'balance', 'bet-amount', 'reset-btn', 'mines-grid', 'mines-start', 'mines-cashout',
  'mines-multiplier', 'mines-payout', 'mines-cashout-value', 'mines-status',
  'wheel-plate', 'wheel-number', 'wheel', 'wheel-wrap', 'roulette-status', 'roulette-history', 'toasts',
];
ids.forEach((id) => { el[camel(id)] = document.getElementById(id); });
el.betInput = document.getElementById('bet-amount');
el.rouletteBtns = Array.from(document.querySelectorAll('.bet'));

function camel(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}



const fmt = (n) => Math.floor(n).toLocaleString('ru-RU');

function toast(text, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast toast--${type}`;
  node.textContent = text;
  el.toasts.appendChild(node);
  setTimeout(() => {
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 300);
  }, 3200);
}

function setStatus(node, text, kind) {
  node.textContent = text;
  node.className = 'status' + (kind ? ` status--${kind}` : '');
}

function setBalance(value) {
  state.balance = Math.max(0, Math.round(value));
  el.balance.textContent = fmt(state.balance);
  el.balance.parentElement.classList.remove('is-bumped');
  void el.balance.offsetWidth;
  el.balance.parentElement.classList.add('is-bumped');
  localStorage.setItem(STORAGE_KEY, state.balance);
  syncMaxBet();
}

function getBet() {
  const raw = Math.floor(Number(el.betInput.value));
  if (!Number.isFinite(raw) || raw < 1) {
    toast('Ставка должна быть минимум 1 говно.', 'lose');
    return 0;
  }
  if (raw > state.balance) {
    toast('У Дяди Никона в долг не играют!', 'lose');
    return 0;
  }
  return raw;
}

/* ---------- Панель ставки ---------- */
function syncMaxBet() {
  el.betInput.max = Math.max(1, state.balance);
  if (Math.floor(Number(el.betInput.value)) > state.balance) {
    el.betInput.value = Math.max(1, state.balance);
  }
}

function setBet(value) {
  const bet = Math.max(1, Math.min(Math.floor(value), Math.max(1, state.balance)));
  el.betInput.value = bet;
}

/*МИНЫ*/

function minesMultiplier(opened) {
  if (opened === 0) return 1;
  let coef = 1;
  for (let i = 0; i < opened; i++) {
    coef *= (MINES_TILES - i) / (MINES_TILES - MINES_COUNT - i);
  }
  return coef * HOUSE_EDGE;
}

function buildMinesGrid() {
  el.minesGrid.innerHTML = '';
  for (let i = 0; i < MINES_TILES; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.index = i;
    cell.disabled = true;
    cell.setAttribute('aria-label', `Клетка ${i + 1}`);
    cell.addEventListener('click', () => openCell(i));
    el.minesGrid.appendChild(cell);
  }
}

function cellAt(index) {
  return el.minesGrid.children[index];
}

function updateMinesStats() {
  const coef = minesMultiplier(state.mines.opened);
  const payout = Math.floor(state.mines.bet * coef);
  el.minesMultiplier.textContent = `${coef.toFixed(2)}×`;
  el.minesPayout.textContent = fmt(payout);
  el.minesCashoutValue.textContent = `${coef.toFixed(2)}×`;
}

function startMines() {
  if (state.mines.active) return;
  if (state.roulette.busy) {
    toast('Рулетка ещё крутится, подожди.', 'info');
    return;
  }

  const bet = getBet();
  if (!bet) return;

  state.mines.bet = bet;
  state.mines.opened = 0;
  state.mines.active = true;

  // жребий: уникальные позиции мин
  state.mines.positions = [];
  while (state.mines.positions.length < MINES_COUNT) {
    const r = Math.floor(Math.random() * MINES_TILES);
    if (!state.mines.positions.includes(r)) state.mines.positions.push(r);
  }

  setBalance(state.balance - bet);
  buildMinesGrid();
  Array.from(el.minesGrid.children).forEach((c) => { c.disabled = false; });
  updateMinesStats();

  el.minesStart.disabled = true;
  el.minesCashout.disabled = false;
  setStatus(el.minesStatus, `Ставка ${fmt(bet)} принята. Открывай безопасные клетки.`);
}

function openCell(index) {
  if (!state.mines.active) return;
  const cell = cellAt(index);
  if (cell.dataset.done) return;
  cell.dataset.done = '1';
  cell.disabled = true;

  if (state.mines.positions.includes(index)) {
    cell.classList.add('cell--mine');
    cell.textContent = '💥';
    return loseMines();
  }

  cell.classList.add('cell--safe');
  cell.textContent = '💎';
  state.mines.opened++;
  updateMinesStats();

  if (state.mines.opened === MINES_TILES - MINES_COUNT) {
    cashoutMines();
  } else {
    setStatus(el.minesStatus, `Открыто ${state.mines.opened}. Жадность — враг.`);
  }
}

function loseMines() {
  state.mines.positions.forEach((i) => {
    const c = cellAt(i);
    if (!c.dataset.done) {
      c.classList.add('cell--reveal');
      c.textContent = '💣';
    }
    c.disabled = true;
  });
  finishMines(`БУМ. Провал за ${fmt(state.mines.bet)} говна. Все мины показаны.`, false, `−${fmt(state.mines.bet)} говна`);
}

function cashoutMines() {
  if (!state.mines.active) return;
  if (state.mines.opened === 0) {
    toast('Хотя бы одну клетку открой, что ли.', 'info');
    return;
  }

  const coef = minesMultiplier(state.mines.opened);
  const win = Math.floor(state.mines.bet * coef);
  setBalance(state.balance + win);

  state.mines.positions.forEach((i) => {
    const c = cellAt(i);
    if (!c.dataset.done) {
      c.classList.add('cell--reveal');
      c.textContent = '💣';
    }
  });

  finishMines(`Забрал ${fmt(win)} говна (${coef.toFixed(2)}×) с ${state.mines.opened} клеток.`, true, `+${fmt(win)} говна`);
}

function finishMines(text, isWin, toastMsg) {
  state.mines.active = false;
  Array.from(el.minesGrid.children).forEach((c) => { c.disabled = true; });
  el.minesStart.disabled = false;
  el.minesCashout.disabled = true;
  setStatus(el.minesStatus, text, isWin ? 'win' : 'lose');
  toast(toastMsg || text, isWin ? 'win' : 'lose');
}

/*-- РУЛЕТКА --*/

function colorOf(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

function buildWheelPlate() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  const cx = 100, cy = 100, r = 100;

  WHEEL_ORDER.forEach((num, i) => {
    const a0 = i * SLICE - SLICE / 2;
    const a1 = i * SLICE + SLICE / 2;
    const p = (deg, radius) => {
      const rad = (deg - 90) * Math.PI / 180;
      return `${(cx + radius * Math.cos(rad)).toFixed(2)} ${(cy + radius * Math.sin(rad)).toFixed(2)}`;
    };

    const slice = document.createElementNS(NS, 'path');
    slice.setAttribute('d', `M ${cx} ${cy} L ${p(a0, r)} A ${r} ${r} 0 0 1 ${p(a1, r)} Z`);
    const c = colorOf(num);
    slice.setAttribute('fill', c === 'red' ? '#c02734' : c === 'green' ? '#1e9d68' : '#1b2129');
    svg.appendChild(slice);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', cx);
    label.setAttribute('y', 20);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('transform', `rotate(${i * SLICE} ${cx} ${cy})`);
    label.setAttribute('class', 'wheel__label');
    label.textContent = num;
    svg.appendChild(label);
  });

  el.wheelPlate.appendChild(svg);
}

function spinWheelTo(number) {
  const index = WHEEL_ORDER.indexOf(number);
  const target = (360 - index * SLICE) % 360;
  const current = ((state.roulette.rotation % 360) + 360) % 360;
  const delta = ((target - current) % 360 + 360) % 360;
  state.roulette.rotation += SLICE * 37 * 5 + delta;   // 5 кругов + точная остановка
  el.wheelPlate.style.transform = `rotate(${state.roulette.rotation}deg)`;
}

/* Читаем реальный угол поворота из CSS-трансформации (учитывая easing),
   чтобы цифра в центре совпадала с сектором под указателем */
function currentRotationDeg() {
  const t = getComputedStyle(el.wheelPlate).transform;
  const m = t && t.match(/matrix\(([^)]+)\)/);
  if (!m) return 0;
  const [a, b] = m[1].split(',').map(Number);
  return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
}

function numberUnderPointer() {
  const rot = currentRotationDeg();
  const index = Math.round(((360 - rot) % 360 + 360) % 360 / SLICE) % WHEEL_ORDER.length;
  return WHEEL_ORDER[index];
}

/* Мелькание цифр в ступице синхронно с вращением колеса */
function startHubCycling() {
  let last = null;
  const tick = () => {
    if (!state.roulette.busy) return;
    const n = numberUnderPointer();
    if (n !== last) {
      last = n;
      el.wheelNumber.textContent = n;
      delete el.wheelNumber.dataset.color;
    }
    state.roulette.hubFrame = requestAnimationFrame(tick);
  };
  state.roulette.hubFrame = requestAnimationFrame(tick);
}

function stopHubCycling(number) {
  cancelAnimationFrame(state.roulette.hubFrame);
  el.wheelNumber.textContent = number;
  el.wheelNumber.dataset.color = colorOf(number);
}

function beginSpinVisual() {
  el.wheelWrap.classList.add('is-spinning');
  el.wheel.classList.add('wheel--spinning');
  el.wheel.classList.remove('wheel--landed');
  el.wheelNumber.classList.remove('is-landed');
}

function endSpinVisual() {
  el.wheelWrap.classList.remove('is-spinning');
  el.wheel.classList.remove('wheel--spinning');
  void el.wheel.offsetWidth;                 // перезапуск анимации
  el.wheel.classList.add('wheel--landed');
  el.wheelNumber.classList.add('is-landed');
}

function playRoulette(color) {
  if (state.roulette.busy || state.mines.active) return;
  if (state.mines.active) {
    toast('Мины ещё идут, подожди.', 'info');
    return;
  }

  const bet = getBet();
  if (!bet) return;

  state.roulette.busy = true;
  setBalance(state.balance - bet);
  el.rouletteBtns.forEach((b) => { b.disabled = true; });
  setStatus(el.rouletteStatus, `Ставка ${fmt(bet)} на ${colorName(color)}. Крутим...`);

  const result = Math.floor(Math.random() * 37);
  beginSpinVisual();
  startHubCycling();
  spinWheelTo(result);

  setTimeout(() => {
    const winColor = colorOf(result);
    stopHubCycling(result);
    endSpinVisual();

    pushHistory(result, winColor);

    const isWin = winColor === color;
    if (isWin) {
      const win = bet * ROULETTE_COEF[color];
      setBalance(state.balance + win);
      setStatus(el.rouletteStatus, `Выпало ${result} (${colorName(winColor)}). Выигрыш ${fmt(win)} говна!`, 'win');
      toast(`+${fmt(win)} говна`, 'win');
      flashButton(color);
    } else {
      setStatus(el.rouletteStatus, `Выпало ${result} (${colorName(winColor)}). Бля бывает.`, 'lose');
      toast(`−${fmt(bet)} говна`, 'lose');
    }

    state.roulette.busy = false;
    el.rouletteBtns.forEach((b) => { b.disabled = false; });
  }, SPIN_MS);
}

const colorName = (c) => ({ red: 'красное', black: 'чёрное', green: 'зеро' }[c]);

function flashButton(color) {
  const btn = el.rouletteBtns.find((b) => b.dataset.color === color);
  if (!btn) return;
  btn.classList.add('is-win');
  setTimeout(() => btn.classList.remove('is-win'), 1600);
}

function pushHistory(number, color) {
  state.roulette.history.unshift({ number, color });
  state.roulette.history = state.roulette.history.slice(0, 12);
  el.rouletteHistory.innerHTML = '';
  state.roulette.history.forEach(({ number: n, color: c }) => {
    const chip = document.createElement('span');
    chip.className = `history__item history__item--${c}`;
    chip.textContent = n;
    el.rouletteHistory.appendChild(chip);
  });
}

/*-- ИНИЦИАЛИЗАЦИЯ --*/

function init() {
  const saved = Number(localStorage.getItem(STORAGE_KEY));
  state.balance = Number.isFinite(saved) && saved > 0 ? saved : START_BALANCE;

  buildMinesGrid();
  buildWheelPlate();
  updateMinesStats();
  setBalance(state.balance);
  el.balance.parentElement.classList.remove('is-bumped');

  el.minesStart.addEventListener('click', startMines);
  el.minesCashout.addEventListener('click', cashoutMines);

  el.rouletteBtns.forEach((b) => b.addEventListener('click', () => playRoulette(b.dataset.color)));

  el.betInput.addEventListener('input', () => {
    if (Number(el.betInput.value) < 1) el.betInput.value = 1;
  });

  document.querySelectorAll('.stepper__btn').forEach((btn) => {
    btn.addEventListener('click', () => setBet(Number(el.betInput.value) + Number(btn.dataset.step) * 10));
  });

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const v = chip.dataset.bet;
      if (v === 'half') setBet(state.balance / 2);
      else if (v === 'max') setBet(state.balance);
      else setBet(Number(v));
    });
  });

  el.resetBtn.addEventListener('click', () => {
    setBalance(START_BALANCE);
    toast('Дядя Никон простил долги. Баланс восстановлен.', 'info');
  });
}

init();
