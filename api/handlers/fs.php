<?php
// ============================================================================
//  نظام صده — واجهة الملفات السحابية (Cloud FS)
//  بديل واجهة FileSystemAccess المحلية، للتعامل مع مجلد saddah Archive
// ============================================================================
ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

// ── بوابة المصادقة (نفس إعداد auth.php) ──────────────────────────────────────
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
      || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'secure' => $https, 'samesite' => 'Strict']);
session_name('SADDAH_SID');
session_start();
if (empty($_SESSION['user'])) { http_response_code(401); echo json_encode(['error' => 'unauthorized']); exit; }

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST') {
    http_response_code(405); echo json_encode(['error' => 'Method Not Allowed']); exit;
}

// ── إعداد مجلد الأرشيف الأساسي ──────────────────────────────────────────────
$archiveRoot = realpath(__DIR__ . '/../../saddah Archive');
if (!$archiveRoot) {
    // محاولة إنشائه إذا لم يكن موجوداً
    @mkdir(__DIR__ . '/../../saddah Archive', 0777, true);
    $archiveRoot = realpath(__DIR__ . '/../../saddah Archive');
}
if (!$archiveRoot) {
    echo json_encode(['success' => false, 'error' => 'Archive root not found']); exit;
}

// ── تأمين المسار ─────────────────────────────────────────────────────────────
function sanitizePath($base, $reqPath) {
    if (empty($reqPath)) return false;
    $reqPath = str_replace(['../', '..\\', "\0"], '', $reqPath);
    // السماح بالمسارات العربية والمسافات
    $target = rtrim($base, '/\\') . DIRECTORY_SEPARATOR . ltrim(str_replace('/', DIRECTORY_SEPARATOR, $reqPath), '/\\');
    return $target;
}

// لنسخ المجلدات
function copyDir($src, $dst) {
    $dir = opendir($src);
    @mkdir($dst, 0777, true);
    while (false !== ($file = readdir($dir))) {
        if (($file != '.') && ($file != '..')) {
            if (is_dir($src . '/' . $file)) {
                copyDir($src . '/' . $file, $dst . '/' . $file);
            } else {
                copy($src . '/' . $file, $dst . '/' . $file);
            }
        }
    }
    closedir($dir);
}

// لحذف المجلدات
function deleteDir($dirPath) {
    if (!is_dir($dirPath)) return;
    $objects = scandir($dirPath);
    foreach ($objects as $object) {
        if ($object != "." && $object != "..") {
            if (is_dir($dirPath . DIRECTORY_SEPARATOR . $object) && !is_link($dirPath . "/" . $object))
                deleteDir($dirPath . DIRECTORY_SEPARATOR . $object);
            else
                unlink($dirPath . DIRECTORY_SEPARATOR . $object);
        }
    }
    rmdir($dirPath);
}

// جلب بارامترات POST أو JSON
$action = $_POST['action'] ?? '';
$path = $_POST['path'] ?? '';

if (!$action) {
    $json = json_decode(file_get_contents('php://input'), true);
    if ($json) {
        $action = $json['action'] ?? '';
        $path = $json['path'] ?? '';
        $_POST = array_merge($_POST, $json);
    }
}

$targetPath = sanitizePath($archiveRoot, $path);

try {
    switch ($action) {
        case 'check_exists':
            echo json_encode(['success' => true, 'exists' => file_exists($targetPath)]);
            break;

        case 'save_file':
            if (!$targetPath) throw new Exception("Invalid path");
            $dir = dirname($targetPath);
            if (!is_dir($dir)) @mkdir($dir, 0777, true);
            
            if (isset($_FILES['file'])) {
                if (move_uploaded_file($_FILES['file']['tmp_name'], $targetPath)) {
                    echo json_encode(['success' => true]);
                } else {
                    throw new Exception("Failed to move uploaded file");
                }
            } else {
                throw new Exception("No file uploaded");
            }
            break;

        case 'save_text':
            if (!$targetPath) throw new Exception("Invalid path");
            $dir = dirname($targetPath);
            if (!is_dir($dir)) @mkdir($dir, 0777, true);
            $content = $_POST['content'] ?? '';
            if (file_put_contents($targetPath, $content) !== false) {
                echo json_encode(['success' => true]);
            } else {
                throw new Exception("Failed to write text file");
            }
            break;

        case 'save_base64':
            if (!$targetPath) throw new Exception("Invalid path");
            $dir = dirname($targetPath);
            if (!is_dir($dir)) @mkdir($dir, 0777, true);
            $content = $_POST['content'] ?? '';
            $decoded = base64_decode($content);
            if ($decoded !== false && file_put_contents($targetPath, $decoded) !== false) {
                echo json_encode(['success' => true]);
            } else {
                throw new Exception("Failed to write base64 file");
            }
            break;

        case 'mkdir':
            if (!$targetPath) throw new Exception("Invalid path");
            if (!is_dir($targetPath)) {
                @mkdir($targetPath, 0777, true);
            }
            echo json_encode(['success' => true]);
            break;

        case 'delete_file':
            if (!$targetPath) throw new Exception("Invalid path");
            if (file_exists($targetPath)) {
                if (is_dir($targetPath)) deleteDir($targetPath);
                else unlink($targetPath);
            }
            echo json_encode(['success' => true]);
            break;

        case 'rename':
            $oldPath = sanitizePath($archiveRoot, $_POST['old_path'] ?? '');
            $newPath = sanitizePath($archiveRoot, $_POST['new_path'] ?? '');
            if (!$oldPath || !$newPath) throw new Exception("Invalid paths");
            
            if (file_exists($oldPath)) {
                $dir = dirname($newPath);
                if (!is_dir($dir)) @mkdir($dir, 0777, true);
                if (rename($oldPath, $newPath)) {
                    echo json_encode(['success' => true]);
                } else {
                    throw new Exception("Rename failed");
                }
            } else {
                echo json_encode(['success' => false, 'error' => 'Source not found']);
            }
            break;

        case 'copy_dir':
            $srcPath = sanitizePath($archiveRoot, $_POST['src_path'] ?? '');
            $dstPath = sanitizePath($archiveRoot, $_POST['dst_path'] ?? '');
            if (!$srcPath || !$dstPath) throw new Exception("Invalid paths");
            
            if (is_dir($srcPath)) {
                copyDir($srcPath, $dstPath);
                echo json_encode(['success' => true]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Source directory not found']);
            }
            break;

        case 'delete_dir':
            if (!$targetPath) throw new Exception("Invalid path");
            if (is_dir($targetPath)) {
                deleteDir($targetPath);
            }
            echo json_encode(['success' => true]);
            break;
            
        case 'list_dirs':
            // Used to find folders by exact order_id match inside json
            if (!$targetPath || !is_dir($targetPath)) {
                echo json_encode(['success' => true, 'dirs' => []]);
                break;
            }
            $dirs = [];
            foreach (scandir($targetPath) as $d) {
                if ($d != '.' && $d != '..' && is_dir($targetPath . DIRECTORY_SEPARATOR . $d)) {
                    $jsonPath = $targetPath . DIRECTORY_SEPARATOR . $d . DIRECTORY_SEPARATOR . 'بيانات_الطلب.json';
                    $orderId = null;
                    if (file_exists($jsonPath)) {
                        $jdata = json_decode(file_get_contents($jsonPath), true);
                        if ($jdata && isset($jdata['id'])) $orderId = $jdata['id'];
                    }
                    $dirs[] = ['name' => $d, 'orderId' => $orderId];
                }
            }
            echo json_encode(['success' => true, 'dirs' => $dirs]);
            break;

        default:
            throw new Exception("Unknown action: $action");
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
