const SEC_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/* ألوان المطالبات — كل مطالبة في الشهر تأخذ لوناً مميزاً (نقطة/نص متطابقة) */
const CLAIM_COLORS = [
    { dot: '#9333EA', text: '#7E22CE' }, // بنفسجي (هوية النظام)
    { dot: '#0D9488', text: '#0F766E' }, // تركواز
    { dot: '#EA580C', text: '#C2410C' }, // برتقالي محروق
    { dot: '#2563EB', text: '#1D4ED8' }, // أزرق
    { dot: '#D97706', text: '#B45309' }, // كهرماني
    { dot: '#DB2777', text: '#BE185D' }, // وردي
    { dot: '#16A34A', text: '#15803D' }, // أخضر
    { dot: '#4F46E5', text: '#4338CA' }  // نيلي
];

function toggleSettings(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('settings-menu');
    if (menu) menu.classList.toggle('hidden');
}
document.addEventListener('click', () => {
    const m = document.getElementById('settings-menu');
    if (m && !m.classList.contains('hidden')) m.classList.add('hidden');
});

/* ═══════════ Modal ═══════════ */
function openModal(title, url, type) {
    const modal = document.getElementById('file-modal');
    const content = document.getElementById('file-modal-content');
    const body = document.getElementById('file-modal-body');
    document.getElementById('file-modal-title').textContent = title;

    if (type === 'pdf') {
        body.innerHTML = `<iframe src="${url}" class="w-full h-full rounded-lg" frameborder="0"></iframe>`;
    } else if (type === 'image') {
        body.innerHTML = `<img src="${url}" class="max-w-full max-h-full object-contain rounded-lg shadow-sm">`;
    } else {
        body.innerHTML = `<a href="${url}" target="_blank" class="bg-brand-500 text-white px-4 py-2 rounded-lg font-bold">تحميل الملف <i class="fa-solid fa-download mr-2"></i></a>`;
    }
    modal.classList.remove('hidden');
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    content.classList.remove('scale-95');
}
function closeModal() {
    const modal = document.getElementById('file-modal');
    const content = document.getElementById('file-modal-content');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); document.getElementById('file-modal-body').innerHTML = ''; }, 300);
}

/* ═══════════ Helpers ═══════════ */
const fmtMoney = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + ' ر.س';
const fmtNum = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0));

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function clid(id) { return String(id == null ? '' : id).replace(/[^a-zA-Z0-9_-]/g, '_'); }

function formatDate(d) {
    if (!d) return 'غير محدد';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    try {
        const obj = new Date(d);
        if (isNaN(obj.getTime())) return typeof d === 'string' ? d.substring(0, 10) : d;
        return `${obj.getFullYear()}-${String(obj.getMonth() + 1).padStart(2, '0')}-${String(obj.getDate()).padStart(2, '0')}`;
    } catch (e) { return d; }
}

function getMonthName(dateStr) {
    if (!dateStr) return 'غير محدد';
    const p = dateStr.split('-');
    if (p.length >= 2) return `${SEC_MONTHS[parseInt(p[1], 10) - 1] || p[1]} ${p[0]}`;
    return dateStr;
}
function getSortKey(dateStr) {
    if (!dateStr) return '0000-00';
    const p = dateStr.split('-');
    return p.length >= 2 ? `${p[0]}-${p[1].padStart(2, '0')}` : dateStr;
}

/* نص مطالبة مقروء (يتجاهل النصوص المشوّهة الترميز) */
function auditClaimTitle(c) {
    const ok = s => s && typeof s === 'string' && s.trim() !== '' && !/[ÙØ]/.test(s);
    if (ok(c.title)) return c.title;
    if (ok(c.desc)) return c.desc;
    if (ok(c.type)) return c.type;
    return c.orderId ? 'مطالبة على طلب' : 'مطالبة';
}

/* ═══════════ File URL Resolution ═══════════ */
function resolveFileUrl(att, orderId, subfolder) {
    if (!att) return null;
    let link = att.link || att.data || att.url;
    if (!link || typeof link !== 'string') return null;
    if (/^(data:|blob:|https?:\/\/)/.test(link)) return link;            // base64 / رابط مباشر
    if (/^(uploads\/|\/uploads\/)/.test(link)) return link;
    if (link.startsWith('saddah://')) {
        // نفس مُحلِّل النظام المستخدم في بقية الصفحات (يعرف اسم مجلد الطلب الحقيقي)
        return window.resolveSaddahUrl ? window.resolveSaddahUrl(link) : ('saddah%20Archive/' + link.replace('saddah://', ''));
    }
    // اسم ملف مجرّد (الرابط فارغ عند التحميل من السيرفر) ← ابنِ saddah:// ثم حُلّه باسم المجلد الصحيح
    if (orderId && subfolder) {
        const built = `saddah://${orderId}/${subfolder}/${link}`;
        return window.resolveSaddahUrl ? window.resolveSaddahUrl(built) : `saddah%20Archive/${orderId}/${subfolder}/${encodeURIComponent(link)}`;
    }
    return link;
}

function renderAttachBtn(att, orderId, subfolder) {
    if (!att) return '';
    if (att.type === 'folder') return '<span style="font-size:10px;color:#94a3b8;"><i class="fa-solid fa-folder" style="color:#fbbf24;margin-left:3px;"></i>مجلد</span>';
    const url = resolveFileUrl(att, orderId, subfolder);
    if (!url) return '';
    const name = att.name || att.data || 'مرفق';
    const ext = (String(name).split('.').pop() || '').toLowerCase();
    const isPdf = ext === 'pdf';
    const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    const icon = isPdf ? 'fa-file-pdf' : isImg ? 'fa-image' : 'fa-paperclip';
    const iconColor = isPdf ? '#dc2626' : isImg ? '#059669' : '#64748b';
    const type = isPdf ? 'pdf' : isImg ? 'image' : 'other';
    const safeName = String(name).replace(/'/g, "\\'");
    const safeUrl = String(url).replace(/'/g, "\\'");
    return `<button onclick="openModal('${safeName}','${safeUrl}','${type}')" class="aud-attach"><i class="fa-solid ${icon}" style="color:${iconColor};"></i> عرض</button>`;
}

function renderClaimAttach(c) {
    if (c.invoiceBase64) {
        const name = c.invoiceName || 'فاتورة';
        const ext = (String(name).split('.').pop() || '').toLowerCase();
        const type = ext === 'pdf' ? 'pdf' : (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? 'image' : 'other');
        const sn = String(name).replace(/'/g, "\\'");
        const sd = String(c.invoiceBase64).replace(/'/g, "\\'");
        return `<button class="aud-attach" onclick="openModal('${sn}','${sd}','${type}')"><i class="fa-solid fa-file-invoice" style="color:#9333ea;"></i> الفاتورة</button>`;
    }
    if (c.fileLink) {
        const url = resolveFileUrl({ link: c.fileLink }, c.orderId, 'المصروفات');
        if (url) {
            const ext = (String(c.fileLink).split('.').pop() || '').toLowerCase();
            const type = ext === 'pdf' ? 'pdf' : (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? 'image' : 'other');
            const su = String(url).replace(/'/g, "\\'");
            return `<button class="aud-attach" onclick="openModal('فاتورة المطالبة','${su}','${type}')"><i class="fa-solid fa-file-invoice" style="color:#9333ea;"></i> الفاتورة</button>`;
        }
    }
    return '';
}

/* ═══════════ Row Renderers (قائمة مرتّبة بفواصل — بدون جداول/سكرول أفقي) ═══════════ */
function renderPaymentRow(p, i, orderId) {
    const method = p.method || '';
    const badge = method === 'كاش' ? '<span style="font-size:9px;background:#d1fae5;color:#065f46;padding:1px 6px;border-radius:5px;font-weight:800;">كاش</span>'
        : method === 'تحويل' ? '<span style="font-size:9px;background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:5px;font-weight:800;">تحويل</span>' : '';
    return `<div class="aud-row">
        <span class="idx">${i + 1}</span>
        <div class="body">
            <div class="title">${esc(p.desc || p.note || 'دفعة')} ${badge}</div>
            <div class="meta">${formatDate(p.date)}</div>
        </div>
        ${renderAttachBtn(p.attachment, orderId, 'الدفعات')}
        <div class="amt" style="color:#059669;">${fmtMoney(p.amount)}</div>
    </div>`;
}

function renderExpenseRow(e, i, orderId, monthId, claimMap) {
    const desc = e.desc || e.name || 'مصروف';
    const amt = parseFloat(e.amount) || parseFloat(e.total) || 0;
    const info = (e.claimId != null && claimMap[e.claimId]) ? claimMap[e.claimId] : null;
    const lead = info ? `<span class="claim-dot" style="background:${info.color.dot};">${info.num}</span>` : `<span class="idx">${i + 1}</span>`;
    const claimNote = info ? ` · <span style="color:${info.color.text};font-weight:800;">مطالبة${info.emp ? ' ' + esc(info.emp) : ''}</span>` : '';
    const hasClaim = info ? 'has-claim' : '';
    const linkAttrs = info ? `data-claim-target="${monthId}-claim-${clid(e.claimId)}" data-claim-color="${info.color.dot}"` : '';
    return `<div class="aud-row audit-exp-row ${hasClaim}" ${linkAttrs}>
        ${lead}
        <div class="body">
            <div class="title">${esc(desc)}</div>
            <div class="meta">${formatDate(e.date)}${claimNote}</div>
        </div>
        ${renderAttachBtn(e.attachment, orderId, 'المصروفات')}
        <div class="amt" style="color:#dc2626;">${fmtMoney(amt)}</div>
    </div>`;
}

function renderReturnRow(r, i, orderId) {
    const desc = r.desc || r.reason || 'مرتجع';
    const refund = parseFloat(r.refund) || 0;
    const deducted = parseFloat(r.deducted) || 0;
    return `<div class="aud-row">
        <span class="idx">${i + 1}</span>
        <div class="body">
            <div class="title">${esc(desc)}</div>
            <div class="meta">${formatDate(r.date)}${deducted > 0 ? ` · خصم ${fmtNum(deducted)} ر.س` : ''}</div>
        </div>
        ${renderAttachBtn(r.attachment, orderId, 'المرتجعات')}
        <div class="amt" style="color:#d97706;">${fmtMoney(refund)}</div>
    </div>`;
}

function auditSection(label, icon, tintClass, count, rowsHtml) {
    return `<div class="aud-section">
        <div class="aud-section-head ${tintClass}"><i class="fa-solid ${icon}"></i> ${label}<span class="cnt">${count}</span></div>
        <div class="aud-section-body">${rowsHtml}</div>
    </div>`;
}

/* ═══════════ Order Card ═══════════ */
function renderOrder(o, oid, monthId, claimMap) {
    const clientName = (o.client && o.client.name) || 'عميل';
    const orderId = o.id || '';
    const computed = o.computed || {};
    const deliveryDate = (o.client && o.client.deliveryDate) ? formatDate(o.client.deliveryDate) : '';
    const status = o.status || '';
    const statusMap = {
        'جديد': ['#dbeafe', '#1e40af'], 'مؤكد': ['#d1fae5', '#065f46'],
        'تم التوصيل': ['#e0e7ff', '#3730a3'], 'تم الجرد': ['#f3e8ff', '#6b21a8'],
        'ملغي': ['#fee2e2', '#991b1b'], 'مؤرشف': ['#f1f5f9', '#475569']
    };
    const sc = statusMap[status] || ['#f1f5f9', '#475569'];
    const statusBadge = status ? `<span class="aud-status" style="background:${sc[0]};color:${sc[1]};">${esc(status)}</span>` : '';

    const payments = o.paymentProofs || [];
    const expenses = o.expenses || [];
    const returns = Array.isArray(o.returns) ? o.returns.filter(r => r.linkedExpenseIndex == null) : [];

    const revenue = parseFloat(computed.revenue) || 0;
    const remaining = parseFloat(computed.remaining) || 0;
    const netProfit = parseFloat(computed.netProfit) || 0;

    let sections = '';
    if (payments.length) sections += auditSection('الدفعات', 'fa-hand-holding-dollar', 'tint-green', payments.length,
        payments.map((p, i) => renderPaymentRow(p, i, orderId)).join(''));
    if (expenses.length) sections += auditSection('المصروفات', 'fa-money-bill-transfer', 'tint-red', expenses.length,
        expenses.map((e, i) => renderExpenseRow(e, i, orderId, monthId, claimMap)).join(''));
    if (returns.length) sections += auditSection('المرتجعات', 'fa-rotate-left', 'tint-amber', returns.length,
        returns.map((r, i) => renderReturnRow(r, i, orderId)).join(''));
    if (!sections) sections = '<div style="text-align:center;color:#94a3b8;font-size:12px;padding:14px;border:1px dashed #e6e9ef;border-radius:11px;">لا توجد حركات مالية مسجلة</div>';

    const metaBits = [];
    if (orderId) metaBits.push(`<span><i class="fa-solid fa-hashtag"></i> ${String(orderId).slice(-4)}</span>`);
    if (deliveryDate) metaBits.push(`<span><i class="fa-solid fa-truck"></i> ${deliveryDate}</span>`);

    return `<div class="aud-order">
        <div class="aud-order-head" onclick="toggleOrderBody('${oid}')">
            <div class="aud-order-ident">
                <span class="aud-order-ico"><i class="fa-solid fa-folder-open"></i></span>
                <div style="min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                        <span class="aud-order-name">${esc(clientName)}</span>
                        ${statusBadge}
                    </div>
                    ${metaBits.length ? `<div class="aud-order-meta">${metaBits.join('<span style="color:#e2e8f0;">•</span>')}</div>` : ''}
                </div>
            </div>
            <div class="aud-stat-strip">
                <div class="aud-stat"><div class="lbl">الإيرادات</div><div class="val" style="color:#059669;">${fmtNum(revenue)}</div></div>
                <div class="aud-stat"><div class="lbl">المتبقي</div><div class="val" style="color:${remaining > 0 ? '#dc2626' : '#059669'};">${fmtNum(remaining)}</div></div>
                <div class="aud-stat"><div class="lbl">صافي الربح</div><div class="val" style="color:#9333ea;">${fmtNum(netProfit)}</div></div>
            </div>
            <span class="aud-chev"><i id="chev-${oid}" class="fa-solid fa-chevron-up"></i></span>
        </div>
        <div class="aud-order-body" id="${oid}-body">
            ${sections}
        </div>
    </div>`;
}

/* ═══════════ Claim Card ═══════════ */
function renderClaimCard(c, info, monthId) {
    const color = info.color;
    const title = auditClaimTitle(c);
    const orderLabel = c.clientName
        ? `${esc(c.clientName)}${c.orderId != null ? ' · #' + String(c.orderId).slice(-4) : ''}`
        : (c.orderId != null ? '#' + String(c.orderId).slice(-4) : '');
    const settled = c.status === 'settled' || c.batchId;
    const statusBadge = settled
        ? '<span class="aud-cstatus settled">تمت التسوية</span>'
        : '<span class="aud-cstatus pending">معلّقة</span>';
    const amt = parseFloat(c.amount) || 0;
    const attach = renderClaimAttach(c);
    const capBadge = c.isCapital ? '<span style="font-size:8px;background:#d1fae5;color:#065f46;padding:1px 6px;border-radius:5px;font-weight:800;">رأس مال</span>' : '';
    return `<div class="aud-claim audit-claim-card" id="${monthId}-claim-${clid(c.id)}" data-claim-color="${color.dot}">
        <div class="aud-claim-top">
            <span class="aud-claim-num" style="background:${color.dot};">${info.num}</span>
            <span class="aud-claim-emp"><i class="fa-solid fa-user-tie" style="font-size:10px;color:${color.text};margin-left:4px;"></i>${esc(c.employee || 'موظف')}</span>
            ${statusBadge}
        </div>
        <div class="aud-claim-title">${esc(title)} ${capBadge}</div>
        ${orderLabel ? `<div class="aud-claim-link"><i class="fa-solid fa-link" style="font-size:9px;"></i> ${orderLabel}</div>` : ''}
        <div class="aud-claim-foot">
            ${attach || '<span></span>'}
            <span class="aud-claim-amt" style="color:${color.text};">${fmtMoney(amt)}</span>
        </div>
    </div>`;
}

function renderClaimsPanel(claims, claimMap, monthId) {
    const head = `<div class="aud-claims-head"><i class="fa-solid fa-file-invoice-dollar"></i> مطالبات الشهر<span class="cnt">${claims.length}</span></div>`;
    if (!claims.length) {
        return `<div class="aud-claims">${head}
            <div class="aud-claims-empty"><i class="fa-solid fa-receipt" style="font-size:20px;display:block;margin-bottom:7px;opacity:.5;"></i>لا مطالبات لهذا الشهر</div>
        </div>`;
    }
    const pendingTotal = claims
        .filter(c => !(c.status === 'settled' || c.batchId))
        .reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
    const body = claims.map(c => renderClaimCard(c, claimMap[c.id], monthId)).join('');
    return `<div class="aud-claims">${head}
        <div class="aud-claims-body">${body}</div>
        <div class="aud-claims-total">
            <span style="font-size:10px;color:#7e22ce;font-weight:800;">إجمالي المعلّق</span>
            <span style="font-size:15px;font-weight:800;font-family:'Inter',sans-serif;color:#7e22ce;">${fmtMoney(pendingTotal)}</span>
        </div>
    </div>`;
}

/* ═══════════ الخيوط الرابطة (SVG) ═══════════ */
function drawConnectors(grid) {
    if (!grid) return;
    const svg = grid.querySelector('.audit-connectors');
    if (!svg) return;
    if (window.innerWidth < 1024) { svg.innerHTML = ''; return; }
    const gr = grid.getBoundingClientRect();
    const w = grid.offsetWidth, h = grid.offsetHeight;
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    let out = '';
    grid.querySelectorAll('[data-claim-target]').forEach(src => {
        const tid = src.getAttribute('data-claim-target');
        let dst = null;
        try { dst = grid.querySelector('#' + (window.CSS && CSS.escape ? CSS.escape(tid) : tid)); } catch (e) { dst = document.getElementById(tid); }
        if (!dst) return;
        const sR = src.getBoundingClientRect(), dR = dst.getBoundingClientRect();
        const x1 = sR.left - gr.left, y1 = sR.top - gr.top + sR.height / 2;   // الحافة الداخلية للمصروف
        const x2 = dR.right - gr.left, y2 = dR.top - gr.top + dR.height / 2;  // الحافة الداخلية للمطالبة
        const mx = (x1 + x2) / 2;
        const color = src.getAttribute('data-claim-color') || '#9333ea';
        // الخيط: من حافة المصروف (نقطة) ← إلى حافة المطالبة (رأس سهم)
        out += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 + 5},${y2}" stroke="${color}" stroke-width="1.8" fill="none" stroke-dasharray="5 4" opacity="0.55" data-pair="${tid}"></path>`;
        out += `<circle cx="${x1}" cy="${y1}" r="3.2" fill="${color}" opacity="0.8" data-pair="${tid}"></circle>`;
        out += `<path d="M${x2},${y2} L${x2 + 7},${y2 - 4} L${x2 + 7},${y2 + 4} Z" fill="${color}" opacity="0.9" data-pair="${tid}"></path>`;
    });
    svg.innerHTML = out;
}

function drawAllConnectors() {
    document.querySelectorAll('.audit-grid').forEach(g => {
        if (g.offsetParent !== null) drawConnectors(g);
    });
}

/* تظليل تفاعلي: مرر على مصروف ← تتوهّج مطالبته (والعكس) + يثخن الخيط */
function highlightPair(claimElId, on) {
    if (!claimElId) return;
    const claim = document.getElementById(claimElId);
    if (claim) {
        const cc = claim.getAttribute('data-claim-color') || '#9333ea';
        claim.style.boxShadow = on ? `0 0 0 2px ${cc}` : '';
        claim.style.transform = on ? 'translateX(-2px)' : '';
    }
    document.querySelectorAll('[data-claim-target="' + claimElId + '"]').forEach(s => {
        const cc = s.getAttribute('data-claim-color') || '#9333ea';
        s.style.boxShadow = on ? `0 0 0 2px ${cc}` : '';
    });
    document.querySelectorAll('[data-pair="' + claimElId + '"]').forEach(el => {
        if (el.tagName === 'path' && el.getAttribute('stroke')) {
            el.setAttribute('opacity', on ? '0.95' : '0.55');
            el.setAttribute('stroke-width', on ? '2.8' : '1.8');
        } else {
            el.setAttribute('opacity', on ? '1' : (el.tagName === 'circle' ? '0.8' : '0.9'));
        }
    });
}

document.addEventListener('mouseover', e => {
    const src = e.target.closest && e.target.closest('[data-claim-target]');
    if (src) { highlightPair(src.getAttribute('data-claim-target'), true); return; }
    const claim = e.target.closest && e.target.closest('.audit-claim-card');
    if (claim) highlightPair(claim.id, true);
});
document.addEventListener('mouseout', e => {
    const src = e.target.closest && e.target.closest('[data-claim-target]');
    if (src) { highlightPair(src.getAttribute('data-claim-target'), false); return; }
    const claim = e.target.closest && e.target.closest('.audit-claim-card');
    if (claim) highlightPair(claim.id, false);
});

/* ═══════════ Accordion / Order toggles ═══════════ */
function toggleAccordion(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById(`icon-${id}`);
    if (!el) return;
    el.classList.toggle('hidden');
    const open = !el.classList.contains('hidden');
    if (icon) {
        icon.classList.toggle('fa-chevron-down', !open);
        icon.classList.toggle('fa-chevron-up', open);
    }
    if (open) {
        const grid = el.querySelector('.audit-grid');
        if (grid) requestAnimationFrame(() => drawConnectors(grid));
    }
}

function toggleOrderBody(oid) {
    const body = document.getElementById(oid + '-body');
    const chev = document.getElementById('chev-' + oid);
    if (!body) return;
    body.classList.toggle('hidden');
    const open = !body.classList.contains('hidden');
    if (chev) {
        chev.classList.toggle('fa-chevron-down', !open);
        chev.classList.toggle('fa-chevron-up', open);
    }
    const grid = body.closest('.audit-grid');
    if (grid) requestAnimationFrame(() => drawConnectors(grid));
}

/* ═══════════ Init ═══════════ */
async function initAudit() {
    try {
        await window.SaddahDB.init();
        const user = window.SaddahDB.user;

        const pill = document.getElementById('server-status');
        const dot = document.getElementById('status-dot');
        const txt = document.getElementById('status-text');
        if (pill && dot && txt) {
            if (window.SaddahDB.isOnline) {
                pill.className = 'hidden sm:inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600';
                dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
                txt.textContent = 'متصل بالخادم';
            } else {
                pill.className = 'hidden sm:inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full bg-red-50 text-red-600';
                dot.className = 'w-2 h-2 rounded-full bg-red-500';
                txt.textContent = 'غير متصل';
            }
        }

        if (!user || !['admin', 'financial', 'supervisor'].includes(user.role)) {
            document.getElementById('audit-container').innerHTML = `<div class="bg-red-50 text-red-600 p-6 rounded-2xl text-center font-bold"><i class="fa-solid fa-lock text-4xl mb-4 block"></i>عذراً، هذه الصفحة مخصصة للإدارة والمحاسبين فقط.</div>`;
            document.getElementById('loader').classList.add('hidden');
            document.getElementById('audit-container').classList.remove('hidden');
            return;
        }

        const chip = document.getElementById('user-chip');
        if (chip) {
            document.getElementById('user-name').textContent = user.name || user.username || 'مستخدم';
            chip.classList.remove('hidden');
            chip.classList.add('inline-flex');
        }

        const orders = window.SaddahDB.data.orders || [];
        const archive = window.SaddahDB.data.archive || [];
        const allOrders = [...orders, ...archive];
        const allClaims = window.SaddahDB.data.claims || [];

        // KPIs في الهيدر
        let totRev = 0, totProf = 0;
        allOrders.forEach(o => {
            if (o.computed) {
                totRev += parseFloat(o.computed.revenue) || 0;
                totProf += parseFloat(o.computed.netProfit) || 0;
            }
        });
        const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setText('kpi-orders', allOrders.length);
        setText('kpi-revenue', fmtNum(totRev));
        setText('kpi-profit', fmtNum(totProf));

        // خريطة الطلب ← مفتاح الشهر (لربط المطالبات بشهر طلبها)
        const orderMonth = {};
        allOrders.forEach(o => {
            const dateStr = (o.client && o.client.deliveryDate) || o.createdAt || '';
            orderMonth[o.id] = getSortKey(dateStr);
        });

        const groups = {};
        const ensureGroup = (key, dateStr) => {
            if (!groups[key]) groups[key] = { monthName: getMonthName(dateStr), orders: [], claims: [], rev: 0, exp: 0, prof: 0, paid: 0, rem: 0 };
            return groups[key];
        };

        allOrders.forEach(o => {
            const dateStr = (o.client && o.client.deliveryDate) || o.createdAt || '';
            const key = getSortKey(dateStr);
            const g = ensureGroup(key, dateStr);
            g.orders.push(o);
            if (o.computed) {
                g.rev += parseFloat(o.computed.revenue) || 0;
                g.exp += parseFloat(o.computed.expenses) || 0;
                g.prof += parseFloat(o.computed.netProfit) || 0;
                g.paid += parseFloat(o.computed.paid) || 0;
                g.rem += parseFloat(o.computed.remaining) || 0;
            }
        });

        // إسناد كل مطالبة لشهر طلبها (أو لتاريخها إن لم ترتبط بطلب)
        allClaims.forEach(c => {
            let key, dateStr;
            if (c.orderId != null && orderMonth[c.orderId]) {
                key = orderMonth[c.orderId];
                dateStr = key + '-01';
            } else {
                dateStr = String(c.date || '').slice(0, 10);
                key = getSortKey(dateStr);
            }
            const g = ensureGroup(key, dateStr);
            g.claims.push(c);
        });

        const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

        let html = '';
        sortedKeys.forEach((key, index) => {
            const g = groups[key];
            const accId = `acc-${index}`;
            const isOpen = index === 0;

            // ترقيم وتلوين مطالبات الشهر (يُستخدم في النقطة على المصروف وبطاقة المطالبة)
            g.claims.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
            const claimMap = {};
            g.claims.forEach((c, i) => {
                claimMap[c.id] = { num: i + 1, color: CLAIM_COLORS[i % CLAIM_COLORS.length], emp: c.employee || '' };
            });

            html += `
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-4">
                <button onclick="toggleAccordion('${accId}')" class="w-full px-5 py-4 bg-slate-50 hover:bg-slate-100 transition flex items-center justify-between border-b border-slate-100 cursor-pointer text-right">
                    <div class="flex items-center gap-3">
                        <div class="w-11 h-11 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center text-lg shadow-inner shrink-0"><i class="fa-regular fa-calendar-check"></i></div>
                        <div>
                            <h3 class="font-black text-slate-800 text-lg">${g.monthName}</h3>
                            <div class="flex flex-wrap gap-2 mt-1">
                                <span class="text-[10px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">${g.orders.length} طلب</span>
                                ${g.claims.length ? `<span class="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">${g.claims.length} مطالبة</span>` : ''}
                                ${g.rem > 0 ? `<span class="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">متبقي ${fmtMoney(g.rem)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-6">
                        <div class="hidden md:block text-center">
                            <span class="block text-[10px] text-slate-400 font-bold">الإيرادات</span>
                            <span class="block font-black font-inter text-slate-700 text-sm">${fmtMoney(g.rev)}</span>
                        </div>
                        <div class="hidden md:block text-center">
                            <span class="block text-[10px] text-slate-400 font-bold">المصروفات</span>
                            <span class="block font-black font-inter text-red-500 text-sm">${fmtMoney(g.exp)}</span>
                        </div>
                        <div class="hidden md:block text-center">
                            <span class="block text-[10px] text-slate-400 font-bold">صافي الربح</span>
                            <span class="block font-black font-inter text-brand-600 text-sm">${fmtMoney(g.prof)}</span>
                        </div>
                        <div class="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-sm shrink-0">
                            <i id="icon-${accId}" class="fa-solid ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'} text-sm"></i>
                        </div>
                    </div>
                </button>
                <div id="${accId}" class="${isOpen ? '' : 'hidden'} p-4 sm:p-5 bg-slate-50/50">
                    <div class="audit-grid" id="grid-${accId}">
                        <div class="audit-orders-col">
                            ${g.orders.map((o, oi) => renderOrder(o, `${accId}-o${oi}`, accId, claimMap)).join('')}
                        </div>
                        <aside class="audit-claims-col">
                            ${renderClaimsPanel(g.claims, claimMap, accId)}
                        </aside>
                        <svg class="audit-connectors" id="svg-${accId}"></svg>
                    </div>
                </div>
            </div>`;
        });

        if (!sortedKeys.length) {
            html = `<div class="text-center py-20 bg-white rounded-2xl border border-slate-200"><i class="fa-solid fa-folder-open text-3xl text-slate-300 mb-3 block"></i><p class="text-slate-400 font-bold">لا يوجد بيانات للعرض</p></div>`;
        }

        document.getElementById('audit-container').innerHTML = html;
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('audit-container').classList.remove('hidden');

        // رسم الخيوط بعد اكتمال التخطيط
        requestAnimationFrame(() => drawAllConnectors());
        setTimeout(drawAllConnectors, 300);
        window.addEventListener('load', () => setTimeout(drawAllConnectors, 100));

    } catch (e) {
        console.error(e);
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('audit-container').innerHTML = `<div class="bg-red-50 text-red-500 p-4 rounded-xl text-center font-bold">حدث خطأ أثناء جلب البيانات.</div>`;
        document.getElementById('audit-container').classList.remove('hidden');
    }
}

window.addEventListener('resize', () => { clearTimeout(window._auditRz); window._auditRz = setTimeout(drawAllConnectors, 120); });

async function saddahLogout() {
    try { await fetch(window.SaddahBase + '/auth.php?action=logout', { method: 'POST', cache: 'no-store' }); } catch (e) {}
    location.replace('login.html');
}

document.addEventListener('DOMContentLoaded', initAudit);

