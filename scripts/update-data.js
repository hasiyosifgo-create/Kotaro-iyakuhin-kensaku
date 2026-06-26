const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const Si = "https://www.kegg.jp";

// Categorization logic
const bAStr = fs.readFileSync(path.join(__dirname, 'bA.json'), 'utf8'); const bA = eval(bAStr);

function xA(n) {
    return n.replace(/[Ａ-Ｚａ-ｚ０-９]/g, r => String.fromCharCode(r.charCodeAt(0) - 65248))
            .replace(/[－―]/g, "-")
            .replace(/[〜～]/g, "~")
            .replace(/「.*?」/g, "")
            .replace(/『.*?』/g, "")
            .replace(/【.*?】/g, "")
            .replace(/（.*?）/g, "")
            .replace(/\(.*?\)/g, "")
            .replace(/®/g, "")
            .replace(/エキス/g, "")
            .replace(/顆粒/g, "")
            .replace(/細粒/g, "")
            .replace(/カプセル/g, "")
            .replace(/錠/g, "")
            .replace(/水製/g, "")
            .replace(/N$/i, "n")
            .replace(/S$/i, "s")
            .replace(/G$/i, "g")
            .replace(/V$/i, "v")
            .replace(/P$/i, "p")
            .replace(/コタロー/g, "")
            .replace(/小太郎/g, "")
            .replace(/漢方/g, "")
            .replace(/製薬/g, "")
            .replace(/株式会社/g, "")
            .replace(/株/g, "")
            .replace(/　/g, "")
            .replace(/ /g, "")
            .toLowerCase();
}

function Sy(n) {
    const r = xA(n);
    const match = bA.find(s => s.normalized === r);
    return match ? match.category : null;
}

function L0(n) {
    const r = n.replace(/^[【\[［]\s*([^】\]］]+)\s*[】\]］].*/, "$1");
    return r === n ? "" : r.trim();
}

function U0(n) {
    return n.replace(/^[【\[［]\s*[^】\]］]+\s*[】\]］]/, "").trim();
}

// Helpers for detail parsing
function Y0(el, $) {
    let text = "";
    let curr = $(el).next();
    while (curr.length && !curr.is("h1, h2, h3, h4")) {
        text += curr.text() + "\n";
        curr = curr.next();
    }
    return text.trim();
}

function V0(el, $) {
    return $(el).text().trim().split(/\s*,\s*|\s*、\s*|\s+/).filter(Boolean);
}

function qo(n) {
    return n.replace(/\s+/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, r => String.fromCharCode(r.charCodeAt(0) - 65248));
}

function _A(table, $) {
    const r = [];
    $(table).find("tr").each((_, tr) => {
        const tds = $(tr).find("td");
        if (tds.length !== 2) return;
        const f = $(tds[0]).text().trim();
        const d = $(tds[1]).text().trim();
        const h = qo(f);
        if (!h) return;
        const m = d.match(/([\d.]+)\s*(g|mL|mg)/);
        if (!m) return;
        const p = parseFloat(m[1]);
        const v = m[2];
        if (isNaN(p) || p <= 0) return;
        
        let amountStr = "";
        if (v === "mg") amountStr = `${m[1]}mg`;
        else if (v === "mL") amountStr = `${m[1]}mL`;
        else amountStr = `${m[1]}g`;
        
        r.push({ name: h, amountStr, isExtract: !1 });
    });
    return r;
}

async function fetchDetails(url, type) {
    console.log(`Fetching details for ${url}...`);
    const l = `${Si}/medicus-bin/${url}`;
    const res = await fetch(l);
    const html = await res.text();
    const $ = cheerio.load(html);
    
    const r = {
        type, efficacy: "", feature: "",
        ingredients: [], components: [], additives: [], dailyDose: "",
        usage: "", precautions: "", usageNotes: ""
    };
    
    $("td.title").each((_, m) => {
        const p = $(m).text().trim();
        const v = $(m).next();
        if (v.length) {
            if (/^成分/.test(p)) {
                const y = p.match(/[（(](.*)[）)]/);
                if (y) r.dailyDose = y[1].replace(/中$/, "");
            } else if (p === "添加物") {
                r.additives = V0(v, $);
            }
        }
    });

    const d = $("table");
    d.each((_, p) => {
        const v = $(p).find("tr");
        if (v.length < 2) return;
        const x = $(v[0]).find("td");
        if (x.length === 2) {
            const w = $(x[0]).text().trim();
            const O = $(x[1]).text().trim();
            if (/エキス|[ァ-ヶ]/.test(w) && /\d+\.?\d*(g|mL|mg)/.test(O)) {
                r.ingredients = _A(p, $); r.components = r.ingredients;
                return false;
            }
        }
    });

    $("h3, h4").each((_, m) => {
        const p = $(m).text().trim();
        const v = Y0(m, $);
        if (/効果[・･]効能|効能[・･]効果/.test(p)) r.efficacy = v;
        else if (p === "特徴") r.feature = v;
        else if (/使用上の注意/.test(p) && !r.precautions) r.precautions = v;
        else if (/用法[・･]用量|用量[・･]用法/.test(p)) r.usage = v;
        else if (/用法に関する注意/.test(p)) r.usageNotes = v;
    });

    return r;
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function main() {
    console.log("Starting KEGG scrape...");
    const allItems = [];
    
    // Fetch Medical
    let page = 1;
    while (true) {
        console.log(`Fetching medical page ${page}...`);
        const url = `${Si}/medicus-bin/search_drug?search_keyword=%e5%b0%8f%e5%a4%aa%e9%83%8e%e6%bc%a2%e6%96%b9%e8%a3%bd%e8%96%ac&page=${page}`;
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);
        
        let found = 0;
        $("table.list1 tr").each((_, tr) => {
            const tds = $(tr).find("td");
            if (tds.length === 0) return;
            const a = $(tds[0]).find("a");
            if (!a.length) return;
            const w = a.attr("href").replace(/^\//, "");
            const x = a.text().trim();
            const O = $(tds[1]).text().trim();
            const C = L0(O);
            const N = U0(x);
            allItems.push({ name: N, rawName: x, url: w, type: "medical", otcCategory: null, subCategory: C, sortKey: N });
            found++;
        });
        
        const hasNext = $("a").toArray().some(a => $(a).text().trim() === "次へ");
        if (found === 0 || !hasNext) break;
        page++;
        await delay(1000);
    }

    // Fetch OTC
    page = 1;
    while (true) {
        console.log(`Fetching OTC page ${page}...`);
        const url = `${Si}/medicus-bin/search_drug?display=otc&search_keyword=%e5%b0%8f%e5%a4%aa%e9%83%8e%e6%bc%a2%e6%96%b9%e8%a3%bd%e8%96%ac&page=${page}`;
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);
        
        let found = 0;
        $("table.list1 tr").each((_, tr) => {
            const tds = $(tr).find("td");
            if (tds.length === 0) return;
            const a = $(tds[0]).find("a");
            if (!a.length) return;
            const w = a.attr("href").replace(/^\//, "");
            const x = a.text().trim();
            const O = $(tds[1]).text().trim();
            const C = L0(O);
            const N = U0(x);
            const B = Sy(x) ?? Sy(N) ?? "other";
            allItems.push({ name: N, rawName: x, url: w, type: "otc", otcCategory: B, subCategory: C, sortKey: N });
            found++;
        });
        
        const hasNext = $("a").toArray().some(a => $(a).text().trim() === "次へ");
        if (found === 0 || !hasNext) break;
        page++;
        await delay(1000);
    }
    
    console.log(`Found ${allItems.length} total items. Fetching details...`);
    
    for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        try {
            const details = await fetchDetails(item.url, item.type);
            Object.assign(item, details); if (!item.efficacy) item.efficacy = " ";
        } catch (e) {
            console.error(`Failed to fetch details for ${item.url}:`, e);
        }
        await delay(1000); // 1 sec delay to avoid IP block
    }
    
    // Sort
    allItems.sort((a, b) => a.sortKey.localeCompare(b.sortKey, "ja"));
    
    const finalData = {
        data: allItems,
        changes: { added: [], deleted: [], lastUpdated: new Date().toISOString() }
    };
    
    fs.writeFileSync(path.join(__dirname, '../data.json'), JSON.stringify(finalData));
    console.log("Successfully generated data.json!");
}

main().catch(console.error);





