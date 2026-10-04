var du=Object.defineProperty;var fu=(s,t,e)=>t in s?du(s,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):s[t]=e;var R=(s,t,e)=>fu(s,typeof t!="symbol"?t+"":t,e);function Aa(s,t,e,n,i){let r=s.cardFlip,a=e/s.mentalityMax,o=i>0?n/i:0,l=r.mentalityWeight+r.hpWeight,c=l>0?(r.mentalityWeight*a+r.hpWeight*o)/l:0,[h,u]=t.frontChance,d=h+(u-h)*Math.max(0,Math.min(1,c));return Math.max(r.chanceFloor,Math.min(r.chanceCeiling,d))}function bs(s,t){if(s?.type===t)return s}function Pi(s,t){return s.effect?.always?s.effect.always:t==="win"?s.effect?.onWin:s.effect?.onLose}var Ii=class{constructor(t,e){this.catalog=t;this.rng=e}effectiveMentality(t){let e=t.hasStatus("confusion")?this.catalog.rules.confusionPenalty:0;return Math.max(0,t.mentality-e)}frontChance(t,e){return Aa(this.catalog.rules,e,this.effectiveMentality(t),t.hp,t.base.maxHp)}effectiveDefLevel(t){if(!t.hasStatus("defenseDown"))return t.base.defLevel;let e=this.catalog.status("defenseDown").effect.defenseMultiplier??1;return Math.floor(t.base.defLevel*e)}levelDiffBonus(t,e){let n=this.catalog.rules.levelDiffStep;return t<=e+n?0:Math.floor((t-e)/n)}flipCard(t,e){let n=this.frontChance(t,e),i=this.rng.next()<n?"front":"back";return{face:i,power:i==="front"?e.frontPower:e.backPower,chance:n}}calculateDamage(t,e,n){let i=this.levelDiffBonus(t.base.atkLevel,this.effectiveDefLevel(e)),r=n+i,a=this.catalog.status("poison").effect;return t.hasStatus("poison")&&a.outgoingDamagePercent!==void 0&&(r*=1+a.outgoingDamagePercent/100),e.hasStatus("poison")&&a.incomingDamagePercent!==void 0&&(r*=1+a.incomingDamagePercent/100),{damage:Math.max(0,Math.floor(r)),levelBonus:i}}resolve(t,e,n,i){let r=[],a=this.catalog.skill(e),o=this.catalog.skill(i);r.push({type:"clashStart",attackerId:t.id,defenderId:n.id,attackerSkillId:e,defenderSkillId:i});let l=0,c=null;for(;;){let h=this.flipCard(t,a),u=this.flipCard(n,o);if(this.pushFlip(t,a,h,r),this.pushFlip(n,o,u,r),h.power===u.power){if(l+=1,r.push({type:"deadlock",attackerId:t.id,defenderId:n.id,count:l}),l>=this.catalog.rules.deadlockLimit){r.push({type:"deadlockLimit",attackerId:t.id,defenderId:n.id}),this.changeMentality(t,this.catalog.rules.mentalityOnDeadlock,"deadlock",r),this.changeMentality(n,this.catalog.rules.mentalityOnDeadlock,"deadlock",r);break}continue}let d=h.power>u.power,p=d?t:n,g=d?n:t,y=d?h:u,m=d?u:h,f=this.calculateDamage(p,g,y.power);r.push({type:"damageCalculated",combatantId:p.id,damage:f.damage,power:y.power,levelBonus:f.levelBonus}),r.push({type:"clashRoundWin",winnerId:p.id,loserId:g.id,winnerDamage:y.power,loserDamage:m.power}),this.changeMentality(p,this.catalog.rules.mentalityOnClashWin,"clashWin",r),this.changeMentality(g,this.catalog.rules.mentalityOnClashLose,"clashLose",r),c={winner:p,loser:g,winnerSkill:d?a:o,loserSkill:d?o:a,damage:f.damage};break}return c&&(this.applyOutcome(c,r),this.applyClashEndEffects(c,r),this.grantAttribute(c.winner,c.winnerSkill,r)),this.checkConfusion(t,r),this.checkConfusion(n,r),r.push({type:"clashEnd",attackerId:t.id,defenderId:n.id,winnerId:c?.winner.id??null}),r}applyTurnStartStatuses(t,e){this.tickBleed(t,e)}resolveOneSided(t,e,n){let i=[],r=this.catalog.skill(e),a=this.catalog.rules;i.push({type:"oneSidedStart",attackerId:t.id,targetId:n.id,skillId:e});let o=this.flipCard(t,r);this.pushFlip(t,r,o,i);let l=this.calculateDamage(t,n,o.power);i.push({type:"damageCalculated",combatantId:t.id,damage:l.damage,power:o.power,levelBonus:l.levelBonus}),a.oneSidedGivesMentality&&this.changeMentality(t,a.mentalityOnClashWin,"clashWin",i);let c={winner:t,loser:n,winnerSkill:r,loserSkill:null,damage:l.damage};return this.applyOutcome(c,i),this.applyClashEndEffect(t,n,r,"win",i),this.grantAttribute(t,r,i),this.checkConfusion(t,i),this.checkConfusion(n,i),i.push({type:"oneSidedEnd",attackerId:t.id,targetId:n.id}),i}tickBleed(t,e){let n=t.stackCount("bleed");if(n===0)return;let i=this.catalog.status("bleed").effect.hpPercentDamage??0,r=Math.floor(t.base.maxHp*i/100)*n;if(r<=0)return;let a=t.takeDamage(r);e.push({type:"statusTicked",combatantId:t.id,status:"bleed",damage:a}),this.checkDefeat(t,e)}applyOutcome(t,e){let{loser:n,winnerSkill:i,loserSkill:r}=t,a=t.damage,o=bs(Pi(i,"win"),"damageModifier");o?.target==="self"&&(a+=o.amount);let l=r&&bs(Pi(r,"lose"),"damageModifier");if(l&&l.target==="opponent"&&(a+=l.amount),r&&bs(Pi(r,"lose"),"nullifyDamage")&&(e.push({type:"damageNullified",combatantId:n.id,skillId:r.id}),a=0),a=Math.max(0,Math.floor(a)),a>0){let u=n.takeDamage(a);e.push({type:"damageApplied",combatantId:n.id,damage:u,hp:n.hp})}let c=bs(Pi(i,"win"),"execute");if(c&&!n.isDefeated){let u=n.base.maxHp*c.hpThresholdPercent/100;n.hp<u&&(n.takeDamage(n.hp),e.push({type:"executed",combatantId:n.id}))}let h=r&&bs(Pi(r,"lose"),"mentality");if(h){let u=Math.round(n.mentality*h.percentOfCurrent/100);this.changeMentality(n,u,"skill",e)}this.checkDefeat(n,e)}applyClashEndEffects(t,e){this.applyClashEndEffect(t.winner,t.loser,t.winnerSkill,"win",e),t.loserSkill&&this.applyClashEndEffect(t.loser,t.winner,t.loserSkill,"lose",e)}applyClashEndEffect(t,e,n,i,r){if(n.effect?.timing!=="onClashEnd")return;let a=Pi(n,i);if(a&&a.type==="applyStatus"){let o=a.target==="self"?t:e;this.applyStatus(o,a.status,a.turns,r)}}grantAttribute(t,e,n){if(!e.attribute)return;let i=t.gainAttribute(e.attribute);n.push({type:"attributeGained",combatantId:t.id,attribute:e.attribute,value:i})}applyStatus(t,e,n,i){let r=this.catalog.status(e);t.applyStatus(e,n,r.stackable),i.push({type:"statusApplied",combatantId:t.id,status:e,turns:n})}checkConfusion(t,e){t.isDefeated||t.mentality>=this.catalog.rules.confusionThreshold||t.hasStatus("confusion")||this.applyStatus(t,"confusion",this.catalog.status("confusion").defaultTurns,e)}pushFlip(t,e,n,i){i.push({type:"cardFlipped",combatantId:t.id,skillId:e.id,face:n.face,power:n.power,chance:n.chance})}changeMentality(t,e,n,i){let r=t.changeMentality(e,this.catalog.rules);r!==0&&i.push({type:"mentalityChanged",combatantId:t.id,delta:r,mentality:t.mentality,reason:n})}checkDefeat(t,e){t.isDefeated&&(e.some(n=>n.type==="defeated"&&n.combatantId===t.id)||e.push({type:"defeated",combatantId:t.id}))}};function pu(s){if(s.deck.length===0)throw new Error(`\uC801 ${s.id} \uC758 \uB371\uC774 \uBE44\uC5B4 \uC788\uB2E4`);return s.deck}function mu(s,t){let e=pu(s),n=e.filter(i=>!t.skill(i).tbd);return n.length>0?n:e}function gu(s,t){if(t.length===0)throw new Error(`\uC801 ${s.id} \uC758 \uACE0\uB97C \uCE74\uB4DC \uD6C4\uBCF4\uAC00 \uBE44\uC5B4 \uC788\uB2E4`);return t}function yu(s,t){if(t.length===0)throw new Error(`\uC801 ${s.id} \uAC00 \uACA8\uB20C \uB300\uC0C1\uC774 \uC5C6\uB2E4`);return t}function xl(s,t,e){let n=s[s.length-1],i=t.reduce((a,o)=>a+o,0);if(i<=0)return s[Math.floor(e.next()*s.length)]??n;let r=e.next()*i;for(let a=0;a<s.length;a+=1)if(r-=t[a]??0,r<0)return s[a]??n;return n}function vu(s){return s.archetype==="\uC720\uD2F8"}var Li=class{chooseTarget(t,e,n,i){let r=yu(t,e),a=i.catalog.enemyAi,o=r.map(l=>{let c=l.hp/l.base.maxHp,h=1+a.aiTargetLowHpBias*(1-c);return n.has(l.id)&&(h*=a.aiTargetDuplicatePenalty),h});return xl(r,o,i.rng).id}chooseSkill(t,e,n){let i=e.candidates?gu(t,e.candidates):mu(t,n.catalog),r=n.catalog.enemyAi,a=this.guardWeight(t,e,n),o=n.resolver.effectiveMentality(t)<=r.mentalityDangerThreshold,l=i.map(c=>{let h=n.catalog.skill(c),u=vu(h)?a:1;return o&&(u*=r.mentalityDangerArchetypeWeight[h.archetype]),this.isRedundantStatus(h,e.target,n)&&(u*=r.redundantStatusPenalty),u});return xl(i,l,n.rng)}guardWeight(t,e,n){let i=n.catalog.enemyAi;if(!e.isClash)return 0;let r=this.estimateThreat(t,e,n),a=0;for(let o of i.aiGuardThreatThresholds)r>=o&&(a+=1);return i.aiGuardWeights[a]??0}estimateThreat(t,e,n){if(t.hp<=0)return 0;let{catalog:i}=n,r=e.target,a=l=>{let c=Aa(i.rules,l,r.mentality,r.hp,r.base.maxHp);return c*l.frontPower+(1-c)*l.backPower};return e.opponentSkillId!==null?a(i.skill(e.opponentSkillId))/t.hp:r.deck.length===0?0:r.deck.reduce((l,c)=>l+a(i.skill(c)),0)/r.deck.length/t.hp}isRedundantStatus(t,e,n){let i=t.effect?.onWin;return i?.type!=="applyStatus"||i.target!=="opponent"||n.catalog.status(i.status).stackable?!1:e.hasStatus(i.status)}};var Ys=class{constructor(t,e,n,i){this.id=t;this.side=e;this.base=n;R(this,"hp");R(this,"mentality");R(this,"statuses",[]);R(this,"freshStatuses",new Set);R(this,"attributes",{attack:0,defense:0,support:0});R(this,"ultimatePending",!1);R(this,"deck");this.hp=n.maxHp,this.mentality=n.mentality,this.deck=[...i]}gainAttribute(t){return this.attributes[t]+=1,this.attributes[t]}get attributeTotal(){return this.attributes.attack+this.attributes.defense+this.attributes.support}resetAttributes(){this.attributes.attack=0,this.attributes.defense=0,this.attributes.support=0}addCard(t){return this.deck.includes(t)?!1:(this.deck.push(t),!0)}removeCard(t){let e=this.deck.indexOf(t);return e<0?!1:(this.deck.splice(e,1),!0)}get isDefeated(){return this.hp<=0}hasStatus(t){return this.statuses.some(e=>e.id===t)}stackCount(t){return this.statuses.filter(e=>e.id===t).length}beginTurn(){this.freshStatuses.clear()}applyStatus(t,e,n){let i=n?void 0:this.statuses.find(a=>a.id===t);if(i){e>=i.turns&&(i.turns=e,this.freshStatuses.add(i));return}let r={id:t,turns:e};this.statuses.push(r),this.freshStatuses.add(r)}expireStatuses(){let t=[];for(let e=this.statuses.length-1;e>=0;e-=1){let n=this.statuses[e];!n||this.freshStatuses.has(n)||(n.turns-=1,n.turns<=0&&(t.push(n.id),this.statuses.splice(e,1)))}return t.reverse()}takeDamage(t){let e=Math.max(0,Math.min(t,this.hp));return this.hp-=e,e}changeMentality(t,e){let n=this.mentality;return this.mentality=Math.max(0,Math.min(e.mentalityMax,n+t)),this.mentality-n}};var ee=class extends Error{constructor(t){super(`battle-data: ${t}`),this.name="BattleDataError"}};function He(s,t){if(typeof s!="object"||s===null||Array.isArray(s))throw new ee(`${t} \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4`);return s}function Tt(s,t,e){let n=s[t];if(typeof n!="number"||!Number.isFinite(n))throw new ee(`${e}.${t} \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);return n}function An(s,t,e){let n=s[t];if(typeof n!="string")throw new ee(`${e}.${t} \uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return n}function bn(s,t,e,n){let i=An(s,t,n);if(!e.includes(i))throw new ee(`${n}.${t} \uAC00 \uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC740 \uAC12\uC774\uB2E4: ${i}`);return i}function xu(s,t,e){let n=s[t];if(typeof n!="boolean")throw new ee(`${e}.${t} \uAC00 \uCC38/\uAC70\uC9D3\uC774 \uC544\uB2C8\uB2E4`);return n}function Js(s,t,e){return Zs(s,t,e).map((n,i)=>{if(typeof n!="number"||!Number.isFinite(n))throw new ee(`${e}.${t}[${i}] \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);return n})}function Zs(s,t,e){let n=s[t];if(!Array.isArray(n))throw new ee(`${e}.${t} \uAC00 \uBC30\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return n}var bl=["bleed","confusion","poison","defenseDown"],_l=["\uC548\uC815","\uD45C\uC900","\uB3C4\uBC15","\uC720\uD2F8"],bu=["attack","defense","support"],_u=["S1","S2","S3","ULT"],Su=["onDamage","beforeDamage","beforeDamageCalc","onTakeDamage","onClashEnd"];function Ca(s,t){let e=He(s,t),n=An(e,"type",t);switch(n){case"execute":return{type:n,hpThresholdPercent:Tt(e,"hpThresholdPercent",t)};case"mentality":return{type:n,percentOfCurrent:Tt(e,"percentOfCurrent",t)};case"applyStatus":return{type:n,target:bn(e,"target",["self","opponent"],t),status:bn(e,"status",bl,t),turns:Tt(e,"turns",t)};case"damageModifier":return{type:n,target:bn(e,"target",["self","opponent"],t),amount:Tt(e,"amount",t)};case"nullifyDamage":return{type:n};default:throw new ee(`${t}.type \uC744 \uC54C \uC218 \uC5C6\uB2E4: ${n}`)}}function Mu(s,t){let e=He(s,t),n={timing:bn(e,"timing",Su,t)};return e.onWin!==void 0&&(n.onWin=Ca(e.onWin,`${t}.onWin`)),e.onLose!==void 0&&(n.onLose=Ca(e.onLose,`${t}.onLose`)),e.always!==void 0&&(n.always=Ca(e.always,`${t}.always`)),n}function wu(s){let t=He(s,"rules"),e=He(t.cardFlip,"rules.cardFlip");return{cardFlip:{mentalityWeight:Tt(e,"mentalityWeight","rules.cardFlip"),hpWeight:Tt(e,"hpWeight","rules.cardFlip"),chanceFloor:Tt(e,"chanceFloor","rules.cardFlip"),chanceCeiling:Tt(e,"chanceCeiling","rules.cardFlip")},mentalityMax:Tt(t,"mentalityMax","rules"),mentalityOnClashWin:Tt(t,"mentalityOnClashWin","rules"),mentalityOnClashLose:Tt(t,"mentalityOnClashLose","rules"),mentalityOnDeadlock:Tt(t,"mentalityOnDeadlock","rules"),mentalityRegenPerTurn:Tt(t,"mentalityRegenPerTurn","rules"),mentalityRegenCap:Tt(t,"mentalityRegenCap","rules"),confusionThreshold:Tt(t,"confusionThreshold","rules"),confusionPenalty:Tt(t,"confusionPenalty","rules"),levelDiffStep:Tt(t,"levelDiffStep","rules"),deadlockLimit:Tt(t,"deadlockLimit","rules"),oneSidedGivesMentality:xu(t,"oneSidedGivesMentality","rules"),ultimateThreshold:Tt(t,"ultimateThreshold","rules"),ultimateSkillId:Tt(t,"ultimateSkillId","rules"),actionPoints:Eu(t.actionPoints)}}function Eu(s){let t="rules.actionPoints",e=He(s,t),n={start:Tt(e,"start",t),max:Tt(e,"max",t),regenPerTurn:Tt(e,"regenPerTurn",t),floor:Tt(e,"floor",t)};if(n.start>n.max||n.floor>0)throw new ee(`${t} \uB294 \uC2DC\uC791 \u2264 \uCD5C\uB300, \uBE5A \uD55C\uB3C4 \u2264 0 \uC774\uC5B4\uC57C \uD55C\uB2E4`);return n}function Tu(s){let t=He(s,"enemyAi"),e=He(t.mentalityDangerArchetypeWeight,"enemyAi.mentalityDangerArchetypeWeight"),n={};for(let a of _l)n[a]=Tt(e,a,"enemyAi.mentalityDangerArchetypeWeight");let i=Js(t,"aiGuardThreatThresholds","enemyAi"),r=Js(t,"aiGuardWeights","enemyAi");if(r.length!==i.length+1)throw new ee("enemyAi.aiGuardWeights \uAC1C\uC218\uAC00 \uAD6C\uAC04 \uACBD\uACC4\uBCF4\uB2E4 1 \uB9CE\uC544\uC57C \uD55C\uB2E4");return{mentalityDangerThreshold:Tt(t,"mentalityDangerThreshold","enemyAi"),mentalityDangerArchetypeWeight:n,redundantStatusPenalty:Tt(t,"redundantStatusPenalty","enemyAi"),aiTargetLowHpBias:Tt(t,"aiTargetLowHpBias","enemyAi"),aiTargetDuplicatePenalty:Tt(t,"aiTargetDuplicatePenalty","enemyAi"),aiGuardThreatThresholds:i,aiGuardWeights:r,plan:{maxCards:Tt(He(t.plan,"enemyAi.plan"),"maxCards","enemyAi.plan"),debtFloor:Tt(He(t.plan,"enemyAi.plan"),"debtFloor","enemyAi.plan")}}}function Au(s,t){let e=`characters[${t}]`,n=He(s,e),i={id:An(n,"id",e),name:An(n,"name",e),maxHp:Tt(n,"maxHp",e),atkLevel:Tt(n,"atkLevel",e),defLevel:Tt(n,"defLevel",e),mentality:Tt(n,"mentality",e),role:An(n,"role",e),skills:Js(n,"skills",e)};if(n.actionPoints!==void 0){let r=He(n.actionPoints,`${e}.actionPoints`);i.actionPoints={start:Tt(r,"start",`${e}.actionPoints`),max:Tt(r,"max",`${e}.actionPoints`)}}return i}function Cu(s,t){let e=Js(s,"frontChance",t),[n,i]=e;if(e.length!==2||n===void 0||i===void 0||n<0||i>1||n>i)throw new ee(`${t}.frontChance \uB294 [\uCD5C\uC18C, \uCD5C\uB300] (0~1) \uC5EC\uC57C \uD55C\uB2E4`);return[n,i]}function Ru(s,t){let e=`skills[${t}]`,n=He(s,e),i={id:Tt(n,"id",e),name:An(n,"name",e),character:n.character===null?null:An(n,"character",e),slot:bn(n,"slot",_u,e),attribute:n.attribute===null?null:bn(n,"attribute",bu,e),frontPower:Tt(n,"frontPower",e),backPower:Tt(n,"backPower",e),frontChance:Cu(n,e),archetype:bn(n,"archetype",_l,e),maxInDeck:Tt(n,"maxInDeck",e),apCost:Tt(n,"apCost",e),tbd:n.tbd===!0,text:An(n,"text",e)};return n.effect!==void 0&&(i.effect=Mu(n.effect,`${e}.effect`)),i}function Pu(s,t){let e=`statusEffects[${t}]`,n=He(s,e),i=He(n.effect,`${e}.effect`),r={};return i.hpPercentDamage!==void 0&&(r.hpPercentDamage=Tt(i,"hpPercentDamage",e)),i.of!==void 0&&(r.of=bn(i,"of",["maxHp"],e)),i.mentalityModifier!==void 0&&(r.mentalityModifier=Tt(i,"mentalityModifier",e)),i.incomingDamagePercent!==void 0&&(r.incomingDamagePercent=Tt(i,"incomingDamagePercent",e)),i.outgoingDamagePercent!==void 0&&(r.outgoingDamagePercent=Tt(i,"outgoingDamagePercent",e)),i.defenseMultiplier!==void 0&&(r.defenseMultiplier=Tt(i,"defenseMultiplier",e)),{id:bn(n,"id",bl,e),name:An(n,"name",e),timing:bn(n,"timing",["onTurnStart","onCardFlip","onDamageCalc"],e),effect:r,defaultTurns:Tt(n,"defaultTurns",e),stackable:n.stackable===!0}}function Sl(s){let t=He(s,"root"),e={rules:wu(t.rules),enemyAi:Tu(t.enemyAi),characters:Zs(t,"characters","root").map(Au),skills:Zs(t,"skills","root").map(Ru),statusEffects:Zs(t,"statusEffects","root").map(Pu)};if(e.characters.length===0)throw new ee("\uCE90\uB9AD\uD130\uAC00 \uD558\uB098\uB3C4 \uC5C6\uB2E4");if(e.skills.length===0)throw new ee("\uC2A4\uD0AC\uC774 \uD558\uB098\uB3C4 \uC5C6\uB2E4");let n=new Set;for(let o of e.skills){if(n.has(o.id))throw new ee(`\uC2A4\uD0AC id \uAC00 \uC911\uBCF5\uB41C\uB2E4: ${o.id}`);n.add(o.id)}let i=new Set;for(let o of e.characters){if(i.has(o.id))throw new ee(`\uCE90\uB9AD\uD130 id \uAC00 \uC911\uBCF5\uB41C\uB2E4: ${o.id}`);i.add(o.id)}let r=e.rules.cardFlip;for(let o of e.skills){if(o.frontPower<o.backPower)throw new ee(`\u300C${o.name}\u300D \uC55E \uC704\uB825\uC774 \uB4B7 \uC704\uB825\uBCF4\uB2E4 \uC791\uB2E4`);let[l,c]=o.frontChance;if(l<r.chanceFloor||c>r.chanceCeiling)throw new ee(`\u300C${o.name}\u300D \uC55E\uBA74 \uD655\uB960 ${l}~${c} \uAC00 ${r.chanceFloor}~${r.chanceCeiling} \uBC16\uC774\uB2E4`)}let a=new Map(e.skills.map(o=>[o.id,o]));for(let o of e.characters)for(let l of o.skills){let c=a.get(l);if(!c)throw new ee(`${o.id} \uC758 \uC804\uC6A9\uAE30\uB97C \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${l}`);if(c.character!==o.id)throw new ee(`\uC804\uC6A9\uAE30 ${l} \uC758 \uC8FC\uC778\uC774 ${o.id} \uAC00 \uC544\uB2C8\uB2E4: ${c.character}`)}if(!a.has(e.rules.ultimateSkillId))throw new ee(`\uAD81\uADF9\uAE30 \uCE74\uB4DC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${e.rules.ultimateSkillId}`);return e}var js=class{constructor(t){this.data=t;R(this,"charactersById");R(this,"skillsById");R(this,"statusesById");this.charactersById=new Map(t.characters.map(e=>[e.id,e])),this.skillsById=new Map(t.skills.map(e=>[e.id,e])),this.statusesById=new Map(t.statusEffects.map(e=>[e.id,e]))}get rules(){return this.data.rules}get enemyAi(){return this.data.enemyAi}character(t){let e=this.charactersById.get(t);if(!e)throw new ee(`\uCE90\uB9AD\uD130\uB97C \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${t}`);return e}skill(t){let e=this.skillsById.get(t);if(!e)throw new ee(`\uC2A4\uD0AC\uC744 \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${t}`);return e}get ultimate(){return this.skill(this.rules.ultimateSkillId)}deckFor(t){return[...this.character(t).skills]}status(t){let e=this.statusesById.get(t);if(!e)throw new ee(`\uC0C1\uD0DC\uC774\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${t}`);return e}validateDeck(t){let e=new Map;for(let n of t){let i=this.skill(n),r=(e.get(n)??0)+1;if(e.set(n,r),r>i.maxInDeck)throw new ee(`\uB371\uC5D0 \u300C${i.name}\u300D \uC774 ${i.maxInDeck}\uC7A5\uC744 \uB118\uB294\uB2E4`)}}};function Ml(s){let t=s>>>0;return{next(){t=t+1831565813>>>0;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}}var wl={next:()=>Math.random()};var Cn=class extends Error{constructor(t){super(t),this.name="BattleFlowError"}},Ks=class{constructor(t,e,n,i={}){this.catalog=t;R(this,"combatantsById",new Map);R(this,"resolver");R(this,"rng");R(this,"enemyAi");R(this,"aiContext");R(this,"beforeEnemyTargets");R(this,"enemyTargets",new Map);R(this,"engagements",[]);R(this,"turn",0);R(this,"phase","turnStart");R(this,"winner",null);this.rng=i.rng??wl,this.enemyAi=i.enemyAi??new Li,this.beforeEnemyTargets=i.beforeEnemyTargets;for(let r of[...e,...n]){if(this.combatantsById.has(r.id))throw new ee(`\uC804\uD22C \uCC38\uAC00\uC790 id \uAC00 \uC911\uBCF5\uB41C\uB2E4: ${r.id}`);let a=t.deckFor(r.characterId);t.validateDeck(a);let o=new Ys(r.id,r.side,t.character(r.characterId),a);this.combatantsById.set(r.id,o)}this.resolver=new Ii(t,this.rng),this.aiContext={catalog:t,resolver:this.resolver,rng:this.rng}}get combatants(){return[...this.combatantsById.values()]}get isFinished(){return this.phase==="finished"}get plannedEngagements(){return this.engagements}frontChance(t,e){return this.resolver.frontChance(this.combatant(t),this.catalog.skill(e))}combatant(t){let e=this.combatantsById.get(t);if(!e)throw new ee(`\uC804\uD22C \uCC38\uAC00\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${t}`);return e}sideOf(t){return this.combatants.filter(e=>e.side===t)}aliveOf(t){return this.sideOf(t).filter(e=>!e.isDefeated)}startTurn(){this.expectPhase("turnStart"),this.turn+=1;let t=[{type:"turnStart",turn:this.turn}];for(let e of this.combatants)e.isDefeated||(e.beginTurn(),e.ultimatePending&&(e.ultimatePending=!1,e.addCard(this.catalog.rules.ultimateSkillId)));for(let e of this.combatants)e.isDefeated||this.resolver.applyTurnStartStatuses(e,t);return this.checkBattleEnd(t)||(this.beforeEnemyTargets?.(t),this.chooseEnemyTargets(t),this.phase="awaitingOrders"),t}chooseEnemyTargets(t){this.enemyTargets.clear();let e=this.aliveOf("ally");if(e.length===0)return;let n=new Set;for(let i of this.aliveOf("enemy")){let r=this.enemyAi.chooseTarget(i,e,n,this.aiContext);r!==null&&(this.enemyTargets.set(i.id,r),n.add(r),t.push({type:"enemyTargeted",enemyId:i.id,targetId:r}))}}submitOrders(t){this.expectPhase("awaitingOrders");let e=new Set;for(let n of t){let i=this.combatant(n.actorId),r=this.combatant(n.targetId);if(i.side!=="ally")throw new Cn(`\uC544\uAD70\uC774 \uC544\uB2CC \uCC38\uAC00\uC790\uC758 \uC9C0\uC2DC\uB2E4: ${i.id}`);if(i.isDefeated)throw new Cn(`\uC4F0\uB7EC\uC9C4 \uCC38\uAC00\uC790\uC5D0\uAC8C \uC9C0\uC2DC\uD560 \uC218 \uC5C6\uB2E4: ${i.id}`);if(r.side===i.side)throw new Cn(`\uAC19\uC740 \uC9C4\uC601\uC744 \uACA8\uB20C \uC218 \uC5C6\uB2E4: ${r.id}`);if(r.isDefeated)throw new Cn(`\uC4F0\uB7EC\uC9C4 \uB300\uC0C1\uC744 \uACA8\uB20C \uC218 \uC5C6\uB2E4: ${r.id}`);if(!i.deck.includes(n.skillId))throw new Cn(`\uB371\uC5D0 \uC5C6\uB294 \uCE74\uB4DC\uB2E4: ${i.id} / ${n.skillId}`);if(e.has(i.id))throw new Cn(`\uAC19\uC740 \uCC38\uAC00\uC790\uC5D0\uAC8C \uC9C0\uC2DC\uAC00 \uB450 \uBC88 \uC654\uB2E4: ${i.id}`);e.add(i.id)}this.engagements=this.matchEngagements(t),this.phase="resolving"}matchEngagements(t){let e=[],n=new Set;for(let i of t){if(this.enemyTargets.get(i.targetId)===i.actorId){e.push({kind:"clash",allyId:i.actorId,enemyId:i.targetId,allySkillId:i.skillId}),n.add(i.targetId);continue}e.push({kind:"allyOneSided",allyId:i.actorId,targetId:i.targetId,skillId:i.skillId})}for(let i of this.aliveOf("enemy")){if(n.has(i.id))continue;let r=this.enemyTargets.get(i.id);r&&e.push({kind:"enemyOneSided",enemyId:i.id,targetId:r})}return e}resolve(){this.expectPhase("resolving");let t=[];for(let e of this.engagements){let[n,i]=this.participantsOf(e);if(!(n.isDefeated||i.isDefeated)&&(t.push(...this.runEngagement(e,n,i)),this.checkBattleEnd(t)))return this.engagements=[],t}return this.engagements=[],this.phase="turnEnd",t}participantsOf(t){return t.kind==="clash"?[this.combatant(t.allyId),this.combatant(t.enemyId)]:t.kind==="allyOneSided"?[this.combatant(t.allyId),this.combatant(t.targetId)]:[this.combatant(t.enemyId),this.combatant(t.targetId)]}runEngagement(t,e,n){let i=[];if(t.kind==="clash"){let a=this.enemyAi.chooseSkill(n,{target:e,isClash:!0,opponentSkillId:t.allySkillId},this.aiContext);return this.consumeUltimate(e,t.allySkillId,i),this.consumeUltimate(n,a,i),i.push(...this.resolver.resolve(e,t.allySkillId,n,a)),i}if(t.kind==="allyOneSided")return this.consumeUltimate(e,t.skillId,i),i.push(...this.resolver.resolveOneSided(e,t.skillId,n)),i;let r=this.enemyAi.chooseSkill(e,{target:n,isClash:!1,opponentSkillId:null},this.aiContext);return this.consumeUltimate(e,r,i),i.push(...this.resolver.resolveOneSided(e,r,n)),i}endTurn(){this.expectPhase("turnEnd");let t=[],e=this.catalog.rules;for(let n of this.combatants)if(!n.isDefeated){if(n.mentality<e.mentalityRegenCap){let i=Math.min(e.mentalityRegenCap,n.mentality+e.mentalityRegenPerTurn),r=n.changeMentality(i-n.mentality,e);r!==0&&t.push({type:"mentalityChanged",combatantId:n.id,delta:r,mentality:n.mentality,reason:"turnRegen"})}for(let i of n.expireStatuses())t.push({type:"statusExpired",combatantId:n.id,status:i});this.checkUltimateReady(n,t)}return t.push({type:"turnEnd",turn:this.turn}),this.phase="turnStart",t}checkUltimateReady(t,e){let n=this.catalog.rules;t.attributeTotal<n.ultimateThreshold||t.ultimatePending||t.deck.includes(n.ultimateSkillId)||(t.ultimatePending=!0,e.push({type:"ultimateReady",combatantId:t.id}))}consumeUltimate(t,e,n){e===this.catalog.rules.ultimateSkillId&&(t.removeCard(e),t.resetAttributes(),n.push({type:"ultimateUsed",combatantId:t.id,skillId:e}))}checkBattleEnd(t){let e=this.aliveOf("ally").length===0,n=this.aliveOf("enemy").length===0;return!e&&!n?!1:(this.winner=e&&n?null:e?"enemy":"ally",this.phase="finished",t.push({type:"battleEnd",winner:this.winner}),!0)}expectPhase(t){if(this.phase!==t)throw new Cn(`\uC9C0\uAE08 \uB2E8\uACC4\uB294 ${this.phase} \uB77C ${t} \uB3D9\uC791\uC744 \uD560 \uC218 \uC5C6\uB2E4`)}};var _s=class extends Error{constructor(t){super(t),this.name="PlanError"}},Qs=class{constructor(t,e,n){this.catalog=t;this.ai=e;this.context=n;R(this,"slots",new Map);R(this,"battle",null)}attach(t){this.battle=t;let e=this.catalog.rules.actionPoints;for(let n of t.combatants){let i=n.base.actionPoints;this.slots.set(n.id,{actionPoints:i?.start??e.start,max:i?.max??e.max,steps:[]})}}actionPoints(t){return this.slot(t).actionPoints}maxActionPoints(t){return this.slot(t).max}steps(t){return this.slot(t).steps}needsPlan(t){let e=this.slot(t);return!this.combatant(t).isDefeated&&e.steps.length===0&&e.actionPoints>=1}isIdle(t){let e=this.slot(t);return e.steps.length===0&&e.actionPoints<1}cost(t){return t.reduce((e,n)=>e+this.catalog.skill(n.skillId).apCost,0)}problem(t,e){let n=this.combatant(t),i=this.slot(t);if(n.isDefeated)return"\uC4F0\uB7EC\uC9C4 \uCC38\uAC00\uC790\uB294 \uC608\uC57D\uD560 \uC218 \uC5C6\uB2E4";if(i.steps.length>0)return"\uC608\uC57D\uC774 \uB0A8\uC544 \uC788\uC73C\uBA74 \uC0C8\uB85C \uC9E4 \uC218 \uC5C6\uB2E4";if(i.actionPoints<1)return"\uD589\uB3D9\uB825\uC774 1 \uC774\uC0C1\uC774\uC5B4\uC57C \uC608\uC57D\uD560 \uC218 \uC788\uB2E4";if(e.length===0)return"\uC608\uC57D\uC740 \uD55C \uCE78 \uC774\uC0C1\uC774\uC5B4\uC57C \uD55C\uB2E4";let r=new Set;for(let a of e){if(!n.deck.includes(a.skillId))return`\uB371\uC5D0 \uC5C6\uB294 \uCE74\uB4DC\uB2E4: ${a.skillId}`;if(r.has(a.skillId))return`\uD55C \uC608\uC57D \uC548\uC5D0\uC11C \uAC19\uC740 \uCE74\uB4DC\uB294 \uD55C \uBC88\uB9CC \uC4F4\uB2E4: ${a.skillId}`;r.add(a.skillId);let o=this.combatant(a.targetId);if(o.side===n.side)return`\uAC19\uC740 \uC9C4\uC601\uC744 \uACA8\uB20C \uC218 \uC5C6\uB2E4: ${a.targetId}`;if(o.isDefeated)return`\uC4F0\uB7EC\uC9C4 \uB300\uC0C1\uC744 \uACA8\uB20C \uC218 \uC5C6\uB2E4: ${a.targetId}`}return i.actionPoints-this.cost(e)<this.catalog.rules.actionPoints.floor?"\uBE5A \uD55C\uB3C4\uB97C \uB118\uB294\uB2E4":null}submit(t,e){let n=this.problem(t,e);if(n)throw new _s(`${t}: ${n}`);let i=this.slot(t),r=this.cost(e);return i.steps=e.map(a=>({...a})),i.actionPoints-=r,[{type:"planSet",combatantId:t,steps:i.steps.map(a=>({...a})),actionPoints:i.actionPoints},{type:"actionPointsChanged",combatantId:t,delta:-r,actionPoints:i.actionPoints}]}planEnemies(){let t=[];for(let e of this.battle?.sideOf("enemy")??[])e.isDefeated||this.needsPlan(e.id)&&t.push(...this.submit(e.id,this.choosePlan(e)));for(let e of this.battle?.combatants??[])!e.isDefeated&&this.isIdle(e.id)&&t.push({type:"idle",combatantId:e.id});return t}choosePlan(t){let e=this.catalog.enemyAi.plan,n=Math.max(e.debtFloor,this.catalog.rules.actionPoints.floor),i=this.opponentsOf(t),r=[],a=this.slot(t.id).actionPoints;for(;r.length<e.maxCards&&i.length>0;){let o=new Set(r.map(g=>g.skillId)),c=t.deck.filter(g=>!o.has(g)&&!this.catalog.skill(g).tbd&&(r.length===0||a-this.catalog.skill(g).apCost>=n)).filter(g=>a-this.catalog.skill(g).apCost>=this.catalog.rules.actionPoints.floor);if(c.length===0)break;let h=this.ai.chooseTarget(t,i,new Set,this.context);if(h===null)break;let d={target:this.combatant(h),isClash:!0,opponentSkillId:null,candidates:c},p=this.ai.chooseSkill(t,d,this.context);r.push({skillId:p,targetId:h}),a-=this.catalog.skill(p).apCost}return r}orders(t){let e=[];for(let n of this.battle?.sideOf("ally")??[]){if(n.isDefeated)continue;let i=this.current(n,t);i&&e.push({actorId:n.id,targetId:i.targetId,skillId:i.skillId})}return e}current(t,e=new Map){let n=this.slot(t.id).steps[0];if(!n)return null;if(!this.combatant(n.targetId).isDefeated)return n;let i=this.opponentsOf(t),a=i.find(o=>e.get(o.id)===t.id)??i[0];return a?{skillId:n.skillId,targetId:a.id}:null}endTurn(){let t=[],e=this.catalog.rules.actionPoints.regenPerTurn;for(let n of this.battle?.combatants??[]){if(n.isDefeated)continue;let i=this.slot(n.id);i.steps.shift();let r=Math.min(i.max,i.actionPoints+e),a=r-i.actionPoints;i.actionPoints=r,a!==0&&t.push({type:"actionPointsChanged",combatantId:n.id,delta:a,actionPoints:r})}return t}opponentsOf(t){return(this.battle?.combatants??[]).filter(e=>e.side!==t.side&&!e.isDefeated)}combatant(t){if(!this.battle)throw new _s("\uC608\uC57D\uD310\uC5D0 \uC804\uD22C\uAC00 \uBD99\uC9C0 \uC54A\uC558\uB2E4");return this.battle.combatant(t)}slot(t){let e=this.slots.get(t);if(!e)throw new _s(`\uC608\uC57D\uD310\uC5D0 \uC5C6\uB294 \uCC38\uAC00\uC790\uB2E4: ${t}`);return e}},Ra=class{constructor(t){this.board=t}chooseTarget(t){return this.board.current(t)?.targetId??null}chooseSkill(t){return this.board.current(t)?.skillId??t.deck[0]}};function El(s){return{enemyAi:new Ra(s),beforeEnemyTargets:t=>t.push(...s.planEnemies())}}function Ss(s){return Number.isFinite(s)?Math.max(0,Math.min(1,s)):0}var Ms=class{constructor(t){R(this,"points");R(this,"lengths");R(this,"total");this.points=t.map(e=>[e[0],e[1]]),this.lengths=this.points.slice(1).map((e,n)=>{let i=this.points[n];return Math.hypot(e[0]-i[0],e[1]-i[1])}),this.total=this.lengths.reduce((e,n)=>e+n,0)}at(t){let e=t;for(let i=0;i<this.lengths.length;i++){let r=this.lengths[i],a=this.points[i],o=this.points[i+1];if(e<=r){let l=r>0?e/r:0;return{point:[a[0]+(o[0]-a[0])*l,a[1]+(o[1]-a[1])*l],index:i}}e-=r}let n=this.points[this.points.length-1];return{point:[n[0],n[1]],index:this.lengths.length-1}}segment(t,e){let n=Ss(t)*this.total,i=Ss(e)*this.total;if(i-n<=0)return[];let r=this.at(n),a=this.at(i),o=[r.point];for(let l=r.index+1;l<=a.index;l++){let c=this.points[l];o.push([c[0],c[1]])}return o.push(a.point),o}prefix(t){return this.segment(0,t)}};function Pa(s,t,e,n){let i=s.map(a=>[a[0],a[1]]);if(i.length<2)return i;let r=(a,o)=>{let l=Math.hypot(o[0]-a[0],o[1]-a[1])||1;return[o[0]+(o[0]-a[0])/l*t,o[1]+(o[1]-a[1])/l*t]};return e&&i.unshift(r(i[1],i[0])),n&&i.push(r(i[i.length-2],i[i.length-1])),i}function ws(s){return s.map((t,e)=>`${e?"L":"M"}${Tl(t[0])} ${Tl(t[1])}`).join("")}function Tl(s){return Math.round(s*100)/100}function Al(s,t,e){let n=Math.max(0,Math.min(t,Number.isFinite(s)?Math.floor(s):0));return Array.from({length:t},(i,r)=>r>=n?"empty":e==="ready"?"full":e==="pending"?"pending":"charged")}function Cl(s,t){return s?"ready":t?"pending":"charging"}function Di(s){return s==="front"?"\uC55E":"\uB4A4"}function Pl(s,t){let e=[],n=0;for(;n<s.length;){let i=s[n];if(i.type==="oneSidedStart"){let r=Rl(s,n,"oneSidedEnd");e.push(Iu(s.slice(n,r+1),t)),n=r+1;continue}if(i.type==="clashStart"){let r=Rl(s,n,"clashEnd");e.push(Lu(s.slice(n,r+1),t)),n=r+1;continue}e.push({kind:"state",event:i}),n+=1}return e}function Rl(s,t,e){for(let n=t+1;n<s.length;n++)if(s[n].type===e)return n;return s.length-1}function Ia(s){return{combatantId:s.combatantId,skillId:s.skillId,face:s.face,power:s.power,chance:s.chance}}function Iu(s,t){let e=s[0],n={combatantId:e.attackerId,skillId:e.skillId,face:"back",power:0,chance:0},i=0,r=!1;for(let o of s)o.type==="cardFlipped"&&o.combatantId===e.attackerId&&(n=Ia(o)),o.type==="damageApplied"&&o.combatantId===e.targetId&&(i+=o.damage),o.type==="defeated"&&o.combatantId===e.targetId&&(r=!0);let a=[];return t.isPlayerSide(e.attackerId)&&a.push(i>0?{combatantId:e.attackerId,success:!0,title:"\uACF5\uACA9 \uC131\uACF5",reason:`${Di(n.face)} ${n.power} \xB7 \uD53C\uD574 ${i}`}:{combatantId:e.attackerId,success:!1,title:"\uBE57\uB098\uAC10",reason:`${Di(n.face)} ${n.power} \xB7 \uD53C\uD574 \uC5C6\uC74C`}),{kind:"oneSided",attackerId:e.attackerId,targetId:e.targetId,skillId:e.skillId,flip:n,power:n.power,damage:i,defeated:r,callouts:a,events:s.filter(o=>o.type!=="oneSidedStart"&&o.type!=="oneSidedEnd"&&o.type!=="cardFlipped")}}function Lu(s,t){let e=s[0],n=[],i=[],r=null,a=null,o=null,l=d=>{let p=n[n.length-1];p?p.events.push(...i):d.events.unshift(...i),i=[],n.push(d)},c=(d,p)=>({combatantId:d,skillId:p,face:"back",power:0,chance:0});for(let d of s.slice(1)){if(d.type==="clashEnd")continue;if(d.type==="cardFlipped"){d.combatantId===e.attackerId?a=Ia(d):o=Ia(d),r=null;continue}if(d.type==="damageCalculated")continue;let p={attackerFlip:a??c(e.attackerId,e.attackerSkillId),defenderFlip:o??c(e.defenderId,e.defenderSkillId)};if(d.type==="clashRoundWin"){r={type:"win",...p,winnerId:d.winnerId,loserId:d.loserId,winnerPower:d.winnerDamage,loserPower:d.loserDamage,events:[d],callouts:ku(e,p.attackerFlip,p.defenderFlip,d.winnerId,t)},l(r);continue}if(d.type==="deadlock"){let g=p.attackerFlip.power;r={type:"deadlock",...p,power:g,events:[d],callouts:[p.attackerFlip,p.defenderFlip].filter(y=>t.isPlayerSide(y.combatantId)).map(y=>{let m=y===p.attackerFlip?p.defenderFlip:p.attackerFlip;return{combatantId:y.combatantId,success:!1,title:"\uAD50\uCC29",reason:`${Di(y.face)} ${y.power} = ${Di(m.face)} ${m.power} \xB7 \uB2E4\uC2DC \uB4A4\uC9D1\uAE30`}})},l(r);continue}if(r&&Du(d)){r.events.push(d);continue}r=null,i.push(d)}let h=[...n].reverse().find(d=>d.type==="win"),u=null;if(h){let d=i.filter(p=>p.type==="damageApplied"&&p.combatantId===h.loserId);d.length>0&&(u={winnerId:h.winnerId,loserId:h.loserId,winnerSkillId:h.winnerId===e.attackerId?e.attackerSkillId:e.defenderSkillId,damage:d.reduce((p,g)=>p+g.damage,0),defeated:i.some(p=>p.type==="defeated"&&p.combatantId===h.loserId)})}return{kind:"clash",attackerId:e.attackerId,defenderId:e.defenderId,attackerSkillId:e.attackerSkillId,defenderSkillId:e.defenderSkillId,rounds:n,finisher:u,events:i}}function Du(s){return s.type==="mentalityChanged"||s.type==="deadlockLimit"}function ku(s,t,e,n,i){let r=[];for(let a of[s.attackerId,s.defenderId]){if(!i.isPlayerSide(a))continue;let o=a===s.attackerId?t:e,l=a===s.attackerId?e:t,c=`${Di(o.face)} ${o.power}`,h=`${Di(l.face)} ${l.power}`;r.push(a===n?{combatantId:a,success:!0,title:"\uD569 \uC2B9\uB9AC",reason:`${c} > ${h}`}:{combatantId:a,success:!1,title:"\uD569 \uD328\uBC30",reason:`${c} < ${h}`})}return r}function La(s,t){let e=Math.max(1,Math.floor(t)),n=Math.floor(s/e),i=Array.from({length:e},()=>n);return i[e-1]=s-n*(e-1),i}var Uu=["S1","S2","S3","ULT"];function Il(s){let t=[],e=s.enemyMaxHp,n=Uu.map(i=>s.cards.find(r=>r.slot===i)).filter(i=>i!==void 0);for(let i of n){let r=i.frontPower;e=Math.max(1,e-r);let a=[{type:"damageApplied",combatantId:s.enemyId,damage:r,hp:e}];t.push({kind:"clash",attackerId:s.allyId,defenderId:s.enemyId,attackerSkillId:i.skillId,defenderSkillId:s.enemyCard.skillId,rounds:[{type:"win",attackerFlip:{combatantId:s.allyId,skillId:i.skillId,face:"front",power:i.frontPower,chance:1},defenderFlip:{combatantId:s.enemyId,skillId:s.enemyCard.skillId,face:"back",power:s.enemyCard.backPower,chance:0},winnerId:s.allyId,loserId:s.enemyId,winnerPower:i.frontPower,loserPower:s.enemyCard.backPower,events:[],callouts:[{combatantId:s.allyId,success:!0,title:"\uD569 \uC2B9\uB9AC",reason:`\uC55E ${i.frontPower} > \uB4A4 ${s.enemyCard.backPower}`}]}],finisher:{winnerId:s.allyId,loserId:s.enemyId,winnerSkillId:i.skillId,damage:r,defeated:!1},events:a})}return t.push({kind:"state",event:{type:"damageApplied",combatantId:s.enemyId,damage:0,hp:s.enemyMaxHp}}),t}var pn=class extends Error{constructor(t){super(`env-vfx: ${t}`),this.name="EnvVfxError"}};function fn(s,t){if(typeof s!="object"||s===null||Array.isArray(s))throw new pn(`${t} \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4`);return s}function tr(s,t,e){if(!Array.isArray(s)||s.length!==t||s.some(n=>typeof n!="number"))throw new pn(`${e} \uAC00 \uC22B\uC790 ${t}\uAC1C\uAC00 \uC544\uB2C8\uB2E4`);return s}function Ll(s,t,e){let n=fn(s,"manifest"),i=new Map;for(let[u,d]of(n.sprites??[]).entries()){let p=fn(d,`sprites[${u}]`),g=String(p.id),y=p.tint_mode==="alpha_silhouette"?"alpha_silhouette":"multiply_rgb";i.set(g,{id:g,atlas:String(p.atlas),rect:tr(p.atlas_rect_xywh,4,`${g}.atlas_rect_xywh`),canvas:tr(p.canvas,2,`${g}.canvas`),pivot:tr(p.pivot_top_left_px,2,`${g}.pivot_top_left_px`),tint:y,usage:String(p.usage??"general")})}let r=new Map;for(let[u,d]of(n.animations??[]).entries()){let p=fn(d,`animations[${u}]`),g=p.frames,y=p.durations_ms;if(!Array.isArray(g)||!Array.isArray(y)||g.length!==y.length)throw new pn(`animations[${u}] \uC7A5 \uC218\uC640 \uC2DC\uAC04 \uC218\uAC00 \uB2E4\uB974\uB2E4`);for(let m of g)if(!i.has(String(m)))throw new pn(`animations[${u}] \uC758 ${String(m)} \uC7A5\uC774 \uC5C6\uB2E4`);r.set(String(p.id),{id:String(p.id),frames:g.map(String),durations:y.map(Number),fadeLast:Number(p.fade_last_ms??0)})}let a=fn(t,"camera-presets"),o=new Map;for(let[u,d]of Object.entries(fn(a.presets,"camera-presets.presets"))){let p=fn(d,`presets.${u}`);o.set(u,{amplitude:Number(p.amplitude_height_ratio??0),duration:Number(p.duration_ms??0),zoom:Number(p.zoom_delta??0)})}let l=Number(a.amplitude_cap_height_ratio??.008),c=new Map;for(let[u,d]of Object.entries(fn(fn(e,"bindings").events,"bindings.events"))){let p=fn(d,`events.${u}`),g=String(p.camera??"none"),y=p.heavyCamera===void 0?null:String(p.heavyCamera);for(let b of[g,y])if(b!==null&&!o.has(b))throw new pn(`events.${u} \uC758 \uCE74\uBA54\uB77C ${b} \uAC00 \uC5C6\uB2E4`);let m=(p.spawns??[]).map((b,v)=>{let E=fn(b,`events.${u}.spawns[${v}]`),C=String(E.play);if(!r.has(C)&&!i.has(C))throw new pn(`events.${u} \uC758 ${C} \uAC00 manifest \uC5D0 \uC5C6\uB2E4`);let T=String(E.anchor);if(!["foot","floor","chest","contact"].includes(T))throw new pn(`events.${u}.anchor ${T} \uB97C \uBAA8\uB978\uB2E4`);return{play:C,anchor:T,offset:tr(E.offset??[0,0],2,`events.${u}.offset`),scale:Number(E.scale??1),face:E.face==="away"?"away":"toward",hold:Number(E.hold??0),fade:Number(E.fade??0)}}),f=p.surfaces;if(!Array.isArray(f))throw new pn(`events.${u}.surfaces \uAC00 \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4`);c.set(u,{surfaces:f.map(String),camera:g,heavyCamera:y,spawns:m})}let h=Number(fn(e,"bindings").playbackRate??1);if(!(h>0))throw new pn("playbackRate \uAC00 0 \uBCF4\uB2E4 \uD070 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4");return{sprites:i,animations:r,camera:{cap:l,presets:o},events:c,playbackRate:h}}function Da(s){let t=new Set;for(let e of s.events.values())for(let n of e.spawns){let i=s.animations.get(n.play)?.frames??[n.play];for(let r of i){let a=s.sprites.get(r);a&&t.add(a.atlas)}}return[...t].sort()}var Rn=class extends Error{constructor(t){super(`sounds: ${t}`),this.name="CharacterSoundsError"}};function ka(s,t){if(s===void 0)return{};if(typeof s!="object"||s===null||Array.isArray(s))throw new Rn(`${t} \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4`);let e={};for(let[n,i]of Object.entries(s))if(!n.startsWith("_")){if(typeof i!="string"||i.length===0)throw new Rn(`${t}.${n} \uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4`);e[n]=i}return e}function Dl(s){if(typeof s!="object"||s===null||Array.isArray(s))throw new Rn("root \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4");let t=s,e=t.character;if(typeof e!="string"||e.length===0)throw new Rn("character \uAC00 \uC5C6\uB2E4");let n=ka(t.files,"files"),i=h=>{let u={};for(let[d,p]of Object.entries(t[h]??{}))if(!d.startsWith("_")){if(typeof p!="number"||!(p>=0))throw new Rn(`${h}.${d} \uAC00 0 \uC774\uC0C1 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);u[d]=p}return u},r=i("gain"),a=i("lead"),o=h=>{let u=t[h];if(u==null)return null;if(typeof u!="string")throw new Rn(`${h} \uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return u},l={character:e,files:n,gain:r,lead:a,dash:o("dash"),parry:o("parry"),frames:ka(t.frames,"frames"),ultimate:ka(t.ultimate,"ultimate")},c=[l.dash,l.parry,...Object.values(l.frames),...Object.values(l.ultimate),...Object.keys(r),...Object.keys(a)];for(let h of c)if(h!==null&&!(h in n))throw new Rn(`\uC18C\uB9AC ${h} \uC758 \uD30C\uC77C\uC774 \uC5C6\uB2E4`);return l}var $e=class extends Error{constructor(t){super(`ultimate: ${t}`),this.name="UltimateArtError"}};function ki(s,t){if(typeof s!="object"||s===null||Array.isArray(s))throw new $e(`${t} \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4`);return s}function _n(s,t,e){let n=s[t];if(typeof n!="number"||!Number.isFinite(n))throw new $e(`${e}.${t} \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);return n}function Pn(s,t,e){let n=s[t];if(typeof n!="string"||n.length===0)throw new $e(`${e}.${t} \uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return n}var Ua=["swapEnvironment","cutsceneStart","cutLine","cutsceneEnd","sheathClick","water","effectsEnd","restoreEnvironment","end"];function kl(s){let t=ki(s,"root"),e=ki(t.frames,"frames"),n=ki(t.effects,"effects"),i=ki(t.cutscene,"cutscene"),r=i.size;if(!Array.isArray(r)||r.length!==2||r.some(u=>typeof u!="number"))throw new $e("cutscene.size \uAC00 \uC22B\uC790 2\uAC1C\uAC00 \uC544\uB2C8\uB2E4");let a=ki(t.timeline,"timeline"),l=Object.fromEntries(["poolIn","swapEnvironment","cutsceneStart","cutLine","cutsceneEnd","appearBehind","sheathClick","water","effectsEnd","restoreEnvironment","restoreFade","end"].map(u=>[u,_n(a,u,"timeline")]));for(let u=1;u<Ua.length;u++){let d=Ua[u-1],p=Ua[u];if(l[p]<l[d])throw new $e(`timeline.${p} \uAC00 ${d} \uBCF4\uB2E4 \uC774\uB974\uB2E4`)}if(l.appearBehind<l.cutsceneEnd)throw new $e("timeline.appearBehind \uAC00 \uCEF7\uC2E0\uC774 \uAC77\uD788\uAE30 \uC804\uC774\uB2E4");if(l.restoreEnvironment+l.restoreFade>l.end+1e-9)throw new $e("\uC804\uC7A5 \uBCF5\uADC0\uAC00 \uB05D\uBCF4\uB2E4 \uB2A6\uB2E4");let c=Fu(t.slashes),h=t.environment;return{character:Pn(t,"character","root"),environment:typeof h=="string"&&h.length>0?h:null,frames:{ready:Pn(e,"ready","frames"),open:Pn(e,"open","frames"),closed:Pn(e,"closed","frames")},effects:{pool:Pn(n,"pool","effects"),slash:Pn(n,"slash","effects"),water:Pn(n,"water","effects")},cutscene:{foreground:Pn(i,"foreground","cutscene"),line:Pn(i,"line","cutscene"),size:{width:r[0],height:r[1]},zoomFrom:_n(i,"zoomFrom","cutscene"),zoomTo:_n(i,"zoomTo","cutscene"),lineY:_n(i,"lineY","cutscene"),lineWipe:_n(i,"lineWipe","cutscene"),fade:_n(i,"fade","cutscene")},timeline:l,slashes:c,behindGap:_n(t,"behindGap","root")}}function Fu(s){if(s===void 0)return{count:1,interval:0,rollDeg:[0],offset:[[0,0]],jolt:[[0,0]],joltTime:.06};let t=ki(s,"slashes"),e=_n(t,"count","slashes");if(!Number.isInteger(e)||e<1)throw new $e("slashes.count \uAC00 1 \uC774\uC0C1 \uC815\uC218\uAC00 \uC544\uB2C8\uB2E4");let n=t.rollDeg,i=t.offset,r=t.jolt??[[0,0]];if(!Array.isArray(n)||n.length===0||n.some(o=>typeof o!="number"))throw new $e("slashes.rollDeg \uAC00 \uC22B\uC790 \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4");if(!Array.isArray(i)||i.length===0||i.some(o=>!Array.isArray(o)||o.length!==2||o.some(l=>typeof l!="number")))throw new $e("slashes.offset \uC774 \uC22B\uC790 2\uAC1C\uC9DC\uB9AC \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4");if(!Array.isArray(r)||r.length===0||r.some(o=>!Array.isArray(o)||o.length!==2||o.some(l=>typeof l!="number")))throw new $e("slashes.jolt \uAC00 \uC22B\uC790 2\uAC1C\uC9DC\uB9AC \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4");let a=t.joltTime===void 0?.06:_n(t,"joltTime","slashes");if(!(a>0))throw new $e("slashes.joltTime \uC774 0 \uBCF4\uB2E4 \uCEE4\uC57C \uD55C\uB2E4");return{count:e,interval:_n(t,"interval","slashes"),rollDeg:n,offset:i,jolt:r,joltTime:a}}var Nu={attack:"\uAC01\uC778",defense:"\uD1B5\uCC30",support:"\uACB0\uC758"};function Ul(s,t={}){return Object.entries(t).reduce((e,[n,i])=>e.split(n).join(i),s)}function Ui(s,t,e={}){let n=s.skill(t);return{skillId:t,name:e.name??Ul(n.name,e.terms),slot:n.slot,attribute:n.attribute?Nu[n.attribute]:null,trace:n.attribute??null,frontPower:n.frontPower,backPower:n.backPower,text:Ul(n.text,e.terms)}}var Fi=class{constructor(t,e,n,i){this.allies=t;this.enemies=e;this.enemyTargets=n;this.budgets=i;R(this,"current");R(this,"pendingTarget",null);R(this,"plans",new Map);this.current=t[0]?.id??null,e.length===1&&(this.pendingTarget=e[0]??null)}get selectedAlly(){return this.current}get selectedTarget(){return this.pendingTarget}get ready(){return this.allies.length>0&&this.allies.every(t=>(this.plans.get(t.id)?.length??0)>0)}get submitted(){return new Map([...this.plans].filter(([,t])=>t.length>0).map(([t,e])=>[t,e.map(n=>({...n}))]))}orderOf(t){let e=this.plans.get(t)?.[0];return e?{actorId:t,targetId:e.targetId,skillId:e.skillId}:null}stepsOf(t){return this.plans.get(t)??[]}budgetOf(t){let e=this.budgets.get(t);if(!e)return null;let n=this.stepsOf(t),i=e.actionPoints-n.reduce((a,o)=>a+e.cost(o.skillId),0),r=i;for(let a=0;a<n.length;a++)r=Math.min(e.max,r+e.regenPerTurn);return{actionPoints:e.actionPoints,after:i,end:r,floor:e.floor}}get hand(){return this.member(this.current)?.deck??[]}canToggle(t){let e=this.current;if(e===null||this.pendingTarget===null)return!1;if(this.stepsOf(e).some(r=>r.skillId===t))return!0;let n=this.budgets.get(e),i=this.budgetOf(e);return!n||!i?!1:i.after-n.cost(t)>=i.floor}wouldClash(t){return this.current!==null&&this.enemyTargets.get(t)===this.current}selectAlly(t){return this.member(t)?(this.plans.delete(t),this.current=t,this.enemies.length!==1&&(this.pendingTarget=null),!0):!1}selectTarget(t){return this.current===null||!this.enemies.includes(t)?!1:(this.pendingTarget=t,!0)}selectCard(t){let e=this.member(this.current);if(!e||this.pendingTarget===null||!e.deck.includes(t)||!this.canToggle(t))return!1;let n=this.plans.get(e.id)??[],i=n.findIndex(r=>r.skillId===t);return i>=0?n.splice(i,1):n.push({skillId:t,targetId:this.pendingTarget}),this.plans.set(e.id,n),!0}member(t){return t===null?void 0:this.allies.find(e=>e.id===t)}};var Na={character:"",frames:{},ultimate:[],ultimateFrame:null,defeat:[],ready:[],readySlots:null,dash:[],clash:[],recoil:[],glow:[]},ge=class extends Error{constructor(t){super(`sprite-manifest: ${t}`),this.name="SpriteManifestError"}};function en(s,t){if(typeof s!="object"||s===null||Array.isArray(s))throw new ge(`${t} \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4`);return s}function ln(s,t,e){let n=s[t];if(typeof n!="number"||!Number.isFinite(n))throw new ge(`${e}.${t} \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);return n}function Pe(s,t,e){let n=s[t];if(typeof n!="string")throw new ge(`${e}.${t} \uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return n}function Te(s,t){if(!Array.isArray(s)||s.length!==2)throw new ge(`${t} \uAC00 [x, y] \uAC00 \uC544\uB2C8\uB2E4`);let[e,n]=s;if(typeof e!="number"||typeof n!="number")throw new ge(`${t} \uC758 \uC88C\uD45C\uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);return{x:e,y:n}}function Fl(s,t){return s==null?null:Te(s,t)}function Zn(s,t,e){let n=s[t];if(!Array.isArray(n))throw new ge(`${e}.${t} \uAC00 \uBC30\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return n}var Ou=["bladeTip","hitPoint","groundPoint","emissionPoint"];function Bu(s,t){let e=`frames[${t}]`,n=en(s,e),i=Zn(n,"bbox",e);if(i.length!==4||i.some(r=>typeof r!="number"))throw new ge(`${e}.bbox \uAC00 \uC22B\uC790 4\uAC1C\uAC00 \uC544\uB2C8\uB2E4`);return{id:Pe(n,"id",e),file:Pe(n,"file",e),scale:ln(n,"scale",e),scaleMatch:ln(n,"scaleMatch",e),anchor:Te(n.anchor,`${e}.anchor`),headCenter:Te(n.headCenter,`${e}.headCenter`),axeHead:Fl(n.axeHead,`${e}.axeHead`),bladeTip:Fl(n.bladeTip,`${e}.bladeTip`),tipSource:Pe(n,"tipSource",e),bbox:i,ms:n.ms===void 0?null:ln(n,"ms",e),impact:n.impact===!0,windup:n.windup===!0}}function Hu(s,t){let e=`effects[${t}]`,n=en(s,e),i=Pe(n,"anchor",e);if(!Ou.includes(i))throw new ge(`${e}.anchor \uB97C \uC54C \uC218 \uC5C6\uB2E4: ${i}`);let r=Te(n.size,`${e}.size`);return{id:Pe(n,"id",e),name:Pe(n,"name",e),anchor:i,size:{width:r.x,height:r.y},pivot:Te(n.pivot,`${e}.pivot`),scale:ln(n,"scale",e),blend:Pe(n,"blend",e),loop:n.loop===!0,frames:Zn(n,"frames",e).map((a,o)=>{let l=`${e}.frames[${o}]`,c=en(a,l);return{file:Pe(c,"file",l),ms:ln(c,"ms",l)}})}}function zu(s){let t=en(s,"cutscene"),e=Te(t.size,"cutscene.size");return{size:{width:e.x,height:e.y},layers:Zn(t,"layers","cutscene").map((n,i)=>{let r=`cutscene.layers[${i}]`,a=en(n,r);return{id:Pe(a,"id",r),file:Pe(a,"file",r),pos:Te(a.pos,`${r}.pos`),pivot:Te(a.pivot,`${r}.pivot`),z:ln(a,"z",r),parent:Pe(a,"parent",r),visibleDefault:a.visibleDefault===!0,motionDeg:ln(a,"motionDeg",r)}})}}function Fa(s,t){if(s==null)return null;let e=Te(s,t);return[e.x,e.y]}function Vu(s){let t=Te(s.size,"cutscene.size"),e=r=>{let a=en(s[r],`cutscene.${r}`);return{file:Pe(a,"file",`cutscene.${r}`),patch:Zn(a,"patch",`cutscene.${r}`).map((o,l)=>Te(o,`cutscene.${r}.patch[${l}]`))}},n=en(s.grid,"cutscene.grid"),i=Te(s.rigid,"cutscene.rigid");return{size:{width:t.x,height:t.y},foreground:Pe(s,"foreground","cutscene"),background:Pe(s,"background","cutscene"),eye:e("eye"),mouth:e("mouth"),grid:{columns:ln(n,"columns","cutscene.grid"),rows:ln(n,"rows","cutscene.grid"),extraRows:Zn(n,"extraRows","cutscene.grid").map((r,a)=>{if(typeof r!="number")throw new ge(`cutscene.grid.extraRows[${a}] \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);return r})},rigid:[i.x,i.y],deformers:Zn(s,"deformers","cutscene").map((r,a)=>{let o=`cutscene.deformers[${a}]`,l=en(r,o),c=l.gaussian===void 0?null:en(l.gaussian,`${o}.gaussian`);return{id:Pe(l,"id",o),gaussian:c?{center:Te(c.center,`${o}.gaussian.center`),radius:Te(c.radius,`${o}.gaussian.radius`)}:null,xRise:Fa(l.xRise,`${o}.xRise`),yRise:Fa(l.yRise,`${o}.yRise`),yFall:Fa(l.yFall,`${o}.yFall`),amp:Te(l.amp,`${o}.amp`),phase:ln(l,"phase",o)}}),sway:Te(s.sway,"cutscene.sway"),zoom:ln(s,"zoom","cutscene")}}function Nl(s){let t=en(s,"root"),e=Te(t.canvas,"canvas"),n={version:ln(t,"version","root"),character:Pe(t,"character","root"),canvas:{width:e.x,height:e.y},ground:Te(t.ground,"ground"),frames:Zn(t,"frames","root").map(Bu),effects:t.effects===void 0?[]:Zn(t,"effects","root").map(Hu),cutscene:null,meshCutscene:null};if(t.cutscene!==void 0){let r=en(t.cutscene,"cutscene");r.kind==="mesh"?n.meshCutscene=Vu(r):n.cutscene=zu(r)}if(n.frames.length===0)throw new ge("\uD504\uB808\uC784\uC774 \uD558\uB098\uB3C4 \uC5C6\uB2E4");let i=new Set;for(let r of n.frames){if(i.has(r.id))throw new ge(`\uD504\uB808\uC784 id \uAC00 \uC911\uBCF5\uB41C\uB2E4: ${r.id}`);i.add(r.id)}for(let r of n.frames)if(r.id.includes("skill")&&!r.bladeTip)throw new ge(`\uACF5\uACA9 \uD504\uB808\uC784\uC5D0 \uB0A0\uB05D\uC774 \uC5C6\uB2E4: ${r.id}`);return n}function Ol(s){let t=en(s,"bindings"),e={};for(let[n,i]of Object.entries(en(t.frames,"bindings.frames")))if(!n.startsWith("_")){if(!Array.isArray(i)||i.some(r=>typeof r!="string"))throw new ge(`bindings.frames.${n} \uAC00 \uBB38\uC790\uC5F4 \uBC30\uC5F4\uC774 \uC544\uB2C8\uB2E4`);e[n]=i}return{character:Pe(t,"character","bindings"),frames:e,ultimate:Yn(t.ultimate,"bindings.ultimate"),ultimateFrame:Gu(t.ultimateFrame,"bindings.ultimateFrame"),defeat:Yn(t.defeat,"bindings.defeat"),ready:Yn(t.ready,"bindings.ready"),readySlots:t.readySlots===void 0?null:Yn(t.readySlots,"bindings.readySlots"),dash:Yn(t.dash,"bindings.dash"),clash:Yn(t.clash,"bindings.clash"),recoil:Yn(t.recoil,"bindings.recoil"),glow:Yn(t.glow,"bindings.glow")}}function Yn(s,t){if(s===void 0)return[];if(!Array.isArray(s)||s.some(e=>typeof e!="string"))throw new ge(`${t} \uAC00 \uBB38\uC790\uC5F4 \uBC30\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return s}function Gu(s,t){if(s==null)return null;if(typeof s!="string")throw new ge(`${t} \uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return s}var er=class{constructor(t,e=Na){this.manifest=t;this.bindings=e;R(this,"framesById");R(this,"effectsById");this.framesById=new Map(t.frames.map(n=>[n.id,n])),this.effectsById=new Map(t.effects.map(n=>[n.id,n]));for(let[n,i]of Object.entries(e.frames)){this.frame(n);for(let r of i)this.effect(r)}for(let n of[...e.ultimate,...e.defeat,...e.glow])this.effect(n);e.ultimateFrame&&this.frame(e.ultimateFrame);for(let n of[...e.ready,...e.dash,...e.clash,...e.recoil])if(this.effect(n).anchor==="hitPoint")throw new ge(`\uC0AC\uAC74 \uC774\uD399\uD2B8\uC5D0 \uBA85\uC911 \uC12C\uAD11\uC744 \uC4F8 \uC218 \uC5C6\uB2E4: ${n}`)}get characterHeight(){let t=this.frameEndingWith("idle")??this.manifest.frames[0];if(!t)throw new ge("\uD504\uB808\uC784\uC774 \uD558\uB098\uB3C4 \uC5C6\uB2E4");return t.anchor.y-t.bbox[1]}effectsOnFrame(t){return this.bindings.frames[t]??[]}get ground(){return this.manifest.ground}frame(t){let e=this.framesById.get(t);if(!e)throw new ge(`\uD504\uB808\uC784\uC744 \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${t}`);return e}effect(t){let e=this.effectsById.get(t);if(!e)throw new ge(`\uC774\uD399\uD2B8\uB97C \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${t}`);return e}frameEndingWith(t){return this.manifest.frames.find(e=>e.id.endsWith(t))??null}effectsByAnchor(t){return this.manifest.effects.filter(e=>e.anchor===t)}frameSequence(t){let e=t==="ULT"?"-ult-":`skill${t[1]}`;return this.manifest.frames.filter(n=>n.id.includes(e)).map(n=>n.id)}};var Oa=["dash","flip","clash","clashTie","reveal","swing","hit","hitHeavy","guard","down","ultimate","result"],Sn=class extends Error{constructor(t){super(`ui-data: ${t}`),this.name="UiDataError"}};function Ae(s,t){if(typeof s!="object"||s===null||Array.isArray(s))throw new Sn(`${t} \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4`);return s}function Jt(s,t,e){let n=s[t];if(typeof n!="number"||!Number.isFinite(n))throw new Sn(`${e}.${t} \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);return n}function xe(s,t,e,n){let i=s[t];if(typeof i!="string"||i.length===0)throw new Sn(`${e}.${t} \uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4`);if(n&&!n.includes(i))throw new Sn(`${e}.${t} \uAC00 ${n.join(" | ")} \uC911 \uD558\uB098\uAC00 \uC544\uB2C8\uB2E4: ${i}`);return i}function nr(s,t,e){let n=s[t];if(!Array.isArray(n)||n.length!==2)throw new Sn(`${e}.${t} \uAC00 \uC22B\uC790 \uB450 \uAC1C\uC9DC\uB9AC \uBC30\uC5F4\uC774 \uC544\uB2C8\uB2E4`);let[i,r]=n;if(typeof i!="number"||typeof r!="number"||!Number.isFinite(i)||!Number.isFinite(r))throw new Sn(`${e}.${t} \uC758 \uAC12\uC774 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);if(i>r)throw new Sn(`${e}.${t} \uC758 \uCD5C\uC18C\uAC00 \uCD5C\uB300\uBCF4\uB2E4 \uD06C\uB2E4`);return[i,r]}function Bl(s){let t=Ae(s,"ui-data"),e=Ae(t.dash,"dash"),n=Ae(t.float,"float"),i=Ae(t.arrow,"arrow"),r=Ae(t.bar,"bar"),a=Ae(t.badge,"badge"),o=Ae(t.side,"side"),l=Ae(t.cutscene,"cutscene"),c=Ae(t.motion,"motion"),h=Ae(t.camera,"camera"),u=Ae(Ae(t.floatText,"floatText").colors,"floatText.colors"),d=Ae(t.sound,"sound"),p=Ae(d.gains,"sound.gains"),g=(y,m)=>{let f=Ae(t[y],y);return Object.fromEntries(m.map(b=>[b,Jt(f,b,y)]))};return{dash:{zoneWidth:Jt(e,"zoneWidth","dash"),zoneDepth:Jt(e,"zoneDepth","dash"),pairGap:Jt(e,"pairGap","dash"),lateralJitter:nr(e,"lateralJitter","dash"),depthJitter:Jt(e,"depthJitter","dash"),forward:Jt(e,"forward","dash"),safeDistance:Jt(e,"safeDistance","dash"),retries:Jt(e,"retries","dash"),speed:Jt(e,"speed","dash"),oneSided:xe(e,"oneSided","dash",["attackerOnly","both"])},float:{amplitude:Jt(n,"amplitude","float"),periodSec:Jt(n,"periodSec","float")},arrow:{start:xe(i,"start","arrow",["headCenter","selectedCard"]),curveHeight:Jt(i,"curveHeight","arrow"),segments:Jt(i,"segments","arrow"),drawSec:Jt(i,"drawSec","arrow"),headLength:Jt(i,"headLength","arrow"),headAngleDeg:Jt(i,"headAngleDeg","arrow"),colorStart:xe(i,"colorStart","arrow"),colorEnd:xe(i,"colorEnd","arrow"),allyColorStart:xe(i,"allyColorStart","arrow"),allyColorEnd:xe(i,"allyColorEnd","arrow")},bar:{width:Jt(r,"width","bar"),height:Jt(r,"height","bar"),gap:Jt(r,"gap","bar"),topMargin:Jt(r,"topMargin","bar"),tweenSec:Jt(r,"tweenSec","bar"),easing:xe(r,"easing","bar"),hpColor:xe(r,"hpColor","bar"),mentalityColor:xe(r,"mentalityColor","bar"),numberSize:Jt(r,"numberSize","bar")},badge:{rise:Jt(a,"rise","badge"),riseSec:Jt(a,"riseSec","badge"),deadlockMax:Jt(a,"deadlockMax","badge"),safeTop:Jt(a,"safeTop","badge")},side:{ally:xe(o,"ally","side"),enemy:xe(o,"enemy","side"),ringWidth:Jt(o,"ringWidth","side"),ringDepth:Jt(o,"ringDepth","side"),ringAlpha:Jt(o,"ringAlpha","side"),nameSize:Jt(o,"nameSize","side"),nameGap:Jt(o,"nameGap","side"),rowStagger:Jt(o,"rowStagger","side")},clash:g("clash",["cardSec","powerSec","resultSec","recoilWinner","recoilLoser","recoilSec","sparkSize","cardSize","powerSize","powerOffsetX","powerOffsetY","contactHeight"]),hitStop:g("hitStop",["clashSec","baseSec","perDamageSec","maxSec","slowScale","slowSec"]),damageText:g("damageText",["rise","sec","heavyDamage","height","size"]),banner:g("banner",["sec","height","offsetX","size"]),knockback:g("knockback",["distance","sec"]),flash:g("flash",["alpha","sec"]),exchange:g("exchange",["separateLoser","separateWinner","separateTie","separateSec","lingerSec","reengageSec","pullOut","reengageKick","roundFlashAlpha","roundFlashSec","roundShake","hitFlashAlpha","hitFlashSec"]),afterimage:g("afterimage",["count","intervalSec","alpha"]),motion:{...g("motion",["othersAlpha","windupMs","snapMs","lunge","lungeSec","breathe","breatheSec","hurtSec","swingHoldMs","follow","afterHitSec","blendMs","popScale","popMs","strikeGhosts","strikeGhostAlpha","poseKick","effectFadeMs","bodyGap","bodyGapSec","hurtAlpha","othersFadeSec"]),ghostColor:xe(c,"ghostColor","motion"),hurtColor:xe(c,"hurtColor","motion")},effects:g("effects",["minMs","glowAlpha","glowBlur"]),cutscene:{...g("cutscene",["sec","inSec","outSec","dim","bandSkewDeg","bandHeight","slideFrom","pushZoom","swaySec","flashAlpha"]),blinkAt:nr(l,"blinkAt","cutscene"),mouthAt:nr(l,"mouthAt","cutscene")},camera:{...g("camera",["focusZoom","punchZoom","punchSec","tiltDeg","slowmoScale","slowmoSec","shakeReferenceDamage"]),depthZoom:nr(h,"depthZoom","camera")},down:g("down",["sec","dim"]),floatText:{...g("floatText",["size","rise","sec","height","chipSize","chipGap"]),colors:{self:xe(u,"self","floatText.colors"),tick:xe(u,"tick","floatText.colors"),execute:xe(u,"execute","floatText.colors"),nullify:xe(u,"nullify","floatText.colors"),status:xe(u,"status","floatText.colors")}},result:g("result",["inSec","bandHeight","size"]),display:Wu(t.display),sound:{master:Jt(d,"master","sound"),gains:Object.fromEntries(Oa.map(y=>[y,Jt(p,y,"sound.gains")]))}}}function Wu(s){let t=Ae(s,"display"),e=(r,a)=>{let o=Ae(r,a);for(let l of Object.keys(o))xe(o,l,a);return o},n=Ae(t.cardKit,"display.cardKit"),i={};for(let[r,a]of Object.entries(n)){let o=e(a,`display.cardKit.${r}`);i[r]=Object.fromEntries(Object.entries(o).map(([l,c])=>{if(!/^\d+$/.test(l))throw new Sn(`display.cardKit.${r} \uC758 \uD0A4\uAC00 \uAE30\uC220 id \uAC00 \uC544\uB2C8\uB2E4: ${l}`);return[Number(l),c]}))}return{terms:e(t.terms,"display.terms"),cardKit:i}}async function ir(s){let t=await fetch(s);if(!t.ok)throw new Error(`${s} \uB97C \uC77D\uC744 \uC218 \uC5C6\uB2E4 (${t.status})`);return t.json()}async function Hl(s,t){let e;try{e=Nl(await ir(`${s}/${t}/sprite-manifest.json`))}catch{return null}let n=Na;try{n=Ol(await ir(`${s}/${t}/effect-bindings.json`))}catch{}return new er(e,n)}async function zl(s){let t=await ir(`${s}/index.json`),e=t&&typeof t=="object"?t.characters:null;if(!Array.isArray(e)||e.some(n=>typeof n!="string"))throw new Error("assets/index.json \uC758 characters \uAC00 \uBB38\uC790\uC5F4 \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4");return new Set(e)}async function Vl(s){return Bl(await ir(`${s}/ui/ui-data.json`))}var $u=["attack","defense","support"],Xu={attack:"\uAC01\uC778",defense:"\uD1B5\uCC30",support:"\uACB0\uC758"},qu={attack:"R_mark",defense:"R_insight",support:"R_resolve"},Yu="\uBA3C\uC800 \uCE60 \uC801\uC744 \uBB34\uB300\uC5D0\uC11C \uACE0\uB978\uB2E4",Zu="\uD589\uB3D9\uB825\uC774 \uBE5A \uD55C\uB3C4 \uC544\uB798\uB85C \uB0B4\uB824\uAC00 \uB354\uD560 \uC218 \uC5C6\uB2E4";function se(s,t="",e=""){let n=document.createElement(s);return t&&(n.className=t),e&&(n.textContent=e),n}var sr=class{constructor(t,e,n,i=()=>null,r=null){this.catalog=t;this.side=e;this.handlers=n;this.portrait=i;this.detail=r;R(this,"root");R(this,"step");R(this,"hint");R(this,"allies");R(this,"enemies");R(this,"cards");R(this,"detailLine");R(this,"goButton");R(this,"goLocked","");R(this,"detailRest",[]);let a=o=>{let l=document.getElementById(o);if(!l)throw new Error(`\uBA85\uB839 \uD328\uB110 \uC694\uC18C\uAC00 \uC5C6\uB2E4: #${o}`);return l};this.root=a("command"),this.step=a("cmd-step"),this.hint=a("cmd-hint"),this.allies=a("cmd-allies"),this.enemies=a("cmd-enemies"),this.cards=a("cmd-cards"),this.goButton=a("cmd-go"),this.detailLine=document.getElementById("cmd-detail"),this.goButton.addEventListener("click",()=>{this.goButton.getAttribute("aria-disabled")==="true"?this.say(this.goLocked):n.go()})}say(t){t&&this.hint.replaceChildren(se("strong","",t))}lock(t,e){t.classList.toggle("locked",e),t.setAttribute("aria-disabled",String(e))}showDetail(t,e=!1){this.detailLine&&(this.detailLine.replaceChildren(...t),e&&(this.detailRest=Array.from(this.detailLine.childNodes)))}view(t,e){let n=this.detail?.display;return Ui(this.catalog,e,{name:n?.cardKit[t]?.[e],terms:n?.terms})}glyph(t){let e=se("i","trace");return e.dataset.trace=t,this.detail?.kit&&e.style.setProperty("--glyph",`url(${this.detail.kit}/${qu[t]}.png)`),e}chanceText(t,e){let n=e.map(a=>this.detail?.chance(t,a)??null).filter(a=>a!==null).map(a=>Math.round(a*100));if(n.length===0)return"";let i=Math.min(...n),r=Math.max(...n);return i===r?`\uC55E\uBA74 \uD655\uB960 ${i}%`:`\uC55E\uBA74 \uD655\uB960 ${i}~${r}%`}traceNodes(t){let e=this.detail?.traces(t);if(!e)return[];let n=[];for(let r of $u){let a=se("span","trace-count");a.append(this.glyph(r),`${Xu[r]} ${e[r]}`),n.push(a)}let i=e.attack+e.defense+e.support;return n.push(se("span","trace-total",`\uACB0\uD589 ${Math.min(i,e.threshold)}/${e.threshold}`)),n}idle(t){this.root.classList.add("off"),this.step.textContent=t,this.hint.textContent="",this.showDetail([],!0),this.goButton.disabled=!0,this.lock(this.goButton,!0)}show(t,e,n){this.root.classList.remove("off");let i=e.find(l=>l.id===t.selectedAlly)??null,r=n.find(l=>l.id===t.selectedTarget)??null,a=t instanceof Fi?t:null;if(t.ready&&!i)this.step.textContent="\uC900\uBE44 \uC644\uB8CC \u2014 \uAD50\uC804 \uC2DC\uC791",this.hint.textContent="\uC544\uAD70 \uCE78\uC744 \uB204\uB974\uBA74 \uADF8 \uC9C0\uC2DC\uB97C \uB2E4\uC2DC \uD55C\uB2E4";else if(!i)this.step.textContent="\u2460 \uC544\uAD70\uC744 \uACE0\uB978\uB2E4",this.hint.textContent="";else if(r)if(a){this.step.textContent=`\u2462 ${i.name} \u2192 ${r.name} \u2014 \uC4F8 \uC21C\uC11C\uB300\uB85C \uCE74\uB4DC\uB97C \uB204\uB978\uB2E4`;let l=a.budgetOf(i.id);this.hint.replaceChildren(),l&&(this.hint.append(`\uD589\uB3D9\uB825 ${l.actionPoints} \u2192 \uC608\uC57D \uB4A4 `),this.hint.append(se("strong",l.after<0?"debt":"",String(l.after))),this.hint.append(` \xB7 \uC608\uC57D\uC774 \uB05D\uB098\uBA74 ${l.end}`),l.end<1&&this.hint.append(se("strong","debt"," \u2014 \uADF8\uB2E4\uC74C \uD134\uC740 \uD589\uB3D9 \uC5C6\uC774 \uB9DE\uB294\uB2E4")))}else this.step.textContent=`\u2462 ${i.name} \u2192 ${r.name} \u2014 \uCE74\uB4DC\uB97C \uACE0\uB978\uB2E4`,this.hint.textContent=t.wouldClash(r.id)?"\uD569\uC774 \uBC8C\uC5B4\uC9C4\uB2E4":"\uC77C\uBC29 \uACF5\uACA9\uC774\uB2E4 (\uC11C\uB85C \uACA8\uB8E8\uC9C0 \uC54A\uB294\uB2E4)";else{this.step.textContent=`\u2461 ${i.name} \u2014 \uCE60 \uC801\uC744 \uACE0\uB978\uB2E4`;let l=n.filter(c=>t.wouldClash(c.id)).map(c=>c.name);this.hint.innerHTML="",l.length>0?(this.hint.append("\uB098\uB97C \uB178\uB9AC\uB294 \uC801: "),this.hint.append(se("strong","",l.join(", "))),this.hint.append(" \u2014 \uAC19\uC774 \uB178\uB9AC\uBA74 \uD569, \uB2E4\uB978 \uC801\uC744 \uCE58\uBA74 \uC11C\uB85C \uD55C \uB300\uC529 \uB9DE\uB294\uB2E4")):this.hint.textContent="\uC774\uBC88 \uD134\uC5D0 \uB098\uB97C \uB178\uB9AC\uB294 \uC801\uC774 \uC5C6\uB2E4. \uB204\uAD6C\uB97C \uCCD0\uB3C4 \uC77C\uBC29 \uACF5\uACA9\uC774\uB2E4"}if(i){let l=this.chanceText(i.id,i.deck);this.showDetail([...l?[se("span","chance",l)]:[],...this.traceNodes(i.id)],!0)}else this.showDetail([],!0);this.allies.replaceChildren(...e.map(l=>{let c=t.orderOf(l.id),h=this.pick(l.name,this.side.ally,l.id===t.selectedAlly),u=this.portrait(l.characterId);if(u){let g=se("span","face"),y=se("img");y.src=u,y.alt="",g.append(y),h.prepend(g)}let d=a?.stepsOf(l.id)??[],p=d.length>0?d.map(g=>this.view(l.characterId,g.skillId).name).join(" \u2192 "):c?`${n.find(g=>g.id===c.targetId)?.name??"?"} \xB7 ${this.view(l.characterId,c.skillId).name}`:l.id===t.selectedAlly?"\uC9C0\uC2DC \uC911":"\uB300\uAE30";return h.append(se("small","",p)),c&&h.classList.add("done"),h.addEventListener("click",()=>this.handlers.ally(l.id)),h})),this.enemies.replaceChildren(...n.map(l=>{let c=this.pick(l.name,this.side.enemy,l.id===t.selectedTarget),h=t.wouldClash(l.id);return c.append(se("small","",h?"\uB098\uB97C \uB178\uB9BC \xB7 \uD569":"\uC77C\uBC29")),h&&c.classList.add("clash"),c.disabled=!i,c.addEventListener("click",()=>this.handlers.target(l.id)),c})),this.cards.replaceChildren(...(i?i.deck:[]).map(l=>{let c=this.view(i?.characterId??"",l),h=a&&i?a.stepsOf(i.id).findIndex(T=>T.skillId===l)+1:0,u=a?h>0:i?t.orderOf(i.id)?.skillId===l:!1,d=!!this.detail?.kit&&!!i&&this.detail.display?.cardKit[i.characterId]?.[l]!==void 0,p=se("button",`card ${c.slot==="ULT"?"ult":c.slot.toLowerCase()}${u?" chosen":""}${d?" k":""}`);if(p.type="button",d&&this.detail?.kit)for(let T of["default","selected","locked"])p.style.setProperty(`--k-${T}`,`url(${this.detail.kit}/K${l}_${T}.png)`);let g=c.attribute??"\uACB0\uD589";p.title=`${c.name} (${g}) \u2014 ${c.text}`,p.setAttribute("aria-label",`${c.name}, ${g}, \uC55E ${c.frontPower} \uB4A4 ${c.backPower}. ${c.text}`);let y=se("span","art");d||y.append(c.trace?this.glyph(c.trace):se("i","trace ult"));let m=se("span","pw front");m.append(se("small","","\uC55E"),String(c.frontPower));let f=se("span","pw back");f.append(se("small","","\uB4A4"),String(c.backPower)),p.append(se("span","title",c.name),y,m,f,se("span","kind",g)),a&&(h>0&&p.append(se("span","order",String(h))),p.append(se("span","cost",`\uD589\uB3D9 ${this.catalog.skill(l).apCost}`)));let b=!!a&&!!r&&!a.canToggle(l),v=!r||b;this.lock(p,v);let E=()=>{let T=i?this.detail?.chance(i.id,l):null,A=[se("strong","",c.name),` \u2014 ${c.text}`];T!=null&&A.push(se("span","chance",` \xB7 \uC55E\uBA74 ${Math.round(T*100)}%`)),this.showDetail(A)},C=()=>this.showDetail(this.detailRest);return p.addEventListener("pointerenter",E),p.addEventListener("focus",E),p.addEventListener("pointerleave",C),p.addEventListener("blur",C),p.addEventListener("click",()=>{v?this.say(b?Zu:Yu):this.handlers.card(l)}),p}));let o=e.filter(l=>!t.orderOf(l.id)).map(l=>l.name);this.goLocked=o.length>0?`${a?"\uC608\uC57D\uC774":"\uC9C0\uC2DC\uAC00"} \uB0A8\uC740 \uC544\uAD70: ${o.join(", ")}`:"",this.goButton.disabled=!1,this.lock(this.goButton,!t.ready)}pick(t,e,n){let i=se("button","pick");return i.type="button",i.style.setProperty("--side",e),i.setAttribute("aria-pressed",String(n)),i.append(se("b","",t)),i}};function Ju(s){let t=s.createBuffer(1,s.sampleRate,s.sampleRate),e=t.getChannelData(0);for(let n=0;n<e.length;n+=1)e[n]=Math.random()*2-1;return t}var rr=class{constructor(t){this.data=t;R(this,"audio",null);R(this,"master",null);R(this,"noise",null);R(this,"muted",!1);R(this,"recipes");R(this,"pending",new Map);R(this,"samples",new Map);this.recipes={dash:(e,n,i)=>this.whoosh(e,n,i,700,2600,.24),flip:(e,n,i)=>{this.ping(e,n,i,2500,.07,.5),this.ping(e,n,i+.02,3700,.05,.3)},clash:(e,n,i)=>this.metal(e,n,i,1,.55),clashTie:(e,n,i)=>this.metal(e,n,i,.8,.35),reveal:(e,n,i)=>{this.ping(e,n,i,1760,.45,.9),this.ping(e,n,i,3520,.3,.35)},swing:(e,n,i)=>this.whoosh(e,n,i,400,1800,.2),hit:(e,n,i)=>{this.drop(e,n,i,150,45,.2,"sine",1),this.burst(e,n,i,"lowpass",1400,.08,.7)},hitHeavy:(e,n,i)=>{this.drop(e,n,i,120,32,.34,"sine",1),this.drop(e,n,i,240,60,.12,"square",.25),this.burst(e,n,i,"lowpass",2200,.16,.9)},guard:(e,n,i)=>{this.metal(e,n,i,1.4,.18),this.drop(e,n,i,320,200,.12,"triangle",.5)},down:(e,n,i)=>{this.drop(e,n,i,85,28,.7,"sine",1),this.burst(e,n,i,"lowpass",420,.55,.6)},ultimate:(e,n,i)=>{this.whoosh(e,n,i,200,4200,.7),this.drop(e,n,i,55,50,1.1,"sawtooth",.18)},result:(e,n,i)=>{this.tone(e,n,i,196,1.4,.4),this.tone(e,n,i+.08,294,1.3,.3)}}}unlock(){if(!this.audio){let e=globalThis.AudioContext;if(!e)return;this.audio=new e,this.master=this.audio.createGain(),this.master.gain.value=this.data.master,this.master.connect(this.audio.destination),this.noise=Ju(this.audio)}let t=globalThis.navigator?.audioSession;if(t&&(t.type="playback"),this.audio.state!=="running"){this.audio.resume().catch(()=>{});let e=this.audio.createBufferSource();e.buffer=this.audio.createBuffer(1,1,22050),e.connect(this.audio.destination),e.start(0)}this.decodePending()}get running(){return this.audio?.state==="running"}addSample(t,e){this.pending.set(t,e),this.decodePending()}decodePending(){let t=this.audio;if(t)for(let[e,n]of this.pending)this.pending.delete(e),t.decodeAudioData(n).then(i=>this.samples.set(e,i),()=>{})}playSample(t,e=1,n={}){let i=this.audio,r=this.samples.get(t);if(!i||!this.master||!r)return!1;if(this.muted||i.state!=="running")return!0;let a=i.createBufferSource();a.buffer=r;let o=i.createGain();o.gain.value=e,a.connect(o);let l=Math.max(-1,Math.min(1,n.pan??0));if(l!==0&&typeof i.createStereoPanner=="function"){let c=i.createStereoPanner();c.pan.value=l,o.connect(c),c.connect(this.master)}else o.connect(this.master);return a.start(i.currentTime+.005+Math.max(0,n.delay??0)),!0}setMuted(t){this.muted=t}play(t){let e=this.audio;if(!e||!this.master||this.muted||e.state!=="running")return;let n=this.data.gains[t];if(!(n>0)||!Oa.includes(t))return;let i=e.createGain();i.gain.value=n,i.connect(this.master),this.recipes[t](e,i,e.currentTime+.005)}envelope(t,e,n,i){let r=t.createGain();return r.gain.setValueAtTime(1e-4,e),r.gain.exponentialRampToValueAtTime(Math.max(2e-4,n),e+.006),r.gain.exponentialRampToValueAtTime(1e-4,e+i),r}drop(t,e,n,i,r,a,o,l){let c=t.createOscillator();c.type=o,c.frequency.setValueAtTime(i,n),c.frequency.exponentialRampToValueAtTime(Math.max(1,r),n+a);let h=this.envelope(t,n,l,a);c.connect(h).connect(e),c.start(n),c.stop(n+a+.02)}ping(t,e,n,i,r,a){this.drop(t,e,n,i,i*.98,r,"sine",a)}tone(t,e,n,i,r,a){let o=t.createOscillator();o.type="triangle",o.frequency.value=i;let l=t.createGain();l.gain.setValueAtTime(1e-4,n),l.gain.exponentialRampToValueAtTime(a,n+.12),l.gain.exponentialRampToValueAtTime(1e-4,n+r),o.connect(l).connect(e),o.start(n),o.stop(n+r+.02)}burst(t,e,n,i,r,a,o){if(!this.noise)return;let l=t.createBufferSource();l.buffer=this.noise;let c=t.createBiquadFilter();c.type=i,c.frequency.value=r;let h=this.envelope(t,n,o,a);l.connect(c).connect(h).connect(e),l.start(n,Math.random()*.5),l.stop(n+a+.02)}whoosh(t,e,n,i,r,a){if(!this.noise)return;let o=t.createBufferSource();o.buffer=this.noise;let l=t.createBiquadFilter();l.type="bandpass",l.Q.value=1.4,l.frequency.setValueAtTime(i,n),l.frequency.exponentialRampToValueAtTime(r,n+a*.7);let c=t.createGain();c.gain.setValueAtTime(1e-4,n),c.gain.exponentialRampToValueAtTime(.8,n+a*.35),c.gain.exponentialRampToValueAtTime(1e-4,n+a),o.connect(l).connect(c).connect(e),o.start(n,Math.random()*.4),o.stop(n+a+.02)}metal(t,e,n,i,r){[520,1230,1870,2750,3910].forEach((o,l)=>{let c=t.createOscillator();c.type="sine",c.frequency.value=o*i;let h=this.envelope(t,n,.35/(l+1),r*(1-l*.12));c.connect(h).connect(e),c.start(n),c.stop(n+r+.02)}),this.burst(t,e,n,"highpass",2400,.05,.9)}};var Xe=class extends Error{constructor(t){super(`stage3d: ${t}`),this.name="Stage3dConfigError"}};function nn(s,t){if(typeof s!="object"||s===null||Array.isArray(s))throw new Xe(`${t} \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4`);return s}function oe(s,t,e){let n=nn(s,t),i={};for(let r of e){let a=n[r];if(Array.isArray(a)){if(a.some(o=>typeof o!="number"))throw new Xe(`${t}.${r} \uC5D0 \uC22B\uC790\uAC00 \uC544\uB2CC \uAC12\uC774 \uC788\uB2E4`);i[r]=a}else if(typeof a=="number"&&Number.isFinite(a))i[r]=a;else throw new Xe(`${t}.${r} \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`)}return i}function Wl(s){let t=nn(s,"stage3d");return{battle:ju(t.battle),layout:oe(t.layout,"layout",["characterHeight","sideHalfGap","rowDepth","rowOutward","textureMaxSide"]),motion:oe(t.motion,"motion",["windupTime","windupBack","dashTime","contactGap","strikeTime","strikeReach","knockTime","knockBase","knockPerDamage","knockMax","staggerDrop","staggerHold","lingerAfterHit","strikeTrailTime","strikeTrailPeakShare","settleTime","settleAmplitude","settlePeriod","returnTime","clashWinnerRecoil","clashPush","deadlockPush","reengageTime","roundRest","downTime","downSink","downOpacity","heavyDamage","bystanderFade","foregroundFade","readyHold","followTime","hitKnock","parryLunge","hitSlowScale","hitSlowTime","followSpeed","decayEase"]),camera:oe(t.camera,"camera",["focusSizeGain","focusHeight","panYawDeg","dutchDeg","fovZoom","followTime","returnFollowTime","fitShare"]),shake:oe(t.shake,"shake",["damageForMaxShake","traumaPerHit","traumaPerDamage","traumaDecay","maxOffset","maxAngle","frequency","kickImpulse","kickStiffness","kickDamping","fovPunch","clashPower"]),hitStop:oe(t.hitStop,"hitStop",["scale","baseSeconds","perDamageSeconds","maxSeconds","clashSeconds"]),sparks:oe(t.sparks,"sparks",["countHit","countClash","speedMin","speedMax","gravity","drag","lifeMin","lifeMax","length","width","coneDeg","backShare","coreSize","coreLife","contactBias"]),callout:oe(t.callout,"callout",["seconds","headOffset"]),cardFlip:oe(t.cardFlip,"cardFlip",["slowScale","approachShare","spinTime","spinTurns","revealPop","holdTime","height","headLift","fadeTime"]),footGauge:oe(t.footGauge,"footGauge",["widthRatio","minWidth","maxWidth","criticalRatio","lossSeconds","downFade"]),framing:oe(t.framing,"framing",["maxZoomOut","cover","tagMargin","footMargin","sideMargin","bodyHalfWidth","headHeight"]),lab:Qu(t.lab),impact:td(t.impact),ambient:ed(t.ambient),tempo:oe(t.tempo,"tempo",["restSeconds"])}}function ju(s){let t=nn(s,"battle"),e=r=>{let a=t[r];if(!Array.isArray(a)||a.length===0||a.some(o=>typeof o!="string"))throw new Xe(`battle.${r} \uAC00 \uCE90\uB9AD\uD130 id \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4`);return a};if(typeof t.map!="string")throw new Xe("battle.map \uC774 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4");let n=nn(t.artAlias??{},"battle.artAlias"),i={};for(let[r,a]of Object.entries(n))typeof a=="string"&&(i[r]=a);return{map:t.map,ally:e("ally"),enemy:e("enemy"),artAlias:i}}function Ba(s){let t=nn(s,"placement"),e=nn(t.projection,"placement.projection"),n=oe(e.camera,"projection.camera",["back","height","lookAtHeight","fov","aspect"]),i=e.standSpread,r=e.scaleAnchor;if(typeof i!="number")throw new Xe("projection.standSpread \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4");if(!Array.isArray(r)||r.length!==2||r.some(g=>typeof g!="number"))throw new Xe("projection.scaleAnchor \uAC00 \uC22B\uC790 2\uAC1C\uAC00 \uC544\uB2C8\uB2E4");let a=nn(e.layers,"projection.layers"),o=t.layers;if(!Array.isArray(o))throw new Xe("placement.layers \uAC00 \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4");let l=[];for(let[g,y]of Object.entries(a)){let m=nn(y,`projection.layers.${g}`),f=o.map(E=>nn(E,"placement.layers[]")).find(E=>E.id===g);if(!f)throw new Xe(`placement.layers \uC5D0 ${g} \uAC00 \uC5C6\uB2E4`);let b=(E,C)=>typeof m[E]=="number"?m[E]:C,v=m.shape==="floor"?"floor":"stand";l.push({file:String(f.file),rect:[Number(f.x),Number(f.y),Number(f.width),Number(f.height)],shape:v,depth:b("depth",20),scale:b("scale",1),offsetY:b("offsetY",0),near:b("near",-8),far:b("far",40),halfWidth:b("halfWidth",45),mirrorX:m.mirrorOutsideX===!0,mirrorY:m.mirrorOutsideY===!0,order:b("order",v==="floor"?-10:-20),hideInCombat:m.hideInCombat===!0,draws:Ku(f.draws,g)})}let c=typeof t.name=="string"?t.name:"",h=t.viewport,u=Array.isArray(h)&&h.length===2&&h.every(g=>typeof g=="number")?[h[0],h[1]]:[1672,941],d=t.surface,p=typeof d=="object"&&d!==null&&!Array.isArray(d)?{kind:String(d.kind??"concrete"),tint:String(d.tint??"#909090"),crack:String(d.crack??"#262626")}:{kind:"concrete",tint:"#909090",crack:"#262626"};return{name:c,viewport:u,camera:n,standSpread:i,scaleAnchor:[r[0],r[1]],layers:l,surface:p}}function Gl(s,t){if(!Array.isArray(s)||s.length!==4||s.some(e=>typeof e!="number"))throw new Xe(`${t} \uAC00 \uC22B\uC790 4\uAC1C\uAC00 \uC544\uB2C8\uB2E4`);return s}function Ku(s,t){if(s===void 0)return[];if(!Array.isArray(s))throw new Xe(`placement.layers.${t}.draws \uAC00 \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4`);return s.map((e,n)=>{let i=nn(e,`placement.layers.${t}.draws[${n}]`);return{source:Gl(i.source,`${t}.draws[${n}].source`),destination:Gl(i.destination,`${t}.draws[${n}].destination`)}})}function Qu(s){let t=nn(s,"lab"),e=r=>oe(t[r],`lab.${r}`,["light","heavy","climax"]),n=oe(t,"lab",["attackerHold","finalBeatPause"]),i=oe(t.ultimate,"lab.ultimate",["payoffDelay","slashIntervals"]);if(!Array.isArray(i.slashIntervals)||i.slashIntervals.length===0)throw new Xe("lab.ultimate.slashIntervals \uAC00 \uC22B\uC790 \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4");return{hitStop:e("hitStop"),attackerHold:n.attackerHold,finalBeatPause:n.finalBeatPause,shake:e("shake"),dim:oe(t.dim,"lab.dim",["level","in","hold","out"]),impactFrame:oe(t.impactFrame,"lab.impactFrame",["seconds"]),breath:oe(t.breath,"lab.breath",["amplitude","period"]),pan:oe(t.pan,"lab.pan",["width"]),voiceGain:oe(t.voiceGain,"lab.voiceGain",["intermediate","final"]),ultimate:i}}function td(s){let t=nn(s,"impact");return{dim:oe(t.dim,"impact.dim",["level","in","hold","out"]),flash:oe(t.flash,"impact.flash",["alpha","seconds"])}}function ed(s){let t=nn(s,"ambient");return{dust:oe(t.dust,"ambient.dust",["count","size","rise","drift","opacity","near","far","width","height"]),drips:oe(t.drips,"ambient.drips",["count","speed","length","top","ringSize","ringTime","opacity","depthMin","depthMax","width"]),fog:oe(t.fog,"ambient.fog",["layers","height","width","speed","opacity","depthMin","depthMax"])}}var sl="160";var nd=0,$l=1,id=2;var _h=1,sd=2,Fn=3,li=0,Ze=1,We=2;var ii=0,si=1,Hn=2,Xl=3,ql=4,rd=5,xi=100,ad=101,od=102,Yl=103,Zl=104,ld=200,cd=201,hd=202,ud=203,bo=204,_o=205,dd=206,fd=207,pd=208,md=209,gd=210,yd=211,vd=212,xd=213,bd=214,_d=0,Sd=1,Md=2,Ur=3,wd=4,Ed=5,Td=6,Ad=7,Sh=0,Cd=1,Rd=2,ri=0,Pd=1,Id=2,Ld=3,Dd=4,kd=5,Ud=6;var Mh=300,os=301,ls=302,So=303,Mo=304,ra=306,ks=1e3,Ye=1001,cs=1002,Ge=1003,Jl=1004;var Ha=1005;var hn=1006,Fd=1007;var Us=1008;var ai=1009,Nd=1010,Od=1011,rl=1012,wh=1013,ei=1014,ni=1015,Fs=1016,Eh=1017,Th=1018,Si=1020,Bd=1021,vn=1023,Hd=1024,zd=1025,Mi=1026,hs=1027,Vd=1028,Ah=1029,Gd=1030,Ch=1031,Rh=1033,za=33776,Va=33777,Ga=33778,Wa=33779,jl=35840,Kl=35841,Ql=35842,tc=35843,Ph=36196,ec=37492,nc=37496,ic=37808,sc=37809,rc=37810,ac=37811,oc=37812,lc=37813,cc=37814,hc=37815,uc=37816,dc=37817,fc=37818,pc=37819,mc=37820,gc=37821,$a=36492,yc=36494,vc=36495,Wd=36283,xc=36284,bc=36285,_c=36286;var Fr=2300,Nr=2301,Xa=2302,Sc=2400,Mc=2401,wc=2402;var Ih=3e3,wi=3001,$d=3200,Xd=3201,qd=0,Yd=1,un="",Zt="srgb",zn="srgb-linear",al="display-p3",aa="display-p3-linear",Or="linear",le="srgb",Br="rec709",Hr="p3";var Ni=7680;var Ec=519,Zd=512,Jd=513,jd=514,Lh=515,Kd=516,Qd=517,tf=518,ef=519,wo=35044;var Tc="300 es",Eo=1035,Bn=2e3,zr=2001,ci=class{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){if(this._listeners===void 0)return!1;let n=this._listeners;return n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){if(this._listeners===void 0)return;let i=this._listeners[t];if(i!==void 0){let r=i.indexOf(e);r!==-1&&i.splice(r,1)}}dispatchEvent(t){if(this._listeners===void 0)return;let n=this._listeners[t.type];if(n!==void 0){t.target=this;let i=n.slice(0);for(let r=0,a=i.length;r<a;r++)i[r].call(this,t);t.target=null}}},ke=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];var qa=Math.PI/180,To=180/Math.PI;function oi(){let s=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(ke[s&255]+ke[s>>8&255]+ke[s>>16&255]+ke[s>>24&255]+"-"+ke[t&255]+ke[t>>8&255]+"-"+ke[t>>16&15|64]+ke[t>>24&255]+"-"+ke[e&63|128]+ke[e>>8&255]+"-"+ke[e>>16&255]+ke[e>>24&255]+ke[n&255]+ke[n>>8&255]+ke[n>>16&255]+ke[n>>24&255]).toLowerCase()}function qe(s,t,e){return Math.max(t,Math.min(e,s))}function nf(s,t){return(s%t+t)%t}function Ya(s,t,e){return(1-e)*s+e*t}function Ac(s){return(s&s-1)===0&&s!==0}function Ao(s){return Math.pow(2,Math.floor(Math.log(s)/Math.LN2))}function On(s,t){switch(t.constructor){case Float32Array:return s;case Uint32Array:return s/4294967295;case Uint16Array:return s/65535;case Uint8Array:return s/255;case Int32Array:return Math.max(s/2147483647,-1);case Int16Array:return Math.max(s/32767,-1);case Int8Array:return Math.max(s/127,-1);default:throw new Error("Invalid component type.")}}function re(s,t){switch(t.constructor){case Float32Array:return s;case Uint32Array:return Math.round(s*4294967295);case Uint16Array:return Math.round(s*65535);case Uint8Array:return Math.round(s*255);case Int32Array:return Math.round(s*2147483647);case Int16Array:return Math.round(s*32767);case Int8Array:return Math.round(s*127);default:throw new Error("Invalid component type.")}}var Ft=class s{constructor(t=0,e=0){s.prototype.isVector2=!0,this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){let e=this.x,n=this.y,i=t.elements;return this.x=i[0]*e+i[3]*n+i[6],this.y=i[1]*e+i[4]*n+i[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=Math.max(t.x,Math.min(e.x,this.x)),this.y=Math.max(t.y,Math.min(e.y,this.y)),this}clampScalar(t,e){return this.x=Math.max(t,Math.min(e,this.x)),this.y=Math.max(t,Math.min(e,this.y)),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(t,Math.min(e,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(qe(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){let n=Math.cos(e),i=Math.sin(e),r=this.x-t.x,a=this.y-t.y;return this.x=r*n-a*i+t.x,this.y=r*i+a*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},Wt=class s{constructor(t,e,n,i,r,a,o,l,c){s.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,i,r,a,o,l,c)}set(t,e,n,i,r,a,o,l,c){let h=this.elements;return h[0]=t,h[1]=i,h[2]=o,h[3]=e,h[4]=r,h[5]=l,h[6]=n,h[7]=a,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){let e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,i=e.elements,r=this.elements,a=n[0],o=n[3],l=n[6],c=n[1],h=n[4],u=n[7],d=n[2],p=n[5],g=n[8],y=i[0],m=i[3],f=i[6],b=i[1],v=i[4],E=i[7],C=i[2],T=i[5],A=i[8];return r[0]=a*y+o*b+l*C,r[3]=a*m+o*v+l*T,r[6]=a*f+o*E+l*A,r[1]=c*y+h*b+u*C,r[4]=c*m+h*v+u*T,r[7]=c*f+h*E+u*A,r[2]=d*y+p*b+g*C,r[5]=d*m+p*v+g*T,r[8]=d*f+p*E+g*A,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],a=t[4],o=t[5],l=t[6],c=t[7],h=t[8];return e*a*h-e*o*c-n*r*h+n*o*l+i*r*c-i*a*l}invert(){let t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],a=t[4],o=t[5],l=t[6],c=t[7],h=t[8],u=h*a-o*c,d=o*l-h*r,p=c*r-a*l,g=e*u+n*d+i*p;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);let y=1/g;return t[0]=u*y,t[1]=(i*c-h*n)*y,t[2]=(o*n-i*a)*y,t[3]=d*y,t[4]=(h*e-i*l)*y,t[5]=(i*r-o*e)*y,t[6]=p*y,t[7]=(n*l-c*e)*y,t[8]=(a*e-n*r)*y,this}transpose(){let t,e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){let e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,i,r,a,o){let l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*a+c*o)+a+t,-i*c,i*l,-i*(-c*a+l*o)+o+e,0,0,1),this}scale(t,e){return this.premultiply(Za.makeScale(t,e)),this}rotate(t){return this.premultiply(Za.makeRotation(-t)),this}translate(t,e){return this.premultiply(Za.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){let e=this.elements,n=t.elements;for(let i=0;i<9;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}},Za=new Wt;function Dh(s){for(let t=s.length-1;t>=0;--t)if(s[t]>=65535)return!0;return!1}function Vr(s){return document.createElementNS("http://www.w3.org/1999/xhtml",s)}function sf(){let s=Vr("canvas");return s.style.display="block",s}var Cc={};function Ls(s){s in Cc||(Cc[s]=!0,console.warn(s))}var Rc=new Wt().set(.8224621,.177538,0,.0331941,.9668058,0,.0170827,.0723974,.9105199),Pc=new Wt().set(1.2249401,-.2249404,0,-.0420569,1.0420571,0,-.0196376,-.0786361,1.0982735),ar={[zn]:{transfer:Or,primaries:Br,toReference:s=>s,fromReference:s=>s},[Zt]:{transfer:le,primaries:Br,toReference:s=>s.convertSRGBToLinear(),fromReference:s=>s.convertLinearToSRGB()},[aa]:{transfer:Or,primaries:Hr,toReference:s=>s.applyMatrix3(Pc),fromReference:s=>s.applyMatrix3(Rc)},[al]:{transfer:le,primaries:Hr,toReference:s=>s.convertSRGBToLinear().applyMatrix3(Pc),fromReference:s=>s.applyMatrix3(Rc).convertLinearToSRGB()}},rf=new Set([zn,aa]),ie={enabled:!0,_workingColorSpace:zn,get workingColorSpace(){return this._workingColorSpace},set workingColorSpace(s){if(!rf.has(s))throw new Error(`Unsupported working color space, "${s}".`);this._workingColorSpace=s},convert:function(s,t,e){if(this.enabled===!1||t===e||!t||!e)return s;let n=ar[t].toReference,i=ar[e].fromReference;return i(n(s))},fromWorkingColorSpace:function(s,t){return this.convert(s,this._workingColorSpace,t)},toWorkingColorSpace:function(s,t){return this.convert(s,t,this._workingColorSpace)},getPrimaries:function(s){return ar[s].primaries},getTransfer:function(s){return s===un?Or:ar[s].transfer}};function rs(s){return s<.04045?s*.0773993808:Math.pow(s*.9478672986+.0521327014,2.4)}function Ja(s){return s<.0031308?s*12.92:1.055*Math.pow(s,.41666)-.055}var Oi,Gr=class{static getDataURL(t){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let e;if(t instanceof HTMLCanvasElement)e=t;else{Oi===void 0&&(Oi=Vr("canvas")),Oi.width=t.width,Oi.height=t.height;let n=Oi.getContext("2d");t instanceof ImageData?n.putImageData(t,0,0):n.drawImage(t,0,0,t.width,t.height),e=Oi}return e.width>2048||e.height>2048?(console.warn("THREE.ImageUtils.getDataURL: Image converted to jpg for performance reasons",t),e.toDataURL("image/jpeg",.6)):e.toDataURL("image/png")}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){let e=Vr("canvas");e.width=t.width,e.height=t.height;let n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);let i=n.getImageData(0,0,t.width,t.height),r=i.data;for(let a=0;a<r.length;a++)r[a]=rs(r[a]/255)*255;return n.putImageData(i,0,0),e}else if(t.data){let e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(rs(e[n]/255)*255):e[n]=rs(e[n]);return{data:e,width:t.width,height:t.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}},af=0,Wr=class{constructor(t=null){this.isSource=!0,Object.defineProperty(this,"id",{value:af++}),this.uuid=oi(),this.data=t,this.version=0}set needsUpdate(t){t===!0&&this.version++}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];let n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let r;if(Array.isArray(i)){r=[];for(let a=0,o=i.length;a<o;a++)i[a].isDataTexture?r.push(ja(i[a].image)):r.push(ja(i[a]))}else r=ja(i);n.url=r}return e||(t.images[this.uuid]=n),n}};function ja(s){return typeof HTMLImageElement<"u"&&s instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&s instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&s instanceof ImageBitmap?Gr.getDataURL(s):s.data?{data:Array.from(s.data),width:s.width,height:s.height,type:s.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}var of=0,Re=class s extends ci{constructor(t=s.DEFAULT_IMAGE,e=s.DEFAULT_MAPPING,n=Ye,i=Ye,r=hn,a=Us,o=vn,l=ai,c=s.DEFAULT_ANISOTROPY,h=un){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:of++}),this.uuid=oi(),this.name="",this.source=new Wr(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=r,this.minFilter=a,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new Ft(0,0),this.repeat=new Ft(1,1),this.center=new Ft(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Wt,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,typeof h=="string"?this.colorSpace=h:(Ls("THREE.Texture: Property .encoding has been replaced by .colorSpace."),this.colorSpace=h===wi?Zt:un),this.userData={},this.version=0,this.onUpdate=null,this.isRenderTargetTexture=!1,this.needsPMREMUpdate=!1}get image(){return this.source.data}set image(t=null){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];let n={metadata:{version:4.6,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==Mh)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case ks:t.x=t.x-Math.floor(t.x);break;case Ye:t.x=t.x<0?0:1;break;case cs:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case ks:t.y=t.y-Math.floor(t.y);break;case Ye:t.y=t.y<0?0:1;break;case cs:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}get encoding(){return Ls("THREE.Texture: Property .encoding has been replaced by .colorSpace."),this.colorSpace===Zt?wi:Ih}set encoding(t){Ls("THREE.Texture: Property .encoding has been replaced by .colorSpace."),this.colorSpace=t===wi?Zt:un}};Re.DEFAULT_IMAGE=null;Re.DEFAULT_MAPPING=Mh;Re.DEFAULT_ANISOTROPY=1;var Ie=class s{constructor(t=0,e=0,n=0,i=1){s.prototype.isVector4=!0,this.x=t,this.y=e,this.z=n,this.w=i}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,i){return this.x=t,this.y=e,this.z=n,this.w=i,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){let e=this.x,n=this.y,i=this.z,r=this.w,a=t.elements;return this.x=a[0]*e+a[4]*n+a[8]*i+a[12]*r,this.y=a[1]*e+a[5]*n+a[9]*i+a[13]*r,this.z=a[2]*e+a[6]*n+a[10]*i+a[14]*r,this.w=a[3]*e+a[7]*n+a[11]*i+a[15]*r,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);let e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,i,r,l=t.elements,c=l[0],h=l[4],u=l[8],d=l[1],p=l[5],g=l[9],y=l[2],m=l[6],f=l[10];if(Math.abs(h-d)<.01&&Math.abs(u-y)<.01&&Math.abs(g-m)<.01){if(Math.abs(h+d)<.1&&Math.abs(u+y)<.1&&Math.abs(g+m)<.1&&Math.abs(c+p+f-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;let v=(c+1)/2,E=(p+1)/2,C=(f+1)/2,T=(h+d)/4,A=(u+y)/4,X=(g+m)/4;return v>E&&v>C?v<.01?(n=0,i=.707106781,r=.707106781):(n=Math.sqrt(v),i=T/n,r=A/n):E>C?E<.01?(n=.707106781,i=0,r=.707106781):(i=Math.sqrt(E),n=T/i,r=X/i):C<.01?(n=.707106781,i=.707106781,r=0):(r=Math.sqrt(C),n=A/r,i=X/r),this.set(n,i,r,e),this}let b=Math.sqrt((m-g)*(m-g)+(u-y)*(u-y)+(d-h)*(d-h));return Math.abs(b)<.001&&(b=1),this.x=(m-g)/b,this.y=(u-y)/b,this.z=(d-h)/b,this.w=Math.acos((c+p+f-1)/2),this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=Math.max(t.x,Math.min(e.x,this.x)),this.y=Math.max(t.y,Math.min(e.y,this.y)),this.z=Math.max(t.z,Math.min(e.z,this.z)),this.w=Math.max(t.w,Math.min(e.w,this.w)),this}clampScalar(t,e){return this.x=Math.max(t,Math.min(e,this.x)),this.y=Math.max(t,Math.min(e,this.y)),this.z=Math.max(t,Math.min(e,this.z)),this.w=Math.max(t,Math.min(e,this.w)),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(t,Math.min(e,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},Co=class extends ci{constructor(t=1,e=1,n={}){super(),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=1,this.scissor=new Ie(0,0,t,e),this.scissorTest=!1,this.viewport=new Ie(0,0,t,e);let i={width:t,height:e,depth:1};n.encoding!==void 0&&(Ls("THREE.WebGLRenderTarget: option.encoding has been replaced by option.colorSpace."),n.colorSpace=n.encoding===wi?Zt:un),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:hn,depthBuffer:!0,stencilBuffer:!1,depthTexture:null,samples:0},n),this.texture=new Re(i,n.mapping,n.wrapS,n.wrapT,n.magFilter,n.minFilter,n.format,n.type,n.anisotropy,n.colorSpace),this.texture.isRenderTargetTexture=!0,this.texture.flipY=!1,this.texture.generateMipmaps=n.generateMipmaps,this.texture.internalFormat=n.internalFormat,this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.depthTexture=n.depthTexture,this.samples=n.samples}setSize(t,e,n=1){(this.width!==t||this.height!==e||this.depth!==n)&&(this.width=t,this.height=e,this.depth=n,this.texture.image.width=t,this.texture.image.height=e,this.texture.image.depth=n,this.dispose()),this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.texture=t.texture.clone(),this.texture.isRenderTargetTexture=!0;let e=Object.assign({},t.texture.image);return this.texture.source=new Wr(e),this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,t.depthTexture!==null&&(this.depthTexture=t.depthTexture.clone()),this.samples=t.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}},Vn=class extends Co{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}},$r=class extends Re{constructor(t=null,e=1,n=1,i=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:i},this.magFilter=Ge,this.minFilter=Ge,this.wrapR=Ye,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var Ro=class extends Re{constructor(t=null,e=1,n=1,i=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:i},this.magFilter=Ge,this.minFilter=Ge,this.wrapR=Ye,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var je=class{constructor(t=0,e=0,n=0,i=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=i}static slerpFlat(t,e,n,i,r,a,o){let l=n[i+0],c=n[i+1],h=n[i+2],u=n[i+3],d=r[a+0],p=r[a+1],g=r[a+2],y=r[a+3];if(o===0){t[e+0]=l,t[e+1]=c,t[e+2]=h,t[e+3]=u;return}if(o===1){t[e+0]=d,t[e+1]=p,t[e+2]=g,t[e+3]=y;return}if(u!==y||l!==d||c!==p||h!==g){let m=1-o,f=l*d+c*p+h*g+u*y,b=f>=0?1:-1,v=1-f*f;if(v>Number.EPSILON){let C=Math.sqrt(v),T=Math.atan2(C,f*b);m=Math.sin(m*T)/C,o=Math.sin(o*T)/C}let E=o*b;if(l=l*m+d*E,c=c*m+p*E,h=h*m+g*E,u=u*m+y*E,m===1-o){let C=1/Math.sqrt(l*l+c*c+h*h+u*u);l*=C,c*=C,h*=C,u*=C}}t[e]=l,t[e+1]=c,t[e+2]=h,t[e+3]=u}static multiplyQuaternionsFlat(t,e,n,i,r,a){let o=n[i],l=n[i+1],c=n[i+2],h=n[i+3],u=r[a],d=r[a+1],p=r[a+2],g=r[a+3];return t[e]=o*g+h*u+l*p-c*d,t[e+1]=l*g+h*d+c*u-o*p,t[e+2]=c*g+h*p+o*d-l*u,t[e+3]=h*g-o*u-l*d-c*p,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,i){return this._x=t,this._y=e,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){let n=t._x,i=t._y,r=t._z,a=t._order,o=Math.cos,l=Math.sin,c=o(n/2),h=o(i/2),u=o(r/2),d=l(n/2),p=l(i/2),g=l(r/2);switch(a){case"XYZ":this._x=d*h*u+c*p*g,this._y=c*p*u-d*h*g,this._z=c*h*g+d*p*u,this._w=c*h*u-d*p*g;break;case"YXZ":this._x=d*h*u+c*p*g,this._y=c*p*u-d*h*g,this._z=c*h*g-d*p*u,this._w=c*h*u+d*p*g;break;case"ZXY":this._x=d*h*u-c*p*g,this._y=c*p*u+d*h*g,this._z=c*h*g+d*p*u,this._w=c*h*u-d*p*g;break;case"ZYX":this._x=d*h*u-c*p*g,this._y=c*p*u+d*h*g,this._z=c*h*g-d*p*u,this._w=c*h*u+d*p*g;break;case"YZX":this._x=d*h*u+c*p*g,this._y=c*p*u+d*h*g,this._z=c*h*g-d*p*u,this._w=c*h*u-d*p*g;break;case"XZY":this._x=d*h*u-c*p*g,this._y=c*p*u-d*h*g,this._z=c*h*g+d*p*u,this._w=c*h*u+d*p*g;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+a)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){let n=e/2,i=Math.sin(n);return this._x=t.x*i,this._y=t.y*i,this._z=t.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){let e=t.elements,n=e[0],i=e[4],r=e[8],a=e[1],o=e[5],l=e[9],c=e[2],h=e[6],u=e[10],d=n+o+u;if(d>0){let p=.5/Math.sqrt(d+1);this._w=.25/p,this._x=(h-l)*p,this._y=(r-c)*p,this._z=(a-i)*p}else if(n>o&&n>u){let p=2*Math.sqrt(1+n-o-u);this._w=(h-l)/p,this._x=.25*p,this._y=(i+a)/p,this._z=(r+c)/p}else if(o>u){let p=2*Math.sqrt(1+o-n-u);this._w=(r-c)/p,this._x=(i+a)/p,this._y=.25*p,this._z=(l+h)/p}else{let p=2*Math.sqrt(1+u-n-o);this._w=(a-i)/p,this._x=(r+c)/p,this._y=(l+h)/p,this._z=.25*p}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<Number.EPSILON?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(qe(this.dot(t),-1,1)))}rotateTowards(t,e){let n=this.angleTo(t);if(n===0)return this;let i=Math.min(1,e/n);return this.slerp(t,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){let n=t._x,i=t._y,r=t._z,a=t._w,o=e._x,l=e._y,c=e._z,h=e._w;return this._x=n*h+a*o+i*c-r*l,this._y=i*h+a*l+r*o-n*c,this._z=r*h+a*c+n*l-i*o,this._w=a*h-n*o-i*l-r*c,this._onChangeCallback(),this}slerp(t,e){if(e===0)return this;if(e===1)return this.copy(t);let n=this._x,i=this._y,r=this._z,a=this._w,o=a*t._w+n*t._x+i*t._y+r*t._z;if(o<0?(this._w=-t._w,this._x=-t._x,this._y=-t._y,this._z=-t._z,o=-o):this.copy(t),o>=1)return this._w=a,this._x=n,this._y=i,this._z=r,this;let l=1-o*o;if(l<=Number.EPSILON){let p=1-e;return this._w=p*a+e*this._w,this._x=p*n+e*this._x,this._y=p*i+e*this._y,this._z=p*r+e*this._z,this.normalize(),this}let c=Math.sqrt(l),h=Math.atan2(c,o),u=Math.sin((1-e)*h)/c,d=Math.sin(e*h)/c;return this._w=a*u+this._w*d,this._x=n*u+this._x*d,this._y=i*u+this._y*d,this._z=r*u+this._z*d,this._onChangeCallback(),this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){let t=Math.random(),e=Math.sqrt(1-t),n=Math.sqrt(t),i=2*Math.PI*Math.random(),r=2*Math.PI*Math.random();return this.set(e*Math.cos(i),n*Math.sin(r),n*Math.cos(r),e*Math.sin(i))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},D=class s{constructor(t=0,e=0,n=0){s.prototype.isVector3=!0,this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(Ic.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(Ic.setFromAxisAngle(t,e))}applyMatrix3(t){let e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*i,this.y=r[1]*e+r[4]*n+r[7]*i,this.z=r[2]*e+r[5]*n+r[8]*i,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){let e=this.x,n=this.y,i=this.z,r=t.elements,a=1/(r[3]*e+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*i+r[12])*a,this.y=(r[1]*e+r[5]*n+r[9]*i+r[13])*a,this.z=(r[2]*e+r[6]*n+r[10]*i+r[14])*a,this}applyQuaternion(t){let e=this.x,n=this.y,i=this.z,r=t.x,a=t.y,o=t.z,l=t.w,c=2*(a*i-o*n),h=2*(o*e-r*i),u=2*(r*n-a*e);return this.x=e+l*c+a*u-o*h,this.y=n+l*h+o*c-r*u,this.z=i+l*u+r*h-a*c,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){let e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*i,this.y=r[1]*e+r[5]*n+r[9]*i,this.z=r[2]*e+r[6]*n+r[10]*i,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=Math.max(t.x,Math.min(e.x,this.x)),this.y=Math.max(t.y,Math.min(e.y,this.y)),this.z=Math.max(t.z,Math.min(e.z,this.z)),this}clampScalar(t,e){return this.x=Math.max(t,Math.min(e,this.x)),this.y=Math.max(t,Math.min(e,this.y)),this.z=Math.max(t,Math.min(e,this.z)),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(t,Math.min(e,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){let n=t.x,i=t.y,r=t.z,a=e.x,o=e.y,l=e.z;return this.x=i*l-r*o,this.y=r*a-n*l,this.z=n*o-i*a,this}projectOnVector(t){let e=t.lengthSq();if(e===0)return this.set(0,0,0);let n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return Ka.copy(this).projectOnVector(t),this.sub(Ka)}reflect(t){return this.sub(Ka.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(qe(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y,i=this.z-t.z;return e*e+n*n+i*i}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){let i=Math.sin(e)*t;return this.x=i*Math.sin(n),this.y=Math.cos(e)*t,this.z=i*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){let e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),i=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=i,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let t=(Math.random()-.5)*2,e=Math.random()*Math.PI*2,n=Math.sqrt(1-t**2);return this.x=n*Math.cos(e),this.y=n*Math.sin(e),this.z=t,this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},Ka=new D,Ic=new je,Ei=class{constructor(t=new D(1/0,1/0,1/0),e=new D(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(mn.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(mn.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){let n=mn.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);let n=t.geometry;if(n!==void 0){let r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0)for(let a=0,o=r.count;a<o;a++)t.isMesh===!0?t.getVertexPosition(a,mn):mn.fromBufferAttribute(r,a),mn.applyMatrix4(t.matrixWorld),this.expandByPoint(mn);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),or.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),or.copy(n.boundingBox)),or.applyMatrix4(t.matrixWorld),this.union(or)}let i=t.children;for(let r=0,a=i.length;r<a;r++)this.expandByObject(i[r],e);return this}containsPoint(t){return!(t.x<this.min.x||t.x>this.max.x||t.y<this.min.y||t.y>this.max.y||t.z<this.min.z||t.z>this.max.z)}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return!(t.max.x<this.min.x||t.min.x>this.max.x||t.max.y<this.min.y||t.min.y>this.max.y||t.max.z<this.min.z||t.min.z>this.max.z)}intersectsSphere(t){return this.clampPoint(t.center,mn),mn.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(Es),lr.subVectors(this.max,Es),Bi.subVectors(t.a,Es),Hi.subVectors(t.b,Es),zi.subVectors(t.c,Es),Jn.subVectors(Hi,Bi),jn.subVectors(zi,Hi),pi.subVectors(Bi,zi);let e=[0,-Jn.z,Jn.y,0,-jn.z,jn.y,0,-pi.z,pi.y,Jn.z,0,-Jn.x,jn.z,0,-jn.x,pi.z,0,-pi.x,-Jn.y,Jn.x,0,-jn.y,jn.x,0,-pi.y,pi.x,0];return!Qa(e,Bi,Hi,zi,lr)||(e=[1,0,0,0,1,0,0,0,1],!Qa(e,Bi,Hi,zi,lr))?!1:(cr.crossVectors(Jn,jn),e=[cr.x,cr.y,cr.z],Qa(e,Bi,Hi,zi,lr))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,mn).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(mn).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(In[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),In[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),In[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),In[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),In[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),In[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),In[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),In[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(In),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}},In=[new D,new D,new D,new D,new D,new D,new D,new D],mn=new D,or=new Ei,Bi=new D,Hi=new D,zi=new D,Jn=new D,jn=new D,pi=new D,Es=new D,lr=new D,cr=new D,mi=new D;function Qa(s,t,e,n,i){for(let r=0,a=s.length-3;r<=a;r+=3){mi.fromArray(s,r);let o=i.x*Math.abs(mi.x)+i.y*Math.abs(mi.y)+i.z*Math.abs(mi.z),l=t.dot(mi),c=e.dot(mi),h=n.dot(mi);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>o)return!1}return!0}var lf=new Ei,Ts=new D,to=new D,Ti=class{constructor(t=new D,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){let n=this.center;e!==void 0?n.copy(e):lf.setFromPoints(t).getCenter(n);let i=0;for(let r=0,a=t.length;r<a;r++)i=Math.max(i,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(i),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){let e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){let n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;Ts.subVectors(t,this.center);let e=Ts.lengthSq();if(e>this.radius*this.radius){let n=Math.sqrt(e),i=(n-this.radius)*.5;this.center.addScaledVector(Ts,i/n),this.radius+=i}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(to.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(Ts.copy(t.center).add(to)),this.expandByPoint(Ts.copy(t.center).sub(to))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}},Ln=new D,eo=new D,hr=new D,Kn=new D,no=new D,ur=new D,io=new D,us=class{constructor(t=new D,e=new D(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,Ln)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);let n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){let e=Ln.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(Ln.copy(this.origin).addScaledVector(this.direction,e),Ln.distanceToSquared(t))}distanceSqToSegment(t,e,n,i){eo.copy(t).add(e).multiplyScalar(.5),hr.copy(e).sub(t).normalize(),Kn.copy(this.origin).sub(eo);let r=t.distanceTo(e)*.5,a=-this.direction.dot(hr),o=Kn.dot(this.direction),l=-Kn.dot(hr),c=Kn.lengthSq(),h=Math.abs(1-a*a),u,d,p,g;if(h>0)if(u=a*l-o,d=a*o-l,g=r*h,u>=0)if(d>=-g)if(d<=g){let y=1/h;u*=y,d*=y,p=u*(u+a*d+2*o)+d*(a*u+d+2*l)+c}else d=r,u=Math.max(0,-(a*d+o)),p=-u*u+d*(d+2*l)+c;else d=-r,u=Math.max(0,-(a*d+o)),p=-u*u+d*(d+2*l)+c;else d<=-g?(u=Math.max(0,-(-a*r+o)),d=u>0?-r:Math.min(Math.max(-r,-l),r),p=-u*u+d*(d+2*l)+c):d<=g?(u=0,d=Math.min(Math.max(-r,-l),r),p=d*(d+2*l)+c):(u=Math.max(0,-(a*r+o)),d=u>0?r:Math.min(Math.max(-r,-l),r),p=-u*u+d*(d+2*l)+c);else d=a>0?-r:r,u=Math.max(0,-(a*d+o)),p=-u*u+d*(d+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,u),i&&i.copy(eo).addScaledVector(hr,d),p}intersectSphere(t,e){Ln.subVectors(t.center,this.origin);let n=Ln.dot(this.direction),i=Ln.dot(Ln)-n*n,r=t.radius*t.radius;if(i>r)return null;let a=Math.sqrt(r-i),o=n-a,l=n+a;return l<0?null:o<0?this.at(l,e):this.at(o,e)}intersectsSphere(t){return this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){let e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){let n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){let e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,i,r,a,o,l,c=1/this.direction.x,h=1/this.direction.y,u=1/this.direction.z,d=this.origin;return c>=0?(n=(t.min.x-d.x)*c,i=(t.max.x-d.x)*c):(n=(t.max.x-d.x)*c,i=(t.min.x-d.x)*c),h>=0?(r=(t.min.y-d.y)*h,a=(t.max.y-d.y)*h):(r=(t.max.y-d.y)*h,a=(t.min.y-d.y)*h),n>a||r>i||((r>n||isNaN(n))&&(n=r),(a<i||isNaN(i))&&(i=a),u>=0?(o=(t.min.z-d.z)*u,l=(t.max.z-d.z)*u):(o=(t.max.z-d.z)*u,l=(t.min.z-d.z)*u),n>l||o>i)||((o>n||n!==n)&&(n=o),(l<i||i!==i)&&(i=l),i<0)?null:this.at(n>=0?n:i,e)}intersectsBox(t){return this.intersectBox(t,Ln)!==null}intersectTriangle(t,e,n,i,r){no.subVectors(e,t),ur.subVectors(n,t),io.crossVectors(no,ur);let a=this.direction.dot(io),o;if(a>0){if(i)return null;o=1}else if(a<0)o=-1,a=-a;else return null;Kn.subVectors(this.origin,t);let l=o*this.direction.dot(ur.crossVectors(Kn,ur));if(l<0)return null;let c=o*this.direction.dot(no.cross(Kn));if(c<0||l+c>a)return null;let h=-o*Kn.dot(io);return h<0?null:this.at(h/a,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},_e=class s{constructor(t,e,n,i,r,a,o,l,c,h,u,d,p,g,y,m){s.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,i,r,a,o,l,c,h,u,d,p,g,y,m)}set(t,e,n,i,r,a,o,l,c,h,u,d,p,g,y,m){let f=this.elements;return f[0]=t,f[4]=e,f[8]=n,f[12]=i,f[1]=r,f[5]=a,f[9]=o,f[13]=l,f[2]=c,f[6]=h,f[10]=u,f[14]=d,f[3]=p,f[7]=g,f[11]=y,f[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new s().fromArray(this.elements)}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){let e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){let e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){let e=this.elements,n=t.elements,i=1/Vi.setFromMatrixColumn(t,0).length(),r=1/Vi.setFromMatrixColumn(t,1).length(),a=1/Vi.setFromMatrixColumn(t,2).length();return e[0]=n[0]*i,e[1]=n[1]*i,e[2]=n[2]*i,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*a,e[9]=n[9]*a,e[10]=n[10]*a,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){let e=this.elements,n=t.x,i=t.y,r=t.z,a=Math.cos(n),o=Math.sin(n),l=Math.cos(i),c=Math.sin(i),h=Math.cos(r),u=Math.sin(r);if(t.order==="XYZ"){let d=a*h,p=a*u,g=o*h,y=o*u;e[0]=l*h,e[4]=-l*u,e[8]=c,e[1]=p+g*c,e[5]=d-y*c,e[9]=-o*l,e[2]=y-d*c,e[6]=g+p*c,e[10]=a*l}else if(t.order==="YXZ"){let d=l*h,p=l*u,g=c*h,y=c*u;e[0]=d+y*o,e[4]=g*o-p,e[8]=a*c,e[1]=a*u,e[5]=a*h,e[9]=-o,e[2]=p*o-g,e[6]=y+d*o,e[10]=a*l}else if(t.order==="ZXY"){let d=l*h,p=l*u,g=c*h,y=c*u;e[0]=d-y*o,e[4]=-a*u,e[8]=g+p*o,e[1]=p+g*o,e[5]=a*h,e[9]=y-d*o,e[2]=-a*c,e[6]=o,e[10]=a*l}else if(t.order==="ZYX"){let d=a*h,p=a*u,g=o*h,y=o*u;e[0]=l*h,e[4]=g*c-p,e[8]=d*c+y,e[1]=l*u,e[5]=y*c+d,e[9]=p*c-g,e[2]=-c,e[6]=o*l,e[10]=a*l}else if(t.order==="YZX"){let d=a*l,p=a*c,g=o*l,y=o*c;e[0]=l*h,e[4]=y-d*u,e[8]=g*u+p,e[1]=u,e[5]=a*h,e[9]=-o*h,e[2]=-c*h,e[6]=p*u+g,e[10]=d-y*u}else if(t.order==="XZY"){let d=a*l,p=a*c,g=o*l,y=o*c;e[0]=l*h,e[4]=-u,e[8]=c*h,e[1]=d*u+y,e[5]=a*h,e[9]=p*u-g,e[2]=g*u-p,e[6]=o*h,e[10]=y*u+d}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(cf,t,hf)}lookAt(t,e,n){let i=this.elements;return sn.subVectors(t,e),sn.lengthSq()===0&&(sn.z=1),sn.normalize(),Qn.crossVectors(n,sn),Qn.lengthSq()===0&&(Math.abs(n.z)===1?sn.x+=1e-4:sn.z+=1e-4,sn.normalize(),Qn.crossVectors(n,sn)),Qn.normalize(),dr.crossVectors(sn,Qn),i[0]=Qn.x,i[4]=dr.x,i[8]=sn.x,i[1]=Qn.y,i[5]=dr.y,i[9]=sn.y,i[2]=Qn.z,i[6]=dr.z,i[10]=sn.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,i=e.elements,r=this.elements,a=n[0],o=n[4],l=n[8],c=n[12],h=n[1],u=n[5],d=n[9],p=n[13],g=n[2],y=n[6],m=n[10],f=n[14],b=n[3],v=n[7],E=n[11],C=n[15],T=i[0],A=i[4],X=i[8],S=i[12],x=i[1],I=i[5],N=i[9],K=i[13],L=i[2],O=i[6],q=i[10],Z=i[14],W=i[3],U=i[7],Y=i[11],et=i[15];return r[0]=a*T+o*x+l*L+c*W,r[4]=a*A+o*I+l*O+c*U,r[8]=a*X+o*N+l*q+c*Y,r[12]=a*S+o*K+l*Z+c*et,r[1]=h*T+u*x+d*L+p*W,r[5]=h*A+u*I+d*O+p*U,r[9]=h*X+u*N+d*q+p*Y,r[13]=h*S+u*K+d*Z+p*et,r[2]=g*T+y*x+m*L+f*W,r[6]=g*A+y*I+m*O+f*U,r[10]=g*X+y*N+m*q+f*Y,r[14]=g*S+y*K+m*Z+f*et,r[3]=b*T+v*x+E*L+C*W,r[7]=b*A+v*I+E*O+C*U,r[11]=b*X+v*N+E*q+C*Y,r[15]=b*S+v*K+E*Z+C*et,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[4],i=t[8],r=t[12],a=t[1],o=t[5],l=t[9],c=t[13],h=t[2],u=t[6],d=t[10],p=t[14],g=t[3],y=t[7],m=t[11],f=t[15];return g*(+r*l*u-i*c*u-r*o*d+n*c*d+i*o*p-n*l*p)+y*(+e*l*p-e*c*d+r*a*d-i*a*p+i*c*h-r*l*h)+m*(+e*c*u-e*o*p-r*a*u+n*a*p+r*o*h-n*c*h)+f*(-i*o*h-e*l*u+e*o*d+i*a*u-n*a*d+n*l*h)}transpose(){let t=this.elements,e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){let i=this.elements;return t.isVector3?(i[12]=t.x,i[13]=t.y,i[14]=t.z):(i[12]=t,i[13]=e,i[14]=n),this}invert(){let t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],a=t[4],o=t[5],l=t[6],c=t[7],h=t[8],u=t[9],d=t[10],p=t[11],g=t[12],y=t[13],m=t[14],f=t[15],b=u*m*c-y*d*c+y*l*p-o*m*p-u*l*f+o*d*f,v=g*d*c-h*m*c-g*l*p+a*m*p+h*l*f-a*d*f,E=h*y*c-g*u*c+g*o*p-a*y*p-h*o*f+a*u*f,C=g*u*l-h*y*l-g*o*d+a*y*d+h*o*m-a*u*m,T=e*b+n*v+i*E+r*C;if(T===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let A=1/T;return t[0]=b*A,t[1]=(y*d*r-u*m*r-y*i*p+n*m*p+u*i*f-n*d*f)*A,t[2]=(o*m*r-y*l*r+y*i*c-n*m*c-o*i*f+n*l*f)*A,t[3]=(u*l*r-o*d*r-u*i*c+n*d*c+o*i*p-n*l*p)*A,t[4]=v*A,t[5]=(h*m*r-g*d*r+g*i*p-e*m*p-h*i*f+e*d*f)*A,t[6]=(g*l*r-a*m*r-g*i*c+e*m*c+a*i*f-e*l*f)*A,t[7]=(a*d*r-h*l*r+h*i*c-e*d*c-a*i*p+e*l*p)*A,t[8]=E*A,t[9]=(g*u*r-h*y*r-g*n*p+e*y*p+h*n*f-e*u*f)*A,t[10]=(a*y*r-g*o*r+g*n*c-e*y*c-a*n*f+e*o*f)*A,t[11]=(h*o*r-a*u*r-h*n*c+e*u*c+a*n*p-e*o*p)*A,t[12]=C*A,t[13]=(h*y*i-g*u*i+g*n*d-e*y*d-h*n*m+e*u*m)*A,t[14]=(g*o*i-a*y*i-g*n*l+e*y*l+a*n*m-e*o*m)*A,t[15]=(a*u*i-h*o*i+h*n*l-e*u*l-a*n*d+e*o*d)*A,this}scale(t){let e=this.elements,n=t.x,i=t.y,r=t.z;return e[0]*=n,e[4]*=i,e[8]*=r,e[1]*=n,e[5]*=i,e[9]*=r,e[2]*=n,e[6]*=i,e[10]*=r,e[3]*=n,e[7]*=i,e[11]*=r,this}getMaxScaleOnAxis(){let t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],i=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,i))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){let e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){let n=Math.cos(e),i=Math.sin(e),r=1-n,a=t.x,o=t.y,l=t.z,c=r*a,h=r*o;return this.set(c*a+n,c*o-i*l,c*l+i*o,0,c*o+i*l,h*o+n,h*l-i*a,0,c*l-i*o,h*l+i*a,r*l*l+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,i,r,a){return this.set(1,n,r,0,t,1,a,0,e,i,1,0,0,0,0,1),this}compose(t,e,n){let i=this.elements,r=e._x,a=e._y,o=e._z,l=e._w,c=r+r,h=a+a,u=o+o,d=r*c,p=r*h,g=r*u,y=a*h,m=a*u,f=o*u,b=l*c,v=l*h,E=l*u,C=n.x,T=n.y,A=n.z;return i[0]=(1-(y+f))*C,i[1]=(p+E)*C,i[2]=(g-v)*C,i[3]=0,i[4]=(p-E)*T,i[5]=(1-(d+f))*T,i[6]=(m+b)*T,i[7]=0,i[8]=(g+v)*A,i[9]=(m-b)*A,i[10]=(1-(d+y))*A,i[11]=0,i[12]=t.x,i[13]=t.y,i[14]=t.z,i[15]=1,this}decompose(t,e,n){let i=this.elements,r=Vi.set(i[0],i[1],i[2]).length(),a=Vi.set(i[4],i[5],i[6]).length(),o=Vi.set(i[8],i[9],i[10]).length();this.determinant()<0&&(r=-r),t.x=i[12],t.y=i[13],t.z=i[14],gn.copy(this);let c=1/r,h=1/a,u=1/o;return gn.elements[0]*=c,gn.elements[1]*=c,gn.elements[2]*=c,gn.elements[4]*=h,gn.elements[5]*=h,gn.elements[6]*=h,gn.elements[8]*=u,gn.elements[9]*=u,gn.elements[10]*=u,e.setFromRotationMatrix(gn),n.x=r,n.y=a,n.z=o,this}makePerspective(t,e,n,i,r,a,o=Bn){let l=this.elements,c=2*r/(e-t),h=2*r/(n-i),u=(e+t)/(e-t),d=(n+i)/(n-i),p,g;if(o===Bn)p=-(a+r)/(a-r),g=-2*a*r/(a-r);else if(o===zr)p=-a/(a-r),g=-a*r/(a-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return l[0]=c,l[4]=0,l[8]=u,l[12]=0,l[1]=0,l[5]=h,l[9]=d,l[13]=0,l[2]=0,l[6]=0,l[10]=p,l[14]=g,l[3]=0,l[7]=0,l[11]=-1,l[15]=0,this}makeOrthographic(t,e,n,i,r,a,o=Bn){let l=this.elements,c=1/(e-t),h=1/(n-i),u=1/(a-r),d=(e+t)*c,p=(n+i)*h,g,y;if(o===Bn)g=(a+r)*u,y=-2*u;else if(o===zr)g=r*u,y=-1*u;else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return l[0]=2*c,l[4]=0,l[8]=0,l[12]=-d,l[1]=0,l[5]=2*h,l[9]=0,l[13]=-p,l[2]=0,l[6]=0,l[10]=y,l[14]=-g,l[3]=0,l[7]=0,l[11]=0,l[15]=1,this}equals(t){let e=this.elements,n=t.elements;for(let i=0;i<16;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}},Vi=new D,gn=new _e,cf=new D(0,0,0),hf=new D(1,1,1),Qn=new D,dr=new D,sn=new D,Lc=new _e,Dc=new je,hi=class s{constructor(t=0,e=0,n=0,i=s.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=i}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,i=this._order){return this._x=t,this._y=e,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){let i=t.elements,r=i[0],a=i[4],o=i[8],l=i[1],c=i[5],h=i[9],u=i[2],d=i[6],p=i[10];switch(e){case"XYZ":this._y=Math.asin(qe(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-h,p),this._z=Math.atan2(-a,r)):(this._x=Math.atan2(d,c),this._z=0);break;case"YXZ":this._x=Math.asin(-qe(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(o,p),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-u,r),this._z=0);break;case"ZXY":this._x=Math.asin(qe(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-u,p),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-qe(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(d,p),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-a,c));break;case"YZX":this._z=Math.asin(qe(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-u,r)):(this._x=0,this._y=Math.atan2(o,p));break;case"XZY":this._z=Math.asin(-qe(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(d,c),this._y=Math.atan2(o,r)):(this._x=Math.atan2(-h,p),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return Lc.makeRotationFromQuaternion(t),this.setFromRotationMatrix(Lc,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return Dc.setFromEuler(this),this.setFromQuaternion(Dc,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};hi.DEFAULT_ORDER="XYZ";var Ns=class{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}},uf=0,kc=new D,Gi=new je,Dn=new _e,fr=new D,As=new D,df=new D,ff=new je,Uc=new D(1,0,0),Fc=new D(0,1,0),Nc=new D(0,0,1),pf={type:"added"},mf={type:"removed"},Ke=class s extends ci{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:uf++}),this.uuid=oi(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=s.DEFAULT_UP.clone();let t=new D,e=new hi,n=new je,i=new D(1,1,1);function r(){n.setFromEuler(e,!1)}function a(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new _e},normalMatrix:{value:new Wt}}),this.matrix=new _e,this.matrixWorld=new _e,this.matrixAutoUpdate=s.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=s.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Ns,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return Gi.setFromAxisAngle(t,e),this.quaternion.multiply(Gi),this}rotateOnWorldAxis(t,e){return Gi.setFromAxisAngle(t,e),this.quaternion.premultiply(Gi),this}rotateX(t){return this.rotateOnAxis(Uc,t)}rotateY(t){return this.rotateOnAxis(Fc,t)}rotateZ(t){return this.rotateOnAxis(Nc,t)}translateOnAxis(t,e){return kc.copy(t).applyQuaternion(this.quaternion),this.position.add(kc.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(Uc,t)}translateY(t){return this.translateOnAxis(Fc,t)}translateZ(t){return this.translateOnAxis(Nc,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(Dn.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?fr.copy(t):fr.set(t,e,n);let i=this.parent;this.updateWorldMatrix(!0,!1),As.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Dn.lookAt(As,fr,this.up):Dn.lookAt(fr,As,this.up),this.quaternion.setFromRotationMatrix(Dn),i&&(Dn.extractRotation(i.matrixWorld),Gi.setFromRotationMatrix(Dn),this.quaternion.premultiply(Gi.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.parent!==null&&t.parent.remove(t),t.parent=this,this.children.push(t),t.dispatchEvent(pf)):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(mf)),this}removeFromParent(){let t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),Dn.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),Dn.multiply(t.parent.matrixWorld)),t.applyMatrix4(Dn),this.add(t),t.updateWorldMatrix(!1,!0),this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,i=this.children.length;n<i;n++){let a=this.children[n].getObjectByProperty(t,e);if(a!==void 0)return a}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);let i=this.children;for(let r=0,a=i.length;r<a;r++)i[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(As,t,df),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(As,ff,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);let e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}traverse(t){t(this);let e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);let e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverseVisible(t)}traverseAncestors(t){let e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix),this.matrixWorldNeedsUpdate=!1,t=!0);let e=this.children;for(let n=0,i=e.length;n<i;n++){let r=e[n];(r.matrixWorldAutoUpdate===!0||t===!0)&&r.updateMatrixWorld(t)}}updateWorldMatrix(t,e){let n=this.parent;if(t===!0&&n!==null&&n.matrixWorldAutoUpdate===!0&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix),e===!0){let i=this.children;for(let r=0,a=i.length;r<a;r++){let o=i[r];o.matrixWorldAutoUpdate===!0&&o.updateWorldMatrix(!1,!0)}}}toJSON(t){let e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.6,type:"Object",generator:"Object3D.toJSON"});let i={};i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.castShadow===!0&&(i.castShadow=!0),this.receiveShadow===!0&&(i.receiveShadow=!0),this.visible===!1&&(i.visible=!1),this.frustumCulled===!1&&(i.frustumCulled=!1),this.renderOrder!==0&&(i.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(i.matrixAutoUpdate=!1),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.visibility=this._visibility,i.active=this._active,i.bounds=this._bounds.map(o=>({boxInitialized:o.boxInitialized,boxMin:o.box.min.toArray(),boxMax:o.box.max.toArray(),sphereInitialized:o.sphereInitialized,sphereRadius:o.sphere.radius,sphereCenter:o.sphere.center.toArray()})),i.maxGeometryCount=this._maxGeometryCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.geometryCount=this._geometryCount,i.matricesTexture=this._matricesTexture.toJSON(t),this.boundingSphere!==null&&(i.boundingSphere={center:i.boundingSphere.center.toArray(),radius:i.boundingSphere.radius}),this.boundingBox!==null&&(i.boundingBox={min:i.boundingBox.min.toArray(),max:i.boundingBox.max.toArray()}));function r(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(t)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?i.background=this.background.toJSON():this.background.isTexture&&(i.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(i.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){i.geometry=r(t.geometries,this.geometry);let o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){let l=o.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){let u=l[c];r(t.shapes,u)}else r(t.shapes,l)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(r(t.materials,this.material[l]));i.material=o}else i.material=r(t.materials,this.material);if(this.children.length>0){i.children=[];for(let o=0;o<this.children.length;o++)i.children.push(this.children[o].toJSON(t).object)}if(this.animations.length>0){i.animations=[];for(let o=0;o<this.animations.length;o++){let l=this.animations[o];i.animations.push(r(t.animations,l))}}if(e){let o=a(t.geometries),l=a(t.materials),c=a(t.textures),h=a(t.images),u=a(t.shapes),d=a(t.skeletons),p=a(t.animations),g=a(t.nodes);o.length>0&&(n.geometries=o),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),u.length>0&&(n.shapes=u),d.length>0&&(n.skeletons=d),p.length>0&&(n.animations=p),g.length>0&&(n.nodes=g)}return n.object=i,n;function a(o){let l=[];for(let c in o){let h=o[c];delete h.metadata,l.push(h)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){let i=t.children[n];this.add(i.clone())}return this}};Ke.DEFAULT_UP=new D(0,1,0);Ke.DEFAULT_MATRIX_AUTO_UPDATE=!0;Ke.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var yn=new D,kn=new D,so=new D,Un=new D,Wi=new D,$i=new D,Oc=new D,ro=new D,ao=new D,oo=new D,pr=!1,_i=class s{constructor(t=new D,e=new D,n=new D){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,i){i.subVectors(n,e),yn.subVectors(t,e),i.cross(yn);let r=i.lengthSq();return r>0?i.multiplyScalar(1/Math.sqrt(r)):i.set(0,0,0)}static getBarycoord(t,e,n,i,r){yn.subVectors(i,e),kn.subVectors(n,e),so.subVectors(t,e);let a=yn.dot(yn),o=yn.dot(kn),l=yn.dot(so),c=kn.dot(kn),h=kn.dot(so),u=a*c-o*o;if(u===0)return r.set(0,0,0),null;let d=1/u,p=(c*l-o*h)*d,g=(a*h-o*l)*d;return r.set(1-p-g,g,p)}static containsPoint(t,e,n,i){return this.getBarycoord(t,e,n,i,Un)===null?!1:Un.x>=0&&Un.y>=0&&Un.x+Un.y<=1}static getUV(t,e,n,i,r,a,o,l){return pr===!1&&(console.warn("THREE.Triangle.getUV() has been renamed to THREE.Triangle.getInterpolation()."),pr=!0),this.getInterpolation(t,e,n,i,r,a,o,l)}static getInterpolation(t,e,n,i,r,a,o,l){return this.getBarycoord(t,e,n,i,Un)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,Un.x),l.addScaledVector(a,Un.y),l.addScaledVector(o,Un.z),l)}static isFrontFacing(t,e,n,i){return yn.subVectors(n,e),kn.subVectors(t,e),yn.cross(kn).dot(i)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,i){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[i]),this}setFromAttributeAndIndices(t,e,n,i){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,i),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return yn.subVectors(this.c,this.b),kn.subVectors(this.a,this.b),yn.cross(kn).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return s.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return s.getBarycoord(t,this.a,this.b,this.c,e)}getUV(t,e,n,i,r){return pr===!1&&(console.warn("THREE.Triangle.getUV() has been renamed to THREE.Triangle.getInterpolation()."),pr=!0),s.getInterpolation(t,this.a,this.b,this.c,e,n,i,r)}getInterpolation(t,e,n,i,r){return s.getInterpolation(t,this.a,this.b,this.c,e,n,i,r)}containsPoint(t){return s.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return s.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){let n=this.a,i=this.b,r=this.c,a,o;Wi.subVectors(i,n),$i.subVectors(r,n),ro.subVectors(t,n);let l=Wi.dot(ro),c=$i.dot(ro);if(l<=0&&c<=0)return e.copy(n);ao.subVectors(t,i);let h=Wi.dot(ao),u=$i.dot(ao);if(h>=0&&u<=h)return e.copy(i);let d=l*u-h*c;if(d<=0&&l>=0&&h<=0)return a=l/(l-h),e.copy(n).addScaledVector(Wi,a);oo.subVectors(t,r);let p=Wi.dot(oo),g=$i.dot(oo);if(g>=0&&p<=g)return e.copy(r);let y=p*c-l*g;if(y<=0&&c>=0&&g<=0)return o=c/(c-g),e.copy(n).addScaledVector($i,o);let m=h*g-p*u;if(m<=0&&u-h>=0&&p-g>=0)return Oc.subVectors(r,i),o=(u-h)/(u-h+(p-g)),e.copy(i).addScaledVector(Oc,o);let f=1/(m+y+d);return a=y*f,o=d*f,e.copy(n).addScaledVector(Wi,a).addScaledVector($i,o)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}},kh={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},ti={h:0,s:0,l:0},mr={h:0,s:0,l:0};function lo(s,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?s+(t-s)*6*e:e<1/2?t:e<2/3?s+(t-s)*6*(2/3-e):s}var Vt=class{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){let i=t;i&&i.isColor?this.copy(i):typeof i=="number"?this.setHex(i):typeof i=="string"&&this.setStyle(i)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=Zt){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,ie.toWorkingColorSpace(this,e),this}setRGB(t,e,n,i=ie.workingColorSpace){return this.r=t,this.g=e,this.b=n,ie.toWorkingColorSpace(this,i),this}setHSL(t,e,n,i=ie.workingColorSpace){if(t=nf(t,1),e=qe(e,0,1),n=qe(n,0,1),e===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+e):n+e-n*e,a=2*n-r;this.r=lo(a,r,t+1/3),this.g=lo(a,r,t),this.b=lo(a,r,t-1/3)}return ie.toWorkingColorSpace(this,i),this}setStyle(t,e=Zt){function n(r){r!==void 0&&parseFloat(r)<1&&console.warn("THREE.Color: Alpha component of "+t+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(t)){let r,a=i[1],o=i[2];switch(a){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,e);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:console.warn("THREE.Color: Unknown color model "+t)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(t)){let r=i[1],a=r.length;if(a===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(a===6)return this.setHex(parseInt(r,16),e);console.warn("THREE.Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=Zt){let n=kh[t.toLowerCase()];return n!==void 0?this.setHex(n,e):console.warn("THREE.Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=rs(t.r),this.g=rs(t.g),this.b=rs(t.b),this}copyLinearToSRGB(t){return this.r=Ja(t.r),this.g=Ja(t.g),this.b=Ja(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=Zt){return ie.fromWorkingColorSpace(Ue.copy(this),t),Math.round(qe(Ue.r*255,0,255))*65536+Math.round(qe(Ue.g*255,0,255))*256+Math.round(qe(Ue.b*255,0,255))}getHexString(t=Zt){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=ie.workingColorSpace){ie.fromWorkingColorSpace(Ue.copy(this),e);let n=Ue.r,i=Ue.g,r=Ue.b,a=Math.max(n,i,r),o=Math.min(n,i,r),l,c,h=(o+a)/2;if(o===a)l=0,c=0;else{let u=a-o;switch(c=h<=.5?u/(a+o):u/(2-a-o),a){case n:l=(i-r)/u+(i<r?6:0);break;case i:l=(r-n)/u+2;break;case r:l=(n-i)/u+4;break}l/=6}return t.h=l,t.s=c,t.l=h,t}getRGB(t,e=ie.workingColorSpace){return ie.fromWorkingColorSpace(Ue.copy(this),e),t.r=Ue.r,t.g=Ue.g,t.b=Ue.b,t}getStyle(t=Zt){ie.fromWorkingColorSpace(Ue.copy(this),t);let e=Ue.r,n=Ue.g,i=Ue.b;return t!==Zt?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(i*255)})`}offsetHSL(t,e,n){return this.getHSL(ti),this.setHSL(ti.h+t,ti.s+e,ti.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(ti),t.getHSL(mr);let n=Ya(ti.h,mr.h,e),i=Ya(ti.s,mr.s,e),r=Ya(ti.l,mr.l,e);return this.setHSL(n,i,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){let e=this.r,n=this.g,i=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*i,this.g=r[1]*e+r[4]*n+r[7]*i,this.b=r[2]*e+r[5]*n+r[8]*i,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Ue=new Vt;Vt.NAMES=kh;var gf=0,Gn=class extends ci{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:gf++}),this.uuid=oi(),this.name="",this.type="Material",this.blending=si,this.side=li,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=bo,this.blendDst=_o,this.blendEquation=xi,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Vt(0,0,0),this.blendAlpha=0,this.depthFunc=Ur,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=Ec,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Ni,this.stencilZFail=Ni,this.stencilZPass=Ni,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBuild(){}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(let e in t){let n=t[e];if(n===void 0){console.warn(`THREE.Material: parameter '${e}' has value of undefined.`);continue}let i=this[e];if(i===void 0){console.warn(`THREE.Material: '${e}' is not a property of THREE.${this.type}.`);continue}i&&i.isColor?i.set(n):i&&i.isVector3&&n&&n.isVector3?i.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});let n={metadata:{version:4.6,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==si&&(n.blending=this.blending),this.side!==li&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==bo&&(n.blendSrc=this.blendSrc),this.blendDst!==_o&&(n.blendDst=this.blendDst),this.blendEquation!==xi&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==Ur&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==Ec&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==Ni&&(n.stencilFail=this.stencilFail),this.stencilZFail!==Ni&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==Ni&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function i(r){let a=[];for(let o in r){let l=r[o];delete l.metadata,a.push(l)}return a}if(e){let r=i(t.textures),a=i(t.images);r.length>0&&(n.textures=r),a.length>0&&(n.images=a)}return n}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;let e=t.clippingPlanes,n=null;if(e!==null){let i=e.length;n=new Array(i);for(let r=0;r!==i;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}},Le=class extends Gn{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Vt(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.combine=Sh,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}};var ye=new D,gr=new Ft,Ne=class{constructor(t,e,n=!1){if(Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=wo,this._updateRange={offset:0,count:-1},this.updateRanges=[],this.gpuType=ni,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}get updateRange(){return console.warn("THREE.BufferAttribute: updateRange() is deprecated and will be removed in r169. Use addUpdateRange() instead."),this._updateRange}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let i=0,r=this.itemSize;i<r;i++)this.array[t+i]=e.array[n+i];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)gr.fromBufferAttribute(this,e),gr.applyMatrix3(t),this.setXY(e,gr.x,gr.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)ye.fromBufferAttribute(this,e),ye.applyMatrix3(t),this.setXYZ(e,ye.x,ye.y,ye.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)ye.fromBufferAttribute(this,e),ye.applyMatrix4(t),this.setXYZ(e,ye.x,ye.y,ye.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)ye.fromBufferAttribute(this,e),ye.applyNormalMatrix(t),this.setXYZ(e,ye.x,ye.y,ye.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)ye.fromBufferAttribute(this,e),ye.transformDirection(t),this.setXYZ(e,ye.x,ye.y,ye.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=On(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=re(n,this.array)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=On(e,this.array)),e}setX(t,e){return this.normalized&&(e=re(e,this.array)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=On(e,this.array)),e}setY(t,e){return this.normalized&&(e=re(e,this.array)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=On(e,this.array)),e}setZ(t,e){return this.normalized&&(e=re(e,this.array)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=On(e,this.array)),e}setW(t,e){return this.normalized&&(e=re(e,this.array)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=re(e,this.array),n=re(n,this.array)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,i){return t*=this.itemSize,this.normalized&&(e=re(e,this.array),n=re(n,this.array),i=re(i,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this}setXYZW(t,e,n,i,r){return t*=this.itemSize,this.normalized&&(e=re(e,this.array),n=re(n,this.array),i=re(i,this.array),r=re(r,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(t.name=this.name),this.usage!==wo&&(t.usage=this.usage),t}};var Xr=class extends Ne{constructor(t,e,n){super(new Uint16Array(t),e,n)}};var qr=class extends Ne{constructor(t,e,n){super(new Uint32Array(t),e,n)}};var Je=class extends Ne{constructor(t,e,n){super(new Float32Array(t),e,n)}};var yf=0,cn=new _e,co=new Ke,Xi=new D,rn=new Ei,Cs=new Ei,Ce=new D,Qe=class s extends ci{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:yf++}),this.uuid=oi(),this.name="",this.type="BufferGeometry",this.index=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(Dh(t)?qr:Xr)(t,1):this.index=t,this}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){let e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new Wt().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}let i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(t),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(t){return cn.makeRotationFromQuaternion(t),this.applyMatrix4(cn),this}rotateX(t){return cn.makeRotationX(t),this.applyMatrix4(cn),this}rotateY(t){return cn.makeRotationY(t),this.applyMatrix4(cn),this}rotateZ(t){return cn.makeRotationZ(t),this.applyMatrix4(cn),this}translate(t,e,n){return cn.makeTranslation(t,e,n),this.applyMatrix4(cn),this}scale(t,e,n){return cn.makeScale(t,e,n),this.applyMatrix4(cn),this}lookAt(t){return co.lookAt(t),co.updateMatrix(),this.applyMatrix4(co.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Xi).negate(),this.translate(Xi.x,Xi.y,Xi.z),this}setFromPoints(t){let e=[];for(let n=0,i=t.length;n<i;n++){let r=t[n];e.push(r.x,r.y,r.z||0)}return this.setAttribute("position",new Je(e,3)),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Ei);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error('THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box. Alternatively set "mesh.frustumCulled" to "false".',this),this.boundingBox.set(new D(-1/0,-1/0,-1/0),new D(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,i=e.length;n<i;n++){let r=e[n];rn.setFromBufferAttribute(r),this.morphTargetsRelative?(Ce.addVectors(this.boundingBox.min,rn.min),this.boundingBox.expandByPoint(Ce),Ce.addVectors(this.boundingBox.max,rn.max),this.boundingBox.expandByPoint(Ce)):(this.boundingBox.expandByPoint(rn.min),this.boundingBox.expandByPoint(rn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Ti);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error('THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere. Alternatively set "mesh.frustumCulled" to "false".',this),this.boundingSphere.set(new D,1/0);return}if(t){let n=this.boundingSphere.center;if(rn.setFromBufferAttribute(t),e)for(let r=0,a=e.length;r<a;r++){let o=e[r];Cs.setFromBufferAttribute(o),this.morphTargetsRelative?(Ce.addVectors(rn.min,Cs.min),rn.expandByPoint(Ce),Ce.addVectors(rn.max,Cs.max),rn.expandByPoint(Ce)):(rn.expandByPoint(Cs.min),rn.expandByPoint(Cs.max))}rn.getCenter(n);let i=0;for(let r=0,a=t.count;r<a;r++)Ce.fromBufferAttribute(t,r),i=Math.max(i,n.distanceToSquared(Ce));if(e)for(let r=0,a=e.length;r<a;r++){let o=e[r],l=this.morphTargetsRelative;for(let c=0,h=o.count;c<h;c++)Ce.fromBufferAttribute(o,c),l&&(Xi.fromBufferAttribute(t,c),Ce.add(Xi)),i=Math.max(i,n.distanceToSquared(Ce))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=t.array,i=e.position.array,r=e.normal.array,a=e.uv.array,o=i.length/3;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new Ne(new Float32Array(4*o),4));let l=this.getAttribute("tangent").array,c=[],h=[];for(let x=0;x<o;x++)c[x]=new D,h[x]=new D;let u=new D,d=new D,p=new D,g=new Ft,y=new Ft,m=new Ft,f=new D,b=new D;function v(x,I,N){u.fromArray(i,x*3),d.fromArray(i,I*3),p.fromArray(i,N*3),g.fromArray(a,x*2),y.fromArray(a,I*2),m.fromArray(a,N*2),d.sub(u),p.sub(u),y.sub(g),m.sub(g);let K=1/(y.x*m.y-m.x*y.y);isFinite(K)&&(f.copy(d).multiplyScalar(m.y).addScaledVector(p,-y.y).multiplyScalar(K),b.copy(p).multiplyScalar(y.x).addScaledVector(d,-m.x).multiplyScalar(K),c[x].add(f),c[I].add(f),c[N].add(f),h[x].add(b),h[I].add(b),h[N].add(b))}let E=this.groups;E.length===0&&(E=[{start:0,count:n.length}]);for(let x=0,I=E.length;x<I;++x){let N=E[x],K=N.start,L=N.count;for(let O=K,q=K+L;O<q;O+=3)v(n[O+0],n[O+1],n[O+2])}let C=new D,T=new D,A=new D,X=new D;function S(x){A.fromArray(r,x*3),X.copy(A);let I=c[x];C.copy(I),C.sub(A.multiplyScalar(A.dot(I))).normalize(),T.crossVectors(X,I);let K=T.dot(h[x])<0?-1:1;l[x*4]=C.x,l[x*4+1]=C.y,l[x*4+2]=C.z,l[x*4+3]=K}for(let x=0,I=E.length;x<I;++x){let N=E[x],K=N.start,L=N.count;for(let O=K,q=K+L;O<q;O+=3)S(n[O+0]),S(n[O+1]),S(n[O+2])}}computeVertexNormals(){let t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new Ne(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let d=0,p=n.count;d<p;d++)n.setXYZ(d,0,0,0);let i=new D,r=new D,a=new D,o=new D,l=new D,c=new D,h=new D,u=new D;if(t)for(let d=0,p=t.count;d<p;d+=3){let g=t.getX(d+0),y=t.getX(d+1),m=t.getX(d+2);i.fromBufferAttribute(e,g),r.fromBufferAttribute(e,y),a.fromBufferAttribute(e,m),h.subVectors(a,r),u.subVectors(i,r),h.cross(u),o.fromBufferAttribute(n,g),l.fromBufferAttribute(n,y),c.fromBufferAttribute(n,m),o.add(h),l.add(h),c.add(h),n.setXYZ(g,o.x,o.y,o.z),n.setXYZ(y,l.x,l.y,l.z),n.setXYZ(m,c.x,c.y,c.z)}else for(let d=0,p=e.count;d<p;d+=3)i.fromBufferAttribute(e,d+0),r.fromBufferAttribute(e,d+1),a.fromBufferAttribute(e,d+2),h.subVectors(a,r),u.subVectors(i,r),h.cross(u),n.setXYZ(d+0,h.x,h.y,h.z),n.setXYZ(d+1,h.x,h.y,h.z),n.setXYZ(d+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)Ce.fromBufferAttribute(t,e),Ce.normalize(),t.setXYZ(e,Ce.x,Ce.y,Ce.z)}toNonIndexed(){function t(o,l){let c=o.array,h=o.itemSize,u=o.normalized,d=new c.constructor(l.length*h),p=0,g=0;for(let y=0,m=l.length;y<m;y++){o.isInterleavedBufferAttribute?p=l[y]*o.data.stride+o.offset:p=l[y]*h;for(let f=0;f<h;f++)d[g++]=c[p++]}return new Ne(d,h,u)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let e=new s,n=this.index.array,i=this.attributes;for(let o in i){let l=i[o],c=t(l,n);e.setAttribute(o,c)}let r=this.morphAttributes;for(let o in r){let l=[],c=r[o];for(let h=0,u=c.length;h<u;h++){let d=c[h],p=t(d,n);l.push(p)}e.morphAttributes[o]=l}e.morphTargetsRelative=this.morphTargetsRelative;let a=this.groups;for(let o=0,l=a.length;o<l;o++){let c=a[o];e.addGroup(c.start,c.count,c.materialIndex)}return e}toJSON(){let t={metadata:{version:4.6,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.type,this.name!==""&&(t.name=this.name),Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(t[c]=l[c]);return t}t.data={attributes:{}};let e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});let n=this.attributes;for(let l in n){let c=n[l];t.data.attributes[l]=c.toJSON(t.data)}let i={},r=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],h=[];for(let u=0,d=c.length;u<d;u++){let p=c[u];h.push(p.toJSON(t.data))}h.length>0&&(i[l]=h,r=!0)}r&&(t.data.morphAttributes=i,t.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(t.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(t.data.boundingSphere={center:o.center.toArray(),radius:o.radius}),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let e={};this.name=t.name;let n=t.index;n!==null&&this.setIndex(n.clone(e));let i=t.attributes;for(let c in i){let h=i[c];this.setAttribute(c,h.clone(e))}let r=t.morphAttributes;for(let c in r){let h=[],u=r[c];for(let d=0,p=u.length;d<p;d++)h.push(u[d].clone(e));this.morphAttributes[c]=h}this.morphTargetsRelative=t.morphTargetsRelative;let a=t.groups;for(let c=0,h=a.length;c<h;c++){let u=a[c];this.addGroup(u.start,u.count,u.materialIndex)}let o=t.boundingBox;o!==null&&(this.boundingBox=o.clone());let l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}},Bc=new _e,gi=new us,yr=new Ti,Hc=new D,qi=new D,Yi=new D,Zi=new D,ho=new D,vr=new D,xr=new Ft,br=new Ft,_r=new Ft,zc=new D,Vc=new D,Gc=new D,Sr=new D,Mr=new D,ce=class extends Ke{constructor(t=new Qe,e=new Le){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){let o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}getVertexPosition(t,e){let n=this.geometry,i=n.attributes.position,r=n.morphAttributes.position,a=n.morphTargetsRelative;e.fromBufferAttribute(i,t);let o=this.morphTargetInfluences;if(r&&o){vr.set(0,0,0);for(let l=0,c=r.length;l<c;l++){let h=o[l],u=r[l];h!==0&&(ho.fromBufferAttribute(u,t),a?vr.addScaledVector(ho,h):vr.addScaledVector(ho.sub(e),h))}e.add(vr)}return e}raycast(t,e){let n=this.geometry,i=this.material,r=this.matrixWorld;i!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),yr.copy(n.boundingSphere),yr.applyMatrix4(r),gi.copy(t.ray).recast(t.near),!(yr.containsPoint(gi.origin)===!1&&(gi.intersectSphere(yr,Hc)===null||gi.origin.distanceToSquared(Hc)>(t.far-t.near)**2))&&(Bc.copy(r).invert(),gi.copy(t.ray).applyMatrix4(Bc),!(n.boundingBox!==null&&gi.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,gi)))}_computeIntersections(t,e,n){let i,r=this.geometry,a=this.material,o=r.index,l=r.attributes.position,c=r.attributes.uv,h=r.attributes.uv1,u=r.attributes.normal,d=r.groups,p=r.drawRange;if(o!==null)if(Array.isArray(a))for(let g=0,y=d.length;g<y;g++){let m=d[g],f=a[m.materialIndex],b=Math.max(m.start,p.start),v=Math.min(o.count,Math.min(m.start+m.count,p.start+p.count));for(let E=b,C=v;E<C;E+=3){let T=o.getX(E),A=o.getX(E+1),X=o.getX(E+2);i=wr(this,f,t,n,c,h,u,T,A,X),i&&(i.faceIndex=Math.floor(E/3),i.face.materialIndex=m.materialIndex,e.push(i))}}else{let g=Math.max(0,p.start),y=Math.min(o.count,p.start+p.count);for(let m=g,f=y;m<f;m+=3){let b=o.getX(m),v=o.getX(m+1),E=o.getX(m+2);i=wr(this,a,t,n,c,h,u,b,v,E),i&&(i.faceIndex=Math.floor(m/3),e.push(i))}}else if(l!==void 0)if(Array.isArray(a))for(let g=0,y=d.length;g<y;g++){let m=d[g],f=a[m.materialIndex],b=Math.max(m.start,p.start),v=Math.min(l.count,Math.min(m.start+m.count,p.start+p.count));for(let E=b,C=v;E<C;E+=3){let T=E,A=E+1,X=E+2;i=wr(this,f,t,n,c,h,u,T,A,X),i&&(i.faceIndex=Math.floor(E/3),i.face.materialIndex=m.materialIndex,e.push(i))}}else{let g=Math.max(0,p.start),y=Math.min(l.count,p.start+p.count);for(let m=g,f=y;m<f;m+=3){let b=m,v=m+1,E=m+2;i=wr(this,a,t,n,c,h,u,b,v,E),i&&(i.faceIndex=Math.floor(m/3),e.push(i))}}}};function vf(s,t,e,n,i,r,a,o){let l;if(t.side===Ze?l=n.intersectTriangle(a,r,i,!0,o):l=n.intersectTriangle(i,r,a,t.side===li,o),l===null)return null;Mr.copy(o),Mr.applyMatrix4(s.matrixWorld);let c=e.ray.origin.distanceTo(Mr);return c<e.near||c>e.far?null:{distance:c,point:Mr.clone(),object:s}}function wr(s,t,e,n,i,r,a,o,l,c){s.getVertexPosition(o,qi),s.getVertexPosition(l,Yi),s.getVertexPosition(c,Zi);let h=vf(s,t,e,n,qi,Yi,Zi,Sr);if(h){i&&(xr.fromBufferAttribute(i,o),br.fromBufferAttribute(i,l),_r.fromBufferAttribute(i,c),h.uv=_i.getInterpolation(Sr,qi,Yi,Zi,xr,br,_r,new Ft)),r&&(xr.fromBufferAttribute(r,o),br.fromBufferAttribute(r,l),_r.fromBufferAttribute(r,c),h.uv1=_i.getInterpolation(Sr,qi,Yi,Zi,xr,br,_r,new Ft),h.uv2=h.uv1),a&&(zc.fromBufferAttribute(a,o),Vc.fromBufferAttribute(a,l),Gc.fromBufferAttribute(a,c),h.normal=_i.getInterpolation(Sr,qi,Yi,Zi,zc,Vc,Gc,new D),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));let u={a:o,b:l,c,normal:new D,materialIndex:0};_i.getNormal(qi,Yi,Zi,u.normal),h.face=u}return h}var Os=class s extends Qe{constructor(t=1,e=1,n=1,i=1,r=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:i,heightSegments:r,depthSegments:a};let o=this;i=Math.floor(i),r=Math.floor(r),a=Math.floor(a);let l=[],c=[],h=[],u=[],d=0,p=0;g("z","y","x",-1,-1,n,e,t,a,r,0),g("z","y","x",1,-1,n,e,-t,a,r,1),g("x","z","y",1,1,t,n,e,i,a,2),g("x","z","y",1,-1,t,n,-e,i,a,3),g("x","y","z",1,-1,t,e,n,i,r,4),g("x","y","z",-1,-1,t,e,-n,i,r,5),this.setIndex(l),this.setAttribute("position",new Je(c,3)),this.setAttribute("normal",new Je(h,3)),this.setAttribute("uv",new Je(u,2));function g(y,m,f,b,v,E,C,T,A,X,S){let x=E/A,I=C/X,N=E/2,K=C/2,L=T/2,O=A+1,q=X+1,Z=0,W=0,U=new D;for(let Y=0;Y<q;Y++){let et=Y*I-K;for(let ht=0;ht<O;ht++){let $=ht*x-N;U[y]=$*b,U[m]=et*v,U[f]=L,c.push(U.x,U.y,U.z),U[y]=0,U[m]=0,U[f]=T>0?1:-1,h.push(U.x,U.y,U.z),u.push(ht/A),u.push(1-Y/X),Z+=1}}for(let Y=0;Y<X;Y++)for(let et=0;et<A;et++){let ht=d+et+O*Y,$=d+et+O*(Y+1),J=d+(et+1)+O*(Y+1),ut=d+(et+1)+O*Y;l.push(ht,$,ut),l.push($,J,ut),W+=6}o.addGroup(p,W,S),p+=W,d+=Z}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new s(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}};function ds(s){let t={};for(let e in s){t[e]={};for(let n in s[e]){let i=s[e][n];i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)?i.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=i.clone():Array.isArray(i)?t[e][n]=i.slice():t[e][n]=i}}return t}function Ve(s){let t={};for(let e=0;e<s.length;e++){let n=ds(s[e]);for(let i in n)t[i]=n[i]}return t}function xf(s){let t=[];for(let e=0;e<s.length;e++)t.push(s[e].clone());return t}function Uh(s){return s.getRenderTarget()===null?s.outputColorSpace:ie.workingColorSpace}var bf={clone:ds,merge:Ve},_f=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Sf=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,Wn=class extends Gn{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=_f,this.fragmentShader=Sf,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={derivatives:!1,fragDepth:!1,drawBuffers:!1,shaderTextureLOD:!1,clipCullDistance:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=ds(t.uniforms),this.uniformsGroups=xf(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this}toJSON(t){let e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(let i in this.uniforms){let a=this.uniforms[i].value;a&&a.isTexture?e.uniforms[i]={type:"t",value:a.toJSON(t).uuid}:a&&a.isColor?e.uniforms[i]={type:"c",value:a.getHex()}:a&&a.isVector2?e.uniforms[i]={type:"v2",value:a.toArray()}:a&&a.isVector3?e.uniforms[i]={type:"v3",value:a.toArray()}:a&&a.isVector4?e.uniforms[i]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?e.uniforms[i]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?e.uniforms[i]={type:"m4",value:a.toArray()}:e.uniforms[i]={value:a}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;let n={};for(let i in this.extensions)this.extensions[i]===!0&&(n[i]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}},Yr=class extends Ke{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new _e,this.projectionMatrix=new _e,this.projectionMatrixInverse=new _e,this.coordinateSystem=Bn}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(t,e){super.updateWorldMatrix(t,e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}},be=class extends Yr{constructor(t=50,e=1,n=.1,i=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){let e=.5*this.getFilmHeight()/t;this.fov=To*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){let t=Math.tan(qa*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return To*2*Math.atan(Math.tan(qa*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}setViewOffset(t,e,n,i,r,a){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=this.near,e=t*Math.tan(qa*.5*this.fov)/this.zoom,n=2*e,i=this.aspect*n,r=-.5*i,a=this.view;if(this.view!==null&&this.view.enabled){let l=a.fullWidth,c=a.fullHeight;r+=a.offsetX*i/l,e-=a.offsetY*n/c,i*=a.width/l,n*=a.height/c}let o=this.filmOffset;o!==0&&(r+=t*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+i,e,e-n,t,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}},Ji=-90,ji=1,Po=class extends Ke{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let i=new be(Ji,ji,t,e);i.layers=this.layers,this.add(i);let r=new be(Ji,ji,t,e);r.layers=this.layers,this.add(r);let a=new be(Ji,ji,t,e);a.layers=this.layers,this.add(a);let o=new be(Ji,ji,t,e);o.layers=this.layers,this.add(o);let l=new be(Ji,ji,t,e);l.layers=this.layers,this.add(l);let c=new be(Ji,ji,t,e);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let t=this.coordinateSystem,e=this.children.concat(),[n,i,r,a,o,l]=e;for(let c of e)this.remove(c);if(t===Bn)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(t===zr)n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(let c of e)this.add(c),c.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:i}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());let[r,a,o,l,c,h]=this.children,u=t.getRenderTarget(),d=t.getActiveCubeFace(),p=t.getActiveMipmapLevel(),g=t.xr.enabled;t.xr.enabled=!1;let y=n.texture.generateMipmaps;n.texture.generateMipmaps=!1,t.setRenderTarget(n,0,i),t.render(e,r),t.setRenderTarget(n,1,i),t.render(e,a),t.setRenderTarget(n,2,i),t.render(e,o),t.setRenderTarget(n,3,i),t.render(e,l),t.setRenderTarget(n,4,i),t.render(e,c),n.texture.generateMipmaps=y,t.setRenderTarget(n,5,i),t.render(e,h),t.setRenderTarget(u,d,p),t.xr.enabled=g,n.texture.needsPMREMUpdate=!0}},Zr=class extends Re{constructor(t,e,n,i,r,a,o,l,c,h){t=t!==void 0?t:[],e=e!==void 0?e:os,super(t,e,n,i,r,a,o,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}},Io=class extends Vn{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;let n={width:t,height:t,depth:1},i=[n,n,n,n,n,n];e.encoding!==void 0&&(Ls("THREE.WebGLCubeRenderTarget: option.encoding has been replaced by option.colorSpace."),e.colorSpace=e.encoding===wi?Zt:un),this.texture=new Zr(i,e.mapping,e.wrapS,e.wrapT,e.magFilter,e.minFilter,e.format,e.type,e.anisotropy,e.colorSpace),this.texture.isRenderTargetTexture=!0,this.texture.generateMipmaps=e.generateMipmaps!==void 0?e.generateMipmaps:!1,this.texture.minFilter=e.minFilter!==void 0?e.minFilter:hn}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},i=new Os(5,5,5),r=new Wn({name:"CubemapFromEquirect",uniforms:ds(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Ze,blending:ii});r.uniforms.tEquirect.value=e;let a=new ce(i,r),o=e.minFilter;return e.minFilter===Us&&(e.minFilter=hn),new Po(1,10,this).update(t,a),e.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(t,e,n,i){let r=t.getRenderTarget();for(let a=0;a<6;a++)t.setRenderTarget(this,a),t.clear(e,n,i);t.setRenderTarget(r)}},uo=new D,Mf=new D,wf=new Wt,Nn=class{constructor(t=new D(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,i){return this.normal.set(t,e,n),this.constant=i,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){let i=uo.subVectors(n,e).cross(Mf.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(i,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){let t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e){let n=t.delta(uo),i=this.normal.dot(n);if(i===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;let r=-(t.start.dot(this.normal)+this.constant)/i;return r<0||r>1?null:e.copy(t.start).addScaledVector(n,r)}intersectsLine(t){let e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){let n=e||wf.getNormalMatrix(t),i=this.coplanarPoint(uo).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}},yi=new Ti,Er=new D,Jr=class{constructor(t=new Nn,e=new Nn,n=new Nn,i=new Nn,r=new Nn,a=new Nn){this.planes=[t,e,n,i,r,a]}set(t,e,n,i,r,a){let o=this.planes;return o[0].copy(t),o[1].copy(e),o[2].copy(n),o[3].copy(i),o[4].copy(r),o[5].copy(a),this}copy(t){let e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=Bn){let n=this.planes,i=t.elements,r=i[0],a=i[1],o=i[2],l=i[3],c=i[4],h=i[5],u=i[6],d=i[7],p=i[8],g=i[9],y=i[10],m=i[11],f=i[12],b=i[13],v=i[14],E=i[15];if(n[0].setComponents(l-r,d-c,m-p,E-f).normalize(),n[1].setComponents(l+r,d+c,m+p,E+f).normalize(),n[2].setComponents(l+a,d+h,m+g,E+b).normalize(),n[3].setComponents(l-a,d-h,m-g,E-b).normalize(),n[4].setComponents(l-o,d-u,m-y,E-v).normalize(),e===Bn)n[5].setComponents(l+o,d+u,m+y,E+v).normalize();else if(e===zr)n[5].setComponents(o,u,y,v).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),yi.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{let e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),yi.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(yi)}intersectsSprite(t){return yi.center.set(0,0,0),yi.radius=.7071067811865476,yi.applyMatrix4(t.matrixWorld),this.intersectsSphere(yi)}intersectsSphere(t){let e=this.planes,n=t.center,i=-t.radius;for(let r=0;r<6;r++)if(e[r].distanceToPoint(n)<i)return!1;return!0}intersectsBox(t){let e=this.planes;for(let n=0;n<6;n++){let i=e[n];if(Er.x=i.normal.x>0?t.max.x:t.min.x,Er.y=i.normal.y>0?t.max.y:t.min.y,Er.z=i.normal.z>0?t.max.z:t.min.z,i.distanceToPoint(Er)<0)return!1}return!0}containsPoint(t){let e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};function Fh(){let s=null,t=!1,e=null,n=null;function i(r,a){e(r,a),n=s.requestAnimationFrame(i)}return{start:function(){t!==!0&&e!==null&&(n=s.requestAnimationFrame(i),t=!0)},stop:function(){s.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(r){e=r},setContext:function(r){s=r}}}function Ef(s,t){let e=t.isWebGL2,n=new WeakMap;function i(c,h){let u=c.array,d=c.usage,p=u.byteLength,g=s.createBuffer();s.bindBuffer(h,g),s.bufferData(h,u,d),c.onUploadCallback();let y;if(u instanceof Float32Array)y=s.FLOAT;else if(u instanceof Uint16Array)if(c.isFloat16BufferAttribute)if(e)y=s.HALF_FLOAT;else throw new Error("THREE.WebGLAttributes: Usage of Float16BufferAttribute requires WebGL2.");else y=s.UNSIGNED_SHORT;else if(u instanceof Int16Array)y=s.SHORT;else if(u instanceof Uint32Array)y=s.UNSIGNED_INT;else if(u instanceof Int32Array)y=s.INT;else if(u instanceof Int8Array)y=s.BYTE;else if(u instanceof Uint8Array)y=s.UNSIGNED_BYTE;else if(u instanceof Uint8ClampedArray)y=s.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+u);return{buffer:g,type:y,bytesPerElement:u.BYTES_PER_ELEMENT,version:c.version,size:p}}function r(c,h,u){let d=h.array,p=h._updateRange,g=h.updateRanges;if(s.bindBuffer(u,c),p.count===-1&&g.length===0&&s.bufferSubData(u,0,d),g.length!==0){for(let y=0,m=g.length;y<m;y++){let f=g[y];e?s.bufferSubData(u,f.start*d.BYTES_PER_ELEMENT,d,f.start,f.count):s.bufferSubData(u,f.start*d.BYTES_PER_ELEMENT,d.subarray(f.start,f.start+f.count))}h.clearUpdateRanges()}p.count!==-1&&(e?s.bufferSubData(u,p.offset*d.BYTES_PER_ELEMENT,d,p.offset,p.count):s.bufferSubData(u,p.offset*d.BYTES_PER_ELEMENT,d.subarray(p.offset,p.offset+p.count)),p.count=-1),h.onUploadCallback()}function a(c){return c.isInterleavedBufferAttribute&&(c=c.data),n.get(c)}function o(c){c.isInterleavedBufferAttribute&&(c=c.data);let h=n.get(c);h&&(s.deleteBuffer(h.buffer),n.delete(c))}function l(c,h){if(c.isGLBufferAttribute){let d=n.get(c);(!d||d.version<c.version)&&n.set(c,{buffer:c.buffer,type:c.type,bytesPerElement:c.elementSize,version:c.version});return}c.isInterleavedBufferAttribute&&(c=c.data);let u=n.get(c);if(u===void 0)n.set(c,i(c,h));else if(u.version<c.version){if(u.size!==c.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");r(u.buffer,c,h),u.version=c.version}}return{get:a,remove:o,update:l}}var Oe=class s extends Qe{constructor(t=1,e=1,n=1,i=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:i};let r=t/2,a=e/2,o=Math.floor(n),l=Math.floor(i),c=o+1,h=l+1,u=t/o,d=e/l,p=[],g=[],y=[],m=[];for(let f=0;f<h;f++){let b=f*d-a;for(let v=0;v<c;v++){let E=v*u-r;g.push(E,-b,0),y.push(0,0,1),m.push(v/o),m.push(1-f/l)}}for(let f=0;f<l;f++)for(let b=0;b<o;b++){let v=b+c*f,E=b+c*(f+1),C=b+1+c*(f+1),T=b+1+c*f;p.push(v,E,T),p.push(E,C,T)}this.setIndex(p),this.setAttribute("position",new Je(g,3)),this.setAttribute("normal",new Je(y,3)),this.setAttribute("uv",new Je(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new s(t.width,t.height,t.widthSegments,t.heightSegments)}},Tf=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Af=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,Cf=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Rf=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Pf=`#ifdef USE_ALPHATEST
	if ( diffuseColor.a < alphaTest ) discard;
#endif`,If=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,Lf=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,Df=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,kf=`#ifdef USE_BATCHING
	attribute float batchId;
	uniform highp sampler2D batchingTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,Uf=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( batchId );
#endif`,Ff=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,Nf=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,Of=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,Bf=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,Hf=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,zf=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#pragma unroll_loop_start
	for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
		plane = clippingPlanes[ i ];
		if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
	}
	#pragma unroll_loop_end
	#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
		bool clipped = true;
		#pragma unroll_loop_start
		for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
		}
		#pragma unroll_loop_end
		if ( clipped ) discard;
	#endif
#endif`,Vf=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Gf=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Wf=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,$f=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,Xf=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,qf=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
	varying vec3 vColor;
#endif`,Yf=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif`,Zf=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
float luminance( const in vec3 rgb ) {
	const vec3 weights = vec3( 0.2126729, 0.7151522, 0.0721750 );
	return dot( weights, rgb );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,Jf=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,jf=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,Kf=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Qf=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,tp=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,ep=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,np="gl_FragColor = linearToOutputTexel( gl_FragColor );",ip=`
const mat3 LINEAR_SRGB_TO_LINEAR_DISPLAY_P3 = mat3(
	vec3( 0.8224621, 0.177538, 0.0 ),
	vec3( 0.0331941, 0.9668058, 0.0 ),
	vec3( 0.0170827, 0.0723974, 0.9105199 )
);
const mat3 LINEAR_DISPLAY_P3_TO_LINEAR_SRGB = mat3(
	vec3( 1.2249401, - 0.2249404, 0.0 ),
	vec3( - 0.0420569, 1.0420571, 0.0 ),
	vec3( - 0.0196376, - 0.0786361, 1.0982735 )
);
vec4 LinearSRGBToLinearDisplayP3( in vec4 value ) {
	return vec4( value.rgb * LINEAR_SRGB_TO_LINEAR_DISPLAY_P3, value.a );
}
vec4 LinearDisplayP3ToLinearSRGB( in vec4 value ) {
	return vec4( value.rgb * LINEAR_DISPLAY_P3_TO_LINEAR_SRGB, value.a );
}
vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}
vec4 LinearToLinear( in vec4 value ) {
	return value;
}
vec4 LinearTosRGB( in vec4 value ) {
	return sRGBTransferOETF( value );
}`,sp=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,rp=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,ap=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,op=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,lp=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,cp=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,hp=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,up=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,dp=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,fp=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,pp=`#ifdef USE_LIGHTMAP
	vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
	vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
	reflectedLight.indirectDiffuse += lightMapIrradiance;
#endif`,mp=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,gp=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,yp=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,vp=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	#if defined ( LEGACY_LIGHTS )
		if ( cutoffDistance > 0.0 && decayExponent > 0.0 ) {
			return pow( saturate( - lightDistance / cutoffDistance + 1.0 ), decayExponent );
		}
		return 1.0;
	#else
		float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
		if ( cutoffDistance > 0.0 ) {
			distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
		}
		return distanceFalloff;
	#endif
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,xp=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,bp=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,_p=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Sp=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Mp=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,wp=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,Ep=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,Tp=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,Ap=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,Cp=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Rp=`#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )
	gl_FragDepthEXT = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Pp=`#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Ip=`#ifdef USE_LOGDEPTHBUF
	#ifdef USE_LOGDEPTHBUF_EXT
		varying float vFragDepth;
		varying float vIsPerspective;
	#else
		uniform float logDepthBufFC;
	#endif
#endif`,Lp=`#ifdef USE_LOGDEPTHBUF
	#ifdef USE_LOGDEPTHBUF_EXT
		vFragDepth = 1.0 + gl_Position.w;
		vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
	#else
		if ( isPerspectiveMatrix( projectionMatrix ) ) {
			gl_Position.z = log2( max( EPSILON, gl_Position.w + 1.0 ) ) * logDepthBufFC - 1.0;
			gl_Position.z *= gl_Position.w;
		}
	#endif
#endif`,Dp=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
	
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,kp=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,Up=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,Fp=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Np=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Op=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,Bp=`#if defined( USE_MORPHCOLORS ) && defined( MORPHTARGETS_TEXTURE )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,Hp=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	#ifdef MORPHTARGETS_TEXTURE
		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
			if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
		}
	#else
		objectNormal += morphNormal0 * morphTargetInfluences[ 0 ];
		objectNormal += morphNormal1 * morphTargetInfluences[ 1 ];
		objectNormal += morphNormal2 * morphTargetInfluences[ 2 ];
		objectNormal += morphNormal3 * morphTargetInfluences[ 3 ];
	#endif
#endif`,zp=`#ifdef USE_MORPHTARGETS
	uniform float morphTargetBaseInfluence;
	#ifdef MORPHTARGETS_TEXTURE
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
		uniform sampler2DArray morphTargetsTexture;
		uniform ivec2 morphTargetsTextureSize;
		vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
			int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
			int y = texelIndex / morphTargetsTextureSize.x;
			int x = texelIndex - y * morphTargetsTextureSize.x;
			ivec3 morphUV = ivec3( x, y, morphTargetIndex );
			return texelFetch( morphTargetsTexture, morphUV, 0 );
		}
	#else
		#ifndef USE_MORPHNORMALS
			uniform float morphTargetInfluences[ 8 ];
		#else
			uniform float morphTargetInfluences[ 4 ];
		#endif
	#endif
#endif`,Vp=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	#ifdef MORPHTARGETS_TEXTURE
		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
			if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
		}
	#else
		transformed += morphTarget0 * morphTargetInfluences[ 0 ];
		transformed += morphTarget1 * morphTargetInfluences[ 1 ];
		transformed += morphTarget2 * morphTargetInfluences[ 2 ];
		transformed += morphTarget3 * morphTargetInfluences[ 3 ];
		#ifndef USE_MORPHNORMALS
			transformed += morphTarget4 * morphTargetInfluences[ 4 ];
			transformed += morphTarget5 * morphTargetInfluences[ 5 ];
			transformed += morphTarget6 * morphTargetInfluences[ 6 ];
			transformed += morphTarget7 * morphTargetInfluences[ 7 ];
		#endif
	#endif
#endif`,Gp=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,Wp=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,$p=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Xp=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,qp=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,Yp=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,Zp=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,Jp=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,jp=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,Kp=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,Qp=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,tm=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;
const vec3 PackFactors = vec3( 256. * 256. * 256., 256. * 256., 256. );
const vec4 UnpackFactors = UnpackDownscale / vec4( PackFactors, 1. );
const float ShiftRight8 = 1. / 256.;
vec4 packDepthToRGBA( const in float v ) {
	vec4 r = vec4( fract( v * PackFactors ), v );
	r.yzw -= r.xyz * ShiftRight8;	return r * PackUpscale;
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors );
}
vec2 packDepthToRG( in highp float v ) {
	return packDepthToRGBA( v ).yx;
}
float unpackRGToDepth( const in highp vec2 v ) {
	return unpackRGBAToDepth( vec4( v.xy, 0.0, 0.0 ) );
}
vec4 pack2HalfToRGBA( vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,em=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,nm=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,im=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,sm=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,rm=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,am=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,om=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		float hard_shadow = step( compare , distribution.x );
		if (hard_shadow != 1.0 ) {
			float distance = compare - distribution.x ;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return shadow;
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
		vec3 lightToPosition = shadowCoord.xyz;
		float dp = ( length( lightToPosition ) - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );		dp += shadowBias;
		vec3 bd3D = normalize( lightToPosition );
		#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
			vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
			return (
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
			) * ( 1.0 / 9.0 );
		#else
			return texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
		#endif
	}
#endif`,lm=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,cm=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,hm=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,um=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,dm=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,fm=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,pm=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,mm=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,gm=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,ym=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,vm=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 OptimizedCineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color *= toneMappingExposure;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	return color;
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,xm=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,bm=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
		vec3 refractedRayExit = position + transmissionRay;
		vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
		vec2 refractionCoords = ndcPos.xy / ndcPos.w;
		refractionCoords += 1.0;
		refractionCoords /= 2.0;
		vec4 transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
		vec3 transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,_m=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Sm=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Mm=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,wm=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,Em=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,Tm=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Am=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Cm=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Rm=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Pm=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Im=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,Lm=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( 1.0 );
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#endif
}`,Dm=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,km=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( 1.0 );
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,Um=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,Fm=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Nm=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Om=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Bm=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,Hm=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,zm=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Vm=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Gm=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,Wm=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,$m=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,Xm=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), opacity );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,qm=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Ym=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Zm=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,Jm=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,jm=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Km=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Qm=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,tg=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,eg=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,ng=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,ig=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
	vec2 scale;
	scale.x = length( vec3( modelMatrix[ 0 ].x, modelMatrix[ 0 ].y, modelMatrix[ 0 ].z ) );
	scale.y = length( vec3( modelMatrix[ 1 ].x, modelMatrix[ 1 ].y, modelMatrix[ 1 ].z ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,sg=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Ht={alphahash_fragment:Tf,alphahash_pars_fragment:Af,alphamap_fragment:Cf,alphamap_pars_fragment:Rf,alphatest_fragment:Pf,alphatest_pars_fragment:If,aomap_fragment:Lf,aomap_pars_fragment:Df,batching_pars_vertex:kf,batching_vertex:Uf,begin_vertex:Ff,beginnormal_vertex:Nf,bsdfs:Of,iridescence_fragment:Bf,bumpmap_pars_fragment:Hf,clipping_planes_fragment:zf,clipping_planes_pars_fragment:Vf,clipping_planes_pars_vertex:Gf,clipping_planes_vertex:Wf,color_fragment:$f,color_pars_fragment:Xf,color_pars_vertex:qf,color_vertex:Yf,common:Zf,cube_uv_reflection_fragment:Jf,defaultnormal_vertex:jf,displacementmap_pars_vertex:Kf,displacementmap_vertex:Qf,emissivemap_fragment:tp,emissivemap_pars_fragment:ep,colorspace_fragment:np,colorspace_pars_fragment:ip,envmap_fragment:sp,envmap_common_pars_fragment:rp,envmap_pars_fragment:ap,envmap_pars_vertex:op,envmap_physical_pars_fragment:xp,envmap_vertex:lp,fog_vertex:cp,fog_pars_vertex:hp,fog_fragment:up,fog_pars_fragment:dp,gradientmap_pars_fragment:fp,lightmap_fragment:pp,lightmap_pars_fragment:mp,lights_lambert_fragment:gp,lights_lambert_pars_fragment:yp,lights_pars_begin:vp,lights_toon_fragment:bp,lights_toon_pars_fragment:_p,lights_phong_fragment:Sp,lights_phong_pars_fragment:Mp,lights_physical_fragment:wp,lights_physical_pars_fragment:Ep,lights_fragment_begin:Tp,lights_fragment_maps:Ap,lights_fragment_end:Cp,logdepthbuf_fragment:Rp,logdepthbuf_pars_fragment:Pp,logdepthbuf_pars_vertex:Ip,logdepthbuf_vertex:Lp,map_fragment:Dp,map_pars_fragment:kp,map_particle_fragment:Up,map_particle_pars_fragment:Fp,metalnessmap_fragment:Np,metalnessmap_pars_fragment:Op,morphcolor_vertex:Bp,morphnormal_vertex:Hp,morphtarget_pars_vertex:zp,morphtarget_vertex:Vp,normal_fragment_begin:Gp,normal_fragment_maps:Wp,normal_pars_fragment:$p,normal_pars_vertex:Xp,normal_vertex:qp,normalmap_pars_fragment:Yp,clearcoat_normal_fragment_begin:Zp,clearcoat_normal_fragment_maps:Jp,clearcoat_pars_fragment:jp,iridescence_pars_fragment:Kp,opaque_fragment:Qp,packing:tm,premultiplied_alpha_fragment:em,project_vertex:nm,dithering_fragment:im,dithering_pars_fragment:sm,roughnessmap_fragment:rm,roughnessmap_pars_fragment:am,shadowmap_pars_fragment:om,shadowmap_pars_vertex:lm,shadowmap_vertex:cm,shadowmask_pars_fragment:hm,skinbase_vertex:um,skinning_pars_vertex:dm,skinning_vertex:fm,skinnormal_vertex:pm,specularmap_fragment:mm,specularmap_pars_fragment:gm,tonemapping_fragment:ym,tonemapping_pars_fragment:vm,transmission_fragment:xm,transmission_pars_fragment:bm,uv_pars_fragment:_m,uv_pars_vertex:Sm,uv_vertex:Mm,worldpos_vertex:wm,background_vert:Em,background_frag:Tm,backgroundCube_vert:Am,backgroundCube_frag:Cm,cube_vert:Rm,cube_frag:Pm,depth_vert:Im,depth_frag:Lm,distanceRGBA_vert:Dm,distanceRGBA_frag:km,equirect_vert:Um,equirect_frag:Fm,linedashed_vert:Nm,linedashed_frag:Om,meshbasic_vert:Bm,meshbasic_frag:Hm,meshlambert_vert:zm,meshlambert_frag:Vm,meshmatcap_vert:Gm,meshmatcap_frag:Wm,meshnormal_vert:$m,meshnormal_frag:Xm,meshphong_vert:qm,meshphong_frag:Ym,meshphysical_vert:Zm,meshphysical_frag:Jm,meshtoon_vert:jm,meshtoon_frag:Km,points_vert:Qm,points_frag:tg,shadow_vert:eg,shadow_frag:ng,sprite_vert:ig,sprite_frag:sg},rt={common:{diffuse:{value:new Vt(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Wt},alphaMap:{value:null},alphaMapTransform:{value:new Wt},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Wt}},envmap:{envMap:{value:null},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Wt}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Wt}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Wt},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Wt},normalScale:{value:new Ft(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Wt},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Wt}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Wt}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Wt}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Vt(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new Vt(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Wt},alphaTest:{value:0},uvTransform:{value:new Wt}},sprite:{diffuse:{value:new Vt(16777215)},opacity:{value:1},center:{value:new Ft(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Wt},alphaMap:{value:null},alphaMapTransform:{value:new Wt},alphaTest:{value:0}}},Mn={basic:{uniforms:Ve([rt.common,rt.specularmap,rt.envmap,rt.aomap,rt.lightmap,rt.fog]),vertexShader:Ht.meshbasic_vert,fragmentShader:Ht.meshbasic_frag},lambert:{uniforms:Ve([rt.common,rt.specularmap,rt.envmap,rt.aomap,rt.lightmap,rt.emissivemap,rt.bumpmap,rt.normalmap,rt.displacementmap,rt.fog,rt.lights,{emissive:{value:new Vt(0)}}]),vertexShader:Ht.meshlambert_vert,fragmentShader:Ht.meshlambert_frag},phong:{uniforms:Ve([rt.common,rt.specularmap,rt.envmap,rt.aomap,rt.lightmap,rt.emissivemap,rt.bumpmap,rt.normalmap,rt.displacementmap,rt.fog,rt.lights,{emissive:{value:new Vt(0)},specular:{value:new Vt(1118481)},shininess:{value:30}}]),vertexShader:Ht.meshphong_vert,fragmentShader:Ht.meshphong_frag},standard:{uniforms:Ve([rt.common,rt.envmap,rt.aomap,rt.lightmap,rt.emissivemap,rt.bumpmap,rt.normalmap,rt.displacementmap,rt.roughnessmap,rt.metalnessmap,rt.fog,rt.lights,{emissive:{value:new Vt(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ht.meshphysical_vert,fragmentShader:Ht.meshphysical_frag},toon:{uniforms:Ve([rt.common,rt.aomap,rt.lightmap,rt.emissivemap,rt.bumpmap,rt.normalmap,rt.displacementmap,rt.gradientmap,rt.fog,rt.lights,{emissive:{value:new Vt(0)}}]),vertexShader:Ht.meshtoon_vert,fragmentShader:Ht.meshtoon_frag},matcap:{uniforms:Ve([rt.common,rt.bumpmap,rt.normalmap,rt.displacementmap,rt.fog,{matcap:{value:null}}]),vertexShader:Ht.meshmatcap_vert,fragmentShader:Ht.meshmatcap_frag},points:{uniforms:Ve([rt.points,rt.fog]),vertexShader:Ht.points_vert,fragmentShader:Ht.points_frag},dashed:{uniforms:Ve([rt.common,rt.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ht.linedashed_vert,fragmentShader:Ht.linedashed_frag},depth:{uniforms:Ve([rt.common,rt.displacementmap]),vertexShader:Ht.depth_vert,fragmentShader:Ht.depth_frag},normal:{uniforms:Ve([rt.common,rt.bumpmap,rt.normalmap,rt.displacementmap,{opacity:{value:1}}]),vertexShader:Ht.meshnormal_vert,fragmentShader:Ht.meshnormal_frag},sprite:{uniforms:Ve([rt.sprite,rt.fog]),vertexShader:Ht.sprite_vert,fragmentShader:Ht.sprite_frag},background:{uniforms:{uvTransform:{value:new Wt},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ht.background_vert,fragmentShader:Ht.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1}},vertexShader:Ht.backgroundCube_vert,fragmentShader:Ht.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ht.cube_vert,fragmentShader:Ht.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ht.equirect_vert,fragmentShader:Ht.equirect_frag},distanceRGBA:{uniforms:Ve([rt.common,rt.displacementmap,{referencePosition:{value:new D},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Ht.distanceRGBA_vert,fragmentShader:Ht.distanceRGBA_frag},shadow:{uniforms:Ve([rt.lights,rt.fog,{color:{value:new Vt(0)},opacity:{value:1}}]),vertexShader:Ht.shadow_vert,fragmentShader:Ht.shadow_frag}};Mn.physical={uniforms:Ve([Mn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Wt},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Wt},clearcoatNormalScale:{value:new Ft(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Wt},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Wt},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Wt},sheen:{value:0},sheenColor:{value:new Vt(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Wt},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Wt},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Wt},transmissionSamplerSize:{value:new Ft},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Wt},attenuationDistance:{value:0},attenuationColor:{value:new Vt(0)},specularColor:{value:new Vt(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Wt},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Wt},anisotropyVector:{value:new Ft},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Wt}}]),vertexShader:Ht.meshphysical_vert,fragmentShader:Ht.meshphysical_frag};var Tr={r:0,b:0,g:0};function rg(s,t,e,n,i,r,a){let o=new Vt(0),l=r===!0?0:1,c,h,u=null,d=0,p=null;function g(m,f){let b=!1,v=f.isScene===!0?f.background:null;v&&v.isTexture&&(v=(f.backgroundBlurriness>0?e:t).get(v)),v===null?y(o,l):v&&v.isColor&&(y(v,1),b=!0);let E=s.xr.getEnvironmentBlendMode();E==="additive"?n.buffers.color.setClear(0,0,0,1,a):E==="alpha-blend"&&n.buffers.color.setClear(0,0,0,0,a),(s.autoClear||b)&&s.clear(s.autoClearColor,s.autoClearDepth,s.autoClearStencil),v&&(v.isCubeTexture||v.mapping===ra)?(h===void 0&&(h=new ce(new Os(1,1,1),new Wn({name:"BackgroundCubeMaterial",uniforms:ds(Mn.backgroundCube.uniforms),vertexShader:Mn.backgroundCube.vertexShader,fragmentShader:Mn.backgroundCube.fragmentShader,side:Ze,depthTest:!1,depthWrite:!1,fog:!1})),h.geometry.deleteAttribute("normal"),h.geometry.deleteAttribute("uv"),h.onBeforeRender=function(C,T,A){this.matrixWorld.copyPosition(A.matrixWorld)},Object.defineProperty(h.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(h)),h.material.uniforms.envMap.value=v,h.material.uniforms.flipEnvMap.value=v.isCubeTexture&&v.isRenderTargetTexture===!1?-1:1,h.material.uniforms.backgroundBlurriness.value=f.backgroundBlurriness,h.material.uniforms.backgroundIntensity.value=f.backgroundIntensity,h.material.toneMapped=ie.getTransfer(v.colorSpace)!==le,(u!==v||d!==v.version||p!==s.toneMapping)&&(h.material.needsUpdate=!0,u=v,d=v.version,p=s.toneMapping),h.layers.enableAll(),m.unshift(h,h.geometry,h.material,0,0,null)):v&&v.isTexture&&(c===void 0&&(c=new ce(new Oe(2,2),new Wn({name:"BackgroundMaterial",uniforms:ds(Mn.background.uniforms),vertexShader:Mn.background.vertexShader,fragmentShader:Mn.background.fragmentShader,side:li,depthTest:!1,depthWrite:!1,fog:!1})),c.geometry.deleteAttribute("normal"),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(c)),c.material.uniforms.t2D.value=v,c.material.uniforms.backgroundIntensity.value=f.backgroundIntensity,c.material.toneMapped=ie.getTransfer(v.colorSpace)!==le,v.matrixAutoUpdate===!0&&v.updateMatrix(),c.material.uniforms.uvTransform.value.copy(v.matrix),(u!==v||d!==v.version||p!==s.toneMapping)&&(c.material.needsUpdate=!0,u=v,d=v.version,p=s.toneMapping),c.layers.enableAll(),m.unshift(c,c.geometry,c.material,0,0,null))}function y(m,f){m.getRGB(Tr,Uh(s)),n.buffers.color.setClear(Tr.r,Tr.g,Tr.b,f,a)}return{getClearColor:function(){return o},setClearColor:function(m,f=1){o.set(m),l=f,y(o,l)},getClearAlpha:function(){return l},setClearAlpha:function(m){l=m,y(o,l)},render:g}}function ag(s,t,e,n){let i=s.getParameter(s.MAX_VERTEX_ATTRIBS),r=n.isWebGL2?null:t.get("OES_vertex_array_object"),a=n.isWebGL2||r!==null,o={},l=m(null),c=l,h=!1;function u(L,O,q,Z,W){let U=!1;if(a){let Y=y(Z,q,O);c!==Y&&(c=Y,p(c.object)),U=f(L,Z,q,W),U&&b(L,Z,q,W)}else{let Y=O.wireframe===!0;(c.geometry!==Z.id||c.program!==q.id||c.wireframe!==Y)&&(c.geometry=Z.id,c.program=q.id,c.wireframe=Y,U=!0)}W!==null&&e.update(W,s.ELEMENT_ARRAY_BUFFER),(U||h)&&(h=!1,X(L,O,q,Z),W!==null&&s.bindBuffer(s.ELEMENT_ARRAY_BUFFER,e.get(W).buffer))}function d(){return n.isWebGL2?s.createVertexArray():r.createVertexArrayOES()}function p(L){return n.isWebGL2?s.bindVertexArray(L):r.bindVertexArrayOES(L)}function g(L){return n.isWebGL2?s.deleteVertexArray(L):r.deleteVertexArrayOES(L)}function y(L,O,q){let Z=q.wireframe===!0,W=o[L.id];W===void 0&&(W={},o[L.id]=W);let U=W[O.id];U===void 0&&(U={},W[O.id]=U);let Y=U[Z];return Y===void 0&&(Y=m(d()),U[Z]=Y),Y}function m(L){let O=[],q=[],Z=[];for(let W=0;W<i;W++)O[W]=0,q[W]=0,Z[W]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:O,enabledAttributes:q,attributeDivisors:Z,object:L,attributes:{},index:null}}function f(L,O,q,Z){let W=c.attributes,U=O.attributes,Y=0,et=q.getAttributes();for(let ht in et)if(et[ht].location>=0){let J=W[ht],ut=U[ht];if(ut===void 0&&(ht==="instanceMatrix"&&L.instanceMatrix&&(ut=L.instanceMatrix),ht==="instanceColor"&&L.instanceColor&&(ut=L.instanceColor)),J===void 0||J.attribute!==ut||ut&&J.data!==ut.data)return!0;Y++}return c.attributesNum!==Y||c.index!==Z}function b(L,O,q,Z){let W={},U=O.attributes,Y=0,et=q.getAttributes();for(let ht in et)if(et[ht].location>=0){let J=U[ht];J===void 0&&(ht==="instanceMatrix"&&L.instanceMatrix&&(J=L.instanceMatrix),ht==="instanceColor"&&L.instanceColor&&(J=L.instanceColor));let ut={};ut.attribute=J,J&&J.data&&(ut.data=J.data),W[ht]=ut,Y++}c.attributes=W,c.attributesNum=Y,c.index=Z}function v(){let L=c.newAttributes;for(let O=0,q=L.length;O<q;O++)L[O]=0}function E(L){C(L,0)}function C(L,O){let q=c.newAttributes,Z=c.enabledAttributes,W=c.attributeDivisors;q[L]=1,Z[L]===0&&(s.enableVertexAttribArray(L),Z[L]=1),W[L]!==O&&((n.isWebGL2?s:t.get("ANGLE_instanced_arrays"))[n.isWebGL2?"vertexAttribDivisor":"vertexAttribDivisorANGLE"](L,O),W[L]=O)}function T(){let L=c.newAttributes,O=c.enabledAttributes;for(let q=0,Z=O.length;q<Z;q++)O[q]!==L[q]&&(s.disableVertexAttribArray(q),O[q]=0)}function A(L,O,q,Z,W,U,Y){Y===!0?s.vertexAttribIPointer(L,O,q,W,U):s.vertexAttribPointer(L,O,q,Z,W,U)}function X(L,O,q,Z){if(n.isWebGL2===!1&&(L.isInstancedMesh||Z.isInstancedBufferGeometry)&&t.get("ANGLE_instanced_arrays")===null)return;v();let W=Z.attributes,U=q.getAttributes(),Y=O.defaultAttributeValues;for(let et in U){let ht=U[et];if(ht.location>=0){let $=W[et];if($===void 0&&(et==="instanceMatrix"&&L.instanceMatrix&&($=L.instanceMatrix),et==="instanceColor"&&L.instanceColor&&($=L.instanceColor)),$!==void 0){let J=$.normalized,ut=$.itemSize,vt=e.get($);if(vt===void 0)continue;let yt=vt.buffer,It=vt.type,Pt=vt.bytesPerElement,St=n.isWebGL2===!0&&(It===s.INT||It===s.UNSIGNED_INT||$.gpuType===wh);if($.isInterleavedBufferAttribute){let $t=$.data,H=$t.stride,fe=$.offset;if($t.isInstancedInterleavedBuffer){for(let _t=0;_t<ht.locationSize;_t++)C(ht.location+_t,$t.meshPerAttribute);L.isInstancedMesh!==!0&&Z._maxInstanceCount===void 0&&(Z._maxInstanceCount=$t.meshPerAttribute*$t.count)}else for(let _t=0;_t<ht.locationSize;_t++)E(ht.location+_t);s.bindBuffer(s.ARRAY_BUFFER,yt);for(let _t=0;_t<ht.locationSize;_t++)A(ht.location+_t,ut/ht.locationSize,It,J,H*Pt,(fe+ut/ht.locationSize*_t)*Pt,St)}else{if($.isInstancedBufferAttribute){for(let $t=0;$t<ht.locationSize;$t++)C(ht.location+$t,$.meshPerAttribute);L.isInstancedMesh!==!0&&Z._maxInstanceCount===void 0&&(Z._maxInstanceCount=$.meshPerAttribute*$.count)}else for(let $t=0;$t<ht.locationSize;$t++)E(ht.location+$t);s.bindBuffer(s.ARRAY_BUFFER,yt);for(let $t=0;$t<ht.locationSize;$t++)A(ht.location+$t,ut/ht.locationSize,It,J,ut*Pt,ut/ht.locationSize*$t*Pt,St)}}else if(Y!==void 0){let J=Y[et];if(J!==void 0)switch(J.length){case 2:s.vertexAttrib2fv(ht.location,J);break;case 3:s.vertexAttrib3fv(ht.location,J);break;case 4:s.vertexAttrib4fv(ht.location,J);break;default:s.vertexAttrib1fv(ht.location,J)}}}}T()}function S(){N();for(let L in o){let O=o[L];for(let q in O){let Z=O[q];for(let W in Z)g(Z[W].object),delete Z[W];delete O[q]}delete o[L]}}function x(L){if(o[L.id]===void 0)return;let O=o[L.id];for(let q in O){let Z=O[q];for(let W in Z)g(Z[W].object),delete Z[W];delete O[q]}delete o[L.id]}function I(L){for(let O in o){let q=o[O];if(q[L.id]===void 0)continue;let Z=q[L.id];for(let W in Z)g(Z[W].object),delete Z[W];delete q[L.id]}}function N(){K(),h=!0,c!==l&&(c=l,p(c.object))}function K(){l.geometry=null,l.program=null,l.wireframe=!1}return{setup:u,reset:N,resetDefaultState:K,dispose:S,releaseStatesOfGeometry:x,releaseStatesOfProgram:I,initAttributes:v,enableAttribute:E,disableUnusedAttributes:T}}function og(s,t,e,n){let i=n.isWebGL2,r;function a(h){r=h}function o(h,u){s.drawArrays(r,h,u),e.update(u,r,1)}function l(h,u,d){if(d===0)return;let p,g;if(i)p=s,g="drawArraysInstanced";else if(p=t.get("ANGLE_instanced_arrays"),g="drawArraysInstancedANGLE",p===null){console.error("THREE.WebGLBufferRenderer: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.");return}p[g](r,h,u,d),e.update(u,r,d)}function c(h,u,d){if(d===0)return;let p=t.get("WEBGL_multi_draw");if(p===null)for(let g=0;g<d;g++)this.render(h[g],u[g]);else{p.multiDrawArraysWEBGL(r,h,0,u,0,d);let g=0;for(let y=0;y<d;y++)g+=u[y];e.update(g,r,1)}}this.setMode=a,this.render=o,this.renderInstances=l,this.renderMultiDraw=c}function lg(s,t,e){let n;function i(){if(n!==void 0)return n;if(t.has("EXT_texture_filter_anisotropic")===!0){let A=t.get("EXT_texture_filter_anisotropic");n=s.getParameter(A.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else n=0;return n}function r(A){if(A==="highp"){if(s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.HIGH_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.HIGH_FLOAT).precision>0)return"highp";A="mediump"}return A==="mediump"&&s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.MEDIUM_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let a=typeof WebGL2RenderingContext<"u"&&s.constructor.name==="WebGL2RenderingContext",o=e.precision!==void 0?e.precision:"highp",l=r(o);l!==o&&(console.warn("THREE.WebGLRenderer:",o,"not supported, using",l,"instead."),o=l);let c=a||t.has("WEBGL_draw_buffers"),h=e.logarithmicDepthBuffer===!0,u=s.getParameter(s.MAX_TEXTURE_IMAGE_UNITS),d=s.getParameter(s.MAX_VERTEX_TEXTURE_IMAGE_UNITS),p=s.getParameter(s.MAX_TEXTURE_SIZE),g=s.getParameter(s.MAX_CUBE_MAP_TEXTURE_SIZE),y=s.getParameter(s.MAX_VERTEX_ATTRIBS),m=s.getParameter(s.MAX_VERTEX_UNIFORM_VECTORS),f=s.getParameter(s.MAX_VARYING_VECTORS),b=s.getParameter(s.MAX_FRAGMENT_UNIFORM_VECTORS),v=d>0,E=a||t.has("OES_texture_float"),C=v&&E,T=a?s.getParameter(s.MAX_SAMPLES):0;return{isWebGL2:a,drawBuffers:c,getMaxAnisotropy:i,getMaxPrecision:r,precision:o,logarithmicDepthBuffer:h,maxTextures:u,maxVertexTextures:d,maxTextureSize:p,maxCubemapSize:g,maxAttributes:y,maxVertexUniforms:m,maxVaryings:f,maxFragmentUniforms:b,vertexTextures:v,floatFragmentTextures:E,floatVertexTextures:C,maxSamples:T}}function cg(s){let t=this,e=null,n=0,i=!1,r=!1,a=new Nn,o=new Wt,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(u,d){let p=u.length!==0||d||n!==0||i;return i=d,n=u.length,p},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(u,d){e=h(u,d,0)},this.setState=function(u,d,p){let g=u.clippingPlanes,y=u.clipIntersection,m=u.clipShadows,f=s.get(u);if(!i||g===null||g.length===0||r&&!m)r?h(null):c();else{let b=r?0:n,v=b*4,E=f.clippingState||null;l.value=E,E=h(g,d,v,p);for(let C=0;C!==v;++C)E[C]=e[C];f.clippingState=E,this.numIntersection=y?this.numPlanes:0,this.numPlanes+=b}};function c(){l.value!==e&&(l.value=e,l.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function h(u,d,p,g){let y=u!==null?u.length:0,m=null;if(y!==0){if(m=l.value,g!==!0||m===null){let f=p+y*4,b=d.matrixWorldInverse;o.getNormalMatrix(b),(m===null||m.length<f)&&(m=new Float32Array(f));for(let v=0,E=p;v!==y;++v,E+=4)a.copy(u[v]).applyMatrix4(b,o),a.normal.toArray(m,E),m[E+3]=a.constant}l.value=m,l.needsUpdate=!0}return t.numPlanes=y,t.numIntersection=0,m}}function hg(s){let t=new WeakMap;function e(a,o){return o===So?a.mapping=os:o===Mo&&(a.mapping=ls),a}function n(a){if(a&&a.isTexture){let o=a.mapping;if(o===So||o===Mo)if(t.has(a)){let l=t.get(a).texture;return e(l,a.mapping)}else{let l=a.image;if(l&&l.height>0){let c=new Io(l.height/2);return c.fromEquirectangularTexture(s,a),t.set(a,c),a.addEventListener("dispose",i),e(c.texture,a.mapping)}else return null}}return a}function i(a){let o=a.target;o.removeEventListener("dispose",i);let l=t.get(o);l!==void 0&&(t.delete(o),l.dispose())}function r(){t=new WeakMap}return{get:n,dispose:r}}var Lo=class extends Yr{constructor(t=-1,e=1,n=1,i=-1,r=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=i,this.near=r,this.far=a,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,i,r,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2,r=n-t,a=n+t,o=i+e,l=i-e;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,a=r+c*this.view.width,o-=h*this.view.offsetY,l=o-h*this.view.height}this.projectionMatrix.makeOrthographic(r,a,o,l,this.near,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}},is=4,Wc=[.125,.215,.35,.446,.526,.582],bi=20,fo=new Lo,$c=new Vt,po=null,mo=0,go=0,vi=(1+Math.sqrt(5))/2,Ki=1/vi,Xc=[new D(1,1,1),new D(-1,1,1),new D(1,1,-1),new D(-1,1,-1),new D(0,vi,Ki),new D(0,vi,-Ki),new D(Ki,0,vi),new D(-Ki,0,vi),new D(vi,Ki,0),new D(-vi,Ki,0)],jr=class{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(t,e=0,n=.1,i=100){po=this._renderer.getRenderTarget(),mo=this._renderer.getActiveCubeFace(),go=this._renderer.getActiveMipmapLevel(),this._setSize(256);let r=this._allocateTargets();return r.depthBuffer=!0,this._sceneToCubeUV(t,n,i,r),e>0&&this._blur(r,0,0,e),this._applyPMREM(r),this._cleanup(r),r}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Zc(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Yc(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodPlanes.length;t++)this._lodPlanes[t].dispose()}_cleanup(t){this._renderer.setRenderTarget(po,mo,go),t.scissorTest=!1,Ar(t,0,0,t.width,t.height)}_fromTexture(t,e){t.mapping===os||t.mapping===ls?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),po=this._renderer.getRenderTarget(),mo=this._renderer.getActiveCubeFace(),go=this._renderer.getActiveMipmapLevel();let n=e||this._allocateTargets();return this._textureToCubeUV(t,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let t=3*Math.max(this._cubeSize,112),e=4*this._cubeSize,n={magFilter:hn,minFilter:hn,generateMipmaps:!1,type:Fs,format:vn,colorSpace:zn,depthBuffer:!1},i=qc(t,e,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==e){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=qc(t,e,n);let{_lodMax:r}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=ug(r)),this._blurMaterial=dg(r,t,e)}return i}_compileMaterial(t){let e=new ce(this._lodPlanes[0],t);this._renderer.compile(e,fo)}_sceneToCubeUV(t,e,n,i){let o=new be(90,1,e,n),l=[1,-1,1,1,1,1],c=[1,1,1,-1,-1,-1],h=this._renderer,u=h.autoClear,d=h.toneMapping;h.getClearColor($c),h.toneMapping=ri,h.autoClear=!1;let p=new Le({name:"PMREM.Background",side:Ze,depthWrite:!1,depthTest:!1}),g=new ce(new Os,p),y=!1,m=t.background;m?m.isColor&&(p.color.copy(m),t.background=null,y=!0):(p.color.copy($c),y=!0);for(let f=0;f<6;f++){let b=f%3;b===0?(o.up.set(0,l[f],0),o.lookAt(c[f],0,0)):b===1?(o.up.set(0,0,l[f]),o.lookAt(0,c[f],0)):(o.up.set(0,l[f],0),o.lookAt(0,0,c[f]));let v=this._cubeSize;Ar(i,b*v,f>2?v:0,v,v),h.setRenderTarget(i),y&&h.render(g,o),h.render(t,o)}g.geometry.dispose(),g.material.dispose(),h.toneMapping=d,h.autoClear=u,t.background=m}_textureToCubeUV(t,e){let n=this._renderer,i=t.mapping===os||t.mapping===ls;i?(this._cubemapMaterial===null&&(this._cubemapMaterial=Zc()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Yc());let r=i?this._cubemapMaterial:this._equirectMaterial,a=new ce(this._lodPlanes[0],r),o=r.uniforms;o.envMap.value=t;let l=this._cubeSize;Ar(e,0,0,3*l,2*l),n.setRenderTarget(e),n.render(a,fo)}_applyPMREM(t){let e=this._renderer,n=e.autoClear;e.autoClear=!1;for(let i=1;i<this._lodPlanes.length;i++){let r=Math.sqrt(this._sigmas[i]*this._sigmas[i]-this._sigmas[i-1]*this._sigmas[i-1]),a=Xc[(i-1)%Xc.length];this._blur(t,i-1,i,r,a)}e.autoClear=n}_blur(t,e,n,i,r){let a=this._pingPongRenderTarget;this._halfBlur(t,a,e,n,i,"latitudinal",r),this._halfBlur(a,t,n,n,i,"longitudinal",r)}_halfBlur(t,e,n,i,r,a,o){let l=this._renderer,c=this._blurMaterial;a!=="latitudinal"&&a!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");let h=3,u=new ce(this._lodPlanes[i],c),d=c.uniforms,p=this._sizeLods[n]-1,g=isFinite(r)?Math.PI/(2*p):2*Math.PI/(2*bi-1),y=r/g,m=isFinite(r)?1+Math.floor(h*y):bi;m>bi&&console.warn(`sigmaRadians, ${r}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${bi}`);let f=[],b=0;for(let A=0;A<bi;++A){let X=A/y,S=Math.exp(-X*X/2);f.push(S),A===0?b+=S:A<m&&(b+=2*S)}for(let A=0;A<f.length;A++)f[A]=f[A]/b;d.envMap.value=t.texture,d.samples.value=m,d.weights.value=f,d.latitudinal.value=a==="latitudinal",o&&(d.poleAxis.value=o);let{_lodMax:v}=this;d.dTheta.value=g,d.mipInt.value=v-n;let E=this._sizeLods[i],C=3*E*(i>v-is?i-v+is:0),T=4*(this._cubeSize-E);Ar(e,C,T,3*E,2*E),l.setRenderTarget(e),l.render(u,fo)}};function ug(s){let t=[],e=[],n=[],i=s,r=s-is+1+Wc.length;for(let a=0;a<r;a++){let o=Math.pow(2,i);e.push(o);let l=1/o;a>s-is?l=Wc[a-s+is-1]:a===0&&(l=0),n.push(l);let c=1/(o-2),h=-c,u=1+c,d=[h,h,u,h,u,u,h,h,u,u,h,u],p=6,g=6,y=3,m=2,f=1,b=new Float32Array(y*g*p),v=new Float32Array(m*g*p),E=new Float32Array(f*g*p);for(let T=0;T<p;T++){let A=T%3*2/3-1,X=T>2?0:-1,S=[A,X,0,A+2/3,X,0,A+2/3,X+1,0,A,X,0,A+2/3,X+1,0,A,X+1,0];b.set(S,y*g*T),v.set(d,m*g*T);let x=[T,T,T,T,T,T];E.set(x,f*g*T)}let C=new Qe;C.setAttribute("position",new Ne(b,y)),C.setAttribute("uv",new Ne(v,m)),C.setAttribute("faceIndex",new Ne(E,f)),t.push(C),i>is&&i--}return{lodPlanes:t,sizeLods:e,sigmas:n}}function qc(s,t,e){let n=new Vn(s,t,e);return n.texture.mapping=ra,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function Ar(s,t,e,n,i){s.viewport.set(t,e,n,i),s.scissor.set(t,e,n,i)}function dg(s,t,e){let n=new Float32Array(bi),i=new D(0,1,0);return new Wn({name:"SphericalGaussianBlur",defines:{n:bi,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${s}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:i}},vertexShader:ol(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:ii,depthTest:!1,depthWrite:!1})}function Yc(){return new Wn({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:ol(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:ii,depthTest:!1,depthWrite:!1})}function Zc(){return new Wn({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:ol(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:ii,depthTest:!1,depthWrite:!1})}function ol(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function fg(s){let t=new WeakMap,e=null;function n(o){if(o&&o.isTexture){let l=o.mapping,c=l===So||l===Mo,h=l===os||l===ls;if(c||h)if(o.isRenderTargetTexture&&o.needsPMREMUpdate===!0){o.needsPMREMUpdate=!1;let u=t.get(o);return e===null&&(e=new jr(s)),u=c?e.fromEquirectangular(o,u):e.fromCubemap(o,u),t.set(o,u),u.texture}else{if(t.has(o))return t.get(o).texture;{let u=o.image;if(c&&u&&u.height>0||h&&u&&i(u)){e===null&&(e=new jr(s));let d=c?e.fromEquirectangular(o):e.fromCubemap(o);return t.set(o,d),o.addEventListener("dispose",r),d.texture}else return null}}}return o}function i(o){let l=0,c=6;for(let h=0;h<c;h++)o[h]!==void 0&&l++;return l===c}function r(o){let l=o.target;l.removeEventListener("dispose",r);let c=t.get(l);c!==void 0&&(t.delete(l),c.dispose())}function a(){t=new WeakMap,e!==null&&(e.dispose(),e=null)}return{get:n,dispose:a}}function pg(s){let t={};function e(n){if(t[n]!==void 0)return t[n];let i;switch(n){case"WEBGL_depth_texture":i=s.getExtension("WEBGL_depth_texture")||s.getExtension("MOZ_WEBGL_depth_texture")||s.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":i=s.getExtension("EXT_texture_filter_anisotropic")||s.getExtension("MOZ_EXT_texture_filter_anisotropic")||s.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":i=s.getExtension("WEBGL_compressed_texture_s3tc")||s.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":i=s.getExtension("WEBGL_compressed_texture_pvrtc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:i=s.getExtension(n)}return t[n]=i,i}return{has:function(n){return e(n)!==null},init:function(n){n.isWebGL2?(e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance")):(e("WEBGL_depth_texture"),e("OES_texture_float"),e("OES_texture_half_float"),e("OES_texture_half_float_linear"),e("OES_standard_derivatives"),e("OES_element_index_uint"),e("OES_vertex_array_object"),e("ANGLE_instanced_arrays")),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture")},get:function(n){let i=e(n);return i===null&&console.warn("THREE.WebGLRenderer: "+n+" extension not supported."),i}}}function mg(s,t,e,n){let i={},r=new WeakMap;function a(u){let d=u.target;d.index!==null&&t.remove(d.index);for(let g in d.attributes)t.remove(d.attributes[g]);for(let g in d.morphAttributes){let y=d.morphAttributes[g];for(let m=0,f=y.length;m<f;m++)t.remove(y[m])}d.removeEventListener("dispose",a),delete i[d.id];let p=r.get(d);p&&(t.remove(p),r.delete(d)),n.releaseStatesOfGeometry(d),d.isInstancedBufferGeometry===!0&&delete d._maxInstanceCount,e.memory.geometries--}function o(u,d){return i[d.id]===!0||(d.addEventListener("dispose",a),i[d.id]=!0,e.memory.geometries++),d}function l(u){let d=u.attributes;for(let g in d)t.update(d[g],s.ARRAY_BUFFER);let p=u.morphAttributes;for(let g in p){let y=p[g];for(let m=0,f=y.length;m<f;m++)t.update(y[m],s.ARRAY_BUFFER)}}function c(u){let d=[],p=u.index,g=u.attributes.position,y=0;if(p!==null){let b=p.array;y=p.version;for(let v=0,E=b.length;v<E;v+=3){let C=b[v+0],T=b[v+1],A=b[v+2];d.push(C,T,T,A,A,C)}}else if(g!==void 0){let b=g.array;y=g.version;for(let v=0,E=b.length/3-1;v<E;v+=3){let C=v+0,T=v+1,A=v+2;d.push(C,T,T,A,A,C)}}else return;let m=new(Dh(d)?qr:Xr)(d,1);m.version=y;let f=r.get(u);f&&t.remove(f),r.set(u,m)}function h(u){let d=r.get(u);if(d){let p=u.index;p!==null&&d.version<p.version&&c(u)}else c(u);return r.get(u)}return{get:o,update:l,getWireframeAttribute:h}}function gg(s,t,e,n){let i=n.isWebGL2,r;function a(p){r=p}let o,l;function c(p){o=p.type,l=p.bytesPerElement}function h(p,g){s.drawElements(r,g,o,p*l),e.update(g,r,1)}function u(p,g,y){if(y===0)return;let m,f;if(i)m=s,f="drawElementsInstanced";else if(m=t.get("ANGLE_instanced_arrays"),f="drawElementsInstancedANGLE",m===null){console.error("THREE.WebGLIndexedBufferRenderer: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.");return}m[f](r,g,o,p*l,y),e.update(g,r,y)}function d(p,g,y){if(y===0)return;let m=t.get("WEBGL_multi_draw");if(m===null)for(let f=0;f<y;f++)this.render(p[f]/l,g[f]);else{m.multiDrawElementsWEBGL(r,g,0,o,p,0,y);let f=0;for(let b=0;b<y;b++)f+=g[b];e.update(f,r,1)}}this.setMode=a,this.setIndex=c,this.render=h,this.renderInstances=u,this.renderMultiDraw=d}function yg(s){let t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,a,o){switch(e.calls++,a){case s.TRIANGLES:e.triangles+=o*(r/3);break;case s.LINES:e.lines+=o*(r/2);break;case s.LINE_STRIP:e.lines+=o*(r-1);break;case s.LINE_LOOP:e.lines+=o*r;break;case s.POINTS:e.points+=o*r;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",a);break}}function i(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:i,update:n}}function vg(s,t){return s[0]-t[0]}function xg(s,t){return Math.abs(t[1])-Math.abs(s[1])}function bg(s,t,e){let n={},i=new Float32Array(8),r=new WeakMap,a=new Ie,o=[];for(let c=0;c<8;c++)o[c]=[c,0];function l(c,h,u){let d=c.morphTargetInfluences;if(t.isWebGL2===!0){let p=h.morphAttributes.position||h.morphAttributes.normal||h.morphAttributes.color,g=p!==void 0?p.length:0,y=r.get(h);if(y===void 0||y.count!==g){let L=function(){N.dispose(),r.delete(h),h.removeEventListener("dispose",L)};y!==void 0&&y.texture.dispose();let b=h.morphAttributes.position!==void 0,v=h.morphAttributes.normal!==void 0,E=h.morphAttributes.color!==void 0,C=h.morphAttributes.position||[],T=h.morphAttributes.normal||[],A=h.morphAttributes.color||[],X=0;b===!0&&(X=1),v===!0&&(X=2),E===!0&&(X=3);let S=h.attributes.position.count*X,x=1;S>t.maxTextureSize&&(x=Math.ceil(S/t.maxTextureSize),S=t.maxTextureSize);let I=new Float32Array(S*x*4*g),N=new $r(I,S,x,g);N.type=ni,N.needsUpdate=!0;let K=X*4;for(let O=0;O<g;O++){let q=C[O],Z=T[O],W=A[O],U=S*x*4*O;for(let Y=0;Y<q.count;Y++){let et=Y*K;b===!0&&(a.fromBufferAttribute(q,Y),I[U+et+0]=a.x,I[U+et+1]=a.y,I[U+et+2]=a.z,I[U+et+3]=0),v===!0&&(a.fromBufferAttribute(Z,Y),I[U+et+4]=a.x,I[U+et+5]=a.y,I[U+et+6]=a.z,I[U+et+7]=0),E===!0&&(a.fromBufferAttribute(W,Y),I[U+et+8]=a.x,I[U+et+9]=a.y,I[U+et+10]=a.z,I[U+et+11]=W.itemSize===4?a.w:1)}}y={count:g,texture:N,size:new Ft(S,x)},r.set(h,y),h.addEventListener("dispose",L)}let m=0;for(let b=0;b<d.length;b++)m+=d[b];let f=h.morphTargetsRelative?1:1-m;u.getUniforms().setValue(s,"morphTargetBaseInfluence",f),u.getUniforms().setValue(s,"morphTargetInfluences",d),u.getUniforms().setValue(s,"morphTargetsTexture",y.texture,e),u.getUniforms().setValue(s,"morphTargetsTextureSize",y.size)}else{let p=d===void 0?0:d.length,g=n[h.id];if(g===void 0||g.length!==p){g=[];for(let v=0;v<p;v++)g[v]=[v,0];n[h.id]=g}for(let v=0;v<p;v++){let E=g[v];E[0]=v,E[1]=d[v]}g.sort(xg);for(let v=0;v<8;v++)v<p&&g[v][1]?(o[v][0]=g[v][0],o[v][1]=g[v][1]):(o[v][0]=Number.MAX_SAFE_INTEGER,o[v][1]=0);o.sort(vg);let y=h.morphAttributes.position,m=h.morphAttributes.normal,f=0;for(let v=0;v<8;v++){let E=o[v],C=E[0],T=E[1];C!==Number.MAX_SAFE_INTEGER&&T?(y&&h.getAttribute("morphTarget"+v)!==y[C]&&h.setAttribute("morphTarget"+v,y[C]),m&&h.getAttribute("morphNormal"+v)!==m[C]&&h.setAttribute("morphNormal"+v,m[C]),i[v]=T,f+=T):(y&&h.hasAttribute("morphTarget"+v)===!0&&h.deleteAttribute("morphTarget"+v),m&&h.hasAttribute("morphNormal"+v)===!0&&h.deleteAttribute("morphNormal"+v),i[v]=0)}let b=h.morphTargetsRelative?1:1-f;u.getUniforms().setValue(s,"morphTargetBaseInfluence",b),u.getUniforms().setValue(s,"morphTargetInfluences",i)}}return{update:l}}function _g(s,t,e,n){let i=new WeakMap;function r(l){let c=n.render.frame,h=l.geometry,u=t.get(l,h);if(i.get(u)!==c&&(t.update(u),i.set(u,c)),l.isInstancedMesh&&(l.hasEventListener("dispose",o)===!1&&l.addEventListener("dispose",o),i.get(l)!==c&&(e.update(l.instanceMatrix,s.ARRAY_BUFFER),l.instanceColor!==null&&e.update(l.instanceColor,s.ARRAY_BUFFER),i.set(l,c))),l.isSkinnedMesh){let d=l.skeleton;i.get(d)!==c&&(d.update(),i.set(d,c))}return u}function a(){i=new WeakMap}function o(l){let c=l.target;c.removeEventListener("dispose",o),e.remove(c.instanceMatrix),c.instanceColor!==null&&e.remove(c.instanceColor)}return{update:r,dispose:a}}var Kr=class extends Re{constructor(t,e,n,i,r,a,o,l,c,h){if(h=h!==void 0?h:Mi,h!==Mi&&h!==hs)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");n===void 0&&h===Mi&&(n=ei),n===void 0&&h===hs&&(n=Si),super(null,i,r,a,o,l,h,n,c),this.isDepthTexture=!0,this.image={width:t,height:e},this.magFilter=o!==void 0?o:Ge,this.minFilter=l!==void 0?l:Ge,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.compareFunction=t.compareFunction,this}toJSON(t){let e=super.toJSON(t);return this.compareFunction!==null&&(e.compareFunction=this.compareFunction),e}},Nh=new Re,Oh=new Kr(1,1);Oh.compareFunction=Lh;var Bh=new $r,Hh=new Ro,zh=new Zr,Jc=[],jc=[],Kc=new Float32Array(16),Qc=new Float32Array(9),th=new Float32Array(4);function ms(s,t,e){let n=s[0];if(n<=0||n>0)return s;let i=t*e,r=Jc[i];if(r===void 0&&(r=new Float32Array(i),Jc[i]=r),t!==0){n.toArray(r,0);for(let a=1,o=0;a!==t;++a)o+=e,s[a].toArray(r,o)}return r}function Se(s,t){if(s.length!==t.length)return!1;for(let e=0,n=s.length;e<n;e++)if(s[e]!==t[e])return!1;return!0}function Me(s,t){for(let e=0,n=t.length;e<n;e++)s[e]=t[e]}function oa(s,t){let e=jc[t];e===void 0&&(e=new Int32Array(t),jc[t]=e);for(let n=0;n!==t;++n)e[n]=s.allocateTextureUnit();return e}function Sg(s,t){let e=this.cache;e[0]!==t&&(s.uniform1f(this.addr,t),e[0]=t)}function Mg(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Se(e,t))return;s.uniform2fv(this.addr,t),Me(e,t)}}function wg(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(s.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(Se(e,t))return;s.uniform3fv(this.addr,t),Me(e,t)}}function Eg(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Se(e,t))return;s.uniform4fv(this.addr,t),Me(e,t)}}function Tg(s,t){let e=this.cache,n=t.elements;if(n===void 0){if(Se(e,t))return;s.uniformMatrix2fv(this.addr,!1,t),Me(e,t)}else{if(Se(e,n))return;th.set(n),s.uniformMatrix2fv(this.addr,!1,th),Me(e,n)}}function Ag(s,t){let e=this.cache,n=t.elements;if(n===void 0){if(Se(e,t))return;s.uniformMatrix3fv(this.addr,!1,t),Me(e,t)}else{if(Se(e,n))return;Qc.set(n),s.uniformMatrix3fv(this.addr,!1,Qc),Me(e,n)}}function Cg(s,t){let e=this.cache,n=t.elements;if(n===void 0){if(Se(e,t))return;s.uniformMatrix4fv(this.addr,!1,t),Me(e,t)}else{if(Se(e,n))return;Kc.set(n),s.uniformMatrix4fv(this.addr,!1,Kc),Me(e,n)}}function Rg(s,t){let e=this.cache;e[0]!==t&&(s.uniform1i(this.addr,t),e[0]=t)}function Pg(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Se(e,t))return;s.uniform2iv(this.addr,t),Me(e,t)}}function Ig(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Se(e,t))return;s.uniform3iv(this.addr,t),Me(e,t)}}function Lg(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Se(e,t))return;s.uniform4iv(this.addr,t),Me(e,t)}}function Dg(s,t){let e=this.cache;e[0]!==t&&(s.uniform1ui(this.addr,t),e[0]=t)}function kg(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Se(e,t))return;s.uniform2uiv(this.addr,t),Me(e,t)}}function Ug(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Se(e,t))return;s.uniform3uiv(this.addr,t),Me(e,t)}}function Fg(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Se(e,t))return;s.uniform4uiv(this.addr,t),Me(e,t)}}function Ng(s,t,e){let n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i);let r=this.type===s.SAMPLER_2D_SHADOW?Oh:Nh;e.setTexture2D(t||r,i)}function Og(s,t,e){let n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTexture3D(t||Hh,i)}function Bg(s,t,e){let n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTextureCube(t||zh,i)}function Hg(s,t,e){let n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTexture2DArray(t||Bh,i)}function zg(s){switch(s){case 5126:return Sg;case 35664:return Mg;case 35665:return wg;case 35666:return Eg;case 35674:return Tg;case 35675:return Ag;case 35676:return Cg;case 5124:case 35670:return Rg;case 35667:case 35671:return Pg;case 35668:case 35672:return Ig;case 35669:case 35673:return Lg;case 5125:return Dg;case 36294:return kg;case 36295:return Ug;case 36296:return Fg;case 35678:case 36198:case 36298:case 36306:case 35682:return Ng;case 35679:case 36299:case 36307:return Og;case 35680:case 36300:case 36308:case 36293:return Bg;case 36289:case 36303:case 36311:case 36292:return Hg}}function Vg(s,t){s.uniform1fv(this.addr,t)}function Gg(s,t){let e=ms(t,this.size,2);s.uniform2fv(this.addr,e)}function Wg(s,t){let e=ms(t,this.size,3);s.uniform3fv(this.addr,e)}function $g(s,t){let e=ms(t,this.size,4);s.uniform4fv(this.addr,e)}function Xg(s,t){let e=ms(t,this.size,4);s.uniformMatrix2fv(this.addr,!1,e)}function qg(s,t){let e=ms(t,this.size,9);s.uniformMatrix3fv(this.addr,!1,e)}function Yg(s,t){let e=ms(t,this.size,16);s.uniformMatrix4fv(this.addr,!1,e)}function Zg(s,t){s.uniform1iv(this.addr,t)}function Jg(s,t){s.uniform2iv(this.addr,t)}function jg(s,t){s.uniform3iv(this.addr,t)}function Kg(s,t){s.uniform4iv(this.addr,t)}function Qg(s,t){s.uniform1uiv(this.addr,t)}function ty(s,t){s.uniform2uiv(this.addr,t)}function ey(s,t){s.uniform3uiv(this.addr,t)}function ny(s,t){s.uniform4uiv(this.addr,t)}function iy(s,t,e){let n=this.cache,i=t.length,r=oa(e,i);Se(n,r)||(s.uniform1iv(this.addr,r),Me(n,r));for(let a=0;a!==i;++a)e.setTexture2D(t[a]||Nh,r[a])}function sy(s,t,e){let n=this.cache,i=t.length,r=oa(e,i);Se(n,r)||(s.uniform1iv(this.addr,r),Me(n,r));for(let a=0;a!==i;++a)e.setTexture3D(t[a]||Hh,r[a])}function ry(s,t,e){let n=this.cache,i=t.length,r=oa(e,i);Se(n,r)||(s.uniform1iv(this.addr,r),Me(n,r));for(let a=0;a!==i;++a)e.setTextureCube(t[a]||zh,r[a])}function ay(s,t,e){let n=this.cache,i=t.length,r=oa(e,i);Se(n,r)||(s.uniform1iv(this.addr,r),Me(n,r));for(let a=0;a!==i;++a)e.setTexture2DArray(t[a]||Bh,r[a])}function oy(s){switch(s){case 5126:return Vg;case 35664:return Gg;case 35665:return Wg;case 35666:return $g;case 35674:return Xg;case 35675:return qg;case 35676:return Yg;case 5124:case 35670:return Zg;case 35667:case 35671:return Jg;case 35668:case 35672:return jg;case 35669:case 35673:return Kg;case 5125:return Qg;case 36294:return ty;case 36295:return ey;case 36296:return ny;case 35678:case 36198:case 36298:case 36306:case 35682:return iy;case 35679:case 36299:case 36307:return sy;case 35680:case 36300:case 36308:case 36293:return ry;case 36289:case 36303:case 36311:case 36292:return ay}}var Do=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=zg(e.type)}},ko=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=oy(e.type)}},Uo=class{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){let i=this.seq;for(let r=0,a=i.length;r!==a;++r){let o=i[r];o.setValue(t,e[o.id],n)}}},yo=/(\w+)(\])?(\[|\.)?/g;function eh(s,t){s.seq.push(t),s.map[t.id]=t}function ly(s,t,e){let n=s.name,i=n.length;for(yo.lastIndex=0;;){let r=yo.exec(n),a=yo.lastIndex,o=r[1],l=r[2]==="]",c=r[3];if(l&&(o=o|0),c===void 0||c==="["&&a+2===i){eh(e,c===void 0?new Do(o,s,t):new ko(o,s,t));break}else{let u=e.map[o];u===void 0&&(u=new Uo(o),eh(e,u)),e=u}}}var as=class{constructor(t,e){this.seq=[],this.map={};let n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let i=0;i<n;++i){let r=t.getActiveUniform(e,i),a=t.getUniformLocation(e,r.name);ly(r,a,this)}}setValue(t,e,n,i){let r=this.map[e];r!==void 0&&r.setValue(t,n,i)}setOptional(t,e,n){let i=e[n];i!==void 0&&this.setValue(t,n,i)}static upload(t,e,n,i){for(let r=0,a=e.length;r!==a;++r){let o=e[r],l=n[o.id];l.needsUpdate!==!1&&o.setValue(t,l.value,i)}}static seqWithValue(t,e){let n=[];for(let i=0,r=t.length;i!==r;++i){let a=t[i];a.id in e&&n.push(a)}return n}};function nh(s,t,e){let n=s.createShader(t);return s.shaderSource(n,e),s.compileShader(n),n}var cy=37297,hy=0;function uy(s,t){let e=s.split(`
`),n=[],i=Math.max(t-6,0),r=Math.min(t+6,e.length);for(let a=i;a<r;a++){let o=a+1;n.push(`${o===t?">":" "} ${o}: ${e[a]}`)}return n.join(`
`)}function dy(s){let t=ie.getPrimaries(ie.workingColorSpace),e=ie.getPrimaries(s),n;switch(t===e?n="":t===Hr&&e===Br?n="LinearDisplayP3ToLinearSRGB":t===Br&&e===Hr&&(n="LinearSRGBToLinearDisplayP3"),s){case zn:case aa:return[n,"LinearTransferOETF"];case Zt:case al:return[n,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space:",s),[n,"LinearTransferOETF"]}}function ih(s,t,e){let n=s.getShaderParameter(t,s.COMPILE_STATUS),i=s.getShaderInfoLog(t).trim();if(n&&i==="")return"";let r=/ERROR: 0:(\d+)/.exec(i);if(r){let a=parseInt(r[1]);return e.toUpperCase()+`

`+i+`

`+uy(s.getShaderSource(t),a)}else return i}function fy(s,t){let e=dy(t);return`vec4 ${s}( vec4 value ) { return ${e[0]}( ${e[1]}( value ) ); }`}function py(s,t){let e;switch(t){case Pd:e="Linear";break;case Id:e="Reinhard";break;case Ld:e="OptimizedCineon";break;case Dd:e="ACESFilmic";break;case Ud:e="AgX";break;case kd:e="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",t),e="Linear"}return"vec3 "+s+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}function my(s){return[s.extensionDerivatives||s.envMapCubeUVHeight||s.bumpMap||s.normalMapTangentSpace||s.clearcoatNormalMap||s.flatShading||s.shaderID==="physical"?"#extension GL_OES_standard_derivatives : enable":"",(s.extensionFragDepth||s.logarithmicDepthBuffer)&&s.rendererExtensionFragDepth?"#extension GL_EXT_frag_depth : enable":"",s.extensionDrawBuffers&&s.rendererExtensionDrawBuffers?"#extension GL_EXT_draw_buffers : require":"",(s.extensionShaderTextureLOD||s.envMap||s.transmission)&&s.rendererExtensionShaderTextureLod?"#extension GL_EXT_shader_texture_lod : enable":""].filter(ss).join(`
`)}function gy(s){return[s.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":""].filter(ss).join(`
`)}function yy(s){let t=[];for(let e in s){let n=s[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function vy(s,t){let e={},n=s.getProgramParameter(t,s.ACTIVE_ATTRIBUTES);for(let i=0;i<n;i++){let r=s.getActiveAttrib(t,i),a=r.name,o=1;r.type===s.FLOAT_MAT2&&(o=2),r.type===s.FLOAT_MAT3&&(o=3),r.type===s.FLOAT_MAT4&&(o=4),e[a]={type:r.type,location:s.getAttribLocation(t,a),locationSize:o}}return e}function ss(s){return s!==""}function sh(s,t){let e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return s.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function rh(s,t){return s.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var xy=/^[ \t]*#include +<([\w\d./]+)>/gm;function Fo(s){return s.replace(xy,_y)}var by=new Map([["encodings_fragment","colorspace_fragment"],["encodings_pars_fragment","colorspace_pars_fragment"],["output_fragment","opaque_fragment"]]);function _y(s,t){let e=Ht[t];if(e===void 0){let n=by.get(t);if(n!==void 0)e=Ht[n],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,n);else throw new Error("Can not resolve #include <"+t+">")}return Fo(e)}var Sy=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function ah(s){return s.replace(Sy,My)}function My(s,t,e,n){let i="";for(let r=parseInt(t);r<parseInt(e);r++)i+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return i}function oh(s){let t="precision "+s.precision+` float;
precision `+s.precision+" int;";return s.precision==="highp"?t+=`
#define HIGH_PRECISION`:s.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:s.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}function wy(s){let t="SHADOWMAP_TYPE_BASIC";return s.shadowMapType===_h?t="SHADOWMAP_TYPE_PCF":s.shadowMapType===sd?t="SHADOWMAP_TYPE_PCF_SOFT":s.shadowMapType===Fn&&(t="SHADOWMAP_TYPE_VSM"),t}function Ey(s){let t="ENVMAP_TYPE_CUBE";if(s.envMap)switch(s.envMapMode){case os:case ls:t="ENVMAP_TYPE_CUBE";break;case ra:t="ENVMAP_TYPE_CUBE_UV";break}return t}function Ty(s){let t="ENVMAP_MODE_REFLECTION";if(s.envMap)switch(s.envMapMode){case ls:t="ENVMAP_MODE_REFRACTION";break}return t}function Ay(s){let t="ENVMAP_BLENDING_NONE";if(s.envMap)switch(s.combine){case Sh:t="ENVMAP_BLENDING_MULTIPLY";break;case Cd:t="ENVMAP_BLENDING_MIX";break;case Rd:t="ENVMAP_BLENDING_ADD";break}return t}function Cy(s){let t=s.envMapCubeUVHeight;if(t===null)return null;let e=Math.log2(t)-2,n=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,e),7*16)),texelHeight:n,maxMip:e}}function Ry(s,t,e,n){let i=s.getContext(),r=e.defines,a=e.vertexShader,o=e.fragmentShader,l=wy(e),c=Ey(e),h=Ty(e),u=Ay(e),d=Cy(e),p=e.isWebGL2?"":my(e),g=gy(e),y=yy(r),m=i.createProgram(),f,b,v=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(f=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,y].filter(ss).join(`
`),f.length>0&&(f+=`
`),b=[p,"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,y].filter(ss).join(`
`),b.length>0&&(b+=`
`)):(f=[oh(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,y,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+h:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors&&e.isWebGL2?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0&&e.isWebGL2?"#define MORPHTARGETS_TEXTURE":"",e.morphTargetsCount>0&&e.isWebGL2?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0&&e.isWebGL2?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.useLegacyLights?"#define LEGACY_LIGHTS":"",e.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",e.logarithmicDepthBuffer&&e.rendererExtensionFragDepth?"#define USE_LOGDEPTHBUF_EXT":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#if ( defined( USE_MORPHTARGETS ) && ! defined( MORPHTARGETS_TEXTURE ) )","	attribute vec3 morphTarget0;","	attribute vec3 morphTarget1;","	attribute vec3 morphTarget2;","	attribute vec3 morphTarget3;","	#ifdef USE_MORPHNORMALS","		attribute vec3 morphNormal0;","		attribute vec3 morphNormal1;","		attribute vec3 morphNormal2;","		attribute vec3 morphNormal3;","	#else","		attribute vec3 morphTarget4;","		attribute vec3 morphTarget5;","		attribute vec3 morphTarget6;","		attribute vec3 morphTarget7;","	#endif","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(ss).join(`
`),b=[p,oh(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,y,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+c:"",e.envMap?"#define "+h:"",e.envMap?"#define "+u:"",d?"#define CUBEUV_TEXEL_WIDTH "+d.texelWidth:"",d?"#define CUBEUV_TEXEL_HEIGHT "+d.texelHeight:"",d?"#define CUBEUV_MAX_MIP "+d.maxMip+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.useLegacyLights?"#define LEGACY_LIGHTS":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",e.logarithmicDepthBuffer&&e.rendererExtensionFragDepth?"#define USE_LOGDEPTHBUF_EXT":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==ri?"#define TONE_MAPPING":"",e.toneMapping!==ri?Ht.tonemapping_pars_fragment:"",e.toneMapping!==ri?py("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",Ht.colorspace_pars_fragment,fy("linearToOutputTexel",e.outputColorSpace),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(ss).join(`
`)),a=Fo(a),a=sh(a,e),a=rh(a,e),o=Fo(o),o=sh(o,e),o=rh(o,e),a=ah(a),o=ah(o),e.isWebGL2&&e.isRawShaderMaterial!==!0&&(v=`#version 300 es
`,f=[g,"precision mediump sampler2DArray;","#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+f,b=["precision mediump sampler2DArray;","#define varying in",e.glslVersion===Tc?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===Tc?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+b);let E=v+f+a,C=v+b+o,T=nh(i,i.VERTEX_SHADER,E),A=nh(i,i.FRAGMENT_SHADER,C);i.attachShader(m,T),i.attachShader(m,A),e.index0AttributeName!==void 0?i.bindAttribLocation(m,0,e.index0AttributeName):e.morphTargets===!0&&i.bindAttribLocation(m,0,"position"),i.linkProgram(m);function X(N){if(s.debug.checkShaderErrors){let K=i.getProgramInfoLog(m).trim(),L=i.getShaderInfoLog(T).trim(),O=i.getShaderInfoLog(A).trim(),q=!0,Z=!0;if(i.getProgramParameter(m,i.LINK_STATUS)===!1)if(q=!1,typeof s.debug.onShaderError=="function")s.debug.onShaderError(i,m,T,A);else{let W=ih(i,T,"vertex"),U=ih(i,A,"fragment");console.error("THREE.WebGLProgram: Shader Error "+i.getError()+" - VALIDATE_STATUS "+i.getProgramParameter(m,i.VALIDATE_STATUS)+`

Program Info Log: `+K+`
`+W+`
`+U)}else K!==""?console.warn("THREE.WebGLProgram: Program Info Log:",K):(L===""||O==="")&&(Z=!1);Z&&(N.diagnostics={runnable:q,programLog:K,vertexShader:{log:L,prefix:f},fragmentShader:{log:O,prefix:b}})}i.deleteShader(T),i.deleteShader(A),S=new as(i,m),x=vy(i,m)}let S;this.getUniforms=function(){return S===void 0&&X(this),S};let x;this.getAttributes=function(){return x===void 0&&X(this),x};let I=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return I===!1&&(I=i.getProgramParameter(m,cy)),I},this.destroy=function(){n.releaseStatesOfProgram(this),i.deleteProgram(m),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=hy++,this.cacheKey=t,this.usedTimes=1,this.program=m,this.vertexShader=T,this.fragmentShader=A,this}var Py=0,No=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t){let e=t.vertexShader,n=t.fragmentShader,i=this._getShaderStage(e),r=this._getShaderStage(n),a=this._getShaderCacheForMaterial(t);return a.has(i)===!1&&(a.add(i),i.usedTimes++),a.has(r)===!1&&(a.add(r),r.usedTimes++),this}remove(t){let e=this.materialCache.get(t);for(let n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderID(t){return this._getShaderStage(t.vertexShader).id}getFragmentShaderID(t){return this._getShaderStage(t.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){let e=this.materialCache,n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){let e=this.shaderCache,n=e.get(t);return n===void 0&&(n=new Oo(t),e.set(t,n)),n}},Oo=class{constructor(t){this.id=Py++,this.code=t,this.usedTimes=0}};function Iy(s,t,e,n,i,r,a){let o=new Ns,l=new No,c=[],h=i.isWebGL2,u=i.logarithmicDepthBuffer,d=i.vertexTextures,p=i.precision,g={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function y(S){return S===0?"uv":`uv${S}`}function m(S,x,I,N,K){let L=N.fog,O=K.geometry,q=S.isMeshStandardMaterial?N.environment:null,Z=(S.isMeshStandardMaterial?e:t).get(S.envMap||q),W=Z&&Z.mapping===ra?Z.image.height:null,U=g[S.type];S.precision!==null&&(p=i.getMaxPrecision(S.precision),p!==S.precision&&console.warn("THREE.WebGLProgram.getParameters:",S.precision,"not supported, using",p,"instead."));let Y=O.morphAttributes.position||O.morphAttributes.normal||O.morphAttributes.color,et=Y!==void 0?Y.length:0,ht=0;O.morphAttributes.position!==void 0&&(ht=1),O.morphAttributes.normal!==void 0&&(ht=2),O.morphAttributes.color!==void 0&&(ht=3);let $,J,ut,vt;if(U){let qt=Mn[U];$=qt.vertexShader,J=qt.fragmentShader}else $=S.vertexShader,J=S.fragmentShader,l.update(S),ut=l.getVertexShaderID(S),vt=l.getFragmentShaderID(S);let yt=s.getRenderTarget(),It=K.isInstancedMesh===!0,Pt=K.isBatchedMesh===!0,St=!!S.map,$t=!!S.matcap,H=!!Z,fe=!!S.aoMap,_t=!!S.lightMap,At=!!S.bumpMap,mt=!!S.normalMap,te=!!S.displacementMap,Lt=!!S.emissiveMap,w=!!S.metalnessMap,_=!!S.roughnessMap,B=S.anisotropy>0,nt=S.clearcoat>0,j=S.iridescence>0,it=S.sheen>0,gt=S.transmission>0,at=B&&!!S.anisotropyMap,ft=nt&&!!S.clearcoatMap,Mt=nt&&!!S.clearcoatNormalMap,Nt=nt&&!!S.clearcoatRoughnessMap,Q=j&&!!S.iridescenceMap,jt=j&&!!S.iridescenceThicknessMap,Bt=it&&!!S.sheenColorMap,Ct=it&&!!S.sheenRoughnessMap,xt=!!S.specularMap,pt=!!S.specularColorMap,Dt=!!S.specularIntensityMap,Kt=gt&&!!S.transmissionMap,Qt=gt&&!!S.thicknessMap,kt=!!S.gradientMap,st=!!S.alphaMap,P=S.alphaTest>0,ot=!!S.alphaHash,lt=!!S.extensions,wt=!!O.attributes.uv1,k=!!O.attributes.uv2,tt=!!O.attributes.uv3,ct=ri;return S.toneMapped&&(yt===null||yt.isXRRenderTarget===!0)&&(ct=s.toneMapping),{isWebGL2:h,shaderID:U,shaderType:S.type,shaderName:S.name,vertexShader:$,fragmentShader:J,defines:S.defines,customVertexShaderID:ut,customFragmentShaderID:vt,isRawShaderMaterial:S.isRawShaderMaterial===!0,glslVersion:S.glslVersion,precision:p,batching:Pt,instancing:It,instancingColor:It&&K.instanceColor!==null,supportsVertexTextures:d,outputColorSpace:yt===null?s.outputColorSpace:yt.isXRRenderTarget===!0?yt.texture.colorSpace:zn,map:St,matcap:$t,envMap:H,envMapMode:H&&Z.mapping,envMapCubeUVHeight:W,aoMap:fe,lightMap:_t,bumpMap:At,normalMap:mt,displacementMap:d&&te,emissiveMap:Lt,normalMapObjectSpace:mt&&S.normalMapType===Yd,normalMapTangentSpace:mt&&S.normalMapType===qd,metalnessMap:w,roughnessMap:_,anisotropy:B,anisotropyMap:at,clearcoat:nt,clearcoatMap:ft,clearcoatNormalMap:Mt,clearcoatRoughnessMap:Nt,iridescence:j,iridescenceMap:Q,iridescenceThicknessMap:jt,sheen:it,sheenColorMap:Bt,sheenRoughnessMap:Ct,specularMap:xt,specularColorMap:pt,specularIntensityMap:Dt,transmission:gt,transmissionMap:Kt,thicknessMap:Qt,gradientMap:kt,opaque:S.transparent===!1&&S.blending===si,alphaMap:st,alphaTest:P,alphaHash:ot,combine:S.combine,mapUv:St&&y(S.map.channel),aoMapUv:fe&&y(S.aoMap.channel),lightMapUv:_t&&y(S.lightMap.channel),bumpMapUv:At&&y(S.bumpMap.channel),normalMapUv:mt&&y(S.normalMap.channel),displacementMapUv:te&&y(S.displacementMap.channel),emissiveMapUv:Lt&&y(S.emissiveMap.channel),metalnessMapUv:w&&y(S.metalnessMap.channel),roughnessMapUv:_&&y(S.roughnessMap.channel),anisotropyMapUv:at&&y(S.anisotropyMap.channel),clearcoatMapUv:ft&&y(S.clearcoatMap.channel),clearcoatNormalMapUv:Mt&&y(S.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Nt&&y(S.clearcoatRoughnessMap.channel),iridescenceMapUv:Q&&y(S.iridescenceMap.channel),iridescenceThicknessMapUv:jt&&y(S.iridescenceThicknessMap.channel),sheenColorMapUv:Bt&&y(S.sheenColorMap.channel),sheenRoughnessMapUv:Ct&&y(S.sheenRoughnessMap.channel),specularMapUv:xt&&y(S.specularMap.channel),specularColorMapUv:pt&&y(S.specularColorMap.channel),specularIntensityMapUv:Dt&&y(S.specularIntensityMap.channel),transmissionMapUv:Kt&&y(S.transmissionMap.channel),thicknessMapUv:Qt&&y(S.thicknessMap.channel),alphaMapUv:st&&y(S.alphaMap.channel),vertexTangents:!!O.attributes.tangent&&(mt||B),vertexColors:S.vertexColors,vertexAlphas:S.vertexColors===!0&&!!O.attributes.color&&O.attributes.color.itemSize===4,vertexUv1s:wt,vertexUv2s:k,vertexUv3s:tt,pointsUvs:K.isPoints===!0&&!!O.attributes.uv&&(St||st),fog:!!L,useFog:S.fog===!0,fogExp2:L&&L.isFogExp2,flatShading:S.flatShading===!0,sizeAttenuation:S.sizeAttenuation===!0,logarithmicDepthBuffer:u,skinning:K.isSkinnedMesh===!0,morphTargets:O.morphAttributes.position!==void 0,morphNormals:O.morphAttributes.normal!==void 0,morphColors:O.morphAttributes.color!==void 0,morphTargetsCount:et,morphTextureStride:ht,numDirLights:x.directional.length,numPointLights:x.point.length,numSpotLights:x.spot.length,numSpotLightMaps:x.spotLightMap.length,numRectAreaLights:x.rectArea.length,numHemiLights:x.hemi.length,numDirLightShadows:x.directionalShadowMap.length,numPointLightShadows:x.pointShadowMap.length,numSpotLightShadows:x.spotShadowMap.length,numSpotLightShadowsWithMaps:x.numSpotLightShadowsWithMaps,numLightProbes:x.numLightProbes,numClippingPlanes:a.numPlanes,numClipIntersection:a.numIntersection,dithering:S.dithering,shadowMapEnabled:s.shadowMap.enabled&&I.length>0,shadowMapType:s.shadowMap.type,toneMapping:ct,useLegacyLights:s._useLegacyLights,decodeVideoTexture:St&&S.map.isVideoTexture===!0&&ie.getTransfer(S.map.colorSpace)===le,premultipliedAlpha:S.premultipliedAlpha,doubleSided:S.side===We,flipSided:S.side===Ze,useDepthPacking:S.depthPacking>=0,depthPacking:S.depthPacking||0,index0AttributeName:S.index0AttributeName,extensionDerivatives:lt&&S.extensions.derivatives===!0,extensionFragDepth:lt&&S.extensions.fragDepth===!0,extensionDrawBuffers:lt&&S.extensions.drawBuffers===!0,extensionShaderTextureLOD:lt&&S.extensions.shaderTextureLOD===!0,extensionClipCullDistance:lt&&S.extensions.clipCullDistance&&n.has("WEBGL_clip_cull_distance"),rendererExtensionFragDepth:h||n.has("EXT_frag_depth"),rendererExtensionDrawBuffers:h||n.has("WEBGL_draw_buffers"),rendererExtensionShaderTextureLod:h||n.has("EXT_shader_texture_lod"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:S.customProgramCacheKey()}}function f(S){let x=[];if(S.shaderID?x.push(S.shaderID):(x.push(S.customVertexShaderID),x.push(S.customFragmentShaderID)),S.defines!==void 0)for(let I in S.defines)x.push(I),x.push(S.defines[I]);return S.isRawShaderMaterial===!1&&(b(x,S),v(x,S),x.push(s.outputColorSpace)),x.push(S.customProgramCacheKey),x.join()}function b(S,x){S.push(x.precision),S.push(x.outputColorSpace),S.push(x.envMapMode),S.push(x.envMapCubeUVHeight),S.push(x.mapUv),S.push(x.alphaMapUv),S.push(x.lightMapUv),S.push(x.aoMapUv),S.push(x.bumpMapUv),S.push(x.normalMapUv),S.push(x.displacementMapUv),S.push(x.emissiveMapUv),S.push(x.metalnessMapUv),S.push(x.roughnessMapUv),S.push(x.anisotropyMapUv),S.push(x.clearcoatMapUv),S.push(x.clearcoatNormalMapUv),S.push(x.clearcoatRoughnessMapUv),S.push(x.iridescenceMapUv),S.push(x.iridescenceThicknessMapUv),S.push(x.sheenColorMapUv),S.push(x.sheenRoughnessMapUv),S.push(x.specularMapUv),S.push(x.specularColorMapUv),S.push(x.specularIntensityMapUv),S.push(x.transmissionMapUv),S.push(x.thicknessMapUv),S.push(x.combine),S.push(x.fogExp2),S.push(x.sizeAttenuation),S.push(x.morphTargetsCount),S.push(x.morphAttributeCount),S.push(x.numDirLights),S.push(x.numPointLights),S.push(x.numSpotLights),S.push(x.numSpotLightMaps),S.push(x.numHemiLights),S.push(x.numRectAreaLights),S.push(x.numDirLightShadows),S.push(x.numPointLightShadows),S.push(x.numSpotLightShadows),S.push(x.numSpotLightShadowsWithMaps),S.push(x.numLightProbes),S.push(x.shadowMapType),S.push(x.toneMapping),S.push(x.numClippingPlanes),S.push(x.numClipIntersection),S.push(x.depthPacking)}function v(S,x){o.disableAll(),x.isWebGL2&&o.enable(0),x.supportsVertexTextures&&o.enable(1),x.instancing&&o.enable(2),x.instancingColor&&o.enable(3),x.matcap&&o.enable(4),x.envMap&&o.enable(5),x.normalMapObjectSpace&&o.enable(6),x.normalMapTangentSpace&&o.enable(7),x.clearcoat&&o.enable(8),x.iridescence&&o.enable(9),x.alphaTest&&o.enable(10),x.vertexColors&&o.enable(11),x.vertexAlphas&&o.enable(12),x.vertexUv1s&&o.enable(13),x.vertexUv2s&&o.enable(14),x.vertexUv3s&&o.enable(15),x.vertexTangents&&o.enable(16),x.anisotropy&&o.enable(17),x.alphaHash&&o.enable(18),x.batching&&o.enable(19),S.push(o.mask),o.disableAll(),x.fog&&o.enable(0),x.useFog&&o.enable(1),x.flatShading&&o.enable(2),x.logarithmicDepthBuffer&&o.enable(3),x.skinning&&o.enable(4),x.morphTargets&&o.enable(5),x.morphNormals&&o.enable(6),x.morphColors&&o.enable(7),x.premultipliedAlpha&&o.enable(8),x.shadowMapEnabled&&o.enable(9),x.useLegacyLights&&o.enable(10),x.doubleSided&&o.enable(11),x.flipSided&&o.enable(12),x.useDepthPacking&&o.enable(13),x.dithering&&o.enable(14),x.transmission&&o.enable(15),x.sheen&&o.enable(16),x.opaque&&o.enable(17),x.pointsUvs&&o.enable(18),x.decodeVideoTexture&&o.enable(19),S.push(o.mask)}function E(S){let x=g[S.type],I;if(x){let N=Mn[x];I=bf.clone(N.uniforms)}else I=S.uniforms;return I}function C(S,x){let I;for(let N=0,K=c.length;N<K;N++){let L=c[N];if(L.cacheKey===x){I=L,++I.usedTimes;break}}return I===void 0&&(I=new Ry(s,x,S,r),c.push(I)),I}function T(S){if(--S.usedTimes===0){let x=c.indexOf(S);c[x]=c[c.length-1],c.pop(),S.destroy()}}function A(S){l.remove(S)}function X(){l.dispose()}return{getParameters:m,getProgramCacheKey:f,getUniforms:E,acquireProgram:C,releaseProgram:T,releaseShaderCache:A,programs:c,dispose:X}}function Ly(){let s=new WeakMap;function t(r){let a=s.get(r);return a===void 0&&(a={},s.set(r,a)),a}function e(r){s.delete(r)}function n(r,a,o){s.get(r)[a]=o}function i(){s=new WeakMap}return{get:t,remove:e,update:n,dispose:i}}function Dy(s,t){return s.groupOrder!==t.groupOrder?s.groupOrder-t.groupOrder:s.renderOrder!==t.renderOrder?s.renderOrder-t.renderOrder:s.material.id!==t.material.id?s.material.id-t.material.id:s.z!==t.z?s.z-t.z:s.id-t.id}function lh(s,t){return s.groupOrder!==t.groupOrder?s.groupOrder-t.groupOrder:s.renderOrder!==t.renderOrder?s.renderOrder-t.renderOrder:s.z!==t.z?t.z-s.z:s.id-t.id}function ch(){let s=[],t=0,e=[],n=[],i=[];function r(){t=0,e.length=0,n.length=0,i.length=0}function a(u,d,p,g,y,m){let f=s[t];return f===void 0?(f={id:u.id,object:u,geometry:d,material:p,groupOrder:g,renderOrder:u.renderOrder,z:y,group:m},s[t]=f):(f.id=u.id,f.object=u,f.geometry=d,f.material=p,f.groupOrder=g,f.renderOrder=u.renderOrder,f.z=y,f.group=m),t++,f}function o(u,d,p,g,y,m){let f=a(u,d,p,g,y,m);p.transmission>0?n.push(f):p.transparent===!0?i.push(f):e.push(f)}function l(u,d,p,g,y,m){let f=a(u,d,p,g,y,m);p.transmission>0?n.unshift(f):p.transparent===!0?i.unshift(f):e.unshift(f)}function c(u,d){e.length>1&&e.sort(u||Dy),n.length>1&&n.sort(d||lh),i.length>1&&i.sort(d||lh)}function h(){for(let u=t,d=s.length;u<d;u++){let p=s[u];if(p.id===null)break;p.id=null,p.object=null,p.geometry=null,p.material=null,p.group=null}}return{opaque:e,transmissive:n,transparent:i,init:r,push:o,unshift:l,finish:h,sort:c}}function ky(){let s=new WeakMap;function t(n,i){let r=s.get(n),a;return r===void 0?(a=new ch,s.set(n,[a])):i>=r.length?(a=new ch,r.push(a)):a=r[i],a}function e(){s=new WeakMap}return{get:t,dispose:e}}function Uy(){let s={};return{get:function(t){if(s[t.id]!==void 0)return s[t.id];let e;switch(t.type){case"DirectionalLight":e={direction:new D,color:new Vt};break;case"SpotLight":e={position:new D,direction:new D,color:new Vt,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new D,color:new Vt,distance:0,decay:0};break;case"HemisphereLight":e={direction:new D,skyColor:new Vt,groundColor:new Vt};break;case"RectAreaLight":e={color:new Vt,position:new D,halfWidth:new D,halfHeight:new D};break}return s[t.id]=e,e}}}function Fy(){let s={};return{get:function(t){if(s[t.id]!==void 0)return s[t.id];let e;switch(t.type){case"DirectionalLight":e={shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ft};break;case"SpotLight":e={shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ft};break;case"PointLight":e={shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ft,shadowCameraNear:1,shadowCameraFar:1e3};break}return s[t.id]=e,e}}}var Ny=0;function Oy(s,t){return(t.castShadow?2:0)-(s.castShadow?2:0)+(t.map?1:0)-(s.map?1:0)}function By(s,t){let e=new Uy,n=Fy(),i={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let h=0;h<9;h++)i.probe.push(new D);let r=new D,a=new _e,o=new _e;function l(h,u){let d=0,p=0,g=0;for(let N=0;N<9;N++)i.probe[N].set(0,0,0);let y=0,m=0,f=0,b=0,v=0,E=0,C=0,T=0,A=0,X=0,S=0;h.sort(Oy);let x=u===!0?Math.PI:1;for(let N=0,K=h.length;N<K;N++){let L=h[N],O=L.color,q=L.intensity,Z=L.distance,W=L.shadow&&L.shadow.map?L.shadow.map.texture:null;if(L.isAmbientLight)d+=O.r*q*x,p+=O.g*q*x,g+=O.b*q*x;else if(L.isLightProbe){for(let U=0;U<9;U++)i.probe[U].addScaledVector(L.sh.coefficients[U],q);S++}else if(L.isDirectionalLight){let U=e.get(L);if(U.color.copy(L.color).multiplyScalar(L.intensity*x),L.castShadow){let Y=L.shadow,et=n.get(L);et.shadowBias=Y.bias,et.shadowNormalBias=Y.normalBias,et.shadowRadius=Y.radius,et.shadowMapSize=Y.mapSize,i.directionalShadow[y]=et,i.directionalShadowMap[y]=W,i.directionalShadowMatrix[y]=L.shadow.matrix,E++}i.directional[y]=U,y++}else if(L.isSpotLight){let U=e.get(L);U.position.setFromMatrixPosition(L.matrixWorld),U.color.copy(O).multiplyScalar(q*x),U.distance=Z,U.coneCos=Math.cos(L.angle),U.penumbraCos=Math.cos(L.angle*(1-L.penumbra)),U.decay=L.decay,i.spot[f]=U;let Y=L.shadow;if(L.map&&(i.spotLightMap[A]=L.map,A++,Y.updateMatrices(L),L.castShadow&&X++),i.spotLightMatrix[f]=Y.matrix,L.castShadow){let et=n.get(L);et.shadowBias=Y.bias,et.shadowNormalBias=Y.normalBias,et.shadowRadius=Y.radius,et.shadowMapSize=Y.mapSize,i.spotShadow[f]=et,i.spotShadowMap[f]=W,T++}f++}else if(L.isRectAreaLight){let U=e.get(L);U.color.copy(O).multiplyScalar(q),U.halfWidth.set(L.width*.5,0,0),U.halfHeight.set(0,L.height*.5,0),i.rectArea[b]=U,b++}else if(L.isPointLight){let U=e.get(L);if(U.color.copy(L.color).multiplyScalar(L.intensity*x),U.distance=L.distance,U.decay=L.decay,L.castShadow){let Y=L.shadow,et=n.get(L);et.shadowBias=Y.bias,et.shadowNormalBias=Y.normalBias,et.shadowRadius=Y.radius,et.shadowMapSize=Y.mapSize,et.shadowCameraNear=Y.camera.near,et.shadowCameraFar=Y.camera.far,i.pointShadow[m]=et,i.pointShadowMap[m]=W,i.pointShadowMatrix[m]=L.shadow.matrix,C++}i.point[m]=U,m++}else if(L.isHemisphereLight){let U=e.get(L);U.skyColor.copy(L.color).multiplyScalar(q*x),U.groundColor.copy(L.groundColor).multiplyScalar(q*x),i.hemi[v]=U,v++}}b>0&&(t.isWebGL2?s.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=rt.LTC_FLOAT_1,i.rectAreaLTC2=rt.LTC_FLOAT_2):(i.rectAreaLTC1=rt.LTC_HALF_1,i.rectAreaLTC2=rt.LTC_HALF_2):s.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=rt.LTC_FLOAT_1,i.rectAreaLTC2=rt.LTC_FLOAT_2):s.has("OES_texture_half_float_linear")===!0?(i.rectAreaLTC1=rt.LTC_HALF_1,i.rectAreaLTC2=rt.LTC_HALF_2):console.error("THREE.WebGLRenderer: Unable to use RectAreaLight. Missing WebGL extensions.")),i.ambient[0]=d,i.ambient[1]=p,i.ambient[2]=g;let I=i.hash;(I.directionalLength!==y||I.pointLength!==m||I.spotLength!==f||I.rectAreaLength!==b||I.hemiLength!==v||I.numDirectionalShadows!==E||I.numPointShadows!==C||I.numSpotShadows!==T||I.numSpotMaps!==A||I.numLightProbes!==S)&&(i.directional.length=y,i.spot.length=f,i.rectArea.length=b,i.point.length=m,i.hemi.length=v,i.directionalShadow.length=E,i.directionalShadowMap.length=E,i.pointShadow.length=C,i.pointShadowMap.length=C,i.spotShadow.length=T,i.spotShadowMap.length=T,i.directionalShadowMatrix.length=E,i.pointShadowMatrix.length=C,i.spotLightMatrix.length=T+A-X,i.spotLightMap.length=A,i.numSpotLightShadowsWithMaps=X,i.numLightProbes=S,I.directionalLength=y,I.pointLength=m,I.spotLength=f,I.rectAreaLength=b,I.hemiLength=v,I.numDirectionalShadows=E,I.numPointShadows=C,I.numSpotShadows=T,I.numSpotMaps=A,I.numLightProbes=S,i.version=Ny++)}function c(h,u){let d=0,p=0,g=0,y=0,m=0,f=u.matrixWorldInverse;for(let b=0,v=h.length;b<v;b++){let E=h[b];if(E.isDirectionalLight){let C=i.directional[d];C.direction.setFromMatrixPosition(E.matrixWorld),r.setFromMatrixPosition(E.target.matrixWorld),C.direction.sub(r),C.direction.transformDirection(f),d++}else if(E.isSpotLight){let C=i.spot[g];C.position.setFromMatrixPosition(E.matrixWorld),C.position.applyMatrix4(f),C.direction.setFromMatrixPosition(E.matrixWorld),r.setFromMatrixPosition(E.target.matrixWorld),C.direction.sub(r),C.direction.transformDirection(f),g++}else if(E.isRectAreaLight){let C=i.rectArea[y];C.position.setFromMatrixPosition(E.matrixWorld),C.position.applyMatrix4(f),o.identity(),a.copy(E.matrixWorld),a.premultiply(f),o.extractRotation(a),C.halfWidth.set(E.width*.5,0,0),C.halfHeight.set(0,E.height*.5,0),C.halfWidth.applyMatrix4(o),C.halfHeight.applyMatrix4(o),y++}else if(E.isPointLight){let C=i.point[p];C.position.setFromMatrixPosition(E.matrixWorld),C.position.applyMatrix4(f),p++}else if(E.isHemisphereLight){let C=i.hemi[m];C.direction.setFromMatrixPosition(E.matrixWorld),C.direction.transformDirection(f),m++}}}return{setup:l,setupView:c,state:i}}function hh(s,t){let e=new By(s,t),n=[],i=[];function r(){n.length=0,i.length=0}function a(u){n.push(u)}function o(u){i.push(u)}function l(u){e.setup(n,u)}function c(u){e.setupView(n,u)}return{init:r,state:{lightsArray:n,shadowsArray:i,lights:e},setupLights:l,setupLightsView:c,pushLight:a,pushShadow:o}}function Hy(s,t){let e=new WeakMap;function n(r,a=0){let o=e.get(r),l;return o===void 0?(l=new hh(s,t),e.set(r,[l])):a>=o.length?(l=new hh(s,t),o.push(l)):l=o[a],l}function i(){e=new WeakMap}return{get:n,dispose:i}}var Bo=class extends Gn{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=$d,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}},Ho=class extends Gn{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}},zy=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,Vy=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;function Gy(s,t,e){let n=new Jr,i=new Ft,r=new Ft,a=new Ie,o=new Bo({depthPacking:Xd}),l=new Ho,c={},h=e.maxTextureSize,u={[li]:Ze,[Ze]:li,[We]:We},d=new Wn({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Ft},radius:{value:4}},vertexShader:zy,fragmentShader:Vy}),p=d.clone();p.defines.HORIZONTAL_PASS=1;let g=new Qe;g.setAttribute("position",new Ne(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let y=new ce(g,d),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=_h;let f=this.type;this.render=function(T,A,X){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||T.length===0)return;let S=s.getRenderTarget(),x=s.getActiveCubeFace(),I=s.getActiveMipmapLevel(),N=s.state;N.setBlending(ii),N.buffers.color.setClear(1,1,1,1),N.buffers.depth.setTest(!0),N.setScissorTest(!1);let K=f!==Fn&&this.type===Fn,L=f===Fn&&this.type!==Fn;for(let O=0,q=T.length;O<q;O++){let Z=T[O],W=Z.shadow;if(W===void 0){console.warn("THREE.WebGLShadowMap:",Z,"has no shadow.");continue}if(W.autoUpdate===!1&&W.needsUpdate===!1)continue;i.copy(W.mapSize);let U=W.getFrameExtents();if(i.multiply(U),r.copy(W.mapSize),(i.x>h||i.y>h)&&(i.x>h&&(r.x=Math.floor(h/U.x),i.x=r.x*U.x,W.mapSize.x=r.x),i.y>h&&(r.y=Math.floor(h/U.y),i.y=r.y*U.y,W.mapSize.y=r.y)),W.map===null||K===!0||L===!0){let et=this.type!==Fn?{minFilter:Ge,magFilter:Ge}:{};W.map!==null&&W.map.dispose(),W.map=new Vn(i.x,i.y,et),W.map.texture.name=Z.name+".shadowMap",W.camera.updateProjectionMatrix()}s.setRenderTarget(W.map),s.clear();let Y=W.getViewportCount();for(let et=0;et<Y;et++){let ht=W.getViewport(et);a.set(r.x*ht.x,r.y*ht.y,r.x*ht.z,r.y*ht.w),N.viewport(a),W.updateMatrices(Z,et),n=W.getFrustum(),E(A,X,W.camera,Z,this.type)}W.isPointLightShadow!==!0&&this.type===Fn&&b(W,X),W.needsUpdate=!1}f=this.type,m.needsUpdate=!1,s.setRenderTarget(S,x,I)};function b(T,A){let X=t.update(y);d.defines.VSM_SAMPLES!==T.blurSamples&&(d.defines.VSM_SAMPLES=T.blurSamples,p.defines.VSM_SAMPLES=T.blurSamples,d.needsUpdate=!0,p.needsUpdate=!0),T.mapPass===null&&(T.mapPass=new Vn(i.x,i.y)),d.uniforms.shadow_pass.value=T.map.texture,d.uniforms.resolution.value=T.mapSize,d.uniforms.radius.value=T.radius,s.setRenderTarget(T.mapPass),s.clear(),s.renderBufferDirect(A,null,X,d,y,null),p.uniforms.shadow_pass.value=T.mapPass.texture,p.uniforms.resolution.value=T.mapSize,p.uniforms.radius.value=T.radius,s.setRenderTarget(T.map),s.clear(),s.renderBufferDirect(A,null,X,p,y,null)}function v(T,A,X,S){let x=null,I=X.isPointLight===!0?T.customDistanceMaterial:T.customDepthMaterial;if(I!==void 0)x=I;else if(x=X.isPointLight===!0?l:o,s.localClippingEnabled&&A.clipShadows===!0&&Array.isArray(A.clippingPlanes)&&A.clippingPlanes.length!==0||A.displacementMap&&A.displacementScale!==0||A.alphaMap&&A.alphaTest>0||A.map&&A.alphaTest>0){let N=x.uuid,K=A.uuid,L=c[N];L===void 0&&(L={},c[N]=L);let O=L[K];O===void 0&&(O=x.clone(),L[K]=O,A.addEventListener("dispose",C)),x=O}if(x.visible=A.visible,x.wireframe=A.wireframe,S===Fn?x.side=A.shadowSide!==null?A.shadowSide:A.side:x.side=A.shadowSide!==null?A.shadowSide:u[A.side],x.alphaMap=A.alphaMap,x.alphaTest=A.alphaTest,x.map=A.map,x.clipShadows=A.clipShadows,x.clippingPlanes=A.clippingPlanes,x.clipIntersection=A.clipIntersection,x.displacementMap=A.displacementMap,x.displacementScale=A.displacementScale,x.displacementBias=A.displacementBias,x.wireframeLinewidth=A.wireframeLinewidth,x.linewidth=A.linewidth,X.isPointLight===!0&&x.isMeshDistanceMaterial===!0){let N=s.properties.get(x);N.light=X}return x}function E(T,A,X,S,x){if(T.visible===!1)return;if(T.layers.test(A.layers)&&(T.isMesh||T.isLine||T.isPoints)&&(T.castShadow||T.receiveShadow&&x===Fn)&&(!T.frustumCulled||n.intersectsObject(T))){T.modelViewMatrix.multiplyMatrices(X.matrixWorldInverse,T.matrixWorld);let K=t.update(T),L=T.material;if(Array.isArray(L)){let O=K.groups;for(let q=0,Z=O.length;q<Z;q++){let W=O[q],U=L[W.materialIndex];if(U&&U.visible){let Y=v(T,U,S,x);T.onBeforeShadow(s,T,A,X,K,Y,W),s.renderBufferDirect(X,null,K,Y,T,W),T.onAfterShadow(s,T,A,X,K,Y,W)}}}else if(L.visible){let O=v(T,L,S,x);T.onBeforeShadow(s,T,A,X,K,O,null),s.renderBufferDirect(X,null,K,O,T,null),T.onAfterShadow(s,T,A,X,K,O,null)}}let N=T.children;for(let K=0,L=N.length;K<L;K++)E(N[K],A,X,S,x)}function C(T){T.target.removeEventListener("dispose",C);for(let X in c){let S=c[X],x=T.target.uuid;x in S&&(S[x].dispose(),delete S[x])}}}function Wy(s,t,e){let n=e.isWebGL2;function i(){let P=!1,ot=new Ie,lt=null,wt=new Ie(0,0,0,0);return{setMask:function(k){lt!==k&&!P&&(s.colorMask(k,k,k,k),lt=k)},setLocked:function(k){P=k},setClear:function(k,tt,ct,Xt,qt){qt===!0&&(k*=Xt,tt*=Xt,ct*=Xt),ot.set(k,tt,ct,Xt),wt.equals(ot)===!1&&(s.clearColor(k,tt,ct,Xt),wt.copy(ot))},reset:function(){P=!1,lt=null,wt.set(-1,0,0,0)}}}function r(){let P=!1,ot=null,lt=null,wt=null;return{setTest:function(k){k?Pt(s.DEPTH_TEST):St(s.DEPTH_TEST)},setMask:function(k){ot!==k&&!P&&(s.depthMask(k),ot=k)},setFunc:function(k){if(lt!==k){switch(k){case _d:s.depthFunc(s.NEVER);break;case Sd:s.depthFunc(s.ALWAYS);break;case Md:s.depthFunc(s.LESS);break;case Ur:s.depthFunc(s.LEQUAL);break;case wd:s.depthFunc(s.EQUAL);break;case Ed:s.depthFunc(s.GEQUAL);break;case Td:s.depthFunc(s.GREATER);break;case Ad:s.depthFunc(s.NOTEQUAL);break;default:s.depthFunc(s.LEQUAL)}lt=k}},setLocked:function(k){P=k},setClear:function(k){wt!==k&&(s.clearDepth(k),wt=k)},reset:function(){P=!1,ot=null,lt=null,wt=null}}}function a(){let P=!1,ot=null,lt=null,wt=null,k=null,tt=null,ct=null,Xt=null,qt=null;return{setTest:function(Yt){P||(Yt?Pt(s.STENCIL_TEST):St(s.STENCIL_TEST))},setMask:function(Yt){ot!==Yt&&!P&&(s.stencilMask(Yt),ot=Yt)},setFunc:function(Yt,ae,Be){(lt!==Yt||wt!==ae||k!==Be)&&(s.stencilFunc(Yt,ae,Be),lt=Yt,wt=ae,k=Be)},setOp:function(Yt,ae,Be){(tt!==Yt||ct!==ae||Xt!==Be)&&(s.stencilOp(Yt,ae,Be),tt=Yt,ct=ae,Xt=Be)},setLocked:function(Yt){P=Yt},setClear:function(Yt){qt!==Yt&&(s.clearStencil(Yt),qt=Yt)},reset:function(){P=!1,ot=null,lt=null,wt=null,k=null,tt=null,ct=null,Xt=null,qt=null}}}let o=new i,l=new r,c=new a,h=new WeakMap,u=new WeakMap,d={},p={},g=new WeakMap,y=[],m=null,f=!1,b=null,v=null,E=null,C=null,T=null,A=null,X=null,S=new Vt(0,0,0),x=0,I=!1,N=null,K=null,L=null,O=null,q=null,Z=s.getParameter(s.MAX_COMBINED_TEXTURE_IMAGE_UNITS),W=!1,U=0,Y=s.getParameter(s.VERSION);Y.indexOf("WebGL")!==-1?(U=parseFloat(/^WebGL (\d)/.exec(Y)[1]),W=U>=1):Y.indexOf("OpenGL ES")!==-1&&(U=parseFloat(/^OpenGL ES (\d)/.exec(Y)[1]),W=U>=2);let et=null,ht={},$=s.getParameter(s.SCISSOR_BOX),J=s.getParameter(s.VIEWPORT),ut=new Ie().fromArray($),vt=new Ie().fromArray(J);function yt(P,ot,lt,wt){let k=new Uint8Array(4),tt=s.createTexture();s.bindTexture(P,tt),s.texParameteri(P,s.TEXTURE_MIN_FILTER,s.NEAREST),s.texParameteri(P,s.TEXTURE_MAG_FILTER,s.NEAREST);for(let ct=0;ct<lt;ct++)n&&(P===s.TEXTURE_3D||P===s.TEXTURE_2D_ARRAY)?s.texImage3D(ot,0,s.RGBA,1,1,wt,0,s.RGBA,s.UNSIGNED_BYTE,k):s.texImage2D(ot+ct,0,s.RGBA,1,1,0,s.RGBA,s.UNSIGNED_BYTE,k);return tt}let It={};It[s.TEXTURE_2D]=yt(s.TEXTURE_2D,s.TEXTURE_2D,1),It[s.TEXTURE_CUBE_MAP]=yt(s.TEXTURE_CUBE_MAP,s.TEXTURE_CUBE_MAP_POSITIVE_X,6),n&&(It[s.TEXTURE_2D_ARRAY]=yt(s.TEXTURE_2D_ARRAY,s.TEXTURE_2D_ARRAY,1,1),It[s.TEXTURE_3D]=yt(s.TEXTURE_3D,s.TEXTURE_3D,1,1)),o.setClear(0,0,0,1),l.setClear(1),c.setClear(0),Pt(s.DEPTH_TEST),l.setFunc(Ur),Lt(!1),w($l),Pt(s.CULL_FACE),mt(ii);function Pt(P){d[P]!==!0&&(s.enable(P),d[P]=!0)}function St(P){d[P]!==!1&&(s.disable(P),d[P]=!1)}function $t(P,ot){return p[P]!==ot?(s.bindFramebuffer(P,ot),p[P]=ot,n&&(P===s.DRAW_FRAMEBUFFER&&(p[s.FRAMEBUFFER]=ot),P===s.FRAMEBUFFER&&(p[s.DRAW_FRAMEBUFFER]=ot)),!0):!1}function H(P,ot){let lt=y,wt=!1;if(P)if(lt=g.get(ot),lt===void 0&&(lt=[],g.set(ot,lt)),P.isWebGLMultipleRenderTargets){let k=P.texture;if(lt.length!==k.length||lt[0]!==s.COLOR_ATTACHMENT0){for(let tt=0,ct=k.length;tt<ct;tt++)lt[tt]=s.COLOR_ATTACHMENT0+tt;lt.length=k.length,wt=!0}}else lt[0]!==s.COLOR_ATTACHMENT0&&(lt[0]=s.COLOR_ATTACHMENT0,wt=!0);else lt[0]!==s.BACK&&(lt[0]=s.BACK,wt=!0);wt&&(e.isWebGL2?s.drawBuffers(lt):t.get("WEBGL_draw_buffers").drawBuffersWEBGL(lt))}function fe(P){return m!==P?(s.useProgram(P),m=P,!0):!1}let _t={[xi]:s.FUNC_ADD,[ad]:s.FUNC_SUBTRACT,[od]:s.FUNC_REVERSE_SUBTRACT};if(n)_t[Yl]=s.MIN,_t[Zl]=s.MAX;else{let P=t.get("EXT_blend_minmax");P!==null&&(_t[Yl]=P.MIN_EXT,_t[Zl]=P.MAX_EXT)}let At={[ld]:s.ZERO,[cd]:s.ONE,[hd]:s.SRC_COLOR,[bo]:s.SRC_ALPHA,[gd]:s.SRC_ALPHA_SATURATE,[pd]:s.DST_COLOR,[dd]:s.DST_ALPHA,[ud]:s.ONE_MINUS_SRC_COLOR,[_o]:s.ONE_MINUS_SRC_ALPHA,[md]:s.ONE_MINUS_DST_COLOR,[fd]:s.ONE_MINUS_DST_ALPHA,[yd]:s.CONSTANT_COLOR,[vd]:s.ONE_MINUS_CONSTANT_COLOR,[xd]:s.CONSTANT_ALPHA,[bd]:s.ONE_MINUS_CONSTANT_ALPHA};function mt(P,ot,lt,wt,k,tt,ct,Xt,qt,Yt){if(P===ii){f===!0&&(St(s.BLEND),f=!1);return}if(f===!1&&(Pt(s.BLEND),f=!0),P!==rd){if(P!==b||Yt!==I){if((v!==xi||T!==xi)&&(s.blendEquation(s.FUNC_ADD),v=xi,T=xi),Yt)switch(P){case si:s.blendFuncSeparate(s.ONE,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case Hn:s.blendFunc(s.ONE,s.ONE);break;case Xl:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case ql:s.blendFuncSeparate(s.ZERO,s.SRC_COLOR,s.ZERO,s.SRC_ALPHA);break;default:console.error("THREE.WebGLState: Invalid blending: ",P);break}else switch(P){case si:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case Hn:s.blendFunc(s.SRC_ALPHA,s.ONE);break;case Xl:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case ql:s.blendFunc(s.ZERO,s.SRC_COLOR);break;default:console.error("THREE.WebGLState: Invalid blending: ",P);break}E=null,C=null,A=null,X=null,S.set(0,0,0),x=0,b=P,I=Yt}return}k=k||ot,tt=tt||lt,ct=ct||wt,(ot!==v||k!==T)&&(s.blendEquationSeparate(_t[ot],_t[k]),v=ot,T=k),(lt!==E||wt!==C||tt!==A||ct!==X)&&(s.blendFuncSeparate(At[lt],At[wt],At[tt],At[ct]),E=lt,C=wt,A=tt,X=ct),(Xt.equals(S)===!1||qt!==x)&&(s.blendColor(Xt.r,Xt.g,Xt.b,qt),S.copy(Xt),x=qt),b=P,I=!1}function te(P,ot){P.side===We?St(s.CULL_FACE):Pt(s.CULL_FACE);let lt=P.side===Ze;ot&&(lt=!lt),Lt(lt),P.blending===si&&P.transparent===!1?mt(ii):mt(P.blending,P.blendEquation,P.blendSrc,P.blendDst,P.blendEquationAlpha,P.blendSrcAlpha,P.blendDstAlpha,P.blendColor,P.blendAlpha,P.premultipliedAlpha),l.setFunc(P.depthFunc),l.setTest(P.depthTest),l.setMask(P.depthWrite),o.setMask(P.colorWrite);let wt=P.stencilWrite;c.setTest(wt),wt&&(c.setMask(P.stencilWriteMask),c.setFunc(P.stencilFunc,P.stencilRef,P.stencilFuncMask),c.setOp(P.stencilFail,P.stencilZFail,P.stencilZPass)),B(P.polygonOffset,P.polygonOffsetFactor,P.polygonOffsetUnits),P.alphaToCoverage===!0?Pt(s.SAMPLE_ALPHA_TO_COVERAGE):St(s.SAMPLE_ALPHA_TO_COVERAGE)}function Lt(P){N!==P&&(P?s.frontFace(s.CW):s.frontFace(s.CCW),N=P)}function w(P){P!==nd?(Pt(s.CULL_FACE),P!==K&&(P===$l?s.cullFace(s.BACK):P===id?s.cullFace(s.FRONT):s.cullFace(s.FRONT_AND_BACK))):St(s.CULL_FACE),K=P}function _(P){P!==L&&(W&&s.lineWidth(P),L=P)}function B(P,ot,lt){P?(Pt(s.POLYGON_OFFSET_FILL),(O!==ot||q!==lt)&&(s.polygonOffset(ot,lt),O=ot,q=lt)):St(s.POLYGON_OFFSET_FILL)}function nt(P){P?Pt(s.SCISSOR_TEST):St(s.SCISSOR_TEST)}function j(P){P===void 0&&(P=s.TEXTURE0+Z-1),et!==P&&(s.activeTexture(P),et=P)}function it(P,ot,lt){lt===void 0&&(et===null?lt=s.TEXTURE0+Z-1:lt=et);let wt=ht[lt];wt===void 0&&(wt={type:void 0,texture:void 0},ht[lt]=wt),(wt.type!==P||wt.texture!==ot)&&(et!==lt&&(s.activeTexture(lt),et=lt),s.bindTexture(P,ot||It[P]),wt.type=P,wt.texture=ot)}function gt(){let P=ht[et];P!==void 0&&P.type!==void 0&&(s.bindTexture(P.type,null),P.type=void 0,P.texture=void 0)}function at(){try{s.compressedTexImage2D.apply(s,arguments)}catch(P){console.error("THREE.WebGLState:",P)}}function ft(){try{s.compressedTexImage3D.apply(s,arguments)}catch(P){console.error("THREE.WebGLState:",P)}}function Mt(){try{s.texSubImage2D.apply(s,arguments)}catch(P){console.error("THREE.WebGLState:",P)}}function Nt(){try{s.texSubImage3D.apply(s,arguments)}catch(P){console.error("THREE.WebGLState:",P)}}function Q(){try{s.compressedTexSubImage2D.apply(s,arguments)}catch(P){console.error("THREE.WebGLState:",P)}}function jt(){try{s.compressedTexSubImage3D.apply(s,arguments)}catch(P){console.error("THREE.WebGLState:",P)}}function Bt(){try{s.texStorage2D.apply(s,arguments)}catch(P){console.error("THREE.WebGLState:",P)}}function Ct(){try{s.texStorage3D.apply(s,arguments)}catch(P){console.error("THREE.WebGLState:",P)}}function xt(){try{s.texImage2D.apply(s,arguments)}catch(P){console.error("THREE.WebGLState:",P)}}function pt(){try{s.texImage3D.apply(s,arguments)}catch(P){console.error("THREE.WebGLState:",P)}}function Dt(P){ut.equals(P)===!1&&(s.scissor(P.x,P.y,P.z,P.w),ut.copy(P))}function Kt(P){vt.equals(P)===!1&&(s.viewport(P.x,P.y,P.z,P.w),vt.copy(P))}function Qt(P,ot){let lt=u.get(ot);lt===void 0&&(lt=new WeakMap,u.set(ot,lt));let wt=lt.get(P);wt===void 0&&(wt=s.getUniformBlockIndex(ot,P.name),lt.set(P,wt))}function kt(P,ot){let wt=u.get(ot).get(P);h.get(ot)!==wt&&(s.uniformBlockBinding(ot,wt,P.__bindingPointIndex),h.set(ot,wt))}function st(){s.disable(s.BLEND),s.disable(s.CULL_FACE),s.disable(s.DEPTH_TEST),s.disable(s.POLYGON_OFFSET_FILL),s.disable(s.SCISSOR_TEST),s.disable(s.STENCIL_TEST),s.disable(s.SAMPLE_ALPHA_TO_COVERAGE),s.blendEquation(s.FUNC_ADD),s.blendFunc(s.ONE,s.ZERO),s.blendFuncSeparate(s.ONE,s.ZERO,s.ONE,s.ZERO),s.blendColor(0,0,0,0),s.colorMask(!0,!0,!0,!0),s.clearColor(0,0,0,0),s.depthMask(!0),s.depthFunc(s.LESS),s.clearDepth(1),s.stencilMask(4294967295),s.stencilFunc(s.ALWAYS,0,4294967295),s.stencilOp(s.KEEP,s.KEEP,s.KEEP),s.clearStencil(0),s.cullFace(s.BACK),s.frontFace(s.CCW),s.polygonOffset(0,0),s.activeTexture(s.TEXTURE0),s.bindFramebuffer(s.FRAMEBUFFER,null),n===!0&&(s.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),s.bindFramebuffer(s.READ_FRAMEBUFFER,null)),s.useProgram(null),s.lineWidth(1),s.scissor(0,0,s.canvas.width,s.canvas.height),s.viewport(0,0,s.canvas.width,s.canvas.height),d={},et=null,ht={},p={},g=new WeakMap,y=[],m=null,f=!1,b=null,v=null,E=null,C=null,T=null,A=null,X=null,S=new Vt(0,0,0),x=0,I=!1,N=null,K=null,L=null,O=null,q=null,ut.set(0,0,s.canvas.width,s.canvas.height),vt.set(0,0,s.canvas.width,s.canvas.height),o.reset(),l.reset(),c.reset()}return{buffers:{color:o,depth:l,stencil:c},enable:Pt,disable:St,bindFramebuffer:$t,drawBuffers:H,useProgram:fe,setBlending:mt,setMaterial:te,setFlipSided:Lt,setCullFace:w,setLineWidth:_,setPolygonOffset:B,setScissorTest:nt,activeTexture:j,bindTexture:it,unbindTexture:gt,compressedTexImage2D:at,compressedTexImage3D:ft,texImage2D:xt,texImage3D:pt,updateUBOMapping:Qt,uniformBlockBinding:kt,texStorage2D:Bt,texStorage3D:Ct,texSubImage2D:Mt,texSubImage3D:Nt,compressedTexSubImage2D:Q,compressedTexSubImage3D:jt,scissor:Dt,viewport:Kt,reset:st}}function $y(s,t,e,n,i,r,a){let o=i.isWebGL2,l=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,c=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),h=new WeakMap,u,d=new WeakMap,p=!1;try{p=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(w,_){return p?new OffscreenCanvas(w,_):Vr("canvas")}function y(w,_,B,nt){let j=1;if((w.width>nt||w.height>nt)&&(j=nt/Math.max(w.width,w.height)),j<1||_===!0)if(typeof HTMLImageElement<"u"&&w instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&w instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&w instanceof ImageBitmap){let it=_?Ao:Math.floor,gt=it(j*w.width),at=it(j*w.height);u===void 0&&(u=g(gt,at));let ft=B?g(gt,at):u;return ft.width=gt,ft.height=at,ft.getContext("2d").drawImage(w,0,0,gt,at),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+w.width+"x"+w.height+") to ("+gt+"x"+at+")."),ft}else return"data"in w&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+w.width+"x"+w.height+")."),w;return w}function m(w){return Ac(w.width)&&Ac(w.height)}function f(w){return o?!1:w.wrapS!==Ye||w.wrapT!==Ye||w.minFilter!==Ge&&w.minFilter!==hn}function b(w,_){return w.generateMipmaps&&_&&w.minFilter!==Ge&&w.minFilter!==hn}function v(w){s.generateMipmap(w)}function E(w,_,B,nt,j=!1){if(o===!1)return _;if(w!==null){if(s[w]!==void 0)return s[w];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+w+"'")}let it=_;if(_===s.RED&&(B===s.FLOAT&&(it=s.R32F),B===s.HALF_FLOAT&&(it=s.R16F),B===s.UNSIGNED_BYTE&&(it=s.R8)),_===s.RED_INTEGER&&(B===s.UNSIGNED_BYTE&&(it=s.R8UI),B===s.UNSIGNED_SHORT&&(it=s.R16UI),B===s.UNSIGNED_INT&&(it=s.R32UI),B===s.BYTE&&(it=s.R8I),B===s.SHORT&&(it=s.R16I),B===s.INT&&(it=s.R32I)),_===s.RG&&(B===s.FLOAT&&(it=s.RG32F),B===s.HALF_FLOAT&&(it=s.RG16F),B===s.UNSIGNED_BYTE&&(it=s.RG8)),_===s.RGBA){let gt=j?Or:ie.getTransfer(nt);B===s.FLOAT&&(it=s.RGBA32F),B===s.HALF_FLOAT&&(it=s.RGBA16F),B===s.UNSIGNED_BYTE&&(it=gt===le?s.SRGB8_ALPHA8:s.RGBA8),B===s.UNSIGNED_SHORT_4_4_4_4&&(it=s.RGBA4),B===s.UNSIGNED_SHORT_5_5_5_1&&(it=s.RGB5_A1)}return(it===s.R16F||it===s.R32F||it===s.RG16F||it===s.RG32F||it===s.RGBA16F||it===s.RGBA32F)&&t.get("EXT_color_buffer_float"),it}function C(w,_,B){return b(w,B)===!0||w.isFramebufferTexture&&w.minFilter!==Ge&&w.minFilter!==hn?Math.log2(Math.max(_.width,_.height))+1:w.mipmaps!==void 0&&w.mipmaps.length>0?w.mipmaps.length:w.isCompressedTexture&&Array.isArray(w.image)?_.mipmaps.length:1}function T(w){return w===Ge||w===Jl||w===Ha?s.NEAREST:s.LINEAR}function A(w){let _=w.target;_.removeEventListener("dispose",A),S(_),_.isVideoTexture&&h.delete(_)}function X(w){let _=w.target;_.removeEventListener("dispose",X),I(_)}function S(w){let _=n.get(w);if(_.__webglInit===void 0)return;let B=w.source,nt=d.get(B);if(nt){let j=nt[_.__cacheKey];j.usedTimes--,j.usedTimes===0&&x(w),Object.keys(nt).length===0&&d.delete(B)}n.remove(w)}function x(w){let _=n.get(w);s.deleteTexture(_.__webglTexture);let B=w.source,nt=d.get(B);delete nt[_.__cacheKey],a.memory.textures--}function I(w){let _=w.texture,B=n.get(w),nt=n.get(_);if(nt.__webglTexture!==void 0&&(s.deleteTexture(nt.__webglTexture),a.memory.textures--),w.depthTexture&&w.depthTexture.dispose(),w.isWebGLCubeRenderTarget)for(let j=0;j<6;j++){if(Array.isArray(B.__webglFramebuffer[j]))for(let it=0;it<B.__webglFramebuffer[j].length;it++)s.deleteFramebuffer(B.__webglFramebuffer[j][it]);else s.deleteFramebuffer(B.__webglFramebuffer[j]);B.__webglDepthbuffer&&s.deleteRenderbuffer(B.__webglDepthbuffer[j])}else{if(Array.isArray(B.__webglFramebuffer))for(let j=0;j<B.__webglFramebuffer.length;j++)s.deleteFramebuffer(B.__webglFramebuffer[j]);else s.deleteFramebuffer(B.__webglFramebuffer);if(B.__webglDepthbuffer&&s.deleteRenderbuffer(B.__webglDepthbuffer),B.__webglMultisampledFramebuffer&&s.deleteFramebuffer(B.__webglMultisampledFramebuffer),B.__webglColorRenderbuffer)for(let j=0;j<B.__webglColorRenderbuffer.length;j++)B.__webglColorRenderbuffer[j]&&s.deleteRenderbuffer(B.__webglColorRenderbuffer[j]);B.__webglDepthRenderbuffer&&s.deleteRenderbuffer(B.__webglDepthRenderbuffer)}if(w.isWebGLMultipleRenderTargets)for(let j=0,it=_.length;j<it;j++){let gt=n.get(_[j]);gt.__webglTexture&&(s.deleteTexture(gt.__webglTexture),a.memory.textures--),n.remove(_[j])}n.remove(_),n.remove(w)}let N=0;function K(){N=0}function L(){let w=N;return w>=i.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+w+" texture units while this GPU supports only "+i.maxTextures),N+=1,w}function O(w){let _=[];return _.push(w.wrapS),_.push(w.wrapT),_.push(w.wrapR||0),_.push(w.magFilter),_.push(w.minFilter),_.push(w.anisotropy),_.push(w.internalFormat),_.push(w.format),_.push(w.type),_.push(w.generateMipmaps),_.push(w.premultiplyAlpha),_.push(w.flipY),_.push(w.unpackAlignment),_.push(w.colorSpace),_.join()}function q(w,_){let B=n.get(w);if(w.isVideoTexture&&te(w),w.isRenderTargetTexture===!1&&w.version>0&&B.__version!==w.version){let nt=w.image;if(nt===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(nt.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{ut(B,w,_);return}}e.bindTexture(s.TEXTURE_2D,B.__webglTexture,s.TEXTURE0+_)}function Z(w,_){let B=n.get(w);if(w.version>0&&B.__version!==w.version){ut(B,w,_);return}e.bindTexture(s.TEXTURE_2D_ARRAY,B.__webglTexture,s.TEXTURE0+_)}function W(w,_){let B=n.get(w);if(w.version>0&&B.__version!==w.version){ut(B,w,_);return}e.bindTexture(s.TEXTURE_3D,B.__webglTexture,s.TEXTURE0+_)}function U(w,_){let B=n.get(w);if(w.version>0&&B.__version!==w.version){vt(B,w,_);return}e.bindTexture(s.TEXTURE_CUBE_MAP,B.__webglTexture,s.TEXTURE0+_)}let Y={[ks]:s.REPEAT,[Ye]:s.CLAMP_TO_EDGE,[cs]:s.MIRRORED_REPEAT},et={[Ge]:s.NEAREST,[Jl]:s.NEAREST_MIPMAP_NEAREST,[Ha]:s.NEAREST_MIPMAP_LINEAR,[hn]:s.LINEAR,[Fd]:s.LINEAR_MIPMAP_NEAREST,[Us]:s.LINEAR_MIPMAP_LINEAR},ht={[Zd]:s.NEVER,[ef]:s.ALWAYS,[Jd]:s.LESS,[Lh]:s.LEQUAL,[jd]:s.EQUAL,[tf]:s.GEQUAL,[Kd]:s.GREATER,[Qd]:s.NOTEQUAL};function $(w,_,B){if(B?(s.texParameteri(w,s.TEXTURE_WRAP_S,Y[_.wrapS]),s.texParameteri(w,s.TEXTURE_WRAP_T,Y[_.wrapT]),(w===s.TEXTURE_3D||w===s.TEXTURE_2D_ARRAY)&&s.texParameteri(w,s.TEXTURE_WRAP_R,Y[_.wrapR]),s.texParameteri(w,s.TEXTURE_MAG_FILTER,et[_.magFilter]),s.texParameteri(w,s.TEXTURE_MIN_FILTER,et[_.minFilter])):(s.texParameteri(w,s.TEXTURE_WRAP_S,s.CLAMP_TO_EDGE),s.texParameteri(w,s.TEXTURE_WRAP_T,s.CLAMP_TO_EDGE),(w===s.TEXTURE_3D||w===s.TEXTURE_2D_ARRAY)&&s.texParameteri(w,s.TEXTURE_WRAP_R,s.CLAMP_TO_EDGE),(_.wrapS!==Ye||_.wrapT!==Ye)&&console.warn("THREE.WebGLRenderer: Texture is not power of two. Texture.wrapS and Texture.wrapT should be set to THREE.ClampToEdgeWrapping."),s.texParameteri(w,s.TEXTURE_MAG_FILTER,T(_.magFilter)),s.texParameteri(w,s.TEXTURE_MIN_FILTER,T(_.minFilter)),_.minFilter!==Ge&&_.minFilter!==hn&&console.warn("THREE.WebGLRenderer: Texture is not power of two. Texture.minFilter should be set to THREE.NearestFilter or THREE.LinearFilter.")),_.compareFunction&&(s.texParameteri(w,s.TEXTURE_COMPARE_MODE,s.COMPARE_REF_TO_TEXTURE),s.texParameteri(w,s.TEXTURE_COMPARE_FUNC,ht[_.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){let nt=t.get("EXT_texture_filter_anisotropic");if(_.magFilter===Ge||_.minFilter!==Ha&&_.minFilter!==Us||_.type===ni&&t.has("OES_texture_float_linear")===!1||o===!1&&_.type===Fs&&t.has("OES_texture_half_float_linear")===!1)return;(_.anisotropy>1||n.get(_).__currentAnisotropy)&&(s.texParameterf(w,nt.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(_.anisotropy,i.getMaxAnisotropy())),n.get(_).__currentAnisotropy=_.anisotropy)}}function J(w,_){let B=!1;w.__webglInit===void 0&&(w.__webglInit=!0,_.addEventListener("dispose",A));let nt=_.source,j=d.get(nt);j===void 0&&(j={},d.set(nt,j));let it=O(_);if(it!==w.__cacheKey){j[it]===void 0&&(j[it]={texture:s.createTexture(),usedTimes:0},a.memory.textures++,B=!0),j[it].usedTimes++;let gt=j[w.__cacheKey];gt!==void 0&&(j[w.__cacheKey].usedTimes--,gt.usedTimes===0&&x(_)),w.__cacheKey=it,w.__webglTexture=j[it].texture}return B}function ut(w,_,B){let nt=s.TEXTURE_2D;(_.isDataArrayTexture||_.isCompressedArrayTexture)&&(nt=s.TEXTURE_2D_ARRAY),_.isData3DTexture&&(nt=s.TEXTURE_3D);let j=J(w,_),it=_.source;e.bindTexture(nt,w.__webglTexture,s.TEXTURE0+B);let gt=n.get(it);if(it.version!==gt.__version||j===!0){e.activeTexture(s.TEXTURE0+B);let at=ie.getPrimaries(ie.workingColorSpace),ft=_.colorSpace===un?null:ie.getPrimaries(_.colorSpace),Mt=_.colorSpace===un||at===ft?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,_.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,_.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,_.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,Mt);let Nt=f(_)&&m(_.image)===!1,Q=y(_.image,Nt,!1,i.maxTextureSize);Q=Lt(_,Q);let jt=m(Q)||o,Bt=r.convert(_.format,_.colorSpace),Ct=r.convert(_.type),xt=E(_.internalFormat,Bt,Ct,_.colorSpace,_.isVideoTexture);$(nt,_,jt);let pt,Dt=_.mipmaps,Kt=o&&_.isVideoTexture!==!0&&xt!==Ph,Qt=gt.__version===void 0||j===!0,kt=C(_,Q,jt);if(_.isDepthTexture)xt=s.DEPTH_COMPONENT,o?_.type===ni?xt=s.DEPTH_COMPONENT32F:_.type===ei?xt=s.DEPTH_COMPONENT24:_.type===Si?xt=s.DEPTH24_STENCIL8:xt=s.DEPTH_COMPONENT16:_.type===ni&&console.error("WebGLRenderer: Floating point depth texture requires WebGL2."),_.format===Mi&&xt===s.DEPTH_COMPONENT&&_.type!==rl&&_.type!==ei&&(console.warn("THREE.WebGLRenderer: Use UnsignedShortType or UnsignedIntType for DepthFormat DepthTexture."),_.type=ei,Ct=r.convert(_.type)),_.format===hs&&xt===s.DEPTH_COMPONENT&&(xt=s.DEPTH_STENCIL,_.type!==Si&&(console.warn("THREE.WebGLRenderer: Use UnsignedInt248Type for DepthStencilFormat DepthTexture."),_.type=Si,Ct=r.convert(_.type))),Qt&&(Kt?e.texStorage2D(s.TEXTURE_2D,1,xt,Q.width,Q.height):e.texImage2D(s.TEXTURE_2D,0,xt,Q.width,Q.height,0,Bt,Ct,null));else if(_.isDataTexture)if(Dt.length>0&&jt){Kt&&Qt&&e.texStorage2D(s.TEXTURE_2D,kt,xt,Dt[0].width,Dt[0].height);for(let st=0,P=Dt.length;st<P;st++)pt=Dt[st],Kt?e.texSubImage2D(s.TEXTURE_2D,st,0,0,pt.width,pt.height,Bt,Ct,pt.data):e.texImage2D(s.TEXTURE_2D,st,xt,pt.width,pt.height,0,Bt,Ct,pt.data);_.generateMipmaps=!1}else Kt?(Qt&&e.texStorage2D(s.TEXTURE_2D,kt,xt,Q.width,Q.height),e.texSubImage2D(s.TEXTURE_2D,0,0,0,Q.width,Q.height,Bt,Ct,Q.data)):e.texImage2D(s.TEXTURE_2D,0,xt,Q.width,Q.height,0,Bt,Ct,Q.data);else if(_.isCompressedTexture)if(_.isCompressedArrayTexture){Kt&&Qt&&e.texStorage3D(s.TEXTURE_2D_ARRAY,kt,xt,Dt[0].width,Dt[0].height,Q.depth);for(let st=0,P=Dt.length;st<P;st++)pt=Dt[st],_.format!==vn?Bt!==null?Kt?e.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,st,0,0,0,pt.width,pt.height,Q.depth,Bt,pt.data,0,0):e.compressedTexImage3D(s.TEXTURE_2D_ARRAY,st,xt,pt.width,pt.height,Q.depth,0,pt.data,0,0):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Kt?e.texSubImage3D(s.TEXTURE_2D_ARRAY,st,0,0,0,pt.width,pt.height,Q.depth,Bt,Ct,pt.data):e.texImage3D(s.TEXTURE_2D_ARRAY,st,xt,pt.width,pt.height,Q.depth,0,Bt,Ct,pt.data)}else{Kt&&Qt&&e.texStorage2D(s.TEXTURE_2D,kt,xt,Dt[0].width,Dt[0].height);for(let st=0,P=Dt.length;st<P;st++)pt=Dt[st],_.format!==vn?Bt!==null?Kt?e.compressedTexSubImage2D(s.TEXTURE_2D,st,0,0,pt.width,pt.height,Bt,pt.data):e.compressedTexImage2D(s.TEXTURE_2D,st,xt,pt.width,pt.height,0,pt.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Kt?e.texSubImage2D(s.TEXTURE_2D,st,0,0,pt.width,pt.height,Bt,Ct,pt.data):e.texImage2D(s.TEXTURE_2D,st,xt,pt.width,pt.height,0,Bt,Ct,pt.data)}else if(_.isDataArrayTexture)Kt?(Qt&&e.texStorage3D(s.TEXTURE_2D_ARRAY,kt,xt,Q.width,Q.height,Q.depth),e.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,0,Q.width,Q.height,Q.depth,Bt,Ct,Q.data)):e.texImage3D(s.TEXTURE_2D_ARRAY,0,xt,Q.width,Q.height,Q.depth,0,Bt,Ct,Q.data);else if(_.isData3DTexture)Kt?(Qt&&e.texStorage3D(s.TEXTURE_3D,kt,xt,Q.width,Q.height,Q.depth),e.texSubImage3D(s.TEXTURE_3D,0,0,0,0,Q.width,Q.height,Q.depth,Bt,Ct,Q.data)):e.texImage3D(s.TEXTURE_3D,0,xt,Q.width,Q.height,Q.depth,0,Bt,Ct,Q.data);else if(_.isFramebufferTexture){if(Qt)if(Kt)e.texStorage2D(s.TEXTURE_2D,kt,xt,Q.width,Q.height);else{let st=Q.width,P=Q.height;for(let ot=0;ot<kt;ot++)e.texImage2D(s.TEXTURE_2D,ot,xt,st,P,0,Bt,Ct,null),st>>=1,P>>=1}}else if(Dt.length>0&&jt){Kt&&Qt&&e.texStorage2D(s.TEXTURE_2D,kt,xt,Dt[0].width,Dt[0].height);for(let st=0,P=Dt.length;st<P;st++)pt=Dt[st],Kt?e.texSubImage2D(s.TEXTURE_2D,st,0,0,Bt,Ct,pt):e.texImage2D(s.TEXTURE_2D,st,xt,Bt,Ct,pt);_.generateMipmaps=!1}else Kt?(Qt&&e.texStorage2D(s.TEXTURE_2D,kt,xt,Q.width,Q.height),e.texSubImage2D(s.TEXTURE_2D,0,0,0,Bt,Ct,Q)):e.texImage2D(s.TEXTURE_2D,0,xt,Bt,Ct,Q);b(_,jt)&&v(nt),gt.__version=it.version,_.onUpdate&&_.onUpdate(_)}w.__version=_.version}function vt(w,_,B){if(_.image.length!==6)return;let nt=J(w,_),j=_.source;e.bindTexture(s.TEXTURE_CUBE_MAP,w.__webglTexture,s.TEXTURE0+B);let it=n.get(j);if(j.version!==it.__version||nt===!0){e.activeTexture(s.TEXTURE0+B);let gt=ie.getPrimaries(ie.workingColorSpace),at=_.colorSpace===un?null:ie.getPrimaries(_.colorSpace),ft=_.colorSpace===un||gt===at?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,_.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,_.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,_.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,ft);let Mt=_.isCompressedTexture||_.image[0].isCompressedTexture,Nt=_.image[0]&&_.image[0].isDataTexture,Q=[];for(let st=0;st<6;st++)!Mt&&!Nt?Q[st]=y(_.image[st],!1,!0,i.maxCubemapSize):Q[st]=Nt?_.image[st].image:_.image[st],Q[st]=Lt(_,Q[st]);let jt=Q[0],Bt=m(jt)||o,Ct=r.convert(_.format,_.colorSpace),xt=r.convert(_.type),pt=E(_.internalFormat,Ct,xt,_.colorSpace),Dt=o&&_.isVideoTexture!==!0,Kt=it.__version===void 0||nt===!0,Qt=C(_,jt,Bt);$(s.TEXTURE_CUBE_MAP,_,Bt);let kt;if(Mt){Dt&&Kt&&e.texStorage2D(s.TEXTURE_CUBE_MAP,Qt,pt,jt.width,jt.height);for(let st=0;st<6;st++){kt=Q[st].mipmaps;for(let P=0;P<kt.length;P++){let ot=kt[P];_.format!==vn?Ct!==null?Dt?e.compressedTexSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,P,0,0,ot.width,ot.height,Ct,ot.data):e.compressedTexImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,P,pt,ot.width,ot.height,0,ot.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):Dt?e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,P,0,0,ot.width,ot.height,Ct,xt,ot.data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,P,pt,ot.width,ot.height,0,Ct,xt,ot.data)}}}else{kt=_.mipmaps,Dt&&Kt&&(kt.length>0&&Qt++,e.texStorage2D(s.TEXTURE_CUBE_MAP,Qt,pt,Q[0].width,Q[0].height));for(let st=0;st<6;st++)if(Nt){Dt?e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,0,0,0,Q[st].width,Q[st].height,Ct,xt,Q[st].data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,0,pt,Q[st].width,Q[st].height,0,Ct,xt,Q[st].data);for(let P=0;P<kt.length;P++){let lt=kt[P].image[st].image;Dt?e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,P+1,0,0,lt.width,lt.height,Ct,xt,lt.data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,P+1,pt,lt.width,lt.height,0,Ct,xt,lt.data)}}else{Dt?e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,0,0,0,Ct,xt,Q[st]):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,0,pt,Ct,xt,Q[st]);for(let P=0;P<kt.length;P++){let ot=kt[P];Dt?e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,P+1,0,0,Ct,xt,ot.image[st]):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,P+1,pt,Ct,xt,ot.image[st])}}}b(_,Bt)&&v(s.TEXTURE_CUBE_MAP),it.__version=j.version,_.onUpdate&&_.onUpdate(_)}w.__version=_.version}function yt(w,_,B,nt,j,it){let gt=r.convert(B.format,B.colorSpace),at=r.convert(B.type),ft=E(B.internalFormat,gt,at,B.colorSpace);if(!n.get(_).__hasExternalTextures){let Nt=Math.max(1,_.width>>it),Q=Math.max(1,_.height>>it);j===s.TEXTURE_3D||j===s.TEXTURE_2D_ARRAY?e.texImage3D(j,it,ft,Nt,Q,_.depth,0,gt,at,null):e.texImage2D(j,it,ft,Nt,Q,0,gt,at,null)}e.bindFramebuffer(s.FRAMEBUFFER,w),mt(_)?l.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,nt,j,n.get(B).__webglTexture,0,At(_)):(j===s.TEXTURE_2D||j>=s.TEXTURE_CUBE_MAP_POSITIVE_X&&j<=s.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&s.framebufferTexture2D(s.FRAMEBUFFER,nt,j,n.get(B).__webglTexture,it),e.bindFramebuffer(s.FRAMEBUFFER,null)}function It(w,_,B){if(s.bindRenderbuffer(s.RENDERBUFFER,w),_.depthBuffer&&!_.stencilBuffer){let nt=o===!0?s.DEPTH_COMPONENT24:s.DEPTH_COMPONENT16;if(B||mt(_)){let j=_.depthTexture;j&&j.isDepthTexture&&(j.type===ni?nt=s.DEPTH_COMPONENT32F:j.type===ei&&(nt=s.DEPTH_COMPONENT24));let it=At(_);mt(_)?l.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,it,nt,_.width,_.height):s.renderbufferStorageMultisample(s.RENDERBUFFER,it,nt,_.width,_.height)}else s.renderbufferStorage(s.RENDERBUFFER,nt,_.width,_.height);s.framebufferRenderbuffer(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.RENDERBUFFER,w)}else if(_.depthBuffer&&_.stencilBuffer){let nt=At(_);B&&mt(_)===!1?s.renderbufferStorageMultisample(s.RENDERBUFFER,nt,s.DEPTH24_STENCIL8,_.width,_.height):mt(_)?l.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,nt,s.DEPTH24_STENCIL8,_.width,_.height):s.renderbufferStorage(s.RENDERBUFFER,s.DEPTH_STENCIL,_.width,_.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.RENDERBUFFER,w)}else{let nt=_.isWebGLMultipleRenderTargets===!0?_.texture:[_.texture];for(let j=0;j<nt.length;j++){let it=nt[j],gt=r.convert(it.format,it.colorSpace),at=r.convert(it.type),ft=E(it.internalFormat,gt,at,it.colorSpace),Mt=At(_);B&&mt(_)===!1?s.renderbufferStorageMultisample(s.RENDERBUFFER,Mt,ft,_.width,_.height):mt(_)?l.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,Mt,ft,_.width,_.height):s.renderbufferStorage(s.RENDERBUFFER,ft,_.width,_.height)}}s.bindRenderbuffer(s.RENDERBUFFER,null)}function Pt(w,_){if(_&&_.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(e.bindFramebuffer(s.FRAMEBUFFER,w),!(_.depthTexture&&_.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");(!n.get(_.depthTexture).__webglTexture||_.depthTexture.image.width!==_.width||_.depthTexture.image.height!==_.height)&&(_.depthTexture.image.width=_.width,_.depthTexture.image.height=_.height,_.depthTexture.needsUpdate=!0),q(_.depthTexture,0);let nt=n.get(_.depthTexture).__webglTexture,j=At(_);if(_.depthTexture.format===Mi)mt(_)?l.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,nt,0,j):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,nt,0);else if(_.depthTexture.format===hs)mt(_)?l.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,nt,0,j):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,nt,0);else throw new Error("Unknown depthTexture format")}function St(w){let _=n.get(w),B=w.isWebGLCubeRenderTarget===!0;if(w.depthTexture&&!_.__autoAllocateDepthBuffer){if(B)throw new Error("target.depthTexture not supported in Cube render targets");Pt(_.__webglFramebuffer,w)}else if(B){_.__webglDepthbuffer=[];for(let nt=0;nt<6;nt++)e.bindFramebuffer(s.FRAMEBUFFER,_.__webglFramebuffer[nt]),_.__webglDepthbuffer[nt]=s.createRenderbuffer(),It(_.__webglDepthbuffer[nt],w,!1)}else e.bindFramebuffer(s.FRAMEBUFFER,_.__webglFramebuffer),_.__webglDepthbuffer=s.createRenderbuffer(),It(_.__webglDepthbuffer,w,!1);e.bindFramebuffer(s.FRAMEBUFFER,null)}function $t(w,_,B){let nt=n.get(w);_!==void 0&&yt(nt.__webglFramebuffer,w,w.texture,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,0),B!==void 0&&St(w)}function H(w){let _=w.texture,B=n.get(w),nt=n.get(_);w.addEventListener("dispose",X),w.isWebGLMultipleRenderTargets!==!0&&(nt.__webglTexture===void 0&&(nt.__webglTexture=s.createTexture()),nt.__version=_.version,a.memory.textures++);let j=w.isWebGLCubeRenderTarget===!0,it=w.isWebGLMultipleRenderTargets===!0,gt=m(w)||o;if(j){B.__webglFramebuffer=[];for(let at=0;at<6;at++)if(o&&_.mipmaps&&_.mipmaps.length>0){B.__webglFramebuffer[at]=[];for(let ft=0;ft<_.mipmaps.length;ft++)B.__webglFramebuffer[at][ft]=s.createFramebuffer()}else B.__webglFramebuffer[at]=s.createFramebuffer()}else{if(o&&_.mipmaps&&_.mipmaps.length>0){B.__webglFramebuffer=[];for(let at=0;at<_.mipmaps.length;at++)B.__webglFramebuffer[at]=s.createFramebuffer()}else B.__webglFramebuffer=s.createFramebuffer();if(it)if(i.drawBuffers){let at=w.texture;for(let ft=0,Mt=at.length;ft<Mt;ft++){let Nt=n.get(at[ft]);Nt.__webglTexture===void 0&&(Nt.__webglTexture=s.createTexture(),a.memory.textures++)}}else console.warn("THREE.WebGLRenderer: WebGLMultipleRenderTargets can only be used with WebGL2 or WEBGL_draw_buffers extension.");if(o&&w.samples>0&&mt(w)===!1){let at=it?_:[_];B.__webglMultisampledFramebuffer=s.createFramebuffer(),B.__webglColorRenderbuffer=[],e.bindFramebuffer(s.FRAMEBUFFER,B.__webglMultisampledFramebuffer);for(let ft=0;ft<at.length;ft++){let Mt=at[ft];B.__webglColorRenderbuffer[ft]=s.createRenderbuffer(),s.bindRenderbuffer(s.RENDERBUFFER,B.__webglColorRenderbuffer[ft]);let Nt=r.convert(Mt.format,Mt.colorSpace),Q=r.convert(Mt.type),jt=E(Mt.internalFormat,Nt,Q,Mt.colorSpace,w.isXRRenderTarget===!0),Bt=At(w);s.renderbufferStorageMultisample(s.RENDERBUFFER,Bt,jt,w.width,w.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+ft,s.RENDERBUFFER,B.__webglColorRenderbuffer[ft])}s.bindRenderbuffer(s.RENDERBUFFER,null),w.depthBuffer&&(B.__webglDepthRenderbuffer=s.createRenderbuffer(),It(B.__webglDepthRenderbuffer,w,!0)),e.bindFramebuffer(s.FRAMEBUFFER,null)}}if(j){e.bindTexture(s.TEXTURE_CUBE_MAP,nt.__webglTexture),$(s.TEXTURE_CUBE_MAP,_,gt);for(let at=0;at<6;at++)if(o&&_.mipmaps&&_.mipmaps.length>0)for(let ft=0;ft<_.mipmaps.length;ft++)yt(B.__webglFramebuffer[at][ft],w,_,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+at,ft);else yt(B.__webglFramebuffer[at],w,_,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+at,0);b(_,gt)&&v(s.TEXTURE_CUBE_MAP),e.unbindTexture()}else if(it){let at=w.texture;for(let ft=0,Mt=at.length;ft<Mt;ft++){let Nt=at[ft],Q=n.get(Nt);e.bindTexture(s.TEXTURE_2D,Q.__webglTexture),$(s.TEXTURE_2D,Nt,gt),yt(B.__webglFramebuffer,w,Nt,s.COLOR_ATTACHMENT0+ft,s.TEXTURE_2D,0),b(Nt,gt)&&v(s.TEXTURE_2D)}e.unbindTexture()}else{let at=s.TEXTURE_2D;if((w.isWebGL3DRenderTarget||w.isWebGLArrayRenderTarget)&&(o?at=w.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY:console.error("THREE.WebGLTextures: THREE.Data3DTexture and THREE.DataArrayTexture only supported with WebGL2.")),e.bindTexture(at,nt.__webglTexture),$(at,_,gt),o&&_.mipmaps&&_.mipmaps.length>0)for(let ft=0;ft<_.mipmaps.length;ft++)yt(B.__webglFramebuffer[ft],w,_,s.COLOR_ATTACHMENT0,at,ft);else yt(B.__webglFramebuffer,w,_,s.COLOR_ATTACHMENT0,at,0);b(_,gt)&&v(at),e.unbindTexture()}w.depthBuffer&&St(w)}function fe(w){let _=m(w)||o,B=w.isWebGLMultipleRenderTargets===!0?w.texture:[w.texture];for(let nt=0,j=B.length;nt<j;nt++){let it=B[nt];if(b(it,_)){let gt=w.isWebGLCubeRenderTarget?s.TEXTURE_CUBE_MAP:s.TEXTURE_2D,at=n.get(it).__webglTexture;e.bindTexture(gt,at),v(gt),e.unbindTexture()}}}function _t(w){if(o&&w.samples>0&&mt(w)===!1){let _=w.isWebGLMultipleRenderTargets?w.texture:[w.texture],B=w.width,nt=w.height,j=s.COLOR_BUFFER_BIT,it=[],gt=w.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,at=n.get(w),ft=w.isWebGLMultipleRenderTargets===!0;if(ft)for(let Mt=0;Mt<_.length;Mt++)e.bindFramebuffer(s.FRAMEBUFFER,at.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+Mt,s.RENDERBUFFER,null),e.bindFramebuffer(s.FRAMEBUFFER,at.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+Mt,s.TEXTURE_2D,null,0);e.bindFramebuffer(s.READ_FRAMEBUFFER,at.__webglMultisampledFramebuffer),e.bindFramebuffer(s.DRAW_FRAMEBUFFER,at.__webglFramebuffer);for(let Mt=0;Mt<_.length;Mt++){it.push(s.COLOR_ATTACHMENT0+Mt),w.depthBuffer&&it.push(gt);let Nt=at.__ignoreDepthValues!==void 0?at.__ignoreDepthValues:!1;if(Nt===!1&&(w.depthBuffer&&(j|=s.DEPTH_BUFFER_BIT),w.stencilBuffer&&(j|=s.STENCIL_BUFFER_BIT)),ft&&s.framebufferRenderbuffer(s.READ_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.RENDERBUFFER,at.__webglColorRenderbuffer[Mt]),Nt===!0&&(s.invalidateFramebuffer(s.READ_FRAMEBUFFER,[gt]),s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,[gt])),ft){let Q=n.get(_[Mt]).__webglTexture;s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,Q,0)}s.blitFramebuffer(0,0,B,nt,0,0,B,nt,j,s.NEAREST),c&&s.invalidateFramebuffer(s.READ_FRAMEBUFFER,it)}if(e.bindFramebuffer(s.READ_FRAMEBUFFER,null),e.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),ft)for(let Mt=0;Mt<_.length;Mt++){e.bindFramebuffer(s.FRAMEBUFFER,at.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+Mt,s.RENDERBUFFER,at.__webglColorRenderbuffer[Mt]);let Nt=n.get(_[Mt]).__webglTexture;e.bindFramebuffer(s.FRAMEBUFFER,at.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+Mt,s.TEXTURE_2D,Nt,0)}e.bindFramebuffer(s.DRAW_FRAMEBUFFER,at.__webglMultisampledFramebuffer)}}function At(w){return Math.min(i.maxSamples,w.samples)}function mt(w){let _=n.get(w);return o&&w.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&_.__useRenderToTexture!==!1}function te(w){let _=a.render.frame;h.get(w)!==_&&(h.set(w,_),w.update())}function Lt(w,_){let B=w.colorSpace,nt=w.format,j=w.type;return w.isCompressedTexture===!0||w.isVideoTexture===!0||w.format===Eo||B!==zn&&B!==un&&(ie.getTransfer(B)===le?o===!1?t.has("EXT_sRGB")===!0&&nt===vn?(w.format=Eo,w.minFilter=hn,w.generateMipmaps=!1):_=Gr.sRGBToLinear(_):(nt!==vn||j!==ai)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",B)),_}this.allocateTextureUnit=L,this.resetTextureUnits=K,this.setTexture2D=q,this.setTexture2DArray=Z,this.setTexture3D=W,this.setTextureCube=U,this.rebindTextures=$t,this.setupRenderTarget=H,this.updateRenderTargetMipmap=fe,this.updateMultisampleRenderTarget=_t,this.setupDepthRenderbuffer=St,this.setupFrameBufferTexture=yt,this.useMultisampledRTT=mt}function Xy(s,t,e){let n=e.isWebGL2;function i(r,a=un){let o,l=ie.getTransfer(a);if(r===ai)return s.UNSIGNED_BYTE;if(r===Eh)return s.UNSIGNED_SHORT_4_4_4_4;if(r===Th)return s.UNSIGNED_SHORT_5_5_5_1;if(r===Nd)return s.BYTE;if(r===Od)return s.SHORT;if(r===rl)return s.UNSIGNED_SHORT;if(r===wh)return s.INT;if(r===ei)return s.UNSIGNED_INT;if(r===ni)return s.FLOAT;if(r===Fs)return n?s.HALF_FLOAT:(o=t.get("OES_texture_half_float"),o!==null?o.HALF_FLOAT_OES:null);if(r===Bd)return s.ALPHA;if(r===vn)return s.RGBA;if(r===Hd)return s.LUMINANCE;if(r===zd)return s.LUMINANCE_ALPHA;if(r===Mi)return s.DEPTH_COMPONENT;if(r===hs)return s.DEPTH_STENCIL;if(r===Eo)return o=t.get("EXT_sRGB"),o!==null?o.SRGB_ALPHA_EXT:null;if(r===Vd)return s.RED;if(r===Ah)return s.RED_INTEGER;if(r===Gd)return s.RG;if(r===Ch)return s.RG_INTEGER;if(r===Rh)return s.RGBA_INTEGER;if(r===za||r===Va||r===Ga||r===Wa)if(l===le)if(o=t.get("WEBGL_compressed_texture_s3tc_srgb"),o!==null){if(r===za)return o.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(r===Va)return o.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(r===Ga)return o.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(r===Wa)return o.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(o=t.get("WEBGL_compressed_texture_s3tc"),o!==null){if(r===za)return o.COMPRESSED_RGB_S3TC_DXT1_EXT;if(r===Va)return o.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(r===Ga)return o.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(r===Wa)return o.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(r===jl||r===Kl||r===Ql||r===tc)if(o=t.get("WEBGL_compressed_texture_pvrtc"),o!==null){if(r===jl)return o.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(r===Kl)return o.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(r===Ql)return o.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(r===tc)return o.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(r===Ph)return o=t.get("WEBGL_compressed_texture_etc1"),o!==null?o.COMPRESSED_RGB_ETC1_WEBGL:null;if(r===ec||r===nc)if(o=t.get("WEBGL_compressed_texture_etc"),o!==null){if(r===ec)return l===le?o.COMPRESSED_SRGB8_ETC2:o.COMPRESSED_RGB8_ETC2;if(r===nc)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:o.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(r===ic||r===sc||r===rc||r===ac||r===oc||r===lc||r===cc||r===hc||r===uc||r===dc||r===fc||r===pc||r===mc||r===gc)if(o=t.get("WEBGL_compressed_texture_astc"),o!==null){if(r===ic)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:o.COMPRESSED_RGBA_ASTC_4x4_KHR;if(r===sc)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:o.COMPRESSED_RGBA_ASTC_5x4_KHR;if(r===rc)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:o.COMPRESSED_RGBA_ASTC_5x5_KHR;if(r===ac)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:o.COMPRESSED_RGBA_ASTC_6x5_KHR;if(r===oc)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:o.COMPRESSED_RGBA_ASTC_6x6_KHR;if(r===lc)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:o.COMPRESSED_RGBA_ASTC_8x5_KHR;if(r===cc)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:o.COMPRESSED_RGBA_ASTC_8x6_KHR;if(r===hc)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:o.COMPRESSED_RGBA_ASTC_8x8_KHR;if(r===uc)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:o.COMPRESSED_RGBA_ASTC_10x5_KHR;if(r===dc)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:o.COMPRESSED_RGBA_ASTC_10x6_KHR;if(r===fc)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:o.COMPRESSED_RGBA_ASTC_10x8_KHR;if(r===pc)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:o.COMPRESSED_RGBA_ASTC_10x10_KHR;if(r===mc)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:o.COMPRESSED_RGBA_ASTC_12x10_KHR;if(r===gc)return l===le?o.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:o.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(r===$a||r===yc||r===vc)if(o=t.get("EXT_texture_compression_bptc"),o!==null){if(r===$a)return l===le?o.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:o.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(r===yc)return o.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(r===vc)return o.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(r===Wd||r===xc||r===bc||r===_c)if(o=t.get("EXT_texture_compression_rgtc"),o!==null){if(r===$a)return o.COMPRESSED_RED_RGTC1_EXT;if(r===xc)return o.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(r===bc)return o.COMPRESSED_RED_GREEN_RGTC2_EXT;if(r===_c)return o.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return r===Si?n?s.UNSIGNED_INT_24_8:(o=t.get("WEBGL_depth_texture"),o!==null?o.UNSIGNED_INT_24_8_WEBGL:null):s[r]!==void 0?s[r]:null}return{convert:i}}var zo=class extends be{constructor(t=[]){super(),this.isArrayCamera=!0,this.cameras=t}},Fe=class extends Ke{constructor(){super(),this.isGroup=!0,this.type="Group"}},qy={type:"move"},Ds=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Fe,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Fe,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new D,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new D),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Fe,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new D,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new D),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){let e=this._hand;if(e)for(let n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let i=null,r=null,a=null,o=this._targetRay,l=this._grip,c=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(c&&t.hand){a=!0;for(let y of t.hand.values()){let m=e.getJointPose(y,n),f=this._getHandJoint(c,y);m!==null&&(f.matrix.fromArray(m.transform.matrix),f.matrix.decompose(f.position,f.rotation,f.scale),f.matrixWorldNeedsUpdate=!0,f.jointRadius=m.radius),f.visible=m!==null}let h=c.joints["index-finger-tip"],u=c.joints["thumb-tip"],d=h.position.distanceTo(u.position),p=.02,g=.005;c.inputState.pinching&&d>p+g?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!c.inputState.pinching&&d<=p-g&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else l!==null&&t.gripSpace&&(r=e.getPose(t.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1));o!==null&&(i=e.getPose(t.targetRaySpace,n),i===null&&r!==null&&(i=r),i!==null&&(o.matrix.fromArray(i.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,i.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(i.linearVelocity)):o.hasLinearVelocity=!1,i.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(i.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(qy)))}return o!==null&&(o.visible=i!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){let n=new Fe;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}},Vo=class extends ci{constructor(t,e){super();let n=this,i=null,r=1,a=null,o="local-floor",l=1,c=null,h=null,u=null,d=null,p=null,g=null,y=e.getContextAttributes(),m=null,f=null,b=[],v=[],E=new Ft,C=null,T=new be;T.layers.enable(1),T.viewport=new Ie;let A=new be;A.layers.enable(2),A.viewport=new Ie;let X=[T,A],S=new zo;S.layers.enable(1),S.layers.enable(2);let x=null,I=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function($){let J=b[$];return J===void 0&&(J=new Ds,b[$]=J),J.getTargetRaySpace()},this.getControllerGrip=function($){let J=b[$];return J===void 0&&(J=new Ds,b[$]=J),J.getGripSpace()},this.getHand=function($){let J=b[$];return J===void 0&&(J=new Ds,b[$]=J),J.getHandSpace()};function N($){let J=v.indexOf($.inputSource);if(J===-1)return;let ut=b[J];ut!==void 0&&(ut.update($.inputSource,$.frame,c||a),ut.dispatchEvent({type:$.type,data:$.inputSource}))}function K(){i.removeEventListener("select",N),i.removeEventListener("selectstart",N),i.removeEventListener("selectend",N),i.removeEventListener("squeeze",N),i.removeEventListener("squeezestart",N),i.removeEventListener("squeezeend",N),i.removeEventListener("end",K),i.removeEventListener("inputsourceschange",L);for(let $=0;$<b.length;$++){let J=v[$];J!==null&&(v[$]=null,b[$].disconnect(J))}x=null,I=null,t.setRenderTarget(m),p=null,d=null,u=null,i=null,f=null,ht.stop(),n.isPresenting=!1,t.setPixelRatio(C),t.setSize(E.width,E.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function($){r=$,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function($){o=$,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function($){c=$},this.getBaseLayer=function(){return d!==null?d:p},this.getBinding=function(){return u},this.getFrame=function(){return g},this.getSession=function(){return i},this.setSession=async function($){if(i=$,i!==null){if(m=t.getRenderTarget(),i.addEventListener("select",N),i.addEventListener("selectstart",N),i.addEventListener("selectend",N),i.addEventListener("squeeze",N),i.addEventListener("squeezestart",N),i.addEventListener("squeezeend",N),i.addEventListener("end",K),i.addEventListener("inputsourceschange",L),y.xrCompatible!==!0&&await e.makeXRCompatible(),C=t.getPixelRatio(),t.getSize(E),i.renderState.layers===void 0||t.capabilities.isWebGL2===!1){let J={antialias:i.renderState.layers===void 0?y.antialias:!0,alpha:!0,depth:y.depth,stencil:y.stencil,framebufferScaleFactor:r};p=new XRWebGLLayer(i,e,J),i.updateRenderState({baseLayer:p}),t.setPixelRatio(1),t.setSize(p.framebufferWidth,p.framebufferHeight,!1),f=new Vn(p.framebufferWidth,p.framebufferHeight,{format:vn,type:ai,colorSpace:t.outputColorSpace,stencilBuffer:y.stencil})}else{let J=null,ut=null,vt=null;y.depth&&(vt=y.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,J=y.stencil?hs:Mi,ut=y.stencil?Si:ei);let yt={colorFormat:e.RGBA8,depthFormat:vt,scaleFactor:r};u=new XRWebGLBinding(i,e),d=u.createProjectionLayer(yt),i.updateRenderState({layers:[d]}),t.setPixelRatio(1),t.setSize(d.textureWidth,d.textureHeight,!1),f=new Vn(d.textureWidth,d.textureHeight,{format:vn,type:ai,depthTexture:new Kr(d.textureWidth,d.textureHeight,ut,void 0,void 0,void 0,void 0,void 0,void 0,J),stencilBuffer:y.stencil,colorSpace:t.outputColorSpace,samples:y.antialias?4:0});let It=t.properties.get(f);It.__ignoreDepthValues=d.ignoreDepthValues}f.isXRRenderTarget=!0,this.setFoveation(l),c=null,a=await i.requestReferenceSpace(o),ht.setContext(i),ht.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode};function L($){for(let J=0;J<$.removed.length;J++){let ut=$.removed[J],vt=v.indexOf(ut);vt>=0&&(v[vt]=null,b[vt].disconnect(ut))}for(let J=0;J<$.added.length;J++){let ut=$.added[J],vt=v.indexOf(ut);if(vt===-1){for(let It=0;It<b.length;It++)if(It>=v.length){v.push(ut),vt=It;break}else if(v[It]===null){v[It]=ut,vt=It;break}if(vt===-1)break}let yt=b[vt];yt&&yt.connect(ut)}}let O=new D,q=new D;function Z($,J,ut){O.setFromMatrixPosition(J.matrixWorld),q.setFromMatrixPosition(ut.matrixWorld);let vt=O.distanceTo(q),yt=J.projectionMatrix.elements,It=ut.projectionMatrix.elements,Pt=yt[14]/(yt[10]-1),St=yt[14]/(yt[10]+1),$t=(yt[9]+1)/yt[5],H=(yt[9]-1)/yt[5],fe=(yt[8]-1)/yt[0],_t=(It[8]+1)/It[0],At=Pt*fe,mt=Pt*_t,te=vt/(-fe+_t),Lt=te*-fe;J.matrixWorld.decompose($.position,$.quaternion,$.scale),$.translateX(Lt),$.translateZ(te),$.matrixWorld.compose($.position,$.quaternion,$.scale),$.matrixWorldInverse.copy($.matrixWorld).invert();let w=Pt+te,_=St+te,B=At-Lt,nt=mt+(vt-Lt),j=$t*St/_*w,it=H*St/_*w;$.projectionMatrix.makePerspective(B,nt,j,it,w,_),$.projectionMatrixInverse.copy($.projectionMatrix).invert()}function W($,J){J===null?$.matrixWorld.copy($.matrix):$.matrixWorld.multiplyMatrices(J.matrixWorld,$.matrix),$.matrixWorldInverse.copy($.matrixWorld).invert()}this.updateCamera=function($){if(i===null)return;S.near=A.near=T.near=$.near,S.far=A.far=T.far=$.far,(x!==S.near||I!==S.far)&&(i.updateRenderState({depthNear:S.near,depthFar:S.far}),x=S.near,I=S.far);let J=$.parent,ut=S.cameras;W(S,J);for(let vt=0;vt<ut.length;vt++)W(ut[vt],J);ut.length===2?Z(S,T,A):S.projectionMatrix.copy(T.projectionMatrix),U($,S,J)};function U($,J,ut){ut===null?$.matrix.copy(J.matrixWorld):($.matrix.copy(ut.matrixWorld),$.matrix.invert(),$.matrix.multiply(J.matrixWorld)),$.matrix.decompose($.position,$.quaternion,$.scale),$.updateMatrixWorld(!0),$.projectionMatrix.copy(J.projectionMatrix),$.projectionMatrixInverse.copy(J.projectionMatrixInverse),$.isPerspectiveCamera&&($.fov=To*2*Math.atan(1/$.projectionMatrix.elements[5]),$.zoom=1)}this.getCamera=function(){return S},this.getFoveation=function(){if(!(d===null&&p===null))return l},this.setFoveation=function($){l=$,d!==null&&(d.fixedFoveation=$),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=$)};let Y=null;function et($,J){if(h=J.getViewerPose(c||a),g=J,h!==null){let ut=h.views;p!==null&&(t.setRenderTargetFramebuffer(f,p.framebuffer),t.setRenderTarget(f));let vt=!1;ut.length!==S.cameras.length&&(S.cameras.length=0,vt=!0);for(let yt=0;yt<ut.length;yt++){let It=ut[yt],Pt=null;if(p!==null)Pt=p.getViewport(It);else{let $t=u.getViewSubImage(d,It);Pt=$t.viewport,yt===0&&(t.setRenderTargetTextures(f,$t.colorTexture,d.ignoreDepthValues?void 0:$t.depthStencilTexture),t.setRenderTarget(f))}let St=X[yt];St===void 0&&(St=new be,St.layers.enable(yt),St.viewport=new Ie,X[yt]=St),St.matrix.fromArray(It.transform.matrix),St.matrix.decompose(St.position,St.quaternion,St.scale),St.projectionMatrix.fromArray(It.projectionMatrix),St.projectionMatrixInverse.copy(St.projectionMatrix).invert(),St.viewport.set(Pt.x,Pt.y,Pt.width,Pt.height),yt===0&&(S.matrix.copy(St.matrix),S.matrix.decompose(S.position,S.quaternion,S.scale)),vt===!0&&S.cameras.push(St)}}for(let ut=0;ut<b.length;ut++){let vt=v[ut],yt=b[ut];vt!==null&&yt!==void 0&&yt.update(vt,J,c||a)}Y&&Y($,J),J.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:J}),g=null}let ht=new Fh;ht.setAnimationLoop(et),this.setAnimationLoop=function($){Y=$},this.dispose=function(){}}};function Yy(s,t){function e(m,f){m.matrixAutoUpdate===!0&&m.updateMatrix(),f.value.copy(m.matrix)}function n(m,f){f.color.getRGB(m.fogColor.value,Uh(s)),f.isFog?(m.fogNear.value=f.near,m.fogFar.value=f.far):f.isFogExp2&&(m.fogDensity.value=f.density)}function i(m,f,b,v,E){f.isMeshBasicMaterial||f.isMeshLambertMaterial?r(m,f):f.isMeshToonMaterial?(r(m,f),u(m,f)):f.isMeshPhongMaterial?(r(m,f),h(m,f)):f.isMeshStandardMaterial?(r(m,f),d(m,f),f.isMeshPhysicalMaterial&&p(m,f,E)):f.isMeshMatcapMaterial?(r(m,f),g(m,f)):f.isMeshDepthMaterial?r(m,f):f.isMeshDistanceMaterial?(r(m,f),y(m,f)):f.isMeshNormalMaterial?r(m,f):f.isLineBasicMaterial?(a(m,f),f.isLineDashedMaterial&&o(m,f)):f.isPointsMaterial?l(m,f,b,v):f.isSpriteMaterial?c(m,f):f.isShadowMaterial?(m.color.value.copy(f.color),m.opacity.value=f.opacity):f.isShaderMaterial&&(f.uniformsNeedUpdate=!1)}function r(m,f){m.opacity.value=f.opacity,f.color&&m.diffuse.value.copy(f.color),f.emissive&&m.emissive.value.copy(f.emissive).multiplyScalar(f.emissiveIntensity),f.map&&(m.map.value=f.map,e(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,e(f.alphaMap,m.alphaMapTransform)),f.bumpMap&&(m.bumpMap.value=f.bumpMap,e(f.bumpMap,m.bumpMapTransform),m.bumpScale.value=f.bumpScale,f.side===Ze&&(m.bumpScale.value*=-1)),f.normalMap&&(m.normalMap.value=f.normalMap,e(f.normalMap,m.normalMapTransform),m.normalScale.value.copy(f.normalScale),f.side===Ze&&m.normalScale.value.negate()),f.displacementMap&&(m.displacementMap.value=f.displacementMap,e(f.displacementMap,m.displacementMapTransform),m.displacementScale.value=f.displacementScale,m.displacementBias.value=f.displacementBias),f.emissiveMap&&(m.emissiveMap.value=f.emissiveMap,e(f.emissiveMap,m.emissiveMapTransform)),f.specularMap&&(m.specularMap.value=f.specularMap,e(f.specularMap,m.specularMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest);let b=t.get(f).envMap;if(b&&(m.envMap.value=b,m.flipEnvMap.value=b.isCubeTexture&&b.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=f.reflectivity,m.ior.value=f.ior,m.refractionRatio.value=f.refractionRatio),f.lightMap){m.lightMap.value=f.lightMap;let v=s._useLegacyLights===!0?Math.PI:1;m.lightMapIntensity.value=f.lightMapIntensity*v,e(f.lightMap,m.lightMapTransform)}f.aoMap&&(m.aoMap.value=f.aoMap,m.aoMapIntensity.value=f.aoMapIntensity,e(f.aoMap,m.aoMapTransform))}function a(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,f.map&&(m.map.value=f.map,e(f.map,m.mapTransform))}function o(m,f){m.dashSize.value=f.dashSize,m.totalSize.value=f.dashSize+f.gapSize,m.scale.value=f.scale}function l(m,f,b,v){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.size.value=f.size*b,m.scale.value=v*.5,f.map&&(m.map.value=f.map,e(f.map,m.uvTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,e(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function c(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.rotation.value=f.rotation,f.map&&(m.map.value=f.map,e(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,e(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function h(m,f){m.specular.value.copy(f.specular),m.shininess.value=Math.max(f.shininess,1e-4)}function u(m,f){f.gradientMap&&(m.gradientMap.value=f.gradientMap)}function d(m,f){m.metalness.value=f.metalness,f.metalnessMap&&(m.metalnessMap.value=f.metalnessMap,e(f.metalnessMap,m.metalnessMapTransform)),m.roughness.value=f.roughness,f.roughnessMap&&(m.roughnessMap.value=f.roughnessMap,e(f.roughnessMap,m.roughnessMapTransform)),t.get(f).envMap&&(m.envMapIntensity.value=f.envMapIntensity)}function p(m,f,b){m.ior.value=f.ior,f.sheen>0&&(m.sheenColor.value.copy(f.sheenColor).multiplyScalar(f.sheen),m.sheenRoughness.value=f.sheenRoughness,f.sheenColorMap&&(m.sheenColorMap.value=f.sheenColorMap,e(f.sheenColorMap,m.sheenColorMapTransform)),f.sheenRoughnessMap&&(m.sheenRoughnessMap.value=f.sheenRoughnessMap,e(f.sheenRoughnessMap,m.sheenRoughnessMapTransform))),f.clearcoat>0&&(m.clearcoat.value=f.clearcoat,m.clearcoatRoughness.value=f.clearcoatRoughness,f.clearcoatMap&&(m.clearcoatMap.value=f.clearcoatMap,e(f.clearcoatMap,m.clearcoatMapTransform)),f.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=f.clearcoatRoughnessMap,e(f.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),f.clearcoatNormalMap&&(m.clearcoatNormalMap.value=f.clearcoatNormalMap,e(f.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(f.clearcoatNormalScale),f.side===Ze&&m.clearcoatNormalScale.value.negate())),f.iridescence>0&&(m.iridescence.value=f.iridescence,m.iridescenceIOR.value=f.iridescenceIOR,m.iridescenceThicknessMinimum.value=f.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=f.iridescenceThicknessRange[1],f.iridescenceMap&&(m.iridescenceMap.value=f.iridescenceMap,e(f.iridescenceMap,m.iridescenceMapTransform)),f.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=f.iridescenceThicknessMap,e(f.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),f.transmission>0&&(m.transmission.value=f.transmission,m.transmissionSamplerMap.value=b.texture,m.transmissionSamplerSize.value.set(b.width,b.height),f.transmissionMap&&(m.transmissionMap.value=f.transmissionMap,e(f.transmissionMap,m.transmissionMapTransform)),m.thickness.value=f.thickness,f.thicknessMap&&(m.thicknessMap.value=f.thicknessMap,e(f.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=f.attenuationDistance,m.attenuationColor.value.copy(f.attenuationColor)),f.anisotropy>0&&(m.anisotropyVector.value.set(f.anisotropy*Math.cos(f.anisotropyRotation),f.anisotropy*Math.sin(f.anisotropyRotation)),f.anisotropyMap&&(m.anisotropyMap.value=f.anisotropyMap,e(f.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=f.specularIntensity,m.specularColor.value.copy(f.specularColor),f.specularColorMap&&(m.specularColorMap.value=f.specularColorMap,e(f.specularColorMap,m.specularColorMapTransform)),f.specularIntensityMap&&(m.specularIntensityMap.value=f.specularIntensityMap,e(f.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,f){f.matcap&&(m.matcap.value=f.matcap)}function y(m,f){let b=t.get(f).light;m.referencePosition.value.setFromMatrixPosition(b.matrixWorld),m.nearDistance.value=b.shadow.camera.near,m.farDistance.value=b.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:i}}function Zy(s,t,e,n){let i={},r={},a=[],o=e.isWebGL2?s.getParameter(s.MAX_UNIFORM_BUFFER_BINDINGS):0;function l(b,v){let E=v.program;n.uniformBlockBinding(b,E)}function c(b,v){let E=i[b.id];E===void 0&&(g(b),E=h(b),i[b.id]=E,b.addEventListener("dispose",m));let C=v.program;n.updateUBOMapping(b,C);let T=t.render.frame;r[b.id]!==T&&(d(b),r[b.id]=T)}function h(b){let v=u();b.__bindingPointIndex=v;let E=s.createBuffer(),C=b.__size,T=b.usage;return s.bindBuffer(s.UNIFORM_BUFFER,E),s.bufferData(s.UNIFORM_BUFFER,C,T),s.bindBuffer(s.UNIFORM_BUFFER,null),s.bindBufferBase(s.UNIFORM_BUFFER,v,E),E}function u(){for(let b=0;b<o;b++)if(a.indexOf(b)===-1)return a.push(b),b;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function d(b){let v=i[b.id],E=b.uniforms,C=b.__cache;s.bindBuffer(s.UNIFORM_BUFFER,v);for(let T=0,A=E.length;T<A;T++){let X=Array.isArray(E[T])?E[T]:[E[T]];for(let S=0,x=X.length;S<x;S++){let I=X[S];if(p(I,T,S,C)===!0){let N=I.__offset,K=Array.isArray(I.value)?I.value:[I.value],L=0;for(let O=0;O<K.length;O++){let q=K[O],Z=y(q);typeof q=="number"||typeof q=="boolean"?(I.__data[0]=q,s.bufferSubData(s.UNIFORM_BUFFER,N+L,I.__data)):q.isMatrix3?(I.__data[0]=q.elements[0],I.__data[1]=q.elements[1],I.__data[2]=q.elements[2],I.__data[3]=0,I.__data[4]=q.elements[3],I.__data[5]=q.elements[4],I.__data[6]=q.elements[5],I.__data[7]=0,I.__data[8]=q.elements[6],I.__data[9]=q.elements[7],I.__data[10]=q.elements[8],I.__data[11]=0):(q.toArray(I.__data,L),L+=Z.storage/Float32Array.BYTES_PER_ELEMENT)}s.bufferSubData(s.UNIFORM_BUFFER,N,I.__data)}}}s.bindBuffer(s.UNIFORM_BUFFER,null)}function p(b,v,E,C){let T=b.value,A=v+"_"+E;if(C[A]===void 0)return typeof T=="number"||typeof T=="boolean"?C[A]=T:C[A]=T.clone(),!0;{let X=C[A];if(typeof T=="number"||typeof T=="boolean"){if(X!==T)return C[A]=T,!0}else if(X.equals(T)===!1)return X.copy(T),!0}return!1}function g(b){let v=b.uniforms,E=0,C=16;for(let A=0,X=v.length;A<X;A++){let S=Array.isArray(v[A])?v[A]:[v[A]];for(let x=0,I=S.length;x<I;x++){let N=S[x],K=Array.isArray(N.value)?N.value:[N.value];for(let L=0,O=K.length;L<O;L++){let q=K[L],Z=y(q),W=E%C;W!==0&&C-W<Z.boundary&&(E+=C-W),N.__data=new Float32Array(Z.storage/Float32Array.BYTES_PER_ELEMENT),N.__offset=E,E+=Z.storage}}}let T=E%C;return T>0&&(E+=C-T),b.__size=E,b.__cache={},this}function y(b){let v={boundary:0,storage:0};return typeof b=="number"||typeof b=="boolean"?(v.boundary=4,v.storage=4):b.isVector2?(v.boundary=8,v.storage=8):b.isVector3||b.isColor?(v.boundary=16,v.storage=12):b.isVector4?(v.boundary=16,v.storage=16):b.isMatrix3?(v.boundary=48,v.storage=48):b.isMatrix4?(v.boundary=64,v.storage=64):b.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",b),v}function m(b){let v=b.target;v.removeEventListener("dispose",m);let E=a.indexOf(v.__bindingPointIndex);a.splice(E,1),s.deleteBuffer(i[v.id]),delete i[v.id],delete r[v.id]}function f(){for(let b in i)s.deleteBuffer(i[b]);a=[],i={},r={}}return{bind:l,update:c,dispose:f}}var Bs=class{constructor(t={}){let{canvas:e=sf(),context:n=null,depth:i=!0,stencil:r=!0,alpha:a=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:u=!1}=t;this.isWebGLRenderer=!0;let d;n!==null?d=n.getContextAttributes().alpha:d=a;let p=new Uint32Array(4),g=new Int32Array(4),y=null,m=null,f=[],b=[];this.domElement=e,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this._outputColorSpace=Zt,this._useLegacyLights=!1,this.toneMapping=ri,this.toneMappingExposure=1;let v=this,E=!1,C=0,T=0,A=null,X=-1,S=null,x=new Ie,I=new Ie,N=null,K=new Vt(0),L=0,O=e.width,q=e.height,Z=1,W=null,U=null,Y=new Ie(0,0,O,q),et=new Ie(0,0,O,q),ht=!1,$=new Jr,J=!1,ut=!1,vt=null,yt=new _e,It=new Ft,Pt=new D,St={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};function $t(){return A===null?Z:1}let H=n;function fe(M,F){for(let V=0;V<M.length;V++){let G=M[V],z=e.getContext(G,F);if(z!==null)return z}return null}try{let M={alpha:!0,depth:i,stencil:r,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:u};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${sl}`),e.addEventListener("webglcontextlost",st,!1),e.addEventListener("webglcontextrestored",P,!1),e.addEventListener("webglcontextcreationerror",ot,!1),H===null){let F=["webgl2","webgl","experimental-webgl"];if(v.isWebGL1Renderer===!0&&F.shift(),H=fe(F,M),H===null)throw fe(F)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}typeof WebGLRenderingContext<"u"&&H instanceof WebGLRenderingContext&&console.warn("THREE.WebGLRenderer: WebGL 1 support was deprecated in r153 and will be removed in r163."),H.getShaderPrecisionFormat===void 0&&(H.getShaderPrecisionFormat=function(){return{rangeMin:1,rangeMax:1,precision:1}})}catch(M){throw console.error("THREE.WebGLRenderer: "+M.message),M}let _t,At,mt,te,Lt,w,_,B,nt,j,it,gt,at,ft,Mt,Nt,Q,jt,Bt,Ct,xt,pt,Dt,Kt;function Qt(){_t=new pg(H),At=new lg(H,_t,t),_t.init(At),pt=new Xy(H,_t,At),mt=new Wy(H,_t,At),te=new yg(H),Lt=new Ly,w=new $y(H,_t,mt,Lt,At,pt,te),_=new hg(v),B=new fg(v),nt=new Ef(H,At),Dt=new ag(H,_t,nt,At),j=new mg(H,nt,te,Dt),it=new _g(H,j,nt,te),Bt=new bg(H,At,w),Nt=new cg(Lt),gt=new Iy(v,_,B,_t,At,Dt,Nt),at=new Yy(v,Lt),ft=new ky,Mt=new Hy(_t,At),jt=new rg(v,_,B,mt,it,d,l),Q=new Gy(v,it,At),Kt=new Zy(H,te,At,mt),Ct=new og(H,_t,te,At),xt=new gg(H,_t,te,At),te.programs=gt.programs,v.capabilities=At,v.extensions=_t,v.properties=Lt,v.renderLists=ft,v.shadowMap=Q,v.state=mt,v.info=te}Qt();let kt=new Vo(v,H);this.xr=kt,this.getContext=function(){return H},this.getContextAttributes=function(){return H.getContextAttributes()},this.forceContextLoss=function(){let M=_t.get("WEBGL_lose_context");M&&M.loseContext()},this.forceContextRestore=function(){let M=_t.get("WEBGL_lose_context");M&&M.restoreContext()},this.getPixelRatio=function(){return Z},this.setPixelRatio=function(M){M!==void 0&&(Z=M,this.setSize(O,q,!1))},this.getSize=function(M){return M.set(O,q)},this.setSize=function(M,F,V=!0){if(kt.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}O=M,q=F,e.width=Math.floor(M*Z),e.height=Math.floor(F*Z),V===!0&&(e.style.width=M+"px",e.style.height=F+"px"),this.setViewport(0,0,M,F)},this.getDrawingBufferSize=function(M){return M.set(O*Z,q*Z).floor()},this.setDrawingBufferSize=function(M,F,V){O=M,q=F,Z=V,e.width=Math.floor(M*V),e.height=Math.floor(F*V),this.setViewport(0,0,M,F)},this.getCurrentViewport=function(M){return M.copy(x)},this.getViewport=function(M){return M.copy(Y)},this.setViewport=function(M,F,V,G){M.isVector4?Y.set(M.x,M.y,M.z,M.w):Y.set(M,F,V,G),mt.viewport(x.copy(Y).multiplyScalar(Z).floor())},this.getScissor=function(M){return M.copy(et)},this.setScissor=function(M,F,V,G){M.isVector4?et.set(M.x,M.y,M.z,M.w):et.set(M,F,V,G),mt.scissor(I.copy(et).multiplyScalar(Z).floor())},this.getScissorTest=function(){return ht},this.setScissorTest=function(M){mt.setScissorTest(ht=M)},this.setOpaqueSort=function(M){W=M},this.setTransparentSort=function(M){U=M},this.getClearColor=function(M){return M.copy(jt.getClearColor())},this.setClearColor=function(){jt.setClearColor.apply(jt,arguments)},this.getClearAlpha=function(){return jt.getClearAlpha()},this.setClearAlpha=function(){jt.setClearAlpha.apply(jt,arguments)},this.clear=function(M=!0,F=!0,V=!0){let G=0;if(M){let z=!1;if(A!==null){let dt=A.texture.format;z=dt===Rh||dt===Ch||dt===Ah}if(z){let dt=A.texture.type,bt=dt===ai||dt===ei||dt===rl||dt===Si||dt===Eh||dt===Th,Et=jt.getClearColor(),Rt=jt.getClearAlpha(),zt=Et.r,Ut=Et.g,Ot=Et.b;bt?(p[0]=zt,p[1]=Ut,p[2]=Ot,p[3]=Rt,H.clearBufferuiv(H.COLOR,0,p)):(g[0]=zt,g[1]=Ut,g[2]=Ot,g[3]=Rt,H.clearBufferiv(H.COLOR,0,g))}else G|=H.COLOR_BUFFER_BIT}F&&(G|=H.DEPTH_BUFFER_BIT),V&&(G|=H.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),H.clear(G)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){e.removeEventListener("webglcontextlost",st,!1),e.removeEventListener("webglcontextrestored",P,!1),e.removeEventListener("webglcontextcreationerror",ot,!1),ft.dispose(),Mt.dispose(),Lt.dispose(),_.dispose(),B.dispose(),it.dispose(),Dt.dispose(),Kt.dispose(),gt.dispose(),kt.dispose(),kt.removeEventListener("sessionstart",qt),kt.removeEventListener("sessionend",Yt),vt&&(vt.dispose(),vt=null),ae.stop()};function st(M){M.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),E=!0}function P(){console.log("THREE.WebGLRenderer: Context Restored."),E=!1;let M=te.autoReset,F=Q.enabled,V=Q.autoUpdate,G=Q.needsUpdate,z=Q.type;Qt(),te.autoReset=M,Q.enabled=F,Q.autoUpdate=V,Q.needsUpdate=G,Q.type=z}function ot(M){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",M.statusMessage)}function lt(M){let F=M.target;F.removeEventListener("dispose",lt),wt(F)}function wt(M){k(M),Lt.remove(M)}function k(M){let F=Lt.get(M).programs;F!==void 0&&(F.forEach(function(V){gt.releaseProgram(V)}),M.isShaderMaterial&&gt.releaseShaderCache(M))}this.renderBufferDirect=function(M,F,V,G,z,dt){F===null&&(F=St);let bt=z.isMesh&&z.matrixWorld.determinant()<0,Et=lu(M,F,V,G,z);mt.setMaterial(G,bt);let Rt=V.index,zt=1;if(G.wireframe===!0){if(Rt=j.getWireframeAttribute(V),Rt===void 0)return;zt=2}let Ut=V.drawRange,Ot=V.attributes.position,me=Ut.start*zt,tn=(Ut.start+Ut.count)*zt;dt!==null&&(me=Math.max(me,dt.start*zt),tn=Math.min(tn,(dt.start+dt.count)*zt)),Rt!==null?(me=Math.max(me,0),tn=Math.min(tn,Rt.count)):Ot!=null&&(me=Math.max(me,0),tn=Math.min(tn,Ot.count));let Ee=tn-me;if(Ee<0||Ee===1/0)return;Dt.setup(z,G,Et,V,Rt);let Tn,de=Ct;if(Rt!==null&&(Tn=nt.get(Rt),de=xt,de.setIndex(Tn)),z.isMesh)G.wireframe===!0?(mt.setLineWidth(G.wireframeLinewidth*$t()),de.setMode(H.LINES)):de.setMode(H.TRIANGLES);else if(z.isLine){let Gt=G.linewidth;Gt===void 0&&(Gt=1),mt.setLineWidth(Gt*$t()),z.isLineSegments?de.setMode(H.LINES):z.isLineLoop?de.setMode(H.LINE_LOOP):de.setMode(H.LINE_STRIP)}else z.isPoints?de.setMode(H.POINTS):z.isSprite&&de.setMode(H.TRIANGLES);if(z.isBatchedMesh)de.renderMultiDraw(z._multiDrawStarts,z._multiDrawCounts,z._multiDrawCount);else if(z.isInstancedMesh)de.renderInstances(me,Ee,z.count);else if(V.isInstancedBufferGeometry){let Gt=V._maxInstanceCount!==void 0?V._maxInstanceCount:1/0,Ma=Math.min(V.instanceCount,Gt);de.renderInstances(me,Ee,Ma)}else de.render(me,Ee)};function tt(M,F,V){M.transparent===!0&&M.side===We&&M.forceSinglePass===!1?(M.side=Ze,M.needsUpdate=!0,En(M,F,V),M.side=li,M.needsUpdate=!0,En(M,F,V),M.side=We):En(M,F,V)}this.compile=function(M,F,V=null){V===null&&(V=M),m=Mt.get(V),m.init(),b.push(m),V.traverseVisible(function(z){z.isLight&&z.layers.test(F.layers)&&(m.pushLight(z),z.castShadow&&m.pushShadow(z))}),M!==V&&M.traverseVisible(function(z){z.isLight&&z.layers.test(F.layers)&&(m.pushLight(z),z.castShadow&&m.pushShadow(z))}),m.setupLights(v._useLegacyLights);let G=new Set;return M.traverse(function(z){let dt=z.material;if(dt)if(Array.isArray(dt))for(let bt=0;bt<dt.length;bt++){let Et=dt[bt];tt(Et,V,z),G.add(Et)}else tt(dt,V,z),G.add(dt)}),b.pop(),m=null,G},this.compileAsync=function(M,F,V=null){let G=this.compile(M,F,V);return new Promise(z=>{function dt(){if(G.forEach(function(bt){Lt.get(bt).currentProgram.isReady()&&G.delete(bt)}),G.size===0){z(M);return}setTimeout(dt,10)}_t.get("KHR_parallel_shader_compile")!==null?dt():setTimeout(dt,10)})};let ct=null;function Xt(M){ct&&ct(M)}function qt(){ae.stop()}function Yt(){ae.start()}let ae=new Fh;ae.setAnimationLoop(Xt),typeof self<"u"&&ae.setContext(self),this.setAnimationLoop=function(M){ct=M,kt.setAnimationLoop(M),M===null?ae.stop():ae.start()},kt.addEventListener("sessionstart",qt),kt.addEventListener("sessionend",Yt),this.render=function(M,F){if(F!==void 0&&F.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(E===!0)return;M.matrixWorldAutoUpdate===!0&&M.updateMatrixWorld(),F.parent===null&&F.matrixWorldAutoUpdate===!0&&F.updateMatrixWorld(),kt.enabled===!0&&kt.isPresenting===!0&&(kt.cameraAutoUpdate===!0&&kt.updateCamera(F),F=kt.getCamera()),M.isScene===!0&&M.onBeforeRender(v,M,F,A),m=Mt.get(M,b.length),m.init(),b.push(m),yt.multiplyMatrices(F.projectionMatrix,F.matrixWorldInverse),$.setFromProjectionMatrix(yt),ut=this.localClippingEnabled,J=Nt.init(this.clippingPlanes,ut),y=ft.get(M,f.length),y.init(),f.push(y),Be(M,F,0,v.sortObjects),y.finish(),v.sortObjects===!0&&y.sort(W,U),this.info.render.frame++,J===!0&&Nt.beginShadows();let V=m.state.shadowsArray;if(Q.render(V,M,F),J===!0&&Nt.endShadows(),this.info.autoReset===!0&&this.info.reset(),jt.render(y,M),m.setupLights(v._useLegacyLights),F.isArrayCamera){let G=F.cameras;for(let z=0,dt=G.length;z<dt;z++){let bt=G[z];Ri(y,M,bt,bt.viewport)}}else Ri(y,M,F);A!==null&&(w.updateMultisampleRenderTarget(A),w.updateRenderTargetMipmap(A)),M.isScene===!0&&M.onAfterRender(v,M,F),Dt.resetDefaultState(),X=-1,S=null,b.pop(),b.length>0?m=b[b.length-1]:m=null,f.pop(),f.length>0?y=f[f.length-1]:y=null};function Be(M,F,V,G){if(M.visible===!1)return;if(M.layers.test(F.layers)){if(M.isGroup)V=M.renderOrder;else if(M.isLOD)M.autoUpdate===!0&&M.update(F);else if(M.isLight)m.pushLight(M),M.castShadow&&m.pushShadow(M);else if(M.isSprite){if(!M.frustumCulled||$.intersectsSprite(M)){G&&Pt.setFromMatrixPosition(M.matrixWorld).applyMatrix4(yt);let bt=it.update(M),Et=M.material;Et.visible&&y.push(M,bt,Et,V,Pt.z,null)}}else if((M.isMesh||M.isLine||M.isPoints)&&(!M.frustumCulled||$.intersectsObject(M))){let bt=it.update(M),Et=M.material;if(G&&(M.boundingSphere!==void 0?(M.boundingSphere===null&&M.computeBoundingSphere(),Pt.copy(M.boundingSphere.center)):(bt.boundingSphere===null&&bt.computeBoundingSphere(),Pt.copy(bt.boundingSphere.center)),Pt.applyMatrix4(M.matrixWorld).applyMatrix4(yt)),Array.isArray(Et)){let Rt=bt.groups;for(let zt=0,Ut=Rt.length;zt<Ut;zt++){let Ot=Rt[zt],me=Et[Ot.materialIndex];me&&me.visible&&y.push(M,bt,me,V,Pt.z,Ot)}}else Et.visible&&y.push(M,bt,Et,V,Pt.z,null)}}let dt=M.children;for(let bt=0,Et=dt.length;bt<Et;bt++)Be(dt[bt],F,V,G)}function Ri(M,F,V,G){let z=M.opaque,dt=M.transmissive,bt=M.transparent;m.setupLightsView(V),J===!0&&Nt.setGlobalState(v.clippingPlanes,V),dt.length>0&&vs(z,dt,F,V),G&&mt.viewport(x.copy(G)),z.length>0&&ui(z,F,V),dt.length>0&&ui(dt,F,V),bt.length>0&&ui(bt,F,V),mt.buffers.depth.setTest(!0),mt.buffers.depth.setMask(!0),mt.buffers.color.setMask(!0),mt.setPolygonOffset(!1)}function vs(M,F,V,G){if((V.isScene===!0?V.overrideMaterial:null)!==null)return;let dt=At.isWebGL2;vt===null&&(vt=new Vn(1,1,{generateMipmaps:!0,type:_t.has("EXT_color_buffer_half_float")?Fs:ai,minFilter:Us,samples:dt?4:0})),v.getDrawingBufferSize(It),dt?vt.setSize(It.x,It.y):vt.setSize(Ao(It.x),Ao(It.y));let bt=v.getRenderTarget();v.setRenderTarget(vt),v.getClearColor(K),L=v.getClearAlpha(),L<1&&v.setClearColor(16777215,.5),v.clear();let Et=v.toneMapping;v.toneMapping=ri,ui(M,V,G),w.updateMultisampleRenderTarget(vt),w.updateRenderTargetMipmap(vt);let Rt=!1;for(let zt=0,Ut=F.length;zt<Ut;zt++){let Ot=F[zt],me=Ot.object,tn=Ot.geometry,Ee=Ot.material,Tn=Ot.group;if(Ee.side===We&&me.layers.test(G.layers)){let de=Ee.side;Ee.side=Ze,Ee.needsUpdate=!0,qs(me,V,G,tn,Ee,Tn),Ee.side=de,Ee.needsUpdate=!0,Rt=!0}}Rt===!0&&(w.updateMultisampleRenderTarget(vt),w.updateRenderTargetMipmap(vt)),v.setRenderTarget(bt),v.setClearColor(K,L),v.toneMapping=Et}function ui(M,F,V){let G=F.isScene===!0?F.overrideMaterial:null;for(let z=0,dt=M.length;z<dt;z++){let bt=M[z],Et=bt.object,Rt=bt.geometry,zt=G===null?bt.material:G,Ut=bt.group;Et.layers.test(V.layers)&&qs(Et,F,V,Rt,zt,Ut)}}function qs(M,F,V,G,z,dt){M.onBeforeRender(v,F,V,G,z,dt),M.modelViewMatrix.multiplyMatrices(V.matrixWorldInverse,M.matrixWorld),M.normalMatrix.getNormalMatrix(M.modelViewMatrix),z.onBeforeRender(v,F,V,G,M,dt),z.transparent===!0&&z.side===We&&z.forceSinglePass===!1?(z.side=Ze,z.needsUpdate=!0,v.renderBufferDirect(V,F,G,z,M,dt),z.side=li,z.needsUpdate=!0,v.renderBufferDirect(V,F,G,z,M,dt),z.side=We):v.renderBufferDirect(V,F,G,z,M,dt),M.onAfterRender(v,F,V,G,z,dt)}function En(M,F,V){F.isScene!==!0&&(F=St);let G=Lt.get(M),z=m.state.lights,dt=m.state.shadowsArray,bt=z.state.version,Et=gt.getParameters(M,z.state,dt,F,V),Rt=gt.getProgramCacheKey(Et),zt=G.programs;G.environment=M.isMeshStandardMaterial?F.environment:null,G.fog=F.fog,G.envMap=(M.isMeshStandardMaterial?B:_).get(M.envMap||G.environment),zt===void 0&&(M.addEventListener("dispose",lt),zt=new Map,G.programs=zt);let Ut=zt.get(Rt);if(Ut!==void 0){if(G.currentProgram===Ut&&G.lightsStateVersion===bt)return gl(M,Et),Ut}else Et.uniforms=gt.getUniforms(M),M.onBuild(V,Et,v),M.onBeforeCompile(Et,v),Ut=gt.acquireProgram(Et,Rt),zt.set(Rt,Ut),G.uniforms=Et.uniforms;let Ot=G.uniforms;return(!M.isShaderMaterial&&!M.isRawShaderMaterial||M.clipping===!0)&&(Ot.clippingPlanes=Nt.uniform),gl(M,Et),G.needsLights=hu(M),G.lightsStateVersion=bt,G.needsLights&&(Ot.ambientLightColor.value=z.state.ambient,Ot.lightProbe.value=z.state.probe,Ot.directionalLights.value=z.state.directional,Ot.directionalLightShadows.value=z.state.directionalShadow,Ot.spotLights.value=z.state.spot,Ot.spotLightShadows.value=z.state.spotShadow,Ot.rectAreaLights.value=z.state.rectArea,Ot.ltc_1.value=z.state.rectAreaLTC1,Ot.ltc_2.value=z.state.rectAreaLTC2,Ot.pointLights.value=z.state.point,Ot.pointLightShadows.value=z.state.pointShadow,Ot.hemisphereLights.value=z.state.hemi,Ot.directionalShadowMap.value=z.state.directionalShadowMap,Ot.directionalShadowMatrix.value=z.state.directionalShadowMatrix,Ot.spotShadowMap.value=z.state.spotShadowMap,Ot.spotLightMatrix.value=z.state.spotLightMatrix,Ot.spotLightMap.value=z.state.spotLightMap,Ot.pointShadowMap.value=z.state.pointShadowMap,Ot.pointShadowMatrix.value=z.state.pointShadowMatrix),G.currentProgram=Ut,G.uniformsList=null,Ut}function ml(M){if(M.uniformsList===null){let F=M.currentProgram.getUniforms();M.uniformsList=as.seqWithValue(F.seq,M.uniforms)}return M.uniformsList}function gl(M,F){let V=Lt.get(M);V.outputColorSpace=F.outputColorSpace,V.batching=F.batching,V.instancing=F.instancing,V.instancingColor=F.instancingColor,V.skinning=F.skinning,V.morphTargets=F.morphTargets,V.morphNormals=F.morphNormals,V.morphColors=F.morphColors,V.morphTargetsCount=F.morphTargetsCount,V.numClippingPlanes=F.numClippingPlanes,V.numIntersection=F.numClipIntersection,V.vertexAlphas=F.vertexAlphas,V.vertexTangents=F.vertexTangents,V.toneMapping=F.toneMapping}function lu(M,F,V,G,z){F.isScene!==!0&&(F=St),w.resetTextureUnits();let dt=F.fog,bt=G.isMeshStandardMaterial?F.environment:null,Et=A===null?v.outputColorSpace:A.isXRRenderTarget===!0?A.texture.colorSpace:zn,Rt=(G.isMeshStandardMaterial?B:_).get(G.envMap||bt),zt=G.vertexColors===!0&&!!V.attributes.color&&V.attributes.color.itemSize===4,Ut=!!V.attributes.tangent&&(!!G.normalMap||G.anisotropy>0),Ot=!!V.morphAttributes.position,me=!!V.morphAttributes.normal,tn=!!V.morphAttributes.color,Ee=ri;G.toneMapped&&(A===null||A.isXRRenderTarget===!0)&&(Ee=v.toneMapping);let Tn=V.morphAttributes.position||V.morphAttributes.normal||V.morphAttributes.color,de=Tn!==void 0?Tn.length:0,Gt=Lt.get(G),Ma=m.state.lights;if(J===!0&&(ut===!0||M!==S)){let on=M===S&&G.id===X;Nt.setState(G,M,on)}let pe=!1;G.version===Gt.__version?(Gt.needsLights&&Gt.lightsStateVersion!==Ma.state.version||Gt.outputColorSpace!==Et||z.isBatchedMesh&&Gt.batching===!1||!z.isBatchedMesh&&Gt.batching===!0||z.isInstancedMesh&&Gt.instancing===!1||!z.isInstancedMesh&&Gt.instancing===!0||z.isSkinnedMesh&&Gt.skinning===!1||!z.isSkinnedMesh&&Gt.skinning===!0||z.isInstancedMesh&&Gt.instancingColor===!0&&z.instanceColor===null||z.isInstancedMesh&&Gt.instancingColor===!1&&z.instanceColor!==null||Gt.envMap!==Rt||G.fog===!0&&Gt.fog!==dt||Gt.numClippingPlanes!==void 0&&(Gt.numClippingPlanes!==Nt.numPlanes||Gt.numIntersection!==Nt.numIntersection)||Gt.vertexAlphas!==zt||Gt.vertexTangents!==Ut||Gt.morphTargets!==Ot||Gt.morphNormals!==me||Gt.morphColors!==tn||Gt.toneMapping!==Ee||At.isWebGL2===!0&&Gt.morphTargetsCount!==de)&&(pe=!0):(pe=!0,Gt.__version=G.version);let di=Gt.currentProgram;pe===!0&&(di=En(G,F,z));let yl=!1,xs=!1,wa=!1,De=di.getUniforms(),fi=Gt.uniforms;if(mt.useProgram(di.program)&&(yl=!0,xs=!0,wa=!0),G.id!==X&&(X=G.id,xs=!0),yl||S!==M){De.setValue(H,"projectionMatrix",M.projectionMatrix),De.setValue(H,"viewMatrix",M.matrixWorldInverse);let on=De.map.cameraPosition;on!==void 0&&on.setValue(H,Pt.setFromMatrixPosition(M.matrixWorld)),At.logarithmicDepthBuffer&&De.setValue(H,"logDepthBufFC",2/(Math.log(M.far+1)/Math.LN2)),(G.isMeshPhongMaterial||G.isMeshToonMaterial||G.isMeshLambertMaterial||G.isMeshBasicMaterial||G.isMeshStandardMaterial||G.isShaderMaterial)&&De.setValue(H,"isOrthographic",M.isOrthographicCamera===!0),S!==M&&(S=M,xs=!0,wa=!0)}if(z.isSkinnedMesh){De.setOptional(H,z,"bindMatrix"),De.setOptional(H,z,"bindMatrixInverse");let on=z.skeleton;on&&(At.floatVertexTextures?(on.boneTexture===null&&on.computeBoneTexture(),De.setValue(H,"boneTexture",on.boneTexture,w)):console.warn("THREE.WebGLRenderer: SkinnedMesh can only be used with WebGL 2. With WebGL 1 OES_texture_float and vertex textures support is required."))}z.isBatchedMesh&&(De.setOptional(H,z,"batchingTexture"),De.setValue(H,"batchingTexture",z._matricesTexture,w));let Ea=V.morphAttributes;if((Ea.position!==void 0||Ea.normal!==void 0||Ea.color!==void 0&&At.isWebGL2===!0)&&Bt.update(z,V,di),(xs||Gt.receiveShadow!==z.receiveShadow)&&(Gt.receiveShadow=z.receiveShadow,De.setValue(H,"receiveShadow",z.receiveShadow)),G.isMeshGouraudMaterial&&G.envMap!==null&&(fi.envMap.value=Rt,fi.flipEnvMap.value=Rt.isCubeTexture&&Rt.isRenderTargetTexture===!1?-1:1),xs&&(De.setValue(H,"toneMappingExposure",v.toneMappingExposure),Gt.needsLights&&cu(fi,wa),dt&&G.fog===!0&&at.refreshFogUniforms(fi,dt),at.refreshMaterialUniforms(fi,G,Z,q,vt),as.upload(H,ml(Gt),fi,w)),G.isShaderMaterial&&G.uniformsNeedUpdate===!0&&(as.upload(H,ml(Gt),fi,w),G.uniformsNeedUpdate=!1),G.isSpriteMaterial&&De.setValue(H,"center",z.center),De.setValue(H,"modelViewMatrix",z.modelViewMatrix),De.setValue(H,"normalMatrix",z.normalMatrix),De.setValue(H,"modelMatrix",z.matrixWorld),G.isShaderMaterial||G.isRawShaderMaterial){let on=G.uniformsGroups;for(let Ta=0,uu=on.length;Ta<uu;Ta++)if(At.isWebGL2){let vl=on[Ta];Kt.update(vl,di),Kt.bind(vl,di)}else console.warn("THREE.WebGLRenderer: Uniform Buffer Objects can only be used with WebGL 2.")}return di}function cu(M,F){M.ambientLightColor.needsUpdate=F,M.lightProbe.needsUpdate=F,M.directionalLights.needsUpdate=F,M.directionalLightShadows.needsUpdate=F,M.pointLights.needsUpdate=F,M.pointLightShadows.needsUpdate=F,M.spotLights.needsUpdate=F,M.spotLightShadows.needsUpdate=F,M.rectAreaLights.needsUpdate=F,M.hemisphereLights.needsUpdate=F}function hu(M){return M.isMeshLambertMaterial||M.isMeshToonMaterial||M.isMeshPhongMaterial||M.isMeshStandardMaterial||M.isShadowMaterial||M.isShaderMaterial&&M.lights===!0}this.getActiveCubeFace=function(){return C},this.getActiveMipmapLevel=function(){return T},this.getRenderTarget=function(){return A},this.setRenderTargetTextures=function(M,F,V){Lt.get(M.texture).__webglTexture=F,Lt.get(M.depthTexture).__webglTexture=V;let G=Lt.get(M);G.__hasExternalTextures=!0,G.__hasExternalTextures&&(G.__autoAllocateDepthBuffer=V===void 0,G.__autoAllocateDepthBuffer||_t.has("WEBGL_multisampled_render_to_texture")===!0&&(console.warn("THREE.WebGLRenderer: Render-to-texture extension was disabled because an external texture was provided"),G.__useRenderToTexture=!1))},this.setRenderTargetFramebuffer=function(M,F){let V=Lt.get(M);V.__webglFramebuffer=F,V.__useDefaultFramebuffer=F===void 0},this.setRenderTarget=function(M,F=0,V=0){A=M,C=F,T=V;let G=!0,z=null,dt=!1,bt=!1;if(M){let Rt=Lt.get(M);Rt.__useDefaultFramebuffer!==void 0?(mt.bindFramebuffer(H.FRAMEBUFFER,null),G=!1):Rt.__webglFramebuffer===void 0?w.setupRenderTarget(M):Rt.__hasExternalTextures&&w.rebindTextures(M,Lt.get(M.texture).__webglTexture,Lt.get(M.depthTexture).__webglTexture);let zt=M.texture;(zt.isData3DTexture||zt.isDataArrayTexture||zt.isCompressedArrayTexture)&&(bt=!0);let Ut=Lt.get(M).__webglFramebuffer;M.isWebGLCubeRenderTarget?(Array.isArray(Ut[F])?z=Ut[F][V]:z=Ut[F],dt=!0):At.isWebGL2&&M.samples>0&&w.useMultisampledRTT(M)===!1?z=Lt.get(M).__webglMultisampledFramebuffer:Array.isArray(Ut)?z=Ut[V]:z=Ut,x.copy(M.viewport),I.copy(M.scissor),N=M.scissorTest}else x.copy(Y).multiplyScalar(Z).floor(),I.copy(et).multiplyScalar(Z).floor(),N=ht;if(mt.bindFramebuffer(H.FRAMEBUFFER,z)&&At.drawBuffers&&G&&mt.drawBuffers(M,z),mt.viewport(x),mt.scissor(I),mt.setScissorTest(N),dt){let Rt=Lt.get(M.texture);H.framebufferTexture2D(H.FRAMEBUFFER,H.COLOR_ATTACHMENT0,H.TEXTURE_CUBE_MAP_POSITIVE_X+F,Rt.__webglTexture,V)}else if(bt){let Rt=Lt.get(M.texture),zt=F||0;H.framebufferTextureLayer(H.FRAMEBUFFER,H.COLOR_ATTACHMENT0,Rt.__webglTexture,V||0,zt)}X=-1},this.readRenderTargetPixels=function(M,F,V,G,z,dt,bt){if(!(M&&M.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Et=Lt.get(M).__webglFramebuffer;if(M.isWebGLCubeRenderTarget&&bt!==void 0&&(Et=Et[bt]),Et){mt.bindFramebuffer(H.FRAMEBUFFER,Et);try{let Rt=M.texture,zt=Rt.format,Ut=Rt.type;if(zt!==vn&&pt.convert(zt)!==H.getParameter(H.IMPLEMENTATION_COLOR_READ_FORMAT)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}let Ot=Ut===Fs&&(_t.has("EXT_color_buffer_half_float")||At.isWebGL2&&_t.has("EXT_color_buffer_float"));if(Ut!==ai&&pt.convert(Ut)!==H.getParameter(H.IMPLEMENTATION_COLOR_READ_TYPE)&&!(Ut===ni&&(At.isWebGL2||_t.has("OES_texture_float")||_t.has("WEBGL_color_buffer_float")))&&!Ot){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}F>=0&&F<=M.width-G&&V>=0&&V<=M.height-z&&H.readPixels(F,V,G,z,pt.convert(zt),pt.convert(Ut),dt)}finally{let Rt=A!==null?Lt.get(A).__webglFramebuffer:null;mt.bindFramebuffer(H.FRAMEBUFFER,Rt)}}},this.copyFramebufferToTexture=function(M,F,V=0){let G=Math.pow(2,-V),z=Math.floor(F.image.width*G),dt=Math.floor(F.image.height*G);w.setTexture2D(F,0),H.copyTexSubImage2D(H.TEXTURE_2D,V,0,0,M.x,M.y,z,dt),mt.unbindTexture()},this.copyTextureToTexture=function(M,F,V,G=0){let z=F.image.width,dt=F.image.height,bt=pt.convert(V.format),Et=pt.convert(V.type);w.setTexture2D(V,0),H.pixelStorei(H.UNPACK_FLIP_Y_WEBGL,V.flipY),H.pixelStorei(H.UNPACK_PREMULTIPLY_ALPHA_WEBGL,V.premultiplyAlpha),H.pixelStorei(H.UNPACK_ALIGNMENT,V.unpackAlignment),F.isDataTexture?H.texSubImage2D(H.TEXTURE_2D,G,M.x,M.y,z,dt,bt,Et,F.image.data):F.isCompressedTexture?H.compressedTexSubImage2D(H.TEXTURE_2D,G,M.x,M.y,F.mipmaps[0].width,F.mipmaps[0].height,bt,F.mipmaps[0].data):H.texSubImage2D(H.TEXTURE_2D,G,M.x,M.y,bt,Et,F.image),G===0&&V.generateMipmaps&&H.generateMipmap(H.TEXTURE_2D),mt.unbindTexture()},this.copyTextureToTexture3D=function(M,F,V,G,z=0){if(v.isWebGL1Renderer){console.warn("THREE.WebGLRenderer.copyTextureToTexture3D: can only be used with WebGL2.");return}let dt=M.max.x-M.min.x+1,bt=M.max.y-M.min.y+1,Et=M.max.z-M.min.z+1,Rt=pt.convert(G.format),zt=pt.convert(G.type),Ut;if(G.isData3DTexture)w.setTexture3D(G,0),Ut=H.TEXTURE_3D;else if(G.isDataArrayTexture||G.isCompressedArrayTexture)w.setTexture2DArray(G,0),Ut=H.TEXTURE_2D_ARRAY;else{console.warn("THREE.WebGLRenderer.copyTextureToTexture3D: only supports THREE.DataTexture3D and THREE.DataTexture2DArray.");return}H.pixelStorei(H.UNPACK_FLIP_Y_WEBGL,G.flipY),H.pixelStorei(H.UNPACK_PREMULTIPLY_ALPHA_WEBGL,G.premultiplyAlpha),H.pixelStorei(H.UNPACK_ALIGNMENT,G.unpackAlignment);let Ot=H.getParameter(H.UNPACK_ROW_LENGTH),me=H.getParameter(H.UNPACK_IMAGE_HEIGHT),tn=H.getParameter(H.UNPACK_SKIP_PIXELS),Ee=H.getParameter(H.UNPACK_SKIP_ROWS),Tn=H.getParameter(H.UNPACK_SKIP_IMAGES),de=V.isCompressedTexture?V.mipmaps[z]:V.image;H.pixelStorei(H.UNPACK_ROW_LENGTH,de.width),H.pixelStorei(H.UNPACK_IMAGE_HEIGHT,de.height),H.pixelStorei(H.UNPACK_SKIP_PIXELS,M.min.x),H.pixelStorei(H.UNPACK_SKIP_ROWS,M.min.y),H.pixelStorei(H.UNPACK_SKIP_IMAGES,M.min.z),V.isDataTexture||V.isData3DTexture?H.texSubImage3D(Ut,z,F.x,F.y,F.z,dt,bt,Et,Rt,zt,de.data):V.isCompressedArrayTexture?(console.warn("THREE.WebGLRenderer.copyTextureToTexture3D: untested support for compressed srcTexture."),H.compressedTexSubImage3D(Ut,z,F.x,F.y,F.z,dt,bt,Et,Rt,de.data)):H.texSubImage3D(Ut,z,F.x,F.y,F.z,dt,bt,Et,Rt,zt,de),H.pixelStorei(H.UNPACK_ROW_LENGTH,Ot),H.pixelStorei(H.UNPACK_IMAGE_HEIGHT,me),H.pixelStorei(H.UNPACK_SKIP_PIXELS,tn),H.pixelStorei(H.UNPACK_SKIP_ROWS,Ee),H.pixelStorei(H.UNPACK_SKIP_IMAGES,Tn),z===0&&G.generateMipmaps&&H.generateMipmap(Ut),mt.unbindTexture()},this.initTexture=function(M){M.isCubeTexture?w.setTextureCube(M,0):M.isData3DTexture?w.setTexture3D(M,0):M.isDataArrayTexture||M.isCompressedArrayTexture?w.setTexture2DArray(M,0):w.setTexture2D(M,0),mt.unbindTexture()},this.resetState=function(){C=0,T=0,A=null,mt.reset(),Dt.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Bn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;let e=this.getContext();e.drawingBufferColorSpace=t===al?"display-p3":"srgb",e.unpackColorSpace=ie.workingColorSpace===aa?"display-p3":"srgb"}get outputEncoding(){return console.warn("THREE.WebGLRenderer: Property .outputEncoding has been removed. Use .outputColorSpace instead."),this.outputColorSpace===Zt?wi:Ih}set outputEncoding(t){console.warn("THREE.WebGLRenderer: Property .outputEncoding has been removed. Use .outputColorSpace instead."),this.outputColorSpace=t===wi?Zt:zn}get useLegacyLights(){return console.warn("THREE.WebGLRenderer: The property .useLegacyLights has been deprecated. Migrate your lighting according to the following guide: https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733."),this._useLegacyLights}set useLegacyLights(t){console.warn("THREE.WebGLRenderer: The property .useLegacyLights has been deprecated. Migrate your lighting according to the following guide: https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733."),this._useLegacyLights=t}},Go=class extends Bs{};Go.prototype.isWebGL1Renderer=!0;var Qr=class extends Ke{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){let e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(e.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(e.object.backgroundIntensity=this.backgroundIntensity),e}},Wo=class{constructor(t,e){this.isInterleavedBuffer=!0,this.array=t,this.stride=e,this.count=t!==void 0?t.length/e:0,this.usage=wo,this._updateRange={offset:0,count:-1},this.updateRanges=[],this.version=0,this.uuid=oi()}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}get updateRange(){return console.warn("THREE.InterleavedBuffer: updateRange() is deprecated and will be removed in r169. Use addUpdateRange() instead."),this._updateRange}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.array=new t.array.constructor(t.array),this.count=t.count,this.stride=t.stride,this.usage=t.usage,this}copyAt(t,e,n){t*=this.stride,n*=e.stride;for(let i=0,r=this.stride;i<r;i++)this.array[t+i]=e.array[n+i];return this}set(t,e=0){return this.array.set(t,e),this}clone(t){t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=oi()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);let e=new this.array.constructor(t.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(e,this.stride);return n.setUsage(this.usage),n}onUpload(t){return this.onUploadCallback=t,this}toJSON(t){return t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=oi()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}},ze=new D,ta=class s{constructor(t,e,n,i=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=t,this.itemSize=e,this.offset=n,this.normalized=i}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(t){this.data.needsUpdate=t}applyMatrix4(t){for(let e=0,n=this.data.count;e<n;e++)ze.fromBufferAttribute(this,e),ze.applyMatrix4(t),this.setXYZ(e,ze.x,ze.y,ze.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)ze.fromBufferAttribute(this,e),ze.applyNormalMatrix(t),this.setXYZ(e,ze.x,ze.y,ze.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)ze.fromBufferAttribute(this,e),ze.transformDirection(t),this.setXYZ(e,ze.x,ze.y,ze.z);return this}setX(t,e){return this.normalized&&(e=re(e,this.array)),this.data.array[t*this.data.stride+this.offset]=e,this}setY(t,e){return this.normalized&&(e=re(e,this.array)),this.data.array[t*this.data.stride+this.offset+1]=e,this}setZ(t,e){return this.normalized&&(e=re(e,this.array)),this.data.array[t*this.data.stride+this.offset+2]=e,this}setW(t,e){return this.normalized&&(e=re(e,this.array)),this.data.array[t*this.data.stride+this.offset+3]=e,this}getX(t){let e=this.data.array[t*this.data.stride+this.offset];return this.normalized&&(e=On(e,this.array)),e}getY(t){let e=this.data.array[t*this.data.stride+this.offset+1];return this.normalized&&(e=On(e,this.array)),e}getZ(t){let e=this.data.array[t*this.data.stride+this.offset+2];return this.normalized&&(e=On(e,this.array)),e}getW(t){let e=this.data.array[t*this.data.stride+this.offset+3];return this.normalized&&(e=On(e,this.array)),e}setXY(t,e,n){return t=t*this.data.stride+this.offset,this.normalized&&(e=re(e,this.array),n=re(n,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this}setXYZ(t,e,n,i){return t=t*this.data.stride+this.offset,this.normalized&&(e=re(e,this.array),n=re(n,this.array),i=re(i,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this.data.array[t+2]=i,this}setXYZW(t,e,n,i,r){return t=t*this.data.stride+this.offset,this.normalized&&(e=re(e,this.array),n=re(n,this.array),i=re(i,this.array),r=re(r,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this.data.array[t+2]=i,this.data.array[t+3]=r,this}clone(t){if(t===void 0){console.log("THREE.InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");let e=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)e.push(this.data.array[i+r])}return new Ne(new this.array.constructor(e),this.itemSize,this.normalized)}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.clone(t)),new s(t.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(t){if(t===void 0){console.log("THREE.InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");let e=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)e.push(this.data.array[i+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:e,normalized:this.normalized}}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.toJSON(t)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}},fs=class extends Gn{constructor(t){super(),this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new Vt(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.alphaMap=t.alphaMap,this.rotation=t.rotation,this.sizeAttenuation=t.sizeAttenuation,this.fog=t.fog,this}},Qi,Rs=new D,ts=new D,es=new D,ns=new Ft,Ps=new Ft,Vh=new _e,Cr=new D,Is=new D,Rr=new D,uh=new Ft,vo=new Ft,dh=new Ft,Hs=class extends Ke{constructor(t=new fs){if(super(),this.isSprite=!0,this.type="Sprite",Qi===void 0){Qi=new Qe;let e=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),n=new Wo(e,5);Qi.setIndex([0,1,2,0,2,3]),Qi.setAttribute("position",new ta(n,3,0,!1)),Qi.setAttribute("uv",new ta(n,2,3,!1))}this.geometry=Qi,this.material=t,this.center=new Ft(.5,.5)}raycast(t,e){t.camera===null&&console.error('THREE.Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),ts.setFromMatrixScale(this.matrixWorld),Vh.copy(t.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(t.camera.matrixWorldInverse,this.matrixWorld),es.setFromMatrixPosition(this.modelViewMatrix),t.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&ts.multiplyScalar(-es.z);let n=this.material.rotation,i,r;n!==0&&(r=Math.cos(n),i=Math.sin(n));let a=this.center;Pr(Cr.set(-.5,-.5,0),es,a,ts,i,r),Pr(Is.set(.5,-.5,0),es,a,ts,i,r),Pr(Rr.set(.5,.5,0),es,a,ts,i,r),uh.set(0,0),vo.set(1,0),dh.set(1,1);let o=t.ray.intersectTriangle(Cr,Is,Rr,!1,Rs);if(o===null&&(Pr(Is.set(-.5,.5,0),es,a,ts,i,r),vo.set(0,1),o=t.ray.intersectTriangle(Cr,Rr,Is,!1,Rs),o===null))return;let l=t.ray.origin.distanceTo(Rs);l<t.near||l>t.far||e.push({distance:l,point:Rs.clone(),uv:_i.getInterpolation(Rs,Cr,Is,Rr,uh,vo,dh,new Ft),face:null,object:this})}copy(t,e){return super.copy(t,e),t.center!==void 0&&this.center.copy(t.center),this.material=t.material,this}};function Pr(s,t,e,n,i,r){ns.subVectors(s,e).addScalar(.5).multiply(n),i!==void 0?(Ps.x=r*ns.x-i*ns.y,Ps.y=i*ns.x+r*ns.y):Ps.copy(ns),s.copy(t),s.x+=Ps.x,s.y+=Ps.y,s.applyMatrix4(Vh)}var zs=class extends Gn{constructor(t){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new Vt(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.linewidth=t.linewidth,this.linecap=t.linecap,this.linejoin=t.linejoin,this.fog=t.fog,this}},fh=new D,ph=new D,mh=new _e,xo=new us,Ir=new Ti,$o=class extends Ke{constructor(t=new Qe,e=new zs){super(),this.isLine=!0,this.type="Line",this.geometry=t,this.material=e,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}computeLineDistances(){let t=this.geometry;if(t.index===null){let e=t.attributes.position,n=[0];for(let i=1,r=e.count;i<r;i++)fh.fromBufferAttribute(e,i-1),ph.fromBufferAttribute(e,i),n[i]=n[i-1],n[i]+=fh.distanceTo(ph);t.setAttribute("lineDistance",new Je(n,1))}else console.warn("THREE.Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}raycast(t,e){let n=this.geometry,i=this.matrixWorld,r=t.params.Line.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Ir.copy(n.boundingSphere),Ir.applyMatrix4(i),Ir.radius+=r,t.ray.intersectsSphere(Ir)===!1)return;mh.copy(i).invert(),xo.copy(t.ray).applyMatrix4(mh);let o=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=new D,h=new D,u=new D,d=new D,p=this.isLineSegments?2:1,g=n.index,m=n.attributes.position;if(g!==null){let f=Math.max(0,a.start),b=Math.min(g.count,a.start+a.count);for(let v=f,E=b-1;v<E;v+=p){let C=g.getX(v),T=g.getX(v+1);if(c.fromBufferAttribute(m,C),h.fromBufferAttribute(m,T),xo.distanceSqToSegment(c,h,d,u)>l)continue;d.applyMatrix4(this.matrixWorld);let X=t.ray.origin.distanceTo(d);X<t.near||X>t.far||e.push({distance:X,point:u.clone().applyMatrix4(this.matrixWorld),index:v,face:null,faceIndex:null,object:this})}}else{let f=Math.max(0,a.start),b=Math.min(m.count,a.start+a.count);for(let v=f,E=b-1;v<E;v+=p){if(c.fromBufferAttribute(m,v),h.fromBufferAttribute(m,v+1),xo.distanceSqToSegment(c,h,d,u)>l)continue;d.applyMatrix4(this.matrixWorld);let T=t.ray.origin.distanceTo(d);T<t.near||T>t.far||e.push({distance:T,point:u.clone().applyMatrix4(this.matrixWorld),index:v,face:null,faceIndex:null,object:this})}}}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){let o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}},gh=new D,yh=new D,ea=class extends $o{constructor(t,e){super(t,e),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let t=this.geometry;if(t.index===null){let e=t.attributes.position,n=[];for(let i=0,r=e.count;i<r;i+=2)gh.fromBufferAttribute(e,i),yh.fromBufferAttribute(e,i+1),n[i]=i===0?0:n[i-1],n[i+1]=n[i]+gh.distanceTo(yh);t.setAttribute("lineDistance",new Je(n,1))}else console.warn("THREE.LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}};var Vs=class extends Gn{constructor(t){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Vt(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.alphaMap=t.alphaMap,this.size=t.size,this.sizeAttenuation=t.sizeAttenuation,this.fog=t.fog,this}},vh=new _e,Xo=new us,Lr=new Ti,Dr=new D,na=class extends Ke{constructor(t=new Qe,e=new Vs){super(),this.isPoints=!0,this.type="Points",this.geometry=t,this.material=e,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}raycast(t,e){let n=this.geometry,i=this.matrixWorld,r=t.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Lr.copy(n.boundingSphere),Lr.applyMatrix4(i),Lr.radius+=r,t.ray.intersectsSphere(Lr)===!1)return;vh.copy(i).invert(),Xo.copy(t.ray).applyMatrix4(vh);let o=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=n.index,u=n.attributes.position;if(c!==null){let d=Math.max(0,a.start),p=Math.min(c.count,a.start+a.count);for(let g=d,y=p;g<y;g++){let m=c.getX(g);Dr.fromBufferAttribute(u,m),xh(Dr,m,l,i,t,e,this)}}else{let d=Math.max(0,a.start),p=Math.min(u.count,a.start+a.count);for(let g=d,y=p;g<y;g++)Dr.fromBufferAttribute(u,g),xh(Dr,g,l,i,t,e,this)}}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){let o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}};function xh(s,t,e,n,i,r,a){let o=Xo.distanceSqToPoint(s);if(o<e){let l=new D;Xo.closestPointToPoint(s,l),l.applyMatrix4(n);let c=i.ray.origin.distanceTo(l);if(c<i.near||c>i.far)return;r.push({distance:c,distanceToRay:Math.sqrt(o),point:l,index:t,face:null,object:a})}}var dn=class extends Re{constructor(t,e,n,i,r,a,o,l,c){super(t,e,n,i,r,a,o,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}};var ia=class s extends Qe{constructor(t=.5,e=1,n=32,i=1,r=0,a=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:t,outerRadius:e,thetaSegments:n,phiSegments:i,thetaStart:r,thetaLength:a},n=Math.max(3,n),i=Math.max(1,i);let o=[],l=[],c=[],h=[],u=t,d=(e-t)/i,p=new D,g=new Ft;for(let y=0;y<=i;y++){for(let m=0;m<=n;m++){let f=r+m/n*a;p.x=u*Math.cos(f),p.y=u*Math.sin(f),l.push(p.x,p.y,p.z),c.push(0,0,1),g.x=(p.x/e+1)/2,g.y=(p.y/e+1)/2,h.push(g.x,g.y)}u+=d}for(let y=0;y<i;y++){let m=y*(n+1);for(let f=0;f<n;f++){let b=f+m,v=b,E=b+n+1,C=b+n+2,T=b+1;o.push(v,E,T),o.push(E,C,T)}}this.setIndex(o),this.setAttribute("position",new Je(l,3)),this.setAttribute("normal",new Je(c,3)),this.setAttribute("uv",new Je(h,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new s(t.innerRadius,t.outerRadius,t.thetaSegments,t.phiSegments,t.thetaStart,t.thetaLength)}};function kr(s,t,e){return!s||!e&&s.constructor===t?s:typeof t.BYTES_PER_ELEMENT=="number"?new t(s):Array.prototype.slice.call(s)}function Jy(s){return ArrayBuffer.isView(s)&&!(s instanceof DataView)}var ps=class{constructor(t,e,n,i){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new e.constructor(n),this.sampleValues=e,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(t){let e=this.parameterPositions,n=this._cachedIndex,i=e[n],r=e[n-1];n:{t:{let a;e:{i:if(!(t<i)){for(let o=n+2;;){if(i===void 0){if(t<r)break i;return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===o)break;if(r=i,i=e[++n],t<i)break t}a=e.length;break e}if(!(t>=r)){let o=e[1];t<o&&(n=2,r=o);for(let l=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(i=r,r=e[--n-1],t>=r)break t}a=n,n=0;break e}break n}for(;n<a;){let o=n+a>>>1;t<e[o]?a=o:n=o+1}if(i=e[n],r=e[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,i)}return this.interpolate_(n,r,t,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){let e=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=t*i;for(let a=0;a!==i;++a)e[a]=n[r+a];return e}interpolate_(){throw new Error("call to abstract method")}intervalChanged_(){}},qo=class extends ps{constructor(t,e,n,i){super(t,e,n,i),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:Sc,endingEnd:Sc}}intervalChanged_(t,e,n){let i=this.parameterPositions,r=t-2,a=t+1,o=i[r],l=i[a];if(o===void 0)switch(this.getSettings_().endingStart){case Mc:r=t,o=2*e-n;break;case wc:r=i.length-2,o=e+i[r]-i[r+1];break;default:r=t,o=n}if(l===void 0)switch(this.getSettings_().endingEnd){case Mc:a=t,l=2*n-e;break;case wc:a=1,l=n+i[1]-i[0];break;default:a=t-1,l=e}let c=(n-e)*.5,h=this.valueSize;this._weightPrev=c/(e-o),this._weightNext=c/(l-n),this._offsetPrev=r*h,this._offsetNext=a*h}interpolate_(t,e,n,i){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,h=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,p=this._weightNext,g=(n-e)/(i-e),y=g*g,m=y*g,f=-d*m+2*d*y-d*g,b=(1+d)*m+(-1.5-2*d)*y+(-.5+d)*g+1,v=(-1-p)*m+(1.5+p)*y+.5*g,E=p*m-p*y;for(let C=0;C!==o;++C)r[C]=f*a[h+C]+b*a[c+C]+v*a[l+C]+E*a[u+C];return r}},Yo=class extends ps{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t,e,n,i){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,h=(n-e)/(i-e),u=1-h;for(let d=0;d!==o;++d)r[d]=a[c+d]*u+a[l+d]*h;return r}},Zo=class extends ps{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t){return this.copySampleValue_(t-1)}},xn=class{constructor(t,e,n,i){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(e===void 0||e.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=kr(e,this.TimeBufferType),this.values=kr(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(t){let e=t.constructor,n;if(e.toJSON!==this.toJSON)n=e.toJSON(t);else{n={name:t.name,times:kr(t.times,Array),values:kr(t.values,Array)};let i=t.getInterpolation();i!==t.DefaultInterpolation&&(n.interpolation=i)}return n.type=t.ValueTypeName,n}InterpolantFactoryMethodDiscrete(t){return new Zo(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new Yo(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new qo(this.times,this.values,this.getValueSize(),t)}setInterpolation(t){let e;switch(t){case Fr:e=this.InterpolantFactoryMethodDiscrete;break;case Nr:e=this.InterpolantFactoryMethodLinear;break;case Xa:e=this.InterpolantFactoryMethodSmooth;break}if(e===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return console.warn("THREE.KeyframeTrack:",n),this}return this.createInterpolant=e,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return Fr;case this.InterpolantFactoryMethodLinear:return Nr;case this.InterpolantFactoryMethodSmooth:return Xa}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){let e=this.times;for(let n=0,i=e.length;n!==i;++n)e[n]+=t}return this}scale(t){if(t!==1){let e=this.times;for(let n=0,i=e.length;n!==i;++n)e[n]*=t}return this}trim(t,e){let n=this.times,i=n.length,r=0,a=i-1;for(;r!==i&&n[r]<t;)++r;for(;a!==-1&&n[a]>e;)--a;if(++a,r!==0||a!==i){r>=a&&(a=Math.max(a,1),r=a-1);let o=this.getValueSize();this.times=n.slice(r,a),this.values=this.values.slice(r*o,a*o)}return this}validate(){let t=!0,e=this.getValueSize();e-Math.floor(e)!==0&&(console.error("THREE.KeyframeTrack: Invalid value size in track.",this),t=!1);let n=this.times,i=this.values,r=n.length;r===0&&(console.error("THREE.KeyframeTrack: Track is empty.",this),t=!1);let a=null;for(let o=0;o!==r;o++){let l=n[o];if(typeof l=="number"&&isNaN(l)){console.error("THREE.KeyframeTrack: Time is not a valid number.",this,o,l),t=!1;break}if(a!==null&&a>l){console.error("THREE.KeyframeTrack: Out of order keys.",this,o,l,a),t=!1;break}a=l}if(i!==void 0&&Jy(i))for(let o=0,l=i.length;o!==l;++o){let c=i[o];if(isNaN(c)){console.error("THREE.KeyframeTrack: Value is not a valid number.",this,o,c),t=!1;break}}return t}optimize(){let t=this.times.slice(),e=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===Xa,r=t.length-1,a=1;for(let o=1;o<r;++o){let l=!1,c=t[o],h=t[o+1];if(c!==h&&(o!==1||c!==t[0]))if(i)l=!0;else{let u=o*n,d=u-n,p=u+n;for(let g=0;g!==n;++g){let y=e[u+g];if(y!==e[d+g]||y!==e[p+g]){l=!0;break}}}if(l){if(o!==a){t[a]=t[o];let u=o*n,d=a*n;for(let p=0;p!==n;++p)e[d+p]=e[u+p]}++a}}if(r>0){t[a]=t[r];for(let o=r*n,l=a*n,c=0;c!==n;++c)e[l+c]=e[o+c];++a}return a!==t.length?(this.times=t.slice(0,a),this.values=e.slice(0,a*n)):(this.times=t,this.values=e),this}clone(){let t=this.times.slice(),e=this.values.slice(),n=this.constructor,i=new n(this.name,t,e);return i.createInterpolant=this.createInterpolant,i}};xn.prototype.TimeBufferType=Float32Array;xn.prototype.ValueBufferType=Float32Array;xn.prototype.DefaultInterpolation=Nr;var Ai=class extends xn{};Ai.prototype.ValueTypeName="bool";Ai.prototype.ValueBufferType=Array;Ai.prototype.DefaultInterpolation=Fr;Ai.prototype.InterpolantFactoryMethodLinear=void 0;Ai.prototype.InterpolantFactoryMethodSmooth=void 0;var Jo=class extends xn{};Jo.prototype.ValueTypeName="color";var jo=class extends xn{};jo.prototype.ValueTypeName="number";var Ko=class extends ps{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t,e,n,i){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=(n-e)/(i-e),c=t*o;for(let h=c+o;c!==h;c+=4)je.slerpFlat(r,0,a,c-o,a,c,l);return r}},Gs=class extends xn{InterpolantFactoryMethodLinear(t){return new Ko(this.times,this.values,this.getValueSize(),t)}};Gs.prototype.ValueTypeName="quaternion";Gs.prototype.DefaultInterpolation=Nr;Gs.prototype.InterpolantFactoryMethodSmooth=void 0;var Ci=class extends xn{};Ci.prototype.ValueTypeName="string";Ci.prototype.ValueBufferType=Array;Ci.prototype.DefaultInterpolation=Fr;Ci.prototype.InterpolantFactoryMethodLinear=void 0;Ci.prototype.InterpolantFactoryMethodSmooth=void 0;var Qo=class extends xn{};Qo.prototype.ValueTypeName="vector";var tl=class{constructor(t,e,n){let i=this,r=!1,a=0,o=0,l,c=[];this.onStart=void 0,this.onLoad=t,this.onProgress=e,this.onError=n,this.itemStart=function(h){o++,r===!1&&i.onStart!==void 0&&i.onStart(h,a,o),r=!0},this.itemEnd=function(h){a++,i.onProgress!==void 0&&i.onProgress(h,a,o),a===o&&(r=!1,i.onLoad!==void 0&&i.onLoad())},this.itemError=function(h){i.onError!==void 0&&i.onError(h)},this.resolveURL=function(h){return l?l(h):h},this.setURLModifier=function(h){return l=h,this},this.addHandler=function(h,u){return c.push(h,u),this},this.removeHandler=function(h){let u=c.indexOf(h);return u!==-1&&c.splice(u,2),this},this.getHandler=function(h){for(let u=0,d=c.length;u<d;u+=2){let p=c[u],g=c[u+1];if(p.global&&(p.lastIndex=0),p.test(h))return g}return null}}},jy=new tl,el=class{constructor(t){this.manager=t!==void 0?t:jy,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(t,e){let n=this;return new Promise(function(i,r){n.load(t,i,e,r)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}};el.DEFAULT_MATERIAL_NAME="__DEFAULT";var ll="\\[\\]\\.:\\/",Ky=new RegExp("["+ll+"]","g"),cl="[^"+ll+"]",Qy="[^"+ll.replace("\\.","")+"]",tv=/((?:WC+[\/:])*)/.source.replace("WC",cl),ev=/(WCOD+)?/.source.replace("WCOD",Qy),nv=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",cl),iv=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",cl),sv=new RegExp("^"+tv+ev+nv+iv+"$"),rv=["material","materials","bones","map"],nl=class{constructor(t,e,n){let i=n||he.parseTrackName(e);this._targetGroup=t,this._bindings=t.subscribe_(e,i)}getValue(t,e){this.bind();let n=this._targetGroup.nCachedObjects_,i=this._bindings[n];i!==void 0&&i.getValue(t,e)}setValue(t,e){let n=this._bindings;for(let i=this._targetGroup.nCachedObjects_,r=n.length;i!==r;++i)n[i].setValue(t,e)}bind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].bind()}unbind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].unbind()}},he=class s{constructor(t,e,n){this.path=e,this.parsedPath=n||s.parseTrackName(e),this.node=s.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,e,n){return t&&t.isAnimationObjectGroup?new s.Composite(t,e,n):new s(t,e,n)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace(Ky,"")}static parseTrackName(t){let e=sv.exec(t);if(e===null)throw new Error("PropertyBinding: Cannot parse trackName: "+t);let n={nodeName:e[2],objectName:e[3],objectIndex:e[4],propertyName:e[5],propertyIndex:e[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){let r=n.nodeName.substring(i+1);rv.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,i),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("PropertyBinding: can not parse propertyName from trackName: "+t);return n}static findNode(t,e){if(e===void 0||e===""||e==="."||e===-1||e===t.name||e===t.uuid)return t;if(t.skeleton){let n=t.skeleton.getBoneByName(e);if(n!==void 0)return n}if(t.children){let n=function(r){for(let a=0;a<r.length;a++){let o=r[a];if(o.name===e||o.uuid===e)return o;let l=n(o.children);if(l)return l}return null},i=n(t.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,e){t[e]=this.targetObject[this.propertyName]}_getValue_array(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)t[e++]=n[i]}_getValue_arrayElement(t,e){t[e]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,e){this.resolvedProperty.toArray(t,e)}_setValue_direct(t,e){this.targetObject[this.propertyName]=t[e]}_setValue_direct_setNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++]}_setValue_array_setNeedsUpdate(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,e){this.resolvedProperty[this.propertyIndex]=t[e]}_setValue_arrayElement_setNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,e){this.resolvedProperty.fromArray(t,e)}_setValue_fromArray_setNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,e){this.bind(),this.getValue(t,e)}_setValue_unbound(t,e){this.bind(),this.setValue(t,e)}bind(){let t=this.node,e=this.parsedPath,n=e.objectName,i=e.propertyName,r=e.propertyIndex;if(t||(t=s.findNode(this.rootNode,e.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){console.warn("THREE.PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=e.objectIndex;switch(n){case"materials":if(!t.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let h=0;h<t.length;h++)if(t[h].name===c){c=h;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){console.error("THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[n]===void 0){console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[n]}if(c!==void 0){if(t[c]===void 0){console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[c]}}let a=t[i];if(a===void 0){let c=e.nodeName;console.error("THREE.PropertyBinding: Trying to update property for track: "+c+"."+i+" but it wasn't found.",t);return}let o=this.Versioning.None;this.targetObject=t,t.needsUpdate!==void 0?o=this.Versioning.NeedsUpdate:t.matrixWorldNeedsUpdate!==void 0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(r!==void 0){if(i==="morphTargetInfluences"){if(!t.geometry){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[r]!==void 0&&(r=t.morphTargetDictionary[r])}l=this.BindingType.ArrayElement,this.resolvedProperty=a,this.propertyIndex=r}else a.fromArray!==void 0&&a.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=a):Array.isArray(a)?(l=this.BindingType.EntireArray,this.resolvedProperty=a):this.propertyName=i;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};he.Composite=nl;he.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};he.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};he.prototype.GetterByBindingType=[he.prototype._getValue_direct,he.prototype._getValue_array,he.prototype._getValue_arrayElement,he.prototype._getValue_toArray];he.prototype.SetterByBindingTypeAndVersioning=[[he.prototype._setValue_direct,he.prototype._setValue_direct_setNeedsUpdate,he.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[he.prototype._setValue_array,he.prototype._setValue_array_setNeedsUpdate,he.prototype._setValue_array_setMatrixWorldNeedsUpdate],[he.prototype._setValue_arrayElement,he.prototype._setValue_arrayElement_setNeedsUpdate,he.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[he.prototype._setValue_fromArray,he.prototype._setValue_fromArray_setNeedsUpdate,he.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var M0=new Float32Array(1);var sa=class{constructor(t,e,n=0,i=1/0){this.ray=new us(t,e),this.near=n,this.far=i,this.camera=null,this.layers=new Ns,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(t,e){this.ray.set(t,e)}setFromCamera(t,e){e.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(t.x,t.y,.5).unproject(e).sub(this.ray.origin).normalize(),this.camera=e):e.isOrthographicCamera?(this.ray.origin.set(t.x,t.y,(e.near+e.far)/(e.near-e.far)).unproject(e),this.ray.direction.set(0,0,-1).transformDirection(e.matrixWorld),this.camera=e):console.error("THREE.Raycaster: Unsupported camera type: "+e.type)}intersectObject(t,e=!0,n=[]){return il(t,this,n,e),n.sort(bh),n}intersectObjects(t,e=!0,n=[]){for(let i=0,r=t.length;i<r;i++)il(t[i],this,n,e);return n.sort(bh),n}};function bh(s,t){return s.distance-t.distance}function il(s,t,e,n){if(s.layers.test(t.layers)&&s.raycast(t,e),n===!0){let i=s.children;for(let r=0,a=i.length;r<a;r++)il(i[r],t,e,!0)}}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:sl}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=sl);function Gh(s,t){let e=s.length,n=s.reduce((r,a)=>r+a,0);if(e<=1||!(t>0)||t===1)return[...s];let i=r=>n*Math.pow(r/e,1/t);return s.map((r,a)=>i(a+1)-i(a))}var Wh=Math.PI/180;function $h(s,t){return[s[0]-t[0],s[1]-t[1],s[2]-t[2]]}function hl(s,t){return s[0]*t[0]+s[1]*t[1]+s[2]*t[2]}function Xh(s,t){return[s[1]*t[2]-s[2]*t[1],s[2]*t[0]-s[0]*t[2],s[0]*t[1]-s[1]*t[0]]}function qh(s){let t=Math.hypot(s[0],s[1],s[2])||1;return[s[0]/t,s[1]/t,s[2]/t]}function Yh(s){return{x:s.left+s.right-1,y:1-(s.top+s.bottom)}}function ul(s){let t=Yh(s);return{offsetX:-t.x,offsetY:-t.y}}function Zh(s){let t=qh($h(s.target,s.eye)),e=qh(Xh(t,[0,1,0])),n=Xh(e,t),i=Math.tan(s.baseFov*Wh/2),r=s.rect,a=Yh(r),o=[],l=[];for(let I of s.points){let N=$h(I,s.eye),K=hl(N,t);K<=1e-6||(o.push(hl(N,e)/K),l.push(hl(N,n)/K))}if(o.length===0)return{fov:s.baseFov,...ul(r)};let c=Math.min(...o),h=Math.max(...o),u=Math.min(...l),d=Math.max(...l),p=Math.max(.001,2*(r.right-r.left)),g=Math.max(.001,2*(r.bottom-r.top)),y=Math.max((h-c)/(s.aspect*p),(d-u)/g),m=i*Math.max(1,s.maxZoomOut),f=i*s.cover,b=1-2*r.top,v=1-2*r.bottom,E=I=>[Math.max(d-b*I,I-f),Math.min(u-v*I,f-I)],C=Math.min(m,Math.max(i,y));for(let I=0;I<48&&C<m;I++){let[N,K]=E(C);if(N<=K)break;C=Math.min(m,C+(m-i)/32)}let T=(c+h)/2-a.x*C*s.aspect,[A,X]=E(C),S=(u+d)/2-a.y*C,x=A<=X?Math.min(X,Math.max(A,S)):Math.min(f-C,Math.max(C-f,S));return{fov:2*Math.atan(C)/Wh,offsetX:T/(C*s.aspect),offsetY:x/C}}var Ws=class{constructor(t,e){this.config=e;R(this,"paintCamera");R(this,"homePosition");R(this,"homeLookAt");R(this,"fov");R(this,"combatHidden",[]);R(this,"root",new Fe);R(this,"materials",[]);t.add(this.root);let n=e.camera;this.fov=n.fov,this.homePosition=new D(0,n.height,n.back),this.homeLookAt=new D(0,n.lookAtHeight,0),this.paintCamera=new be(n.fov,n.aspect,.1,500),this.paintCamera.position.copy(this.homePosition),this.paintCamera.lookAt(this.homeLookAt),this.paintCamera.updateMatrixWorld(),this.paintCamera.updateProjectionMatrix()}build(t){for(let e of this.config.layers){let n=t.get(e.file);if(!n)continue;let i=new Re(e.draws.length>0?this.compose(n,e):n);i.colorSpace=Zt,i.anisotropy=4,i.wrapS=e.mirrorX?cs:Ye,i.wrapT=e.mirrorY?cs:Ye,i.needsUpdate=!0;let r=e.shape==="floor"?this.floor(e,i):this.stand(e,i);r.renderOrder=e.order,e.hideInCombat&&this.combatHidden.push(r.material),this.materials.push(r.material),this.root.add(r)}}compose(t,e){let[n,i]=this.config.viewport,r=document.createElement("canvas");r.width=n,r.height=i;let a=r.getContext("2d");if(!a)return r;let o=t.naturalWidth>0?t.naturalWidth/n:1;for(let l of e.draws){let[c,h,u,d]=l.source;a.drawImage(t,c*o,h*o,u*o,d*o,...l.destination)}return r}setOpacity(t){this.root.visible=t>.001;for(let e of this.materials)e.opacity=t}setBrightness(t){for(let e of this.materials)e.color.setScalar(t)}rayToZ(t,e,n){let i=this.paintCamera,r=new D(t,e,.5).unproject(i).sub(i.position).normalize();return i.position.clone().addScaledVector(r,(n-i.position.z)/r.z)}scaledRect(t){let[e,n]=this.config.scaleAnchor,[i,r,a,o]=t.rect,l=t.scale;return[e+(i-e)*l,n+(r-n)*l+t.offsetY,a*l,o*l]}projectUV(t,e){t.updateMatrixWorld();let n=t.geometry.getAttribute("position"),i=t.geometry.getAttribute("uv"),r=new D;for(let a=0;a<n.count;a++){r.fromBufferAttribute(n,a).applyMatrix4(t.matrixWorld).project(this.paintCamera);let o=(r.x+1)/2,l=(1-r.y)/2;i.setXY(a,(o-e[0])/e[2],1-(l-e[1])/e[3])}i.needsUpdate=!0}material(t){return new Le({map:t,transparent:!0,depthWrite:!1,fog:!1})}stand(t,e){let n=-t.depth,i=this.config.standSpread,r=this.rayToZ(-i,1.3,n),a=this.rayToZ(i,-1.3,n),o=new ce(new Oe(a.x-r.x,r.y-a.y,96,24),this.material(e));return o.position.set((r.x+a.x)/2,(r.y+a.y)/2,n),this.projectUV(o,this.scaledRect(t)),o}floor(t,e){let n=-t.near,i=-t.far,r=new Oe(t.halfWidth*2,n-i,240,160);r.rotateX(-Math.PI/2);let a=new ce(r,this.material(e));return a.position.set(0,0,(n+i)/2),this.projectUV(a,t.rect),a}};var Xn=Math.PI/180;function dl(s,t,e,n,i){let a=2/Math.max(1e-4,n),o=a*i,l=1/(1+o+.48*o*o+.235*o*o*o),c=s-t,h=(e.v+a*c)*i;e.v=(e.v-a*h)*l;let u=t+(c+h)*l;return t-s>0==u>t&&(u=t,e.v=0),u}var av=[11.3,47.9,83.1,121.7,163.3,199.9];function gs(s,t){let e=av[s]??0;return .55*Math.sin(t+e)+.3*Math.sin(t*2.17+e*1.7)+.15*Math.sin(t*4.31+e*2.9)}var la=class{constructor(t,e,n,i,r,a){this.camera=t;this.config=r;this.shake=a;R(this,"homePos");R(this,"homeQuat",new je);R(this,"baseFov");R(this,"homeFov");R(this,"homeShift",new Ft);R(this,"focusShift",new Ft);R(this,"shift",new Ft);R(this,"goalPos",new D);R(this,"goalQuat",new je);R(this,"goalFov");R(this,"focused",!1);R(this,"pos",new D);R(this,"quat",new je);R(this,"fov");R(this,"vel",{x:{v:0},y:{v:0},z:{v:0}});R(this,"trauma",0);R(this,"kick",new D);R(this,"kickVel",new D);R(this,"fovKick",0);R(this,"fovKickVel",0);R(this,"probe",new be);R(this,"env",null);R(this,"envSeen",[]);R(this,"envMuted",!1);this.homePos=e.clone(),this.baseFov=i,this.homeFov=i,this.goalFov=i,this.fov=i,this.probe.position.copy(e),this.probe.lookAt(n),this.homeQuat.copy(this.probe.quaternion),this.snapHome()}snapHome(){this.focused=!1,this.pos.copy(this.homePos),this.quat.copy(this.homeQuat),this.fov=this.homeFov,this.shift.copy(this.homeShift),this.trauma=0,this.kick.set(0,0,0),this.kickVel.set(0,0,0),this.fovKick=0,this.fovKickVel=0;for(let t of Object.values(this.vel))t.v=0}setHome(t,e,n){this.homeFov=t,this.homeShift.set(e,n)}setFocusShift(t,e){this.focusShift.set(t,e)}focus(t,e,n){let i=this.config,r=t.clone().add(e).multiplyScalar(.5);r.y+=i.focusHeight;let a=this.baseFov-i.fovZoom,o=this.homePos.distanceTo(r)*Math.tan(this.baseFov*Xn/2)/Math.tan(a*Xn/2)/i.focusSizeGain,l=Math.tan(a*Xn/2),h=(Math.abs(t.x-e.x)+2.4)/2/(l*Math.max(.1,this.camera.aspect)*i.fitShare),u=Math.max(o,h),d=new D(0,0,-1).applyQuaternion(this.homeQuat).applyAxisAngle(new D(0,1,0),-n*i.panYawDeg*Xn).normalize();this.goalPos.copy(r).addScaledVector(d,-u),this.probe.position.copy(this.goalPos),this.probe.lookAt(r),this.goalQuat.copy(this.probe.quaternion).multiply(new je().setFromAxisAngle(new D(0,0,1),n*i.dutchDeg*Xn)),this.goalFov=a,this.focused=!0}release(){this.focused=!1}impact(t,e){let n=this.shake;this.trauma=Math.min(1,this.trauma+n.traumaPerHit+n.traumaPerDamage*t);let i=Math.sqrt(n.kickStiffness);this.kickVel.addScaledVector(new D(e,-.35,-.5).normalize(),n.kickImpulse*(.5+t)*i),this.fovKickVel-=n.fovPunch*(.5+t)*i}envImpulse(t,e,n,i,r,a,o){if(this.envMuted||n<=0||this.envSeen.includes(t))return;this.envSeen.push(t),this.envSeen.length>64&&this.envSeen.shift();let l=Math.min(o,e);if(this.env){let c=Math.max(0,1-(a-this.env.start)/this.env.duration);if(this.env.amplitude*c*c>=l)return}this.env={start:a,amplitude:l,duration:n,zoom:i,dir:Math.sign(r)||1}}write(t,e){if(t<=0)return;let n=this.config,i=this.shake,r=this.focused?this.goalPos:this.homePos,a=this.focused?this.goalQuat:this.homeQuat,o=this.focused?this.goalFov:this.homeFov,l=this.focused?n.followTime:n.returnFollowTime;this.pos.set(dl(this.pos.x,r.x,this.vel.x,l,t),dl(this.pos.y,r.y,this.vel.y,l,t),dl(this.pos.z,r.z,this.vel.z,l,t));let c=1-Math.exp(-t/Math.max(1e-4,l));this.quat.slerp(a,c),this.fov+=(o-this.fov)*c,this.shift.lerp(this.focused?this.focusShift:this.homeShift,c),this.trauma=Math.max(0,this.trauma-i.traumaDecay*t);let h=this.trauma*this.trauma,u=h*h*(3-2*h),d=e*i.frequency,p=new D(gs(0,d)*i.maxOffset[0],gs(1,d)*i.maxOffset[1],gs(2,d)*i.maxOffset[2]).multiplyScalar(u),g=new hi(gs(3,d)*i.maxAngle[0]*Xn*u,gs(4,d)*i.maxAngle[1]*Xn*u,gs(5,d)*i.maxAngle[2]*Xn*u),y=Math.max(1,Math.ceil(t/.008)),m=t/y;for(let E=0;E<y;E++){let C=this.kick.clone().multiplyScalar(-i.kickStiffness).addScaledVector(this.kickVel,-i.kickDamping);this.kickVel.addScaledVector(C,m),this.kick.addScaledVector(this.kickVel,m),this.fovKickVel+=(-i.kickStiffness*this.fovKick-i.kickDamping*this.fovKickVel)*m,this.fovKick+=this.fovKickVel*m}let f=1,b=new D;if(this.env){let E=(e-this.env.start)/this.env.duration;if(E>=1)this.env=null;else{let C=(1-E)*(1-E),T=2*Math.max(1,Math.abs(this.pos.z))*Math.tan(this.fov*Xn/2);b.set(this.env.dir*.9,-.45,0).normalize().multiplyScalar(this.env.amplitude*T*C).applyQuaternion(this.quat),f=1-this.env.zoom*C}}this.camera.position.copy(this.pos).add(p.applyQuaternion(this.quat)).add(this.kick).add(b),this.camera.quaternion.copy(this.quat).multiply(new je().setFromEuler(g)),this.camera.fov=Math.min(170,Math.max(5,(this.fov+this.fovKick)*f)),this.camera.updateProjectionMatrix();let v=this.camera.projectionMatrix.elements;v[8]=this.shift.x,v[9]=this.shift.y,this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()}};var qn={x:37,y:18,w:182,h:30},ca={x:26,y:55,w:204,h:222},ha={x:27,y:296,w:202,h:47},Jh="#fff1d7",fl="#b7b6b6",jh="#d9b77c";function ov(s,t,e,n,i,r){let a=document.createElement("canvas");a.width=r,a.height=r;let o=a.getContext("2d");if(!o)return;let l=Math.min(r/Math.max(1,t.naturalWidth),r/Math.max(1,t.naturalHeight)),c=t.naturalWidth*l,h=t.naturalHeight*l;o.drawImage(t,(r-c)/2,(r-h)/2,c,h),o.globalCompositeOperation="source-in",o.fillStyle=e,o.fillRect(0,0,r,r),s.drawImage(a,n-r/2,i-r/2)}function Kh(s,t,e){let r=document.createElement("canvas");r.width=256,r.height=360;let a=r.getContext("2d");if(!a)return r;if(a.drawImage(e?t.back:t.front,0,0,256,360),!t.complete){let o=ca.x+ca.w/2,l=ca.y+ca.h/2,c=e?fl:jh;s.glyph?ov(a,s.glyph,c,o,l,120):(a.save(),a.translate(o,l),a.rotate(Math.PI/4),a.strokeStyle=c,a.lineWidth=4,a.strokeRect(-40,-40,80,80),a.restore())}return a.textBaseline="middle",a.fillStyle=Jh,a.textAlign="center",a.font="700 24px system-ui, sans-serif",a.fillText(s.name,qn.x+qn.w/2,qn.y+qn.h/2+1,qn.w-64),a.textAlign="right",a.font="800 22px system-ui, sans-serif",a.fillStyle=e?fl:jh,a.fillText(e?"\uB4A4":"\uC55E",qn.x+qn.w,qn.y+qn.h/2+1),a.textAlign="center",a.fillStyle=e?fl:Jh,a.font="900 44px system-ui, sans-serif",a.fillText(String(e?s.backPower:s.frontPower),ha.x+ha.w/2,ha.y+ha.h/2+2),r}function Qh(s,t){let i=document.createElement("canvas");i.width=256,i.height=360;let r=i.getContext("2d");if(!r)return i;let a=t?"#6b6864":"#e9dcbc",o=t?"#d6d1c9":"#2a1d0c",l=t?"#3b3936":s.tint,c=t?"#8d8984":s.tint;return r.fillStyle=l,r.fillRect(0,0,256,360),r.fillStyle=a,r.fillRect(12,12,232,336),r.fillStyle=o,r.font="700 30px system-ui, sans-serif",r.textAlign="left",r.textBaseline="top",r.fillText(s.slot,26,24),r.textAlign="right",r.fillText(t?"\uB4A4":"\uC55E",230,24),r.save(),r.translate(256/2,360*.42),r.rotate(Math.PI/4),r.fillStyle=c,r.fillRect(-46,-46,92,92),r.strokeStyle=o,r.lineWidth=5,r.strokeRect(-46,-46,92,92),r.restore(),r.fillStyle=o,r.textAlign="center",r.textBaseline="middle",r.font="900 88px system-ui, sans-serif",r.fillText(String(t?s.backPower:s.frontPower),256/2,360*.74),r.font="600 24px system-ui, sans-serif",r.fillText(s.name,256/2,326,216),i}function tu(s){let t=new dn(s);return t.colorSpace=Zt,t.anisotropy=4,new Le({map:t,transparent:!0,depthWrite:!1,depthTest:!1,fog:!1})}var $s=class{constructor(t,e,n=null){R(this,"root",new Fe);R(this,"inner",new Fe);R(this,"front");R(this,"back");R(this,"materials");R(this,"state",{spin:0,scale:0,opacity:1,dim:0});let i=e*.7111111111111111,r=new Oe(i,e),a=tu(n?Kh(t,n,!1):Qh(t,!1)),o=tu(n?Kh(t,n,!0):Qh(t,!0));this.materials=[a,o],this.front=new ce(r,a),this.back=new ce(r,o),this.back.rotation.y=Math.PI;for(let l of[this.front,this.back])l.renderOrder=60,this.inner.add(l);this.root.add(this.inner),this.root.visible=!1}static restAngle(t,e){return e*Math.PI*2+(t==="back"?Math.PI:0)}update(t,e){this.root.visible=this.state.scale>.001&&this.state.opacity>.001,this.root.position.copy(t),this.root.quaternion.copy(e.quaternion),this.inner.rotation.set(0,this.state.spin,0),this.inner.scale.setScalar(this.state.scale);let n=1-.55*this.state.dim;for(let i of this.materials)i.opacity=this.state.opacity,i.color.setScalar(n)}dispose(){this.root.removeFromParent();for(let t of this.materials)t.map?.dispose(),t.dispose();this.front.geometry.dispose()}};var ue={linear:s=>s,outQuad:s=>1-(1-s)*(1-s),inQuad:s=>s*s,inOutQuad:s=>s<.5?2*s*s:1-Math.pow(-2*s+2,2)/2,outCubic:s=>1-(1-s)**3,outExpo:s=>s>=1?1:1-2**(-10*s),outBack:s=>{let e=s-1;return e*e*(2.70158*e+1.70158)+1},outElastic:(s,t)=>e=>{if(e<=0||e>=1)return e;let n=s,i;return n<1?(n=1,i=t/4):i=t/(2*Math.PI)*Math.asin(1/n),n*2**(-10*e)*Math.sin((e-i)*2*Math.PI/t)+1}},ua=class{constructor(){R(this,"timeScale",1);R(this,"baseScale",1);R(this,"realTweens",[]);R(this,"real",0);R(this,"tweens",[]);R(this,"gameWaits",[]);R(this,"realWaits",[]);R(this,"hitStop",{active:!1,until:0,scale:.02})}get realNow(){return this.real}get scale(){return this.timeScale}applyTimeScale(t){this.timeScale=t}setSlowMotion(t){this.baseScale=t,this.hitStop.active||this.applyTimeScale(t)}startHitStop(t,e){t<=0||(this.hitStop.until=Math.max(this.hitStop.until,this.real+t),this.hitStop.active=!0,this.hitStop.scale=e,this.applyTimeScale(e))}kill(t,e){this.tweens=this.tweens.filter(n=>n.target===t&&(e===void 0||n.key===e)?(n.done(),!1):!0)}tween(t,e,n,i,r=ue.outQuad){let a=t;return this.kill(t,e),new Promise(o=>this.tweens.push({target:a,key:e,from:a[e]??0,to:n,dur:Math.max(1e-4,i),t:0,fn:r,done:o}))}tweenReal(t,e,n,i,r=ue.outQuad){let a=t;return this.realTweens=this.realTweens.filter(o=>o.target===a&&o.key===e?(o.done(),!1):!0),new Promise(o=>this.realTweens.push({target:a,key:e,from:a[e]??0,to:n,dur:Math.max(1e-4,i),t:0,fn:r,done:o}))}waitGame(t){return new Promise(e=>this.gameWaits.push({left:t,done:e}))}waitReal(t){return new Promise(e=>this.realWaits.push({until:this.real+t,done:e}))}step(t){this.real+=t;for(let n of[...this.realWaits])this.real>=n.until&&(this.realWaits.splice(this.realWaits.indexOf(n),1),n.done());this.hitStop.active&&this.real>=this.hitStop.until&&(this.hitStop.active=!1,this.applyTimeScale(this.baseScale));for(let n of[...this.realTweens]){n.t+=t;let i=Math.min(1,n.t/n.dur);n.target[n.key]=n.from+(n.to-n.from)*n.fn(i),i>=1&&(this.realTweens.splice(this.realTweens.indexOf(n),1),n.done())}let e=t*this.timeScale;for(let n of[...this.tweens]){n.t+=e;let i=Math.min(1,n.t/n.dur);n.target[n.key]=n.from+(n.to-n.from)*n.fn(i),i>=1&&(this.tweens.splice(this.tweens.indexOf(n),1),n.done())}for(let n of[...this.gameWaits])n.left-=e,n.left<=0&&(this.gameWaits.splice(this.gameWaits.indexOf(n),1),n.done());return e}clear(){for(let t of this.tweens)t.done();for(let t of this.realTweens)t.done();for(let t of this.gameWaits)t.done();for(let t of this.realWaits)t.done();this.tweens=[],this.realTweens=[],this.gameWaits=[],this.realWaits=[],this.hitStop.active=!1,this.baseScale=1,this.applyTimeScale(1)}},we=(...s)=>Promise.all(s.flat().filter(t=>t!==null));var da=class{constructor(t){R(this,"canvas");R(this,"ctx");R(this,"showing",null);R(this,"flash",!0);this.canvas=document.createElement("canvas"),this.canvas.className="cutscene",Object.assign(this.canvas.style,{position:"absolute",inset:"0",width:"100%",height:"100%",pointerEvents:"none",display:"none",zIndex:"5"}),t.appendChild(this.canvas),this.ctx=this.canvas.getContext("2d")}play(t,e,n,i,r){this.showing={start:n,seconds:i,lineAt:r,spec:t,...e},this.canvas.style.display="block"}get active(){return this.showing!==null}clear(){this.showing=null,this.canvas.style.display="none"}update(t){let e=this.showing,n=this.ctx;if(!e||!n)return;let i=t-e.start;if(i>=e.seconds){this.clear();return}let r=this.canvas.getBoundingClientRect(),a=Math.max(1,Math.round(r.width)),o=Math.max(1,Math.round(r.height));(this.canvas.width!==a||this.canvas.height!==o)&&(this.canvas.width=a,this.canvas.height=o);let l=e.spec,c=Math.max(a/l.size.width,o/l.size.height),h=Math.min(1,i/e.seconds),u=l.zoomFrom+(l.zoomTo-l.zoomFrom)*h,d=Math.min(1,i/Math.max(.001,l.fade)),p=Math.min(1,(e.seconds-i)/Math.max(.001,l.fade));n.clearRect(0,0,a,o),n.save(),n.globalAlpha=Math.min(d,p),n.fillStyle="#0b0d14",n.fillRect(0,0,a,o);let g=(m,f)=>{if(!m)return;let b=l.size.width*c*f,v=l.size.height*c*f;n.drawImage(m,(a-b)/2,(o-v)/2,b,v)};g(e.background,1+(u-1)*.4),g(e.foreground,u);let y=i-e.lineAt;if(e.line&&y>=0){let m=Math.min(1,y/Math.max(.001,l.lineWipe)),f=Math.max(2,e.line.naturalHeight*c),b=o*l.lineY-f/2;n.drawImage(e.line,0,0,e.line.naturalWidth*m,e.line.naturalHeight,0,b,a*m,f),this.flash&&y<l.lineWipe*2&&(n.globalAlpha*=.35*(1-y/(l.lineWipe*2)),n.fillStyle="#dfe8ff",n.fillRect(0,0,a,o))}n.restore()}};var fa=class{constructor(t,e,n,i){this.scene=t;this.vfx=e;this.characterHeight=i;R(this,"playing",new Set);R(this,"textures",new Map);let r=new Map;for(let o of e.sprites.values())r.set(o.atlas,Math.max(r.get(o.atlas)??0,o.rect[0]+o.rect[2],o.rect[1]+o.rect[3]));let a=new Map;for(let[o,l]of n){let c=new Re(l);c.colorSpace=Zt,c.needsUpdate=!0,a.set(o,c)}for(let o of e.sprites.values()){let l=a.get(o.atlas),c=r.get(o.atlas)??2048;if(!l)continue;let h=l.clone(),[u,d,p,g]=o.rect;h.repeat.set(p/c,g/c),h.offset.set(u/c,1-(d+g)/c),h.needsUpdate=!0,this.textures.set(o.id,h)}}get allTextures(){return[...this.textures.values()]}spawn(t,e,n,i,r){let a=this.vfx.animations.get(t.play),o=a?a.frames:[t.play],l=this.vfx.sprites.get(o[0]),c=o.map(E=>this.textures.get(E)).filter(E=>E!==void 0);if(!l||c.length!==o.length)return;let h=this.characterHeight*t.scale/l.canvas[1],u=new Oe(l.canvas[0]*h,l.canvas[1]*h);u.translate((l.canvas[0]/2-l.pivot[0])*h,(l.pivot[1]-l.canvas[1]/2)*h,0);let d=l.tint==="alpha_silhouette",p=new Le({map:c[0]??null,color:new Vt(d?r:i),transparent:!0,depthWrite:!1,depthTest:!1,side:We,fog:!1});d&&(p.onBeforeCompile=E=>{E.fragmentShader=E.fragmentShader.replace("#include <map_fragment>",`#ifdef USE_MAP
  diffuseColor.a *= texture2D( map, vMapUv ).a;
#endif`)},p.customProgramCacheKey=()=>"envfx-silhouette");let g=new ce(u,p),y=t.anchor==="floor",m=t.anchor==="foot"||y;g.renderOrder=m?9:46;let f=t.face==="away"?-n:n,b=this.characterHeight;g.position.set(e.x+f*t.offset[0]*b,e.y+t.offset[1]*b,e.z),y&&(g.position.y=.012,g.rotation.x=-Math.PI/2+.4),g.scale.x=f>=0?1:-1,this.scene.add(g);let v=a?a.durations:[t.hold];this.playing.add({mesh:g,material:p,frames:c,durations:v,fade:a?a.fadeLast:t.fade,t:0,floor:y})}update(t,e){for(let n of[...this.playing]){n.t+=t*1e3*this.vfx.playbackRate;let i=n.t,r=0;for(;r<n.durations.length-1&&i>=(n.durations[r]??0);)i-=n.durations[r]??0,r+=1;let a=n.frames[Math.min(r,n.frames.length-1)]??null;n.material.map!==a&&(n.material.map=a,n.material.needsUpdate=!0);let o=n.durations.reduce((c,h)=>c+h,0),l=n.t-o;if(n.material.opacity=l<=0?1:Math.max(0,1-l/Math.max(1,n.fade)),l>=n.fade){this.remove(n);continue}if(!n.floor){let c=n.mesh.scale.x;n.mesh.quaternion.copy(e.quaternion),n.mesh.scale.set(c,1,1)}}}remove(t){t.mesh.removeFromParent(),t.mesh.geometry.dispose(),t.material.dispose(),this.playing.delete(t)}clear(){for(let t of[...this.playing])this.remove(t)}};var pa=class{constructor(t,e){this.scene=t;this.characterHeight=e;R(this,"playing",new Set)}spawn(t,e,n,i,r,a={}){if(e.length===0)return null;let{width:o,height:l}=t.size,c=this.characterHeight*t.scale/Math.max(o,l),h=new Oe(o*c,l*c);h.translate((o/2-t.pivot.x)*c,(t.pivot.y-l/2)*c,0);let u=new Le({map:e[0]??null,transparent:!0,depthWrite:!1,depthTest:!1,side:We,fog:!1,blending:t.blend==="add"?Hn:si}),d=new ce(h,u);d.renderOrder=a.order??45,d.position.copy(n),d.scale.x=i,this.scene.add(d);let p={mesh:d,material:u,textures:e,effect:t,start:r,hold:a.hold??!1,roll:a.roll??0,fade:null};return this.playing.add(p),p}fade(t,e,n,i){t&&(t.fade={from:t.material.opacity,to:e,start:i,seconds:Math.max(.001,n)})}update(t,e){for(let n of this.playing){let i=n.effect.frames,r=(t-n.start)*1e3,a=0;for(;a<i.length-1&&r>=(i[a]?.ms??0);)r-=i[a]?.ms??0,a+=1;let o=i.reduce((u,d)=>u+d.ms,0),l=!n.hold&&!n.effect.loop&&(t-n.start)*1e3>=o,c=n.textures[Math.min(a,n.textures.length-1)]??null;if(n.material.map!==c&&(n.material.map=c,n.material.needsUpdate=!0),n.fade){let u=Math.min(1,(t-n.fade.start)/n.fade.seconds);if(n.material.opacity=n.fade.from+(n.fade.to-n.fade.from)*u,u>=1&&n.fade.to<=0){this.remove(n);continue}}if(l){this.remove(n);continue}let h=n.mesh.scale.x;n.mesh.quaternion.copy(e.quaternion),n.roll!==0&&n.mesh.rotateZ(n.roll),n.mesh.scale.set(h,1,1)}}remove(t){t.mesh.removeFromParent(),t.mesh.geometry.dispose(),t.material.dispose(),this.playing.delete(t)}clear(){for(let t of[...this.playing])this.remove(t)}};function eu(s){return s.filter(t=>t!==null).map(t=>{let e=new Re(t);return e.colorSpace=Zt,e.needsUpdate=!0,e})}var ma=class{constructor(t,e,n,i,r){this.combatantId=t;this.catalog=e;this.worldPerPixel=i;R(this,"root",new Fe);R(this,"visual",new Fe);R(this,"plates",new Map);R(this,"shown",null);R(this,"shownId","");R(this,"facing",1);R(this,"home",new D);R(this,"opacity",1);R(this,"down",!1);R(this,"hidden",!1);R(this,"breath",0);R(this,"fade",{doll:this,get v(){return this.doll.opacity},set v(t){this.doll.setOpacity(t)}});this.root.add(this.visual);for(let a of e.manifest.frames){let o=n.get(a.id);if(!o)continue;let l=this.makePlate(a,o,r);l.mesh.visible=!1,this.visual.add(l.mesh),this.plates.set(a.id,l)}this.showFrame(this.poseFrame("idle"))}addFrame(t,e,n=10){let i=this.plates.get(t);if(i){i.material.map=e,i.material.needsUpdate=!0;return}let r=this.makePlate(this.catalog.frame(t),e,n);r.mesh.visible=!1,this.visual.add(r.mesh),this.plates.set(t,r)}makePlate(t,e,n){let i=lv(t,this.worldPerPixel),r=new Le({map:e,transparent:!0,alphaTest:.02,depthWrite:!1,side:We,fog:!1}),a=new ce(i,r);return a.renderOrder=n,a.userData.combatantId=this.combatantId,{mesh:a,material:r}}poseFrame(t){let e={idle:"idle",dash:"advance",guard:"guard",hurt:"hit",retreat:"retreat"}[t];return(this.catalog.frameEndingWith(e)??this.catalog.frameEndingWith("idle")??this.catalog.manifest.frames[0])?.id??""}skillFrames(t){let e=t==="ULT"?this.catalog.frameSequence("ULT"):[];if(e.length>0)return[e[0]];let n=this.catalog.frameSequence(t==="ULT"?"S3":t);return n.length>0?n:[this.poseFrame("idle")]}setPose(t){this.showFrame(this.poseFrame(t))}showFrame(t){if(t===this.shownId)return;let e=this.plates.get(t);e&&(this.shown&&(this.shown.mesh.visible=!1),e.mesh.visible=!0,e.material.opacity=this.opacity,this.shown=e,this.shownId=t)}setOpacity(t){this.opacity=t,this.shown&&(this.shown.material.opacity=t)}get opacityValue(){return this.opacity}get pickTarget(){return this.shown?.mesh??null}setFacing(t){this.facing=t,this.root.scale.x=t}faceCamera(t){this.root.quaternion.copy(t.quaternion),Math.sign(this.root.scale.x)!==this.facing&&(this.root.scale.x=this.facing),this.visual.rotation.set(0,0,0),this.visual.scale.set(1,1+this.breath,1)}get idle(){return this.shownId===this.poseFrame("idle")}setTint(t){for(let e of this.plates.values())e.material.color.setHex(t)}toLocalX(t){return t/this.root.scale.x}chest(t){return new D(this.root.position.x+this.visual.position.x*this.root.scale.x,t,this.root.position.z)}reset(){this.root.position.copy(this.home),this.visual.position.set(0,0,0),this.down=!1,this.hidden=!1,this.setOpacity(1),this.setPose("idle")}};function lv(s,t){let[e,n,i,r]=s.bbox,a=t,o=new Oe((i-e)*a,(r-n)*a);return o.translate(((e+i)/2-s.anchor.x)*a,(s.anchor.y-(n+r)/2)*a,0),o}function nu(s,t,e,n){let i=s.naturalWidth>0?s.naturalWidth/e:1,r=t.bbox[0]*i,a=t.bbox[1]*i,o=Math.max(1,(t.bbox[2]-t.bbox[0])*i),l=Math.max(1,(t.bbox[3]-t.bbox[1])*i),c=Math.min(1,n/Math.max(o,l)),h=document.createElement("canvas");h.width=Math.max(1,Math.round(o*c)),h.height=Math.max(1,Math.round(l*c));let u=h.getContext("2d");u&&u.drawImage(s,r,a,o,l,0,0,h.width,h.height);let d=new dn(h);return d.colorSpace=Zt,d.anisotropy=4,d}function cv(s){let t=s>>>0;return()=>(t=t*1664525+1013904223>>>0,t/4294967296)}function hv(){let s=document.createElement("canvas");s.width=s.height=64;let t=s.getContext("2d");if(t){let n=t.createRadialGradient(32,32,0,32,32,32);n.addColorStop(0,"rgba(255,248,232,1)"),n.addColorStop(.35,"rgba(255,240,215,0.55)"),n.addColorStop(1,"rgba(255,240,215,0)"),t.fillStyle=n,t.fillRect(0,0,64,64)}let e=new dn(s);return e.colorSpace=Zt,e}function uv(s){let t=document.createElement("canvas");t.width=512,t.height=128;let e=t.getContext("2d");if(e){for(let r=0;r<46;r++){let a=s()*512,o=50+s()*50,l=30+s()*70;for(let c of[-512,0,512]){let h=e.createRadialGradient(a+c,o,0,a+c,o,l);h.addColorStop(0,"rgba(205,200,190,0.20)"),h.addColorStop(1,"rgba(205,200,190,0)"),e.fillStyle=h,e.fillRect(a+c-l,o-l,l*2,l*2)}}let i=e.createLinearGradient(0,0,0,128);i.addColorStop(0,"rgba(0,0,0,1)"),i.addColorStop(.35,"rgba(0,0,0,0)"),i.addColorStop(.9,"rgba(0,0,0,0)"),i.addColorStop(1,"rgba(0,0,0,1)"),e.globalCompositeOperation="destination-out",e.fillStyle=i,e.fillRect(0,0,512,128)}let n=new dn(t);return n.wrapS=ks,n.colorSpace=Zt,n}var ga=class{constructor(t,e,n=0){this.config=e;this.floorY=n;R(this,"root",new Fe);R(this,"dust");R(this,"dustBase");R(this,"dustPhase");R(this,"drips",[]);R(this,"dripLines");R(this,"fogs",[]);R(this,"textures",[]);R(this,"time",0);R(this,"slow",!1);let i=cv(17),r=hv(),a=uv(i);this.textures.push(r,a);let o=e.dust;this.dustBase=new Float32Array(o.count*3),this.dustPhase=new Float32Array(o.count);for(let p=0;p<o.count;p++)this.dustBase[p*3]=(i()-.5)*o.width,this.dustBase[p*3+1]=n+i()*o.height,this.dustBase[p*3+2]=o.far+i()*(o.near-o.far),this.dustPhase[p]=i()*Math.PI*2;let l=new Qe;l.setAttribute("position",new Ne(new Float32Array(this.dustBase),3)),this.dust=new na(l,new Vs({map:r,size:o.size,sizeAttenuation:!0,transparent:!0,opacity:o.opacity,depthWrite:!1,blending:Hn,fog:!1})),this.dust.frustumCulled=!1,this.dust.renderOrder=40,this.root.add(this.dust);let c=e.drips,h=new Qe;h.setAttribute("position",new Ne(new Float32Array(c.count*6),3)),this.dripLines=new ea(h,new zs({color:13621728,transparent:!0,opacity:c.opacity,depthWrite:!1,fog:!1})),this.dripLines.frustumCulled=!1,this.root.add(this.dripLines);let u=new ia(.42,.5,32);u.rotateX(-Math.PI/2);for(let p=0;p<c.count;p++){let g=new Le({color:14213866,transparent:!0,opacity:0,depthWrite:!1,fog:!1}),y=new ce(u,g),m=(i()-.5)*c.width,f=c.depthMin+i()*(c.depthMax-c.depthMin);y.position.set(m,n+.01,f),this.root.add(y),this.drips.push({x:m,z:f,y:n+i()*(c.top-n),ring:-1,mesh:y,material:g})}let d=e.fog;for(let p=0;p<d.layers;p++){let g=a.clone();g.needsUpdate=!0,g.repeat.set(1.5,1),this.textures.push(g);let y=new Le({map:g,transparent:!0,opacity:d.opacity,depthWrite:!1,fog:!1}),m=new ce(new Oe(d.width,d.height),y),f=d.layers>1?p/(d.layers-1):.5;m.position.set(0,n+d.height*.35,d.depthMin+f*(d.depthMax-d.depthMin)),m.renderOrder=5,this.root.add(m),this.fogs.push({mesh:m,material:y,speed:d.speed*(.6+.4*(p+1))*(p%2===0?1:-1)})}t.add(this.root)}update(t,e){if(!this.root.visible)return;let n=Math.min(.05,t),i=this.slow?1/3:1;this.time+=n*i;let r=this.config.dust,a=this.dust.geometry.getAttribute("position");for(let h=0;h<r.count;h++){let u=this.dustPhase[h]??0,d=this.dustBase[h*3]??0,p=this.dustBase[h*3+1]??0,g=this.dustBase[h*3+2]??0,y=this.floorY+(p-this.floorY+this.time*r.rise*(.6+.4*Math.sin(u)))%r.height,f=((d+Math.sin(this.time*.3+u)*r.drift*2+this.time*r.drift*.3+r.width/2)%r.width+r.width)%r.width-r.width/2;a.setXYZ(h,f,y,g)}a.needsUpdate=!0;let o=this.config.drips,l=this.dripLines.geometry.getAttribute("position");this.drips.forEach((h,u)=>{if(h.ring>=0){h.ring+=n;let d=h.ring/o.ringTime;h.mesh.scale.setScalar(.2+d*o.ringSize),h.material.opacity=o.opacity*Math.max(0,1-d),d>=1&&(h.ring=-1,h.y=o.top,h.material.opacity=0),l.setXYZ(u*2,h.x,-100,h.z),l.setXYZ(u*2+1,h.x,-100,h.z);return}if(h.y-=o.speed*n,h.y<=this.floorY){h.ring=0;return}l.setXYZ(u*2,h.x,h.y,h.z),l.setXYZ(u*2+1,h.x,h.y+o.length,h.z)}),l.needsUpdate=!0;let c=new hi().setFromQuaternion(e.quaternion,"YXZ").y;for(let h of this.fogs)h.mesh.rotation.set(0,c,0),h.material.map&&(h.material.map.offset.x+=h.speed*n*i*.05)}dispose(){this.root.removeFromParent(),this.dust.geometry.dispose(),this.dust.material.dispose(),this.dripLines.geometry.dispose(),this.dripLines.material.dispose();for(let t of this.drips)t.material.dispose();for(let t of this.fogs)t.mesh.geometry.dispose(),t.material.dispose();for(let t of this.textures)t.dispose()}};var dv="http://www.w3.org/2000/svg",fv={"\uD569 \uC2B9\uB9AC":"win","\uD569 \uD328\uBC30":"lose",\uAD50\uCC29:"draw"};function ne(s,t,e=""){let n=document.createElement(s);return t&&(n.className=t),e&&(n.textContent=e),n}function an(s,t={}){let e=document.createElementNS(dv,s);for(let[n,i]of Object.entries(t))e.setAttribute(n,String(i));return e}var ys=8,pv=0,ya=class{constructor(t,e){this.gauge=e;R(this,"root");R(this,"tags",new Map);R(this,"callouts",[]);R(this,"selection",{ally:null,target:null,pickable:[]});R(this,"unit",1);R(this,"kit",null);R(this,"hpPath",null);R(this,"spPath",null);R(this,"reducedMotion",!1);R(this,"onPick",null);this.root=ne("div","overlay3d"),t.append(this.root)}setGaugeKit(t){this.kit=t,this.hpPath=t?new Ms(t.layout.hp.points):null,this.spPath=t?new Ms(t.layout.sp.points):null}file(t){return this.kit?.base?`${this.kit.base}/${t}.png`:null}layer(t,e=""){let n=this.file(t);if(!n||!this.kit)return null;let[i,r]=this.kit.layout.canvas,a=an("image",{href:n,x:0,y:0,width:i,height:r,preserveAspectRatio:"none"});return e&&a.setAttribute("class",e),a}makeGauge(t){let n=this.kit.layout,[i,r]=n.canvas,a=ne("div",`gauge3d ${t}`);a.style.transform=`translate(${-n.anchor[0]/i*100}%, ${-n.anchor[1]/r*100}%)`,a.style.transitionDuration=`${this.gauge.downFade}s`;let o=an("svg",{viewBox:`0 0 ${i} ${r}`,width:"100%",overflow:"visible"});o.style.aspectRatio=`${i} / ${r}`;let l=`g${++pv}`,c=an("defs"),h=(S,x)=>{let I=an("mask",{id:`${l}-${S}`,maskUnits:"userSpaceOnUse",x:-20,y:-20,width:i+40,height:r+40}),N=an("path",{fill:"none",stroke:"#fff","stroke-width":x,"stroke-linejoin":"round","stroke-linecap":"butt"});return I.append(N),c.append(I),N},u=h("hp",n.hp.width+ys),d=h("sp",n.sp.width+ys),p=h("hpl",n.hp.width+ys),g=h("spl",n.sp.width+ys);o.append(c);let y=S=>ws(S?S.prefix(1):[]),m=(S,x,I,N)=>{let L=this.layer(S)??an("path",{d:y(S.includes("hp")?this.hpPath:this.spPath),fill:"none",stroke:I,"stroke-width":N,"stroke-linejoin":"round"});return L.setAttribute("mask",`url(#${l}-${x})`),L},f=(S,x)=>this.layer(S)??an("path",{d:y(x==="hp"?this.hpPath:this.spPath),fill:"none",stroke:"#0b111a","stroke-opacity":.85,"stroke-width":n[x].width+3,"stroke-linejoin":"round",class:"track"});o.append(f("G_hp_track","hp"),f("G_sp_track","sp"));let b=m("G_hp_loss","hpl",n.hp.color,n.hp.width),v=m("G_sp_loss","spl",n.sp.color,n.sp.width);b.setAttribute("class","loss"),v.setAttribute("class","loss"),o.append(b,v),o.append(m("G_hp_fill","hp",n.hp.color,n.hp.width),m("G_sp_fill","sp",n.sp.color,n.sp.width));let E=this.layer("G_frame");E&&o.append(E);let C=an("g",{class:"pips"});o.append(C);let T=this.layer("G_selection","sel"),A=this.layer("G_critical","crit");T&&o.append(T),A&&o.append(A);let X=ne("span","gauge-num");return a.append(o,X),{el:a,svg:o,hpMask:u,spMask:d,hpLossMask:p,spLossMask:g,hpLoss:b,spLoss:v,pips:C,selection:T,critical:A,num:X,hpRatio:null,spRatio:null,lossUntil:0}}setActors(t){for(let e of this.tags.values())e.el.remove(),e.gauge.el.remove();this.tags.clear();for(let e of t){let n=ne("div",`tag3d ${e.side}`);n.addEventListener("click",()=>{this.selection.pickable.includes(e.combatantId)&&this.onPick?.(e.combatantId)});let i=ne("b","",e.name);i.style.setProperty("--fit",String(Math.max(.6,Math.min(1,7/Math.max(1,[...e.name].length)))));let r=ne("small",""),a=ne("div","status"),o=ne("div","plan");n.append(o,i,r,a);let l=this.kit?this.makeGauge(e.side):null;l&&this.root.append(l.el),this.root.append(n),this.tags.set(e.combatantId,{el:n,name:i,note:r,gauge:l??this.emptyGauge(),status:a,plan:o})}}emptyGauge(){let t=ne("div","gauge3d");t.hidden=!0;let e=an("path"),n=an("g");return{el:t,svg:an("svg"),hpMask:e,spMask:e,hpLossMask:e,spLossMask:e,hpLoss:e,spLoss:e,pips:n,selection:null,critical:null,num:ne("span",""),hpRatio:null,spRatio:null,lossUntil:0}}setSelection(t){this.selection=t}setUnit(t){this.unit=t>0?t:1}setGauge(t,e){let n=this.tags.get(t);if(!n||!this.kit)return;let i=this.kit.layout.pip.positions,r=e?Math.min(e.total,i.length):0;if(!e||r<=0){n.gauge.pips.replaceChildren();return}let a=this.kit.layout.pip.scale,o=56*a,l=14*a;n.gauge.pips.replaceChildren(...Al(e.charge,r,e.stage).map((c,h)=>{let[u,d]=i[h],p=this.file(`U12_ultimate_${c}`),g=p?an("image",{href:p,x:u,y:d,width:o,height:l,preserveAspectRatio:"none"}):an("rect",{x:u,y:d,width:o,height:l});return g.setAttribute("class",`pip ${c}`),g}))}setNote(t,e,n=!1){let i=this.tags.get(t);i&&(i.note.textContent=e,i.note.classList.toggle("clash",n&&e!==""))}setStatuses(t,e){let n=this.tags.get(t);n&&n.status.replaceChildren(...e.map(i=>{let r=ne("i","");return r.dataset.id=i.id,r.append(ne("span","",String(i.turns))),r}))}setPlan(t,e){let n=this.tags.get(t);if(!n)return;if(!e){n.plan.replaceChildren();return}let i=ne("span","ap");i.title=`\uD589\uB3D9\uB825 ${e.actionPoints} / ${e.max}`;let r=Math.max(0,-e.actionPoints);for(let o=0;o<e.max;o++)i.append(ne("i",o<e.actionPoints?"on":""));for(let o=0;o<r;o++)i.append(ne("i","debt"));i.append(ne("span",e.actionPoints<0?"n neg":"n",String(e.actionPoints)));let a=ne("span","steps");e.idle&&a.append(ne("em","idle","\uD589\uB3D9 \uC5C6\uC74C")),e.steps.forEach((o,l)=>{let c=ne("em",`step ${o.slot.toLowerCase()}${l===0?" now":""}`);c.append(ne("span","k",String(l+1)),o.name),a.append(c)}),n.plan.replaceChildren(i,a)}callout(t,e,n,i,r,a){let o=fv[n],l=ne("div",o?`callout3d plate ${o}${e?"":" lose"}`:e?"callout3d":"callout3d lose");l.append(ne("b","",n)),i&&l.append(ne("small","",i)),l.style.animationDuration=`${a}s`,this.root.append(l),this.callouts.push({el:l,combatantId:t,until:r+a})}number(t,e,n){if(!t)return;let i=ne("div",`num3d ${n}`,e);i.style.left=`${t.x*100}%`,i.style.top=`${t.y*100}%`,this.root.append(i),window.setTimeout(()=>i.remove(),1300)}setCombat(t){this.root.classList.toggle("combat",t)}flash(t,e){if(this.reducedMotion)return;let n=ne("div","flash3d");n.style.setProperty("--a",String(t)),n.style.animationDuration=`${e}s`,this.root.append(n),window.setTimeout(()=>n.remove(),e*1e3+50)}powerClash(t,e,n,i){if(!t)return;let r=ne("div",`clash3d${i?` win-${i}`:" draw"}${this.reducedMotion?" still":""}`);r.style.left=`${t.x*100}%`,r.style.top=`${t.y*100}%`,r.append(ne("b","l",String(e)),ne("i","",":"),ne("b","r",String(n))),this.root.append(r),window.setTimeout(()=>r.remove(),900)}update(t,e,n,i,r=()=>null,a=()=>null){let o=this.root.clientHeight||1,l=this.selection;for(let[c,h]of this.tags){let u=h.gauge;if(!this.kit||!this.hpPath||!this.spPath)break;let d=r(c),p=t(c),g=a(c);if(u.el.hidden=!d||!g,!d||!g)continue;let y=p?Math.abs(d.y-p.y)*o:0,m=Math.max(this.gauge.minWidth,Math.min(this.gauge.maxWidth,y/this.unit*this.gauge.widthRatio));u.el.style.width=`${m*this.unit}px`,u.el.style.left=`${d.x*100}%`,u.el.style.top=`${d.y*100}%`;let f=e(c),b=f?0:Ss(g.maxHp>0?g.hp/g.maxHp:0),v=Ss(g.maxMentality>0?g.mentality/g.maxMentality:0),E=(X,S,x,I)=>x===null||I>=x||this.reducedMotion?!1:(S.setAttribute("d",ws(X.segment(I,x))),!0),C=E(this.hpPath,u.hpLossMask,u.hpRatio,b),T=E(this.spPath,u.spLossMask,u.spRatio,v);(C||T)&&(u.lossUntil=n+this.gauge.lossSeconds),C&&u.hpLoss.classList.add("on"),T&&u.spLoss.classList.add("on"),n>=u.lossUntil&&(u.hpLoss.classList.remove("on"),u.spLoss.classList.remove("on")),u.hpRatio!==b&&u.hpMask.setAttribute("d",ws(Pa(this.hpPath.prefix(b),ys,!0,b>=1))),u.spRatio!==v&&u.spMask.setAttribute("d",ws(Pa(this.spPath.prefix(v),ys,!0,v>=1))),u.hpRatio=b,u.spRatio=v;let A=l.ally===c||l.target===c;u.el.classList.toggle("picked",A),u.selection?.classList.toggle("on",A),u.critical?.classList.toggle("on",!f&&b>0&&b<=this.gauge.criticalRatio),u.num.textContent=A?`\uCCB4\uB825 ${Math.max(0,Math.round(g.hp))}/${g.maxHp} \xB7 \uC815\uC2E0\uB825 ${Math.round(g.mentality)}`:"",u.el.classList.toggle("down",f)}for(let[c,h]of this.tags){let u=t(c);h.el.hidden=!u,u&&(h.el.style.left=`${u.x*100}%`,h.el.style.top=`${u.y*100}%`,h.el.classList.toggle("down",e(c)),h.el.classList.toggle("pickable",l.pickable.includes(c)),h.el.classList.toggle("picked",l.ally===c||l.target===c))}for(let c of[...this.callouts]){if(n>=c.until){c.el.remove(),this.callouts.splice(this.callouts.indexOf(c),1);continue}let h=t(c.combatantId);h&&(c.el.style.left=`${h.x*100}%`,c.el.style.top=`${(h.y-i)*100}%`)}}clear(){for(let t of this.callouts)t.el.remove();this.callouts=[];for(let t of this.root.querySelectorAll(".num3d"))t.remove()}};var mv=Math.PI/180;function gv(){let s=document.createElement("canvas");s.width=128,s.height=16;let t=s.getContext("2d");if(t){let n=t.createLinearGradient(0,0,128,0);n.addColorStop(0,"rgba(255,110,20,0)"),n.addColorStop(.55,"rgba(255,170,40,0.75)"),n.addColorStop(.9,"rgba(255,230,120,1)"),n.addColorStop(1,"rgba(255,252,220,1)"),t.fillStyle=n,t.beginPath(),t.moveTo(0,8),t.lineTo(110,3),t.quadraticCurveTo(128,8,110,13),t.closePath(),t.fill()}let e=new dn(s);return e.colorSpace=Zt,e}function yv(){let t=document.createElement("canvas");t.width=t.height=128;let e=t.getContext("2d");if(e){let i=e.createRadialGradient(64,64,0,64,64,64);i.addColorStop(0,"rgba(255,255,235,1)"),i.addColorStop(.25,"rgba(255,220,110,0.9)"),i.addColorStop(.6,"rgba(255,140,30,0.25)"),i.addColorStop(1,"rgba(0,0,0,0)"),e.fillStyle=i,e.fillRect(0,0,128,128)}let n=new dn(t);return n.colorSpace=Zt,n}var va=class{constructor(t,e){this.scene=t;this.config=e;R(this,"streak",gv());R(this,"core",yv());R(this,"sparks",[]);R(this,"flashes",[]);R(this,"seed",1)}rand(){return this.seed=this.seed*16807%2147483647,this.seed/2147483647}burst(t,e,n,i){let r=this.config,a=new Hs(new fs({map:this.core,transparent:!0,depthWrite:!1,depthTest:!1,blending:Hn})),o=r.coreSize*(n?1.25:1);a.position.copy(t),a.scale.setScalar(o),a.renderOrder=i+2,this.scene.add(a),this.flashes.push({sprite:a,t:0,life:r.coreLife,size:o});let l=n?r.countClash:r.countHit,c=r.coneDeg*(n?1.4:1)*mv;for(let h=0;h<l;h++){let d=(this.rand()<r.backShare?Math.PI:0)+(this.rand()-.5)*c+.25,p=r.speedMin+this.rand()*(r.speedMax-r.speedMin),g=new D(Math.cos(d)*e*p,Math.sin(d)*p*.9+1.5,(this.rand()-.5)*p*.6),y=new Hs(new fs({map:this.streak,transparent:!0,depthWrite:!1,depthTest:!1,blending:Hn}));y.renderOrder=i+2,y.position.copy(t),this.scene.add(y),this.sparks.push({sprite:y,pos:t.clone(),vel:g,t:0,life:r.lifeMin+this.rand()*(r.lifeMax-r.lifeMin),width:r.width*(.7+this.rand()*.6)})}}step(t,e,n,i){let r=this.config;for(let l of[...this.flashes]){l.t+=t;let c=l.t/l.life;if(c>=1){this.remove(l.sprite),this.flashes.splice(this.flashes.indexOf(l),1);continue}l.sprite.scale.setScalar(l.size*(1+.2*c)),l.sprite.material.opacity=1-c*c}let a=new D,o=new D;for(let l of[...this.sparks]){l.t+=t;let c=l.t/l.life;if(c>=1){this.remove(l.sprite),this.sparks.splice(this.sparks.indexOf(l),1);continue}l.vel.y-=r.gravity*t,l.vel.multiplyScalar(Math.exp(-r.drag*t)),l.pos.addScaledVector(l.vel,t);let h=l.vel.length(),u=Math.max(l.width*1.5,h*r.length);a.copy(l.pos).project(e),o.copy(l.pos).addScaledVector(l.vel,.01).project(e),l.sprite.material.rotation=Math.atan2((o.y-a.y)*i,(o.x-a.x)*n),l.sprite.position.copy(l.pos).addScaledVector(l.vel,-.5*u/Math.max(.001,h)),l.sprite.scale.set(u,l.width*(1-.5*c),1),l.sprite.material.opacity=1-c*c}}remove(t){this.scene.remove(t),t.material.dispose()}clear(){for(let t of this.flashes)this.remove(t.sprite);for(let t of this.sparks)this.remove(t.sprite);this.flashes=[],this.sparks=[]}};var iu={ally:"#6f9bbd",enemy:"#b3262b"},Xs=class extends Error{},xa=class{constructor(t,e,n,i,r,a,o,l,c,h=new Map,u=new Map,d=null){this.canvas=t;this.config=n;this.sprites=a;this.frameImages=o;this.skillInfo=l;this.sound=c;this.voices=u;R(this,"renderer");R(this,"scene",new Qr);R(this,"camera");R(this,"rig");R(this,"clock",new ua);R(this,"sparks");R(this,"overlay");R(this,"backdrop");R(this,"zones",null);R(this,"uiUnit",1);R(this,"envFx");R(this,"mapSurface");R(this,"envSurface",null);R(this,"envSerial",0);R(this,"lab",null);R(this,"ambient");R(this,"speed",1);R(this,"dimToken",0);R(this,"dimKnob",{stage:this,value:1,get v(){return this.value},set v(t){this.value=t,this.stage.applyBrightness(t)}});R(this,"actors",new Map);R(this,"queue",[]);R(this,"running",!1);R(this,"epoch",0);R(this,"raycaster",new sa);R(this,"textures",new Map);R(this,"worldPerPixel",new Map);R(this,"cards",new Map);R(this,"kit",{plates:null,completePlates:()=>null,glyphs:{},gauge:null});R(this,"effects");R(this,"cutscene");R(this,"ultimates",new Map);R(this,"foreground");R(this,"foregroundFade",{stage:this,value:1,get v(){return this.value},set v(t){this.value=t;for(let e of this.stage.foreground)e.opacity=t}});R(this,"slowToken",0);this.renderer=new Bs({canvas:t,antialias:!0}),this.renderer.outputColorSpace=Zt,this.renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1)),this.scene.background=new Vt(920587);let p=new Ws(this.scene,i);this.backdrop=p,p.build(r),this.foreground=p.combatHidden,this.camera=new be(p.fov,t.width/t.height,.1,300),this.rig=new la(this.camera,p.homePosition,p.homeLookAt,p.fov,n.camera,n.shake),this.sparks=new va(this.scene,n.sparks),this.mapSurface=i.surface,this.envFx=d?{vfx:d.vfx,layer:new fa(this.scene,d.vfx,d.images,n.layout.characterHeight)}:null,this.ambient=new ga(this.scene,n.ambient),this.overlay=new ya(e,n.footGauge),this.effects=new pa(this.scene,n.layout.characterHeight),this.cutscene=new da(e);for(let[g,y]of h)this.prepareUltimate(g,y);this.resize(),this.preload()}preload(){let t=e=>{e&&this.renderer.initTexture(e)};for(let e of this.sprites.keys())for(let n of this.texturesOf(e)?.values()??[])t(n);for(let e of this.envFx?.layer.allTextures??[])t(e);for(let e of this.ultimates.values()){for(let n of e.effects.values())n.forEach(t);e.environment?.root.traverse(n=>{let i=n.material;i&&!Array.isArray(i)&&t(i.map)})}}prepareUltimate(t,e){let n=this.sprites.get(t);if(!n)return;let i=null,r=null;e.environment&&(i=new Ws(this.scene,e.environment.config),i.build(e.environment.images),i.setOpacity(0),r=xv(e.environment.config,e.environment.images));let a=new Map;for(let o of Object.values(e.art.effects)){let l=n.manifest.effects.find(c=>c.id===o);l&&a.set(o,eu(l.frames.map(c=>e.image(c.file))))}this.ultimates.set(t,{art:e.art,environment:i,fade:{v:0,backdrop:i},effects:a,background:r,foreground:e.image(e.art.cutscene.foreground),line:e.image(e.art.cutscene.line),surface:e.environment?.config.surface??null})}slotOf(t){return this.skillInfo(t).slot}resize(){let t=this.canvas.getBoundingClientRect(),e=Math.max(1,Math.round(t.width)),n=Math.max(1,Math.round(t.height));this.renderer.setSize(e,n,!1),this.camera.aspect=e/n,this.camera.updateProjectionMatrix(),this.reframe()}setFrameZones(t,e){this.zones=t,this.uiUnit=e>0?e:1,this.overlay.setUnit(this.uiUnit),this.reframe()}reframe(t=!1){let e=this.zones;if(!e)return;let n=this.canvas.getBoundingClientRect(),i=Math.max(1,n.width),r=Math.max(1,n.height),a=this.config.framing,o=this.uiUnit,l=e.home,c={left:l.left+a.sideMargin*o/i,right:l.right-a.sideMargin*o/i,top:l.top+a.tagMargin*o/r,bottom:l.bottom-a.footMargin*o/r},h=this.config.layout.characterHeight,u=[];for(let m of this.actors.values()){if(m.doll.down)continue;let{x:f,z:b}=m.doll.home;u.push([f-a.bodyHalfWidth*h,0,b],[f+a.bodyHalfWidth*h,0,b],[f,a.headHeight*h,b])}let d=this.backdrop.homePosition,p=this.backdrop.homeLookAt,g=Zh({eye:[d.x,d.y,d.z],target:[p.x,p.y,p.z],baseFov:this.backdrop.fov,aspect:i/r,points:u,rect:c,maxZoomOut:a.maxZoomOut,cover:a.cover});this.rig.setHome(g.fov,g.offsetX,g.offsetY);let y=ul(e.focus);this.rig.setFocusShift(y.offsetX,y.offsetY),t&&this.rig.snapHome()}texturesOf(t){let e=this.textures.get(t);if(e)return e;let n=this.sprites.get(t);if(!n)return null;let i=new Map,r=new Map;for(let a of n.manifest.frames){let o=this.frameImages(t,a.file);if(!o)continue;let l=`${a.file}|${a.bbox.join(",")}`,c=r.get(l)??nu(o,a,n.manifest.canvas.width,this.config.layout.textureMaxSide);r.set(l,c),i.set(a.id,c)}return this.textures.set(t,i),this.worldPerPixel.set(t,this.config.layout.characterHeight/n.characterHeight),i}reset(t){this.epoch+=1,this.queue=[],this.running=!1,this.clock.clear(),this.sparks.clear(),this.envFx?.layer.clear(),this.envSurface=null,this.dimToken+=1,this.dimKnob.v=1,this.scene.background=new Vt(920587),this.overlay.clear();for(let i of this.cards.keys())i.dispose();this.cards.clear(),this.effects.clear(),this.cutscene.clear();for(let i of this.ultimates.values())i.environment?.setOpacity(0);for(let i of this.actors.values())this.scene.remove(i.doll.root);this.actors.clear();let e=this.config.layout,n={ally:0,enemy:0};for(let i of t){let r=this.sprites.get(i.artId),a=this.texturesOf(i.artId);if(!r||!a)continue;let o=n[i.side]++,l=i.side==="ally"?-1:1,c=new ma(i.combatantId,r,a,this.worldPerPixel.get(i.artId)??1,10+o);c.home.set(l*(e.sideHalfGap+o*e.rowOutward),0,-o*e.rowDepth),c.setFacing(i.side==="ally"?1:-1),c.reset(),this.scene.add(c.root),this.actors.set(i.combatantId,{entry:i,doll:c,hp:i.hp,mentality:i.mentality})}this.overlay.setActors(t.filter(i=>this.actors.has(i.combatantId))),this.foregroundFade.v=1,this.reframe(),this.rig.snapHome()}play(t){this.queue.push(...t),this.running||this.run(this.epoch)}get idle(){return!this.running&&this.queue.length===0}async run(t){this.running=!0;try{for(;this.queue.length>0&&t===this.epoch;){let e=this.queue.shift();if(e.kind!=="state"&&!this.stepOnStage(e)){this.applyAll(vv(e));continue}e.kind!=="state"&&this.enterExchange(e.kind==="oneSided"?[e.attackerId,e.targetId]:[e.attackerId,e.defenderId]),e.kind==="oneSided"?await this.playOneSided(e,t):e.kind==="clash"?await this.playClash(e,t):this.applyState(e.event)}t===this.epoch&&this.leaveExchange()}catch(e){e instanceof Xs||console.error(e)}finally{t===this.epoch&&(this.running=!1)}}stepOnStage(t){return(t.kind==="oneSided"?[t.attackerId,t.targetId]:[t.attackerId,t.defenderId]).every(n=>this.actors.has(n))}enterExchange(t){let e=this.config.motion;this.clock.tween(this.foregroundFade,"v",0,e.foregroundFade);for(let[n,i]of this.actors)this.setShown(i.doll,t.includes(n))}leaveExchange(){this.clock.tween(this.foregroundFade,"v",1,this.config.motion.foregroundFade);for(let t of this.actors.values())this.setShown(t.doll,!0)}setShown(t,e){let n=this.config.motion;if(t.hidden===!e)return;t.hidden=!e;let i=e?t.down?n.downOpacity:1:0;this.clock.tween(t.fade,"v",i,n.bystanderFade)}async wait(t,e){let n=await t;if(e!==this.epoch)throw new Xs;return n}actor(t){let e=this.actors.get(t);if(!e)throw new Xs;return e}applyState(t){if(t.type==="damageApplied"){let e=this.actors.get(t.combatantId);e&&(e.hp=t.hp)}else if(t.type==="statusTicked"){let e=this.actors.get(t.combatantId);e&&(e.hp=Math.max(0,e.hp-t.damage),this.overlay.number(this.headPoint(t.combatantId,.2),String(t.damage),""))}else if(t.type==="mentalityChanged"){let e=this.actors.get(t.combatantId);e&&(e.mentality=t.mentality)}else if(t.type==="defeated"){let e=this.actors.get(t.combatantId);e&&!e.doll.down&&this.fallDown(e,this.epoch).catch(()=>{})}}applyAll(t){for(let e of t)this.applyState(e)}dir(t,e){return Math.sign(e.root.position.x-t.root.position.x)||t.facing}chest(t){return t.chest(this.config.layout.characterHeight*.5)}windup(t,e,n){return t.showFrame(e),this.clock.tween(t.visual.position,"x",t.toLocalX(-n*this.config.motion.windupBack),this.config.motion.windupTime)}dash(t,e,n,i){t.setPose("dash"),this.dashSound(t);let r=Math.sign(e-t.root.position.x)||t.facing;return this.envEvent("dashStart",t,r),we(this.clock.tween(t.root.position,"x",e,i,ue.inQuad),this.clock.tween(t.root.position,"z",n,i,ue.inQuad),this.clock.tween(t.visual.position,"x",0,i)).then(()=>this.envEvent("brake",t,r))}strike(t,e,n){return t.showFrame(e),this.clock.tween(t.visual.position,"x",t.toLocalX(n*this.config.motion.strikeReach),this.config.motion.strikeTime,ue.outBack)}hitSegments(t,e){let n=e.map((i,r)=>t.catalog.frame(i).impact?r:-1).filter(i=>i>=0);return n.length===0&&n.push(e.length>1?1:0),n.map((i,r)=>e.slice(i,n[r+1]??e.length))}frameSeconds(t,e,n){let i=t.catalog.frame(e).ms;return i!==null?i/1e3:this.config.motion.strikeTrailTime/Math.max(1,n)}async playSegment(t,e,n,i=!1){let r=e.length-1,a=e.slice(1),o=i&&a.length>1?a.length-1:-1,l=Gh(a.filter((h,u)=>u!==o).map(h=>this.frameSeconds(t,h,r)),this.config.motion.decayEase);await this.wait(this.clock.waitGame(this.frameSeconds(t,e[0],r)),n);let c=0;for(let[h,u]of a.entries()){if(t.down)return;t.showFrame(u),this.frameVoice(t,u);let d=h===o?this.frameSeconds(t,u,r):l[c++]??0;await this.wait(this.clock.waitGame(d),n)}}nudge(t,e){let n=this.config.motion;return t.setPose("hurt"),this.clock.tween(t.root.position,"x",t.root.position.x+e*n.hitKnock,n.knockTime,ue.outExpo)}worldX(t){return t.root.position.x+t.visual.position.x*t.root.scale.x}async playHits(t,e,n,i,r,a,o,l){let c=this.config.motion,h=this.dir(t,e),u=this.hitSegments(t,n),d=u.map(()=>[]);for(let m=0;m+1<u.length;m++){let f=u[m];for(;f.length>1&&t.catalog.frame(f[f.length-1]).windup;)d[m+1].unshift(f.pop())}let p=La(i,u.length),g=n.length>1&&u[0]?.[0]===n[0];g||(t.showFrame(n[0]),await this.wait(this.clock.waitGame(c.readyHold),l));let y=this.lab?this.config.lab:null;for(let m=0;m<u.length;m++){let f=u[m],b=m===u.length-1;if(m>0&&!e.down&&Math.abs(this.worldX(e)-this.worldX(t))>c.contactGap*1.25){let x=this.worldX(e)-h*c.contactGap,I=Math.max(c.followTime,Math.abs(x-this.worldX(t))/c.followSpeed);t.setPose("dash"),this.dashSound(t),this.envEvent("dashStart",t,h),await this.wait(we(this.clock.tween(t.root.position,"x",x,I,ue.inOutQuad),this.clock.tween(t.root.position,"z",e.root.position.z,I,ue.inOutQuad)),l),this.envEvent("brake",t,h)}y&&b&&m>0&&await this.wait(this.clock.waitGame(y.finalBeatPause),l);for(let x of d[m]??[])t.showFrame(x),await this.wait(this.clock.waitGame(this.frameSeconds(t,x,f.length)),l);let v=g&&m===0?this.voiceOf(t)?.parry??null:this.voiceOf(t)?.frames[f[0]]??null,E=this.chest(t).lerp(this.chest(e),this.config.sparks.contactBias);this.voice(t,v,{impactIn:this.wallSeconds(c.strikeTime),at:E,gain:y?b?y.voiceGain.final:y.voiceGain.intermediate:1}),g&&m===0?(t.showFrame(f[0]),o?(e.showFrame(o),await this.wait(this.clock.tween(e.visual.position,"x",e.toLocalX(-h*c.parryLunge),c.strikeTime,ue.outBack),l)):await this.wait(this.strike(t,f[0],h),l)):await this.wait(this.strike(t,f[0],h),l);let C=this.chest(t).lerp(this.chest(e),this.config.sparks.contactBias),T=p[m]??0;if(this.impact(C,e,h,T,!1,b?r:[],b?i:0,!0,b?"heavy":"light"),b&&i>0&&this.envEvent("finalHit",e,h,C),m===0)for(let x of a)this.fadeCard(x);let A=y&&b?this.clock.waitGame(y.attackerHold).then(()=>this.playSegment(t,f,l,!0)):this.playSegment(t,f,l,b),X=[this.clock.tween(t.visual.position,"x",0,c.knockTime),A];e.down||(b?i>0&&X.push(this.knockback(e,h,i,i>=c.heavyDamage,l)):X.push(this.nudge(e,h),this.clock.tween(e.visual.position,"x",0,c.knockTime)));let S=b?Math.min(c.knockMax,c.knockBase+i*c.knockPerDamage):c.hitKnock;e.down||this.rig.focus(this.chest(t),this.chest(e).add(new D(h*S,0,0)),h),await this.wait(we(X),l)}await this.wait(this.clock.waitReal(c.lingerAfterHit),l)}async knockback(t,e,n,i,r){let a=this.config.motion;t.setPose("hurt");let o=Math.min(a.knockMax,a.knockBase+n*a.knockPerDamage);await this.wait(we(this.clock.tween(t.visual.position,"x",t.toLocalX(e*o),a.knockTime,ue.outExpo),this.clock.tween(t.visual.position,"y",i?a.staggerDrop:0,a.knockTime,ue.outExpo)),r),this.envEvent("knockLand",t,e,null,i),i&&this.envEvent("heavyLand",t,e),i&&await this.wait(this.clock.waitGame(a.staggerHold),r)}springBack(t){let e=this.config.motion;if(t.down)return Promise.resolve();t.setPose("retreat");let n=ue.outElastic(e.settleAmplitude,e.settlePeriod);return we(this.clock.tween(t.visual.position,"x",0,e.settleTime,n),this.clock.tween(t.visual.position,"y",0,e.settleTime,n))}returnHome(t){let e=this.config.motion;return t.down?Promise.resolve():(t.setPose("retreat"),we(this.clock.tween(t.root.position,"x",t.home.x,e.returnTime,ue.outCubic),this.clock.tween(t.root.position,"z",t.home.z,e.returnTime,ue.outCubic),this.clock.tween(t.visual.position,"x",0,e.returnTime),this.clock.tween(t.visual.position,"y",0,e.returnTime)))}async fallDown(t,e){let n=this.config.motion,i=t.doll;i.down=!0,i.setPose("hurt"),this.sound.play("down"),this.envEvent("down",i,1),await this.wait(we(this.clock.tween(i.visual.position,"y",-n.downSink,n.downTime,ue.outCubic),this.clock.tween(i.fade,"v",i.hidden?0:n.downOpacity,n.downTime)),e)}async reviewEnvFx(t){let e=this.envFx,n=[...this.actors.values()],i=n.find(l=>l.entry.side==="ally")?.doll,r=n.find(l=>l.entry.side==="enemy")?.doll;if(!e||!i||!r)return;let a=this.epoch,o=[null,...[...this.ultimates.values()].filter(l=>l.environment)];try{for(;;)for(let l of o){for(let c of this.ultimates.values())c.environment?.setOpacity(c===l?1:0);this.envSurface=l?.surface??null;for(let c of e.vfx.events.keys()){let h=e.vfx.events.get(c)?.surfaces.includes(this.surface.kind)??!1;t(`${this.surface.kind} \xB7 ${c}${h?"":" (\uC774 \uC9C0\uD615\uC5D0\uC11C\uB294 \uC548 \uB0C4)"}`),this.rig.focus(this.chest(i),this.chest(r),1),this.envEvent(c,r,1,this.chest(i).lerp(this.chest(r),.5),c==="knockLand"),await this.wait(this.clock.waitReal(1.3),a)}}}catch{}finally{for(let l of this.ultimates.values())l.environment?.setOpacity(0);this.envSurface=null}}get surface(){return this.envSurface??this.mapSurface}envEvent(t,e,n,i=null,r=!1){let a=this.envFx,o=a?.vfx.events.get(t);if(!a||!o)return;let l=this.surface;if(!o.surfaces.includes(l.kind))return;for(let h of o.spawns){let u=h.anchor==="contact"?i??(e?this.chest(e):null):h.anchor==="chest"?e?this.chest(e):i:e?this.footOf(e):i;u&&a.layer.spawn(h,u,n,l.tint,l.crack)}let c=a.vfx.camera.presets.get(r&&o.heavyCamera?o.heavyCamera:o.camera);c&&c.duration>0&&this.rig.envImpulse(`${t}:${++this.envSerial}`,c.amplitude,c.duration/1e3,c.zoom,n,this.clock.realNow,a.vfx.camera.cap)}voiceOf(t){return this.voices.get(t.catalog.manifest.character)??null}voice(t,e,n={}){let i=this.voiceOf(t);if(!i||!e)return!1;let r=(i.lead[e]??0)/1e3,a=n.impactIn!==void 0?Math.max(0,Math.min(.5,n.impactIn-r)):0,o=this.lab&&n.at?this.panOf(n.at):0;return this.sound.playSample?.(`${i.character}/${e}`,(i.gain[e]??1)*(n.gain??1),{delay:a,pan:o})??!1}frameVoice(t,e,n={}){this.voice(t,this.voiceOf(t)?.frames[e]??null,n)}panOf(t){let e=t.clone().project(this.camera);return Math.max(-1,Math.min(1,e.x))*this.config.lab.pan.width}wallSeconds(t){return t/Math.max(.05,this.clock.scale)/Math.max(.1,this.speed)}dashSound(t){this.voice(t,this.voiceOf(t)?.dash??null)||this.sound.play("dash")}hitSlow(t){let e=this.config.motion,n=++this.slowToken;this.clock.setSlowMotion(1),this.clock.waitReal(t).then(()=>{if(n===this.slowToken)return this.clock.setSlowMotion(e.hitSlowScale),this.clock.waitReal(e.hitSlowTime)}).then(()=>{n===this.slowToken&&this.clock.setSlowMotion(1)})}impact(t,e,n,i,r,a,o=i,l=!0,c=null){let h=this.config.shake,u=this.config.hitStop,d=o>=this.config.motion.heavyDamage;l&&this.sparks.burst(t,n,r,10);let p=this.lab&&c?this.config.lab:null,g=p&&c?p.hitStop[c]:r&&i<=0?u.clashSeconds:Math.min(u.maxSeconds,u.baseSeconds+i*u.perDamageSeconds);this.clock.startHitStop(g,u.scale),i>0&&this.hitSlow(g+this.config.motion.knockTime);let y=i>0?Math.min(1,i/h.damageForMaxShake):h.clashPower;this.lab?.reducedMotion&&p||this.rig.impact(p&&c?y*p.shake[c]:y,n);let m=o>i;(d||m||c==="climax"||p&&c==="heavy")&&this.dimBackdrop(),(d||c==="climax")&&!this.lab?.reducedFlash&&this.overlay.flash(this.config.impact.flash.alpha,this.config.impact.flash.seconds),c==="climax"&&!this.lab?.reducedFlash&&this.impactFrame(),this.sound.play(i<=0?"clash":d?"hitHeavy":"hit");let f=this.actors.get(e.combatantId);f&&i>0&&a.length===0&&!r&&(f.hp=Math.max(0,f.hp-i)),this.applyAll(a),i>0&&(this.overlay.number(this.headPoint(e.combatantId,.1),String(i),d?"heavy":m?"last":""),d&&this.overlay.number(this.headPoint(e.combatantId,.55),"\uD750\uD2B8\uB7EC\uC9D0","tag"))}showCallouts(t,e){for(let n of t)e.includes(n.combatantId)&&this.overlay.callout(n.combatantId,n.success,n.title,n.reason,this.clock.realNow,this.config.callout.seconds)}makeCard(t,e){let n=this.actor(e.combatantId).entry,i=this.skillInfo(e.skillId,n.characterId),r=n.side,a=i.attribute?this.kit.glyphs[i.attribute]??null:null,o=new $s({name:i.name,slot:i.slot,frontPower:i.frontPower,backPower:i.backPower,tint:r==="ally"?iu.ally:iu.enemy,glyph:a},this.config.cardFlip.height,this.kit.completePlates(n.characterId,e.skillId)??this.kit.plates);return this.scene.add(o.root),this.cards.set(o,t),o}cardAnchor(t){let e=this.config.cardFlip,n=this.config.layout.characterHeight;return new D(t.root.position.x+t.visual.position.x*t.root.scale.x,n*1.05+t.visual.position.y+e.headLift+e.height/2,t.root.position.z)}async revealCards(t,e){let n=this.config.cardFlip;this.sound.play("flip");let i=[];for(let{card:r,face:a}of t)r.state.spin=0,r.state.dim=0,r.state.opacity=1,this.clock.tweenReal(r.state,"scale",1,n.spinTime*.25,ue.outBack),i.push(this.clock.tweenReal(r.state,"spin",$s.restAngle(a,n.spinTurns),n.spinTime,ue.outCubic));await this.wait(we(i),e),this.sound.play("reveal");for(let{card:r}of t)r.state.scale=1.3;await this.wait(we(t.map(({card:r})=>this.clock.tweenReal(r.state,"scale",1,n.revealPop,ue.outQuad))),e)}showPowerClash(t,e,n,i,r){let a=this.headPoint(t,-.3),o=this.headPoint(e,-.3);if(!a||!o)return;let l=a.x<=o.x,c={x:(a.x+o.x)/2,y:(a.y+o.y)/2},[h,u]=l?[n,i]:[i,n],d=r===null?null:r===t===l?"left":"right";this.overlay.powerClash(c,h,u,d)}dimCard(t){let e=this.config.cardFlip;this.clock.tweenReal(t.state,"dim",1,e.holdTime*.5),this.clock.tweenReal(t.state,"scale",.8,e.holdTime*.5)}async fadeCard(t){t&&(await this.clock.tweenReal(t.state,"opacity",0,this.config.cardFlip.fadeTime),this.cards.delete(t),t.dispose())}approach(t,e,n){let i=this.config.cardFlip,r=(i.spinTime+i.revealPop+i.holdTime)*i.slowScale;t.setPose("dash"),this.dashSound(t),this.envEvent("dashStart",t,Math.sign(e-t.root.position.x)||t.facing);let a=t.root.position.x+(e-t.root.position.x)*i.approachShare,o=t.root.position.z+(n-t.root.position.z)*i.approachShare;return we(this.clock.tween(t.root.position,"x",a,r,ue.linear),this.clock.tween(t.root.position,"z",o,r,ue.linear),this.clock.tween(t.visual.position,"x",0,r))}async playOneSided(t,e){let n=this.actor(t.attackerId).doll,i=this.actor(t.targetId).doll,r=this.config.motion,a=this.config.cardFlip,o=this.dir(n,i),l=n.skillFrames(this.slotOf(t.skillId)),c=i.root.position.x-o*r.contactGap,h=i.root.position.z;this.rig.focus(this.chest(n),this.chest(i),o),await this.wait(this.windup(n,n.poseFrame("dash"),o),e);let u=this.makeCard(n,t.flip);this.clock.setSlowMotion(a.slowScale);let d=this.approach(n,c,h);await this.wait(this.revealCards([{card:u,face:t.flip.face}],e),e),this.showCallouts(t.callouts,[t.attackerId]),await this.wait(this.clock.waitReal(a.holdTime),e),await this.wait(d,e),this.clock.setSlowMotion(1);let p=this.ultimateFor(t.attackerId,t.skillId);if(p){await this.playUltimate(p,n,i,t.damage,t.events,[u],e);return}await this.wait(this.dash(n,c,h,r.dashTime*(1-a.approachShare)),e),this.rig.focus(this.chest(n),this.chest(i),o),await this.wait(this.playHits(n,i,l,t.damage,t.events,[u],null,e),e),this.rig.release();let g=Math.abs(i.root.position.x-i.home.x)>.01;await this.wait(we(g?this.returnHome(i):this.springBack(i),this.returnHome(n)),e),this.settle(n),this.settle(i)}async playClash(t,e){let n=this.actor(t.attackerId).doll,i=this.actor(t.defenderId).doll,r=this.config.motion,a=this.config.cardFlip,o=this.dir(n,i),l=n.skillFrames(this.slotOf(t.attackerSkillId)),c=i.skillFrames(this.slotOf(t.defenderSkillId));this.rig.focus(this.chest(n),this.chest(i),o),await this.wait(we(this.windup(n,n.poseFrame("dash"),o),this.windup(i,i.poseFrame("dash"),-o)),e);let h=(n.root.position.x+i.root.position.x)/2,u=(n.root.position.z+i.root.position.z)/2,d=h-o*r.contactGap/2,p=h+o*r.contactGap/2,g=null,y=null,m=!1;for(let b of t.rounds){g??(g=this.makeCard(n,b.attackerFlip)),y??(y=this.makeCard(i,b.defenderFlip)),this.clock.setSlowMotion(a.slowScale);let v=m?null:we(this.approach(n,d,u),this.approach(i,p,u));if(m&&(n.setPose("guard"),i.setPose("guard")),await this.wait(this.revealCards([{card:g,face:b.attackerFlip.face},{card:y,face:b.defenderFlip.face}],e),e),this.showCallouts(b.callouts,[t.attackerId,t.defenderId]),this.showPowerClash(t.attackerId,t.defenderId,b.attackerFlip.power,b.defenderFlip.power,b.type==="win"?b.loserId===t.attackerId?t.defenderId:t.attackerId:null),b.type==="win"&&this.dimCard(b.loserId===t.attackerId?g:y),await this.wait(this.clock.waitReal(a.holdTime),e),v&&await this.wait(v,e),this.clock.setSlowMotion(1),b.type==="win"){this.applyAll(b.events);break}let E=m?r.reengageTime:r.dashTime*(1-a.approachShare);await this.wait(we(this.dash(n,d,u,E),this.dash(i,p,u,E)),e),this.rig.focus(this.chest(n),this.chest(i),o),await this.wait(we(this.strike(n,l[1]??l[0],o),this.strike(i,c[1]??c[0],-o)),e),this.impact(this.chest(n).lerp(this.chest(i),.5),i,o,0,!0,b.events),this.envEvent("deadlock",null,o,this.chest(n).lerp(this.chest(i),.5)),this.sound.play("clashTie");let C=(T,A)=>(T.setPose("guard"),[this.clock.tween(T.root.position,"x",T.root.position.x+A*r.deadlockPush,r.knockTime,ue.outExpo),this.clock.tween(T.visual.position,"x",0,r.knockTime)]);await this.wait(we(C(n,-o),C(i,o)),e),await this.wait(this.clock.waitGame(r.roundRest),e),m=!0}let f=t.finisher;if(f){let b=this.actor(f.winnerId).doll,v=this.actor(f.loserId).doll,E=this.dir(b,v),C=b.skillFrames(this.slotOf(f.winnerSkillId)),T=this.ultimateFor(f.winnerId,f.winnerSkillId);if(T){await this.playUltimate(T,b,v,f.damage,t.events,[g,y],e);return}v.setPose("guard"),await this.wait(this.dash(b,v.root.position.x-E*r.contactGap,v.root.position.z,m?r.reengageTime:r.dashTime),e),this.rig.focus(this.chest(b),this.chest(v),E);let A=v.skillFrames(this.slotOf(f.loserId===t.attackerId?t.attackerSkillId:t.defenderSkillId));await this.wait(this.playHits(b,v,C,f.damage,t.events,[g,y],A[0],e),e)}else this.applyAll(t.events),this.fadeCard(g),this.fadeCard(y),await this.wait(this.clock.waitReal(r.lingerAfterHit),e);this.rig.release(),await this.wait(we(this.returnHome(n),this.returnHome(i)),e),this.settle(n),this.settle(i)}settle(t){t.down||t.setPose("idle")}ultimateFor(t,e){if(this.slotOf(e)!=="ULT")return null;let n=this.actors.get(t);return!n||n.entry.artId!==n.entry.characterId?null:this.ultimates.get(n.entry.characterId)??null}footOf(t){return new D(t.root.position.x+t.visual.position.x*t.root.scale.x,.02,t.root.position.z+.05)}async playUltimate(t,e,n,i,r,a,o){let l=t.art.timeline,c=this.config.motion,h=this.clock.realNow,u=x=>this.wait(this.clock.waitReal(Math.max(0,h+x-this.clock.realNow)),o),d=this.dir(e,n),p=x=>e.catalog.manifest.effects.find(I=>I.id===x)??null,g=(x,I,N={})=>{let K=p(x),L=t.effects.get(x);return K&&L?this.effects.spawn(K,L,I,e.facing,this.clock.realNow,N):null};e.showFrame(t.art.frames.ready);let y=(x,I)=>this.voice(e,this.voiceOf(e)?.ultimate[x]??null,I?{at:I}:{});y("start"),this.envEvent("ultStart",e,d),this.rig.focus(this.chest(e),this.chest(n),d);let m=g(t.art.effects.pool,this.footOf(e),{hold:!0,order:9});m&&(m.material.opacity=0,this.effects.fade(m,1,l.poolIn,this.clock.realNow)),await u(l.swapEnvironment),t.fade.v=1,this.envSurface=t.surface,t.environment?.setOpacity(1),await u(l.cutsceneStart),this.clock.waitReal(l.cutLine-l.cutsceneStart).then(()=>{this.cutscene.active&&y("cutLine")}),this.cutscene.flash=!this.lab?.reducedFlash,this.cutscene.play(t.art.cutscene,{background:t.background,foreground:t.foreground,line:t.line},this.clock.realNow,l.cutsceneEnd-l.cutsceneStart,l.cutLine-l.cutsceneStart),await u(l.appearBehind),this.effects.fade(m,0,.1,this.clock.realNow),e.root.position.x=n.root.position.x+d*t.art.behindGap,e.root.position.z=n.root.position.z,e.visual.position.set(0,0,0),e.showFrame(t.art.frames.open),this.rig.focus(this.chest(n),this.chest(e),d);let f=t.art.slashes,b=La(i,f.count),v=this.config.layout.characterHeight,E=Promise.resolve(),C=this.lab?this.config.lab.ultimate:null,T=l.sheathClick+(C?C.payoffDelay:0),A=x=>{if(!C)return l.sheathClick+x*f.interval;let I=T;for(let N=0;N<x;N++)I+=C.slashIntervals[Math.min(N,C.slashIntervals.length-1)]??f.interval;return I},X=[{time:C?T:l.water,run:()=>{g(t.art.effects.water,this.footOf(n)),y("water",this.chest(n))}}];C&&X.push({time:l.sheathClick,run:()=>{e.showFrame(t.art.frames.closed),y("sheathClick",this.chest(e));for(let x of a)this.fadeCard(x)}});for(let x=0;x<f.count;x++){let I=x===f.count-1;X.push({time:A(x),run:()=>{if(x===0&&!C){e.showFrame(t.art.frames.closed),y("sheathClick");for(let U of a)this.fadeCard(U)}let[N,K]=f.offset[x%f.offset.length]??[0,0],L=this.chest(n).add(new D(N*v*e.facing,K*v,0));g(t.art.effects.slash,L,{roll:(f.rollDeg[x%f.rollDeg.length]??0)*Math.PI/180});let O=b[x]??0,[q,Z]=I?[1,0]:f.jolt[x%f.jolt.length]??[0,0],W=-d*(q<0?-1:1);this.impact(this.chest(n),n,W,O,!1,I?r:[],I?i:0,!1,I?"climax":"light"),I&&this.envEvent("ultPayoff",n,-d),!n.down&&(I?i>0&&(E=this.knockback(n,-d,i,i>=c.heavyDamage,o)):(n.setPose("hurt"),this.clock.tween(n.visual.position,"x",n.toLocalX(-d*q*v),f.joltTime,ue.outExpo),this.clock.tween(n.visual.position,"y",Z*v,f.joltTime,ue.outExpo)))}})}X.sort((x,I)=>x.time-I.time);for(let x of X)await u(x.time),x.run();await u(l.restoreEnvironment),this.clock.tweenReal(t.fade,"v",0,l.restoreFade),this.envSurface=null,await u(l.end),t.environment?.setOpacity(0),await this.wait(E,o),this.rig.release();let S=Math.abs(n.root.position.x-n.home.x)>.01;await this.wait(we(S?this.returnHome(n):this.springBack(n),this.returnHome(e)),o),this.settle(e),this.settle(n)}tick(t){let e=this.clock.step(t),n=this.canvas.getBoundingClientRect();if(this.sparks.step(e,this.camera,n.width,n.height),this.envFx?.layer.update(t,this.camera),this.ambient.root.visible=this.backdrop.root.visible,this.ambient.slow=(this.lab?.reducedMotion??!1)||this.overlay.reducedMotion,this.ambient.update(t,this.camera),this.lab){let i=this.config.lab.breath,r=0;for(let a of this.actors.values())a.doll.breath=a.doll.idle&&!a.doll.down?i.amplitude*Math.sin((this.clock.realNow/i.period+r)*Math.PI*2):0,r+=.37}this.rig.write(t,this.clock.realNow),this.camera.updateMatrixWorld();for(let i of this.actors.values())i.doll.faceCamera(this.camera);for(let[i,r]of this.cards)i.update(this.cardAnchor(r),this.camera);this.effects.update(this.clock.realNow,this.camera),this.cutscene.update(this.clock.realNow);for(let i of this.ultimates.values())i.fade.v<1&&i.fade.v>0&&i.environment?.setOpacity(i.fade.v);this.overlay.update(i=>this.headPoint(i,0),i=>this.actors.get(i)?.doll.down??!1,this.clock.realNow,this.config.callout.headOffset*.06,i=>this.footPoint(i),i=>{let r=this.actors.get(i);return r?{hp:r.hp,maxHp:r.entry.maxHp,mentality:r.mentality,maxMentality:r.entry.maxMentality}:null}),this.renderer.render(this.scene,this.camera)}footPoint(t){let e=this.actors.get(t);if(!e||e.doll.hidden)return null;e.doll.root.updateMatrixWorld(!0);let n=e.doll.visual.getWorldPosition(new D).project(this.camera);return n.z>1?null:{x:(n.x+1)/2,y:(1-n.y)/2}}headPoint(t,e){let n=this.actors.get(t);if(!n||n.doll.hidden)return null;let i=n.doll,r=this.config.layout.characterHeight,a=new D(i.root.position.x+i.visual.position.x*i.root.scale.x,r*(1.05+e)+i.visual.position.y,i.root.position.z).project(this.camera);return a.z>1?null:{x:(a.x+1)/2,y:(1-a.y)/2}}snapshot(){return[...this.actors.values()].map(t=>({combatantId:t.entry.combatantId,name:t.entry.name,side:t.entry.side,hp:{value:t.hp,max:t.entry.maxHp},mentality:{value:t.mentality,max:t.entry.maxMentality},down:t.doll.down}))}hitTest(t,e){let n=this.canvas.getBoundingClientRect(),i=new Ft((t-n.left)/n.width*2-1,-((e-n.top)/n.height)*2+1);this.raycaster.setFromCamera(i,this.camera);let r=[...this.actors.values()].filter(o=>!o.doll.down&&!o.doll.hidden).map(o=>o.doll.pickTarget).filter(o=>o!==null),a=this.raycaster.intersectObjects(r,!1)[0];return a?a.object.userData.combatantId??null:null}setSelection(t){this.overlay.setSelection(t)}setKit(t){this.kit=t,this.overlay.setGaugeKit(t.gauge)}setStatuses(t,e){this.overlay.setStatuses(t,e)}onTagPick(t){this.overlay.onPick=t}setCombat(t){this.overlay.setCombat(t)}setPlan(t,e){this.overlay.setPlan(t,e)}setNote(t,e,n=!1){this.overlay.setNote(t,e,n)}setLab(t){if(this.lab=t?{...t}:null,this.rig.envMuted=this.lab?.reducedMotion??!1,this.overlay.reducedMotion=(this.lab?.reducedMotion??!1)||typeof matchMedia=="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches,!this.lab)for(let e of this.actors.values())e.doll.breath=0}setSpeed(t){this.speed=t}applyBrightness(t){this.backdrop.setBrightness(t);for(let e of this.ultimates.values())e.environment?.setBrightness(t)}async dimBackdrop(){let t=this.lab?this.config.lab.dim:this.config.impact.dim,e=++this.dimToken;await this.clock.tweenReal(this.dimKnob,"v",t.level,t.in),await this.clock.waitReal(t.hold),e===this.dimToken&&await this.clock.tweenReal(this.dimKnob,"v",1,t.out)}async impactFrame(){let t=[this.backdrop.root,...[...this.ultimates.values()].flatMap(i=>i.environment?[i.environment.root]:[])],e=t.map(i=>i.visible);for(let i of t)i.visible=!1;let n=this.scene.background;this.scene.background=new Vt(15328474);for(let i of this.actors.values())i.doll.setTint(0);await this.clock.waitReal(this.config.lab.impactFrame.seconds),t.forEach((i,r)=>i.visible=e[r]??i.visible),this.scene.background=n;for(let i of this.actors.values())i.doll.setTint(16777215)}setGauge(t,e){this.overlay.setGauge(t,e)}};function vv(s){return s.kind==="oneSided"?s.events:[...s.rounds.flatMap(t=>t.events),...s.events]}function xv(s,t){let[e,n]=s.viewport,i=document.createElement("canvas");i.width=e,i.height=n;let r=i.getContext("2d");if(!r)return i;for(let a of[...s.layers].sort((o,l)=>o.order-l.order)){let o=t.get(a.file);if(!o)continue;let l=o.naturalWidth>0?o.naturalWidth/e:1;if(a.draws.length>0)for(let c of a.draws){let[h,u,d,p]=c.source;r.drawImage(o,h*l,u*l,d*l,p*l,...c.destination)}else{let[c,h,u,d]=a.rect;r.drawImage(o,c*e,h*n,u*e,d*n)}}return i}function su(){let s=document;return s.fullscreenElement??s.webkitFullscreenElement??null}function bv(s){let t=document,e=s;return(t.fullscreenEnabled??t.webkitFullscreenEnabled??!1)&&(typeof e.requestFullscreen=="function"||typeof e.webkitRequestFullscreen=="function")}async function _v(s){let t=document,e=s;try{if(su()){t.exitFullscreen?await t.exitFullscreen():t.webkitExitFullscreen?.();return}e.requestFullscreen?await e.requestFullscreen({navigationUI:"hide"}):e.webkitRequestFullscreen?.(),await screen.orientation.lock?.("landscape").catch(()=>{})}catch{}}function ru(s,t){if(!t||(t.hidden=!bv(s),t.hidden))return;let e=()=>{let n=su()===s;t.setAttribute("aria-pressed",String(n)),t.setAttribute("aria-label",n?"\uC804\uCCB4\uD654\uBA74 \uB044\uAE30":"\uC804\uCCB4\uD654\uBA74"),t.title=n?"\uC804\uCCB4\uD654\uBA74 \uB044\uAE30":"\uC804\uCCB4\uD654\uBA74"};t.addEventListener("click",()=>void _v(s)),document.addEventListener("fullscreenchange",e),document.addEventListener("webkitfullscreenchange",e),e()}var ba=class{constructor(t=()=>{}){this.onClose=t;R(this,"current",null);R(this,"returnFocus",null);R(this,"background",new Map);window.addEventListener("keydown",e=>{let n=this.current;if(n){if(e.stopImmediatePropagation(),e.key==="Escape")e.preventDefault(),this.close();else if(e.key==="Tab"){let i=this.focusable(n),r=i[0]??n,a=i[i.length-1]??n;e.shiftKey&&(document.activeElement===r||document.activeElement===n)?(e.preventDefault(),a.focus({preventScroll:!0})):!e.shiftKey&&(document.activeElement===a||document.activeElement===n)&&(e.preventDefault(),r.focus({preventScroll:!0}))}}},{capture:!0});for(let e of["pointerdown","click"])window.addEventListener(e,n=>{!this.current||n.target instanceof Node&&this.current.contains(n.target)||(n.preventDefault(),n.stopImmediatePropagation())},{capture:!0});window.addEventListener("focusin",e=>{!this.current||e.target instanceof Node&&this.current.contains(e.target)||(this.focusable(this.current)[0]??this.current).focus({preventScroll:!0})})}get isOpen(){return this.current!==null}open(t,e){if(!(!t||t===this.current)){this.close(),this.returnFocus=e??(document.activeElement instanceof HTMLElement?document.activeElement:null),this.current=t,t.hidden=!1,t.setAttribute("aria-modal","true"),t.tabIndex=-1;for(let n=t;n?.parentElement;n=n.parentElement)for(let i of n.parentElement.children)!(i instanceof HTMLElement)||i===n||(this.background.set(i,i.inert),i.inert=!0);(this.focusable(t)[0]??t).focus({preventScroll:!0})}}close(){let t=this.current;if(t){this.current=null,t.hidden=!0,t.removeAttribute("aria-modal");for(let[e,n]of this.background)e.inert=n;this.background.clear(),this.returnFocus?.focus({preventScroll:!0}),this.returnFocus=null,this.onClose(t)}}focusable(t){return[...t.querySelectorAll("button, input, select, textarea, a[href], summary, [tabindex]")].filter(e=>e.tabIndex>=0&&!e.matches(":disabled, [inert]")&&e.getClientRects().length>0)}};var ou=document.getElementById("view"),ve=ou?.dataset.assets??"../assets",Sv=ou?.dataset.battle??"../docs/battle-data.json",Sa=class extends Error{constructor(e,n){super(`${e} \uB97C \uC77D\uC744 \uC218 \uC5C6\uB2E4 (${n})`);this.status=n}};async function wn(s){let t=await fetch(s);if(!t.ok)throw new Sa(s,t.status);return t.json()}function _a(s){return new Promise(t=>{let e=new Image;e.onload=()=>t(e),e.onerror=()=>t(null),e.src=s})}async function Mv(s){let[t,e,n]=await Promise.all([wn(Sv),Vl(ve),wn(`${ve}/ui/stage3d.json`)]),i=new js(Sl(t)),r=Wl(n),a=r.battle.map,o=Ba(await wn(`${ve}/${a}/placement.json`)),l=await zl(ve),c=new Map,h=new Set([...r.battle.ally,...r.battle.enemy].map(x=>r.battle.artAlias[x]??x));await Promise.all([...h].map(async x=>{if(!l.has(x))return;let I=await Hl(ve,x);I&&c.set(x,I)}));let u=await wn(`${ve}/index.json`),d=Array.isArray(u.ultimates)?u.ultimates.filter(x=>typeof x=="string"):[],p=new Map;await Promise.all(d.filter(x=>c.has(x)).map(async x=>{let I=kl(await wn(`${ve}/${x}/ultimate.json`)),N=I.environment?Ba(await wn(`${ve}/${I.environment}/placement.json`)):null;p.set(x,{art:I,environment:N})}));let g=Array.isArray(u.sounds)?u.sounds.filter(x=>typeof x=="string"):[],y=new Map,m=new Map;await Promise.all(g.filter(x=>c.has(x)).map(async x=>{let I=Dl(await wn(`${ve}/${x}/sounds.json`));y.set(x,I),await Promise.all(Object.entries(I.files).map(async([N,K])=>{try{let L=await fetch(`${ve}/${x}/${K}`);L.ok&&m.set(`${x}/${N}`,await L.arrayBuffer())}catch{}}))}));let f=null;try{f=Ll(await wn(`${ve}/env-vfx/metadata/manifest.json`),await wn(`${ve}/env-vfx/metadata/camera-presets.json`),await wn(`${ve}/env-vfx/bindings.json`))}catch{f=null}let b=[];for(let x of o.layers)b.push({key:`${a}/${x.file}`,url:`${ve}/${a}/${x.file}`});for(let[x,I]of c)for(let N of I.manifest.frames)b.push({key:`${x}/${N.file}`,url:`${ve}/${x}/${N.file}`});for(let[x,{art:I,environment:N}]of p){let K=new Set(Object.values(I.effects)),L=new Set([I.cutscene.foreground,I.cutscene.line]);for(let O of c.get(x)?.manifest.effects??[])if(K.has(O.id))for(let q of O.frames)L.add(q.file);for(let O of L)b.push({key:`${x}/${O}`,url:`${ve}/${x}/${O}`});if(I.environment&&N)for(let O of N.layers)b.push({key:`${I.environment}/${O.file}`,url:`${ve}/${I.environment}/${O.file}`})}for(let x of f?Da(f):[])b.push({key:`env-vfx/${x}`,url:`${ve}/env-vfx/${x}`});let v=0,E=new Map,C=[];s(`\uADF8\uB9BC 0 / ${b.length}`,0),await Promise.all(b.map(async x=>{let I=await _a(x.url);I?E.set(x.key,I):C.push(x.key),v+=1,s(`\uADF8\uB9BC ${v} / ${b.length}`,v/b.length)}));let T=new Map;for(let x of o.layers){let I=E.get(`${a}/${x.file}`);I&&T.set(x.file,I)}let A=new Map;for(let[x,{art:I,environment:N}]of p){let K=new Map;if(I.environment&&N)for(let L of N.layers){let O=E.get(`${I.environment}/${L.file}`);O&&K.set(L.file,O)}A.set(x,{art:I,environment:N?{config:N,images:K}:null,image:L=>E.get(`${x}/${L}`)??null})}let X=new Map;for(let x of f?Da(f):[]){let I=E.get(`env-vfx/${x}`);I&&X.set(x,I)}let S=f&&X.size>0?{vfx:f,images:X}:null;return{catalog:i,ui:e,stage:r,backdrop:o,backdropImages:T,sprites:c,frames:E,ultimates:A,voices:y,samples:m,envFx:S,missing:C}}var pl=class{constructor(t,e,n){this.catalog=t;this.setup=n;R(this,"battle");R(this,"board");R(this,"ai",new Li);R(this,"aiContext");let i=(a,o)=>o.map((l,c)=>({id:`${a==="ally"?"a":"e"}${c+1}`,characterId:l,side:a})),r=new Ii(t,e);this.aiContext={catalog:t,resolver:r,rng:e},this.board=new Qs(t,this.ai,this.aiContext),this.battle=new Ks(t,i("ally",n.ally),i("enemy",n.enemy),{rng:e,...El(this.board)}),this.board.attach(this.battle)}roster(){return this.battle.combatants.map(t=>{let e=this.setup.artAlias[t.base.id];return{combatantId:t.id,characterId:t.base.id,artId:e??t.base.id,name:e?`${t.base.name} \xB7 \uC790\uB9AC \uD45C\uC2DC`:t.base.name,side:t.side,hp:t.hp,maxHp:t.base.maxHp,mentality:t.mentality,maxMentality:this.catalog.rules.mentalityMax}})}inputAllies(){return this.battle.sideOf("ally").filter(t=>!t.isDefeated&&this.board.needsPlan(t.id)).map(t=>({id:t.id,characterId:t.base.id,deck:[...t.deck],name:t.base.name}))}inputEnemies(){return this.battle.sideOf("enemy").filter(t=>!t.isDefeated).map(t=>({id:t.id,name:t.base.name}))}budgets(){let{floor:t,regenPerTurn:e}=this.catalog.rules.actionPoints,n=i=>this.catalog.skill(i).apCost;return new Map(this.battle.sideOf("ally").map(i=>[i.id,{actionPoints:this.board.actionPoints(i.id),max:this.board.maxActionPoints(i.id),floor:t,regenPerTurn:e,cost:n}]))}autoPlan(){let t=[];for(let e of this.battle.sideOf("ally"))this.board.needsPlan(e.id)&&t.push(...this.board.submit(e.id,this.board.choosePlan(e)));return t}},wv=1920,Ev=1080;function au(){let s=Math.min(window.innerWidth/wv,window.innerHeight/Ev);return document.documentElement.style.setProperty("--u",String(s)),s}function Tv(s,t){let e=Math.max(1,t.width),n=Math.max(1,t.height);return{left:Math.max(0,(s.left-t.left)/e),right:Math.min(1,(s.right-t.left)/e),top:Math.max(0,(s.top-t.top)/n),bottom:Math.min(1,(s.bottom-t.top)/n)}}async function Av(){au();let s=document.getElementById("view"),t=s.parentElement,e=document.getElementById("status"),n=document.getElementById("turn"),i=document.getElementById("seed"),r=document.getElementById("mode"),a=document.getElementById("autonext"),o=document.getElementById("loading"),l=document.getElementById("loading-bar"),c=document.getElementById("loading-text"),h=1;e.textContent="\uBD88\uB7EC\uC624\uB294 \uC911\u2026";let u=await Mv((k,tt)=>{c&&(c.textContent=k),l&&(l.style.width=`${Math.round(tt*100)}%`)}),d=`${ve}/ui/kit`,p=u.ui.display,[g,y,m,f,b,v]=await Promise.all(["U3_small_default","U15_overhead_front","U15_overhead_back","R_mark","R_insight","R_resolve"].map(k=>_a(`${d}/${k}.png`))),E=new Map;await Promise.all(Object.entries(p.cardKit).flatMap(([k,tt])=>Object.keys(tt).map(async ct=>{let[Xt,qt]=await Promise.all([_a(`${d}/K${ct}_overhead_front.png`),_a(`${d}/K${ct}_overhead_back.png`)]);Xt&&qt&&E.set(`${k}/${ct}`,{front:Xt,back:qt,complete:!0})})));let C=await fetch(`${d}/gauge-layout.json`).then(k=>k.ok?k.json():null).catch(()=>null);g&&document.documentElement.classList.add("kit");let T=document.querySelector(".stage-name");if(T&&u.backdrop.name&&(T.textContent=u.backdrop.name),u.sprites.size===0)throw new Error("\uC5D0\uC14B\uC774 \uB4E4\uC5B4\uC628 \uCE90\uB9AD\uD130\uAC00 \uD558\uB098\uB3C4 \uC5C6\uB2E4");let A=new rr(u.ui.sound);for(let[k,tt]of u.samples)A.addSample(k,tt);let X=document.getElementById("sound"),S=document.getElementById("sound-hint"),x=()=>{S&&(S.hidden=A.running||(X?!X.checked:!1))},I=()=>{A.unlock(),A.setMuted(X?!X.checked:!1),window.setTimeout(x,300)};x();for(let k of["pointerdown","pointerup","touchend","click","keydown"])window.addEventListener(k,I,{capture:!0});X?.addEventListener("change",I);let N=new xa(s,t,u.stage,u.backdrop,u.backdropImages,u.sprites,(k,tt)=>u.frames.get(`${k}/${tt}`)??null,(k,tt)=>{let ct=Ui(u.catalog,k,{name:tt?p.cardKit[tt]?.[k]:void 0,terms:p.terms});return{slot:ct.slot,name:ct.name,frontPower:ct.frontPower,backPower:ct.backPower,attribute:ct.trace}},A,u.ultimates,u.voices,u.envFx),K={};f&&(K.attack=f),b&&(K.defense=b),v&&(K.support=v),N.setKit({plates:y&&m?{front:y,back:m}:null,completePlates:(k,tt)=>E.get(`${k}/${tt}`)??null,glyphs:K,gauge:C?{base:g?d:null,layout:C}:null});let L=document.getElementById("ui"),O=document.querySelector(".topbar"),q=document.getElementById("command"),Z=()=>{let k=au();if(N.resize(),!L||!O||!q)return;let tt=s.getBoundingClientRect(),ct=L.getBoundingClientRect(),Xt=O.getBoundingClientRect().bottom,qt=q.getBoundingClientRect().top,Yt=ct.bottom-60*k,ae=(Be,Ri)=>Tv(new DOMRect(ct.left,Be,ct.width,Ri-Be),tt);N.setFrameZones({home:ae(Xt,qt),focus:ae(Xt,Yt)},k)};Z(),window.addEventListener("resize",Z),window.addEventListener("orientationchange",Z),ru(t,document.getElementById("fullscreen"));let W="done",U=null,Y=null,et=new Map,ht=0,$=()=>(r?.value??"play")==="play",J=()=>r?.value==="lab",ut=()=>r?.value==="showcase"||J(),vt=document.getElementById("lab-motion"),yt=document.getElementById("lab-flash"),It=document.getElementById("lab-options"),Pt=()=>{let k=J();It?.toggleAttribute("hidden",!k),N.setLab(k?{reducedMotion:vt?.checked??!1,reducedFlash:yt?.checked??!1}:null)};vt?.addEventListener("change",Pt),yt?.addEventListener("change",Pt);let St=[],$t=!1,H=k=>U?.battle.combatant(k).side==="ally",fe=k=>{N.play(Pl(k,{isPlayerSide:H}))},_t=()=>{if(!U)return;let k=u.catalog.rules;for(let tt of U.battle.combatants){let ct=Cl(tt.deck.includes(k.ultimateSkillId),tt.ultimatePending);N.setGauge(tt.id,tt.isDefeated?null:{charge:Math.min(tt.attributeTotal,k.ultimateThreshold),total:k.ultimateThreshold,stage:ct})}},At=()=>{if(U)for(let k of U.battle.combatants)N.setStatuses(k.id,k.isDefeated?[]:k.statuses.map(tt=>({id:tt.id,turns:tt.turns})))},mt=()=>{if(!U)return;let k=U,tt=u.catalog.rules.actionPoints.floor;for(let ct of k.battle.combatants){if(ct.isDefeated){N.setPlan(ct.id,null);continue}let Xt=k.board.steps(ct.id).map(qt=>{let Yt=Ui(u.catalog,qt.skillId,{name:p?.cardKit[ct.base.id]?.[qt.skillId],terms:p?.terms});return{name:Yt.name,slot:Yt.slot}});N.setPlan(ct.id,{actionPoints:k.board.actionPoints(ct.id),max:k.board.maxActionPoints(ct.id),floor:tt,steps:Xt,idle:k.board.isIdle(ct.id)})}},te=k=>{if(U)for(let tt of U.battle.sideOf("enemy")){let ct=et.get(tt.id),Xt=ct?U.battle.combatant(ct).base.name:"",qt=!!ct&&Y?.orderOf(ct)?.targetId===tt.id;N.setNote(tt.id,k?Xt:"",qt)}},Lt=new Map,w=k=>{if(Lt.has(k))return Lt.get(k)??null;let tt=u.stage.battle.artAlias[k]??k,ct=u.sprites.get(tt)?.frameEndingWith("idle"),Xt=ct?u.frames.get(`${tt}/${ct.file}`):void 0,qt=null;if(ct&&Xt){let[Yt,ae,Be,Ri]=ct.bbox,vs=Math.min(Be-Yt,(Ri-ae)*.42),ui=vs*79/116,qs=Math.max(0,ct.anchor.x-vs/2),En=document.createElement("canvas");En.width=232,En.height=158,En.getContext("2d")?.drawImage(Xt,qs,Math.max(0,ae-ui*.04),vs,ui,0,0,232,158);try{qt=En.toDataURL("image/png")}catch{qt=`${ve}/${tt}/${ct.file}`}}return Lt.set(k,qt),qt},_=()=>{if(!(!U||!Y||W!=="input")){B.show(Y,U.inputAllies(),U.inputEnemies());for(let k of U.inputAllies()){let tt=Y.budgetOf(k.id),ct=Y.stepsOf(k.id).map(Xt=>{let qt=Ui(u.catalog,Xt.skillId,{name:p?.cardKit[k.characterId]?.[Xt.skillId],terms:p?.terms});return{name:qt.name,slot:qt.slot}});tt&&N.setPlan(k.id,{actionPoints:tt.after,max:U.board.maxActionPoints(k.id),floor:tt.floor,steps:ct,idle:!1})}te(!0),N.setSelection({ally:Y.selectedAlly,target:Y.selectedTarget,pickable:Y.selectedAlly?U.inputEnemies().map(k=>k.id):U.inputAllies().map(k=>k.id)})}},B=new sr(u.catalog,u.ui.side,{ally:k=>{Y?.selectAlly(k),_()},target:k=>{Y?.selectTarget(k),_()},card:k=>{Y?.selectCard(k),_()},go:()=>Q()},w,{display:p,kit:g?d:null,chance:(k,tt)=>U?U.battle.frontChance(k,tt):null,traces:k=>U?{...U.battle.combatant(k).attributes,threshold:u.catalog.rules.ultimateThreshold}:null}),nt=()=>{if(!U)return;let k=U.battle.sideOf("ally")[0],tt=U.battle.sideOf("enemy")[0];if(!k||!tt)return;let ct=u.catalog,Xt=[...ct.deckFor(k.base.id),ct.rules.ultimateSkillId].map(Yt=>{let ae=ct.skill(Yt);return{skillId:ae.id,slot:ae.slot,frontPower:ae.frontPower}}),qt=ct.skill(ct.deckFor(tt.base.id)[0]);St=Il({allyId:k.id,enemyId:tt.id,cards:Xt,enemyCard:{skillId:qt.id,backPower:qt.backPower},enemyMaxHp:tt.base.maxHp}),N.play(St)},j=document.getElementById("result"),it=k=>{j&&(j.hidden=!1,j.className=`result ${k==="ally"?"win":k==="enemy"?"lose":"draw"}`,j.textContent=k==="ally"?"\uC2B9\uB9AC":k==="enemy"?"\uD328\uBC30":"\uBB34\uC2B9\uBD80")},gt=()=>{j&&(j.hidden=!0);let k=Number(i.value)||1;if(U=new pl(u.catalog,Ml(k),u.stage.battle),N.reset(U.roster()),Pt(),$t=r?.value==="envfx",$t){Y=null,W="done",n.textContent="-",B.idle("\uACF5\uC6A9 \uD658\uACBD \uC774\uD399\uD2B8 \uAC80\uC218 \u2014 \uC0AC\uAC74\uB9C8\uB2E4 \uD55C \uBC88\uC529, \uC804\uD22C \uB9F5\uACFC \uBC24\uBC14\uB2E4\uC5D0\uC11C \uB3C8\uB2E4"),N.reviewEnvFx(tt=>e.textContent=`\uD658\uACBD \uC774\uD399\uD2B8 \xB7 ${tt}`);return}if(ut()){Y=null,W="showcase",e.textContent=J()?"\uC5F0\uCD9C \uC2E4\uD5D8 \xB7 S1 \u2192 S2 \u2192 S3 \u2192 \uACB0\uD589":"\uC2DC\uC5F0 \xB7 S1 \u2192 S2 \u2192 S3 \u2192 \uACB0\uD589",n.textContent="-",B.idle(J()?"\uC870\uC0AC\uD55C \uC5F0\uCD9C \uAE30\uBC95\uC744 \uCF20 \uC2E4\uD5D8 \u2014 \uBCF8\uD3B8\uC5D0\uB294 \uC544\uC9C1 \uC5C6\uB2E4":"\uC81C\uC791 \uD655\uC778\uC6A9 \uC790\uB3D9 \uC2DC\uC5F0 \u2014 \uC544\uAD70\uC774 \uD569\uC5D0\uC11C \uB298 \uC774\uAE34\uB2E4"),nt();return}ht=0,Y=null,e.textContent=$()?"\uC804\uD22C \uC911":`\uC790\uB3D9 \uAD00\uC804 \xB7 \uC2DC\uB4DC ${k}`,n.textContent="1",W="resolving",ft()},at=()=>{U&&(U.battle.submitOrders(U.board.orders(et)),mt(),N.setCombat(!0),fe(U.battle.resolve()),W="resolving")},ft=()=>{if(!U||U.battle.isFinished)return jt();let k=U.battle.startTurn();if(fe(k),_t(),At(),n.textContent=String(U.battle.turn),U.battle.isFinished)return jt();et=new Map;for(let tt of k)tt.type==="enemyTargeted"&&et.set(tt.enemyId,tt.targetId);if(mt(),$()){if(U.inputAllies().length===0){B.idle(Mt()),at();return}W="waitInput",B.idle("\uC801\uC758 \uC608\uC57D\uC744 \uC77D\uB294 \uC911\u2026");return}fe(U.autoPlan()),at(),B.idle("\uC790\uB3D9 \uAD00\uC804 \uC911")},Mt=()=>{if(!U)return"";let k=U.battle.sideOf("ally").find(tt=>!tt.isDefeated);return k?U.board.isIdle(k.id)?`${k.base.name} \u2014 \uD589\uB3D9\uB825\uC774 \uC5C6\uB2E4. \uC774\uBC88 \uD134\uC740 \uB9C9\uC9C0 \uBABB\uD558\uACE0 \uB9DE\uB294\uB2E4`:`${k.base.name} \u2014 \uC608\uC57D\uB300\uB85C \uC9C4\uD589 \uC911`:""},Nt=()=>{U&&(Y=new Fi(U.inputAllies(),U.inputEnemies().map(k=>k.id),et,U.budgets()),W="input",N.reframe(),te(!0),_())},Q=()=>{if(!U||!Y||W!=="input"||!Y.ready)return;let k=Y.submitted;Y=null;for(let[tt,ct]of k)fe(U.board.submit(tt,ct));te(!1),N.setSelection({ally:null,target:null,pickable:[]}),at(),B.idle("\uAD50\uC804 \uC911\u2026")},jt=()=>{if(!U||W==="done")return;W="done",Y=null,te(!1),N.setSelection({ally:null,target:null,pickable:[]}),_t();let k=U.battle.winner;e.textContent=k==="ally"?"\uC544\uAD70 \uC2B9":k==="enemy"?"\uC801 \uC2B9":"\uBB34\uC2B9\uBD80",At(),it(k),B.idle(`${e.textContent} \u2014 \uC7AC\uC2DC\uC791\uC744 \uB204\uB974\uBA74 \uB2E4\uC2DC \uD55C\uB2E4`),a?.checked&&window.setTimeout(()=>{W!=="done"||!a.checked||(i.value=String((Number(i.value)||1)+1),gt())},3500)},Bt=k=>Qt.isOpen||W!=="input"||!U?null:N.hitTest(k.clientX,k.clientY),Ct=k=>{Qt.isOpen||!k||!U||!Y||W!=="input"||(U.inputAllies().some(tt=>tt.id===k)?Y.selectAlly(k):U.inputEnemies().some(tt=>tt.id===k)&&Y.selectTarget(k),_())};s.addEventListener("click",k=>Ct(Bt(k))),N.onTagPick(Ct),s.addEventListener("mousemove",k=>{s.style.cursor=Bt(k)?"pointer":""});let xt=document.getElementById("help"),pt=document.getElementById("menu"),Dt=document.getElementById("help-open"),Kt=document.getElementById("menu-open"),Qt=new ba(k=>{if(k===xt)try{localStorage.setItem("ed.helpSeen","1")}catch{}});Dt?.addEventListener("click",()=>Qt.open(xt,Dt)),document.getElementById("help-close")?.addEventListener("click",()=>Qt.close()),window.addEventListener("keydown",k=>{if(Qt.isOpen||W!=="input"||!Y||!U||k.target instanceof HTMLInputElement||k.target instanceof HTMLSelectElement)return;if(k.key==="Enter"){if(k.target instanceof HTMLButtonElement)return;k.preventDefault(),Q();return}let tt=Number(k.key),ct=Y.hand;Number.isInteger(tt)&&tt>=1&&tt<=ct.length&&(Y.selectCard(ct[tt-1]),_())});let kt=!1;try{kt=localStorage.getItem("ed.helpSeen")==="1"}catch{kt=!1}document.getElementById("restart")?.addEventListener("click",gt),r?.addEventListener("change",()=>{if(U){if(ut()||W==="showcase"||r?.value==="envfx"||$t)return gt();!$()&&(W==="input"||W==="waitInput")&&(Y=null,te(!1),N.setSelection({ally:null,target:null,pickable:[]}),fe(U.autoPlan()),at(),B.idle("\uC790\uB3D9 \uAD00\uC804 \uC911"))}});let st=document.getElementById("speed");st?.addEventListener("click",()=>{h=h>=3?1:h+1,N.setSpeed(h);let k=st.querySelector("span");k&&(k.textContent=`\xD7${h}`),st.setAttribute("aria-pressed",String(h>1))});let P=document.getElementById("auto"),ot=()=>P?.setAttribute("aria-pressed",String(r?.value==="watch"));P?.addEventListener("click",()=>{r&&(r.value=r.value==="watch"?"play":"watch",r.dispatchEvent(new Event("change")))}),r?.addEventListener("change",ot),ot(),Kt?.addEventListener("click",()=>Qt.open(pt,Kt)),document.getElementById("menu-close")?.addEventListener("click",()=>Qt.close()),document.getElementById("restart")?.addEventListener("click",()=>Qt.close());let lt=performance.now(),wt=k=>{let tt=Math.min(.05,(k-lt)/1e3)*h;lt=k,N.tick(tt),U&&W==="waitInput"&&N.idle&&Nt(),U&&W==="showcase"&&N.idle&&nt(),U&&W==="resolving"&&N.idle&&(ht-=tt,ht<=0&&(U.battle.isFinished?jt():(fe([...U.battle.endTurn(),...U.board.endTurn()]),N.setCombat(!1),mt(),_t(),At(),W="turnEnd"),ht=u.stage.tempo.restSeconds)),U&&W==="turnEnd"&&N.idle&&(ht-=tt,ht<=0&&(ft(),ht=u.stage.tempo.restSeconds)),requestAnimationFrame(wt)};gt(),requestAnimationFrame(wt),u.missing.length>0&&(e.textContent+=` \xB7 \uADF8\uB9BC ${u.missing.length}\uAC1C \uC5C6\uC74C`),o?.setAttribute("hidden",""),kt||Qt.open(xt,null)}Av().catch(s=>{console.error("\uC804\uD22C \uD654\uBA74 \uCD08\uAE30\uD654 \uC2E4\uD328",s);let t=document.getElementById("loading"),e=document.getElementById("loading-title"),n=document.getElementById("loading-text"),i=document.getElementById("loading-retry");t?.removeAttribute("hidden"),t?.setAttribute("role","alert"),e&&(e.textContent="\uBD88\uB7EC\uC624\uAE30 \uC2E4\uD328"),n&&(n.textContent=`\uC804\uD22C\uB97C \uC900\uBE44\uD558\uC9C0 \uBABB\uD588\uC5B4${s instanceof Sa?` (HTTP ${s.status})`:""}. \uC5F0\uACB0\uC744 \uD655\uC778\uD558\uACE0 \uB2E4\uC2DC \uC2DC\uB3C4\uD574.`),i&&(i.hidden=!1,i.addEventListener("click",()=>window.location.reload()),i.focus())});
/*! Bundled license information:

three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2023 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
