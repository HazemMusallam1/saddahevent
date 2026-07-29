<?php
// router.php - Router for PHP built-in server (replaces .htaccess)

$path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);

// 1) api/db routing
if ($path === '/api/db' || $path === '/api/db/') {
    require __DIR__ . '/api/core/db.php';
    exit;
}

// 2) Protect sensitive files
if (preg_match('/^saddah_database|^auth_(users|rate)\.json|\.(tmp|rar|bat)$/i', basename($path))) {
    http_response_code(403);
    echo "Forbidden";
    exit;
}

// 3) HTML pages routing through auth_check.php
if (preg_match('/\.html$/i', $path)) {
    if (basename($path) === 'login.html') {
        // login.html is still passed through auth_check.php based on .htaccess logic (actually it excludes login.html from the rewrite rule? Wait, .htaccess says `RewriteCond %{REQUEST_URI} !login\.html$`, so it serves it directly).
        // Let's just pass everything to auth_check.php and let it handle it, or emulate perfectly:
        if (basename($path) !== 'login.html') {
            $_GET['page'] = ltrim($path, '/');
            require __DIR__ . '/auth_check.php';
            exit;
        }
    } else {
        $_GET['page'] = ltrim($path, '/');
        require __DIR__ . '/auth_check.php';
        exit;
    }
}

// 4) Root URL -> index.html via auth_check.php
if ($path === '/' || $path === '/index.php') {
    $_GET['page'] = 'index.html';
    require __DIR__ . '/auth_check.php';
    exit;
}

// Otherwise, serve static file as is
return false;
