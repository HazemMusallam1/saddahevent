<?php
header('Content-Type: application/json; charset=utf-8');
header("Access-Control-Allow-Origin: *");

// مجلد الحفظ المؤقت للملفات القادمة من الاختصار (Shortcuts)
$tempDir = __DIR__ . '/../../temp_uploads';
if (!is_dir($tempDir)) {
    mkdir($tempDir, 0777, true);
}

// تنظيف الملفات القديمة (أقدم من 24 ساعة)
$files = glob($tempDir . '/*');
$now = time();
foreach ($files as $file) {
    if (is_file($file)) {
        if ($now - filemtime($file) >= 60 * 60 * 24) {
            unlink($file);
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_FILES['shared_file']) && $_FILES['shared_file']['error'] === UPLOAD_ERR_OK) {
        $fileTmpPath = $_FILES['shared_file']['tmp_name'];
        $fileName = $_FILES['shared_file']['name'];
        
        // استخراج الامتداد
        $fileParts = explode('.', $fileName);
        $fileExtension = strtolower(end($fileParts));
        
        // إذا لم يكن هناك امتداد، نفترض أنه صورة أو pdf من نوع الملف
        if (!$fileExtension || $fileExtension === $fileName) {
            $mime = mime_content_type($fileTmpPath);
            if ($mime === 'image/jpeg') $fileExtension = 'jpg';
            elseif ($mime === 'image/png') $fileExtension = 'png';
            elseif ($mime === 'application/pdf') $fileExtension = 'pdf';
            else $fileExtension = 'jpg';
        }

        // إنشاء اسم عشوائي فريد
        $newFileName = uniqid('share_') . '_' . bin2hex(random_bytes(4)) . '.' . $fileExtension;
        $destPath = $tempDir . '/' . $newFileName;
        
        if (move_uploaded_file($fileTmpPath, $destPath)) {
            echo json_encode([
                "status" => "success",
                "fileId" => $newFileName,
                "message" => "تم رفع الملف بنجاح"
            ]);
            exit;
        }
    }
    
    echo json_encode(["status" => "error", "message" => "فشل رفع الملف أو لم يتم إرسال ملف."]);
    exit;
}

echo json_encode(["status" => "error", "message" => "Invalid request method."]);
?>
