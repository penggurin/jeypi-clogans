/* ============================================================
   Jeypi Silogan — BPM System
   app.js — Supabase-backed business logic
   ============================================================ */

'use strict';

/* ============================================================
   SUPABASE CONFIG
   Credentials are loaded from config.js (gitignored).
   See config.example.js for the template.
   ============================================================ */

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE = 'orders';

/* ============================================================
   CONSTANTS & DATA
   ============================================================ */

const MENU_SILOG = [
  { id: 'silog',     name: 'Silog',     price: 35 },
  { id: 'hotsilog',  name: 'Hotsilog',  price: 50 },
  { id: 'tapsilog',  name: 'Tapsilog',  price: 60 },
  { id: 'longsilog', name: 'Longsilog', price: 55 },
  { id: 'tocilog',   name: 'Tocilog',   price: 55 },
];

const MENU_ADDONS = [
  { id: 'itlog',    name: 'Itlog',    price: 15 },
  { id: 'sinangag', name: 'Sinangag', price: 10 },
];

const ALL_MENU = [...MENU_SILOG, ...MENU_ADDONS];

const STEPS = [
  'Pending Payment',
  'Order Confirmed',
  'Preparing',
  'Order Ready',
  'Completed',
];

const NEXT_STEP_LABELS = {
  'Order Confirmed': 'Start Preparing',
  'Preparing':       'Mark as Ready',
  'Order Ready':     'Complete Order',
};

/* ============================================================
   CART STATE
   ============================================================ */

let cart = {};
ALL_MENU.forEach(item => { cart[item.id] = 0; });

/* ============================================================
   LOADING STATE
   ============================================================ */

function setLoading(on) {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = on ? 'flex' : 'none';
}

/* ============================================================
   TOAST
   ============================================================ */

let _toastTimer = null;

function showToast(msg, type = 'default') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show';
  if (type === 'warn')  el.classList.add('toast-warn');
  if (type === 'error') el.classList.add('toast-error');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = ''; }, 6000);
}

/* ============================================================
   SUPABASE HELPERS
   ============================================================ */

/** Fetch all orders, newest first */
async function fetchOrders() {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    console.error('fetchOrders:', error);
    showToast('Failed to load orders', 'error');
    return [];
  }
  return data;
}

/** Insert a new order row */
async function insertOrder(order) {
  const { data, error } = await db.from(TABLE).insert([order]).select();
  if (error) {
    console.error('insertOrder error:', JSON.stringify(error));
    showToast(`Insert failed: ${error.message}`, 'error');
    return false;
  }
  console.log('insertOrder success:', data);
  return true;
}

/** Update fields on a single order by its DB id */
async function updateOrder(id, fields) {
  const { error } = await db.from(TABLE).update(fields).eq('id', id);
  if (error) {
    console.error('updateOrder:', error);
    showToast('Failed to update order', 'error');
    return false;
  }
  return true;
}

/** Delete a single order by its DB id */
async function removeOrder(id) {
  const { error } = await db.from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('removeOrder:', error);
    showToast('Failed to delete order', 'error');
    return false;
  }
  return true;
}

/** Get the next order number (padded to 3 digits) */
async function getNextOrderNo() {
  const { data, error } = await db
    .from(TABLE)
    .select('order_no')
    .order('id', { ascending: false })
    .limit(1);

  if (error || !data || !data.length) return '001';
  const last = parseInt(data[0].order_no, 10);
  return String(last + 1).padStart(3, '0');
}

/* ============================================================
   MENU RENDERING
   ============================================================ */

function renderMenu() {
  renderMenuGroup(document.getElementById('menu-silog'),  MENU_SILOG);
  renderMenuGroup(document.getElementById('menu-addons'), MENU_ADDONS);
}

function renderMenuGroup(container, items) {
  container.innerHTML = items.map(item => /* html */`
    <div class="menu-item">
      <div class="menu-item-info">
        <div>
          <div class="menu-item-name">${item.name}</div>
          <div class="menu-item-price">&#8369;${item.price}.00</div>
        </div>
      </div>
      <div class="qty-controls">
        <button class="qty-btn qty-minus" onclick="updateQty('${item.id}', -1)" aria-label="Decrease ${item.name}">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <span class="qty-value" id="qty-${item.id}">${cart[item.id]}</span>
        <button class="qty-btn qty-plus" onclick="updateQty('${item.id}', 1)" aria-label="Increase ${item.name}">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

/* ============================================================
   CART RENDERING
   ============================================================ */

function getCartItems() {
  return ALL_MENU
    .filter(item => cart[item.id] > 0)
    .map(item => ({
      id:       item.id,
      name:     item.name,
      price:    item.price,
      qty:      cart[item.id],
      subtotal: item.price * cart[item.id],
    }));
}

function getCartTotal() {
  return getCartItems().reduce((sum, i) => sum + i.subtotal, 0);
}

function updateQty(id, delta) {
  cart[id] = Math.max(0, cart[id] + delta);
  const el = document.getElementById(`qty-${id}`);
  if (el) el.textContent = cart[id];
  renderCart();
}

function renderCart() {
  const items   = getCartItems();
  const body    = document.getElementById('cart-body');
  const footer  = document.getElementById('cart-footer');
  const totalEl = document.getElementById('cart-total');

  if (!items.length) {
    body.innerHTML = `
      <div class="cart-empty">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
        <p>No items selected yet.</p>
      </div>`;
    footer.style.display = 'none';
    return;
  }

  body.innerHTML = items.map(item => /* html */`
    <div class="cart-row">
      <span class="item-name">${item.qty}&times; ${item.name}</span>
      <span>&#8369;${item.subtotal}.00</span>
    </div>
  `).join('');

  totalEl.textContent = `₱${getCartTotal()}.00`;
  footer.style.display = 'flex';
}

/* ============================================================
   ORDER PLACEMENT
   ============================================================ */

async function placeOrder() {
  const nameInput = document.getElementById('customer-name');
  const errorEl   = document.getElementById('form-error');
  const name      = nameInput.value.trim();
  const items     = getCartItems();

  errorEl.classList.remove('visible');

  if (!name) {
    errorEl.textContent = 'Please enter the customer name.';
    errorEl.classList.add('visible');
    nameInput.focus();
    return;
  }
  if (!items.length) {
    errorEl.textContent = 'Please select at least one item.';
    errorEl.classList.add('visible');
    return;
  }

  setLoading(true);

  const orderNo = await getNextOrderNo();

  const order = {
    order_no:       orderNo,
    customer_name:  name,
    items:          items,          // stored as JSONB
    total:          getCartTotal(),
    payment_status: 'UNPAID',
    process_status: STEPS[0],
    step_index:     0,
  };

  const ok = await insertOrder(order);
  setLoading(false);

  if (!ok) return;

  ALL_MENU.forEach(item => { cart[item.id] = 0; });
  nameInput.value = '';
  errorEl.classList.remove('visible');

  renderMenu();
  renderCart();
  await refreshAll();
  showToast(`Order #${orderNo} placed for ${name}`);
}

/* ============================================================
   MARK AS PAID
   ============================================================ */

async function markPaid(id, orderNo) {
  setLoading(true);
  const ok = await updateOrder(id, {
    payment_status: 'PAID',
    process_status: STEPS[1],
    step_index:     1,
  });
  setLoading(false);
  if (!ok) return;
  await refreshAll();
  showToast(`Order #${orderNo} — Payment confirmed`);
}

/* ============================================================
   UNDO PAYMENT
   ============================================================ */

async function undoPayment(id, orderNo) {
  setLoading(true);
  const ok = await updateOrder(id, {
    payment_status: 'UNPAID',
    process_status: STEPS[0],
    step_index:     0,
  });
  setLoading(false);
  if (!ok) return;
  await refreshAll();
  showToast(`Order #${orderNo} — Payment undone`, 'warn');
}

/* ============================================================
   ADVANCE STATUS
   ============================================================ */

async function nextStep(id, orderNo, currentStepIndex) {
  const newIndex = currentStepIndex + 1;
  if (newIndex >= STEPS.length) return;

  setLoading(true);
  const ok = await updateOrder(id, {
    process_status: STEPS[newIndex],
    step_index:     newIndex,
  });
  setLoading(false);
  if (!ok) return;
  await refreshAll();
  showToast(`Order #${orderNo} — ${STEPS[newIndex]}`);
}

/* ============================================================
   DELETE / CANCEL ORDER
   ============================================================ */

async function deleteOrder(id, orderNo, processStatus) {
  const label = processStatus === 'Completed' ? 'Delete' : 'Cancel';
  if (!confirm(`${label} Order #${orderNo}?`)) return;

  setLoading(true);
  const ok = await removeOrder(id);
  setLoading(false);
  if (!ok) return;
  await refreshAll();
  showToast(`Order #${orderNo} ${label.toLowerCase()}led`, 'warn');
}

/* ============================================================
   CLEAR COMPLETED
   ============================================================ */

async function clearCompleted() {
  const orders    = await fetchOrders();
  const completed = orders.filter(o => o.process_status === 'Completed');
  if (!completed.length) { showToast('No completed orders to clear'); return; }
  if (!confirm(`Clear all ${completed.length} completed order(s)?`)) return;

  setLoading(true);
  const ids = completed.map(o => o.id);
  const { error } = await db.from(TABLE).delete().in('id', ids);
  setLoading(false);

  if (error) { showToast('Failed to clear orders', 'error'); return; }
  await refreshAll();
  showToast('Completed orders cleared');
}

/* ============================================================
   DOWNLOAD SUMMARY
   ============================================================ */

async function downloadSummary() {
  setLoading(true);
  const orders = await fetchOrders();
  setLoading(false);

  if (!orders.length) { showToast('No orders to download'); return; }

  const divider = '\u2500'.repeat(38);
  const lines   = [];

  lines.push('JEYPI SILOGAN');
  lines.push('Order Summary Report');
  lines.push(`Generated: ${new Date().toLocaleString('en-PH')}`);
  lines.push(divider);

  orders.forEach(o => {
    lines.push(`Order No. : ${o.order_no}`);
    lines.push(`Customer  : ${o.customer_name}`);
    lines.push(`Payment   : ${o.payment_status}`);
    lines.push(`Status    : ${o.process_status}`);
    lines.push('Items:');
    o.items.forEach(i => {
      lines.push(`  ${i.qty}x ${i.name.padEnd(12)} \u20B1${i.subtotal}.00`);
    });
    lines.push(`Total     : \u20B1${o.total}.00`);
    lines.push(divider);
  });

  const grandTotal   = orders.reduce((s, o) => s + o.total, 0);
  const paidTotal    = orders.filter(o => o.payment_status === 'PAID').reduce((s, o) => s + o.total, 0);
  const pendingTotal = orders.filter(o => o.payment_status === 'UNPAID').reduce((s, o) => s + o.total, 0);

  lines.push(`Total Orders   : ${orders.length}`);
  lines.push(`Grand Total    : \u20B1${grandTotal}.00`);
  lines.push(`Paid Total     : \u20B1${paidTotal}.00`);
  lines.push(`Pending Total  : \u20B1${pendingTotal}.00`);
  lines.push(divider);
  lines.push('Salamat sa inyong order!');

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `jeypi-silogan-summary-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Summary downloaded');
}

/* ============================================================
   RENDER ALL (fetch fresh data then paint)
   ============================================================ */

async function refreshAll() {
  const orders = await fetchOrders();
  renderOrders(orders);
  renderSummary(orders);
}

/* ============================================================
   ORDERS RENDERING
   ============================================================ */

function renderOrders(orders) {
  const container = document.getElementById('orders-container');

  if (!orders.length) {
    container.innerHTML = `
      <div class="orders-empty">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <p>No orders yet</p>
        <span style="font-size:0.8rem;color:#ccc">Waiting for customer orders</span>
      </div>`;
    return;
  }

  /* Show newest first */
  container.innerHTML = [...orders].reverse().map(o => buildOrderCard(o)).join('');
}

/* ── Build one order card ── */
function buildOrderCard(order) {
  const isCompleted = order.process_status === 'Completed';
  const isPaid      = order.payment_status === 'PAID';
  const stepIdx     = order.step_index;

  /* Payment badge */
  const payBadge = isPaid
    ? `<span class="pay-badge paid">
         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
           <polyline points="20 6 9 17 4 12"/>
         </svg>
         Paid
       </span>`
    : `<span class="pay-badge unpaid">
         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
           <circle cx="12" cy="12" r="10"/>
           <line x1="12" y1="8" x2="12" y2="12"/>
           <line x1="12" y1="16" x2="12.01" y2="16"/>
         </svg>
         Unpaid
       </span>`;

  /* Progress tracker */
  const progressHTML = STEPS.map((step, i) => {
    let circleClass = 'step-circle';
    let labelClass  = 'step-label';
    let inner       = `<span style="font-size:0.6rem;font-weight:800">${i + 1}</span>`;

    if (i < stepIdx) {
      circleClass += ' done'; labelClass += ' done';
      inner = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                 <polyline points="20 6 9 17 4 12"/>
               </svg>`;
    } else if (i === stepIdx) {
      circleClass += ' active'; labelClass += ' active';
    }

    const connector = i < STEPS.length - 1
      ? `<div class="step-connector ${i < stepIdx ? 'done' : ''}"></div>`
      : '';

    return `
      <div class="step-node">
        <div class="${circleClass}" title="${step}">${inner}</div>
        <span class="${labelClass}">${step}</span>
      </div>${connector}`;
  }).join('');

  /* Action buttons — pass DB id + orderNo to every handler */
  const id  = order.id;
  const no  = order.order_no;
  let actionHTML = '';

  if (!isPaid) {
    actionHTML = `
      <button class="btn-pay" onclick="markPaid(${id}, '${no}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
        Mark as Paid
      </button>
      <button class="btn-delete" onclick="deleteOrder(${id}, '${no}', '${order.process_status}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Cancel Order
      </button>`;

  } else if (stepIdx === 1) {
    const label = NEXT_STEP_LABELS[order.process_status] || 'Next Step';
    actionHTML = `
      <button class="btn-next" onclick="nextStep(${id}, '${no}', ${stepIdx})">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        ${label}
      </button>
      <button class="btn-undo" onclick="undoPayment(${id}, '${no}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 14 4 9 9 4"/>
          <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
        </svg>
        Undo Payment
      </button>
      <button class="btn-delete" onclick="deleteOrder(${id}, '${no}', '${order.process_status}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
        Delete
      </button>`;

  } else if (!isCompleted) {
    const label = NEXT_STEP_LABELS[order.process_status] || 'Next Step';
    actionHTML = `
      <button class="btn-next" onclick="nextStep(${id}, '${no}', ${stepIdx})">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        ${label}
      </button>
      <button class="btn-delete" onclick="deleteOrder(${id}, '${no}', '${order.process_status}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
        Delete
      </button>`;

  } else {
    actionHTML = `
      <button class="btn-delete" onclick="deleteOrder(${id}, '${no}', '${order.process_status}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
        Delete
      </button>`;
  }

  /* Items list */
  const itemsHTML = order.items.map(item => `
    <div class="order-item-row">
      <span>${item.qty}&times; ${item.name}</span>
      <span>&#8369;${item.subtotal}.00</span>
    </div>`).join('');

  /* Timestamp from Supabase created_at */
  const ts = order.created_at
    ? new Date(order.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  /* Final receipt */
  const receiptHTML = isCompleted ? `
    <div class="receipt-block">
      <div class="receipt-header">
        <span>Order Receipt</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="receipt-body">
        <div class="receipt-brand-line">Jeypi Silogan</div>
        <hr class="receipt-divider">
        <div class="receipt-row"><span>Customer:</span><span>${order.customer_name}</span></div>
        <div class="receipt-row"><span>Order No.:</span><span>${order.order_no}</span></div>
        <hr class="receipt-divider">
        ${order.items.map(i => `
          <div class="receipt-row">
            <span>${i.qty}x ${i.name}</span>
            <span>&#8369;${i.subtotal}.00</span>
          </div>`).join('')}
        <hr class="receipt-divider">
        <div class="receipt-row bold"><span>Total:</span><span>&#8369;${order.total}.00</span></div>
        <div class="receipt-row"><span>Payment:</span><span>PAID</span></div>
        <div class="receipt-row"><span>Status:</span><span>COMPLETED</span></div>
        <hr class="receipt-divider">
        <div class="receipt-thanks">Salamat sa inyong order!</div>
      </div>
    </div>` : '';

  return /* html */`
    <div class="order-card ${isCompleted ? 'is-completed' : ''}">
      <div class="order-card-bar ${isCompleted ? 'is-completed' : ''}">
        <span class="order-number">#${order.order_no}</span>
        <span class="order-customer">${order.customer_name}</span>
        <span class="order-time">${ts}</span>
      </div>
      <div class="order-card-body">
        <div class="order-items">${itemsHTML}</div>
        <div class="order-total-row">
          <span class="order-total-label">Total Amount</span>
          <span class="order-total-amount">&#8369;${order.total}.00</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          ${payBadge}
          <span style="font-size:0.75rem;color:#888;font-family:'Fredoka One',cursive">
            ${order.process_status}
          </span>
        </div>
        <div class="progress-wrap">
          <div class="progress-steps">${progressHTML}</div>
        </div>
        <div class="card-actions">${actionHTML}</div>
        ${receiptHTML}
      </div>
    </div>`;
}

/* ============================================================
   SUMMARY TABLE
   ============================================================ */

function renderSummary(orders) {
  const tbody   = document.getElementById('summary-tbody');
  const totalEl = document.getElementById('summary-grand-total');
  const paidEl  = document.getElementById('summary-paid-total');
  const pendEl  = document.getElementById('summary-pending-total');
  const countEl = document.getElementById('summary-count');

  if (!orders.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;color:#bbb;padding:20px;font-size:0.85rem">
          No orders recorded yet.
        </td>
      </tr>`;
    totalEl.textContent = '₱0.00';
    paidEl.textContent  = '₱0.00';
    pendEl.textContent  = '₱0.00';
    countEl.textContent = '0';
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const statusClass = o.process_status === 'Completed'
      ? 'status-pill completed'
      : o.payment_status === 'UNPAID'
        ? 'status-pill unpaid'
        : 'status-pill inprogress';

    const ts = o.created_at
      ? new Date(o.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';

    return `
      <tr>
        <td>#${o.order_no}</td>
        <td>${o.customer_name}</td>
        <td>${o.items.map(i => `${i.qty}x ${i.name}`).join(', ')}</td>
        <td>&#8369;${o.total}.00</td>
        <td><span class="${statusClass}">${o.payment_status}</span></td>
        <td><span class="${statusClass}">${o.process_status}</span></td>
      </tr>`;
  }).join('');

  const grandTotal   = orders.reduce((s, o) => s + o.total, 0);
  const paidTotal    = orders.filter(o => o.payment_status === 'PAID').reduce((s, o) => s + o.total, 0);
  const pendingTotal = orders.filter(o => o.payment_status === 'UNPAID').reduce((s, o) => s + o.total, 0);

  totalEl.textContent = `₱${grandTotal}.00`;
  paidEl.textContent  = `₱${paidTotal}.00`;
  pendEl.textContent  = `₱${pendingTotal}.00`;
  countEl.textContent = orders.length;
}

/* ============================================================
   REALTIME SUBSCRIPTION
   Auto-refreshes the order queue when any change happens
   in Supabase from any browser/device.
   ============================================================ */

function subscribeRealtime() {
  db.channel('orders-channel')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: TABLE },
      () => refreshAll()
    )
    .subscribe();
}

/* ============================================================
   INIT
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  renderMenu();
  renderCart();
  await refreshAll();
  subscribeRealtime();
});
