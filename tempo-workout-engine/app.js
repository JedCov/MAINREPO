'use strict';
let seconds=0,totalSeconds=0,paused=false,segmentEndTime=0;
let timerWorker=null,lastAnnouncedSecond=null;

function setupWorker(){
 const blob=new Blob([`let f=null;self.onmessage=e=>{if(e.data==='start'){if(f)clearInterval(f);f=setInterval(()=>self.postMessage('t'),250);}if(e.data==='stop'){if(f)clearInterval(f);f=null;}};`],{type:'application/javascript'});
 timerWorker=new Worker(URL.createObjectURL(blob));
 timerWorker.onmessage=()=>{if(!paused)syncTimer();};
}

function setTimer(s){
 if(timerWorker)timerWorker.postMessage('stop');
 paused=false;lastAnnouncedSecond=null;
 seconds=s;totalSeconds=s;
 segmentEndTime=Date.now()+(s*1000);
 if(timerWorker)timerWorker.postMessage('start');
}

function syncTimer(){
 const now=Date.now();
 seconds=Math.max(0,Math.ceil((segmentEndTime-now)/1000));
 document.getElementById('workoutView').textContent=seconds;
 if(seconds<=3&&seconds>0&&seconds!==lastAnnouncedSecond){
   lastAnnouncedSecond=seconds;
   console.log('beep');
 }
 if(seconds<=0){console.log('done');}
}

document.addEventListener('DOMContentLoaded',()=>{
 setupWorker();
 document.getElementById('mainStartBtn').addEventListener('click',()=>setTimer(10));
});
