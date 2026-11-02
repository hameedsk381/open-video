import { describe,it,expect } from 'vitest'; import { fontStack, cssFont } from '@ove/graphics'; import { layoutText } from '@ove/graphics/runtime'; import { parseComposition } from '@ove/schema';
const m=(s:string,size:number)=>Array.from(s).length*size*.5; // every character is half the font size wide
describe('layoutText',()=>{
it('keeps explicit line breaks and does not wrap without maxWidth',()=>expect(layoutText('a long line\nnext',{fontSize:20},m)).toEqual({lines:['a long line','next'],fontSize:20,truncated:false}));
it('wraps at spaces to fit maxWidth',()=>expect(layoutText('Welcome to the spring sale',{fontSize:20,maxWidth:100},m).lines).toEqual(['Welcome to','the spring','sale']));
it('splits a word that is wider than maxWidth',()=>expect(layoutText('Supercalifragilistic',{fontSize:20,maxWidth:100},m).lines).toEqual(['Supercalif','ragilistic']));
it('shrinks to fit maxLines without splitting words, stopping at minFontSize',()=>{expect(layoutText('Welcome to the spring sale',{fontSize:40,maxWidth:200,maxLines:2,minFontSize:20},m)).toEqual({lines:['Welcome to the','spring sale'],fontSize:28,truncated:false});expect(layoutText('Supercalifragilistic',{fontSize:40,maxWidth:200,minFontSize:10},m).fontSize).toBe(20);});
it('truncates with an ellipsis that fits when it cannot shrink enough',()=>{const t=layoutText('one two three four five six',{fontSize:20,maxWidth:100,maxLines:2,minFontSize:18},m);expect(t).toMatchObject({fontSize:18,truncated:true});expect(t.lines).toHaveLength(2);expect(t.lines[1]!.endsWith('…')).toBe(true);expect(m(t.lines[1]!,18)).toBeLessThanOrEqual(100);});
it('leaves text that already fits alone',()=>expect(layoutText('Hi',{fontSize:40,maxWidth:500,maxLines:1,minFontSize:10},m)).toEqual({lines:['Hi'],fontSize:40,truncated:false}));
});
describe('fonts',()=>{
it('quotes named families and keeps generic ones',()=>expect(fontStack('Inter Display, Arial,sans-serif')).toBe('"Inter Display", "Arial", sans-serif'));
it('builds a CSS font shorthand',()=>expect(cssFont({fontFamily:'Brand',fontWeight:'bold',fontStyle:'italic'},32)).toBe('italic bold 32px "Brand"'));
it('declares font assets and text options',()=>{const c=parseComposition({version:'1.0',id:'f',name:'F',width:10,height:10,fps:30,durationFrames:30,assets:[{id:'brand',type:'font',src:'./Brand-Bold.woff2',family:'Brand',weight:700}],scenes:[{id:'s',name:'S',startFrame:0,durationFrames:30,layers:[{id:'t',type:'text',content:'x',fontFamily:'Brand',maxWidth:300,maxLines:2,minFontSize:24}]}]});expect(c.assets[0]).toMatchObject({family:'Brand',weight:700});expect(c.scenes[0]!.layers[0]).toMatchObject({fontWeight:400,fontStyle:'normal',letterSpacing:0,maxWidth:300,maxLines:2,minFontSize:24});});
});
