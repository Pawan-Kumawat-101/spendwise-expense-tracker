/* =========================================================
   SpendWise – Personal Expense Tracker
   1 Constants & helpers   2 Data (localStorage)   3 Filters
   4 Render UI             5 Charts                6 Events
   ========================================================= */

/* ---------- 1. CONSTANTS & HELPERS ---------- */
const CATS = [
  'Food', 'Travel', 'Shopping', 'Bills', 'Education',
  'Entertainment', 'Health', 'Salary/Allowance', 'Other'
];

const COLORS = [
  '#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#06b6d4',
  '#a855f7', '#ec4899', '#84cc16', '#94a3b8'
];

const TX_KEY = 'spendwise_tx';
const BUDGET_KEY = 'spendwise_budget';

const $ = (id) => document.getElementById(id);
const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN');
const today = new Date().toISOString().slice(0, 10);

// Escape text so user input cannot inject HTML
function esc(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

// Add up the amounts of one type ("income" or "expense")
function total(list, type) {
  return list
    .filter((t) => t.type === type)
    .reduce((sum, t) => sum + t.amount, 0);
}

/* ---------- 2. DATA (localStorage) ---------- */
function load(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (e) {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage blocked – app still works for this session */
  }
}

// Sample data so the charts are not empty on first visit
function seed() {
  const monthPrefix = (monthsAgo) => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsAgo);
    return d.toISOString().slice(0, 8); // "YYYY-MM-"
  };

  // [monthsAgo, title, amount, type, category, day]
  const samples = [
    [0, 'Pocket money', 5000, 'income', 'Salary/Allowance', '01'],
    [0, 'Canteen', 850, 'expense', 'Food', '03'],
    [0, 'Bus pass', 600, 'expense', 'Travel', '04'],
    [0, 'Books', 1200, 'expense', 'Education', '05'],
    [1, 'Pocket money', 5000, 'income', 'Salary/Allowance', '01'],
    [1, 'Movie', 700, 'expense', 'Entertainment', '12'],
    [1, 'Mobile recharge', 399, 'expense', 'Bills', '10'],
    [2, 'Pocket money', 5000, 'income', 'Salary/Allowance', '01'],
    [2, 'Groceries', 1500, 'expense', 'Shopping', '09']
  ];

  return samples.map((s, i) => ({
    id: Date.now() + i,
    date: monthPrefix(s[0]) + s[5],
    title: s[1],
    amount: s[2],
    type: s[3],
    cat: s[4]
  }));
}

let transactions = load(TX_KEY, null) || seed();
let budget = load(BUDGET_KEY, 0);
let doughnutChart;
let barChart;

/* ---------- 3. FILTERS ---------- */
// Returns the transactions that match month, category and search box
function filteredList() {
  const month = $('fm').value;
  const category = $('fc').value;
  const search = $('fs').value.toLowerCase();

  return transactions
    .filter((t) =>
      (!month || t.date.startsWith(month)) &&
      (category === 'all' || t.cat === category) &&
      t.title.toLowerCase().includes(search)
    )
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first
}

/* ---------- 4. RENDER UI ---------- */
function render() {
  const list = filteredList();
  const income = total(list, 'income');
  const expense = total(list, 'expense');

  // Summary cards
  $('inc').textContent = fmt(income);
  $('exp').textContent = fmt(expense);
  $('bal').textContent = fmt(income - expense);
  $('sr').textContent = income
    ? 'Savings rate: ' + Math.round(((income - expense) / income) * 100) + '%'
    : '';

  // Budget progress bar (green < 70%, amber < 90%, red after)
  const percent = budget ? Math.min(100, (expense / budget) * 100) : 0;
  const bar = $('bfill');
  bar.style.width = percent + '%';
  bar.style.background =
    percent >= 90 ? 'var(--exp)' : percent >= 70 ? '#f59e0b' : 'var(--inc)';
  $('btxt').textContent = budget
    ? `${fmt(expense)} of ${fmt(budget)} used (${Math.round((expense / budget) * 100)}%)`
    : 'No budget set';

  // Header pills (always the current month)
  const thisMonth = today.slice(0, 7);
  const spentNow = total(
    transactions.filter((t) => t.date.startsWith(thisMonth)),
    'expense'
  );
  $('hsp').textContent = fmt(spentNow);
  $('hleft').textContent = budget ? fmt(Math.max(0, budget - spentNow)) : 'Set budget';

  // Top spending category
  const byCategory = {};
  list
    .filter((t) => t.type === 'expense')
    .forEach((t) => {
      byCategory[t.cat] = (byCategory[t.cat] || 0) + t.amount;
    });
  const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
  $('top').textContent = top ? `Top spend: ${top[0]} (${fmt(top[1])})` : '';

  // Transaction list
  $('list').innerHTML = list.length
    ? list.map(rowHTML).join('')
    : '<div class="empty">No transactions found</div>';

  drawCharts(list);
}

function rowHTML(t) {
  const isIncome = t.type === 'income';
  return `
    <div class="row">
      <div>
        <b>${esc(t.title)}</b><br>
        <small>${t.cat} · ${t.date}</small>
      </div>
      <div>
        <span class="amt" style="color:var(--${isIncome ? 'inc' : 'exp'})">
          ${isIncome ? '+' : '-'}${fmt(t.amount)}
        </span>
        <button class="del" data-id="${t.id}" aria-label="Delete">✕</button>
      </div>
    </div>`;
}

/* ---------- 5. CHARTS (Chart.js) ---------- */
function drawCharts(list) {
  const styles = getComputedStyle(document.documentElement);
  const textColor = styles.getPropertyValue('--muted').trim() || '#888';
  const gridColor = styles.getPropertyValue('--line').trim() || '#ddd';

  // Doughnut: expense by category
  const byCategory = {};
  list
    .filter((t) => t.type === 'expense')
    .forEach((t) => {
      byCategory[t.cat] = (byCategory[t.cat] || 0) + t.amount;
    });
  const labels = Object.keys(byCategory);

  if (doughnutChart) doughnutChart.destroy();
  doughnutChart = new Chart($('c1'), {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: labels.map((c) => byCategory[c]),
        backgroundColor: labels.map((c) => COLORS[CATS.indexOf(c)]),
        borderWidth: 0
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: textColor } } }
    }
  });

  // Bar: income vs expense for the last 6 months
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  const monthTotal = (month, type) =>
    total(transactions.filter((t) => t.date.startsWith(month)), type);

  if (barChart) barChart.destroy();
  barChart = new Chart($('c2'), {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Income',
          data: months.map((m) => monthTotal(m, 'income')),
          backgroundColor: '#10b981',
          borderRadius: 6
        },
        {
          label: 'Expense',
          data: months.map((m) => monthTotal(m, 'expense')),
          backgroundColor: '#ef4444',
          borderRadius: 6
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: textColor }, grid: { display: false } },
        y: { ticks: { color: textColor }, grid: { color: gridColor } }
      },
      plugins: { legend: { labels: { color: textColor } } }
    }
  });
}

/* ---------- 6. EVENTS ---------- */

// Add a new transaction
$('add').onclick = () => {
  const title = $('title').value.trim();
  const amount = Number($('amount').value);
  const date = $('date').value;

  if (!title || !(amount > 0) || !date) {
    $('err').textContent = 'Enter a title, a positive amount and a date.';
    return;
  }

  $('err').textContent = '';
  transactions.push({
    id: Date.now(),
    title: title,
    amount: amount,
    date: date,
    type: $('type').value,
    cat: $('cat').value
  });
  save(TX_KEY, transactions);

  $('title').value = '';
  $('amount').value = '';
  $('fm').value = date.slice(0, 7); // show the month just added to
  render();
};

// Delete a transaction (event delegation on the list)
$('list').onclick = (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  transactions = transactions.filter((t) => t.id != id);
  save(TX_KEY, transactions);
  render();
};

// Monthly budget
$('budget').oninput = (e) => {
  budget = Number(e.target.value) || 0;
  save(BUDGET_KEY, budget);
  render();
};

// Filters
['fm', 'fc', 'fs'].forEach((id) => {
  $(id).oninput = render;
});

// Export visible transactions as a CSV file
$('csv').onclick = () => {
  const quote = (x) => '"' + String(x).replace(/"/g, '""') + '"';
  const rows = [['Date', 'Title', 'Category', 'Type', 'Amount']].concat(
    filteredList().map((t) => [t.date, t.title, t.cat, t.type, t.amount])
  );
  const csv = rows.map((r) => r.map(quote).join(',')).join('\n');

  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = 'expenses.csv';
  link.click();
};

// Reset to sample data
$('clear').onclick = () => {
  transactions = seed();
  save(TX_KEY, transactions);
  render();
};

// Light / dark theme toggle
$('theme').onclick = () => {
  const root = document.documentElement;
  const isDark = getComputedStyle(root).getPropertyValue('--bg').trim() === '#0f1320';
  root.setAttribute('data-theme', isDark ? 'light' : 'dark');
  render(); // redraw charts with new colors
};

/* ---------- START ---------- */
CATS.forEach((c) => {
  $('cat').add(new Option(c, c));
  $('fc').add(new Option(c, c));
});

$('date').value = today;
$('fm').value = today.slice(0, 7);
$('budget').value = budget || '';

const hour = new Date().getHours();
const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
$('hgreet').textContent = greeting + ' 👋';
$('hdate').textContent = new Date().toLocaleDateString('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long'
});

render();
