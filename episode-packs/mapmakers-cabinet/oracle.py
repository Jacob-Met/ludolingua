#!/usr/bin/env python3
"""Independent Mapmaker's Cabinet export oracle; no production-engine imports."""
import itertools
import json
import sys
import unicodedata
from collections import Counter
from pathlib import Path

IDS=tuple(f"slot-{c}" for c in "abcdefg")
DISPLAY=tuple(f"slot-{c}" for c in "dafcgbe")
CLUES={"order-ab":("before","slot-a","slot-b"),"order-bc":("after","slot-c","slot-b"),"order-cd":("immediately_before","slot-c","slot-d"),"order-de":("after","slot-e","slot-d"),"order-ef":("before","slot-e","slot-f"),"order-fg":("immediately_before","slot-f","slot-g")}
CASES=[
 ("01-en-source.json",["Candle","Oak","Mirror","Pear","Apple","Star","Shell"],"COMPASS","COMPASS"),
 ("02-es-literal-contrast.json",["Vela","Roble","Espejo","Pera","Manzana","Estrella","Concha"],"VREPMEC","BRÚJULA"),
 ("03-es-adapted.json",["Botella","Reloj","Útil náutico","Jarra","Uva","Libro","Ancla"],"BRÚJULA","BRÚJULA")]
SCOPE="All permutations of these frozen labels under first-code-point NFC-uppercase extraction; multiset mismatch proves the target impossible, independently of clues."
def check(condition,message):
 if not condition:raise AssertionError(message)
def nfc(s):return unicodedata.normalize("NFC",s)
def initial(label):return nfc(label.strip())[0].upper()
def answer(s):return nfc(s).strip().upper()
def holds(order,clues):
 positions={identity:index for index,identity in enumerate(order)}
 for kind,left,right in clues:
  a,b=positions[left],positions[right]
  if kind=="before":passed=a<b
  elif kind=="after":passed=a>b
  elif kind=="immediately_before":passed=a+1==b
  else:raise AssertionError("Unknown clue kind "+kind)
  if not passed:return False
 return True
def invert(clue):
 kind,left,right=clue
 return ("after",right,left) if kind=="before" else ("before",right,left) if kind=="after" else clue
def token(order,labels):return "".join(initial(labels[x]) for x in order)
def frozen_witness(labels,expected):
 available=[initial(labels[x]) for x in DISPLAY];required=list(answer(expected))
 counts=Counter(available);missing=[]
 for c in required:
  if counts[c]:counts[c]-=1
  else:missing.append(c)
 return None if Counter(available)==Counter(required) else {"available":available,"required":required,"missing":missing,"scope":SCOPE}
def main():
 root=Path(sys.argv[1] if len(sys.argv)>1 else "exports/episodes")
 permutations=list(itertools.permutations(IDS));check(len(permutations)==5040,"Enumeration")
 receipts=[]
 for filename,expected_labels,expected_token,expected_action in CASES:
  wrapper=json.loads((root/filename).read_text(encoding="utf-8"))
  episode,validation=wrapper["episode"],wrapper["validation"];result=validation["result"]
  check(episode["schema"]=="ludolingua.episode.v1","Episode schema")
  check(validation["engineVersion"]=="0.1.0","Wrapper engine version")
  sha=validation["episodeSha256"];check(isinstance(sha,str) and len(sha)==64 and all(c in "0123456789abcdef" for c in sha),"Digest format")
  cards=episode["cards"];check(len(cards)==7,"Card count")
  check(tuple(c["id"] for c in cards)==DISPLAY,"Display order")
  labels={c["id"]:c["label"] for c in cards};check(set(labels)==set(IDS),"Stable identities")
  check([labels[x] for x in IDS]==expected_labels,"Labels")
  check(episode["extraction"]=={"kind":"first_letter","normalization":"NFC-uppercase"},"Extraction")
  check(episode["action"]=={"expected":expected_action,"answerNormalization":"NFC-trim-uppercase"},"Action")
  check(episode["constraints"]=={"labelsFrozen":True,"requireUnique":True},"Constraints")
  raw=episode["clues"];check(len(raw)==6,"Clue count")
  actual={c["id"]:(c["kind"],c["left"],c["right"]) for c in raw};check(actual==CLUES,"Exact clues")
  clues=list(actual.values());orders=[o for o in permutations if holds(o,clues)]
  check(orders==[IDS],"Unique complete order")
  check({o for o in permutations if holds(o,[invert(c) for c in clues])}==set(orders),"Equivalent relations")
  check({o for o in permutations if holds(o,list(reversed(clues)))}==set(orders),"Clue order invariance")
  check(not holds(DISPLAY,clues),"Unsolved initial display")
  extracted=token(IDS,labels);check(extracted==expected_token,"Token")
  solutions=[{"order":list(o),"token":token(o,labels),"actionMatches":answer(token(o,labels))==answer(expected_action)} for o in orders]
  match_count=sum(s["actionMatches"] for s in solutions);mechanical=len(orders)==1 and match_count==1
  witness=frozen_witness(labels,expected_action)
  expected={"schema":"ludolingua.analysis.v1","engineVersion":"0.1.0","valid":True,"errors":[],"permutationCount":5040,"clueOrderCount":len(orders),"actionMatchCount":match_count,"uniqueReasoning":len(orders)==1,"mechanicalSuccess":mechanical,"outcome":"verified" if mechanical else "action-mismatch","solutions":solutions,"frozenWitness":witness}
  for k,v in expected.items():check(result[k]==v,filename+": result."+k)
  check(isinstance(result["limitations"],list) and all(isinstance(x,str) for x in result["limitations"]),"Limitations")
  if filename=="02-es-literal-contrast.json":
   check(not mechanical and extracted!=expected_action,"Literal failure")
   check(witness["available"]==list("PVEECRM") and witness["required"]==list("BRÚJULA") and witness["missing"]==list("BÚJULA"),"Literal multiset witness")
  else:check(witness is None,"Unexpected witness")
  if filename=="01-en-source.json":source_labels,source_clues=labels,clues
  receipts.append({"file":filename,"permutations":5040,"solutions":len(orders),"token":extracted,"action":expected_action,"mechanicalSuccess":mechanical,"exportResultMatches":True})
 swapped=IDS[:5]+(IDS[6],IDS[5])
 check(token(swapped,source_labels)=="COMPASS" and not holds(swapped,source_clues),"Same token, wrong order")
 positives=["BRÚJULA","brújula","  brújula  ","BRU\u0301JULA","bru\u0301jula"]
 negatives=["BRUJULA","BRÙJULA","BRÚ JULA","BRÚJULA!","VREPMEC","COMPASS"]
 for value in positives:check(answer(value)=="BRÚJULA","Expected acceptance "+repr(value))
 for value in negatives:check(answer(value)!="BRÚJULA","Expected rejection "+repr(value))
 check(initial(" Útil náutico ")=="Ú" and initial(" U\u0301til náutico ")=="Ú" and initial("Uva")=="U","Initial normalization")
 print(json.dumps({"oracle":"mapmakers-cabinet-independent-v2","status":"pass","cases":receipts,"sourceSameTokenWrongOrderRejected":True,"clueEquivalence":True,"normalizationExpectedBehaviorChecks":11,"productionCheckAttemptTested":False,"episodeDigestRecomputed":False},ensure_ascii=False,separators=(",",":")))
if __name__=="__main__":main()
