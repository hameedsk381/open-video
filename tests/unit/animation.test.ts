import { describe,it,expect } from 'vitest'; import { ease, easingNames, cubicBezier, mixColors, parseColor, evaluateAnimation } from '@ove/animation'; import { parseComposition, easingSchema } from '@ove/schema'; import { evaluateFrame, transitionState } from '@ove/timeline'; import { toDrawOperations, flattenOperations } from '@ove/graphics';
describe('easing',()=>{
it('every curve starts at 0 and ends at 1',()=>{for(const k of easingNames){expect(ease(0,k)).toBe(0);expect(ease(1,k)).toBe(1);}});
it('back and spring overshoot, hold waits for the next keyframe',()=>{expect(ease(.5,'easeOutBack')).toBeGreaterThan(1);expect(Math.max(...[.2,.3,.4].map(t=>ease(t,'spring')))).toBeGreaterThan(1.05);expect(ease(.99,'hold')).toBe(0);});
it('shapes the role curves for their jobs',()=>{expect(ease(.2,'snap')).toBeGreaterThan(ease(.2,'land'));expect(ease(.2,'land')).toBeGreaterThan(ease(.2,'glide'));expect(ease(.2,'glide')).toBeGreaterThan(ease(.2,'easeOutCubic'));expect(ease(.5,'pop')).toBeGreaterThan(1);expect(ease(.3,'exit')).toBeLessThan(.1);expect(ease(.5,'move')).toBeCloseTo(.5,2);expect(ease(.1,'move')).toBeLessThan(.05);expect(ease(.5,'drift')).toBeCloseTo(.5,2);expect(ease(.5,'easeOutExpo')).toBeCloseTo(1-Math.pow(2,-5),6);expect(ease(.5,'easeInOutQuart')).toBeCloseTo(.5,6);});
it('matches CSS cubic-bezier values',()=>{expect(cubicBezier(.25,.1,.25,1,.5)).toBeCloseTo(.8024,3);expect(ease(.3,[0,0,1,1])).toBeCloseTo(.3,5);});
it('schema and engine agree on easing names',()=>{for(const k of easingNames)expect(easingSchema.safeParse(k).success).toBe(true);expect(easingSchema.safeParse('bounce').success).toBe(false);expect(easingSchema.safeParse([.4,0,.2,1]).success).toBe(true);expect(easingSchema.safeParse([1.5,0,.2,1]).success).toBe(false);});
});
describe('colours',()=>{
it('parses every accepted form',()=>{expect(parseColor('#abc')).toEqual([170,187,204,1]);expect(parseColor('#11223380')[3]).toBeCloseTo(.502,3);expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10,20,30,.5]);expect(parseColor('transparent')).toEqual([0,0,0,0]);expect(()=>parseColor('red')).toThrow();});
it('mixes channels and alpha',()=>{expect(mixColors('#ff0000','#0000ff',.5)).toBe('rgba(128,0,128,1)');expect(mixColors('transparent','#ffffff',.25)).toBe('rgba(64,64,64,0.25)');});
it('animates fill between keyframes with the arriving easing',()=>{const a={property:'fill',keyframes:[{frame:0,value:'#000000'},{frame:10,value:'#ffffff',easing:'hold'}]} as any;expect(evaluateAnimation(a,5)).toBe('rgba(0,0,0,1)');expect(evaluateAnimation(a,10)).toBe('#ffffff');});
});
const comp=(scenes:any[],extra:any={})=>parseComposition({version:'1.0',id:'t',name:'T',width:200,height:100,fps:30,durationFrames:60,scenes,...extra});
const scene=(id:string,start:number,dur:number,layers:any[],t:any={})=>({id,name:id,startFrame:start,durationFrames:dur,layers,...t});
describe('schema',()=>{
it('requires colour values for fill/color and numbers elsewhere',()=>{expect(()=>comp([scene('s',0,60,[{id:'r',type:'rect',width:5,height:5,animations:[{property:'fill',keyframes:[{frame:0,value:1}]}]}])])).toThrow(/colour values/);expect(()=>comp([scene('s',0,60,[{id:'r',type:'rect',width:5,height:5,animations:[{property:'x',keyframes:[{frame:0,value:'#fff'}]}]}])])).toThrow(/numbers/);});
});
describe('origins and animated values in draw operations',()=>{
it('resolves center per layer type and applies animated width, radius and fill',()=>{const ops=flattenOperations(toDrawOperations(evaluateFrame(comp([scene('s',0,60,[{id:'r',type:'rect',width:100,height:40,originX:'center',originY:'center',animations:[{property:'width',keyframes:[{frame:0,value:100},{frame:10,value:200}]},{property:'radius',keyframes:[{frame:0,value:0},{frame:10,value:20}]},{property:'fill',keyframes:[{frame:0,value:'#000000'},{frame:10,value:'#ffffff'}]}]},{id:'c',type:'circle',width:50,originX:'center'},{id:'t',type:'text',content:'x',fontSize:40,lineHeight:1.5,maxWidth:300,originX:'center',originY:'center'},{id:'n',type:'rect',width:5,height:5,originX:7}])]),10)));const by=(id:string)=>ops.find(o=>o.layer.id===id)!.layer as any;
  expect(by('r')).toMatchObject({width:200,radius:20,fill:'#ffffff',originX:100,originY:20});expect(by('c').originX).toBe(0);expect(by('t')).toMatchObject({originX:150,originY:30});expect(by('n')).toMatchObject({originX:7,originY:0});});
});
describe('transitions',()=>{
it('computes each effect from progress',()=>{const t=(type:string,direction='left')=>({type,durationFrames:10,direction,easing:'linear'}) as any;
  expect(transitionState([{transition:t('fade'),progress:.25}],200,100)).toMatchObject({opacity:.25,x:0,scale:1,clip:undefined});
  expect(transitionState([{transition:t('slide','right'),progress:.25}],200,100)).toMatchObject({x:150,y:0,opacity:1});
  expect(transitionState([{transition:t('slide','top'),progress:.5}],200,100)).toMatchObject({y:-50});
  expect(transitionState([{transition:t('wipe','right'),progress:.25}],200,100).clip).toEqual({x:150,y:0,width:50,height:100});
  expect(transitionState([{transition:t('zoom'),progress:0}],200,100)).toMatchObject({opacity:0,scale:.85});});
it('wraps a scene only while a transition runs, with in and out',()=>{const c=comp([scene('a',0,60,[{id:'bg',type:'rect',width:200,height:100}],{transitionIn:{type:'slide',durationFrames:10,easing:'linear'},transitionOut:{type:'fade',durationFrames:20,easing:'linear'}})]);const top=(f:number)=>evaluateFrame(c,f)[0]!;
  expect(top(5)).toMatchObject({id:'scene:a',type:'group',x:-100,originX:100,originY:50});expect(top(20).id).toBe('bg');expect(top(50)).toMatchObject({id:'scene:a',opacity:.5});expect(top(59).opacity).toBeCloseTo(.05,5);});
it('crossfades overlapping scenes: later scene on top, opacities summing to one',()=>{const c=comp([scene('a',0,40,[{id:'a-top',type:'rect',width:5,height:5,zIndex:9}],{transitionOut:{type:'fade',durationFrames:10,easing:'linear'}}),scene('b',30,30,[{id:'b-bg',type:'rect',width:5,height:5,zIndex:0}],{transitionIn:{type:'fade',durationFrames:10,easing:'linear'}})]);const at=evaluateFrame(c,34);
  expect(at.map(l=>l.id)).toEqual(['scene:a','scene:b']);expect(at[0]!.opacity+at[1]!.opacity).toBeCloseTo(1,10);expect(evaluateFrame(c,45).map(l=>l.id)).toEqual(['b-bg']);});
});
