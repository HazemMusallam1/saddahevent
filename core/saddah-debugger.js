/**
 * Saddah ERP Live Debugger & Log Console
 * يحتفظ بسجل كامل لكافة الأخطاء مع زر "نسخ جميع الأخطاء" لسهولة مشاركتها
 */
(function() {
    if (window.__SaddahDebuggerInitialized) return;
    window.__SaddahDebuggerInitialized = true;

    const errorLogs = [];

    function initDebuggerUI() {
        if (document.getElementById('saddah-debug-modal')) return;

        const html = `
            <!-- Floating Badge Button -->
            <button id="saddah-debug-badge" onclick="window.toggleSaddahDebugModal()" class="hidden fixed bottom-5 left-5 z-[999998] bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 transition-all transform hover:scale-105 border-2 border-white/20 dir-rtl cursor-pointer">
                <i class="fa-solid fa-bug animate-bounce"></i>
                <span>الأخطاء المسجلة</span>
                <span id="saddah-debug-count" class="bg-white text-red-700 font-extrabold text-xs px-2 py-0.5 rounded-full">0</span>
            </button>

            <!-- Debug Log Modal -->
            <div id="saddah-debug-modal" class="hidden fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 dir-rtl text-right font-sans">
                <div class="bg-slate-900 border border-red-500/40 rounded-2xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden text-slate-100 animate-in fade-in duration-200">
                    
                    <!-- Header -->
                    <div class="bg-red-950/90 border-b border-red-500/30 px-6 py-4 flex items-center justify-between shrink-0">
                        <div class="flex items-center gap-3">
                            <span class="w-3.5 h-3.5 rounded-full bg-red-500 animate-ping"></span>
                            <h3 class="font-bold text-red-400 text-lg flex items-center gap-2">
                                <i class="fa-solid fa-terminal"></i> سجل أخطاء النظام (Saddah Error Log Console)
                            </h3>
                        </div>
                        <div class="flex items-center gap-2">
                            <button onclick="window.copyAllSaddahLogs(this)" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition shadow cursor-pointer">
                                <i class="fa-solid fa-copy"></i> نسخ جميع الأخطاء (Copy All)
                            </button>
                            <button onclick="window.clearSaddahLogs()" class="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer">
                                <i class="fa-solid fa-trash"></i> مسح السجل
                            </button>
                            <button onclick="window.toggleSaddahDebugModal()" class="text-slate-400 hover:text-white text-2xl px-2 transition cursor-pointer">
                                &times;
                            </button>
                        </div>
                    </div>

                    <!-- Log List -->
                    <div id="saddah-debug-log-list" class="p-6 overflow-y-auto flex-1 space-y-4 font-mono text-sm">
                        <!-- Items injected here -->
                    </div>

                    <!-- Footer -->
                    <div class="bg-slate-950 border-t border-slate-800 px-6 py-3.5 flex items-center justify-between text-xs text-slate-400 shrink-0">
                        <span>انقر على زر "نسخ جميع الأخطاء" لمشاركتها معنا مباشرة</span>
                        <button onclick="window.toggleSaddahDebugModal()" class="bg-slate-800 hover:bg-slate-700 text-white font-bold px-5 py-2 rounded-xl transition cursor-pointer">
                            إغلاق (Close)
                        </button>
                    </div>
                </div>
            </div>
        `;
        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDebuggerUI);
    } else {
        initDebuggerUI();
    }

    window.toggleSaddahDebugModal = function() {
        initDebuggerUI();
        const modal = document.getElementById('saddah-debug-modal');
        if (modal) modal.classList.toggle('hidden');
    };

    window.addSaddahErrorLog = function(type, msg, url, locationStr) {
        initDebuggerUI();
        const time = new Date().toLocaleTimeString('ar-SA');
        const logEntry = {
            id: Date.now() + Math.random(),
            time: time,
            type: type || 'Error',
            location: locationStr || 'N/A',
            msg: typeof msg === 'object' ? JSON.stringify(msg, null, 2) : String(msg),
            url: url || window.location.href
        };

        errorLogs.push(logEntry);
        renderLogs();

        // Show floating badge
        const badge = document.getElementById('saddah-debug-badge');
        const count = document.getElementById('saddah-debug-count');
        if (badge && count) {
            count.textContent = errorLogs.length;
            badge.classList.remove('hidden');
        }

        // Auto open modal on new error
        const modal = document.getElementById('saddah-debug-modal');
        if (modal && modal.classList.contains('hidden')) {
            modal.classList.remove('hidden');
        }
    };

    function renderLogs() {
        const list = document.getElementById('saddah-debug-log-list');
        if (!list) return;

        if (errorLogs.length === 0) {
            list.innerHTML = `<div class="text-center text-slate-500 py-12">لا توجد أخطاء مسجلة حالياً ✨</div>`;
            return;
        }

        list.innerHTML = errorLogs.slice().reverse().map((item, index) => `
            <div class="bg-slate-950 p-4 rounded-xl border border-red-500/20 space-y-2">
                <div class="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                    <span class="text-amber-400 font-bold">#${errorLogs.length - index} - ${item.type}</span>
                    <span class="text-slate-500">${item.time}</span>
                </div>
                <div>
                    <span class="text-slate-400 text-xs block font-sans">موقع الكود (File & Line):</span>
                    <span class="text-emerald-400 font-bold text-xs break-all">${item.location}</span>
                </div>
                <div>
                    <span class="text-slate-400 text-xs block font-sans">التفاصيل (Details):</span>
                    <pre class="text-red-300 whitespace-pre-wrap break-all text-xs max-h-40 overflow-y-auto leading-relaxed bg-slate-900/50 p-2.5 rounded-lg">${item.msg}</pre>
                </div>
                <div>
                    <span class="text-slate-400 text-xs block font-sans">الرابط المستهدف (URL):</span>
                    <span class="text-sky-400 text-xs break-all">${item.url}</span>
                </div>
            </div>
        `).join('');
    }

    window.copyAllSaddahLogs = function(btn) {
        if (errorLogs.length === 0) {
            alert('لا توجد أخطاء لنسخها!');
            return;
        }

        const textToCopy = errorLogs.map((item, idx) => `
========================================
🚨 الخطأ رقم #${idx + 1} [${item.time}]
المصدر/النوع: ${item.type}
موقع الكود: ${item.location}
الرابط المستهدف: ${item.url}
التفاصيل:
${item.msg}
========================================
        `).join('\n');

        navigator.clipboard.writeText(textToCopy).then(() => {
            const origText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> تم نسخ جميع الأخطاء بنجاح!';
            btn.classList.replace('bg-emerald-600', 'bg-teal-600');
            setTimeout(() => {
                btn.innerHTML = origText;
                btn.classList.replace('bg-teal-600', 'bg-emerald-600');
            }, 2000);
        }).catch(err => {
            prompt('انسخ الأخطاء من المربع التالي:', textToCopy);
        });
    };

    window.clearSaddahLogs = function() {
        errorLogs.length = 0;
        renderLogs();
        const badge = document.getElementById('saddah-debug-badge');
        if (badge) badge.classList.add('hidden');
    };

    // Catch Uncaught JS Errors
    window.addEventListener('error', function(e) {
        if (e.target && (e.target.src || e.target.href)) {
            window.addSaddahErrorLog('Resource Load Failure (404)', `Failed to load resource: ${e.target.src || e.target.href}`, e.target.src || e.target.href, 'HTML Asset Tag');
        } else {
            window.addSaddahErrorLog('JavaScript Exception', e.message, window.location.href, `${e.filename} : السطر ${e.lineno}:${e.colno}`);
        }
    }, true);

    // Catch Unhandled Promise Rejections
    window.addEventListener('unhandledrejection', function(e) {
        window.addSaddahErrorLog('Promise Rejection Error', e.reason?.stack || e.reason || 'Unhandled Promise Rejection', window.location.href, 'Async Promise Code');
    });

    // Intercept fetch API calls to record all errors
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
        const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || window.location.href);
        try {
            const res = await origFetch.apply(this, args);
            if (!res.ok && res.status !== 401) {
                const clone = res.clone();
                const text = await clone.text();
                let errorObj = null;
                try { errorObj = JSON.parse(text); } catch(err) {}

                if (errorObj) {
                    const loc = errorObj.file ? `${errorObj.file} : السطر ${errorObj.line}` : `HTTP Status ${res.status}`;
                    const detail = errorObj.error || errorObj.message || text;
                    window.addSaddahErrorLog(`PHP Backend Error (${res.status})`, detail + (errorObj.trace ? "\n\nStack Trace:\n" + errorObj.trace : ""), reqUrl, loc);
                } else {
                    window.addSaddahErrorLog(`HTTP Status Error (${res.status})`, text.substring(0, 3000) || `Server returned HTTP status ${res.status}`, reqUrl, `HTTP ${res.status}`);
                }
            }
            return res;
        } catch(err) {
            window.addSaddahErrorLog('Network / API Connection Failure', err.message, reqUrl, 'Browser Network Engine');
            throw err;
        }
    };
})();
