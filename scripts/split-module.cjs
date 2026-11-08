// One-off helper used to split a large file into modules without changing a line of behaviour.
// usage: node scripts/split-module.cjs <file> <outDir> '<json: { "module": ["blockName", ...] }>'
// Every named top-level declaration listed moves to <outDir>/<module>.tsx and is exported; imports are rebuilt from what each file uses.
const fs = require('fs'), path = require('path');
const [file, outDir, spec] = process.argv.slice(2), plan = JSON.parse(spec);
const BS = String.fromCharCode(92);
const word = name => new RegExp(BS + 'b' + name.replace(/\$/g, BS + '$') + BS + 'b');
const src = fs.readFileSync(file, 'utf8'), lines = src.split('\n');

// top-level declarations, each with the comment lines directly above it
const starts = [];
lines.forEach((line, i) => { const m = /^(export )?(async )?(function|const|type|interface|class) ([A-Za-z0-9_]+)/.exec(line); if (m) starts.push({ i, name: m[4] }); });
const blocks = starts.map((s, k) => {
  let from = s.i; while (from > 0 && /^(\/\/|\/\*|\s\*)/.test(lines[from - 1])) from--;
  return { name: s.name, from, to: (starts[k + 1] ? starts[k + 1].i : lines.length) - 1 };
});
for (let k = 0; k < blocks.length - 1; k++) { // comment lines above the next block are not this block's tail
  let to = blocks[k + 1].from - 1; blocks[k].to = to;
}
const byName = Object.fromEntries(blocks.map(b => [b.name, b]));
const text = b => lines.slice(b.from, b.to + 1).join('\n').replace(/\s+$/, '');

// imports of the original file
const header = lines.slice(0, blocks[0].from).join('\n'), imports = [];
const re = /import\s+(type\s+)?([\s\S]*?)\s+from\s+'([^']+)';/g; let m;
while ((m = re.exec(header))) {
  const names = [];
  const braces = /\{([\s\S]*)\}/.exec(m[2]);
  const def = m[2].replace(/\{[\s\S]*\}/, '').replace(/,/g, '').trim();
  if (def) names.push({ local: def, spec: def, isDefault: true, typeOnly: !!m[1] });
  if (braces) for (const part of braces[1].split(',').map(s => s.trim()).filter(Boolean)) {
    const t = /^type\s+(.*)$/.exec(part), body = t ? t[1] : part, local = body.split(/\s+as\s+/).pop().trim();
    names.push({ local, spec: part, typeOnly: !!m[1] || !!t });
  }
  imports.push({ source: m[3], names });
}
const sameDir = path.resolve(outDir) === path.resolve(path.dirname(file));
const rel = s => sameDir ? s : s.startsWith('.') ? (s.startsWith('./') ? '../' + s.slice(2) : '../' + s) : s;

const moved = new Set(Object.values(plan).flat()), owner = {};
for (const [mod, names] of Object.entries(plan)) for (const n of names) { if (!byName[n]) throw new Error('no block ' + n); owner[n] = mod; }
const exportize = t => t.replace(/^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\n)*)(?!export )((?:async )?(?:function|const|type|interface|class) )/, '$1export $2');

function importLines(body, selfNames, siblingPath) {
  const out = [];
  for (const imp of imports) {
    const used = imp.names.filter(n => word(n.local).test(body) && !selfNames.has(n.local));
    if (!used.length) continue;
    const def = used.find(n => n.isDefault), rest = used.filter(n => !n.isDefault);
    out.push('import ' + [def ? def.spec : '', rest.length ? '{ ' + rest.map(n => n.spec).join(', ') + ' }' : ''].filter(Boolean).join(', ') + " from '" + (siblingPath ? rel(imp.source) : imp.source) + "';");
  }
  return out;
}

// build each module
const exportedBy = {}; // name -> module
for (const [mod, names] of Object.entries(plan)) for (const n of names) exportedBy[n] = mod;
fs.mkdirSync(outDir, { recursive: true });
for (const [mod, names] of Object.entries(plan)) {
  const body = names.map(n => exportize(text(byName[n]))).join('\n\n');
  const self = new Set(names);
  const sib = {};
  for (const n of Object.keys(exportedBy)) if (!self.has(n) && word(n).test(body)) (sib[exportedBy[n]] ||= []).push(n);
  const lines2 = importLines(body, self, true);
  for (const [other, ns] of Object.entries(sib)) lines2.push('import { ' + ns.join(', ') + " } from './" + other + "';");
  fs.writeFileSync(path.join(outDir, mod + '.tsx'), lines2.join('\n') + '\n\n' + body + '\n');
}

// rebuild the original
const keep = blocks.filter(b => !moved.has(b.name));
const keepBody = keep.map(text).join('\n\n');
const sib = {};
for (const n of Object.keys(exportedBy)) if (word(n).test(keepBody)) (sib[exportedBy[n]] ||= []).push(n);
const headNonImport = header.replace(/import\s+(type\s+)?[\s\S]*?\s+from\s+'[^']+';\n?/g, '').trim();
const dir = path.relative(path.dirname(file), outDir).split(path.sep).join('/') || '.';
const mainImports = importLines(keepBody, new Set(), false);
for (const [mod, ns] of Object.entries(sib)) mainImports.push('import { ' + ns.join(', ') + " } from './" + dir + '/' + mod + "';");
fs.writeFileSync(file, mainImports.join('\n') + '\n' + (headNonImport ? '\n' + headNonImport + '\n' : '') + '\n' + keepBody + '\n');
console.log('moved', [...moved].length, 'blocks into', Object.keys(plan).length, 'modules; kept', keep.length);
