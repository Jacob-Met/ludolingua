#!/usr/bin/env python3
"""Independent fixed-clue oracle authored by the retained verifier; no engine imports."""
import json
from itertools import permutations
from math import factorial
roles = ('bread','raisin','ivy','daffodil','topaz','emerald')
def checks(order):
    assert len(order) == 6 and set(order) == set(roles)
    p = {role:i for i,role in enumerate(order)}
    return (p['raisin']==p['bread']+1, p['daffodil']==p['ivy']+1, p['emerald']==p['topaz']+1, p['raisin']<p['ivy'], p['daffodil']<p['topaz'])
orders = list(permutations(roles))
assert len(orders) == factorial(6) == 720
solutions = [o for o in orders if all(checks(o))]
assert solutions == [roles]
negatives = (
 ('raisin','bread','ivy','daffodil','topaz','emerald'),
 ('bread','raisin','daffodil','ivy','topaz','emerald'),
 ('bread','raisin','ivy','daffodil','emerald','topaz'),
 ('ivy','daffodil','bread','raisin','topaz','emerald'),
 ('bread','raisin','topaz','emerald','ivy','daffodil'),
)
for i,order in enumerate(negatives):
    assert checks(order) == tuple(j != i for j in range(5))
labels = {
 'en-source':('Bread','Raisin','Ivy','Daffodil','Golden topaz','Emerald'),
 'es-literal':('Pan','Pasa','Hiedra','Narciso','Topacio dorado','Esmeralda'),
 'es-repaired':('Pan','Uva pasa','Enredadera de hiedra','Narciso','Topacio dorado','Esmeralda'),
 'es-meaning-control':('Pan','Uva fresca','Enredadera de hiedra','Narciso','Topacio dorado','Esmeralda')
}
expected = {'en-source':'BRIDGE','es-literal':'PPHNTE','es-repaired':'PUENTE','es-meaning-control':'PUENTE'}
for name,words in labels.items():
    by_role = dict(zip(roles,words))
    assert ''.join(by_role[r][0].upper() for r in solutions[0]) == expected[name]
assert [i for i,(x,y) in enumerate(zip(labels['es-repaired'],labels['es-meaning-control'])) if x!=y] == [1]
print(json.dumps({'orders_checked':720,'solution_count':1,'solution':list(solutions[0]),'extractions':expected,'single_clue_negative_cases':5}))
