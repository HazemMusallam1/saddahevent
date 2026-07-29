<?php
// ============================================================================
//  نظام صده — واجهة /api/db على MySQL (تحاكي واجهة JSON القديمة بالكامل)
//  GET  : يجمّع كل الجداول ويرجّعها بنفس شكل saddah_database.json
//  POST : يستقبل القاعدة كاملة، يفرّغ الجداول ثم يعيد إدراجها (حفظ ذرّي)
//  نقل بلا فقدان: كل صف يحفظ كائنه الأصلي كاملاً في عمود *_json.
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

require_once __DIR__ . '/Database.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// ── أدوات ───────────────────────────────────────────────────────────────────
function num($v) {
    if (is_int($v) || is_float($v)) return $v + 0;
    $s = preg_replace('/[^0-9.\-]/', '', (string)$v);
    return ($s === '' || $s === '-' || $s === '.') ? 0 : (float)$s;
}
function jenc($v) { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
function bigOrNull($v) { return (isset($v) && is_numeric($v)) ? $v : null; }

try {
    $pdo = (new Database())->getConnection();

    // ════════════════════════ قراءة القاعدة ════════════════════════
    if ($method === 'GET') {
        echo jenc([
            'orders'       => loadOrders($pdo, 0),
            'inventory'    => jsonCol($pdo, "SELECT item_json  AS j FROM inventory     ORDER BY id"),
            'productTypes' => jsonCol($pdo, "SELECT value_json AS j FROM product_types ORDER BY sort_order"),
            'archive'      => loadOrders($pdo, 1),
            'claims'       => jsonCol($pdo, "SELECT claim_json AS j FROM claims         ORDER BY id"),
            'batches'      => jsonCol($pdo, "SELECT batch_json AS j FROM batches        ORDER BY id"),
            '_savedAt'     => (int)($pdo->query("SELECT v FROM meta WHERE k='_savedAt'")->fetchColumn() ?: 0),
        ]);
        exit;
    }

    // ════════════════════════ حفظ القاعدة ════════════════════════
    if ($method === 'POST') {
        $body = file_get_contents('php://input');
        $data = json_decode($body, true);
        if (!is_array($data)) {
            http_response_code(400); echo json_encode(['success' => false, 'error' => 'Invalid JSON']); exit;
        }
        // CSRF: من body._csrf أو الترويسة (LiteSpeed قد يحذف الترويسات)
        $csrf = ($data['_csrf'] ?? '') ?: ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
        if (!$csrf || !hash_equals($_SESSION['csrf'] ?? '', $csrf)) {
            http_response_code(403); echo json_encode(['success' => false, 'error' => 'csrf']); exit;
        }
        unset($data['_csrf']);

        $pdo->beginTransaction();

        // بدء نظيف: حذف الكل (الأبناء يُحذفون تلقائياً عبر ON DELETE CASCADE)
        foreach (['orders', 'inventory', 'product_types', 'claims', 'batches', 'meta'] as $t) {
            $pdo->exec("DELETE FROM $t");
        }

        // الطلبات + الأرشيف
        $stmts = [
            'order' => $pdo->prepare("INSERT INTO orders (id,is_archived,order_date,status,payment_status,is_confirmed,is_settled,profit_transferred,client_name,client_phone,client_national_id,delivery_date,sub_total,total,deposit,security_deposit,delivery_fee,order_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"),
            'item'  => $pdo->prepare("INSERT INTO order_items (order_id,sort_order,name,qty,total,row_json) VALUES (?,?,?,?,?,?)"),
            'exp'   => $pdo->prepare("INSERT INTO order_expenses (order_id,sort_order,description,amount,total,claim_id,expense_date,row_json) VALUES (?,?,?,?,?,?,?,?)"),
            'proof' => $pdo->prepare("INSERT INTO order_payment_proofs (order_id,sort_order,description,amount,method,settled_to_institution,payment_date,settlement_id,row_json) VALUES (?,?,?,?,?,?,?,?,?)"),
            'ret'   => $pdo->prepare("INSERT INTO order_returns (order_id,sort_order,description,refund,deducted,method,return_date,row_json) VALUES (?,?,?,?,?,?,?,?)"),
        ];
        saveOrders($pdo, $data['orders']  ?? [], 0, $stmts);
        saveOrders($pdo, $data['archive'] ?? [], 1, $stmts);

        // المخزون
        $insInv = $pdo->prepare("INSERT INTO inventory (id,name,type,price,stock,item_json) VALUES (?,?,?,?,?,?)");
        foreach (($data['inventory'] ?? []) as $inv) {
            if (!isset($inv['id'])) continue;
            $insInv->execute([$inv['id'], $inv['name'] ?? null, $inv['type'] ?? null, num($inv['price'] ?? 0), (int)num($inv['stock'] ?? 0), jenc($inv)]);
        }

        // أنواع المنتجات (نص أو كائن)
        $insPt = $pdo->prepare("INSERT INTO product_types (sort_order,value_json) VALUES (?,?)");
        foreach (array_values($data['productTypes'] ?? []) as $i => $pt) { $insPt->execute([$i, jenc($pt)]); }

        // المطالبات (تحوي invoiceBase64 — تُحفظ حرفياً ضمن claim_json)
        $insCl = $pdo->prepare("INSERT INTO claims (id,claim_desc,amount,claim_date,status,employee,order_id,kind,is_capital,batch_id,claim_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
        foreach (($data['claims'] ?? []) as $cl) {
            if (!isset($cl['id'])) continue;
            $insCl->execute([$cl['id'], $cl['desc'] ?? ($cl['title'] ?? null), num($cl['amount'] ?? 0), $cl['date'] ?? null,
                $cl['status'] ?? null, $cl['employee'] ?? null, bigOrNull($cl['orderId'] ?? null), $cl['kind'] ?? null,
                !empty($cl['isCapital']) ? 1 : 0, isset($cl['batchId']) ? (string)$cl['batchId'] : null, jenc($cl)]);
        }

        // دفعات التسوية (batches — تحوي proofBase64 حرفياً)
        $insB = $pdo->prepare("INSERT INTO batches (id,employee,batch_date,total_amount,batch_json) VALUES (?,?,?,?,?)");
        foreach (($data['batches'] ?? []) as $b) {
            if (!isset($b['id'])) continue;
            $insB->execute([$b['id'], $b['employee'] ?? null, $b['date'] ?? null, num($b['totalAmount'] ?? 0), jenc($b)]);
        }

        // وقت الحفظ
        $insM = $pdo->prepare("INSERT INTO meta (k,v) VALUES (?,?)");
        $insM->execute(['_savedAt', (string)($data['_savedAt'] ?? round(microtime(true) * 1000))]);

        $pdo->commit();
        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'method not allowed']);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    error_log('db.php error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'server error']);
}

// ── دوال مساعدة ──────────────────────────────────────────────────────────────
function jsonCol($pdo, $sql) {
    $out = [];
    foreach ($pdo->query($sql)->fetchAll() as $row) {
        $d = json_decode($row['j'], true);
        if ($d !== null) $out[] = $d;
    }
    return $out;
}

function childRows($pdo, $table, $oid) {
    $st = $pdo->prepare("SELECT row_json FROM $table WHERE order_id=? ORDER BY sort_order ASC, id ASC");
    $st->execute([$oid]);
    $a = [];
    foreach ($st->fetchAll() as $row) { $d = json_decode($row['row_json'], true); if (is_array($d)) $a[] = $d; }
    return $a;
}

function loadOrders($pdo, $isArchived) {
    $rows = $pdo->query("SELECT id, order_json FROM orders WHERE is_archived=" . ($isArchived ? 1 : 0) . " ORDER BY id ASC")->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $o = json_decode($r['order_json'], true);
        if (!is_array($o)) $o = ['id' => $r['id']];
        $o['items']         = childRows($pdo, 'order_items', $r['id']);
        $o['expenses']      = childRows($pdo, 'order_expenses', $r['id']);
        $o['paymentProofs'] = childRows($pdo, 'order_payment_proofs', $r['id']);
        $o['returns']       = childRows($pdo, 'order_returns', $r['id']);
        $out[] = $o;
    }
    return $out;
}

function saveOrders($pdo, $list, $isArchived, $stmts) {
    foreach ($list as $order) {
        if (!isset($order['id'])) continue;
        $c = $order['client'] ?? [];
        $f = $order['financials'] ?? [];
        // الكائن الأصلي بدون المصفوفات الفرعية (تُحفظ في جداولها)
        $core = $order;
        unset($core['items'], $core['expenses'], $core['paymentProofs'], $core['returns']);

        $stmts['order']->execute([
            $order['id'], $isArchived,
            $order['date'] ?? null, $order['status'] ?? null, $order['paymentStatus'] ?? null,
            !empty($order['isConfirmed']) ? 1 : 0, !empty($order['isSettled']) ? 1 : 0, !empty($order['profitTransferred']) ? 1 : 0,
            $c['name'] ?? null, $c['phone'] ?? null, $c['id'] ?? null, $c['deliveryDate'] ?? null,
            num($f['subTotal'] ?? 0), num($f['total'] ?? 0), num($f['deposit'] ?? 0), num($f['securityDeposit'] ?? 0), num($f['delivery'] ?? 0),
            jenc($core),
        ]);
        $oid = $order['id'];
        foreach (array_values($order['items'] ?? []) as $i => $it) {
            $stmts['item']->execute([$oid, $i, $it['name'] ?? null, (int)num($it['qty'] ?? 0), num($it['total'] ?? 0), jenc($it)]);
        }
        foreach (array_values($order['expenses'] ?? []) as $i => $e) {
            $stmts['exp']->execute([$oid, $i, $e['desc'] ?? ($e['name'] ?? null), num($e['amount'] ?? 0), num($e['total'] ?? 0), $e['claimId'] ?? null, $e['date'] ?? null, jenc($e)]);
        }
        foreach (array_values($order['paymentProofs'] ?? []) as $i => $p) {
            $stmts['proof']->execute([$oid, $i, $p['desc'] ?? null, num($p['amount'] ?? 0), $p['method'] ?? null, !empty($p['settledToInstitution']) ? 1 : 0, $p['date'] ?? null, isset($p['settlementId']) ? (string)$p['settlementId'] : null, jenc($p)]);
        }
        foreach (array_values($order['returns'] ?? []) as $i => $r) {
            $stmts['ret']->execute([$oid, $i, $r['desc'] ?? null, num($r['refund'] ?? 0), num($r['deducted'] ?? 0), $r['method'] ?? null, $r['date'] ?? null, jenc($r)]);
        }
    }
}
