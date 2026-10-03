import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../shiftstack-billing.js', import.meta.url), 'utf8');
const product = 'shiftstack_premium';
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); };
function app({origin = 'https://shiftshack-preview.vercel.app', configured = true, purchaseError, verifyError, owned = false} = {}) {
  const nodes = {}, calls = [], completed = [], panel = {style:{}}, button = {};
  let purchased = owned;
  const document = {
    hidden:false,
    getElementById:id => nodes[id],
    querySelector:selector => selector === '.premium-btn' ? button : panel,
    addEventListener(){},
    createElement:() => ({setAttribute(){},style:{},showModal(){this.open=true;}}),
    body:{appendChild(dialog){
      nodes[dialog.id] = dialog;
      for(const id of ['ssSubscribe','ssRestore','ssRetry','ssPrice','ssStatus']) nodes[id] = {};
    }}
  };
  const window = {location:{origin},dispatchEvent(){},getDigitalGoodsService:async()=>({
    listPurchases:async()=>purchased ? [{itemId:product,purchaseToken:'test-token'}] : [],
    getDetails:async()=>[{itemId:product,price:{currency:'USD',value:'4.99'},subscriptionPeriod:'P1M'}]
  })};
  class PaymentRequest {
    async show(){
      if(purchaseError) throw purchaseError;
      purchased=true;
      return {details:{purchaseToken:'test-token'},complete:async status=>completed.push(status)};
    }
  }
  window.PaymentRequest=PaymentRequest;
  vm.runInNewContext(source, {window,document,PaymentRequest,Intl,navigator:{language:'en-US'},
    CustomEvent:class {},AbortSignal,setTimeout:()=>1,clearTimeout(){},setInterval(){},
    fetch:async(url,options)=>{
      calls.push({url,options});
      if(options.method === 'POST' && verifyError) throw verifyError;
      return {ok:true,json:async()=>options.method === 'GET' ? {ready:configured,productId:product}
        : {active:true,productId:product,expiresAt:Date.now()+3600000}};
    }
  });
  return {window,nodes,calls,completed,panel};
}
test('checkout uses the current deployment and unlocks only after verification',async()=>{
  const a=app();a.window.showPremium();await settle();
  assert.equal(a.nodes.ssSubscribe.disabled,false);
  assert.match(a.nodes.ssPrice.textContent,/4\.99/);
  await a.nodes.ssSubscribe.onclick();
  assert.ok(a.calls.every(call=>call.url === '/api/shiftstack-billing'));
  assert.equal(a.panel.hidden,false);
  assert.deepEqual(a.completed,['success']);
});
test('GitHub Pages uses the production verifier and restores an existing subscription',async()=>{
  const a=app({origin:'https://jesseperez00181978-tech.github.io',owned:true});
  a.window.showPremium();await settle();await a.nodes.ssRestore.onclick();
  assert.ok(a.calls.every(call=>call.url === 'https://shiftshack.vercel.app/api/shiftstack-billing'));
  assert.equal(a.panel.hidden,false);
  assert.match(a.nodes.ssStatus.textContent,/Premium restored/);
});
test('unconfigured backend disables checkout',async()=>{
  const a=app({configured:false});a.window.showPremium();await settle();
  assert.equal(a.nodes.ssSubscribe.disabled,true);
  assert.equal(a.panel.hidden,true);
});
test('canceled checkout keeps tools locked',async()=>{
  const a=app({purchaseError:Object.assign(new Error('aborted'),{name:'AbortError'})});
  a.window.showPremium();await settle();await a.nodes.ssSubscribe.onclick();
  assert.equal(a.nodes.ssStatus.textContent,'Checkout canceled.');
  assert.equal(a.panel.hidden,true);
  assert.ok(a.calls.every(call=>call.options.method !== 'POST'));
});
test('verification timeout directs a paid customer to restore, not another checkout',async()=>{
  const a=app({verifyError:Object.assign(new Error('timeout'),{name:'TimeoutError'})});
  a.window.showPremium();await settle();await a.nodes.ssSubscribe.onclick();
  assert.match(a.nodes.ssStatus.textContent,/Use Restore purchases before trying again/);
  assert.equal(a.panel.hidden,true);
  assert.deepEqual(a.completed,['unknown']);
});
