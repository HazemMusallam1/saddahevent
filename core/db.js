// js/db.js — Server-first | localStorage cache
// ─────────────────────────────────────────────
// Source of truth : POST/GET  /api/db  → saddah_database.json
// Fast cache       : localStorage (survives page reload without a network round-trip)
// Offline fallback : localStorage is used automatically when the server is unreachable
// ─────────────────────────────────────────────
(function () {

    const API = '/api/db';

    const CACHE_KEYS = {
        orders:       'sadda_orders_db',
        inventory:    'sadda_inventory_db',
        productTypes: 'sadda_product_types',
        archive:      'sadda_archive_db',
        claims:       'sadda_claims_db',
        batches:      'sadda_batches_db'
    };

    // Default inventory — used only when both server and cache are empty/bad
    const DEFAULT_INVENTORY = [
        {id:1001,name:'طاولة مستطيلة (مع 10 كراسي)',type:'باقة (طاولة+كراسي)',color:'ذهبي',desc:'قواعد ذهبية وسطح زجاجي',price:1043.48,stock:3,lowStock:1,capacity:10,decorFee:0,decorComponents:[],isExternal:false,supplier:'',supplierPhone:'',image:''},
        {id:1002,name:'طاولة دائرية',type:'قطعة فردية',color:'ذهبي',desc:'قواعد ذهبية وسطح زجاجي',price:304.35,stock:5,lowStock:1,capacity:6,decorFee:0,decorComponents:[],isExternal:false,supplier:'',supplierPhone:'',image:''},
        {id:1003,name:'طاولة بار (كوكتيل)',type:'قطعة فردية',color:'ذهبي',desc:'قواعد ذهبية وسطح زجاجي',price:73.91,stock:10,lowStock:2,capacity:0,decorFee:0,decorComponents:[],isExternal:false,supplier:'',supplierPhone:'',image:''},
        {id:1004,name:'طاولة بوفيه',type:'قطعة فردية',color:'ذهبي',desc:'طاولة بوفيه',price:60.87,stock:5,lowStock:1,capacity:0,decorFee:0,decorComponents:[],isExternal:false,supplier:'',supplierPhone:'',image:''},
        {id:1005,name:'طاولة مدخل (شامل تنسيق)',type:'قطعة فردية',color:'متنوع',desc:'طاولة مدخل مع تنسيق',price:217.39,stock:2,lowStock:1,capacity:0,decorFee:0,decorComponents:[],isExternal:false,supplier:'',supplierPhone:'',image:''},
        {id:1006,name:'كراسي ديور',type:'قطعة فردية',color:'بيج',desc:'كراسي ديور فايبر',price:33.99,stock:50,lowStock:10,capacity:0,decorFee:0,decorComponents:[],isExternal:false,supplier:'',supplierPhone:'',image:''},
        {id:1007,name:'كراسي ديور راتان',type:'قطعة فردية',color:'بيج',desc:'كراسي ديور راتان',price:21.74,stock:30,lowStock:5,capacity:0,decorFee:0,decorComponents:[],isExternal:false,supplier:'',supplierPhone:'',image:''},
        {id:1008,name:'تنسيق مدخل بسيط',type:'خدمة',color:'متنوع',desc:'تنسيق بسيط للمدخل',price:43.48,stock:0,lowStock:0,capacity:0,decorFee:0,decorComponents:[],isExternal:false,supplier:'',supplierPhone:'',image:''},
        {id:1009,name:'جهاز ليزر الاسماء',type:'خدمة',color:'-',desc:'جهاز ليزر الاسماء مع عدسة',price:539.13,stock:1,lowStock:0,capacity:0,decorFee:0,decorComponents:[],isExternal:false,supplier:'',supplierPhone:'',image:''}
    ];
    const DEFAULT_TYPES = ['باقة (طاولة+كراسي)','قطعة فردية','خدمة','إضاءة','سجاد','مكيفات'];

    // ── helpers ──────────────────────────────────────────────────────────────

    function emptyDB() {
        return { orders:[], inventory:[], productTypes:[], archive:[], claims:[], batches:[] };
    }

    /** Centralized function to calculate and update financial data on an order object */
    function calculateOrderFinancials(order) {
        if (!order || !order.financials) return;
        
        let totalRaw = order.financials.total;
        if (typeof totalRaw === 'string') totalRaw = totalRaw.replace(' ريال', '');
        const total = parseFloat(totalRaw) || parseFloat(order.financials.subTotal) || 0;
        
        let deductedInsurance = 0;
        if (order.returns && order.returns.length > 0) {
            order.returns.forEach(r => deductedInsurance += parseFloat(r.deducted) || 0);
        }

        let received = 0;
        if (order.paymentProofs && order.paymentProofs.length > 0) {
            order.paymentProofs.forEach(p => received += parseFloat(p.amount) || 0);
        } else {
            received = parseFloat(order.financials.paid) || 0;
        }

        let clientRefunded = 0; // الأموال المعادة للعميل
        let expenseRefunds = {}; // مرتجعات المصروفات (أموال مستردة من الموردين/المناديب)
        if (order.returns && order.returns.length > 0) {
            order.returns.forEach(r => {
                const amt = parseFloat(r.refund) || 0;
                if (r.linkedExpenseIndex != null) {
                    expenseRefunds[r.linkedExpenseIndex] = (expenseRefunds[r.linkedExpenseIndex] || 0) + amt;
                } else {
                    clientRefunded += amt;
                }
            });
        }

        // ── التكاليف المهيكلة: توصيل خارجي / إرجاع مستودع / بنزين ──────────────
        // مصدرها الأساسي extraFinancials، ثم بند مصروف مطابق بالاسم (بيانات قديمة)،
        // ثم حقول financials القديمة. ملاحظة: financials.delivery = رسوم توصيل العميل
        // (في العقد) وليست تكلفتنا، فلا تُحتسب كتكلفة.
        const ef = order.extraFinancials || {};
        function expenseCost(e) {
            let c = parseFloat(e.total);
            if (isNaN(c) || c <= 0) c = parseFloat(e.afterDiscount);
            if (isNaN(c) || c <= 0) c = parseFloat(e.amountAfterDiscount);
            if (isNaN(c) || c <= 0) c = parseFloat(e.amount);
            return c || 0;
        }
        const STRUCTURED_NAMES = ['توصيل خارجي', 'إرجاع مستودع', 'بنزين عبد الرزاق'];
        function namedExpense(name) {
            const expenses = order.expenses || [];
            const idx = expenses.findIndex(x => x && x.name === name);
            if (idx !== -1) {
                let cost = expenseCost(expenses[idx]);
                if (expenseRefunds[idx]) cost -= expenseRefunds[idx];
                return cost > 0 ? cost : 0;
            }
            return 0;
        }
        const extDelivery = parseFloat(ef.externalDelivery)  || namedExpense('توصيل خارجي')     || 0;
        const whDelivery  = parseFloat(ef.warehouseDelivery) || namedExpense('إرجاع مستودع')    || parseFloat(order.financials.returnDelivery) || 0;
        const fuel        = parseFloat(ef.abdulrazzaqFuel)   || namedExpense('بنزين عبد الرزاق') || parseFloat(order.financials.fuel)           || 0;

        // باقي المصروفات: بنود expenses عدا المهيكلة (حتى لا تُحتسب مرتين)
        let otherExpenses = 0;
        if (order.expenses && order.expenses.length > 0) {
            order.expenses.forEach((e, idx) => {
                if (e && STRUCTURED_NAMES.indexOf(e.name) !== -1) return; // مُحتسبة بشكل منفصل
                let cost = expenseCost(e);
                if (expenseRefunds[idx]) cost -= expenseRefunds[idx];
                if (cost > 0) otherExpenses += cost;
            });
        }

        // مصروفات الطلب (تُخصم من ربح الطلب). البنزين لا يدخل هنا — يُخصم من
        // نصيب التشغيل (netOperating) كما في باقي الصفحات، ويُسوّى عبر صفحة المستحقات.
        const totalExpenses = extDelivery + whDelivery + otherExpenses;
        const isCancelled = order.status === 'cancelled' || order.status === 'ملغي';

        // الإيراد الفعلي (المال الداخل) = الإجمالي شامل الضريبة — لا يتأثر بعلامة الضريبة
        // ملاحظة: تم إزالة التأمين المصادر من الإيراد العام ليتجه مباشرة لمحفظة التأمينات
        let revenue = total;
        let remaining = (total + deductedInsurance) - (received - clientRefunded);

        // ── حساب الربح حسب علامة "شامل الضريبة" (موحّد لكل الصفحات) ──
        // includeTaxInProfit = true  → الضريبة تُحتسب ضمن الربح (نستخدم الإجمالي شامل الضريبة)
        // includeTaxInProfit = false → الضريبة تُستبعد من الربح (نستخدم المبلغ قبل الضريبة subTotal)
        const includeTax = order.financials.includeTaxInProfit === true;
        const subTotalVal = parseFloat(order.financials.subTotal) || 0;
        let profitBase = (includeTax || subTotalVal <= 0) ? total : subTotalVal;

        // إذا كان الطلب ملغياً، نعتمد على ما تم تحصيله كإيراد فعلي (نحجز العربون) ولا يوجد متبقي.
        if (isCancelled) {
            const actualReceived = (received - clientRefunded) > 0 ? (received - clientRefunded) : 0;
            revenue = actualReceived;
            remaining = 0;
            profitBase = actualReceived;
        }

        // التأمين المصادَر (deductedInsurance) لا يُحتسب ضمن الربح —
        // يُتابَع منفصلاً في صفحة "تأمينات العملاء" (محفظة التأمينات المصادرة)
        const netProfit = profitBase - totalExpenses;

        const operatingShare = netProfit > 0 ? netProfit * 0.10 : 0;
        const distributableProfit = netProfit > 0 ? netProfit * 0.90 : 0;

        order.computed = {
            total: parseFloat(total.toFixed(2)),
            deductedInsurance: parseFloat(deductedInsurance.toFixed(2)),
            received: parseFloat(received.toFixed(2)),
            extDelivery: parseFloat(extDelivery.toFixed(2)),
            whDelivery: parseFloat(whDelivery.toFixed(2)),
            otherExpenses: parseFloat(otherExpenses.toFixed(2)),
            totalExpenses: parseFloat(totalExpenses.toFixed(2)),
            revenue: parseFloat(revenue.toFixed(2)),
            remaining: parseFloat(remaining.toFixed(2)),
            netProfit: parseFloat(netProfit.toFixed(2)),
            includeTax: includeTax,
            operatingShare: parseFloat(operatingShare.toFixed(2)),
            distributableProfit: parseFloat(distributableProfit.toFixed(2)),
            fuel: parseFloat(fuel.toFixed(2))
        };
    }

    /** Read one collection from localStorage — returns null if key missing/corrupt */
    function cacheGet(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch(e) { return null; }
    }

    /** Read the full DB from localStorage cache */
    function readCache() {
        return {
            orders:       cacheGet(CACHE_KEYS.orders)       || [],
            inventory:    cacheGet(CACHE_KEYS.inventory)    || [],
            productTypes: cacheGet(CACHE_KEYS.productTypes) || [],
            archive:      cacheGet(CACHE_KEYS.archive)      || [],
            claims:       cacheGet(CACHE_KEYS.claims)       || [],
            batches:      cacheGet(CACHE_KEYS.batches)      || []
        };
    }

    /** Write the full DB to localStorage cache */
    function writeCache(data) {
        try {
            localStorage.setItem(CACHE_KEYS.orders,       JSON.stringify(data.orders       || []));
            localStorage.setItem(CACHE_KEYS.inventory,    JSON.stringify(data.inventory    || []));
            localStorage.setItem(CACHE_KEYS.productTypes, JSON.stringify(data.productTypes || []));
            localStorage.setItem(CACHE_KEYS.archive,      JSON.stringify(data.archive      || []));
            localStorage.setItem(CACHE_KEYS.claims,       JSON.stringify(data.claims       || []));
            localStorage.setItem(CACHE_KEYS.batches,      JSON.stringify(data.batches      || []));
            // Timestamp — used to detect if cache is newer than server
            localStorage.setItem('sadda_cache_saved_at', Date.now().toString());
        } catch(e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                // localStorage full — strip large base64 from claims and retry
                console.warn('localStorage quota exceeded — stripping embedded images from claims cache...');
                try {
                    const lightClaims = (data.claims || []).map(c => {
                        if (c.invoiceBase64 && c.invoiceBase64.length > 5000) {
                            return { ...c, invoiceBase64: '[cached-on-server]' };
                        }
                        return c;
                    });
                    localStorage.setItem(CACHE_KEYS.claims, JSON.stringify(lightClaims));
                    localStorage.setItem(CACHE_KEYS.batches, JSON.stringify(data.batches || []));
                    localStorage.setItem('sadda_cache_saved_at', Date.now().toString());
                } catch(e2) {
                    console.warn('localStorage write still failed after stripping:', e2);
                }
            } else {
                console.warn('localStorage write failed:', e);
            }
        }
    }

    /** Timestamp of last server write (stored inside saddah_database.json) */
    function serverSavedAt(serverData) {
        return serverData._savedAt || 0;
    }

    /** True if inventory looks like the old test placeholder */
    function isBadInventory(inv) {
        if (!inv || inv.length === 0) return true;
        if (inv.length === 1 && inv[0].name === 'سسس') return true;
        return false;
    }

    /** POST data to the server API — returns true on success */
    let _csrf = '';
    async function postToServer(data) {
        try {
            // ندمج الـ CSRF في الـ body لأن LiteSpeed قد يحذف ترويسة X-CSRF-Token
            const payload = { ...data, _csrf: _csrf };
            const res = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-CSRF-Token': _csrf },
                body: JSON.stringify(payload)
            });
            return res.ok;
        } catch(e) {
            return false;
        }
    }

    // ── بوابة المصادقة: تُفرض دائماً عبر PHP — لا يوجد تجاوز محلي ──────────
    async function authGuard() {
        // إخفاء الصفحة فوراً حتى يتم التحقق من الجلسة (يمنع عرض المحتوى قبل التوثيق)
        document.documentElement.style.visibility = 'hidden';

        let me = null;
        try {
            const r = await fetch(window.SaddahBase + '/auth.php?action=me', { cache: 'no-store' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            me = JSON.parse(await r.text());
        } catch (e) {
            // PHP لا يعمل أو يرجّع خطأ → لا نمنح وصولاً أبداً
            location.replace('login.html');
            return false;
        }
        if (!me || !me.authed) { location.replace('login.html'); return false; }

        // تم التحقق بنجاح → إظهار الصفحة
        document.documentElement.style.visibility = '';
        window.SaddahDB.user = me;
        _csrf = me.csrf || '';
        const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
        const perms = me.perms || [];
        const allowed = perms.includes('*') || perms.includes(page) || page === 'index.html' || page === '' || page === 'share_attach.html';
        if (!allowed) { alert('ليس لديك صلاحية للوصول لهذه الصفحة.'); location.replace('index.html'); return false; }
        if (!perms.includes('*')) {
            document.querySelectorAll('a[href$=".html"]').forEach(a => {
                const p = (a.getAttribute('href') || '').toLowerCase();
                if (p && !perms.includes(p) && p !== 'index.html' && p !== 'login.html') a.style.display = 'none';
            });
        }
        return true;
    }

    // ── SaddahDB ─────────────────────────────────────────────────────────────

    window.SaddahDB = {
        data: emptyDB(),
        isInitialized: false,
        isOnline: false,   // true when the server is reachable

        /** Load data. Tries server first; falls back to localStorage cache. */
        async init() {
            if (this.isInitialized) return;
            if (!(await authGuard())) return; // بوابة المصادقة (إعادة توجيه لتسجيل الدخول إن لزم)

            let serverData = null;
            let needsServerUpdate = false;

            // ── 1. Try server ─────────────────────────────────────────────────
            try {
                const res = await fetch(API + '?t=' + Date.now(), { cache: 'no-store' });
                if (res.ok) {
                    serverData = await res.json();
                    this.isOnline = true;
                }
            } catch(e) {
                this.isOnline = false;
            }

            // ── 2. Read localStorage cache ────────────────────────────────────
            const cache = readCache();

            if (this.isOnline && serverData) {
                // ═════════════════════════════════════════════════════════════
                //  السيرفر = الحاكم المطلق (Single Source of Truth).
                //  المحلي (الكاش) نسخة طبق الأصل من السيرفر — لا يفوز عليه أبداً.
                //  أي شيء غير موجود على السيرفر (محذوف) يُحذف من المحلي تلقائياً.
                // ═════════════════════════════════════════════════════════════
                this.data = {
                    orders:       Array.isArray(serverData.orders)       ? serverData.orders       : [],
                    inventory:    Array.isArray(serverData.inventory)    ? serverData.inventory    : [],
                    productTypes: Array.isArray(serverData.productTypes) ? serverData.productTypes : [],
                    archive:      Array.isArray(serverData.archive)      ? serverData.archive      : [],
                    claims:       Array.isArray(serverData.claims)       ? serverData.claims       : [],
                    batches:      Array.isArray(serverData.batches)      ? serverData.batches      : [],
                    _savedAt:     serverData._savedAt || 0
                };

                // الاستثناء الوحيد: أول تشغيل والسيرفر فارغ تماماً → نرفع الكاش لمرة واحدة
                const serverEmpty  = this.data.orders.length === 0 && this.data.inventory.length === 0;
                const cacheHasData = (cache.orders && cache.orders.length > 0) || (cache.inventory && cache.inventory.length > 0);
                if (serverEmpty && cacheHasData) {
                    this.data.orders       = cache.orders || [];
                    this.data.inventory    = !isBadInventory(cache.inventory) ? cache.inventory : DEFAULT_INVENTORY;
                    this.data.productTypes = (cache.productTypes && cache.productTypes.length) ? cache.productTypes : DEFAULT_TYPES;
                    this.data.archive      = cache.archive || [];
                    this.data.claims       = cache.claims  || [];
                    this.data.batches      = cache.batches || [];
                    await postToServer(this.data);
                }

                // إصلاح المخزون التالف على السيرفر (الصنف التجريبي القديم)
                if (isBadInventory(this.data.inventory)) {
                    this.data.inventory    = DEFAULT_INVENTORY;
                    this.data.productTypes = DEFAULT_TYPES;
                    await postToServer(this.data);
                }

            } else {
                // ── 3. Server offline — use cache or defaults ─────────────────
                this.data = {
                    orders:       cache.orders.length > 0   ? cache.orders       : [],
                    inventory:    !isBadInventory(cache.inventory) ? cache.inventory : DEFAULT_INVENTORY,
                    productTypes: (cache.productTypes && cache.productTypes.length > 0 && cache.productTypes[0] !== 'سس')
                                      ? cache.productTypes : DEFAULT_TYPES,
                    archive:      cache.archive  || [],
                    claims:       cache.claims   || [],
                    batches:      cache.batches  || []
                };

                if (!this.isOnline) {
                    console.warn('⚠️ السيرفر غير متاح — يعمل من الكاش المحلي. شغّل تشغيل_نظام_صده.bat للاتصال بقاعدة البيانات.');
                }
            }

            // Recalculate once on init in case old data exists
            if (this.data.orders) this.data.orders.forEach(calculateOrderFinancials);
            if (this.data.archive) this.data.archive.forEach(calculateOrderFinancials);

            // Always keep localStorage cache fresh
            writeCache(this.data);

            this.isInitialized = true;
        },

        /**
         * Save data — الحفظ "أول بأول":
         * 1. يُعيد حساب الماليات (مصدر موحّد)
         * 2. يكتب على الكاش فوراً (متزامن — الواجهة لا تنتظر)
         * 3. يرسل للسيرفر، ويضبط علامة (dirty) حسب النجاح/الفشل
         *    حتى لو فشل الإرسال أو كان السيرفر مغلقاً، البيانات محفوظة محلياً
         *    وتُرفع للسيرفر تلقائياً في أول تشغيل قادم.
         */
        async save() {
            // Recalculate all financials before saving to ensure Single Source of Truth
            if (this.data.orders) this.data.orders.forEach(calculateOrderFinancials);
            if (this.data.archive) this.data.archive.forEach(calculateOrderFinancials);

            this.data._savedAt = Date.now();

            // 1) كتابة فورية على الكاش المحلي (مرآة للسيرفر)
            writeCache(this.data);

            // 2) الإرسال للسيرفر "أول بأول" — السيرفر هو الحاكم
            if (this.isOnline) {
                try {
                    const ok = await postToServer(this.data);
                    if (!ok) console.warn('⚠️ فشل الحفظ على السيرفر — تأكد أن السيرفر يعمل.');
                    return ok;
                } catch(e) {
                    console.error('⚠️ خطأ أثناء الحفظ على السيرفر:', e);
                    return false;
                }
            } else {
                console.warn('⚠️ السيرفر مغلق — لم يُحفظ على السيرفر. شغّل النظام عبر تشغيل_نظام_صده.bat');
                return false;
            }
        }
    };

    // ════════════════════════════════════════════════════════════════════════
    //  الطبقة العلائقية (Relational Layer)
    //  ─────────────────────────────────────────────────────────────────────
    //  قاعدة بيانات رئيسية واحدة (SaddahDB) تحتوي عدة "جداول" مترابطة:
    //
    //    orders ──┬──< claims        (claims.orderId      → orders.id)
    //             ├──< (expenses)     [مضمّنة داخل الطلب]
    //             ├──< (paymentProofs)[مضمّنة داخل الطلب]
    //             └──< (returns)      [مضمّنة داخل الطلب]
    //    inventory (مستقل)            productTypes (مستقل)
    //    archive  (طلبات مؤرشفة — نفس بنية orders)
    //    batches  ──< claims          (دفعات تسديد المطالبات)
    //
    //  كل جدول له مفتاح أساسي (pk) ومفاتيح ربط (fks). الوصول لكل البيانات
    //  وعلاقاتها يتم من هنا فقط، لضمان التماسك والسلامة المرجعية.
    // ════════════════════════════════════════════════════════════════════════
    window.SaddahDB.schema = {
        orders:       { pk: 'id', label: 'الطلبات' },
        archive:      { pk: 'id', label: 'الأرشيف' },
        inventory:    { pk: 'id', label: 'المخزون' },
        productTypes: { pk: null, label: 'أنواع المنتجات' },
        claims:       { pk: 'id', fks: { orderId: 'orders' }, label: 'المطالبات' },
        batches:      { pk: 'id', label: 'دفعات المطالبات' }
    };

    window.SaddahDB.rel = {
        // ── وصول عام لأي جدول ──────────────────────────────────────────────
        all(table) {
            return window.SaddahDB.data[table] || [];
        },
        find(table, id) {
            const pk = (window.SaddahDB.schema[table] || {}).pk || 'id';
            return this.all(table).find(r => String(r[pk]) === String(id)) || null;
        },
        where(table, predicate) {
            return this.all(table).filter(predicate);
        },

        // ── الطلب هو المحور: يبحث في الطلبات النشطة ثم الأرشيف ──────────────
        getOrder(id) {
            return this.find('orders', id) || this.find('archive', id);
        },
        getProduct(id) {
            return this.find('inventory', id);
        },

        // ── علاقة المطالبات بالطلبات (foreign key: claim.orderId) ──────────
        getClaimsForOrder(orderId) {
            return this.where('claims', c => String(c.orderId) === String(orderId));
        },
        getOrderOfClaim(claim) {
            if (!claim || claim.orderId == null) return null;
            return this.getOrder(claim.orderId);
        },
        // وصف مقروء للطلب المرتبط: "اسم العميل • #رقم"
        orderLabel(orderId) {
            const o = this.getOrder(orderId);
            if (!o) return '';
            const name = o.client ? o.client.name : 'طلب';
            return `${name} • #${String(orderId).slice(-4)}`;
        },

        // ── عرض موحّد: الطلب + كل البيانات المرتبطة به ──────────────────────
        getOrderFull(id) {
            const order = this.getOrder(id);
            if (!order) return null;
            return {
                order,
                computed:      order.computed || null,
                expenses:      order.expenses || [],
                paymentProofs: order.paymentProofs || [],
                returns:       order.returns || [],
                claims:        this.getClaimsForOrder(id)
            };
        },

        // ── السلامة المرجعية ───────────────────────────────────────────────
        // حذف طلب + كل مطالباته المرتبطة (cascade) — يمنع المطالبات اليتيمة
        cascadeDeleteOrder(id) {
            let removed = { order: 0, claims: 0 };
            ['orders', 'archive'].forEach(tbl => {
                const arr = window.SaddahDB.data[tbl];
                if (!Array.isArray(arr)) return;
                const i = arr.findIndex(o => String(o.id) === String(id));
                if (i > -1) { arr.splice(i, 1); removed.order++; }
            });
            const claims = window.SaddahDB.data.claims;
            if (Array.isArray(claims)) {
                for (let i = claims.length - 1; i >= 0; i--) {
                    if (String(claims[i].orderId) === String(id)) {
                        claims.splice(i, 1); removed.claims++;
                    }
                }
            }
            return removed;
        },

        // مطالبات يتيمة: تشير لطلب غير موجود
        findOrphanClaims() {
            return this.where('claims', c =>
                c.orderId != null && !this.getOrder(c.orderId)
            );
        }
    };

})();

// --- Add global URL resolver for saddah:// ---
window.resolveSaddahUrl = function(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('saddah://')) return url;
    try {
        const decUrl = decodeURIComponent(url);
        const parts = decUrl.replace('saddah://', '').split('/');
        const orderId = parts.shift();
        const subPath = parts.join('/');
        
        const db = window.SaddahDB?.data || { orders: [], archive: [] };
        let order = db.orders?.find(o => String(o.id) === String(orderId));
        let statusFolder = '?? ??? ?????';
        
        if (!order) {
            order = db.archive?.find(o => String(o.id) === String(orderId));
            if (order) statusFolder = '?? ?????';
        }
        
        if (!order) return url;
        
        let folderName = order.folderName;
        if (!folderName && window.getOrderFolderNamesAPI) {
            folderName = window.getOrderFolderNamesAPI(order)[0]; // Use Arabic format
        } else if (!folderName) {
            let clientName = (order.client?.name || '???? ???').replace(/[\/\\?%*:|"<>]/g, '-').trim();
            let amount = (order.financials?.total || '0').toString().replace(/[^\d.]/g, '').trim();
            let dateStr = (order.client?.deliveryDate || order.date || '???? ?????').replace(/[\/\\?%*:|"<>]/g, '-').trim();
            folderName = `${clientName} - ${amount} - ${dateStr}`;
        }
        
        const encodedSubPath = subPath.split('/').map(encodeURIComponent).join('/');
        const encodedFolderName = folderName.split('/').map(encodeURIComponent).join('/');
        
        return 'saddah%20Archive/' + encodedFolderName + '/' + encodedSubPath;
    } catch(e) {
        console.error('resolveSaddahUrl error:', e);
        return url;
    }
};

window.getOrderFolderNamesAPI = function(orderData) {
    if (!orderData) return ['بدون اسم - 0 ريال - بدون تاريخ', 'بدون اسم - 0 - بدون تاريخ'];
    if (orderData.folderName) return [orderData.folderName, orderData.folderName];
    
    let clientName = (orderData.client && orderData.client.name ? orderData.client.name : 'بدون اسم').replace(/[/\\?%*:|"<>\[\]]/g, '-').trim();
    
    // New (English) Format
    let rawAmount = (orderData.financials && orderData.financials.total ? orderData.financials.total : '0').toString();
    let newAmount = rawAmount.replace(/[^\d.]/g, '').trim();
    let newDate = (orderData.client && orderData.client.deliveryDate ? orderData.client.deliveryDate : (orderData.date || 'بدون تاريخ')).replace(/[/\\?%*:|"<>\[\]]/g, '-').trim();
    let englishName = `${clientName} - ${newAmount} - ${newDate}`;
    
    // Old (Arabic) Format
    let amountNum = parseFloat(newAmount) || 0;
    let oldAmountStr = Number.isInteger(amountNum) ? amountNum.toString() : amountNum.toFixed(2);
    let arabicAmount = `${oldAmountStr} ريال`;
    
    let rawDate = orderData.client && orderData.client.deliveryDate ? orderData.client.deliveryDate : (orderData.date || '');
    let arabicDateStr = 'بدون تاريخ';
    if (rawDate && rawDate.includes('-')) {
        const parts = rawDate.split('-');
        if (parts.length >= 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const day = parseInt(parts[2], 10);
            const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
            if (month >= 1 && month <= 12) {
                arabicDateStr = `${day} ${arabicMonths[month - 1]}`;
            } else {
                arabicDateStr = rawDate.replace(/[/\\?%*:|"<>\[\]]/g, '-').trim();
            }
        } else {
            arabicDateStr = rawDate.replace(/[/\\?%*:|"<>\[\]]/g, '-').trim();
        }
    } else if (rawDate) {
        arabicDateStr = rawDate.replace(/[/\\?%*:|"<>\[\]]/g, '-').trim();
    }
    
    let arabicName = `${clientName} - ${arabicAmount} - ${arabicDateStr}`;

    return [arabicName, englishName];
};

// ═══════════ منتج طاولات الخشب المميّز: مصفوفة التسعير + التهيئة ═══════════
// أسعار ثابتة 1..20 طاولة لثلاث باقات: بدون تنسيق / تنسيق جاهز / تنسيق مخصص (VIP)
// الفهرس = عدد الطاولات (1..20)؛ الموضع 0 غير مستخدم
window.TABLES_PRICING = {
    maxTables: 20,
    capacity:    [0,4,10,14,18,22,26,30,34,38,42,46,50,54,58,62,66,70,74,78,82],
    none:        [0,350,750,1100,1450,1800,2150,2500,2850,3200,3550,3900,4250,4600,4950,5300,5650,6000,6350,6700,7050],
    baseline:    [0,470,990,1460,1930,2400,2870,3340,3810,4280,4750,5220,5690,6160,6630,7100,7570,8040,8510,8980,9450], // السعر قبل الخصم
    premade:     [0,420,890,1240,1590,1920,2290,2670,3050,3420,3790,4170,4550,4920,5290,5690,6050,6420,6800,7180,7550],
    premadeDisc: [0,11,10,15,18,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20],
    vip:         [0,470,990,1390,1740,2160,2590,2840,3240,3640,4040,4440,4840,5240,5640,6040,6430,6830,7230,7630,8030],
    vipDisc:     [0,0,0,5,10,10,10,15,15,15,15,15,15,15,15,15,15,15,15,15,15]
};

// إرجاع تسعير باقة لعدد طاولات: { final, original, discount, savings, capacity, label, tables }
window.getTablesPricing = function(pkg, n) {
    const P = window.TABLES_PRICING;
    n = Math.max(1, Math.min(P.maxTables, parseInt(n) || 1));
    const cap = P.capacity[n] || 0;
    if (pkg === 'premade') {
        const fin = P.premade[n], orig = P.baseline[n];
        return { final: fin, original: orig, discount: P.premadeDisc[n], savings: orig - fin, capacity: cap, label: 'تنسيق جاهز', tables: n };
    }
    if (pkg === 'custom') {
        const fin = P.vip[n], orig = P.baseline[n];
        return { final: fin, original: orig, discount: P.vipDisc[n], savings: orig - fin, capacity: cap, label: 'تنسيق مخصص', tables: n };
    }
    const fin = P.none[n];
    return { final: fin, original: fin, discount: 0, savings: 0, capacity: cap, label: 'بدون تنسيق', tables: n };
};

// التأكد من وجود منتج الطاولات المميّز في المخزون (يُنشأ مرة واحدة فقط)
window.DEFAULT_TABLE_COLORS = ['ذهبي', 'أبيض وأخضر', 'وردي فاتح', 'كلاسيك بني'];
window.ensureTablesProduct = function() {
    if (!window.SaddahDB || !window.SaddahDB.data) return null;
    const inv = window.SaddahDB.data.inventory || (window.SaddahDB.data.inventory = []);
    let p = inv.find(i => i && i.isTieredTables);
    let changed = false;
    if (!p) {
        p = {
            id: 'wood-tables',
            name: 'طاولات خشب',
            type: 'باقة طاولات',
            isTieredTables: true,
            featured: true,
            price: window.TABLES_PRICING.none[1],
            capacity: 0, decorFee: 0, stock: 9999, lowStock: 0,
            desc: 'باقة طاولات وكراسي مع خيارات تنسيق (بدون / جاهز / مخصص)',
            stylingColors: window.DEFAULT_TABLE_COLORS.slice(),
            decorComponents: [], isExternal: false, image: ''
        };
        inv.push(p);
        changed = true;
    } else if (!Array.isArray(p.stylingColors)) {
        p.stylingColors = window.DEFAULT_TABLE_COLORS.slice();
        changed = true;
    }
    if (changed) { try { window.SaddahDB.save(); } catch (e) {} }
    return p;
};

// بناء رسالة أسعار جاهزة (تُستخدم في الحاسبة وودجة واتساب) — cat: comprehensive|basic|premade|custom
window.buildTablesPriceMessage = function(cat, n) {
    const P = window.TABLES_PRICING;
    if (!P) return '';
    n = Math.max(1, Math.min(P.maxTables, parseInt(n) || 1));
    const cap = P.capacity[n];
    const head = '🌟 *صدّه لتأجير الأثاث* 🌟';
    const foot = '\n\nنسعد بخدمتكم 🌹';
    const fmt = x => Number(x).toLocaleString('en-US');
    if (cat === 'basic') {
        return `${head}\n\n🪑 *الباقة الأساسية* (بدون تنسيق)\n\n• ${n} طاولة — تكفي ${cap} شخص\n• السعر: *${fmt(P.none[n])} ريال*\n\nتشمل الطاولات والكراسي.${foot}`;
    }
    if (cat === 'premade') {
        const fin = P.premade[n], orig = P.baseline[n], save = orig - fin, disc = P.premadeDisc[n];
        return `${head}\n\n✨ *باقة التنسيق الجاهز*\n\n• ${n} طاولة — تكفي ${cap} شخص\n• السعر: *${fmt(fin)} ريال*${save > 0 ? `\n• 🔖 بدلاً من ~${fmt(orig)} ريال — وفّرت ${fmt(save)} ريال (خصم ${disc}%)` : ''}\n\nتشمل: طاولات + كراسي + تنسيق فاخر بالألوان المتوفرة.${foot}`;
    }
    if (cat === 'custom') {
        const fin = P.vip[n], orig = P.baseline[n], save = orig - fin, disc = P.vipDisc[n];
        return `${head}\n\n👑 *باقة التنسيق الخاص (VIP)*\n\n• ${n} طاولة — تكفي ${cap} شخص\n• السعر: *${fmt(fin)} ريال*${save > 0 ? `\n• 🔖 خصم ${disc}% — وفّرت ${fmt(save)} ريال` : ''}\n\nتصميم حصري مخصّص بالكامل حسب ذوقكم.${foot}`;
    }
    const pSave = P.baseline[n] - P.premade[n];
    return `${head}\n\nعرض أسعار باقات الطاولات لـ *${n} طاولة* (تكفي ${cap} شخص):\n\n🪑 *أساسية* (بدون تنسيق): *${fmt(P.none[n])} ريال*\n✨ *تنسيق جاهز*: *${fmt(P.premade[n])} ريال*${pSave > 0 ? ` _(وفّر ${fmt(pSave)})_` : ''}\n👑 *تنسيق خاص VIP*: *${fmt(P.vip[n])} ريال*\n\nكل الباقات تشمل الطاولات والكراسي.\nاختر ما يناسب مناسبتكم${foot}`;
};



// ==========================================
// 🖼️ Storage Quota Defense: Canvas Compressor
// ==========================================
window.compressImageFile = async function(file, maxDim = 800, quality = 0.7) {
    if (!file || !file.type.startsWith('image/')) return file;
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxDim) {
                        height *= maxDim / width;
                        width = maxDim;
                    }
                } else {
                    if (height > maxDim) {
                        width *= maxDim / height;
                        height = maxDim;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        resolve(file); // fallback
                        return;
                    }
                    const newFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(newFile);
                }, 'image/jpeg', quality);
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
};
