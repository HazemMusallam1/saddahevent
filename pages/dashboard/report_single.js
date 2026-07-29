// Utility: Format Currency
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
};

// Utility: Get URL Parameter
const getUrlParam = (param) => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
};

// Script loaded dynamically after SaddahDB.init()
(function () {
    // 1. Get Order ID
    const orderId = getUrlParam('id');
    if (!orderId) {
        alert('حدث خطأ: لم يتم تحديد رقم الطلب.');
        window.location.href = 'orders.html';
        return;
    }

    // 2. Load Data
    const orders = (window.SaddahDB && window.SaddahDB.data.orders) || [];
    const order = orders.find(o => o.id == orderId);

    if (!order) {
        alert('عذراً، لم يتم العثور على الطلب المطلوب.');
        window.location.href = 'orders.html';
        return;
    }

    // 3. Populate Header & Summary
    document.getElementById('order-id').innerText = `#${order.id}`;
    document.getElementById('report-date').innerText = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.querySelector('.date-generated').innerText = `تم الإنشاء في: ${new Date().toLocaleString('ar-EG')}`;

    // Client Info
    document.getElementById('client-name').innerText = order.client.name;
    document.getElementById('client-phone').innerText = order.client.phone || '-';
    document.getElementById('client-address').innerText = order.client.address || '-';

    // Set Main Report Title
    const reportTitle = `تقرير (${order.client.name})`;
    document.getElementById('main-report-title').innerText = reportTitle;
    document.title = reportTitle;

    // Dates
    document.getElementById('date-start').innerText = `${order.client.deliveryDate} ${order.client.deliveryTime || ''}`;
    document.getElementById('date-end').innerText = `${order.client.pickupDate} ${order.client.pickupTime || ''}`;

    // Status
    const statusEl = document.getElementById('order-status');
    if (order.isConfirmed) {
        statusEl.innerText = 'موثق';
        statusEl.className = 'inline-block px-3 py-1 rounded-full text-sm font-bold bg-emerald-100 text-emerald-700 text-center';
    } else {
        statusEl.innerText = 'غير موثق (مسودة)';
        statusEl.className = 'inline-block px-3 py-1 rounded-full text-sm font-bold bg-slate-100 text-slate-500 text-center';
    }

    // 3.1 Render Contract Link
    const actionContainer = document.getElementById('header-actions');
    if (order.contractUrl) {
        actionContainer.innerHTML = `
            <a href="${order.contractUrl}" target="_blank" class="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-lg shadow-indigo-500/30">
                <i class="fa-solid fa-file-pdf"></i> فتح العقد / الملف
            </a>
        `;
    } else {
        actionContainer.innerHTML = '';
    }

    // 4. Render Items
    const itemsBody = document.getElementById('items-table-body');
    let itemsHTML = '';
    order.items.forEach(item => {
        const itemTotalBase = parseFloat(item.total) || 0;
        const itemTotalOriginalBase = item.totalOriginal ? parseFloat(item.totalOriginal) : itemTotalBase;
        const hasDiscount = itemTotalOriginalBase > itemTotalBase;

        const qty = parseFloat(item.qty) || 1;
        const vatRate = parseFloat(order.financials.vatRate) || 0;

        // Calculate VAT: Base * (Rate / 100)
        const itemTotalVat = itemTotalBase * (vatRate / 100);
        const itemTotalIncludingTax = itemTotalBase + itemTotalVat;

        // Original Totals for display
        const itemTotalOriginalVat = itemTotalOriginalBase * (vatRate / 100);
        const itemTotalOriginalIncludingTax = itemTotalOriginalBase + itemTotalOriginalVat;

        const unitPriceBase = itemTotalBase / qty;
        const unitPriceOriginalBase = itemTotalOriginalBase / qty;

        // Display Logic
        const unitPriceDisplay = hasDiscount
            ? `<div class="flex flex-col items-center leading-none">
                 <span class="line-through text-gray-300 text-[10px]">${formatCurrency(unitPriceOriginalBase)}</span>
                 <span>${formatCurrency(unitPriceBase)}</span>
               </div>`
            : formatCurrency(unitPriceBase);

        const totalDisplay = hasDiscount
            ? `<div class="flex flex-col items-center leading-none">
                 <span class="line-through text-gray-300 text-[10px]">${formatCurrency(itemTotalOriginalIncludingTax)}</span>
                 <span>${formatCurrency(itemTotalIncludingTax)}</span>
               </div>`
            : formatCurrency(itemTotalIncludingTax);

        const discountTag = hasDiscount
            ? `<span class="bg-red-50 text-red-600 text-[9px] px-1.5 py-0.5 rounded font-bold mr-2">خصم ${(itemTotalOriginalBase - itemTotalBase).toFixed(2)} (${((itemTotalOriginalBase - itemTotalBase) / itemTotalOriginalBase * 100).toFixed(1)}%)</span>`
            : '';

        itemsHTML += `
            <tr class="hover:bg-slate-50/50">
                <td class="py-3 px-4">
                    <div class="flex items-center">
                        <p class="font-bold text-slate-800">${item.name}</p>
                        ${discountTag}
                    </div>
                    ${item.desc ? `<p class="text-xs text-slate-400 font-light mt-0.5">${item.desc}</p>` : ''}
                </td>
                <td class="py-3 px-4 text-center font-inter text-slate-600">${qty}</td>
                <td class="py-3 px-4 text-center font-inter text-slate-500">${unitPriceDisplay}</td>
                <td class="py-3 px-4 text-center font-inter text-slate-400 text-xs">${formatCurrency(itemTotalVat)} <span class="text-[9px] text-slate-300">(${vatRate}%)</span></td>
                <td class="py-3 px-4 text-center font-inter font-bold text-slate-800">${totalDisplay}</td>
            </tr>
        `;
    });
    itemsBody.innerHTML = itemsHTML;

    // 5. Financials
    const total = parseFloat(order.financials.total) || 0;
    const delivery = parseFloat(order.financials.delivery) || 0;
    const discount = parseFloat(order.financials.discount) || 0;

    // Calculate Subtotal (Items Total)
    // Formula: Total = Subtotal + Delivery - Discount
    // Therefore: Subtotal = Total - Delivery + Discount
    const subtotal = total - delivery + discount;

    // Calculate Paid Amount based on Status
    let paid = 0;
    // Helper to safely access paymentStatus
    const pStatus = order.paymentStatus || { deposit: false, remaining: false, completed: false };

    // If 'remaining' is paid, or 'completed' is true, then full amount is paid
    if (pStatus.remaining || pStatus.completed) {
        paid = total;
    } else if (pStatus.deposit) {
        // If only deposit is paid
        const depositAmount = parseFloat(order.financials.deposit) || 0;
        paid = depositAmount;
    }

    // Remaining is Total - Paid
    const remaining = total - paid;

    // Update Values
    document.getElementById('val-subtotal').innerText = formatCurrency(subtotal);
    document.getElementById('val-delivery').innerText = formatCurrency(delivery);

    // Handle Discount
    const discountEl = document.getElementById('row-discount');
    const discountValEl = document.getElementById('val-discount');
    if (discount > 0) {
        discountEl.classList.remove('hidden');
        discountEl.classList.add('flex');
        discountValEl.innerText = `-${formatCurrency(discount)}`;
    } else {
        discountEl.classList.add('hidden');
        discountEl.classList.remove('flex');
    }

    document.getElementById('val-total').innerText = formatCurrency(total);

    // Paid / Remaining
    document.getElementById('val-paid').innerText = formatCurrency(paid);
    document.getElementById('val-remaining').innerText = formatCurrency(remaining);

    // Bars width
    const paidPercent = total > 0 ? (paid / total) * 100 : 0;
    const remainingPercent = 100 - paidPercent;

    document.getElementById('bar-paid').style.width = `${paidPercent}%`;
    document.getElementById('bar-remaining').style.width = `${remainingPercent}%`;

    // 6. Payment Proofs (Enhanced with clickable buttons)
    const proofsContainer = document.getElementById('proofs-container');
    const proofs = order.paymentProofs || [];

    if (proofs.length > 0) {
        let proofsHTML = '';
        proofs.forEach(proof => {
            const linkHref = proof.data || proof.image;
            const dateStr = new Date(proof.date).toLocaleDateString('ar-EG');

            // Unified Button Card
            const content = `
                <div class="flex flex-col p-3 border border-slate-200 rounded-xl bg-slate-50 shadow-sm break-inside-avoid">
                    <div class="flex items-center gap-3 mb-2">
                        <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                            <i class="fa-solid fa-file-invoice-dollar"></i>
                        </div>
                        <div class="overflow-hidden">
                            <p class="text-xs font-bold text-slate-700 truncate">${proof.name || 'إثبات دفع'}</p>
                            <p class="text-[10px] text-slate-400">${dateStr}</p>
                        </div>
                    </div>
                    <a href="${linkHref}" target="_blank" class="w-full bg-white border border-slate-300 text-slate-700 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 hover:text-white hover:border-slate-800 transition flex items-center justify-center gap-2">
                        <i class="fa-solid fa-external-link-alt"></i> فتح المرفق
                    </a>
                </div>
            `;
            proofsHTML += content;
        });
        proofsContainer.innerHTML = proofsHTML;
    } else {
        proofsContainer.innerHTML = `<p class="text-xs text-slate-400 italic col-span-full py-4 border border-dashed border-slate-200 rounded-lg text-center">لا توجد إثباتات دفع مرفقة.</p>`;
    }

    // 7. Expenses (Enhanced with clickable links)
    const expensesContainer = document.getElementById('expenses-container');
    const expenses = order.expenses || [];
    const expCost = (exp) => parseFloat(exp.total || exp.afterDiscount || exp.amount || 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + expCost(exp), 0);

    if (expenses.length > 0) {
        let expHTML = '<div class="grid grid-cols-1 gap-2">';
        expenses.forEach(exp => {
            // Check for attachment
            let attachmentHTML = '';
            if (exp.attachment) {
                const attLink = window.resolveSaddahUrl ? window.resolveSaddahUrl(exp.attachment.data) : exp.attachment.data;
                const isLink = exp.attachment.type === 'link';
                const isPdf = exp.attachment.type && exp.attachment.type.includes('pdf');

                if (isLink) {
                    attachmentHTML = `
                        <div class="mt-2 flex items-center gap-2">
                            <a href="${attLink}" target="_blank" class="flex items-center gap-2 bg-blue-50 p-2 rounded border border-blue-100 hover:bg-blue-100 transition no-underline group shadow-sm w-full justify-center">
                                <i class="fa-brands fa-google-drive text-blue-500 group-hover:scale-110 transition text-lg"></i>
                                <span class="text-[10px] text-blue-600 font-bold truncate">رابط خارجي</span>
                                <i class="fa-solid fa-external-link-alt text-[9px] text-blue-400"></i>
                            </a>
                        </div>
                    `;
                } else if (isPdf) {
                    attachmentHTML = `
                        <div class="mt-2 flex items-center gap-2">
                            <a href="${attLink}" target="_blank" class="flex items-center gap-2 bg-white p-2 rounded border border-red-100 hover:bg-red-50 transition no-underline group shadow-sm">
                                <i class="fa-solid fa-file-pdf text-red-500 group-hover:scale-110 transition"></i>
                                <span class="text-[10px] text-slate-500 font-bold truncate max-w-[120px]">${exp.attachment.name || 'فاتورة.pdf'}</span>
                                <i class="fa-solid fa-external-link-alt text-[9px] text-slate-300 group-hover:text-red-400"></i>
                            </a>
                        </div>
                    `;
                } else {
                    attachmentHTML = `
                        <div class="mt-2 flex flex-col gap-1 items-start">
                            <a href="${attLink}" target="_blank" class="h-16 w-16 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden hover:opacity-90 transition shadow-sm relative group">
                                <img src="${attLink}" class="max-w-full max-h-full object-contain">
                                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-center justify-center">
                                    <i class="fa-solid fa-magnifying-glass-plus text-white opacity-0 group-hover:opacity-100 drop-shadow-md"></i>
                                </div>
                            </a>
                        </div>
                    `;
                }
            }

            expHTML += `
                <div class="bg-white/50 p-3 rounded-lg border border-red-100/50 hover:bg-white hover:shadow-sm transition">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="text-sm font-bold text-red-800 block">${exp.desc || exp.name || 'مصروف'}</span>
                            <span class="text-[10px] text-slate-400 font-inter">${new Date(exp.date).toLocaleDateString('ar-EG')}</span>
                        </div>
                        <span class="font-inter font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded text-xs">${formatCurrency(expCost(exp))}</span>
                    </div>
                    ${attachmentHTML}
                </div>
            `;
        });
        expHTML += '</div>';
        expensesContainer.innerHTML = expHTML;
    } else {
        expensesContainer.innerHTML = `<p class="text-sm text-slate-400 italic text-center py-2">لا توجد مصروفات مسجلة لهذا الطلب.</p>`;
    }

    document.getElementById('val-expenses').innerText = formatCurrency(totalExpenses);

    // Net Profit Calculation
    // Logic: If 'includeTaxInProfit' is true, use (Total - Expenses)
    //        If false (default), use (Revenue Excl Tax - Expenses)

    const includeTax = order.financials.includeTaxInProfit === true;
    let profit = 0;

    // Revenue Excl Tax = Subtotal + Delivery - Discount (Computed above as revenueClean)
    // Revenue Inc Tax = Total

    if (includeTax) {
        profit = total - totalExpenses;
        document.getElementById('label-profit').innerText = 'صافي الربح (شامل الضريبة)';
    } else {
        const storedSubTotal = parseFloat(order.financials.subTotal) || 0;
        const revenueClean = storedSubTotal + delivery - discount;
        profit = revenueClean - totalExpenses;
        document.getElementById('label-profit').innerText = 'صافي الربح (بدون ضريبة)';
    }

    document.getElementById('val-profit').innerText = formatCurrency(profit);
})();
