(() => {
  const data=window.PORTFOLIO_DATA || {metrics:{metrics:[]},works:{works:[]},approvedParagraphs:[]};
  const metricGrid=document.querySelector('#metric-grid');
  data.metrics.metrics.forEach(m=>{
    const el=document.createElement('article'); el.className='metric-card'+(m.value===null?' waiting':'');
    el.innerHTML=`<span class="date">${m.label}</span><strong>${m.display ?? m.value ?? '확인 대기'}</strong><small>출처: ${m.source}</small><small>${m.note || ''}</small>`;
    metricGrid.appendChild(el);
  });
  const records=document.querySelector('#approved-records');
  data.approvedParagraphs.forEach(r=>{
    const row=document.createElement('div'); row.className='record-row';
    row.innerHTML=`<span>${r.date}</span><b>${r.ability}</b><p>${r.text} <small>근거: ${r.source}</small></p>`;
    records.appendChild(row);
  });
  const works=document.querySelector('#works-grid');
  data.works.works.forEach(w=>{
    const card=document.createElement('article'); card.className='work-card '+(w.status==='planned'?'planned':'');
    const facts=w.facts.map(x=>`<li>${x}</li>`).join('');
    const action=w.href?`<a class="button primary status" href="${w.href}" target="_blank" rel="noreferrer">논문 열기</a>`:`<span class="button status" aria-disabled="true">${w.status==='planned'?'과제 13 완료 후 연결':'공개 링크 확인 후 연결'}</span>`;
    card.innerHTML=`<span class="tag">${w.kind}</span><h3>${w.title}</h3><p>${w.subtitle}</p><ul>${facts}</ul>${action}`;
    works.appendChild(card);
  });
})();
