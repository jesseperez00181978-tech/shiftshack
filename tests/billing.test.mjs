import test from 'node:test';
import assert from 'node:assert/strict';
import handler, {entitlement} from '../api/shiftstack-billing.mjs';
const now = Date.now(), product = 'shiftstack_premium';
const data = state => ({subscriptionState:state,lineItems:[{productId:product,expiryTime:new Date(now+60000).toISOString()}]});
test('active, grace period and canceled-but-paid subscriptions remain entitled',()=>{
 for(const state of ['ACTIVE','IN_GRACE_PERIOD','CANCELED']) assert.equal(entitlement(data('SUBSCRIPTION_STATE_'+state),product,now).active,true);
});
test('pending, expired, on-hold and wrong products do not unlock',()=>{
 for(const state of ['PENDING','EXPIRED','ON_HOLD','PAUSED']) assert.equal(entitlement(data('SUBSCRIPTION_STATE_'+state),product,now).active,false);
 assert.equal(entitlement(data('SUBSCRIPTION_STATE_ACTIVE'),'other',now).active,false);
 assert.equal(entitlement(data('SUBSCRIPTION_STATE_ACTIVE'),product,now+120000).active,false);
});
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(d){this.body=d;return this},end(){return this}}}
test('missing server credentials disable checkout and verification',async()=>{
 const previous=process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON; delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
 try { let r=res();await handler({method:'GET',headers:{}},r);assert.equal(r.body.ready,false);
 r=res();await handler({method:'POST',headers:{},body:{purchaseToken:'test'}},r);assert.equal(r.code,503);
 } finally {if(previous!==undefined)process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=previous;}
});
test('untrusted origins are rejected',async()=>{const r=res();await handler({method:'GET',headers:{origin:'https://untrusted.example'}},r);assert.equal(r.code,403)});
test('only the current deployment preview origin is allowed',async()=>{
 const previous=process.env.VERCEL_URL;
 process.env.VERCEL_URL='shiftshack-preview.vercel.app';
 try {
  let r=res();await handler({method:'GET',headers:{origin:'https://shiftshack-preview.vercel.app'}},r);assert.equal(r.code,200);
  r=res();await handler({method:'GET',headers:{origin:'https://unrelated.vercel.app'}},r);assert.equal(r.code,403);
 } finally {if(previous===undefined)delete process.env.VERCEL_URL;else process.env.VERCEL_URL=previous;}
});
test('valid purchases are acknowledged server-side before success; pending purchases are not',async()=>{
 const {generateKeyPairSync}=await import('node:crypto');
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const previous=process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, originalFetch=global.fetch;
 process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:'billing@example.test',private_key:privateKey.export({type:'pkcs8',format:'pem'})});
 let state='SUBSCRIPTION_STATE_ACTIVE', acknowledged=0;
 global.fetch=async(url,options)=>{
 if(String(url).includes('oauth2'))return new Response(JSON.stringify({access_token:'test',expires_in:3600}));
 if(String(url).endsWith(':acknowledge')){assert.equal(options.method,'POST');acknowledged++;return new Response('{}');}
 return new Response(JSON.stringify({...data(state),acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING'}));
 };
 try {
 let r=res();await handler({method:'POST',headers:{},body:{productId:product,purchaseToken:'test'}},r);assert.equal(r.code,200);assert.equal(r.body.active,true);assert.equal(acknowledged,1);
 state='SUBSCRIPTION_STATE_PENDING';r=res();await handler({method:'POST',headers:{},body:{productId:product,purchaseToken:'test'}},r);assert.equal(r.body.active,false);assert.equal(acknowledged,1);
 } finally {global.fetch=originalFetch;if(previous===undefined)delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;else process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=previous;}
});
