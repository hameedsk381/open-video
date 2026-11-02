import { describe,it,expect } from 'vitest'; import { parseComposition } from '@ove/schema'; import { evaluateFrame, videoFrameIndex } from '@ove/timeline'; import { toDrawOperations, flattenOperations, flattenLayers, collectImageSources } from '@ove/graphics';
const layer=(o:Partial<{trimStart:number;playbackRate:number;loop:boolean}>={})=>({trimStart:0,playbackRate:1,loop:false,...o});
describe('videoFrameIndex',()=>{
it('maps layer frames one to one by default',()=>expect([0,1,59].map(f=>videoFrameIndex(layer(),f,100))).toEqual([0,1,59]));
it('skips trimStart frames of the source',()=>expect(videoFrameIndex(layer({trimStart:30}),0,100)).toBe(30));
it('scales by playbackRate, holding frames when slowed',()=>{expect([0,1,2,3].map(f=>videoFrameIndex(layer({playbackRate:2}),f,100))).toEqual([0,2,4,6]);expect([0,1,2,3].map(f=>videoFrameIndex(layer({playbackRate:.5}),f,100))).toEqual([0,0,1,1]);});
it('holds the last frame past the end unless looping',()=>{expect(videoFrameIndex(layer(),150,100)).toBe(99);expect(videoFrameIndex(layer({loop:true}),150,100)).toBe(50);expect(videoFrameIndex(layer({loop:true,trimStart:90}),15,100)).toBe(5);});
it('rejects a video with no frames',()=>expect(()=>videoFrameIndex(layer(),0,0)).toThrow());
});
const comp=parseComposition({version:'1.0',id:'v',name:'V',width:640,height:360,fps:30,durationFrames:90,assets:[{id:'clip',type:'video',src:'./clip.mp4'}],scenes:[{id:'s',name:'S',startFrame:0,durationFrames:90,layers:[{id:'bg',type:'video',src:'clip',width:640,height:360},{id:'g',type:'group',startFrame:30,children:[{id:'pip',type:'video',src:'clip',startFrame:10,width:160,height:90,trimStart:15,playbackRate:2,loop:true},{id:'logo',type:'image',src:'./logo.png'}]}]}]});
describe('video layers',()=>{
it('fills in defaults',()=>{const v=comp.scenes[0]!.layers[0];expect([v.objectFit,v.trimStart,v.playbackRate,v.loop]).toEqual(['cover',0,1,false]);});
it('rejects a negative trimStart',()=>expect(()=>parseComposition({...comp,scenes:[{...comp.scenes[0],layers:[{id:'x',type:'video',src:'clip',trimStart:-1}]}]})).toThrow());
it('finds video layers inside groups but not as image sources',()=>{expect(flattenLayers(comp.scenes[0]!.layers).filter(l=>l.type==='video').map(l=>l.id)).toEqual(['bg','pip']);expect(collectImageSources(comp.scenes[0]!.layers)).toEqual(['./logo.png']);});
it('times nested video from its own start',()=>{const pip=flattenOperations(toDrawOperations(evaluateFrame(comp,45))).find(op=>op.layer.id==='pip')!;expect(pip.kind).toBe('video');const own=pip.layer.localFrame-pip.layer.startFrame;expect(own).toBe(5);expect(videoFrameIndex(pip.layer as any,own,100)).toBe(25);});
});
