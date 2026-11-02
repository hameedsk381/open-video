// The small expression language inside {{ }}. It is parsed and evaluated here, never handed to JavaScript, so a template can only
// read the values it is given and call the functions listed below.
//   literals   12  1.5  'text'  "text"  true  false  null
//   names      title  item.name  items[0]  items.length
//   operators  + - * / %   == != < <= > >=   && || !   cond ? a : b   ( )
//   functions  round(x, digits?) floor ceil abs min max upper lower string number, plus beat(n), bar(n, beat?) and beats(n) from the
//              composition's tempo (see beatFunctions in index.ts)
// == and != compare strictly. + joins text when either side is text.
type Token = { kind: 'num' | 'str' | 'name' | 'op'; value: string };
type Node = { kind: 'lit'; value: unknown } | { kind: 'name'; name: string } | { kind: 'member'; target: Node; key: Node } | { kind: 'call'; name: string; args: Node[] }
  | { kind: 'unary'; op: string; arg: Node } | { kind: 'binary'; op: string; left: Node; right: Node } | { kind: 'cond'; test: Node; then: Node; else: Node };
const operators = ['===','!==','==','!=','<=','>=','&&','||','<','>','+','-','*','/','%','!','?',':','(',')','[',']','.',','];
function tokenize(source: string): Token[] { const tokens: Token[]=[]; let i=0;
  while (i < source.length) { const ch=source[i]!; if (/\s/.test(ch)) { i++; continue; }
    const num=/^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(source.slice(i)); if (num && !(ch === '.' && /[A-Za-z_\])]/.test(source[i-1] ?? ''))) { tokens.push({ kind: 'num', value: num[0] }); i+=num[0].length; continue; }
    if (ch === '"' || ch === "'") { let value='', j=i+1; while (j < source.length && source[j] !== ch) { if (source[j] === '\\' && j+1 < source.length) j++; value+=source[j]; j++; } if (j >= source.length) throw new Error('unclosed quote'); tokens.push({ kind: 'str', value }); i=j+1; continue; }
    const name=/^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i)); if (name) { tokens.push({ kind: 'name', value: name[0] }); i+=name[0].length; continue; }
    const op=operators.find(o => source.startsWith(o, i)); if (op) { tokens.push({ kind: 'op', value: op }); i+=op.length; continue; }
    throw new Error(`unexpected "${ch}"`); }
  return tokens; }
function parse(source: string): Node { const tokens=tokenize(source); let pos=0;
  const peek=(value?: string) => { const t=tokens[pos]; return t && (value === undefined || (t.kind === 'op' && t.value === value)) ? t : undefined; };
  const expect=(value: string) => { if (!peek(value)) throw new Error(`expected "${value}"${tokens[pos] ? ` before "${tokens[pos]!.value}"` : ' at the end'}`); pos++; };
  const binary=(next: () => Node, ops: string[]) => () => { let left=next(); while (tokens[pos]?.kind === 'op' && ops.includes(tokens[pos]!.value)) { const op=tokens[pos++]!.value; left={ kind: 'binary', op, left, right: next() }; } return left; };
  const primary=(): Node => { const t=tokens[pos++]; if (!t) throw new Error('expression ended early');
    if (t.kind === 'num') return { kind: 'lit', value: Number(t.value) }; if (t.kind === 'str') return { kind: 'lit', value: t.value };
    if (t.kind === 'name') { if (t.value === 'true' || t.value === 'false') return { kind: 'lit', value: t.value === 'true' }; if (t.value === 'null') return { kind: 'lit', value: null };
      if (peek('(')) { pos++; const args: Node[]=[]; if (!peek(')')) { args.push(ternary()); while (peek(',')) { pos++; args.push(ternary()); } } expect(')'); return { kind: 'call', name: t.value, args }; }
      return { kind: 'name', name: t.value }; }
    if (t.value === '(') { const inner=ternary(); expect(')'); return inner; } throw new Error(`unexpected "${t.value}"`); };
  const postfix=(): Node => { let node=primary(); for (;;) { if (peek('.')) { pos++; const t=tokens[pos++]; if (t?.kind !== 'name') throw new Error('expected a field name after "."'); node={ kind: 'member', target: node, key: { kind: 'lit', value: t.value } }; } else if (peek('[')) { pos++; const key=ternary(); expect(']'); node={ kind: 'member', target: node, key }; } else return node; } };
  const unary=(): Node => { if (peek('!') || peek('-')) { const op=tokens[pos++]!.value; return { kind: 'unary', op, arg: unary() }; } return postfix(); };
  const mul=binary(unary, ['*','/','%']), add=binary(mul, ['+','-']), rel=binary(add, ['<','<=','>','>=']), eq=binary(rel, ['==','!=','===','!==']), and=binary(eq, ['&&']), or=binary(and, ['||']);
  function ternary(): Node { const test=or(); if (!peek('?')) return test; pos++; const then=ternary(); expect(':'); return { kind: 'cond', test, then, else: ternary() }; }
  const node=ternary(); if (pos < tokens.length) throw new Error(`unexpected "${tokens[pos]!.value}"`); return node; }
const num=(v: unknown, what: string) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what} needs a number, got ${JSON.stringify(v)}`); return v; };
const functions: Record<string, (...args: unknown[]) => unknown> = {
  round: (x, d=0) => { const f=10**num(d,'round'); return Math.round(num(x,'round')*f)/f; }, floor: x => Math.floor(num(x,'floor')), ceil: x => Math.ceil(num(x,'ceil')), abs: x => Math.abs(num(x,'abs')),
  min: (...xs) => Math.min(...xs.map(x => num(x,'min'))), max: (...xs) => Math.max(...xs.map(x => num(x,'max'))),
  upper: s => String(s).toUpperCase(), lower: s => String(s).toLowerCase(), string: v => String(v), number: v => num(Number(v),'number') };
const blocked = new Set(['__proto__','prototype','constructor']);
// Only own fields of plain objects, array items and .length are readable.
function member(target: unknown, key: unknown): unknown { if ((Array.isArray(target) || typeof target === 'string') && key === 'length') return target.length;
  if (Array.isArray(target)) { if (typeof key !== 'number' || !Number.isInteger(key)) throw new Error(`lists are indexed by whole numbers, got ${JSON.stringify(key)}`); return target[key]; }
  if (target && typeof target === 'object' && typeof key === 'string' && !blocked.has(key)) { if (!Object.hasOwn(target, key)) throw new Error(`no field "${key}"`); return (target as Record<string, unknown>)[key]; }
  throw new Error(`cannot read "${String(key)}" of ${target === null ? 'null' : typeof target}`); }
function evaluate(node: Node, scope: Record<string, unknown>): unknown { switch (node.kind) {
  case 'lit': return node.value;
  case 'name': if (!Object.hasOwn(scope, node.name)) throw new Error(`unknown variable "${node.name}"`); return scope[node.name];
  case 'member': return member(evaluate(node.target, scope), evaluate(node.key, scope));
  case 'call': { const own=Object.hasOwn(scope, node.name) && typeof scope[node.name] === 'function' ? scope[node.name] as (...args: unknown[]) => unknown : undefined, fn=functions[node.name] ?? own; if (!fn) throw new Error(`unknown function "${node.name}" (available: ${[...Object.keys(functions), ...Object.keys(scope).filter(k => typeof scope[k] === 'function')].join(', ')})`); return fn(...node.args.map(a => evaluate(a, scope))); }
  case 'unary': { const v=evaluate(node.arg, scope); return node.op === '!' ? !v : -num(v, 'minus'); }
  case 'cond': return evaluate(node.test, scope) ? evaluate(node.then, scope) : evaluate(node.else, scope);
  case 'binary': { if (node.op === '&&') return evaluate(node.left, scope) && evaluate(node.right, scope); if (node.op === '||') return evaluate(node.left, scope) || evaluate(node.right, scope);
    const a=evaluate(node.left, scope), b=evaluate(node.right, scope);
    switch (node.op) { case '==': case '===': return a === b; case '!=': case '!==': return a !== b;
      case '+': return typeof a === 'string' || typeof b === 'string' ? String(a)+String(b) : num(a,'+')+num(b,'+');
      case '-': return num(a,'-')-num(b,'-'); case '*': return num(a,'*')*num(b,'*'); case '/': return num(a,'/')/num(b,'/'); case '%': return num(a,'%')%num(b,'%');
      case '<': return num(a,'<') < num(b,'<'); case '<=': return num(a,'<=') <= num(b,'<='); case '>': return num(a,'>') > num(b,'>'); default: return num(a,'>=') >= num(b,'>='); } } } }
const parsed=new Map<string, Node>();
export function evaluateExpression(source: string, scope: Record<string, unknown>): unknown { let node=parsed.get(source); if (!node) { node=parse(source); parsed.set(source, node); } return evaluate(node, scope); }
