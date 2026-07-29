/**
 * Saddah Live Debugger - Visual Pop-up Modal HUD
 * يظهر نافذة تنبيه حمراء منبثقة (Pop-up) على الشاشة فور حدوث أي خطأ أثنآء التصفح
 */
(function() {
    if (window.__SaddahDebuggerInitialized) return;
    window.__SaddahDebuggerInitialized = true;

    function initModal() {
        if (document.getElementById('saddah-debug-modal')) return;
        const modalHtml = `
            <div id="saddah-debug-modal" class="hidden fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 dir-rtl text-right font-sans">
                <div class="bg-slate-900 border border-red-500/40 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden text-slate-100 animate-in fade-in duration-200">
                    <div class="bg-red-950/90 border-b border-red-500/30 px-6 py-4 flex items-center justify-between shrink-0">
                        <div class="flex items-center gap-3">
                            <span class="w-3.5 h-3.5 rounded-full bg-red-500 animate-ping"></span>
                            <h3 class="font-bold text-red-400 text-lg flex items-center gap-2">
                                <i class="fa-solid fa-bug"></i> مكتشف الأخطاء المباشر (Pop-up Live Debugger)
                            </h3>
                        </div>
                        <button onclick="document.getElementById('saddah-debug-modal').classList.add('hidden')" class="text-slate-400 hover:text-white text-2xl p-1 transition cursor-pointer">
                            &times;
                        </button>
                    </div>
                    <div class="p-6 overflow-y-auto space-y-4 font-mono text-sm">
                        <div class="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                            <span class="text-slate-400 text-xs block mb-1 font-sans">نوع الخطأ / كود الحالة:</span>
                            <span id="saddah-debug-type" class="text-amber-400 font-bold text-base"></span>
                        </div>
                        <div class="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                            <span class="text-slate-400 text-xs block mb-1 font-sans">تفاصيل الخطأ ورسالة الخادم:</span>
                            <pre id="saddah-debug-msg" class="text-red-300 whitespace-pre-wrap break-all text-xs max-h-60 overflow-y-auto leading-relaxed"></pre>
                        </div>
                        <div class="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                            <span class="text-slate-400 text-xs block mb-1 font-sans">الرابط المسبب للخطأ (Target URL):</span>
                            <span id="saddah-debug-url" class="text-sky-400 break-all text-xs"></span>
                        </div>
                    </div>
                    <div class="bg-slate-950 border-t border-slate-800 px-6 py-3.5 flex items-center justify-between text-xs text-slate-400 shrink-0">
                        <span>اضغط إغلاق لمتابعة التصفح أو إغلاق التنبيه</span>
                        <button onclick="document.getElementById('saddah-debug-modal').classList.add('hidden')" class="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl transition shadow-lg cursor-pointer">
                            إغلاق التنبيه (Close)
                        </button>
                    </div>
                </div>
            </div>
        `;
        const div = document.createElement('div');
        div.innerHTML = modalHtml;
        document.body.appendChild(div.firstElementChild);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModal);
    } else {
        initModal();
    }

    window.showSaddahDebug = function(type, msg, url) {
        initModal();
        setTimeout(() => {
            const modal = document.getElementById('saddah-debug-modal');
            if (!modal) return;
            document.getElementById('saddah-debug-type').textContent = type || 'Uncaught Exception';
            document.getElementById('saddah-debug-msg').textContent = typeof msg === 'object' ? JSON.stringify(msg, null, 2) : String(msg);
            document.getElementById('saddah-debug-url').textContent = url || window.location.href;
            modal.classList.remove('hidden');
        }, 50);
    };

    // Catch Uncaught JS Errors
    window.addEventListener('error', function(e) {
        if (e.target && (e.target.src || e.target.href)) {
            window.showSaddahDebug('Resource Load Failed (404/Network)', `Failed to load asset: ${e.target.src || e.target.href}`, e.target.src || e.target.href);
        } else {
            window.showSaddahDebug('JavaScript Error', `${e.message}\nFile: ${e.filename}\nLine: ${e.lineno}:${e.colno}`, window.location.href);
        }
    }, true);

    // Catch Unhandled Promise Rejections
    window.addEventListener('unhandledrejection', function(e) {
        window.showSaddahDebug('Promise Rejection Error', e.reason?.stack || e.reason || 'Unhandled Promise Rejection', window.location.href);
    });

    // Intercept fetch API calls to auto-trigger Pop-up on 404 / 500 / 403 errors
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const res = await origFetch.apply(this, args);
            if (!res.ok && res.status !== 401) {
                const clone = res.clone();
                const text = await clone.text();
                const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || window.location.href);
                window.showSaddahDebug(`HTTP Status Error ${res.status}`, text.substring(0, 3000) || `Server returned HTTP status ${res.status}`, reqUrl);
            }
            return res;
        } catch(err) {
            const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || window.location.href);
            window.showSaddahDebug('Network / API Connection Failure', err.message, reqUrl);
            throw err;
        }
    };
})();
