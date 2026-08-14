const p = new URLSearchParams(location.search);
    const code = p.get('speciesCode') || '';
    const common = p.get('commonName') || 'Bird Profile';
    const scientific = p.get('scientificName') || '';
    document.getElementById('commonName').textContent = common;
    document.getElementById('scientificName').textContent = scientific;
    document.title = common + ' | BirdIntelAI v3.1';
    
    const esc = (value='') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    function renderSources(sources){
      const list = document.getElementById('sourceList');
      list.innerHTML = '';
      (sources || []).forEach(source => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = source.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = source.name;
        li.appendChild(a);
        list.appendChild(li);
      });
      document.getElementById('sourcesBlock').hidden = !(sources || []).length;
    }

    let photoIndex = 0;
    let photoTotal = 0;
    let photoLoading = false;
    const failedPhotoIndexes = new Set();

    function renderPhoto(image){
      const photoStatus = document.getElementById('photoStatus');
      const img = document.getElementById('birdPhoto');
      const button = document.getElementById('showAnotherPhoto');
      const creditNode = document.getElementById('photoCredit');

      img.onerror = null;

      if(image && image.url){
        img.alt = common;
        img.hidden = true;
        photoStatus.hidden = false;
        photoStatus.textContent = 'Loading selected bird photo…';

        img.onload = () => {
          img.hidden = false;
          photoStatus.hidden = true;
        };

        img.onerror = () => {
          failedPhotoIndexes.add(photoIndex);
          img.hidden = true;
          creditNode.innerHTML = '';

          if(photoTotal > failedPhotoIndexes.size){
            let next = (photoIndex + 1) % photoTotal;
            while(failedPhotoIndexes.has(next) && next !== photoIndex){
              next = (next + 1) % photoTotal;
            }
            setTimeout(() => loadPhoto(next), 0);
          }else{
            button.hidden = true;
            photoStatus.hidden = false;
            photoStatus.textContent = 'No suitable photo available.';
          }
        };

        img.src = image.url;

        const bits = [];
        if(image.artist) bits.push('Photo: ' + esc(image.artist));
        if(image.license) bits.push(esc(image.license));
        let credit = bits.join(' · ');
        if(image.descriptionUrl) credit += (credit ? ' · ' : '') + '<a target="_blank" rel="noopener" href="' + esc(image.descriptionUrl) + '">Wikimedia Commons source</a>';
        creditNode.innerHTML = credit;
        button.hidden = photoTotal < 2;
      }else{
        img.hidden = true;
        img.onload = null;
        button.hidden = true;
        creditNode.innerHTML = '';
        photoStatus.hidden = false;
        photoStatus.textContent = 'No suitable photo available.';
      }
    }

    async function loadPhoto(index=0){
      if(photoLoading) return;
      photoLoading = true;
      const photoStatus = document.getElementById('photoStatus');
      const button = document.getElementById('showAnotherPhoto');
      try{
        button.disabled = true;
        if(index !== 0) photoStatus.hidden = true;
        const qs = new URLSearchParams({speciesCode:code, commonName:common, scientificName:scientific, index:String(index)});
        const response = await fetch('/api/species-profile/photo?' + qs.toString());
        const data = await response.json();
        if(!response.ok || !data.ok) throw new Error(data.error || 'Photo could not be loaded.');
        photoIndex = Number(data.index || 0);
        photoTotal = Number(data.total || 0);
        renderPhoto(data.image);
      }catch(error){
        photoStatus.hidden = false;
        photoStatus.textContent = 'Image unavailable. Please try again.';
      }finally{
        photoLoading = false;
        button.disabled = false;
      }
    }

    document.getElementById('showAnotherPhoto').addEventListener('click', () => {
      if(photoTotal < 2) return;
      let next = (photoIndex + 1) % photoTotal;
      let checks = 0;
      while(failedPhotoIndexes.has(next) && checks < photoTotal){
        next = (next + 1) % photoTotal;
        checks += 1;
      }
      if(checks < photoTotal) loadPhoto(next);
    });

    function loadProfile(){
      // Photo and bird information are separate modules.
      loadPhoto();
    }
    loadProfile();

    const birdChat = document.getElementById('birdChat');
    const birdChatMessages = document.getElementById('birdChatMessages');
    const birdChatInput = document.getElementById('birdChatInput');
    const sendBirdChat = document.getElementById('sendBirdChat');
    const birdHistory = [];
    document.getElementById('birdChatHello').textContent = `Ask me anything about ${common}.`;
    document.getElementById('toggleBirdChat').addEventListener('click', () => {
      birdChat.hidden = !birdChat.hidden;
      if(!birdChat.hidden) birdChatInput.focus();
    });
    function birdMessage(role, text){
      const row=document.createElement('div'); row.className='bird-msg '+role;
      if(role==='assistant'){const img=document.createElement('img');img.src='/wkh-logo.png';img.alt='WKH';row.appendChild(img);}
      const bubble=document.createElement('div');bubble.textContent=text;row.appendChild(bubble);birdChatMessages.appendChild(row);birdChatMessages.scrollTop=birdChatMessages.scrollHeight;return row;
    }
    function isVideoRequest(text){
      return /\b(video|videos|youtube|you tube|watch|footage|clip|clips)\b/i.test(String(text||''));
    }
    function offerFullAsk(){
      const row=document.createElement('div'); row.className='bird-msg assistant';
      const img=document.createElement('img'); img.src='/wkh-logo.png'; img.alt='WKH'; row.appendChild(img);
      const bubble=document.createElement('div');
      const message=document.createElement('div');
      message.textContent=`For videos and richer media, the full WKH Ask is the better place to continue. Would you like to open WKH Ask for ${common}?`;
      const actions=document.createElement('div'); actions.style.marginTop='10px'; actions.style.display='flex'; actions.style.gap='8px'; actions.style.flexWrap='wrap';
      const yes=document.createElement('button'); yes.type='button'; yes.textContent='Yes, open WKH Ask'; yes.className='primary-button';
      const no=document.createElement('button'); no.type='button'; no.textContent='No, stay here';
      yes.addEventListener('click',()=>{ window.open('https://ask.wildlifeknowledgehub.com/','_blank','noopener'); });
      no.addEventListener('click',()=>{ actions.remove(); message.textContent=`No problem. What else would you like to know about ${common}?`; birdChatInput.focus(); });
      actions.append(yes,no); bubble.append(message,actions); row.appendChild(bubble); birdChatMessages.appendChild(row); birdChatMessages.scrollTop=birdChatMessages.scrollHeight;
    }
    async function askBird(){
      const question=birdChatInput.value.trim(); if(!question)return; birdChatInput.value=''; birdMessage('user',question);
      if(isVideoRequest(question)){ offerFullAsk(); return; }
      const loading=birdMessage('assistant','WKH Ask is preparing an answer…'); sendBirdChat.disabled=true;
      try{
        const response=await fetch('/api/ask-bird',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,bird:{speciesCode:code,commonName:common,scientificName:scientific},history:birdHistory.slice(-6)})});
        const data=await response.json(); if(!response.ok||!data.ok)throw new Error(data.error||'WKH Ask could not answer.'); loading.remove(); birdMessage('assistant',data.answer);
        birdHistory.push({role:'user',content:question},{role:'assistant',content:data.answer}); if(birdHistory.length>6)birdHistory.splice(0,birdHistory.length-6);
      }catch(error){loading.remove();birdMessage('assistant',error.message);}finally{sendBirdChat.disabled=false;birdChatInput.focus();}
    }
    sendBirdChat.addEventListener('click',askBird);
    birdChatInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();askBird();}});

// Firmware 10.0_1: Bird Profile layout only. Search page files remain untouched.
(() => {
  const headerInner = document.querySelector('.product-header-inner');
  const titleBlock = headerInner?.querySelector('.page-title-block');
  const main = document.querySelector('.species-shell');
  const card = main?.querySelector('.card');
  const owl = headerInner?.querySelector('.owl-sketch');
  const productTitle = headerInner?.querySelector('.product-title-image');

  if (titleBlock && card) {
    main.insertBefore(titleBlock, card);
  }

  const style = document.createElement('style');
  style.textContent = `
    .product-header-inner{
      display:flex !important;
      flex-direction:column !important;
      align-items:center !important;
    }
    .product-header-inner .product-title-image{
      display:block !important;
      width:min(760px,76vw) !important;
      height:56px !important;
      object-fit:cover !important;
      object-position:center !important;
      margin:0 auto !important;
    }
    .product-header-inner .owl-sketch{
      display:block !important;
      width:min(520px,52vw) !important;
      height:auto !important;
      max-height:62px !important;
      object-fit:contain !important;
      object-position:center !important;
      margin:-2px auto 4px !important;
      opacity:.72 !important;
    }
    .species-shell > .page-title-block{
      text-align:left !important;
      margin:0 0 8px 0 !important;
      padding:0 !important;
    }
    .species-shell > .page-title-block .page-title{
      margin:0 !important;
    }
    @media(max-width:640px){
      .product-header-inner .product-title-image{width:88vw !important;height:46px !important;}
      .product-header-inner .owl-sketch{width:62vw !important;max-height:50px !important;}
    }
  `;
  document.head.appendChild(style);
})();

// Firmware 11.6: deterministic return to the exact Bird Intel result snapshot.
(() => {
  const backButton = document.querySelector('.profile-back-button');
  if (!backButton) return;

  const returnId = new URLSearchParams(window.location.search).get('returnId');
  const target = returnId ? `/?returnId=${encodeURIComponent(returnId)}` : '/';

  backButton.href = target;

  backButton.addEventListener('click', (event) => {
    event.preventDefault();

    // Replace the Bird Profile history entry so repeated Back actions cannot
    // walk through previously viewed cached Bird Profiles.
    window.location.replace(target);
  });
})();
