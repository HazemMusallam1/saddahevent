// archive.js

// Script loaded dynamically after SaddahDB.init() — initialize directly
let allOrders = (window.SaddahDB && window.SaddahDB.data.orders) || [];
let filteredOrders = [];
let currentAuditOrder = null;

function fmtDateOnly(d) {
    if (!d) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    try {
        const obj = new Date(d);
        if (isNaN(obj.getTime())) return typeof d === 'string' ? d.substring(0, 10) : String(d);
        return `${obj.getFullYear()}-${String(obj.getMonth()+1).padStart(2,'0')}-${String(obj.getDate()).padStart(2,'0')}`;
    } catch(e) { return String(d); }
}
function renderAttachBtnArchive(att) {
    if (!att || att.type === 'folder') return '';
    let url = att.data || att.link || '';
    if (window.resolveSaddahUrl) url = window.resolveSaddahUrl(url);
    if (!url) return '';
    const name = (att.name || 'مرفق').replace(/'/g, "\\'");
    const safeUrl = url.replace(/'/g, "\\'");
    const ext = (name.split('.').pop() || '').toLowerCase();
    const isPdf = ext === 'pdf' || (att.type || '').includes('pdf');
    const isImg = ['jpg','jpeg','png','gif','webp'].includes(ext) || (att.type || '').startsWith('image');
    if (att.type === 'link') return `<a href="${safeUrl}" target="_blank" class="text-blue-500 hover:text-blue-700 mr-1" title="رابط"><i class="fa-solid fa-external-link text-[10px]"></i></a>`;
    const icon = isPdf ? 'fa-file-pdf text-red-400' : isImg ? 'fa-image text-emerald-400' : 'fa-file text-slate-400';
    return `<button onclick="window.open('${safeUrl}','_blank')" class="text-slate-500 hover:text-indigo-600 mr-1" title="${name}"><i class="fa-solid ${icon} text-[10px]"></i></button>`;
}

function loadOrders() {
    allOrders = (window.SaddahDB && window.SaddahDB.data.orders) || [];
}

function convertArabicNumerals(str) {
    if (!str) return '';
    const arabicNumbers = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return str.split('').map(char => {
        let index = arabicNumbers.indexOf(char);
        if (index !== -1) return index;
        return char;
    }).join('').replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '');
}

function getOrderMonth(order) {
    let dateStr = order.client?.deliveryDate || order.date;
    if (!dateStr) return 'غير محدد';
    
    // Clean string from Arabic Numerals (١٢٣) and Invisible chars
    dateStr = convertArabicNumerals(String(dateStr)).trim();

    // 1. Standard HTML5 date format (YYYY-MM-DD)
    if (/^\d{4}-\d{2}/.test(dateStr)) {
        return dateStr.substring(0, 7);
    }
    
    // 2. Format DD/MM/YYYY or DD-MM-YYYY
    const euroDateMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (euroDateMatch) {
        const y = euroDateMatch[3];
        let m = euroDateMatch[2]; // usually MM is in the middle for our region
        if (m.length === 1) m = '0' + m;
        return `${y}-${m}`;
    }

    // 2.5 Format YYYY/MM/DD or YYYY-MM-DD (with standard numerals)
    const reverseDateMatch = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (reverseDateMatch) {
        const y = reverseDateMatch[1];
        let m = reverseDateMatch[2];
        if (m.length === 1) m = '0' + m;
        return `${y}-${m}`;
    }

    // 3. Look for Arabic month names
    const arabicMonths = {
        "يناير": "01", "جانفي": "01",
        "فبراير": "02", "فيفري": "02",
        "مارس": "03",
        "ابريل": "04", "أبريل": "04",
        "مايو": "05",
        "يونيو": "06",
        "يوليو": "07",
        "اغسطس": "08", "أغسطس": "08",
        "سبتمبر": "09",
        "اكتوبر": "10", "أكتوبر": "10",
        "نوفمبر": "11",
        "ديسمبر": "12"
    };

    let m = null;
    for (const [key, value] of Object.entries(arabicMonths)) {
        if (dateStr.includes(key)) {
            m = value;
            break;
        }
    }

    // 4. Try JS native parsing if no Arabic month was found
    if (!m) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            m = String(d.getMonth() + 1).padStart(2, '0');
            return `${y}-${m}`;
        }
    }

    // 5. Fallback regex for Year and Month
    const yearMatch = dateStr.match(/\b(20\d{2})\b/);
    const y = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

    if (!m) {
        const mMatch = dateStr.match(/\b(1[0-2]|0?[1-9])\b/);
        if (mMatch) {
            m = mMatch[1];
            if (m.length === 1) m = '0' + m;
        } else {
            // Ultimate fallback to order creation date or current month
            m = String(new Date().getMonth() + 1).padStart(2, '0');
        }
    }

    return `${y}-${m}`;
}

function populateFilters() {
    const yearSelect = document.getElementById('year-filter');
    const years = new Set();
    
    // Add current year as a fallback in case there are no orders
    const currentYear = new Date().getFullYear().toString();
    years.add(currentYear);
    
    allOrders.forEach(order => {
        const ym = getOrderMonth(order);
        if (ym !== 'غير محدد') {
            const y = ym.split('-')[0];
            years.add(y);
        }
    });

    // Sort descending
    const sortedYears = Array.from(years).sort().reverse();
    
    sortedYears.forEach(y => {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        yearSelect.appendChild(option);
    });
}

function setDefaults() {
    const today = new Date();
    const currentYear = today.getFullYear().toString();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    
    const yearSelect = document.getElementById('year-filter');
    const monthSelect = document.getElementById('month-filter');
    
    if (yearSelect.querySelector(`option[value="${currentYear}"]`)) {
        yearSelect.value = currentYear;
    }
    
    monthSelect.value = currentMonth;
}

function formatMonthStr(ym) {
    // ym is YYYY-MM
    const parts = ym.split('-');
    if (parts.length !== 2) return ym;
    const year = parts[0];
    const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    const mIdx = parseInt(parts[1], 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
        return `${monthNames[mIdx]} ${year}`;
    }
    return ym;
}

function filterArchive() {
    const selectedYear = document.getElementById('year-filter').value;
    const selectedMonth = document.getElementById('month-filter').value;
    const label = document.getElementById('current-month-label');
    
    if (selectedMonth === 'all') {
        filteredOrders = allOrders.filter(o => {
            const m = getOrderMonth(o);
            return m !== 'غير محدد' && m.startsWith(selectedYear);
        });
        label.textContent = "لعام " + selectedYear;
    } else {
        const targetYM = `${selectedYear}-${selectedMonth}`;
        filteredOrders = allOrders.filter(o => getOrderMonth(o) === targetYM);
        const monthName = document.getElementById('month-filter').options[document.getElementById('month-filter').selectedIndex].text;
        label.textContent = `لشهر ${monthName} ${selectedYear}`;
    }
    
    renderDashboard();
    renderTable();
}

function calculateOrderFinancials(order) {
    if (!order.computed) return { revenue: 0, received: 0, remaining: 0, totalExpenses: 0, profit: 0, fuel: 0 };
    return {
        revenue: order.computed.revenue,
        received: order.computed.received,
        remaining: order.computed.remaining,
        totalExpenses: order.computed.totalExpenses,
        profit: order.computed.netProfit,
        fuel: order.computed.fuel
    };
}

function renderDashboard() {
    let sumRevenue = 0, sumExpenses = 0, sumDebts = 0, sumProfit = 0, sumFuel = 0;
    
    filteredOrders.forEach(order => {
        const fin = calculateOrderFinancials(order);
        sumRevenue += fin.revenue;
        sumExpenses += fin.totalExpenses;
        sumDebts += fin.remaining;
        sumProfit += fin.profit;
        sumFuel += fin.fuel;
    });

    const operatingShare = sumProfit > 0 ? (sumProfit * 0.10) : 0;
    const netOperating = operatingShare - sumFuel;
    const distributable = sumProfit > 0 ? (sumProfit * 0.90) : 0;
    const groupShare = distributable / 3;

    document.getElementById('stat-revenue').innerHTML = `${sumRevenue.toFixed(2)} <span class="text-sm text-slate-400">ر.س</span>`;
    document.getElementById('stat-expenses').innerHTML = `${sumExpenses.toFixed(2)} <span class="text-sm text-slate-400">ر.س</span>`;
    document.getElementById('stat-debts').innerHTML = `${sumDebts.toFixed(2)} <span class="text-sm text-slate-400">ر.س</span>`;
    document.getElementById('stat-profit').innerHTML = `${sumProfit.toFixed(2)} <span class="text-sm text-blue-500">ر.س</span>`;
    
    document.getElementById('stat-op').textContent = `${netOperating.toFixed(2)}`;
    document.getElementById('stat-g1').textContent = `${groupShare.toFixed(2)}`;
    document.getElementById('stat-g2').textContent = `${groupShare.toFixed(2)}`;
    document.getElementById('stat-g3').textContent = `${groupShare.toFixed(2)}`;
}

function renderTable() {
    const tbody = document.getElementById('archive-table-body');
    const emptyState = document.getElementById('empty-state');
    
    tbody.innerHTML = '';
    
    let auditedCount = 0;
    let pendingCount = 0;

    if (filteredOrders.length === 0) {
        emptyState.classList.remove('hidden');
        document.getElementById('count-audited').textContent = 0;
        document.getElementById('count-pending').textContent = 0;
        return;
    }
    
    emptyState.classList.add('hidden');

    filteredOrders.forEach(order => {
        const fin = calculateOrderFinancials(order);
        const isAudited = order.status === 'تم الجرد';
        if (isAudited) auditedCount++; else pendingCount++;

        const clientName = order.client?.name || 'غير معروف';
        const orderDate = order.client?.deliveryDate || order.date || '-';
        
        let statusBadge = '';
        if (order.status === 'cancelled' || order.status === 'ملغي') {
            statusBadge = `<span class="bg-red-50 text-red-600 px-2 py-1 rounded text-xs font-bold border border-red-100">ملغي (عربون)</span>`;
        } else if (isAudited) {
            statusBadge = `<span class="bg-emerald-50 text-emerald-600 px-2 py-1 rounded text-xs font-bold border border-emerald-100">تم الجرد</span>`;
        } else {
            statusBadge = `<span class="bg-orange-50 text-orange-600 px-2 py-1 rounded text-xs font-bold border border-orange-100">قيد الانتظار</span>`;
        }

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition";
        tr.innerHTML = `
            <td class="py-4 px-6 font-bold text-slate-700">#${order.id}</td>
            <td class="py-4 px-6 text-slate-600">${clientName}</td>
            <td class="py-4 px-6 text-slate-500 text-xs font-bold">${orderDate}</td>
            <td class="py-4 px-6 text-slate-700 font-bold">${fin.revenue.toFixed(2)}</td>
            <td class="py-4 px-6 text-red-500 font-bold">${fin.totalExpenses.toFixed(2)}</td>
            <td class="py-4 px-6 text-emerald-600 font-black">${fin.profit.toFixed(2)}</td>
            <td class="py-4 px-6 font-black ${fin.remaining > 0 ? 'text-orange-500' : 'text-emerald-500'}">${fin.remaining.toFixed(2)}</td>
            <td class="py-4 px-6">${statusBadge}</td>
            <td class="py-4 px-6 text-center flex justify-center items-center gap-2">
                <button onclick="openAuditModal('${order.id}')" class="bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm">
                    تفاصيل وجرد
                </button>
                ${(order.status !== 'cancelled' && order.status !== 'ملغي') ? `
                <button onclick="window.ArchiveActions.cancelOrder('${order.id}')" class="bg-white border border-orange-200 text-orange-500 hover:bg-orange-50 w-8 h-8 flex items-center justify-center rounded-lg transition shadow-sm" title="إلغاء الطلب (حجز العربون كربح)">
                    <i class="fa-solid fa-ban"></i>
                </button>
                ` : ''}
                <button onclick="window.ArchiveActions.deleteOrder('${order.id}')" class="bg-white border border-red-200 text-red-500 hover:bg-red-50 w-8 h-8 flex items-center justify-center rounded-lg transition shadow-sm" title="حذف الطلب">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('count-audited').textContent = auditedCount;
    document.getElementById('count-pending').textContent = pendingCount;
}

// --- Auditing Modal ---

function openAuditModal(orderId) {
    currentAuditOrder = allOrders.find(o => o.id.toString() === orderId.toString());
    if (!currentAuditOrder) return;

    const fin = calculateOrderFinancials(currentAuditOrder);
    
    document.getElementById('audit-title').textContent = `الطلب #${currentAuditOrder.id}`;
    document.getElementById('am-revenue').textContent = fin.revenue.toFixed(2);
    document.getElementById('am-received').textContent = fin.received.toFixed(2);
    document.getElementById('am-remaining').textContent = fin.remaining.toFixed(2);
    document.getElementById('am-expenses').textContent = fin.totalExpenses.toFixed(2);
    // صافي الربح من الطبقة الموحّدة (يحترم علامة شامل الضريبة) بدل إعادة حسابه
    document.getElementById('am-net-profit').textContent = fin.profit.toFixed(2);

    // حالة زر "شامل الضريبة"
    const taxOn = currentAuditOrder.financials?.includeTaxInProfit === true;
    const taxBtn = document.getElementById('am-tax-btn');
    const taxLbl = document.getElementById('am-tax-label');
    if (taxLbl) taxLbl.textContent = taxOn ? 'شامل الضريبة ✓' : 'غير شامل الضريبة';
    if (taxBtn) {
        taxBtn.classList.toggle('bg-purple-600', taxOn);
        taxBtn.classList.toggle('text-white', taxOn);
        taxBtn.classList.toggle('text-purple-600', !taxOn);
        taxBtn.classList.toggle('bg-white', !taxOn);
    }
    
    document.getElementById('audit-client-name').textContent = currentAuditOrder.client?.name || 'غير معروف';
    document.getElementById('audit-delivery-date').textContent = currentAuditOrder.client?.deliveryDate || currentAuditOrder.date || '-';
    document.getElementById('audit-order-status').textContent = currentAuditOrder.status || 'قيد الانتظار';

    // Warnings Logic
    const warningsList = document.getElementById('audit-warnings-list');
    const warningsContainer = document.getElementById('audit-warnings-container');
    warningsList.innerHTML = '';
    let warnings = [];

    if (fin.remaining > 0) {
        warnings.push(`العميل لم يدفع كامل المبلغ! (متبقي ${fin.remaining.toFixed(2)} ريال)`);
    }
    if (currentAuditOrder.status !== 'مكتمل' && currentAuditOrder.status !== 'جاهز للتسليم' && currentAuditOrder.status !== 'تم الجرد') {
        warnings.push(`الطلب لم يكتمل بعد! (الحالة الحالية: ${currentAuditOrder.status || 'قيد الانتظار'})`);
    }

    if (warnings.length > 0) {
        warningsContainer.classList.remove('hidden');
        warnings.forEach(w => {
            const li = document.createElement('li');
            li.textContent = w;
            warningsList.appendChild(li);
        });
    } else {
        warningsContainer.classList.add('hidden');
    }

    // Populate Lists
    const itemsList = document.getElementById('audit-items-list');
    const paymentsList = document.getElementById('audit-payments-list');
    const expensesList = document.getElementById('audit-expenses-list');
    const returnsList = document.getElementById('audit-returns-list');

    // 1. Items
    if (!currentAuditOrder.items || currentAuditOrder.items.length === 0) {
        itemsList.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">لا يوجد تفاصيل للخدمات</p>';
    } else {
        const subTotal = parseFloat(currentAuditOrder.financials?.subTotal) || 0;
        const totalWithTax = parseFloat(String(currentAuditOrder.financials?.total).replace(' ريال','')) || 0;
        const tax = totalWithTax - subTotal;
        itemsList.innerHTML = currentAuditOrder.items.map(i => `
            <div class="flex justify-between items-center text-[10px] bg-slate-50 p-1.5 rounded border border-slate-100">
                <span class="font-bold text-slate-700 truncate mr-2" title="${i.desc}">${i.desc} (x${i.qty})</span>
                <span class="text-blue-600 font-black flex-shrink-0">${parseFloat(i.total).toFixed(2)}</span>
            </div>
        `).join('') + `
            <div class="mt-2 pt-2 border-t border-slate-200 space-y-1">
                <div class="flex justify-between text-[10px] text-slate-500"><span>قبل الضريبة</span><span class="font-bold">${subTotal.toFixed(2)}</span></div>
                ${tax > 0 ? `<div class="flex justify-between text-[10px] text-slate-500"><span>الضريبة (${currentAuditOrder.financials?.vatRate || 15}%)</span><span class="font-bold">${tax.toFixed(2)}</span></div>` : ''}
                <div class="flex justify-between text-[11px] text-blue-700 font-black"><span>قيمة الطلب (شامل الضريبة)</span><span>${totalWithTax.toFixed(2)}</span></div>
            </div>`;
    }

    // 2. Payments
    if (!currentAuditOrder.paymentProofs || currentAuditOrder.paymentProofs.length === 0) {
        paymentsList.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">لا يوجد دفعات مسجلة</p>';
    } else {
        paymentsList.innerHTML = currentAuditOrder.paymentProofs.map(p => {
            const desc = p.desc || p.note || p.method || 'دفعة';
            const date = fmtDateOnly(p.date);
            const methodBadge = p.method === 'كاش' ? '<span class="text-[9px] bg-green-50 text-green-700 border border-green-200 rounded px-1 py-0.5 font-bold">كاش</span>'
                : p.method === 'تحويل' ? '<span class="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1 py-0.5 font-bold">تحويل</span>' : '';
            const attBtn = renderAttachBtnArchive(p.attachment);
            return `<div class="flex items-center gap-1 text-[10px] bg-slate-50 p-1.5 rounded border border-slate-100">
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-slate-700 truncate" title="${desc}">${desc} ${methodBadge}</div>
                    ${date ? `<div class="text-[9px] text-slate-400">${date}</div>` : ''}
                </div>
                ${attBtn}
                <span class="text-emerald-600 font-black flex-shrink-0">${parseFloat(p.amount || 0).toFixed(0)} ر.س</span>
            </div>`;
        }).join('');
    }

    // 3. Expenses
    if (!currentAuditOrder.expenses || currentAuditOrder.expenses.length === 0) {
        expensesList.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">لا يوجد مصروفات مسجلة</p>';
    } else {
        expensesList.innerHTML = currentAuditOrder.expenses.map((e, idx) => {
            const desc = e.desc || e.supplier || e.name || 'مصروف';
            const date = fmtDateOnly(e.date);
            const attBtn = renderAttachBtnArchive(e.attachment);
            
            let returnAmt = 0;
            if (currentAuditOrder.returns) {
                currentAuditOrder.returns.forEach(r => {
                    if (r.linkedExpenseIndex === idx) returnAmt += parseFloat(r.refund) || 0;
                });
            }
            
            let originalCost = parseFloat(e.total);
            if (isNaN(originalCost) || originalCost <= 0) originalCost = parseFloat(e.afterDiscount);
            if (isNaN(originalCost) || originalCost <= 0) originalCost = parseFloat(e.amountAfterDiscount);
            if (isNaN(originalCost) || originalCost <= 0) originalCost = parseFloat(e.amount) || 0;
            
            const netCost = originalCost - returnAmt > 0 ? originalCost - returnAmt : 0;
            const netCostHtml = returnAmt > 0 
                ? `<div class="text-left"><span class="text-[9px] text-orange-500 font-bold block mb-0.5" title="مسترجع">-${returnAmt.toFixed(0)} ر.س</span><span class="text-red-600 font-black flex-shrink-0">${netCost.toFixed(0)} ر.س</span></div>`
                : `<span class="text-red-600 font-black flex-shrink-0">${originalCost.toFixed(0)} ر.س</span>`;

            return `<div class="flex items-center gap-1 text-[10px] bg-slate-50 p-1.5 rounded border border-slate-100">
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-slate-700 truncate" title="${desc}">${desc}</div>
                    ${date ? `<div class="text-[9px] text-slate-400">${date}</div>` : ''}
                </div>
                ${attBtn}
                ${netCostHtml}
            </div>`;
        }).join('');
    }

    // 4. Returns
    const generalReturns = (currentAuditOrder.returns || []).filter(r => r.linkedExpenseIndex == null);
    if (generalReturns.length === 0) {
        returnsList.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">لا يوجد مرتجعات مسجلة</p>';
    } else {
        returnsList.innerHTML = generalReturns.map(r => {
            const desc = r.desc || r.reason || 'مرتجع';
            const date = fmtDateOnly(r.date);
            const attBtn = renderAttachBtnArchive(r.attachment);
            const deducted = parseFloat(r.deducted || 0);
            return `<div class="flex items-center gap-1 text-[10px] bg-slate-50 p-1.5 rounded border border-slate-100">
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-slate-700 truncate" title="${desc}">${desc}</div>
                    ${date ? `<div class="text-[9px] text-slate-400">${date}${deducted > 0 ? ` · خصم ${deducted} ر.س` : ''}</div>` : ''}
                </div>
                ${attBtn}
                <span class="text-orange-600 font-black flex-shrink-0">${parseFloat(r.refund || 0).toFixed(0)} ر.س</span>
            </div>`;
        }).join('');
    }

    // Provide a link to tracking
    document.getElementById('link-tracking').href = `order_tracking.html?orderId=${currentAuditOrder.id}`;
    
    // View and Edit Contract buttons
    document.getElementById('btn-view-contract').onclick = () => {
        window.open(`report_single.html?orderId=${currentAuditOrder.id}`, '_blank');
    };
    document.getElementById('btn-edit-order').onclick = () => {
        localStorage.setItem('sadda_edit_session', JSON.stringify({ orderId: currentAuditOrder.id }));
        window.location.href = 'index.html';
    };

    // Set toggle
    const chk = document.getElementById('audit-confirm-check');
    chk.checked = currentAuditOrder.status === 'تم الجرد';
    updateToggleUI(chk.checked);

    chk.onchange = function() {
        updateToggleUI(this.checked);
    };

    const modal = document.getElementById('audit-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('audit-modal-content').classList.remove('scale-95');
    }, 10);
}

function updateToggleUI(isChecked) {
    const bg = document.getElementById('audit-toggle-bg');
    const dot = document.getElementById('audit-toggle-dot');
    if (isChecked) {
        bg.classList.replace('bg-slate-200', 'bg-emerald-500');
        dot.classList.add('-translate-x-4');
    } else {
        bg.classList.replace('bg-emerald-500', 'bg-slate-200');
        dot.classList.remove('-translate-x-4');
    }
}

function closeAuditModal() {
    const modal = document.getElementById('audit-modal');
    modal.classList.add('opacity-0');
    document.getElementById('audit-modal-content').classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        currentAuditOrder = null;
    }, 300);
}

// تبديل "شامل الضريبة" لهذا الطلب — موحّد مع باقي الصفحات (نفس العلامة + نفس الحساب في db.js)




// --- Override Export Excel ---
// Instead of creating a new function, we just use excel-export.js logic, but adapt it to export ONLY filteredOrders.
// Wait, we need to make sure excel-export.js reads from `filteredOrders` if it exists.
// We will redefine a globalOrders variable just for excel-export.js to use:
window.globalOrders = filteredOrders;

// Let's hook into the export button to ensure `window.globalOrders` is updated before calling `exportToExcel()`.
function exportArchiveToExcel() {
    if (typeof exportToExcel === 'function') {
        window.globalOrders = filteredOrders; // Give excel script the currently filtered array
        exportToExcel();
    } else {
        alert('مكتبة الإكسيل غير متصلة.');
    }
}

// --- Cancel Order ---


// --- Delete Order ---


// Bootstrap — called when script is appended dynamically after SaddahDB.init()
populateFilters();
setDefaults();
filterArchive();


// Expose functions and vars for actions module
window.allOrders = allOrders;
window.filteredOrders = filteredOrders;
window.filterArchive = filterArchive;
window.openAuditModal = openAuditModal;
window.renderDashboard = renderDashboard;
window.closeAuditModal = closeAuditModal;
window.currentAuditOrder = null;

// Monkey-patch window variables so module can read/write them dynamically
Object.defineProperty(window, 'currentAuditOrder', {
    get: function() { return currentAuditOrder; },
    set: function(val) { currentAuditOrder = val; }
});
Object.defineProperty(window, 'allOrders', {
    get: function() { return allOrders; },
    set: function(val) { allOrders = val; }
});
Object.defineProperty(window, 'filteredOrders', {
    get: function() { return filteredOrders; },
    set: function(val) { filteredOrders = val; }
});
