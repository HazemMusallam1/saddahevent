
        // ── إعدادات (قائمة منسدلة) ──
        function toggleSettings(e) {
            if (e) e.stopPropagation();
            document.getElementById('settings-menu').classList.toggle('hidden');
        }
        document.addEventListener('click', () => {
            const m = document.getElementById('settings-menu');
            if (m && !m.classList.contains('hidden')) m.classList.add('hidden');
        });

        // ── التاريخ ──
        function renderToday() {
            try {
                const d = new Date();
                document.getElementById('today-text').textContent =
                    d.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            } catch (e) {}
        }

        // ── المؤشرات الحيّة ──
        const fmtInt = n => new Intl.NumberFormat('en-US').format(n || 0);
        const fmtMoney = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0));

        // ── جدول أرباح الأشهر (آخر 6 أشهر) ──
        function profitMonthKey(o) {
            const dd = o.client && o.client.deliveryDate;
            if (dd && /^\d{4}-\d{2}/.test(dd)) return dd.substring(0, 7);
            const dt = new Date(o.id);
            return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
        }
        function loadProfitChart(allOrders) {
            const box = document.getElementById('profit-chart');
            if (!box) return;
            const map = new Map();
            (allOrders || []).forEach(o => {
                if (!o.computed) return;
                const k = profitMonthKey(o);
                map.set(k, (map.get(k) || 0) + (parseFloat(o.computed.netProfit) || 0));
            });
            const keys = [...map.keys()].sort().slice(-6); // آخر 6 أشهر بالترتيب الزمني
            if (keys.length === 0) {
                box.innerHTML = '<p class="text-center text-xs text-slate-400 py-4">لا توجد بيانات</p>';
                return;
            }
            const maxAbs = Math.max(...keys.map(k => Math.abs(map.get(k))), 1);
            const kfmt = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k' : Math.round(v).toString();
            box.innerHTML = keys.map(k => {
                const val = map.get(k);
                const mon = parseInt(k.split('-')[1]);
                const name = SEC_MONTHS[mon - 1] || '';
                const pct = Math.max(Math.round(Math.abs(val) / maxAbs * 100), 4);
                const bar = val >= 0 ? 'bg-brand-500' : 'bg-red-400';
                const valCls = val >= 0 ? 'text-slate-600' : 'text-red-500';
                return `<div class="flex items-center gap-2" title="${name}: ${Math.round(val).toLocaleString('en-US')} ر.س">
                    <span class="text-[10px] font-bold text-slate-400 w-8 shrink-0">${name.slice(0, 3)}</span>
                    <div class="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <div class="h-full rounded-full ${bar}" style="width:${pct}%"></div>
                    </div>
                    <span class="text-[10px] font-black font-inter ${valCls} w-11 shrink-0 text-left">${kfmt(val)}</span>
                </div>`;
            }).join('');
        }

        // ── إحصاءات مفيدة ──
        function loadUsefulStats(allOrders) {
            const box = document.getElementById('useful-stats');
            if (!box) return;
            const count = allOrders.length;
            let totRev = 0, totProf = 0, totDeducted = 0, thisMonth = 0;
            const clients = new Set();
            const now = new Date();
            const curKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
            allOrders.forEach(o => {
                if (o.client && o.client.name) clients.add(o.client.name.trim());
                if (o.computed) {
                    totRev += parseFloat(o.computed.revenue) || 0;
                    totProf += parseFloat(o.computed.netProfit) || 0;
                    totDeducted += parseFloat(o.computed.deductedInsurance) || 0;
                }
                if (profitMonthKey(o) === curKey) thisMonth++;
            });
            const avgOrder = count ? totRev / count : 0;
            const avgProfit = count ? totProf / count : 0;
            const margin = totRev > 0 ? (totProf / totRev * 100) : 0;

            const rows = [
                { ic: 'fa-receipt',        c: 'text-indigo-500',  label: 'متوسط قيمة الطلب', val: fmtMoney(avgOrder) + ' ر.س' },
                { ic: 'fa-arrow-trend-up', c: 'text-emerald-500', label: 'متوسط ربح الطلب',  val: fmtMoney(avgProfit) + ' ر.س' },
                { ic: 'fa-percent',        c: 'text-brand-500',   label: 'هامش الربح',       val: margin.toFixed(1) + '%' },
                { ic: 'fa-users',          c: 'text-blue-500',    label: 'عدد العملاء',      val: fmtInt(clients.size) },
                { ic: 'fa-calendar-day',   c: 'text-orange-500',  label: 'طلبات هذا الشهر',  val: fmtInt(thisMonth) },
                { ic: 'fa-shield-halved',  c: 'text-red-500',     label: 'تأمينات مُصادَرة', val: fmtMoney(totDeducted) + ' ر.س' },
            ];
            box.innerHTML = rows.map(r => `
                <div class="flex items-center justify-between gap-2">
                    <span class="flex items-center gap-2 text-[13px] text-slate-500 font-bold">
                        <i class="fa-solid ${r.ic} ${r.c} text-xs w-4 text-center"></i> ${r.label}
                    </span>
                    <span class="text-[13px] font-black font-inter text-slate-700 shrink-0">${r.val}</span>
                </div>`).join('');
        }

        // ── الطلبات القادمة (مع عدّاد الأيام) ──
        const SEC_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        function loadUpcoming(orders) {
            const list = document.getElementById('upcoming-list');
            if (!list) return;
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const items = [];
            (orders || []).forEach(o => {
                const dd = o.client && o.client.deliveryDate;
                if (!dd || !/^\d{4}-\d{2}-\d{2}/.test(dd)) return;
                if (o.status === 'ملغي' || o.status === 'cancelled') return;
                const p = dd.split('-');
                const d = new Date(p[0], p[1] - 1, p[2]); d.setHours(0, 0, 0, 0);
                const days = Math.round((d - today) / 86400000);
                if (days < 0) return; // طلبات مضت
                items.push({ name: ((o.client.name) || 'عميل').trim(), day: parseInt(p[2]), mon: parseInt(p[1]), days });
            });
            items.sort((a, b) => a.days - b.days);
            const top = items.slice(0, 5);
            if (top.length === 0) {
                list.innerHTML = '<p class="text-center text-xs text-slate-400 py-5">لا توجد طلبات قادمة</p>';
                return;
            }
            list.innerHTML = top.map(it => {
                let label, cls;
                if (it.days === 0) { label = 'اليوم'; cls = 'bg-red-50 text-red-600'; }
                else if (it.days === 1) { label = 'غداً'; cls = 'bg-orange-50 text-orange-600'; }
                else if (it.days === 2) { label = 'بعد يومين'; cls = 'bg-orange-50 text-orange-600'; }
                else if (it.days <= 7) { label = 'باقي ' + it.days + ' أيام'; cls = 'bg-amber-50 text-amber-600'; }
                else { label = 'باقي ' + it.days + ' يوم'; cls = 'bg-emerald-50 text-emerald-600'; }
                const dateStr = it.day + ' ' + (SEC_MONTHS[it.mon - 1] || '');
                return `<a href="order_tracking.html" class="flex items-center justify-between gap-2 px-2.5 py-2.5 rounded-lg hover:bg-slate-50 transition">
                    <span class="min-w-0">
                        <span class="block font-bold text-slate-700 text-sm truncate">${it.name}</span>
                        <span class="block text-[11px] text-slate-400"><i class="fa-regular fa-calendar ml-1"></i>${dateStr}</span>
                    </span>
                    <span class="shrink-0 text-[11px] font-black px-2 py-1 rounded-full ${cls}">${label}</span>
                </a>`;
            }).join('');
        }

        async function loadDashboard() {
            renderToday();
            try {
                await window.SaddahDB.init();
                renderUserChip();
                const d = window.SaddahDB.data || {};
                const orders = d.orders || [];
                const archive = d.archive || [];
                const allOrders = [...orders, ...archive];

                let rev = 0, prof = 0;
                allOrders.forEach(o => {
                    if (o.computed) {
                        rev += parseFloat(o.computed.revenue) || 0;
                        prof += parseFloat(o.computed.netProfit) || 0;
                    }
                });

                
        if (window.SaddahDB.user && ['admin', 'financial', 'supervisor'].includes(window.SaddahDB.user.role)) {
            const auditBtn = document.getElementById('audit-dashboard-btn');
            if(auditBtn) auditBtn.classList.remove('hidden');
        }

                document.getElementById('kpi-orders').textContent = fmtInt(allOrders.length);
                document.getElementById('kpi-revenue').textContent = fmtMoney(rev);
                document.getElementById('kpi-profit').textContent = fmtMoney(prof);

                const pill = document.getElementById('server-status');
                const dot = document.getElementById('status-dot');
                const txt = document.getElementById('status-text');
                if (window.SaddahDB.isOnline) {
                    pill.className = 'hidden sm:inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600';
                    dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
                    txt.textContent = 'متصل بالخادم';
                } else {
                    pill.className = 'hidden sm:inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full bg-red-50 text-red-600';
                    dot.className = 'w-2 h-2 rounded-full bg-red-500';
                    txt.textContent = 'غير متصل بالخادم';
                }

                loadUpcoming(orders);
                loadProfitChart(allOrders);
                loadUsefulStats(allOrders);
            } catch (e) {
                console.error('Dashboard load error:', e);
                ['kpi-orders', 'kpi-revenue', 'kpi-profit'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = '0';
                });
            }
        }

        // عرض اسم المستخدم وزر الخروج
        function renderUserChip() {
            const u = (window.SaddahDB && window.SaddahDB.user) || {};
            const chip = document.getElementById('user-chip');
            if (!chip) return;
            document.getElementById('user-name').textContent = u.name || u.username || 'مستخدم';
            chip.classList.remove('hidden');
            chip.classList.add('inline-flex');
        }

        async function saddahLogout() {
            try { await fetch('auth.php?action=logout', { method: 'POST', cache: 'no-store' }); } catch (e) {}
            location.replace('login.html');
        }

        document.addEventListener('DOMContentLoaded', loadDashboard);
    