const fs = require('node:fs');
const crypto = require('node:crypto');
const {createRequire} = require('node:module');
const root = process.env.BENCH_WORKTREE || '/home/liend/.codex/worktrees/xboss-upgrade-ux-performance/xboss';
const {chromium, devices} = createRequire(root + '/package.json')('playwright');
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:3000';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseURL)) throw Error('Only loopback test server allowed');
const storageState = process.env.BENCH_AUTH_FILE || root + '/playwright/.auth/admin.json';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const data = { stages: [{id:920001,name:'Công tác đầu kiểm chứng',sortOrder:1,active:true,durationDays:3},{id:920002,name:'Công tác sau kiểm chứng',sortOrder:2,active:true,durationDays:4}], fronts:[920101,920102].map((id,i)=>({id,floorLabel:'T1',stageId:920001+i,receivedAt:'2026-10-24',handedOverAt:null,plannedReceivedAt:'2026-10-23',plannedHandedOverAt:'2026-10-27',note:'Ghi chú đã lưu',outgoingSupplierId:77,incomingSupplierId:88,transitionStageId:920002,outgoingRepName:'Đại diện A',incomingRepName:'Đại diện B',updatedAt:'2026-10-24T00:00:00Z'})) };
const suppliers = {suppliers:[{id:77,name:'Nhà thầu A'},{id:88,name:'Nhà thầu B'}]};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PW_EXECUTABLE_PATH?{executablePath:process.env.PW_EXECUTABLE_PATH}:{})});
 const rows=[];
 try {
  for(const [profile,device] of [['desktop',devices['Desktop Chrome']],['mobile',devices['Pixel 5']]]) {
   for(let pair=0;pair<5;pair++) for(const delayMs of (pair%2?[3000,0]:[0,3000])) {
    const context=await browser.newContext({...device,baseURL,storageState,serviceWorkers:'block'});
    const page=await context.newPage();
    const errors=[]; const requests={};
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/api/')) requests[path]=(requests[path]||0)+1;});
    await page.route('**/api/**',r=>['GET','HEAD','OPTIONS'].includes(r.request().method())?r.continue():r.fulfill({status:403,json:{error:'No benchmark mutations'}}));
    await page.route('**/api/floor-stage-fronts?floor=T1',r=>r.fulfill({json:data}));
    await page.route('**/api/suppliers',async r=>{await new Promise(resolve=>setTimeout(resolve,delayMs));await r.fulfill({json:suppliers}).catch(()=>{});});
    await page.route(/\/api\/floor-stage-fronts\/\d+\/documents$/,r=>r.fulfill({json:{documents:[]}}));
    await page.addInitScript(()=>{
     const timing=window.__floorBench={primaryResponseAt:null,readyAt:null,primaryStatus:null};
     const original=window.fetch;
     window.fetch=async(...args)=>{const response=await original(...args);const target=new URL(typeof args[0]==='string'?args[0]:args[0] instanceof Request?args[0].url:args[0].toString(),location.href);if(target.pathname==='/api/floor-stage-fronts'&&target.searchParams.get('floor')==='T1'){timing.primaryResponseAt=performance.now();timing.primaryStatus=response.status;}return response;};
     const observer=new MutationObserver(()=>{const heading=Array.from(document.querySelectorAll('h2')).find(h=>h.textContent==='1. Công tác đầu kiểm chứng');if(heading&&heading.getClientRects().length){timing.readyAt=performance.now();observer.disconnect();}});
     observer.observe(document,{childList:true,subtree:true});
    });
    try {
     await page.goto('/work-fronts/T1',{waitUntil:'domcontentloaded'});
     await page.waitForFunction(()=>Number.isFinite(window.__floorBench?.readyAt)&&Number.isFinite(window.__floorBench?.primaryResponseAt),{},{timeout:20000});
     const timing=await page.evaluate(()=>window.__floorBench);
     if(timing.primaryStatus!==200||errors.length) throw Error(JSON.stringify({timing,errors}));
     rows.push({profile,viewport:device.viewport,pair,delayMs,...timing,waitAfterPrimaryMs:timing.readyAt-timing.primaryResponseAt,requests,errors});
    } finally {await context.close();}
   }
  }
  process.stdout.write(JSON.stringify({scope:'Synthetic primary/suppliers/documents fixtures; real disposable-test auth; first card DOM only, not CWV',label:process.env.BENCH_LABEL||'unspecified',sourceCommit:process.env.BENCH_SOURCE_SHA||null,node:process.versions.node,browser:browser.version(),scriptSha256:sha(fs.readFileSync(__filename)),pageSourceSha256:sha(fs.readFileSync(root+'/app/work-fronts/[floor]/page.tsx')),primaryFixtureSha256:sha(JSON.stringify(data)),supplierFixtureSha256:sha(JSON.stringify(suppliers)),rows},null,2)+'\n');
 } finally {await browser.close();}
})().catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
