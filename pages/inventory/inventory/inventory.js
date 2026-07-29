// الأصناف الافتراضية
const DEFAULTS = [
    { id: 1, name: 'طاولات عشاء', type: 'باقة (طاولة+كراسي)', color: 'ذهبي', price: 1195, stock: 5, lowStock: 2, capacity: 6, decorFee: 0, desc: 'قواعد ذهبية', decorComponents: [], isExternal: false, image: '' },
    { id: 2, name: 'كراسي', type: 'قطعة فردية', color: 'بيج', price: 30, stock: 50, lowStock: 10, capacity: 0, decorFee: 0, desc: 'فايبر بيج', decorComponents: [], isExternal: false, image: '' }
];

// أنواع الأصناف الافتراضية
const DEFAULT_TYPES = ['باقة (طاولة+كراسي)', 'قطعة فردية', 'خدمة', 'إضاءة', 'سجاد', 'مكيفات'];

let inventory = (window.SaddahDB && window.SaddahDB.data.inventory) || DEFAULTS;
let productTypes = (window.SaddahDB && window.SaddahDB.data.productTypes) || DEFAULT_TYPES;

let editingId = null;
let currentDecorComponents = [];
let currentFilter = 'all';
let currentImageBase64 = '';

// Script is loaded dynamically after SaddahDB.init() — call directly
// (الدوال function declarations مرفوعة hoisted، فالاستدعاء هنا آمن)
if (typeof window.ensureTablesProduct === 'function') {
    const _tp = window.ensureTablesProduct();
    if (_tp && !inventory.includes(_tp)) inventory = window.SaddahDB.data.inventory; // إعادة الربط بعد الإضافة
}
renderTypes();
renderFeaturedProductPanel();   // لوحة المنتج المميّز
renderTable();
toggleSource();   // كان يُستدعى من window load في HTML — نُقل هنا لأن السكريبت يُحمّل ديناميكياً
goToStep(1);      // إظهار الخطوة الأولى افتراضياً

// إدارة الأنواع
function renderTypes() {
    const select = document.getElementById('p-type');
    select.innerHTML = productTypes.map(t => `<option value="${t}">${t}</option>`).join('');
}

function addNewType() {
    const newType = prompt('أدخل اسم التصنيف الجديد (مثلاً: مولدات، سماعات...):');
    if (newType && newType.trim() !== '') {
        if (!productTypes.includes(newType)) {
            productTypes.push(newType);
            window.SaddahDB.data.productTypes = productTypes;
            window.SaddahDB.save();
            renderTypes();
            document.getElementById('p-type').value = newType; // تحديد الجديد تلقائياً
        } else {
            alert('هذا التصنيف موجود مسبقاً!');
        }
    }
}

function toggleSource() {
    const isExternalRadio = document.querySelector('input[name="p-source"]:checked');
    const isExternal = isExternalRadio && isExternalRadio.value === 'external';

    // Custom Radio UI Logic
    const radios = document.getElementsByName('p-source');
    for (let r of radios) {
        const circle = r.nextElementSibling;
        if (circle && circle.classList.contains('check-circle')) {
            if (r.checked) {
                circle.classList.remove('opacity-0');
                r.parentElement.classList.add('ring-2', 'ring-offset-2', isExternal ? 'ring-orange-500' : 'ring-blue-500');
            } else {
                circle.classList.add('opacity-0');
                r.parentElement.classList.remove('ring-2', 'ring-offset-2', 'ring-orange-500', 'ring-blue-500');
            }
        }
    }

    const supplierFields = document.getElementById('supplier-fields');
    if (isExternal) {
        supplierFields.classList.remove('hidden');
        supplierFields.classList.add('grid');
    } else {
        supplierFields.classList.add('hidden');
        supplierFields.classList.remove('grid');
        document.getElementById('p-supplier').value = '';
        document.getElementById('p-supplier-phone').value = '';
    }
}

var CURRENT_STEP = 1;
function goToStep(step) {
    if (step < 1 || step > 3) return;
    CURRENT_STEP = step;

    // Toggle content visibility
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-content-${step}`).classList.add('active');

    // Toggle stepper indicators
    document.querySelectorAll('.step-item').forEach((el, index) => {
        if (index + 1 === step) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    // Scroll to top of form smoothly
    document.getElementById('form-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// دالة معالجة الصورة وضغطها
function handleImageUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const MAX_WIDTH = 100;
            const MAX_HEIGHT = 100;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            currentImageBase64 = canvas.toDataURL('image/jpeg', 0.7);

            document.getElementById('img-preview').src = currentImageBase64;
            document.getElementById('preview-box').classList.remove('hidden');
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function filterTable(type) {
    currentFilter = type;
    const baseClass = 'px-3 py-1 text-xs font-bold text-gray-500 transition cursor-pointer';
    document.getElementById('filter-all').className = baseClass + ' hover:text-gray-800';
    document.getElementById('filter-internal').className = baseClass + ' hover:text-blue-600';
    document.getElementById('filter-external').className = baseClass + ' hover:text-orange-600';

    if (type === 'all') {
        document.getElementById('filter-all').className = 'px-3 py-1 text-xs font-bold bg-white rounded shadow-sm text-gray-800 transition cursor-pointer';
    } else if (type === 'internal') {
        document.getElementById('filter-internal').className = 'px-3 py-1 text-xs font-bold bg-blue-100 text-blue-700 rounded shadow-sm transition cursor-pointer';
    } else if (type === 'external') {
        document.getElementById('filter-external').className = 'px-3 py-1 text-xs font-bold bg-orange-100 text-orange-700 rounded shadow-sm transition cursor-pointer';
    }
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('inventory-body');
    const search = document.getElementById('search-box').value.toLowerCase();
    tbody.innerHTML = '';

    const filteredItems = inventory.filter(item => {
        if (item.isTieredTables) return false; // يُعرض في اللوحة المميّزة بالأعلى
        // البحث في الاسم، اللون، المورد، والنوع
        const matchesSearch = item.name.toLowerCase().includes(search) ||
            (item.color && item.color.toLowerCase().includes(search)) ||
            (item.supplier && item.supplier.toLowerCase().includes(search)) ||
            (item.type && item.type.toLowerCase().includes(search));

        let matchesFilter = true;
        if (currentFilter === 'internal') matchesFilter = !item.isExternal;
        if (currentFilter === 'external') matchesFilter = item.isExternal;

        return matchesSearch && matchesFilter;
    });

    filteredItems.forEach(item => {
        const lowStockClass = (item.stock <= (item.lowStock || 0)) ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-green-700 border-green-200';

        let sourceBadge = '<span class="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">داخلي</span>';
        if (item.isExternal) {
            let supplierInfo = item.supplier || 'غير محدد';
            if (item.supplierPhone) supplierInfo += ` <a href="tel:${item.supplierPhone}" class="text-blue-600 hover:underline">(${item.supplierPhone})</a>`;

            sourceBadge = `<div class="bg-orange-50 text-orange-700 px-2 py-1 rounded border border-orange-200 text-xs font-bold w-fit">
                <i class="fa-solid fa-share-from-square"></i> ${supplierInfo}
            </div>`;
        }

        // عرض الصورة
        const imgDisplay = item.image
            ? `<img src="${item.image}" class="w-10 h-10 rounded object-cover border border-gray-200 bg-white" alt="${item.name}">`
            : `<div class="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-300"><i class="fa-solid fa-image"></i></div>`;

        // عرض اللون
        const colorDot = item.color ? `<span class="text-xs text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200 mr-1">${item.color}</span>` : '';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition-colors group';
        tr.innerHTML = `
            <td class="p-4 text-center">${imgDisplay}</td>
            <td class="p-4">
                <div class="font-bold text-gray-800 flex items-center gap-2">${item.name} ${colorDot}</div>
                <div class="text-xs text-gray-400 mt-1"><span class="bg-blue-50 text-blue-600 px-1.5 rounded">${item.type}</span> | ${item.desc || '-'}</div>
            </td>
            <td class="p-4">${sourceBadge}</td>
            <td class="p-4 text-center font-bold text-gray-700">${item.price}</td>
            <td class="p-4 text-center"><span class="px-3 py-1 rounded-full text-xs font-bold border ${lowStockClass}">${item.stock}</span></td>
            <td class="p-4 text-center">
                <div class="flex items-center justify-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onclick="editItem(${item.id})" class="btn-action w-8 h-8 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white flex items-center justify-center"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteItem(${item.id})" class="btn-action w-8 h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-600 hover:text-white flex items-center justify-center"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ─────────── لوحة المنتج المميّز: طاولات خشب ───────────
function renderFeaturedProductPanel() {
    const host = document.getElementById('featured-product-panel');
    if (!host) return;
    const p = inventory.find(i => i && i.isTieredTables);
    if (!p || !window.TABLES_PRICING) { host.innerHTML = ''; return; }
    const colors = Array.isArray(p.stylingColors) ? p.stylingColors : [];
    const chips = colors.length
        ? colors.map((col, i) => `<span style="display:inline-flex;align-items:center;gap:6px;background:#fff;border:1.5px solid #e9d5ff;color:#7e22ce;font-size:12px;font-weight:700;padding:5px 6px 5px 11px;border-radius:20px;">${col}<button onclick="removeTableColor(${i})" title="حذف" style="width:18px;height:18px;border-radius:50%;background:#f3e8ff;color:#9333ea;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-xmark text-[10px]"></i></button></span>`).join('')
        : '<span style="font-size:12px;color:#94a3b8;">لا توجد ألوان مضافة — أضِف أول لون أدناه</span>';

    const P = window.TABLES_PRICING;
    let rows = '';
    for (let n = 1; n <= P.maxTables; n++) {
        rows += `<tr style="border-top:1px solid #f1f5f9;">
            <td style="padding:5px 8px;text-align:center;font-weight:700;color:#475569;">${n}</td>
            <td style="padding:5px 8px;text-align:center;color:#64748b;">${P.capacity[n]}</td>
            <td style="padding:5px 8px;text-align:center;color:#334155;font-weight:700;">${P.none[n]}</td>
            <td style="padding:5px 8px;text-align:center;"><span style="text-decoration:line-through;color:#cbd5e1;font-size:10px;">${P.baseline[n]}</span> <b style="color:#7e22ce;">${P.premade[n]}</b></td>
            <td style="padding:5px 8px;text-align:center;"><b style="color:#9333ea;">${P.vip[n]}</b></td>
        </tr>`;
    }

    host.innerHTML = `
    <div style="border:2px solid #e9d5ff;background:linear-gradient(180deg,#faf5ff 0%,#fff 55%);border-radius:16px;padding:15px 16px;box-shadow:0 2px 8px rgba(147,51,234,.07);">
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;">
            <span style="width:30px;height:30px;border-radius:9px;background:#9333ea;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(147,51,234,.4);"><i class="fa-solid fa-star"></i></span>
            <span style="font-weight:800;color:#1e293b;font-size:16px;">${p.name}</span>
            <span style="font-size:9px;font-weight:800;color:#7e22ce;background:#f3e8ff;border:1px solid #e9d5ff;padding:2px 8px;border-radius:20px;">مميّز · وصول سريع بالحاسبة</span>
        </div>
        <p style="font-size:12px;color:#64748b;margin:7px 0 0;font-weight:600;">${p.desc || ''}</p>

        <div style="margin-top:14px;">
            <label style="font-size:12px;font-weight:800;color:#7e22ce;display:block;margin-bottom:8px;"><i class="fa-solid fa-palette" style="margin-left:5px;"></i> ألوان / تنسيقات الباقة الجاهزة</label>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;">${chips}</div>
            <div style="display:flex;gap:8px;max-width:420px;">
                <input type="text" id="new-table-color" placeholder="اسم اللون / التنسيق (مثال: تيفاني أزرق)" onkeydown="if(event.key==='Enter')addTableColor()" style="flex:1;border:1.5px solid #e9d5ff;border-radius:9px;padding:7px 11px;font-size:13px;font-family:inherit;outline:none;">
                <button onclick="addTableColor()" style="background:#9333ea;color:#fff;font-weight:800;font-size:13px;padding:7px 16px;border-radius:9px;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-plus"></i> إضافة</button>
            </div>
            <p style="font-size:10px;color:#a78bfa;margin-top:6px;">خيار «تنسيق مخصص» متاح دائماً في الحاسبة (يطلب وصفاً) — لا حاجة لإضافته هنا.</p>
        </div>

        <details style="margin-top:14px;">
            <summary style="cursor:pointer;font-size:12px;font-weight:800;color:#475569;user-select:none;"><i class="fa-solid fa-table-list" style="margin-left:5px;color:#9333ea;"></i> جدول الأسعار المرجعي (1–${P.maxTables} طاولة)</summary>
            <div style="margin-top:10px;max-height:280px;overflow:auto;border:1px solid #eef1f6;border-radius:10px;">
                <table style="width:100%;font-size:12px;border-collapse:collapse;">
                    <thead style="position:sticky;top:0;background:#faf5ff;"><tr style="color:#7e22ce;font-weight:800;">
                        <th style="padding:7px 8px;">الطاولات</th><th style="padding:7px 8px;">السعة</th><th style="padding:7px 8px;">بدون تنسيق</th><th style="padding:7px 8px;">تنسيق جاهز</th><th style="padding:7px 8px;">مخصص (VIP)</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <p style="font-size:10px;color:#94a3b8;margin-top:6px;">الأسعار ثابتة ومُدارة في النظام. لتعديلها تواصل مع المطوّر.</p>
        </details>
    </div>`;
}

function addTableColor() {
    const inp = document.getElementById('new-table-color');
    if (!inp) return;
    const v = (inp.value || '').trim();
    if (!v) return;
    const p = inventory.find(i => i && i.isTieredTables);
    if (!p) return;
    if (!Array.isArray(p.stylingColors)) p.stylingColors = [];
    if (p.stylingColors.includes(v)) { inp.value = ''; return; }
    p.stylingColors.push(v);
    window.SaddahDB.save();
    inp.value = '';
    renderFeaturedProductPanel();
}

function removeTableColor(i) {
    const p = inventory.find(x => x && x.isTieredTables);
    if (!p || !Array.isArray(p.stylingColors)) return;
    p.stylingColors.splice(i, 1);
    window.SaddahDB.save();
    renderFeaturedProductPanel();
}

function addDecorComponent() {
    const name = document.getElementById('new-comp-name').value;
    const qty = parseInt(document.getElementById('new-comp-qty').value) || 1;
    if (!name) return;
    currentDecorComponents.push({ name, qty });
    renderDecorComponentsList();
    document.getElementById('new-comp-name').value = '';
    document.getElementById('new-comp-qty').value = '1';
    document.getElementById('new-comp-name').focus();
}

function removeDecorComponent(index) {
    currentDecorComponents.splice(index, 1);
    renderDecorComponentsList();
}

function renderDecorComponentsList() {
    const list = document.getElementById('decor-components-list');
    list.innerHTML = '';
    currentDecorComponents.forEach((comp, index) => {
        const div = document.createElement('div');
        div.className = 'decor-item justify-between text-sm';
        div.innerHTML = `<div class="flex gap-2 items-center"><span class="font-bold text-purple-600 bg-purple-100 px-2 rounded-full text-xs">${comp.qty}</span><span class="text-gray-700">${comp.name}</span></div><button onclick="removeDecorComponent(${index})" class="text-red-400 hover:text-red-600 text-xs"><i class="fa-solid fa-times"></i></button>`;
        list.appendChild(div);
    });
}

async function saveItem() {
    const name = document.getElementById('p-name').value;
    if (!name) return alert('يرجى كتابة اسم المنتج!');

    const isExternal = document.querySelector('input[name="p-source"]:checked').value === 'external';

    const itemData = {
        id: editingId ? editingId : Date.now(),
        name: name,
        type: document.getElementById('p-type').value,
        color: document.getElementById('p-color').value, // حفظ اللون
        desc: document.getElementById('p-desc').value,
        price: parseFloat(document.getElementById('p-price').value) || 0,
        stock: parseFloat(document.getElementById('p-stock').value) || 0,
        lowStock: parseFloat(document.getElementById('p-low-stock').value) || 0,
        capacity: parseFloat(document.getElementById('p-capacity').value) || 0,
        decorFee: parseFloat(document.getElementById('p-decor-fee').value) || 0,
        decorComponents: [...currentDecorComponents],
        isExternal: isExternal,
        supplier: isExternal ? document.getElementById('p-supplier').value : '',
        supplierPhone: isExternal ? document.getElementById('p-supplier-phone').value : '', // حفظ الهاتف
        image: currentImageBase64
    };

    const oldInventory = [...inventory];

    if (editingId) {
        const index = inventory.findIndex(i => i.id === editingId);
        if (index !== -1) inventory[index] = itemData;
    } else {
        inventory.push(itemData);
    }

    try {
        window.SaddahDB.data.inventory = inventory;
        const saved = await window.SaddahDB.save();
        if (!saved) {
            console.warn('تحذير: لم يتم الحفظ على السيرفر — تأكد أن النظام شغال.');
        }
        alert(editingId ? 'تم التحديث بنجاح' : 'تمت الإضافة بنجاح');
        resetForm();
        renderTable();
    } catch (e) {
        console.error(e);
        inventory = oldInventory;
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            alert('عذراً، مساحة التخزين ممتلئة! الصور تستهلك مساحة كبيرة.');
        } else {
            alert('حدث خطأ أثناء الحفظ.');
        }
    }
}

function editItem(id) {
    const item = inventory.find(i => i.id === id);
    if (!item) return;

    document.getElementById('p-name').value = item.name;
    document.getElementById('p-type').value = item.type;
    document.getElementById('p-color').value = item.color || ''; // تعبئة اللون
    document.getElementById('p-desc').value = item.desc || '';
    document.getElementById('p-price').value = item.price;
    document.getElementById('p-stock').value = item.stock;
    document.getElementById('p-low-stock').value = item.lowStock || 0;
    document.getElementById('p-capacity').value = item.capacity || 0;
    document.getElementById('p-decor-fee').value = item.decorFee || 0;

    // Source
    const isExternal = item.isExternal || false;
    const radios = document.getElementsByName('p-source');
    for (let r of radios) {
        if (r.value === (isExternal ? 'external' : 'internal')) r.checked = true;
    }
    toggleSource();
    document.getElementById('p-supplier').value = item.supplier || '';
    document.getElementById('p-supplier-phone').value = item.supplierPhone || '';

    // Image
    currentImageBase64 = item.image || '';
    if (currentImageBase64) {
        document.getElementById('img-preview').src = currentImageBase64;
        document.getElementById('preview-box').classList.remove('hidden');
    } else {
        document.getElementById('preview-box').classList.add('hidden');
    }

    currentDecorComponents = item.decorComponents ? [...item.decorComponents] : [];
    renderDecorComponentsList();

    editingId = id;
    document.getElementById('form-title').innerText = 'تعديل المنتج: ' + item.name;
    document.getElementById('save-btn').innerHTML = '<i class="fa-solid fa-check"></i> <span>حفظ التعديلات</span>';
    document.getElementById('save-btn').classList.replace('bg-blue-600', 'bg-green-600');
    document.getElementById('save-btn').classList.replace('hover:bg-blue-700', 'hover:bg-green-700');
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
    document.getElementById('form-container').scrollIntoView({ behavior: 'smooth' });
}

function deleteItem(id) {
    if (confirm('حذف المنتج نهائياً؟')) {
        inventory = inventory.filter(i => i.id !== id);
        window.SaddahDB.data.inventory = inventory;
        window.SaddahDB.save();
        renderTable();
        if (editingId === id) resetForm();
    }
}

function resetForm() {
    editingId = null;
    currentDecorComponents = [];
    currentImageBase64 = '';
    document.getElementById('preview-box').classList.add('hidden');
    document.getElementById('p-image').value = '';

    renderDecorComponentsList();
    ['p-name', 'p-color', 'p-desc', 'p-price', 'p-stock', 'p-low-stock', 'p-capacity', 'p-decor-fee', 'new-comp-name', 'p-supplier', 'p-supplier-phone'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const radios = document.getElementsByName('p-source');
    for (let r of radios) {
        if (r.value === 'internal') r.checked = true;
    }
    toggleSource();

    document.getElementById('form-title').innerText = 'إضافة منتج جديد';
    document.getElementById('save-btn').innerHTML = '<i class="fa-solid fa-save"></i> <span>حفظ المنتج</span>';
    document.getElementById('save-btn').classList.replace('bg-green-600', 'bg-blue-600');
    document.getElementById('save-btn').classList.replace('hover:bg-green-700', 'hover:bg-blue-700');
    document.getElementById('cancel-edit-btn').classList.add('hidden');
}

// دالة إزالة الضريبة 15% من السعر المدخل
function removeTax() {
    const priceInput = document.getElementById('p-price');
    const currentPrice = parseFloat(priceInput.value);

    if (!isNaN(currentPrice) && currentPrice > 0) {
        // قسمة السعر على 1.15 لاستخراج السعر الأساسي بدون الضريبة
        const priceWithoutTax = currentPrice / 1.15;
        // تقريب الرقم لمنزلتين عشريتين
        priceInput.value = priceWithoutTax.toFixed(2);

        // إضافة تأثير بصري خفيف للتأكيد
        priceInput.classList.add('bg-green-50', 'transition-colors', 'duration-300');
        setTimeout(() => {
            priceInput.classList.remove('bg-green-50');
        }, 500);
    }
}
