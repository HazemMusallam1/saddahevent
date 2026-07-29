document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.SaddahDB.init();
        loadPortfolioData();
    } catch (error) {
        console.error("Error loading DB:", error);
    }
});

function findOrderById(id) {
    const orders = window.SaddahDB.data.orders || [];
    const archive = window.SaddahDB.data.archive || [];
    return [...orders, ...archive].find(o => String(o.id) === String(id));
}

function loadPortfolioData() {
    const orders = window.SaddahDB.data.orders || [];
    const archive = window.SaddahDB.data.archive || [];

    const allOrders = [...orders, ...archive];

    let totalRevenues = 0;
    let totalExpenses = 0;
    let revenuesDetails = [];
    let excludedDetails = [];

    allOrders.forEach(order => {
        const comp = order.computed;
        if (!comp) return;
        if (!(comp.operatingShare > 0)) return; // فقط الطلبات التي لها حصة تشغيلية

        const clientName = order.client ? order.client.name : 'عميل غير محدد';
        const row = {
            id: order.id,
            date: order.date || order.createdAt || '-',
            clientName: clientName,
            orderTotal: parseFloat(comp.netProfit).toFixed(2),
            opShare: comp.operatingShare.toFixed(2),
            spent: comp.fuel.toFixed(2),
            remaining: (comp.operatingShare - comp.fuel).toFixed(2),
            claimsDetails: comp.fuel > 0 ? `مصاريف بنزين: ${comp.fuel} ريال` : 'لا يوجد مصاريف بنزين'
        };

        // الطلبات المستبعدة لا تدخل في حساب المحفظة
        if (order.excludeFromPortfolio) {
            excludedDetails.push(row);
            return;
        }

        totalRevenues += comp.operatingShare;
        totalExpenses += comp.fuel;
        revenuesDetails.push(row);
    });

    const netBalance = totalRevenues - totalExpenses;

    document.getElementById('total-revenues').textContent = formatCurrency(totalRevenues);
    document.getElementById('total-expenses').textContent = formatCurrency(totalExpenses);

    const balanceEl = document.getElementById('net-balance');
    balanceEl.textContent = formatCurrency(netBalance);
    balanceEl.classList.remove('text-red-600', 'text-blue-800');
    balanceEl.classList.add(netBalance < 0 ? 'text-red-600' : 'text-blue-800');

    renderRevenuesList(revenuesDetails);
    renderExcludedList(excludedDetails);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' ريال';
}

function renderRevenuesList(details) {
    const listEl = document.getElementById('revenues-list');
    const emptyMsg = document.getElementById('empty-msg');

    listEl.innerHTML = '';

    if (details.length === 0) {
        emptyMsg.classList.remove('hidden');
        return;
    }
    emptyMsg.classList.add('hidden');

    details.sort((a, b) => b.id - a.id);

    details.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-blue-50 transition-colors';
        tr.innerHTML = `
            <td class="text-right font-inter text-slate-500 py-3 px-2">#${item.id}</td>
            <td class="text-right py-3 px-2">${item.date}</td>
            <td class="text-right font-bold text-gray-800 py-3 px-2">${item.clientName}</td>
            <td class="text-left font-inter font-bold text-gray-600 py-3 px-2">${item.orderTotal}</td>
            <td class="text-left font-inter font-bold text-green-600 bg-green-50/50 py-3 px-2">+ ${item.opShare}</td>
            <td class="text-left font-inter font-bold text-red-600 bg-red-50/50 py-3 px-2" title="${item.claimsDetails || 'لا يوجد منصرف'}">- ${item.spent}</td>
            <td class="text-left font-inter font-bold ${item.remaining < 0 ? 'text-red-600' : 'text-blue-600'} bg-blue-50/50 py-3 px-2">= ${item.remaining}</td>
            <td class="text-center py-3 px-2 no-print">
                <button onclick="window.PortfolioActions.excludeFromPortfolio('${item.id}')" title="استبعاد هذا الطلب من المحفظة (طلب قديم بدون نسبة تشغيل)"
                    class="text-red-400 hover:text-white hover:bg-red-500 border border-red-200 rounded-lg w-7 h-7 flex items-center justify-center mx-auto transition">
                    <i class="fa-solid fa-xmark text-xs"></i>
                </button>
            </td>
        `;
        listEl.appendChild(tr);
    });
}

function renderExcludedList(excluded) {
    const section = document.getElementById('excluded-section');
    const listEl = document.getElementById('excluded-list');
    const countEl = document.getElementById('excluded-count');
    if (!section || !listEl) return;

    if (excluded.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    if (countEl) countEl.textContent = excluded.length;

    excluded.sort((a, b) => b.id - a.id);
    listEl.innerHTML = excluded.map(item => `
        <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
            <div class="flex items-center gap-3 min-w-0">
                <span class="font-mono text-xs text-slate-400 shrink-0">#${String(item.id).slice(-4)}</span>
                <span class="font-bold text-slate-700 truncate">${item.clientName}</span>
                <span class="text-xs text-slate-400 shrink-0">${item.date}</span>
                <span class="text-xs text-slate-400 line-through shrink-0">حصة: ${item.opShare}</span>
            </div>
            <button onclick="window.PortfolioActions.restoreToPortfolio('${item.id}')" title="إرجاع الطلب للمحفظة"
                class="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-100 transition shrink-0 flex items-center gap-1">
                <i class="fa-solid fa-rotate-left"></i> إرجاع
            </button>
        </div>
    `).join('');
}






// Expose functions and vars for actions module
window.findOrderById = findOrderById;
window.loadPortfolioData = loadPortfolioData;
