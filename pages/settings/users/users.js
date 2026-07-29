// ============================================================================
//  نظام صده — لوحة إدارة الحسابات والصلاحيات (المدير فقط)
//  تعمل عبر auth.php على الاستضافة.
// ============================================================================
(function () {
    const U = (window.SaddahDB && window.SaddahDB.user) || {};
    let CSRF = U.csrf || '';

    let ALL_PAGES = [];
    let USERS = [];
    let editingUsername = null;

    // أسماء الصفحات بالعربية للعرض في لوحة الصلاحيات
    const LABELS = {
        'order_tracking.html': 'تتبع الطلبات',
        'calculator.html': 'حاسبة العقود',
        'orders.html': 'الطلبات',
        'customers.html': 'العملاء',
        'archive.html': 'الأرشيف',
        'inventory.html': 'إدارة المخزون',
        'claims.html': 'المطالبات',
        'cash_remittance.html': 'تسليم النقدية',
        'portfolio.html': 'المحفظة',
        'dues_transfers.html': 'تحويلات المستحقات',
        'client_securities.html': 'تأمينات العملاء',
        'report_full.html': 'تقرير شامل',
        'report_monthly.html': 'تقرير شهري',
        'report_single.html': 'تقرير طلب',
        'audit.html': 'الجرد',
        'users.html': 'إدارة الحسابات',
    };
    // أيقونات الصفحات للعرض الجميل
    const ICONS = {
        'order_tracking.html': 'fa-route',
        'calculator.html': 'fa-calculator',
        'orders.html': 'fa-file-invoice',
        'customers.html': 'fa-user-group',
        'archive.html': 'fa-box-archive',
        'inventory.html': 'fa-warehouse',
        'claims.html': 'fa-file-circle-exclamation',
        'cash_remittance.html': 'fa-money-bill-transfer',
        'portfolio.html': 'fa-briefcase',
        'dues_transfers.html': 'fa-right-left',
        'client_securities.html': 'fa-shield-halved',
        'report_full.html': 'fa-chart-pie',
        'report_monthly.html': 'fa-calendar-check',
        'report_single.html': 'fa-file-lines',
        'audit.html': 'fa-clipboard-check',
        'users.html': 'fa-users-gear',
    };
    const ROLE_LABELS = { admin: 'مدير', financial: 'محاسب', supervisor: 'مدير الشركة', user: 'مخصّص' };
    const ROLE_BADGE = {
        admin: 'bg-indigo-100 text-indigo-700',
        financial: 'bg-emerald-100 text-emerald-700',
        supervisor: 'bg-amber-100 text-amber-700',
        user: 'bg-slate-100 text-slate-600',
    };
    // باقات صلاحية جاهزة تُطبّق عند تغيير الدور يدوياً (قابلة للتعديل بعدها)
    const ROLE_PRESETS = {
        financial: ['order_tracking.html', 'orders.html', 'customers.html', 'archive.html', 'claims.html',
            'cash_remittance.html', 'portfolio.html', 'dues_transfers.html', 'client_securities.html',
            'report_full.html', 'report_monthly.html', 'report_single.html', 'audit.html'],
        supervisor: ['order_tracking.html', 'orders.html', 'customers.html', 'archive.html', 'claims.html',
            'cash_remittance.html', 'portfolio.html', 'dues_transfers.html', 'client_securities.html',
            'report_full.html', 'report_monthly.html', 'report_single.html', 'audit.html'],
        user: [],
    };

    const $ = (id) => document.getElementById(id);

    // ── إشعارات (Toast) ────────────────────────────────────────────────────
    function showToast(message, type = 'success') {
        const container = $('toast-container');
        if (!container) return;
        const colors = {
            success: 'bg-emerald-600',
            error: 'bg-red-600',
            info: 'bg-indigo-600',
        };
        const icons = {
            success: 'fa-circle-check',
            error: 'fa-circle-exclamation',
            info: 'fa-circle-info',
        };
        const toast = document.createElement('div');
        toast.className = `toast ${colors[type] || colors.info} text-white px-5 py-3 rounded-xl shadow-lg font-bold text-sm flex items-center gap-2`;
        toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> ${message}`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ── التواصل مع الخادم ───────────────────────────────────────────────────
    async function postAuth(action, payload) {
        const bodyWithCsrf = { ...payload, _csrf: CSRF };
        const r = await fetch(window.SaddahBase + '/auth.php?action=' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-CSRF-Token': CSRF },
            body: JSON.stringify(bodyWithCsrf),
        });
        let d = {};
        try { d = JSON.parse(await r.text()); } catch (e) {}
        // لو CSRF منتهي → نجدّده من me
        if (!r.ok && d.error === 'csrf') {
            try {
                const meRes = await fetch(window.SaddahBase + '/auth.php?action=me', { cache: 'no-store' });
                const me = JSON.parse(await meRes.text());
                if (me && me.csrf) { CSRF = me.csrf; }
            } catch(e) {}
            // نعيد المحاولة بالتوكن الجديد
            const bodyWithCsrf2 = { ...payload, _csrf: CSRF };
            const r2 = await fetch(window.SaddahBase + '/auth.php?action=' + action, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-CSRF-Token': CSRF },
                body: JSON.stringify(bodyWithCsrf2),
            });
            try { d = JSON.parse(await r2.text()); } catch(e) {}
            return { ok: r2.ok, data: d };
        }
        return { ok: r.ok, data: d };
    }

    // ── تحميل قائمة المستخدمين ──────────────────────────────────────────────
    async function load() {
        try {
            const r = await fetch(window.SaddahBase + '/auth.php?action=users', { cache: 'no-store' });
            if (r.status === 401) { location.replace('login.html'); return; }
            if (r.status === 403) {
                $('users-list').innerHTML = '<tr><td colspan="5" class="p-8 text-center text-red-500 font-bold"><i class="fa-solid fa-lock text-2xl text-red-300 block mb-2"></i>ليس لديك صلاحية الوصول لهذه الصفحة.</td></tr>';
                return;
            }
            const d = JSON.parse(await r.text());
            if (d.error) {
                $('users-list').innerHTML = '<tr><td colspan="5" class="p-8 text-center text-red-500 font-bold"><i class="fa-solid fa-circle-exclamation text-2xl text-red-300 block mb-2"></i>حدث خطأ في تحميل الحسابات.</td></tr>';
                return;
            }
            ALL_PAGES = d.allPages || [];
            USERS = d.users || [];
            buildPermsCheckboxes();
            renderList();
        } catch (e) {
            $('users-list').innerHTML = '<tr><td colspan="5" class="p-8 text-center text-red-500 font-bold"><i class="fa-solid fa-wifi text-2xl text-red-300 block mb-2"></i>تعذّر الاتصال بالخادم. تأكد أن PHP مفعّل.</td></tr>';
        }
    }

    // ── عرض قائمة المستخدمين ─────────────────────────────────────────────────
    function renderList() {
        const me = (U.username || '').toLowerCase();
        if (USERS.length === 0) {
            $('users-list').innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-400"><i class="fa-solid fa-user-slash text-2xl text-slate-300 block mb-2"></i>لا توجد حسابات.</td></tr>';
            return;
        }
        $('users-list').innerHTML = USERS.map(u => {
            const role = u.role || 'user';
            const isMe = (u.username || '').toLowerCase() === me;
            const perms = u.perms || [];
            const permsTxt = perms.includes('*') ? 'كل الصفحات' : perms.length + ' صفحة';
            // عرض أسماء الصفحات المسموحة كـ tooltip
            const permsList = perms.includes('*') ? 'كل الصفحات' : perms.map(p => LABELS[p] || p).join('، ');
            return `<tr class="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
                <td class="py-3.5 px-3 font-bold">${esc(u.username)}${isMe ? ' <span class="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold">أنت</span>' : ''}</td>
                <td class="py-3.5 px-3 text-slate-600">${esc(u.name || '')}</td>
                <td class="py-3.5 px-2 text-center"><span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${ROLE_BADGE[role] || ROLE_BADGE.user}">${ROLE_LABELS[role] || role}</span></td>
                <td class="py-3.5 px-2 text-center text-xs text-slate-500 cursor-help" title="${esc(permsList)}">${permsTxt}</td>
                <td class="py-3.5 px-2 text-center whitespace-nowrap">
                    <button data-user="${esc(u.username)}" class="edit-btn text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-1 rounded-lg transition" title="تعديل"><i class="fa-solid fa-pen text-xs"></i></button>
                    <button data-user="${esc(u.username)}" class="del-btn text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition" title="حذف"${isMe ? ' disabled class="text-slate-300 cursor-not-allowed px-2 py-1"' : ''}><i class="fa-solid fa-trash text-xs"></i></button>
                </td></tr>`;
        }).join('');

        // ربط الأحداث بطريقة آمنة (بدل inline onclick)
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => openUserForm(btn.dataset.user));
        });
        document.querySelectorAll('.del-btn').forEach(btn => {
            if (!btn.disabled) btn.addEventListener('click', () => deleteUser(btn.dataset.user));
        });
    }

    // ── بناء خانات الصلاحيات ─────────────────────────────────────────────────
    function buildPermsCheckboxes() {
        const container = $('u-perms');
        if (!container) return;
        container.innerHTML = ALL_PAGES.map(p => `
            <label class="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 transition select-none">
                <input type="checkbox" class="u-perm accent-indigo-600 cursor-pointer" value="${p}" onchange="updatePermsCount()">
                <i class="fa-solid ${ICONS[p] || 'fa-file'} text-slate-400 text-[10px] w-3.5 text-center"></i>
                <span>${LABELS[p] || p}</span>
            </label>`).join('');
    }

    function setCheckedPerms(list) {
        document.querySelectorAll('.u-perm').forEach(c => { c.checked = list.includes(c.value); });
        updatePermsCount();
    }
    function checkedPerms() {
        return Array.from(document.querySelectorAll('.u-perm:checked')).map(c => c.value);
    }
    function updatePermsVisibility() {
        const admin = $('u-role').value === 'admin';
        const section = $('u-perms-section');
        const adminNote = $('u-perms-admin');
        if (section) section.classList.toggle('hidden', admin);
        if (adminNote) adminNote.classList.toggle('hidden', !admin);
    }

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    // إخفاء كل أخطاء النموذج
    function clearErrors() {
        ['u-username-err', 'u-pass-err', 'u-form-error'].forEach(id => {
            const el = $(id);
            if (el) { el.textContent = ''; el.classList.add('hidden'); }
        });
        ['u-username', 'u-password'].forEach(id => {
            const el = $(id);
            if (el) el.classList.remove('border-red-400');
        });
    }
    function showFieldError(fieldId, errId, message) {
        const field = $(fieldId);
        const err = $(errId);
        if (field) field.classList.add('border-red-400');
        if (err) { err.textContent = message; err.classList.remove('hidden'); }
    }
    function showFormError(message) {
        const el = $('u-form-error');
        if (el) { el.textContent = message; el.classList.remove('hidden'); }
    }

    // ── تحديد/إلغاء الكل ───────────────────────────────────────────────────
    window.selectAllPerms = function () {
        document.querySelectorAll('.u-perm').forEach(c => c.checked = true);
        updatePermsCount();
    };
    window.deselectAllPerms = function () {
        document.querySelectorAll('.u-perm').forEach(c => c.checked = false);
        updatePermsCount();
    };
    window.updatePermsCount = function () {
        const num = $('u-perms-num');
        if (num) num.textContent = checkedPerms().length;
    };

    // ── فتح نافذة الحساب ────────────────────────────────────────────────────
    window.openUserForm = function (username) {
        clearErrors();
        editingUsername = username || null;
        const editing = !!username;
        $('user-modal-title').textContent = editing ? 'تعديل حساب' : 'حساب جديد';
        $('u-pass-hint').textContent = editing ? '(اتركها فارغة للإبقاء على الحالية)' : '*';
        $('u-username').readOnly = editing;
        $('u-username').classList.toggle('bg-slate-100', editing);
        $('u-username').classList.toggle('cursor-not-allowed', editing);

        if (editing) {
            const u = USERS.find(x => x.username === username) || {};
            $('u-username').value = u.username || '';
            $('u-name').value = u.name || '';
            $('u-role').value = u.role || 'user';
            $('u-password').value = '';
            updatePermsVisibility();
            setCheckedPerms((u.perms || []).includes('*') ? ALL_PAGES : (u.perms || []));
        } else {
            $('u-username').value = '';
            $('u-name').value = '';
            $('u-password').value = '';
            $('u-role').value = 'user';
            updatePermsVisibility();
            setCheckedPerms([]);
        }
        $('user-modal').classList.remove('hidden');
        $('user-modal').classList.add('flex');
        // تركيز على أول حقل
        setTimeout(() => $(editing ? 'u-name' : 'u-username').focus(), 100);
    };

    window.closeUserForm = function () {
        $('user-modal').classList.add('hidden');
        $('user-modal').classList.remove('flex');
    };

    // ── تغيير الدور → باقة صلاحيات مقترحة ──────────────────────────────────
    window.onRoleChange = function () {
        updatePermsVisibility();
        const role = $('u-role').value;
        if (role === 'admin') return;
        // عند التعديل لا نغيّر الصلاحيات تلقائياً — فقط عند الإنشاء أو لو المستخدم غيّر الدور يدوياً
        setCheckedPerms(ROLE_PRESETS[role] || []);
    };

    // ── حفظ الحساب ──────────────────────────────────────────────────────────
    window.saveUser = async function () {
        clearErrors();
        const username = $('u-username').value.trim();
        const name = $('u-name').value.trim();
        const password = $('u-password').value;
        const role = $('u-role').value;
        const perms = role === 'admin' ? ['*'] : checkedPerms();

        // التحقق من المدخلات
        let hasError = false;
        if (!username) {
            showFieldError('u-username', 'u-username-err', 'اسم المستخدم مطلوب.');
            hasError = true;
        } else if (!/^[a-zA-Z0-9_\u0600-\u06FF\-.]+$/.test(username)) {
            showFieldError('u-username', 'u-username-err', 'اسم المستخدم يحتوي أحرف غير مسموحة.');
            hasError = true;
        }
        if (!editingUsername && !password) {
            showFieldError('u-password', 'u-pass-err', 'كلمة السر مطلوبة للحساب الجديد.');
            hasError = true;
        } else if (password && password.length < 4) {
            showFieldError('u-password', 'u-pass-err', 'كلمة السر قصيرة جداً (4 أحرف على الأقل).');
            hasError = true;
        }
        if (role !== 'admin' && perms.length === 0) {
            showFormError('يجب تحديد صفحة واحدة على الأقل من الصلاحيات.');
            hasError = true;
        }
        if (hasError) return;

        // إرسال للخادم
        const btn = $('u-save');
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.classList.add('btn-loading');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';

        try {
            const { ok, data } = await postAuth('saveUser', { username, name, password, role, perms });
            if (ok && data.ok) {
                closeUserForm();
                showToast(editingUsername ? 'تم تحديث الحساب بنجاح ✓' : 'تم إنشاء الحساب بنجاح ✓', 'success');
                await load();
            } else {
                // رسائل خطأ واضحة من الخادم
                const errMsg = data.error || 'تعذّر حفظ الحساب.';
                if (errMsg.includes('اسم المستخدم')) showFieldError('u-username', 'u-username-err', errMsg);
                else if (errMsg.includes('كلمة السر')) showFieldError('u-password', 'u-pass-err', errMsg);
                else showFormError(errMsg);
            }
        } catch (e) {
            showFormError('تعذّر الاتصال بالخادم. حاول مرة أخرى.');
        }

        btn.disabled = false;
        btn.classList.remove('btn-loading');
        btn.innerHTML = originalHTML;
    };

    // ── حذف حساب ────────────────────────────────────────────────────────────
    window.deleteUser = async function (username) {
        if (!confirm('حذف الحساب «' + username + '» نهائياً؟\n\nهذا الإجراء لا يمكن التراجع عنه.')) return;
        try {
            const { ok, data } = await postAuth('deleteUser', { username });
            if (ok && data.ok) {
                showToast('تم حذف الحساب «' + username + '» ✓', 'info');
                await load();
            } else {
                showToast(data.error || 'تعذّر حذف الحساب.', 'error');
            }
        } catch (e) {
            showToast('تعذّر الاتصال بالخادم.', 'error');
        }
    };

    // ── إغلاق النافذة بـ Escape ─────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeUserForm();
    });

    // ── بدء التحميل ─────────────────────────────────────────────────────────
    load();
})();

