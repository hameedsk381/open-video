import { describe,it,expect } from 'vitest'; import { mkdtemp, writeFile, rm } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { parseComposition } from '@ove/schema'; import { audioWindows, evaluateFrame } from '@ove/timeline'; import { toDrawOperations } from '@ove/graphics'; import { audioMixArgs } from '@ove/ffmpeg'; import { planAudio } from '../../packages/core/src/audio';
const comp=(layers:any[],extra:any={})=>parseComposition({version:'1.0',id:'a',name:'A',width:100,height:100,fps:30,durationFrames:300,assets:[{id:'music',type:'audio',src:'./music.wav'},{id:'clip',type:'video',src:'./clip.mp4'}],scenes:[{id:'s1',name:'S1',startFrame:0,durationFrames:150,layers},{id:'s2',name:'S2',startFrame:150,durationFrames:150,layers:[{id:'late',type:'audio',src:'music',startFrame:30,endFrame:400}]}],...extra});
const ids=(c:any)=>audioWindows(c).map(w=>[w.layer.id,w.startFrame,w.endFrame]);
describe('audioWindows',()=>{
it('places layers in absolute frames, clipped by scene, group and endFrame',()=>expect(ids(comp([{id:'vo',type:'audio',src:'music',startFrame:10,endFrame:40},{id:'g',type:'group',startFrame:100,endFrame:130,children:[{id:'sfx',type:'audio',src:'music',startFrame:5}]}]))).toEqual([['vo',10,40],['sfx',105,130],['late',180,300]]));
it('includes unmuted video layers and skips muted, silent or hidden ones',()=>expect(ids(comp([{id:'v1',type:'video',src:'clip'},{id:'v2',type:'video',src:'clip',muted:true},{id:'a0',type:'audio',src:'music',volume:0},{id:'hidden',type:'audio',src:'music',visible:false}])).map(x=>x[0])).toEqual(['v1','late']));
it('keeps audio layers out of the draw list',()=>expect(toDrawOperations(evaluateFrame(comp([{id:'vo',type:'audio',src:'music'},{id:'box',type:'rect',width:10,height:10}]),5)).map(o=>o.layer.id)).toEqual(['box']));
});
describe('audioMixArgs',()=>{
it('returns nothing without clips',()=>{expect(audioMixArgs(undefined)).toEqual([]);expect(audioMixArgs({clips:[],durationSeconds:1})).toEqual([]);});
it('builds a trimmed, timed, faded chain per clip and sums them unnormalised',()=>{const args=audioMixArgs({durationSeconds:10,clips:[{source:'a.wav',start:0,duration:10,loop:true},{source:'b.wav',start:2,duration:3,trim:1,rate:.25,volume:.5,fadeIn:1,fadeOut:5}]});
  expect(args.slice(0,6)).toEqual(['-stream_loop','-1','-i','a.wav','-i','b.wav']);const graph=args[args.indexOf('-filter_complex')+1]!;
  expect(graph).toContain('[2:a]atrim=start=1.000000,asetpts=PTS-STARTPTS,atempo=0.5,atempo=0.5,atrim=duration=3.000000');
  expect(graph).toContain('volume=0.5,afade=t=in:d=1.000000,afade=t=out:st=0.000000:d=3.000000,adelay=delays=96000S:all=1[a1]');
  expect(graph).toContain('[a0][a1]amix=inputs=2:duration=longest:normalize=0,apad=whole_dur=10.000000,atrim=start=0.000000:duration=10.000000,asetpts=PTS-STARTPTS[aout]');expect(args).toEqual(expect.arrayContaining(['-map','0:v','[aout]']));});
});
describe('planAudio',()=>{
it('converts frames to seconds, puts the soundtrack first and skips videos without sound',async()=>{const dir=await mkdtemp(join(tmpdir(),'ove-audio-'));try{for(const f of ['music.wav','clip.mp4','quiet.mp4'])await writeFile(join(dir,f),'');
  const c=comp([{id:'v',type:'video',src:'clip',startFrame:30,trimStart:15,volume:.8},{id:'q',type:'video',src:'./quiet.mp4'},{id:'vo',type:'audio',src:'music',fadeInFrames:15,playbackRate:1.5}],{export:{audio:'music'}});
  const mix=(await planAudio(c,dir,async s=>!s.endsWith('quiet.mp4')))!;expect(mix.durationSeconds).toBe(10);
  expect(mix.clips.map(c=>[c.source.slice(dir.length+1),c.start,c.duration,c.trim,c.rate,c.loop,c.volume,c.fadeIn])).toEqual([['music.wav',0,10,undefined,undefined,true,1,undefined],['clip.mp4',1,4,.5,1,false,.8,undefined],['music.wav',0,5,0,1.5,false,1,.5],['music.wav',6,4,0,1,false,1,0]]);
}finally{await rm(dir,{recursive:true,force:true})}});
it('reports a missing source and returns undefined when there is no sound',async()=>{await expect(planAudio(comp([{id:'vo',type:'audio',src:'./nope.wav'}]),tmpdir(),async()=>true)).rejects.toThrow(/not found/);const silent=parseComposition({version:'1.0',id:'s',name:'S',width:10,height:10,fps:30,durationFrames:30,scenes:[{id:'s',name:'S',startFrame:0,durationFrames:30,layers:[]}]});expect(await planAudio(silent,tmpdir())).toBeUndefined();});
});
