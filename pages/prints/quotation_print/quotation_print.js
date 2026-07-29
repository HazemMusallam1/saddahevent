const data = JSON.parse(localStorage.getItem('current_order'));
if (data) {
    const dateVal = new Date().toISOString().split('T')[0]; // تاريخ اليوم للعرض
    document.getElementById('quotation-date').innerText = dateVal;
    document.getElementById('quotation-num').innerText = '#QTE-' + Math.floor(1000 + Math.random() * 9000);

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

    // بناء ترويسة الجدول ديناميكياً
    let headerHTML = `
        <tr class="bg-gray-800 text-white text-[10px] uppercase font-bold tracking-wide">
            <th class="py-2 px-4 text-right">المنتج والتفاصيل</th>
            <th class="py-2 px-2 text-center w-16">الكمية</th>
            <th class="py-2 px-2 text-center w-24">سعر الوحدة<br><span class="text-[8px] font-light">(قبل الضريبة)</span></th>
            <th class="py-2 px-2 text-center w-24">سعر الوحدة<br><span class="text-[8px] font-light">(بعد الضريبة)</span></th>
            <th class="py-2 px-2 text-center w-24">الإجمالي<br><span class="text-[8px] font-light">(قبل الضريبة)</span></th>
            <th class="py-2 px-2 text-center w-28 th-final-col">السعر النهائي<br><span class="text-[8px] font-light opacity-80">(شامل الضريبة)</span></th>
        </tr>
    `;
    document.getElementById('items-head-container').innerHTML = headerHTML;

    let itemsHTML = '';
    let subTotal = 0;

    data.items.forEach(item => {
        const rowTotal = parseFloat(item.total);
        const rowTotalOriginal = item.totalOriginal ? parseFloat(item.totalOriginal) : rowTotal;
        const hasDiscount = rowTotalOriginal > rowTotal;
        const qty = parseInt(item.qty) || 1;

        const unitPrice = rowTotal / qty;
        const unitPriceOriginal = rowTotalOriginal / qty;

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
        if (hasDiscount) {
            const discountAmount = rowTotalOriginal - rowTotal;
            const discountPercent = (discountAmount / rowTotalOriginal) * 100;
            descHTML += `<div class="text-[9px] text-red-500 font-bold mt-0.5">خصم: ${discountAmount.toFixed(2)} ريال (${discountPercent.toFixed(1)}%)</div>`;
        }

        const chairsDisplay = (item.chairsCount && item.chairsCount > 0) ? `<span class="font-bold text-brand-600">${item.chairsCount}</span>` : '';
        if (chairsDisplay) {
            descHTML += `<div class="text-[9px] text-emerald-600 font-bold mt-0.5"><i class="fa-solid fa-chair text-[8px]"></i> عدد الكراسي: ${item.chairsCount}</div>`;
        }

        // Display Helpers
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

        itemsHTML += `
            <tr class="border-b border-gray-50 text-xs">
                <td class="py-2 px-4">
                    <p class="font-bold text-gray-900">${item.name}</p>
                    <div class="text-[9px] font-light mt-0.5">${descHTML}</div>
                </td>
                <td class="py-2 px-2 text-center font-inter font-bold text-gray-700">${qty}</td>
                <td class="py-2 px-2 text-center font-inter font-medium text-gray-600">${unitPriceDisplay}</td>
                <td class="py-2 px-2 text-center font-inter font-medium text-gray-600 bg-gray-50">${unitPriceAfterDisplay}</td>
                <td class="py-2 px-4 text-center font-inter font-bold text-gray-900">${rowTotalDisplay}</td>
                <td class="py-2.5 px-4 text-center font-inter price-col-final">
                    <span class="price-final-value">${rowTotalAfterDisplay}</span>
                </td>
            </tr>
        `;
    });
    document.getElementById('items-body').innerHTML = itemsHTML;
    document.getElementById('subtotal-val').innerText = subTotal.toFixed(2);

    const del = parseFloat(data.financials.delivery) || 0;
    const deposit = parseFloat(data.financials.deposit) || 0;
    const security = parseFloat(data.financials.securityDeposit) || 0;

    // Check if VAT rate was already defined at top

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
        document.getElementById('vat-rate-display').innerText = '';
    }

    document.getElementById('total-footer-val').innerHTML = `<span class="currency-badge">ر.س</span> ${grandTotal.toFixed(2)}`;

    if (deposit > 0) {
        document.getElementById('print-arboon-val').innerText = `(${deposit.toFixed(2)})`;
        document.getElementById('print-arboon-val').parentElement.style.display = 'flex';

        const remaining = grandTotal - deposit;
        document.getElementById('print-remaining-val').innerText = remaining.toFixed(2) + ' ريال';
        document.getElementById('print-remaining-val').parentElement.style.display = 'flex';
    } else {
        document.getElementById('print-arboon-val').parentElement.style.display = 'none';
        // If no deposit, remaining balance is just the total, so we hide it to avoid redundancy
        document.getElementById('print-remaining-val').parentElement.style.display = 'none';
    }

    if (security > 0) document.getElementById('print-security-deposit').innerText = security.toFixed(2) + ' ريال';
    else document.getElementById('deposit-container').style.display = 'none';
}
