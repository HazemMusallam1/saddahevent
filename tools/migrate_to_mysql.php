<?php
// ==============================================================================
// Saddah ERP - JSON to MySQL Migration Script
// ==============================================================================

// Configuration
$db_host = 'localhost';
$db_name = 'saddah_erp';
$db_user = 'root';
$db_pass = '';

$json_file = __DIR__ . '/../saddah_database.json';

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "Connected to database successfully.\n";
} catch (PDOException $e) {
    die("Database connection failed: " . $e->getMessage() . "\n");
}

if (!file_exists($json_file)) {
    die("saddah_database.json not found!\n");
}

$json_data = json_decode(file_get_contents($json_file), true);
if (json_last_error() !== JSON_ERROR_NONE) {
    die("Invalid JSON file.\n");
}

echo "Migrating Orders...\n";
$pdo->beginTransaction();

try {
    // 1. Migrate Orders
    if (isset($json_data['orders']) && is_array($json_data['orders'])) {
        $stmt_order = $pdo->prepare("
            INSERT IGNORE INTO orders 
            (id, order_date, status, is_confirmed, is_settled, contract_url, 
            client_name, client_national_id, client_address, delivery_date, delivery_time, 
            pickup_date, pickup_time, delivery_person, return_person, sub_total, total, 
            delivery_fee, deposit, security_deposit, vat_rate, include_tax_in_profit, 
            extra_external_delivery, extra_warehouse_delivery, extra_fuel) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt_item = $pdo->prepare("
            INSERT INTO order_items (order_id, name, description, decor_details, qty, chairs_count, total_price) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt_expense = $pdo->prepare("
            INSERT INTO order_expenses (order_id, description, amount, total, paid, discount, attachment_type, attachment_name, expense_date, claim_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt_proof = $pdo->prepare("
            INSERT INTO order_payment_proofs (order_id, description, amount, method, attachment_type, attachment_name, settled_to_institution, payment_date) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt_return = $pdo->prepare("
            INSERT INTO order_returns (order_id, description, refund_amount, deducted_amount, method, attachment_type, attachment_name, return_date) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");

        foreach ($json_data['orders'] as $order) {
            $f = $order['financials'] ?? [];
            $ex = $order['extraFinancials'] ?? [];
            $c = $order['client'] ?? [];

            // Execute Order Insert
            $stmt_order->execute([
                $order['id'],
                $order['date'] ?? '',
                $order['status'] ?? 'مسودة',
                ($order['isConfirmed'] ?? false) ? 1 : 0,
                ($order['isSettled'] ?? false) ? 1 : 0,
                $order['contractUrl'] ?? '',
                $c['name'] ?? '',
                $c['id'] ?? '',
                $c['address'] ?? '',
                $c['deliveryDate'] ?? '',
                $c['deliveryTime'] ?? '',
                $c['pickupDate'] ?? '',
                $c['pickupTime'] ?? '',
                $c['deliveryPerson'] ?? '',
                $c['returnPerson'] ?? '',
                $f['subTotal'] ?? 0,
                $f['total'] ?? 0,
                $f['delivery'] ?? 0,
                $f['deposit'] ?? 0,
                $f['securityDeposit'] ?? 0,
                $f['vatRate'] ?? 15,
                ($f['includeTaxInProfit'] ?? true) ? 1 : 0,
                $ex['externalDelivery'] ?? 0,
                $ex['warehouseDelivery'] ?? 0,
                $ex['abdulrazzaqFuel'] ?? 0
            ]);

            // Migrate Items
            if (!empty($order['items'])) {
                foreach ($order['items'] as $item) {
                    $stmt_item->execute([
                        $order['id'],
                        $item['name'] ?? '',
                        $item['desc'] ?? '',
                        $item['decorDetails'] ?? '',
                        $item['qty'] ?? 1,
                        $item['chairsCount'] ?? 0,
                        $item['total'] ?? 0
                    ]);
                }
            }

            // Migrate Expenses
            if (!empty($order['expenses'])) {
                foreach ($order['expenses'] as $exp) {
                    $att = $exp['attachment'] ?? [];
                    $stmt_expense->execute([
                        $order['id'],
                        $exp['desc'] ?? ($exp['name'] ?? ''),
                        $exp['amount'] ?? 0,
                        $exp['total'] ?? 0,
                        $exp['paid'] ?? 0,
                        $exp['discount'] ?? 0,
                        $att['type'] ?? '',
                        $att['name'] ?? ($att['data'] ?? ''),
                        isset($exp['date']) ? date('Y-m-d H:i:s', strtotime($exp['date'])) : null,
                        $exp['claimId'] ?? null
                    ]);
                }
            }

            // Migrate Payment Proofs
            if (!empty($order['paymentProofs'])) {
                foreach ($order['paymentProofs'] as $proof) {
                    $att = $proof['attachment'] ?? [];
                    $stmt_proof->execute([
                        $order['id'],
                        $proof['desc'] ?? '',
                        $proof['amount'] ?? 0,
                        $proof['method'] ?? '',
                        $att['type'] ?? '',
                        $att['name'] ?? ($att['data'] ?? ''),
                        ($proof['settledToInstitution'] ?? false) ? 1 : 0,
                        isset($proof['date']) ? date('Y-m-d H:i:s', strtotime($proof['date'])) : null
                    ]);
                }
            }

            // Migrate Returns
            if (!empty($order['returns'])) {
                foreach ($order['returns'] as $ret) {
                    $att = $ret['attachment'] ?? [];
                    $stmt_return->execute([
                        $order['id'],
                        $ret['desc'] ?? '',
                        $ret['refund'] ?? 0,
                        $ret['deducted'] ?? 0,
                        $ret['method'] ?? '',
                        $att['type'] ?? '',
                        $att['name'] ?? ($att['data'] ?? ''),
                        isset($ret['date']) ? date('Y-m-d H:i:s', strtotime($ret['date'])) : null
                    ]);
                }
            }
        }
        echo "Orders migrated successfully.\n";
    }

    // 2. Migrate Inventory
    if (isset($json_data['inventory']) && is_array($json_data['inventory'])) {
        $stmt_inv = $pdo->prepare("INSERT IGNORE INTO inventory (id, name, type, total_qty, price) VALUES (?, ?, ?, ?, ?)");
        foreach ($json_data['inventory'] as $inv) {
            $stmt_inv->execute([
                $inv['id'],
                $inv['name'] ?? '',
                $inv['type'] ?? '',
                $inv['total_qty'] ?? 0,
                $inv['price'] ?? 0
            ]);
        }
        echo "Inventory migrated successfully.\n";
    }

    // 3. Migrate Product Types
    if (isset($json_data['productTypes']) && is_array($json_data['productTypes'])) {
        $stmt_pt = $pdo->prepare("INSERT IGNORE INTO product_types (id, name) VALUES (?, ?)");
        foreach ($json_data['productTypes'] as $pt) {
            $stmt_pt->execute([$pt['id'], $pt['name'] ?? '']);
        }
        echo "Product Types migrated successfully.\n";
    }

    // 4. Migrate Claims
    if (isset($json_data['claims']) && is_array($json_data['claims'])) {
        $stmt_claim = $pdo->prepare("
            INSERT IGNORE INTO claims (id, claim_type, title, employee, amount, attachment_name, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        foreach ($json_data['claims'] as $cl) {
            $stmt_claim->execute([
                $cl['id'],
                $cl['type'] ?? '',
                $cl['title'] ?? '',
                $cl['emp'] ?? '',
                $cl['amount'] ?? 0,
                $cl['attachment'] ?? '',
                isset($cl['date']) ? date('Y-m-d H:i:s', strtotime($cl['date'])) : null
            ]);
        }
        echo "Claims migrated successfully.\n";
    }

    $pdo->commit();
    echo "====================================\n";
    echo "Migration Completed Successfully!\n";
    echo "====================================\n";

} catch (Exception $e) {
    $pdo->rollBack();
    die("Migration failed: " . $e->getMessage() . "\n");
}
