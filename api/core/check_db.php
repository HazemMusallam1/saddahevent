<?php
// ============================================================================
//  Diagnostic tool to test database connection and check JSON references
// ============================================================================
require_once __DIR__ . '/Database.php';

try {
    $db = new Database();
    $pdo = $db->getConnection();
    
    $stmt = $pdo->query("SELECT 'expenses' as tbl, row_json FROM order_expenses WHERE row_json LIKE '%saddah://%' UNION SELECT 'payments' as tbl, row_json FROM order_payment_proofs WHERE row_json LIKE '%saddah://%' UNION SELECT 'returns' as tbl, row_json FROM order_returns WHERE row_json LIKE '%saddah://%'");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($rows, JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
