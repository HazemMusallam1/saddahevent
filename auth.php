<?php
// منع طباعة أي تحذير/خطأ داخل رد JSON (يمنع كسر الرد وتشغيل تجاوز الدخول)
ini_set('display_errors', '0');
// ============================================================================
//  نظام صده — المصادقة والصلاحيات (خادم PHP)
//  تسجيل دخول/خروج • معرفة المستخدم الحالي • إدارة الحسابات (للمدير فقط)
//  أمان: bcrypt • جلسة آمنة (httpOnly/SameSite) • CSRF • تحديد محاولات الدخول
// ============================================================================

// ── جلسة آمنة ───────────────────────────────────────────────────────────────
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
      || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_set_cookie_params([
    'lifetime' => 31536000, // سنة كاملة
    'path' => '/',
    'httponly' => true,
    'secure' => $https,
    'samesite' => 'Strict',
]);
session_name('SADDAH_SID');
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$USERS_FILE = __DIR__ . '/auth_users.json';
$RATE_FILE  = __DIR__ . '/auth_rate.json';

// كل صفحات النظام (تُستخدم في لوحة الصلاحيات)
$ALL_PAGES = [
    'order_tracking.html', 'calculator.html', 'orders.html', 'customers.html',
    'archive.html', 'inventory.html', 'claims.html', 'cash_remittance.html',
    'portfolio.html', 'dues_transfers.html', 'client_securities.html',
    'report_full.html', 'report_monthly.html', 'report_single.html',
    'audit.html', 'users.html',
];

// ── أدوات ───────────────────────────────────────────────────────────────────
function out($arr, $code = 200) { http_response_code($code); echo json_encode($arr, JSON_UNESCAPED_UNICODE); exit; }
function body() { $d = json_decode(file_get_contents('php://input'), true); return is_array($d) ? $d : []; }

function loadUsers($file) {
    if (!is_file($file)) return null;
    $d = json_decode(file_get_contents($file), true);
    return is_array($d) ? $d : null;
}
function saveUsers($file, $data) {
    $tmp = $file . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    rename($tmp, $file);
}

// إنشاء مدير افتراضي عند أول تشغيل (يجب تغيير كلمة السر فوراً)
function ensureSeed($file, $ALL_PAGES) {
    $data = loadUsers($file);
    if ($data && !empty($data['users'])) return $data;
    $data = ['users' => [[
        'username' => 'admin',
        'name'     => 'المدير',
        'hash'     => password_hash('admin123', PASSWORD_DEFAULT),
        'role'     => 'admin',
        'perms'    => ['*'],
    ]]];
    saveUsers($file, $data);
    return $data;
}

function findUser($data, $username) {
    foreach ($data['users'] as $u) if (strcasecmp($u['username'], $username) === 0) return $u;
    return null;
}
function publicUser($u) {
    return ['username' => $u['username'], 'name' => $u['name'] ?? $u['username'],
            'role' => $u['role'] ?? 'user', 'perms' => $u['perms'] ?? []];
}
function isAdmin() { return ($_SESSION['user']['role'] ?? '') === 'admin'; }
function requireAuth() { if (empty($_SESSION['user'])) out(['authed' => false, 'error' => 'unauthorized'], 401); }
function requireAdmin() { requireAuth(); if (!isAdmin()) out(['error' => 'forbidden'], 403); }

// التحقق من CSRF للعمليات الحسّاسة بعد تسجيل الدخول
// يقبل التوكن من: body._csrf أو Header X-CSRF-Token (LiteSpeed قد يحذف الترويسات)
function requireCsrf() {
    $b = body();
    $sent = $b['_csrf'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (!$sent || !hash_equals($_SESSION['csrf'] ?? '', $sent)) out(['error' => 'csrf'], 403);
}

// تحديد محاولات الدخول (حماية من التخمين)
function rateBlocked($file) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'x';
    $now = time();
    $d = is_file($file) ? (json_decode(file_get_contents($file), true) ?: []) : [];
    $rec = $d[$ip] ?? ['c' => 0, 't' => $now];
    if ($now - $rec['t'] > 900) { $rec = ['c' => 0, 't' => $now]; } // نافذة 15 دقيقة
    return ($rec['c'] >= 8); // 8 محاولات فاشلة كحد أقصى
}
function rateBump($file, $ok) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'x';
    $now = time();
    $d = is_file($file) ? (json_decode(file_get_contents($file), true) ?: []) : [];
    if ($ok) { unset($d[$ip]); }
    else {
        $rec = $d[$ip] ?? ['c' => 0, 't' => $now];
        if ($now - $rec['t'] > 900) $rec = ['c' => 0, 't' => $now];
        $rec['c']++; $rec['t'] = $now; $d[$ip] = $rec;
    }
    @file_put_contents($file, json_encode($d), LOCK_EX);
}

// ── التوجيه ─────────────────────────────────────────────────────────────────
$action = $_GET['action'] ?? (body()['action'] ?? '');
$data = ensureSeed($USERS_FILE, $ALL_PAGES);

if ($action === 'me') {
    if (empty($_SESSION['user'])) out(['authed' => false]);
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    out(['authed' => true] + publicUser($_SESSION['user']) + ['csrf' => $_SESSION['csrf'], 'allPages' => $ALL_PAGES]);
}

if ($action === 'login') {
    if (rateBlocked($RATE_FILE)) out(['error' => 'محاولات كثيرة، حاول بعد قليل.'], 429);
    $b = body();
    $u = findUser($data, trim($b['username'] ?? ''));
    if (!$u || !password_verify($b['password'] ?? '', $u['hash'])) {
        rateBump($RATE_FILE, false);
        out(['error' => 'اسم المستخدم أو كلمة السر غير صحيحة.'], 401); // رسالة عامة (منع التخمين)
    }
    rateBump($RATE_FILE, true);
    session_regenerate_id(true); // منع تثبيت الجلسة
    $_SESSION['user'] = $u;
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
    out(['authed' => true] + publicUser($u) + ['csrf' => $_SESSION['csrf']]);
}

if ($action === 'webauthn_challenge') {
    $challenge = random_bytes(32);
    $_SESSION['webauthn_challenge'] = bin2hex($challenge);
    out(['challenge' => base64_encode($challenge)]);
}

if ($action === 'webauthn_register') {
    requireAuth();
    $b = body();
    $uname = $_SESSION['user']['username'] ?? '';
    $idx = null;
    foreach ($data['users'] as $i => $u) if (strcasecmp($u['username'], $uname) === 0) $idx = $i;
    if ($idx === null) out(['error' => 'no user'], 404);
    
    if (empty($b['pubKey']) || empty($b['credId'])) out(['error' => 'invalid data'], 400);
    $data['users'][$idx]['webauthn_cred_id'] = $b['credId'];
    $data['users'][$idx]['webauthn_pub_key'] = $b['pubKey'];
    saveUsers($USERS_FILE, $data);
    out(['ok' => true]);
}

if ($action === 'webauthn_verify') {
    if (rateBlocked($RATE_FILE)) out(['error' => 'محاولات كثيرة، حاول بعد قليل.'], 429);
    $b = body();
    $username = trim($b['username'] ?? '');
    $credId = $b['credId'] ?? '';
    $authData = $b['authData'] ?? '';
    $clientDataJSON = $b['clientData'] ?? '';
    $signature = $b['signature'] ?? '';
    
    if (!$username || !$credId || !$authData || !$clientDataJSON || !$signature) out(['error' => 'بيانات مفقودة.'], 400);
    
    $u = findUser($data, $username);
    if (!$u || empty($u['webauthn_pub_key']) || $u['webauthn_cred_id'] !== $credId) {
        rateBump($RATE_FILE, false);
        out(['error' => 'لا يوجد بصمة مسجلة لهذا الحساب.'], 401);
    }
    
    $clientDataObj = json_decode(base64_decode($clientDataJSON), true);
    if (!$clientDataObj) {
        rateBump($RATE_FILE, false);
        out(['error' => 'بيانات غير صالحة.'], 400);
    }
    $reqChallenge = base64_decode(strtr($clientDataObj['challenge'] ?? '', '-_', '+/'));
    if ($reqChallenge !== hex2bin($_SESSION['webauthn_challenge'] ?? '')) {
        rateBump($RATE_FILE, false);
        out(['error' => 'انتهت صلاحية الجلسة، قم بتحديث الصفحة.'], 401);
    }
    
    $pubKeyDER = base64_decode($u['webauthn_pub_key']);
    $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($pubKeyDER), 64, "\n") . "-----END PUBLIC KEY-----\n";
    
    $clientDataHash = hash('sha256', base64_decode($clientDataJSON), true);
    $signedData = base64_decode($authData) . $clientDataHash;
    
    $result = openssl_verify($signedData, base64_decode($signature), $pem, OPENSSL_ALGO_SHA256);
    
    if ($result === 1) {
        rateBump($RATE_FILE, true);
        session_regenerate_id(true);
        $_SESSION['user'] = $u;
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
        out(['authed' => true] + publicUser($u) + ['csrf' => $_SESSION['csrf']]);
    } else {
        rateBump($RATE_FILE, false);
        out(['error' => 'فشل التحقق من البصمة (توقيع غير صالح).'], 401);
    }
}

if ($action === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    out(['ok' => true]);
}

// ── إدارة الحسابات (للمدير فقط) ──────────────────────────────────────────────
if ($action === 'users') {
    requireAdmin();
    out(['users' => array_map('publicUser', $data['users']), 'allPages' => $ALL_PAGES]);
}

if ($action === 'saveUser') {
    requireAdmin(); requireCsrf();
    $b = body();
    $username = trim($b['username'] ?? '');
    if ($username === '') out(['error' => 'اسم المستخدم مطلوب'], 400);
    $role = in_array($b['role'] ?? '', ['admin', 'financial', 'supervisor', 'user'], true) ? $b['role'] : 'user';
    $perms = $role === 'admin' ? ['*'] : array_values(array_intersect((array)($b['perms'] ?? []), $GLOBALS['ALL_PAGES']));

    $idx = null;
    foreach ($data['users'] as $i => $u) if (strcasecmp($u['username'], $username) === 0) $idx = $i;

    if ($idx === null) {
        if (empty($b['password'])) out(['error' => 'كلمة السر مطلوبة للحساب الجديد'], 400);
        $data['users'][] = ['username' => $username, 'name' => trim($b['name'] ?? $username),
            'hash' => password_hash($b['password'], PASSWORD_DEFAULT), 'role' => $role, 'perms' => $perms];
    } else {
        $data['users'][$idx]['name'] = trim($b['name'] ?? $data['users'][$idx]['name']);
        $data['users'][$idx]['role'] = $role;
        $data['users'][$idx]['perms'] = $perms;
        if (!empty($b['password'])) $data['users'][$idx]['hash'] = password_hash($b['password'], PASSWORD_DEFAULT);
    }
    saveUsers($USERS_FILE, $data);
    out(['ok' => true]);
}

if ($action === 'deleteUser') {
    requireAdmin(); requireCsrf();
    $username = trim(body()['username'] ?? '');
    if (strcasecmp($username, $_SESSION['user']['username']) === 0) out(['error' => 'لا يمكنك حذف حسابك الحالي'], 400);
    $remaining = array_values(array_filter($data['users'], fn($u) => strcasecmp($u['username'], $username) !== 0));
    if (!array_filter($remaining, fn($u) => ($u['role'] ?? '') === 'admin')) out(['error' => 'لا يمكن حذف آخر مدير'], 400);
    $data['users'] = $remaining;
    saveUsers($USERS_FILE, $data);
    out(['ok' => true]);
}

// رمز رفع شخصي لاختصار الآيفون (Apple Shortcut) — يُولَّد عند أول طلب، ويُعاد توليده عند reset
if ($action === 'shareToken') {
    requireAuth();
    $uname = $_SESSION['user']['username'] ?? '';
    $idx = null;
    foreach ($data['users'] as $i => $u) if (strcasecmp($u['username'], $uname) === 0) $idx = $i;
    if ($idx === null) out(['error' => 'no user'], 404);
    $reset = !empty(body()['reset']);
    if ($reset) requireCsrf();
    if ($reset || empty($data['users'][$idx]['shareToken'])) {
        $data['users'][$idx]['shareToken'] = bin2hex(random_bytes(16));
        saveUsers($USERS_FILE, $data);
    }
    out(['token' => $data['users'][$idx]['shareToken']]);
}

out(['error' => 'unknown action'], 400);
