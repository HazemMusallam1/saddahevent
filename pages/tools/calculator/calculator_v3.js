// --- CONSTANTS & STATE ---
const CHAIR_PRICE = 30;
const TABLE_CHAIR_PRICE = 25; // سعر الكرسي/الشخص في منتج طاولات الخشب (تعديل عدد الأشخاص)
// Always read live from SaddahDB so we never hold a stale empty reference
function getItems()        { return (window.SaddahDB && window.SaddahDB.data.inventory)    || []; }
function getProductTypes() { return (window.SaddahDB && window.SaddahDB.data.productTypes) || ['باقة (طاولة+كراسي)', 'قطعة فردية', 'خدمة', 'إضاءة']; }

let cart = {};
let currentSourceFilter = 'all';

// --- UI HELPERS (Toast & Validation) ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    let bgClass = type === 'error' ? 'bg-red-500' : (type === 'info' ? 'bg-blue-500' : 'bg-emerald-600');
    let icon = type === 'error' ? 'fa-circle-exclamation' : (type === 'info' ? 'fa-info-circle' : 'fa-check-circle');

    toast.className = `${bgClass} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] pointer-events-auto fade-in transform transition-all duration-300 translate-y-0 opacity-100`;
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span class="font-bold text-sm">${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function validateInput(id, message) {
    const el = document.getElementById(id);
    if (!el.value.trim()) {
        el.classList.add('input-error');
        el.focus();
        // Remove error on input
        el.addEventListener('input', () => el.classList.remove('input-error'), { once: true });
        return false;
    }
    return true;
}

// --- INITIALIZATION ---
// تعريف الدالة فقط هنا — الاستدعاء في نهاية الملف بعد تهيئة كل المتغيرات (let/const)
// لتجنّب خطأ Temporal Dead Zone مع متغيرات مثل editingState المُعرّفة لاحقاً.
function initCalculator() {
    // التأكد من وجود منتج الطاولات المميّز
    if (typeof window.ensureTablesProduct === 'function') window.ensureTablesProduct();

    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    const ds = document.getElementById('date-start');
    if (ds) ds.value = today;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const de = document.getElementById('date-end');
    if (de) de.value = tomorrow.toISOString().split('T')[0];

    initFilters();

    // Check for edit session
    // بيانات قادمة من واتساب لإنشاء عقد جديد — لها الأولوية على أي جلسة تعديل عالقة
    let waDraft = null;
    try { waDraft = JSON.parse(localStorage.getItem('wa_contract_draft') || 'null'); } catch (e) {}
    const editSession = JSON.parse(localStorage.getItem('sadda_edit_session'));

    if (waDraft) {
        localStorage.removeItem('sadda_edit_session'); // تجاهل أي تعديل عالق
        const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null && String(v) !== '') el.value = v; };
        setVal('c-phone', waDraft.phone);
        setVal('c-name', waDraft.name);
        setVal('c-id', waDraft.idNumber);
        setVal('c-address', waDraft.address);
        if (waDraft.deposit)  { setVal('deposit', String(waDraft.deposit).replace(/[^\d.]/g, '')); document.getElementById('deposit')?.dispatchEvent(new Event('input', { bubbles: true })); }
        if (waDraft.security) { setVal('security-deposit', String(waDraft.security).replace(/[^\d.]/g, '')); document.getElementById('security-deposit')?.dispatchEvent(new Event('input', { bubbles: true })); }
        localStorage.removeItem('wa_contract_draft');
        renderItems();
    } else if (editSession) {
        restoreEditSession(editSession);
    } else {
        const waphone = new URLSearchParams(location.search).get('waphone');
        if (waphone) { const el = document.getElementById('c-phone'); if (el) el.value = waphone; }
        renderItems();
    }
}

function initFilters() {
    const select = document.getElementById('filter-type');
    select.innerHTML = '<option value="all">كل الأصناف</option>' +
        getProductTypes().map(t => `<option value="${t}">${t}</option>`).join('');
}

// --- CORE LOGIC: RENDER & CART ---
function setSourceFilter(source) {
    currentSourceFilter = source;
    ['all', 'internal', 'external'].forEach(s => {
        const btn = document.getElementById(`btn-src-${s}`);
        if (s === source) btn.className = 'filter-btn active';
        else btn.className = 'filter-btn inactive';
    });
    renderItems();
}

function toggleClientType() {
    const type = document.querySelector('input[name="client_type"]:checked').value;
    if (type === 'company') {
        document.getElementById('inputs-individual').classList.add('hidden');
        document.getElementById('inputs-company').classList.remove('hidden');
    } else {
        document.getElementById('inputs-individual').classList.remove('hidden');
        document.getElementById('inputs-company').classList.add('hidden');
    }
}

function populateEditData(data) {
    editingState = data;
    if (data.client) {
        document.getElementById('c-phone').value = data.client.phone || '';
        document.getElementById('c-address').value = data.client.address || '';
        document.getElementById('date-start').value = data.client.deliveryDate || '';
        document.getElementById('time-start').value = data.client.deliveryTime || '14:00';
        document.getElementById('date-end').value = data.client.pickupDate || '';
        document.getElementById('time-end').value = data.client.pickupTime || '12:00';
        document.getElementById('c-delivery').value = data.client.deliveryPerson || '';
        document.getElementById('c-return').value = data.client.returnPerson || '';

        if (data.client.type === 'company') {
            document.getElementById('radio-company').checked = true;
            toggleClientType();
            document.getElementById('c-comp-name').value = data.client.name || '';
            document.getElementById('c-vat-id').value = data.client.id || '';
        } else {
            document.getElementById('radio-individual').checked = true;
            toggleClientType();
            document.getElementById('c-name').value = data.client.name || '';
            document.getElementById('c-id').value = data.client.id || '';
        }
    }
    
    // Populate Expenses
    document.getElementById('expenses-container').innerHTML = '';
    if (data.expenses && data.expenses.length > 0) {
        data.expenses.forEach(exp => addExpenseRow(exp.name || exp.supplier, exp.amount || exp.total));
    }

    // Populate Cart
    if (data.cart) {
        // If coming from orders.js (which passes a pre-built cart)
        cart = data.cart;
    } else if (data.items) {
        // If coming from order_tracking.js (which passes items array)
        data.items.forEach(editItem => {
            // المنتج المميّز: استعادة إعدادات الطاولات
            if (editItem.tablesMeta) {
                const it = _tblItem();
                if (it) cart[it.id] = {
                    qty: parseInt(editItem.tablesMeta.tables) || 0,
                    styling: editItem.tablesMeta.styling || 'none',
                    color: editItem.tablesMeta.color || '',
                    customDesc: editItem.tablesMeta.customDesc || '',
                    people: editItem.tablesMeta.people != null ? editItem.tablesMeta.people : null
                };
                return;
            }
            const matchedItem = getItems().find(i => i.name === editItem.name);
            if (matchedItem) {
                cart[matchedItem.id] = {
                    qty: parseInt(editItem.qty) || 0,
                    chairs: parseInt(editItem.chairsCount) || 0,
                    decor: !!editItem.decorDetails,
                    customDecor: '',
                    customPrice: editItem.unitPrice
                };
            }
        });
    }

    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    renderItems();
    calcTotal();
}

function cancelEditSession() {
    localStorage.removeItem('sadda_edit_session');
    window.location.href = 'order_tracking.html';
}

function renderItems() {
    const container = document.getElementById('items-container');
    const search = document.getElementById('search').value.toLowerCase();
    const filterType = document.getElementById('filter-type').value;
    const emptyState = document.getElementById('empty-state');

    container.innerHTML = '';
    let hasItems = false;

    renderFeaturedTables(); // المنتج المميّز (طاولات خشب) — مثبّت بالأعلى

    getItems().forEach(item => {
        if (item.isTieredTables) return; // يُعرض في البطاقة المميّزة وليس ضمن الشبكة العادية
        const matchesSearch = item.name.toLowerCase().includes(search);
        const matchesType = filterType === 'all' || item.type === filterType;

        let matchesSource = true;
        if (currentSourceFilter === 'internal') matchesSource = !item.isExternal;
        if (currentSourceFilter === 'external') matchesSource = item.isExternal;

        if (!matchesSearch || !matchesType || !matchesSource) return;

        hasItems = true;
        if (!cart[item.id]) cart[item.id] = { qty: 0, chairs: 0, decor: true, customDecor: '' };
        const c = cart[item.id];

        const isPackage = (item.capacity && item.capacity > 0);
        const isDecorItem = item.decorFee > 0;
        const hasQty = c.qty > 0;

        const imgDisplay = item.image
            ? `<img src="${item.image}" class="w-12 h-12 rounded-lg object-cover border border-gray-200 bg-white ml-3" alt="${item.name}">`
            : `<div class="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 ml-3 text-lg"><i class="fa-solid fa-box"></i></div>`;

        const sourceBadge = item.isExternal
            ? `<span class="text-[9px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded border border-orange-100 mr-1 font-bold">خارجي</span>`
            : '';

        // HTML Structure for Item Card
        let html = `
            <div class="bg-white rounded-xl p-3 border ${hasQty ? 'border-emerald-400 shadow-md bg-emerald-50/10' : 'border-gray-200'} hover:border-emerald-300 transition-all shadow-sm group">
                <div class="flex justify-between items-center mb-2">
                    <div class="flex items-center flex-grow">
                        ${imgDisplay}
                        <div>
                            <div class="flex items-center gap-1">
                                <h3 class="font-bold text-gray-800 text-sm md:text-base">${item.name}</h3>
                                ${sourceBadge}
                            </div>
                            <div class="text-[10px] mt-0.5 text-gray-500 font-bold">${item.price} ريال</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-200">
                        <button onclick="adjQty(${item.id}, -1)" class="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-gray-500 hover:text-red-500 hover:bg-red-50 transition"><i class="fa-solid fa-minus text-[10px]"></i></button>
                        <input type="number" min="0" class="w-10 text-center font-bold text-base bg-transparent focus:outline-none" value="${c.qty || 0}" oninput="updateCart(${item.id}, 'qty', this.value)">
                        <button onclick="adjQty(${item.id}, 1)" class="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-gray-500 hover:text-emerald-500 hover:bg-emerald-50 transition"><i class="fa-solid fa-plus text-[10px]"></i></button>
                    </div>
                </div>`;

        // Options Section (Shows only if Qty > 0)
        if (hasQty) {
            const isVisible = '';
            const defaultCapacity = (item.capacity || 0) * (c.qty || 1);
            const decorPriceDisplay = item.decorFee > 0 ? item.decorFee : '0';

            html += `<div class="border-t border-dashed border-gray-200 pt-2 mt-1 space-y-2 ${isVisible} text-xs transition-all">`;

            // 1. Grid for Package/Decor (if applicable)
            if (isPackage || isDecorItem) {
                html += `<div class="grid grid-cols-2 gap-2">`;

                // Column 1: Capacity (Packages only)
                if (isPackage) {
                    html += `
                    <div class="bg-gray-50 p-1.5 rounded border border-gray-100">
                        <label class="text-[9px] font-bold text-gray-500 block mb-0.5">عدد الكراسي</label>
                        <input type="number" class="w-full bg-white border border-gray-200 rounded px-1 text-center h-6 focus:border-blue-400 focus:outline-none" placeholder="الافتراضي: ${defaultCapacity}" value="${c.chairs || ''}" oninput="updateCart(${item.id}, 'chairs', this.value)">
                    </div>`;
                } else {
                    html += `<div></div>`;
                }

                // Column 2: Decor
                html += `
                <div class="space-y-1">
                    <label class="flex items-center gap-2 cursor-pointer bg-gray-50 p-1.5 rounded border border-gray-100 hover:bg-gray-100 transition">
                        <input type="checkbox" class="text-emerald-600 rounded w-3.5 h-3.5" ${c.decor ? 'checked' : ''} onchange="updateCart(${item.id}, 'decor', this.checked)">
                        <span class="text-[9px] font-bold">تنسيق (${decorPriceDisplay})</span>
                    </label>
                    ${c.decor ? `<input type="number" class="w-full bg-yellow-50 border border-yellow-200 rounded px-1 text-center h-6 text-[10px] focus:border-yellow-400 focus:outline-none" placeholder="سعر مخصص" value="${c.customDecor}" oninput="updateCart(${item.id}, 'customDecor', this.value)">` : ''}
                </div>`;

                html += `</div>`; // End Grid
            }

            // 2. Price Override (Always visible when hasQty)
            html += `
                <div class="flex items-center gap-2 bg-slate-50 p-1.5 rounded border border-slate-100">
                    <label class="text-[9px] font-bold text-slate-500 whitespace-nowrap">السعر بعد الخصم:</label>
                    <input type="number" class="w-full bg-white border border-slate-200 rounded px-1 text-center h-6 focus:border-blue-400 focus:outline-none placeholder-gray-300 font-mono"
                        placeholder="${item.price}"
                        value="${c.customPrice !== undefined ? c.customPrice : ''}"
                        oninput="updateCart(${item.id}, 'customPrice', this.value)">
                    <span class="text-[9px] text-slate-400 font-bold">ريال</span>
                </div>
            `;

            html += `<div id="msg-${item.id}" class="text-[10px] mt-1 font-bold text-orange-500"></div>`;
            html += `</div>`;
        }

        html += `</div>`;
        container.innerHTML += html;
    });

    if (!hasItems) emptyState.classList.remove('hidden');
    else emptyState.classList.add('hidden');
}

// ─────────── المنتج المميّز: طاولات خشب (تسعير شرائح + باقات تنسيق) ───────────
function _tblItem() { return getItems().find(i => i && i.isTieredTables); }
function _tblCart() {
    const it = _tblItem();
    if (!it) return null;
    if (!cart[it.id]) cart[it.id] = { qty: 0, styling: 'none', color: '', customDesc: '', people: null };
    return cart[it.id];
}

function renderFeaturedTables() {
    const host = document.getElementById('featured-container');
    if (!host) return;
    const item = _tblItem();
    if (!item) { host.innerHTML = ''; return; }
    const c = _tblCart();
    const n = parseInt(c.qty) || 0;
    const active = n > 0;
    const colors = Array.isArray(item.stylingColors) ? item.stylingColors : [];
    const pr = window.getTablesPricing(c.styling || 'none', n > 0 ? n : 1);
    const people = (c.people != null && c.people !== '') ? (parseInt(c.people) || 0) : pr.capacity;
    const adj = (people - pr.capacity) * TABLE_CHAIR_PRICE;
    const finalAdj = pr.final + adj;
    const origAdj = pr.original + adj;

    const pkgBtn = (key, label, icon) => `
        <button type="button" onclick="setTablesStyling('${key}')" class="tbl-pkg ${c.styling === key ? 'tbl-pkg-on' : ''}">
            <i class="fa-solid ${icon}"></i> ${label}
        </button>`;

    let stylingExtra = '';
    if (c.styling === 'premade') {
        const chips = colors.length
            ? colors.map(col => `<button type="button" onclick="setTablesColor('${String(col).replace(/'/g, "\\'")}')" class="tbl-color ${c.color === col ? 'tbl-color-on' : ''}">${col}</button>`).join('')
            : '<span class="text-[11px] text-gray-400">لا توجد ألوان مضافة — أضِفها من صفحة المخزون</span>';
        stylingExtra = `<div class="tbl-colors"><span class="text-[10px] font-bold text-gray-500 ml-1">اللون / التنسيق:</span>${chips}</div>`;
    } else if (c.styling === 'custom') {
        const v = c.customDesc ? String(c.customDesc).replace(/</g, '&lt;') : '';
        stylingExtra = `<textarea oninput="updateTablesCustom(this.value)" rows="2" placeholder="اكتب وصف التنسيق المخصص المطلوب (الألوان، الستايل، التفاصيل)..." class="tbl-custom">${v}</textarea>`;
    }

    const hasDisc = pr.savings > 0;
    const priceBlock = `
        <div class="tbl-price">
            ${hasDisc ? `<span class="tbl-orig">${origAdj} ر.س</span>` : ''}
            <span class="tbl-final">${finalAdj} ر.س</span>
            ${hasDisc ? `<span class="tbl-save"><i class="fa-solid fa-tag"></i> وفّرت ${pr.savings} · خصم ${pr.discount}%</span>` : ''}
        </div>`;

    const peopleNote = people !== pr.capacity
        ? `${adj >= 0 ? '+' : ''}${adj} ر.س · الافتراضي ${pr.capacity}`
        : `الافتراضي للباقة (${pr.capacity})`;

    host.innerHTML = `
    <div class="tbl-card ${active ? 'tbl-card-on' : ''}">
        <div class="tbl-head">
            <div class="tbl-title"><span class="tbl-star"><i class="fa-solid fa-star"></i></span> ${item.name}<span class="tbl-badge">مميّز</span>
                <button type="button" onclick="openTablesOfferModal()" class="tbl-send" title="إرسال الأسعار للعميل على واتساب"><i class="fa-brands fa-whatsapp"></i> أرسل الأسعار</button>
            </div>
            <div class="tbl-qty">
                <span class="text-[10px] font-bold text-gray-500 ml-1">الطاولات</span>
                <button type="button" onclick="adjTablesQty(-1)" class="tbl-step"><i class="fa-solid fa-minus text-[10px]"></i></button>
                <input type="number" min="0" max="${window.TABLES_PRICING.maxTables}" value="${n}" oninput="updateTablesQty(this.value)" class="tbl-qty-input">
                <button type="button" onclick="adjTablesQty(1)" class="tbl-step"><i class="fa-solid fa-plus text-[10px]"></i></button>
            </div>
        </div>
        ${active ? `
        <div class="tbl-body">
            <div class="tbl-people-row">
                <span class="tbl-people-label"><i class="fa-solid fa-users"></i> عدد الأشخاص</span>
                <div class="tbl-people">
                    <button type="button" onclick="adjTablesPeople(-1)" class="tbl-pstep"><i class="fa-solid fa-minus text-[9px]"></i></button>
                    <input type="number" min="0" value="${people}" oninput="updateTablesPeople(this.value)" class="tbl-people-input">
                    <button type="button" onclick="adjTablesPeople(1)" class="tbl-pstep"><i class="fa-solid fa-plus text-[9px]"></i></button>
                </div>
                <span class="tbl-people-note">${peopleNote}</span>
            </div>
            <div class="tbl-pkgs">
                ${pkgBtn('none', 'بدون تنسيق', 'fa-table')}
                ${pkgBtn('premade', 'تنسيق جاهز', 'fa-wand-magic-sparkles')}
                ${pkgBtn('custom', 'تنسيق مخصص', 'fa-crown')}
            </div>
            ${stylingExtra}
            ${priceBlock}
        </div>` : `<div class="tbl-hint"><i class="fa-solid fa-hand-pointer"></i> اختر عدد الطاولات للبدء — تظهر خيارات التنسيق والأسعار تلقائياً.</div>`}
    </div>`;
}

function adjTablesQty(d) {
    const c = _tblCart(); if (!c) return;
    let n = (parseInt(c.qty) || 0) + d;
    n = Math.max(0, Math.min(window.TABLES_PRICING.maxTables, n));
    c.qty = n;
    c.people = null; // إعادة عدد الأشخاص للافتراضي عند تغيير عدد الطاولات
    renderFeaturedTables(); calcTotal();
}
function updateTablesQty(v) {
    const c = _tblCart(); if (!c) return;
    let n = parseInt(v) || 0;
    n = Math.max(0, Math.min(window.TABLES_PRICING.maxTables, n));
    c.qty = n;
    c.people = null;
    renderFeaturedTables(); calcTotal();
}
function adjTablesPeople(d) {
    const c = _tblCart(); if (!c) return;
    const n = parseInt(c.qty) || 0;
    const cap = window.getTablesPricing(c.styling || 'none', n > 0 ? n : 1).capacity;
    const cur = (c.people != null && c.people !== '') ? (parseInt(c.people) || 0) : cap;
    c.people = Math.max(0, Math.min(999, cur + d));
    renderFeaturedTables(); calcTotal();
}
function updateTablesPeople(v) {
    const c = _tblCart(); if (!c) return;
    let p = parseInt(v); if (isNaN(p)) p = 0;
    c.people = Math.max(0, Math.min(999, p));
    refreshTablesPrice(); calcTotal(); // تحديث خفيف للحفاظ على تركيز الحقل أثناء الكتابة
}
// تحديث السعر والملاحظة دون إعادة بناء البطاقة (يحافظ على تركيز حقل عدد الأشخاص)
function refreshTablesPrice() {
    const c = _tblCart(); if (!c) return;
    const n = parseInt(c.qty) || 0; if (n <= 0) return;
    const pr = window.getTablesPricing(c.styling || 'none', n);
    const people = (c.people != null && c.people !== '') ? (parseInt(c.people) || 0) : pr.capacity;
    const adj = (people - pr.capacity) * TABLE_CHAIR_PRICE;
    const host = document.getElementById('featured-container'); if (!host) return;
    const f = host.querySelector('.tbl-final'); if (f) f.textContent = (pr.final + adj) + ' ر.س';
    const o = host.querySelector('.tbl-orig'); if (o) o.textContent = (pr.original + adj) + ' ر.س';
    const note = host.querySelector('.tbl-people-note');
    if (note) note.textContent = people !== pr.capacity ? `${adj >= 0 ? '+' : ''}${adj} ر.س · الافتراضي ${pr.capacity}` : `الافتراضي للباقة (${pr.capacity})`;
}
function setTablesStyling(pkg) {
    const c = _tblCart(); if (!c) return;
    c.styling = pkg;
    if (pkg === 'premade' && !c.color) {
        const it = _tblItem();
        if (it && Array.isArray(it.stylingColors) && it.stylingColors.length) c.color = it.stylingColors[0];
    }
    renderFeaturedTables(); calcTotal();
}
function setTablesColor(col) {
    const c = _tblCart(); if (!c) return;
    c.color = col;
    renderFeaturedTables(); calcTotal();
}
function updateTablesCustom(v) {
    const c = _tblCart(); if (!c) return;
    c.customDesc = v; // بدون إعادة رسم للحفاظ على تركيز مربع النص
}

// ─── إرسال أسعار/عروض الطاولات للعميل على واتساب ───
const _OFFER_LABELS = {
    comprehensive: 'رسالة شاملة',
    basic: 'الأسعار الأساسية',
    premade: 'التنسيق الجاهز',
    custom: 'التنسيق الخاص (VIP)'
};

function openTablesOfferModal() {
    const modal = document.getElementById('tables-offer-modal');
    if (!modal) return;
    // تعبئة رقم العميل تلقائياً من نموذج الطلب
    const cp = (document.getElementById('c-phone') || {}).value || '';
    const op = document.getElementById('offer-phone');
    if (op) { op.value = cp; op.classList.remove('input-error'); }
    // العودة للخطوة الأولى
    document.getElementById('offer-step1').classList.remove('hidden');
    document.getElementById('offer-step2').classList.add('hidden');
    modal.classList.remove('hidden');
}
function closeTablesOfferModal() {
    const m = document.getElementById('tables-offer-modal');
    if (m) m.classList.add('hidden');
}
function tablesOfferBack() {
    document.getElementById('offer-step2').classList.add('hidden');
    document.getElementById('offer-step1').classList.remove('hidden');
}
function tablesOfferPickCategory(cat) {
    const P = window.TABLES_PRICING;
    const lbl = document.getElementById('offer-cat-label');
    if (lbl) lbl.textContent = _OFFER_LABELS[cat] || '';
    let html = '';
    for (let n = 1; n <= P.maxTables; n++) {
        html += `<button type="button" onclick="tablesOfferSend('${cat}', ${n})" class="offer-size-btn">
            <span class="ppl">${P.capacity[n]} شخص</span>
            <span class="tbn">${n} طاولة</span>
        </button>`;
    }
    document.getElementById('offer-size-grid').innerHTML = html;
    document.getElementById('offer-step1').classList.add('hidden');
    document.getElementById('offer-step2').classList.remove('hidden');
}
function buildTablesOfferMessage(cat, n) {
    return window.buildTablesPriceMessage ? window.buildTablesPriceMessage(cat, n) : '';
}
function tablesOfferSend(cat, n) {
    const op = document.getElementById('offer-phone');
    let phone = ((op || {}).value || '').replace(/[^0-9]/g, '');
    if (!phone) { showToast('أدخل رقم العميل أولاً', 'error'); if (op) op.classList.add('input-error'); return; }
    if (phone.startsWith('05')) phone = '966' + phone.substring(1);
    else if (phone.startsWith('5') && phone.length === 9) phone = '966' + phone;
    else if (phone.startsWith('0') && phone.length === 10) phone = '966' + phone.substring(1);
    const msg = buildTablesOfferMessage(cat, n);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    closeTablesOfferModal();
    showToast('تم فتح واتساب برسالة الأسعار', 'success');
}

// Helper for quantity buttons
function adjQty(id, delta) {
    const current = parseInt(cart[id].qty) || 0;
    const newVal = Math.max(0, current + delta);
    updateCart(id, 'qty', newVal);
}

function updateCart(id, field, value) {
    cart[id][field] = value;
    if (field === 'qty' || field === 'decor') renderItems();
    calcTotal();
}

// --- EXPENSES LOGIC ---
function addExpenseRow(name = '', amount = '') {
    const container = document.getElementById('expenses-container');
    const row = document.createElement('div');
    row.className = 'expense-row flex gap-2 items-center fade-in';
    row.innerHTML = `
        <input type="text" class="exp-name input-std flex-1 text-xs" placeholder="وصف المصروف" value="${name}">
        <input type="number" class="exp-amount input-std w-20 text-center text-xs" placeholder="المبلغ" value="${amount}">
        <button onclick="removeExpenseRow(this)" class="bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 w-8 h-8 rounded border border-red-100 flex items-center justify-center transition">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
    container.appendChild(row);
}

function removeExpenseRow(btn) {
    btn.closest('.expense-row').remove();
}

function confirmResetCart() {
    if (confirm('هل أنت متأكد من تصفير السلة وحذف جميع المنتجات المختارة؟')) {
        resetCart();
    }
}

function resetCart() { cart = {}; renderItems(); calcTotal(); showToast('تم تصفير السلة', 'info'); }

function calcTotal() {
    let subTotal = 0;
    getItems().forEach(item => {
        const c = cart[item.id];
        if (!c) return;
        if (item.isTieredTables) {
            const tn = parseInt(c.qty) || 0;
            if (tn > 0) {
                const pr = window.getTablesPricing(c.styling || 'none', tn);
                const ppl = (c.people != null && c.people !== '') ? (parseInt(c.people) || 0) : pr.capacity;
                subTotal += pr.final + (ppl - pr.capacity) * TABLE_CHAIR_PRICE;
            }
            return;
        }
        const qty = parseInt(c.qty) || 0;
        if (qty > 0) {
            const unitPrice = (c.customPrice !== undefined && c.customPrice !== '') ? parseFloat(c.customPrice) : item.price;
            let itemTotal = qty * unitPrice;
            if (c.decor) {
                const dFee = c.customDecor ? parseFloat(c.customDecor) : (item.decorFee || 0);
                itemTotal += qty * dFee;
            }
            if (item.capacity && item.capacity > 0) {
                const standardCapacity = item.capacity * qty;
                let reqChairs = c.chairs === '' ? standardCapacity : parseInt(c.chairs);
                if (isNaN(reqChairs)) reqChairs = standardCapacity;
                const diff = reqChairs - standardCapacity;
                if (reqChairs === 0) itemTotal -= standardCapacity * CHAIR_PRICE;
                else if (diff !== 0) itemTotal += diff * CHAIR_PRICE;
                const need = Math.ceil(reqChairs / item.capacity);
                const msgEl = document.getElementById(`msg-${item.id}`);
                if (msgEl) msgEl.innerHTML = (reqChairs > 0 && qty < need) ? `<i class="fa-solid fa-triangle-exclamation"></i> تنبيه: عدد الكراسي كبير!` : '';
            }
            subTotal += itemTotal;
        }
    });
    const delivery = parseFloat(document.getElementById('del-fee').value) || 0;
    const vatRate = parseFloat(document.getElementById('vat-rate').value) || 0;
    const vatAmount = (subTotal + delivery) * (vatRate / 100);

    document.getElementById('vat-value-display').innerText = vatAmount.toFixed(2);
    document.getElementById('subtotal-display').innerText = subTotal.toFixed(2);
    document.getElementById('total-display').innerText = (subTotal + delivery + vatAmount).toFixed(2) + ' ريال';
}

let editingState = null; // Store metadata for editing

// --- CORE LOGIC: SAVE ORDER ---
async function saveAndComplete() {
    // 1. Validate Client Info
    const clientType = document.querySelector('input[name="client_type"]:checked').value;
    let clientName, clientId;
    let isValid = true;

    if (clientType === 'company') {
        if (!validateInput('c-comp-name', 'اسم المنشأة مطلوب')) isValid = false;
        clientName = document.getElementById('c-comp-name').value;
        clientId = document.getElementById('c-vat-id').value;
    } else {
        if (!validateInput('c-name', 'اسم المستأجر مطلوب')) isValid = false;
        clientName = document.getElementById('c-name').value;
        clientId = document.getElementById('c-id').value;
    }

    if (!isValid) {
        showToast('يرجى إكمال البيانات المطلوبة', 'error');
        return;
    }

    // تطبيع الاسم: تحويل حروف العرض العربية (من النسخ من PDF) لعربية قياسية
    // حتى تُخزّن أسماء نظيفة وتعمل أسماء المجلدات والملفات بشكل صحيح
    clientName = (clientName || '').normalize('NFKC').trim();

    // 2. Build Order Object
    const orderData = {
        id: editingState ? editingState.originalId : Date.now(), // Use original ID if editing
        date: editingState ? new Date(editingState.originalId).toLocaleDateString('ar-SA') : new Date().toLocaleDateString('ar-SA'), // Keep original date if editing
        client: {
            type: clientType,
            name: clientName,
            id: clientId,
            phone: document.getElementById('c-phone').value,
            address: document.getElementById('c-address').value,
            deliveryDate: document.getElementById('date-start').value,
            deliveryTime: document.getElementById('time-start').value,
            pickupDate: document.getElementById('date-end').value,
            pickupTime: document.getElementById('time-end').value,
            deliveryPerson: document.getElementById('c-delivery').value,
            returnPerson: document.getElementById('c-return').value,
        },
        financials: {
            subTotal: document.getElementById('subtotal-display').innerText,
            total: document.getElementById('total-display').innerText,
            delivery: document.getElementById('del-fee').value,
            deposit: document.getElementById('deposit').value,
            securityDeposit: document.getElementById('security-deposit').value,
            vatRate: document.getElementById('vat-rate').value
        },
        items: [],
        expenses: [],
        // Restore preserved fields if editing
        paymentProofs: editingState ? editingState.paymentProofs : [],
        paymentStatus: editingState ? editingState.paymentStatus : {},
        isConfirmed: editingState ? editingState.isConfirmed : false
    };

    // Parse Expenses from UI
    document.querySelectorAll('.expense-row').forEach(row => {
        const name = row.querySelector('.exp-name').value.trim();
        const amount = parseFloat(row.querySelector('.exp-amount').value);
        if (name && !isNaN(amount)) {
            let existingExp = null;
            if (editingState && editingState.expenses) {
                existingExp = editingState.expenses.find(e => (e.name === name || e.supplier === name || e.desc === name) && (e.amount === amount || e.total === amount));
            }
            orderData.expenses.push({ 
                name, 
                amount,
                date: existingExp ? existingExp.date : new Date().toISOString(),
                attachment: existingExp ? existingExp.attachment : null
            });
        }
    });

    // 3. Process Items
    getItems().forEach(item => {
        const c = cart[item.id];
        if (!c) return;

        // المنتج المميّز: طاولات خشب (تسعير شرائح + باقة تنسيق)
        if (item.isTieredTables) {
            const tn = parseInt(c.qty) || 0;
            if (tn <= 0) return;
            const pkg = c.styling || 'none';
            const pr = window.getTablesPricing(pkg, tn);
            const ppl = (c.people != null && c.people !== '') ? (parseInt(c.people) || 0) : pr.capacity;
            const adj = (ppl - pr.capacity) * TABLE_CHAIR_PRICE;
            const finalAdj = pr.final + adj;
            const origAdj = pr.original + adj;
            const parts = [`${tn} طاولة`, `${ppl} شخص`];
            if (pkg === 'none') parts.push('بدون تنسيق');
            else if (pkg === 'premade') parts.push(`تنسيق جاهز${c.color ? ': ' + c.color : ''}`);
            else if (pkg === 'custom') parts.push(`تنسيق مخصص${c.customDesc ? ': ' + c.customDesc : ''}`);
            if (ppl !== pr.capacity) parts.push(`تعديل أشخاص ${adj >= 0 ? '+' : ''}${adj} ر.س`);
            if (pr.savings > 0) parts.push(`خصم ${pr.discount}% (وفّر ${pr.savings})`);
            orderData.items.push({
                name: item.name,
                desc: parts.join(' | '),
                decorDetails: pkg === 'custom' ? (c.customDesc || '') : (pkg === 'premade' ? ('تنسيق جاهز: ' + (c.color || '')) : ''),
                qty: tn,
                chairsCount: ppl,
                total: finalAdj.toFixed(2),
                totalOriginal: origAdj.toFixed(2),
                unitPrice: tn > 0 ? +(finalAdj / tn).toFixed(2) : finalAdj,
                originalPrice: window.TABLES_PRICING.none[1],
                tablesMeta: { tables: tn, styling: pkg, color: c.color || '', customDesc: c.customDesc || '', people: ppl }
            });
            return;
        }

        const qty = parseInt(c.qty) || 0;
        if (qty > 0) {
            const unitPrice = (c.customPrice !== undefined && c.customPrice !== '') ? parseFloat(c.customPrice) : item.price;
            let total = qty * unitPrice;
            let desc = [];
            let decorDetails = "";
            let chairsCount = 0;

            if (item.desc) desc.push(item.desc);

            const hasExtras = item.type.includes('باقة') || item.decorFee > 0 || (item.capacity && item.capacity > 0);

            if (hasExtras) {
                if (c.decor) {
                    const dFee = c.customDecor ? parseFloat(c.customDecor) : (item.decorFee || 0);
                    total += qty * dFee;
                    if (dFee > 0) desc.push(`شامل تنسيق`);
                    if (item.decorComponents && item.decorComponents.length > 0) {
                        decorDetails = item.decorComponents.map(comp => `${comp.qty}x ${comp.name}`).join('، ');
                    }
                } else {
                    if (item.decorFee > 0) desc.push(`بدون تنسيق`);
                }

                if (item.capacity && item.capacity > 0) {
                    const cap = (item.capacity || 0) * qty;
                    const req = parseInt(c.chairs);
                    chairsCount = isNaN(req) ? cap : req;
                    if (chairsCount !== cap) desc.push(`تعديل كراسي`);
                    const diff = chairsCount - cap;
                    if (chairsCount === 0) total -= cap * CHAIR_PRICE;
                    else if (diff !== 0) total += diff * CHAIR_PRICE;
                } else {
                    chairsCount = 0;
                }
            }
            // Calculate Original Total (Before Discount)
            let extras = total - (qty * unitPrice);
            let totalOriginal = (qty * item.price) + extras;

            orderData.items.push({
                name: item.name,
                desc: desc.join(' | '),
                decorDetails: decorDetails,
                qty: qty,
                chairsCount: chairsCount,
                total: total.toFixed(2),
                totalOriginal: totalOriginal.toFixed(2), // Store original total for discount display
                unitPrice: unitPrice,
                originalPrice: item.price
            });
        }
    });

    if (orderData.items.length === 0) {
        showToast('السلة فارغة! أضف منتجات أولاً', 'error');
        return;
    }

    // 4. Save to LocalStorage
    let ordersDB = window.SaddahDB.data.orders;

    if (editingState) {
        // UPDATE ID
        const idx = ordersDB.findIndex(o => o.id === editingState.originalId);
        if (idx !== -1) {
            ordersDB[idx] = orderData;
            showToast('تم تحديث الطلب بنجاح', 'success');
        } else {
            ordersDB.push(orderData); // Fallback
            showToast('تم حفظ الطلب الجديد', 'success');
        }
    } else {
        // NEW
        ordersDB.push(orderData);
        showToast('تم اضافة الطلب بنجاح', 'success');
        
        // Auto-create base folders for the new order
        if (typeof window.createInitialOrderFoldersAPI === 'function') {
            window.createInitialOrderFoldersAPI(orderData);
        }
    }

    window.SaddahDB.save();
    localStorage.setItem('current_order', JSON.stringify(orderData));

    // 5. Success UI
    document.getElementById('print-buttons').classList.remove('opacity-50', 'pointer-events-none');

    // Clear editing state after save
    editingState = null;
    localStorage.removeItem('sadda_edit_session');

    // 6. Save to Cloud File System (Hostinger)
    if (typeof saveDocumentToOrderFS === 'function') {
        try {
            // First, get the path where the folder will be created
            const basePath = await findOrderPathAPI(orderData);
            
            // Create main order folder
            await callFS({ action: 'mkdir', path: basePath });
            
            // Create subfolders - ONLY 4 FOLDERS
            await callFS({ action: 'mkdir', path: `${basePath}/الدفعات` });
            await callFS({ action: 'mkdir', path: `${basePath}/المصروفات` });
            await callFS({ action: 'mkdir', path: `${basePath}/صافي الربح` });
            await callFS({ action: 'mkdir', path: `${basePath}/المرتجعات` });
            
            // Save JSON and TXT
            await saveDocumentToOrderFS(orderData, null, null, null);
            
            // Render HTML Contract
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = 'contract_print.html';
            
            const messageListener = async (event) => {
                if (event.data && event.data.type === 'CONTRACT_RENDERED') {
                    window.removeEventListener('message', messageListener);
                    
                    let staticHTML = event.data.html;
                    staticHTML = staticHTML.replace(/<script src="js\/contract_print\.js"><\/script>/, '');
                    
                    await callFS({ action: 'save_text', path: `${basePath}/الطلب.html`, content: '<!DOCTYPE html>\n' + staticHTML });
                    
                    document.body.removeChild(iframe);
                    showToast('تم إنشاء المجلد السحابي وحفظ العقد بنجاح!', 'success');
                }
            };
            
            window.addEventListener('message', messageListener);
            document.body.appendChild(iframe);
            
        } catch (err) {
            console.error('Cloud File System Access Error:', err);
            showToast('تم حفظ الطلب، ولكن فشل الرفع للسحابة: ' + err.message, 'error');
        }
    } else {
        showToast('مدير الملفات السحابي غير متصل', 'error');
    }
}

function generateReportText(orderData) {
    const totalOrder = parseFloat(orderData.financials.total.replace(' ريال', '')) || 0;
    
    let expensesText = '';
    let totalExpenses = 0;
    
    if (orderData.expenses && orderData.expenses.length > 0) {
        orderData.expenses.forEach(exp => {
            expensesText += `${exp.name}: ${exp.amount} ريال سعودي\n`;
            totalExpenses += exp.amount;
        });
    } else {
        expensesText = 'لا توجد مصروفات مسجلة\n';
    }
    
    const netProfit = totalOrder - totalExpenses;
    const operatingExpenses = netProfit * 0.10;
    const remainingProfit = netProfit - operatingExpenses;
    const groupShare = remainingProfit * 0.30;
    const personShare = groupShare / 2;
    
    const itemsText = orderData.items.map(item => `الوصف: ${item.name} | ${item.desc}`).join('\n');

    return `تقرير إيرادات ومصروفات الطلب

العميل: ${orderData.client.name}

التاريخ: ${orderData.date}

مسؤول التوصيل: ${orderData.client.deliveryPerson || 'غير محدد'}

مسؤول الإرجاع: ${orderData.client.returnPerson || 'غير محدد'}
-----------------------

تفاصيل الطلب:

${itemsText}

إجمالي قيمة الطلب (شامل الضريبة): ${totalOrder.toFixed(2)} ريال سعودي

------------------------------
المصروفات:

${expensesText}
إجمالي المصروفات: ${totalExpenses.toFixed(2)} ريال سعودي
------------------
الملخص المالي:

إجمالي الربح الصافي: ${netProfit.toFixed(2)} ريال سعودي

------------------------
تقسيم الربح 

مصاريف تشغيل : ${operatingExpenses.toFixed(2)} ريال

لكل مجموعة : ${groupShare.toFixed(2)} ريال 
نصيب كل شخص : ${personShare.toFixed(2)} ريال
`;
}

// --- FILE SYSTEM ACCESS HELPERS ---
function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('SaddahStore', 1);
        request.onupgradeneeded = (e) => { e.target.result.createObjectStore('keyval'); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getSavedDirHandle() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('keyval', 'readonly');
        const store = transaction.objectStore('keyval');
        const request = store.get('saddah-save-dir');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveDirHandle(handle) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('keyval', 'readwrite');
        const store = transaction.objectStore('keyval');
        const request = store.put(handle, 'saddah-save-dir');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function selectSaveDirectory() {
    try {
        const dirHandle = await window.showDirectoryPicker({ id: 'saddah-log-dir', mode: 'readwrite' });
        await saveDirHandle(dirHandle);
        showToast('تم تحديد مسار الحفظ بنجاح', 'success');
        document.getElementById('save-dir-status').innerText = dirHandle.name;
    } catch(err) {
        console.error(err);
        showToast('فشل تحديد المجلد: ' + err.message, 'error');
    }
}

async function checkSaveDirOnLoad() {
    try {
        const dirHandle = await getSavedDirHandle();
        if (dirHandle) {
            document.getElementById('save-dir-status').innerText = dirHandle.name;
        }
    } catch(err) {
        console.error(err);
    }
}

// Call on load
document.addEventListener('DOMContentLoaded', checkSaveDirOnLoad);

// --- ACTIONS: PRINT & WHATSAPP ---
function openPrint(type) {
    if (type === 'contract') window.open('contract_print.html', '_blank');
    else if (type === 'quotation') window.open('quotation_print.html', '_blank');
    else window.open('invoice_print.html', '_blank');
}

function sendWhatsApp(type) {
    const data = JSON.parse(localStorage.getItem('current_order'));
    if (!data || !data.client.phone) {
        showToast('يجب حفظ الطلب أولاً', 'error');
        return;
    }

    let phone = data.client.phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('05')) phone = '966' + phone.substring(1);

    let message = '';
    const total = data.financials.total;
    const clientName = data.client.name;

    if (type === 'contract') {
        let discountMsg = '';
        let totalDiscount = 0;

        if (data.items) {
            data.items.forEach(item => {
                const tOriginal = item.totalOriginal ? parseFloat(item.totalOriginal) : parseFloat(item.total);
                const tCurrent = parseFloat(item.total);
                if (tOriginal > tCurrent) {
                    totalDiscount += (tOriginal - tCurrent);
                }
            });
        }

        if (totalDiscount > 0) {
            discountMsg = `\n\n*تمت إضافة خصم خاص بقيمة: ${totalDiscount.toFixed(2)} ريال*`;
        }

        message = `أهلاً بك ${clientName}،
يسعدنا خدمتكم في صده لتأجير الأثاث.

تم إصدار العقد الخاص بمناسبتكم بقيمة إجمالية: *${total}*${discountMsg}

يمكنكم الاطلاع على التفاصيل وتأكيد الحجز.
*الرجاء توقيع العقد عند اسمك في أسفل الصفحة*`;
    } else if (type === 'quotation') {
        message = `أهلاً بك ${clientName}،\nبناءً على طلبكم، إليكم عرض السعر المبدئي من صده بقيمة: *${total}*\n\nنأمل أن ينال رضاكم.`;
    } else if (type === 'invoice') {
        message = `أهلاً بك ${clientName}،\nفاتورة ضريبية رقم #${data.id.toString().slice(-4)}\nالمبلغ المستحق: *${total}*\n\nشكراً لتعاملكم معنا.`;
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

// --- WHATSAPP TEMPLATES FEATURE ---
function openTemplateModal() {
    document.getElementById('template-modal').classList.remove('hidden');
}

function closeTemplateModal() {
    document.getElementById('template-modal').classList.add('hidden');
}

function sendTemplate(type) {
    const phoneInput = document.getElementById('c-phone').value;
    if (!phoneInput) {
        closeTemplateModal();
        validateInput('c-phone');
        showToast('أدخل رقم الجوال أولاً', 'error');
        return;
    }

    let phone = phoneInput.replace(/[^0-9]/g, '');
    if (phone.startsWith('05')) phone = '966' + phone.substring(1);

    let message = '';
    if (type === 'request') {
        message = `مرحباً بك في صده لتأجير الأثاث 🛋️

يسعدنا خدمتكم في مناسبتكم القادمة. لاستكمال إجراءات الحجز وإصدار العقد الإلكتروني، نأمل تزويدنا بالبيانات التالية:

👤 *بيانات العميل:*
• الاسم الثلاثي / الجهة:
• رقم الهوية / السجل التجاري:
• العنوان (الحي/المدينة):

🎉 *تفاصيل الحجز:*
• نوع المناسبة:
• تاريخ وتوقيت الاستلام (من طرفنا):
• تاريخ وتوقيت الإرجاع:

📝 *سياسات الحجز والدفع:*
1️⃣ *تأكيد الحجز:* يتم اعتماد الحجز نهائياً بعد سداد العربون وتوقيع العقد.
2️⃣ *التأمين المسترد:* مبلغ يتم استرداده بالكامل فور انتهاء المناسبة واستلام الأثاث سليماً.
3️⃣ *آلية السداد:* يتم سداد كامل المبلغ المتبقي عند الوصول وقبل بدء التنزيل.

بانتظار تزويدنا بالبيانات أعلاه لخدمتكم بشكل أفضل.

فريق المبيعات - Saddah Event 🌹`;
    } else if (type === 'offers') {
        message = `أهلاً بك، تفضل بالاطلاع على عروضنا الحالية: [رابط العروض]`;
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    closeTemplateModal();
}

// --- RESTORE EDIT SESSION ---
function restoreEditSession(editSession) {
    let ordersDB = window.SaddahDB.data.orders;
    let order = ordersDB.find(o => o.id === editSession.originalId);

    if (!order) {
        showToast('خطأ: لم يتم العثور على بيانات الطلب', 'error');
        return;
    }

    // Set globally for save logic
    // We attach originalId explicitly for saveAndComplete
    editingState = order;
    editingState.originalId = order.id;

    if (order.client) {
        const type = order.client.type || 'individual';
        const radios = document.getElementsByName('client_type');
        for (let r of radios) {
            r.checked = (r.value === type);
            if (r.value === type) r.onchange();
        }
        toggleClientType();

        if (type === 'company') {
            document.getElementById('c-comp-name').value = order.client.name || '';
            document.getElementById('c-vat-id').value = order.client.id || '';
        } else {
            document.getElementById('c-name').value = order.client.name || '';
            document.getElementById('c-id').value = order.client.id || '';
        }

        document.getElementById('c-phone').value = order.client.phone || '';
        document.getElementById('c-address').value = order.client.address || '';
        if (order.client.deliveryDate) document.getElementById('date-start').value = order.client.deliveryDate;
        if (order.client.deliveryTime) document.getElementById('time-start').value = order.client.deliveryTime;
        if (order.client.pickupDate) document.getElementById('date-end').value = order.client.pickupDate;
        if (order.client.pickupTime) document.getElementById('time-end').value = order.client.pickupTime;
    }

    if (order.financials) {
        document.getElementById('del-fee').value = order.financials.delivery || 0;
        document.getElementById('vat-rate').value = order.financials.vatRate || 0;
        document.getElementById('deposit').value = order.financials.deposit || 0;
        document.getElementById('security-deposit').value = order.financials.securityDeposit || 0;
    }

    // Rebuild Cart from items
    if (order.items) {
        order.items.forEach(editItem => {
            const matchedItem = getItems().find(i => i.name === editItem.name);
            if (matchedItem) {
                cart[matchedItem.id] = {
                    qty: parseInt(editItem.qty) || 0,
                    chairs: parseInt(editItem.chairsCount) || 0,
                    decor: !!editItem.decorDetails,
                    customDecor: '',
                    customPrice: editItem.unitPrice
                };
            }
        });
    }

    // Populate Expenses if any
    document.getElementById('expenses-container').innerHTML = '';
    if (order.expenses && order.expenses.length > 0) {
        order.expenses.forEach(exp => addExpenseRow(exp.name || exp.desc, exp.amount || exp.total));
    }

    // Show cancel button
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    renderItems();
    calcTotal();
    showToast('تم استرجاع بيانات الطلب للتعديل', 'info');

    // Update Save Button Text
    const saveBtn = document.querySelector('button[onclick="saveAndComplete()"]');
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> تحديث وحفظ التعديلات';
        saveBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
        saveBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
    }
}

// --- CUSTOM ITEM LOGIC ---
function openCustomItemModal() {
    document.getElementById('custom-item-name').value = '';
    document.getElementById('custom-item-type').value = 'خدمة';
    document.getElementById('custom-item-desc').value = '';
    document.getElementById('custom-item-has-decor').checked = false;
    document.getElementById('custom-item-decor-fee').value = '0';
    document.getElementById('custom-item-capacity').value = '0';
    
    document.getElementById('custom-item-price').value = '';
    document.getElementById('custom-item-discount').value = '';
    document.getElementById('custom-item-final').value = '';
    document.getElementById('custom-item-vat-included').checked = false;
    
    toggleCustomItemFields();
    document.getElementById('custom-item-modal').classList.remove('hidden');
}

function toggleCustomItemFields() {
    const type = document.getElementById('custom-item-type').value;
    const hasDecor = document.getElementById('custom-item-has-decor').checked;
    
    if (type.includes('باقة') || type.includes('طاولة+كراسي')) {
        document.getElementById('custom-item-capacity-container').classList.remove('hidden');
    } else {
        document.getElementById('custom-item-capacity-container').classList.add('hidden');
    }

    if (hasDecor) {
        document.getElementById('custom-item-decor-container').classList.remove('hidden');
    } else {
        document.getElementById('custom-item-decor-container').classList.add('hidden');
    }
}

function closeCustomItemModal() {
    document.getElementById('custom-item-modal').classList.add('hidden');
}

function calcCustomPrices(source) {
    let price = parseFloat(document.getElementById('custom-item-price').value) || 0;
    let discount = parseFloat(document.getElementById('custom-item-discount').value) || 0;
    let final = parseFloat(document.getElementById('custom-item-final').value) || 0;

    if (source === 'price' || source === 'discount') {
        if (price > 0 && discount >= 0 && discount <= 100) {
            final = price - (price * (discount / 100));
            document.getElementById('custom-item-final').value = final.toFixed(2);
        }
    } else if (source === 'final') {
        if (price > 0) {
            discount = ((price - final) / price) * 100;
            document.getElementById('custom-item-discount').value = discount.toFixed(2);
        } else if (final > 0) {
            // If base price is 0, we can't calc discount %. Let's just set base price to final.
            document.getElementById('custom-item-price').value = final.toFixed(2);
            document.getElementById('custom-item-discount').value = 0;
        }
    }
}

function saveCustomItem() {
    const name = document.getElementById('custom-item-name').value.trim();
    const type = document.getElementById('custom-item-type').value;
    const desc = document.getElementById('custom-item-desc').value.trim();
    const hasDecor = document.getElementById('custom-item-has-decor').checked;
    const decorFee = parseFloat(document.getElementById('custom-item-decor-fee').value) || 0;
    const capacity = parseInt(document.getElementById('custom-item-capacity').value) || 0;

    let price = parseFloat(document.getElementById('custom-item-price').value) || 0;
    let final = parseFloat(document.getElementById('custom-item-final').value) || 0;
    const isVatIncluded = document.getElementById('custom-item-vat-included').checked;

    if (!name || final <= 0) {
        showToast('يرجى إدخال اسم الطلب والسعر النهائي', 'error');
        return;
    }

    if (price === 0) {
        price = final;
    }

    // Extract VAT if the user specified prices are tax-inclusive
    if (isVatIncluded) {
        price = price / 1.15;
        final = final / 1.15;
    }

    const newItem = {
        id: Date.now(),
        name: name,
        type: type,
        price: parseFloat(price.toFixed(2)),
        desc: desc || 'طلب مخصص',
        isExternal: false,
        stock: 999, // Infinite stock for custom orders
        capacity: type.includes('باقة') ? capacity : 0,
        decorFee: hasDecor ? decorFee : 0
    };

    // Save to inventory
    getItems().push(newItem);
    window.SaddahDB.save();

    // Update Filters to ensure it appears "all" or specific
    if (!getProductTypes().includes(type)) {
        getProductTypes().push(type);
        window.SaddahDB.save();
        initFilters();
    }

    // Add to cart
    cart[newItem.id] = { 
        qty: 1, 
        chairs: type.includes('باقة') ? capacity : 0, 
        decor: hasDecor, 
        customDecor: '', 
        customPrice: parseFloat(final.toFixed(2)) 
    };

    closeCustomItemModal();
    setSourceFilter('all'); // force refresh
    showToast('تمت إضافة الطلب للسلة بنجاح', 'success');
}

// --- CALENDAR HELPERS ---
const HIJRI_MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];

function openHijriModal(target) {
    document.getElementById('hijri-modal-target').value = target; 
    
    const daySelect = document.getElementById('hijri-day');
    daySelect.innerHTML = '';
    for(let i=1; i<=30; i++) {
        const val = i.toString().padStart(2, '0');
        daySelect.innerHTML += `<option value="${val}">${val}</option>`;
    }

    const monthSelect = document.getElementById('hijri-month');
    monthSelect.innerHTML = '';
    HIJRI_MONTHS.forEach((m, idx) => {
        const val = (idx + 1).toString().padStart(2, '0');
        monthSelect.innerHTML += `<option value="${val}">${m}</option>`;
    });

    const yearSelect = document.getElementById('hijri-year');
    yearSelect.innerHTML = '';
    
    let currentHijriYear = 1445;
    let isHijriLoaded = typeof moment !== 'undefined' && moment().format('iYYYY') !== 'iYYYY';
    
    if (isHijriLoaded) {
        let parsedYear = parseInt(moment().format('iYYYY'));
        if (!isNaN(parsedYear)) {
            currentHijriYear = parsedYear;
        }
    } 

    for(let i = currentHijriYear - 3; i <= currentHijriYear + 5; i++) {
        yearSelect.innerHTML += `<option value="${i}">${i}</option>`;
    }

    if (isHijriLoaded) {
        const todayH = moment();
        daySelect.value = todayH.format('iDD');
        monthSelect.value = todayH.format('iMM');
        yearSelect.value = todayH.format('iYYYY');
    }

    document.getElementById('hijri-modal').classList.remove('hidden');
}

function closeHijriModal() {
    document.getElementById('hijri-modal').classList.add('hidden');
}

function confirmHijriDate() {
    const target = document.getElementById('hijri-modal-target').value;
    const d = document.getElementById('hijri-day').value;
    const m = document.getElementById('hijri-month').value;
    const y = document.getElementById('hijri-year').value;
    
    const hijriString = `${y}/${m}/${d}`;
    const input = document.getElementById(`hijri-${target}`);
    if(input) {
        input.value = hijriString;
        convertHijriToGregorian(target);
    }
    closeHijriModal();
}

function toggleCalendarType() {
    const typeObj = document.querySelector('input[name="calendar_type"]:checked');
    if (!typeObj) return;
    const type = typeObj.value;
    const startG = document.getElementById('date-start');
    const startH = document.getElementById('hijri-start');
    const endG = document.getElementById('date-end');
    const endH = document.getElementById('hijri-end');
    const hint = document.getElementById('hijri-hint');

    if (!startG || !startH || !endG || !endH || !hint) return;

    if (type === 'hijri') {
        startG.classList.add('hidden');
        startH.classList.remove('hidden');
        startH.value = ''; 
        
        endG.classList.add('hidden');
        endH.classList.remove('hidden');
        endH.value = '';

        hint.classList.remove('hidden');
    } else {
        startG.classList.remove('hidden');
        startH.classList.add('hidden');
        
        endG.classList.remove('hidden');
        endH.classList.add('hidden');

        hint.classList.add('hidden');
    }
}

function convertHijriToGregorian(field) {
    const input = document.getElementById(`hijri-${field}`);
    const val = input.value.trim();
    if (!val) return;

    if (typeof moment === 'undefined') {
        showToast('مكتبة تحويل التاريخ غير متوفرة', 'error');
        return;
    }

    const formats = ['iYYYY/iMM/iDD', 'iYYYY-iMM-iDD', 'iYYYY/iM/iD', 'iYYYY-iM-iD'];
    let m = moment(val, formats, true);
    if (!m.isValid()) m = moment(val, formats, false);

    if (m.isValid()) {
        const gregorianDate = m.format('YYYY-MM-DD');
        const gInput = document.getElementById(`date-${field}`);
        if(gInput) gInput.value = gregorianDate;
        
        showToast(`تم تحويل التاريخ إلى الميلادي: ${gregorianDate}`, 'success');
    } else {
        showToast('صيغة التاريخ الهجري غير صحيحة، يرجى كتابته هكذا: 1445/01/01', 'error');
        input.value = '';
    }
}

// ─── تشغيل التهيئة بعد تحميل كل التعريفات في الملف ───
initCalculator();
