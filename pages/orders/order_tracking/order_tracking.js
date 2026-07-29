function actionReportDetails(btn) { return OrderActions.Report.update(btn); }
function confirmAudit(btn) { return OrderActions.Inventory.confirm(btn); }
function viewOrderContract() { return OrderActions.Contract.open(); }
function cancelOrderFromTracking(btn) { return OrderActions.Cancel.cancel(btn); }
function viewOrderInvoice() { return OrderActions.Invoice.open(); }
function viewOrderFolder() { return OrderActions.Folder.open(); }
function editPaymentFromOrder(idx) { return OrderActions.Payments.edit(idx); }
function deletePaymentFromOrder(idx, btn) { return OrderActions.Payments.delete(idx, btn); }
async function savePaymentToOrder(btn) { return OrderActions.Payments.save(btn); }
function actionAddPayment() { return OrderActions.Payments.openModal(); }
function closePaymentsModal() { return OrderActions.Payments.closeModal(); }
function cancelPaymentEdit() { return OrderActions.Payments.cancelEdit(); }
function actionAddExtra() { return OrderActions.ExtraCosts.openModal(); }
function closeExtraModal() { return OrderActions.ExtraCosts.closeModal(); }
async function saveExtraToOrder(btn) { return OrderActions.ExtraCosts.save(btn); }
// Script loaded dynamically after SaddahDB.init()
let currentOrders = [];
let activeOrderId = null;
let editingExpenseIndex = null; // فهرس المصروف الجاري تعديله (null = إضافة جديدة)
let editingPaymentIndex = null; // فهرس إثبات الدفع الجاري تعديله (null = إضافة جديدة)
let _savingInProgress = false; // منع الضغط المزدوج على أزرار الحفظ
// حماية من XSS: تحويل الأحرف الخاصة في HTML
function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
}
function fmtDateOnly(d) {
    if (!d) return 'غير محدد';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    try {
        const obj = new Date(d);
        if (isNaN(obj.getTime())) return typeof d === 'string' ? d.substring(0, 10) : String(d);
        return `${obj.getFullYear()}-${String(obj.getMonth()+1).padStart(2,'0')}-${String(obj.getDate()).padStart(2,'0')}`;
    } catch(e) { return String(d); }
}
function loadAndRenderOrders() {
    // Use SaddahDB reference directly so mutations are automatically reflected when save() is called.
    // JSON.parse(localStorage) creates disconnected copies — changes to them would never be persisted.
    currentOrders = (window.SaddahDB && window.SaddahDB.data.orders) || [];
    if (!currentOrders || currentOrders.length === 0) {
        document.getElementById('empty-state').classList.remove('hidden');
        document.getElementById('closest-order-section').classList.add('hidden');
        document.getElementById('upcoming-section').classList.add('hidden');
        document.getElementById('past-section').classList.add('hidden');
        return;
    }
    document.getElementById('empty-state').classList.add('hidden');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const processedOrders = currentOrders.map(order => {
        let dDate = new Date();
        if (order.delivery && order.delivery.date) {
            dDate = new Date(order.delivery.date);
        } else if (order.client && order.client.deliveryDate) {
            dDate = new Date(order.client.deliveryDate);
        } else if (order.date) {
            const parts = String(order.date).split('-');
            if (parts.length === 3) dDate = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
        }
        // حماية من تاريخ غير صالح
        if (isNaN(dDate.getTime())) dDate = new Date();
        dDate.setHours(0, 0, 0, 0);
        const diffTime = dDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return {
            ...order,
            parsedDate: dDate,
            daysLeft: diffDays
        };
    });
    const upcoming = processedOrders.filter(o => o.daysLeft >= 0).sort((a, b) => a.parsedDate - b.parsedDate);
    const past = processedOrders.filter(o => o.daysLeft < 0).sort((a, b) => b.parsedDate - a.parsedDate);
    if (upcoming.length > 0) {
        const closest = upcoming[0];
        renderHero(closest);
        const restUpcoming = upcoming.slice(1);
        if (restUpcoming.length > 0) {
            document.getElementById('upcoming-section').classList.remove('hidden');
            document.getElementById('upcoming-count').innerText = `${restUpcoming.length} طلبات`;
            renderGrid(restUpcoming, 'upcoming-grid');
        } else {
            document.getElementById('upcoming-section').classList.add('hidden');
        }
    } else {
        document.getElementById('closest-order-section').classList.add('hidden');
        document.getElementById('upcoming-section').classList.add('hidden');
    }
    if (past.length > 0) {
        document.getElementById('past-section').classList.remove('hidden');
        document.getElementById('past-count').innerText = `${past.length} طلبات`;
        renderGridByMonth(past, 'past-grid');
    } else {
        document.getElementById('past-section').classList.add('hidden');
    }
}
// شارة "تم الجرد" للطلبات المجرودة (مجرود وجاهز)
function auditedBadge(order) {
    if (order && order.status === 'تم الجرد') {
        return `<span class="bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-md font-bold border border-emerald-200 inline-flex items-center gap-1"><i class="fa-solid fa-clipboard-check"></i> تم الجرد</span>`;
    }
    return '';
}
function renderHero(order) {
    document.getElementById('closest-order-section').classList.remove('hidden');
    document.getElementById('hero-client').innerText = order.client?.name || 'غير محدد';
    // شارة الحالة في البطاقة الأقرب: "تم الجرد" (أخضر) أو "قيد الانتظار" (أحمر نابض)
    const heroStatus = document.getElementById('hero-status-badge');
    if (heroStatus) {
        if (order.status === 'تم الجرد') {
            heroStatus.className = 'inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-black border border-emerald-200';
            heroStatus.innerHTML = '<i class="fa-solid fa-clipboard-check"></i> تم الجرد — جاهز';
        } else {
            heroStatus.className = 'inline-flex items-center gap-2 bg-red-50 text-red-600 px-3 py-1 rounded-full text-xs font-black border border-red-100';
            heroStatus.innerHTML = `
                <span class="relative flex h-2 w-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                قيد الانتظار`;
        }
    }
    document.getElementById('hero-delivery').innerText = `${order.client?.deliveryDate || order.date || '-'} | ${order.client?.deliveryTime || '-'}`;
    document.getElementById('hero-return').innerText = `${order.client?.pickupDate || '-'} | ${order.client?.pickupTime || '-'}`;
    
    const heroDeposit = parseFloat(order.financials?.deposit) || 0;
    const heroTotal = parseFloat(order.financials?.total) || 0;
    const heroRemaining = heroTotal - heroDeposit;
    const heroSecurity = parseFloat(order.financials?.securityDeposit) || 0;

    document.getElementById('hero-financials').innerHTML = `
        <span class="text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-100 px-2 py-1 rounded-md">العربون: ${heroDeposit} ر.س</span>
        <span class="text-[11px] font-bold bg-red-50 text-red-700 border border-red-100 px-2 py-1 rounded-md">المتبقي: ${heroRemaining} ر.س</span>
        <span class="text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded-md">التأمين: ${heroSecurity} ر.س</span>
    `;
    const heroItems = order.cart || order.items || [];
    let heroItemsHtml = '<span class="text-xs text-slate-400">لا توجد تفاصيل</span>';
    if (heroItems.length > 0) {
        const renderBadge = (item) => {
            let detailsHtml = '';
            if (item.chairsCount && item.chairsCount > 0) detailsHtml += `<span class="text-[9px] bg-emerald-50 border border-emerald-100 text-emerald-600 px-1 rounded-sm w-fit">${item.chairsCount} كراسي</span>`;
            if (item.desc) detailsHtml += `<span class="text-[9px] text-slate-500 block max-w-[120px] truncate" title="${esc(item.desc)}">${esc(item.desc)}</span>`;
            if (item.decorDetails) detailsHtml += `<span class="text-[9px] text-pink-500 block max-w-[120px] truncate" title="${esc(item.decorDetails)}">${esc(item.decorDetails)}</span>`;
            return `<div class="flex flex-col gap-1 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg shadow-sm w-fit"><div class="flex items-center gap-1.5 whitespace-nowrap"><span class="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-bold">${item.qty}</span><span class="text-[11px] font-bold text-slate-600">${esc(item.name)}</span></div>${detailsHtml ? `<div class="flex flex-col gap-0.5 mt-0.5">${detailsHtml}</div>` : ''}</div>`;
        };
        if (heroItems.length <= 4) {
            heroItemsHtml = `<div class="flex flex-wrap gap-1.5">${heroItems.map(renderBadge).join('')}</div>`;
        } else {
            const visible = heroItems.slice(0, 4).map(renderBadge).join('');
            const hidden = heroItems.slice(4).map(renderBadge).join('');
            heroItemsHtml = `<div class="flex flex-wrap gap-1.5">${visible}</div><div class="hidden flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-200 w-full transition-all duration-300">${hidden}</div><button onclick="this.previousElementSibling.classList.toggle('hidden'); this.querySelector('i').classList.toggle('fa-chevron-down'); this.querySelector('i').classList.toggle('fa-chevron-up');" class="mt-2 text-xs font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-100 px-3 py-1.5 rounded-lg w-full flex items-center justify-center gap-1 transition shadow-sm"><span>قائمة المنتجات (+${heroItems.length - 4})</span><i class="fa-solid fa-chevron-down text-[10px]"></i></button>`;
        }
    }
    const heroDescEl = document.getElementById('hero-desc');
    heroDescEl.className = "bg-slate-50/80 p-3 rounded-xl border border-slate-100 mb-4 w-full md:max-w-2xl";
    heroDescEl.innerHTML = heroItemsHtml;
    let daysText = 'اليوم';
    if (order.daysLeft === 1) daysText = 'غداً';
    else if (order.daysLeft > 1) daysText = `بعد ${order.daysLeft} أيام`;
    document.getElementById('hero-days').innerText = daysText;
    const btn = document.getElementById('hero-details-btn');
    btn.onclick = () => openDetailsModal(order.id);
}
function renderGrid(ordersList, containerId, isPast = false) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    ordersList.forEach(order => {
        let daysBadge = '';
        if (isPast) {
            daysBadge = `<span class="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded-md font-bold">منذ ${Math.abs(order.daysLeft)} أيام</span>`;
        } else {
            if (order.daysLeft === 1) daysBadge = `<span class="bg-orange-100 text-orange-600 text-xs px-2 py-1 rounded-md font-bold">غداً</span>`;
            else daysBadge = `<span class="bg-blue-100 text-blue-600 text-xs px-2 py-1 rounded-md font-bold">بعد ${order.daysLeft} أيام</span>`;
        }
        const itemsList = order.cart || order.items || [];
        let itemsHtml = '<span class="text-xs text-slate-400">لا توجد تفاصيل</span>';
        if (itemsList.length > 0) {
            const renderBadge = (item) => {
                let detailsHtml = '';
                if (item.chairsCount && item.chairsCount > 0) detailsHtml += `<span class="text-[9px] bg-emerald-50 border border-emerald-100 text-emerald-600 px-1 rounded-sm w-fit">${item.chairsCount} كراسي</span>`;
                if (item.desc) detailsHtml += `<span class="text-[9px] text-slate-500 block max-w-[120px] truncate" title="${esc(item.desc)}">${esc(item.desc)}</span>`;
                if (item.decorDetails) detailsHtml += `<span class="text-[9px] text-pink-500 block max-w-[120px] truncate" title="${esc(item.decorDetails)}">${esc(item.decorDetails)}</span>`;
                return `<div class="flex flex-col gap-0.5 bg-white border border-slate-200 px-2 py-1 rounded-md shadow-sm w-fit"><div class="flex items-center gap-1 whitespace-nowrap"><span class="bg-emerald-50 text-emerald-600 px-1 rounded border border-emerald-100 font-bold">${item.qty}</span><span class="text-[10px] font-bold text-slate-600">${esc(item.name)}</span></div>${detailsHtml ? `<div class="flex flex-col gap-0.5 mt-0.5">${detailsHtml}</div>` : ''}</div>`;
            };
            if (itemsList.length <= 4) {
                itemsHtml = `<div class="flex flex-wrap gap-1.5">${itemsList.map(renderBadge).join('')}</div>`;
            } else {
                const visible = itemsList.slice(0, 4).map(renderBadge).join('');
                const hidden = itemsList.slice(4).map(renderBadge).join('');
                itemsHtml = `<div class="flex flex-wrap gap-1.5">${visible}</div><div class="hidden flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-200 w-full transition-all duration-300">${hidden}</div><button onclick="this.previousElementSibling.classList.toggle('hidden'); this.querySelector('i').classList.toggle('fa-chevron-down'); this.querySelector('i').classList.toggle('fa-chevron-up');" class="mt-2 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-100 px-2 py-1 rounded-md w-full flex items-center justify-center gap-1 transition shadow-sm"><span>قائمة المنتجات (+${itemsList.length - 4})</span><i class="fa-solid fa-chevron-down text-[9px]"></i></button>`;
            }
        }
        const auditedRing = order.status === 'تم الجرد' ? 'ring-2 ring-emerald-300' : '';
        const card = `
            <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between ${auditedRing}">
                <div>
                    <div class="flex justify-between items-start mb-3 gap-2">
                        <h3 class="font-black text-slate-800 text-lg">${esc(order.client?.name) || 'غير محدد'}</h3>
                        <div class="flex flex-col items-end gap-1 shrink-0">${auditedBadge(order)}${daysBadge}</div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mb-3">
                        <div class="bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                            <div class="text-[10px] text-emerald-600 font-bold mb-1"><i class="fa-solid fa-truck-fast"></i> التوصيل</div>
                            <div class="text-xs text-slate-700 font-bold whitespace-nowrap">${esc(order.client?.deliveryDate || order.date || '-')}</div>
                            <div class="text-xs text-slate-500 whitespace-nowrap"><i class="fa-regular fa-clock"></i> ${esc(order.client?.deliveryTime || '-')}</div>
                        </div>
                        <div class="bg-orange-50 p-2 rounded-lg border border-orange-100">
                            <div class="text-[10px] text-orange-600 font-bold mb-1"><i class="fa-solid fa-box-open"></i> الإرجاع</div>
                            <div class="text-xs text-slate-700 font-bold whitespace-nowrap">${esc(order.client?.pickupDate || '-')}</div>
                            <div class="text-xs text-slate-500 whitespace-nowrap"><i class="fa-regular fa-clock"></i> ${esc(order.client?.pickupTime || '-')}</div>
                        </div>
                    </div>

                    <div class="flex flex-wrap gap-1.5 mb-3">
                        <span class="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 px-2 py-1 rounded-md">العربون: ${parseFloat(order.financials?.deposit) || 0} ر.س</span>
                        <span class="text-[10px] font-bold bg-red-50 text-red-700 border border-red-100 px-2 py-1 rounded-md">المتبقي: ${(parseFloat(order.financials?.total) || 0) - (parseFloat(order.financials?.deposit) || 0)} ر.س</span>
                        <span class="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded-md">التأمين: ${parseFloat(order.financials?.securityDeposit) || 0} ر.س</span>
                    </div>
                    <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-100 mb-4">${itemsHtml}</div>
                </div>
                <button onclick="openDetailsModal('${order.id}')" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl transition text-sm flex items-center justify-center gap-2">
                    <i class="fa-solid fa-ellipsis"></i> تفاصيل
                </button>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', card);
    });
}
// ─── تقسيم الطلبات السابقة حسب الشهر ────────────────────────────────────────
function renderGridByMonth(ordersList, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                       'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    function getMonthKey(order) {
        // أولاً: تاريخ التسليم
        const d = order.delivery?.date || order.client?.deliveryDate;
        if (d && /^\d{4}-\d{2}/.test(d)) return d.substring(0, 7);
        // ثانياً: تاريخ الطلب
        if (order.date && /^\d{4}-\d{2}/.test(String(order.date))) return String(order.date).substring(0, 7);
        // أخيراً: من الـ ID إذا كان timestamp
        const dt = new Date(order.id);
        if (!isNaN(dt.getTime())) return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
        // Fallback: الشهر الحالي
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    }
    // تجميع حسب الشهر
    const monthMap = new Map();
    ordersList.forEach(o => {
        const key = getMonthKey(o);
        if (!monthMap.has(key)) monthMap.set(key, []);
        monthMap.get(key).push(o);
    });
    // أحدث شهر أولاً
    const sortedMonths = Array.from(monthMap.keys()).sort().reverse();
    sortedMonths.forEach(monthKey => {
        const [yr, mn] = monthKey.split('-');
        const monthNum  = parseInt(mn);
        const monthName = MONTHS_AR[monthNum - 1] + ` (${monthNum}) ` + yr;
        const monthOrders = monthMap.get(monthKey);
        // رأس الشهر
        const header = document.createElement('div');
        header.innerHTML = `
            <div class="flex items-center gap-3 mb-3">
                <div class="h-px flex-1 bg-slate-200"></div>
                <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-700 text-white text-xs font-bold shrink-0">
                    <i class="fa-regular fa-calendar-days"></i>
                    ${monthName}
                    <span class="bg-white/20 rounded-full px-2 py-0.5 text-[10px]">${monthOrders.length} طلب</span>
                </div>
                <div class="h-px flex-1 bg-slate-200"></div>
            </div>`;
        container.appendChild(header);
        // شبكة الكروت لهذا الشهر
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
        monthOrders.forEach(order => {
            const daysBadge = `<span class="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded-md font-bold">منذ ${Math.abs(order.daysLeft)} أيام</span>`;
            const itemsList = order.cart || order.items || [];
            let itemsHtml = '<span class="text-xs text-slate-400">لا توجد تفاصيل</span>';
            if (itemsList.length > 0) {
                const renderBadge = (item) => {
                    let detailsHtml = '';
                    if (item.chairsCount && item.chairsCount > 0) detailsHtml += `<span class="text-[9px] bg-emerald-50 border border-emerald-100 text-emerald-600 px-1 rounded-sm w-fit">${item.chairsCount} كراسي</span>`;
                    if (item.desc) detailsHtml += `<span class="text-[9px] text-slate-500 block max-w-[120px] truncate" title="${esc(item.desc)}">${esc(item.desc)}</span>`;
                    if (item.decorDetails) detailsHtml += `<span class="text-[9px] text-pink-500 block max-w-[120px] truncate" title="${esc(item.decorDetails)}">${esc(item.decorDetails)}</span>`;
                    return `<div class="flex flex-col gap-0.5 bg-white border border-slate-200 px-2 py-1 rounded-md shadow-sm w-fit"><div class="flex items-center gap-1 whitespace-nowrap"><span class="bg-emerald-50 text-emerald-600 px-1 rounded border border-emerald-100 font-bold">${item.qty}</span><span class="text-[10px] font-bold text-slate-600">${esc(item.name)}</span></div>${detailsHtml ? `<div class="flex flex-col gap-0.5 mt-0.5">${detailsHtml}</div>` : ''}</div>`;
                };
                if (itemsList.length <= 4) {
                    itemsHtml = `<div class="flex flex-wrap gap-1.5">${itemsList.map(renderBadge).join('')}</div>`;
                } else {
                    const visible = itemsList.slice(0, 4).map(renderBadge).join('');
                    const hidden = itemsList.slice(4).map(renderBadge).join('');
                    itemsHtml = `<div class="flex flex-wrap gap-1.5">${visible}</div><div class="hidden flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-200 w-full transition-all duration-300">${hidden}</div><button onclick="this.previousElementSibling.classList.toggle('hidden'); this.querySelector('i').classList.toggle('fa-chevron-down'); this.querySelector('i').classList.toggle('fa-chevron-up');" class="mt-2 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-100 px-2 py-1 rounded-md w-full flex items-center justify-center gap-1 transition shadow-sm"><span>قائمة المنتجات (+${itemsList.length - 4})</span><i class="fa-solid fa-chevron-down text-[9px]"></i></button>`;
                }
            }
            const card = document.createElement('div');
            const auditedRing = order.status === 'تم الجرد' ? 'ring-2 ring-emerald-300' : '';
            card.className = 'bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between ' + auditedRing;
            card.innerHTML = `
                <div>
                    <div class="flex justify-between items-start mb-3 gap-2">
                        <h3 class="font-black text-slate-800 text-lg">${esc(order.client?.name) || 'غير محدد'}</h3>
                        <div class="flex flex-col items-end gap-1 shrink-0">${auditedBadge(order)}${daysBadge}</div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mb-3">
                        <div class="bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                            <div class="text-[10px] text-emerald-600 font-bold mb-1"><i class="fa-solid fa-truck-fast"></i> التوصيل</div>
                            <div class="text-xs text-slate-700 font-bold whitespace-nowrap">${esc(order.client?.deliveryDate || order.date || '-')}</div>
                            <div class="text-xs text-slate-500 whitespace-nowrap"><i class="fa-regular fa-clock"></i> ${esc(order.client?.deliveryTime || '-')}</div>
                        </div>
                        <div class="bg-orange-50 p-2 rounded-lg border border-orange-100">
                            <div class="text-[10px] text-orange-600 font-bold mb-1"><i class="fa-solid fa-box-open"></i> الإرجاع</div>
                            <div class="text-xs text-slate-700 font-bold whitespace-nowrap">${esc(order.client?.pickupDate || '-')}</div>
                            <div class="text-xs text-slate-500 whitespace-nowrap"><i class="fa-regular fa-clock"></i> ${esc(order.client?.pickupTime || '-')}</div>
                        </div>
                    </div>

                    <div class="flex flex-wrap gap-1.5 mb-3">
                        <span class="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 px-2 py-1 rounded-md">العربون: ${parseFloat(order.financials?.deposit) || 0} ر.س</span>
                        <span class="text-[10px] font-bold bg-red-50 text-red-700 border border-red-100 px-2 py-1 rounded-md">المتبقي: ${(parseFloat(order.financials?.total) || 0) - (parseFloat(order.financials?.deposit) || 0)} ر.س</span>
                        <span class="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded-md">التأمين: ${parseFloat(order.financials?.securityDeposit) || 0} ر.س</span>
                    </div>
                    <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-100 mb-4">${itemsHtml}</div>
                </div>
                <button onclick="openDetailsModal('${order.id}')" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl transition text-sm flex items-center justify-center gap-2">
                    <i class="fa-solid fa-ellipsis"></i> تفاصيل
                </button>`;
            grid.appendChild(card);
        });
        container.appendChild(grid);
    });
}
function openDetailsModal(orderId) {
    activeOrderId = Number(orderId) || orderId;
    const order = currentOrders.find(o => o.id == activeOrderId);
    if (!order) return;
    window.currentSelectedOrder = order;
    document.getElementById('modal-client-name').innerText = order.client?.name || 'غير محدد';
    const _deliv = order.client?.deliveryDate;
    const _created = order.date || order.createdAt;
    document.getElementById('modal-date').innerText = _deliv ? `التوصيل: ${fmtDateOnly(_deliv)}` : fmtDateOnly(_created);
    const _rawTotal = String(order.financials?.total || 0).replace(/\s*ريال\s*/g, '');
    document.getElementById('modal-total').innerText = `${_rawTotal} ريال`;
    // مبلغ العربون ومبلغ التأمين (من العقد)
    const depAmt = parseFloat(order.financials?.deposit) || 0;
    const secAmt = parseFloat(order.financials?.securityDeposit) || 0;
    const depEl = document.getElementById('modal-deposit');
    const secEl = document.getElementById('modal-security');
    if (depEl) depEl.innerText = `${depAmt} ريال`;
    if (secEl) secEl.innerText = `${secAmt} ريال`;
    // شارة "تم الجرد" في رأس النافذة + تعديل زر الجرد ليعكس الحالة
    const statusBadge = document.getElementById('modal-status-badge');
    if (statusBadge) {
        statusBadge.innerHTML = (order.status === 'تم الجرد') ? auditedBadge(order) : '';
    }
    const auditBtn = document.getElementById('modal-audit-btn');
    if (auditBtn) {
        if (order.status === 'تم الجرد') {
            auditBtn.innerHTML = '<i class="fa-solid fa-clipboard-check text-lg"></i> <span>تم الجرد ✓ (إعادة المزامنة)</span>';
            auditBtn.classList.add('opacity-90');
        } else {
            auditBtn.innerHTML = '<i class="fa-solid fa-check-double text-lg"></i> <span>تأكيد الجرد (نقل لمجلد تم الجرد)</span>';
            auditBtn.classList.remove('opacity-90');
        }
    }
    document.getElementById('modal-delivery-person').value = order.delivery?.deliveryPerson || order.client?.deliveryPerson || '';
    document.getElementById('modal-pickup-person').value = order.delivery?.returnPerson || order.client?.returnPerson || '';
    const modal = document.getElementById('details-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('details-modal-content').classList.remove('translate-y-full', 'sm:translate-y-10');
    }, 10);
}
function closeDetailsModal() {
    // حفظ اسم المندوب قبل الإغلاق — ضمان أن البيانات لا تضيع
    updatePersonnel();
    // تصفير جميع مؤشرات التعديل النشطة لمنع تداخل الحالات عند التنقل بين النوافذ
    if (typeof cancelExpenseEdit === 'function') cancelExpenseEdit();
    if (typeof cancelPaymentEdit === 'function') cancelPaymentEdit();
    _editingLinkedReturnIndex = null;
    const modal = document.getElementById('details-modal');
    modal.classList.add('opacity-0');
    document.getElementById('details-modal-content').classList.add('translate-y-full', 'sm:translate-y-10');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}
function updatePersonnel() {
    if (!activeOrderId) return;
    const order = currentOrders.find(o => o.id == activeOrderId);
    if (order) {
        if (!order.delivery) order.delivery = {};
        if (!order.client) order.client = {};
        const dp = document.getElementById('modal-delivery-person').value;
        const rp = document.getElementById('modal-pickup-person').value;
        order.delivery.deliveryPerson = dp;
        order.delivery.returnPerson = rp;
        // Backward compat
        order.client.deliveryPerson = dp;
        order.client.returnPerson = rp;
        saveOrdersToLocal();
    }
}
function saveOrdersToLocal() {
    // Always sync currentOrders back into SaddahDB before saving
    window.SaddahDB.data.orders = currentOrders;
    window.SaddahDB.save();
}
window.updateCurrentOrderInDB = async function() {
    if (!currentSelectedOrder) return;
    const idx = currentOrders.findIndex(o => o.id == currentSelectedOrder.id);
    if (idx > -1) {
        currentOrders[idx] = currentSelectedOrder;
        saveOrdersToLocal();
        if (typeof fsHelpers !== 'undefined' && fsHelpers.saveOrders) {
            await fsHelpers.saveOrders(currentOrders);
        }
    }
};
function actionAddExpenses() {
    closeDetailsModal();
    cancelExpenseEdit(); // إلغاء أي وضع تعديل سابق
    document.getElementById('exp-supplier').value = '';
    document.getElementById('exp-file').value = '';
    document.getElementById('exp-amount').value = '0';
    document.getElementById('exp-discount').value = '0';
    document.getElementById('exp-paid').value = '0';
    if (document.getElementById('exp-cash'))     document.getElementById('exp-cash').value = '';
    if (document.getElementById('exp-transfer')) document.getElementById('exp-transfer').value = '';
    calcExpense();
    renderExpensesList();
    const modal = document.getElementById('expenses-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('expenses-modal-content').classList.remove('scale-95');
    }, 10);
}
// عرض قائمة المصروفات المسجّلة داخل المودال
function renderExpensesList() { return OrderActions.Expenses.renderList(); }
function _old_renderExpensesList() {
    const listEl = document.getElementById('expenses-list');
    const totalEl = document.getElementById('exp-list-total');
    if (!listEl) return;
    const exps = (currentSelectedOrder && currentSelectedOrder.expenses) || [];
    if (exps.length === 0) {
        listEl.innerHTML = '<p class="text-center text-xs text-slate-400 py-4">لا توجد مصروفات مسجلة</p>';
        if (totalEl) totalEl.innerText = 'الإجمالي: 0 ريال';
        return;
    }
    let total = 0;
    listEl.innerHTML = exps.map((exp, idx) => {
        const gross = parseFloat(exp.total ?? exp.amount) || 0;
        const linkedReturnsTotal = (typeof getLinkedReturnsTotal === 'function') ? getLinkedReturnsTotal(currentSelectedOrder, idx) : 0;
        const amt = gross - linkedReturnsTotal;   // الصافي بعد طرح المرتجعات المرتبطة
        total += amt;                              // الإجمالي يعكس الصافي
        let methodBadges = '';
        if (exp.cashPaid > 0)     methodBadges += `<span class="text-[10px] bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 font-bold">💵 ${exp.cashPaid}</span>`;
        if (exp.transferPaid > 0) methodBadges += `<span class="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-bold">🏦 ${exp.transferPaid}</span>`;
                let attachIcon = '';
        const att = exp.attachment;
        if (att) {
            const link = resolveAttachLink(att.link || att.data || att.url, 'المصروفات');
            if (link) {
                attachIcon = `<button onclick="openPreviewModal('${link}', 'مرفق المصروف')" class="text-orange-500 hover:text-orange-700 transition" data-tip="عرض المرفق"><i class="fa-solid fa-eye"></i></button>`;
            } else {
                attachIcon = `<i class="fa-solid fa-paperclip text-slate-400"></i>`;
            }
        }
        // وسم المطالبة: يوضّح أن هذا المصروف عليه مطالبة لموظف
        let claimTag = '';
        if (exp.claimId && Array.isArray(window.SaddahDB.data.claims)) {
            const claim = window.SaddahDB.data.claims.find(c => String(c.id) === String(exp.claimId));
            if (claim) {
                const emp = esc(claim.employee || 'موظف');
                const settled = claim.status === 'settled' || claim.batchId;
                claimTag = settled
                    ? `<span class="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5 font-bold whitespace-nowrap"><i class="fa-solid fa-hand-holding-dollar"></i> مطالبة: ${emp} ✓</span>`
                    : `<span class="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.5 font-bold whitespace-nowrap"><i class="fa-solid fa-hand-holding-dollar"></i> مطالبة: ${emp}</span>`;
            }
        }

        // ── بادج المرتجعات المرتبطة ──────────────────────────────────────
        let returnBadge = '';
        if (linkedReturnsTotal > 0) {
            returnBadge = `<span class="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-bold whitespace-nowrap"><i class="fa-solid fa-rotate-left"></i> مرتجع: ${linkedReturnsTotal.toFixed(0)} ر.س</span>`;
        }

        return `
            <div class="bg-white border ${returnBadge ? 'border-amber-200' : (claimTag ? 'border-purple-200' : 'border-slate-200')} rounded-xl p-3 flex items-center justify-between gap-2">
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-sm text-slate-700 truncate">${exp.desc || exp.name || 'مصروف'}</div>
                    <div class="flex gap-1 mt-1 flex-wrap items-center">${claimTag}${returnBadge}${methodBadges} ${attachIcon}</div>
                </div>
                ${linkedReturnsTotal > 0
                    ? `<div class="shrink-0 text-left leading-none"><div class="text-[10px] text-slate-400 line-through">${gross.toFixed(0)}</div><div class="text-red-600 font-black text-sm mt-0.5">${amt.toFixed(0)} ر.س</div></div>`
                    : `<div class="text-red-600 font-black text-sm shrink-0">${amt.toFixed(0)} ر.س</div>`}
                <button onclick="openLinkedReturnModal(${idx})" title="تسجيل مرتجع على هذا المصروف" class="text-amber-400 hover:text-amber-600 transition shrink-0"><i class="fa-solid fa-rotate-left"></i></button>
                <button onclick="editExpenseFromOrder(${idx})" title="تعديل المصروف" class="text-slate-400 hover:text-orange-500 transition shrink-0"><i class="fa-solid fa-pen-to-square"></i></button>
                <button onclick="deleteExpenseFromOrder(${idx}, this)" title="حذف المصروف" class="text-slate-300 hover:text-red-500 transition shrink-0"><i class="fa-solid fa-trash-can"></i></button>
            </div>`;
    }).join('');
    if (totalEl) totalEl.innerText = `الإجمالي: ${total.toFixed(0)} ريال`;
}

async function deleteExpenseFromOrder(idx, btn) {
    if (_savingInProgress) return;
    if (!currentSelectedOrder || !currentSelectedOrder.expenses) return;
    if (!window.SaddahUser || !window.SaddahUser.perms.includes('*')) {
        alert('لا تملك صلاحية مدير لحذف هذا المصروف.');
        return;
    }
    const exp = currentSelectedOrder.expenses[idx];
    
    // منع الحذف إذا كانت المطالبة مدفوعة
    if (exp && exp.claimId && Array.isArray(window.SaddahDB.data.claims)) {
        const claim = window.SaddahDB.data.claims.find(c => String(c.id) === String(exp.claimId));
        if (claim && (claim.status === 'settled' || claim.batchId)) {
            alert('❌ لا يمكنك حذف هذا المصروف! لقد تم تسديد المطالبة المالية للموظف بالفعل. يجب إلغاء تسديد المطالبة من قسم الحسابات أولاً.');
            return;
        }
    }

    if (!confirm('حذف هذا المصروف؟ سيُحذف أيضاً من مجلد الطلب على الجهاز.')) return;
    
    _savingInProgress = true;
    let originalIcon = '';
    if (btn) {
        originalIcon = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }
    
    try {
        // ── 1. مرحلة التجهيز (Prepare on Clones) ──
    const tempExpenses = [...currentSelectedOrder.expenses];
    const tempReturns = currentSelectedOrder.returns ? currentSelectedOrder.returns.map(r => ({...r})) : [];
    let tempClaims = Array.isArray(window.SaddahDB.data.claims) ? [...window.SaddahDB.data.claims] : [];
    
    let filesToDelete = []; // مصفوفة لتجميع الملفات المراد حذفها
    
    // تسجيل ملف المصروف للحذف
    const expFileName = exp && exp.attachment && (exp.attachment.name || exp.attachment.data);
    if (expFileName) {
        const subFolder = exp.attachment.link?.includes('/') ? 
            (exp.attachment.link.split('/').slice(-2)[0] === 'المصروفات' ? "المصروفات" : `المصروفات/${exp.attachment.link.split('/').slice(-2)[0]}`) 
            : "المصروفات";
        filesToDelete.push({ fileName: expFileName, subFolder: subFolder });
    }
    
    // إزالة المطالبة المرتبطة في النسخة المؤقتة
    let claimsChanged = false;
    if (exp && exp.claimId) {
        const ci = tempClaims.findIndex(c => String(c.id) === String(exp.claimId));
        if (ci > -1) {
            tempClaims.splice(ci, 1);
            claimsChanged = true;
        }
    }
    
    // معالجة مؤشرات المرتجعات وملفاتها في النسخة المؤقتة
    for (let i = tempReturns.length - 1; i >= 0; i--) {
        const ret = tempReturns[i];
        if (ret.linkedExpenseIndex === idx) {
            // المرتجع مرتبط بهذا المصروف، يجب حذفه وتسجيل ملفه
            const retFileName = ret.fileLink ? ret.fileLink.split('/').pop() : null;
            if (retFileName) {
                const parts = ret.fileLink.split('/');
                const subFolder = parts.length >= 2 ? `المصروفات/${parts[parts.length - 2]}` : "المصروفات";
                filesToDelete.push({ fileName: retFileName, subFolder: subFolder });
            }
            tempReturns.splice(i, 1);
        } else if (ret.linkedExpenseIndex > idx) {
            // تعديل المؤشرات لأن المصروف المحذوف كان قبلها
            ret.linkedExpenseIndex--;
        }
    }
    
    // إزالة المصروف من النسخة المؤقتة
    tempExpenses.splice(idx, 1);
    
    // ── 2. مرحلة الإدخال والإخراج (Execute I/O) ──
    if (typeof deleteDocumentFromOrderFS === 'function') {
        for (const f of filesToDelete) {
            try { 
                await deleteDocumentFromOrderFS(currentSelectedOrder, f.fileName, f.subFolder); 
            } catch(e) {
                console.warn("تجاهل خطأ حذف الملف المفقود لاستكمال تفريغ البيانات", f.fileName, e);
            }
        }
    }
    
    // ── 3. مرحلة الاعتماد النهائي (Commit to State) ──
    currentSelectedOrder.expenses = tempExpenses;
    if (currentSelectedOrder.returns) {
        currentSelectedOrder.returns = tempReturns;
    }
    window.SaddahDB.data.claims = tempClaims;
    
    await window.updateCurrentOrderInDB();
    if (claimsChanged && typeof window.SaddahDB.save === 'function') {
        await window.SaddahDB.save();
    }
    if (typeof saveDocumentToOrderFS === 'function') {
        try { await saveDocumentToOrderFS(currentSelectedOrder, null, null, "المصروفات"); } catch(e) {}
    }
    
    renderExpensesList();
    if (editingExpenseIndex === idx) cancelExpenseEdit();
    else if (editingExpenseIndex !== null && editingExpenseIndex > idx) editingExpenseIndex--;
    
    } finally {
        _savingInProgress = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalIcon;
        }
    }
}
// تحميل مصروف موجود في النموذج للتعديل
function editExpenseFromOrder(idx) {
    if (!currentSelectedOrder || !currentSelectedOrder.expenses) return;
    const exp = currentSelectedOrder.expenses[idx];
    if (!exp) return;
    editingExpenseIndex = idx;
    document.getElementById('exp-supplier').value = exp.desc || exp.name || '';
    document.getElementById('exp-amount').value   = exp.amount || exp.total || 0;
    document.getElementById('exp-discount').value = exp.discount || 0;
    if (document.getElementById('exp-date')) {
        document.getElementById('exp-date').value = exp.date ? exp.date.split('T')[0] : new Date().toISOString().split('T')[0];
    }
    // الضريبة: لو المخزّن فيه total مختلف عن amount نفترض يدوي
    document.getElementById('exp-tax-auto').checked = false;
    toggleTaxMode();
    const taxVal = (parseFloat(exp.total)||0) - ((parseFloat(exp.amount)||0) - (parseFloat(exp.discount)||0));
    document.getElementById('exp-tax').value = taxVal > 0 ? taxVal.toFixed(2) : 0;
    calcExpense();
    document.getElementById('exp-paid').value = exp.paid || exp.total || 0;
    if (document.getElementById('exp-cash'))     document.getElementById('exp-cash').value     = exp.cashPaid || '';
    if (document.getElementById('exp-transfer')) document.getElementById('exp-transfer').value = exp.transferPaid || '';
    document.getElementById('exp-file').value = ''; // الملف الجديد اختياري

    // ── ملء بيانات المطالبة إذا كان المصروف عليه مطالبة ──────────────
    const claimChk = document.getElementById('track-expense-is-claim');
    const empBox   = document.getElementById('track-expense-employee-container');
    const empInput = document.getElementById('track-expense-employee-name');
    if (exp.claimId && Array.isArray(window.SaddahDB.data.claims)) {
        const claim = window.SaddahDB.data.claims.find(c => String(c.id) === String(exp.claimId));
        if (claim) {
            if (claimChk) claimChk.checked = true;
            if (empInput) empInput.value = claim.employee || '';
            if (empBox) empBox.classList.remove('hidden');
        } else {
            if (claimChk) claimChk.checked = false;
            if (empInput) empInput.value = '';
            if (empBox) empBox.classList.add('hidden');
        }
    } else {
        if (claimChk) claimChk.checked = false;
        if (empInput) empInput.value = '';
        if (empBox) empBox.classList.add('hidden');
    }

    // زر الحفظ يصير "تحديث"
    const btn = document.querySelector('#expenses-modal button[onclick="saveExpenseToOrder()"]');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تحديث المصروف';
    // تمرير لأعلى النموذج
    document.getElementById('exp-supplier').scrollIntoView({ behavior:'smooth', block:'center' });
    document.getElementById('exp-supplier').focus();
}
function cancelExpenseEdit() { return OrderActions.Expenses.cancelEdit(); }
function _old_cancelExpenseEdit() {
    editingExpenseIndex = null;
    const btn = document.querySelector('#expenses-modal button[onclick="saveExpenseToOrder()"]');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-plus"></i> إضافة المصروف للطلب';
}
function closeExpensesModal() { return OrderActions.Expenses.closeModal(); }
function _old_closeExpensesModal() {
    // مسح اسم الملف المعروض عند الإغلاق
    const fileDisplay = document.getElementById('exp-file-display');
    if (fileDisplay) fileDisplay.innerHTML = '';
    const modal = document.getElementById('expenses-modal');
    modal.classList.add('opacity-0');
    document.getElementById('expenses-modal-content').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}
function calcExpense() { return OrderActions.Expenses.calc(); }
function _old_calcExpense() {
    const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
    const discount = parseFloat(document.getElementById('exp-discount').value) || 0;
    const afterDiscount = Math.max(0, amount - discount);
    document.getElementById('exp-after-discount').value = afterDiscount;
    const taxAuto = document.getElementById('exp-tax-auto').checked;
    const VAT_RATE = 0.15;
    let tax = 0;
    if (taxAuto) {
        tax = afterDiscount * VAT_RATE;
        document.getElementById('exp-tax').value = tax.toFixed(2);
    } else {
        tax = Math.max(0, parseFloat(document.getElementById('exp-tax').value) || 0);
    }
    document.getElementById('exp-total').value = (afterDiscount + tax).toFixed(2);
}
function toggleTaxMode() { return OrderActions.Expenses.toggleTaxMode(); }
function _old_toggleTaxMode() {
    const auto = document.getElementById('exp-tax-auto').checked;
    const taxInput = document.getElementById('exp-tax');
    taxInput.readOnly = auto;
    calcExpense();
}
async function saveExpenseToOrder(btn) {
    if (!currentSelectedOrder) return;
    if (_savingInProgress) return;
    _savingInProgress = true;
    
    let originalBtnHtml = '';
    if (btn) {
        originalBtnHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
    }
    
    try {
        const desc     = document.getElementById('exp-supplier').value || 'مصروف عام';
        const amount   = parseFloat(document.getElementById('exp-amount').value) || 0;
        const total    = parseFloat(document.getElementById('exp-total').value) || 0;
        const paid     = parseFloat(document.getElementById('exp-paid').value) || 0;
        const discount = parseFloat(document.getElementById('exp-discount').value) || 0;
        
        // ── 8. قانون منع القيم السالبة ──
        if (amount < 0 || discount < 0 || total < 0 || paid < 0) {
            alert('❌ لا يمكن إدخال قيم مالية سالبة.');
            _savingInProgress = false;
            return;
        }

        const fileInput = document.getElementById('exp-file');
        const cashPaid     = parseFloat(document.getElementById('exp-cash')?.value) || 0;
        const transferPaid = parseFloat(document.getElementById('exp-transfer')?.value) || 0;
        
        if (!currentSelectedOrder.expenses) currentSelectedOrder.expenses = [];
        const isEditing = editingExpenseIndex !== null && currentSelectedOrder.expenses[editingExpenseIndex];
        const oldExp    = isEditing ? currentSelectedOrder.expenses[editingExpenseIndex] : null;
        const amt       = total || amount || 0;
        const safeDesc  = (desc || 'مصروف').replace(/[\\/:*?"<>|]/g, '-').trim();
        const oldFileName = oldExp && oldExp.attachment && (oldExp.attachment.name || oldExp.attachment.data);
        
        // ── جدار حماية المرتجعات (Negative Expense Bypass Fix) ──
        if (isEditing && currentSelectedOrder.returns) {
            const linkedReturnsTotal = currentSelectedOrder.returns
                .filter(r => r.linkedExpenseIndex === editingExpenseIndex)
                .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
            
            if (amt < linkedReturnsTotal) {
                alert(`❌ لا يمكن تعديل مبلغ المصروف إلى ${amt} ريال! تم إرجاع ${linkedReturnsTotal} ريال من هذا المصروف مسبقاً. الحد الأدنى المسموح به هو ${linkedReturnsTotal} ريال.`);
                _savingInProgress = false;
                return;
            }
        }
        
        // ── 1. مرحلة التجهيز (Prepare) ──
        const expDate = document.getElementById('exp-date') && document.getElementById('exp-date').value ? document.getElementById('exp-date').value : (oldExp ? (oldExp.date || new Date().toISOString()) : new Date().toISOString());
        const tempEntry = {
            desc, amount, total, paid, discount,
            attachment: oldExp ? { ...oldExp.attachment } : null,
            date: expDate
        };
        if (cashPaid > 0)     tempEntry.cashPaid     = cashPaid;
        if (transferPaid > 0) tempEntry.transferPaid = transferPaid;
        if (oldExp && oldExp.claimId) tempEntry.claimId = oldExp.claimId;
        
        let tempClaim = null;
        let claimAction = null; // 'add', 'update', 'delete', null
        const isClaim = document.getElementById('track-expense-is-claim')?.checked;
        const empName = (document.getElementById('track-expense-employee-name')?.value || '').trim();
        const clientName = currentSelectedOrder.client?.name || 'عميل';
        const orderNum = '#' + String(currentSelectedOrder.id).slice(-4);
        if (!window.SaddahDB.data.claims) window.SaddahDB.data.claims = [];
        const claims = window.SaddahDB.data.claims;
        
        if (isClaim && empName && amt > 0) {
            if (tempEntry.claimId) {
                const existing = claims.find(c => String(c.id) === String(tempEntry.claimId));
                if (existing) {
                    const isSettled = existing.status === 'settled' || existing.batchId;
                    if (isSettled && (existing.amount !== amt || existing.employee !== empName)) {
                        if (!confirm('⚠️ تحذير مالي: هذه المطالبة تم دفعها مسبقاً للموظف! تعديل المبلغ أو الموظف الآن سيؤدي إلى اختلال في عهدة الصندوق أو حقوق الموظف. هل قمت بتسوية الفارق المالي يدوياً؟')) {
                            return; // إحباط
                        }
                    }
                    tempClaim = { ...existing };
                    tempClaim.title = `${desc} — ${clientName} (${orderNum})`;
                    tempClaim.desc  = `${desc} لطلب ${clientName} ${orderNum}`;
                    tempClaim.amount = Math.max(0, amt - paid); tempClaim.employee = empName;
                    claimAction = 'update';
                }
            }
            if (!tempClaim) {
                const expId = String(Date.now()) + Math.floor(Math.random() * 1000);
                tempEntry.claimId = expId;
                tempClaim = {
                    id: expId, orderId: currentSelectedOrder.id, clientName,
                    kind: 'expense', source: 'order-expense',
                    title: `${desc} — ${clientName} (${orderNum})`,
                    desc: `${desc} لطلب ${clientName} ${orderNum}`,
                    type: 'مصروف طلب', amount: Math.max(0, amt - paid), employee: empName,
                    status: 'pending', date: new Date().toISOString().split('T')[0]
                };
                claimAction = 'add';
            }
        } else if (tempEntry.claimId) {
            const existingClaim = claims.find(c => String(c.id) === String(tempEntry.claimId));
            if (existingClaim) {
                const isSettled = existingClaim.status === 'settled' || existingClaim.batchId;
                if (isSettled) {
                    alert('❌ لا يمكن إلغاء ربط مطالبة تم دفعها. يجب إلغاء تسوية المطالبة من قسم الحسابات أولاً.');
                    return; 
                } else {
                    if (!confirm('هذا المصروف عليه مطالبة معلّقة للموظف "' + (existingClaim.employee || '') + '". هل تريد حذف المطالبة؟')) {
                        return;
                    } else {
                        claimAction = 'delete';
                    }
                }
            } else {
                claimAction = 'delete';
            }
        }
        
        // ── 2. مرحلة الإدخال والإخراج (I/O) ──
        let targetSubFolder = "المصروفات";
        const hasTransferOrFile = transferPaid > 0 || fileInput.files.length > 0;
        const isSplitPayment = cashPaid > 0 && hasTransferOrFile;
        let finalAttachment = tempEntry.attachment;
        
        if (isSplitPayment && typeof createFolderInOrderFS === 'function') {
            const parentFolder = `${safeDesc} - ${amt} ريال`;
            targetSubFolder = `المصروفات/${parentFolder}`;
            const ok = await createFolderInOrderFS(currentSelectedOrder, `كاش - ${cashPaid} ريال`, targetSubFolder);
            if (!ok) throw new Error("فشل إنشاء المجلد الفرعي بسبب الذاكرة أو الصلاحيات.");
        }
        
        if (fileInput.files.length > 0 && typeof saveDocumentToOrderFS === 'function') {
            const file = fileInput.files[0];
            const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf';
            let fileName = `${safeDesc} - ${amt} ريال.${ext}`;
            if (isSplitPayment) {
                const trAmt = transferPaid > 0 ? transferPaid : (amt - cashPaid);
                fileName = `${safeDesc} - ${trAmt} ريال تحويل.${ext}`;
            }
            if (oldFileName && oldFileName !== fileName && typeof deleteDocumentFromOrderFS === 'function') {
                const oldSubFolder = oldExp.attachment.link?.includes('/') ? 
                    (oldExp.attachment.link.split('/').slice(-2)[0] === 'المصروفات' ? "المصروفات" : `المصروفات/${oldExp.attachment.link.split('/').slice(-2)[0]}`) 
                    : "المصروفات";
                try { await deleteDocumentFromOrderFS(currentSelectedOrder, oldFileName, oldSubFolder); } catch(e) {}
            }
            const ok = await saveDocumentToOrderFS(currentSelectedOrder, file, fileName, targetSubFolder);
            if (!ok) throw new Error("فشل حفظ ملف الفاتورة في مجلد الطلب.");
            finalAttachment = { type: file.type, data: fileName, name: fileName, link: currentSelectedOrder.folderHandle ? `saddah://${currentSelectedOrder.id}/${targetSubFolder}/${fileName}` : '' };
        } else if (isEditing && oldFileName && typeof renameDocumentInOrderFS === 'function') {
            const ext = oldFileName.includes('.') ? oldFileName.split('.').pop() : 'pdf';
            let newFileName = `${safeDesc} - ${amt} ريال.${ext}`;
            if (oldExp && oldExp.attachment && oldExp.attachment.type === 'folder') {
                newFileName = `${safeDesc} - ${amt} ريال`;
            }
            if (isSplitPayment && oldExp?.attachment?.type !== 'folder') {
                const trAmt = transferPaid > 0 ? transferPaid : (amt - cashPaid);
                newFileName = `${safeDesc} - ${trAmt} ريال تحويل.${ext}`;
            }
            if (newFileName !== oldFileName) {
                const oldSubFolder = oldExp.attachment.link?.includes('/') ? 
                    (oldExp.attachment.link.split('/').slice(-2)[0] === 'المصروفات' ? "المصروفات" : `المصروفات/${oldExp.attachment.link.split('/').slice(-2)[0]}`) 
                    : "المصروفات";
                const ok = await renameDocumentInOrderFS(currentSelectedOrder, oldFileName, newFileName, oldSubFolder);
                if (ok) finalAttachment = { ...(finalAttachment||{}), data: newFileName, name: newFileName, link: (finalAttachment && finalAttachment.link) ? finalAttachment.link.split('/').slice(0,-1).concat(newFileName).join('/') : '' };
            }
        } else if (fileInput.files.length === 0 && !isEditing && typeof createFolderInOrderFS === 'function') {
            if (!isSplitPayment) {
                const folderName = `${safeDesc} - ${amt} ريال`;
                const ok = await createFolderInOrderFS(currentSelectedOrder, folderName, "المصروفات");
                if (!ok) throw new Error("فشل إنشاء مجلد المصروف.");
                finalAttachment = { type: 'folder', data: folderName, name: folderName, link: currentSelectedOrder.folderHandle ? `saddah://${currentSelectedOrder.id}/المصروفات/${folderName}` : '' };
            } else {
                const trAmt = transferPaid > 0 ? transferPaid : (amt - cashPaid);
                if (trAmt > 0) {
                    const ok = await createFolderInOrderFS(currentSelectedOrder, `تحويل - ${trAmt} ريال`, targetSubFolder);
                    if (!ok) throw new Error("فشل إنشاء مجلد التحويل.");
                }
                finalAttachment = { type: 'folder', data: targetSubFolder.split('/')[1], name: targetSubFolder.split('/')[1], link: currentSelectedOrder.folderHandle ? `saddah://${currentSelectedOrder.id}/${targetSubFolder}` : '' };
            }
        }
        
        tempEntry.attachment = finalAttachment;
        
        if ((claimAction === 'add' || claimAction === 'update') && tempClaim) {
            tempClaim.fileLink = finalAttachment ? (finalAttachment.link || finalAttachment.name) : '';
            if (fileInput.files && fileInput.files[0] && typeof saveOrderClaimPendingInvoice === 'function') {
                try {
                    await saveOrderClaimPendingInvoice(tempClaim, fileInput.files[0]);
                } catch (e) {
                    throw new Error("فشل حفظ صورة الفاتورة في ملفات الموظفين (المطالبات).");
                }
            }
        }
        
        // ── 3. مرحلة الاعتماد (Commit to State) ──
        if (claimAction === 'add') {
            claims.push(tempClaim);
        } else if (claimAction === 'update') {
            const ci = claims.findIndex(c => String(c.id) === String(tempClaim.id));
            if (ci > -1) claims[ci] = tempClaim;
        } else if (claimAction === 'delete') {
            const ci = claims.findIndex(c => String(c.id) === String(tempEntry.claimId));
            if (ci > -1) claims.splice(ci, 1);
            delete tempEntry.claimId;
        }
        
        if (isEditing) currentSelectedOrder.expenses[editingExpenseIndex] = tempEntry;
        else           currentSelectedOrder.expenses.push(tempEntry);
        
        await window.updateCurrentOrderInDB();
        if (claimAction !== null && typeof window.SaddahDB.save === 'function') {
            await window.SaddahDB.save();
        }
        
        if (typeof saveDocumentToOrderFS === 'function') {
            try { await saveDocumentToOrderFS(currentSelectedOrder, null, null, "المصروفات"); } catch(e) {}
        }
        
        // ── 4. تحديث الواجهة والتنظيف ──
        const wasEditing = isEditing;
        cancelExpenseEdit();
        document.getElementById('exp-supplier').value = '';
        document.getElementById('exp-file').value = '';
        document.getElementById('exp-amount').value = '0';
        document.getElementById('exp-discount').value = '0';
        document.getElementById('exp-paid').value = '0';
        if (document.getElementById('exp-cash'))     document.getElementById('exp-cash').value = '';
        if (document.getElementById('exp-transfer')) document.getElementById('exp-transfer').value = '';
        const claimChk = document.getElementById('track-expense-is-claim');
        const empBox   = document.getElementById('track-expense-employee-container');
        const empInput = document.getElementById('track-expense-employee-name');
        if (claimChk) claimChk.checked = false;
        if (empInput) empInput.value = '';
        if (empBox) empBox.classList.add('hidden');
        calcExpense();
        renderExpensesList();
        
        let claimMsg = claimAction === 'add' ? ` وتسجيل مطالبة للموظف "${empName}"` : '';
        alert(`${wasEditing ? 'تم تحديث المصروف' : 'تم إضافة المصروف'}${claimMsg} ✓`);
        
    } catch(e) {
        alert('❌ حدث خطأ أثناء الحفظ. لم يتم تعديل البيانات لضمان عدم وجود أخطاء جزئية: ' + e.message);
    } finally { 
        _savingInProgress = false; 
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnHtml;
        }
    }
}
function _old_actionAddExtra() {
    closeDetailsModal();
    const order = currentSelectedOrder;
    const ex = order?.extraFinancials || {};
    // نقرأ فقط من extraFinancials لكي لا نسحب رسوم توصيل العميل بالخطأ
    document.getElementById('extra-ext-delivery').value = ex.externalDelivery ?? 0;
    document.getElementById('extra-wh-delivery').value  = ex.warehouseDelivery ?? 0;
    document.getElementById('extra-fuel').value         = ex.abdulrazzaqFuel ?? 0;
    // تصفير حقول الملفات والمطالبات
    ['extra-ext-file','extra-wh-file'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['extra-ext-is-claim','extra-wh-is-claim'].forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });
    ['extra-ext-emp','extra-wh-emp'].forEach(id => { const el = document.getElementById(id); if (el) { el.value = ''; el.classList.add('hidden'); } });
    const modal = document.getElementById('extra-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('extra-modal-content').classList.remove('scale-95');
    }, 10);
}
function _old_closeExtraModal() {
    const modal = document.getElementById('extra-modal');
    modal.classList.add('opacity-0');
    document.getElementById('extra-modal-content').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}
// رفع إيصال حوالة لمجلد الطلب وإرجاع اسم الملف مع التعامل مع الملفات السابقة
async function uploadExtraReceipt(fileInputId, label, amount, oldFileName) {
    const fileInput = document.getElementById(fileInputId);
    if (!fileInput) return oldFileName || '';

    // إذا لم يتم اختيار ملف جديد، نعيد تسمية الملف القديم إذا اختلف المبلغ
    if (fileInput.files.length === 0) {
        if (oldFileName && typeof renameDocumentInOrderFS === 'function') {
            const ext = oldFileName.includes('.') ? oldFileName.split('.').pop() : 'pdf';
            const safe = label.replace(/[\\/:*?"<>|]/g, '-').trim();
            const newFileName = `${safe} - ${amount} ريال.${ext}`;
            if (newFileName !== oldFileName) {
                const ok = await renameDocumentInOrderFS(currentSelectedOrder, oldFileName, newFileName, "التكاليف الإضافية");
                if (!ok) throw new Error("فشل إعادة تسمية الملف.");
                return newFileName;
            }
        }
        return oldFileName || '';
    }

    // تم اختيار ملف جديد
    if (typeof saveDocumentToOrderFS !== 'function') return oldFileName || '';
    const file = fileInput.files[0];
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf';
    const safe = label.replace(/[\\/:*?"<>|]/g, '-').trim();
    const fileName = `${safe} - ${amount} ريال.${ext}`;

    // حذف القديم إن وجد واسمه مختلف
    if (oldFileName && oldFileName !== fileName && typeof deleteDocumentFromOrderFS === 'function') {
        try { await deleteDocumentFromOrderFS(currentSelectedOrder, oldFileName, "التكاليف الإضافية"); } catch(e) {}
    }

    const ok = await saveDocumentToOrderFS(currentSelectedOrder, file, fileName, "التكاليف الإضافية");
    if (!ok) throw new Error("فشل إرفاق فاتورة التكاليف الإضافية بسبب امتلاء المساحة أو نقص الصلاحيات.");
    return fileName;
}
// إنشاء/تحديث مطالبة موظف مرتبطة بهذا الطلب (بدون تكرار)
function upsertEmployeeClaim(kind, typeLabel, employee, amount, fileLink) {
    if (!window.SaddahDB.data.claims) window.SaddahDB.data.claims = [];
    const claims = window.SaddahDB.data.claims;
    const orderId = currentSelectedOrder.id;
    const clientName = currentSelectedOrder.client?.name || 'عميل';
    const orderNum = '#' + String(orderId).slice(-4);
    // العنوان: نوع المصروف + اسم العميل + رقم الطلب
    const title = `${typeLabel} — ${clientName} (${orderNum})`;
    const desc = `${typeLabel} لطلب ${clientName} ${orderNum}`;
    // ابحث عن مطالبة سابقة لنفس الطلب ونفس النوع (لتفادي التكرار عند إعادة الحفظ)
    let claim = claims.find(c => c.orderId == orderId && c.kind === kind);
    if (!employee || amount <= 0) {
        // لا يوجد موظف أو مبلغ → احذف المطالبة القديمة إن وُجدت
        if (claim) {
            const i = claims.indexOf(claim);
            if (i > -1) claims.splice(i, 1);
        }
        return;
    }
    if (claim) {
        // تحديث المطالبة الموجودة
        claim.title = title;
        claim.desc = desc;
        claim.type = typeLabel;
        claim.clientName = clientName;
        claim.employee = employee;
        claim.amount = amount;
        if (fileLink) claim.fileLink = fileLink;
    } else {
        // مطالبة جديدة
        claims.push({
            id: String(Date.now()) + Math.floor(Math.random() * 1000),
            orderId: orderId,
            clientName: clientName,
            kind: kind,             // externalDelivery | warehouseDelivery
            source: 'extra',
            title: title,
            desc: desc,
            type: typeLabel,
            amount: amount,
            employee: employee,
            status: 'pending',
            date: new Date().toISOString().split('T')[0],
            fileLink: fileLink || ''
        });
    }
}
async function _old_saveExtraToOrder(btn) {
    if (!currentSelectedOrder) return;
    if (_savingInProgress) return;
    _savingInProgress = true;
    
    let originalBtnHtml = '';
    if (btn) {
        originalBtnHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
    }

    try {
    if (!currentSelectedOrder.financials) currentSelectedOrder.financials = {};
    if (!currentSelectedOrder.extraFinancials) currentSelectedOrder.extraFinancials = {};
    const extDelivery = parseFloat(document.getElementById('extra-ext-delivery').value) || 0;
    const whDelivery  = parseFloat(document.getElementById('extra-wh-delivery').value) || 0;
    const fuel        = parseFloat(document.getElementById('extra-fuel').value) || 0;
    const clientName = currentSelectedOrder.client?.name || 'الطلب';
    const ex = currentSelectedOrder.extraFinancials || {};
    const oldExtReceipt = ex.externalDeliveryReceipt || '';
    const oldWhReceipt = ex.warehouseDeliveryReceipt || '';

    // رفع إيصالات الحوالات أو إعادة تسميتها إذا لم يتغير الملف وتغير المبلغ
    const extReceipt = await uploadExtraReceipt('extra-ext-file', 'توصيل خارجي', extDelivery, oldExtReceipt);
    const whReceipt  = await uploadExtraReceipt('extra-wh-file', 'إرجاع مستودع', whDelivery, oldWhReceipt);
    
    // حفظ المبالغ في extraFinancials (المصدر الأساسي الذي تقرأه الحسابات)
    ex.externalDelivery  = extDelivery;
    ex.warehouseDelivery = whDelivery;
    ex.abdulrazzaqFuel   = fuel;
    if (extReceipt) ex.externalDeliveryReceipt = extReceipt;
    if (whReceipt)  ex.warehouseDeliveryReceipt = whReceipt;
    // التكاليف المهيكلة (توصيل/إرجاع/بنزين) تُحفظ في extraFinancials فقط — مصدر واحد.
    // لا نكرّرها في قائمة المصروفات حتى لا تُحتسب مرتين في الربح (يقرأها حساب db.js من extraFinancials).
    // المطالبات للموظفين (مرتبطة بقاعدة بيانات المطالبات)
    const extIsClaim = document.getElementById('extra-ext-is-claim')?.checked;
    const extEmp     = document.getElementById('extra-ext-emp')?.value.trim();
    upsertEmployeeClaim('externalDelivery', 'توصيل خارجي', extIsClaim ? extEmp : '', extDelivery,
        extReceipt || ex.externalDeliveryReceipt);
    const whIsClaim = document.getElementById('extra-wh-is-claim')?.checked;
    const whEmp     = document.getElementById('extra-wh-emp')?.value.trim();
    upsertEmployeeClaim('warehouseDelivery', 'إرجاع للمستودع', whIsClaim ? whEmp : '', whDelivery,
        whReceipt || ex.warehouseDeliveryReceipt);
    await window.updateCurrentOrderInDB();
    // بناء رسالة تأكيد واضحة
    let msg = 'تم حفظ التكاليف الإضافية ✓';
    const claimsAdded = [];
    if (extIsClaim && extEmp) claimsAdded.push(`توصيل خارجي (${extEmp})`);
    if (whIsClaim && whEmp)   claimsAdded.push(`إرجاع مستودع (${whEmp})`);
    if (claimsAdded.length) msg += `\nتم تسجيل مطالبة للموظف: ${claimsAdded.join('، ')}`;
    alert(msg);
    closeExtraModal();
    } catch(e) {
        alert('❌ حدث خطأ أثناء الحفظ. لم يتم تعديل البيانات لضمان عدم وجود أخطاء جزئية: ' + e.message);
    } finally {
        _savingInProgress = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnHtml;
        }
    }
}
// ════════════════════════════════════════════════════════════════
//  إثباتات الدفع (Payments)
// ════════════════════════════════════════════════════════════════
function _old_actionAddPayment() {
    closeDetailsModal();
    cancelPaymentEdit(); // إلغاء أي وضع تعديل سابق
    // تصفير النموذج
    document.querySelectorAll('#tracking-pay-chips input[type=checkbox]').forEach(c => {
        c.checked = false;
        const box = c.nextElementSibling;
        if (box) box.classList.remove('bg-emerald-600','text-white','border-emerald-600');
    });
    const customField = document.getElementById('pay-desc-custom');
    if (customField) { customField.value = ''; customField.classList.add('hidden'); }
    document.getElementById('pay-file').value = '';
    document.getElementById('pay-amount').value = '0';
    // إعادة طريقة الدفع للكاش افتراضياً
    const cashRadio = document.querySelector('input[name="pay-method"][value="cash"]');
    if (cashRadio) cashRadio.checked = true;
    onPayMethodChange();
    renderPaymentsList();
    renderQuickStatus(); // يحدّث أزرار العربون/الاكتمال
    const modal = document.getElementById('payments-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('payments-modal-content').classList.remove('scale-95');
    }, 10);
}
function _old_closePaymentsModal() {
    const modal = document.getElementById('payments-modal');
    modal.classList.add('opacity-0');
    document.getElementById('payments-modal-content').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}
function getCheckedChips(containerId, customId) {
    const vals = [];
    document.querySelectorAll(`#${containerId} input[type=checkbox]:checked`).forEach(c => {
        if (c.value === 'أخرى') {
            const custom = document.getElementById(customId)?.value.trim();
            if (custom) vals.push(custom);
        } else {
            vals.push(c.value);
        }
    });
    return vals.join(' + ');
}
// تبديل واجهة طريقة الدفع (كاش/تحويل)
function onPayMethodChange() {
    const method = document.querySelector('input[name="pay-method"]:checked')?.value || 'cash';
    const hint = document.getElementById('pay-method-hint');
    const fileLabel = document.getElementById('pay-file-label');
    if (method === 'transfer') {
        if (hint) { hint.textContent = '🏦 تحويل بنكي — يجب إرفاق إيصال التحويل (إجباري).'; hint.className = 'text-[11px] font-bold text-blue-600 mt-1'; }
        if (fileLabel) fileLabel.textContent = 'إيصال التحويل (صورة/PDF) — إجباري';
    } else {
        if (hint) { hint.textContent = '💡 الكاش سيُضاف لرصيد النقد الواجب تحويله للمؤسسة.'; hint.className = 'text-[11px] font-bold text-green-600 mt-1'; }
        if (fileLabel) fileLabel.textContent = 'إرفاق إثبات (صورة/PDF) — اختياري للكاش';
    }
}
// إعادة بناء اختيارات نوع الإثبات (chips) من وصف محفوظ مثل "عربون + باقي المبلغ"
function setPaymentChipsFromDesc(desc) {
    const customField = document.getElementById('pay-desc-custom');
    // تصفير الكل
    document.querySelectorAll('#tracking-pay-chips input[type=checkbox]').forEach(c => c.checked = false);
    if (customField) { customField.value = ''; customField.classList.add('hidden'); }
    const parts = (desc || '').split(' + ').map(s => s.trim()).filter(Boolean);
    const customs = [];
    parts.forEach(part => {
        let matched = false;
        document.querySelectorAll('#tracking-pay-chips input[type=checkbox]').forEach(c => {
            if (c.value !== 'أخرى' && c.value === part) { c.checked = true; matched = true; }
        });
        if (!matched) customs.push(part);
    });
    if (customs.length) {
        const otherChip = document.querySelector('#tracking-pay-chips input[value="أخرى"]');
        if (otherChip) otherChip.checked = true;
        if (customField) { customField.value = customs.join(' + '); customField.classList.remove('hidden'); }
    }
}
// تحميل إثبات دفع موجود في النموذج للتعديل
function _old_editPaymentFromOrder(idx) {
    if (!currentSelectedOrder || !currentSelectedOrder.paymentProofs) return;
    const p = currentSelectedOrder.paymentProofs[idx];
    if (!p) return;
    editingPaymentIndex = idx;
    setPaymentChipsFromDesc(p.desc || '');
    document.getElementById('pay-amount').value = p.amount || 0;
    const method = p.method === 'transfer' ? 'transfer' : 'cash';
    const methodRadio = document.querySelector(`input[name="pay-method"][value="${method}"]`);
    if (methodRadio) methodRadio.checked = true;
    onPayMethodChange();
    document.getElementById('pay-file').value = ''; // الملف الجديد اختياري عند التعديل
    // زر الحفظ يصير "تحديث"
    const btn = document.querySelector('#payments-modal button[onclick="savePaymentToOrder()"]');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تحديث إثبات الدفع';
    // تمرير لأعلى النموذج
    document.getElementById('pay-amount').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function _old_cancelPaymentEdit() {
    editingPaymentIndex = null;
    const btn = document.querySelector('#payments-modal button[onclick="savePaymentToOrder()"]');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-plus"></i> إضافة إثبات الدفع للطلب';
}
async function _old_savePaymentToOrder(btn) {
    if (!currentSelectedOrder) return;
    if (_savingInProgress) return;
    _savingInProgress = true;
    
    let originalBtnHtml = '';
    if (btn) {
        originalBtnHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
    }

    try {
    const desc = getCheckedChips('tracking-pay-chips', 'pay-desc-custom') || 'دفعة';
    const amount = parseFloat(document.getElementById('pay-amount').value) || 0;
    const fileInput = document.getElementById('pay-file');
    const method = document.querySelector('input[name="pay-method"]:checked')?.value || 'cash';
    if (amount <= 0) { alert('يرجى إدخال المبلغ.'); _savingInProgress = false; return; }
    if (!currentSelectedOrder.paymentProofs) currentSelectedOrder.paymentProofs = [];
    // ── وضع التعديل: قراءة الدفعة القديمة ──────────────────────────────
    const isEditing = editingPaymentIndex !== null && currentSelectedOrder.paymentProofs[editingPaymentIndex];
    const oldPay    = isEditing ? currentSelectedOrder.paymentProofs[editingPaymentIndex] : null;
    const oldAtt    = oldPay ? oldPay.attachment : null;
    const oldName   = oldAtt && (oldAtt.name || oldAtt.data);
    const hasOldFile = !!(oldAtt && oldAtt.type !== 'folder' && oldName); // ملف فعلي (ليس مجلداً) مرفق سابقاً
    // تحويل بنكي يتطلب إيصالاً — إلا إذا كان عند التعديل يوجد إيصال مرفق مسبقاً
    if (method === 'transfer' && fileInput.files.length === 0 && !hasOldFile) {
        alert('الدفع تحويل بنكي — يجب إرفاق إيصال التحويل.');
        return;
    }
    const safeDesc  = (desc || 'دفعة').replace(/[\\/:*?"<>|]/g, '-').trim();
    const methodStr = method === 'cash' ? ' كاش' : ' تحويل';
    const buildFileName   = (ext) => `${safeDesc} - ${amount} ريال${methodStr}.${ext}`;
    const buildFolderName = () => `${safeDesc} - ${amount} ريال كاش`;
    // افتراضياً نحافظ على المرفق القديم عند التعديل (قد يتغيّر أدناه)
    let fileData = oldAtt || null;
    let fileLink = (oldPay && oldPay.fileLink) || '';
    if (fileInput.files.length > 0 && typeof saveDocumentToOrderFS === 'function') {
        // رفع ملف جديد → استبدال القديم
        const file = fileInput.files[0];
        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf';
        const fileName = buildFileName(ext);
        // حذف الملف/المجلد القديم إذا اختلف الاسم
        if (isEditing && oldName && oldName !== fileName && typeof deleteDocumentFromOrderFS === 'function') {
            try { await deleteDocumentFromOrderFS(currentSelectedOrder, oldName, "الدفعات"); } catch(e) {}
        }
        const ok = await saveDocumentToOrderFS(currentSelectedOrder, file, fileName, "الدفعات");
        if (!ok) throw new Error("فشل إرفاق الفاتورة بسبب امتلاء المساحة أو مشكلة بالصلاحيات.");
        fileLink = currentSelectedOrder.folderHandle ? `saddah://${currentSelectedOrder.id}/الدفعات/${fileName}` : fileName;
        fileData = { type: file.type, data: fileName, name: fileName, link: fileLink };
    } else if (isEditing && oldName && typeof renameDocumentInOrderFS === 'function') {
        // لا ملف جديد — لكن قد يتغيّر الاسم/المبلغ/الطريقة → أعِد تسمية الملف/المجلد على الجهاز
        const isFolder = oldAtt.type === 'folder';
        let newName;
        if (isFolder) {
            newName = buildFolderName(); // مجلد الكاش بدون إيصال
        } else {
            const ext = oldName.includes('.') ? oldName.split('.').pop() : 'pdf';
            newName = buildFileName(ext);
        }
        if (newName !== oldName) {
            const ok = await renameDocumentInOrderFS(currentSelectedOrder, oldName, newName, "الدفعات");
            if (!ok) throw new Error("فشل إعادة تسمية الملف بسبب امتلاء المساحة أو مشكلة بالصلاحيات.");
            fileLink = currentSelectedOrder.folderHandle ? `saddah://${currentSelectedOrder.id}/الدفعات/${newName}` : newName;
            fileData = { ...oldAtt, data: newName, name: newName, link: fileLink };
        }
    } else if (!isEditing && method === 'cash' && typeof createFolderInOrderFS === 'function') {
        // إضافة كاش بدون إيصال → إنشاء مجلد باسم الدفعة والمبلغ
        const folderName = buildFolderName();
        const ok = await createFolderInOrderFS(currentSelectedOrder, folderName, "الدفعات");
        if (!ok) throw new Error("فشل إنشاء مجلد الدفعة بسبب امتلاء المساحة.");
        fileLink = currentSelectedOrder.folderHandle ? `saddah://${currentSelectedOrder.id}/الدفعات/${folderName}` : folderName;
        fileData = { type: 'folder', data: folderName, name: folderName, link: fileLink };
    }
    // ── بناء سجل الدفعة (مع الحفاظ على حقول تسوية الكاش عند التعديل) ────
    const entry = isEditing ? { ...oldPay } : {};
    entry.desc = desc;
    entry.amount = amount;
    entry.method = method;
    entry.fileLink = fileLink;
    entry.attachment = fileData;
    if (!isEditing) {
        entry.settledToInstitution = (method === 'transfer'); // التحويل مُسوّى تلقائياً
        entry.date = new Date().toISOString();
    } else {
        entry.date = oldPay.date || new Date().toISOString();
        if (method === 'transfer') {
            // أصبح تحويلاً → يصل المؤسسة مباشرة (مُسوّى)
            entry.settledToInstitution = true;
        } else if (oldPay.method === 'transfer') {
            // كان تحويلاً وأصبح كاش بيدك → يعود بذمتك، ونزيل أثر التسوية القديمة
            entry.settledToInstitution = false;
            delete entry.settlementId; delete entry.settlementDate;
            delete entry.settlementReceipt; delete entry.settlementNote;
        }
        // كاش → كاش: نُبقي حالة التسوية وحقولها كما هي
    }
    if (isEditing) currentSelectedOrder.paymentProofs[editingPaymentIndex] = entry;
    else           currentSelectedOrder.paymentProofs.push(entry);
    await window.updateCurrentOrderInDB();
    // تحديث ملف بيانات الطلب JSON داخل المجلد ليعكس التعديل
    if (typeof saveDocumentToOrderFS === 'function') {
        try { await saveDocumentToOrderFS(currentSelectedOrder, null, null, "الدفعات"); } catch(e) {}
    }
    const wasEditing = isEditing;
    // تصفير النموذج وإلغاء وضع التعديل
    cancelPaymentEdit();
    document.querySelectorAll('#tracking-pay-chips input[type=checkbox]').forEach(c => c.checked = false);
    const cf = document.getElementById('pay-desc-custom'); if (cf) { cf.value=''; cf.classList.add('hidden'); }
    document.getElementById('pay-file').value = '';
    document.getElementById('pay-amount').value = '0';
    const cashRadio = document.querySelector('input[name="pay-method"][value="cash"]');
    if (cashRadio) cashRadio.checked = true;
    onPayMethodChange();
    renderPaymentsList();
    alert(`${wasEditing ? 'تم تحديث إثبات الدفع' : 'تم إضافة إثبات الدفع'} ✓`);
    } catch(e) {
        alert('❌ حدث خطأ أثناء الحفظ. لم يتم تعديل البيانات لضمان عدم وجود أخطاء جزئية: ' + e.message);
    } finally {
        _savingInProgress = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnHtml;
        }
    }
}
// ملخّص مبالغ الطلب أعلى نافذة إثباتات الدفع: العربون + المتبقي + المجموع + التأمين
function renderPaymentsSummary() {
    const order = window.currentSelectedOrder;
    if (!order) return;
    const f = order.financials || {};
    let total = f.total;
    total = (typeof total === 'string') ? (parseFloat(total.replace(' ريال', '')) || 0) : (parseFloat(total) || 0);
    const deposit  = parseFloat(f.deposit) || 0;
    const security = parseFloat(f.securityDeposit) || 0;
    // المتبقي — نفس معادلة db.js: (الإجمالي + التأمين المصادَر) − (المُستلم − المُسترجع)
    let received = 0;
    (order.paymentProofs || []).forEach(p => received += parseFloat(p.amount) || 0);
    let refunded = 0, deducted = 0;
    (order.returns || []).forEach(r => {
        refunded += parseFloat(r.refund) || 0;
        deducted += parseFloat(r.deducted) || 0;
    });
    const remaining = (total + deducted) - (received - refunded);
    const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString('en-US');
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = fmt(val); };
    set('pay-sum-deposit', deposit);
    set('pay-sum-remaining', remaining);
    set('pay-sum-total', total);
    set('pay-sum-security', security);
}
function renderPaymentsList() {
    renderPaymentsSummary();
    const listEl = document.getElementById('payments-list');
    const totalEl = document.getElementById('pay-list-total');
    if (!listEl) return;
    const items = (currentSelectedOrder && currentSelectedOrder.paymentProofs) || [];
    if (items.length === 0) {
        listEl.innerHTML = '<p class="text-center text-xs text-slate-400 py-4">لا توجد دفعات مسجلة</p>';
        if (totalEl) totalEl.innerText = 'الإجمالي: 0 ريال';
        return;
    }
    let total = 0;
    listEl.innerHTML = items.map((p, idx) => {
        const amt = parseFloat(p.amount) || 0;
        total += amt;
        const link = resolveAttachLink(p.fileLink || (p.attachment && (p.attachment.link || p.attachment.data)), 'الدفعات');
        const attachIcon = link ? `<button onclick="openPreviewModal('${link}', 'إثبات الدفع')" class="text-emerald-500 hover:text-emerald-700 transition" data-tip="عرض الإثبات"><i class="fa-solid fa-eye"></i></button>` : '';
        // بادج طريقة الدفع
        let methodBadge = '';
        if (p.method === 'transfer') {
            methodBadge = `<span class="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-bold">🏦 تحويل</span>`;
        } else if (p.method === 'cash') {
            const settled = p.settledToInstitution;
            methodBadge = `<span class="text-[10px] ${settled ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-green-50 text-green-700 border-green-200'} border rounded px-1.5 py-0.5 font-bold">💵 كاش${settled ? ' ✓ محوّل' : ' (بذمتك)'}</span>`;
        } else {
            methodBadge = `<span class="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-bold">⚠️ غير مصنف</span>`;
        }
        return `
            <div class="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2">
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-sm text-slate-700 truncate">${p.desc || 'دفعة'}</div>
                    <div class="flex gap-1 mt-1 flex-wrap items-center">${methodBadge} ${attachIcon}</div>
                </div>
                <div class="text-emerald-600 font-black text-sm shrink-0">${amt.toFixed(0)} ر.س</div>
                <button onclick="editPaymentFromOrder(${idx})" title="تعديل الدفعة" class="text-slate-400 hover:text-emerald-600 transition shrink-0"><i class="fa-solid fa-pen-to-square"></i></button>
                <button onclick="deletePaymentFromOrder(${idx})" title="حذف الدفعة" class="text-slate-300 hover:text-red-500 transition shrink-0"><i class="fa-solid fa-trash-can"></i></button>
            </div>`;
    }).join('');
    if (totalEl) totalEl.innerText = `الإجمالي: ${total.toFixed(0)} ريال`;
}
async function _old_deletePaymentFromOrder(idx) {
    if (!currentSelectedOrder || !currentSelectedOrder.paymentProofs) return;
    if (!confirm('حذف هذه الدفعة؟ سيُحذف أيضاً إثبات الدفع من مجلد الطلب على الجهاز.')) return;
    const p = currentSelectedOrder.paymentProofs[idx];
    // حذف ملف/مجلد إثبات الدفع من مجلد الطلب على الجهاز (إن وُجد)
    const fileName = p && p.attachment && (p.attachment.name || p.attachment.data);
    if (fileName && typeof deleteDocumentFromOrderFS === 'function') {
        try { await deleteDocumentFromOrderFS(currentSelectedOrder, fileName, "الدفعات"); } catch(e) {}
    }
    currentSelectedOrder.paymentProofs.splice(idx, 1);
    await window.updateCurrentOrderInDB();
    // تحديث ملف بيانات الطلب JSON داخل المجلد
    if (typeof saveDocumentToOrderFS === 'function') {
        try { await saveDocumentToOrderFS(currentSelectedOrder, null, null, "الدفعات"); } catch(e) {}
    }
    renderPaymentsList();
    // الحفاظ على صحة فهرس التعديل بعد الحذف
    if (editingPaymentIndex === idx) cancelPaymentEdit();
    else if (editingPaymentIndex !== null && editingPaymentIndex > idx) editingPaymentIndex--;
}
// ── شريط الحالة السريع داخل مودال الدفعات ──────────────────────────
function renderQuickStatus() {
    if (!currentSelectedOrder) return;
    if (!currentSelectedOrder.paymentStatus) currentSelectedOrder.paymentStatus = {};
    const ps = currentSelectedOrder.paymentStatus;
    const setBtn = (id, active) => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.toggle('active', !!active);
    };
    setBtn('qs-deposit', ps.deposit);
    setBtn('qs-completed', ps.completed);
    setBtn('qs-securityReturned', ps.securityReturned);
    setBtn('qs-tax', currentSelectedOrder.financials?.includeTaxInProfit === true);
    // عرض مبلغ التأمين الحالي
    const amtEl = document.getElementById('qs-security-amt');
    if (amtEl) amtEl.innerText = parseFloat(currentSelectedOrder.financials?.securityDeposit) || 0;
}
// تبديل "شامل الضريبة" — موحّد مع صفحة سجل الطلبات (نفس العلامة includeTaxInProfit)
async function toggleOrderTax() {
    if (!currentSelectedOrder) return;
    if (!currentSelectedOrder.financials) currentSelectedOrder.financials = {};
    currentSelectedOrder.financials.includeTaxInProfit = !currentSelectedOrder.financials.includeTaxInProfit;
    await window.updateCurrentOrderInDB(); // الحفظ يعيد حساب الربح في db.js تلقائياً
    renderQuickStatus();
}
async function quickToggleStatus(key) {
    if (!currentSelectedOrder) return;
    if (!currentSelectedOrder.paymentStatus) currentSelectedOrder.paymentStatus = {};
    const ps = currentSelectedOrder.paymentStatus;
    ps[key] = !ps[key];
    // منطق ذكي مترابط
    if (key === 'completed' && ps.completed) {
        ps.deposit = true;       // كامل المبلغ يعني العربون مدفوع
        ps.remaining = true;
    }
    if (key === 'deposit' && !ps.deposit) {
        ps.completed = false;    // إلغاء العربون يلغي الاكتمال
        ps.remaining = false;
    }
    if (key === 'securityReturned' && ps.securityReturned) {
        ps.security = true;      // إرجاع التأمين يفترض أنه دُفع
    }
    await window.updateCurrentOrderInDB();
    renderQuickStatus();
}
async function editSecurityAmount() {
    if (!currentSelectedOrder) return;
    if (!currentSelectedOrder.financials) currentSelectedOrder.financials = {};
    const current = parseFloat(currentSelectedOrder.financials.securityDeposit) || 0;
    const input = prompt('مبلغ التأمين في العقد (اكتب 0 لإلغاء التأمين):', current);
    if (input === null) return; // ألغى المستخدم
    const newAmount = parseFloat(input);
    if (isNaN(newAmount) || newAmount < 0) {
        alert('يرجى إدخال رقم صحيح.');
        return;
    }
    currentSelectedOrder.financials.securityDeposit = newAmount;
    // إذا صار التأمين صفر، نلغي حالات التأمين المرتبطة
    if (newAmount === 0 && currentSelectedOrder.paymentStatus) {
        currentSelectedOrder.paymentStatus.security = false;
        currentSelectedOrder.paymentStatus.securityReturned = false;
    }
    await window.updateCurrentOrderInDB();
    renderQuickStatus();
    alert(`تم تحديث مبلغ التأمين إلى ${newAmount} ريال ✓`);
}
// ════════════════════════════════════════════════════════════════
//  المرتجعات (Returns)
// ════════════════════════════════════════════════════════════════
function actionAddReturns() {
    closeDetailsModal();
    document.querySelectorAll('#tracking-ret-chips input[type=checkbox]').forEach(c => c.checked = false);
    const cf = document.getElementById('ret-desc-custom'); if (cf) { cf.value=''; cf.classList.add('hidden'); }
    document.getElementById('ret-file').value = '';
    document.getElementById('ret-refund').value = '0';
    document.getElementById('ret-deducted').value = '0';
    renderReturnsList();
    renderQuickStatus(); // يحدّث زر "إرجاع التأمين" ومبلغ التأمين
    const modal = document.getElementById('returns-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('returns-modal-content').classList.remove('scale-95');
    }, 10);
}
function closeReturnsModal() {
    const modal = document.getElementById('returns-modal');
    modal.classList.add('opacity-0');
    document.getElementById('returns-modal-content').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}
async function saveReturnToOrder(btn) {
    if (!currentSelectedOrder) return;
    if (_savingInProgress) return;
    _savingInProgress = true;
    
    let originalBtnHtml = '';
    if (btn) {
        originalBtnHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
    }

    try {
    const desc = getCheckedChips('tracking-ret-chips', 'ret-desc-custom') || 'مرتجع';
    const refund = parseFloat(document.getElementById('ret-refund').value) || 0;
    const deducted = parseFloat(document.getElementById('ret-deducted').value) || 0;
    const method = document.querySelector('input[name="ret-method"]:checked')?.value || 'cash';
    const fileInput = document.getElementById('ret-file');
    if (refund <= 0 && deducted <= 0) { alert('يرجى إدخال مبلغ مسترجع أو مخصوم.'); _savingInProgress = false; return; }
    // تحويل بنكي يتطلب إيصالاً
    if (method === 'transfer' && fileInput.files.length === 0) {
        alert('الإرجاع تحويل بنكي — يجب إرفاق إيصال التحويل.');
        _savingInProgress = false;
        return;
    }
    if (!currentSelectedOrder.returns) currentSelectedOrder.returns = [];
    let fileData = null, fileLink = '';
    const amt = refund || deducted || 0;
    const safeDesc = (desc || 'مرتجع').replace(/[\\/:*?"<>|]/g, '-').trim();
    const methodStr = method === 'cash' ? ' كاش' : ' تحويل';
    if (fileInput.files.length > 0 && typeof saveDocumentToOrderFS === 'function') {
        const file = fileInput.files[0];
        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf';
        const fileName = `${safeDesc} - ${amt} ريال${methodStr}.${ext}`;
        const ok = await saveDocumentToOrderFS(currentSelectedOrder, file, fileName, "المرتجعات");
        if (!ok) throw new Error("فشل إرفاق الفاتورة بسبب امتلاء المساحة أو نقص الصلاحيات.");
        fileLink = currentSelectedOrder.folderHandle ? `saddah://${currentSelectedOrder.id}/المرتجعات/${fileName}` : fileName;
        fileData = { type: file.type, data: fileName, name: fileName, link: fileLink };
    } else if (method === 'cash' && typeof createFolderInOrderFS === 'function') {
        const folderName = `${safeDesc} - ${amt} ريال كاش`;
        const ok = await createFolderInOrderFS(currentSelectedOrder, folderName, "المرتجعات");
        if (!ok) throw new Error("فشل إنشاء مجلد المرتجع بسبب امتلاء المساحة.");
        fileLink = currentSelectedOrder.folderHandle ? `saddah://${currentSelectedOrder.id}/المرتجعات/${folderName}` : folderName;
        fileData = { type: 'folder', data: folderName, name: folderName, link: fileLink };
    }
    currentSelectedOrder.returns.push({
        desc, refund, deducted, method, fileLink, attachment: fileData,
        date: new Date().toISOString()
    });
    
    // توجيه التأمين المصادر إلى محفظة الصيانة باستخدام حاوية OrderActions (Rule #4 Financials)
    if (deducted > 0) {
        if (typeof OrderActions !== 'undefined' && OrderActions.Returns) {
            OrderActions.Returns.processConfiscatedInsurance(deducted, currentSelectedOrder.id);
        }
    }
    await window.updateCurrentOrderInDB();
    document.querySelectorAll('#tracking-ret-chips input[type=checkbox]').forEach(c => c.checked = false);
    const cf = document.getElementById('ret-desc-custom'); if (cf) { cf.value=''; cf.classList.add('hidden'); }
    document.getElementById('ret-file').value = '';
    document.getElementById('ret-refund').value = '0';
    document.getElementById('ret-deducted').value = '0';
    const rc = document.querySelector('input[name="ret-method"][value="cash"]'); if (rc) rc.checked = true;
    renderReturnsList();
    alert('تم حفظ المرتجع ✓');
    } catch(e) {
        alert('❌ حدث خطأ أثناء الحفظ. لم يتم تعديل البيانات لضمان عدم وجود أخطاء جزئية: ' + e.message);
    } finally {
        _savingInProgress = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnHtml;
        }
    }
}
function renderReturnsList() {
    const listEl = document.getElementById('returns-list');
    const totalEl = document.getElementById('ret-list-total');
    if (!listEl) return;
    const allReturns = (currentSelectedOrder && currentSelectedOrder.returns) || [];
    const items = allReturns.filter(r => r.linkedExpenseIndex == null);
    if (items.length === 0) {
        listEl.innerHTML = '<p class="text-center text-xs text-slate-400 py-4">لا توجد مرتجعات مسجلة</p>';
        if (totalEl) totalEl.innerText = 'إجمالي المسترجع: 0 ريال';
        return;
    }
    let total = 0;
    listEl.innerHTML = items.map((r, idx) => {
        const refund = parseFloat(r.refund) || 0;
        const deducted = parseFloat(r.deducted) || 0;
        total += refund;
        const link = resolveAttachLink(r.fileLink || (r.attachment && (r.attachment.link || r.attachment.data)), 'المرتجعات');
        const attachIcon = link ? `<button onclick="openPreviewModal('${link}', 'مرفق المرتجع')" class="text-orange-500 hover:text-orange-700 transition" data-tip="عرض المرفق"><i class="fa-solid fa-eye"></i></button>` : '';
        // بادج طريقة الإرجاع
        let methodBadge = '';
        if (r.method === 'transfer') methodBadge = `<span class="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-bold">🏦 تحويل</span>`;
        else if (r.method === 'cash') methodBadge = `<span class="text-[10px] bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 font-bold">💵 كاش</span>`;
        // بادج الربط بمصروف
        let linkedBadge = '';
        if (r.linkedExpenseIndex != null && currentSelectedOrder.expenses && currentSelectedOrder.expenses[r.linkedExpenseIndex]) {
            const linkedExp = currentSelectedOrder.expenses[r.linkedExpenseIndex];
            linkedBadge = `<span class="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-bold"><i class="fa-solid fa-link"></i> مرتبط: ${linkedExp.desc || linkedExp.name || 'مصروف'}</span>`;
        }
        return `
            <div class="bg-white border ${linkedBadge ? 'border-amber-200' : 'border-slate-200'} rounded-xl p-3 flex items-center justify-between gap-2">
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-sm text-slate-700 truncate">${r.desc || 'مرتجع'}</div>
                    <div class="text-[10px] text-slate-400 flex gap-2 items-center flex-wrap mt-0.5">
                        ${linkedBadge}${methodBadge}
                        ${deducted > 0 ? `<span class="text-red-500">مخصوم: ${deducted}</span>` : ''} ${attachIcon}
                    </div>
                </div>
                <div class="text-orange-600 font-black text-sm shrink-0">${refund.toFixed(0)} ر.س</div>
                <button onclick="deleteReturnFromOrder(${idx})" class="text-slate-300 hover:text-red-500 transition shrink-0"><i class="fa-solid fa-trash-can"></i></button>
            </div>`;
    }).join('');
    if (totalEl) totalEl.innerText = `إجمالي المسترجع: ${total.toFixed(0)} ريال`;
}
async function deleteReturnFromOrder(idx) {
    if (!currentSelectedOrder || !currentSelectedOrder.returns) return;
    if (!window.SaddahUser || !window.SaddahUser.perms.includes('*')) {
        alert('لا تملك صلاحية مدير لحذف هذا المرتجع.');
        return;
    }
    if (!confirm('حذف هذا المرتجع؟ سيتم حذف الإيصال من مجلد الطلب على الجهاز.')) return;
    const r = currentSelectedOrder.returns[idx];
    // حذف ملف الإيصال من مجلد الطلب على الجهاز (إن وُجد)
    const fileName = r && r.attachment && (r.attachment.name || r.attachment.data);
    if (fileName && typeof deleteDocumentFromOrderFS === 'function') {
        try { await deleteDocumentFromOrderFS(currentSelectedOrder, fileName, "المرتجعات"); } catch(e) {}
    }

    // ── إعادة حساب مبلغ المطالبة عند حذف مرتجع مرتبط ──────────────
    const wasLinked = r && r.linkedExpenseIndex != null;
    const linkedExpIdx = wasLinked ? r.linkedExpenseIndex : null;
    const linkedClaimId = wasLinked ? r.linkedClaimId : null;

    currentSelectedOrder.returns.splice(idx, 1);

    // تحديث فهارس المرتجعات المرتبطة بعد الحذف (لأن splice يغيّر الترتيب)
    // لا حاجة — linkedExpenseIndex يشير لفهرس المصروف وليس فهرس المرتجع

    // إعادة حساب مبلغ المطالبة المرتبطة
    if (wasLinked && linkedClaimId && Array.isArray(window.SaddahDB.data.claims)) {
        const claim = window.SaddahDB.data.claims.find(c => String(c.id) === String(linkedClaimId));
        if (claim && claim.originalAmount != null) {
            const exp = currentSelectedOrder.expenses[linkedExpIdx];
            if (exp) {
                const expAmount = parseFloat(exp.total ?? exp.amount) || 0;
                const newLinkedTotal = (typeof getLinkedReturnsTotal === 'function')
                    ? getLinkedReturnsTotal(currentSelectedOrder, linkedExpIdx) : 0;
                claim.amount = parseFloat(Math.max(0, expAmount - newLinkedTotal).toFixed(2));
                // لو ما في مرتجعات متبقية، أزل علامة المرتجع
                if (newLinkedTotal === 0) {
                    delete claim.hasLinkedReturns;
                    delete claim.originalAmount;
                    delete claim.linkedReturnNote;
                }
            }
        }
    }

    await window.updateCurrentOrderInDB();
    if (typeof saveDocumentToOrderFS === 'function') {
        try { await saveDocumentToOrderFS(currentSelectedOrder, null, null, "المرتجعات"); } catch(e) {}
    }
    renderReturnsList();
    renderExpensesList(); // تحديث بادجات المصاريف
}

// ════════════════════════════════════════════════════════════════
//  تفاصيل التقرير (ملاحظات)
// ════════════════════════════════════════════════════════════════
async function _old_actionReportDetails() {
    if (!currentSelectedOrder) return;
    const current = currentSelectedOrder.reportNotes || '';
    const notes = prompt('اكتب ملاحظات / تفاصيل التقرير لهذا الطلب:', current);
    if (notes === null) return; // ألغى المستخدم
    currentSelectedOrder.reportNotes = notes;
    await window.updateCurrentOrderInDB();
    alert('تم حفظ تفاصيل التقرير ✓');
}
async function _old_confirmAudit() {
    if (!confirm('تأكيد جرد هذا الطلب؟\nسيُعلَّم كـ"تم الجرد"، ويُنقل مجلده إلى مجلد "تم الجرد" على الجهاز.\nالطلب يبقى محفوظاً في النظام ولن يُحذف.')) return;
    const order = currentOrders.find(o => o.id == activeOrderId);
    if (!order) return;
    // 1) تعليم الطلب كمجرود — نفس العلامة التي تستخدمها صفحة الأرشيف (status === 'تم الجرد')
    //    لا ننقله إلى مصفوفة أخرى: يبقى ضمن orders حتى يظهر في الأرشيف والتتبع ولا يختفي.
    order.status = 'تم الجرد';
    order.auditedAt = new Date().toISOString();
    // 2) حفظ مركزي (localStorage + الخادم) أولاً
    saveOrdersToLocal();
    if (typeof fsHelpers !== 'undefined' && fsHelpers.saveOrders) {
        try { await fsHelpers.saveOrders(currentOrders); } catch(e) {}
    }
    // 3) تحديث ملف بيانات الطلب داخل مجلده (ليعكس حالة "تم الجرد") قبل النقل
    if (typeof saveDocumentToOrderFS === 'function') {
        try { await saveDocumentToOrderFS(order, null, null, null); } catch(e) {}
    }
    // 4) نقل مجلد الطلب فعلياً إلى "تم الجرد" على القرص
    let folderMsg = '';
    if (typeof moveOrderToAuditedFS === 'function') {
        try {
            const r = await moveOrderToAuditedFS(order);
            if (r && r.ok) {
                folderMsg = (r.moved === false)
                    ? '\n\n📁 المجلد موجود مسبقاً داخل "تم الجرد".'
                    : '\n\n📁 تم نقل مجلد الطلب إلى "تم الجرد" على الجهاز.';
            } else {
                folderMsg = `\n\n⚠️ تعذّر نقل المجلد على القرص (الطلب محفوظ في النظام):\n${(r && r.reason) || 'سبب غير معروف'}`;
            }
        } catch(e) {
            console.error('audit move error:', e);
            folderMsg = `\n\n⚠️ خطأ أثناء نقل المجلد: ${(e && e.message) || e}`;
        }
    }
    closeDetailsModal();
    loadAndRenderOrders();
    alert('تم جرد الطلب بنجاح ✓ — محفوظ في النظام تحت حالة "تم الجرد".' + folderMsg);
}
// فتح عقد الطلب (contract_print.html) — يقرأ البيانات من localStorage('current_order')
// نفس آلية الحاسبة: نخزّن الطلب أولاً ثم نفتح صفحة العقد في تبويب جديد.
function _old_viewOrderContract() {
    const order = window.currentSelectedOrder || (typeof currentOrders !== 'undefined' && currentOrders.find(o => o.id == activeOrderId));
    if (!order) { alert('تعذّر تحديد الطلب.'); return; }
    try {
        localStorage.setItem('current_order', JSON.stringify(order));
    } catch(e) {
        console.error('current_order set error:', e);
        alert('تعذّر تجهيز بيانات العقد.');
        return;
    }
    window.open('contract_print.html', '_blank');
}
async function _old_cancelOrderFromTracking() {
    if(confirm("هل أنت متأكد من إلغاء هذا الطلب؟ سيتم إيقاف المطالبة بالمتبقي واعتبار المدفوعات كإجمالي للطلب. سيتم نقل الطلب للأرشيف.")) {
        const orderIndex = currentOrders.findIndex(o => o.id == activeOrderId);
        if(orderIndex > -1) {
            const order = currentOrders[orderIndex];
            order.status = 'ملغي';
            if (!Array.isArray(window.SaddahDB.data.archive)) window.SaddahDB.data.archive = [];
            window.SaddahDB.data.archive.push(order);
            currentOrders.splice(orderIndex, 1);
            // الحفظ أولاً ليُعاد حساب computed (العربون المحتجز) قبل تحديث المجلد
            saveOrdersToLocal();
            // تحديث مجلد الطلب على الجهاز: تسميته بـ"ملغي" + ملف تنبيه داخله
            let folderMsg = '';
            if (typeof applyCancellationToFolderFS === 'function') {
                try {
                    const r = await applyCancellationToFolderFS(order);
                    if (r && r.ok) {
                        folderMsg = `\n\n📁 تم تحديث المجلد على الجهاز:\n${r.to}`;
                    } else {
                        folderMsg = `\n\n⚠️ تعذّر تحديث مجلد الطلب على القرص:\n${(r && r.reason) || 'سبب غير معروف'}`;
                    }
                } catch(e) {
                    console.error('cancel folder error:', e);
                    folderMsg = `\n\n⚠️ خطأ أثناء تحديث المجلد: ${(e && e.message) || e}`;
                }
            }
            closeDetailsModal();
            loadAndRenderOrders();
            alert("تم إلغاء الطلب ونقله للأرشيف بنجاح!" + folderMsg);
        }
    }
}
// Bootstrap
loadAndRenderOrders();
// ── إغلاق المودالات بزر Escape والنقر على الخلفية ──────────────────
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modals = [
            { id: 'details-modal',  close: closeDetailsModal },
            { id: 'expenses-modal', close: closeExpensesModal },
            { id: 'payments-modal', close: closePaymentsModal },
            { id: 'returns-modal',  close: closeReturnsModal },
            { id: 'extra-modal',    close: closeExtraModal }
        ];
        for (const m of modals) {
            const el = document.getElementById(m.id);
            if (el && !el.classList.contains('hidden')) {
                m.close();
                break;
            }
        }
    }
});

// حفظ فاتورة مطالبة (منشأة من الطلب) في مجلد المطالبات: مطالبات/<شهر>/فواتير معلّقة/
async function saveOrderClaimPendingInvoice(claim, file) {
    if (!file || typeof callFS !== 'function') return;
    if (typeof window.compressImageFile === 'function') file = await window.compressImageFile(file);
    try {
        const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(file); });
        const b64 = (String(dataUrl || '').split(',')[1]) || '';
        if (!b64) return;
        const safe = s => String(s == null ? '' : s).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'بند';
        const d = claim.date ? new Date(claim.date) : new Date();
        const month = isNaN(d.getTime()) ? new Date().toISOString().slice(0, 7) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const ext = (file.name && file.name.includes('.')) ? file.name.split('.').pop().toLowerCase() : (/pdf/i.test(dataUrl) ? 'pdf' : /png/i.test(dataUrl) ? 'png' : 'jpg');
        const fname = `${claim.id} - ${safe(claim.employee)} - ${safe(claim.title)}.${ext}`;
        const dir = `مطالبات/${month}/فواتير معلّقة`;
        const path = `${dir}/${fname}`;
        await callFS({ action: 'mkdir', path: dir });
        const res = await callFS({ action: 'save_base64', path, content: b64 });
        if (res && res.success) { claim.pendingInvoicePath = path; claim.pendingInvoiceName = fname; }
    } catch (e) { console.error('order claim pending invoice FS error:', e); }
}

// --- Web Share Target Integration ---
let pendingSharedFile = null;
let pendingSharedAction = null;
function checkForSharedFile() {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedAction = urlParams.get("sharedAction");
    const fileId = urlParams.get("fileId");
    const openOrderId = urlParams.get("openOrderId");
    const remoteUrl = urlParams.get("remoteUrl");
    if (!sharedAction) return;
    const processFile = (file) => {
        pendingSharedFile = file;
        pendingSharedAction = sharedAction;
        if (openOrderId) {
            // Gateway mode: Auto-open the order modal, which triggers the override
            const btn = document.querySelector(`button[onclick="openDetailsModal('${openOrderId}')"]`);
            if (btn) btn.click();
            else window.openDetailsModal(openOrderId);
        } else {
            // Manual mode
            showSharedBanner();
        }
    };
    if (remoteUrl) {
        fetch(remoteUrl)
            .then(res => res.blob())
            .then(blob => {
                const ext = remoteUrl.split('.').pop() || 'jpg';
                processFile(new File([blob], `مرفق_ايفون_${Date.now()}.${ext}`, { type: blob.type }));
            })
            .catch(err => alert("تعذر تحميل الملف من الرابط."));
    } else if (fileId) {
        fetch(`api/temp_uploads/${fileId}`)
            .then(res => res.blob())
            .then(blob => {
                const ext = fileId.split('.').pop() || 'jpg';
                processFile(new File([blob], `مرفق_ايفون_${Date.now()}.${ext}`, { type: blob.type }));
            })
            .catch(err => alert("تعذر جلب الملف المشترك من الخادم."));
    } else {
        const request = indexedDB.open("SaddahShareStore", 1);
        request.onsuccess = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("sharedFiles")) return;
            const getReq = db.transaction("sharedFiles", "readonly").objectStore("sharedFiles").get("latestShare");
            getReq.onsuccess = () => {
                if (getReq.result) processFile(getReq.result);
            };
        };
    }
}
function showSharedBanner() {
    const banner = document.createElement("div");
    banner.id = "shared-file-banner";
    banner.className = "fixed top-0 left-0 w-full bg-red-600 text-white p-3 text-center font-bold z-50 shadow-lg flex justify-center items-center gap-4";
    let actionText = "مرفق";
    if (pendingSharedAction === "expense") actionText = "مصروف";
    if (pendingSharedAction === "payment") actionText = "إثبات دفع";
    if (pendingSharedAction === "return") actionText = "إيصال مرتجع";
    banner.innerHTML = `<div class="flex items-center gap-2"><i class="fa-solid fa-share-nodes animate-pulse"></i> <span>وضع المشاركة نشط: اختر الطلب بالأسفل لإضافة ( ${actionText} ).</span></div> <button onclick="cancelSharedMode()" class="text-xs bg-red-800 hover:bg-red-900 px-3 py-1 rounded-full border border-red-500">إلغاء</button>`;
    document.body.appendChild(banner);
    document.body.style.paddingTop = "50px";
}
function cancelSharedMode() {
    pendingSharedFile = null;
    pendingSharedAction = null;
    const banner = document.getElementById("shared-file-banner");
    if (banner) banner.remove();
    document.body.style.paddingTop = "0";
    const request = indexedDB.open("SaddahShareStore", 1);
    request.onsuccess = (e) => {
        const db = e.target.result;
        if (db.objectStoreNames.contains("sharedFiles")) {
            db.transaction("sharedFiles", "readwrite").objectStore("sharedFiles").delete("latestShare");
        }
    };
    window.history.replaceState({}, document.title, window.location.pathname);
}
const originalOpenDetailsModal = window.openDetailsModal;
window.openDetailsModal = function(orderId) {
    originalOpenDetailsModal(orderId);
    if (pendingSharedFile && pendingSharedAction) {
        setTimeout(() => {
            if (pendingSharedAction === "expense") {
                actionAddExpenses();
                injectSharedFile("exp-file");
            } else if (pendingSharedAction === "payment") {
                actionAddPayment();
                injectSharedFile("pay-file");
            } else if (pendingSharedAction === "return") {
                actionAddReturns();
                injectSharedFile("ret-file");
            }
            cancelSharedMode();
        }, 500);
    }
};
function injectSharedFile(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(pendingSharedFile);
    input.files = dataTransfer.files;
    const event = new Event("change");
    input.dispatchEvent(event);
}
checkForSharedFile();
// عرض الفاتورة
function _old_viewOrderInvoice() {
    const order = window.currentSelectedOrder || (typeof currentOrders !== 'undefined' && currentOrders.find(o => o.id == activeOrderId));
    if (!order) { alert('الرجاء اختيار الطلب أولاً.'); return; }
    try {
        localStorage.setItem('current_order', JSON.stringify(order));
    } catch(e) {
        console.error('current_order set error:', e);
        alert('حدث خطأ أثناء فتح الفاتورة.');
        return;
    }
    window.open('invoice_print.html', '_blank');
}
// عرض مجلد الطلب
async function _old_viewOrderFolder() {
    const order = window.currentSelectedOrder || (typeof currentOrders !== 'undefined' && currentOrders.find(o => o.id == activeOrderId));
    if (!order) { alert('الرجاء اختيار الطلب أولاً.'); return; }
    // Check if we have getOrderFolderNames from fs-helpers-save.js
    if (typeof getOrderFolderNames !== 'function') {
        alert('لا يمكن فتح المجلد لأن نظام الملفات غير متوفر.');
        return;
    }
    const { folderName, yearFolder, monthFolder, ordersFolder, statusFolder } = getOrderFolderNames(order);
    const basePath = "/saddah Archive";
    const fullPath = `${basePath}/${yearFolder}/${monthFolder}/${ordersFolder}/${statusFolder}/${folderName}/`;
    // Open in new tab
    window.open(fullPath, '_blank');
}

// يحوّل اسم الملف المجرّد (بدون مسار) إلى رابط أرشيف صحيح للطلب الحالي
function resolveAttachLink(link, subfolder) {
    if (!link) return link;
    if (/^(saddah:\/\/|https?:\/\/|data:|blob:|uploads\/|\/uploads)/i.test(link)) return link;
    const oid = window.currentSelectedOrder && window.currentSelectedOrder.id;
    if (!oid) return link;
    return link.includes('/') ? `saddah://${oid}/${link}` : `saddah://${oid}/${subfolder}/${link}`;
}
async function openPreviewModal(url, title = 'عرض الملف') {
    if (url.startsWith('saddah://')) {
        try {
            const decUrl = decodeURIComponent(url);
            const parts = decUrl.replace('saddah://', '').split('/');
            const orderId = parts.shift();
            const subPath = parts.join('/');
            let order = window.currentSelectedOrder;
            if (!order || String(order.id) !== String(orderId)) {
                order = (typeof currentOrders !== 'undefined' ? currentOrders : []).find(o => String(o.id) === String(orderId));
            }
            if (!order) {
                order = window.SaddahDB?.data?.orders?.find(o => String(o.id) === String(orderId)) || window.SaddahDB?.data?.archive?.find(o => String(o.id) === String(orderId));
            }
            if (order && typeof findOrderPathAPI === 'function') {
                const basePath = await findOrderPathAPI(order);
                if (basePath) {
                    const encodedSubPath = subPath.split('/').map(encodeURIComponent).join('/');
                    const encodedBasePath = basePath.split('/').map(encodeURIComponent).join('/');
                    url = 'saddah%20Archive/' + encodedBasePath + '/' + encodedSubPath;
                } else {
                    console.error('Order folder not found in archive:', orderId);
                    alert('المجلد غير موجود في الأرشيف');
                    return;
                }
            }
        } catch(e) {
            console.error('Failed to resolve saddah:// URL', e);
        }
    }
    let modal = document.getElementById('preview-modal');
    if (!modal) {
        const modalHtml = '<div id="preview-modal" class="fixed inset-0 z-[100] hidden flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300 opacity-0">' +
            '<div id="preview-modal-content" class="bg-white rounded-2xl w-11/12 max-w-5xl h-[90vh] shadow-2xl flex flex-col transform scale-95 transition-all duration-300">' +
                '<div class="flex justify-between items-center p-4 border-b">' +
                    '<h3 id="preview-title" class="text-xl font-bold text-slate-800">عرض الصورة</h3>' +
                    '<div class="flex gap-3">' +
                        '<a id="preview-download-btn" href="#" target="_blank" download class="btn btn-sm btn-ghost text-blue-600 hover:bg-blue-50">' +
                            '<i class="fa-solid fa-download"></i> تحميل' +
                        '</a>' +
                        '<button onclick="closePreviewModal()" class="btn btn-sm btn-circle btn-ghost text-slate-500 hover:bg-slate-100 hover:text-red-500 transition-colors">' +
                            '<i class="fa-solid fa-xmark text-lg"></i>' +
                        '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="p-4 flex-1 relative flex items-center justify-center bg-slate-50 overflow-hidden">' +
                    '<div id="preview-loader" class="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">' +
                        '<span class="loading loading-spinner loading-lg text-primary"></span>' +
                    '</div>' +
                    '<img id="preview-img" src="" class="max-w-full max-h-full object-contain hidden z-20 rounded shadow-sm" onload="document.getElementById(\'preview-loader\').classList.add(\'hidden\')" onerror="this.classList.add(\'hidden\'); document.getElementById(\'preview-loader\').classList.add(\'hidden\');">' +
                    '<iframe id="preview-iframe" src="" class="w-full h-full border-0 hidden z-20 rounded shadow-sm bg-white" onload="document.getElementById(\'preview-loader\').classList.add(\'hidden\')"></iframe>' +
                '</div>' +
            '</div>' +
        '</div>';
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('preview-modal');
    }
    const content = document.getElementById('preview-modal-content');
    const iframe = document.getElementById('preview-iframe');
    const img = document.getElementById('preview-img');
    const loader = document.getElementById('preview-loader');
    const downloadBtn = document.getElementById('preview-download-btn');
    const titleEl = document.getElementById('preview-title');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
    titleEl.innerText = title;
    loader.classList.remove('hidden');
    iframe.classList.add('hidden');
    img.classList.add('hidden');
    downloadBtn.href = url;
    if (url.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i) || url.startsWith('data:image/')) {
        img.src = url;
        img.classList.remove('hidden');
    } else {
        iframe.src = url;
        iframe.classList.remove('hidden');
    }
}
function closePreviewModal() {
    const modal = document.getElementById('preview-modal');
    if(!modal) return;
    const content = document.getElementById('preview-modal-content');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('preview-iframe').src = '';
        document.getElementById('preview-img').src = '';
    }, 300);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  المرتجعات المرتبطة بمصروف (Linked Returns)
//  يربط فاتورة المرتجع بمصروف محدد ويُحدّث المطالبة تلقائياً
// ═══════════════════════════════════════════════════════════════════════════════

let _linkedReturnExpenseIndex = null;
let _editingLinkedReturnIndex = null;
let _expensesModalWasOpen = false; // لتذكّر هل كان مودال المصاريف مفتوحاً

/**
 * حساب مجموع المرتجعات المرتبطة بمصروف محدد
 */
function getLinkedReturnsTotal(order, expIdx) {
    if (!order || !order.returns) return 0;
    return order.returns
        .filter(r => r.linkedExpenseIndex === expIdx)
        .reduce((sum, r) => sum + (parseFloat(r.refund) || 0), 0);
}

/**
 * الحصول على كل المرتجعات المرتبطة بمصروف محدد (مع فهارسها الحقيقية)
 */
function getLinkedReturnsWithIndex(order, expIdx) {
    if (!order || !order.returns) return [];
    const results = [];
    order.returns.forEach((r, realIdx) => {
        if (r.linkedExpenseIndex === expIdx) results.push({ ...r, _realIndex: realIdx });
    });
    return results;
}

/**
 * فتح نموذج تسجيل مرتجع مرتبط بمصروف
 */
function openLinkedReturnModal(expIdx) {
    if (!currentSelectedOrder || !currentSelectedOrder.expenses) return;
    const exp = currentSelectedOrder.expenses[expIdx];
    if (!exp) return;

    _linkedReturnExpenseIndex = expIdx;
    _editingLinkedReturnIndex = null;
    const amt = parseFloat(exp.total ?? exp.amount) || 0;

    // ملء بيانات المصروف الأصلي
    document.getElementById('lr-expense-desc').textContent = exp.desc || exp.name || 'مصروف';
    document.getElementById('lr-expense-amount').textContent = amt.toFixed(0) + ' ر.س';

    // معلومات المطالبة (إن وجدت)
    const claimInfo = document.getElementById('lr-claim-info');
    if (exp.claimId && Array.isArray(window.SaddahDB.data.claims)) {
        const claim = window.SaddahDB.data.claims.find(c => String(c.id) === String(exp.claimId));
        if (claim) {
            document.getElementById('lr-claim-employee').textContent = claim.employee || 'موظف';
            claimInfo.classList.remove('hidden');
        } else {
            claimInfo.classList.add('hidden');
        }
    } else {
        claimInfo.classList.add('hidden');
    }

    // عرض المرتجعات السابقة مع أزرار حذف/تعديل
    _renderLinkedReturnsList(expIdx, amt);

    // تصفير النموذج
    document.getElementById('lr-desc').value = '';
    document.getElementById('lr-amount').value = '';
    document.getElementById('lr-file').value = '';
    const saveBtn = document.querySelector('#linked-return-modal button[onclick="saveLinkedReturn()"]');
    if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> حفظ المرتجع';

    // ── إغلاق مودال المصاريف فعلياً (حل مشكلة الطبقات) ──
    const expModal = document.getElementById('expenses-modal');
    _expensesModalWasOpen = expModal && !expModal.classList.contains('hidden');
    if (_expensesModalWasOpen) {
        expModal.classList.add('opacity-0');
        document.getElementById('expenses-modal-content').classList.add('scale-95');
        setTimeout(() => expModal.classList.add('hidden'), 50);
    }

    // فتح المودال بعد تأخير بسيط لضمان إغلاق المصاريف أولاً
    setTimeout(() => {
        const modal = document.getElementById('linked-return-modal');
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            document.getElementById('linked-return-modal-content').classList.remove('scale-95');
        }, 10);
    }, _expensesModalWasOpen ? 100 : 0);
}

/**
 * عرض قائمة المرتجعات المرتبطة بمصروف داخل مودال المرتجع المرتبط
 */
function _renderLinkedReturnsList(expIdx, expAmount) {
    const existingReturns = getLinkedReturnsWithIndex(currentSelectedOrder, expIdx);
    const existingDiv = document.getElementById('lr-existing-returns');
    if (existingReturns.length > 0) {
        const listEl = document.getElementById('lr-existing-returns-list');
        listEl.innerHTML = existingReturns.map(r => `
            <div class="flex items-center justify-between gap-1 py-1 border-b border-amber-100 last:border-0">
                <span class="flex-1 truncate text-[11px]">• ${r.desc || 'مرتجع'}</span>
                <span class="font-bold shrink-0 text-[11px]">${(parseFloat(r.refund)||0).toFixed(0)} ر.س</span>
                <button onclick="_editLinkedReturn(${r._realIndex})" title="تعديل" class="bg-amber-100 hover:bg-amber-200 text-amber-700 rounded w-6 h-6 flex items-center justify-center transition shrink-0 mr-1"><i class="fa-solid fa-pen text-[9px]"></i></button>
                <button onclick="_deleteLinkedReturn(${r._realIndex})" title="حذف" class="bg-red-100 hover:bg-red-200 text-red-600 rounded w-6 h-6 flex items-center justify-center transition shrink-0"><i class="fa-solid fa-trash-can text-[9px]"></i></button>
            </div>
        `).join('');
        const totalReturned = existingReturns.reduce((s, r) => s + (parseFloat(r.refund)||0), 0);
        document.getElementById('lr-remaining-amount').textContent = (expAmount - totalReturned).toFixed(0);
        existingDiv.classList.remove('hidden');
    } else {
        existingDiv.classList.add('hidden');
    }
}

function closeLinkedReturnModal() {
    const modal = document.getElementById('linked-return-modal');
    modal.classList.add('opacity-0');
    document.getElementById('linked-return-modal-content').classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        _linkedReturnExpenseIndex = null;
        _editingLinkedReturnIndex = null;
    }, 300);

    // ── إعادة فتح مودال المصاريف إذا كان مفتوحاً قبل ──
    if (_expensesModalWasOpen) {
        setTimeout(() => {
            renderExpensesList();
            const expModal = document.getElementById('expenses-modal');
            expModal.classList.remove('hidden');
            setTimeout(() => {
                expModal.classList.remove('opacity-0');
                document.getElementById('expenses-modal-content').classList.remove('scale-95');
            }, 10);
        }, 350);
        _expensesModalWasOpen = false;
    }
}


/**
 * تحميل مرتجع مرتبط في النموذج للتعديل
 */
function _editLinkedReturn(realIdx) {
    if (!currentSelectedOrder || !currentSelectedOrder.returns) return;
    const r = currentSelectedOrder.returns[realIdx];
    if (!r) return;

    _editingLinkedReturnIndex = realIdx;
    document.getElementById('lr-desc').value = r.desc || '';
    document.getElementById('lr-amount').value = r.refund || '';
    document.getElementById('lr-file').value = '';

    // تغيير نص زر الحفظ
    const saveBtn = document.querySelector('#linked-return-modal button[onclick="saveLinkedReturn()"]');
    if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-save"></i> تحديث المرتجع';
}

/**
 * حذف مرتجع مرتبط من داخل المودال
 */
async function _deleteLinkedReturn(realIdx) {
    if (!currentSelectedOrder || !currentSelectedOrder.returns) return;
    if (!confirm('حذف هذا المرتجع؟')) return;

    const r = currentSelectedOrder.returns[realIdx];
    const wasLinkedExpIdx = r ? r.linkedExpenseIndex : null;
    const wasLinkedClaimId = r ? r.linkedClaimId : null;
    
    const exp = currentSelectedOrder.expenses[wasLinkedExpIdx];
    const expAmount = parseFloat(exp?.total ?? exp?.amount) || 0;
    const existingTotal = getLinkedReturnsTotal(currentSelectedOrder, wasLinkedExpIdx);
    const returnAmount = parseFloat(r?.refund) || 0;

    // حذف الملف (إن وجد)
    const fileName = r && (r.fileLink ? r.fileLink.split('/').pop() : null);
    let subFolder = "المرتجعات";
    if (r && r.fileLink && r.fileLink.includes('/المصروفات/')) {
        const parts = r.fileLink.split('/');
        subFolder = `المصروفات/${parts[parts.length - 2]}`;
    }
    if (fileName && typeof deleteDocumentFromOrderFS === 'function') {
        try { await deleteDocumentFromOrderFS(currentSelectedOrder, fileName, subFolder); } catch(e) {}
    }

    currentSelectedOrder.returns.splice(realIdx, 1);

    // إعادة تسمية مجلد المصروف ليطابق الصافي الجديد بعد حذف المرتجع
    if (exp) {
        const currentRemaining = expAmount - existingTotal;
        const newRemaining = expAmount - (existingTotal - returnAmount);
        const expDesc = (exp.desc || exp.name || 'مصروف').replace(/[\\/:*?"<>|]/g, '-').trim();
        const currentFolderName = `${expDesc} - ${currentRemaining} ريال`;
        const newFolderName = `${expDesc} - ${newRemaining} ريال`;

        if (newRemaining === expAmount && typeof moveExpenseFileOutOfFolder === 'function') {
            // تم حذف آخر مرتجع، يجب إخراج الفاتورة وحذف المجلد
            const originalFileName = exp.attachment && (exp.attachment.data || exp.attachment.name);
            if (originalFileName) {
                const extracted = await moveExpenseFileOutOfFolder(currentSelectedOrder, currentFolderName, originalFileName);
                if (extracted) {
                    const newLink = `saddah://${currentSelectedOrder.id}/المصروفات/${originalFileName}`;
                    if (exp.fileLink) exp.fileLink = newLink;
                    if (exp.attachment && exp.attachment.link) exp.attachment.link = newLink;
                }
            }
        } else if (typeof renameExpenseFolderInOrderFS === 'function' && currentFolderName !== newFolderName) {
            let renamed = await renameExpenseFolderInOrderFS(currentSelectedOrder, currentFolderName, newFolderName);
            if (renamed) {
                if (exp.fileLink) exp.fileLink = exp.fileLink.replace(currentFolderName, newFolderName);
                if (exp.attachment && exp.attachment.link) exp.attachment.link = exp.attachment.link.replace(currentFolderName, newFolderName);
                if (currentSelectedOrder.returns) {
                    currentSelectedOrder.returns.forEach(ret => {
                        if (ret.linkedExpenseIndex === wasLinkedExpIdx && ret.fileLink) {
                            ret.fileLink = ret.fileLink.replace(currentFolderName, newFolderName);
                        }
                    });
                }
            }
        }
    }

    // إعادة حساب مبلغ المطالبة
    _recalcLinkedClaim(wasLinkedExpIdx, wasLinkedClaimId);

    await window.updateCurrentOrderInDB();

    // إعادة عرض القائمة داخل المودال
    if (_linkedReturnExpenseIndex != null) {
        const exp = currentSelectedOrder.expenses[_linkedReturnExpenseIndex];
        const amt = parseFloat(exp?.total ?? exp?.amount) || 0;
        _renderLinkedReturnsList(_linkedReturnExpenseIndex, amt);
    }
    renderExpensesList();
    if (typeof renderReturnsList === 'function') renderReturnsList();
}

/**
 * إعادة حساب مبلغ المطالبة بعد تعديل أو حذف مرتجع
 */
function _recalcLinkedClaim(expIdx, claimId) {
    if (expIdx == null || !claimId || !Array.isArray(window.SaddahDB.data.claims)) return;
    const claim = window.SaddahDB.data.claims.find(c => String(c.id) === String(claimId));
    if (!claim) return;
    const exp = currentSelectedOrder.expenses[expIdx];
    if (!exp) return;

    const expAmount = parseFloat(exp.total ?? exp.amount) || 0;
    const newLinkedTotal = getLinkedReturnsTotal(currentSelectedOrder, expIdx);
    const newClaimAmount = Math.max(0, expAmount - newLinkedTotal);

    if (claim.originalAmount == null) {
        claim.originalAmount = parseFloat(claim.amount) || expAmount;
    }
    claim.amount = parseFloat(newClaimAmount.toFixed(2));

    if (newLinkedTotal > 0) {
        claim.hasLinkedReturns = true;
    } else {
        // لا يوجد مرتجعات متبقية
        delete claim.hasLinkedReturns;
        delete claim.originalAmount;
        delete claim.linkedReturnNote;
    }
}

/**
 * حفظ المرتجع المرتبط بمصروف (إضافة جديد أو تحديث موجود)
 */
async function saveLinkedReturn() {
    if (!currentSelectedOrder || _linkedReturnExpenseIndex === null) return;
    const expIdx = _linkedReturnExpenseIndex;
    const exp = currentSelectedOrder.expenses[expIdx];
    if (!exp) { alert('خطأ: المصروف غير موجود.'); return; }

    const desc = document.getElementById('lr-desc').value.trim();
    const returnAmount = parseFloat(document.getElementById('lr-amount').value);
    const fileInput = document.getElementById('lr-file');
    const file = fileInput.files[0];

    if (!desc) { alert('الرجاء إدخال وصف المرتجع.'); return; }
    if (isNaN(returnAmount) || returnAmount <= 0) { alert('الرجاء إدخال مبلغ صحيح للمرتجع.'); return; }

    const isEditing = _editingLinkedReturnIndex !== null;
    const expAmount = parseFloat(exp.total ?? exp.amount) || 0;

    // التحقق: مبلغ المرتجع لا يتجاوز المبلغ المتبقي (مع استثناء المرتجع قيد التعديل)
    let existingTotal = getLinkedReturnsTotal(currentSelectedOrder, expIdx);
    if (isEditing) {
        const oldReturn = currentSelectedOrder.returns[_editingLinkedReturnIndex];
        existingTotal -= (parseFloat(oldReturn?.refund) || 0);
    }
    const remaining = expAmount - existingTotal;
    if (returnAmount > remaining + 0.01) {
        alert(`مبلغ المرتجع (${returnAmount}) يتجاوز المبلغ المتبقي (${remaining.toFixed(0)}).`);
        return;
    }

    // ── حفظ فاتورة المرتجع داخل المجلد الجديد ──────────────────
    let fileLink = isEditing ? (currentSelectedOrder.returns[_editingLinkedReturnIndex]?.fileLink || '') : '';
    const safeDesc = desc.replace(/[\\/:*?"<>|]/g, '-').trim();
    const expDesc = (exp.desc || exp.name || 'مصروف').replace(/[\\/:*?"<>|]/g, '-').trim();
    
    const oldReturnAmt = isEditing ? (parseFloat(currentSelectedOrder.returns[_editingLinkedReturnIndex]?.refund) || 0) : 0;
    const oldRemaining = expAmount - (existingTotal + oldReturnAmt);
    const newRemaining = remaining - returnAmount;
    
    const possibleOldFolder1 = `${expDesc} - ${oldRemaining} ريال`;
    const possibleOldFolder2 = `${expDesc} - ${expAmount} ريال`; // For old unmigrated
    const newExpFolderName = `${expDesc} - ${newRemaining} ريال`;
    const targetSubFolder = `المصروفات/${newExpFolderName}`;

    // حاول إعادة تسمية المجلد القديم إلى الجديد
    let renamed = false;
    if (typeof renameExpenseFolderInOrderFS === 'function' && possibleOldFolder1 !== newExpFolderName) {
        renamed = await renameExpenseFolderInOrderFS(currentSelectedOrder, possibleOldFolder1, newExpFolderName);
        if (!renamed && possibleOldFolder1 !== possibleOldFolder2) {
            renamed = await renameExpenseFolderInOrderFS(currentSelectedOrder, possibleOldFolder2, newExpFolderName);
        }
        if (renamed) {
            // تحديث رابط المصروف الأصلي
            if (exp.fileLink) {
                exp.fileLink = exp.fileLink.replace(possibleOldFolder1, newExpFolderName).replace(possibleOldFolder2, newExpFolderName);
            }
            if (exp.attachment && exp.attachment.link) {
                exp.attachment.link = exp.attachment.link.replace(possibleOldFolder1, newExpFolderName).replace(possibleOldFolder2, newExpFolderName);
            }
            // تحديث روابط المرتجعات الأخرى المرتبطة بنفس المصروف
            if (currentSelectedOrder.returns) {
                currentSelectedOrder.returns.forEach(r => {
                    if (r.linkedExpenseIndex === expIdx && r.fileLink) {
                        r.fileLink = r.fileLink.replace(possibleOldFolder1, newExpFolderName).replace(possibleOldFolder2, newExpFolderName);
                    }
                });
            }
        }
    }

    // إذا لم ينجح إعادة التسمية (ربما لأنه لم يكن هناك مجلد أصلاً بل ملف مباشر)
    if (!renamed && typeof moveStandaloneExpenseFileToFolder === 'function') {
        const standaloneFileName = exp.attachment && (exp.attachment.data || exp.attachment.name);
        if (standaloneFileName) {
            const moved = await moveStandaloneExpenseFileToFolder(currentSelectedOrder, standaloneFileName, newExpFolderName);
            if (moved) {
                const newLink = `saddah://${currentSelectedOrder.id}/المصروفات/${newExpFolderName}/${standaloneFileName}`;
                exp.fileLink = newLink;
                if (exp.attachment) exp.attachment.link = newLink;
            }
        }
    }

    // التأكد من وجود المجلد الجديد (في حال لم يكن موجوداً أصلاً)
    if (typeof createFolderInOrderFS === 'function') {
        try { await createFolderInOrderFS(currentSelectedOrder, newExpFolderName, "المصروفات"); } catch(e) {}
    }

    // حفظ ملف المرتجع الجديد
    if (file && typeof saveDocumentToOrderFS === 'function') {
        const ext = file.name.split('.').pop();
        const fileName = `[مسترجع] ${safeDesc} - ${returnAmount} ريال.${ext}`;

        if (isEditing) {
            const oldReturn = currentSelectedOrder.returns[_editingLinkedReturnIndex];
            const oldFileLink = oldReturn?.fileLink;
            if (oldFileLink) {
                const oldFileName = oldFileLink.split('/').pop();
                if (oldFileName !== fileName) {
                    try { await deleteDocumentFromOrderFS(currentSelectedOrder, oldFileName, targetSubFolder); } catch(e) {}
                }
            }
        }

        const ok = await saveDocumentToOrderFS(currentSelectedOrder, file, fileName, targetSubFolder);
        if (!ok) throw new Error("فشل إرفاق الفاتورة بسبب امتلاء المساحة أو مشكلة بالصلاحيات.");
        fileLink = currentSelectedOrder.folderHandle
            ? `saddah://${currentSelectedOrder.id}/${targetSubFolder}/${fileName}`
            : fileName;
    } else if (isEditing && typeof renameDocumentInOrderFS === 'function') {
        const oldReturn = currentSelectedOrder.returns[_editingLinkedReturnIndex];
        const oldFileLink = oldReturn?.fileLink;
        if (oldFileLink) {
            const oldFileName = oldFileLink.split('/').pop();
            const ext = oldFileName.includes('.') ? oldFileName.split('.').pop() : 'pdf';
            const newFileName = `[مسترجع] ${safeDesc} - ${returnAmount} ريال.${ext}`;
            if (oldFileName !== newFileName) {
                const ok = await renameDocumentInOrderFS(currentSelectedOrder, oldFileName, newFileName, targetSubFolder);
                if (!ok) throw new Error("فشل إعادة تسمية المستند المرفق بسبب امتلاء المساحة.");
                fileLink = currentSelectedOrder.folderHandle
                    ? `saddah://${currentSelectedOrder.id}/${targetSubFolder}/${newFileName}`
                    : newFileName;
            }
        }
    } else if (!file && !isEditing && typeof createFolderInOrderFS === 'function') {
        const folderName = `[مسترجع] ${safeDesc} - ${returnAmount} ريال`;
        const ok = await createFolderInOrderFS(currentSelectedOrder, folderName, targetSubFolder);
        if (!ok) throw new Error("فشل إنشاء مجلد المرتجع بسبب امتلاء المساحة.");
    }


    if (isEditing) {
        // ── تحديث مرتجع موجود ──
        const existing = currentSelectedOrder.returns[_editingLinkedReturnIndex];
        existing.desc = desc;
        existing.refund = returnAmount;
        if (fileLink) existing.fileLink = fileLink;
    } else {
        // ── إضافة مرتجع جديد ──
        const newReturn = {
            desc: desc,
            refund: returnAmount,
            deducted: 0,
            date: new Date().toLocaleDateString('ar-SA'),
            linkedExpenseIndex: expIdx,
            linkedClaimId: exp.claimId || null,
            fileLink: fileLink
        };
        if (!currentSelectedOrder.returns) currentSelectedOrder.returns = [];
        currentSelectedOrder.returns.push(newReturn);
    }

    // ── تحديث المطالبة تلقائياً (إن وجدت) ──
    let claimUpdated = false;
    if (exp.claimId && Array.isArray(window.SaddahDB.data.claims)) {
        const claim = window.SaddahDB.data.claims.find(c => String(c.id) === String(exp.claimId));
        if (claim && claim.status === 'pending') {
            _recalcLinkedClaim(expIdx, exp.claimId);
            claim.linkedReturnNote = `فاتورة مرتجعة: ${desc} بمبلغ ${returnAmount} ر.س`;
            claimUpdated = true;
        }
    }

    // حفظ كل شيء
    await window.updateCurrentOrderInDB();

    // ── إعادة عرض القائمة داخل المودال (لإظهار المرتجع الجديد) ──
    _editingLinkedReturnIndex = null;
    _renderLinkedReturnsList(expIdx, expAmount);

    // تصفير النموذج
    document.getElementById('lr-desc').value = '';
    document.getElementById('lr-amount').value = '';
    document.getElementById('lr-file').value = '';
    const saveBtn = document.querySelector('#linked-return-modal button[onclick="saveLinkedReturn()"]');
    if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> حفظ المرتجع';

    renderExpensesList();
    if (typeof renderReturnsList === 'function') renderReturnsList();
    if (typeof renderData === 'function') renderData();

    const msg = claimUpdated
        ? (isEditing ? 'تم تحديث المرتجع ومبلغ المطالبة ✓' : 'تم حفظ المرتجع وتحديث مبلغ مطالبة الموظف تلقائياً ✓')
        : (isEditing ? 'تم تحديث المرتجع بنجاح ✓' : 'تم حفظ المرتجع بنجاح ✓');
    alert(msg);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  إصلاح مجلدات المصاريف — ينقل ملفات المرتجعات داخل مجلد المصروف الأصلي
//  يمكن تشغيلها من: fixOrderExpenseFolders()  (على الطلب المحدد حالياً)
// ═══════════════════════════════════════════════════════════════════════════════
async function fixOrderExpenseFolders(order) {
    order = order || currentSelectedOrder;
    if (!order) { alert('لا يوجد طلب محدد!'); return; }
    if (!order.expenses || !order.returns) { alert('لا توجد مصاريف أو مرتجعات لهذا الطلب.'); return; }
    if (typeof createFolderInOrderFS !== 'function') { alert('نظام الملفات غير متاح.'); return; }

    let fixCount = 0;
    const exps = order.expenses;
    const rets = order.returns;

    for (let expIdx = 0; expIdx < exps.length; expIdx++) {
        const exp = exps[expIdx];
        const linkedReturns = rets.filter(r => r.linkedExpenseIndex === expIdx);
        if (linkedReturns.length === 0) continue;

        const expAmount = parseFloat(exp.total ?? exp.amount) || 0;
        const expDesc = (exp.desc || exp.name || 'مصروف').replace(/[\\/:*?"<>|]/g, '-').trim();
        const expFolderName = `${expDesc} - ${expAmount} ريال`;
        const targetSubFolder = `المصروفات/${expFolderName}`;

        // 1) إنشاء مجلد المصروف بالمبلغ الكامل (إن لم يكن موجوداً)
        try { await createFolderInOrderFS(order, expFolderName, "المصروفات"); } catch(e) {}

        // 2) لكل مرتجع مرتبط، أنشئ مجلد فرعي بادئة [مسترجع]
        for (const ret of linkedReturns) {
            const retDesc = (ret.desc || 'مرتجع').replace(/[\\/:*?"<>|]/g, '-').trim();
            const retAmount = parseFloat(ret.refund) || 0;
            const retFolderName = `[مسترجع] ${retDesc} - ${retAmount} ريال`;

            try {
                await createFolderInOrderFS(order, retFolderName, targetSubFolder);
                fixCount++;
            } catch(e) {
                console.error('خطأ في إنشاء مجلد المرتجع:', e);
            }
        }
    }

    // تحديث ملف JSON الطلب
    try { await saveDocumentToOrderFS(order, null, null, null); } catch(e) {}

    alert(`تم إصلاح مجلدات المصاريف ✅\nعدد المرتجعات المنظّمة: ${fixCount}\n\nافتح مجلد الطلب للتحقق.`);
}
// اجعلها متاحة عالمياً
window.fixOrderExpenseFolders = fixOrderExpenseFolders;

// ═══════════════════════════════════════════════════════════════════════════════
//  إصلاح المطالبات المكررة — يحذف المطالبات المكررة لنفس المصروف
//  يُبقي المطالبة المدفوعة (settled) أو الأقدم في حال التعارض
//  التشغيل: fixDuplicateClaims()   أو   fixDuplicateClaims('8798')  لطلب معين
// ═══════════════════════════════════════════════════════════════════════════════
function fixDuplicateClaims(orderId) {
    if (!Array.isArray(window.SaddahDB.data.claims)) { alert('لا توجد مطالبات.'); return; }
    const claims = window.SaddahDB.data.claims;
    const orders = window.SaddahDB.data.orders || [];

    // البحث في كل الطلبات أو طلب محدد
    const targetOrders = orderId
        ? orders.filter(o => String(o.id).includes(String(orderId)))
        : orders;

    let removedCount = 0;
    let fixedCount = 0;

    for (const order of targetOrders) {
        if (!order.expenses) continue;

        for (let expIdx = 0; expIdx < order.expenses.length; expIdx++) {
            const exp = order.expenses[expIdx];
            if (!exp.claimId) continue;

            // البحث عن كل المطالبات المرتبطة بهذا الطلب ونفس الوصف
            const relatedClaims = claims.filter(c =>
                String(c.orderId) === String(order.id) &&
                c.source === 'order-expense' &&
                (c.title || '').includes(exp.desc || exp.name || '___')
            );

            if (relatedClaims.length <= 1) continue;

            // الأولوية: المطالبة المدفوعة (settled/batchId) → المطالبة المرتبطة بالمصروف → الأقدم
            let keepClaim = relatedClaims.find(c => c.status === 'settled' || c.batchId);
            if (!keepClaim) keepClaim = relatedClaims.find(c => String(c.id) === String(exp.claimId));
            if (!keepClaim) keepClaim = relatedClaims[0];

            // حذف المكررات
            for (const dup of relatedClaims) {
                if (String(dup.id) === String(keepClaim.id)) continue;
                const ci = claims.findIndex(c => String(c.id) === String(dup.id));
                if (ci > -1) {
                    console.log(`🗑️ حذف مطالبة مكررة: "${dup.title}" (${dup.id}) — status: ${dup.status}`);
                    claims.splice(ci, 1);
                    removedCount++;
                }
            }

            // ربط المصروف بالمطالبة الصحيحة
            if (String(exp.claimId) !== String(keepClaim.id)) {
                console.log(`🔗 ربط المصروف "${exp.desc}" بالمطالبة الصحيحة: ${keepClaim.id}`);
                exp.claimId = keepClaim.id;
                fixedCount++;
            }
        }
    }

    // حفظ
    window.SaddahDB.save();
    if (typeof fsHelpers !== 'undefined' && fsHelpers.saveOrders) {
        fsHelpers.saveOrders(orders);
    }

    const targetName = orderId ? `طلب ${orderId}` : 'كل الطلبات';
    alert(`إصلاح المطالبات ✅ (${targetName})\n\nمطالبات مكررة محذوفة: ${removedCount}\nروابط مُصلَحة: ${fixedCount}`);
}
window.fixDuplicateClaims = fixDuplicateClaims;



