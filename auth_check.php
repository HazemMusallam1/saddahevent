<?php
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);
// ============================================================================
//  نظام صده — حماية صفحات HTML من جهة الخادم
//  يُوجَّه كل طلب .html (ما عدا login.html) عبر هذا الملف.
//  لو المستخدم ما عنده جلسة → يُحوَّل لصفحة تسجيل الدخول.
// ============================================================================

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
      || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'httponly'  => true,
    'secure'   => $https,
    'samesite' => 'Strict',
]);
session_name('SADDAH_SID');
session_start();

$page = $_GET['page'] ?? '';

// Determine full file path
if ($page === 'index.html') {
    $filepath = __DIR__ . '/index.html';
} else {
    // Validate path looks like pages/domain/.../file.html
    if (!preg_match('#^pages/([a-zA-Z0-9_\-]+/)+[a-zA-Z0-9_\-]+\.html$#', $page)) {
        http_response_code(404);
        echo '404 — الصفحة غير موجودة أو المسار غير صحيح';
        exit;
    }
    $filepath = __DIR__ . '/' . $page;
}

if (!is_file($filepath)) {
    http_response_code(404);
    echo '404 — الملف غير موجود';
    exit;
}

$basename = basename($page);
$base_dir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');

// login.html متاحة للجميع (لا تحتاج جلسة)
if ($basename === 'login.html') {
    header('Content-Type: text/html; charset=utf-8');
    readfile($filepath);
    exit;
}

// أي صفحة أخرى تتطلب جلسة مسجّلة
if (empty($_SESSION['user'])) {
    header('Location: ' . $base_dir . '/pages/auth/login/login.html');
    exit;
}

// التحقق من الصلاحيات بناءً على اسم الملف
$perms = $_SESSION['user']['perms'] ?? [];
$allowed = in_array('*', $perms, true)
        || in_array($basename, $perms, true)
        || $basename === 'index.html';

if (!$allowed) {
    header('Location: ' . $base_dir . '/index.html');
    exit;
}

// مستخدم مسجّل ولديه صلاحية → عرض الصفحة
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
readfile($filepath);
