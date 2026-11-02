import { describe,it,expect } from 'vitest'; import { renderFrames } from '@ove/renderer';
const fake=(concurrency:number,failAt?:number)=>{let active=0,peak=0;return {concurrency,get peak(){return peak},async renderFrame(frame:number){active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,Math.random()*8));active--;if(frame===failAt)throw new Error(`frame ${frame} failed`);return Buffer.from(String(frame));}};};
const collect=async(r:any,from:number,to:number)=>{const out:string[]=[];for await(const b of renderFrames(r,from,to))out.push(b.toString());return out;};
describe('renderFrames',()=>{
it('yields frames in order despite out-of-order completion',async()=>{const r=fake(4);expect(await collect(r,0,40)).toEqual(Array.from({length:40},(_,i)=>String(i)));});
it('requests at most lookahead frames ahead of the consumer',async()=>{const r=fake(3);await collect(r,0,30);expect(r.peak).toBe(12);const s=fake(3);const out:string[]=[];for await(const b of renderFrames(s,0,30,{lookahead:5}))out.push(b.toString());expect(s.peak).toBe(5);expect(out).toHaveLength(30);});
it('honours the frame range',async()=>expect(await collect(fake(2),5,9)).toEqual(['5','6','7','8']));
it('surfaces a failed frame and stops',async()=>{await expect(collect(fake(4,7),0,40)).rejects.toThrow('frame 7 failed');});
});
