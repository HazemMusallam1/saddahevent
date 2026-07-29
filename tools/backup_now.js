// scripts/backup_now.js
// Run: node scripts/backup_now.js [optional-label]
// Creates a timestamped backup of saddah_database.json in "saddah Archive/"

const fs   = require('fs');
const path = require('path');

const BASE       = path.join(__dirname, '..');
const DB_PATH    = path.join(BASE, 'saddah_database.json');
const BACKUP_DIR = path.join(BASE, 'saddah Archive');

// Create archive folder if needed
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// Read database
if (!fs.existsSync(DB_PATH)) {
    console.error('❌ saddah_database.json غير موجود');
    process.exit(1);
}

const db  = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const now = new Date();
const ts  = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
const label = process.argv[2] || '';

const backupName = `backup_${ts}${label ? '_' + label.replace(/\s/g, '_') : ''}.json`;
const backupPath = path.join(BACKUP_DIR, backupName);

const backup = {
    _meta: {
        created:  now.toISOString(),
        label:    label || 'نسخة احتياطية ' + now.toLocaleDateString('ar-EG', { dateStyle: 'full' }),
        source:   'saddah_database.json',
        counts: {
            orders:    (db.orders    || []).length,
            inventory: (db.inventory || []).length,
            archive:   (db.archive   || []).length,
            claims:    (db.claims    || []).length,
            batches:   (db.batches   || []).length
        }
    },
    ...db
};

fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');

console.log('✅ نسخة احتياطية جديدة:');
console.log('   ' + backupName);
console.log('   طلبات: ' + backup._meta.counts.orders);
console.log('   منتجات: ' + backup._meta.counts.inventory);
console.log('   مسار: ' + backupPath);
