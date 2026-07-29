const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'pages');

function getDepth(filePath) {
    const relativePath = path.relative(__dirname, filePath);
    // Split by either \ or /
    const parts = relativePath.split(/[\\/]/);
    // Depth is the number of directories, so total parts - 1 (since last part is the file itself)
    return parts.length - 1;
}

function getRelativePrefix(depth) {
    let prefix = '';
    for (let i = 0; i < depth; i++) {
        prefix += '../';
    }
    return prefix;
}

function processDirectory(directory) {
    const files = fs.readdirSync(directory);
    
    for (const file of files) {
        const fullPath = path.join(directory, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            processDirectory(fullPath);
        } else if (file.endsWith('.html')) {
            processFile(fullPath);
        }
    }
}

function processFile(filePath) {
    const depth = getDepth(filePath);
    const prefix = getRelativePrefix(depth);
    const prefixNoSlash = prefix.slice(0, -1);
    
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;
    
    // Fix index.html links (assuming they start with ../)
    content = content.replace(/href="\.\.\/.*?index\.html"/g, `href="${prefix}index.html"`);
    
    // Fix manifest.json links
    content = content.replace(/href="(\.\.\/)*manifest\.json"/g, `href="${prefix}manifest.json"`);
    
    // Fix window.SaddahBase
    content = content.replace(/window\.SaddahBase\s*=\s*['"].*?['"]/g, `window.SaddahBase = '${prefixNoSlash}'`);
    
    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated paths in: ${path.relative(__dirname, filePath)} (Depth: ${depth})`);
    }
}

console.log('Starting path correction...');
processDirectory(pagesDir);
console.log('Finished path correction.');
