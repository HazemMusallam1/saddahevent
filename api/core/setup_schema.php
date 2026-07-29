<?php
// ============================================================================
//  نظام صده — سكريبت تجهيز قاعدة البيانات الجديدة (يُنفذ مرة واحدة فقط)
//  يُنشئ جميع الجداول المطلوبة بنفس البنية التي يتوقعها db.php
// ============================================================================
// ⚠️ احذف هذا الملف بعد التنفيذ الناجح لأسباب أمنية!
// ============================================================================

ini_set('display_errors', '1');
error_reporting(E_ALL);
header('Content-Type: text/plain; charset=utf-8');

require_once __DIR__ . '/Database.php';

try {
    $pdo = (new Database())->getConnection();
    echo "✅ تم الاتصال بقاعدة البيانات بنجاح!\n\n";

    // ── الجداول ──────────────────────────────────────────────────────────────

    $tables = [

        // 1) الطلبات (أساسي)
        "CREATE TABLE IF NOT EXISTS `orders` (
            `id` BIGINT NOT NULL,
            `is_archived` TINYINT(1) NOT NULL DEFAULT 0,
            `order_date` VARCHAR(100) DEFAULT NULL,
            `status` VARCHAR(100) DEFAULT NULL,
            `payment_status` TEXT DEFAULT NULL,
            `is_confirmed` TINYINT(1) NOT NULL DEFAULT 0,
            `is_settled` TINYINT(1) NOT NULL DEFAULT 0,
            `profit_transferred` TINYINT(1) NOT NULL DEFAULT 0,
            `client_name` VARCHAR(500) DEFAULT NULL,
            `client_phone` VARCHAR(100) DEFAULT NULL,
            `client_national_id` VARCHAR(100) DEFAULT NULL,
            `delivery_date` VARCHAR(100) DEFAULT NULL,
            `sub_total` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `total` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `deposit` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `security_deposit` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `delivery_fee` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `order_json` LONGTEXT NOT NULL,
            PRIMARY KEY (`id`, `is_archived`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        // 2) بنود الطلب
        "CREATE TABLE IF NOT EXISTS `order_items` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `order_id` BIGINT NOT NULL,
            `sort_order` INT NOT NULL DEFAULT 0,
            `name` VARCHAR(500) DEFAULT NULL,
            `qty` INT NOT NULL DEFAULT 0,
            `total` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `row_json` LONGTEXT NOT NULL,
            INDEX `idx_order_id` (`order_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        // 3) مصروفات الطلب
        "CREATE TABLE IF NOT EXISTS `order_expenses` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `order_id` BIGINT NOT NULL,
            `sort_order` INT NOT NULL DEFAULT 0,
            `description` VARCHAR(1000) DEFAULT NULL,
            `amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `total` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `claim_id` VARCHAR(200) DEFAULT NULL,
            `expense_date` VARCHAR(100) DEFAULT NULL,
            `row_json` LONGTEXT NOT NULL,
            INDEX `idx_order_id` (`order_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        // 4) إيصالات الدفع
        "CREATE TABLE IF NOT EXISTS `order_payment_proofs` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `order_id` BIGINT NOT NULL,
            `sort_order` INT NOT NULL DEFAULT 0,
            `description` VARCHAR(1000) DEFAULT NULL,
            `amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `method` VARCHAR(200) DEFAULT NULL,
            `settled_to_institution` TINYINT(1) NOT NULL DEFAULT 0,
            `payment_date` VARCHAR(100) DEFAULT NULL,
            `settlement_id` VARCHAR(200) DEFAULT NULL,
            `row_json` LONGTEXT NOT NULL,
            INDEX `idx_order_id` (`order_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        // 5) المرتجعات
        "CREATE TABLE IF NOT EXISTS `order_returns` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `order_id` BIGINT NOT NULL,
            `sort_order` INT NOT NULL DEFAULT 0,
            `description` VARCHAR(1000) DEFAULT NULL,
            `refund` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `deducted` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `method` VARCHAR(200) DEFAULT NULL,
            `return_date` VARCHAR(100) DEFAULT NULL,
            `row_json` LONGTEXT NOT NULL,
            INDEX `idx_order_id` (`order_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        // 6) المخزون
        "CREATE TABLE IF NOT EXISTS `inventory` (
            `id` BIGINT NOT NULL PRIMARY KEY,
            `name` VARCHAR(500) DEFAULT NULL,
            `type` VARCHAR(200) DEFAULT NULL,
            `price` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `stock` INT NOT NULL DEFAULT 0,
            `item_json` LONGTEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        // 7) أنواع المنتجات
        "CREATE TABLE IF NOT EXISTS `product_types` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `sort_order` INT NOT NULL DEFAULT 0,
            `value_json` LONGTEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        // 8) المطالبات
        "CREATE TABLE IF NOT EXISTS `claims` (
            `id` BIGINT NOT NULL PRIMARY KEY,
            `claim_desc` VARCHAR(1000) DEFAULT NULL,
            `amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `claim_date` VARCHAR(100) DEFAULT NULL,
            `status` VARCHAR(200) DEFAULT NULL,
            `employee` VARCHAR(500) DEFAULT NULL,
            `order_id` BIGINT DEFAULT NULL,
            `kind` VARCHAR(200) DEFAULT NULL,
            `is_capital` TINYINT(1) NOT NULL DEFAULT 0,
            `batch_id` VARCHAR(200) DEFAULT NULL,
            `claim_json` LONGTEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        // 9) دفعات التسوية (Batches)
        "CREATE TABLE IF NOT EXISTS `batches` (
            `id` BIGINT NOT NULL PRIMARY KEY,
            `employee` VARCHAR(500) DEFAULT NULL,
            `batch_date` VARCHAR(100) DEFAULT NULL,
            `total_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
            `batch_json` LONGTEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        // 10) بيانات وصفية (Meta)
        "CREATE TABLE IF NOT EXISTS `meta` (
            `k` VARCHAR(200) NOT NULL PRIMARY KEY,
            `v` TEXT DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    ];

    foreach ($tables as $i => $sql) {
        $pdo->exec($sql);
        $num = $i + 1;
        echo "✅ جدول #{$num} تم إنشاؤه بنجاح\n";
    }

    // ── التحقق من النتائج ────────────────────────────────────────────────────
    echo "\n────────────────────────────────\n";
    echo "📋 الجداول الموجودة في القاعدة:\n";
    $stmt = $pdo->query("SHOW TABLES");
    foreach ($stmt->fetchAll(PDO::FETCH_NUM) as $row) {
        echo "   • " . $row[0] . "\n";
    }

    echo "\n🎉 تم تجهيز قاعدة البيانات بنجاح! احذف هذا الملف الآن.\n";

} catch (Throwable $e) {
    echo "❌ خطأ: " . $e->getMessage() . "\n";
    echo "   في الملف: " . $e->getFile() . " سطر " . $e->getLine() . "\n";
}
?>
