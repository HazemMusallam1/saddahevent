<?php
// ============================================================================
//  لوحة الفحص وتتبع الأخطاء المباشرة من PHP — Saddah ERP Live PHP Debugger
// ============================================================================
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

session_start();

$action = $_GET['action'] ?? null;

// إجراء مسح السجل
if ($action === 'clear_log') {
    $logFiles = [__DIR__ . '/error_log', __DIR__ . '/error_log.txt', ini_get('error_log')];
    foreach ($logFiles as $f) {
        if ($f && file_exists($f)) @file_put_contents($f, '');
    }
    header('Location: debug.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>وضع التصحيح المباشر - PHP Debugger | نظام صده</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background-color: #0f172a; color: #f8fafc; }
    </style>
</head>
<body class="p-4 md:p-8 min-h-screen">
    <div class="max-w-6xl mx-auto space-y-6">
        
        <!-- Header -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-2xl">
                    <i class="fa-solid fa-bug"></i>
                </div>
                <div>
                    <h1 class="text-xl font-bold text-white">لوحة تشخيص وتصحيح PHP المباشرة (Saddah PHP Debugger)</h1>
                    <p class="text-slate-400 text-xs mt-1">تتبع حالة الخادم، قاعدة البيانات، وسجلات الأخطاء الحية مباشرة من PHP</p>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <a href="debug.php" class="bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition border border-slate-700">
                    <i class="fa-solid fa-arrows-rotate"></i> تحديث الفحص
                </a>
                <a href="debug.php?action=clear_log" class="bg-red-600/20 hover:bg-red-600/30 text-red-400 font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition border border-red-500/30">
                    <i class="fa-solid fa-trash"></i> مسح سجل الأخطاء
                </a>
                <a href="api/core/setup_schema.php" target="_blank" class="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition border border-emerald-500/30">
                    <i class="fa-solid fa-database"></i> إصلاح الجداول (Setup Schema)
                </a>
            </div>
        </div>

        <!-- Grid Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <!-- Card 1: Server Config -->
            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
                <h2 class="text-sm font-bold text-indigo-400 flex items-center gap-2">
                    <i class="fa-solid fa-server"></i> إعدادات الخادم (Server Specs)
                </h2>
                <div class="space-y-2 text-xs font-mono">
                    <div class="flex justify-between border-b border-slate-800 pb-1.5">
                        <span class="text-slate-400">PHP Version:</span>
                        <span class="text-emerald-400 font-bold"><?= phpversion() ?></span>
                    </div>
                    <div class="flex justify-between border-b border-slate-800 pb-1.5">
                        <span class="text-slate-400">Display Errors:</span>
                        <span class="text-emerald-400 font-bold"><?= ini_get('display_errors') ? 'ON (مفعل)' : 'OFF' ?></span>
                    </div>
                    <div class="flex justify-between border-b border-slate-800 pb-1.5">
                        <span class="text-slate-400">Memory Limit:</span>
                        <span class="text-slate-200"><?= ini_get('memory_limit') ?></span>
                    </div>
                    <div class="flex justify-between border-b border-slate-800 pb-1.5">
                        <span class="text-slate-400">Max Execution Time:</span>
                        <span class="text-slate-200"><?= ini_get('max_execution_time') ?>s</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-400">Upload Max Size:</span>
                        <span class="text-slate-200"><?= ini_get('upload_max_filesize') ?></span>
                    </div>
                </div>
            </div>

            <!-- Card 2: Database Status -->
            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
                <h2 class="text-sm font-bold text-emerald-400 flex items-center gap-2">
                    <i class="fa-solid fa-database"></i> حالة قاعدة البيانات (Database)
                </h2>
                <?php
                $dbStatus = false;
                $tableList = [];
                $dbError = null;
                try {
                    require_once __DIR__ . '/api/core/Database.php';
                    $pdo = (new Database())->getConnection();
                    $dbStatus = true;
                    $stmt = $pdo->query("SHOW TABLES");
                    foreach ($stmt->fetchAll(PDO::FETCH_NUM) as $row) {
                        $tName = $row[0];
                        $c = $pdo->query("SELECT COUNT(*) FROM `$tName`")->fetchColumn();
                        $tableList[] = ['name' => $tName, 'count' => $c];
                    }
                } catch (Throwable $e) {
                    $dbError = $e->getMessage();
                }
                ?>
                <div class="space-y-2 text-xs">
                    <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span class="text-slate-400">حالة الاتصال:</span>
                        <?php if ($dbStatus): ?>
                            <span class="bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded">متصل (Connected)</span>
                        <?php else: ?>
                            <span class="bg-red-500/20 text-red-400 font-bold px-2 py-0.5 rounded">غير متصل</span>
                        <?php endif; ?>
                    </div>
                    <?php if ($dbError): ?>
                        <div class="text-red-400 bg-red-950/50 p-2 rounded border border-red-800 text-[11px] font-mono break-all">
                            <?= htmlspecialchars($dbError) ?>
                        </div>
                    <?php else: ?>
                        <div class="max-h-32 overflow-y-auto space-y-1 font-mono text-[11px]">
                            <?php foreach ($tableList as $tb): ?>
                                <div class="flex justify-between text-slate-300">
                                    <span><?= $tb['name'] ?></span>
                                    <span class="text-slate-500"><?= $tb['count'] ?> صف</span>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                </div>
            </div>

            <!-- Card 3: Session & User -->
            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
                <h2 class="text-sm font-bold text-amber-400 flex items-center gap-2">
                    <i class="fa-solid fa-user-shield"></i> الجلسة الحالية (Session & Auth)
                </h2>
                <div class="space-y-2 text-xs font-mono">
                    <div class="flex justify-between border-b border-slate-800 pb-1.5">
                        <span class="text-slate-400">معرف الجلسة:</span>
                        <span class="text-slate-300 font-bold text-[10px]"><?= substr(session_id(), 0, 15) ?>...</span>
                    </div>
                    <div class="flex justify-between border-b border-slate-800 pb-1.5">
                        <span class="text-slate-400">حالة المستخدم:</span>
                        <?php if (isset($_SESSION['user'])): ?>
                            <span class="text-emerald-400 font-bold">مسجل دخول (Logged In)</span>
                        <?php else: ?>
                            <span class="text-amber-400">زائر (Not Logged In)</span>
                        <?php endif; ?>
                    </div>
                    <?php if (isset($_SESSION['user'])): ?>
                        <div class="bg-slate-950 p-2 rounded text-[11px] text-slate-300 font-sans">
                            اسم المستخدم: <b class="text-indigo-400"><?= htmlspecialchars($_SESSION['user']['username'] ?? 'N/A') ?></b>
                        </div>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <!-- Live Log Console -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div class="flex items-center justify-between border-b border-slate-800 pb-4">
                <h2 class="text-base font-bold text-red-400 flex items-center gap-2">
                    <i class="fa-solid fa-terminal"></i> سجل أخطاء PHP المباشر (Live PHP error_log)
                </h2>
                <span class="text-xs text-slate-500 font-mono">آخر 50 سطر مسجّل</span>
            </div>

            <?php
            $logContent = '';
            $possibleLogs = [__DIR__ . '/error_log', __DIR__ . '/error_log.txt', ini_get('error_log')];
            foreach ($possibleLogs as $lf) {
                if ($lf && file_exists($lf) && is_readable($lf)) {
                    $lines = file($lf, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                    if (!empty($lines)) {
                        $lastLines = array_slice($lines, -50);
                        $logContent = implode("\n", $lastLines);
                        break;
                    }
                }
            }
            ?>

            <?php if (!empty($logContent)): ?>
                <div class="bg-slate-950 p-4 rounded-xl border border-red-500/20">
                    <pre class="text-red-300 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all max-h-96 overflow-y-auto"><?= htmlspecialchars($logContent) ?></pre>
                </div>
            <?php else: ?>
                <div class="text-center py-8 text-slate-500 text-sm">
                    <i class="fa-solid fa-circle-check text-emerald-500 text-2xl block mb-2"></i>
                    لا توجد أخطاء مسجلة حالياً في ملف error_log الخادم ممتازة ونظيفة! ✨
                </div>
            <?php endif; ?>
        </div>

    </div>
</body>
</html>
