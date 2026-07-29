<?php
// ==============================================================================
// Saddah ERP - Database Connection Class
// Reads configuration from .env file securely
// ==============================================================================

class Database {
    private $host;
    private $db_name;
    private $username;
    private $password;

    public $conn;

    public function __construct() {
        $this->loadEnv();
        $this->host     = getenv('DB_HOST') ?: 'localhost';
        $this->db_name  = getenv('DB_NAME') ?: 'u811371548_newtest';
        $this->username = getenv('DB_USER') ?: 'u811371548_newtest';
        $this->password = getenv('DB_PASS') ?: '';
    }

    private function loadEnv() {
        // Look for .env file in project root or Code dir
        $paths = [
            __DIR__ . '/../../.env',
            __DIR__ . '/../.env',
            __DIR__ . '/.env'
        ];
        foreach ($paths as $envPath) {
            if (file_exists($envPath)) {
                $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                foreach ($lines as $line) {
                    $line = trim($line);
                    if ($line === '' || strpos($line, '#') === 0) continue;
                    $parts = explode('=', $line, 2);
                    if (count($parts) === 2) {
                        $key = trim($parts[0]);
                        $val = trim($parts[1], " \t\n\r\0\x0B\"'");
                        putenv("{$key}={$val}");
                        $_ENV[$key] = $val;
                    }
                }
                break;
            }
        }
    }

    public function getConnection() {
        $this->conn = null;

        try {
            $this->conn = new PDO("mysql:host=" . $this->host . ";dbname=" . $this->db_name . ";charset=utf8mb4", $this->username, $this->password);
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            $this->conn->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
            
        } catch(PDOException $exception) {
            error_log("Connection error: " . $exception->getMessage());
            die(json_encode(["error" => "Database connection failed. Please contact administrator."]));
        }

        return $this->conn;
    }
}
?>
