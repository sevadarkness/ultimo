const NetSniffer = {
  phones: new Set(),
  init() {
    chrome.webRequest.onBeforeRequest.addListener(
      det => this.req(det),
      {urls:["*://web.whatsapp.com/*","*://*.whatsapp.net/*"]},
      ["requestBody"]
    );
    chrome.webRequest.onCompleted.addListener(
      det => this.resp(det),
      {urls:["*://web.whatsapp.com/*","*://*.whatsapp.net/*"]}
    );
  },
  req(det) {
    try {
      if (det.requestBody) {
        if (det.requestBody.formData) Object.values(det.requestBody.formData).forEach(vals => vals.forEach(v => this.detect(v)));
        if (det.requestBody.raw) det.requestBody.raw.forEach(d=>{
          if(d.bytes){
            let t = new TextDecoder().decode(new Uint8Array(d.bytes));
            this.detect(t);
          }
        });
      }
      this.detect(det.url);
    }catch{}
  },
  resp(det) {
    if (this.phones.size) {
      chrome.tabs.query({active:true,currentWindow:true},tabs=>{
        if(tabs[0]){
          chrome.tabs.sendMessage(tabs[0].id,{type:'netPhones',phones:Array.from(this.phones)})
            .catch(err => {
              console.log('[NetSniffer] Não foi possível enviar phones para content script:', err.message);
            });
        }
      });
    }
  },
  detect(t) {
    if (!t) return;
    for (let m of t.matchAll(/(\d{10,15})@c\.us/g)) this.phones.add(m[1]);
    for (let m of t.matchAll(/\b\d{10,15}\b/g)) this.phones.add(m[0]);
  }
};
NetSniffer.init();

chrome.runtime.onMessage.addListener((msg,_,resp)=>{
  if(msg.action==='exportData'){
    chrome.tabs.query({active:true,currentWindow:true},async tabs=>{
      if(!tabs[0]){
        resp({success:false, error:'No active tab found'});
        return;
      }
      try{
        const res = await chrome.scripting.executeScript({
          target:{tabId:tabs[0].id},
          function:()=>({
            numbers: Array.from(window.HarvesterStore?._phones?.keys()||[]),
            valid: Array.from(window.HarvesterStore?._valid||[]),
            meta: window.HarvesterStore?._meta||{}
          })
        });
        resp({success:true, data: res[0].result});
      }catch(e){
        resp({success:false, error:e.message});
      }
    });
    return true;
  }
  if(msg.action==='clearData'){
    chrome.tabs.query({active:true,currentWindow:true},async tabs=>{
      if(!tabs[0]){
        resp({success:false, error:'No active tab found'});
        return;
      }
      try{
        await chrome.scripting.executeScript({
          target:{tabId:tabs[0].id},
          function:()=>{
            if(window.HarvesterStore){
              window.HarvesterStore._phones.clear();
              window.HarvesterStore._valid.clear();
              window.HarvesterStore._meta = {};
              localStorage.removeItem('wa_extracted_numbers');
            }
          }
        });
        resp({success:true});
      }catch(e){
        resp({success:false, error:e.message});
      }
    });
    return true;
  }
});
