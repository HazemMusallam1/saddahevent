// whatsapp-widget.js - Vanilla JS WhatsApp Widget for Saddah ERP
(function() {
  // عنوان جسر واتساب:
  //  • محلياً (localhost / شبكة داخلية) → نفس الجهاز على المنفذ 3001
  //  • على الإنتاج (الموقع المباشر) → نفق Cloudflare الآمن wss://wa.saddahevent.com
  //  • يمكن التجاوز بأي وقت عبر تعريف window.WA_BRIDGE_URL قبل تحميل الودجة
  const SERVER = window.WA_BRIDGE_URL || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                 ? 'http://localhost:3001' 
                 : 'https://saddah-whatsapp.loca.lt');
  let socket = null;
  let waState = {
    status: 'connecting',
    qr: null,
    chats: [],
    messages: {}, // { chatJid: [messages] }
    activeJid: null,
    context: null,
    filter: 'all', // all | orders | upcoming
    drafts: {} // { [jid]: { name, idNumber, address, deposit, security } } — مُجمّعة من تحديد النص
  };

  // 1. Inject CSS
  if (!document.querySelector('link[href*="whatsapp-widget.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = (window.SaddahBase || '.') + '/assets/css/whatsapp-widget.css';
    document.head.appendChild(link);
  }

  // Font Awesome if missing
  if (!document.querySelector('link[href*="font-awesome"]')) {
    const fa = document.createElement('link');
    fa.rel = 'stylesheet';
    fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(fa);
  }

  // تنسيقات لوحة إرسال الأسعار
  if (!document.getElementById('wa-prices-style')) {
    const st = document.createElement('style');
    st.id = 'wa-prices-style';
    st.textContent = `
      .wa-price-cat{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:12px;border:1.5px solid #e6e9ef;background:#fff;cursor:pointer;text-align:right;width:100%;transition:all .12s;}
      .wa-price-cat:hover{border-color:#9333ea;background:#faf5ff;}
      .wa-price-cat .ic{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
      .wa-price-cat .t1{font-weight:800;font-size:13px;color:#1e293b;display:block;}
      .wa-price-cat .t2{font-size:10px;color:#94a3b8;display:block;margin-top:1px;}
      .wa-price-size{display:flex;flex-direction:column;align-items:center;gap:1px;padding:8px 3px;border-radius:10px;border:1.5px solid #e9d5ff;background:#faf5ff;cursor:pointer;transition:all .12s;}
      .wa-price-size:hover{border-color:#9333ea;background:#9333ea;}
      .wa-price-size:hover b,.wa-price-size:hover span{color:#fff;}
      .wa-price-size b{font-weight:800;font-size:12px;color:#7e22ce;font-family:'Inter',sans-serif;}
      .wa-price-size span{font-size:9px;color:#a78bfa;font-weight:700;}
      #wa-prices-btn:hover{background:#e9d5ff !important;}
    `;
    document.head.appendChild(st);
  }

  // 2. Build DOM
  const widgetHtml = `
    <div id="wa-widget-btn" onclick="waToggleWidget()">
      <i class="fa-brands fa-whatsapp"></i>
      <span class="wa-unread-badge" id="wa-badge">0</span>
    </div>
    
    <div id="wa-widget-window">
      <!-- Overlay for Connecting / QR -->
      <div id="wa-overlay">
        <div id="wa-qr-container" style="display: none;">
          <h3 style="margin-bottom:15px;text-align:center;color:#1e293b;font-weight:bold;">امسح الكود لربط واتساب</h3>
          <img id="wa-qr-img" src="" alt="QR Code">
        </div>
        <div id="wa-status-text" style="font-weight:bold;color:#64748b;margin-top:10px;">جارٍ الاتصال بالخادم...</div>
      </div>

      <!-- Left Col (Right in RTL): Chat List -->
      <div class="wa-col-chats show-mobile" id="wa-col-chats">
        <div class="wa-header">
          <i class="fa-brands fa-whatsapp" style="color:var(--wa-brand);font-size:24px;margin-left:10px;"></i>
          <span>المحادثات</span>
        </div>
        <div style="padding:10px 15px; border-bottom:1px solid rgba(0,0,0,0.05);">
          <input type="text" class="wa-search-bar" placeholder="بحث..." id="wa-search" oninput="waRenderChats()">
          <div id="wa-filters" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
            <button type="button" data-f="all" onclick="waSetFilter('all')" class="wa-filter-btn" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:14px;cursor:pointer;border:1px solid #25D366;background:#25D366;color:#fff;">الكل</button>
            <button type="button" data-f="orders" onclick="waSetFilter('orders')" class="wa-filter-btn" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:14px;cursor:pointer;border:1px solid #e2e8f0;background:#fff;color:#64748b;">طلبات عملاء</button>
            <button type="button" data-f="upcoming" onclick="waSetFilter('upcoming')" class="wa-filter-btn" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:14px;cursor:pointer;border:1px solid #e2e8f0;background:#fff;color:#64748b;">طلب قادم</button>
          </div>
        </div>
        <div class="wa-chat-list" id="wa-chat-list"></div>
      </div>

      <!-- Mid Col: Messages -->
      <div class="wa-col-messages hide-mobile" id="wa-col-messages">
        <div class="wa-header" id="wa-chat-header" style="justify-content:flex-start;">
          <button class="wa-btn-back" onclick="waCloseChat()"><i class="fa-solid fa-arrow-right"></i></button>
          <div class="wa-avatar" id="wa-active-avatar" style="width:40px;height:40px;font-size:14px;margin-left:10px;display:none;"></div>
          <div>
            <div id="wa-active-name" style="color:#1e293b;">اختر محادثة</div>
            <div id="wa-active-phone" style="font-size:12px;color:#94a3b8;direction:ltr;"></div>
          </div>
        </div>
        <div class="wa-messages-area" id="wa-messages-area">
          <div style="margin:auto;color:#94a3b8;text-align:center;">
            <i class="fa-regular fa-comments" style="font-size:48px;opacity:0.3;margin-bottom:10px;display:block;"></i>
            اختر محادثة للبدء
          </div>
        </div>
        <div class="wa-input-area" style="display:none;" id="wa-input-area">
          <button id="wa-prices-btn" onclick="waOpenPrices()" title="إرسال أسعار الطاولات للعميل" style="background:#f3e8ff;color:#9333ea;border:none;width:40px;height:40px;border-radius:50%;cursor:pointer;flex-shrink:0;margin-left:6px;font-size:15px;transition:background .12s;"><i class="fa-solid fa-tags"></i></button>
          <input type="text" class="wa-input-box" id="wa-msg-input" placeholder="اكتب رسالة..." onkeypress="if(event.key==='Enter') waSendMessage()">
          <button class="wa-send-btn" onclick="waSendMessage()" id="wa-send-btn">
            <i class="fa-solid fa-paper-plane" style="margin-right:-2px;"></i>
          </button>
        </div>
      </div>

      <!-- Right Col (Left in RTL): Context -->
      <div class="wa-col-context" id="wa-col-context">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;font-weight:bold;color:#1e293b;">
          <i class="fa-solid fa-database" style="color:var(--wa-brand);"></i>
          سياق العميل (نظام صده)
        </div>
        <div id="wa-context-content" class="wa-context-card">
          <div style="text-align:center;color:#94a3b8;font-size:13px;padding:20px 0;">لا توجد محادثة نشطة</div>
        </div>
      </div>

      <!-- لوحة إرسال الأسعار (overlay داخل الودجة) -->
      <div id="wa-prices-panel" style="position:absolute;inset:0;z-index:30;display:none;background:rgba(15,23,42,.45);align-items:center;justify-content:center;padding:16px;">
        <div style="background:#fff;border-radius:16px;width:100%;max-width:360px;max-height:90%;overflow:auto;box-shadow:0 14px 44px rgba(0,0,0,.3);">
          <div style="background:linear-gradient(90deg,#9333ea,#d946ef);color:#fff;padding:13px 15px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:800;font-size:15px;"><i class="fa-solid fa-tags"></i> إرسال الأسعار</span>
            <button onclick="waClosePrices()" style="background:rgba(255,255,255,.2);width:28px;height:28px;border-radius:50%;color:#fff;border:none;cursor:pointer;font-size:14px;">✕</button>
          </div>
          <div style="padding:14px;">
            <div id="wa-prices-to" style="font-size:11px;color:#64748b;font-weight:700;margin-bottom:12px;background:#f8fafc;border:1px solid #eef1f6;border-radius:8px;padding:7px 10px;"></div>
            <div id="wa-prices-step1" style="display:flex;flex-direction:column;gap:9px;">
              <button onclick="waPricesPickCat('comprehensive')" class="wa-price-cat"><span class="ic" style="background:#f3e8ff;color:#9333ea;"><i class="fa-solid fa-layer-group"></i></span><span><span class="t1">رسالة شاملة</span><span class="t2">مقارنة الباقات الثلاث لعدد معيّن</span></span></button>
              <button onclick="waPricesPickCat('premade')" class="wa-price-cat"><span class="ic" style="background:#ecfdf5;color:#059669;"><i class="fa-solid fa-wand-magic-sparkles"></i></span><span><span class="t1">تنسيق جاهز</span><span class="t2">سعر باقة التنسيق الجاهز مع الخصم</span></span></button>
              <button onclick="waPricesPickCat('custom')" class="wa-price-cat"><span class="ic" style="background:#fdf2f8;color:#db2777;"><i class="fa-solid fa-crown"></i></span><span><span class="t1">تنسيق خاص (VIP)</span><span class="t2">سعر باقة التصميم المخصص</span></span></button>
              <button onclick="waPricesPickCat('basic')" class="wa-price-cat"><span class="ic" style="background:#f8fafc;color:#475569;"><i class="fa-solid fa-table"></i></span><span><span class="t1">أسعار أساسية</span><span class="t2">باقة بدون تنسيق (طاولات + كراسي)</span></span></button>
            </div>
            <div id="wa-prices-step2" style="display:none;">
              <button onclick="waPricesBack()" style="background:none;border:none;color:#64748b;font-weight:700;font-size:12px;cursor:pointer;margin-bottom:11px;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-arrow-right"></i> رجوع للفئات</button>
              <div style="margin-bottom:11px;"><span id="wa-prices-cat-label" style="font-size:11px;font-weight:800;color:#7e22ce;background:#faf5ff;border:1px solid #f0e6fb;padding:3px 10px;border-radius:20px;"></span> <span style="font-size:11px;color:#94a3b8;font-weight:700;">— اختر عدد الأشخاص</span></div>
              <div id="wa-prices-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = widgetHtml;
  document.body.appendChild(wrapper);

  // ─── قائمة الكليك-يمين: تحديد نص من رسالة وحفظه كحقل للعقد ───────────────
  const WA_FIELDS = [
    { key: 'name',     label: '👤 اسم العميل' },
    { key: 'idNumber', label: '🪪 رقم الهوية' },
    { key: 'address',  label: '📍 العنوان' },
    { key: 'deposit',  label: '💵 العربون' },
    { key: 'security', label: '🛡️ التأمين' },
  ];
  let waCtxSelection = '';

  const waStyle = document.createElement('style');
  waStyle.textContent = '#wa-ctx-menu .wa-ctx-item:hover{background:#f1f5f9;}';
  document.head.appendChild(waStyle);

  const waCtxMenu = document.createElement('div');
  waCtxMenu.id = 'wa-ctx-menu';
  waCtxMenu.style.cssText = 'position:fixed;z-index:100000;display:none;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.18);padding:6px;min-width:175px;direction:rtl;';
  waCtxMenu.innerHTML = '<div style="font-size:10px;color:#94a3b8;padding:4px 8px;">حفظ النص المحدد كـ:</div>' +
    WA_FIELDS.map(f => `<div class="wa-ctx-item" data-key="${f.key}" style="padding:8px 10px;border-radius:6px;cursor:pointer;font-size:13px;color:#1e293b;">${f.label}</div>`).join('');
  document.body.appendChild(waCtxMenu);

  function waToast(msg) {
    let t = document.getElementById('wa-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'wa-toast';
      t.style.cssText = 'position:fixed;bottom:90px;right:24px;z-index:100001;background:#1e293b;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,0.25);transition:opacity .3s;';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.display = 'block'; t.style.opacity = '1';
    clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = '0'; }, 1800);
  }

  const waMsgArea = document.getElementById('wa-messages-area');
  if (waMsgArea) {
    waMsgArea.addEventListener('contextmenu', (e) => {
      const sel = (window.getSelection().toString() || '').trim();
      if (!sel) return; // لا تحديد → القائمة الافتراضية
      e.preventDefault();
      waCtxSelection = sel;
      waCtxMenu.style.left = Math.min(e.clientX, window.innerWidth - 190) + 'px';
      waCtxMenu.style.top  = Math.min(e.clientY, window.innerHeight - 230) + 'px';
      waCtxMenu.style.display = 'block';
    });
  }

  // خريطة الحقل → حقل الحاسبة (للتعبئة الفورية إن كانت الحاسبة مفتوحة)
  const WA_FIELD_INPUT = { name: 'c-name', idNumber: 'c-id', address: 'c-address', deposit: 'deposit', security: 'security-deposit' };

  waCtxMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.wa-ctx-item');
    if (!item) return;
    const key = item.dataset.key;
    waCtxMenu.style.display = 'none';
    if (!waState.activeJid || !waCtxSelection) return;
    if (!waState.drafts[waState.activeJid]) waState.drafts[waState.activeJid] = {};
    let val = waCtxSelection;
    if (key === 'deposit' || key === 'security') {
      val = (val.match(/[\d.]+/g) || []).join(''); // أرقام فقط للعربون/التأمين
    }
    waState.drafts[waState.activeJid][key] = val;
    const label = (WA_FIELDS.find(f => f.key === key) || {}).label || key;

    // لو الحاسبة مفتوحة الآن → عبّئ الحقل فوراً (بدون الحاجة للضغط على «إنشاء عقد»)
    const onCalculator = /calculator\.html/i.test(location.pathname);
    const inputEl = onCalculator ? document.getElementById(WA_FIELD_INPUT[key]) : null;
    if (inputEl) {
      inputEl.value = val;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.style.transition = 'box-shadow .3s';
      inputEl.style.boxShadow = '0 0 0 3px rgba(37,211,102,0.55)'; // وميض أخضر للتأكيد
      setTimeout(() => { inputEl.style.boxShadow = ''; }, 800);
      waToast('✓ أُضيف في العقد: ' + label);
    } else {
      waToast('✓ حُفظ كـ ' + label);
    }
  });

  document.addEventListener('click', (e) => { if (!waCtxMenu.contains(e.target)) waCtxMenu.style.display = 'none'; });
  document.addEventListener('scroll', () => { waCtxMenu.style.display = 'none'; }, true);

  // Expose toggle globally
  window.waToggleWidget = function() {
    const win = document.getElementById('wa-widget-window');
    win.classList.toggle('wa-open');
    if(win.classList.contains('wa-open')) {
      waRenderChats();
    }
  };

  window.waCloseChat = function() {
    document.getElementById('wa-col-chats').classList.add('show-mobile');
    document.getElementById('wa-col-messages').classList.add('hide-mobile');
  };

  window.waSetFilter = function(f) {
    waState.filter = f;
    document.querySelectorAll('#wa-filters .wa-filter-btn').forEach(b => {
      const active = b.dataset.f === f;
      b.style.border = '1px solid ' + (active ? '#25D366' : '#e2e8f0');
      b.style.background = active ? '#25D366' : '#fff';
      b.style.color = active ? '#fff' : '#64748b';
    });
    waRenderChats();
  };

  // إنشاء عقد لعميل جديد: يفتح الحاسبة ويعبّي رقم جواله تلقائياً
  window.waCreateContract = function() {
    const ph = waState.context && waState.context.phone;
    let local = '';
    if (ph) {
      let d = String(ph).replace(/[^\d]/g, '');
      if (d.startsWith('966')) d = '0' + d.slice(3);
      else if (d.length === 9 && d.startsWith('5')) d = '0' + d;
      if (/^05\d{8}$/.test(d)) local = d; // رقم جوال سعودي معقول فقط
    }
    const draft = (waState.drafts && waState.drafts[waState.activeJid]) || {};
    const payload = { phone: local, ...draft };
    try { localStorage.setItem('wa_contract_draft', JSON.stringify(payload)); } catch (e) {}
    window.location.href = 'calculator.html';
  };

  // 3. Load Socket.IO والاتصال بالجسر (محلياً أو عبر نفق الإنتاج wa.saddahevent.com)
  // ملاحظة: SERVER يتحدّد تلقائياً — localhost:3001 محلياً، أو wss://wa.saddahevent.com على الإنتاج
  {
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.8.1/socket.io.min.js';
    script.onload = initSocket;
    document.head.appendChild(script);
  }

  function initSocket() {
    socket = io(SERVER, { 
      transports: ['websocket', 'polling'],
      extraHeaders: {
        "Bypass-Tunnel-Reminder": "true"
      }
    });

    socket.on('connect', () => {
      document.getElementById('wa-status-text').textContent = 'متصل! جلب حالة واتساب...';
    });

    socket.on('disconnect', () => {
      document.getElementById('wa-status-text').textContent = 'فقد الاتصال بالخادم. جاري إعادة المحاولة...';
      document.getElementById('wa-overlay').style.display = 'flex';
      document.getElementById('wa-qr-container').style.display = 'none';
    });

    socket.on('wa:status', (s) => {
      waState.status = s.state;
      if (s.state === 'open') {
        document.getElementById('wa-overlay').style.display = 'none';
        document.getElementById('wa-qr-container').style.display = 'none';
        waState.qr = null;
      } else {
        document.getElementById('wa-overlay').style.display = 'flex';
        if (s.state === 'qr' && waState.qr) {
          document.getElementById('wa-status-text').textContent = 'يرجى مسح الرمز بجوالك لربط واتساب';
        } else {
          document.getElementById('wa-status-text').textContent = s.state === 'connecting' ? 'واتساب يتصل...' : 'في انتظار المسح...';
        }
      }
    });

    socket.on('wa:qr', ({ dataUrl }) => {
      waState.qr = dataUrl;
      document.getElementById('wa-qr-container').style.display = 'block';
      document.getElementById('wa-qr-img').src = dataUrl;
      document.getElementById('wa-status-text').textContent = 'يرجى مسح الرمز بجوالك لربط واتساب';
    });

    socket.on('chat:list', (list) => {
      waState.chats = list || [];
      waRenderChats();
    });

    socket.on('message:new', (m) => {
      // Upsert into messages
      if (!waState.messages[m.chatJid]) waState.messages[m.chatJid] = [];
      const list = waState.messages[m.chatJid];
      
      let updated = false;
      
      // Case 1: This is a status update for an optimistic echo (localId match)
      if (m.localId) {
        const i = list.findIndex(x => x.id === m.localId || x.localId === m.localId);
        if (i >= 0) {
          list[i] = { ...list[i], ...m, localId: m.localId };
          updated = true;
        }
      }
      
      // Case 2: Real message arriving — check it doesn't duplicate an existing localId entry
      if (!updated && m.id) {
        // Check if we already have this exact id
        const byId = list.findIndex(x => x.id === m.id);
        if (byId >= 0) {
          list[byId] = { ...list[byId], ...m };
          updated = true;
        }
        
        // Check if there's a pending localId entry with the same body/chat (optimistic echo)
        if (!updated && m.fromMe) {
          const pendingIdx = list.findIndex(x => 
            x.localId && x.status === 'pending' && x.body === m.body && x.chatJid === m.chatJid
          );
          if (pendingIdx >= 0) {
            list[pendingIdx] = { ...list[pendingIdx], ...m, localId: list[pendingIdx].localId };
            updated = true;
          }
        }
      }
      
      if (!updated) {
        list.push({ ...m, localId: m.localId || null });
      }

      // Upsert into chats list
      waState.chats = waState.chats.filter(c => c.jid !== m.chatJid);
      waState.chats.unshift({
        jid: m.chatJid,
        name: m.chatName || null,
        phone: String(m.chatJid).split('@')[0],
        last_body: m.body,
        last_from_me: m.fromMe ? 1 : 0,
        last_message_at: m.timestamp
      });

      waRenderChats();
      if (waState.activeJid === m.chatJid) waRenderMessages();
      
      // Notification badge
      const win = document.getElementById('wa-widget-window');
      if (!win.classList.contains('wa-open') && !m.fromMe) {
        const b = document.getElementById('wa-badge');
        b.style.display = 'block';
        b.textContent = parseInt(b.textContent || '0') + 1;
      }
    });

    socket.on('message:status', ({ id, localId, status }) => {
      for (const jid in waState.messages) {
        const list = waState.messages[jid];
        // Find by id, or by localId field stored on the message
        const msg = list.find(x => 
          (id && x.id === id) || 
          (localId && (x.id === localId || x.localId === localId))
        );
        if (msg) {
          msg.status = status;
          if (id) msg.id = id; // upgrade from localId to real waId
        }
      }
      waRenderMessages();
    });
  }

  // Renders
  // تنسيق رقم الجوال دولياً: 966570940009 → +966570940009
  // أرقام الجوال الحقيقية (10–13 خانة) تُعرض بصيغة +، ومعرّفات @lid الطويلة تُعرض كما هي
  function fmtPhone(p) {
    if (!p) return '';
    const d = String(p).replace(/[^\d]/g, '');
    if (!d) return '';
    return (d.length >= 10 && d.length <= 13) ? '+' + d : d;
  }

  function waRenderChats() {
    const listEl = document.getElementById('wa-chat-list');
    const q = document.getElementById('wa-search').value.trim().toLowerCase();

    let filtered = waState.chats.slice();
    // فلتر الأزرار: طلبات عملاء (عنده عقد) / طلب قادم
    if (waState.filter === 'orders') filtered = filtered.filter(c => c.hasOrder);
    else if (waState.filter === 'upcoming') filtered = filtered.filter(c => c.hasUpcoming);
    // بحث نصي
    if (q) {
      filtered = filtered.filter(c => {
        const name = c.name || c.phone || '';
        return name.toLowerCase().includes(q) || (c.phone||'').includes(q);
      });
    }
    // الترتيب: في الوضع الافتراضي تُرفع الطلبات القادمة فقط لأعلى (أصحاب العقود لا يُرفعون)
    if (waState.filter !== 'upcoming') {
      filtered.sort((a, b) => (b.hasUpcoming ? 1 : 0) - (a.hasUpcoming ? 1 : 0));
    }

    listEl.innerHTML = '';
    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:13px;padding:30px 10px;">لا توجد محادثات في هذا الفلتر</div>';
      return;
    }
    filtered.forEach(c => {
      const el = document.createElement('div');
      const isActive = c.jid === waState.activeJid;
      el.className = 'wa-chat-item' + (isActive ? ' active' : '');
      if (c.hasUpcoming) el.style.background = '#fff7ed'; // تمييز المثبّت
      el.onclick = () => waOpenChat(c.jid, c);

      // العنوان = رقم الجوال (وليس الاسم). إن لم يُحلّ الرقم بعد يظهر المعرّف كما هو.
      const phoneDisp = fmtPhone(c.phone) || 'غير معروف';
      const initial = '<i class="fa-solid fa-user" style="font-size:14px;"></i>';
      const time = c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'}) : '';
      let flagBadge = '';
      if (c.hasUpcoming) flagBadge = '<span style="font-size:8px;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;padding:1px 5px;border-radius:6px;font-weight:800;white-space:nowrap;">📌 طلب قادم</span>';
      else if (c.hasOrder) flagBadge = '<span style="font-size:8px;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:1px 5px;border-radius:6px;font-weight:800;white-space:nowrap;">عنده عقد</span>';

      el.innerHTML = `
        <div class="wa-avatar">${initial}</div>
        <div class="wa-chat-info">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <div class="wa-chat-name" style="display:flex;align-items:center;gap:6px;min-width:0;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;">${phoneDisp}</span> ${flagBadge}</div>
            <div class="wa-chat-time" style="flex-shrink:0;">${time}</div>
          </div>
          <div class="wa-chat-preview" dir="auto">${c.last_from_me ? 'أنت: ' : ''}${c.last_body || '—'}</div>
        </div>
      `;
      listEl.appendChild(el);
    });
  }

  window.waOpenChat = function(jid, c) {
    waState.activeJid = jid;
    const phoneDisp = fmtPhone(c.phone) || 'غير معروف';

    document.getElementById('wa-badge').style.display = 'none';
    document.getElementById('wa-badge').textContent = '0';

    // Update Header — العنوان رقم الجوال فقط (بدون اسم)
    const nameEl = document.getElementById('wa-active-name');
    nameEl.textContent = phoneDisp;
    nameEl.style.direction = 'ltr';
    document.getElementById('wa-active-phone').textContent = '';
    const avatar = document.getElementById('wa-active-avatar');
    avatar.style.display = 'flex';
    avatar.innerHTML = '<i class="fa-solid fa-user"></i>';

    // Show input
    document.getElementById('wa-input-area').style.display = 'flex';
    
    // Mobile toggle
    document.getElementById('wa-col-chats').classList.remove('show-mobile');
    document.getElementById('wa-col-messages').classList.remove('hide-mobile');

    // Fetch messages & context
    if (socket) {
      socket.emit('messages:get', { chatJid: jid }, (res) => {
        if (res) {
          waState.messages[jid] = res.messages || [];
          waState.context = res.context || null;
          waRenderMessages();
          waRenderContext();
        }
      });
    }
    waRenderChats(); // update active class
  };

  function waRenderMessages() {
    const area = document.getElementById('wa-messages-area');
    if (!waState.activeJid) return;
    const msgs = waState.messages[waState.activeJid] || [];
    
    if (msgs.length === 0) {
      area.innerHTML = '<div style="margin:auto;color:#94a3b8;text-align:center;">لا توجد رسائل بعد.</div>';
      return;
    }

    area.innerHTML = '';
    msgs.forEach(m => {
      const mine = !!m.fromMe;
      const time = new Date(m.timestamp).toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'});
      
      let statusIcon = '';
      if (mine) {
        if (m.status === 'pending') statusIcon = '<i class="fa-regular fa-clock"></i>';
        else if (m.status === 'failed') statusIcon = '<i class="fa-solid fa-circle-exclamation" style="color:#fecaca;"></i>';
        else if (m.status === 'read' || m.status === 'played') statusIcon = '<i class="fa-solid fa-check-double" style="color:#60a5fa;"></i>';
        else if (m.status === 'delivered') statusIcon = '<i class="fa-solid fa-check-double"></i>';
        else statusIcon = '<i class="fa-solid fa-check"></i>'; // sent
      }

      // وسائط (صور/فيديو/صوت/ملفات) — تُعرض من الخادم عند توفّر mediaPath
      let mediaHtml = '';
      let textBody = m.body || '';
      if (m.mediaPath) {
        const url = SERVER + '/media/' + encodeURIComponent(m.mediaPath);
        if (['[صورة]','[فيديو]','[رسالة صوتية]','[ملف]','[ملصق]'].includes(textBody)) textBody = '';
        if (m.type === 'image' || m.type === 'sticker') {
          mediaHtml = `<img src="${url}" loading="lazy" style="max-width:200px;max-height:240px;border-radius:8px;display:block;margin-bottom:4px;cursor:pointer;" onclick="window.open('${url}','_blank')">`;
        } else if (m.type === 'video') {
          mediaHtml = `<video src="${url}" controls style="max-width:220px;border-radius:8px;display:block;margin-bottom:4px;"></video>`;
        } else if (m.type === 'audio') {
          mediaHtml = `<audio src="${url}" controls style="width:220px;display:block;margin-bottom:4px;"></audio>`;
        } else {
          mediaHtml = `<a href="${url}" target="_blank" style="display:flex;align-items:center;gap:6px;color:inherit;margin-bottom:4px;"><i class="fa-solid fa-file-arrow-down"></i>${m.body || 'ملف'}</a>`;
          textBody = '';
        }
      }

      const el = document.createElement('div');
      el.className = 'wa-bubble ' + (mine ? 'me' : 'them');
      el.innerHTML = `
        ${mediaHtml}
        ${textBody ? `<div style="white-space:pre-wrap; direction:auto;">${textBody}</div>` : ''}
        <div class="wa-bubble-time">${time} ${statusIcon}</div>
      `;
      area.appendChild(el);
    });
    
    // scroll to bottom
    area.scrollTop = area.scrollHeight;
  }

  function waRenderContext() {
    const ctxBox = document.getElementById('wa-context-content');
    const ctx = waState.context;
    
    if (!ctx) {
      ctxBox.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:13px;padding:20px 0;"><i class="fa-solid fa-spinner fa-spin" style="font-size:20px;margin-bottom:8px;display:block;"></i>جار التحميل...</div>';
      return;
    }

    if (ctx.linked) {
      // --- Client Profile Header ---
      let html = `
        <div style="text-align:center;padding-bottom:15px;border-bottom:1px solid rgba(0,0,0,0.05);margin-bottom:15px;">
          <div style="width:55px;height:55px;border-radius:50%;background:linear-gradient(135deg,#25D366,#128C7E);color:white;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:bold;margin:0 auto 10px;box-shadow:0 4px 12px rgba(37,211,102,0.3);">
            <i class="fa-solid fa-user"></i>
          </div>
          <div style="font-weight:800;font-size:16px;color:#1e293b;margin-bottom:4px;">${ctx.name || 'عميل'}</div>
          ${ctx.address ? '<div style="font-size:12px;color:#94a3b8;margin-bottom:6px;"><i class="fa-solid fa-location-dot" style="margin-left:4px;"></i>' + ctx.address + '</div>' : ''}
          <span style="font-size:10px;background:linear-gradient(135deg,#dcfce7,#bbf7d0);padding:3px 10px;border-radius:12px;color:#166534;font-weight:700;">
            <i class="fa-solid fa-link" style="margin-left:3px;"></i>مربوط بالنظام
          </span>
        </div>
      `;

      // --- Aggregate Stats ---
      html += `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:15px;">
          <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:12px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:800;color:#1e40af;">${ctx.totalOrders}</div>
            <div style="font-size:10px;color:#3b82f6;font-weight:600;">إجمالي الطلبات</div>
          </div>
          <div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border-radius:12px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:800;color:#92400e;">${ctx.activeOrders}</div>
            <div style="font-size:10px;color:#d97706;font-weight:600;">طلبات نشطة</div>
          </div>
          <div style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:12px;padding:10px;text-align:center;">
            <div style="font-size:15px;font-weight:800;color:#065f46;">${ctx.totalRevenue.toLocaleString('ar-SA')}</div>
            <div style="font-size:10px;color:#10b981;font-weight:600;">إجمالي الإيرادات</div>
          </div>
          <div style="background:linear-gradient(135deg,${ctx.totalRemaining > 0 ? '#fef2f2,#fecaca' : '#ecfdf5,#d1fae5'});border-radius:12px;padding:10px;text-align:center;">
            <div style="font-size:15px;font-weight:800;color:${ctx.totalRemaining > 0 ? '#991b1b' : '#065f46'};">${ctx.totalRemaining.toLocaleString('ar-SA')}</div>
            <div style="font-size:10px;color:${ctx.totalRemaining > 0 ? '#ef4444' : '#10b981'};font-weight:600;">${ctx.totalRemaining > 0 ? 'متبقي' : 'لا مستحقات'}</div>
          </div>
        </div>
      `;

      // --- Order Cards ---
      if (ctx.orders && ctx.orders.length > 0) {
        html += '<div style="font-weight:700;font-size:13px;color:#1e293b;margin-bottom:8px;"><i class="fa-solid fa-list-ol" style="margin-left:5px;color:#25D366;"></i>سجل الطلبات</div>';
        html += '<div style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">';
        
        ctx.orders.forEach((o, idx) => {
          const itemsList = (o.items || []).map(i => i.name + (i.qty > 1 ? ' ×' + i.qty : '')).join('، ') || '—';
          
          html += `
            <div style="background:white;border-radius:12px;padding:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04);border:1px solid rgba(0,0,0,0.04);">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="font-size:10px;background:${o.statusColor}15;color:${o.statusColor};padding:2px 8px;border-radius:8px;font-weight:700;">
                  <i class="fa-solid fa-${o.statusIcon}" style="margin-left:3px;"></i>${o.status}
                </span>
                ${o.date ? '<span style="font-size:10px;color:#94a3b8;">' + o.date + '</span>' : ''}
              </div>
              <div style="font-size:12px;color:#475569;margin-bottom:6px;line-height:1.5;">
                <i class="fa-solid fa-box" style="color:#cbd5e1;margin-left:4px;width:14px;"></i>${itemsList}
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
                ${o.deliveryDate ? '<span style="font-size:10px;background:#f1f5f9;padding:2px 6px;border-radius:6px;color:#64748b;"><i class="fa-solid fa-truck" style="margin-left:3px;"></i>' + o.deliveryDate + '</span>' : ''}
                ${o.pickupDate ? '<span style="font-size:10px;background:#f1f5f9;padding:2px 6px;border-radius:6px;color:#64748b;"><i class="fa-solid fa-rotate-left" style="margin-left:3px;"></i>' + o.pickupDate + '</span>' : ''}
              </div>
              <div style="display:flex;justify-content:space-between;padding-top:6px;border-top:1px dashed rgba(0,0,0,0.06);font-size:11px;">
                <div>
                  <span style="color:#94a3b8;">الإجمالي:</span>
                  <span style="font-weight:700;color:#1e293b;">${o.total.toLocaleString('ar-SA')} ر.س</span>
                </div>
                <div>
                  ${o.remaining > 0
                    ? '<span style="color:#ef4444;font-weight:700;">متبقي: ' + o.remaining.toLocaleString('ar-SA') + '</span>'
                    : '<span style="color:#10b981;font-weight:700;"><i class="fa-solid fa-circle-check" style="margin-left:2px;"></i>مسدد</span>'
                  }
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">
                ${o.paymentComplete ? '<span style="font-size:9px;background:#dcfce7;color:#166534;padding:1px 6px;border-radius:4px;">✓ اكتمل الدفع</span>' : ''}
                ${o.securityReturned ? '<span style="font-size:9px;background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:4px;">✓ تأمين مسترد</span>' : ''}
              </div>
            </div>
          `;
        });
        
        html += '</div>';
      }

      ctxBox.innerHTML = html;
    } else {
      ctxBox.innerHTML = `
        <div style="text-align:center;padding:25px 0;">
          <div style="width:60px;height:60px;border-radius:50%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;margin:0 auto 15px;">
            <i class="fa-solid fa-user-plus" style="font-size:24px;color:#94a3b8;"></i>
          </div>
          <div style="font-weight:700;color:#64748b;margin-bottom:5px;font-size:14px;">عميل جديد</div>
          <div style="font-size:12px;color:#94a3b8;line-height:1.6;margin-bottom:16px;">هذا الرقم غير مربوط بأي طلب<br>في نظام صده بعد.</div>
          <button onclick="waCreateContract()" style="background:#25D366;color:#fff;border:none;padding:10px 18px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(37,211,102,0.3);">
            <i class="fa-solid fa-file-circle-plus"></i> إنشاء عقد لهذا العميل
          </button>
        </div>
      `;
    }
  }

  window.waSendMessage = function() {
    const input = document.getElementById('wa-msg-input');
    const text = input.value.trim();
    if (!text || !waState.activeJid || !socket) return;

    const localId = 'local_' + Date.now();
    socket.emit('message:send', { chatJid: waState.activeJid, body: text, localId });
    input.value = '';
  };

  // ─── إرسال أسعار الطاولات للعميل (رقمه = المحادثة المفتوحة، إرسال تلقائي عبر الجسر) ───
  const _WA_PRICE_LABELS = { comprehensive: 'رسالة شاملة', basic: 'الأسعار الأساسية', premade: 'التنسيق الجاهز', custom: 'التنسيق الخاص (VIP)' };

  window.waOpenPrices = function() {
    if (!waState.activeJid) { alert('افتح محادثة العميل أولاً'); return; }
    if (!window.TABLES_PRICING) { alert('بيانات الأسعار غير متوفرة على هذه الصفحة'); return; }
    document.getElementById('wa-prices-step1').style.display = 'flex';
    document.getElementById('wa-prices-step2').style.display = 'none';
    const ph = (waState.context && waState.context.phone) || (waState.activeJid || '').split('@')[0] || '';
    const nm = (waState.context && waState.context.name) || (document.getElementById('wa-active-name') || {}).textContent || '';
    const toEl = document.getElementById('wa-prices-to');
    if (toEl) toEl.innerHTML = `<i class="fa-solid fa-paper-plane" style="color:#9333ea;margin-left:5px;"></i> إلى: <b>${nm ? nm + ' · ' : ''}${ph}</b>`;
    document.getElementById('wa-prices-panel').style.display = 'flex';
  };
  window.waClosePrices = function() {
    const p = document.getElementById('wa-prices-panel'); if (p) p.style.display = 'none';
  };
  window.waPricesBack = function() {
    document.getElementById('wa-prices-step2').style.display = 'none';
    document.getElementById('wa-prices-step1').style.display = 'flex';
  };
  window.waPricesPickCat = function(cat) {
    const P = window.TABLES_PRICING; if (!P) return;
    let html = '';
    for (let n = 1; n <= P.maxTables; n++) {
      html += `<button onclick="waPricesSend('${cat}',${n})" class="wa-price-size"><b>${P.capacity[n]} شخص</b><span>${n} طاولة</span></button>`;
    }
    document.getElementById('wa-prices-grid').innerHTML = html;
    const lbl = document.getElementById('wa-prices-cat-label'); if (lbl) lbl.textContent = _WA_PRICE_LABELS[cat] || '';
    document.getElementById('wa-prices-step1').style.display = 'none';
    document.getElementById('wa-prices-step2').style.display = 'block';
  };
  window.waPricesSend = function(cat, n) {
    if (!waState.activeJid || !socket) { alert('لا توجد محادثة نشطة'); return; }
    if (!window.buildTablesPriceMessage) { alert('تعذّر تكوين الرسالة'); return; }
    const msg = window.buildTablesPriceMessage(cat, n);
    const localId = 'local_' + Date.now();
    socket.emit('message:send', { chatJid: waState.activeJid, body: msg, localId });
    waClosePrices();
  };

})();
