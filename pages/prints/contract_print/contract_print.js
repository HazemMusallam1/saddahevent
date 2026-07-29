const data = JSON.parse(localStorage.getItem('current_order'));
if (data) {
    const dateVal = data.client.date || new Date().toISOString().split('T')[0];
    document.getElementById('contract-date').innerText = dateVal;
    document.getElementById('contract-num').innerText = '#CNT-' + Math.floor(1000 + Math.random() * 9000);

    // Set Document Title for correct PDF filename
    const clientName = data.client.name || 'العميل';
    document.title = `عقد تأجير (${clientName}) - صده`;

    // تحديث العناوين بناءً على نوع العميل
    const isCompany = data.client.type === 'company';
    if (isCompany) {
        document.getElementById('label-name').innerText = 'اسم المنشأة:';
        document.getElementById('label-id').innerText = 'الرقم الضريبي:';
    }

    document.getElementById('c-name').innerText = data.client.name || '........................';
    document.getElementById('signer-name').innerText = data.client.name || '';
    document.getElementById('c-id').innerText = data.client.id || '........................';
    document.getElementById('c-address').innerText = data.client.address || '........................';

    document.getElementById('delivery-info').innerText = `${data.client.deliveryDate} | ${data.client.deliveryTime}`;
    document.getElementById('pickup-info').innerText = `${data.client.pickupDate} | ${data.client.pickupTime}`;

    // استخراج نسبة الضريبة أولاً لاستخدامها في الجدول
    const vatRate = parseFloat(data.financials.vatRate) || 0;

    let itemsHTML = '';
    let subTotal = 0;

    // تحديث ترويسة الجدول
    // بدون ضريبة → عمودا سعر فقط (بدون قبل/بعد الضريبة) ليصير العقد مبسطاً
    const showTax = vatRate > 0;
    const tableHead = document.querySelector('thead tr');
    tableHead.innerHTML = showTax ? `
        <th class="py-2 px-2 text-right">المنتج والتفاصيل</th>
        <th class="py-2 px-2 text-center w-12">الكمية</th>
        <th class="py-2 px-2 text-center w-24">سعر الوحدة<br><span class="text-[8px] font-light">(قبل الضريبة)</span></th>
        <th class="py-2 px-2 text-center w-24">سعر الوحدة<br><span class="text-[8px] font-light">(بعد الضريبة)</span></th>
        <th class="py-2 px-2 text-center w-24">الإجمالي<br><span class="text-[8px] font-light">(قبل الضريبة)</span></th>
        <th class="py-2 px-2 text-center w-24">الإجمالي<br><span class="text-[8px] font-light">(بعد الضريبة)</span></th>
    ` : `
        <th class="py-2 px-2 text-right">المنتج والتفاصيل</th>
        <th class="py-2 px-2 text-center w-16">الكمية</th>
        <th class="py-2 px-2 text-center w-28">سعر الوحدة</th>
        <th class="py-2 px-2 text-center w-28">الإجمالي</th>
    `;

    data.items.forEach(item => {
        const rowTotal = parseFloat(item.total);
        const rowTotalOriginal = item.totalOriginal ? parseFloat(item.totalOriginal) : rowTotal;
        const hasDiscount = rowTotalOriginal > rowTotal;
        const quantity = parseFloat(item.qty) || 1;

        // Calculate Unit Prices
        const unitPrice = rowTotal / quantity;
        const unitPriceOriginal = rowTotalOriginal / quantity;

        subTotal += rowTotal;

        // VAT Calcs
        const unitPriceAfter = unitPrice * (1 + vatRate / 100);
        const rowTotalAfter = rowTotal * (1 + vatRate / 100);
        const unitPriceOriginalAfter = unitPriceOriginal * (1 + vatRate / 100);
        const rowTotalOriginalAfter = rowTotalOriginal * (1 + vatRate / 100);

        let descHTML = `<span class="text-gray-500">${item.desc || '-'}</span>`;
        if (item.decorDetails && item.decorDetails.length > 2) {
            descHTML += `<div class="text-[9px] text-purple-600 mt-0.5"><i class="fa-solid fa-gem text-[8px]"></i> ${item.decorDetails}</div>`;
        }
        if (item.chairsCount && item.chairsCount > 0) {
            descHTML += `<div class="text-[9px] text-emerald-600 font-bold mt-0.5"><i class="fa-solid fa-chair text-[8px]"></i> عدد الكراسي: ${item.chairsCount}</div>`;
        }
        if (hasDiscount) {
            const discountAmount = rowTotalOriginal - rowTotal;
            const discountPercent = (discountAmount / rowTotalOriginal) * 100;
            descHTML += `<div class="text-[9px] text-red-500 font-bold mt-0.5">خصم خاص: ${discountAmount.toFixed(2)} ريال (${discountPercent.toFixed(1)}%)</div>`;
        }

        // Display Logic
        const unitPriceDisplay = hasDiscount
            ? `<div class="flex flex-col items-center leading-none">
                 <span class="line-through text-gray-400 text-[9px]">${unitPriceOriginal.toFixed(2)}</span>
                 <span>${unitPrice.toFixed(2)}</span>
               </div>`
            : unitPrice.toFixed(2);

        const unitPriceAfterDisplay = hasDiscount
            ? `<div class="flex flex-col items-center leading-none">
                 <span class="line-through text-red-300 text-[9px]">${unitPriceOriginalAfter.toFixed(2)}</span>
                 <span>${unitPriceAfter.toFixed(2)}</span>
               </div>`
            : unitPriceAfter.toFixed(2);

        const rowTotalDisplay = hasDiscount
            ? `<div class="flex flex-col items-center leading-none">
                 <span class="line-through text-gray-400 text-[9px]">${rowTotalOriginal.toFixed(2)}</span>
                 <span>${rowTotal.toFixed(2)}</span>
               </div>`
            : rowTotal.toFixed(2);

        const rowTotalAfterDisplay = hasDiscount
            ? `<div class="flex flex-col items-center leading-none">
                 <span class="line-through text-red-300 text-[9px]">${rowTotalOriginalAfter.toFixed(2)}</span>
                 <span>${rowTotalAfter.toFixed(2)}</span>
               </div>`
            : rowTotalAfter.toFixed(2);

        const priceCells = showTax ? `
                <td class="py-2 px-2 text-center font-inter text-gray-600">${unitPriceDisplay}</td>
                <td class="py-2 px-2 text-center font-inter text-gray-600 bg-gray-50">${unitPriceAfterDisplay}</td>
                <td class="py-2 px-2 text-center font-inter font-bold text-gray-900">${rowTotalDisplay}</td>
                <td class="py-2 px-2 text-center font-inter font-bold text-gray-900 bg-gray-50">${rowTotalAfterDisplay}</td>` : `
                <td class="py-2 px-2 text-center font-inter text-gray-600">${unitPriceDisplay}</td>
                <td class="py-2 px-2 text-center font-inter font-bold text-gray-900">${rowTotalDisplay}</td>`;

        itemsHTML += `
            <tr class="border-b border-gray-50 text-xs">
                <td class="py-2 px-2">
                    <p class="font-bold text-gray-900">${item.name}</p>
                    <div class="text-[9px] font-light mt-0.5">${descHTML}</div>
                </td>
                <td class="py-2 px-2 text-center font-inter font-bold text-gray-700">${quantity}</td>
                ${priceCells}
            </tr>
        `;
    });
    document.getElementById('items-body').innerHTML = itemsHTML;
    document.getElementById('subtotal-val').innerText = subTotal.toFixed(2);

    const del = parseFloat(data.financials.delivery) || 0;
    const deposit = parseFloat(data.financials.deposit) || 0;
    const security = parseFloat(data.financials.securityDeposit) || 0;
    // vatRate is already defined above

    if (del > 0) document.getElementById('print-delivery-val').innerText = del.toFixed(2);
    else document.getElementById('delivery-row').style.display = 'none';

    let grandTotal = subTotal + del;
    if (vatRate > 0) {
        const vatAmount = grandTotal * (vatRate / 100);
        document.getElementById('print-vat-val').innerText = vatAmount.toFixed(2);
        document.getElementById('vat-rate-display').innerText = `(${vatRate}%)`;
        grandTotal += vatAmount;
    } else {
        document.getElementById('vat-row').style.display = 'none';
    }

    document.getElementById('total-footer-val').innerText = grandTotal.toFixed(2) + ' ريال';

    if (deposit > 0) document.getElementById('print-arboon-val').innerText = `(${deposit.toFixed(2)})`;
    else document.getElementById('print-arboon-val').innerText = '0.00';

    const remaining = grandTotal - deposit;
    document.getElementById('print-remaining-val').innerText = remaining.toFixed(2) + ' ريال';

    if (security > 0) document.getElementById('print-security-deposit').innerText = security.toFixed(2) + ' ريال';
    else document.getElementById('deposit-container').style.display = 'none';

    // إرسال العقد بعد تجهيزه إلى النافذة الأم (إذا كان يعمل داخل iframe)
    if (window.parent && window.parent !== window) {
        // ننتظر قليلاً لضمان اكتمال تحميل الخطوط والصور
        setTimeout(() => {
            window.parent.postMessage({
                type: 'CONTRACT_RENDERED',
                html: document.documentElement.outerHTML
            }, '*');
        }, 100);
    }
}
