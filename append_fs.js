const fs = require('fs');

const newFunc = `
window.createInitialOrderFoldersAPI = async function(order) {
    if (typeof findOrderPathAPI !== 'function' || typeof callFS !== 'function') return;
    try {
        const basePath = await findOrderPathAPI(order);
        if (!basePath) return;
        
        const subfolders = ['الدفعات', 'المرتجعات', 'المصروفات', 'صافي الربح'];
        for (let sub of subfolders) {
            await callFS({ action: 'mkdir', path: \`\${basePath}/\${sub}\` });
        }
    } catch (e) {
        console.error('Error creating initial folders:', e);
    }
};
`;

let code = fs.readFileSync('js/fs-helpers-save_v2.js', 'utf8');
code += '\n' + newFunc + '\n';
fs.writeFileSync('js/fs-helpers-save_v2.js', code, 'utf8');
console.log('Appended to fs-helpers-save_v2.js');
