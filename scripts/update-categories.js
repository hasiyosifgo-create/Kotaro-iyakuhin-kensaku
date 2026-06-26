const fs = require('fs');
const cheerio = require('cheerio');

async function main() {
    console.log("Fetching Kotaro product list...");
    const res = await fetch('https://www.kotaro.co.jp/iryou/product_list/');
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // Create a mapping of clean name to category
    const catMap = {};
    
    $('tr').each((_, tr) => {
        const tds = $(tr).find('td');
        if (tds.length > 0) {
            // Find name
            let name = $(tds[1]).text().trim() || $(tds[0]).text().trim();
            if (!name) return;
            
            // Clean name for matching
            name = name.replace(/[「」【】（）()GNSVＡ-ＺA-Z]/g,'').replace(/コタロー|エキス|顆粒|細粒|錠|小太郎|漢方/g,'').replace(/　/g,'').trim();
            
            // Find category badge
            let category = 'other';
            $(tds[0]).find('img').each((_, img) => {
                const src = $(img).attr('src');
                if (src) {
                    if (src.includes('product_cat_coop.gif')) category = 'kyoryokukai';
                    else if (src.includes('product_cat_club.gif')) category = 'sajikurabu';
                    else if (src.includes('product_cat_visual.gif')) category = 'visual';
                }
            });
            
            if (category !== 'other') {
                catMap[name] = category;
            }
        }
    });

    console.log(`Found ${Object.keys(catMap).length} items with specific badges on Kotaro site.`);
    console.log("Example maps:", Object.entries(catMap).slice(0, 5));

    console.log("Loading data.json...");
    const d = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    
    function clean(n) {
        return n.replace(/[「」【】（）()GNSVＡ-ＺA-Z]/g,'').replace(/コタロー|エキス|顆粒|細粒|錠|小太郎|漢方/g,'').replace(/　/g,'').trim();
    }

    let updatedCount = 0;
    for (let i = 0; i < d.data.length; i++) {
        let item = d.data[i];
        if (item.type === 'otc') {
            let n1 = clean(item.name);
            let n2 = clean(item.rawName);
            
            let c = 'other';
            // Match against Kotaro official list
            if (catMap[n1]) c = catMap[n1];
            else if (catMap[n2]) c = catMap[n2];
            
            // Manual overrides for Edge cases not easily matched by string
            if (c === 'other') {
                if (n2.includes('かっ香正気散')) c = 'sajikurabu';
                else if (n2.includes('きゅう帰調血飲第一加減')) c = 'sajikurabu';
                else if (n2.includes('清上けん痛湯')) c = 'sajikurabu';
                else if (n2.includes('虔修六神丸')) c = 'visual';
                else if (n2.includes('ショーケン分包')) c = 'sajikurabu';
                else if (n2.includes('チクラック')) c = 'kyoryokukai';
                else if (n2.includes('ボーラック')) c = 'kyoryokukai';
            }
            
            if (item.otcCategory !== c) {
                updatedCount++;
                item.otcCategory = c;
            }
        }
    }
    
    fs.writeFileSync('data.json', JSON.stringify(d));
    console.log(`Updated data.json! Changed categories for ${updatedCount} items.`);
    
    // Let's count them
    const counts = { sajikurabu: 0, kyoryokukai: 0, visual: 0, other: 0 };
    d.data.forEach(item => {
        if (item.type === 'otc') {
            counts[item.otcCategory] = (counts[item.otcCategory] || 0) + 1;
        }
    });
    console.log("Final OTC Category Counts:", counts);
}

main().catch(console.error);
