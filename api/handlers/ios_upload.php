<?php
// ============================================================================
//  نظام صده — استقبال صورة من اختصار الآيفون (Apple Shortcut)
//  لا يعتمد على جلسة المتصفح (الاختصار لا يملك كوكيز سفاري) — يوثَّق برمز شخصي.
// ============================================================================
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// الرمز يُرسل في ترويسة أو حقل
$token = trim($_SERVER['HTTP_X_SHARE_TOKEN'] ?? ($_POST['token'] ?? ''));
if ($token === '') { http_response_code(401); echo json_encode(['error' => 'no token']); exit; }

// التحقق من الرمز مقابل حسابات النظام
$usersFile = __DIR__ . '/../../auth_users.json';
$data = is_file($usersFile) ? json_decode(file_get_contents($usersFile), true) : null;
$valid = false;
if (is_array($data) && !empty($data['users'])) {
    foreach ($data['users'] as $u) {
        if (!empty($u['shareToken']) && hash_equals($u['shareToken'], $token)) { $valid = true; break; }
    }
}
if (!$valid) { http_response_code(401); echo json_encode(['error' => 'invalid token']); exit; }

// التحقق من الملف
if (empty($_FILES['file']) || ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    http_response_code(400); echo json_encode(['error' => 'no file']); exit;
}
$f = $_FILES['file'];
if ($f['size'] > 8 * 1024 * 1024) { http_response_code(413); echo json_encode(['error' => 'too large']); exit; }

$allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', 'application/pdf' => 'pdf'];
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($f['tmp_name']);
if (!isset($allowed[$mime])) { http_response_code(415); echo json_encode(['error' => 'type not allowed: ' . $mime]); exit; }
$ext = $allowed[$mime];

$dir = __DIR__ . '/../../uploads';
if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
$name = 'ios_' . date('Ymd_His') . '_' . bin2hex(random_bytes(5)) . '.' . $ext;

if (!@move_uploaded_file($f['tmp_name'], $dir . '/' . $name)) {
    http_response_code(500); echo json_encode(['error' => 'save failed']); exit;
}

// رابط جاهز يفتحه اختصار الآيفون مباشرة (يبسّط الاختصار: Get Value > Open URLs)
$rel = 'uploads/' . $name;
$scheme = ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')) ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? '';
$open = $scheme . '://' . $host . '/share_attach.html?fileUrl=' . rawurlencode($rel);

echo json_encode(['ok' => true, 'url' => $rel, 'open' => $open]);
