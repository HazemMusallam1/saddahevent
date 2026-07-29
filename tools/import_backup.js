// scripts/import_backup.js  — run: node scripts/import_backup.js "path/to/file.json"
const fs   = require('fs');
const path = require('path');

const filePath = process.argv[2];

if (!filePath) {
    console.log('Usage: node scripts/import_backup.js "path/to/backup.json"');
    process.exit(1);
}

const cleanPath = filePath.replace(/^["']|["']$/g, '').trim();

if (!fs.existsSync(cleanPath)) {
    console.error('ERROR: File not found -> ' + cleanPath);
    process.exit(1);
}

try {
    const data = JSON.parse(fs.readFileSync(cleanPath, 'utf8'));
    delete data._meta;

    // Ensure all collections exist
    const db = {
        orders:       data.orders       || [],
        inventory:    data.inventory    || [],
        productTypes: data.productTypes || [],
        archive:      data.archive      || [],
        claims:       data.claims       || [],
        batches:      data.batches      || [],
    };

    const destPath = path.join(__dirname, '..', 'saddah_database.json');
    fs.writeFileSync(destPath, JSON.stringify(db), 'utf8');

    console.log('');
    console.log('Import successful:');
    console.log('  Orders:    ' + db.orders.length);
    console.log('  Inventory: ' + db.inventory.length);
    console.log('  Types:     ' + db.productTypes.length);
    console.log('  Archive:   ' + db.archive.length);
    console.log('');
    console.log('Saved to: ' + destPath);

} catch(e) {
    console.error('ERROR parsing JSON: ' + e.message);
    process.exit(1);
}
