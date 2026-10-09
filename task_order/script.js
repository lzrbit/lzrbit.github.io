'use strict';

const menuButton = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('#nav-links');
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  navLinks.classList.toggle('open', open);
});
navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  menuButton.setAttribute('aria-expanded', 'false');
  navLinks.classList.remove('open');
}));

const dialog = document.querySelector('#figure-dialog');
document.querySelectorAll('[data-zoom]').forEach(button => {
  button.addEventListener('click', () => {
    const image = document.querySelector('#dialog-image');
    image.src = button.dataset.zoom;
    image.alt = button.querySelector('img').alt;
    document.querySelector('#dialog-title').textContent = button.dataset.caption;
    dialog.showModal();
    document.body.classList.add('dialog-open');
  });
});
document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }
});
dialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));

document.querySelector('#copy-citation').addEventListener('click', async () => {
  const text = document.querySelector('#citation-text').textContent;
  const status = document.querySelector('#copy-status');
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = 'BibTeX copied to clipboard.';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('#citation-text'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent = 'Citation selected. Use your browser’s copy command.';
  }
});

const algorithms = {
  vanilla: {label: 'Vanilla', color: '#373737'},
  der: {label: 'DER', color: '#0072b2'},
  gsm: {label: 'GSM', color: '#009e73'},
  syrem: {label: 'SyReM', color: '#d55e00'}
};
const metricSelect = document.querySelector('#metric');
const leftSelect = document.querySelector('#order-left');
const rightSelect = document.querySelector('#order-right');
const explorer = document.querySelector('#explorer');
const message = document.querySelector('#comparison-message');

function renderRanking(order, side, metric) {
  const strip = document.querySelector(`#sequence-${side}`);
  strip.replaceChildren();
  order.sequence.forEach((task, index) => {
    if (index) {
      const arrow = document.createElement('span');
      arrow.className = 'sequence-arrow'; arrow.textContent = '→'; strip.append(arrow);
    }
    const token = document.createElement('span');
    token.className = `task-token task-${task}`; token.textContent = task; strip.append(token);
  });
  const ranked = Object.entries(order.metrics[metric]).sort((a, b) => a[1].mean - b[1].mean);
  const list = document.querySelector(`#ranking-${side}`);
  list.replaceChildren();
  ranked.forEach(([key, result], index) => {
    const row = document.createElement('li');
    row.className = 'ranking-row';
    row.style.setProperty('--algorithm-color', algorithms[key].color);
    const label = document.createElement('span'); label.className = 'rank-label';
    const number = document.createElement('span'); number.className = 'rank-number'; number.textContent = String(index + 1);
    const mark = document.createElement('span'); mark.className = 'algorithm-mark'; mark.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span'); name.textContent = algorithms[key].label;
    label.append(number, mark, name);
    const value = document.createElement('span'); value.className = 'rank-value'; value.append(document.createTextNode(result.mean.toFixed(2)));
    const sd = document.createElement('span'); sd.className = 'rank-sd'; sd.textContent = ` ± ${result.sd.toFixed(2)}`; value.append(sd);
    row.append(label, value); list.append(row);
  });
  return algorithms[ranked[0][0]].label;
}

async function loadResults() {
  try {
    const response = await fetch('assets/results.json');
    if (!response.ok) throw new Error('Results could not be loaded.');
    const data = await response.json();
    for (const order of data.orders) {
      for (const select of [leftSelect, rightSelect]) {
        const option = document.createElement('option');
        option.value = String(order.id); option.textContent = `${String(order.id).padStart(2, '0')} · ${order.sequence.join(' → ')}`; select.append(option);
      }
    }
    leftSelect.value = '1'; rightSelect.value = '2';
    function update() {
      const metric = metricSelect.value;
      const left = data.orders.find(order => order.id === Number(leftSelect.value));
      const right = data.orders.find(order => order.id === Number(rightSelect.value));
      const first = renderRanking(left, 'left', metric);
      const second = renderRanking(right, 'right', metric);
      if (left.id === right.id) message.textContent = 'Both panels show the same sequence. Choose another order to compare.';
      else if (first === second) message.textContent = `${first} has the lowest mean on both selected orders.`;
      else message.textContent = `${first} leads on ${left.sequence.join('–')}; ${second} leads on ${right.sequence.join('–')}.`;
      document.querySelector('#metric-explanation').textContent = metric.endsWith('CT')
        ? 'Current-task error averages the error immediately after each task is learned. Lower is better.'
        : 'Error-based backward transfer (BWT) measures subsequent change from the initial fit. Negative values indicate improvement; a lower BWT does not necessarily mean a lower final error.';
    }
    [metricSelect, leftSelect, rightSelect].forEach(select => select.addEventListener('change', update));
    update(); explorer.setAttribute('aria-busy', 'false');
  } catch {
    explorer.setAttribute('aria-busy', 'false');
    message.textContent = 'The interactive results could not load. The full tables remain available in the paper and code repository.';
    [metricSelect, leftSelect, rightSelect].forEach(select => { select.disabled = true; });
  }
}
loadResults();
