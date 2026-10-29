import { summarizePlaytestCohort, MAX_COHORT_FILES, MAX_RECORD_BYTES, MAX_COHORT_BYTES } from '../lib/playtest-cohort.mjs';

// Reviewing downloaded records has no access to the current authored episode.
export function setupPlaytestCohort({ t, diagnostic }) {
  const button=document.getElementById('review-playtest-cohort');
  const input=document.getElementById('playtest-cohort-files');
  const status=document.getElementById('playtest-cohort-status');
  const result=document.getElementById('playtest-cohort-result');
  let sequence=0, acceptedReport=null, busy=false;
  let state={kind:'idle',key:'Choose downloaded play records to review together.',values:{}};
  function node(tag,text,cls) {
    const element=document.createElement(tag);
    if(text!==undefined) element.textContent=text;
    if(cls) element.className=cls;
    return element;
  }
  function renderStatus() {
    status.dataset.state=state.kind;
    status.setAttribute('aria-busy',String(busy));
    status.classList.toggle('error',state.kind==='error');
    const values={...state.values};
    if(values.message!==undefined) values.message=diagnostic(values.message);
    status.textContent=t(state.key,values);
    result.setAttribute('aria-busy',String(busy));
  }
  function metrics(entries,values,attribute) {
    const list=node('dl',undefined,'playtest-cohort-metrics');
    for(const [key,label] of entries) {
      const item=node('div',undefined,'metric');
      const value=node('dd',String(values[key]));value.setAttribute(attribute,key);
      item.append(node('dt',t(label)),value);list.append(item);
    }
    return list;
  }
  function renderReport() {
    result.replaceChildren();
    result.hidden=!acceptedReport;
    result.dataset.retained=String(Boolean(acceptedReport && (busy||state.kind==='error')));
    if(!acceptedReport) return;
    if(busy||state.kind==='error') {
      result.append(node('p',t(busy
        ? 'Previous verified report shown while the new selection is checked.'
        : 'Previous verified report retained. The rejected selection is not included.'),'notice'));
    }
    result.append(node('h4',t('Recorded sessions by exact episode revision')));
    result.append(metrics([
      ['verifiedFiles','Verified input files'],['uniqueSessions','Distinct recorded session IDs'],
      ['duplicateFiles','Repeated downloads excluded'],['supersededSnapshots','Earlier snapshots replaced']
    ],acceptedReport.inputs,'data-cohort-input'));
    result.append(node('p',t('Each content hash is a separate group, even when episode IDs and revision numbers match. These records do not change the episode you are editing.'),'small'));
    const groups=node('div',undefined,'playtest-cohort-groups');
    for(const group of acceptedReport.episodes) {
      const article=node('article',undefined,'playtest-cohort-group');
      article.dataset.episodeSha256=group.episode.sha256;
      const title=node('h5',group.episode.title);title.lang=group.episode.locale;
      article.append(title,node('p',t('Episode {id} · revision {revision} · content language {locale}',{
        id:group.episode.id,revision:group.episode.revision,locale:group.episode.locale.toUpperCase()
      }),'small'),node('p',t('Episode SHA-256 {hash}',{hash:group.episode.sha256}),'digest'));
      article.append(metrics([
        ['sessions','Recorded sessions'],['sessionsWithSuccess','Sessions with a matching attempt'],
        ['sessionsWithHints','Sessions with recorded hints'],['sessionsWithReveal','Sessions with a recorded reveal'],
        ['attempts','Recorded attempts'],['successfulAttempts','Attempts matching clues and action'],
        ['moves','Recorded moves'],['hintsShown','Hints shown, including repeats'],['resets','Resets']
      ],group.recorded,'data-cohort-metric'));
      groups.append(article);
    }
    result.append(groups,node('h5',t('What these totals establish')));
    const limitations=node('ul',undefined,'playtest-cohort-limitations');
    for(const limitation of acceptedReport.limitations) limitations.append(node('li',t(limitation)));
    result.append(limitations);
  }
  function render() {renderStatus();renderReport();}
  button.addEventListener('click',()=>input.click());
  input.addEventListener('change',async()=>{
    const files=Array.from(input.files??[]);
    if(files.length===0) return;
    const current=++sequence;
    busy=true;state={kind:'loading',key:'Checking {count} selected play records…',values:{count:files.length}};render();
    try {
      // Inspect the entire selection before reading any contents.
      if(files.length>MAX_COHORT_FILES) throw new Error('Select no more than 100 play records.');
      let totalBytes=0;
      for(const file of files) {
        if(file.size>MAX_RECORD_BYTES) throw new Error('A selected play record exceeds the 20 MB limit.');
        totalBytes+=file.size;
      }
      if(totalBytes>MAX_COHORT_BYTES) throw new Error('The selected play records exceed the 40 MB combined limit.');
      const records=[];
      for(const file of files) {
        records.push(await file.text());
        if(current!==sequence) return;
      }
      const report=await summarizePlaytestCohort(records);
      if(current!==sequence) return;
      acceptedReport=report;
      state={kind:'ready',key:'Verified files: {files} · recorded sessions: {sessions} · exact episode revisions: {episodes}.',
        values:{files:report.inputs.verifiedFiles,sessions:report.inputs.uniqueSessions,episodes:report.episodes.length}};
    } catch(error) {
      if(current!==sequence) return;
      state={kind:'error',key:'Cannot review this selection: {message}',values:{message:error.message}};
    } finally {
      if(current===sequence) {busy=false;input.value='';render();}
    }
  });
  render();
  return {relocalize:render};
}
