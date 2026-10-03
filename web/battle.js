var zh=Object.defineProperty;var Vh=(s,e,t)=>e in s?zh(s,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):s[e]=t;var D=(s,e,t)=>Vh(s,typeof e!="symbol"?e+"":e,t);function ha(s,e,t,n,i){let r=s.cardFlip,o=t/s.mentalityMax,a=i>0?n/i:0,l=r.mentalityWeight+r.hpWeight,c=l>0?(r.mentalityWeight*o+r.hpWeight*a)/l:0,[h,u]=e.frontChance,d=h+(u-h)*Math.max(0,Math.min(1,c));return Math.max(r.chanceFloor,Math.min(r.chanceCeiling,d))}function ds(s,e){if(s?.type===e)return s}function Ei(s,e){return s.effect?.always?s.effect.always:e==="win"?s.effect?.onWin:s.effect?.onLose}var Ti=class{constructor(e,t){this.catalog=e;this.rng=t}effectiveMentality(e){let t=e.hasStatus("confusion")?this.catalog.rules.confusionPenalty:0;return Math.max(0,e.mentality-t)}frontChance(e,t){return ha(this.catalog.rules,t,this.effectiveMentality(e),e.hp,e.base.maxHp)}effectiveDefLevel(e){if(!e.hasStatus("defenseDown"))return e.base.defLevel;let t=this.catalog.status("defenseDown").effect.defenseMultiplier??1;return Math.floor(e.base.defLevel*t)}levelDiffBonus(e,t){let n=this.catalog.rules.levelDiffStep;return e<=t+n?0:Math.floor((e-t)/n)}flipCard(e,t){let n=this.frontChance(e,t),i=this.rng.next()<n?"front":"back";return{face:i,power:i==="front"?t.frontPower:t.backPower,chance:n}}calculateDamage(e,t,n){let i=this.levelDiffBonus(e.base.atkLevel,this.effectiveDefLevel(t)),r=n+i,o=this.catalog.status("poison").effect;return e.hasStatus("poison")&&o.outgoingDamagePercent!==void 0&&(r*=1+o.outgoingDamagePercent/100),t.hasStatus("poison")&&o.incomingDamagePercent!==void 0&&(r*=1+o.incomingDamagePercent/100),{damage:Math.max(0,Math.floor(r)),levelBonus:i}}resolve(e,t,n,i){let r=[],o=this.catalog.skill(t),a=this.catalog.skill(i);r.push({type:"clashStart",attackerId:e.id,defenderId:n.id,attackerSkillId:t,defenderSkillId:i});let l=0,c=null;for(;;){let h=this.flipCard(e,o),u=this.flipCard(n,a);if(this.pushFlip(e,o,h,r),this.pushFlip(n,a,u,r),h.power===u.power){if(l+=1,r.push({type:"deadlock",attackerId:e.id,defenderId:n.id,count:l}),l>=this.catalog.rules.deadlockLimit){r.push({type:"deadlockLimit",attackerId:e.id,defenderId:n.id}),this.changeMentality(e,this.catalog.rules.mentalityOnDeadlock,"deadlock",r),this.changeMentality(n,this.catalog.rules.mentalityOnDeadlock,"deadlock",r);break}continue}let d=h.power>u.power,p=d?e:n,g=d?n:e,y=d?h:u,m=d?u:h,f=this.calculateDamage(p,g,y.power);r.push({type:"damageCalculated",combatantId:p.id,damage:f.damage,power:y.power,levelBonus:f.levelBonus}),r.push({type:"clashRoundWin",winnerId:p.id,loserId:g.id,winnerDamage:y.power,loserDamage:m.power}),this.changeMentality(p,this.catalog.rules.mentalityOnClashWin,"clashWin",r),this.changeMentality(g,this.catalog.rules.mentalityOnClashLose,"clashLose",r),c={winner:p,loser:g,winnerSkill:d?o:a,loserSkill:d?a:o,damage:f.damage};break}return c&&(this.applyOutcome(c,r),this.applyClashEndEffects(c,r),this.grantAttribute(c.winner,c.winnerSkill,r)),this.checkConfusion(e,r),this.checkConfusion(n,r),r.push({type:"clashEnd",attackerId:e.id,defenderId:n.id,winnerId:c?.winner.id??null}),r}applyTurnStartStatuses(e,t){this.tickBleed(e,t)}resolveOneSided(e,t,n){let i=[],r=this.catalog.skill(t),o=this.catalog.rules;i.push({type:"oneSidedStart",attackerId:e.id,targetId:n.id,skillId:t});let a=this.flipCard(e,r);this.pushFlip(e,r,a,i);let l=this.calculateDamage(e,n,a.power);i.push({type:"damageCalculated",combatantId:e.id,damage:l.damage,power:a.power,levelBonus:l.levelBonus}),o.oneSidedGivesMentality&&this.changeMentality(e,o.mentalityOnClashWin,"clashWin",i);let c={winner:e,loser:n,winnerSkill:r,loserSkill:null,damage:l.damage};return this.applyOutcome(c,i),this.applyClashEndEffect(e,n,r,"win",i),this.grantAttribute(e,r,i),this.checkConfusion(e,i),this.checkConfusion(n,i),i.push({type:"oneSidedEnd",attackerId:e.id,targetId:n.id}),i}tickBleed(e,t){let n=e.stackCount("bleed");if(n===0)return;let i=this.catalog.status("bleed").effect.hpPercentDamage??0,r=Math.floor(e.base.maxHp*i/100)*n;if(r<=0)return;let o=e.takeDamage(r);t.push({type:"statusTicked",combatantId:e.id,status:"bleed",damage:o}),this.checkDefeat(e,t)}applyOutcome(e,t){let{loser:n,winnerSkill:i,loserSkill:r}=e,o=e.damage,a=ds(Ei(i,"win"),"damageModifier");a?.target==="self"&&(o+=a.amount);let l=r&&ds(Ei(r,"lose"),"damageModifier");if(l&&l.target==="opponent"&&(o+=l.amount),r&&ds(Ei(r,"lose"),"nullifyDamage")&&(t.push({type:"damageNullified",combatantId:n.id,skillId:r.id}),o=0),o=Math.max(0,Math.floor(o)),o>0){let u=n.takeDamage(o);t.push({type:"damageApplied",combatantId:n.id,damage:u,hp:n.hp})}let c=ds(Ei(i,"win"),"execute");if(c&&!n.isDefeated){let u=n.base.maxHp*c.hpThresholdPercent/100;n.hp<u&&(n.takeDamage(n.hp),t.push({type:"executed",combatantId:n.id}))}let h=r&&ds(Ei(r,"lose"),"mentality");if(h){let u=Math.round(n.mentality*h.percentOfCurrent/100);this.changeMentality(n,u,"skill",t)}this.checkDefeat(n,t)}applyClashEndEffects(e,t){this.applyClashEndEffect(e.winner,e.loser,e.winnerSkill,"win",t),e.loserSkill&&this.applyClashEndEffect(e.loser,e.winner,e.loserSkill,"lose",t)}applyClashEndEffect(e,t,n,i,r){if(n.effect?.timing!=="onClashEnd")return;let o=Ei(n,i);if(o&&o.type==="applyStatus"){let a=o.target==="self"?e:t;this.applyStatus(a,o.status,o.turns,r)}}grantAttribute(e,t,n){if(!t.attribute)return;let i=e.gainAttribute(t.attribute);n.push({type:"attributeGained",combatantId:e.id,attribute:t.attribute,value:i})}applyStatus(e,t,n,i){let r=this.catalog.status(t);e.applyStatus(t,n,r.stackable),i.push({type:"statusApplied",combatantId:e.id,status:t,turns:n})}checkConfusion(e,t){e.isDefeated||e.mentality>=this.catalog.rules.confusionThreshold||e.hasStatus("confusion")||this.applyStatus(e,"confusion",this.catalog.status("confusion").defaultTurns,t)}pushFlip(e,t,n,i){i.push({type:"cardFlipped",combatantId:e.id,skillId:t.id,face:n.face,power:n.power,chance:n.chance})}changeMentality(e,t,n,i){let r=e.changeMentality(t,this.catalog.rules);r!==0&&i.push({type:"mentalityChanged",combatantId:e.id,delta:r,mentality:e.mentality,reason:n})}checkDefeat(e,t){e.isDefeated&&(t.some(n=>n.type==="defeated"&&n.combatantId===e.id)||t.push({type:"defeated",combatantId:e.id}))}};function Gh(s){if(s.deck.length===0)throw new Error(`\uC801 ${s.id} \uC758 \uB371\uC774 \uBE44\uC5B4 \uC788\uB2E4`);return s.deck}function Wh(s,e){let t=Gh(s),n=t.filter(i=>!e.skill(i).tbd);return n.length>0?n:t}function Xh(s,e){if(e.length===0)throw new Error(`\uC801 ${s.id} \uAC00 \uACA8\uB20C \uB300\uC0C1\uC774 \uC5C6\uB2E4`);return e}function tl(s,e,t){let n=s[s.length-1],i=e.reduce((o,a)=>o+a,0);if(i<=0)return s[Math.floor(t.next()*s.length)]??n;let r=t.next()*i;for(let o=0;o<s.length;o+=1)if(r-=e[o]??0,r<0)return s[o]??n;return n}function $h(s){return s.archetype==="\uC720\uD2F8"}var Ai=class{chooseTarget(e,t,n,i){let r=Xh(e,t),o=i.catalog.enemyAi,a=r.map(l=>{let c=l.hp/l.base.maxHp,h=1+o.aiTargetLowHpBias*(1-c);return n.has(l.id)&&(h*=o.aiTargetDuplicatePenalty),h});return tl(r,a,i.rng).id}chooseSkill(e,t,n){let i=Wh(e,n.catalog),r=n.catalog.enemyAi,o=this.guardWeight(e,t,n),a=n.resolver.effectiveMentality(e)<=r.mentalityDangerThreshold,l=i.map(c=>{let h=n.catalog.skill(c),u=$h(h)?o:1;return a&&(u*=r.mentalityDangerArchetypeWeight[h.archetype]),this.isRedundantStatus(h,t.target,n)&&(u*=r.redundantStatusPenalty),u});return tl(i,l,n.rng)}guardWeight(e,t,n){let i=n.catalog.enemyAi;if(!t.isClash)return 0;let r=this.estimateThreat(e,t,n),o=0;for(let a of i.aiGuardThreatThresholds)r>=a&&(o+=1);return i.aiGuardWeights[o]??0}estimateThreat(e,t,n){if(e.hp<=0)return 0;let{catalog:i}=n,r=t.target,o=l=>{let c=ha(i.rules,l,r.mentality,r.hp,r.base.maxHp);return c*l.frontPower+(1-c)*l.backPower};return t.opponentSkillId!==null?o(i.skill(t.opponentSkillId))/e.hp:r.deck.length===0?0:r.deck.reduce((l,c)=>l+o(i.skill(c)),0)/r.deck.length/e.hp}isRedundantStatus(e,t,n){let i=e.effect?.onWin;return i?.type!=="applyStatus"||i.target!=="opponent"||n.catalog.status(i.status).stackable?!1:t.hasStatus(i.status)}};var Os=class{constructor(e,t,n,i){this.id=e;this.side=t;this.base=n;D(this,"hp");D(this,"mentality");D(this,"statuses",[]);D(this,"attributes",{attack:0,defense:0,support:0});D(this,"ultimatePending",!1);D(this,"deck");this.hp=n.maxHp,this.mentality=n.mentality,this.deck=[...i]}gainAttribute(e){return this.attributes[e]+=1,this.attributes[e]}get attributeTotal(){return this.attributes.attack+this.attributes.defense+this.attributes.support}resetAttributes(){this.attributes.attack=0,this.attributes.defense=0,this.attributes.support=0}addCard(e){return this.deck.includes(e)?!1:(this.deck.push(e),!0)}removeCard(e){let t=this.deck.indexOf(e);return t<0?!1:(this.deck.splice(t,1),!0)}get isDefeated(){return this.hp<=0}hasStatus(e){return this.statuses.some(t=>t.id===e)}stackCount(e){return this.statuses.filter(t=>t.id===e).length}applyStatus(e,t,n){if(n){this.statuses.push({id:e,turns:t});return}let i=this.statuses.find(r=>r.id===e);if(i){i.turns=Math.max(i.turns,t);return}this.statuses.push({id:e,turns:t})}expireStatuses(){let e=[];for(let t=this.statuses.length-1;t>=0;t-=1){let n=this.statuses[t];n&&(n.turns-=1,n.turns<=0&&(e.push(n.id),this.statuses.splice(t,1)))}return e.reverse()}takeDamage(e){let t=Math.max(0,Math.min(e,this.hp));return this.hp-=t,t}changeMentality(e,t){let n=this.mentality;return this.mentality=Math.max(0,Math.min(t.mentalityMax,n+e)),this.mentality-n}};var Ke=class extends Error{constructor(e){super(`battle-data: ${e}`),this.name="BattleDataError"}};function ln(s,e){if(typeof s!="object"||s===null||Array.isArray(s))throw new Ke(`${e} \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4`);return s}function Be(s,e,t){let n=s[e];if(typeof n!="number"||!Number.isFinite(n))throw new Ke(`${t}.${e} \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);return n}function Mn(s,e,t){let n=s[e];if(typeof n!="string")throw new Ke(`${t}.${e} \uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return n}function yn(s,e,t,n){let i=Mn(s,e,n);if(!t.includes(i))throw new Ke(`${n}.${e} \uAC00 \uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC740 \uAC12\uC774\uB2E4: ${i}`);return i}function qh(s,e,t){let n=s[e];if(typeof n!="boolean")throw new Ke(`${t}.${e} \uAC00 \uCC38/\uAC70\uC9D3\uC774 \uC544\uB2C8\uB2E4`);return n}function Hs(s,e,t){return Bs(s,e,t).map((n,i)=>{if(typeof n!="number"||!Number.isFinite(n))throw new Ke(`${t}.${e}[${i}] \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);return n})}function Bs(s,e,t){let n=s[e];if(!Array.isArray(n))throw new Ke(`${t}.${e} \uAC00 \uBC30\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return n}var nl=["bleed","confusion","poison","defenseDown"],il=["\uC548\uC815","\uD45C\uC900","\uB3C4\uBC15","\uC720\uD2F8"],Yh=["attack","defense","support"],Zh=["S1","S2","S3","ULT"],Jh=["onDamage","beforeDamage","beforeDamageCalc","onTakeDamage","onClashEnd"];function ua(s,e){let t=ln(s,e),n=Mn(t,"type",e);switch(n){case"execute":return{type:n,hpThresholdPercent:Be(t,"hpThresholdPercent",e)};case"mentality":return{type:n,percentOfCurrent:Be(t,"percentOfCurrent",e)};case"applyStatus":return{type:n,target:yn(t,"target",["self","opponent"],e),status:yn(t,"status",nl,e),turns:Be(t,"turns",e)};case"damageModifier":return{type:n,target:yn(t,"target",["self","opponent"],e),amount:Be(t,"amount",e)};case"nullifyDamage":return{type:n};default:throw new Ke(`${e}.type \uC744 \uC54C \uC218 \uC5C6\uB2E4: ${n}`)}}function Kh(s,e){let t=ln(s,e),n={timing:yn(t,"timing",Jh,e)};return t.onWin!==void 0&&(n.onWin=ua(t.onWin,`${e}.onWin`)),t.onLose!==void 0&&(n.onLose=ua(t.onLose,`${e}.onLose`)),t.always!==void 0&&(n.always=ua(t.always,`${e}.always`)),n}function jh(s){let e=ln(s,"rules"),t=ln(e.cardFlip,"rules.cardFlip");return{cardFlip:{mentalityWeight:Be(t,"mentalityWeight","rules.cardFlip"),hpWeight:Be(t,"hpWeight","rules.cardFlip"),chanceFloor:Be(t,"chanceFloor","rules.cardFlip"),chanceCeiling:Be(t,"chanceCeiling","rules.cardFlip")},mentalityMax:Be(e,"mentalityMax","rules"),mentalityOnClashWin:Be(e,"mentalityOnClashWin","rules"),mentalityOnClashLose:Be(e,"mentalityOnClashLose","rules"),mentalityOnDeadlock:Be(e,"mentalityOnDeadlock","rules"),mentalityRegenPerTurn:Be(e,"mentalityRegenPerTurn","rules"),mentalityRegenCap:Be(e,"mentalityRegenCap","rules"),confusionThreshold:Be(e,"confusionThreshold","rules"),confusionPenalty:Be(e,"confusionPenalty","rules"),levelDiffStep:Be(e,"levelDiffStep","rules"),deadlockLimit:Be(e,"deadlockLimit","rules"),oneSidedGivesMentality:qh(e,"oneSidedGivesMentality","rules"),ultimateThreshold:Be(e,"ultimateThreshold","rules"),ultimateSkillId:Be(e,"ultimateSkillId","rules")}}function Qh(s){let e=ln(s,"enemyAi"),t=ln(e.mentalityDangerArchetypeWeight,"enemyAi.mentalityDangerArchetypeWeight"),n={};for(let o of il)n[o]=Be(t,o,"enemyAi.mentalityDangerArchetypeWeight");let i=Hs(e,"aiGuardThreatThresholds","enemyAi"),r=Hs(e,"aiGuardWeights","enemyAi");if(r.length!==i.length+1)throw new Ke("enemyAi.aiGuardWeights \uAC1C\uC218\uAC00 \uAD6C\uAC04 \uACBD\uACC4\uBCF4\uB2E4 1 \uB9CE\uC544\uC57C \uD55C\uB2E4");return{mentalityDangerThreshold:Be(e,"mentalityDangerThreshold","enemyAi"),mentalityDangerArchetypeWeight:n,redundantStatusPenalty:Be(e,"redundantStatusPenalty","enemyAi"),aiTargetLowHpBias:Be(e,"aiTargetLowHpBias","enemyAi"),aiTargetDuplicatePenalty:Be(e,"aiTargetDuplicatePenalty","enemyAi"),aiGuardThreatThresholds:i,aiGuardWeights:r}}function eu(s,e){let t=`characters[${e}]`,n=ln(s,t);return{id:Mn(n,"id",t),name:Mn(n,"name",t),maxHp:Be(n,"maxHp",t),atkLevel:Be(n,"atkLevel",t),defLevel:Be(n,"defLevel",t),mentality:Be(n,"mentality",t),role:Mn(n,"role",t),skills:Hs(n,"skills",t)}}function tu(s,e){let t=Hs(s,"frontChance",e),[n,i]=t;if(t.length!==2||n===void 0||i===void 0||n<0||i>1||n>i)throw new Ke(`${e}.frontChance \uB294 [\uCD5C\uC18C, \uCD5C\uB300] (0~1) \uC5EC\uC57C \uD55C\uB2E4`);return[n,i]}function nu(s,e){let t=`skills[${e}]`,n=ln(s,t),i={id:Be(n,"id",t),name:Mn(n,"name",t),character:n.character===null?null:Mn(n,"character",t),slot:yn(n,"slot",Zh,t),attribute:n.attribute===null?null:yn(n,"attribute",Yh,t),frontPower:Be(n,"frontPower",t),backPower:Be(n,"backPower",t),frontChance:tu(n,t),archetype:yn(n,"archetype",il,t),maxInDeck:Be(n,"maxInDeck",t),tbd:n.tbd===!0,text:Mn(n,"text",t)};return n.effect!==void 0&&(i.effect=Kh(n.effect,`${t}.effect`)),i}function iu(s,e){let t=`statusEffects[${e}]`,n=ln(s,t),i=ln(n.effect,`${t}.effect`),r={};return i.hpPercentDamage!==void 0&&(r.hpPercentDamage=Be(i,"hpPercentDamage",t)),i.of!==void 0&&(r.of=yn(i,"of",["maxHp"],t)),i.mentalityModifier!==void 0&&(r.mentalityModifier=Be(i,"mentalityModifier",t)),i.incomingDamagePercent!==void 0&&(r.incomingDamagePercent=Be(i,"incomingDamagePercent",t)),i.outgoingDamagePercent!==void 0&&(r.outgoingDamagePercent=Be(i,"outgoingDamagePercent",t)),i.defenseMultiplier!==void 0&&(r.defenseMultiplier=Be(i,"defenseMultiplier",t)),{id:yn(n,"id",nl,t),name:Mn(n,"name",t),timing:yn(n,"timing",["onTurnStart","onCardFlip","onDamageCalc"],t),effect:r,defaultTurns:Be(n,"defaultTurns",t),stackable:n.stackable===!0}}function sl(s){let e=ln(s,"root"),t={rules:jh(e.rules),enemyAi:Qh(e.enemyAi),characters:Bs(e,"characters","root").map(eu),skills:Bs(e,"skills","root").map(nu),statusEffects:Bs(e,"statusEffects","root").map(iu)};if(t.characters.length===0)throw new Ke("\uCE90\uB9AD\uD130\uAC00 \uD558\uB098\uB3C4 \uC5C6\uB2E4");if(t.skills.length===0)throw new Ke("\uC2A4\uD0AC\uC774 \uD558\uB098\uB3C4 \uC5C6\uB2E4");let n=new Set;for(let a of t.skills){if(n.has(a.id))throw new Ke(`\uC2A4\uD0AC id \uAC00 \uC911\uBCF5\uB41C\uB2E4: ${a.id}`);n.add(a.id)}let i=new Set;for(let a of t.characters){if(i.has(a.id))throw new Ke(`\uCE90\uB9AD\uD130 id \uAC00 \uC911\uBCF5\uB41C\uB2E4: ${a.id}`);i.add(a.id)}let r=t.rules.cardFlip;for(let a of t.skills){if(a.frontPower<a.backPower)throw new Ke(`\u300C${a.name}\u300D \uC55E \uC704\uB825\uC774 \uB4B7 \uC704\uB825\uBCF4\uB2E4 \uC791\uB2E4`);let[l,c]=a.frontChance;if(l<r.chanceFloor||c>r.chanceCeiling)throw new Ke(`\u300C${a.name}\u300D \uC55E\uBA74 \uD655\uB960 ${l}~${c} \uAC00 ${r.chanceFloor}~${r.chanceCeiling} \uBC16\uC774\uB2E4`)}let o=new Map(t.skills.map(a=>[a.id,a]));for(let a of t.characters)for(let l of a.skills){let c=o.get(l);if(!c)throw new Ke(`${a.id} \uC758 \uC804\uC6A9\uAE30\uB97C \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${l}`);if(c.character!==a.id)throw new Ke(`\uC804\uC6A9\uAE30 ${l} \uC758 \uC8FC\uC778\uC774 ${a.id} \uAC00 \uC544\uB2C8\uB2E4: ${c.character}`)}if(!o.has(t.rules.ultimateSkillId))throw new Ke(`\uAD81\uADF9\uAE30 \uCE74\uB4DC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${t.rules.ultimateSkillId}`);return t}var zs=class{constructor(e){this.data=e;D(this,"charactersById");D(this,"skillsById");D(this,"statusesById");this.charactersById=new Map(e.characters.map(t=>[t.id,t])),this.skillsById=new Map(e.skills.map(t=>[t.id,t])),this.statusesById=new Map(e.statusEffects.map(t=>[t.id,t]))}get rules(){return this.data.rules}get enemyAi(){return this.data.enemyAi}character(e){let t=this.charactersById.get(e);if(!t)throw new Ke(`\uCE90\uB9AD\uD130\uB97C \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${e}`);return t}skill(e){let t=this.skillsById.get(e);if(!t)throw new Ke(`\uC2A4\uD0AC\uC744 \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${e}`);return t}get ultimate(){return this.skill(this.rules.ultimateSkillId)}deckFor(e){return[...this.character(e).skills]}status(e){let t=this.statusesById.get(e);if(!t)throw new Ke(`\uC0C1\uD0DC\uC774\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${e}`);return t}validateDeck(e){let t=new Map;for(let n of e){let i=this.skill(n),r=(t.get(n)??0)+1;if(t.set(n,r),r>i.maxInDeck)throw new Ke(`\uB371\uC5D0 \u300C${i.name}\u300D \uC774 ${i.maxInDeck}\uC7A5\uC744 \uB118\uB294\uB2E4`)}}};function rl(s){let e=s>>>0;return{next(){e=e+1831565813>>>0;let t=e;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}}}var al={next:()=>Math.random()};var wn=class extends Error{constructor(e){super(e),this.name="BattleFlowError"}},Vs=class{constructor(e,t,n,i={}){this.catalog=e;D(this,"combatantsById",new Map);D(this,"resolver");D(this,"rng");D(this,"enemyAi");D(this,"aiContext");D(this,"enemyTargets",new Map);D(this,"engagements",[]);D(this,"turn",0);D(this,"phase","turnStart");D(this,"winner",null);this.rng=i.rng??al,this.enemyAi=i.enemyAi??new Ai;for(let r of[...t,...n]){if(this.combatantsById.has(r.id))throw new Ke(`\uC804\uD22C \uCC38\uAC00\uC790 id \uAC00 \uC911\uBCF5\uB41C\uB2E4: ${r.id}`);let o=e.deckFor(r.characterId);e.validateDeck(o);let a=new Os(r.id,r.side,e.character(r.characterId),o);this.combatantsById.set(r.id,a)}this.resolver=new Ti(e,this.rng),this.aiContext={catalog:e,resolver:this.resolver,rng:this.rng}}get combatants(){return[...this.combatantsById.values()]}get isFinished(){return this.phase==="finished"}get plannedEngagements(){return this.engagements}frontChance(e,t){return this.resolver.frontChance(this.combatant(e),this.catalog.skill(t))}combatant(e){let t=this.combatantsById.get(e);if(!t)throw new Ke(`\uC804\uD22C \uCC38\uAC00\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${e}`);return t}sideOf(e){return this.combatants.filter(t=>t.side===e)}aliveOf(e){return this.sideOf(e).filter(t=>!t.isDefeated)}startTurn(){this.expectPhase("turnStart"),this.turn+=1;let e=[{type:"turnStart",turn:this.turn}];for(let t of this.combatants)t.isDefeated||t.ultimatePending&&(t.ultimatePending=!1,t.addCard(this.catalog.rules.ultimateSkillId));for(let t of this.combatants)t.isDefeated||this.resolver.applyTurnStartStatuses(t,e);return this.checkBattleEnd(e)||(this.chooseEnemyTargets(e),this.phase="awaitingOrders"),e}chooseEnemyTargets(e){this.enemyTargets.clear();let t=this.aliveOf("ally");if(t.length===0)return;let n=new Set;for(let i of this.aliveOf("enemy")){let r=this.enemyAi.chooseTarget(i,t,n,this.aiContext);this.enemyTargets.set(i.id,r),n.add(r),e.push({type:"enemyTargeted",enemyId:i.id,targetId:r})}}submitOrders(e){this.expectPhase("awaitingOrders");let t=new Set;for(let n of e){let i=this.combatant(n.actorId),r=this.combatant(n.targetId);if(i.side!=="ally")throw new wn(`\uC544\uAD70\uC774 \uC544\uB2CC \uCC38\uAC00\uC790\uC758 \uC9C0\uC2DC\uB2E4: ${i.id}`);if(i.isDefeated)throw new wn(`\uC4F0\uB7EC\uC9C4 \uCC38\uAC00\uC790\uC5D0\uAC8C \uC9C0\uC2DC\uD560 \uC218 \uC5C6\uB2E4: ${i.id}`);if(r.side===i.side)throw new wn(`\uAC19\uC740 \uC9C4\uC601\uC744 \uACA8\uB20C \uC218 \uC5C6\uB2E4: ${r.id}`);if(r.isDefeated)throw new wn(`\uC4F0\uB7EC\uC9C4 \uB300\uC0C1\uC744 \uACA8\uB20C \uC218 \uC5C6\uB2E4: ${r.id}`);if(!i.deck.includes(n.skillId))throw new wn(`\uB371\uC5D0 \uC5C6\uB294 \uCE74\uB4DC\uB2E4: ${i.id} / ${n.skillId}`);if(t.has(i.id))throw new wn(`\uAC19\uC740 \uCC38\uAC00\uC790\uC5D0\uAC8C \uC9C0\uC2DC\uAC00 \uB450 \uBC88 \uC654\uB2E4: ${i.id}`);t.add(i.id)}this.engagements=this.matchEngagements(e),this.phase="resolving"}matchEngagements(e){let t=[],n=new Set;for(let i of e){if(this.enemyTargets.get(i.targetId)===i.actorId){t.push({kind:"clash",allyId:i.actorId,enemyId:i.targetId,allySkillId:i.skillId}),n.add(i.targetId);continue}t.push({kind:"allyOneSided",allyId:i.actorId,targetId:i.targetId,skillId:i.skillId})}for(let i of this.aliveOf("enemy")){if(n.has(i.id))continue;let r=this.enemyTargets.get(i.id);r&&t.push({kind:"enemyOneSided",enemyId:i.id,targetId:r})}return t}resolve(){this.expectPhase("resolving");let e=[];for(let t of this.engagements){let[n,i]=this.participantsOf(t);if(!(n.isDefeated||i.isDefeated)&&(e.push(...this.runEngagement(t,n,i)),this.checkBattleEnd(e)))return this.engagements=[],e}return this.engagements=[],this.phase="turnEnd",e}participantsOf(e){return e.kind==="clash"?[this.combatant(e.allyId),this.combatant(e.enemyId)]:e.kind==="allyOneSided"?[this.combatant(e.allyId),this.combatant(e.targetId)]:[this.combatant(e.enemyId),this.combatant(e.targetId)]}runEngagement(e,t,n){let i=[];if(e.kind==="clash"){let o=this.enemyAi.chooseSkill(n,{target:t,isClash:!0,opponentSkillId:e.allySkillId},this.aiContext);return this.consumeUltimate(t,e.allySkillId,i),this.consumeUltimate(n,o,i),i.push(...this.resolver.resolve(t,e.allySkillId,n,o)),i}if(e.kind==="allyOneSided")return this.consumeUltimate(t,e.skillId,i),i.push(...this.resolver.resolveOneSided(t,e.skillId,n)),i;let r=this.enemyAi.chooseSkill(t,{target:n,isClash:!1,opponentSkillId:null},this.aiContext);return this.consumeUltimate(t,r,i),i.push(...this.resolver.resolveOneSided(t,r,n)),i}endTurn(){this.expectPhase("turnEnd");let e=[],t=this.catalog.rules;for(let n of this.combatants)if(!n.isDefeated){if(n.mentality<t.mentalityRegenCap){let i=Math.min(t.mentalityRegenCap,n.mentality+t.mentalityRegenPerTurn),r=n.changeMentality(i-n.mentality,t);r!==0&&e.push({type:"mentalityChanged",combatantId:n.id,delta:r,mentality:n.mentality,reason:"turnRegen"})}for(let i of n.expireStatuses())e.push({type:"statusExpired",combatantId:n.id,status:i});this.checkUltimateReady(n,e)}return e.push({type:"turnEnd",turn:this.turn}),this.phase="turnStart",e}checkUltimateReady(e,t){let n=this.catalog.rules;e.attributeTotal<n.ultimateThreshold||e.ultimatePending||e.deck.includes(n.ultimateSkillId)||(e.ultimatePending=!0,t.push({type:"ultimateReady",combatantId:e.id}))}consumeUltimate(e,t,n){t===this.catalog.rules.ultimateSkillId&&(e.removeCard(t),e.resetAttributes(),n.push({type:"ultimateUsed",combatantId:e.id,skillId:t}))}checkBattleEnd(e){let t=this.aliveOf("ally").length===0,n=this.aliveOf("enemy").length===0;return!t&&!n?!1:(this.winner=t&&n?null:t?"enemy":"ally",this.phase="finished",e.push({type:"battleEnd",winner:this.winner}),!0)}expectPhase(e){if(this.phase!==e)throw new wn(`\uC9C0\uAE08 \uB2E8\uACC4\uB294 ${this.phase} \uB77C ${e} \uB3D9\uC791\uC744 \uD560 \uC218 \uC5C6\uB2E4`)}};function fs(s){return Number.isFinite(s)?Math.max(0,Math.min(1,s)):0}var ps=class{constructor(e){D(this,"points");D(this,"lengths");D(this,"total");this.points=e.map(t=>[t[0],t[1]]),this.lengths=this.points.slice(1).map((t,n)=>{let i=this.points[n];return Math.hypot(t[0]-i[0],t[1]-i[1])}),this.total=this.lengths.reduce((t,n)=>t+n,0)}at(e){let t=e;for(let i=0;i<this.lengths.length;i++){let r=this.lengths[i],o=this.points[i],a=this.points[i+1];if(t<=r){let l=r>0?t/r:0;return{point:[o[0]+(a[0]-o[0])*l,o[1]+(a[1]-o[1])*l],index:i}}t-=r}let n=this.points[this.points.length-1];return{point:[n[0],n[1]],index:this.lengths.length-1}}segment(e,t){let n=fs(e)*this.total,i=fs(t)*this.total;if(i-n<=0)return[];let r=this.at(n),o=this.at(i),a=[r.point];for(let l=r.index+1;l<=o.index;l++){let c=this.points[l];a.push([c[0],c[1]])}return a.push(o.point),a}prefix(e){return this.segment(0,e)}};function da(s,e,t,n){let i=s.map(o=>[o[0],o[1]]);if(i.length<2)return i;let r=(o,a)=>{let l=Math.hypot(a[0]-o[0],a[1]-o[1])||1;return[a[0]+(a[0]-o[0])/l*e,a[1]+(a[1]-o[1])/l*e]};return t&&i.unshift(r(i[1],i[0])),n&&i.push(r(i[i.length-2],i[i.length-1])),i}function ms(s){return s.map((e,t)=>`${t?"L":"M"}${ol(e[0])} ${ol(e[1])}`).join("")}function ol(s){return Math.round(s*100)/100}function ll(s,e,t){let n=Math.max(0,Math.min(e,Number.isFinite(s)?Math.floor(s):0));return Array.from({length:e},(i,r)=>r>=n?"empty":t==="ready"?"full":t==="pending"?"pending":"charged")}function cl(s,e){return s?"ready":e?"pending":"charging"}function Ci(s){return s==="front"?"\uC55E":"\uB4A4"}function ul(s,e){let t=[],n=0;for(;n<s.length;){let i=s[n];if(i.type==="oneSidedStart"){let r=hl(s,n,"oneSidedEnd");t.push(su(s.slice(n,r+1),e)),n=r+1;continue}if(i.type==="clashStart"){let r=hl(s,n,"clashEnd");t.push(ru(s.slice(n,r+1),e)),n=r+1;continue}t.push({kind:"state",event:i}),n+=1}return t}function hl(s,e,t){for(let n=e+1;n<s.length;n++)if(s[n].type===t)return n;return s.length-1}function fa(s){return{combatantId:s.combatantId,skillId:s.skillId,face:s.face,power:s.power,chance:s.chance}}function su(s,e){let t=s[0],n={combatantId:t.attackerId,skillId:t.skillId,face:"back",power:0,chance:0},i=0,r=!1;for(let a of s)a.type==="cardFlipped"&&a.combatantId===t.attackerId&&(n=fa(a)),a.type==="damageApplied"&&a.combatantId===t.targetId&&(i+=a.damage),a.type==="defeated"&&a.combatantId===t.targetId&&(r=!0);let o=[];return e.isPlayerSide(t.attackerId)&&o.push(i>0?{combatantId:t.attackerId,success:!0,title:"\uACF5\uACA9 \uC131\uACF5",reason:`${Ci(n.face)} ${n.power} \xB7 \uD53C\uD574 ${i}`}:{combatantId:t.attackerId,success:!1,title:"\uBE57\uB098\uAC10",reason:`${Ci(n.face)} ${n.power} \xB7 \uD53C\uD574 \uC5C6\uC74C`}),{kind:"oneSided",attackerId:t.attackerId,targetId:t.targetId,skillId:t.skillId,flip:n,power:n.power,damage:i,defeated:r,callouts:o,events:s.filter(a=>a.type!=="oneSidedStart"&&a.type!=="oneSidedEnd"&&a.type!=="cardFlipped")}}function ru(s,e){let t=s[0],n=[],i=[],r=null,o=null,a=null,l=d=>{let p=n[n.length-1];p?p.events.push(...i):d.events.unshift(...i),i=[],n.push(d)},c=(d,p)=>({combatantId:d,skillId:p,face:"back",power:0,chance:0});for(let d of s.slice(1)){if(d.type==="clashEnd")continue;if(d.type==="cardFlipped"){d.combatantId===t.attackerId?o=fa(d):a=fa(d),r=null;continue}if(d.type==="damageCalculated")continue;let p={attackerFlip:o??c(t.attackerId,t.attackerSkillId),defenderFlip:a??c(t.defenderId,t.defenderSkillId)};if(d.type==="clashRoundWin"){r={type:"win",...p,winnerId:d.winnerId,loserId:d.loserId,winnerPower:d.winnerDamage,loserPower:d.loserDamage,events:[d],callouts:ou(t,p.attackerFlip,p.defenderFlip,d.winnerId,e)},l(r);continue}if(d.type==="deadlock"){let g=p.attackerFlip.power;r={type:"deadlock",...p,power:g,events:[d],callouts:[p.attackerFlip,p.defenderFlip].filter(y=>e.isPlayerSide(y.combatantId)).map(y=>{let m=y===p.attackerFlip?p.defenderFlip:p.attackerFlip;return{combatantId:y.combatantId,success:!1,title:"\uAD50\uCC29",reason:`${Ci(y.face)} ${y.power} = ${Ci(m.face)} ${m.power} \xB7 \uB2E4\uC2DC \uB4A4\uC9D1\uAE30`}})},l(r);continue}if(r&&au(d)){r.events.push(d);continue}r=null,i.push(d)}let h=[...n].reverse().find(d=>d.type==="win"),u=null;if(h){let d=i.filter(p=>p.type==="damageApplied"&&p.combatantId===h.loserId);d.length>0&&(u={winnerId:h.winnerId,loserId:h.loserId,winnerSkillId:h.winnerId===t.attackerId?t.attackerSkillId:t.defenderSkillId,damage:d.reduce((p,g)=>p+g.damage,0),defeated:i.some(p=>p.type==="defeated"&&p.combatantId===h.loserId)})}return{kind:"clash",attackerId:t.attackerId,defenderId:t.defenderId,attackerSkillId:t.attackerSkillId,defenderSkillId:t.defenderSkillId,rounds:n,finisher:u,events:i}}function au(s){return s.type==="mentalityChanged"||s.type==="deadlockLimit"}function ou(s,e,t,n,i){let r=[];for(let o of[s.attackerId,s.defenderId]){if(!i.isPlayerSide(o))continue;let a=o===s.attackerId?e:t,l=o===s.attackerId?t:e,c=`${Ci(a.face)} ${a.power}`,h=`${Ci(l.face)} ${l.power}`;r.push(o===n?{combatantId:o,success:!0,title:"\uD569 \uC2B9\uB9AC",reason:`${c} > ${h}`}:{combatantId:o,success:!1,title:"\uD569 \uD328\uBC30",reason:`${c} < ${h}`})}return r}function pa(s,e){let t=Math.max(1,Math.floor(e)),n=Math.floor(s/t),i=Array.from({length:t},()=>n);return i[t-1]=s-n*(t-1),i}var lu=["S1","S2","S3","ULT"];function dl(s){let e=[],t=s.enemyMaxHp,n=lu.map(i=>s.cards.find(r=>r.slot===i)).filter(i=>i!==void 0);for(let i of n){let r=i.frontPower;t=Math.max(1,t-r);let o=[{type:"damageApplied",combatantId:s.enemyId,damage:r,hp:t}];e.push({kind:"clash",attackerId:s.allyId,defenderId:s.enemyId,attackerSkillId:i.skillId,defenderSkillId:s.enemyCard.skillId,rounds:[{type:"win",attackerFlip:{combatantId:s.allyId,skillId:i.skillId,face:"front",power:i.frontPower,chance:1},defenderFlip:{combatantId:s.enemyId,skillId:s.enemyCard.skillId,face:"back",power:s.enemyCard.backPower,chance:0},winnerId:s.allyId,loserId:s.enemyId,winnerPower:i.frontPower,loserPower:s.enemyCard.backPower,events:[],callouts:[{combatantId:s.allyId,success:!0,title:"\uD569 \uC2B9\uB9AC",reason:`\uC55E ${i.frontPower} > \uB4A4 ${s.enemyCard.backPower}`}]}],finisher:{winnerId:s.allyId,loserId:s.enemyId,winnerSkillId:i.skillId,damage:r,defeated:!1},events:o})}return e.push({kind:"state",event:{type:"damageApplied",combatantId:s.enemyId,damage:0,hp:s.enemyMaxHp}}),e}var hn=class extends Error{constructor(e){super(`env-vfx: ${e}`),this.name="EnvVfxError"}};function cn(s,e){if(typeof s!="object"||s===null||Array.isArray(s))throw new hn(`${e} \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4`);return s}function Gs(s,e,t){if(!Array.isArray(s)||s.length!==e||s.some(n=>typeof n!="number"))throw new hn(`${t} \uAC00 \uC22B\uC790 ${e}\uAC1C\uAC00 \uC544\uB2C8\uB2E4`);return s}function fl(s,e,t){let n=cn(s,"manifest"),i=new Map;for(let[u,d]of(n.sprites??[]).entries()){let p=cn(d,`sprites[${u}]`),g=String(p.id),y=p.tint_mode==="alpha_silhouette"?"alpha_silhouette":"multiply_rgb";i.set(g,{id:g,atlas:String(p.atlas),rect:Gs(p.atlas_rect_xywh,4,`${g}.atlas_rect_xywh`),canvas:Gs(p.canvas,2,`${g}.canvas`),pivot:Gs(p.pivot_top_left_px,2,`${g}.pivot_top_left_px`),tint:y,usage:String(p.usage??"general")})}let r=new Map;for(let[u,d]of(n.animations??[]).entries()){let p=cn(d,`animations[${u}]`),g=p.frames,y=p.durations_ms;if(!Array.isArray(g)||!Array.isArray(y)||g.length!==y.length)throw new hn(`animations[${u}] \uC7A5 \uC218\uC640 \uC2DC\uAC04 \uC218\uAC00 \uB2E4\uB974\uB2E4`);for(let m of g)if(!i.has(String(m)))throw new hn(`animations[${u}] \uC758 ${String(m)} \uC7A5\uC774 \uC5C6\uB2E4`);r.set(String(p.id),{id:String(p.id),frames:g.map(String),durations:y.map(Number),fadeLast:Number(p.fade_last_ms??0)})}let o=cn(e,"camera-presets"),a=new Map;for(let[u,d]of Object.entries(cn(o.presets,"camera-presets.presets"))){let p=cn(d,`presets.${u}`);a.set(u,{amplitude:Number(p.amplitude_height_ratio??0),duration:Number(p.duration_ms??0),zoom:Number(p.zoom_delta??0)})}let l=Number(o.amplitude_cap_height_ratio??.008),c=new Map;for(let[u,d]of Object.entries(cn(cn(t,"bindings").events,"bindings.events"))){let p=cn(d,`events.${u}`),g=String(p.camera??"none"),y=p.heavyCamera===void 0?null:String(p.heavyCamera);for(let S of[g,y])if(S!==null&&!a.has(S))throw new hn(`events.${u} \uC758 \uCE74\uBA54\uB77C ${S} \uAC00 \uC5C6\uB2E4`);let m=(p.spawns??[]).map((S,v)=>{let T=cn(S,`events.${u}.spawns[${v}]`),R=String(T.play);if(!r.has(R)&&!i.has(R))throw new hn(`events.${u} \uC758 ${R} \uAC00 manifest \uC5D0 \uC5C6\uB2E4`);let C=String(T.anchor);if(!["foot","floor","chest","contact"].includes(C))throw new hn(`events.${u}.anchor ${C} \uB97C \uBAA8\uB978\uB2E4`);return{play:R,anchor:C,offset:Gs(T.offset??[0,0],2,`events.${u}.offset`),scale:Number(T.scale??1),face:T.face==="away"?"away":"toward",hold:Number(T.hold??0),fade:Number(T.fade??0)}}),f=p.surfaces;if(!Array.isArray(f))throw new hn(`events.${u}.surfaces \uAC00 \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4`);c.set(u,{surfaces:f.map(String),camera:g,heavyCamera:y,spawns:m})}let h=Number(cn(t,"bindings").playbackRate??1);if(!(h>0))throw new hn("playbackRate \uAC00 0 \uBCF4\uB2E4 \uD070 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4");return{sprites:i,animations:r,camera:{cap:l,presets:a},events:c,playbackRate:h}}function ma(s){let e=new Set;for(let t of s.events.values())for(let n of t.spawns){let i=s.animations.get(n.play)?.frames??[n.play];for(let r of i){let o=s.sprites.get(r);o&&e.add(o.atlas)}}return[...e].sort()}var En=class extends Error{constructor(e){super(`sounds: ${e}`),this.name="CharacterSoundsError"}};function ga(s,e){if(s===void 0)return{};if(typeof s!="object"||s===null||Array.isArray(s))throw new En(`${e} \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4`);let t={};for(let[n,i]of Object.entries(s))if(!n.startsWith("_")){if(typeof i!="string"||i.length===0)throw new En(`${e}.${n} \uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4`);t[n]=i}return t}function pl(s){if(typeof s!="object"||s===null||Array.isArray(s))throw new En("root \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4");let e=s,t=e.character;if(typeof t!="string"||t.length===0)throw new En("character \uAC00 \uC5C6\uB2E4");let n=ga(e.files,"files"),i=h=>{let u={};for(let[d,p]of Object.entries(e[h]??{}))if(!d.startsWith("_")){if(typeof p!="number"||!(p>=0))throw new En(`${h}.${d} \uAC00 0 \uC774\uC0C1 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);u[d]=p}return u},r=i("gain"),o=i("lead"),a=h=>{let u=e[h];if(u==null)return null;if(typeof u!="string")throw new En(`${h} \uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return u},l={character:t,files:n,gain:r,lead:o,dash:a("dash"),parry:a("parry"),frames:ga(e.frames,"frames"),ultimate:ga(e.ultimate,"ultimate")},c=[l.dash,l.parry,...Object.values(l.frames),...Object.values(l.ultimate),...Object.keys(r),...Object.keys(o)];for(let h of c)if(h!==null&&!(h in n))throw new En(`\uC18C\uB9AC ${h} \uC758 \uD30C\uC77C\uC774 \uC5C6\uB2E4`);return l}var Ht=class extends Error{constructor(e){super(`ultimate: ${e}`),this.name="UltimateArtError"}};function Ri(s,e){if(typeof s!="object"||s===null||Array.isArray(s))throw new Ht(`${e} \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4`);return s}function vn(s,e,t){let n=s[e];if(typeof n!="number"||!Number.isFinite(n))throw new Ht(`${t}.${e} \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);return n}function Tn(s,e,t){let n=s[e];if(typeof n!="string"||n.length===0)throw new Ht(`${t}.${e} \uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return n}var ya=["swapEnvironment","cutsceneStart","cutLine","cutsceneEnd","sheathClick","water","effectsEnd","restoreEnvironment","end"];function ml(s){let e=Ri(s,"root"),t=Ri(e.frames,"frames"),n=Ri(e.effects,"effects"),i=Ri(e.cutscene,"cutscene"),r=i.size;if(!Array.isArray(r)||r.length!==2||r.some(u=>typeof u!="number"))throw new Ht("cutscene.size \uAC00 \uC22B\uC790 2\uAC1C\uAC00 \uC544\uB2C8\uB2E4");let o=Ri(e.timeline,"timeline"),l=Object.fromEntries(["poolIn","swapEnvironment","cutsceneStart","cutLine","cutsceneEnd","appearBehind","sheathClick","water","effectsEnd","restoreEnvironment","restoreFade","end"].map(u=>[u,vn(o,u,"timeline")]));for(let u=1;u<ya.length;u++){let d=ya[u-1],p=ya[u];if(l[p]<l[d])throw new Ht(`timeline.${p} \uAC00 ${d} \uBCF4\uB2E4 \uC774\uB974\uB2E4`)}if(l.appearBehind<l.cutsceneEnd)throw new Ht("timeline.appearBehind \uAC00 \uCEF7\uC2E0\uC774 \uAC77\uD788\uAE30 \uC804\uC774\uB2E4");if(l.restoreEnvironment+l.restoreFade>l.end+1e-9)throw new Ht("\uC804\uC7A5 \uBCF5\uADC0\uAC00 \uB05D\uBCF4\uB2E4 \uB2A6\uB2E4");let c=cu(e.slashes),h=e.environment;return{character:Tn(e,"character","root"),environment:typeof h=="string"&&h.length>0?h:null,frames:{ready:Tn(t,"ready","frames"),open:Tn(t,"open","frames"),closed:Tn(t,"closed","frames")},effects:{pool:Tn(n,"pool","effects"),slash:Tn(n,"slash","effects"),water:Tn(n,"water","effects")},cutscene:{foreground:Tn(i,"foreground","cutscene"),line:Tn(i,"line","cutscene"),size:{width:r[0],height:r[1]},zoomFrom:vn(i,"zoomFrom","cutscene"),zoomTo:vn(i,"zoomTo","cutscene"),lineY:vn(i,"lineY","cutscene"),lineWipe:vn(i,"lineWipe","cutscene"),fade:vn(i,"fade","cutscene")},timeline:l,slashes:c,behindGap:vn(e,"behindGap","root")}}function cu(s){if(s===void 0)return{count:1,interval:0,rollDeg:[0],offset:[[0,0]],jolt:[[0,0]],joltTime:.06};let e=Ri(s,"slashes"),t=vn(e,"count","slashes");if(!Number.isInteger(t)||t<1)throw new Ht("slashes.count \uAC00 1 \uC774\uC0C1 \uC815\uC218\uAC00 \uC544\uB2C8\uB2E4");let n=e.rollDeg,i=e.offset,r=e.jolt??[[0,0]];if(!Array.isArray(n)||n.length===0||n.some(a=>typeof a!="number"))throw new Ht("slashes.rollDeg \uAC00 \uC22B\uC790 \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4");if(!Array.isArray(i)||i.length===0||i.some(a=>!Array.isArray(a)||a.length!==2||a.some(l=>typeof l!="number")))throw new Ht("slashes.offset \uC774 \uC22B\uC790 2\uAC1C\uC9DC\uB9AC \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4");if(!Array.isArray(r)||r.length===0||r.some(a=>!Array.isArray(a)||a.length!==2||a.some(l=>typeof l!="number")))throw new Ht("slashes.jolt \uAC00 \uC22B\uC790 2\uAC1C\uC9DC\uB9AC \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4");let o=e.joltTime===void 0?.06:vn(e,"joltTime","slashes");if(!(o>0))throw new Ht("slashes.joltTime \uC774 0 \uBCF4\uB2E4 \uCEE4\uC57C \uD55C\uB2E4");return{count:t,interval:vn(e,"interval","slashes"),rollDeg:n,offset:i,jolt:r,joltTime:o}}var hu={attack:"\uAC01\uC778",defense:"\uD1B5\uCC30",support:"\uACB0\uC758"};function gl(s,e={}){return Object.entries(e).reduce((t,[n,i])=>t.split(n).join(i),s)}function Xs(s,e,t={}){let n=s.skill(e);return{skillId:e,name:t.name??gl(n.name,t.terms),slot:n.slot,attribute:n.attribute?hu[n.attribute]:null,trace:n.attribute??null,frontPower:n.frontPower,backPower:n.backPower,text:gl(n.text,t.terms)}}var Ws=class{constructor(e,t,n){this.allies=e;this.enemies=t;this.enemyTargets=n;D(this,"current",null);D(this,"pendingTarget",null);D(this,"orders",new Map);this.current=e[0]?.id??null}get selectedAlly(){return this.current}get selectedTarget(){return this.pendingTarget}get ready(){return this.allies.length>0&&this.allies.every(e=>this.orders.has(e.id))}get submitted(){return[...this.orders.values()]}orderOf(e){return this.orders.get(e)??null}get hand(){return this.member(this.current)?.deck??[]}wouldClash(e){return this.current!==null&&this.enemyTargets.get(e)===this.current}selectAlly(e){return this.member(e)?(this.orders.delete(e),this.current=e,this.pendingTarget=null,!0):!1}selectTarget(e){return this.current===null||!this.enemies.includes(e)?!1:(this.pendingTarget=e,!0)}selectCard(e){let t=this.member(this.current);if(!t||this.pendingTarget===null||!t.deck.includes(e))return null;let n={actorId:t.id,targetId:this.pendingTarget,skillId:e};return this.orders.delete(t.id),this.orders.set(t.id,n),this.pendingTarget=null,this.current=this.allies.find(i=>!this.orders.has(i.id))?.id??null,n}member(e){return e===null?void 0:this.allies.find(t=>t.id===e)}};var xa={character:"",frames:{},ultimate:[],ultimateFrame:null,defeat:[],ready:[],readySlots:null,dash:[],clash:[],recoil:[],glow:[]},dt=class extends Error{constructor(e){super(`sprite-manifest: ${e}`),this.name="SpriteManifestError"}};function Jt(s,e){if(typeof s!="object"||s===null||Array.isArray(s))throw new dt(`${e} \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4`);return s}function nn(s,e,t){let n=s[e];if(typeof n!="number"||!Number.isFinite(n))throw new dt(`${t}.${e} \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);return n}function Ct(s,e,t){let n=s[e];if(typeof n!="string")throw new dt(`${t}.${e} \uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return n}function Mt(s,e){if(!Array.isArray(s)||s.length!==2)throw new dt(`${e} \uAC00 [x, y] \uAC00 \uC544\uB2C8\uB2E4`);let[t,n]=s;if(typeof t!="number"||typeof n!="number")throw new dt(`${e} \uC758 \uC88C\uD45C\uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);return{x:t,y:n}}function yl(s,e){return s==null?null:Mt(s,e)}function Gn(s,e,t){let n=s[e];if(!Array.isArray(n))throw new dt(`${t}.${e} \uAC00 \uBC30\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return n}var uu=["bladeTip","hitPoint","groundPoint","emissionPoint"];function du(s,e){let t=`frames[${e}]`,n=Jt(s,t),i=Gn(n,"bbox",t);if(i.length!==4||i.some(r=>typeof r!="number"))throw new dt(`${t}.bbox \uAC00 \uC22B\uC790 4\uAC1C\uAC00 \uC544\uB2C8\uB2E4`);return{id:Ct(n,"id",t),file:Ct(n,"file",t),scale:nn(n,"scale",t),scaleMatch:nn(n,"scaleMatch",t),anchor:Mt(n.anchor,`${t}.anchor`),headCenter:Mt(n.headCenter,`${t}.headCenter`),axeHead:yl(n.axeHead,`${t}.axeHead`),bladeTip:yl(n.bladeTip,`${t}.bladeTip`),tipSource:Ct(n,"tipSource",t),bbox:i,ms:n.ms===void 0?null:nn(n,"ms",t),impact:n.impact===!0,windup:n.windup===!0}}function fu(s,e){let t=`effects[${e}]`,n=Jt(s,t),i=Ct(n,"anchor",t);if(!uu.includes(i))throw new dt(`${t}.anchor \uB97C \uC54C \uC218 \uC5C6\uB2E4: ${i}`);let r=Mt(n.size,`${t}.size`);return{id:Ct(n,"id",t),name:Ct(n,"name",t),anchor:i,size:{width:r.x,height:r.y},pivot:Mt(n.pivot,`${t}.pivot`),scale:nn(n,"scale",t),blend:Ct(n,"blend",t),loop:n.loop===!0,frames:Gn(n,"frames",t).map((o,a)=>{let l=`${t}.frames[${a}]`,c=Jt(o,l);return{file:Ct(c,"file",l),ms:nn(c,"ms",l)}})}}function pu(s){let e=Jt(s,"cutscene"),t=Mt(e.size,"cutscene.size");return{size:{width:t.x,height:t.y},layers:Gn(e,"layers","cutscene").map((n,i)=>{let r=`cutscene.layers[${i}]`,o=Jt(n,r);return{id:Ct(o,"id",r),file:Ct(o,"file",r),pos:Mt(o.pos,`${r}.pos`),pivot:Mt(o.pivot,`${r}.pivot`),z:nn(o,"z",r),parent:Ct(o,"parent",r),visibleDefault:o.visibleDefault===!0,motionDeg:nn(o,"motionDeg",r)}})}}function va(s,e){if(s==null)return null;let t=Mt(s,e);return[t.x,t.y]}function mu(s){let e=Mt(s.size,"cutscene.size"),t=r=>{let o=Jt(s[r],`cutscene.${r}`);return{file:Ct(o,"file",`cutscene.${r}`),patch:Gn(o,"patch",`cutscene.${r}`).map((a,l)=>Mt(a,`cutscene.${r}.patch[${l}]`))}},n=Jt(s.grid,"cutscene.grid"),i=Mt(s.rigid,"cutscene.rigid");return{size:{width:e.x,height:e.y},foreground:Ct(s,"foreground","cutscene"),background:Ct(s,"background","cutscene"),eye:t("eye"),mouth:t("mouth"),grid:{columns:nn(n,"columns","cutscene.grid"),rows:nn(n,"rows","cutscene.grid"),extraRows:Gn(n,"extraRows","cutscene.grid").map((r,o)=>{if(typeof r!="number")throw new dt(`cutscene.grid.extraRows[${o}] \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);return r})},rigid:[i.x,i.y],deformers:Gn(s,"deformers","cutscene").map((r,o)=>{let a=`cutscene.deformers[${o}]`,l=Jt(r,a),c=l.gaussian===void 0?null:Jt(l.gaussian,`${a}.gaussian`);return{id:Ct(l,"id",a),gaussian:c?{center:Mt(c.center,`${a}.gaussian.center`),radius:Mt(c.radius,`${a}.gaussian.radius`)}:null,xRise:va(l.xRise,`${a}.xRise`),yRise:va(l.yRise,`${a}.yRise`),yFall:va(l.yFall,`${a}.yFall`),amp:Mt(l.amp,`${a}.amp`),phase:nn(l,"phase",a)}}),sway:Mt(s.sway,"cutscene.sway"),zoom:nn(s,"zoom","cutscene")}}function vl(s){let e=Jt(s,"root"),t=Mt(e.canvas,"canvas"),n={version:nn(e,"version","root"),character:Ct(e,"character","root"),canvas:{width:t.x,height:t.y},ground:Mt(e.ground,"ground"),frames:Gn(e,"frames","root").map(du),effects:e.effects===void 0?[]:Gn(e,"effects","root").map(fu),cutscene:null,meshCutscene:null};if(e.cutscene!==void 0){let r=Jt(e.cutscene,"cutscene");r.kind==="mesh"?n.meshCutscene=mu(r):n.cutscene=pu(r)}if(n.frames.length===0)throw new dt("\uD504\uB808\uC784\uC774 \uD558\uB098\uB3C4 \uC5C6\uB2E4");let i=new Set;for(let r of n.frames){if(i.has(r.id))throw new dt(`\uD504\uB808\uC784 id \uAC00 \uC911\uBCF5\uB41C\uB2E4: ${r.id}`);i.add(r.id)}for(let r of n.frames)if(r.id.includes("skill")&&!r.bladeTip)throw new dt(`\uACF5\uACA9 \uD504\uB808\uC784\uC5D0 \uB0A0\uB05D\uC774 \uC5C6\uB2E4: ${r.id}`);return n}function xl(s){let e=Jt(s,"bindings"),t={};for(let[n,i]of Object.entries(Jt(e.frames,"bindings.frames")))if(!n.startsWith("_")){if(!Array.isArray(i)||i.some(r=>typeof r!="string"))throw new dt(`bindings.frames.${n} \uAC00 \uBB38\uC790\uC5F4 \uBC30\uC5F4\uC774 \uC544\uB2C8\uB2E4`);t[n]=i}return{character:Ct(e,"character","bindings"),frames:t,ultimate:Vn(e.ultimate,"bindings.ultimate"),ultimateFrame:gu(e.ultimateFrame,"bindings.ultimateFrame"),defeat:Vn(e.defeat,"bindings.defeat"),ready:Vn(e.ready,"bindings.ready"),readySlots:e.readySlots===void 0?null:Vn(e.readySlots,"bindings.readySlots"),dash:Vn(e.dash,"bindings.dash"),clash:Vn(e.clash,"bindings.clash"),recoil:Vn(e.recoil,"bindings.recoil"),glow:Vn(e.glow,"bindings.glow")}}function Vn(s,e){if(s===void 0)return[];if(!Array.isArray(s)||s.some(t=>typeof t!="string"))throw new dt(`${e} \uAC00 \uBB38\uC790\uC5F4 \uBC30\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return s}function gu(s,e){if(s==null)return null;if(typeof s!="string")throw new dt(`${e} \uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4`);return s}var $s=class{constructor(e,t=xa){this.manifest=e;this.bindings=t;D(this,"framesById");D(this,"effectsById");this.framesById=new Map(e.frames.map(n=>[n.id,n])),this.effectsById=new Map(e.effects.map(n=>[n.id,n]));for(let[n,i]of Object.entries(t.frames)){this.frame(n);for(let r of i)this.effect(r)}for(let n of[...t.ultimate,...t.defeat,...t.glow])this.effect(n);t.ultimateFrame&&this.frame(t.ultimateFrame);for(let n of[...t.ready,...t.dash,...t.clash,...t.recoil])if(this.effect(n).anchor==="hitPoint")throw new dt(`\uC0AC\uAC74 \uC774\uD399\uD2B8\uC5D0 \uBA85\uC911 \uC12C\uAD11\uC744 \uC4F8 \uC218 \uC5C6\uB2E4: ${n}`)}get characterHeight(){let e=this.frameEndingWith("idle")??this.manifest.frames[0];if(!e)throw new dt("\uD504\uB808\uC784\uC774 \uD558\uB098\uB3C4 \uC5C6\uB2E4");return e.anchor.y-e.bbox[1]}effectsOnFrame(e){return this.bindings.frames[e]??[]}get ground(){return this.manifest.ground}frame(e){let t=this.framesById.get(e);if(!t)throw new dt(`\uD504\uB808\uC784\uC744 \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${e}`);return t}effect(e){let t=this.effectsById.get(e);if(!t)throw new dt(`\uC774\uD399\uD2B8\uB97C \uCC3E\uC744 \uC218 \uC5C6\uB2E4: ${e}`);return t}frameEndingWith(e){return this.manifest.frames.find(t=>t.id.endsWith(e))??null}effectsByAnchor(e){return this.manifest.effects.filter(t=>t.anchor===e)}frameSequence(e){let t=e==="ULT"?"-ult-":`skill${e[1]}`;return this.manifest.frames.filter(n=>n.id.includes(t)).map(n=>n.id)}};var _a=["dash","flip","clash","clashTie","reveal","swing","hit","hitHeavy","guard","down","ultimate","result"],xn=class extends Error{constructor(e){super(`ui-data: ${e}`),this.name="UiDataError"}};function wt(s,e){if(typeof s!="object"||s===null||Array.isArray(s))throw new xn(`${e} \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4`);return s}function Xe(s,e,t){let n=s[e];if(typeof n!="number"||!Number.isFinite(n))throw new xn(`${t}.${e} \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);return n}function gt(s,e,t,n){let i=s[e];if(typeof i!="string"||i.length===0)throw new xn(`${t}.${e} \uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4`);if(n&&!n.includes(i))throw new xn(`${t}.${e} \uAC00 ${n.join(" | ")} \uC911 \uD558\uB098\uAC00 \uC544\uB2C8\uB2E4: ${i}`);return i}function qs(s,e,t){let n=s[e];if(!Array.isArray(n)||n.length!==2)throw new xn(`${t}.${e} \uAC00 \uC22B\uC790 \uB450 \uAC1C\uC9DC\uB9AC \uBC30\uC5F4\uC774 \uC544\uB2C8\uB2E4`);let[i,r]=n;if(typeof i!="number"||typeof r!="number"||!Number.isFinite(i)||!Number.isFinite(r))throw new xn(`${t}.${e} \uC758 \uAC12\uC774 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`);if(i>r)throw new xn(`${t}.${e} \uC758 \uCD5C\uC18C\uAC00 \uCD5C\uB300\uBCF4\uB2E4 \uD06C\uB2E4`);return[i,r]}function _l(s){let e=wt(s,"ui-data"),t=wt(e.dash,"dash"),n=wt(e.float,"float"),i=wt(e.arrow,"arrow"),r=wt(e.bar,"bar"),o=wt(e.badge,"badge"),a=wt(e.side,"side"),l=wt(e.cutscene,"cutscene"),c=wt(e.motion,"motion"),h=wt(e.camera,"camera"),u=wt(wt(e.floatText,"floatText").colors,"floatText.colors"),d=wt(e.sound,"sound"),p=wt(d.gains,"sound.gains"),g=(y,m)=>{let f=wt(e[y],y);return Object.fromEntries(m.map(S=>[S,Xe(f,S,y)]))};return{dash:{zoneWidth:Xe(t,"zoneWidth","dash"),zoneDepth:Xe(t,"zoneDepth","dash"),pairGap:Xe(t,"pairGap","dash"),lateralJitter:qs(t,"lateralJitter","dash"),depthJitter:Xe(t,"depthJitter","dash"),forward:Xe(t,"forward","dash"),safeDistance:Xe(t,"safeDistance","dash"),retries:Xe(t,"retries","dash"),speed:Xe(t,"speed","dash"),oneSided:gt(t,"oneSided","dash",["attackerOnly","both"])},float:{amplitude:Xe(n,"amplitude","float"),periodSec:Xe(n,"periodSec","float")},arrow:{start:gt(i,"start","arrow",["headCenter","selectedCard"]),curveHeight:Xe(i,"curveHeight","arrow"),segments:Xe(i,"segments","arrow"),drawSec:Xe(i,"drawSec","arrow"),headLength:Xe(i,"headLength","arrow"),headAngleDeg:Xe(i,"headAngleDeg","arrow"),colorStart:gt(i,"colorStart","arrow"),colorEnd:gt(i,"colorEnd","arrow"),allyColorStart:gt(i,"allyColorStart","arrow"),allyColorEnd:gt(i,"allyColorEnd","arrow")},bar:{width:Xe(r,"width","bar"),height:Xe(r,"height","bar"),gap:Xe(r,"gap","bar"),topMargin:Xe(r,"topMargin","bar"),tweenSec:Xe(r,"tweenSec","bar"),easing:gt(r,"easing","bar"),hpColor:gt(r,"hpColor","bar"),mentalityColor:gt(r,"mentalityColor","bar"),numberSize:Xe(r,"numberSize","bar")},badge:{rise:Xe(o,"rise","badge"),riseSec:Xe(o,"riseSec","badge"),deadlockMax:Xe(o,"deadlockMax","badge"),safeTop:Xe(o,"safeTop","badge")},side:{ally:gt(a,"ally","side"),enemy:gt(a,"enemy","side"),ringWidth:Xe(a,"ringWidth","side"),ringDepth:Xe(a,"ringDepth","side"),ringAlpha:Xe(a,"ringAlpha","side"),nameSize:Xe(a,"nameSize","side"),nameGap:Xe(a,"nameGap","side"),rowStagger:Xe(a,"rowStagger","side")},clash:g("clash",["cardSec","powerSec","resultSec","recoilWinner","recoilLoser","recoilSec","sparkSize","cardSize","powerSize","powerOffsetX","powerOffsetY","contactHeight"]),hitStop:g("hitStop",["clashSec","baseSec","perDamageSec","maxSec","slowScale","slowSec"]),damageText:g("damageText",["rise","sec","heavyDamage","height","size"]),banner:g("banner",["sec","height","offsetX","size"]),knockback:g("knockback",["distance","sec"]),flash:g("flash",["alpha","sec"]),exchange:g("exchange",["separateLoser","separateWinner","separateTie","separateSec","lingerSec","reengageSec","pullOut","reengageKick","roundFlashAlpha","roundFlashSec","roundShake","hitFlashAlpha","hitFlashSec"]),afterimage:g("afterimage",["count","intervalSec","alpha"]),motion:{...g("motion",["othersAlpha","windupMs","snapMs","lunge","lungeSec","breathe","breatheSec","hurtSec","swingHoldMs","follow","afterHitSec","blendMs","popScale","popMs","strikeGhosts","strikeGhostAlpha","poseKick","effectFadeMs","bodyGap","bodyGapSec","hurtAlpha","othersFadeSec"]),ghostColor:gt(c,"ghostColor","motion"),hurtColor:gt(c,"hurtColor","motion")},effects:g("effects",["minMs","glowAlpha","glowBlur"]),cutscene:{...g("cutscene",["sec","inSec","outSec","dim","bandSkewDeg","bandHeight","slideFrom","pushZoom","swaySec","flashAlpha"]),blinkAt:qs(l,"blinkAt","cutscene"),mouthAt:qs(l,"mouthAt","cutscene")},camera:{...g("camera",["focusZoom","punchZoom","punchSec","tiltDeg","slowmoScale","slowmoSec","shakeReferenceDamage"]),depthZoom:qs(h,"depthZoom","camera")},down:g("down",["sec","dim"]),floatText:{...g("floatText",["size","rise","sec","height","chipSize","chipGap"]),colors:{self:gt(u,"self","floatText.colors"),tick:gt(u,"tick","floatText.colors"),execute:gt(u,"execute","floatText.colors"),nullify:gt(u,"nullify","floatText.colors"),status:gt(u,"status","floatText.colors")}},result:g("result",["inSec","bandHeight","size"]),display:yu(e.display),sound:{master:Xe(d,"master","sound"),gains:Object.fromEntries(_a.map(y=>[y,Xe(p,y,"sound.gains")]))}}}function yu(s){let e=wt(s,"display"),t=(r,o)=>{let a=wt(r,o);for(let l of Object.keys(a))gt(a,l,o);return a},n=wt(e.cardKit,"display.cardKit"),i={};for(let[r,o]of Object.entries(n)){let a=t(o,`display.cardKit.${r}`);i[r]=Object.fromEntries(Object.entries(a).map(([l,c])=>{if(!/^\d+$/.test(l))throw new xn(`display.cardKit.${r} \uC758 \uD0A4\uAC00 \uAE30\uC220 id \uAC00 \uC544\uB2C8\uB2E4: ${l}`);return[Number(l),c]}))}return{terms:t(e.terms,"display.terms"),cardKit:i}}async function Ys(s){let e=await fetch(s);if(!e.ok)throw new Error(`${s} \uB97C \uC77D\uC744 \uC218 \uC5C6\uB2E4 (${e.status})`);return e.json()}async function bl(s,e){let t;try{t=vl(await Ys(`${s}/${e}/sprite-manifest.json`))}catch{return null}let n=xa;try{n=xl(await Ys(`${s}/${e}/effect-bindings.json`))}catch{}return new $s(t,n)}async function Sl(s){let e=await Ys(`${s}/index.json`),t=e&&typeof e=="object"?e.characters:null;if(!Array.isArray(t)||t.some(n=>typeof n!="string"))throw new Error("assets/index.json \uC758 characters \uAC00 \uBB38\uC790\uC5F4 \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4");return new Set(t)}async function Ml(s){return _l(await Ys(`${s}/ui/ui-data.json`))}var vu=["attack","defense","support"],xu={attack:"\uAC01\uC778",defense:"\uD1B5\uCC30",support:"\uACB0\uC758"},_u={attack:"R_mark",defense:"R_insight",support:"R_resolve"},bu="\uBA3C\uC800 \uCE60 \uC801\uC744 \uBB34\uB300\uC5D0\uC11C \uACE0\uB978\uB2E4";function at(s,e="",t=""){let n=document.createElement(s);return e&&(n.className=e),t&&(n.textContent=t),n}var Zs=class{constructor(e,t,n,i=()=>null,r=null){this.catalog=e;this.side=t;this.handlers=n;this.portrait=i;this.detail=r;D(this,"root");D(this,"step");D(this,"hint");D(this,"allies");D(this,"enemies");D(this,"cards");D(this,"detailLine");D(this,"goButton");D(this,"goLocked","");D(this,"detailRest",[]);let o=a=>{let l=document.getElementById(a);if(!l)throw new Error(`\uBA85\uB839 \uD328\uB110 \uC694\uC18C\uAC00 \uC5C6\uB2E4: #${a}`);return l};this.root=o("command"),this.step=o("cmd-step"),this.hint=o("cmd-hint"),this.allies=o("cmd-allies"),this.enemies=o("cmd-enemies"),this.cards=o("cmd-cards"),this.goButton=o("cmd-go"),this.detailLine=document.getElementById("cmd-detail"),this.goButton.addEventListener("click",()=>{this.goButton.getAttribute("aria-disabled")==="true"?this.say(this.goLocked):n.go()})}say(e){e&&this.hint.replaceChildren(at("strong","",e))}lock(e,t){e.classList.toggle("locked",t),e.setAttribute("aria-disabled",String(t))}showDetail(e,t=!1){this.detailLine&&(this.detailLine.replaceChildren(...e),t&&(this.detailRest=Array.from(this.detailLine.childNodes)))}view(e,t){let n=this.detail?.display;return Xs(this.catalog,t,{name:n?.cardKit[e]?.[t],terms:n?.terms})}glyph(e){let t=at("i","trace");return t.dataset.trace=e,this.detail?.kit&&t.style.setProperty("--glyph",`url(${this.detail.kit}/${_u[e]}.png)`),t}chanceText(e,t){let n=t.map(o=>this.detail?.chance(e,o)??null).filter(o=>o!==null).map(o=>Math.round(o*100));if(n.length===0)return"";let i=Math.min(...n),r=Math.max(...n);return i===r?`\uC55E\uBA74 \uD655\uB960 ${i}%`:`\uC55E\uBA74 \uD655\uB960 ${i}~${r}%`}traceNodes(e){let t=this.detail?.traces(e);if(!t)return[];let n=[];for(let r of vu){let o=at("span","trace-count");o.append(this.glyph(r),`${xu[r]} ${t[r]}`),n.push(o)}let i=t.attack+t.defense+t.support;return n.push(at("span","trace-total",`\uACB0\uD589 ${Math.min(i,t.threshold)}/${t.threshold}`)),n}idle(e){this.root.classList.add("off"),this.step.textContent=e,this.hint.textContent="",this.showDetail([],!0),this.goButton.disabled=!0,this.lock(this.goButton,!0)}show(e,t,n){this.root.classList.remove("off");let i=t.find(a=>a.id===e.selectedAlly)??null,r=n.find(a=>a.id===e.selectedTarget)??null;if(e.ready&&!i)this.step.textContent="\uC900\uBE44 \uC644\uB8CC \u2014 \uAD50\uC804 \uC2DC\uC791",this.hint.textContent="\uC544\uAD70 \uCE78\uC744 \uB204\uB974\uBA74 \uADF8 \uC9C0\uC2DC\uB97C \uB2E4\uC2DC \uD55C\uB2E4";else if(!i)this.step.textContent="\u2460 \uC544\uAD70\uC744 \uACE0\uB978\uB2E4",this.hint.textContent="";else if(r)this.step.textContent=`\u2462 ${i.name} \u2192 ${r.name} \u2014 \uCE74\uB4DC\uB97C \uACE0\uB978\uB2E4`,this.hint.textContent=e.wouldClash(r.id)?"\uD569\uC774 \uBC8C\uC5B4\uC9C4\uB2E4":"\uC77C\uBC29 \uACF5\uACA9\uC774\uB2E4 (\uC11C\uB85C \uACA8\uB8E8\uC9C0 \uC54A\uB294\uB2E4)";else{this.step.textContent=`\u2461 ${i.name} \u2014 \uCE60 \uC801\uC744 \uACE0\uB978\uB2E4`;let a=n.filter(l=>e.wouldClash(l.id)).map(l=>l.name);this.hint.innerHTML="",a.length>0?(this.hint.append("\uB098\uB97C \uB178\uB9AC\uB294 \uC801: "),this.hint.append(at("strong","",a.join(", "))),this.hint.append(" \u2014 \uAC19\uC774 \uB178\uB9AC\uBA74 \uD569, \uB2E4\uB978 \uC801\uC744 \uCE58\uBA74 \uC11C\uB85C \uD55C \uB300\uC529 \uB9DE\uB294\uB2E4")):this.hint.textContent="\uC774\uBC88 \uD134\uC5D0 \uB098\uB97C \uB178\uB9AC\uB294 \uC801\uC774 \uC5C6\uB2E4. \uB204\uAD6C\uB97C \uCCD0\uB3C4 \uC77C\uBC29 \uACF5\uACA9\uC774\uB2E4"}if(i){let a=this.chanceText(i.id,i.deck);this.showDetail([...a?[at("span","chance",a)]:[],...this.traceNodes(i.id)],!0)}else this.showDetail([],!0);this.allies.replaceChildren(...t.map(a=>{let l=e.orderOf(a.id),c=this.pick(a.name,this.side.ally,a.id===e.selectedAlly),h=this.portrait(a.characterId);if(h){let d=at("span","face"),p=at("img");p.src=h,p.alt="",d.append(p),c.prepend(d)}let u=l?`${n.find(d=>d.id===l.targetId)?.name??"?"} \xB7 ${this.view(a.characterId,l.skillId).name}`:a.id===e.selectedAlly?"\uC9C0\uC2DC \uC911":"\uB300\uAE30";return c.append(at("small","",u)),l&&c.classList.add("done"),c.addEventListener("click",()=>this.handlers.ally(a.id)),c})),this.enemies.replaceChildren(...n.map(a=>{let l=this.pick(a.name,this.side.enemy,a.id===e.selectedTarget),c=e.wouldClash(a.id);return l.append(at("small","",c?"\uB098\uB97C \uB178\uB9BC \xB7 \uD569":"\uC77C\uBC29")),c&&l.classList.add("clash"),l.disabled=!i,l.addEventListener("click",()=>this.handlers.target(a.id)),l})),this.cards.replaceChildren(...(i?i.deck:[]).map(a=>{let l=this.view(i?.characterId??"",a),c=i?e.orderOf(i.id)?.skillId===a:!1,h=!!this.detail?.kit&&!!i&&this.detail.display?.cardKit[i.characterId]?.[a]!==void 0,u=at("button",`card ${l.slot==="ULT"?"ult":l.slot.toLowerCase()}${c?" chosen":""}${h?" k":""}`);if(u.type="button",h&&this.detail?.kit)for(let v of["default","selected","locked"])u.style.setProperty(`--k-${v}`,`url(${this.detail.kit}/K${a}_${v}.png)`);let d=l.attribute??"\uACB0\uD589";u.title=`${l.name} (${d}) \u2014 ${l.text}`,u.setAttribute("aria-label",`${l.name}, ${d}, \uC55E ${l.frontPower} \uB4A4 ${l.backPower}. ${l.text}`);let p=at("span","art");h||p.append(l.trace?this.glyph(l.trace):at("i","trace ult"));let g=at("span","pw front");g.append(at("small","","\uC55E"),String(l.frontPower));let y=at("span","pw back");y.append(at("small","","\uB4A4"),String(l.backPower)),u.append(at("span","title",l.name),p,g,y,at("span","kind",d));let m=!r;this.lock(u,m);let f=()=>{let v=i?this.detail?.chance(i.id,a):null,T=[at("strong","",l.name),` \u2014 ${l.text}`];v!=null&&T.push(at("span","chance",` \xB7 \uC55E\uBA74 ${Math.round(v*100)}%`)),this.showDetail(T)},S=()=>this.showDetail(this.detailRest);return u.addEventListener("pointerenter",f),u.addEventListener("focus",f),u.addEventListener("pointerleave",S),u.addEventListener("blur",S),u.addEventListener("click",()=>{m?this.say(bu):this.handlers.card(a)}),u}));let o=t.filter(a=>!e.orderOf(a.id)).map(a=>a.name);this.goLocked=o.length>0?`\uC9C0\uC2DC\uAC00 \uB0A8\uC740 \uC544\uAD70: ${o.join(", ")}`:"",this.goButton.disabled=!1,this.lock(this.goButton,!e.ready)}pick(e,t,n){let i=at("button","pick");return i.type="button",i.style.setProperty("--side",t),i.setAttribute("aria-pressed",String(n)),i.append(at("b","",e)),i}};function Su(s){let e=s.createBuffer(1,s.sampleRate,s.sampleRate),t=e.getChannelData(0);for(let n=0;n<t.length;n+=1)t[n]=Math.random()*2-1;return e}var Js=class{constructor(e){this.data=e;D(this,"audio",null);D(this,"master",null);D(this,"noise",null);D(this,"muted",!1);D(this,"recipes");D(this,"pending",new Map);D(this,"samples",new Map);this.recipes={dash:(t,n,i)=>this.whoosh(t,n,i,700,2600,.24),flip:(t,n,i)=>{this.ping(t,n,i,2500,.07,.5),this.ping(t,n,i+.02,3700,.05,.3)},clash:(t,n,i)=>this.metal(t,n,i,1,.55),clashTie:(t,n,i)=>this.metal(t,n,i,.8,.35),reveal:(t,n,i)=>{this.ping(t,n,i,1760,.45,.9),this.ping(t,n,i,3520,.3,.35)},swing:(t,n,i)=>this.whoosh(t,n,i,400,1800,.2),hit:(t,n,i)=>{this.drop(t,n,i,150,45,.2,"sine",1),this.burst(t,n,i,"lowpass",1400,.08,.7)},hitHeavy:(t,n,i)=>{this.drop(t,n,i,120,32,.34,"sine",1),this.drop(t,n,i,240,60,.12,"square",.25),this.burst(t,n,i,"lowpass",2200,.16,.9)},guard:(t,n,i)=>{this.metal(t,n,i,1.4,.18),this.drop(t,n,i,320,200,.12,"triangle",.5)},down:(t,n,i)=>{this.drop(t,n,i,85,28,.7,"sine",1),this.burst(t,n,i,"lowpass",420,.55,.6)},ultimate:(t,n,i)=>{this.whoosh(t,n,i,200,4200,.7),this.drop(t,n,i,55,50,1.1,"sawtooth",.18)},result:(t,n,i)=>{this.tone(t,n,i,196,1.4,.4),this.tone(t,n,i+.08,294,1.3,.3)}}}unlock(){if(!this.audio){let t=globalThis.AudioContext;if(!t)return;this.audio=new t,this.master=this.audio.createGain(),this.master.gain.value=this.data.master,this.master.connect(this.audio.destination),this.noise=Su(this.audio)}let e=globalThis.navigator?.audioSession;if(e&&(e.type="playback"),this.audio.state!=="running"){this.audio.resume().catch(()=>{});let t=this.audio.createBufferSource();t.buffer=this.audio.createBuffer(1,1,22050),t.connect(this.audio.destination),t.start(0)}this.decodePending()}get running(){return this.audio?.state==="running"}addSample(e,t){this.pending.set(e,t),this.decodePending()}decodePending(){let e=this.audio;if(e)for(let[t,n]of this.pending)this.pending.delete(t),e.decodeAudioData(n).then(i=>this.samples.set(t,i),()=>{})}playSample(e,t=1,n={}){let i=this.audio,r=this.samples.get(e);if(!i||!this.master||!r)return!1;if(this.muted||i.state!=="running")return!0;let o=i.createBufferSource();o.buffer=r;let a=i.createGain();a.gain.value=t,o.connect(a);let l=Math.max(-1,Math.min(1,n.pan??0));if(l!==0&&typeof i.createStereoPanner=="function"){let c=i.createStereoPanner();c.pan.value=l,a.connect(c),c.connect(this.master)}else a.connect(this.master);return o.start(i.currentTime+.005+Math.max(0,n.delay??0)),!0}setMuted(e){this.muted=e}play(e){let t=this.audio;if(!t||!this.master||this.muted||t.state!=="running")return;let n=this.data.gains[e];if(!(n>0)||!_a.includes(e))return;let i=t.createGain();i.gain.value=n,i.connect(this.master),this.recipes[e](t,i,t.currentTime+.005)}envelope(e,t,n,i){let r=e.createGain();return r.gain.setValueAtTime(1e-4,t),r.gain.exponentialRampToValueAtTime(Math.max(2e-4,n),t+.006),r.gain.exponentialRampToValueAtTime(1e-4,t+i),r}drop(e,t,n,i,r,o,a,l){let c=e.createOscillator();c.type=a,c.frequency.setValueAtTime(i,n),c.frequency.exponentialRampToValueAtTime(Math.max(1,r),n+o);let h=this.envelope(e,n,l,o);c.connect(h).connect(t),c.start(n),c.stop(n+o+.02)}ping(e,t,n,i,r,o){this.drop(e,t,n,i,i*.98,r,"sine",o)}tone(e,t,n,i,r,o){let a=e.createOscillator();a.type="triangle",a.frequency.value=i;let l=e.createGain();l.gain.setValueAtTime(1e-4,n),l.gain.exponentialRampToValueAtTime(o,n+.12),l.gain.exponentialRampToValueAtTime(1e-4,n+r),a.connect(l).connect(t),a.start(n),a.stop(n+r+.02)}burst(e,t,n,i,r,o,a){if(!this.noise)return;let l=e.createBufferSource();l.buffer=this.noise;let c=e.createBiquadFilter();c.type=i,c.frequency.value=r;let h=this.envelope(e,n,a,o);l.connect(c).connect(h).connect(t),l.start(n,Math.random()*.5),l.stop(n+o+.02)}whoosh(e,t,n,i,r,o){if(!this.noise)return;let a=e.createBufferSource();a.buffer=this.noise;let l=e.createBiquadFilter();l.type="bandpass",l.Q.value=1.4,l.frequency.setValueAtTime(i,n),l.frequency.exponentialRampToValueAtTime(r,n+o*.7);let c=e.createGain();c.gain.setValueAtTime(1e-4,n),c.gain.exponentialRampToValueAtTime(.8,n+o*.35),c.gain.exponentialRampToValueAtTime(1e-4,n+o),a.connect(l).connect(c).connect(t),a.start(n,Math.random()*.4),a.stop(n+o+.02)}metal(e,t,n,i,r){[520,1230,1870,2750,3910].forEach((a,l)=>{let c=e.createOscillator();c.type="sine",c.frequency.value=a*i;let h=this.envelope(e,n,.35/(l+1),r*(1-l*.12));c.connect(h).connect(t),c.start(n),c.stop(n+r+.02)}),this.burst(e,t,n,"highpass",2400,.05,.9)}};var zt=class extends Error{constructor(e){super(`stage3d: ${e}`),this.name="Stage3dConfigError"}};function un(s,e){if(typeof s!="object"||s===null||Array.isArray(s))throw new zt(`${e} \uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2C8\uB2E4`);return s}function yt(s,e,t){let n=un(s,e),i={};for(let r of t){let o=n[r];if(Array.isArray(o)){if(o.some(a=>typeof a!="number"))throw new zt(`${e}.${r} \uC5D0 \uC22B\uC790\uAC00 \uC544\uB2CC \uAC12\uC774 \uC788\uB2E4`);i[r]=o}else if(typeof o=="number"&&Number.isFinite(o))i[r]=o;else throw new zt(`${e}.${r} \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4`)}return i}function El(s){let e=un(s,"stage3d");return{battle:Mu(e.battle),layout:yt(e.layout,"layout",["characterHeight","sideHalfGap","rowDepth","rowOutward","textureMaxSide"]),motion:yt(e.motion,"motion",["windupTime","windupBack","dashTime","contactGap","strikeTime","strikeReach","knockTime","knockBase","knockPerDamage","knockMax","staggerDrop","staggerHold","lingerAfterHit","strikeTrailTime","strikeTrailPeakShare","settleTime","settleAmplitude","settlePeriod","returnTime","clashWinnerRecoil","clashPush","deadlockPush","reengageTime","roundRest","downTime","downSink","downOpacity","heavyDamage","bystanderFade","foregroundFade","readyHold","followTime","hitKnock","parryLunge","hitSlowScale","hitSlowTime","followSpeed","decayEase"]),camera:yt(e.camera,"camera",["focusSizeGain","focusHeight","panYawDeg","dutchDeg","fovZoom","followTime","returnFollowTime"]),shake:yt(e.shake,"shake",["damageForMaxShake","traumaPerHit","traumaPerDamage","traumaDecay","maxOffset","maxAngle","frequency","kickImpulse","kickStiffness","kickDamping","fovPunch","clashPower"]),hitStop:yt(e.hitStop,"hitStop",["scale","baseSeconds","perDamageSeconds","maxSeconds","clashSeconds"]),sparks:yt(e.sparks,"sparks",["countHit","countClash","speedMin","speedMax","gravity","drag","lifeMin","lifeMax","length","width","coneDeg","backShare","coreSize","coreLife","contactBias"]),callout:yt(e.callout,"callout",["seconds","headOffset"]),cardFlip:yt(e.cardFlip,"cardFlip",["slowScale","approachShare","spinTime","spinTurns","revealPop","holdTime","height","headLift","fadeTime"]),footGauge:yt(e.footGauge,"footGauge",["widthRatio","minWidth","maxWidth","criticalRatio","lossSeconds","downFade"]),framing:yt(e.framing,"framing",["maxZoomOut","cover","tagMargin","footMargin","sideMargin","bodyHalfWidth","headHeight"]),lab:Eu(e.lab)}}function Mu(s){let e=un(s,"battle"),t=r=>{let o=e[r];if(!Array.isArray(o)||o.length===0||o.some(a=>typeof a!="string"))throw new zt(`battle.${r} \uAC00 \uCE90\uB9AD\uD130 id \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4`);return o};if(typeof e.map!="string")throw new zt("battle.map \uC774 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4");let n=un(e.artAlias??{},"battle.artAlias"),i={};for(let[r,o]of Object.entries(n))typeof o=="string"&&(i[r]=o);return{map:e.map,ally:t("ally"),enemy:t("enemy"),artAlias:i}}function ba(s){let e=un(s,"placement"),t=un(e.projection,"placement.projection"),n=yt(t.camera,"projection.camera",["back","height","lookAtHeight","fov","aspect"]),i=t.standSpread,r=t.scaleAnchor;if(typeof i!="number")throw new zt("projection.standSpread \uAC00 \uC22B\uC790\uAC00 \uC544\uB2C8\uB2E4");if(!Array.isArray(r)||r.length!==2||r.some(g=>typeof g!="number"))throw new zt("projection.scaleAnchor \uAC00 \uC22B\uC790 2\uAC1C\uAC00 \uC544\uB2C8\uB2E4");let o=un(t.layers,"projection.layers"),a=e.layers;if(!Array.isArray(a))throw new zt("placement.layers \uAC00 \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4");let l=[];for(let[g,y]of Object.entries(o)){let m=un(y,`projection.layers.${g}`),f=a.map(T=>un(T,"placement.layers[]")).find(T=>T.id===g);if(!f)throw new zt(`placement.layers \uC5D0 ${g} \uAC00 \uC5C6\uB2E4`);let S=(T,R)=>typeof m[T]=="number"?m[T]:R,v=m.shape==="floor"?"floor":"stand";l.push({file:String(f.file),rect:[Number(f.x),Number(f.y),Number(f.width),Number(f.height)],shape:v,depth:S("depth",20),scale:S("scale",1),offsetY:S("offsetY",0),near:S("near",-8),far:S("far",40),halfWidth:S("halfWidth",45),mirrorX:m.mirrorOutsideX===!0,mirrorY:m.mirrorOutsideY===!0,order:S("order",v==="floor"?-10:-20),hideInCombat:m.hideInCombat===!0,draws:wu(f.draws,g)})}let c=typeof e.name=="string"?e.name:"",h=e.viewport,u=Array.isArray(h)&&h.length===2&&h.every(g=>typeof g=="number")?[h[0],h[1]]:[1672,941],d=e.surface,p=typeof d=="object"&&d!==null&&!Array.isArray(d)?{kind:String(d.kind??"concrete"),tint:String(d.tint??"#909090"),crack:String(d.crack??"#262626")}:{kind:"concrete",tint:"#909090",crack:"#262626"};return{name:c,viewport:u,camera:n,standSpread:i,scaleAnchor:[r[0],r[1]],layers:l,surface:p}}function wl(s,e){if(!Array.isArray(s)||s.length!==4||s.some(t=>typeof t!="number"))throw new zt(`${e} \uAC00 \uC22B\uC790 4\uAC1C\uAC00 \uC544\uB2C8\uB2E4`);return s}function wu(s,e){if(s===void 0)return[];if(!Array.isArray(s))throw new zt(`placement.layers.${e}.draws \uAC00 \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4`);return s.map((t,n)=>{let i=un(t,`placement.layers.${e}.draws[${n}]`);return{source:wl(i.source,`${e}.draws[${n}].source`),destination:wl(i.destination,`${e}.draws[${n}].destination`)}})}function Eu(s){let e=un(s,"lab"),t=r=>yt(e[r],`lab.${r}`,["light","heavy","climax"]),n=yt(e,"lab",["attackerHold","finalBeatPause"]),i=yt(e.ultimate,"lab.ultimate",["payoffDelay","slashIntervals"]);if(!Array.isArray(i.slashIntervals)||i.slashIntervals.length===0)throw new zt("lab.ultimate.slashIntervals \uAC00 \uC22B\uC790 \uBAA9\uB85D\uC774 \uC544\uB2C8\uB2E4");return{hitStop:t("hitStop"),attackerHold:n.attackerHold,finalBeatPause:n.finalBeatPause,shake:t("shake"),dim:yt(e.dim,"lab.dim",["level","in","hold","out"]),impactFrame:yt(e.impactFrame,"lab.impactFrame",["seconds"]),breath:yt(e.breath,"lab.breath",["amplitude","period"]),pan:yt(e.pan,"lab.pan",["width"]),voiceGain:yt(e.voiceGain,"lab.voiceGain",["intermediate","final"]),ultimate:i}}var Oo="160";var Tu=0,Tl=1,Au=2;var Zc=1,Cu=2,Ln=3,ni=0,Xt=1,Ot=2;var Kn=0,jn=1,_i=2,Al=3,Cl=4,Ru=5,pi=100,Pu=101,Iu=102,Rl=103,Pl=104,Lu=200,Du=201,ku=202,Uu=203,eo=204,to=205,Fu=206,Nu=207,Ou=208,Bu=209,Hu=210,zu=211,Vu=212,Gu=213,Wu=214,Xu=0,$u=1,qu=2,Mr=3,Yu=4,Zu=5,Ju=6,Ku=7,Jc=0,ju=1,Qu=2,Qn=0,ed=1,td=2,nd=3,id=4,sd=5,rd=6;var Kc=300,es=301,ts=302,no=303,io=304,Xr=306,so=1e3,Gt=1001,ns=1002,Nt=1003,Il=1004;var Sa=1005;var rn=1006,ad=1007;var Es=1008;var ei=1009,od=1010,ld=1011,Bo=1012,jc=1013,Zn=1014,Jn=1015,Ts=1016,Qc=1017,eh=1018,yi=1020,cd=1021,mn=1023,hd=1024,ud=1025,vi=1026,is=1027,dd=1028,th=1029,fd=1030,nh=1031,ih=1033,Ma=33776,wa=33777,Ea=33778,Ta=33779,Ll=35840,Dl=35841,kl=35842,Ul=35843,sh=36196,Fl=37492,Nl=37496,Ol=37808,Bl=37809,Hl=37810,zl=37811,Vl=37812,Gl=37813,Wl=37814,Xl=37815,$l=37816,ql=37817,Yl=37818,Zl=37819,Jl=37820,Kl=37821,Aa=36492,jl=36494,Ql=36495,pd=36283,ec=36284,tc=36285,nc=36286;var wr=2300,Er=2301,Ca=2302,ic=2400,sc=2401,rc=2402;var rh=3e3,xi=3001,md=3200,gd=3201,yd=0,vd=1,an="",Ye="srgb",Nn="srgb-linear",Ho="display-p3",$r="display-p3-linear",Tr="linear",nt="srgb",Ar="rec709",Cr="p3";var Pi=7680;var ac=519,xd=512,_d=513,bd=514,ah=515,Sd=516,Md=517,wd=518,Ed=519,ro=35044;var oc="300 es",ao=1035,Un=2e3,Rr=2001,ii=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){if(this._listeners===void 0)return!1;let n=this._listeners;return n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){if(this._listeners===void 0)return;let i=this._listeners[e];if(i!==void 0){let r=i.indexOf(t);r!==-1&&i.splice(r,1)}}dispatchEvent(e){if(this._listeners===void 0)return;let n=this._listeners[e.type];if(n!==void 0){e.target=this;let i=n.slice(0);for(let r=0,o=i.length;r<o;r++)i[r].call(this,e);e.target=null}}},Lt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];var Ra=Math.PI/180,oo=180/Math.PI;function ti(){let s=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Lt[s&255]+Lt[s>>8&255]+Lt[s>>16&255]+Lt[s>>24&255]+"-"+Lt[e&255]+Lt[e>>8&255]+"-"+Lt[e>>16&15|64]+Lt[e>>24&255]+"-"+Lt[t&63|128]+Lt[t>>8&255]+"-"+Lt[t>>16&255]+Lt[t>>24&255]+Lt[n&255]+Lt[n>>8&255]+Lt[n>>16&255]+Lt[n>>24&255]).toLowerCase()}function Vt(s,e,t){return Math.max(e,Math.min(t,s))}function Td(s,e){return(s%e+e)%e}function Pa(s,e,t){return(1-t)*s+t*e}function lc(s){return(s&s-1)===0&&s!==0}function lo(s){return Math.pow(2,Math.floor(Math.log(s)/Math.LN2))}function kn(s,e){switch(e.constructor){case Float32Array:return s;case Uint32Array:return s/4294967295;case Uint16Array:return s/65535;case Uint8Array:return s/255;case Int32Array:return Math.max(s/2147483647,-1);case Int16Array:return Math.max(s/32767,-1);case Int8Array:return Math.max(s/127,-1);default:throw new Error("Invalid component type.")}}function et(s,e){switch(e.constructor){case Float32Array:return s;case Uint32Array:return Math.round(s*4294967295);case Uint16Array:return Math.round(s*65535);case Uint8Array:return Math.round(s*255);case Int32Array:return Math.round(s*2147483647);case Int16Array:return Math.round(s*32767);case Int8Array:return Math.round(s*127);default:throw new Error("Invalid component type.")}}var Ue=class s{constructor(e=0,t=0){s.prototype.isVector2=!0,this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6],this.y=i[1]*t+i[4]*n+i[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(Vt(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),i=Math.sin(t),r=this.x-e.x,o=this.y-e.y;return this.x=r*n-o*i+e.x,this.y=r*i+o*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},ze=class s{constructor(e,t,n,i,r,o,a,l,c){s.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,i,r,o,a,l,c)}set(e,t,n,i,r,o,a,l,c){let h=this.elements;return h[0]=e,h[1]=i,h[2]=a,h[3]=t,h[4]=r,h[5]=l,h[6]=n,h[7]=o,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,i=t.elements,r=this.elements,o=n[0],a=n[3],l=n[6],c=n[1],h=n[4],u=n[7],d=n[2],p=n[5],g=n[8],y=i[0],m=i[3],f=i[6],S=i[1],v=i[4],T=i[7],R=i[2],C=i[5],A=i[8];return r[0]=o*y+a*S+l*R,r[3]=o*m+a*v+l*C,r[6]=o*f+a*T+l*A,r[1]=c*y+h*S+u*R,r[4]=c*m+h*v+u*C,r[7]=c*f+h*T+u*A,r[2]=d*y+p*S+g*R,r[5]=d*m+p*v+g*C,r[8]=d*f+p*T+g*A,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],o=e[4],a=e[5],l=e[6],c=e[7],h=e[8];return t*o*h-t*a*c-n*r*h+n*a*l+i*r*c-i*o*l}invert(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],o=e[4],a=e[5],l=e[6],c=e[7],h=e[8],u=h*o-a*c,d=a*l-h*r,p=c*r-o*l,g=t*u+n*d+i*p;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);let y=1/g;return e[0]=u*y,e[1]=(i*c-h*n)*y,e[2]=(a*n-i*o)*y,e[3]=d*y,e[4]=(h*t-i*l)*y,e[5]=(i*r-a*t)*y,e[6]=p*y,e[7]=(n*l-c*t)*y,e[8]=(o*t-n*r)*y,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,i,r,o,a){let l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*o+c*a)+o+e,-i*c,i*l,-i*(-c*o+l*a)+a+t,0,0,1),this}scale(e,t){return this.premultiply(Ia.makeScale(e,t)),this}rotate(e){return this.premultiply(Ia.makeRotation(-e)),this}translate(e,t){return this.premultiply(Ia.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let i=0;i<9;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}},Ia=new ze;function oh(s){for(let e=s.length-1;e>=0;--e)if(s[e]>=65535)return!0;return!1}function Pr(s){return document.createElementNS("http://www.w3.org/1999/xhtml",s)}function Ad(){let s=Pr("canvas");return s.style.display="block",s}var cc={};function Ms(s){s in cc||(cc[s]=!0,console.warn(s))}var hc=new ze().set(.8224621,.177538,0,.0331941,.9668058,0,.0170827,.0723974,.9105199),uc=new ze().set(1.2249401,-.2249404,0,-.0420569,1.0420571,0,-.0196376,-.0786361,1.0982735),Ks={[Nn]:{transfer:Tr,primaries:Ar,toReference:s=>s,fromReference:s=>s},[Ye]:{transfer:nt,primaries:Ar,toReference:s=>s.convertSRGBToLinear(),fromReference:s=>s.convertLinearToSRGB()},[$r]:{transfer:Tr,primaries:Cr,toReference:s=>s.applyMatrix3(uc),fromReference:s=>s.applyMatrix3(hc)},[Ho]:{transfer:nt,primaries:Cr,toReference:s=>s.convertSRGBToLinear().applyMatrix3(uc),fromReference:s=>s.applyMatrix3(hc).convertLinearToSRGB()}},Cd=new Set([Nn,$r]),je={enabled:!0,_workingColorSpace:Nn,get workingColorSpace(){return this._workingColorSpace},set workingColorSpace(s){if(!Cd.has(s))throw new Error(`Unsupported working color space, "${s}".`);this._workingColorSpace=s},convert:function(s,e,t){if(this.enabled===!1||e===t||!e||!t)return s;let n=Ks[e].toReference,i=Ks[t].fromReference;return i(n(s))},fromWorkingColorSpace:function(s,e){return this.convert(s,this._workingColorSpace,e)},toWorkingColorSpace:function(s,e){return this.convert(s,e,this._workingColorSpace)},getPrimaries:function(s){return Ks[s].primaries},getTransfer:function(s){return s===an?Tr:Ks[s].transfer}};function ji(s){return s<.04045?s*.0773993808:Math.pow(s*.9478672986+.0521327014,2.4)}function La(s){return s<.0031308?s*12.92:1.055*Math.pow(s,.41666)-.055}var Ii,Ir=class{static getDataURL(e){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let t;if(e instanceof HTMLCanvasElement)t=e;else{Ii===void 0&&(Ii=Pr("canvas")),Ii.width=e.width,Ii.height=e.height;let n=Ii.getContext("2d");e instanceof ImageData?n.putImageData(e,0,0):n.drawImage(e,0,0,e.width,e.height),t=Ii}return t.width>2048||t.height>2048?(console.warn("THREE.ImageUtils.getDataURL: Image converted to jpg for performance reasons",e),t.toDataURL("image/jpeg",.6)):t.toDataURL("image/png")}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){let t=Pr("canvas");t.width=e.width,t.height=e.height;let n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);let i=n.getImageData(0,0,e.width,e.height),r=i.data;for(let o=0;o<r.length;o++)r[o]=ji(r[o]/255)*255;return n.putImageData(i,0,0),t}else if(e.data){let t=e.data.slice(0);for(let n=0;n<t.length;n++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[n]=Math.floor(ji(t[n]/255)*255):t[n]=ji(t[n]);return{data:t,width:e.width,height:e.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}},Rd=0,Lr=class{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:Rd++}),this.uuid=ti(),this.data=e,this.version=0}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let r;if(Array.isArray(i)){r=[];for(let o=0,a=i.length;o<a;o++)i[o].isDataTexture?r.push(Da(i[o].image)):r.push(Da(i[o]))}else r=Da(i);n.url=r}return t||(e.images[this.uuid]=n),n}};function Da(s){return typeof HTMLImageElement<"u"&&s instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&s instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&s instanceof ImageBitmap?Ir.getDataURL(s):s.data?{data:Array.from(s.data),width:s.width,height:s.height,type:s.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}var Pd=0,Tt=class s extends ii{constructor(e=s.DEFAULT_IMAGE,t=s.DEFAULT_MAPPING,n=Gt,i=Gt,r=rn,o=Es,a=mn,l=ei,c=s.DEFAULT_ANISOTROPY,h=an){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Pd++}),this.uuid=ti(),this.name="",this.source=new Lr(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=r,this.minFilter=o,this.anisotropy=c,this.format=a,this.internalFormat=null,this.type=l,this.offset=new Ue(0,0),this.repeat=new Ue(1,1),this.center=new Ue(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new ze,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,typeof h=="string"?this.colorSpace=h:(Ms("THREE.Texture: Property .encoding has been replaced by .colorSpace."),this.colorSpace=h===xi?Ye:an),this.userData={},this.version=0,this.onUpdate=null,this.isRenderTargetTexture=!1,this.needsPMREMUpdate=!1}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.6,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==Kc)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case so:e.x=e.x-Math.floor(e.x);break;case Gt:e.x=e.x<0?0:1;break;case ns:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case so:e.y=e.y-Math.floor(e.y);break;case Gt:e.y=e.y<0?0:1;break;case ns:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}get encoding(){return Ms("THREE.Texture: Property .encoding has been replaced by .colorSpace."),this.colorSpace===Ye?xi:rh}set encoding(e){Ms("THREE.Texture: Property .encoding has been replaced by .colorSpace."),this.colorSpace=e===xi?Ye:an}};Tt.DEFAULT_IMAGE=null;Tt.DEFAULT_MAPPING=Kc;Tt.DEFAULT_ANISOTROPY=1;var Rt=class s{constructor(e=0,t=0,n=0,i=1){s.prototype.isVector4=!0,this.x=e,this.y=t,this.z=n,this.w=i}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,i){return this.x=e,this.y=t,this.z=n,this.w=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,i=this.z,r=this.w,o=e.elements;return this.x=o[0]*t+o[4]*n+o[8]*i+o[12]*r,this.y=o[1]*t+o[5]*n+o[9]*i+o[13]*r,this.z=o[2]*t+o[6]*n+o[10]*i+o[14]*r,this.w=o[3]*t+o[7]*n+o[11]*i+o[15]*r,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,i,r,l=e.elements,c=l[0],h=l[4],u=l[8],d=l[1],p=l[5],g=l[9],y=l[2],m=l[6],f=l[10];if(Math.abs(h-d)<.01&&Math.abs(u-y)<.01&&Math.abs(g-m)<.01){if(Math.abs(h+d)<.1&&Math.abs(u+y)<.1&&Math.abs(g+m)<.1&&Math.abs(c+p+f-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;let v=(c+1)/2,T=(p+1)/2,R=(f+1)/2,C=(h+d)/4,A=(u+y)/4,$=(g+m)/4;return v>T&&v>R?v<.01?(n=0,i=.707106781,r=.707106781):(n=Math.sqrt(v),i=C/n,r=A/n):T>R?T<.01?(n=.707106781,i=0,r=.707106781):(i=Math.sqrt(T),n=C/i,r=$/i):R<.01?(n=.707106781,i=.707106781,r=0):(r=Math.sqrt(R),n=A/r,i=$/r),this.set(n,i,r,t),this}let S=Math.sqrt((m-g)*(m-g)+(u-y)*(u-y)+(d-h)*(d-h));return Math.abs(S)<.001&&(S=1),this.x=(m-g)/S,this.y=(u-y)/S,this.z=(d-h)/S,this.w=Math.acos((c+p+f-1)/2),this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this.z=Math.max(e.z,Math.min(t.z,this.z)),this.w=Math.max(e.w,Math.min(t.w,this.w)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this.z=Math.max(e,Math.min(t,this.z)),this.w=Math.max(e,Math.min(t,this.w)),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},co=class extends ii{constructor(e=1,t=1,n={}){super(),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=1,this.scissor=new Rt(0,0,e,t),this.scissorTest=!1,this.viewport=new Rt(0,0,e,t);let i={width:e,height:t,depth:1};n.encoding!==void 0&&(Ms("THREE.WebGLRenderTarget: option.encoding has been replaced by option.colorSpace."),n.colorSpace=n.encoding===xi?Ye:an),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:rn,depthBuffer:!0,stencilBuffer:!1,depthTexture:null,samples:0},n),this.texture=new Tt(i,n.mapping,n.wrapS,n.wrapT,n.magFilter,n.minFilter,n.format,n.type,n.anisotropy,n.colorSpace),this.texture.isRenderTargetTexture=!0,this.texture.flipY=!1,this.texture.generateMipmaps=n.generateMipmaps,this.texture.internalFormat=n.internalFormat,this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.depthTexture=n.depthTexture,this.samples=n.samples}setSize(e,t,n=1){(this.width!==e||this.height!==t||this.depth!==n)&&(this.width=e,this.height=t,this.depth=n,this.texture.image.width=e,this.texture.image.height=t,this.texture.image.depth=n,this.dispose()),this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.texture=e.texture.clone(),this.texture.isRenderTargetTexture=!0;let t=Object.assign({},e.texture.image);return this.texture.source=new Lr(t),this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}},On=class extends co{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}},Dr=class extends Tt{constructor(e=null,t=1,n=1,i=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=Nt,this.minFilter=Nt,this.wrapR=Gt,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var ho=class extends Tt{constructor(e=null,t=1,n=1,i=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=Nt,this.minFilter=Nt,this.wrapR=Gt,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var $t=class{constructor(e=0,t=0,n=0,i=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=i}static slerpFlat(e,t,n,i,r,o,a){let l=n[i+0],c=n[i+1],h=n[i+2],u=n[i+3],d=r[o+0],p=r[o+1],g=r[o+2],y=r[o+3];if(a===0){e[t+0]=l,e[t+1]=c,e[t+2]=h,e[t+3]=u;return}if(a===1){e[t+0]=d,e[t+1]=p,e[t+2]=g,e[t+3]=y;return}if(u!==y||l!==d||c!==p||h!==g){let m=1-a,f=l*d+c*p+h*g+u*y,S=f>=0?1:-1,v=1-f*f;if(v>Number.EPSILON){let R=Math.sqrt(v),C=Math.atan2(R,f*S);m=Math.sin(m*C)/R,a=Math.sin(a*C)/R}let T=a*S;if(l=l*m+d*T,c=c*m+p*T,h=h*m+g*T,u=u*m+y*T,m===1-a){let R=1/Math.sqrt(l*l+c*c+h*h+u*u);l*=R,c*=R,h*=R,u*=R}}e[t]=l,e[t+1]=c,e[t+2]=h,e[t+3]=u}static multiplyQuaternionsFlat(e,t,n,i,r,o){let a=n[i],l=n[i+1],c=n[i+2],h=n[i+3],u=r[o],d=r[o+1],p=r[o+2],g=r[o+3];return e[t]=a*g+h*u+l*p-c*d,e[t+1]=l*g+h*d+c*u-a*p,e[t+2]=c*g+h*p+a*d-l*u,e[t+3]=h*g-a*u-l*d-c*p,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,i){return this._x=e,this._y=t,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let n=e._x,i=e._y,r=e._z,o=e._order,a=Math.cos,l=Math.sin,c=a(n/2),h=a(i/2),u=a(r/2),d=l(n/2),p=l(i/2),g=l(r/2);switch(o){case"XYZ":this._x=d*h*u+c*p*g,this._y=c*p*u-d*h*g,this._z=c*h*g+d*p*u,this._w=c*h*u-d*p*g;break;case"YXZ":this._x=d*h*u+c*p*g,this._y=c*p*u-d*h*g,this._z=c*h*g-d*p*u,this._w=c*h*u+d*p*g;break;case"ZXY":this._x=d*h*u-c*p*g,this._y=c*p*u+d*h*g,this._z=c*h*g+d*p*u,this._w=c*h*u-d*p*g;break;case"ZYX":this._x=d*h*u-c*p*g,this._y=c*p*u+d*h*g,this._z=c*h*g-d*p*u,this._w=c*h*u+d*p*g;break;case"YZX":this._x=d*h*u+c*p*g,this._y=c*p*u+d*h*g,this._z=c*h*g-d*p*u,this._w=c*h*u-d*p*g;break;case"XZY":this._x=d*h*u-c*p*g,this._y=c*p*u-d*h*g,this._z=c*h*g+d*p*u,this._w=c*h*u+d*p*g;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+o)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let n=t/2,i=Math.sin(n);return this._x=e.x*i,this._y=e.y*i,this._z=e.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],i=t[4],r=t[8],o=t[1],a=t[5],l=t[9],c=t[2],h=t[6],u=t[10],d=n+a+u;if(d>0){let p=.5/Math.sqrt(d+1);this._w=.25/p,this._x=(h-l)*p,this._y=(r-c)*p,this._z=(o-i)*p}else if(n>a&&n>u){let p=2*Math.sqrt(1+n-a-u);this._w=(h-l)/p,this._x=.25*p,this._y=(i+o)/p,this._z=(r+c)/p}else if(a>u){let p=2*Math.sqrt(1+a-n-u);this._w=(r-c)/p,this._x=(i+o)/p,this._y=.25*p,this._z=(l+h)/p}else{let p=2*Math.sqrt(1+u-n-a);this._w=(o-i)/p,this._x=(r+c)/p,this._y=(l+h)/p,this._z=.25*p}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<Number.EPSILON?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(Vt(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let i=Math.min(1,t/n);return this.slerp(e,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let n=e._x,i=e._y,r=e._z,o=e._w,a=t._x,l=t._y,c=t._z,h=t._w;return this._x=n*h+o*a+i*c-r*l,this._y=i*h+o*l+r*a-n*c,this._z=r*h+o*c+n*l-i*a,this._w=o*h-n*a-i*l-r*c,this._onChangeCallback(),this}slerp(e,t){if(t===0)return this;if(t===1)return this.copy(e);let n=this._x,i=this._y,r=this._z,o=this._w,a=o*e._w+n*e._x+i*e._y+r*e._z;if(a<0?(this._w=-e._w,this._x=-e._x,this._y=-e._y,this._z=-e._z,a=-a):this.copy(e),a>=1)return this._w=o,this._x=n,this._y=i,this._z=r,this;let l=1-a*a;if(l<=Number.EPSILON){let p=1-t;return this._w=p*o+t*this._w,this._x=p*n+t*this._x,this._y=p*i+t*this._y,this._z=p*r+t*this._z,this.normalize(),this}let c=Math.sqrt(l),h=Math.atan2(c,a),u=Math.sin((1-t)*h)/c,d=Math.sin(t*h)/c;return this._w=o*u+this._w*d,this._x=n*u+this._x*d,this._y=i*u+this._y*d,this._z=r*u+this._z*d,this._onChangeCallback(),this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=Math.random(),t=Math.sqrt(1-e),n=Math.sqrt(e),i=2*Math.PI*Math.random(),r=2*Math.PI*Math.random();return this.set(t*Math.cos(i),n*Math.sin(r),n*Math.cos(r),t*Math.sin(i))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},k=class s{constructor(e=0,t=0,n=0){s.prototype.isVector3=!0,this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(dc.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(dc.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,i=this.z,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6]*i,this.y=r[1]*t+r[4]*n+r[7]*i,this.z=r[2]*t+r[5]*n+r[8]*i,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,i=this.z,r=e.elements,o=1/(r[3]*t+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*t+r[4]*n+r[8]*i+r[12])*o,this.y=(r[1]*t+r[5]*n+r[9]*i+r[13])*o,this.z=(r[2]*t+r[6]*n+r[10]*i+r[14])*o,this}applyQuaternion(e){let t=this.x,n=this.y,i=this.z,r=e.x,o=e.y,a=e.z,l=e.w,c=2*(o*i-a*n),h=2*(a*t-r*i),u=2*(r*n-o*t);return this.x=t+l*c+o*u-a*h,this.y=n+l*h+a*c-r*u,this.z=i+l*u+r*h-o*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,i=this.z,r=e.elements;return this.x=r[0]*t+r[4]*n+r[8]*i,this.y=r[1]*t+r[5]*n+r[9]*i,this.z=r[2]*t+r[6]*n+r[10]*i,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this.z=Math.max(e.z,Math.min(t.z,this.z)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this.z=Math.max(e,Math.min(t,this.z)),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let n=e.x,i=e.y,r=e.z,o=t.x,a=t.y,l=t.z;return this.x=i*l-r*a,this.y=r*o-n*l,this.z=n*a-i*o,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return ka.copy(this).projectOnVector(e),this.sub(ka)}reflect(e){return this.sub(ka.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(Vt(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,i=this.z-e.z;return t*t+n*n+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let i=Math.sin(t)*e;return this.x=i*Math.sin(n),this.y=Math.cos(t)*e,this.z=i*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),i=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=i,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=(Math.random()-.5)*2,t=Math.random()*Math.PI*2,n=Math.sqrt(1-e**2);return this.x=n*Math.cos(t),this.y=n*Math.sin(t),this.z=e,this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},ka=new k,dc=new $t,bi=class{constructor(e=new k(1/0,1/0,1/0),t=new k(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(dn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(dn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=dn.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let n=e.geometry;if(n!==void 0){let r=n.getAttribute("position");if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let o=0,a=r.count;o<a;o++)e.isMesh===!0?e.getVertexPosition(o,dn):dn.fromBufferAttribute(r,o),dn.applyMatrix4(e.matrixWorld),this.expandByPoint(dn);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),js.copy(e.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),js.copy(n.boundingBox)),js.applyMatrix4(e.matrixWorld),this.union(js)}let i=e.children;for(let r=0,o=i.length;r<o;r++)this.expandByObject(i[r],t);return this}containsPoint(e){return!(e.x<this.min.x||e.x>this.max.x||e.y<this.min.y||e.y>this.max.y||e.z<this.min.z||e.z>this.max.z)}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return!(e.max.x<this.min.x||e.min.x>this.max.x||e.max.y<this.min.y||e.min.y>this.max.y||e.max.z<this.min.z||e.min.z>this.max.z)}intersectsSphere(e){return this.clampPoint(e.center,dn),dn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(gs),Qs.subVectors(this.max,gs),Li.subVectors(e.a,gs),Di.subVectors(e.b,gs),ki.subVectors(e.c,gs),Wn.subVectors(Di,Li),Xn.subVectors(ki,Di),ci.subVectors(Li,ki);let t=[0,-Wn.z,Wn.y,0,-Xn.z,Xn.y,0,-ci.z,ci.y,Wn.z,0,-Wn.x,Xn.z,0,-Xn.x,ci.z,0,-ci.x,-Wn.y,Wn.x,0,-Xn.y,Xn.x,0,-ci.y,ci.x,0];return!Ua(t,Li,Di,ki,Qs)||(t=[1,0,0,0,1,0,0,0,1],!Ua(t,Li,Di,ki,Qs))?!1:(er.crossVectors(Wn,Xn),t=[er.x,er.y,er.z],Ua(t,Li,Di,ki,Qs))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,dn).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(dn).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(An[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),An[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),An[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),An[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),An[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),An[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),An[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),An[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(An),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}},An=[new k,new k,new k,new k,new k,new k,new k,new k],dn=new k,js=new bi,Li=new k,Di=new k,ki=new k,Wn=new k,Xn=new k,ci=new k,gs=new k,Qs=new k,er=new k,hi=new k;function Ua(s,e,t,n,i){for(let r=0,o=s.length-3;r<=o;r+=3){hi.fromArray(s,r);let a=i.x*Math.abs(hi.x)+i.y*Math.abs(hi.y)+i.z*Math.abs(hi.z),l=e.dot(hi),c=t.dot(hi),h=n.dot(hi);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>a)return!1}return!0}var Id=new bi,ys=new k,Fa=new k,As=class{constructor(e=new k,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;t!==void 0?n.copy(t):Id.setFromPoints(e).getCenter(n);let i=0;for(let r=0,o=e.length;r<o;r++)i=Math.max(i,n.distanceToSquared(e[r]));return this.radius=Math.sqrt(i),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;ys.subVectors(e,this.center);let t=ys.lengthSq();if(t>this.radius*this.radius){let n=Math.sqrt(t),i=(n-this.radius)*.5;this.center.addScaledVector(ys,i/n),this.radius+=i}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(Fa.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(ys.copy(e.center).add(Fa)),this.expandByPoint(ys.copy(e.center).sub(Fa))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}},Cn=new k,Na=new k,tr=new k,$n=new k,Oa=new k,nr=new k,Ba=new k,kr=class{constructor(e=new k,t=new k(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,Cn)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=Cn.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(Cn.copy(this.origin).addScaledVector(this.direction,t),Cn.distanceToSquared(e))}distanceSqToSegment(e,t,n,i){Na.copy(e).add(t).multiplyScalar(.5),tr.copy(t).sub(e).normalize(),$n.copy(this.origin).sub(Na);let r=e.distanceTo(t)*.5,o=-this.direction.dot(tr),a=$n.dot(this.direction),l=-$n.dot(tr),c=$n.lengthSq(),h=Math.abs(1-o*o),u,d,p,g;if(h>0)if(u=o*l-a,d=o*a-l,g=r*h,u>=0)if(d>=-g)if(d<=g){let y=1/h;u*=y,d*=y,p=u*(u+o*d+2*a)+d*(o*u+d+2*l)+c}else d=r,u=Math.max(0,-(o*d+a)),p=-u*u+d*(d+2*l)+c;else d=-r,u=Math.max(0,-(o*d+a)),p=-u*u+d*(d+2*l)+c;else d<=-g?(u=Math.max(0,-(-o*r+a)),d=u>0?-r:Math.min(Math.max(-r,-l),r),p=-u*u+d*(d+2*l)+c):d<=g?(u=0,d=Math.min(Math.max(-r,-l),r),p=d*(d+2*l)+c):(u=Math.max(0,-(o*r+a)),d=u>0?r:Math.min(Math.max(-r,-l),r),p=-u*u+d*(d+2*l)+c);else d=o>0?-r:r,u=Math.max(0,-(o*d+a)),p=-u*u+d*(d+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,u),i&&i.copy(Na).addScaledVector(tr,d),p}intersectSphere(e,t){Cn.subVectors(e.center,this.origin);let n=Cn.dot(this.direction),i=Cn.dot(Cn)-n*n,r=e.radius*e.radius;if(i>r)return null;let o=Math.sqrt(r-i),a=n-o,l=n+o;return l<0?null:a<0?this.at(l,t):this.at(a,t)}intersectsSphere(e){return this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,i,r,o,a,l,c=1/this.direction.x,h=1/this.direction.y,u=1/this.direction.z,d=this.origin;return c>=0?(n=(e.min.x-d.x)*c,i=(e.max.x-d.x)*c):(n=(e.max.x-d.x)*c,i=(e.min.x-d.x)*c),h>=0?(r=(e.min.y-d.y)*h,o=(e.max.y-d.y)*h):(r=(e.max.y-d.y)*h,o=(e.min.y-d.y)*h),n>o||r>i||((r>n||isNaN(n))&&(n=r),(o<i||isNaN(i))&&(i=o),u>=0?(a=(e.min.z-d.z)*u,l=(e.max.z-d.z)*u):(a=(e.max.z-d.z)*u,l=(e.min.z-d.z)*u),n>l||a>i)||((a>n||n!==n)&&(n=a),(l<i||i!==i)&&(i=l),i<0)?null:this.at(n>=0?n:i,t)}intersectsBox(e){return this.intersectBox(e,Cn)!==null}intersectTriangle(e,t,n,i,r){Oa.subVectors(t,e),nr.subVectors(n,e),Ba.crossVectors(Oa,nr);let o=this.direction.dot(Ba),a;if(o>0){if(i)return null;a=1}else if(o<0)a=-1,o=-o;else return null;$n.subVectors(this.origin,e);let l=a*this.direction.dot(nr.crossVectors($n,nr));if(l<0)return null;let c=a*this.direction.dot(Oa.cross($n));if(c<0||l+c>o)return null;let h=-a*$n.dot(Ba);return h<0?null:this.at(h/o,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},Pt=class s{constructor(e,t,n,i,r,o,a,l,c,h,u,d,p,g,y,m){s.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,i,r,o,a,l,c,h,u,d,p,g,y,m)}set(e,t,n,i,r,o,a,l,c,h,u,d,p,g,y,m){let f=this.elements;return f[0]=e,f[4]=t,f[8]=n,f[12]=i,f[1]=r,f[5]=o,f[9]=a,f[13]=l,f[2]=c,f[6]=h,f[10]=u,f[14]=d,f[3]=p,f[7]=g,f[11]=y,f[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new s().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){let t=this.elements,n=e.elements,i=1/Ui.setFromMatrixColumn(e,0).length(),r=1/Ui.setFromMatrixColumn(e,1).length(),o=1/Ui.setFromMatrixColumn(e,2).length();return t[0]=n[0]*i,t[1]=n[1]*i,t[2]=n[2]*i,t[3]=0,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=0,t[8]=n[8]*o,t[9]=n[9]*o,t[10]=n[10]*o,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,n=e.x,i=e.y,r=e.z,o=Math.cos(n),a=Math.sin(n),l=Math.cos(i),c=Math.sin(i),h=Math.cos(r),u=Math.sin(r);if(e.order==="XYZ"){let d=o*h,p=o*u,g=a*h,y=a*u;t[0]=l*h,t[4]=-l*u,t[8]=c,t[1]=p+g*c,t[5]=d-y*c,t[9]=-a*l,t[2]=y-d*c,t[6]=g+p*c,t[10]=o*l}else if(e.order==="YXZ"){let d=l*h,p=l*u,g=c*h,y=c*u;t[0]=d+y*a,t[4]=g*a-p,t[8]=o*c,t[1]=o*u,t[5]=o*h,t[9]=-a,t[2]=p*a-g,t[6]=y+d*a,t[10]=o*l}else if(e.order==="ZXY"){let d=l*h,p=l*u,g=c*h,y=c*u;t[0]=d-y*a,t[4]=-o*u,t[8]=g+p*a,t[1]=p+g*a,t[5]=o*h,t[9]=y-d*a,t[2]=-o*c,t[6]=a,t[10]=o*l}else if(e.order==="ZYX"){let d=o*h,p=o*u,g=a*h,y=a*u;t[0]=l*h,t[4]=g*c-p,t[8]=d*c+y,t[1]=l*u,t[5]=y*c+d,t[9]=p*c-g,t[2]=-c,t[6]=a*l,t[10]=o*l}else if(e.order==="YZX"){let d=o*l,p=o*c,g=a*l,y=a*c;t[0]=l*h,t[4]=y-d*u,t[8]=g*u+p,t[1]=u,t[5]=o*h,t[9]=-a*h,t[2]=-c*h,t[6]=p*u+g,t[10]=d-y*u}else if(e.order==="XZY"){let d=o*l,p=o*c,g=a*l,y=a*c;t[0]=l*h,t[4]=-u,t[8]=c*h,t[1]=d*u+y,t[5]=o*h,t[9]=p*u-g,t[2]=g*u-p,t[6]=a*h,t[10]=y*u+d}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(Ld,e,Dd)}lookAt(e,t,n){let i=this.elements;return Kt.subVectors(e,t),Kt.lengthSq()===0&&(Kt.z=1),Kt.normalize(),qn.crossVectors(n,Kt),qn.lengthSq()===0&&(Math.abs(n.z)===1?Kt.x+=1e-4:Kt.z+=1e-4,Kt.normalize(),qn.crossVectors(n,Kt)),qn.normalize(),ir.crossVectors(Kt,qn),i[0]=qn.x,i[4]=ir.x,i[8]=Kt.x,i[1]=qn.y,i[5]=ir.y,i[9]=Kt.y,i[2]=qn.z,i[6]=ir.z,i[10]=Kt.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,i=t.elements,r=this.elements,o=n[0],a=n[4],l=n[8],c=n[12],h=n[1],u=n[5],d=n[9],p=n[13],g=n[2],y=n[6],m=n[10],f=n[14],S=n[3],v=n[7],T=n[11],R=n[15],C=i[0],A=i[4],$=i[8],x=i[12],b=i[1],L=i[5],N=i[9],K=i[13],P=i[2],H=i[6],q=i[10],J=i[14],W=i[3],U=i[7],Y=i[11],ne=i[15];return r[0]=o*C+a*b+l*P+c*W,r[4]=o*A+a*L+l*H+c*U,r[8]=o*$+a*N+l*q+c*Y,r[12]=o*x+a*K+l*J+c*ne,r[1]=h*C+u*b+d*P+p*W,r[5]=h*A+u*L+d*H+p*U,r[9]=h*$+u*N+d*q+p*Y,r[13]=h*x+u*K+d*J+p*ne,r[2]=g*C+y*b+m*P+f*W,r[6]=g*A+y*L+m*H+f*U,r[10]=g*$+y*N+m*q+f*Y,r[14]=g*x+y*K+m*J+f*ne,r[3]=S*C+v*b+T*P+R*W,r[7]=S*A+v*L+T*H+R*U,r[11]=S*$+v*N+T*q+R*Y,r[15]=S*x+v*K+T*J+R*ne,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],i=e[8],r=e[12],o=e[1],a=e[5],l=e[9],c=e[13],h=e[2],u=e[6],d=e[10],p=e[14],g=e[3],y=e[7],m=e[11],f=e[15];return g*(+r*l*u-i*c*u-r*a*d+n*c*d+i*a*p-n*l*p)+y*(+t*l*p-t*c*d+r*o*d-i*o*p+i*c*h-r*l*h)+m*(+t*c*u-t*a*p-r*o*u+n*o*p+r*a*h-n*c*h)+f*(-i*a*h-t*l*u+t*a*d+i*o*u-n*o*d+n*l*h)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let i=this.elements;return e.isVector3?(i[12]=e.x,i[13]=e.y,i[14]=e.z):(i[12]=e,i[13]=t,i[14]=n),this}invert(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],o=e[4],a=e[5],l=e[6],c=e[7],h=e[8],u=e[9],d=e[10],p=e[11],g=e[12],y=e[13],m=e[14],f=e[15],S=u*m*c-y*d*c+y*l*p-a*m*p-u*l*f+a*d*f,v=g*d*c-h*m*c-g*l*p+o*m*p+h*l*f-o*d*f,T=h*y*c-g*u*c+g*a*p-o*y*p-h*a*f+o*u*f,R=g*u*l-h*y*l-g*a*d+o*y*d+h*a*m-o*u*m,C=t*S+n*v+i*T+r*R;if(C===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let A=1/C;return e[0]=S*A,e[1]=(y*d*r-u*m*r-y*i*p+n*m*p+u*i*f-n*d*f)*A,e[2]=(a*m*r-y*l*r+y*i*c-n*m*c-a*i*f+n*l*f)*A,e[3]=(u*l*r-a*d*r-u*i*c+n*d*c+a*i*p-n*l*p)*A,e[4]=v*A,e[5]=(h*m*r-g*d*r+g*i*p-t*m*p-h*i*f+t*d*f)*A,e[6]=(g*l*r-o*m*r-g*i*c+t*m*c+o*i*f-t*l*f)*A,e[7]=(o*d*r-h*l*r+h*i*c-t*d*c-o*i*p+t*l*p)*A,e[8]=T*A,e[9]=(g*u*r-h*y*r-g*n*p+t*y*p+h*n*f-t*u*f)*A,e[10]=(o*y*r-g*a*r+g*n*c-t*y*c-o*n*f+t*a*f)*A,e[11]=(h*a*r-o*u*r-h*n*c+t*u*c+o*n*p-t*a*p)*A,e[12]=R*A,e[13]=(h*y*i-g*u*i+g*n*d-t*y*d-h*n*m+t*u*m)*A,e[14]=(g*a*i-o*y*i-g*n*l+t*y*l+o*n*m-t*a*m)*A,e[15]=(o*u*i-h*a*i+h*n*l-t*u*l-o*n*d+t*a*d)*A,this}scale(e){let t=this.elements,n=e.x,i=e.y,r=e.z;return t[0]*=n,t[4]*=i,t[8]*=r,t[1]*=n,t[5]*=i,t[9]*=r,t[2]*=n,t[6]*=i,t[10]*=r,t[3]*=n,t[7]*=i,t[11]*=r,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],i=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,i))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),i=Math.sin(t),r=1-n,o=e.x,a=e.y,l=e.z,c=r*o,h=r*a;return this.set(c*o+n,c*a-i*l,c*l+i*a,0,c*a+i*l,h*a+n,h*l-i*o,0,c*l-i*a,h*l+i*o,r*l*l+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,i,r,o){return this.set(1,n,r,0,e,1,o,0,t,i,1,0,0,0,0,1),this}compose(e,t,n){let i=this.elements,r=t._x,o=t._y,a=t._z,l=t._w,c=r+r,h=o+o,u=a+a,d=r*c,p=r*h,g=r*u,y=o*h,m=o*u,f=a*u,S=l*c,v=l*h,T=l*u,R=n.x,C=n.y,A=n.z;return i[0]=(1-(y+f))*R,i[1]=(p+T)*R,i[2]=(g-v)*R,i[3]=0,i[4]=(p-T)*C,i[5]=(1-(d+f))*C,i[6]=(m+S)*C,i[7]=0,i[8]=(g+v)*A,i[9]=(m-S)*A,i[10]=(1-(d+y))*A,i[11]=0,i[12]=e.x,i[13]=e.y,i[14]=e.z,i[15]=1,this}decompose(e,t,n){let i=this.elements,r=Ui.set(i[0],i[1],i[2]).length(),o=Ui.set(i[4],i[5],i[6]).length(),a=Ui.set(i[8],i[9],i[10]).length();this.determinant()<0&&(r=-r),e.x=i[12],e.y=i[13],e.z=i[14],fn.copy(this);let c=1/r,h=1/o,u=1/a;return fn.elements[0]*=c,fn.elements[1]*=c,fn.elements[2]*=c,fn.elements[4]*=h,fn.elements[5]*=h,fn.elements[6]*=h,fn.elements[8]*=u,fn.elements[9]*=u,fn.elements[10]*=u,t.setFromRotationMatrix(fn),n.x=r,n.y=o,n.z=a,this}makePerspective(e,t,n,i,r,o,a=Un){let l=this.elements,c=2*r/(t-e),h=2*r/(n-i),u=(t+e)/(t-e),d=(n+i)/(n-i),p,g;if(a===Un)p=-(o+r)/(o-r),g=-2*o*r/(o-r);else if(a===Rr)p=-o/(o-r),g=-o*r/(o-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return l[0]=c,l[4]=0,l[8]=u,l[12]=0,l[1]=0,l[5]=h,l[9]=d,l[13]=0,l[2]=0,l[6]=0,l[10]=p,l[14]=g,l[3]=0,l[7]=0,l[11]=-1,l[15]=0,this}makeOrthographic(e,t,n,i,r,o,a=Un){let l=this.elements,c=1/(t-e),h=1/(n-i),u=1/(o-r),d=(t+e)*c,p=(n+i)*h,g,y;if(a===Un)g=(o+r)*u,y=-2*u;else if(a===Rr)g=r*u,y=-1*u;else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return l[0]=2*c,l[4]=0,l[8]=0,l[12]=-d,l[1]=0,l[5]=2*h,l[9]=0,l[13]=-p,l[2]=0,l[6]=0,l[10]=y,l[14]=-g,l[3]=0,l[7]=0,l[11]=0,l[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let i=0;i<16;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}},Ui=new k,fn=new Pt,Ld=new k(0,0,0),Dd=new k(1,1,1),qn=new k,ir=new k,Kt=new k,fc=new Pt,pc=new $t,ss=class s{constructor(e=0,t=0,n=0,i=s.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,i=this._order){return this._x=e,this._y=t,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let i=e.elements,r=i[0],o=i[4],a=i[8],l=i[1],c=i[5],h=i[9],u=i[2],d=i[6],p=i[10];switch(t){case"XYZ":this._y=Math.asin(Vt(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-h,p),this._z=Math.atan2(-o,r)):(this._x=Math.atan2(d,c),this._z=0);break;case"YXZ":this._x=Math.asin(-Vt(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(a,p),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-u,r),this._z=0);break;case"ZXY":this._x=Math.asin(Vt(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-u,p),this._z=Math.atan2(-o,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-Vt(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(d,p),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-o,c));break;case"YZX":this._z=Math.asin(Vt(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-u,r)):(this._x=0,this._y=Math.atan2(a,p));break;case"XZY":this._z=Math.asin(-Vt(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(d,c),this._y=Math.atan2(a,r)):(this._x=Math.atan2(-h,p),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return fc.makeRotationFromQuaternion(e),this.setFromRotationMatrix(fc,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return pc.setFromEuler(this),this.setFromQuaternion(pc,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};ss.DEFAULT_ORDER="XYZ";var Cs=class{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}},kd=0,mc=new k,Fi=new $t,Rn=new Pt,sr=new k,vs=new k,Ud=new k,Fd=new $t,gc=new k(1,0,0),yc=new k(0,1,0),vc=new k(0,0,1),Nd={type:"added"},Od={type:"removed"},on=class s extends ii{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:kd++}),this.uuid=ti(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=s.DEFAULT_UP.clone();let e=new k,t=new ss,n=new $t,i=new k(1,1,1);function r(){n.setFromEuler(t,!1)}function o(){t.setFromQuaternion(n,void 0,!1)}t._onChange(r),n._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new Pt},normalMatrix:{value:new ze}}),this.matrix=new Pt,this.matrixWorld=new Pt,this.matrixAutoUpdate=s.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=s.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Cs,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return Fi.setFromAxisAngle(e,t),this.quaternion.multiply(Fi),this}rotateOnWorldAxis(e,t){return Fi.setFromAxisAngle(e,t),this.quaternion.premultiply(Fi),this}rotateX(e){return this.rotateOnAxis(gc,e)}rotateY(e){return this.rotateOnAxis(yc,e)}rotateZ(e){return this.rotateOnAxis(vc,e)}translateOnAxis(e,t){return mc.copy(e).applyQuaternion(this.quaternion),this.position.add(mc.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(gc,e)}translateY(e){return this.translateOnAxis(yc,e)}translateZ(e){return this.translateOnAxis(vc,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(Rn.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?sr.copy(e):sr.set(e,t,n);let i=this.parent;this.updateWorldMatrix(!0,!1),vs.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Rn.lookAt(vs,sr,this.up):Rn.lookAt(sr,vs,this.up),this.quaternion.setFromRotationMatrix(Rn),i&&(Rn.extractRotation(i.matrixWorld),Fi.setFromRotationMatrix(Rn),this.quaternion.premultiply(Fi.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.parent!==null&&e.parent.remove(e),e.parent=this,this.children.push(e),e.dispatchEvent(Nd)):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(Od)),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),Rn.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),Rn.multiply(e.parent.matrixWorld)),e.applyMatrix4(Rn),this.add(e),e.updateWorldMatrix(!1,!0),this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,i=this.children.length;n<i;n++){let o=this.children[n].getObjectByProperty(e,t);if(o!==void 0)return o}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);let i=this.children;for(let r=0,o=i.length;r<o;r++)i[r].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(vs,e,Ud),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(vs,Fd,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let n=0,i=t.length;n<i;n++){let r=t[n];(r.matrixWorldAutoUpdate===!0||e===!0)&&r.updateMatrixWorld(e)}}updateWorldMatrix(e,t){let n=this.parent;if(e===!0&&n!==null&&n.matrixWorldAutoUpdate===!0&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix),t===!0){let i=this.children;for(let r=0,o=i.length;r<o;r++){let a=i[r];a.matrixWorldAutoUpdate===!0&&a.updateWorldMatrix(!1,!0)}}}toJSON(e){let t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.6,type:"Object",generator:"Object3D.toJSON"});let i={};i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.castShadow===!0&&(i.castShadow=!0),this.receiveShadow===!0&&(i.receiveShadow=!0),this.visible===!1&&(i.visible=!1),this.frustumCulled===!1&&(i.frustumCulled=!1),this.renderOrder!==0&&(i.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(i.matrixAutoUpdate=!1),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.visibility=this._visibility,i.active=this._active,i.bounds=this._bounds.map(a=>({boxInitialized:a.boxInitialized,boxMin:a.box.min.toArray(),boxMax:a.box.max.toArray(),sphereInitialized:a.sphereInitialized,sphereRadius:a.sphere.radius,sphereCenter:a.sphere.center.toArray()})),i.maxGeometryCount=this._maxGeometryCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.geometryCount=this._geometryCount,i.matricesTexture=this._matricesTexture.toJSON(e),this.boundingSphere!==null&&(i.boundingSphere={center:i.boundingSphere.center.toArray(),radius:i.boundingSphere.radius}),this.boundingBox!==null&&(i.boundingBox={min:i.boundingBox.min.toArray(),max:i.boundingBox.max.toArray()}));function r(a,l){return a[l.uuid]===void 0&&(a[l.uuid]=l.toJSON(e)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?i.background=this.background.toJSON():this.background.isTexture&&(i.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(i.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){i.geometry=r(e.geometries,this.geometry);let a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){let l=a.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){let u=l[c];r(e.shapes,u)}else r(e.shapes,l)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(e.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let a=[];for(let l=0,c=this.material.length;l<c;l++)a.push(r(e.materials,this.material[l]));i.material=a}else i.material=r(e.materials,this.material);if(this.children.length>0){i.children=[];for(let a=0;a<this.children.length;a++)i.children.push(this.children[a].toJSON(e).object)}if(this.animations.length>0){i.animations=[];for(let a=0;a<this.animations.length;a++){let l=this.animations[a];i.animations.push(r(e.animations,l))}}if(t){let a=o(e.geometries),l=o(e.materials),c=o(e.textures),h=o(e.images),u=o(e.shapes),d=o(e.skeletons),p=o(e.animations),g=o(e.nodes);a.length>0&&(n.geometries=a),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),u.length>0&&(n.shapes=u),d.length>0&&(n.skeletons=d),p.length>0&&(n.animations=p),g.length>0&&(n.nodes=g)}return n.object=i,n;function o(a){let l=[];for(let c in a){let h=a[c];delete h.metadata,l.push(h)}return l}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){let i=e.children[n];this.add(i.clone())}return this}};on.DEFAULT_UP=new k(0,1,0);on.DEFAULT_MATRIX_AUTO_UPDATE=!0;on.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var pn=new k,Pn=new k,Ha=new k,In=new k,Ni=new k,Oi=new k,xc=new k,za=new k,Va=new k,Ga=new k,rr=!1,gi=class s{constructor(e=new k,t=new k,n=new k){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,i){i.subVectors(n,t),pn.subVectors(e,t),i.cross(pn);let r=i.lengthSq();return r>0?i.multiplyScalar(1/Math.sqrt(r)):i.set(0,0,0)}static getBarycoord(e,t,n,i,r){pn.subVectors(i,t),Pn.subVectors(n,t),Ha.subVectors(e,t);let o=pn.dot(pn),a=pn.dot(Pn),l=pn.dot(Ha),c=Pn.dot(Pn),h=Pn.dot(Ha),u=o*c-a*a;if(u===0)return r.set(0,0,0),null;let d=1/u,p=(c*l-a*h)*d,g=(o*h-a*l)*d;return r.set(1-p-g,g,p)}static containsPoint(e,t,n,i){return this.getBarycoord(e,t,n,i,In)===null?!1:In.x>=0&&In.y>=0&&In.x+In.y<=1}static getUV(e,t,n,i,r,o,a,l){return rr===!1&&(console.warn("THREE.Triangle.getUV() has been renamed to THREE.Triangle.getInterpolation()."),rr=!0),this.getInterpolation(e,t,n,i,r,o,a,l)}static getInterpolation(e,t,n,i,r,o,a,l){return this.getBarycoord(e,t,n,i,In)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,In.x),l.addScaledVector(o,In.y),l.addScaledVector(a,In.z),l)}static isFrontFacing(e,t,n,i){return pn.subVectors(n,t),Pn.subVectors(e,t),pn.cross(Pn).dot(i)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,i){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[i]),this}setFromAttributeAndIndices(e,t,n,i){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,i),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return pn.subVectors(this.c,this.b),Pn.subVectors(this.a,this.b),pn.cross(Pn).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return s.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return s.getBarycoord(e,this.a,this.b,this.c,t)}getUV(e,t,n,i,r){return rr===!1&&(console.warn("THREE.Triangle.getUV() has been renamed to THREE.Triangle.getInterpolation()."),rr=!0),s.getInterpolation(e,this.a,this.b,this.c,t,n,i,r)}getInterpolation(e,t,n,i,r){return s.getInterpolation(e,this.a,this.b,this.c,t,n,i,r)}containsPoint(e){return s.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return s.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,i=this.b,r=this.c,o,a;Ni.subVectors(i,n),Oi.subVectors(r,n),za.subVectors(e,n);let l=Ni.dot(za),c=Oi.dot(za);if(l<=0&&c<=0)return t.copy(n);Va.subVectors(e,i);let h=Ni.dot(Va),u=Oi.dot(Va);if(h>=0&&u<=h)return t.copy(i);let d=l*u-h*c;if(d<=0&&l>=0&&h<=0)return o=l/(l-h),t.copy(n).addScaledVector(Ni,o);Ga.subVectors(e,r);let p=Ni.dot(Ga),g=Oi.dot(Ga);if(g>=0&&p<=g)return t.copy(r);let y=p*c-l*g;if(y<=0&&c>=0&&g<=0)return a=c/(c-g),t.copy(n).addScaledVector(Oi,a);let m=h*g-p*u;if(m<=0&&u-h>=0&&p-g>=0)return xc.subVectors(r,i),a=(u-h)/(u-h+(p-g)),t.copy(i).addScaledVector(xc,a);let f=1/(m+y+d);return o=y*f,a=d*f,t.copy(n).addScaledVector(Ni,o).addScaledVector(Oi,a)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},lh={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Yn={h:0,s:0,l:0},ar={h:0,s:0,l:0};function Wa(s,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?s+(e-s)*6*t:t<1/2?e:t<2/3?s+(e-s)*6*(2/3-t):s}var Ge=class{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let i=e;i&&i.isColor?this.copy(i):typeof i=="number"?this.setHex(i):typeof i=="string"&&this.setStyle(i)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=Ye){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,je.toWorkingColorSpace(this,t),this}setRGB(e,t,n,i=je.workingColorSpace){return this.r=e,this.g=t,this.b=n,je.toWorkingColorSpace(this,i),this}setHSL(e,t,n,i=je.workingColorSpace){if(e=Td(e,1),t=Vt(t,0,1),n=Vt(n,0,1),t===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+t):n+t-n*t,o=2*n-r;this.r=Wa(o,r,e+1/3),this.g=Wa(o,r,e),this.b=Wa(o,r,e-1/3)}return je.toWorkingColorSpace(this,i),this}setStyle(e,t=Ye){function n(r){r!==void 0&&parseFloat(r)<1&&console.warn("THREE.Color: Alpha component of "+e+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(e)){let r,o=i[1],a=i[2];switch(o){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,t);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,t);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,t);break;default:console.warn("THREE.Color: Unknown color model "+e)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(e)){let r=i[1],o=r.length;if(o===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,t);if(o===6)return this.setHex(parseInt(r,16),t);console.warn("THREE.Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=Ye){let n=lh[e.toLowerCase()];return n!==void 0?this.setHex(n,t):console.warn("THREE.Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=ji(e.r),this.g=ji(e.g),this.b=ji(e.b),this}copyLinearToSRGB(e){return this.r=La(e.r),this.g=La(e.g),this.b=La(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=Ye){return je.fromWorkingColorSpace(Dt.copy(this),e),Math.round(Vt(Dt.r*255,0,255))*65536+Math.round(Vt(Dt.g*255,0,255))*256+Math.round(Vt(Dt.b*255,0,255))}getHexString(e=Ye){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=je.workingColorSpace){je.fromWorkingColorSpace(Dt.copy(this),t);let n=Dt.r,i=Dt.g,r=Dt.b,o=Math.max(n,i,r),a=Math.min(n,i,r),l,c,h=(a+o)/2;if(a===o)l=0,c=0;else{let u=o-a;switch(c=h<=.5?u/(o+a):u/(2-o-a),o){case n:l=(i-r)/u+(i<r?6:0);break;case i:l=(r-n)/u+2;break;case r:l=(n-i)/u+4;break}l/=6}return e.h=l,e.s=c,e.l=h,e}getRGB(e,t=je.workingColorSpace){return je.fromWorkingColorSpace(Dt.copy(this),t),e.r=Dt.r,e.g=Dt.g,e.b=Dt.b,e}getStyle(e=Ye){je.fromWorkingColorSpace(Dt.copy(this),e);let t=Dt.r,n=Dt.g,i=Dt.b;return e!==Ye?`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(i*255)})`}offsetHSL(e,t,n){return this.getHSL(Yn),this.setHSL(Yn.h+e,Yn.s+t,Yn.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(Yn),e.getHSL(ar);let n=Pa(Yn.h,ar.h,t),i=Pa(Yn.s,ar.s,t),r=Pa(Yn.l,ar.l,t);return this.setHSL(n,i,r),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,i=this.b,r=e.elements;return this.r=r[0]*t+r[3]*n+r[6]*i,this.g=r[1]*t+r[4]*n+r[7]*i,this.b=r[2]*t+r[5]*n+r[8]*i,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Dt=new Ge;Ge.NAMES=lh;var Bd=0,Si=class extends ii{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Bd++}),this.uuid=ti(),this.name="",this.type="Material",this.blending=jn,this.side=ni,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=eo,this.blendDst=to,this.blendEquation=pi,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Ge(0,0,0),this.blendAlpha=0,this.depthFunc=Mr,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=ac,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Pi,this.stencilZFail=Pi,this.stencilZPass=Pi,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBuild(){}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let n=e[t];if(n===void 0){console.warn(`THREE.Material: parameter '${t}' has value of undefined.`);continue}let i=this[t];if(i===void 0){console.warn(`THREE.Material: '${t}' is not a property of THREE.${this.type}.`);continue}i&&i.isColor?i.set(n):i&&i.isVector3&&n&&n.isVector3?i.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});let n={metadata:{version:4.6,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==jn&&(n.blending=this.blending),this.side!==ni&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==eo&&(n.blendSrc=this.blendSrc),this.blendDst!==to&&(n.blendDst=this.blendDst),this.blendEquation!==pi&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==Mr&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==ac&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==Pi&&(n.stencilFail=this.stencilFail),this.stencilZFail!==Pi&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==Pi&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function i(r){let o=[];for(let a in r){let l=r[a];delete l.metadata,o.push(l)}return o}if(t){let r=i(e.textures),o=i(e.images);r.length>0&&(n.textures=r),o.length>0&&(n.images=o)}return n}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,n=null;if(t!==null){let i=t.length;n=new Array(i);for(let r=0;r!==i;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}},qt=class extends Si{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Ge(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.combine=Jc,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}};var ft=new k,or=new Ue,Qt=class{constructor(e,t,n=!1){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=ro,this._updateRange={offset:0,count:-1},this.updateRanges=[],this.gpuType=Jn,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}get updateRange(){return console.warn("THREE.BufferAttribute: updateRange() is deprecated and will be removed in r169. Use addUpdateRange() instead."),this._updateRange}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let i=0,r=this.itemSize;i<r;i++)this.array[e+i]=t.array[n+i];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)or.fromBufferAttribute(this,t),or.applyMatrix3(e),this.setXY(t,or.x,or.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)ft.fromBufferAttribute(this,t),ft.applyMatrix3(e),this.setXYZ(t,ft.x,ft.y,ft.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)ft.fromBufferAttribute(this,t),ft.applyMatrix4(e),this.setXYZ(t,ft.x,ft.y,ft.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)ft.fromBufferAttribute(this,t),ft.applyNormalMatrix(e),this.setXYZ(t,ft.x,ft.y,ft.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)ft.fromBufferAttribute(this,t),ft.transformDirection(e),this.setXYZ(t,ft.x,ft.y,ft.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=kn(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=et(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=kn(t,this.array)),t}setX(e,t){return this.normalized&&(t=et(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=kn(t,this.array)),t}setY(e,t){return this.normalized&&(t=et(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=kn(t,this.array)),t}setZ(e,t){return this.normalized&&(t=et(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=kn(t,this.array)),t}setW(e,t){return this.normalized&&(t=et(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=et(t,this.array),n=et(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,i){return e*=this.itemSize,this.normalized&&(t=et(t,this.array),n=et(n,this.array),i=et(i,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this}setXYZW(e,t,n,i,r){return e*=this.itemSize,this.normalized&&(t=et(t,this.array),n=et(n,this.array),i=et(i,this.array),r=et(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==ro&&(e.usage=this.usage),e}};var Ur=class extends Qt{constructor(e,t,n){super(new Uint16Array(e),t,n)}};var Fr=class extends Qt{constructor(e,t,n){super(new Uint32Array(e),t,n)}};var Fn=class extends Qt{constructor(e,t,n){super(new Float32Array(e),t,n)}};var Hd=0,sn=new Pt,Xa=new on,Bi=new k,jt=new bi,xs=new bi,Et=new k,si=class s extends ii{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Hd++}),this.uuid=ti(),this.name="",this.type="BufferGeometry",this.index=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(oh(e)?Fr:Ur)(e,1):this.index=e,this}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new ze().getNormalMatrix(e);n.applyNormalMatrix(r),n.needsUpdate=!0}let i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(e),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return sn.makeRotationFromQuaternion(e),this.applyMatrix4(sn),this}rotateX(e){return sn.makeRotationX(e),this.applyMatrix4(sn),this}rotateY(e){return sn.makeRotationY(e),this.applyMatrix4(sn),this}rotateZ(e){return sn.makeRotationZ(e),this.applyMatrix4(sn),this}translate(e,t,n){return sn.makeTranslation(e,t,n),this.applyMatrix4(sn),this}scale(e,t,n){return sn.makeScale(e,t,n),this.applyMatrix4(sn),this}lookAt(e){return Xa.lookAt(e),Xa.updateMatrix(),this.applyMatrix4(Xa.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Bi).negate(),this.translate(Bi.x,Bi.y,Bi.z),this}setFromPoints(e){let t=[];for(let n=0,i=e.length;n<i;n++){let r=e[n];t.push(r.x,r.y,r.z||0)}return this.setAttribute("position",new Fn(t,3)),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new bi);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error('THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box. Alternatively set "mesh.frustumCulled" to "false".',this),this.boundingBox.set(new k(-1/0,-1/0,-1/0),new k(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,i=t.length;n<i;n++){let r=t[n];jt.setFromBufferAttribute(r),this.morphTargetsRelative?(Et.addVectors(this.boundingBox.min,jt.min),this.boundingBox.expandByPoint(Et),Et.addVectors(this.boundingBox.max,jt.max),this.boundingBox.expandByPoint(Et)):(this.boundingBox.expandByPoint(jt.min),this.boundingBox.expandByPoint(jt.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new As);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error('THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere. Alternatively set "mesh.frustumCulled" to "false".',this),this.boundingSphere.set(new k,1/0);return}if(e){let n=this.boundingSphere.center;if(jt.setFromBufferAttribute(e),t)for(let r=0,o=t.length;r<o;r++){let a=t[r];xs.setFromBufferAttribute(a),this.morphTargetsRelative?(Et.addVectors(jt.min,xs.min),jt.expandByPoint(Et),Et.addVectors(jt.max,xs.max),jt.expandByPoint(Et)):(jt.expandByPoint(xs.min),jt.expandByPoint(xs.max))}jt.getCenter(n);let i=0;for(let r=0,o=e.count;r<o;r++)Et.fromBufferAttribute(e,r),i=Math.max(i,n.distanceToSquared(Et));if(t)for(let r=0,o=t.length;r<o;r++){let a=t[r],l=this.morphTargetsRelative;for(let c=0,h=a.count;c<h;c++)Et.fromBufferAttribute(a,c),l&&(Bi.fromBufferAttribute(e,c),Et.add(Bi)),i=Math.max(i,n.distanceToSquared(Et))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=e.array,i=t.position.array,r=t.normal.array,o=t.uv.array,a=i.length/3;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new Qt(new Float32Array(4*a),4));let l=this.getAttribute("tangent").array,c=[],h=[];for(let b=0;b<a;b++)c[b]=new k,h[b]=new k;let u=new k,d=new k,p=new k,g=new Ue,y=new Ue,m=new Ue,f=new k,S=new k;function v(b,L,N){u.fromArray(i,b*3),d.fromArray(i,L*3),p.fromArray(i,N*3),g.fromArray(o,b*2),y.fromArray(o,L*2),m.fromArray(o,N*2),d.sub(u),p.sub(u),y.sub(g),m.sub(g);let K=1/(y.x*m.y-m.x*y.y);isFinite(K)&&(f.copy(d).multiplyScalar(m.y).addScaledVector(p,-y.y).multiplyScalar(K),S.copy(p).multiplyScalar(y.x).addScaledVector(d,-m.x).multiplyScalar(K),c[b].add(f),c[L].add(f),c[N].add(f),h[b].add(S),h[L].add(S),h[N].add(S))}let T=this.groups;T.length===0&&(T=[{start:0,count:n.length}]);for(let b=0,L=T.length;b<L;++b){let N=T[b],K=N.start,P=N.count;for(let H=K,q=K+P;H<q;H+=3)v(n[H+0],n[H+1],n[H+2])}let R=new k,C=new k,A=new k,$=new k;function x(b){A.fromArray(r,b*3),$.copy(A);let L=c[b];R.copy(L),R.sub(A.multiplyScalar(A.dot(L))).normalize(),C.crossVectors($,L);let K=C.dot(h[b])<0?-1:1;l[b*4]=R.x,l[b*4+1]=R.y,l[b*4+2]=R.z,l[b*4+3]=K}for(let b=0,L=T.length;b<L;++b){let N=T[b],K=N.start,P=N.count;for(let H=K,q=K+P;H<q;H+=3)x(n[H+0]),x(n[H+1]),x(n[H+2])}}computeVertexNormals(){let e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new Qt(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let d=0,p=n.count;d<p;d++)n.setXYZ(d,0,0,0);let i=new k,r=new k,o=new k,a=new k,l=new k,c=new k,h=new k,u=new k;if(e)for(let d=0,p=e.count;d<p;d+=3){let g=e.getX(d+0),y=e.getX(d+1),m=e.getX(d+2);i.fromBufferAttribute(t,g),r.fromBufferAttribute(t,y),o.fromBufferAttribute(t,m),h.subVectors(o,r),u.subVectors(i,r),h.cross(u),a.fromBufferAttribute(n,g),l.fromBufferAttribute(n,y),c.fromBufferAttribute(n,m),a.add(h),l.add(h),c.add(h),n.setXYZ(g,a.x,a.y,a.z),n.setXYZ(y,l.x,l.y,l.z),n.setXYZ(m,c.x,c.y,c.z)}else for(let d=0,p=t.count;d<p;d+=3)i.fromBufferAttribute(t,d+0),r.fromBufferAttribute(t,d+1),o.fromBufferAttribute(t,d+2),h.subVectors(o,r),u.subVectors(i,r),h.cross(u),n.setXYZ(d+0,h.x,h.y,h.z),n.setXYZ(d+1,h.x,h.y,h.z),n.setXYZ(d+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)Et.fromBufferAttribute(e,t),Et.normalize(),e.setXYZ(t,Et.x,Et.y,Et.z)}toNonIndexed(){function e(a,l){let c=a.array,h=a.itemSize,u=a.normalized,d=new c.constructor(l.length*h),p=0,g=0;for(let y=0,m=l.length;y<m;y++){a.isInterleavedBufferAttribute?p=l[y]*a.data.stride+a.offset:p=l[y]*h;for(let f=0;f<h;f++)d[g++]=c[p++]}return new Qt(d,h,u)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let t=new s,n=this.index.array,i=this.attributes;for(let a in i){let l=i[a],c=e(l,n);t.setAttribute(a,c)}let r=this.morphAttributes;for(let a in r){let l=[],c=r[a];for(let h=0,u=c.length;h<u;h++){let d=c[h],p=e(d,n);l.push(p)}t.morphAttributes[a]=l}t.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let a=0,l=o.length;a<l;a++){let c=o[a];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){let e={metadata:{version:4.6,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(e[c]=l[c]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let n=this.attributes;for(let l in n){let c=n[l];e.data.attributes[l]=c.toJSON(e.data)}let i={},r=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],h=[];for(let u=0,d=c.length;u<d;u++){let p=c[u];h.push(p.toJSON(e.data))}h.length>0&&(i[l]=h,r=!0)}r&&(e.data.morphAttributes=i,e.data.morphTargetsRelative=this.morphTargetsRelative);let o=this.groups;o.length>0&&(e.data.groups=JSON.parse(JSON.stringify(o)));let a=this.boundingSphere;return a!==null&&(e.data.boundingSphere={center:a.center.toArray(),radius:a.radius}),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;n!==null&&this.setIndex(n.clone(t));let i=e.attributes;for(let c in i){let h=i[c];this.setAttribute(c,h.clone(t))}let r=e.morphAttributes;for(let c in r){let h=[],u=r[c];for(let d=0,p=u.length;d<p;d++)h.push(u[d].clone(t));this.morphAttributes[c]=h}this.morphTargetsRelative=e.morphTargetsRelative;let o=e.groups;for(let c=0,h=o.length;c<h;c++){let u=o[c];this.addGroup(u.start,u.count,u.materialIndex)}let a=e.boundingBox;a!==null&&(this.boundingBox=a.clone());let l=e.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}},_c=new Pt,ui=new kr,lr=new As,bc=new k,Hi=new k,zi=new k,Vi=new k,$a=new k,cr=new k,hr=new Ue,ur=new Ue,dr=new Ue,Sc=new k,Mc=new k,wc=new k,fr=new k,pr=new k,ct=class extends on{constructor(e=new si,t=new qt){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){let a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}getVertexPosition(e,t){let n=this.geometry,i=n.attributes.position,r=n.morphAttributes.position,o=n.morphTargetsRelative;t.fromBufferAttribute(i,e);let a=this.morphTargetInfluences;if(r&&a){cr.set(0,0,0);for(let l=0,c=r.length;l<c;l++){let h=a[l],u=r[l];h!==0&&($a.fromBufferAttribute(u,e),o?cr.addScaledVector($a,h):cr.addScaledVector($a.sub(t),h))}t.add(cr)}return t}raycast(e,t){let n=this.geometry,i=this.material,r=this.matrixWorld;i!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),lr.copy(n.boundingSphere),lr.applyMatrix4(r),ui.copy(e.ray).recast(e.near),!(lr.containsPoint(ui.origin)===!1&&(ui.intersectSphere(lr,bc)===null||ui.origin.distanceToSquared(bc)>(e.far-e.near)**2))&&(_c.copy(r).invert(),ui.copy(e.ray).applyMatrix4(_c),!(n.boundingBox!==null&&ui.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(e,t,ui)))}_computeIntersections(e,t,n){let i,r=this.geometry,o=this.material,a=r.index,l=r.attributes.position,c=r.attributes.uv,h=r.attributes.uv1,u=r.attributes.normal,d=r.groups,p=r.drawRange;if(a!==null)if(Array.isArray(o))for(let g=0,y=d.length;g<y;g++){let m=d[g],f=o[m.materialIndex],S=Math.max(m.start,p.start),v=Math.min(a.count,Math.min(m.start+m.count,p.start+p.count));for(let T=S,R=v;T<R;T+=3){let C=a.getX(T),A=a.getX(T+1),$=a.getX(T+2);i=mr(this,f,e,n,c,h,u,C,A,$),i&&(i.faceIndex=Math.floor(T/3),i.face.materialIndex=m.materialIndex,t.push(i))}}else{let g=Math.max(0,p.start),y=Math.min(a.count,p.start+p.count);for(let m=g,f=y;m<f;m+=3){let S=a.getX(m),v=a.getX(m+1),T=a.getX(m+2);i=mr(this,o,e,n,c,h,u,S,v,T),i&&(i.faceIndex=Math.floor(m/3),t.push(i))}}else if(l!==void 0)if(Array.isArray(o))for(let g=0,y=d.length;g<y;g++){let m=d[g],f=o[m.materialIndex],S=Math.max(m.start,p.start),v=Math.min(l.count,Math.min(m.start+m.count,p.start+p.count));for(let T=S,R=v;T<R;T+=3){let C=T,A=T+1,$=T+2;i=mr(this,f,e,n,c,h,u,C,A,$),i&&(i.faceIndex=Math.floor(T/3),i.face.materialIndex=m.materialIndex,t.push(i))}}else{let g=Math.max(0,p.start),y=Math.min(l.count,p.start+p.count);for(let m=g,f=y;m<f;m+=3){let S=m,v=m+1,T=m+2;i=mr(this,o,e,n,c,h,u,S,v,T),i&&(i.faceIndex=Math.floor(m/3),t.push(i))}}}};function zd(s,e,t,n,i,r,o,a){let l;if(e.side===Xt?l=n.intersectTriangle(o,r,i,!0,a):l=n.intersectTriangle(i,r,o,e.side===ni,a),l===null)return null;pr.copy(a),pr.applyMatrix4(s.matrixWorld);let c=t.ray.origin.distanceTo(pr);return c<t.near||c>t.far?null:{distance:c,point:pr.clone(),object:s}}function mr(s,e,t,n,i,r,o,a,l,c){s.getVertexPosition(a,Hi),s.getVertexPosition(l,zi),s.getVertexPosition(c,Vi);let h=zd(s,e,t,n,Hi,zi,Vi,fr);if(h){i&&(hr.fromBufferAttribute(i,a),ur.fromBufferAttribute(i,l),dr.fromBufferAttribute(i,c),h.uv=gi.getInterpolation(fr,Hi,zi,Vi,hr,ur,dr,new Ue)),r&&(hr.fromBufferAttribute(r,a),ur.fromBufferAttribute(r,l),dr.fromBufferAttribute(r,c),h.uv1=gi.getInterpolation(fr,Hi,zi,Vi,hr,ur,dr,new Ue),h.uv2=h.uv1),o&&(Sc.fromBufferAttribute(o,a),Mc.fromBufferAttribute(o,l),wc.fromBufferAttribute(o,c),h.normal=gi.getInterpolation(fr,Hi,zi,Vi,Sc,Mc,wc,new k),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));let u={a,b:l,c,normal:new k,materialIndex:0};gi.getNormal(Hi,zi,Vi,u.normal),h.face=u}return h}var Rs=class s extends si{constructor(e=1,t=1,n=1,i=1,r=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:i,heightSegments:r,depthSegments:o};let a=this;i=Math.floor(i),r=Math.floor(r),o=Math.floor(o);let l=[],c=[],h=[],u=[],d=0,p=0;g("z","y","x",-1,-1,n,t,e,o,r,0),g("z","y","x",1,-1,n,t,-e,o,r,1),g("x","z","y",1,1,e,n,t,i,o,2),g("x","z","y",1,-1,e,n,-t,i,o,3),g("x","y","z",1,-1,e,t,n,i,r,4),g("x","y","z",-1,-1,e,t,-n,i,r,5),this.setIndex(l),this.setAttribute("position",new Fn(c,3)),this.setAttribute("normal",new Fn(h,3)),this.setAttribute("uv",new Fn(u,2));function g(y,m,f,S,v,T,R,C,A,$,x){let b=T/A,L=R/$,N=T/2,K=R/2,P=C/2,H=A+1,q=$+1,J=0,W=0,U=new k;for(let Y=0;Y<q;Y++){let ne=Y*L-K;for(let ae=0;ae<H;ae++){let X=ae*b-N;U[y]=X*S,U[m]=ne*v,U[f]=P,c.push(U.x,U.y,U.z),U[y]=0,U[m]=0,U[f]=C>0?1:-1,h.push(U.x,U.y,U.z),u.push(ae/A),u.push(1-Y/$),J+=1}}for(let Y=0;Y<$;Y++)for(let ne=0;ne<A;ne++){let ae=d+ne+H*Y,X=d+ne+H*(Y+1),j=d+(ne+1)+H*(Y+1),le=d+(ne+1)+H*Y;l.push(ae,X,le),l.push(X,j,le),W+=6}a.addGroup(p,W,x),p+=W,d+=J}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}};function rs(s){let e={};for(let t in s){e[t]={};for(let n in s[t]){let i=s[t][n];i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)?i.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][n]=null):e[t][n]=i.clone():Array.isArray(i)?e[t][n]=i.slice():e[t][n]=i}}return e}function Ft(s){let e={};for(let t=0;t<s.length;t++){let n=rs(s[t]);for(let i in n)e[i]=n[i]}return e}function Vd(s){let e=[];for(let t=0;t<s.length;t++)e.push(s[t].clone());return e}function ch(s){return s.getRenderTarget()===null?s.outputColorSpace:je.workingColorSpace}var Gd={clone:rs,merge:Ft},Wd=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Xd=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,Bn=class extends Si{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Wd,this.fragmentShader=Xd,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={derivatives:!1,fragDepth:!1,drawBuffers:!1,shaderTextureLOD:!1,clipCullDistance:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=rs(e.uniforms),this.uniformsGroups=Vd(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let i in this.uniforms){let o=this.uniforms[i].value;o&&o.isTexture?t.uniforms[i]={type:"t",value:o.toJSON(e).uuid}:o&&o.isColor?t.uniforms[i]={type:"c",value:o.getHex()}:o&&o.isVector2?t.uniforms[i]={type:"v2",value:o.toArray()}:o&&o.isVector3?t.uniforms[i]={type:"v3",value:o.toArray()}:o&&o.isVector4?t.uniforms[i]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?t.uniforms[i]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?t.uniforms[i]={type:"m4",value:o.toArray()}:t.uniforms[i]={value:o}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let n={};for(let i in this.extensions)this.extensions[i]===!0&&(n[i]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}},Nr=class extends on{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Pt,this.projectionMatrix=new Pt,this.projectionMatrixInverse=new Pt,this.coordinateSystem=Un}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}},vt=class extends Nr{constructor(e=50,t=1,n=.1,i=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=oo*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(Ra*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return oo*2*Math.atan(Math.tan(Ra*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}setViewOffset(e,t,n,i,r,o){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(Ra*.5*this.fov)/this.zoom,n=2*t,i=this.aspect*n,r=-.5*i,o=this.view;if(this.view!==null&&this.view.enabled){let l=o.fullWidth,c=o.fullHeight;r+=o.offsetX*i/l,t-=o.offsetY*n/c,i*=o.width/l,n*=o.height/c}let a=this.filmOffset;a!==0&&(r+=e*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+i,t,t-n,e,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}},Gi=-90,Wi=1,uo=class extends on{constructor(e,t,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let i=new vt(Gi,Wi,e,t);i.layers=this.layers,this.add(i);let r=new vt(Gi,Wi,e,t);r.layers=this.layers,this.add(r);let o=new vt(Gi,Wi,e,t);o.layers=this.layers,this.add(o);let a=new vt(Gi,Wi,e,t);a.layers=this.layers,this.add(a);let l=new vt(Gi,Wi,e,t);l.layers=this.layers,this.add(l);let c=new vt(Gi,Wi,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[n,i,r,o,a,l]=t;for(let c of t)this.remove(c);if(e===Un)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(e===Rr)n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(let c of t)this.add(c),c.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:i}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[r,o,a,l,c,h]=this.children,u=e.getRenderTarget(),d=e.getActiveCubeFace(),p=e.getActiveMipmapLevel(),g=e.xr.enabled;e.xr.enabled=!1;let y=n.texture.generateMipmaps;n.texture.generateMipmaps=!1,e.setRenderTarget(n,0,i),e.render(t,r),e.setRenderTarget(n,1,i),e.render(t,o),e.setRenderTarget(n,2,i),e.render(t,a),e.setRenderTarget(n,3,i),e.render(t,l),e.setRenderTarget(n,4,i),e.render(t,c),n.texture.generateMipmaps=y,e.setRenderTarget(n,5,i),e.render(t,h),e.setRenderTarget(u,d,p),e.xr.enabled=g,n.texture.needsPMREMUpdate=!0}},Or=class extends Tt{constructor(e,t,n,i,r,o,a,l,c,h){e=e!==void 0?e:[],t=t!==void 0?t:es,super(e,t,n,i,r,o,a,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}},fo=class extends On{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},i=[n,n,n,n,n,n];t.encoding!==void 0&&(Ms("THREE.WebGLCubeRenderTarget: option.encoding has been replaced by option.colorSpace."),t.colorSpace=t.encoding===xi?Ye:an),this.texture=new Or(i,t.mapping,t.wrapS,t.wrapT,t.magFilter,t.minFilter,t.format,t.type,t.anisotropy,t.colorSpace),this.texture.isRenderTargetTexture=!0,this.texture.generateMipmaps=t.generateMipmaps!==void 0?t.generateMipmaps:!1,this.texture.minFilter=t.minFilter!==void 0?t.minFilter:rn}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},i=new Rs(5,5,5),r=new Bn({name:"CubemapFromEquirect",uniforms:rs(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Xt,blending:Kn});r.uniforms.tEquirect.value=t;let o=new ct(i,r),a=t.minFilter;return t.minFilter===Es&&(t.minFilter=rn),new uo(1,10,this).update(e,o),t.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(e,t,n,i){let r=e.getRenderTarget();for(let o=0;o<6;o++)e.setRenderTarget(this,o),e.clear(t,n,i);e.setRenderTarget(r)}},qa=new k,$d=new k,qd=new ze,Dn=class{constructor(e=new k(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,i){return this.normal.set(e,t,n),this.constant=i,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let i=qa.subVectors(n,t).cross($d.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(i,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){let n=e.delta(qa),i=this.normal.dot(n);if(i===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let r=-(e.start.dot(this.normal)+this.constant)/i;return r<0||r>1?null:t.copy(e.start).addScaledVector(n,r)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||qd.getNormalMatrix(e),i=this.coplanarPoint(qa).applyMatrix4(e),r=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}},di=new As,gr=new k,Br=class{constructor(e=new Dn,t=new Dn,n=new Dn,i=new Dn,r=new Dn,o=new Dn){this.planes=[e,t,n,i,r,o]}set(e,t,n,i,r,o){let a=this.planes;return a[0].copy(e),a[1].copy(t),a[2].copy(n),a[3].copy(i),a[4].copy(r),a[5].copy(o),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=Un){let n=this.planes,i=e.elements,r=i[0],o=i[1],a=i[2],l=i[3],c=i[4],h=i[5],u=i[6],d=i[7],p=i[8],g=i[9],y=i[10],m=i[11],f=i[12],S=i[13],v=i[14],T=i[15];if(n[0].setComponents(l-r,d-c,m-p,T-f).normalize(),n[1].setComponents(l+r,d+c,m+p,T+f).normalize(),n[2].setComponents(l+o,d+h,m+g,T+S).normalize(),n[3].setComponents(l-o,d-h,m-g,T-S).normalize(),n[4].setComponents(l-a,d-u,m-y,T-v).normalize(),t===Un)n[5].setComponents(l+a,d+u,m+y,T+v).normalize();else if(t===Rr)n[5].setComponents(a,u,y,v).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),di.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),di.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(di)}intersectsSprite(e){return di.center.set(0,0,0),di.radius=.7071067811865476,di.applyMatrix4(e.matrixWorld),this.intersectsSphere(di)}intersectsSphere(e){let t=this.planes,n=e.center,i=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(n)<i)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let i=t[n];if(gr.x=i.normal.x>0?e.max.x:e.min.x,gr.y=i.normal.y>0?e.max.y:e.min.y,gr.z=i.normal.z>0?e.max.z:e.min.z,i.distanceToPoint(gr)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};function hh(){let s=null,e=!1,t=null,n=null;function i(r,o){t(r,o),n=s.requestAnimationFrame(i)}return{start:function(){e!==!0&&t!==null&&(n=s.requestAnimationFrame(i),e=!0)},stop:function(){s.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(r){t=r},setContext:function(r){s=r}}}function Yd(s,e){let t=e.isWebGL2,n=new WeakMap;function i(c,h){let u=c.array,d=c.usage,p=u.byteLength,g=s.createBuffer();s.bindBuffer(h,g),s.bufferData(h,u,d),c.onUploadCallback();let y;if(u instanceof Float32Array)y=s.FLOAT;else if(u instanceof Uint16Array)if(c.isFloat16BufferAttribute)if(t)y=s.HALF_FLOAT;else throw new Error("THREE.WebGLAttributes: Usage of Float16BufferAttribute requires WebGL2.");else y=s.UNSIGNED_SHORT;else if(u instanceof Int16Array)y=s.SHORT;else if(u instanceof Uint32Array)y=s.UNSIGNED_INT;else if(u instanceof Int32Array)y=s.INT;else if(u instanceof Int8Array)y=s.BYTE;else if(u instanceof Uint8Array)y=s.UNSIGNED_BYTE;else if(u instanceof Uint8ClampedArray)y=s.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+u);return{buffer:g,type:y,bytesPerElement:u.BYTES_PER_ELEMENT,version:c.version,size:p}}function r(c,h,u){let d=h.array,p=h._updateRange,g=h.updateRanges;if(s.bindBuffer(u,c),p.count===-1&&g.length===0&&s.bufferSubData(u,0,d),g.length!==0){for(let y=0,m=g.length;y<m;y++){let f=g[y];t?s.bufferSubData(u,f.start*d.BYTES_PER_ELEMENT,d,f.start,f.count):s.bufferSubData(u,f.start*d.BYTES_PER_ELEMENT,d.subarray(f.start,f.start+f.count))}h.clearUpdateRanges()}p.count!==-1&&(t?s.bufferSubData(u,p.offset*d.BYTES_PER_ELEMENT,d,p.offset,p.count):s.bufferSubData(u,p.offset*d.BYTES_PER_ELEMENT,d.subarray(p.offset,p.offset+p.count)),p.count=-1),h.onUploadCallback()}function o(c){return c.isInterleavedBufferAttribute&&(c=c.data),n.get(c)}function a(c){c.isInterleavedBufferAttribute&&(c=c.data);let h=n.get(c);h&&(s.deleteBuffer(h.buffer),n.delete(c))}function l(c,h){if(c.isGLBufferAttribute){let d=n.get(c);(!d||d.version<c.version)&&n.set(c,{buffer:c.buffer,type:c.type,bytesPerElement:c.elementSize,version:c.version});return}c.isInterleavedBufferAttribute&&(c=c.data);let u=n.get(c);if(u===void 0)n.set(c,i(c,h));else if(u.version<c.version){if(u.size!==c.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");r(u.buffer,c,h),u.version=c.version}}return{get:o,remove:a,update:l}}var Yt=class s extends si{constructor(e=1,t=1,n=1,i=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:i};let r=e/2,o=t/2,a=Math.floor(n),l=Math.floor(i),c=a+1,h=l+1,u=e/a,d=t/l,p=[],g=[],y=[],m=[];for(let f=0;f<h;f++){let S=f*d-o;for(let v=0;v<c;v++){let T=v*u-r;g.push(T,-S,0),y.push(0,0,1),m.push(v/a),m.push(1-f/l)}}for(let f=0;f<l;f++)for(let S=0;S<a;S++){let v=S+c*f,T=S+c*(f+1),R=S+1+c*(f+1),C=S+1+c*f;p.push(v,T,C),p.push(T,R,C)}this.setIndex(p),this.setAttribute("position",new Fn(g,3)),this.setAttribute("normal",new Fn(y,3)),this.setAttribute("uv",new Fn(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.width,e.height,e.widthSegments,e.heightSegments)}},Zd=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Jd=`#ifdef USE_ALPHAHASH
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
#endif`,Kd=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,jd=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Qd=`#ifdef USE_ALPHATEST
	if ( diffuseColor.a < alphaTest ) discard;
#endif`,ef=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,tf=`#ifdef USE_AOMAP
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
#endif`,nf=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,sf=`#ifdef USE_BATCHING
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
#endif`,rf=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( batchId );
#endif`,af=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,of=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,lf=`float G_BlinnPhong_Implicit( ) {
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
} // validated`,cf=`#ifdef USE_IRIDESCENCE
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
#endif`,hf=`#ifdef USE_BUMPMAP
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
#endif`,uf=`#if NUM_CLIPPING_PLANES > 0
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
#endif`,df=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,ff=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,pf=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,mf=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,gf=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,yf=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
	varying vec3 vColor;
#endif`,vf=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif`,xf=`#define PI 3.141592653589793
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
} // validated`,_f=`#ifdef ENVMAP_TYPE_CUBE_UV
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
#endif`,bf=`vec3 transformedNormal = objectNormal;
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
#endif`,Sf=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Mf=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,wf=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Ef=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Tf="gl_FragColor = linearToOutputTexel( gl_FragColor );",Af=`
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
}`,Cf=`#ifdef USE_ENVMAP
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
#endif`,Rf=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,Pf=`#ifdef USE_ENVMAP
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
#endif`,If=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Lf=`#ifdef USE_ENVMAP
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
#endif`,Df=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,kf=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Uf=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Ff=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Nf=`#ifdef USE_GRADIENTMAP
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
}`,Of=`#ifdef USE_LIGHTMAP
	vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
	vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
	reflectedLight.indirectDiffuse += lightMapIrradiance;
#endif`,Bf=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Hf=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,zf=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Vf=`uniform bool receiveShadow;
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
#endif`,Gf=`#ifdef USE_ENVMAP
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
#endif`,Wf=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Xf=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,$f=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,qf=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Yf=`PhysicalMaterial material;
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
#endif`,Zf=`struct PhysicalMaterial {
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
}`,Jf=`
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
#endif`,Kf=`#if defined( RE_IndirectDiffuse )
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
#endif`,jf=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Qf=`#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )
	gl_FragDepthEXT = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,ep=`#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,tp=`#ifdef USE_LOGDEPTHBUF
	#ifdef USE_LOGDEPTHBUF_EXT
		varying float vFragDepth;
		varying float vIsPerspective;
	#else
		uniform float logDepthBufFC;
	#endif
#endif`,np=`#ifdef USE_LOGDEPTHBUF
	#ifdef USE_LOGDEPTHBUF_EXT
		vFragDepth = 1.0 + gl_Position.w;
		vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
	#else
		if ( isPerspectiveMatrix( projectionMatrix ) ) {
			gl_Position.z = log2( max( EPSILON, gl_Position.w + 1.0 ) ) * logDepthBufFC - 1.0;
			gl_Position.z *= gl_Position.w;
		}
	#endif
#endif`,ip=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
	
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,sp=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,rp=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
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
#endif`,ap=`#if defined( USE_POINTS_UV )
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
#endif`,op=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,lp=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,cp=`#if defined( USE_MORPHCOLORS ) && defined( MORPHTARGETS_TEXTURE )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,hp=`#ifdef USE_MORPHNORMALS
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
#endif`,up=`#ifdef USE_MORPHTARGETS
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
#endif`,dp=`#ifdef USE_MORPHTARGETS
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
#endif`,fp=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
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
vec3 nonPerturbedNormal = normal;`,pp=`#ifdef USE_NORMALMAP_OBJECTSPACE
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
#endif`,mp=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,gp=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,yp=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,vp=`#ifdef USE_NORMALMAP
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
#endif`,xp=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,_p=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,bp=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,Sp=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,Mp=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,wp=`vec3 packNormalToRGB( const in vec3 normal ) {
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
}`,Ep=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Tp=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,Ap=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Cp=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Rp=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Pp=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,Ip=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,Lp=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,Dp=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
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
#endif`,kp=`float getShadowMask() {
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
}`,Up=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,Fp=`#ifdef USE_SKINNING
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
#endif`,Np=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,Op=`#ifdef USE_SKINNING
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
#endif`,Bp=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,Hp=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,zp=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Vp=`#ifndef saturate
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
vec3 CustomToneMapping( vec3 color ) { return color; }`,Gp=`#ifdef USE_TRANSMISSION
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
#endif`,Wp=`#ifdef USE_TRANSMISSION
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
#endif`,Xp=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,$p=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,qp=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Yp=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,Zp=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,Jp=`uniform sampler2D t2D;
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
}`,Kp=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,jp=`#ifdef ENVMAP_TYPE_CUBE
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
}`,Qp=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,em=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,tm=`#include <common>
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
}`,nm=`#if DEPTH_PACKING == 3200
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
}`,im=`#define DISTANCE
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
}`,sm=`#define DISTANCE
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
}`,rm=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,am=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,om=`uniform float scale;
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
}`,lm=`uniform vec3 diffuse;
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
}`,cm=`#include <common>
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
}`,hm=`uniform vec3 diffuse;
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
}`,um=`#define LAMBERT
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
}`,dm=`#define LAMBERT
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
}`,fm=`#define MATCAP
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
}`,pm=`#define MATCAP
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
}`,mm=`#define NORMAL
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
}`,gm=`#define NORMAL
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
}`,ym=`#define PHONG
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
}`,vm=`#define PHONG
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
}`,xm=`#define STANDARD
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
}`,_m=`#define STANDARD
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
}`,bm=`#define TOON
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
}`,Sm=`#define TOON
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
}`,Mm=`uniform float size;
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
}`,wm=`uniform vec3 diffuse;
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
}`,Em=`#include <common>
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
}`,Tm=`uniform vec3 color;
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
}`,Am=`uniform float rotation;
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
}`,Cm=`uniform vec3 diffuse;
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
}`,Ne={alphahash_fragment:Zd,alphahash_pars_fragment:Jd,alphamap_fragment:Kd,alphamap_pars_fragment:jd,alphatest_fragment:Qd,alphatest_pars_fragment:ef,aomap_fragment:tf,aomap_pars_fragment:nf,batching_pars_vertex:sf,batching_vertex:rf,begin_vertex:af,beginnormal_vertex:of,bsdfs:lf,iridescence_fragment:cf,bumpmap_pars_fragment:hf,clipping_planes_fragment:uf,clipping_planes_pars_fragment:df,clipping_planes_pars_vertex:ff,clipping_planes_vertex:pf,color_fragment:mf,color_pars_fragment:gf,color_pars_vertex:yf,color_vertex:vf,common:xf,cube_uv_reflection_fragment:_f,defaultnormal_vertex:bf,displacementmap_pars_vertex:Sf,displacementmap_vertex:Mf,emissivemap_fragment:wf,emissivemap_pars_fragment:Ef,colorspace_fragment:Tf,colorspace_pars_fragment:Af,envmap_fragment:Cf,envmap_common_pars_fragment:Rf,envmap_pars_fragment:Pf,envmap_pars_vertex:If,envmap_physical_pars_fragment:Gf,envmap_vertex:Lf,fog_vertex:Df,fog_pars_vertex:kf,fog_fragment:Uf,fog_pars_fragment:Ff,gradientmap_pars_fragment:Nf,lightmap_fragment:Of,lightmap_pars_fragment:Bf,lights_lambert_fragment:Hf,lights_lambert_pars_fragment:zf,lights_pars_begin:Vf,lights_toon_fragment:Wf,lights_toon_pars_fragment:Xf,lights_phong_fragment:$f,lights_phong_pars_fragment:qf,lights_physical_fragment:Yf,lights_physical_pars_fragment:Zf,lights_fragment_begin:Jf,lights_fragment_maps:Kf,lights_fragment_end:jf,logdepthbuf_fragment:Qf,logdepthbuf_pars_fragment:ep,logdepthbuf_pars_vertex:tp,logdepthbuf_vertex:np,map_fragment:ip,map_pars_fragment:sp,map_particle_fragment:rp,map_particle_pars_fragment:ap,metalnessmap_fragment:op,metalnessmap_pars_fragment:lp,morphcolor_vertex:cp,morphnormal_vertex:hp,morphtarget_pars_vertex:up,morphtarget_vertex:dp,normal_fragment_begin:fp,normal_fragment_maps:pp,normal_pars_fragment:mp,normal_pars_vertex:gp,normal_vertex:yp,normalmap_pars_fragment:vp,clearcoat_normal_fragment_begin:xp,clearcoat_normal_fragment_maps:_p,clearcoat_pars_fragment:bp,iridescence_pars_fragment:Sp,opaque_fragment:Mp,packing:wp,premultiplied_alpha_fragment:Ep,project_vertex:Tp,dithering_fragment:Ap,dithering_pars_fragment:Cp,roughnessmap_fragment:Rp,roughnessmap_pars_fragment:Pp,shadowmap_pars_fragment:Ip,shadowmap_pars_vertex:Lp,shadowmap_vertex:Dp,shadowmask_pars_fragment:kp,skinbase_vertex:Up,skinning_pars_vertex:Fp,skinning_vertex:Np,skinnormal_vertex:Op,specularmap_fragment:Bp,specularmap_pars_fragment:Hp,tonemapping_fragment:zp,tonemapping_pars_fragment:Vp,transmission_fragment:Gp,transmission_pars_fragment:Wp,uv_pars_fragment:Xp,uv_pars_vertex:$p,uv_vertex:qp,worldpos_vertex:Yp,background_vert:Zp,background_frag:Jp,backgroundCube_vert:Kp,backgroundCube_frag:jp,cube_vert:Qp,cube_frag:em,depth_vert:tm,depth_frag:nm,distanceRGBA_vert:im,distanceRGBA_frag:sm,equirect_vert:rm,equirect_frag:am,linedashed_vert:om,linedashed_frag:lm,meshbasic_vert:cm,meshbasic_frag:hm,meshlambert_vert:um,meshlambert_frag:dm,meshmatcap_vert:fm,meshmatcap_frag:pm,meshnormal_vert:mm,meshnormal_frag:gm,meshphong_vert:ym,meshphong_frag:vm,meshphysical_vert:xm,meshphysical_frag:_m,meshtoon_vert:bm,meshtoon_frag:Sm,points_vert:Mm,points_frag:wm,shadow_vert:Em,shadow_frag:Tm,sprite_vert:Am,sprite_frag:Cm},re={common:{diffuse:{value:new Ge(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new ze},alphaMap:{value:null},alphaMapTransform:{value:new ze},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new ze}},envmap:{envMap:{value:null},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new ze}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new ze}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new ze},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new ze},normalScale:{value:new Ue(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new ze},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new ze}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new ze}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new ze}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Ge(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new Ge(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new ze},alphaTest:{value:0},uvTransform:{value:new ze}},sprite:{diffuse:{value:new Ge(16777215)},opacity:{value:1},center:{value:new Ue(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new ze},alphaMap:{value:null},alphaMapTransform:{value:new ze},alphaTest:{value:0}}},_n={basic:{uniforms:Ft([re.common,re.specularmap,re.envmap,re.aomap,re.lightmap,re.fog]),vertexShader:Ne.meshbasic_vert,fragmentShader:Ne.meshbasic_frag},lambert:{uniforms:Ft([re.common,re.specularmap,re.envmap,re.aomap,re.lightmap,re.emissivemap,re.bumpmap,re.normalmap,re.displacementmap,re.fog,re.lights,{emissive:{value:new Ge(0)}}]),vertexShader:Ne.meshlambert_vert,fragmentShader:Ne.meshlambert_frag},phong:{uniforms:Ft([re.common,re.specularmap,re.envmap,re.aomap,re.lightmap,re.emissivemap,re.bumpmap,re.normalmap,re.displacementmap,re.fog,re.lights,{emissive:{value:new Ge(0)},specular:{value:new Ge(1118481)},shininess:{value:30}}]),vertexShader:Ne.meshphong_vert,fragmentShader:Ne.meshphong_frag},standard:{uniforms:Ft([re.common,re.envmap,re.aomap,re.lightmap,re.emissivemap,re.bumpmap,re.normalmap,re.displacementmap,re.roughnessmap,re.metalnessmap,re.fog,re.lights,{emissive:{value:new Ge(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ne.meshphysical_vert,fragmentShader:Ne.meshphysical_frag},toon:{uniforms:Ft([re.common,re.aomap,re.lightmap,re.emissivemap,re.bumpmap,re.normalmap,re.displacementmap,re.gradientmap,re.fog,re.lights,{emissive:{value:new Ge(0)}}]),vertexShader:Ne.meshtoon_vert,fragmentShader:Ne.meshtoon_frag},matcap:{uniforms:Ft([re.common,re.bumpmap,re.normalmap,re.displacementmap,re.fog,{matcap:{value:null}}]),vertexShader:Ne.meshmatcap_vert,fragmentShader:Ne.meshmatcap_frag},points:{uniforms:Ft([re.points,re.fog]),vertexShader:Ne.points_vert,fragmentShader:Ne.points_frag},dashed:{uniforms:Ft([re.common,re.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ne.linedashed_vert,fragmentShader:Ne.linedashed_frag},depth:{uniforms:Ft([re.common,re.displacementmap]),vertexShader:Ne.depth_vert,fragmentShader:Ne.depth_frag},normal:{uniforms:Ft([re.common,re.bumpmap,re.normalmap,re.displacementmap,{opacity:{value:1}}]),vertexShader:Ne.meshnormal_vert,fragmentShader:Ne.meshnormal_frag},sprite:{uniforms:Ft([re.sprite,re.fog]),vertexShader:Ne.sprite_vert,fragmentShader:Ne.sprite_frag},background:{uniforms:{uvTransform:{value:new ze},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ne.background_vert,fragmentShader:Ne.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1}},vertexShader:Ne.backgroundCube_vert,fragmentShader:Ne.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ne.cube_vert,fragmentShader:Ne.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ne.equirect_vert,fragmentShader:Ne.equirect_frag},distanceRGBA:{uniforms:Ft([re.common,re.displacementmap,{referencePosition:{value:new k},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Ne.distanceRGBA_vert,fragmentShader:Ne.distanceRGBA_frag},shadow:{uniforms:Ft([re.lights,re.fog,{color:{value:new Ge(0)},opacity:{value:1}}]),vertexShader:Ne.shadow_vert,fragmentShader:Ne.shadow_frag}};_n.physical={uniforms:Ft([_n.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new ze},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new ze},clearcoatNormalScale:{value:new Ue(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new ze},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new ze},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new ze},sheen:{value:0},sheenColor:{value:new Ge(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new ze},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new ze},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new ze},transmissionSamplerSize:{value:new Ue},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new ze},attenuationDistance:{value:0},attenuationColor:{value:new Ge(0)},specularColor:{value:new Ge(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new ze},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new ze},anisotropyVector:{value:new Ue},anisotropyMap:{value:null},anisotropyMapTransform:{value:new ze}}]),vertexShader:Ne.meshphysical_vert,fragmentShader:Ne.meshphysical_frag};var yr={r:0,b:0,g:0};function Rm(s,e,t,n,i,r,o){let a=new Ge(0),l=r===!0?0:1,c,h,u=null,d=0,p=null;function g(m,f){let S=!1,v=f.isScene===!0?f.background:null;v&&v.isTexture&&(v=(f.backgroundBlurriness>0?t:e).get(v)),v===null?y(a,l):v&&v.isColor&&(y(v,1),S=!0);let T=s.xr.getEnvironmentBlendMode();T==="additive"?n.buffers.color.setClear(0,0,0,1,o):T==="alpha-blend"&&n.buffers.color.setClear(0,0,0,0,o),(s.autoClear||S)&&s.clear(s.autoClearColor,s.autoClearDepth,s.autoClearStencil),v&&(v.isCubeTexture||v.mapping===Xr)?(h===void 0&&(h=new ct(new Rs(1,1,1),new Bn({name:"BackgroundCubeMaterial",uniforms:rs(_n.backgroundCube.uniforms),vertexShader:_n.backgroundCube.vertexShader,fragmentShader:_n.backgroundCube.fragmentShader,side:Xt,depthTest:!1,depthWrite:!1,fog:!1})),h.geometry.deleteAttribute("normal"),h.geometry.deleteAttribute("uv"),h.onBeforeRender=function(R,C,A){this.matrixWorld.copyPosition(A.matrixWorld)},Object.defineProperty(h.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(h)),h.material.uniforms.envMap.value=v,h.material.uniforms.flipEnvMap.value=v.isCubeTexture&&v.isRenderTargetTexture===!1?-1:1,h.material.uniforms.backgroundBlurriness.value=f.backgroundBlurriness,h.material.uniforms.backgroundIntensity.value=f.backgroundIntensity,h.material.toneMapped=je.getTransfer(v.colorSpace)!==nt,(u!==v||d!==v.version||p!==s.toneMapping)&&(h.material.needsUpdate=!0,u=v,d=v.version,p=s.toneMapping),h.layers.enableAll(),m.unshift(h,h.geometry,h.material,0,0,null)):v&&v.isTexture&&(c===void 0&&(c=new ct(new Yt(2,2),new Bn({name:"BackgroundMaterial",uniforms:rs(_n.background.uniforms),vertexShader:_n.background.vertexShader,fragmentShader:_n.background.fragmentShader,side:ni,depthTest:!1,depthWrite:!1,fog:!1})),c.geometry.deleteAttribute("normal"),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(c)),c.material.uniforms.t2D.value=v,c.material.uniforms.backgroundIntensity.value=f.backgroundIntensity,c.material.toneMapped=je.getTransfer(v.colorSpace)!==nt,v.matrixAutoUpdate===!0&&v.updateMatrix(),c.material.uniforms.uvTransform.value.copy(v.matrix),(u!==v||d!==v.version||p!==s.toneMapping)&&(c.material.needsUpdate=!0,u=v,d=v.version,p=s.toneMapping),c.layers.enableAll(),m.unshift(c,c.geometry,c.material,0,0,null))}function y(m,f){m.getRGB(yr,ch(s)),n.buffers.color.setClear(yr.r,yr.g,yr.b,f,o)}return{getClearColor:function(){return a},setClearColor:function(m,f=1){a.set(m),l=f,y(a,l)},getClearAlpha:function(){return l},setClearAlpha:function(m){l=m,y(a,l)},render:g}}function Pm(s,e,t,n){let i=s.getParameter(s.MAX_VERTEX_ATTRIBS),r=n.isWebGL2?null:e.get("OES_vertex_array_object"),o=n.isWebGL2||r!==null,a={},l=m(null),c=l,h=!1;function u(P,H,q,J,W){let U=!1;if(o){let Y=y(J,q,H);c!==Y&&(c=Y,p(c.object)),U=f(P,J,q,W),U&&S(P,J,q,W)}else{let Y=H.wireframe===!0;(c.geometry!==J.id||c.program!==q.id||c.wireframe!==Y)&&(c.geometry=J.id,c.program=q.id,c.wireframe=Y,U=!0)}W!==null&&t.update(W,s.ELEMENT_ARRAY_BUFFER),(U||h)&&(h=!1,$(P,H,q,J),W!==null&&s.bindBuffer(s.ELEMENT_ARRAY_BUFFER,t.get(W).buffer))}function d(){return n.isWebGL2?s.createVertexArray():r.createVertexArrayOES()}function p(P){return n.isWebGL2?s.bindVertexArray(P):r.bindVertexArrayOES(P)}function g(P){return n.isWebGL2?s.deleteVertexArray(P):r.deleteVertexArrayOES(P)}function y(P,H,q){let J=q.wireframe===!0,W=a[P.id];W===void 0&&(W={},a[P.id]=W);let U=W[H.id];U===void 0&&(U={},W[H.id]=U);let Y=U[J];return Y===void 0&&(Y=m(d()),U[J]=Y),Y}function m(P){let H=[],q=[],J=[];for(let W=0;W<i;W++)H[W]=0,q[W]=0,J[W]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:H,enabledAttributes:q,attributeDivisors:J,object:P,attributes:{},index:null}}function f(P,H,q,J){let W=c.attributes,U=H.attributes,Y=0,ne=q.getAttributes();for(let ae in ne)if(ne[ae].location>=0){let j=W[ae],le=U[ae];if(le===void 0&&(ae==="instanceMatrix"&&P.instanceMatrix&&(le=P.instanceMatrix),ae==="instanceColor"&&P.instanceColor&&(le=P.instanceColor)),j===void 0||j.attribute!==le||le&&j.data!==le.data)return!0;Y++}return c.attributesNum!==Y||c.index!==J}function S(P,H,q,J){let W={},U=H.attributes,Y=0,ne=q.getAttributes();for(let ae in ne)if(ne[ae].location>=0){let j=U[ae];j===void 0&&(ae==="instanceMatrix"&&P.instanceMatrix&&(j=P.instanceMatrix),ae==="instanceColor"&&P.instanceColor&&(j=P.instanceColor));let le={};le.attribute=j,j&&j.data&&(le.data=j.data),W[ae]=le,Y++}c.attributes=W,c.attributesNum=Y,c.index=J}function v(){let P=c.newAttributes;for(let H=0,q=P.length;H<q;H++)P[H]=0}function T(P){R(P,0)}function R(P,H){let q=c.newAttributes,J=c.enabledAttributes,W=c.attributeDivisors;q[P]=1,J[P]===0&&(s.enableVertexAttribArray(P),J[P]=1),W[P]!==H&&((n.isWebGL2?s:e.get("ANGLE_instanced_arrays"))[n.isWebGL2?"vertexAttribDivisor":"vertexAttribDivisorANGLE"](P,H),W[P]=H)}function C(){let P=c.newAttributes,H=c.enabledAttributes;for(let q=0,J=H.length;q<J;q++)H[q]!==P[q]&&(s.disableVertexAttribArray(q),H[q]=0)}function A(P,H,q,J,W,U,Y){Y===!0?s.vertexAttribIPointer(P,H,q,W,U):s.vertexAttribPointer(P,H,q,J,W,U)}function $(P,H,q,J){if(n.isWebGL2===!1&&(P.isInstancedMesh||J.isInstancedBufferGeometry)&&e.get("ANGLE_instanced_arrays")===null)return;v();let W=J.attributes,U=q.getAttributes(),Y=H.defaultAttributeValues;for(let ne in U){let ae=U[ne];if(ae.location>=0){let X=W[ne];if(X===void 0&&(ne==="instanceMatrix"&&P.instanceMatrix&&(X=P.instanceMatrix),ne==="instanceColor"&&P.instanceColor&&(X=P.instanceColor)),X!==void 0){let j=X.normalized,le=X.itemSize,ge=t.get(X);if(ge===void 0)continue;let me=ge.buffer,Ce=ge.type,Ae=ge.bytesPerElement,Se=n.isWebGL2===!0&&(Ce===s.INT||Ce===s.UNSIGNED_INT||X.gpuType===jc);if(X.isInterleavedBufferAttribute){let Ve=X.data,O=Ve.stride,ht=X.offset;if(Ve.isInstancedInterleavedBuffer){for(let _e=0;_e<ae.locationSize;_e++)R(ae.location+_e,Ve.meshPerAttribute);P.isInstancedMesh!==!0&&J._maxInstanceCount===void 0&&(J._maxInstanceCount=Ve.meshPerAttribute*Ve.count)}else for(let _e=0;_e<ae.locationSize;_e++)T(ae.location+_e);s.bindBuffer(s.ARRAY_BUFFER,me);for(let _e=0;_e<ae.locationSize;_e++)A(ae.location+_e,le/ae.locationSize,Ce,j,O*Ae,(ht+le/ae.locationSize*_e)*Ae,Se)}else{if(X.isInstancedBufferAttribute){for(let Ve=0;Ve<ae.locationSize;Ve++)R(ae.location+Ve,X.meshPerAttribute);P.isInstancedMesh!==!0&&J._maxInstanceCount===void 0&&(J._maxInstanceCount=X.meshPerAttribute*X.count)}else for(let Ve=0;Ve<ae.locationSize;Ve++)T(ae.location+Ve);s.bindBuffer(s.ARRAY_BUFFER,me);for(let Ve=0;Ve<ae.locationSize;Ve++)A(ae.location+Ve,le/ae.locationSize,Ce,j,le*Ae,le/ae.locationSize*Ve*Ae,Se)}}else if(Y!==void 0){let j=Y[ne];if(j!==void 0)switch(j.length){case 2:s.vertexAttrib2fv(ae.location,j);break;case 3:s.vertexAttrib3fv(ae.location,j);break;case 4:s.vertexAttrib4fv(ae.location,j);break;default:s.vertexAttrib1fv(ae.location,j)}}}}C()}function x(){N();for(let P in a){let H=a[P];for(let q in H){let J=H[q];for(let W in J)g(J[W].object),delete J[W];delete H[q]}delete a[P]}}function b(P){if(a[P.id]===void 0)return;let H=a[P.id];for(let q in H){let J=H[q];for(let W in J)g(J[W].object),delete J[W];delete H[q]}delete a[P.id]}function L(P){for(let H in a){let q=a[H];if(q[P.id]===void 0)continue;let J=q[P.id];for(let W in J)g(J[W].object),delete J[W];delete q[P.id]}}function N(){K(),h=!0,c!==l&&(c=l,p(c.object))}function K(){l.geometry=null,l.program=null,l.wireframe=!1}return{setup:u,reset:N,resetDefaultState:K,dispose:x,releaseStatesOfGeometry:b,releaseStatesOfProgram:L,initAttributes:v,enableAttribute:T,disableUnusedAttributes:C}}function Im(s,e,t,n){let i=n.isWebGL2,r;function o(h){r=h}function a(h,u){s.drawArrays(r,h,u),t.update(u,r,1)}function l(h,u,d){if(d===0)return;let p,g;if(i)p=s,g="drawArraysInstanced";else if(p=e.get("ANGLE_instanced_arrays"),g="drawArraysInstancedANGLE",p===null){console.error("THREE.WebGLBufferRenderer: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.");return}p[g](r,h,u,d),t.update(u,r,d)}function c(h,u,d){if(d===0)return;let p=e.get("WEBGL_multi_draw");if(p===null)for(let g=0;g<d;g++)this.render(h[g],u[g]);else{p.multiDrawArraysWEBGL(r,h,0,u,0,d);let g=0;for(let y=0;y<d;y++)g+=u[y];t.update(g,r,1)}}this.setMode=o,this.render=a,this.renderInstances=l,this.renderMultiDraw=c}function Lm(s,e,t){let n;function i(){if(n!==void 0)return n;if(e.has("EXT_texture_filter_anisotropic")===!0){let A=e.get("EXT_texture_filter_anisotropic");n=s.getParameter(A.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else n=0;return n}function r(A){if(A==="highp"){if(s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.HIGH_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.HIGH_FLOAT).precision>0)return"highp";A="mediump"}return A==="mediump"&&s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.MEDIUM_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let o=typeof WebGL2RenderingContext<"u"&&s.constructor.name==="WebGL2RenderingContext",a=t.precision!==void 0?t.precision:"highp",l=r(a);l!==a&&(console.warn("THREE.WebGLRenderer:",a,"not supported, using",l,"instead."),a=l);let c=o||e.has("WEBGL_draw_buffers"),h=t.logarithmicDepthBuffer===!0,u=s.getParameter(s.MAX_TEXTURE_IMAGE_UNITS),d=s.getParameter(s.MAX_VERTEX_TEXTURE_IMAGE_UNITS),p=s.getParameter(s.MAX_TEXTURE_SIZE),g=s.getParameter(s.MAX_CUBE_MAP_TEXTURE_SIZE),y=s.getParameter(s.MAX_VERTEX_ATTRIBS),m=s.getParameter(s.MAX_VERTEX_UNIFORM_VECTORS),f=s.getParameter(s.MAX_VARYING_VECTORS),S=s.getParameter(s.MAX_FRAGMENT_UNIFORM_VECTORS),v=d>0,T=o||e.has("OES_texture_float"),R=v&&T,C=o?s.getParameter(s.MAX_SAMPLES):0;return{isWebGL2:o,drawBuffers:c,getMaxAnisotropy:i,getMaxPrecision:r,precision:a,logarithmicDepthBuffer:h,maxTextures:u,maxVertexTextures:d,maxTextureSize:p,maxCubemapSize:g,maxAttributes:y,maxVertexUniforms:m,maxVaryings:f,maxFragmentUniforms:S,vertexTextures:v,floatFragmentTextures:T,floatVertexTextures:R,maxSamples:C}}function Dm(s){let e=this,t=null,n=0,i=!1,r=!1,o=new Dn,a=new ze,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(u,d){let p=u.length!==0||d||n!==0||i;return i=d,n=u.length,p},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(u,d){t=h(u,d,0)},this.setState=function(u,d,p){let g=u.clippingPlanes,y=u.clipIntersection,m=u.clipShadows,f=s.get(u);if(!i||g===null||g.length===0||r&&!m)r?h(null):c();else{let S=r?0:n,v=S*4,T=f.clippingState||null;l.value=T,T=h(g,d,v,p);for(let R=0;R!==v;++R)T[R]=t[R];f.clippingState=T,this.numIntersection=y?this.numPlanes:0,this.numPlanes+=S}};function c(){l.value!==t&&(l.value=t,l.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0}function h(u,d,p,g){let y=u!==null?u.length:0,m=null;if(y!==0){if(m=l.value,g!==!0||m===null){let f=p+y*4,S=d.matrixWorldInverse;a.getNormalMatrix(S),(m===null||m.length<f)&&(m=new Float32Array(f));for(let v=0,T=p;v!==y;++v,T+=4)o.copy(u[v]).applyMatrix4(S,a),o.normal.toArray(m,T),m[T+3]=o.constant}l.value=m,l.needsUpdate=!0}return e.numPlanes=y,e.numIntersection=0,m}}function km(s){let e=new WeakMap;function t(o,a){return a===no?o.mapping=es:a===io&&(o.mapping=ts),o}function n(o){if(o&&o.isTexture){let a=o.mapping;if(a===no||a===io)if(e.has(o)){let l=e.get(o).texture;return t(l,o.mapping)}else{let l=o.image;if(l&&l.height>0){let c=new fo(l.height/2);return c.fromEquirectangularTexture(s,o),e.set(o,c),o.addEventListener("dispose",i),t(c.texture,o.mapping)}else return null}}return o}function i(o){let a=o.target;a.removeEventListener("dispose",i);let l=e.get(a);l!==void 0&&(e.delete(a),l.dispose())}function r(){e=new WeakMap}return{get:n,dispose:r}}var po=class extends Nr{constructor(e=-1,t=1,n=1,i=-1,r=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=i,this.near=r,this.far=o,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,i,r,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2,r=n-e,o=n+e,a=i+t,l=i-t;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,o=r+c*this.view.width,a-=h*this.view.offsetY,l=a-h*this.view.height}this.projectionMatrix.makeOrthographic(r,o,a,l,this.near,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}},Ji=4,Ec=[.125,.215,.35,.446,.526,.582],mi=20,Ya=new po,Tc=new Ge,Za=null,Ja=0,Ka=0,fi=(1+Math.sqrt(5))/2,Xi=1/fi,Ac=[new k(1,1,1),new k(-1,1,1),new k(1,1,-1),new k(-1,1,-1),new k(0,fi,Xi),new k(0,fi,-Xi),new k(Xi,0,fi),new k(-Xi,0,fi),new k(fi,Xi,0),new k(-fi,Xi,0)],Hr=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(e,t=0,n=.1,i=100){Za=this._renderer.getRenderTarget(),Ja=this._renderer.getActiveCubeFace(),Ka=this._renderer.getActiveMipmapLevel(),this._setSize(256);let r=this._allocateTargets();return r.depthBuffer=!0,this._sceneToCubeUV(e,n,i,r),t>0&&this._blur(r,0,0,t),this._applyPMREM(r),this._cleanup(r),r}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Pc(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Rc(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodPlanes.length;e++)this._lodPlanes[e].dispose()}_cleanup(e){this._renderer.setRenderTarget(Za,Ja,Ka),e.scissorTest=!1,vr(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===es||e.mapping===ts?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Za=this._renderer.getRenderTarget(),Ja=this._renderer.getActiveCubeFace(),Ka=this._renderer.getActiveMipmapLevel();let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:rn,minFilter:rn,generateMipmaps:!1,type:Ts,format:mn,colorSpace:Nn,depthBuffer:!1},i=Cc(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Cc(e,t,n);let{_lodMax:r}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=Um(r)),this._blurMaterial=Fm(r,e,t)}return i}_compileMaterial(e){let t=new ct(this._lodPlanes[0],e);this._renderer.compile(t,Ya)}_sceneToCubeUV(e,t,n,i){let a=new vt(90,1,t,n),l=[1,-1,1,1,1,1],c=[1,1,1,-1,-1,-1],h=this._renderer,u=h.autoClear,d=h.toneMapping;h.getClearColor(Tc),h.toneMapping=Qn,h.autoClear=!1;let p=new qt({name:"PMREM.Background",side:Xt,depthWrite:!1,depthTest:!1}),g=new ct(new Rs,p),y=!1,m=e.background;m?m.isColor&&(p.color.copy(m),e.background=null,y=!0):(p.color.copy(Tc),y=!0);for(let f=0;f<6;f++){let S=f%3;S===0?(a.up.set(0,l[f],0),a.lookAt(c[f],0,0)):S===1?(a.up.set(0,0,l[f]),a.lookAt(0,c[f],0)):(a.up.set(0,l[f],0),a.lookAt(0,0,c[f]));let v=this._cubeSize;vr(i,S*v,f>2?v:0,v,v),h.setRenderTarget(i),y&&h.render(g,a),h.render(e,a)}g.geometry.dispose(),g.material.dispose(),h.toneMapping=d,h.autoClear=u,e.background=m}_textureToCubeUV(e,t){let n=this._renderer,i=e.mapping===es||e.mapping===ts;i?(this._cubemapMaterial===null&&(this._cubemapMaterial=Pc()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Rc());let r=i?this._cubemapMaterial:this._equirectMaterial,o=new ct(this._lodPlanes[0],r),a=r.uniforms;a.envMap.value=e;let l=this._cubeSize;vr(t,0,0,3*l,2*l),n.setRenderTarget(t),n.render(o,Ya)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;for(let i=1;i<this._lodPlanes.length;i++){let r=Math.sqrt(this._sigmas[i]*this._sigmas[i]-this._sigmas[i-1]*this._sigmas[i-1]),o=Ac[(i-1)%Ac.length];this._blur(e,i-1,i,r,o)}t.autoClear=n}_blur(e,t,n,i,r){let o=this._pingPongRenderTarget;this._halfBlur(e,o,t,n,i,"latitudinal",r),this._halfBlur(o,e,n,n,i,"longitudinal",r)}_halfBlur(e,t,n,i,r,o,a){let l=this._renderer,c=this._blurMaterial;o!=="latitudinal"&&o!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");let h=3,u=new ct(this._lodPlanes[i],c),d=c.uniforms,p=this._sizeLods[n]-1,g=isFinite(r)?Math.PI/(2*p):2*Math.PI/(2*mi-1),y=r/g,m=isFinite(r)?1+Math.floor(h*y):mi;m>mi&&console.warn(`sigmaRadians, ${r}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${mi}`);let f=[],S=0;for(let A=0;A<mi;++A){let $=A/y,x=Math.exp(-$*$/2);f.push(x),A===0?S+=x:A<m&&(S+=2*x)}for(let A=0;A<f.length;A++)f[A]=f[A]/S;d.envMap.value=e.texture,d.samples.value=m,d.weights.value=f,d.latitudinal.value=o==="latitudinal",a&&(d.poleAxis.value=a);let{_lodMax:v}=this;d.dTheta.value=g,d.mipInt.value=v-n;let T=this._sizeLods[i],R=3*T*(i>v-Ji?i-v+Ji:0),C=4*(this._cubeSize-T);vr(t,R,C,3*T,2*T),l.setRenderTarget(t),l.render(u,Ya)}};function Um(s){let e=[],t=[],n=[],i=s,r=s-Ji+1+Ec.length;for(let o=0;o<r;o++){let a=Math.pow(2,i);t.push(a);let l=1/a;o>s-Ji?l=Ec[o-s+Ji-1]:o===0&&(l=0),n.push(l);let c=1/(a-2),h=-c,u=1+c,d=[h,h,u,h,u,u,h,h,u,u,h,u],p=6,g=6,y=3,m=2,f=1,S=new Float32Array(y*g*p),v=new Float32Array(m*g*p),T=new Float32Array(f*g*p);for(let C=0;C<p;C++){let A=C%3*2/3-1,$=C>2?0:-1,x=[A,$,0,A+2/3,$,0,A+2/3,$+1,0,A,$,0,A+2/3,$+1,0,A,$+1,0];S.set(x,y*g*C),v.set(d,m*g*C);let b=[C,C,C,C,C,C];T.set(b,f*g*C)}let R=new si;R.setAttribute("position",new Qt(S,y)),R.setAttribute("uv",new Qt(v,m)),R.setAttribute("faceIndex",new Qt(T,f)),e.push(R),i>Ji&&i--}return{lodPlanes:e,sizeLods:t,sigmas:n}}function Cc(s,e,t){let n=new On(s,e,t);return n.texture.mapping=Xr,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function vr(s,e,t,n,i){s.viewport.set(e,t,n,i),s.scissor.set(e,t,n,i)}function Fm(s,e,t){let n=new Float32Array(mi),i=new k(0,1,0);return new Bn({name:"SphericalGaussianBlur",defines:{n:mi,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${s}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:i}},vertexShader:zo(),fragmentShader:`

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
		`,blending:Kn,depthTest:!1,depthWrite:!1})}function Rc(){return new Bn({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:zo(),fragmentShader:`

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
		`,blending:Kn,depthTest:!1,depthWrite:!1})}function Pc(){return new Bn({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:zo(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Kn,depthTest:!1,depthWrite:!1})}function zo(){return`

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
	`}function Nm(s){let e=new WeakMap,t=null;function n(a){if(a&&a.isTexture){let l=a.mapping,c=l===no||l===io,h=l===es||l===ts;if(c||h)if(a.isRenderTargetTexture&&a.needsPMREMUpdate===!0){a.needsPMREMUpdate=!1;let u=e.get(a);return t===null&&(t=new Hr(s)),u=c?t.fromEquirectangular(a,u):t.fromCubemap(a,u),e.set(a,u),u.texture}else{if(e.has(a))return e.get(a).texture;{let u=a.image;if(c&&u&&u.height>0||h&&u&&i(u)){t===null&&(t=new Hr(s));let d=c?t.fromEquirectangular(a):t.fromCubemap(a);return e.set(a,d),a.addEventListener("dispose",r),d.texture}else return null}}}return a}function i(a){let l=0,c=6;for(let h=0;h<c;h++)a[h]!==void 0&&l++;return l===c}function r(a){let l=a.target;l.removeEventListener("dispose",r);let c=e.get(l);c!==void 0&&(e.delete(l),c.dispose())}function o(){e=new WeakMap,t!==null&&(t.dispose(),t=null)}return{get:n,dispose:o}}function Om(s){let e={};function t(n){if(e[n]!==void 0)return e[n];let i;switch(n){case"WEBGL_depth_texture":i=s.getExtension("WEBGL_depth_texture")||s.getExtension("MOZ_WEBGL_depth_texture")||s.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":i=s.getExtension("EXT_texture_filter_anisotropic")||s.getExtension("MOZ_EXT_texture_filter_anisotropic")||s.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":i=s.getExtension("WEBGL_compressed_texture_s3tc")||s.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":i=s.getExtension("WEBGL_compressed_texture_pvrtc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:i=s.getExtension(n)}return e[n]=i,i}return{has:function(n){return t(n)!==null},init:function(n){n.isWebGL2?(t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance")):(t("WEBGL_depth_texture"),t("OES_texture_float"),t("OES_texture_half_float"),t("OES_texture_half_float_linear"),t("OES_standard_derivatives"),t("OES_element_index_uint"),t("OES_vertex_array_object"),t("ANGLE_instanced_arrays")),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture")},get:function(n){let i=t(n);return i===null&&console.warn("THREE.WebGLRenderer: "+n+" extension not supported."),i}}}function Bm(s,e,t,n){let i={},r=new WeakMap;function o(u){let d=u.target;d.index!==null&&e.remove(d.index);for(let g in d.attributes)e.remove(d.attributes[g]);for(let g in d.morphAttributes){let y=d.morphAttributes[g];for(let m=0,f=y.length;m<f;m++)e.remove(y[m])}d.removeEventListener("dispose",o),delete i[d.id];let p=r.get(d);p&&(e.remove(p),r.delete(d)),n.releaseStatesOfGeometry(d),d.isInstancedBufferGeometry===!0&&delete d._maxInstanceCount,t.memory.geometries--}function a(u,d){return i[d.id]===!0||(d.addEventListener("dispose",o),i[d.id]=!0,t.memory.geometries++),d}function l(u){let d=u.attributes;for(let g in d)e.update(d[g],s.ARRAY_BUFFER);let p=u.morphAttributes;for(let g in p){let y=p[g];for(let m=0,f=y.length;m<f;m++)e.update(y[m],s.ARRAY_BUFFER)}}function c(u){let d=[],p=u.index,g=u.attributes.position,y=0;if(p!==null){let S=p.array;y=p.version;for(let v=0,T=S.length;v<T;v+=3){let R=S[v+0],C=S[v+1],A=S[v+2];d.push(R,C,C,A,A,R)}}else if(g!==void 0){let S=g.array;y=g.version;for(let v=0,T=S.length/3-1;v<T;v+=3){let R=v+0,C=v+1,A=v+2;d.push(R,C,C,A,A,R)}}else return;let m=new(oh(d)?Fr:Ur)(d,1);m.version=y;let f=r.get(u);f&&e.remove(f),r.set(u,m)}function h(u){let d=r.get(u);if(d){let p=u.index;p!==null&&d.version<p.version&&c(u)}else c(u);return r.get(u)}return{get:a,update:l,getWireframeAttribute:h}}function Hm(s,e,t,n){let i=n.isWebGL2,r;function o(p){r=p}let a,l;function c(p){a=p.type,l=p.bytesPerElement}function h(p,g){s.drawElements(r,g,a,p*l),t.update(g,r,1)}function u(p,g,y){if(y===0)return;let m,f;if(i)m=s,f="drawElementsInstanced";else if(m=e.get("ANGLE_instanced_arrays"),f="drawElementsInstancedANGLE",m===null){console.error("THREE.WebGLIndexedBufferRenderer: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.");return}m[f](r,g,a,p*l,y),t.update(g,r,y)}function d(p,g,y){if(y===0)return;let m=e.get("WEBGL_multi_draw");if(m===null)for(let f=0;f<y;f++)this.render(p[f]/l,g[f]);else{m.multiDrawElementsWEBGL(r,g,0,a,p,0,y);let f=0;for(let S=0;S<y;S++)f+=g[S];t.update(f,r,1)}}this.setMode=o,this.setIndex=c,this.render=h,this.renderInstances=u,this.renderMultiDraw=d}function zm(s){let e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,o,a){switch(t.calls++,o){case s.TRIANGLES:t.triangles+=a*(r/3);break;case s.LINES:t.lines+=a*(r/2);break;case s.LINE_STRIP:t.lines+=a*(r-1);break;case s.LINE_LOOP:t.lines+=a*r;break;case s.POINTS:t.points+=a*r;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",o);break}}function i(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:i,update:n}}function Vm(s,e){return s[0]-e[0]}function Gm(s,e){return Math.abs(e[1])-Math.abs(s[1])}function Wm(s,e,t){let n={},i=new Float32Array(8),r=new WeakMap,o=new Rt,a=[];for(let c=0;c<8;c++)a[c]=[c,0];function l(c,h,u){let d=c.morphTargetInfluences;if(e.isWebGL2===!0){let p=h.morphAttributes.position||h.morphAttributes.normal||h.morphAttributes.color,g=p!==void 0?p.length:0,y=r.get(h);if(y===void 0||y.count!==g){let P=function(){N.dispose(),r.delete(h),h.removeEventListener("dispose",P)};y!==void 0&&y.texture.dispose();let S=h.morphAttributes.position!==void 0,v=h.morphAttributes.normal!==void 0,T=h.morphAttributes.color!==void 0,R=h.morphAttributes.position||[],C=h.morphAttributes.normal||[],A=h.morphAttributes.color||[],$=0;S===!0&&($=1),v===!0&&($=2),T===!0&&($=3);let x=h.attributes.position.count*$,b=1;x>e.maxTextureSize&&(b=Math.ceil(x/e.maxTextureSize),x=e.maxTextureSize);let L=new Float32Array(x*b*4*g),N=new Dr(L,x,b,g);N.type=Jn,N.needsUpdate=!0;let K=$*4;for(let H=0;H<g;H++){let q=R[H],J=C[H],W=A[H],U=x*b*4*H;for(let Y=0;Y<q.count;Y++){let ne=Y*K;S===!0&&(o.fromBufferAttribute(q,Y),L[U+ne+0]=o.x,L[U+ne+1]=o.y,L[U+ne+2]=o.z,L[U+ne+3]=0),v===!0&&(o.fromBufferAttribute(J,Y),L[U+ne+4]=o.x,L[U+ne+5]=o.y,L[U+ne+6]=o.z,L[U+ne+7]=0),T===!0&&(o.fromBufferAttribute(W,Y),L[U+ne+8]=o.x,L[U+ne+9]=o.y,L[U+ne+10]=o.z,L[U+ne+11]=W.itemSize===4?o.w:1)}}y={count:g,texture:N,size:new Ue(x,b)},r.set(h,y),h.addEventListener("dispose",P)}let m=0;for(let S=0;S<d.length;S++)m+=d[S];let f=h.morphTargetsRelative?1:1-m;u.getUniforms().setValue(s,"morphTargetBaseInfluence",f),u.getUniforms().setValue(s,"morphTargetInfluences",d),u.getUniforms().setValue(s,"morphTargetsTexture",y.texture,t),u.getUniforms().setValue(s,"morphTargetsTextureSize",y.size)}else{let p=d===void 0?0:d.length,g=n[h.id];if(g===void 0||g.length!==p){g=[];for(let v=0;v<p;v++)g[v]=[v,0];n[h.id]=g}for(let v=0;v<p;v++){let T=g[v];T[0]=v,T[1]=d[v]}g.sort(Gm);for(let v=0;v<8;v++)v<p&&g[v][1]?(a[v][0]=g[v][0],a[v][1]=g[v][1]):(a[v][0]=Number.MAX_SAFE_INTEGER,a[v][1]=0);a.sort(Vm);let y=h.morphAttributes.position,m=h.morphAttributes.normal,f=0;for(let v=0;v<8;v++){let T=a[v],R=T[0],C=T[1];R!==Number.MAX_SAFE_INTEGER&&C?(y&&h.getAttribute("morphTarget"+v)!==y[R]&&h.setAttribute("morphTarget"+v,y[R]),m&&h.getAttribute("morphNormal"+v)!==m[R]&&h.setAttribute("morphNormal"+v,m[R]),i[v]=C,f+=C):(y&&h.hasAttribute("morphTarget"+v)===!0&&h.deleteAttribute("morphTarget"+v),m&&h.hasAttribute("morphNormal"+v)===!0&&h.deleteAttribute("morphNormal"+v),i[v]=0)}let S=h.morphTargetsRelative?1:1-f;u.getUniforms().setValue(s,"morphTargetBaseInfluence",S),u.getUniforms().setValue(s,"morphTargetInfluences",i)}}return{update:l}}function Xm(s,e,t,n){let i=new WeakMap;function r(l){let c=n.render.frame,h=l.geometry,u=e.get(l,h);if(i.get(u)!==c&&(e.update(u),i.set(u,c)),l.isInstancedMesh&&(l.hasEventListener("dispose",a)===!1&&l.addEventListener("dispose",a),i.get(l)!==c&&(t.update(l.instanceMatrix,s.ARRAY_BUFFER),l.instanceColor!==null&&t.update(l.instanceColor,s.ARRAY_BUFFER),i.set(l,c))),l.isSkinnedMesh){let d=l.skeleton;i.get(d)!==c&&(d.update(),i.set(d,c))}return u}function o(){i=new WeakMap}function a(l){let c=l.target;c.removeEventListener("dispose",a),t.remove(c.instanceMatrix),c.instanceColor!==null&&t.remove(c.instanceColor)}return{update:r,dispose:o}}var zr=class extends Tt{constructor(e,t,n,i,r,o,a,l,c,h){if(h=h!==void 0?h:vi,h!==vi&&h!==is)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");n===void 0&&h===vi&&(n=Zn),n===void 0&&h===is&&(n=yi),super(null,i,r,o,a,l,h,n,c),this.isDepthTexture=!0,this.image={width:e,height:t},this.magFilter=a!==void 0?a:Nt,this.minFilter=l!==void 0?l:Nt,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}},uh=new Tt,dh=new zr(1,1);dh.compareFunction=ah;var fh=new Dr,ph=new ho,mh=new Or,Ic=[],Lc=[],Dc=new Float32Array(16),kc=new Float32Array(9),Uc=new Float32Array(4);function ls(s,e,t){let n=s[0];if(n<=0||n>0)return s;let i=e*t,r=Ic[i];if(r===void 0&&(r=new Float32Array(i),Ic[i]=r),e!==0){n.toArray(r,0);for(let o=1,a=0;o!==e;++o)a+=t,s[o].toArray(r,a)}return r}function xt(s,e){if(s.length!==e.length)return!1;for(let t=0,n=s.length;t<n;t++)if(s[t]!==e[t])return!1;return!0}function _t(s,e){for(let t=0,n=e.length;t<n;t++)s[t]=e[t]}function qr(s,e){let t=Lc[e];t===void 0&&(t=new Int32Array(e),Lc[e]=t);for(let n=0;n!==e;++n)t[n]=s.allocateTextureUnit();return t}function $m(s,e){let t=this.cache;t[0]!==e&&(s.uniform1f(this.addr,e),t[0]=e)}function qm(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(s.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(xt(t,e))return;s.uniform2fv(this.addr,e),_t(t,e)}}function Ym(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(s.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(s.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(xt(t,e))return;s.uniform3fv(this.addr,e),_t(t,e)}}function Zm(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(s.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(xt(t,e))return;s.uniform4fv(this.addr,e),_t(t,e)}}function Jm(s,e){let t=this.cache,n=e.elements;if(n===void 0){if(xt(t,e))return;s.uniformMatrix2fv(this.addr,!1,e),_t(t,e)}else{if(xt(t,n))return;Uc.set(n),s.uniformMatrix2fv(this.addr,!1,Uc),_t(t,n)}}function Km(s,e){let t=this.cache,n=e.elements;if(n===void 0){if(xt(t,e))return;s.uniformMatrix3fv(this.addr,!1,e),_t(t,e)}else{if(xt(t,n))return;kc.set(n),s.uniformMatrix3fv(this.addr,!1,kc),_t(t,n)}}function jm(s,e){let t=this.cache,n=e.elements;if(n===void 0){if(xt(t,e))return;s.uniformMatrix4fv(this.addr,!1,e),_t(t,e)}else{if(xt(t,n))return;Dc.set(n),s.uniformMatrix4fv(this.addr,!1,Dc),_t(t,n)}}function Qm(s,e){let t=this.cache;t[0]!==e&&(s.uniform1i(this.addr,e),t[0]=e)}function eg(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(s.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(xt(t,e))return;s.uniform2iv(this.addr,e),_t(t,e)}}function tg(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(s.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(xt(t,e))return;s.uniform3iv(this.addr,e),_t(t,e)}}function ng(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(s.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(xt(t,e))return;s.uniform4iv(this.addr,e),_t(t,e)}}function ig(s,e){let t=this.cache;t[0]!==e&&(s.uniform1ui(this.addr,e),t[0]=e)}function sg(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(s.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(xt(t,e))return;s.uniform2uiv(this.addr,e),_t(t,e)}}function rg(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(s.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(xt(t,e))return;s.uniform3uiv(this.addr,e),_t(t,e)}}function ag(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(s.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(xt(t,e))return;s.uniform4uiv(this.addr,e),_t(t,e)}}function og(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i);let r=this.type===s.SAMPLER_2D_SHADOW?dh:uh;t.setTexture2D(e||r,i)}function lg(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.setTexture3D(e||ph,i)}function cg(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.setTextureCube(e||mh,i)}function hg(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.setTexture2DArray(e||fh,i)}function ug(s){switch(s){case 5126:return $m;case 35664:return qm;case 35665:return Ym;case 35666:return Zm;case 35674:return Jm;case 35675:return Km;case 35676:return jm;case 5124:case 35670:return Qm;case 35667:case 35671:return eg;case 35668:case 35672:return tg;case 35669:case 35673:return ng;case 5125:return ig;case 36294:return sg;case 36295:return rg;case 36296:return ag;case 35678:case 36198:case 36298:case 36306:case 35682:return og;case 35679:case 36299:case 36307:return lg;case 35680:case 36300:case 36308:case 36293:return cg;case 36289:case 36303:case 36311:case 36292:return hg}}function dg(s,e){s.uniform1fv(this.addr,e)}function fg(s,e){let t=ls(e,this.size,2);s.uniform2fv(this.addr,t)}function pg(s,e){let t=ls(e,this.size,3);s.uniform3fv(this.addr,t)}function mg(s,e){let t=ls(e,this.size,4);s.uniform4fv(this.addr,t)}function gg(s,e){let t=ls(e,this.size,4);s.uniformMatrix2fv(this.addr,!1,t)}function yg(s,e){let t=ls(e,this.size,9);s.uniformMatrix3fv(this.addr,!1,t)}function vg(s,e){let t=ls(e,this.size,16);s.uniformMatrix4fv(this.addr,!1,t)}function xg(s,e){s.uniform1iv(this.addr,e)}function _g(s,e){s.uniform2iv(this.addr,e)}function bg(s,e){s.uniform3iv(this.addr,e)}function Sg(s,e){s.uniform4iv(this.addr,e)}function Mg(s,e){s.uniform1uiv(this.addr,e)}function wg(s,e){s.uniform2uiv(this.addr,e)}function Eg(s,e){s.uniform3uiv(this.addr,e)}function Tg(s,e){s.uniform4uiv(this.addr,e)}function Ag(s,e,t){let n=this.cache,i=e.length,r=qr(t,i);xt(n,r)||(s.uniform1iv(this.addr,r),_t(n,r));for(let o=0;o!==i;++o)t.setTexture2D(e[o]||uh,r[o])}function Cg(s,e,t){let n=this.cache,i=e.length,r=qr(t,i);xt(n,r)||(s.uniform1iv(this.addr,r),_t(n,r));for(let o=0;o!==i;++o)t.setTexture3D(e[o]||ph,r[o])}function Rg(s,e,t){let n=this.cache,i=e.length,r=qr(t,i);xt(n,r)||(s.uniform1iv(this.addr,r),_t(n,r));for(let o=0;o!==i;++o)t.setTextureCube(e[o]||mh,r[o])}function Pg(s,e,t){let n=this.cache,i=e.length,r=qr(t,i);xt(n,r)||(s.uniform1iv(this.addr,r),_t(n,r));for(let o=0;o!==i;++o)t.setTexture2DArray(e[o]||fh,r[o])}function Ig(s){switch(s){case 5126:return dg;case 35664:return fg;case 35665:return pg;case 35666:return mg;case 35674:return gg;case 35675:return yg;case 35676:return vg;case 5124:case 35670:return xg;case 35667:case 35671:return _g;case 35668:case 35672:return bg;case 35669:case 35673:return Sg;case 5125:return Mg;case 36294:return wg;case 36295:return Eg;case 36296:return Tg;case 35678:case 36198:case 36298:case 36306:case 35682:return Ag;case 35679:case 36299:case 36307:return Cg;case 35680:case 36300:case 36308:case 36293:return Rg;case 36289:case 36303:case 36311:case 36292:return Pg}}var mo=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=ug(t.type)}},go=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=Ig(t.type)}},yo=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let i=this.seq;for(let r=0,o=i.length;r!==o;++r){let a=i[r];a.setValue(e,t[a.id],n)}}},ja=/(\w+)(\])?(\[|\.)?/g;function Fc(s,e){s.seq.push(e),s.map[e.id]=e}function Lg(s,e,t){let n=s.name,i=n.length;for(ja.lastIndex=0;;){let r=ja.exec(n),o=ja.lastIndex,a=r[1],l=r[2]==="]",c=r[3];if(l&&(a=a|0),c===void 0||c==="["&&o+2===i){Fc(t,c===void 0?new mo(a,s,e):new go(a,s,e));break}else{let u=t.map[a];u===void 0&&(u=new yo(a),Fc(t,u)),t=u}}}var Qi=class{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let i=0;i<n;++i){let r=e.getActiveUniform(t,i),o=e.getUniformLocation(t,r.name);Lg(r,o,this)}}setValue(e,t,n,i){let r=this.map[t];r!==void 0&&r.setValue(e,n,i)}setOptional(e,t,n){let i=t[n];i!==void 0&&this.setValue(e,n,i)}static upload(e,t,n,i){for(let r=0,o=t.length;r!==o;++r){let a=t[r],l=n[a.id];l.needsUpdate!==!1&&a.setValue(e,l.value,i)}}static seqWithValue(e,t){let n=[];for(let i=0,r=e.length;i!==r;++i){let o=e[i];o.id in t&&n.push(o)}return n}};function Nc(s,e,t){let n=s.createShader(e);return s.shaderSource(n,t),s.compileShader(n),n}var Dg=37297,kg=0;function Ug(s,e){let t=s.split(`
`),n=[],i=Math.max(e-6,0),r=Math.min(e+6,t.length);for(let o=i;o<r;o++){let a=o+1;n.push(`${a===e?">":" "} ${a}: ${t[o]}`)}return n.join(`
`)}function Fg(s){let e=je.getPrimaries(je.workingColorSpace),t=je.getPrimaries(s),n;switch(e===t?n="":e===Cr&&t===Ar?n="LinearDisplayP3ToLinearSRGB":e===Ar&&t===Cr&&(n="LinearSRGBToLinearDisplayP3"),s){case Nn:case $r:return[n,"LinearTransferOETF"];case Ye:case Ho:return[n,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space:",s),[n,"LinearTransferOETF"]}}function Oc(s,e,t){let n=s.getShaderParameter(e,s.COMPILE_STATUS),i=s.getShaderInfoLog(e).trim();if(n&&i==="")return"";let r=/ERROR: 0:(\d+)/.exec(i);if(r){let o=parseInt(r[1]);return t.toUpperCase()+`

`+i+`

`+Ug(s.getShaderSource(e),o)}else return i}function Ng(s,e){let t=Fg(e);return`vec4 ${s}( vec4 value ) { return ${t[0]}( ${t[1]}( value ) ); }`}function Og(s,e){let t;switch(e){case ed:t="Linear";break;case td:t="Reinhard";break;case nd:t="OptimizedCineon";break;case id:t="ACESFilmic";break;case rd:t="AgX";break;case sd:t="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",e),t="Linear"}return"vec3 "+s+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}function Bg(s){return[s.extensionDerivatives||s.envMapCubeUVHeight||s.bumpMap||s.normalMapTangentSpace||s.clearcoatNormalMap||s.flatShading||s.shaderID==="physical"?"#extension GL_OES_standard_derivatives : enable":"",(s.extensionFragDepth||s.logarithmicDepthBuffer)&&s.rendererExtensionFragDepth?"#extension GL_EXT_frag_depth : enable":"",s.extensionDrawBuffers&&s.rendererExtensionDrawBuffers?"#extension GL_EXT_draw_buffers : require":"",(s.extensionShaderTextureLOD||s.envMap||s.transmission)&&s.rendererExtensionShaderTextureLod?"#extension GL_EXT_shader_texture_lod : enable":""].filter(Ki).join(`
`)}function Hg(s){return[s.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":""].filter(Ki).join(`
`)}function zg(s){let e=[];for(let t in s){let n=s[t];n!==!1&&e.push("#define "+t+" "+n)}return e.join(`
`)}function Vg(s,e){let t={},n=s.getProgramParameter(e,s.ACTIVE_ATTRIBUTES);for(let i=0;i<n;i++){let r=s.getActiveAttrib(e,i),o=r.name,a=1;r.type===s.FLOAT_MAT2&&(a=2),r.type===s.FLOAT_MAT3&&(a=3),r.type===s.FLOAT_MAT4&&(a=4),t[o]={type:r.type,location:s.getAttribLocation(e,o),locationSize:a}}return t}function Ki(s){return s!==""}function Bc(s,e){let t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return s.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function Hc(s,e){return s.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}var Gg=/^[ \t]*#include +<([\w\d./]+)>/gm;function vo(s){return s.replace(Gg,Xg)}var Wg=new Map([["encodings_fragment","colorspace_fragment"],["encodings_pars_fragment","colorspace_pars_fragment"],["output_fragment","opaque_fragment"]]);function Xg(s,e){let t=Ne[e];if(t===void 0){let n=Wg.get(e);if(n!==void 0)t=Ne[n],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,n);else throw new Error("Can not resolve #include <"+e+">")}return vo(t)}var $g=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function zc(s){return s.replace($g,qg)}function qg(s,e,t,n){let i="";for(let r=parseInt(e);r<parseInt(t);r++)i+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return i}function Vc(s){let e="precision "+s.precision+` float;
precision `+s.precision+" int;";return s.precision==="highp"?e+=`
#define HIGH_PRECISION`:s.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:s.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}function Yg(s){let e="SHADOWMAP_TYPE_BASIC";return s.shadowMapType===Zc?e="SHADOWMAP_TYPE_PCF":s.shadowMapType===Cu?e="SHADOWMAP_TYPE_PCF_SOFT":s.shadowMapType===Ln&&(e="SHADOWMAP_TYPE_VSM"),e}function Zg(s){let e="ENVMAP_TYPE_CUBE";if(s.envMap)switch(s.envMapMode){case es:case ts:e="ENVMAP_TYPE_CUBE";break;case Xr:e="ENVMAP_TYPE_CUBE_UV";break}return e}function Jg(s){let e="ENVMAP_MODE_REFLECTION";if(s.envMap)switch(s.envMapMode){case ts:e="ENVMAP_MODE_REFRACTION";break}return e}function Kg(s){let e="ENVMAP_BLENDING_NONE";if(s.envMap)switch(s.combine){case Jc:e="ENVMAP_BLENDING_MULTIPLY";break;case ju:e="ENVMAP_BLENDING_MIX";break;case Qu:e="ENVMAP_BLENDING_ADD";break}return e}function jg(s){let e=s.envMapCubeUVHeight;if(e===null)return null;let t=Math.log2(e)-2,n=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),7*16)),texelHeight:n,maxMip:t}}function Qg(s,e,t,n){let i=s.getContext(),r=t.defines,o=t.vertexShader,a=t.fragmentShader,l=Yg(t),c=Zg(t),h=Jg(t),u=Kg(t),d=jg(t),p=t.isWebGL2?"":Bg(t),g=Hg(t),y=zg(r),m=i.createProgram(),f,S,v=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(f=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,y].filter(Ki).join(`
`),f.length>0&&(f+=`
`),S=[p,"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,y].filter(Ki).join(`
`),S.length>0&&(S+=`
`)):(f=[Vc(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,y,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+h:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors&&t.isWebGL2?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0&&t.isWebGL2?"#define MORPHTARGETS_TEXTURE":"",t.morphTargetsCount>0&&t.isWebGL2?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0&&t.isWebGL2?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.useLegacyLights?"#define LEGACY_LIGHTS":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",t.logarithmicDepthBuffer&&t.rendererExtensionFragDepth?"#define USE_LOGDEPTHBUF_EXT":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#if ( defined( USE_MORPHTARGETS ) && ! defined( MORPHTARGETS_TEXTURE ) )","	attribute vec3 morphTarget0;","	attribute vec3 morphTarget1;","	attribute vec3 morphTarget2;","	attribute vec3 morphTarget3;","	#ifdef USE_MORPHNORMALS","		attribute vec3 morphNormal0;","		attribute vec3 morphNormal1;","		attribute vec3 morphNormal2;","		attribute vec3 morphNormal3;","	#else","		attribute vec3 morphTarget4;","		attribute vec3 morphTarget5;","		attribute vec3 morphTarget6;","		attribute vec3 morphTarget7;","	#endif","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Ki).join(`
`),S=[p,Vc(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,y,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+c:"",t.envMap?"#define "+h:"",t.envMap?"#define "+u:"",d?"#define CUBEUV_TEXEL_WIDTH "+d.texelWidth:"",d?"#define CUBEUV_TEXEL_HEIGHT "+d.texelHeight:"",d?"#define CUBEUV_MAX_MIP "+d.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.useLegacyLights?"#define LEGACY_LIGHTS":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",t.logarithmicDepthBuffer&&t.rendererExtensionFragDepth?"#define USE_LOGDEPTHBUF_EXT":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==Qn?"#define TONE_MAPPING":"",t.toneMapping!==Qn?Ne.tonemapping_pars_fragment:"",t.toneMapping!==Qn?Og("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",Ne.colorspace_pars_fragment,Ng("linearToOutputTexel",t.outputColorSpace),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Ki).join(`
`)),o=vo(o),o=Bc(o,t),o=Hc(o,t),a=vo(a),a=Bc(a,t),a=Hc(a,t),o=zc(o),a=zc(a),t.isWebGL2&&t.isRawShaderMaterial!==!0&&(v=`#version 300 es
`,f=[g,"precision mediump sampler2DArray;","#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+f,S=["precision mediump sampler2DArray;","#define varying in",t.glslVersion===oc?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===oc?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+S);let T=v+f+o,R=v+S+a,C=Nc(i,i.VERTEX_SHADER,T),A=Nc(i,i.FRAGMENT_SHADER,R);i.attachShader(m,C),i.attachShader(m,A),t.index0AttributeName!==void 0?i.bindAttribLocation(m,0,t.index0AttributeName):t.morphTargets===!0&&i.bindAttribLocation(m,0,"position"),i.linkProgram(m);function $(N){if(s.debug.checkShaderErrors){let K=i.getProgramInfoLog(m).trim(),P=i.getShaderInfoLog(C).trim(),H=i.getShaderInfoLog(A).trim(),q=!0,J=!0;if(i.getProgramParameter(m,i.LINK_STATUS)===!1)if(q=!1,typeof s.debug.onShaderError=="function")s.debug.onShaderError(i,m,C,A);else{let W=Oc(i,C,"vertex"),U=Oc(i,A,"fragment");console.error("THREE.WebGLProgram: Shader Error "+i.getError()+" - VALIDATE_STATUS "+i.getProgramParameter(m,i.VALIDATE_STATUS)+`

Program Info Log: `+K+`
`+W+`
`+U)}else K!==""?console.warn("THREE.WebGLProgram: Program Info Log:",K):(P===""||H==="")&&(J=!1);J&&(N.diagnostics={runnable:q,programLog:K,vertexShader:{log:P,prefix:f},fragmentShader:{log:H,prefix:S}})}i.deleteShader(C),i.deleteShader(A),x=new Qi(i,m),b=Vg(i,m)}let x;this.getUniforms=function(){return x===void 0&&$(this),x};let b;this.getAttributes=function(){return b===void 0&&$(this),b};let L=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return L===!1&&(L=i.getProgramParameter(m,Dg)),L},this.destroy=function(){n.releaseStatesOfProgram(this),i.deleteProgram(m),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=kg++,this.cacheKey=e,this.usedTimes=1,this.program=m,this.vertexShader=C,this.fragmentShader=A,this}var ey=0,xo=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){let t=e.vertexShader,n=e.fragmentShader,i=this._getShaderStage(t),r=this._getShaderStage(n),o=this._getShaderCacheForMaterial(e);return o.has(i)===!1&&(o.add(i),i.usedTimes++),o.has(r)===!1&&(o.add(r),r.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let n of t)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);return n===void 0&&(n=new _o(e),t.set(e,n)),n}},_o=class{constructor(e){this.id=ey++,this.code=e,this.usedTimes=0}};function ty(s,e,t,n,i,r,o){let a=new Cs,l=new xo,c=[],h=i.isWebGL2,u=i.logarithmicDepthBuffer,d=i.vertexTextures,p=i.precision,g={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function y(x){return x===0?"uv":`uv${x}`}function m(x,b,L,N,K){let P=N.fog,H=K.geometry,q=x.isMeshStandardMaterial?N.environment:null,J=(x.isMeshStandardMaterial?t:e).get(x.envMap||q),W=J&&J.mapping===Xr?J.image.height:null,U=g[x.type];x.precision!==null&&(p=i.getMaxPrecision(x.precision),p!==x.precision&&console.warn("THREE.WebGLProgram.getParameters:",x.precision,"not supported, using",p,"instead."));let Y=H.morphAttributes.position||H.morphAttributes.normal||H.morphAttributes.color,ne=Y!==void 0?Y.length:0,ae=0;H.morphAttributes.position!==void 0&&(ae=1),H.morphAttributes.normal!==void 0&&(ae=2),H.morphAttributes.color!==void 0&&(ae=3);let X,j,le,ge;if(U){let mt=_n[U];X=mt.vertexShader,j=mt.fragmentShader}else X=x.vertexShader,j=x.fragmentShader,l.update(x),le=l.getVertexShaderID(x),ge=l.getFragmentShaderID(x);let me=s.getRenderTarget(),Ce=K.isInstancedMesh===!0,Ae=K.isBatchedMesh===!0,Se=!!x.map,Ve=!!x.matcap,O=!!J,ht=!!x.aoMap,_e=!!x.lightMap,Ee=!!x.bumpMap,de=!!x.normalMap,Qe=!!x.displacementMap,Le=!!x.emissiveMap,w=!!x.metalnessMap,_=!!x.roughnessMap,B=x.anisotropy>0,Q=x.clearcoat>0,te=x.iridescence>0,ie=x.sheen>0,pe=x.transmission>0,oe=B&&!!x.anisotropyMap,he=Q&&!!x.clearcoatMap,be=Q&&!!x.clearcoatNormalMap,Pe=Q&&!!x.clearcoatRoughnessMap,ee=te&&!!x.iridescenceMap,$e=te&&!!x.iridescenceThicknessMap,Fe=ie&&!!x.sheenColorMap,we=ie&&!!x.sheenRoughnessMap,ye=!!x.specularMap,ue=!!x.specularColorMap,Re=!!x.specularIntensityMap,qe=pe&&!!x.transmissionMap,tt=pe&&!!x.thicknessMap,De=!!x.gradientMap,I=!!x.alphaMap,E=x.alphaTest>0,Z=!!x.alphaHash,se=!!x.extensions,fe=!!H.attributes.uv1,ve=!!H.attributes.uv2,We=!!H.attributes.uv3,Ze=Qn;return x.toneMapped&&(me===null||me.isXRRenderTarget===!0)&&(Ze=s.toneMapping),{isWebGL2:h,shaderID:U,shaderType:x.type,shaderName:x.name,vertexShader:X,fragmentShader:j,defines:x.defines,customVertexShaderID:le,customFragmentShaderID:ge,isRawShaderMaterial:x.isRawShaderMaterial===!0,glslVersion:x.glslVersion,precision:p,batching:Ae,instancing:Ce,instancingColor:Ce&&K.instanceColor!==null,supportsVertexTextures:d,outputColorSpace:me===null?s.outputColorSpace:me.isXRRenderTarget===!0?me.texture.colorSpace:Nn,map:Se,matcap:Ve,envMap:O,envMapMode:O&&J.mapping,envMapCubeUVHeight:W,aoMap:ht,lightMap:_e,bumpMap:Ee,normalMap:de,displacementMap:d&&Qe,emissiveMap:Le,normalMapObjectSpace:de&&x.normalMapType===vd,normalMapTangentSpace:de&&x.normalMapType===yd,metalnessMap:w,roughnessMap:_,anisotropy:B,anisotropyMap:oe,clearcoat:Q,clearcoatMap:he,clearcoatNormalMap:be,clearcoatRoughnessMap:Pe,iridescence:te,iridescenceMap:ee,iridescenceThicknessMap:$e,sheen:ie,sheenColorMap:Fe,sheenRoughnessMap:we,specularMap:ye,specularColorMap:ue,specularIntensityMap:Re,transmission:pe,transmissionMap:qe,thicknessMap:tt,gradientMap:De,opaque:x.transparent===!1&&x.blending===jn,alphaMap:I,alphaTest:E,alphaHash:Z,combine:x.combine,mapUv:Se&&y(x.map.channel),aoMapUv:ht&&y(x.aoMap.channel),lightMapUv:_e&&y(x.lightMap.channel),bumpMapUv:Ee&&y(x.bumpMap.channel),normalMapUv:de&&y(x.normalMap.channel),displacementMapUv:Qe&&y(x.displacementMap.channel),emissiveMapUv:Le&&y(x.emissiveMap.channel),metalnessMapUv:w&&y(x.metalnessMap.channel),roughnessMapUv:_&&y(x.roughnessMap.channel),anisotropyMapUv:oe&&y(x.anisotropyMap.channel),clearcoatMapUv:he&&y(x.clearcoatMap.channel),clearcoatNormalMapUv:be&&y(x.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Pe&&y(x.clearcoatRoughnessMap.channel),iridescenceMapUv:ee&&y(x.iridescenceMap.channel),iridescenceThicknessMapUv:$e&&y(x.iridescenceThicknessMap.channel),sheenColorMapUv:Fe&&y(x.sheenColorMap.channel),sheenRoughnessMapUv:we&&y(x.sheenRoughnessMap.channel),specularMapUv:ye&&y(x.specularMap.channel),specularColorMapUv:ue&&y(x.specularColorMap.channel),specularIntensityMapUv:Re&&y(x.specularIntensityMap.channel),transmissionMapUv:qe&&y(x.transmissionMap.channel),thicknessMapUv:tt&&y(x.thicknessMap.channel),alphaMapUv:I&&y(x.alphaMap.channel),vertexTangents:!!H.attributes.tangent&&(de||B),vertexColors:x.vertexColors,vertexAlphas:x.vertexColors===!0&&!!H.attributes.color&&H.attributes.color.itemSize===4,vertexUv1s:fe,vertexUv2s:ve,vertexUv3s:We,pointsUvs:K.isPoints===!0&&!!H.attributes.uv&&(Se||I),fog:!!P,useFog:x.fog===!0,fogExp2:P&&P.isFogExp2,flatShading:x.flatShading===!0,sizeAttenuation:x.sizeAttenuation===!0,logarithmicDepthBuffer:u,skinning:K.isSkinnedMesh===!0,morphTargets:H.morphAttributes.position!==void 0,morphNormals:H.morphAttributes.normal!==void 0,morphColors:H.morphAttributes.color!==void 0,morphTargetsCount:ne,morphTextureStride:ae,numDirLights:b.directional.length,numPointLights:b.point.length,numSpotLights:b.spot.length,numSpotLightMaps:b.spotLightMap.length,numRectAreaLights:b.rectArea.length,numHemiLights:b.hemi.length,numDirLightShadows:b.directionalShadowMap.length,numPointLightShadows:b.pointShadowMap.length,numSpotLightShadows:b.spotShadowMap.length,numSpotLightShadowsWithMaps:b.numSpotLightShadowsWithMaps,numLightProbes:b.numLightProbes,numClippingPlanes:o.numPlanes,numClipIntersection:o.numIntersection,dithering:x.dithering,shadowMapEnabled:s.shadowMap.enabled&&L.length>0,shadowMapType:s.shadowMap.type,toneMapping:Ze,useLegacyLights:s._useLegacyLights,decodeVideoTexture:Se&&x.map.isVideoTexture===!0&&je.getTransfer(x.map.colorSpace)===nt,premultipliedAlpha:x.premultipliedAlpha,doubleSided:x.side===Ot,flipSided:x.side===Xt,useDepthPacking:x.depthPacking>=0,depthPacking:x.depthPacking||0,index0AttributeName:x.index0AttributeName,extensionDerivatives:se&&x.extensions.derivatives===!0,extensionFragDepth:se&&x.extensions.fragDepth===!0,extensionDrawBuffers:se&&x.extensions.drawBuffers===!0,extensionShaderTextureLOD:se&&x.extensions.shaderTextureLOD===!0,extensionClipCullDistance:se&&x.extensions.clipCullDistance&&n.has("WEBGL_clip_cull_distance"),rendererExtensionFragDepth:h||n.has("EXT_frag_depth"),rendererExtensionDrawBuffers:h||n.has("WEBGL_draw_buffers"),rendererExtensionShaderTextureLod:h||n.has("EXT_shader_texture_lod"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:x.customProgramCacheKey()}}function f(x){let b=[];if(x.shaderID?b.push(x.shaderID):(b.push(x.customVertexShaderID),b.push(x.customFragmentShaderID)),x.defines!==void 0)for(let L in x.defines)b.push(L),b.push(x.defines[L]);return x.isRawShaderMaterial===!1&&(S(b,x),v(b,x),b.push(s.outputColorSpace)),b.push(x.customProgramCacheKey),b.join()}function S(x,b){x.push(b.precision),x.push(b.outputColorSpace),x.push(b.envMapMode),x.push(b.envMapCubeUVHeight),x.push(b.mapUv),x.push(b.alphaMapUv),x.push(b.lightMapUv),x.push(b.aoMapUv),x.push(b.bumpMapUv),x.push(b.normalMapUv),x.push(b.displacementMapUv),x.push(b.emissiveMapUv),x.push(b.metalnessMapUv),x.push(b.roughnessMapUv),x.push(b.anisotropyMapUv),x.push(b.clearcoatMapUv),x.push(b.clearcoatNormalMapUv),x.push(b.clearcoatRoughnessMapUv),x.push(b.iridescenceMapUv),x.push(b.iridescenceThicknessMapUv),x.push(b.sheenColorMapUv),x.push(b.sheenRoughnessMapUv),x.push(b.specularMapUv),x.push(b.specularColorMapUv),x.push(b.specularIntensityMapUv),x.push(b.transmissionMapUv),x.push(b.thicknessMapUv),x.push(b.combine),x.push(b.fogExp2),x.push(b.sizeAttenuation),x.push(b.morphTargetsCount),x.push(b.morphAttributeCount),x.push(b.numDirLights),x.push(b.numPointLights),x.push(b.numSpotLights),x.push(b.numSpotLightMaps),x.push(b.numHemiLights),x.push(b.numRectAreaLights),x.push(b.numDirLightShadows),x.push(b.numPointLightShadows),x.push(b.numSpotLightShadows),x.push(b.numSpotLightShadowsWithMaps),x.push(b.numLightProbes),x.push(b.shadowMapType),x.push(b.toneMapping),x.push(b.numClippingPlanes),x.push(b.numClipIntersection),x.push(b.depthPacking)}function v(x,b){a.disableAll(),b.isWebGL2&&a.enable(0),b.supportsVertexTextures&&a.enable(1),b.instancing&&a.enable(2),b.instancingColor&&a.enable(3),b.matcap&&a.enable(4),b.envMap&&a.enable(5),b.normalMapObjectSpace&&a.enable(6),b.normalMapTangentSpace&&a.enable(7),b.clearcoat&&a.enable(8),b.iridescence&&a.enable(9),b.alphaTest&&a.enable(10),b.vertexColors&&a.enable(11),b.vertexAlphas&&a.enable(12),b.vertexUv1s&&a.enable(13),b.vertexUv2s&&a.enable(14),b.vertexUv3s&&a.enable(15),b.vertexTangents&&a.enable(16),b.anisotropy&&a.enable(17),b.alphaHash&&a.enable(18),b.batching&&a.enable(19),x.push(a.mask),a.disableAll(),b.fog&&a.enable(0),b.useFog&&a.enable(1),b.flatShading&&a.enable(2),b.logarithmicDepthBuffer&&a.enable(3),b.skinning&&a.enable(4),b.morphTargets&&a.enable(5),b.morphNormals&&a.enable(6),b.morphColors&&a.enable(7),b.premultipliedAlpha&&a.enable(8),b.shadowMapEnabled&&a.enable(9),b.useLegacyLights&&a.enable(10),b.doubleSided&&a.enable(11),b.flipSided&&a.enable(12),b.useDepthPacking&&a.enable(13),b.dithering&&a.enable(14),b.transmission&&a.enable(15),b.sheen&&a.enable(16),b.opaque&&a.enable(17),b.pointsUvs&&a.enable(18),b.decodeVideoTexture&&a.enable(19),x.push(a.mask)}function T(x){let b=g[x.type],L;if(b){let N=_n[b];L=Gd.clone(N.uniforms)}else L=x.uniforms;return L}function R(x,b){let L;for(let N=0,K=c.length;N<K;N++){let P=c[N];if(P.cacheKey===b){L=P,++L.usedTimes;break}}return L===void 0&&(L=new Qg(s,b,x,r),c.push(L)),L}function C(x){if(--x.usedTimes===0){let b=c.indexOf(x);c[b]=c[c.length-1],c.pop(),x.destroy()}}function A(x){l.remove(x)}function $(){l.dispose()}return{getParameters:m,getProgramCacheKey:f,getUniforms:T,acquireProgram:R,releaseProgram:C,releaseShaderCache:A,programs:c,dispose:$}}function ny(){let s=new WeakMap;function e(r){let o=s.get(r);return o===void 0&&(o={},s.set(r,o)),o}function t(r){s.delete(r)}function n(r,o,a){s.get(r)[o]=a}function i(){s=new WeakMap}return{get:e,remove:t,update:n,dispose:i}}function iy(s,e){return s.groupOrder!==e.groupOrder?s.groupOrder-e.groupOrder:s.renderOrder!==e.renderOrder?s.renderOrder-e.renderOrder:s.material.id!==e.material.id?s.material.id-e.material.id:s.z!==e.z?s.z-e.z:s.id-e.id}function Gc(s,e){return s.groupOrder!==e.groupOrder?s.groupOrder-e.groupOrder:s.renderOrder!==e.renderOrder?s.renderOrder-e.renderOrder:s.z!==e.z?e.z-s.z:s.id-e.id}function Wc(){let s=[],e=0,t=[],n=[],i=[];function r(){e=0,t.length=0,n.length=0,i.length=0}function o(u,d,p,g,y,m){let f=s[e];return f===void 0?(f={id:u.id,object:u,geometry:d,material:p,groupOrder:g,renderOrder:u.renderOrder,z:y,group:m},s[e]=f):(f.id=u.id,f.object=u,f.geometry=d,f.material=p,f.groupOrder=g,f.renderOrder=u.renderOrder,f.z=y,f.group=m),e++,f}function a(u,d,p,g,y,m){let f=o(u,d,p,g,y,m);p.transmission>0?n.push(f):p.transparent===!0?i.push(f):t.push(f)}function l(u,d,p,g,y,m){let f=o(u,d,p,g,y,m);p.transmission>0?n.unshift(f):p.transparent===!0?i.unshift(f):t.unshift(f)}function c(u,d){t.length>1&&t.sort(u||iy),n.length>1&&n.sort(d||Gc),i.length>1&&i.sort(d||Gc)}function h(){for(let u=e,d=s.length;u<d;u++){let p=s[u];if(p.id===null)break;p.id=null,p.object=null,p.geometry=null,p.material=null,p.group=null}}return{opaque:t,transmissive:n,transparent:i,init:r,push:a,unshift:l,finish:h,sort:c}}function sy(){let s=new WeakMap;function e(n,i){let r=s.get(n),o;return r===void 0?(o=new Wc,s.set(n,[o])):i>=r.length?(o=new Wc,r.push(o)):o=r[i],o}function t(){s=new WeakMap}return{get:e,dispose:t}}function ry(){let s={};return{get:function(e){if(s[e.id]!==void 0)return s[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new k,color:new Ge};break;case"SpotLight":t={position:new k,direction:new k,color:new Ge,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new k,color:new Ge,distance:0,decay:0};break;case"HemisphereLight":t={direction:new k,skyColor:new Ge,groundColor:new Ge};break;case"RectAreaLight":t={color:new Ge,position:new k,halfWidth:new k,halfHeight:new k};break}return s[e.id]=t,t}}}function ay(){let s={};return{get:function(e){if(s[e.id]!==void 0)return s[e.id];let t;switch(e.type){case"DirectionalLight":t={shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ue};break;case"SpotLight":t={shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ue};break;case"PointLight":t={shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ue,shadowCameraNear:1,shadowCameraFar:1e3};break}return s[e.id]=t,t}}}var oy=0;function ly(s,e){return(e.castShadow?2:0)-(s.castShadow?2:0)+(e.map?1:0)-(s.map?1:0)}function cy(s,e){let t=new ry,n=ay(),i={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let h=0;h<9;h++)i.probe.push(new k);let r=new k,o=new Pt,a=new Pt;function l(h,u){let d=0,p=0,g=0;for(let N=0;N<9;N++)i.probe[N].set(0,0,0);let y=0,m=0,f=0,S=0,v=0,T=0,R=0,C=0,A=0,$=0,x=0;h.sort(ly);let b=u===!0?Math.PI:1;for(let N=0,K=h.length;N<K;N++){let P=h[N],H=P.color,q=P.intensity,J=P.distance,W=P.shadow&&P.shadow.map?P.shadow.map.texture:null;if(P.isAmbientLight)d+=H.r*q*b,p+=H.g*q*b,g+=H.b*q*b;else if(P.isLightProbe){for(let U=0;U<9;U++)i.probe[U].addScaledVector(P.sh.coefficients[U],q);x++}else if(P.isDirectionalLight){let U=t.get(P);if(U.color.copy(P.color).multiplyScalar(P.intensity*b),P.castShadow){let Y=P.shadow,ne=n.get(P);ne.shadowBias=Y.bias,ne.shadowNormalBias=Y.normalBias,ne.shadowRadius=Y.radius,ne.shadowMapSize=Y.mapSize,i.directionalShadow[y]=ne,i.directionalShadowMap[y]=W,i.directionalShadowMatrix[y]=P.shadow.matrix,T++}i.directional[y]=U,y++}else if(P.isSpotLight){let U=t.get(P);U.position.setFromMatrixPosition(P.matrixWorld),U.color.copy(H).multiplyScalar(q*b),U.distance=J,U.coneCos=Math.cos(P.angle),U.penumbraCos=Math.cos(P.angle*(1-P.penumbra)),U.decay=P.decay,i.spot[f]=U;let Y=P.shadow;if(P.map&&(i.spotLightMap[A]=P.map,A++,Y.updateMatrices(P),P.castShadow&&$++),i.spotLightMatrix[f]=Y.matrix,P.castShadow){let ne=n.get(P);ne.shadowBias=Y.bias,ne.shadowNormalBias=Y.normalBias,ne.shadowRadius=Y.radius,ne.shadowMapSize=Y.mapSize,i.spotShadow[f]=ne,i.spotShadowMap[f]=W,C++}f++}else if(P.isRectAreaLight){let U=t.get(P);U.color.copy(H).multiplyScalar(q),U.halfWidth.set(P.width*.5,0,0),U.halfHeight.set(0,P.height*.5,0),i.rectArea[S]=U,S++}else if(P.isPointLight){let U=t.get(P);if(U.color.copy(P.color).multiplyScalar(P.intensity*b),U.distance=P.distance,U.decay=P.decay,P.castShadow){let Y=P.shadow,ne=n.get(P);ne.shadowBias=Y.bias,ne.shadowNormalBias=Y.normalBias,ne.shadowRadius=Y.radius,ne.shadowMapSize=Y.mapSize,ne.shadowCameraNear=Y.camera.near,ne.shadowCameraFar=Y.camera.far,i.pointShadow[m]=ne,i.pointShadowMap[m]=W,i.pointShadowMatrix[m]=P.shadow.matrix,R++}i.point[m]=U,m++}else if(P.isHemisphereLight){let U=t.get(P);U.skyColor.copy(P.color).multiplyScalar(q*b),U.groundColor.copy(P.groundColor).multiplyScalar(q*b),i.hemi[v]=U,v++}}S>0&&(e.isWebGL2?s.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=re.LTC_FLOAT_1,i.rectAreaLTC2=re.LTC_FLOAT_2):(i.rectAreaLTC1=re.LTC_HALF_1,i.rectAreaLTC2=re.LTC_HALF_2):s.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=re.LTC_FLOAT_1,i.rectAreaLTC2=re.LTC_FLOAT_2):s.has("OES_texture_half_float_linear")===!0?(i.rectAreaLTC1=re.LTC_HALF_1,i.rectAreaLTC2=re.LTC_HALF_2):console.error("THREE.WebGLRenderer: Unable to use RectAreaLight. Missing WebGL extensions.")),i.ambient[0]=d,i.ambient[1]=p,i.ambient[2]=g;let L=i.hash;(L.directionalLength!==y||L.pointLength!==m||L.spotLength!==f||L.rectAreaLength!==S||L.hemiLength!==v||L.numDirectionalShadows!==T||L.numPointShadows!==R||L.numSpotShadows!==C||L.numSpotMaps!==A||L.numLightProbes!==x)&&(i.directional.length=y,i.spot.length=f,i.rectArea.length=S,i.point.length=m,i.hemi.length=v,i.directionalShadow.length=T,i.directionalShadowMap.length=T,i.pointShadow.length=R,i.pointShadowMap.length=R,i.spotShadow.length=C,i.spotShadowMap.length=C,i.directionalShadowMatrix.length=T,i.pointShadowMatrix.length=R,i.spotLightMatrix.length=C+A-$,i.spotLightMap.length=A,i.numSpotLightShadowsWithMaps=$,i.numLightProbes=x,L.directionalLength=y,L.pointLength=m,L.spotLength=f,L.rectAreaLength=S,L.hemiLength=v,L.numDirectionalShadows=T,L.numPointShadows=R,L.numSpotShadows=C,L.numSpotMaps=A,L.numLightProbes=x,i.version=oy++)}function c(h,u){let d=0,p=0,g=0,y=0,m=0,f=u.matrixWorldInverse;for(let S=0,v=h.length;S<v;S++){let T=h[S];if(T.isDirectionalLight){let R=i.directional[d];R.direction.setFromMatrixPosition(T.matrixWorld),r.setFromMatrixPosition(T.target.matrixWorld),R.direction.sub(r),R.direction.transformDirection(f),d++}else if(T.isSpotLight){let R=i.spot[g];R.position.setFromMatrixPosition(T.matrixWorld),R.position.applyMatrix4(f),R.direction.setFromMatrixPosition(T.matrixWorld),r.setFromMatrixPosition(T.target.matrixWorld),R.direction.sub(r),R.direction.transformDirection(f),g++}else if(T.isRectAreaLight){let R=i.rectArea[y];R.position.setFromMatrixPosition(T.matrixWorld),R.position.applyMatrix4(f),a.identity(),o.copy(T.matrixWorld),o.premultiply(f),a.extractRotation(o),R.halfWidth.set(T.width*.5,0,0),R.halfHeight.set(0,T.height*.5,0),R.halfWidth.applyMatrix4(a),R.halfHeight.applyMatrix4(a),y++}else if(T.isPointLight){let R=i.point[p];R.position.setFromMatrixPosition(T.matrixWorld),R.position.applyMatrix4(f),p++}else if(T.isHemisphereLight){let R=i.hemi[m];R.direction.setFromMatrixPosition(T.matrixWorld),R.direction.transformDirection(f),m++}}}return{setup:l,setupView:c,state:i}}function Xc(s,e){let t=new cy(s,e),n=[],i=[];function r(){n.length=0,i.length=0}function o(u){n.push(u)}function a(u){i.push(u)}function l(u){t.setup(n,u)}function c(u){t.setupView(n,u)}return{init:r,state:{lightsArray:n,shadowsArray:i,lights:t},setupLights:l,setupLightsView:c,pushLight:o,pushShadow:a}}function hy(s,e){let t=new WeakMap;function n(r,o=0){let a=t.get(r),l;return a===void 0?(l=new Xc(s,e),t.set(r,[l])):o>=a.length?(l=new Xc(s,e),a.push(l)):l=a[o],l}function i(){t=new WeakMap}return{get:n,dispose:i}}var bo=class extends Si{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=md,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},So=class extends Si{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}},uy=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,dy=`uniform sampler2D shadow_pass;
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
}`;function fy(s,e,t){let n=new Br,i=new Ue,r=new Ue,o=new Rt,a=new bo({depthPacking:gd}),l=new So,c={},h=t.maxTextureSize,u={[ni]:Xt,[Xt]:ni,[Ot]:Ot},d=new Bn({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Ue},radius:{value:4}},vertexShader:uy,fragmentShader:dy}),p=d.clone();p.defines.HORIZONTAL_PASS=1;let g=new si;g.setAttribute("position",new Qt(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let y=new ct(g,d),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Zc;let f=this.type;this.render=function(C,A,$){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||C.length===0)return;let x=s.getRenderTarget(),b=s.getActiveCubeFace(),L=s.getActiveMipmapLevel(),N=s.state;N.setBlending(Kn),N.buffers.color.setClear(1,1,1,1),N.buffers.depth.setTest(!0),N.setScissorTest(!1);let K=f!==Ln&&this.type===Ln,P=f===Ln&&this.type!==Ln;for(let H=0,q=C.length;H<q;H++){let J=C[H],W=J.shadow;if(W===void 0){console.warn("THREE.WebGLShadowMap:",J,"has no shadow.");continue}if(W.autoUpdate===!1&&W.needsUpdate===!1)continue;i.copy(W.mapSize);let U=W.getFrameExtents();if(i.multiply(U),r.copy(W.mapSize),(i.x>h||i.y>h)&&(i.x>h&&(r.x=Math.floor(h/U.x),i.x=r.x*U.x,W.mapSize.x=r.x),i.y>h&&(r.y=Math.floor(h/U.y),i.y=r.y*U.y,W.mapSize.y=r.y)),W.map===null||K===!0||P===!0){let ne=this.type!==Ln?{minFilter:Nt,magFilter:Nt}:{};W.map!==null&&W.map.dispose(),W.map=new On(i.x,i.y,ne),W.map.texture.name=J.name+".shadowMap",W.camera.updateProjectionMatrix()}s.setRenderTarget(W.map),s.clear();let Y=W.getViewportCount();for(let ne=0;ne<Y;ne++){let ae=W.getViewport(ne);o.set(r.x*ae.x,r.y*ae.y,r.x*ae.z,r.y*ae.w),N.viewport(o),W.updateMatrices(J,ne),n=W.getFrustum(),T(A,$,W.camera,J,this.type)}W.isPointLightShadow!==!0&&this.type===Ln&&S(W,$),W.needsUpdate=!1}f=this.type,m.needsUpdate=!1,s.setRenderTarget(x,b,L)};function S(C,A){let $=e.update(y);d.defines.VSM_SAMPLES!==C.blurSamples&&(d.defines.VSM_SAMPLES=C.blurSamples,p.defines.VSM_SAMPLES=C.blurSamples,d.needsUpdate=!0,p.needsUpdate=!0),C.mapPass===null&&(C.mapPass=new On(i.x,i.y)),d.uniforms.shadow_pass.value=C.map.texture,d.uniforms.resolution.value=C.mapSize,d.uniforms.radius.value=C.radius,s.setRenderTarget(C.mapPass),s.clear(),s.renderBufferDirect(A,null,$,d,y,null),p.uniforms.shadow_pass.value=C.mapPass.texture,p.uniforms.resolution.value=C.mapSize,p.uniforms.radius.value=C.radius,s.setRenderTarget(C.map),s.clear(),s.renderBufferDirect(A,null,$,p,y,null)}function v(C,A,$,x){let b=null,L=$.isPointLight===!0?C.customDistanceMaterial:C.customDepthMaterial;if(L!==void 0)b=L;else if(b=$.isPointLight===!0?l:a,s.localClippingEnabled&&A.clipShadows===!0&&Array.isArray(A.clippingPlanes)&&A.clippingPlanes.length!==0||A.displacementMap&&A.displacementScale!==0||A.alphaMap&&A.alphaTest>0||A.map&&A.alphaTest>0){let N=b.uuid,K=A.uuid,P=c[N];P===void 0&&(P={},c[N]=P);let H=P[K];H===void 0&&(H=b.clone(),P[K]=H,A.addEventListener("dispose",R)),b=H}if(b.visible=A.visible,b.wireframe=A.wireframe,x===Ln?b.side=A.shadowSide!==null?A.shadowSide:A.side:b.side=A.shadowSide!==null?A.shadowSide:u[A.side],b.alphaMap=A.alphaMap,b.alphaTest=A.alphaTest,b.map=A.map,b.clipShadows=A.clipShadows,b.clippingPlanes=A.clippingPlanes,b.clipIntersection=A.clipIntersection,b.displacementMap=A.displacementMap,b.displacementScale=A.displacementScale,b.displacementBias=A.displacementBias,b.wireframeLinewidth=A.wireframeLinewidth,b.linewidth=A.linewidth,$.isPointLight===!0&&b.isMeshDistanceMaterial===!0){let N=s.properties.get(b);N.light=$}return b}function T(C,A,$,x,b){if(C.visible===!1)return;if(C.layers.test(A.layers)&&(C.isMesh||C.isLine||C.isPoints)&&(C.castShadow||C.receiveShadow&&b===Ln)&&(!C.frustumCulled||n.intersectsObject(C))){C.modelViewMatrix.multiplyMatrices($.matrixWorldInverse,C.matrixWorld);let K=e.update(C),P=C.material;if(Array.isArray(P)){let H=K.groups;for(let q=0,J=H.length;q<J;q++){let W=H[q],U=P[W.materialIndex];if(U&&U.visible){let Y=v(C,U,x,b);C.onBeforeShadow(s,C,A,$,K,Y,W),s.renderBufferDirect($,null,K,Y,C,W),C.onAfterShadow(s,C,A,$,K,Y,W)}}}else if(P.visible){let H=v(C,P,x,b);C.onBeforeShadow(s,C,A,$,K,H,null),s.renderBufferDirect($,null,K,H,C,null),C.onAfterShadow(s,C,A,$,K,H,null)}}let N=C.children;for(let K=0,P=N.length;K<P;K++)T(N[K],A,$,x,b)}function R(C){C.target.removeEventListener("dispose",R);for(let $ in c){let x=c[$],b=C.target.uuid;b in x&&(x[b].dispose(),delete x[b])}}}function py(s,e,t){let n=t.isWebGL2;function i(){let E=!1,Z=new Rt,se=null,fe=new Rt(0,0,0,0);return{setMask:function(ve){se!==ve&&!E&&(s.colorMask(ve,ve,ve,ve),se=ve)},setLocked:function(ve){E=ve},setClear:function(ve,We,Ze,ot,mt){mt===!0&&(ve*=ot,We*=ot,Ze*=ot),Z.set(ve,We,Ze,ot),fe.equals(Z)===!1&&(s.clearColor(ve,We,Ze,ot),fe.copy(Z))},reset:function(){E=!1,se=null,fe.set(-1,0,0,0)}}}function r(){let E=!1,Z=null,se=null,fe=null;return{setTest:function(ve){ve?Ae(s.DEPTH_TEST):Se(s.DEPTH_TEST)},setMask:function(ve){Z!==ve&&!E&&(s.depthMask(ve),Z=ve)},setFunc:function(ve){if(se!==ve){switch(ve){case Xu:s.depthFunc(s.NEVER);break;case $u:s.depthFunc(s.ALWAYS);break;case qu:s.depthFunc(s.LESS);break;case Mr:s.depthFunc(s.LEQUAL);break;case Yu:s.depthFunc(s.EQUAL);break;case Zu:s.depthFunc(s.GEQUAL);break;case Ju:s.depthFunc(s.GREATER);break;case Ku:s.depthFunc(s.NOTEQUAL);break;default:s.depthFunc(s.LEQUAL)}se=ve}},setLocked:function(ve){E=ve},setClear:function(ve){fe!==ve&&(s.clearDepth(ve),fe=ve)},reset:function(){E=!1,Z=null,se=null,fe=null}}}function o(){let E=!1,Z=null,se=null,fe=null,ve=null,We=null,Ze=null,ot=null,mt=null;return{setTest:function(Je){E||(Je?Ae(s.STENCIL_TEST):Se(s.STENCIL_TEST))},setMask:function(Je){Z!==Je&&!E&&(s.stencilMask(Je),Z=Je)},setFunc:function(Je,At,kt){(se!==Je||fe!==At||ve!==kt)&&(s.stencilFunc(Je,At,kt),se=Je,fe=At,ve=kt)},setOp:function(Je,At,kt){(We!==Je||Ze!==At||ot!==kt)&&(s.stencilOp(Je,At,kt),We=Je,Ze=At,ot=kt)},setLocked:function(Je){E=Je},setClear:function(Je){mt!==Je&&(s.clearStencil(Je),mt=Je)},reset:function(){E=!1,Z=null,se=null,fe=null,ve=null,We=null,Ze=null,ot=null,mt=null}}}let a=new i,l=new r,c=new o,h=new WeakMap,u=new WeakMap,d={},p={},g=new WeakMap,y=[],m=null,f=!1,S=null,v=null,T=null,R=null,C=null,A=null,$=null,x=new Ge(0,0,0),b=0,L=!1,N=null,K=null,P=null,H=null,q=null,J=s.getParameter(s.MAX_COMBINED_TEXTURE_IMAGE_UNITS),W=!1,U=0,Y=s.getParameter(s.VERSION);Y.indexOf("WebGL")!==-1?(U=parseFloat(/^WebGL (\d)/.exec(Y)[1]),W=U>=1):Y.indexOf("OpenGL ES")!==-1&&(U=parseFloat(/^OpenGL ES (\d)/.exec(Y)[1]),W=U>=2);let ne=null,ae={},X=s.getParameter(s.SCISSOR_BOX),j=s.getParameter(s.VIEWPORT),le=new Rt().fromArray(X),ge=new Rt().fromArray(j);function me(E,Z,se,fe){let ve=new Uint8Array(4),We=s.createTexture();s.bindTexture(E,We),s.texParameteri(E,s.TEXTURE_MIN_FILTER,s.NEAREST),s.texParameteri(E,s.TEXTURE_MAG_FILTER,s.NEAREST);for(let Ze=0;Ze<se;Ze++)n&&(E===s.TEXTURE_3D||E===s.TEXTURE_2D_ARRAY)?s.texImage3D(Z,0,s.RGBA,1,1,fe,0,s.RGBA,s.UNSIGNED_BYTE,ve):s.texImage2D(Z+Ze,0,s.RGBA,1,1,0,s.RGBA,s.UNSIGNED_BYTE,ve);return We}let Ce={};Ce[s.TEXTURE_2D]=me(s.TEXTURE_2D,s.TEXTURE_2D,1),Ce[s.TEXTURE_CUBE_MAP]=me(s.TEXTURE_CUBE_MAP,s.TEXTURE_CUBE_MAP_POSITIVE_X,6),n&&(Ce[s.TEXTURE_2D_ARRAY]=me(s.TEXTURE_2D_ARRAY,s.TEXTURE_2D_ARRAY,1,1),Ce[s.TEXTURE_3D]=me(s.TEXTURE_3D,s.TEXTURE_3D,1,1)),a.setClear(0,0,0,1),l.setClear(1),c.setClear(0),Ae(s.DEPTH_TEST),l.setFunc(Mr),Le(!1),w(Tl),Ae(s.CULL_FACE),de(Kn);function Ae(E){d[E]!==!0&&(s.enable(E),d[E]=!0)}function Se(E){d[E]!==!1&&(s.disable(E),d[E]=!1)}function Ve(E,Z){return p[E]!==Z?(s.bindFramebuffer(E,Z),p[E]=Z,n&&(E===s.DRAW_FRAMEBUFFER&&(p[s.FRAMEBUFFER]=Z),E===s.FRAMEBUFFER&&(p[s.DRAW_FRAMEBUFFER]=Z)),!0):!1}function O(E,Z){let se=y,fe=!1;if(E)if(se=g.get(Z),se===void 0&&(se=[],g.set(Z,se)),E.isWebGLMultipleRenderTargets){let ve=E.texture;if(se.length!==ve.length||se[0]!==s.COLOR_ATTACHMENT0){for(let We=0,Ze=ve.length;We<Ze;We++)se[We]=s.COLOR_ATTACHMENT0+We;se.length=ve.length,fe=!0}}else se[0]!==s.COLOR_ATTACHMENT0&&(se[0]=s.COLOR_ATTACHMENT0,fe=!0);else se[0]!==s.BACK&&(se[0]=s.BACK,fe=!0);fe&&(t.isWebGL2?s.drawBuffers(se):e.get("WEBGL_draw_buffers").drawBuffersWEBGL(se))}function ht(E){return m!==E?(s.useProgram(E),m=E,!0):!1}let _e={[pi]:s.FUNC_ADD,[Pu]:s.FUNC_SUBTRACT,[Iu]:s.FUNC_REVERSE_SUBTRACT};if(n)_e[Rl]=s.MIN,_e[Pl]=s.MAX;else{let E=e.get("EXT_blend_minmax");E!==null&&(_e[Rl]=E.MIN_EXT,_e[Pl]=E.MAX_EXT)}let Ee={[Lu]:s.ZERO,[Du]:s.ONE,[ku]:s.SRC_COLOR,[eo]:s.SRC_ALPHA,[Hu]:s.SRC_ALPHA_SATURATE,[Ou]:s.DST_COLOR,[Fu]:s.DST_ALPHA,[Uu]:s.ONE_MINUS_SRC_COLOR,[to]:s.ONE_MINUS_SRC_ALPHA,[Bu]:s.ONE_MINUS_DST_COLOR,[Nu]:s.ONE_MINUS_DST_ALPHA,[zu]:s.CONSTANT_COLOR,[Vu]:s.ONE_MINUS_CONSTANT_COLOR,[Gu]:s.CONSTANT_ALPHA,[Wu]:s.ONE_MINUS_CONSTANT_ALPHA};function de(E,Z,se,fe,ve,We,Ze,ot,mt,Je){if(E===Kn){f===!0&&(Se(s.BLEND),f=!1);return}if(f===!1&&(Ae(s.BLEND),f=!0),E!==Ru){if(E!==S||Je!==L){if((v!==pi||C!==pi)&&(s.blendEquation(s.FUNC_ADD),v=pi,C=pi),Je)switch(E){case jn:s.blendFuncSeparate(s.ONE,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case _i:s.blendFunc(s.ONE,s.ONE);break;case Al:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case Cl:s.blendFuncSeparate(s.ZERO,s.SRC_COLOR,s.ZERO,s.SRC_ALPHA);break;default:console.error("THREE.WebGLState: Invalid blending: ",E);break}else switch(E){case jn:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case _i:s.blendFunc(s.SRC_ALPHA,s.ONE);break;case Al:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case Cl:s.blendFunc(s.ZERO,s.SRC_COLOR);break;default:console.error("THREE.WebGLState: Invalid blending: ",E);break}T=null,R=null,A=null,$=null,x.set(0,0,0),b=0,S=E,L=Je}return}ve=ve||Z,We=We||se,Ze=Ze||fe,(Z!==v||ve!==C)&&(s.blendEquationSeparate(_e[Z],_e[ve]),v=Z,C=ve),(se!==T||fe!==R||We!==A||Ze!==$)&&(s.blendFuncSeparate(Ee[se],Ee[fe],Ee[We],Ee[Ze]),T=se,R=fe,A=We,$=Ze),(ot.equals(x)===!1||mt!==b)&&(s.blendColor(ot.r,ot.g,ot.b,mt),x.copy(ot),b=mt),S=E,L=!1}function Qe(E,Z){E.side===Ot?Se(s.CULL_FACE):Ae(s.CULL_FACE);let se=E.side===Xt;Z&&(se=!se),Le(se),E.blending===jn&&E.transparent===!1?de(Kn):de(E.blending,E.blendEquation,E.blendSrc,E.blendDst,E.blendEquationAlpha,E.blendSrcAlpha,E.blendDstAlpha,E.blendColor,E.blendAlpha,E.premultipliedAlpha),l.setFunc(E.depthFunc),l.setTest(E.depthTest),l.setMask(E.depthWrite),a.setMask(E.colorWrite);let fe=E.stencilWrite;c.setTest(fe),fe&&(c.setMask(E.stencilWriteMask),c.setFunc(E.stencilFunc,E.stencilRef,E.stencilFuncMask),c.setOp(E.stencilFail,E.stencilZFail,E.stencilZPass)),B(E.polygonOffset,E.polygonOffsetFactor,E.polygonOffsetUnits),E.alphaToCoverage===!0?Ae(s.SAMPLE_ALPHA_TO_COVERAGE):Se(s.SAMPLE_ALPHA_TO_COVERAGE)}function Le(E){N!==E&&(E?s.frontFace(s.CW):s.frontFace(s.CCW),N=E)}function w(E){E!==Tu?(Ae(s.CULL_FACE),E!==K&&(E===Tl?s.cullFace(s.BACK):E===Au?s.cullFace(s.FRONT):s.cullFace(s.FRONT_AND_BACK))):Se(s.CULL_FACE),K=E}function _(E){E!==P&&(W&&s.lineWidth(E),P=E)}function B(E,Z,se){E?(Ae(s.POLYGON_OFFSET_FILL),(H!==Z||q!==se)&&(s.polygonOffset(Z,se),H=Z,q=se)):Se(s.POLYGON_OFFSET_FILL)}function Q(E){E?Ae(s.SCISSOR_TEST):Se(s.SCISSOR_TEST)}function te(E){E===void 0&&(E=s.TEXTURE0+J-1),ne!==E&&(s.activeTexture(E),ne=E)}function ie(E,Z,se){se===void 0&&(ne===null?se=s.TEXTURE0+J-1:se=ne);let fe=ae[se];fe===void 0&&(fe={type:void 0,texture:void 0},ae[se]=fe),(fe.type!==E||fe.texture!==Z)&&(ne!==se&&(s.activeTexture(se),ne=se),s.bindTexture(E,Z||Ce[E]),fe.type=E,fe.texture=Z)}function pe(){let E=ae[ne];E!==void 0&&E.type!==void 0&&(s.bindTexture(E.type,null),E.type=void 0,E.texture=void 0)}function oe(){try{s.compressedTexImage2D.apply(s,arguments)}catch(E){console.error("THREE.WebGLState:",E)}}function he(){try{s.compressedTexImage3D.apply(s,arguments)}catch(E){console.error("THREE.WebGLState:",E)}}function be(){try{s.texSubImage2D.apply(s,arguments)}catch(E){console.error("THREE.WebGLState:",E)}}function Pe(){try{s.texSubImage3D.apply(s,arguments)}catch(E){console.error("THREE.WebGLState:",E)}}function ee(){try{s.compressedTexSubImage2D.apply(s,arguments)}catch(E){console.error("THREE.WebGLState:",E)}}function $e(){try{s.compressedTexSubImage3D.apply(s,arguments)}catch(E){console.error("THREE.WebGLState:",E)}}function Fe(){try{s.texStorage2D.apply(s,arguments)}catch(E){console.error("THREE.WebGLState:",E)}}function we(){try{s.texStorage3D.apply(s,arguments)}catch(E){console.error("THREE.WebGLState:",E)}}function ye(){try{s.texImage2D.apply(s,arguments)}catch(E){console.error("THREE.WebGLState:",E)}}function ue(){try{s.texImage3D.apply(s,arguments)}catch(E){console.error("THREE.WebGLState:",E)}}function Re(E){le.equals(E)===!1&&(s.scissor(E.x,E.y,E.z,E.w),le.copy(E))}function qe(E){ge.equals(E)===!1&&(s.viewport(E.x,E.y,E.z,E.w),ge.copy(E))}function tt(E,Z){let se=u.get(Z);se===void 0&&(se=new WeakMap,u.set(Z,se));let fe=se.get(E);fe===void 0&&(fe=s.getUniformBlockIndex(Z,E.name),se.set(E,fe))}function De(E,Z){let fe=u.get(Z).get(E);h.get(Z)!==fe&&(s.uniformBlockBinding(Z,fe,E.__bindingPointIndex),h.set(Z,fe))}function I(){s.disable(s.BLEND),s.disable(s.CULL_FACE),s.disable(s.DEPTH_TEST),s.disable(s.POLYGON_OFFSET_FILL),s.disable(s.SCISSOR_TEST),s.disable(s.STENCIL_TEST),s.disable(s.SAMPLE_ALPHA_TO_COVERAGE),s.blendEquation(s.FUNC_ADD),s.blendFunc(s.ONE,s.ZERO),s.blendFuncSeparate(s.ONE,s.ZERO,s.ONE,s.ZERO),s.blendColor(0,0,0,0),s.colorMask(!0,!0,!0,!0),s.clearColor(0,0,0,0),s.depthMask(!0),s.depthFunc(s.LESS),s.clearDepth(1),s.stencilMask(4294967295),s.stencilFunc(s.ALWAYS,0,4294967295),s.stencilOp(s.KEEP,s.KEEP,s.KEEP),s.clearStencil(0),s.cullFace(s.BACK),s.frontFace(s.CCW),s.polygonOffset(0,0),s.activeTexture(s.TEXTURE0),s.bindFramebuffer(s.FRAMEBUFFER,null),n===!0&&(s.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),s.bindFramebuffer(s.READ_FRAMEBUFFER,null)),s.useProgram(null),s.lineWidth(1),s.scissor(0,0,s.canvas.width,s.canvas.height),s.viewport(0,0,s.canvas.width,s.canvas.height),d={},ne=null,ae={},p={},g=new WeakMap,y=[],m=null,f=!1,S=null,v=null,T=null,R=null,C=null,A=null,$=null,x=new Ge(0,0,0),b=0,L=!1,N=null,K=null,P=null,H=null,q=null,le.set(0,0,s.canvas.width,s.canvas.height),ge.set(0,0,s.canvas.width,s.canvas.height),a.reset(),l.reset(),c.reset()}return{buffers:{color:a,depth:l,stencil:c},enable:Ae,disable:Se,bindFramebuffer:Ve,drawBuffers:O,useProgram:ht,setBlending:de,setMaterial:Qe,setFlipSided:Le,setCullFace:w,setLineWidth:_,setPolygonOffset:B,setScissorTest:Q,activeTexture:te,bindTexture:ie,unbindTexture:pe,compressedTexImage2D:oe,compressedTexImage3D:he,texImage2D:ye,texImage3D:ue,updateUBOMapping:tt,uniformBlockBinding:De,texStorage2D:Fe,texStorage3D:we,texSubImage2D:be,texSubImage3D:Pe,compressedTexSubImage2D:ee,compressedTexSubImage3D:$e,scissor:Re,viewport:qe,reset:I}}function my(s,e,t,n,i,r,o){let a=i.isWebGL2,l=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,c=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),h=new WeakMap,u,d=new WeakMap,p=!1;try{p=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(w,_){return p?new OffscreenCanvas(w,_):Pr("canvas")}function y(w,_,B,Q){let te=1;if((w.width>Q||w.height>Q)&&(te=Q/Math.max(w.width,w.height)),te<1||_===!0)if(typeof HTMLImageElement<"u"&&w instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&w instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&w instanceof ImageBitmap){let ie=_?lo:Math.floor,pe=ie(te*w.width),oe=ie(te*w.height);u===void 0&&(u=g(pe,oe));let he=B?g(pe,oe):u;return he.width=pe,he.height=oe,he.getContext("2d").drawImage(w,0,0,pe,oe),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+w.width+"x"+w.height+") to ("+pe+"x"+oe+")."),he}else return"data"in w&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+w.width+"x"+w.height+")."),w;return w}function m(w){return lc(w.width)&&lc(w.height)}function f(w){return a?!1:w.wrapS!==Gt||w.wrapT!==Gt||w.minFilter!==Nt&&w.minFilter!==rn}function S(w,_){return w.generateMipmaps&&_&&w.minFilter!==Nt&&w.minFilter!==rn}function v(w){s.generateMipmap(w)}function T(w,_,B,Q,te=!1){if(a===!1)return _;if(w!==null){if(s[w]!==void 0)return s[w];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+w+"'")}let ie=_;if(_===s.RED&&(B===s.FLOAT&&(ie=s.R32F),B===s.HALF_FLOAT&&(ie=s.R16F),B===s.UNSIGNED_BYTE&&(ie=s.R8)),_===s.RED_INTEGER&&(B===s.UNSIGNED_BYTE&&(ie=s.R8UI),B===s.UNSIGNED_SHORT&&(ie=s.R16UI),B===s.UNSIGNED_INT&&(ie=s.R32UI),B===s.BYTE&&(ie=s.R8I),B===s.SHORT&&(ie=s.R16I),B===s.INT&&(ie=s.R32I)),_===s.RG&&(B===s.FLOAT&&(ie=s.RG32F),B===s.HALF_FLOAT&&(ie=s.RG16F),B===s.UNSIGNED_BYTE&&(ie=s.RG8)),_===s.RGBA){let pe=te?Tr:je.getTransfer(Q);B===s.FLOAT&&(ie=s.RGBA32F),B===s.HALF_FLOAT&&(ie=s.RGBA16F),B===s.UNSIGNED_BYTE&&(ie=pe===nt?s.SRGB8_ALPHA8:s.RGBA8),B===s.UNSIGNED_SHORT_4_4_4_4&&(ie=s.RGBA4),B===s.UNSIGNED_SHORT_5_5_5_1&&(ie=s.RGB5_A1)}return(ie===s.R16F||ie===s.R32F||ie===s.RG16F||ie===s.RG32F||ie===s.RGBA16F||ie===s.RGBA32F)&&e.get("EXT_color_buffer_float"),ie}function R(w,_,B){return S(w,B)===!0||w.isFramebufferTexture&&w.minFilter!==Nt&&w.minFilter!==rn?Math.log2(Math.max(_.width,_.height))+1:w.mipmaps!==void 0&&w.mipmaps.length>0?w.mipmaps.length:w.isCompressedTexture&&Array.isArray(w.image)?_.mipmaps.length:1}function C(w){return w===Nt||w===Il||w===Sa?s.NEAREST:s.LINEAR}function A(w){let _=w.target;_.removeEventListener("dispose",A),x(_),_.isVideoTexture&&h.delete(_)}function $(w){let _=w.target;_.removeEventListener("dispose",$),L(_)}function x(w){let _=n.get(w);if(_.__webglInit===void 0)return;let B=w.source,Q=d.get(B);if(Q){let te=Q[_.__cacheKey];te.usedTimes--,te.usedTimes===0&&b(w),Object.keys(Q).length===0&&d.delete(B)}n.remove(w)}function b(w){let _=n.get(w);s.deleteTexture(_.__webglTexture);let B=w.source,Q=d.get(B);delete Q[_.__cacheKey],o.memory.textures--}function L(w){let _=w.texture,B=n.get(w),Q=n.get(_);if(Q.__webglTexture!==void 0&&(s.deleteTexture(Q.__webglTexture),o.memory.textures--),w.depthTexture&&w.depthTexture.dispose(),w.isWebGLCubeRenderTarget)for(let te=0;te<6;te++){if(Array.isArray(B.__webglFramebuffer[te]))for(let ie=0;ie<B.__webglFramebuffer[te].length;ie++)s.deleteFramebuffer(B.__webglFramebuffer[te][ie]);else s.deleteFramebuffer(B.__webglFramebuffer[te]);B.__webglDepthbuffer&&s.deleteRenderbuffer(B.__webglDepthbuffer[te])}else{if(Array.isArray(B.__webglFramebuffer))for(let te=0;te<B.__webglFramebuffer.length;te++)s.deleteFramebuffer(B.__webglFramebuffer[te]);else s.deleteFramebuffer(B.__webglFramebuffer);if(B.__webglDepthbuffer&&s.deleteRenderbuffer(B.__webglDepthbuffer),B.__webglMultisampledFramebuffer&&s.deleteFramebuffer(B.__webglMultisampledFramebuffer),B.__webglColorRenderbuffer)for(let te=0;te<B.__webglColorRenderbuffer.length;te++)B.__webglColorRenderbuffer[te]&&s.deleteRenderbuffer(B.__webglColorRenderbuffer[te]);B.__webglDepthRenderbuffer&&s.deleteRenderbuffer(B.__webglDepthRenderbuffer)}if(w.isWebGLMultipleRenderTargets)for(let te=0,ie=_.length;te<ie;te++){let pe=n.get(_[te]);pe.__webglTexture&&(s.deleteTexture(pe.__webglTexture),o.memory.textures--),n.remove(_[te])}n.remove(_),n.remove(w)}let N=0;function K(){N=0}function P(){let w=N;return w>=i.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+w+" texture units while this GPU supports only "+i.maxTextures),N+=1,w}function H(w){let _=[];return _.push(w.wrapS),_.push(w.wrapT),_.push(w.wrapR||0),_.push(w.magFilter),_.push(w.minFilter),_.push(w.anisotropy),_.push(w.internalFormat),_.push(w.format),_.push(w.type),_.push(w.generateMipmaps),_.push(w.premultiplyAlpha),_.push(w.flipY),_.push(w.unpackAlignment),_.push(w.colorSpace),_.join()}function q(w,_){let B=n.get(w);if(w.isVideoTexture&&Qe(w),w.isRenderTargetTexture===!1&&w.version>0&&B.__version!==w.version){let Q=w.image;if(Q===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(Q.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{le(B,w,_);return}}t.bindTexture(s.TEXTURE_2D,B.__webglTexture,s.TEXTURE0+_)}function J(w,_){let B=n.get(w);if(w.version>0&&B.__version!==w.version){le(B,w,_);return}t.bindTexture(s.TEXTURE_2D_ARRAY,B.__webglTexture,s.TEXTURE0+_)}function W(w,_){let B=n.get(w);if(w.version>0&&B.__version!==w.version){le(B,w,_);return}t.bindTexture(s.TEXTURE_3D,B.__webglTexture,s.TEXTURE0+_)}function U(w,_){let B=n.get(w);if(w.version>0&&B.__version!==w.version){ge(B,w,_);return}t.bindTexture(s.TEXTURE_CUBE_MAP,B.__webglTexture,s.TEXTURE0+_)}let Y={[so]:s.REPEAT,[Gt]:s.CLAMP_TO_EDGE,[ns]:s.MIRRORED_REPEAT},ne={[Nt]:s.NEAREST,[Il]:s.NEAREST_MIPMAP_NEAREST,[Sa]:s.NEAREST_MIPMAP_LINEAR,[rn]:s.LINEAR,[ad]:s.LINEAR_MIPMAP_NEAREST,[Es]:s.LINEAR_MIPMAP_LINEAR},ae={[xd]:s.NEVER,[Ed]:s.ALWAYS,[_d]:s.LESS,[ah]:s.LEQUAL,[bd]:s.EQUAL,[wd]:s.GEQUAL,[Sd]:s.GREATER,[Md]:s.NOTEQUAL};function X(w,_,B){if(B?(s.texParameteri(w,s.TEXTURE_WRAP_S,Y[_.wrapS]),s.texParameteri(w,s.TEXTURE_WRAP_T,Y[_.wrapT]),(w===s.TEXTURE_3D||w===s.TEXTURE_2D_ARRAY)&&s.texParameteri(w,s.TEXTURE_WRAP_R,Y[_.wrapR]),s.texParameteri(w,s.TEXTURE_MAG_FILTER,ne[_.magFilter]),s.texParameteri(w,s.TEXTURE_MIN_FILTER,ne[_.minFilter])):(s.texParameteri(w,s.TEXTURE_WRAP_S,s.CLAMP_TO_EDGE),s.texParameteri(w,s.TEXTURE_WRAP_T,s.CLAMP_TO_EDGE),(w===s.TEXTURE_3D||w===s.TEXTURE_2D_ARRAY)&&s.texParameteri(w,s.TEXTURE_WRAP_R,s.CLAMP_TO_EDGE),(_.wrapS!==Gt||_.wrapT!==Gt)&&console.warn("THREE.WebGLRenderer: Texture is not power of two. Texture.wrapS and Texture.wrapT should be set to THREE.ClampToEdgeWrapping."),s.texParameteri(w,s.TEXTURE_MAG_FILTER,C(_.magFilter)),s.texParameteri(w,s.TEXTURE_MIN_FILTER,C(_.minFilter)),_.minFilter!==Nt&&_.minFilter!==rn&&console.warn("THREE.WebGLRenderer: Texture is not power of two. Texture.minFilter should be set to THREE.NearestFilter or THREE.LinearFilter.")),_.compareFunction&&(s.texParameteri(w,s.TEXTURE_COMPARE_MODE,s.COMPARE_REF_TO_TEXTURE),s.texParameteri(w,s.TEXTURE_COMPARE_FUNC,ae[_.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){let Q=e.get("EXT_texture_filter_anisotropic");if(_.magFilter===Nt||_.minFilter!==Sa&&_.minFilter!==Es||_.type===Jn&&e.has("OES_texture_float_linear")===!1||a===!1&&_.type===Ts&&e.has("OES_texture_half_float_linear")===!1)return;(_.anisotropy>1||n.get(_).__currentAnisotropy)&&(s.texParameterf(w,Q.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(_.anisotropy,i.getMaxAnisotropy())),n.get(_).__currentAnisotropy=_.anisotropy)}}function j(w,_){let B=!1;w.__webglInit===void 0&&(w.__webglInit=!0,_.addEventListener("dispose",A));let Q=_.source,te=d.get(Q);te===void 0&&(te={},d.set(Q,te));let ie=H(_);if(ie!==w.__cacheKey){te[ie]===void 0&&(te[ie]={texture:s.createTexture(),usedTimes:0},o.memory.textures++,B=!0),te[ie].usedTimes++;let pe=te[w.__cacheKey];pe!==void 0&&(te[w.__cacheKey].usedTimes--,pe.usedTimes===0&&b(_)),w.__cacheKey=ie,w.__webglTexture=te[ie].texture}return B}function le(w,_,B){let Q=s.TEXTURE_2D;(_.isDataArrayTexture||_.isCompressedArrayTexture)&&(Q=s.TEXTURE_2D_ARRAY),_.isData3DTexture&&(Q=s.TEXTURE_3D);let te=j(w,_),ie=_.source;t.bindTexture(Q,w.__webglTexture,s.TEXTURE0+B);let pe=n.get(ie);if(ie.version!==pe.__version||te===!0){t.activeTexture(s.TEXTURE0+B);let oe=je.getPrimaries(je.workingColorSpace),he=_.colorSpace===an?null:je.getPrimaries(_.colorSpace),be=_.colorSpace===an||oe===he?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,_.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,_.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,_.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,be);let Pe=f(_)&&m(_.image)===!1,ee=y(_.image,Pe,!1,i.maxTextureSize);ee=Le(_,ee);let $e=m(ee)||a,Fe=r.convert(_.format,_.colorSpace),we=r.convert(_.type),ye=T(_.internalFormat,Fe,we,_.colorSpace,_.isVideoTexture);X(Q,_,$e);let ue,Re=_.mipmaps,qe=a&&_.isVideoTexture!==!0&&ye!==sh,tt=pe.__version===void 0||te===!0,De=R(_,ee,$e);if(_.isDepthTexture)ye=s.DEPTH_COMPONENT,a?_.type===Jn?ye=s.DEPTH_COMPONENT32F:_.type===Zn?ye=s.DEPTH_COMPONENT24:_.type===yi?ye=s.DEPTH24_STENCIL8:ye=s.DEPTH_COMPONENT16:_.type===Jn&&console.error("WebGLRenderer: Floating point depth texture requires WebGL2."),_.format===vi&&ye===s.DEPTH_COMPONENT&&_.type!==Bo&&_.type!==Zn&&(console.warn("THREE.WebGLRenderer: Use UnsignedShortType or UnsignedIntType for DepthFormat DepthTexture."),_.type=Zn,we=r.convert(_.type)),_.format===is&&ye===s.DEPTH_COMPONENT&&(ye=s.DEPTH_STENCIL,_.type!==yi&&(console.warn("THREE.WebGLRenderer: Use UnsignedInt248Type for DepthStencilFormat DepthTexture."),_.type=yi,we=r.convert(_.type))),tt&&(qe?t.texStorage2D(s.TEXTURE_2D,1,ye,ee.width,ee.height):t.texImage2D(s.TEXTURE_2D,0,ye,ee.width,ee.height,0,Fe,we,null));else if(_.isDataTexture)if(Re.length>0&&$e){qe&&tt&&t.texStorage2D(s.TEXTURE_2D,De,ye,Re[0].width,Re[0].height);for(let I=0,E=Re.length;I<E;I++)ue=Re[I],qe?t.texSubImage2D(s.TEXTURE_2D,I,0,0,ue.width,ue.height,Fe,we,ue.data):t.texImage2D(s.TEXTURE_2D,I,ye,ue.width,ue.height,0,Fe,we,ue.data);_.generateMipmaps=!1}else qe?(tt&&t.texStorage2D(s.TEXTURE_2D,De,ye,ee.width,ee.height),t.texSubImage2D(s.TEXTURE_2D,0,0,0,ee.width,ee.height,Fe,we,ee.data)):t.texImage2D(s.TEXTURE_2D,0,ye,ee.width,ee.height,0,Fe,we,ee.data);else if(_.isCompressedTexture)if(_.isCompressedArrayTexture){qe&&tt&&t.texStorage3D(s.TEXTURE_2D_ARRAY,De,ye,Re[0].width,Re[0].height,ee.depth);for(let I=0,E=Re.length;I<E;I++)ue=Re[I],_.format!==mn?Fe!==null?qe?t.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,I,0,0,0,ue.width,ue.height,ee.depth,Fe,ue.data,0,0):t.compressedTexImage3D(s.TEXTURE_2D_ARRAY,I,ye,ue.width,ue.height,ee.depth,0,ue.data,0,0):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):qe?t.texSubImage3D(s.TEXTURE_2D_ARRAY,I,0,0,0,ue.width,ue.height,ee.depth,Fe,we,ue.data):t.texImage3D(s.TEXTURE_2D_ARRAY,I,ye,ue.width,ue.height,ee.depth,0,Fe,we,ue.data)}else{qe&&tt&&t.texStorage2D(s.TEXTURE_2D,De,ye,Re[0].width,Re[0].height);for(let I=0,E=Re.length;I<E;I++)ue=Re[I],_.format!==mn?Fe!==null?qe?t.compressedTexSubImage2D(s.TEXTURE_2D,I,0,0,ue.width,ue.height,Fe,ue.data):t.compressedTexImage2D(s.TEXTURE_2D,I,ye,ue.width,ue.height,0,ue.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):qe?t.texSubImage2D(s.TEXTURE_2D,I,0,0,ue.width,ue.height,Fe,we,ue.data):t.texImage2D(s.TEXTURE_2D,I,ye,ue.width,ue.height,0,Fe,we,ue.data)}else if(_.isDataArrayTexture)qe?(tt&&t.texStorage3D(s.TEXTURE_2D_ARRAY,De,ye,ee.width,ee.height,ee.depth),t.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,0,ee.width,ee.height,ee.depth,Fe,we,ee.data)):t.texImage3D(s.TEXTURE_2D_ARRAY,0,ye,ee.width,ee.height,ee.depth,0,Fe,we,ee.data);else if(_.isData3DTexture)qe?(tt&&t.texStorage3D(s.TEXTURE_3D,De,ye,ee.width,ee.height,ee.depth),t.texSubImage3D(s.TEXTURE_3D,0,0,0,0,ee.width,ee.height,ee.depth,Fe,we,ee.data)):t.texImage3D(s.TEXTURE_3D,0,ye,ee.width,ee.height,ee.depth,0,Fe,we,ee.data);else if(_.isFramebufferTexture){if(tt)if(qe)t.texStorage2D(s.TEXTURE_2D,De,ye,ee.width,ee.height);else{let I=ee.width,E=ee.height;for(let Z=0;Z<De;Z++)t.texImage2D(s.TEXTURE_2D,Z,ye,I,E,0,Fe,we,null),I>>=1,E>>=1}}else if(Re.length>0&&$e){qe&&tt&&t.texStorage2D(s.TEXTURE_2D,De,ye,Re[0].width,Re[0].height);for(let I=0,E=Re.length;I<E;I++)ue=Re[I],qe?t.texSubImage2D(s.TEXTURE_2D,I,0,0,Fe,we,ue):t.texImage2D(s.TEXTURE_2D,I,ye,Fe,we,ue);_.generateMipmaps=!1}else qe?(tt&&t.texStorage2D(s.TEXTURE_2D,De,ye,ee.width,ee.height),t.texSubImage2D(s.TEXTURE_2D,0,0,0,Fe,we,ee)):t.texImage2D(s.TEXTURE_2D,0,ye,Fe,we,ee);S(_,$e)&&v(Q),pe.__version=ie.version,_.onUpdate&&_.onUpdate(_)}w.__version=_.version}function ge(w,_,B){if(_.image.length!==6)return;let Q=j(w,_),te=_.source;t.bindTexture(s.TEXTURE_CUBE_MAP,w.__webglTexture,s.TEXTURE0+B);let ie=n.get(te);if(te.version!==ie.__version||Q===!0){t.activeTexture(s.TEXTURE0+B);let pe=je.getPrimaries(je.workingColorSpace),oe=_.colorSpace===an?null:je.getPrimaries(_.colorSpace),he=_.colorSpace===an||pe===oe?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,_.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,_.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,_.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,he);let be=_.isCompressedTexture||_.image[0].isCompressedTexture,Pe=_.image[0]&&_.image[0].isDataTexture,ee=[];for(let I=0;I<6;I++)!be&&!Pe?ee[I]=y(_.image[I],!1,!0,i.maxCubemapSize):ee[I]=Pe?_.image[I].image:_.image[I],ee[I]=Le(_,ee[I]);let $e=ee[0],Fe=m($e)||a,we=r.convert(_.format,_.colorSpace),ye=r.convert(_.type),ue=T(_.internalFormat,we,ye,_.colorSpace),Re=a&&_.isVideoTexture!==!0,qe=ie.__version===void 0||Q===!0,tt=R(_,$e,Fe);X(s.TEXTURE_CUBE_MAP,_,Fe);let De;if(be){Re&&qe&&t.texStorage2D(s.TEXTURE_CUBE_MAP,tt,ue,$e.width,$e.height);for(let I=0;I<6;I++){De=ee[I].mipmaps;for(let E=0;E<De.length;E++){let Z=De[E];_.format!==mn?we!==null?Re?t.compressedTexSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+I,E,0,0,Z.width,Z.height,we,Z.data):t.compressedTexImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+I,E,ue,Z.width,Z.height,0,Z.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):Re?t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+I,E,0,0,Z.width,Z.height,we,ye,Z.data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+I,E,ue,Z.width,Z.height,0,we,ye,Z.data)}}}else{De=_.mipmaps,Re&&qe&&(De.length>0&&tt++,t.texStorage2D(s.TEXTURE_CUBE_MAP,tt,ue,ee[0].width,ee[0].height));for(let I=0;I<6;I++)if(Pe){Re?t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+I,0,0,0,ee[I].width,ee[I].height,we,ye,ee[I].data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+I,0,ue,ee[I].width,ee[I].height,0,we,ye,ee[I].data);for(let E=0;E<De.length;E++){let se=De[E].image[I].image;Re?t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+I,E+1,0,0,se.width,se.height,we,ye,se.data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+I,E+1,ue,se.width,se.height,0,we,ye,se.data)}}else{Re?t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+I,0,0,0,we,ye,ee[I]):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+I,0,ue,we,ye,ee[I]);for(let E=0;E<De.length;E++){let Z=De[E];Re?t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+I,E+1,0,0,we,ye,Z.image[I]):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+I,E+1,ue,we,ye,Z.image[I])}}}S(_,Fe)&&v(s.TEXTURE_CUBE_MAP),ie.__version=te.version,_.onUpdate&&_.onUpdate(_)}w.__version=_.version}function me(w,_,B,Q,te,ie){let pe=r.convert(B.format,B.colorSpace),oe=r.convert(B.type),he=T(B.internalFormat,pe,oe,B.colorSpace);if(!n.get(_).__hasExternalTextures){let Pe=Math.max(1,_.width>>ie),ee=Math.max(1,_.height>>ie);te===s.TEXTURE_3D||te===s.TEXTURE_2D_ARRAY?t.texImage3D(te,ie,he,Pe,ee,_.depth,0,pe,oe,null):t.texImage2D(te,ie,he,Pe,ee,0,pe,oe,null)}t.bindFramebuffer(s.FRAMEBUFFER,w),de(_)?l.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,Q,te,n.get(B).__webglTexture,0,Ee(_)):(te===s.TEXTURE_2D||te>=s.TEXTURE_CUBE_MAP_POSITIVE_X&&te<=s.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&s.framebufferTexture2D(s.FRAMEBUFFER,Q,te,n.get(B).__webglTexture,ie),t.bindFramebuffer(s.FRAMEBUFFER,null)}function Ce(w,_,B){if(s.bindRenderbuffer(s.RENDERBUFFER,w),_.depthBuffer&&!_.stencilBuffer){let Q=a===!0?s.DEPTH_COMPONENT24:s.DEPTH_COMPONENT16;if(B||de(_)){let te=_.depthTexture;te&&te.isDepthTexture&&(te.type===Jn?Q=s.DEPTH_COMPONENT32F:te.type===Zn&&(Q=s.DEPTH_COMPONENT24));let ie=Ee(_);de(_)?l.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,ie,Q,_.width,_.height):s.renderbufferStorageMultisample(s.RENDERBUFFER,ie,Q,_.width,_.height)}else s.renderbufferStorage(s.RENDERBUFFER,Q,_.width,_.height);s.framebufferRenderbuffer(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.RENDERBUFFER,w)}else if(_.depthBuffer&&_.stencilBuffer){let Q=Ee(_);B&&de(_)===!1?s.renderbufferStorageMultisample(s.RENDERBUFFER,Q,s.DEPTH24_STENCIL8,_.width,_.height):de(_)?l.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,Q,s.DEPTH24_STENCIL8,_.width,_.height):s.renderbufferStorage(s.RENDERBUFFER,s.DEPTH_STENCIL,_.width,_.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.RENDERBUFFER,w)}else{let Q=_.isWebGLMultipleRenderTargets===!0?_.texture:[_.texture];for(let te=0;te<Q.length;te++){let ie=Q[te],pe=r.convert(ie.format,ie.colorSpace),oe=r.convert(ie.type),he=T(ie.internalFormat,pe,oe,ie.colorSpace),be=Ee(_);B&&de(_)===!1?s.renderbufferStorageMultisample(s.RENDERBUFFER,be,he,_.width,_.height):de(_)?l.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,be,he,_.width,_.height):s.renderbufferStorage(s.RENDERBUFFER,he,_.width,_.height)}}s.bindRenderbuffer(s.RENDERBUFFER,null)}function Ae(w,_){if(_&&_.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(t.bindFramebuffer(s.FRAMEBUFFER,w),!(_.depthTexture&&_.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");(!n.get(_.depthTexture).__webglTexture||_.depthTexture.image.width!==_.width||_.depthTexture.image.height!==_.height)&&(_.depthTexture.image.width=_.width,_.depthTexture.image.height=_.height,_.depthTexture.needsUpdate=!0),q(_.depthTexture,0);let Q=n.get(_.depthTexture).__webglTexture,te=Ee(_);if(_.depthTexture.format===vi)de(_)?l.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,Q,0,te):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,Q,0);else if(_.depthTexture.format===is)de(_)?l.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,Q,0,te):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,Q,0);else throw new Error("Unknown depthTexture format")}function Se(w){let _=n.get(w),B=w.isWebGLCubeRenderTarget===!0;if(w.depthTexture&&!_.__autoAllocateDepthBuffer){if(B)throw new Error("target.depthTexture not supported in Cube render targets");Ae(_.__webglFramebuffer,w)}else if(B){_.__webglDepthbuffer=[];for(let Q=0;Q<6;Q++)t.bindFramebuffer(s.FRAMEBUFFER,_.__webglFramebuffer[Q]),_.__webglDepthbuffer[Q]=s.createRenderbuffer(),Ce(_.__webglDepthbuffer[Q],w,!1)}else t.bindFramebuffer(s.FRAMEBUFFER,_.__webglFramebuffer),_.__webglDepthbuffer=s.createRenderbuffer(),Ce(_.__webglDepthbuffer,w,!1);t.bindFramebuffer(s.FRAMEBUFFER,null)}function Ve(w,_,B){let Q=n.get(w);_!==void 0&&me(Q.__webglFramebuffer,w,w.texture,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,0),B!==void 0&&Se(w)}function O(w){let _=w.texture,B=n.get(w),Q=n.get(_);w.addEventListener("dispose",$),w.isWebGLMultipleRenderTargets!==!0&&(Q.__webglTexture===void 0&&(Q.__webglTexture=s.createTexture()),Q.__version=_.version,o.memory.textures++);let te=w.isWebGLCubeRenderTarget===!0,ie=w.isWebGLMultipleRenderTargets===!0,pe=m(w)||a;if(te){B.__webglFramebuffer=[];for(let oe=0;oe<6;oe++)if(a&&_.mipmaps&&_.mipmaps.length>0){B.__webglFramebuffer[oe]=[];for(let he=0;he<_.mipmaps.length;he++)B.__webglFramebuffer[oe][he]=s.createFramebuffer()}else B.__webglFramebuffer[oe]=s.createFramebuffer()}else{if(a&&_.mipmaps&&_.mipmaps.length>0){B.__webglFramebuffer=[];for(let oe=0;oe<_.mipmaps.length;oe++)B.__webglFramebuffer[oe]=s.createFramebuffer()}else B.__webglFramebuffer=s.createFramebuffer();if(ie)if(i.drawBuffers){let oe=w.texture;for(let he=0,be=oe.length;he<be;he++){let Pe=n.get(oe[he]);Pe.__webglTexture===void 0&&(Pe.__webglTexture=s.createTexture(),o.memory.textures++)}}else console.warn("THREE.WebGLRenderer: WebGLMultipleRenderTargets can only be used with WebGL2 or WEBGL_draw_buffers extension.");if(a&&w.samples>0&&de(w)===!1){let oe=ie?_:[_];B.__webglMultisampledFramebuffer=s.createFramebuffer(),B.__webglColorRenderbuffer=[],t.bindFramebuffer(s.FRAMEBUFFER,B.__webglMultisampledFramebuffer);for(let he=0;he<oe.length;he++){let be=oe[he];B.__webglColorRenderbuffer[he]=s.createRenderbuffer(),s.bindRenderbuffer(s.RENDERBUFFER,B.__webglColorRenderbuffer[he]);let Pe=r.convert(be.format,be.colorSpace),ee=r.convert(be.type),$e=T(be.internalFormat,Pe,ee,be.colorSpace,w.isXRRenderTarget===!0),Fe=Ee(w);s.renderbufferStorageMultisample(s.RENDERBUFFER,Fe,$e,w.width,w.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+he,s.RENDERBUFFER,B.__webglColorRenderbuffer[he])}s.bindRenderbuffer(s.RENDERBUFFER,null),w.depthBuffer&&(B.__webglDepthRenderbuffer=s.createRenderbuffer(),Ce(B.__webglDepthRenderbuffer,w,!0)),t.bindFramebuffer(s.FRAMEBUFFER,null)}}if(te){t.bindTexture(s.TEXTURE_CUBE_MAP,Q.__webglTexture),X(s.TEXTURE_CUBE_MAP,_,pe);for(let oe=0;oe<6;oe++)if(a&&_.mipmaps&&_.mipmaps.length>0)for(let he=0;he<_.mipmaps.length;he++)me(B.__webglFramebuffer[oe][he],w,_,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+oe,he);else me(B.__webglFramebuffer[oe],w,_,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+oe,0);S(_,pe)&&v(s.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(ie){let oe=w.texture;for(let he=0,be=oe.length;he<be;he++){let Pe=oe[he],ee=n.get(Pe);t.bindTexture(s.TEXTURE_2D,ee.__webglTexture),X(s.TEXTURE_2D,Pe,pe),me(B.__webglFramebuffer,w,Pe,s.COLOR_ATTACHMENT0+he,s.TEXTURE_2D,0),S(Pe,pe)&&v(s.TEXTURE_2D)}t.unbindTexture()}else{let oe=s.TEXTURE_2D;if((w.isWebGL3DRenderTarget||w.isWebGLArrayRenderTarget)&&(a?oe=w.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY:console.error("THREE.WebGLTextures: THREE.Data3DTexture and THREE.DataArrayTexture only supported with WebGL2.")),t.bindTexture(oe,Q.__webglTexture),X(oe,_,pe),a&&_.mipmaps&&_.mipmaps.length>0)for(let he=0;he<_.mipmaps.length;he++)me(B.__webglFramebuffer[he],w,_,s.COLOR_ATTACHMENT0,oe,he);else me(B.__webglFramebuffer,w,_,s.COLOR_ATTACHMENT0,oe,0);S(_,pe)&&v(oe),t.unbindTexture()}w.depthBuffer&&Se(w)}function ht(w){let _=m(w)||a,B=w.isWebGLMultipleRenderTargets===!0?w.texture:[w.texture];for(let Q=0,te=B.length;Q<te;Q++){let ie=B[Q];if(S(ie,_)){let pe=w.isWebGLCubeRenderTarget?s.TEXTURE_CUBE_MAP:s.TEXTURE_2D,oe=n.get(ie).__webglTexture;t.bindTexture(pe,oe),v(pe),t.unbindTexture()}}}function _e(w){if(a&&w.samples>0&&de(w)===!1){let _=w.isWebGLMultipleRenderTargets?w.texture:[w.texture],B=w.width,Q=w.height,te=s.COLOR_BUFFER_BIT,ie=[],pe=w.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,oe=n.get(w),he=w.isWebGLMultipleRenderTargets===!0;if(he)for(let be=0;be<_.length;be++)t.bindFramebuffer(s.FRAMEBUFFER,oe.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+be,s.RENDERBUFFER,null),t.bindFramebuffer(s.FRAMEBUFFER,oe.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+be,s.TEXTURE_2D,null,0);t.bindFramebuffer(s.READ_FRAMEBUFFER,oe.__webglMultisampledFramebuffer),t.bindFramebuffer(s.DRAW_FRAMEBUFFER,oe.__webglFramebuffer);for(let be=0;be<_.length;be++){ie.push(s.COLOR_ATTACHMENT0+be),w.depthBuffer&&ie.push(pe);let Pe=oe.__ignoreDepthValues!==void 0?oe.__ignoreDepthValues:!1;if(Pe===!1&&(w.depthBuffer&&(te|=s.DEPTH_BUFFER_BIT),w.stencilBuffer&&(te|=s.STENCIL_BUFFER_BIT)),he&&s.framebufferRenderbuffer(s.READ_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.RENDERBUFFER,oe.__webglColorRenderbuffer[be]),Pe===!0&&(s.invalidateFramebuffer(s.READ_FRAMEBUFFER,[pe]),s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,[pe])),he){let ee=n.get(_[be]).__webglTexture;s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,ee,0)}s.blitFramebuffer(0,0,B,Q,0,0,B,Q,te,s.NEAREST),c&&s.invalidateFramebuffer(s.READ_FRAMEBUFFER,ie)}if(t.bindFramebuffer(s.READ_FRAMEBUFFER,null),t.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),he)for(let be=0;be<_.length;be++){t.bindFramebuffer(s.FRAMEBUFFER,oe.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+be,s.RENDERBUFFER,oe.__webglColorRenderbuffer[be]);let Pe=n.get(_[be]).__webglTexture;t.bindFramebuffer(s.FRAMEBUFFER,oe.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+be,s.TEXTURE_2D,Pe,0)}t.bindFramebuffer(s.DRAW_FRAMEBUFFER,oe.__webglMultisampledFramebuffer)}}function Ee(w){return Math.min(i.maxSamples,w.samples)}function de(w){let _=n.get(w);return a&&w.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&_.__useRenderToTexture!==!1}function Qe(w){let _=o.render.frame;h.get(w)!==_&&(h.set(w,_),w.update())}function Le(w,_){let B=w.colorSpace,Q=w.format,te=w.type;return w.isCompressedTexture===!0||w.isVideoTexture===!0||w.format===ao||B!==Nn&&B!==an&&(je.getTransfer(B)===nt?a===!1?e.has("EXT_sRGB")===!0&&Q===mn?(w.format=ao,w.minFilter=rn,w.generateMipmaps=!1):_=Ir.sRGBToLinear(_):(Q!==mn||te!==ei)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",B)),_}this.allocateTextureUnit=P,this.resetTextureUnits=K,this.setTexture2D=q,this.setTexture2DArray=J,this.setTexture3D=W,this.setTextureCube=U,this.rebindTextures=Ve,this.setupRenderTarget=O,this.updateRenderTargetMipmap=ht,this.updateMultisampleRenderTarget=_e,this.setupDepthRenderbuffer=Se,this.setupFrameBufferTexture=me,this.useMultisampledRTT=de}function gy(s,e,t){let n=t.isWebGL2;function i(r,o=an){let a,l=je.getTransfer(o);if(r===ei)return s.UNSIGNED_BYTE;if(r===Qc)return s.UNSIGNED_SHORT_4_4_4_4;if(r===eh)return s.UNSIGNED_SHORT_5_5_5_1;if(r===od)return s.BYTE;if(r===ld)return s.SHORT;if(r===Bo)return s.UNSIGNED_SHORT;if(r===jc)return s.INT;if(r===Zn)return s.UNSIGNED_INT;if(r===Jn)return s.FLOAT;if(r===Ts)return n?s.HALF_FLOAT:(a=e.get("OES_texture_half_float"),a!==null?a.HALF_FLOAT_OES:null);if(r===cd)return s.ALPHA;if(r===mn)return s.RGBA;if(r===hd)return s.LUMINANCE;if(r===ud)return s.LUMINANCE_ALPHA;if(r===vi)return s.DEPTH_COMPONENT;if(r===is)return s.DEPTH_STENCIL;if(r===ao)return a=e.get("EXT_sRGB"),a!==null?a.SRGB_ALPHA_EXT:null;if(r===dd)return s.RED;if(r===th)return s.RED_INTEGER;if(r===fd)return s.RG;if(r===nh)return s.RG_INTEGER;if(r===ih)return s.RGBA_INTEGER;if(r===Ma||r===wa||r===Ea||r===Ta)if(l===nt)if(a=e.get("WEBGL_compressed_texture_s3tc_srgb"),a!==null){if(r===Ma)return a.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(r===wa)return a.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(r===Ea)return a.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(r===Ta)return a.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(a=e.get("WEBGL_compressed_texture_s3tc"),a!==null){if(r===Ma)return a.COMPRESSED_RGB_S3TC_DXT1_EXT;if(r===wa)return a.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(r===Ea)return a.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(r===Ta)return a.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(r===Ll||r===Dl||r===kl||r===Ul)if(a=e.get("WEBGL_compressed_texture_pvrtc"),a!==null){if(r===Ll)return a.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(r===Dl)return a.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(r===kl)return a.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(r===Ul)return a.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(r===sh)return a=e.get("WEBGL_compressed_texture_etc1"),a!==null?a.COMPRESSED_RGB_ETC1_WEBGL:null;if(r===Fl||r===Nl)if(a=e.get("WEBGL_compressed_texture_etc"),a!==null){if(r===Fl)return l===nt?a.COMPRESSED_SRGB8_ETC2:a.COMPRESSED_RGB8_ETC2;if(r===Nl)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:a.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(r===Ol||r===Bl||r===Hl||r===zl||r===Vl||r===Gl||r===Wl||r===Xl||r===$l||r===ql||r===Yl||r===Zl||r===Jl||r===Kl)if(a=e.get("WEBGL_compressed_texture_astc"),a!==null){if(r===Ol)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:a.COMPRESSED_RGBA_ASTC_4x4_KHR;if(r===Bl)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:a.COMPRESSED_RGBA_ASTC_5x4_KHR;if(r===Hl)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:a.COMPRESSED_RGBA_ASTC_5x5_KHR;if(r===zl)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:a.COMPRESSED_RGBA_ASTC_6x5_KHR;if(r===Vl)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:a.COMPRESSED_RGBA_ASTC_6x6_KHR;if(r===Gl)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:a.COMPRESSED_RGBA_ASTC_8x5_KHR;if(r===Wl)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:a.COMPRESSED_RGBA_ASTC_8x6_KHR;if(r===Xl)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:a.COMPRESSED_RGBA_ASTC_8x8_KHR;if(r===$l)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:a.COMPRESSED_RGBA_ASTC_10x5_KHR;if(r===ql)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:a.COMPRESSED_RGBA_ASTC_10x6_KHR;if(r===Yl)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:a.COMPRESSED_RGBA_ASTC_10x8_KHR;if(r===Zl)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:a.COMPRESSED_RGBA_ASTC_10x10_KHR;if(r===Jl)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:a.COMPRESSED_RGBA_ASTC_12x10_KHR;if(r===Kl)return l===nt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:a.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(r===Aa||r===jl||r===Ql)if(a=e.get("EXT_texture_compression_bptc"),a!==null){if(r===Aa)return l===nt?a.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:a.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(r===jl)return a.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(r===Ql)return a.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(r===pd||r===ec||r===tc||r===nc)if(a=e.get("EXT_texture_compression_rgtc"),a!==null){if(r===Aa)return a.COMPRESSED_RED_RGTC1_EXT;if(r===ec)return a.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(r===tc)return a.COMPRESSED_RED_GREEN_RGTC2_EXT;if(r===nc)return a.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return r===yi?n?s.UNSIGNED_INT_24_8:(a=e.get("WEBGL_depth_texture"),a!==null?a.UNSIGNED_INT_24_8_WEBGL:null):s[r]!==void 0?s[r]:null}return{convert:i}}var Mo=class extends vt{constructor(e=[]){super(),this.isArrayCamera=!0,this.cameras=e}},Wt=class extends on{constructor(){super(),this.isGroup=!0,this.type="Group"}},yy={type:"move"},ws=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Wt,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Wt,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new k,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new k),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Wt,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new k,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new k),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let i=null,r=null,o=null,a=this._targetRay,l=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){o=!0;for(let y of e.hand.values()){let m=t.getJointPose(y,n),f=this._getHandJoint(c,y);m!==null&&(f.matrix.fromArray(m.transform.matrix),f.matrix.decompose(f.position,f.rotation,f.scale),f.matrixWorldNeedsUpdate=!0,f.jointRadius=m.radius),f.visible=m!==null}let h=c.joints["index-finger-tip"],u=c.joints["thumb-tip"],d=h.position.distanceTo(u.position),p=.02,g=.005;c.inputState.pinching&&d>p+g?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!c.inputState.pinching&&d<=p-g&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else l!==null&&e.gripSpace&&(r=t.getPose(e.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1));a!==null&&(i=t.getPose(e.targetRaySpace,n),i===null&&r!==null&&(i=r),i!==null&&(a.matrix.fromArray(i.transform.matrix),a.matrix.decompose(a.position,a.rotation,a.scale),a.matrixWorldNeedsUpdate=!0,i.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(i.linearVelocity)):a.hasLinearVelocity=!1,i.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(i.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(yy)))}return a!==null&&(a.visible=i!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=o!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let n=new Wt;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}},wo=class extends ii{constructor(e,t){super();let n=this,i=null,r=1,o=null,a="local-floor",l=1,c=null,h=null,u=null,d=null,p=null,g=null,y=t.getContextAttributes(),m=null,f=null,S=[],v=[],T=new Ue,R=null,C=new vt;C.layers.enable(1),C.viewport=new Rt;let A=new vt;A.layers.enable(2),A.viewport=new Rt;let $=[C,A],x=new Mo;x.layers.enable(1),x.layers.enable(2);let b=null,L=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(X){let j=S[X];return j===void 0&&(j=new ws,S[X]=j),j.getTargetRaySpace()},this.getControllerGrip=function(X){let j=S[X];return j===void 0&&(j=new ws,S[X]=j),j.getGripSpace()},this.getHand=function(X){let j=S[X];return j===void 0&&(j=new ws,S[X]=j),j.getHandSpace()};function N(X){let j=v.indexOf(X.inputSource);if(j===-1)return;let le=S[j];le!==void 0&&(le.update(X.inputSource,X.frame,c||o),le.dispatchEvent({type:X.type,data:X.inputSource}))}function K(){i.removeEventListener("select",N),i.removeEventListener("selectstart",N),i.removeEventListener("selectend",N),i.removeEventListener("squeeze",N),i.removeEventListener("squeezestart",N),i.removeEventListener("squeezeend",N),i.removeEventListener("end",K),i.removeEventListener("inputsourceschange",P);for(let X=0;X<S.length;X++){let j=v[X];j!==null&&(v[X]=null,S[X].disconnect(j))}b=null,L=null,e.setRenderTarget(m),p=null,d=null,u=null,i=null,f=null,ae.stop(),n.isPresenting=!1,e.setPixelRatio(R),e.setSize(T.width,T.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(X){r=X,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(X){a=X,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||o},this.setReferenceSpace=function(X){c=X},this.getBaseLayer=function(){return d!==null?d:p},this.getBinding=function(){return u},this.getFrame=function(){return g},this.getSession=function(){return i},this.setSession=async function(X){if(i=X,i!==null){if(m=e.getRenderTarget(),i.addEventListener("select",N),i.addEventListener("selectstart",N),i.addEventListener("selectend",N),i.addEventListener("squeeze",N),i.addEventListener("squeezestart",N),i.addEventListener("squeezeend",N),i.addEventListener("end",K),i.addEventListener("inputsourceschange",P),y.xrCompatible!==!0&&await t.makeXRCompatible(),R=e.getPixelRatio(),e.getSize(T),i.renderState.layers===void 0||e.capabilities.isWebGL2===!1){let j={antialias:i.renderState.layers===void 0?y.antialias:!0,alpha:!0,depth:y.depth,stencil:y.stencil,framebufferScaleFactor:r};p=new XRWebGLLayer(i,t,j),i.updateRenderState({baseLayer:p}),e.setPixelRatio(1),e.setSize(p.framebufferWidth,p.framebufferHeight,!1),f=new On(p.framebufferWidth,p.framebufferHeight,{format:mn,type:ei,colorSpace:e.outputColorSpace,stencilBuffer:y.stencil})}else{let j=null,le=null,ge=null;y.depth&&(ge=y.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,j=y.stencil?is:vi,le=y.stencil?yi:Zn);let me={colorFormat:t.RGBA8,depthFormat:ge,scaleFactor:r};u=new XRWebGLBinding(i,t),d=u.createProjectionLayer(me),i.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),f=new On(d.textureWidth,d.textureHeight,{format:mn,type:ei,depthTexture:new zr(d.textureWidth,d.textureHeight,le,void 0,void 0,void 0,void 0,void 0,void 0,j),stencilBuffer:y.stencil,colorSpace:e.outputColorSpace,samples:y.antialias?4:0});let Ce=e.properties.get(f);Ce.__ignoreDepthValues=d.ignoreDepthValues}f.isXRRenderTarget=!0,this.setFoveation(l),c=null,o=await i.requestReferenceSpace(a),ae.setContext(i),ae.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode};function P(X){for(let j=0;j<X.removed.length;j++){let le=X.removed[j],ge=v.indexOf(le);ge>=0&&(v[ge]=null,S[ge].disconnect(le))}for(let j=0;j<X.added.length;j++){let le=X.added[j],ge=v.indexOf(le);if(ge===-1){for(let Ce=0;Ce<S.length;Ce++)if(Ce>=v.length){v.push(le),ge=Ce;break}else if(v[Ce]===null){v[Ce]=le,ge=Ce;break}if(ge===-1)break}let me=S[ge];me&&me.connect(le)}}let H=new k,q=new k;function J(X,j,le){H.setFromMatrixPosition(j.matrixWorld),q.setFromMatrixPosition(le.matrixWorld);let ge=H.distanceTo(q),me=j.projectionMatrix.elements,Ce=le.projectionMatrix.elements,Ae=me[14]/(me[10]-1),Se=me[14]/(me[10]+1),Ve=(me[9]+1)/me[5],O=(me[9]-1)/me[5],ht=(me[8]-1)/me[0],_e=(Ce[8]+1)/Ce[0],Ee=Ae*ht,de=Ae*_e,Qe=ge/(-ht+_e),Le=Qe*-ht;j.matrixWorld.decompose(X.position,X.quaternion,X.scale),X.translateX(Le),X.translateZ(Qe),X.matrixWorld.compose(X.position,X.quaternion,X.scale),X.matrixWorldInverse.copy(X.matrixWorld).invert();let w=Ae+Qe,_=Se+Qe,B=Ee-Le,Q=de+(ge-Le),te=Ve*Se/_*w,ie=O*Se/_*w;X.projectionMatrix.makePerspective(B,Q,te,ie,w,_),X.projectionMatrixInverse.copy(X.projectionMatrix).invert()}function W(X,j){j===null?X.matrixWorld.copy(X.matrix):X.matrixWorld.multiplyMatrices(j.matrixWorld,X.matrix),X.matrixWorldInverse.copy(X.matrixWorld).invert()}this.updateCamera=function(X){if(i===null)return;x.near=A.near=C.near=X.near,x.far=A.far=C.far=X.far,(b!==x.near||L!==x.far)&&(i.updateRenderState({depthNear:x.near,depthFar:x.far}),b=x.near,L=x.far);let j=X.parent,le=x.cameras;W(x,j);for(let ge=0;ge<le.length;ge++)W(le[ge],j);le.length===2?J(x,C,A):x.projectionMatrix.copy(C.projectionMatrix),U(X,x,j)};function U(X,j,le){le===null?X.matrix.copy(j.matrixWorld):(X.matrix.copy(le.matrixWorld),X.matrix.invert(),X.matrix.multiply(j.matrixWorld)),X.matrix.decompose(X.position,X.quaternion,X.scale),X.updateMatrixWorld(!0),X.projectionMatrix.copy(j.projectionMatrix),X.projectionMatrixInverse.copy(j.projectionMatrixInverse),X.isPerspectiveCamera&&(X.fov=oo*2*Math.atan(1/X.projectionMatrix.elements[5]),X.zoom=1)}this.getCamera=function(){return x},this.getFoveation=function(){if(!(d===null&&p===null))return l},this.setFoveation=function(X){l=X,d!==null&&(d.fixedFoveation=X),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=X)};let Y=null;function ne(X,j){if(h=j.getViewerPose(c||o),g=j,h!==null){let le=h.views;p!==null&&(e.setRenderTargetFramebuffer(f,p.framebuffer),e.setRenderTarget(f));let ge=!1;le.length!==x.cameras.length&&(x.cameras.length=0,ge=!0);for(let me=0;me<le.length;me++){let Ce=le[me],Ae=null;if(p!==null)Ae=p.getViewport(Ce);else{let Ve=u.getViewSubImage(d,Ce);Ae=Ve.viewport,me===0&&(e.setRenderTargetTextures(f,Ve.colorTexture,d.ignoreDepthValues?void 0:Ve.depthStencilTexture),e.setRenderTarget(f))}let Se=$[me];Se===void 0&&(Se=new vt,Se.layers.enable(me),Se.viewport=new Rt,$[me]=Se),Se.matrix.fromArray(Ce.transform.matrix),Se.matrix.decompose(Se.position,Se.quaternion,Se.scale),Se.projectionMatrix.fromArray(Ce.projectionMatrix),Se.projectionMatrixInverse.copy(Se.projectionMatrix).invert(),Se.viewport.set(Ae.x,Ae.y,Ae.width,Ae.height),me===0&&(x.matrix.copy(Se.matrix),x.matrix.decompose(x.position,x.quaternion,x.scale)),ge===!0&&x.cameras.push(Se)}}for(let le=0;le<S.length;le++){let ge=v[le],me=S[le];ge!==null&&me!==void 0&&me.update(ge,j,c||o)}Y&&Y(X,j),j.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:j}),g=null}let ae=new hh;ae.setAnimationLoop(ne),this.setAnimationLoop=function(X){Y=X},this.dispose=function(){}}};function vy(s,e){function t(m,f){m.matrixAutoUpdate===!0&&m.updateMatrix(),f.value.copy(m.matrix)}function n(m,f){f.color.getRGB(m.fogColor.value,ch(s)),f.isFog?(m.fogNear.value=f.near,m.fogFar.value=f.far):f.isFogExp2&&(m.fogDensity.value=f.density)}function i(m,f,S,v,T){f.isMeshBasicMaterial||f.isMeshLambertMaterial?r(m,f):f.isMeshToonMaterial?(r(m,f),u(m,f)):f.isMeshPhongMaterial?(r(m,f),h(m,f)):f.isMeshStandardMaterial?(r(m,f),d(m,f),f.isMeshPhysicalMaterial&&p(m,f,T)):f.isMeshMatcapMaterial?(r(m,f),g(m,f)):f.isMeshDepthMaterial?r(m,f):f.isMeshDistanceMaterial?(r(m,f),y(m,f)):f.isMeshNormalMaterial?r(m,f):f.isLineBasicMaterial?(o(m,f),f.isLineDashedMaterial&&a(m,f)):f.isPointsMaterial?l(m,f,S,v):f.isSpriteMaterial?c(m,f):f.isShadowMaterial?(m.color.value.copy(f.color),m.opacity.value=f.opacity):f.isShaderMaterial&&(f.uniformsNeedUpdate=!1)}function r(m,f){m.opacity.value=f.opacity,f.color&&m.diffuse.value.copy(f.color),f.emissive&&m.emissive.value.copy(f.emissive).multiplyScalar(f.emissiveIntensity),f.map&&(m.map.value=f.map,t(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.bumpMap&&(m.bumpMap.value=f.bumpMap,t(f.bumpMap,m.bumpMapTransform),m.bumpScale.value=f.bumpScale,f.side===Xt&&(m.bumpScale.value*=-1)),f.normalMap&&(m.normalMap.value=f.normalMap,t(f.normalMap,m.normalMapTransform),m.normalScale.value.copy(f.normalScale),f.side===Xt&&m.normalScale.value.negate()),f.displacementMap&&(m.displacementMap.value=f.displacementMap,t(f.displacementMap,m.displacementMapTransform),m.displacementScale.value=f.displacementScale,m.displacementBias.value=f.displacementBias),f.emissiveMap&&(m.emissiveMap.value=f.emissiveMap,t(f.emissiveMap,m.emissiveMapTransform)),f.specularMap&&(m.specularMap.value=f.specularMap,t(f.specularMap,m.specularMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest);let S=e.get(f).envMap;if(S&&(m.envMap.value=S,m.flipEnvMap.value=S.isCubeTexture&&S.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=f.reflectivity,m.ior.value=f.ior,m.refractionRatio.value=f.refractionRatio),f.lightMap){m.lightMap.value=f.lightMap;let v=s._useLegacyLights===!0?Math.PI:1;m.lightMapIntensity.value=f.lightMapIntensity*v,t(f.lightMap,m.lightMapTransform)}f.aoMap&&(m.aoMap.value=f.aoMap,m.aoMapIntensity.value=f.aoMapIntensity,t(f.aoMap,m.aoMapTransform))}function o(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,f.map&&(m.map.value=f.map,t(f.map,m.mapTransform))}function a(m,f){m.dashSize.value=f.dashSize,m.totalSize.value=f.dashSize+f.gapSize,m.scale.value=f.scale}function l(m,f,S,v){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.size.value=f.size*S,m.scale.value=v*.5,f.map&&(m.map.value=f.map,t(f.map,m.uvTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function c(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.rotation.value=f.rotation,f.map&&(m.map.value=f.map,t(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function h(m,f){m.specular.value.copy(f.specular),m.shininess.value=Math.max(f.shininess,1e-4)}function u(m,f){f.gradientMap&&(m.gradientMap.value=f.gradientMap)}function d(m,f){m.metalness.value=f.metalness,f.metalnessMap&&(m.metalnessMap.value=f.metalnessMap,t(f.metalnessMap,m.metalnessMapTransform)),m.roughness.value=f.roughness,f.roughnessMap&&(m.roughnessMap.value=f.roughnessMap,t(f.roughnessMap,m.roughnessMapTransform)),e.get(f).envMap&&(m.envMapIntensity.value=f.envMapIntensity)}function p(m,f,S){m.ior.value=f.ior,f.sheen>0&&(m.sheenColor.value.copy(f.sheenColor).multiplyScalar(f.sheen),m.sheenRoughness.value=f.sheenRoughness,f.sheenColorMap&&(m.sheenColorMap.value=f.sheenColorMap,t(f.sheenColorMap,m.sheenColorMapTransform)),f.sheenRoughnessMap&&(m.sheenRoughnessMap.value=f.sheenRoughnessMap,t(f.sheenRoughnessMap,m.sheenRoughnessMapTransform))),f.clearcoat>0&&(m.clearcoat.value=f.clearcoat,m.clearcoatRoughness.value=f.clearcoatRoughness,f.clearcoatMap&&(m.clearcoatMap.value=f.clearcoatMap,t(f.clearcoatMap,m.clearcoatMapTransform)),f.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=f.clearcoatRoughnessMap,t(f.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),f.clearcoatNormalMap&&(m.clearcoatNormalMap.value=f.clearcoatNormalMap,t(f.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(f.clearcoatNormalScale),f.side===Xt&&m.clearcoatNormalScale.value.negate())),f.iridescence>0&&(m.iridescence.value=f.iridescence,m.iridescenceIOR.value=f.iridescenceIOR,m.iridescenceThicknessMinimum.value=f.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=f.iridescenceThicknessRange[1],f.iridescenceMap&&(m.iridescenceMap.value=f.iridescenceMap,t(f.iridescenceMap,m.iridescenceMapTransform)),f.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=f.iridescenceThicknessMap,t(f.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),f.transmission>0&&(m.transmission.value=f.transmission,m.transmissionSamplerMap.value=S.texture,m.transmissionSamplerSize.value.set(S.width,S.height),f.transmissionMap&&(m.transmissionMap.value=f.transmissionMap,t(f.transmissionMap,m.transmissionMapTransform)),m.thickness.value=f.thickness,f.thicknessMap&&(m.thicknessMap.value=f.thicknessMap,t(f.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=f.attenuationDistance,m.attenuationColor.value.copy(f.attenuationColor)),f.anisotropy>0&&(m.anisotropyVector.value.set(f.anisotropy*Math.cos(f.anisotropyRotation),f.anisotropy*Math.sin(f.anisotropyRotation)),f.anisotropyMap&&(m.anisotropyMap.value=f.anisotropyMap,t(f.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=f.specularIntensity,m.specularColor.value.copy(f.specularColor),f.specularColorMap&&(m.specularColorMap.value=f.specularColorMap,t(f.specularColorMap,m.specularColorMapTransform)),f.specularIntensityMap&&(m.specularIntensityMap.value=f.specularIntensityMap,t(f.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,f){f.matcap&&(m.matcap.value=f.matcap)}function y(m,f){let S=e.get(f).light;m.referencePosition.value.setFromMatrixPosition(S.matrixWorld),m.nearDistance.value=S.shadow.camera.near,m.farDistance.value=S.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:i}}function xy(s,e,t,n){let i={},r={},o=[],a=t.isWebGL2?s.getParameter(s.MAX_UNIFORM_BUFFER_BINDINGS):0;function l(S,v){let T=v.program;n.uniformBlockBinding(S,T)}function c(S,v){let T=i[S.id];T===void 0&&(g(S),T=h(S),i[S.id]=T,S.addEventListener("dispose",m));let R=v.program;n.updateUBOMapping(S,R);let C=e.render.frame;r[S.id]!==C&&(d(S),r[S.id]=C)}function h(S){let v=u();S.__bindingPointIndex=v;let T=s.createBuffer(),R=S.__size,C=S.usage;return s.bindBuffer(s.UNIFORM_BUFFER,T),s.bufferData(s.UNIFORM_BUFFER,R,C),s.bindBuffer(s.UNIFORM_BUFFER,null),s.bindBufferBase(s.UNIFORM_BUFFER,v,T),T}function u(){for(let S=0;S<a;S++)if(o.indexOf(S)===-1)return o.push(S),S;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function d(S){let v=i[S.id],T=S.uniforms,R=S.__cache;s.bindBuffer(s.UNIFORM_BUFFER,v);for(let C=0,A=T.length;C<A;C++){let $=Array.isArray(T[C])?T[C]:[T[C]];for(let x=0,b=$.length;x<b;x++){let L=$[x];if(p(L,C,x,R)===!0){let N=L.__offset,K=Array.isArray(L.value)?L.value:[L.value],P=0;for(let H=0;H<K.length;H++){let q=K[H],J=y(q);typeof q=="number"||typeof q=="boolean"?(L.__data[0]=q,s.bufferSubData(s.UNIFORM_BUFFER,N+P,L.__data)):q.isMatrix3?(L.__data[0]=q.elements[0],L.__data[1]=q.elements[1],L.__data[2]=q.elements[2],L.__data[3]=0,L.__data[4]=q.elements[3],L.__data[5]=q.elements[4],L.__data[6]=q.elements[5],L.__data[7]=0,L.__data[8]=q.elements[6],L.__data[9]=q.elements[7],L.__data[10]=q.elements[8],L.__data[11]=0):(q.toArray(L.__data,P),P+=J.storage/Float32Array.BYTES_PER_ELEMENT)}s.bufferSubData(s.UNIFORM_BUFFER,N,L.__data)}}}s.bindBuffer(s.UNIFORM_BUFFER,null)}function p(S,v,T,R){let C=S.value,A=v+"_"+T;if(R[A]===void 0)return typeof C=="number"||typeof C=="boolean"?R[A]=C:R[A]=C.clone(),!0;{let $=R[A];if(typeof C=="number"||typeof C=="boolean"){if($!==C)return R[A]=C,!0}else if($.equals(C)===!1)return $.copy(C),!0}return!1}function g(S){let v=S.uniforms,T=0,R=16;for(let A=0,$=v.length;A<$;A++){let x=Array.isArray(v[A])?v[A]:[v[A]];for(let b=0,L=x.length;b<L;b++){let N=x[b],K=Array.isArray(N.value)?N.value:[N.value];for(let P=0,H=K.length;P<H;P++){let q=K[P],J=y(q),W=T%R;W!==0&&R-W<J.boundary&&(T+=R-W),N.__data=new Float32Array(J.storage/Float32Array.BYTES_PER_ELEMENT),N.__offset=T,T+=J.storage}}}let C=T%R;return C>0&&(T+=R-C),S.__size=T,S.__cache={},this}function y(S){let v={boundary:0,storage:0};return typeof S=="number"||typeof S=="boolean"?(v.boundary=4,v.storage=4):S.isVector2?(v.boundary=8,v.storage=8):S.isVector3||S.isColor?(v.boundary=16,v.storage=12):S.isVector4?(v.boundary=16,v.storage=16):S.isMatrix3?(v.boundary=48,v.storage=48):S.isMatrix4?(v.boundary=64,v.storage=64):S.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",S),v}function m(S){let v=S.target;v.removeEventListener("dispose",m);let T=o.indexOf(v.__bindingPointIndex);o.splice(T,1),s.deleteBuffer(i[v.id]),delete i[v.id],delete r[v.id]}function f(){for(let S in i)s.deleteBuffer(i[S]);o=[],i={},r={}}return{bind:l,update:c,dispose:f}}var Ps=class{constructor(e={}){let{canvas:t=Ad(),context:n=null,depth:i=!0,stencil:r=!0,alpha:o=!1,antialias:a=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:u=!1}=e;this.isWebGLRenderer=!0;let d;n!==null?d=n.getContextAttributes().alpha:d=o;let p=new Uint32Array(4),g=new Int32Array(4),y=null,m=null,f=[],S=[];this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this._outputColorSpace=Ye,this._useLegacyLights=!1,this.toneMapping=Qn,this.toneMappingExposure=1;let v=this,T=!1,R=0,C=0,A=null,$=-1,x=null,b=new Rt,L=new Rt,N=null,K=new Ge(0),P=0,H=t.width,q=t.height,J=1,W=null,U=null,Y=new Rt(0,0,H,q),ne=new Rt(0,0,H,q),ae=!1,X=new Br,j=!1,le=!1,ge=null,me=new Pt,Ce=new Ue,Ae=new k,Se={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};function Ve(){return A===null?J:1}let O=n;function ht(M,F){for(let V=0;V<M.length;V++){let G=M[V],z=t.getContext(G,F);if(z!==null)return z}return null}try{let M={alpha:!0,depth:i,stencil:r,antialias:a,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:u};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${Oo}`),t.addEventListener("webglcontextlost",I,!1),t.addEventListener("webglcontextrestored",E,!1),t.addEventListener("webglcontextcreationerror",Z,!1),O===null){let F=["webgl2","webgl","experimental-webgl"];if(v.isWebGL1Renderer===!0&&F.shift(),O=ht(F,M),O===null)throw ht(F)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}typeof WebGLRenderingContext<"u"&&O instanceof WebGLRenderingContext&&console.warn("THREE.WebGLRenderer: WebGL 1 support was deprecated in r153 and will be removed in r163."),O.getShaderPrecisionFormat===void 0&&(O.getShaderPrecisionFormat=function(){return{rangeMin:1,rangeMax:1,precision:1}})}catch(M){throw console.error("THREE.WebGLRenderer: "+M.message),M}let _e,Ee,de,Qe,Le,w,_,B,Q,te,ie,pe,oe,he,be,Pe,ee,$e,Fe,we,ye,ue,Re,qe;function tt(){_e=new Om(O),Ee=new Lm(O,_e,e),_e.init(Ee),ue=new gy(O,_e,Ee),de=new py(O,_e,Ee),Qe=new zm(O),Le=new ny,w=new my(O,_e,de,Le,Ee,ue,Qe),_=new km(v),B=new Nm(v),Q=new Yd(O,Ee),Re=new Pm(O,_e,Q,Ee),te=new Bm(O,Q,Qe,Re),ie=new Xm(O,te,Q,Qe),Fe=new Wm(O,Ee,w),Pe=new Dm(Le),pe=new ty(v,_,B,_e,Ee,Re,Pe),oe=new vy(v,Le),he=new sy,be=new hy(_e,Ee),$e=new Rm(v,_,B,de,ie,d,l),ee=new fy(v,ie,Ee),qe=new xy(O,Qe,Ee,de),we=new Im(O,_e,Qe,Ee),ye=new Hm(O,_e,Qe,Ee),Qe.programs=pe.programs,v.capabilities=Ee,v.extensions=_e,v.properties=Le,v.renderLists=he,v.shadowMap=ee,v.state=de,v.info=Qe}tt();let De=new wo(v,O);this.xr=De,this.getContext=function(){return O},this.getContextAttributes=function(){return O.getContextAttributes()},this.forceContextLoss=function(){let M=_e.get("WEBGL_lose_context");M&&M.loseContext()},this.forceContextRestore=function(){let M=_e.get("WEBGL_lose_context");M&&M.restoreContext()},this.getPixelRatio=function(){return J},this.setPixelRatio=function(M){M!==void 0&&(J=M,this.setSize(H,q,!1))},this.getSize=function(M){return M.set(H,q)},this.setSize=function(M,F,V=!0){if(De.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}H=M,q=F,t.width=Math.floor(M*J),t.height=Math.floor(F*J),V===!0&&(t.style.width=M+"px",t.style.height=F+"px"),this.setViewport(0,0,M,F)},this.getDrawingBufferSize=function(M){return M.set(H*J,q*J).floor()},this.setDrawingBufferSize=function(M,F,V){H=M,q=F,J=V,t.width=Math.floor(M*V),t.height=Math.floor(F*V),this.setViewport(0,0,M,F)},this.getCurrentViewport=function(M){return M.copy(b)},this.getViewport=function(M){return M.copy(Y)},this.setViewport=function(M,F,V,G){M.isVector4?Y.set(M.x,M.y,M.z,M.w):Y.set(M,F,V,G),de.viewport(b.copy(Y).multiplyScalar(J).floor())},this.getScissor=function(M){return M.copy(ne)},this.setScissor=function(M,F,V,G){M.isVector4?ne.set(M.x,M.y,M.z,M.w):ne.set(M,F,V,G),de.scissor(L.copy(ne).multiplyScalar(J).floor())},this.getScissorTest=function(){return ae},this.setScissorTest=function(M){de.setScissorTest(ae=M)},this.setOpaqueSort=function(M){W=M},this.setTransparentSort=function(M){U=M},this.getClearColor=function(M){return M.copy($e.getClearColor())},this.setClearColor=function(){$e.setClearColor.apply($e,arguments)},this.getClearAlpha=function(){return $e.getClearAlpha()},this.setClearAlpha=function(){$e.setClearAlpha.apply($e,arguments)},this.clear=function(M=!0,F=!0,V=!0){let G=0;if(M){let z=!1;if(A!==null){let ce=A.texture.format;z=ce===ih||ce===nh||ce===th}if(z){let ce=A.texture.type,xe=ce===ei||ce===Zn||ce===Bo||ce===yi||ce===Qc||ce===eh,Me=$e.getClearColor(),Te=$e.getClearAlpha(),Oe=Me.r,Ie=Me.g,ke=Me.b;xe?(p[0]=Oe,p[1]=Ie,p[2]=ke,p[3]=Te,O.clearBufferuiv(O.COLOR,0,p)):(g[0]=Oe,g[1]=Ie,g[2]=ke,g[3]=Te,O.clearBufferiv(O.COLOR,0,g))}else G|=O.COLOR_BUFFER_BIT}F&&(G|=O.DEPTH_BUFFER_BIT),V&&(G|=O.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),O.clear(G)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener("webglcontextlost",I,!1),t.removeEventListener("webglcontextrestored",E,!1),t.removeEventListener("webglcontextcreationerror",Z,!1),he.dispose(),be.dispose(),Le.dispose(),_.dispose(),B.dispose(),ie.dispose(),Re.dispose(),qe.dispose(),pe.dispose(),De.dispose(),De.removeEventListener("sessionstart",mt),De.removeEventListener("sessionend",Je),ge&&(ge.dispose(),ge=null),At.stop()};function I(M){M.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),T=!0}function E(){console.log("THREE.WebGLRenderer: Context Restored."),T=!1;let M=Qe.autoReset,F=ee.enabled,V=ee.autoUpdate,G=ee.needsUpdate,z=ee.type;tt(),Qe.autoReset=M,ee.enabled=F,ee.autoUpdate=V,ee.needsUpdate=G,ee.type=z}function Z(M){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",M.statusMessage)}function se(M){let F=M.target;F.removeEventListener("dispose",se),fe(F)}function fe(M){ve(M),Le.remove(M)}function ve(M){let F=Le.get(M).programs;F!==void 0&&(F.forEach(function(V){pe.releaseProgram(V)}),M.isShaderMaterial&&pe.releaseShaderCache(M))}this.renderBufferDirect=function(M,F,V,G,z,ce){F===null&&(F=Se);let xe=z.isMesh&&z.matrixWorld.determinant()<0,Me=Nh(M,F,V,G,z);de.setMaterial(G,xe);let Te=V.index,Oe=1;if(G.wireframe===!0){if(Te=te.getWireframeAttribute(V),Te===void 0)return;Oe=2}let Ie=V.drawRange,ke=V.attributes.position,ut=Ie.start*Oe,Zt=(Ie.start+Ie.count)*Oe;ce!==null&&(ut=Math.max(ut,ce.start*Oe),Zt=Math.min(Zt,(ce.start+ce.count)*Oe)),Te!==null?(ut=Math.max(ut,0),Zt=Math.min(Zt,Te.count)):ke!=null&&(ut=Math.max(ut,0),Zt=Math.min(Zt,ke.count));let St=Zt-ut;if(St<0||St===1/0)return;Re.setup(z,G,Me,V,Te);let Sn,rt=we;if(Te!==null&&(Sn=Q.get(Te),rt=ye,rt.setIndex(Sn)),z.isMesh)G.wireframe===!0?(de.setLineWidth(G.wireframeLinewidth*Ve()),rt.setMode(O.LINES)):rt.setMode(O.TRIANGLES);else if(z.isLine){let He=G.linewidth;He===void 0&&(He=1),de.setLineWidth(He*Ve()),z.isLineSegments?rt.setMode(O.LINES):z.isLineLoop?rt.setMode(O.LINE_LOOP):rt.setMode(O.LINE_STRIP)}else z.isPoints?rt.setMode(O.POINTS):z.isSprite&&rt.setMode(O.TRIANGLES);if(z.isBatchedMesh)rt.renderMultiDraw(z._multiDrawStarts,z._multiDrawCounts,z._multiDrawCount);else if(z.isInstancedMesh)rt.renderInstances(ut,St,z.count);else if(V.isInstancedBufferGeometry){let He=V._maxInstanceCount!==void 0?V._maxInstanceCount:1/0,aa=Math.min(V.instanceCount,He);rt.renderInstances(ut,St,aa)}else rt.render(ut,St)};function We(M,F,V){M.transparent===!0&&M.side===Ot&&M.forceSinglePass===!1?(M.side=Xt,M.needsUpdate=!0,Ns(M,F,V),M.side=ni,M.needsUpdate=!0,Ns(M,F,V),M.side=Ot):Ns(M,F,V)}this.compile=function(M,F,V=null){V===null&&(V=M),m=be.get(V),m.init(),S.push(m),V.traverseVisible(function(z){z.isLight&&z.layers.test(F.layers)&&(m.pushLight(z),z.castShadow&&m.pushShadow(z))}),M!==V&&M.traverseVisible(function(z){z.isLight&&z.layers.test(F.layers)&&(m.pushLight(z),z.castShadow&&m.pushShadow(z))}),m.setupLights(v._useLegacyLights);let G=new Set;return M.traverse(function(z){let ce=z.material;if(ce)if(Array.isArray(ce))for(let xe=0;xe<ce.length;xe++){let Me=ce[xe];We(Me,V,z),G.add(Me)}else We(ce,V,z),G.add(ce)}),S.pop(),m=null,G},this.compileAsync=function(M,F,V=null){let G=this.compile(M,F,V);return new Promise(z=>{function ce(){if(G.forEach(function(xe){Le.get(xe).currentProgram.isReady()&&G.delete(xe)}),G.size===0){z(M);return}setTimeout(ce,10)}_e.get("KHR_parallel_shader_compile")!==null?ce():setTimeout(ce,10)})};let Ze=null;function ot(M){Ze&&Ze(M)}function mt(){At.stop()}function Je(){At.start()}let At=new hh;At.setAnimationLoop(ot),typeof self<"u"&&At.setContext(self),this.setAnimationLoop=function(M){Ze=M,De.setAnimationLoop(M),M===null?At.stop():At.start()},De.addEventListener("sessionstart",mt),De.addEventListener("sessionend",Je),this.render=function(M,F){if(F!==void 0&&F.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(T===!0)return;M.matrixWorldAutoUpdate===!0&&M.updateMatrixWorld(),F.parent===null&&F.matrixWorldAutoUpdate===!0&&F.updateMatrixWorld(),De.enabled===!0&&De.isPresenting===!0&&(De.cameraAutoUpdate===!0&&De.updateCamera(F),F=De.getCamera()),M.isScene===!0&&M.onBeforeRender(v,M,F,A),m=be.get(M,S.length),m.init(),S.push(m),me.multiplyMatrices(F.projectionMatrix,F.matrixWorldInverse),X.setFromProjectionMatrix(me),le=this.localClippingEnabled,j=Pe.init(this.clippingPlanes,le),y=he.get(M,f.length),y.init(),f.push(y),kt(M,F,0,v.sortObjects),y.finish(),v.sortObjects===!0&&y.sort(W,U),this.info.render.frame++,j===!0&&Pe.beginShadows();let V=m.state.shadowsArray;if(ee.render(V,M,F),j===!0&&Pe.endShadows(),this.info.autoReset===!0&&this.info.reset(),$e.render(y,M),m.setupLights(v._useLegacyLights),F.isArrayCamera){let G=F.cameras;for(let z=0,ce=G.length;z<ce;z++){let xe=G[z];Zo(y,M,xe,xe.viewport)}}else Zo(y,M,F);A!==null&&(w.updateMultisampleRenderTarget(A),w.updateRenderTargetMipmap(A)),M.isScene===!0&&M.onAfterRender(v,M,F),Re.resetDefaultState(),$=-1,x=null,S.pop(),S.length>0?m=S[S.length-1]:m=null,f.pop(),f.length>0?y=f[f.length-1]:y=null};function kt(M,F,V,G){if(M.visible===!1)return;if(M.layers.test(F.layers)){if(M.isGroup)V=M.renderOrder;else if(M.isLOD)M.autoUpdate===!0&&M.update(F);else if(M.isLight)m.pushLight(M),M.castShadow&&m.pushShadow(M);else if(M.isSprite){if(!M.frustumCulled||X.intersectsSprite(M)){G&&Ae.setFromMatrixPosition(M.matrixWorld).applyMatrix4(me);let xe=ie.update(M),Me=M.material;Me.visible&&y.push(M,xe,Me,V,Ae.z,null)}}else if((M.isMesh||M.isLine||M.isPoints)&&(!M.frustumCulled||X.intersectsObject(M))){let xe=ie.update(M),Me=M.material;if(G&&(M.boundingSphere!==void 0?(M.boundingSphere===null&&M.computeBoundingSphere(),Ae.copy(M.boundingSphere.center)):(xe.boundingSphere===null&&xe.computeBoundingSphere(),Ae.copy(xe.boundingSphere.center)),Ae.applyMatrix4(M.matrixWorld).applyMatrix4(me)),Array.isArray(Me)){let Te=xe.groups;for(let Oe=0,Ie=Te.length;Oe<Ie;Oe++){let ke=Te[Oe],ut=Me[ke.materialIndex];ut&&ut.visible&&y.push(M,xe,ut,V,Ae.z,ke)}}else Me.visible&&y.push(M,xe,Me,V,Ae.z,null)}}let ce=M.children;for(let xe=0,Me=ce.length;xe<Me;xe++)kt(ce[xe],F,V,G)}function Zo(M,F,V,G){let z=M.opaque,ce=M.transmissive,xe=M.transparent;m.setupLightsView(V),j===!0&&Pe.setGlobalState(v.clippingPlanes,V),ce.length>0&&Fh(z,ce,F,V),G&&de.viewport(b.copy(G)),z.length>0&&Fs(z,F,V),ce.length>0&&Fs(ce,F,V),xe.length>0&&Fs(xe,F,V),de.buffers.depth.setTest(!0),de.buffers.depth.setMask(!0),de.buffers.color.setMask(!0),de.setPolygonOffset(!1)}function Fh(M,F,V,G){if((V.isScene===!0?V.overrideMaterial:null)!==null)return;let ce=Ee.isWebGL2;ge===null&&(ge=new On(1,1,{generateMipmaps:!0,type:_e.has("EXT_color_buffer_half_float")?Ts:ei,minFilter:Es,samples:ce?4:0})),v.getDrawingBufferSize(Ce),ce?ge.setSize(Ce.x,Ce.y):ge.setSize(lo(Ce.x),lo(Ce.y));let xe=v.getRenderTarget();v.setRenderTarget(ge),v.getClearColor(K),P=v.getClearAlpha(),P<1&&v.setClearColor(16777215,.5),v.clear();let Me=v.toneMapping;v.toneMapping=Qn,Fs(M,V,G),w.updateMultisampleRenderTarget(ge),w.updateRenderTargetMipmap(ge);let Te=!1;for(let Oe=0,Ie=F.length;Oe<Ie;Oe++){let ke=F[Oe],ut=ke.object,Zt=ke.geometry,St=ke.material,Sn=ke.group;if(St.side===Ot&&ut.layers.test(G.layers)){let rt=St.side;St.side=Xt,St.needsUpdate=!0,Jo(ut,V,G,Zt,St,Sn),St.side=rt,St.needsUpdate=!0,Te=!0}}Te===!0&&(w.updateMultisampleRenderTarget(ge),w.updateRenderTargetMipmap(ge)),v.setRenderTarget(xe),v.setClearColor(K,P),v.toneMapping=Me}function Fs(M,F,V){let G=F.isScene===!0?F.overrideMaterial:null;for(let z=0,ce=M.length;z<ce;z++){let xe=M[z],Me=xe.object,Te=xe.geometry,Oe=G===null?xe.material:G,Ie=xe.group;Me.layers.test(V.layers)&&Jo(Me,F,V,Te,Oe,Ie)}}function Jo(M,F,V,G,z,ce){M.onBeforeRender(v,F,V,G,z,ce),M.modelViewMatrix.multiplyMatrices(V.matrixWorldInverse,M.matrixWorld),M.normalMatrix.getNormalMatrix(M.modelViewMatrix),z.onBeforeRender(v,F,V,G,M,ce),z.transparent===!0&&z.side===Ot&&z.forceSinglePass===!1?(z.side=Xt,z.needsUpdate=!0,v.renderBufferDirect(V,F,G,z,M,ce),z.side=ni,z.needsUpdate=!0,v.renderBufferDirect(V,F,G,z,M,ce),z.side=Ot):v.renderBufferDirect(V,F,G,z,M,ce),M.onAfterRender(v,F,V,G,z,ce)}function Ns(M,F,V){F.isScene!==!0&&(F=Se);let G=Le.get(M),z=m.state.lights,ce=m.state.shadowsArray,xe=z.state.version,Me=pe.getParameters(M,z.state,ce,F,V),Te=pe.getProgramCacheKey(Me),Oe=G.programs;G.environment=M.isMeshStandardMaterial?F.environment:null,G.fog=F.fog,G.envMap=(M.isMeshStandardMaterial?B:_).get(M.envMap||G.environment),Oe===void 0&&(M.addEventListener("dispose",se),Oe=new Map,G.programs=Oe);let Ie=Oe.get(Te);if(Ie!==void 0){if(G.currentProgram===Ie&&G.lightsStateVersion===xe)return jo(M,Me),Ie}else Me.uniforms=pe.getUniforms(M),M.onBuild(V,Me,v),M.onBeforeCompile(Me,v),Ie=pe.acquireProgram(Me,Te),Oe.set(Te,Ie),G.uniforms=Me.uniforms;let ke=G.uniforms;return(!M.isShaderMaterial&&!M.isRawShaderMaterial||M.clipping===!0)&&(ke.clippingPlanes=Pe.uniform),jo(M,Me),G.needsLights=Bh(M),G.lightsStateVersion=xe,G.needsLights&&(ke.ambientLightColor.value=z.state.ambient,ke.lightProbe.value=z.state.probe,ke.directionalLights.value=z.state.directional,ke.directionalLightShadows.value=z.state.directionalShadow,ke.spotLights.value=z.state.spot,ke.spotLightShadows.value=z.state.spotShadow,ke.rectAreaLights.value=z.state.rectArea,ke.ltc_1.value=z.state.rectAreaLTC1,ke.ltc_2.value=z.state.rectAreaLTC2,ke.pointLights.value=z.state.point,ke.pointLightShadows.value=z.state.pointShadow,ke.hemisphereLights.value=z.state.hemi,ke.directionalShadowMap.value=z.state.directionalShadowMap,ke.directionalShadowMatrix.value=z.state.directionalShadowMatrix,ke.spotShadowMap.value=z.state.spotShadowMap,ke.spotLightMatrix.value=z.state.spotLightMatrix,ke.spotLightMap.value=z.state.spotLightMap,ke.pointShadowMap.value=z.state.pointShadowMap,ke.pointShadowMatrix.value=z.state.pointShadowMatrix),G.currentProgram=Ie,G.uniformsList=null,Ie}function Ko(M){if(M.uniformsList===null){let F=M.currentProgram.getUniforms();M.uniformsList=Qi.seqWithValue(F.seq,M.uniforms)}return M.uniformsList}function jo(M,F){let V=Le.get(M);V.outputColorSpace=F.outputColorSpace,V.batching=F.batching,V.instancing=F.instancing,V.instancingColor=F.instancingColor,V.skinning=F.skinning,V.morphTargets=F.morphTargets,V.morphNormals=F.morphNormals,V.morphColors=F.morphColors,V.morphTargetsCount=F.morphTargetsCount,V.numClippingPlanes=F.numClippingPlanes,V.numIntersection=F.numClipIntersection,V.vertexAlphas=F.vertexAlphas,V.vertexTangents=F.vertexTangents,V.toneMapping=F.toneMapping}function Nh(M,F,V,G,z){F.isScene!==!0&&(F=Se),w.resetTextureUnits();let ce=F.fog,xe=G.isMeshStandardMaterial?F.environment:null,Me=A===null?v.outputColorSpace:A.isXRRenderTarget===!0?A.texture.colorSpace:Nn,Te=(G.isMeshStandardMaterial?B:_).get(G.envMap||xe),Oe=G.vertexColors===!0&&!!V.attributes.color&&V.attributes.color.itemSize===4,Ie=!!V.attributes.tangent&&(!!G.normalMap||G.anisotropy>0),ke=!!V.morphAttributes.position,ut=!!V.morphAttributes.normal,Zt=!!V.morphAttributes.color,St=Qn;G.toneMapped&&(A===null||A.isXRRenderTarget===!0)&&(St=v.toneMapping);let Sn=V.morphAttributes.position||V.morphAttributes.normal||V.morphAttributes.color,rt=Sn!==void 0?Sn.length:0,He=Le.get(G),aa=m.state.lights;if(j===!0&&(le===!0||M!==x)){let tn=M===x&&G.id===$;Pe.setState(G,M,tn)}let lt=!1;G.version===He.__version?(He.needsLights&&He.lightsStateVersion!==aa.state.version||He.outputColorSpace!==Me||z.isBatchedMesh&&He.batching===!1||!z.isBatchedMesh&&He.batching===!0||z.isInstancedMesh&&He.instancing===!1||!z.isInstancedMesh&&He.instancing===!0||z.isSkinnedMesh&&He.skinning===!1||!z.isSkinnedMesh&&He.skinning===!0||z.isInstancedMesh&&He.instancingColor===!0&&z.instanceColor===null||z.isInstancedMesh&&He.instancingColor===!1&&z.instanceColor!==null||He.envMap!==Te||G.fog===!0&&He.fog!==ce||He.numClippingPlanes!==void 0&&(He.numClippingPlanes!==Pe.numPlanes||He.numIntersection!==Pe.numIntersection)||He.vertexAlphas!==Oe||He.vertexTangents!==Ie||He.morphTargets!==ke||He.morphNormals!==ut||He.morphColors!==Zt||He.toneMapping!==St||Ee.isWebGL2===!0&&He.morphTargetsCount!==rt)&&(lt=!0):(lt=!0,He.__version=G.version);let oi=He.currentProgram;lt===!0&&(oi=Ns(G,F,z));let Qo=!1,us=!1,oa=!1,It=oi.getUniforms(),li=He.uniforms;if(de.useProgram(oi.program)&&(Qo=!0,us=!0,oa=!0),G.id!==$&&($=G.id,us=!0),Qo||x!==M){It.setValue(O,"projectionMatrix",M.projectionMatrix),It.setValue(O,"viewMatrix",M.matrixWorldInverse);let tn=It.map.cameraPosition;tn!==void 0&&tn.setValue(O,Ae.setFromMatrixPosition(M.matrixWorld)),Ee.logarithmicDepthBuffer&&It.setValue(O,"logDepthBufFC",2/(Math.log(M.far+1)/Math.LN2)),(G.isMeshPhongMaterial||G.isMeshToonMaterial||G.isMeshLambertMaterial||G.isMeshBasicMaterial||G.isMeshStandardMaterial||G.isShaderMaterial)&&It.setValue(O,"isOrthographic",M.isOrthographicCamera===!0),x!==M&&(x=M,us=!0,oa=!0)}if(z.isSkinnedMesh){It.setOptional(O,z,"bindMatrix"),It.setOptional(O,z,"bindMatrixInverse");let tn=z.skeleton;tn&&(Ee.floatVertexTextures?(tn.boneTexture===null&&tn.computeBoneTexture(),It.setValue(O,"boneTexture",tn.boneTexture,w)):console.warn("THREE.WebGLRenderer: SkinnedMesh can only be used with WebGL 2. With WebGL 1 OES_texture_float and vertex textures support is required."))}z.isBatchedMesh&&(It.setOptional(O,z,"batchingTexture"),It.setValue(O,"batchingTexture",z._matricesTexture,w));let la=V.morphAttributes;if((la.position!==void 0||la.normal!==void 0||la.color!==void 0&&Ee.isWebGL2===!0)&&Fe.update(z,V,oi),(us||He.receiveShadow!==z.receiveShadow)&&(He.receiveShadow=z.receiveShadow,It.setValue(O,"receiveShadow",z.receiveShadow)),G.isMeshGouraudMaterial&&G.envMap!==null&&(li.envMap.value=Te,li.flipEnvMap.value=Te.isCubeTexture&&Te.isRenderTargetTexture===!1?-1:1),us&&(It.setValue(O,"toneMappingExposure",v.toneMappingExposure),He.needsLights&&Oh(li,oa),ce&&G.fog===!0&&oe.refreshFogUniforms(li,ce),oe.refreshMaterialUniforms(li,G,J,q,ge),Qi.upload(O,Ko(He),li,w)),G.isShaderMaterial&&G.uniformsNeedUpdate===!0&&(Qi.upload(O,Ko(He),li,w),G.uniformsNeedUpdate=!1),G.isSpriteMaterial&&It.setValue(O,"center",z.center),It.setValue(O,"modelViewMatrix",z.modelViewMatrix),It.setValue(O,"normalMatrix",z.normalMatrix),It.setValue(O,"modelMatrix",z.matrixWorld),G.isShaderMaterial||G.isRawShaderMaterial){let tn=G.uniformsGroups;for(let ca=0,Hh=tn.length;ca<Hh;ca++)if(Ee.isWebGL2){let el=tn[ca];qe.update(el,oi),qe.bind(el,oi)}else console.warn("THREE.WebGLRenderer: Uniform Buffer Objects can only be used with WebGL 2.")}return oi}function Oh(M,F){M.ambientLightColor.needsUpdate=F,M.lightProbe.needsUpdate=F,M.directionalLights.needsUpdate=F,M.directionalLightShadows.needsUpdate=F,M.pointLights.needsUpdate=F,M.pointLightShadows.needsUpdate=F,M.spotLights.needsUpdate=F,M.spotLightShadows.needsUpdate=F,M.rectAreaLights.needsUpdate=F,M.hemisphereLights.needsUpdate=F}function Bh(M){return M.isMeshLambertMaterial||M.isMeshToonMaterial||M.isMeshPhongMaterial||M.isMeshStandardMaterial||M.isShadowMaterial||M.isShaderMaterial&&M.lights===!0}this.getActiveCubeFace=function(){return R},this.getActiveMipmapLevel=function(){return C},this.getRenderTarget=function(){return A},this.setRenderTargetTextures=function(M,F,V){Le.get(M.texture).__webglTexture=F,Le.get(M.depthTexture).__webglTexture=V;let G=Le.get(M);G.__hasExternalTextures=!0,G.__hasExternalTextures&&(G.__autoAllocateDepthBuffer=V===void 0,G.__autoAllocateDepthBuffer||_e.has("WEBGL_multisampled_render_to_texture")===!0&&(console.warn("THREE.WebGLRenderer: Render-to-texture extension was disabled because an external texture was provided"),G.__useRenderToTexture=!1))},this.setRenderTargetFramebuffer=function(M,F){let V=Le.get(M);V.__webglFramebuffer=F,V.__useDefaultFramebuffer=F===void 0},this.setRenderTarget=function(M,F=0,V=0){A=M,R=F,C=V;let G=!0,z=null,ce=!1,xe=!1;if(M){let Te=Le.get(M);Te.__useDefaultFramebuffer!==void 0?(de.bindFramebuffer(O.FRAMEBUFFER,null),G=!1):Te.__webglFramebuffer===void 0?w.setupRenderTarget(M):Te.__hasExternalTextures&&w.rebindTextures(M,Le.get(M.texture).__webglTexture,Le.get(M.depthTexture).__webglTexture);let Oe=M.texture;(Oe.isData3DTexture||Oe.isDataArrayTexture||Oe.isCompressedArrayTexture)&&(xe=!0);let Ie=Le.get(M).__webglFramebuffer;M.isWebGLCubeRenderTarget?(Array.isArray(Ie[F])?z=Ie[F][V]:z=Ie[F],ce=!0):Ee.isWebGL2&&M.samples>0&&w.useMultisampledRTT(M)===!1?z=Le.get(M).__webglMultisampledFramebuffer:Array.isArray(Ie)?z=Ie[V]:z=Ie,b.copy(M.viewport),L.copy(M.scissor),N=M.scissorTest}else b.copy(Y).multiplyScalar(J).floor(),L.copy(ne).multiplyScalar(J).floor(),N=ae;if(de.bindFramebuffer(O.FRAMEBUFFER,z)&&Ee.drawBuffers&&G&&de.drawBuffers(M,z),de.viewport(b),de.scissor(L),de.setScissorTest(N),ce){let Te=Le.get(M.texture);O.framebufferTexture2D(O.FRAMEBUFFER,O.COLOR_ATTACHMENT0,O.TEXTURE_CUBE_MAP_POSITIVE_X+F,Te.__webglTexture,V)}else if(xe){let Te=Le.get(M.texture),Oe=F||0;O.framebufferTextureLayer(O.FRAMEBUFFER,O.COLOR_ATTACHMENT0,Te.__webglTexture,V||0,Oe)}$=-1},this.readRenderTargetPixels=function(M,F,V,G,z,ce,xe){if(!(M&&M.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Me=Le.get(M).__webglFramebuffer;if(M.isWebGLCubeRenderTarget&&xe!==void 0&&(Me=Me[xe]),Me){de.bindFramebuffer(O.FRAMEBUFFER,Me);try{let Te=M.texture,Oe=Te.format,Ie=Te.type;if(Oe!==mn&&ue.convert(Oe)!==O.getParameter(O.IMPLEMENTATION_COLOR_READ_FORMAT)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}let ke=Ie===Ts&&(_e.has("EXT_color_buffer_half_float")||Ee.isWebGL2&&_e.has("EXT_color_buffer_float"));if(Ie!==ei&&ue.convert(Ie)!==O.getParameter(O.IMPLEMENTATION_COLOR_READ_TYPE)&&!(Ie===Jn&&(Ee.isWebGL2||_e.has("OES_texture_float")||_e.has("WEBGL_color_buffer_float")))&&!ke){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}F>=0&&F<=M.width-G&&V>=0&&V<=M.height-z&&O.readPixels(F,V,G,z,ue.convert(Oe),ue.convert(Ie),ce)}finally{let Te=A!==null?Le.get(A).__webglFramebuffer:null;de.bindFramebuffer(O.FRAMEBUFFER,Te)}}},this.copyFramebufferToTexture=function(M,F,V=0){let G=Math.pow(2,-V),z=Math.floor(F.image.width*G),ce=Math.floor(F.image.height*G);w.setTexture2D(F,0),O.copyTexSubImage2D(O.TEXTURE_2D,V,0,0,M.x,M.y,z,ce),de.unbindTexture()},this.copyTextureToTexture=function(M,F,V,G=0){let z=F.image.width,ce=F.image.height,xe=ue.convert(V.format),Me=ue.convert(V.type);w.setTexture2D(V,0),O.pixelStorei(O.UNPACK_FLIP_Y_WEBGL,V.flipY),O.pixelStorei(O.UNPACK_PREMULTIPLY_ALPHA_WEBGL,V.premultiplyAlpha),O.pixelStorei(O.UNPACK_ALIGNMENT,V.unpackAlignment),F.isDataTexture?O.texSubImage2D(O.TEXTURE_2D,G,M.x,M.y,z,ce,xe,Me,F.image.data):F.isCompressedTexture?O.compressedTexSubImage2D(O.TEXTURE_2D,G,M.x,M.y,F.mipmaps[0].width,F.mipmaps[0].height,xe,F.mipmaps[0].data):O.texSubImage2D(O.TEXTURE_2D,G,M.x,M.y,xe,Me,F.image),G===0&&V.generateMipmaps&&O.generateMipmap(O.TEXTURE_2D),de.unbindTexture()},this.copyTextureToTexture3D=function(M,F,V,G,z=0){if(v.isWebGL1Renderer){console.warn("THREE.WebGLRenderer.copyTextureToTexture3D: can only be used with WebGL2.");return}let ce=M.max.x-M.min.x+1,xe=M.max.y-M.min.y+1,Me=M.max.z-M.min.z+1,Te=ue.convert(G.format),Oe=ue.convert(G.type),Ie;if(G.isData3DTexture)w.setTexture3D(G,0),Ie=O.TEXTURE_3D;else if(G.isDataArrayTexture||G.isCompressedArrayTexture)w.setTexture2DArray(G,0),Ie=O.TEXTURE_2D_ARRAY;else{console.warn("THREE.WebGLRenderer.copyTextureToTexture3D: only supports THREE.DataTexture3D and THREE.DataTexture2DArray.");return}O.pixelStorei(O.UNPACK_FLIP_Y_WEBGL,G.flipY),O.pixelStorei(O.UNPACK_PREMULTIPLY_ALPHA_WEBGL,G.premultiplyAlpha),O.pixelStorei(O.UNPACK_ALIGNMENT,G.unpackAlignment);let ke=O.getParameter(O.UNPACK_ROW_LENGTH),ut=O.getParameter(O.UNPACK_IMAGE_HEIGHT),Zt=O.getParameter(O.UNPACK_SKIP_PIXELS),St=O.getParameter(O.UNPACK_SKIP_ROWS),Sn=O.getParameter(O.UNPACK_SKIP_IMAGES),rt=V.isCompressedTexture?V.mipmaps[z]:V.image;O.pixelStorei(O.UNPACK_ROW_LENGTH,rt.width),O.pixelStorei(O.UNPACK_IMAGE_HEIGHT,rt.height),O.pixelStorei(O.UNPACK_SKIP_PIXELS,M.min.x),O.pixelStorei(O.UNPACK_SKIP_ROWS,M.min.y),O.pixelStorei(O.UNPACK_SKIP_IMAGES,M.min.z),V.isDataTexture||V.isData3DTexture?O.texSubImage3D(Ie,z,F.x,F.y,F.z,ce,xe,Me,Te,Oe,rt.data):V.isCompressedArrayTexture?(console.warn("THREE.WebGLRenderer.copyTextureToTexture3D: untested support for compressed srcTexture."),O.compressedTexSubImage3D(Ie,z,F.x,F.y,F.z,ce,xe,Me,Te,rt.data)):O.texSubImage3D(Ie,z,F.x,F.y,F.z,ce,xe,Me,Te,Oe,rt),O.pixelStorei(O.UNPACK_ROW_LENGTH,ke),O.pixelStorei(O.UNPACK_IMAGE_HEIGHT,ut),O.pixelStorei(O.UNPACK_SKIP_PIXELS,Zt),O.pixelStorei(O.UNPACK_SKIP_ROWS,St),O.pixelStorei(O.UNPACK_SKIP_IMAGES,Sn),z===0&&G.generateMipmaps&&O.generateMipmap(Ie),de.unbindTexture()},this.initTexture=function(M){M.isCubeTexture?w.setTextureCube(M,0):M.isData3DTexture?w.setTexture3D(M,0):M.isDataArrayTexture||M.isCompressedArrayTexture?w.setTexture2DArray(M,0):w.setTexture2D(M,0),de.unbindTexture()},this.resetState=function(){R=0,C=0,A=null,de.reset(),Re.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Un}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=e===Ho?"display-p3":"srgb",t.unpackColorSpace=je.workingColorSpace===$r?"display-p3":"srgb"}get outputEncoding(){return console.warn("THREE.WebGLRenderer: Property .outputEncoding has been removed. Use .outputColorSpace instead."),this.outputColorSpace===Ye?xi:rh}set outputEncoding(e){console.warn("THREE.WebGLRenderer: Property .outputEncoding has been removed. Use .outputColorSpace instead."),this.outputColorSpace=e===xi?Ye:Nn}get useLegacyLights(){return console.warn("THREE.WebGLRenderer: The property .useLegacyLights has been deprecated. Migrate your lighting according to the following guide: https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733."),this._useLegacyLights}set useLegacyLights(e){console.warn("THREE.WebGLRenderer: The property .useLegacyLights has been deprecated. Migrate your lighting according to the following guide: https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733."),this._useLegacyLights=e}},Eo=class extends Ps{};Eo.prototype.isWebGL1Renderer=!0;var Vr=class extends on{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t}},To=class{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=ro,this._updateRange={offset:0,count:-1},this.updateRanges=[],this.version=0,this.uuid=ti()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}get updateRange(){return console.warn("THREE.InterleavedBuffer: updateRange() is deprecated and will be removed in r169. Use addUpdateRange() instead."),this._updateRange}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let i=0,r=this.stride;i<r;i++)this.array[e+i]=t.array[n+i];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=ti()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);let t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=ti()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}},Ut=new k,Gr=class s{constructor(e,t,n,i=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=n,this.normalized=i}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)Ut.fromBufferAttribute(this,t),Ut.applyMatrix4(e),this.setXYZ(t,Ut.x,Ut.y,Ut.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Ut.fromBufferAttribute(this,t),Ut.applyNormalMatrix(e),this.setXYZ(t,Ut.x,Ut.y,Ut.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Ut.fromBufferAttribute(this,t),Ut.transformDirection(e),this.setXYZ(t,Ut.x,Ut.y,Ut.z);return this}setX(e,t){return this.normalized&&(t=et(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=et(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=et(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=et(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=kn(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=kn(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=kn(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=kn(t,this.array)),t}setXY(e,t,n){return e=e*this.data.stride+this.offset,this.normalized&&(t=et(t,this.array),n=et(n,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,i){return e=e*this.data.stride+this.offset,this.normalized&&(t=et(t,this.array),n=et(n,this.array),i=et(i,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this}setXYZW(e,t,n,i,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=et(t,this.array),n=et(n,this.array),i=et(i,this.array),r=et(r,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this.data.array[e+3]=r,this}clone(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[i+r])}return new Qt(new this.array.constructor(t),this.itemSize,this.normalized)}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new s(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[i+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}},as=class extends Si{constructor(e){super(),this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new Ge(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},$i,_s=new k,qi=new k,Yi=new k,Zi=new Ue,bs=new Ue,gh=new Pt,xr=new k,Ss=new k,_r=new k,$c=new Ue,Qa=new Ue,qc=new Ue,Is=class extends on{constructor(e=new as){if(super(),this.isSprite=!0,this.type="Sprite",$i===void 0){$i=new si;let t=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),n=new To(t,5);$i.setIndex([0,1,2,0,2,3]),$i.setAttribute("position",new Gr(n,3,0,!1)),$i.setAttribute("uv",new Gr(n,2,3,!1))}this.geometry=$i,this.material=e,this.center=new Ue(.5,.5)}raycast(e,t){e.camera===null&&console.error('THREE.Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),qi.setFromMatrixScale(this.matrixWorld),gh.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),Yi.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&qi.multiplyScalar(-Yi.z);let n=this.material.rotation,i,r;n!==0&&(r=Math.cos(n),i=Math.sin(n));let o=this.center;br(xr.set(-.5,-.5,0),Yi,o,qi,i,r),br(Ss.set(.5,-.5,0),Yi,o,qi,i,r),br(_r.set(.5,.5,0),Yi,o,qi,i,r),$c.set(0,0),Qa.set(1,0),qc.set(1,1);let a=e.ray.intersectTriangle(xr,Ss,_r,!1,_s);if(a===null&&(br(Ss.set(-.5,.5,0),Yi,o,qi,i,r),Qa.set(0,1),a=e.ray.intersectTriangle(xr,_r,Ss,!1,_s),a===null))return;let l=e.ray.origin.distanceTo(_s);l<e.near||l>e.far||t.push({distance:l,point:_s.clone(),uv:gi.getInterpolation(_s,xr,Ss,_r,$c,Qa,qc,new Ue),face:null,object:this})}copy(e,t){return super.copy(e,t),e.center!==void 0&&this.center.copy(e.center),this.material=e.material,this}};function br(s,e,t,n,i,r){Zi.subVectors(s,t).addScalar(.5).multiply(n),i!==void 0?(bs.x=r*Zi.x-i*Zi.y,bs.y=i*Zi.x+r*Zi.y):bs.copy(Zi),s.copy(e),s.x+=bs.x,s.y+=bs.y,s.applyMatrix4(gh)}var Hn=class extends Tt{constructor(e,t,n,i,r,o,a,l,c){super(e,t,n,i,r,o,a,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}};function Sr(s,e,t){return!s||!t&&s.constructor===e?s:typeof e.BYTES_PER_ELEMENT=="number"?new e(s):Array.prototype.slice.call(s)}function _y(s){return ArrayBuffer.isView(s)&&!(s instanceof DataView)}var os=class{constructor(e,t,n,i){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new t.constructor(n),this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,i=t[n],r=t[n-1];n:{e:{let o;t:{i:if(!(e<i)){for(let a=n+2;;){if(i===void 0){if(e<r)break i;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(r=i,i=t[++n],e<i)break e}o=t.length;break t}if(!(e>=r)){let a=t[1];e<a&&(n=2,r=a);for(let l=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(i=r,r=t[--n-1],e>=r)break e}o=n,n=0;break t}break n}for(;n<o;){let a=n+o>>>1;e<t[a]?o=a:n=a+1}if(i=t[n],r=t[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,i)}return this.interpolate_(n,r,e,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=e*i;for(let o=0;o!==i;++o)t[o]=n[r+o];return t}interpolate_(){throw new Error("call to abstract method")}intervalChanged_(){}},Ao=class extends os{constructor(e,t,n,i){super(e,t,n,i),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:ic,endingEnd:ic}}intervalChanged_(e,t,n){let i=this.parameterPositions,r=e-2,o=e+1,a=i[r],l=i[o];if(a===void 0)switch(this.getSettings_().endingStart){case sc:r=e,a=2*t-n;break;case rc:r=i.length-2,a=t+i[r]-i[r+1];break;default:r=e,a=n}if(l===void 0)switch(this.getSettings_().endingEnd){case sc:o=e,l=2*n-t;break;case rc:o=1,l=n+i[1]-i[0];break;default:o=e-1,l=t}let c=(n-t)*.5,h=this.valueSize;this._weightPrev=c/(t-a),this._weightNext=c/(l-n),this._offsetPrev=r*h,this._offsetNext=o*h}interpolate_(e,t,n,i){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=e*a,c=l-a,h=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,p=this._weightNext,g=(n-t)/(i-t),y=g*g,m=y*g,f=-d*m+2*d*y-d*g,S=(1+d)*m+(-1.5-2*d)*y+(-.5+d)*g+1,v=(-1-p)*m+(1.5+p)*y+.5*g,T=p*m-p*y;for(let R=0;R!==a;++R)r[R]=f*o[h+R]+S*o[c+R]+v*o[l+R]+T*o[u+R];return r}},Co=class extends os{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=e*a,c=l-a,h=(n-t)/(i-t),u=1-h;for(let d=0;d!==a;++d)r[d]=o[c+d]*u+o[l+d]*h;return r}},Ro=class extends os{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e){return this.copySampleValue_(e-1)}},gn=class{constructor(e,t,n,i){if(e===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=Sr(t,this.TimeBufferType),this.values=Sr(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:Sr(e.times,Array),values:Sr(e.values,Array)};let i=e.getInterpolation();i!==e.DefaultInterpolation&&(n.interpolation=i)}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new Ro(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new Co(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new Ao(this.times,this.values,this.getValueSize(),e)}setInterpolation(e){let t;switch(e){case wr:t=this.InterpolantFactoryMethodDiscrete;break;case Er:t=this.InterpolantFactoryMethodLinear;break;case Ca:t=this.InterpolantFactoryMethodSmooth;break}if(t===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return console.warn("THREE.KeyframeTrack:",n),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return wr;case this.InterpolantFactoryMethodLinear:return Er;case this.InterpolantFactoryMethodSmooth:return Ca}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]*=e}return this}trim(e,t){let n=this.times,i=n.length,r=0,o=i-1;for(;r!==i&&n[r]<e;)++r;for(;o!==-1&&n[o]>t;)--o;if(++o,r!==0||o!==i){r>=o&&(o=Math.max(o,1),r=o-1);let a=this.getValueSize();this.times=n.slice(r,o),this.values=this.values.slice(r*a,o*a)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(console.error("THREE.KeyframeTrack: Invalid value size in track.",this),e=!1);let n=this.times,i=this.values,r=n.length;r===0&&(console.error("THREE.KeyframeTrack: Track is empty.",this),e=!1);let o=null;for(let a=0;a!==r;a++){let l=n[a];if(typeof l=="number"&&isNaN(l)){console.error("THREE.KeyframeTrack: Time is not a valid number.",this,a,l),e=!1;break}if(o!==null&&o>l){console.error("THREE.KeyframeTrack: Out of order keys.",this,a,l,o),e=!1;break}o=l}if(i!==void 0&&_y(i))for(let a=0,l=i.length;a!==l;++a){let c=i[a];if(isNaN(c)){console.error("THREE.KeyframeTrack: Value is not a valid number.",this,a,c),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===Ca,r=e.length-1,o=1;for(let a=1;a<r;++a){let l=!1,c=e[a],h=e[a+1];if(c!==h&&(a!==1||c!==e[0]))if(i)l=!0;else{let u=a*n,d=u-n,p=u+n;for(let g=0;g!==n;++g){let y=t[u+g];if(y!==t[d+g]||y!==t[p+g]){l=!0;break}}}if(l){if(a!==o){e[o]=e[a];let u=a*n,d=o*n;for(let p=0;p!==n;++p)t[d+p]=t[u+p]}++o}}if(r>0){e[o]=e[r];for(let a=r*n,l=o*n,c=0;c!==n;++c)t[l+c]=t[a+c];++o}return o!==e.length?(this.times=e.slice(0,o),this.values=t.slice(0,o*n)):(this.times=e,this.values=t),this}clone(){let e=this.times.slice(),t=this.values.slice(),n=this.constructor,i=new n(this.name,e,t);return i.createInterpolant=this.createInterpolant,i}};gn.prototype.TimeBufferType=Float32Array;gn.prototype.ValueBufferType=Float32Array;gn.prototype.DefaultInterpolation=Er;var Mi=class extends gn{};Mi.prototype.ValueTypeName="bool";Mi.prototype.ValueBufferType=Array;Mi.prototype.DefaultInterpolation=wr;Mi.prototype.InterpolantFactoryMethodLinear=void 0;Mi.prototype.InterpolantFactoryMethodSmooth=void 0;var Po=class extends gn{};Po.prototype.ValueTypeName="color";var Io=class extends gn{};Io.prototype.ValueTypeName="number";var Lo=class extends os{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=(n-t)/(i-t),c=e*a;for(let h=c+a;c!==h;c+=4)$t.slerpFlat(r,0,o,c-a,o,c,l);return r}},Ls=class extends gn{InterpolantFactoryMethodLinear(e){return new Lo(this.times,this.values,this.getValueSize(),e)}};Ls.prototype.ValueTypeName="quaternion";Ls.prototype.DefaultInterpolation=Er;Ls.prototype.InterpolantFactoryMethodSmooth=void 0;var wi=class extends gn{};wi.prototype.ValueTypeName="string";wi.prototype.ValueBufferType=Array;wi.prototype.DefaultInterpolation=wr;wi.prototype.InterpolantFactoryMethodLinear=void 0;wi.prototype.InterpolantFactoryMethodSmooth=void 0;var Do=class extends gn{};Do.prototype.ValueTypeName="vector";var ko=class{constructor(e,t,n){let i=this,r=!1,o=0,a=0,l,c=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this.itemStart=function(h){a++,r===!1&&i.onStart!==void 0&&i.onStart(h,o,a),r=!0},this.itemEnd=function(h){o++,i.onProgress!==void 0&&i.onProgress(h,o,a),o===a&&(r=!1,i.onLoad!==void 0&&i.onLoad())},this.itemError=function(h){i.onError!==void 0&&i.onError(h)},this.resolveURL=function(h){return l?l(h):h},this.setURLModifier=function(h){return l=h,this},this.addHandler=function(h,u){return c.push(h,u),this},this.removeHandler=function(h){let u=c.indexOf(h);return u!==-1&&c.splice(u,2),this},this.getHandler=function(h){for(let u=0,d=c.length;u<d;u+=2){let p=c[u],g=c[u+1];if(p.global&&(p.lastIndex=0),p.test(h))return g}return null}}},by=new ko,Uo=class{constructor(e){this.manager=e!==void 0?e:by,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(e,t){let n=this;return new Promise(function(i,r){n.load(e,i,t,r)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}};Uo.DEFAULT_MATERIAL_NAME="__DEFAULT";var Vo="\\[\\]\\.:\\/",Sy=new RegExp("["+Vo+"]","g"),Go="[^"+Vo+"]",My="[^"+Vo.replace("\\.","")+"]",wy=/((?:WC+[\/:])*)/.source.replace("WC",Go),Ey=/(WCOD+)?/.source.replace("WCOD",My),Ty=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Go),Ay=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Go),Cy=new RegExp("^"+wy+Ey+Ty+Ay+"$"),Ry=["material","materials","bones","map"],Fo=class{constructor(e,t,n){let i=n||it.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,i)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,i=this._bindings[n];i!==void 0&&i.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let i=this._targetGroup.nCachedObjects_,r=n.length;i!==r;++i)n[i].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}},it=class s{constructor(e,t,n){this.path=t,this.parsedPath=n||s.parseTrackName(t),this.node=s.findNode(e,this.parsedPath.nodeName),this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,n){return e&&e.isAnimationObjectGroup?new s.Composite(e,t,n):new s(e,t,n)}static sanitizeNodeName(e){return e.replace(/\s/g,"_").replace(Sy,"")}static parseTrackName(e){let t=Cy.exec(e);if(t===null)throw new Error("PropertyBinding: Cannot parse trackName: "+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){let r=n.nodeName.substring(i+1);Ry.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,i),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("PropertyBinding: can not parse propertyName from trackName: "+e);return n}static findNode(e,t){if(t===void 0||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(r){for(let o=0;o<r.length;o++){let a=r[o];if(a.name===t||a.uuid===t)return a;let l=n(a.children);if(l)return l}return null},i=n(e.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)e[t++]=n[i]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node,t=this.parsedPath,n=t.objectName,i=t.propertyName,r=t.propertyIndex;if(e||(e=s.findNode(this.rootNode,t.nodeName),this.node=e),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e){console.warn("THREE.PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=t.objectIndex;switch(n){case"materials":if(!e.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.materials){console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}e=e.material.materials;break;case"bones":if(!e.skeleton){console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}e=e.skeleton.bones;for(let h=0;h<e.length;h++)if(e[h].name===c){c=h;break}break;case"map":if("map"in e){e=e.map;break}if(!e.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.map){console.error("THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}e=e.material.map;break;default:if(e[n]===void 0){console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.",this);return}e=e[n]}if(c!==void 0){if(e[c]===void 0){console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,e);return}e=e[c]}}let o=e[i];if(o===void 0){let c=t.nodeName;console.error("THREE.PropertyBinding: Trying to update property for track: "+c+"."+i+" but it wasn't found.",e);return}let a=this.Versioning.None;this.targetObject=e,e.needsUpdate!==void 0?a=this.Versioning.NeedsUpdate:e.matrixWorldNeedsUpdate!==void 0&&(a=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(r!==void 0){if(i==="morphTargetInfluences"){if(!e.geometry){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!e.geometry.morphAttributes){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}e.morphTargetDictionary[r]!==void 0&&(r=e.morphTargetDictionary[r])}l=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=r}else o.fromArray!==void 0&&o.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(l=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=i;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][a]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};it.Composite=Fo;it.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};it.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};it.prototype.GetterByBindingType=[it.prototype._getValue_direct,it.prototype._getValue_array,it.prototype._getValue_arrayElement,it.prototype._getValue_toArray];it.prototype.SetterByBindingTypeAndVersioning=[[it.prototype._setValue_direct,it.prototype._setValue_direct_setNeedsUpdate,it.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[it.prototype._setValue_array,it.prototype._setValue_array_setNeedsUpdate,it.prototype._setValue_array_setMatrixWorldNeedsUpdate],[it.prototype._setValue_arrayElement,it.prototype._setValue_arrayElement_setNeedsUpdate,it.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[it.prototype._setValue_fromArray,it.prototype._setValue_fromArray_setNeedsUpdate,it.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var Bv=new Float32Array(1);var Wr=class{constructor(e,t,n=0,i=1/0){this.ray=new kr(e,t),this.near=n,this.far=i,this.camera=null,this.layers=new Cs,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(e,t){this.ray.set(e,t)}setFromCamera(e,t){t.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(e.x,e.y,.5).unproject(t).sub(this.ray.origin).normalize(),this.camera=t):t.isOrthographicCamera?(this.ray.origin.set(e.x,e.y,(t.near+t.far)/(t.near-t.far)).unproject(t),this.ray.direction.set(0,0,-1).transformDirection(t.matrixWorld),this.camera=t):console.error("THREE.Raycaster: Unsupported camera type: "+t.type)}intersectObject(e,t=!0,n=[]){return No(e,this,n,t),n.sort(Yc),n}intersectObjects(e,t=!0,n=[]){for(let i=0,r=e.length;i<r;i++)No(e[i],this,n,t);return n.sort(Yc),n}};function Yc(s,e){return s.distance-e.distance}function No(s,e,t,n){if(s.layers.test(e.layers)&&s.raycast(e,t),n===!0){let i=s.children;for(let r=0,o=i.length;r<o;r++)No(i[r],e,t,!0)}}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:Oo}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=Oo);function yh(s,e){let t=s.length,n=s.reduce((r,o)=>r+o,0);if(t<=1||!(e>0)||e===1)return[...s];let i=r=>n*Math.pow(r/t,1/e);return s.map((r,o)=>i(o+1)-i(o))}var vh=Math.PI/180;function xh(s,e){return[s[0]-e[0],s[1]-e[1],s[2]-e[2]]}function Wo(s,e){return s[0]*e[0]+s[1]*e[1]+s[2]*e[2]}function _h(s,e){return[s[1]*e[2]-s[2]*e[1],s[2]*e[0]-s[0]*e[2],s[0]*e[1]-s[1]*e[0]]}function bh(s){let e=Math.hypot(s[0],s[1],s[2])||1;return[s[0]/e,s[1]/e,s[2]/e]}function Sh(s){return{x:s.left+s.right-1,y:1-(s.top+s.bottom)}}function Xo(s){let e=Sh(s);return{offsetX:-e.x,offsetY:-e.y}}function Mh(s){let e=bh(xh(s.target,s.eye)),t=bh(_h(e,[0,1,0])),n=_h(t,e),i=Math.tan(s.baseFov*vh/2),r=s.rect,o=Sh(r),a=[],l=[];for(let L of s.points){let N=xh(L,s.eye),K=Wo(N,e);K<=1e-6||(a.push(Wo(N,t)/K),l.push(Wo(N,n)/K))}if(a.length===0)return{fov:s.baseFov,...Xo(r)};let c=Math.min(...a),h=Math.max(...a),u=Math.min(...l),d=Math.max(...l),p=Math.max(.001,2*(r.right-r.left)),g=Math.max(.001,2*(r.bottom-r.top)),y=Math.max((h-c)/(s.aspect*p),(d-u)/g),m=i*Math.max(1,s.maxZoomOut),f=i*s.cover,S=1-2*r.top,v=1-2*r.bottom,T=L=>[Math.max(d-S*L,L-f),Math.min(u-v*L,f-L)],R=Math.min(m,Math.max(i,y));for(let L=0;L<48&&R<m;L++){let[N,K]=T(R);if(N<=K)break;R=Math.min(m,R+(m-i)/32)}let C=(c+h)/2-o.x*R*s.aspect,[A,$]=T(R),x=(u+d)/2-o.y*R,b=A<=$?Math.min($,Math.max(A,x)):Math.min(f-R,Math.max(R-f,x));return{fov:2*Math.atan(R)/vh,offsetX:C/(R*s.aspect),offsetY:b/R}}var Ds=class{constructor(e,t){this.config=t;D(this,"paintCamera");D(this,"homePosition");D(this,"homeLookAt");D(this,"fov");D(this,"combatHidden",[]);D(this,"root",new Wt);D(this,"materials",[]);e.add(this.root);let n=t.camera;this.fov=n.fov,this.homePosition=new k(0,n.height,n.back),this.homeLookAt=new k(0,n.lookAtHeight,0),this.paintCamera=new vt(n.fov,n.aspect,.1,500),this.paintCamera.position.copy(this.homePosition),this.paintCamera.lookAt(this.homeLookAt),this.paintCamera.updateMatrixWorld(),this.paintCamera.updateProjectionMatrix()}build(e){for(let t of this.config.layers){let n=e.get(t.file);if(!n)continue;let i=new Tt(t.draws.length>0?this.compose(n,t):n);i.colorSpace=Ye,i.anisotropy=4,i.wrapS=t.mirrorX?ns:Gt,i.wrapT=t.mirrorY?ns:Gt,i.needsUpdate=!0;let r=t.shape==="floor"?this.floor(t,i):this.stand(t,i);r.renderOrder=t.order,t.hideInCombat&&this.combatHidden.push(r.material),this.materials.push(r.material),this.root.add(r)}}compose(e,t){let[n,i]=this.config.viewport,r=document.createElement("canvas");r.width=n,r.height=i;let o=r.getContext("2d");if(!o)return r;let a=e.naturalWidth>0?e.naturalWidth/n:1;for(let l of t.draws){let[c,h,u,d]=l.source;o.drawImage(e,c*a,h*a,u*a,d*a,...l.destination)}return r}setOpacity(e){this.root.visible=e>.001;for(let t of this.materials)t.opacity=e}setBrightness(e){for(let t of this.materials)t.color.setScalar(e)}rayToZ(e,t,n){let i=this.paintCamera,r=new k(e,t,.5).unproject(i).sub(i.position).normalize();return i.position.clone().addScaledVector(r,(n-i.position.z)/r.z)}scaledRect(e){let[t,n]=this.config.scaleAnchor,[i,r,o,a]=e.rect,l=e.scale;return[t+(i-t)*l,n+(r-n)*l+e.offsetY,o*l,a*l]}projectUV(e,t){e.updateMatrixWorld();let n=e.geometry.getAttribute("position"),i=e.geometry.getAttribute("uv"),r=new k;for(let o=0;o<n.count;o++){r.fromBufferAttribute(n,o).applyMatrix4(e.matrixWorld).project(this.paintCamera);let a=(r.x+1)/2,l=(1-r.y)/2;i.setXY(o,(a-t[0])/t[2],1-(l-t[1])/t[3])}i.needsUpdate=!0}material(e){return new qt({map:e,transparent:!0,depthWrite:!1,fog:!1})}stand(e,t){let n=-e.depth,i=this.config.standSpread,r=this.rayToZ(-i,1.3,n),o=this.rayToZ(i,-1.3,n),a=new ct(new Yt(o.x-r.x,r.y-o.y,96,24),this.material(t));return a.position.set((r.x+o.x)/2,(r.y+o.y)/2,n),this.projectUV(a,this.scaledRect(e)),a}floor(e,t){let n=-e.near,i=-e.far,r=new Yt(e.halfWidth*2,n-i,240,160);r.rotateX(-Math.PI/2);let o=new ct(r,this.material(t));return o.position.set(0,0,(n+i)/2),this.projectUV(o,e.rect),o}};var ai=Math.PI/180;function $o(s,e,t,n,i){let o=2/Math.max(1e-4,n),a=o*i,l=1/(1+a+.48*a*a+.235*a*a*a),c=s-e,h=(t.v+o*c)*i;t.v=(t.v-o*h)*l;let u=e+(c+h)*l;return e-s>0==u>e&&(u=e,t.v=0),u}var Py=[11.3,47.9,83.1,121.7,163.3,199.9];function cs(s,e){let t=Py[s]??0;return .55*Math.sin(e+t)+.3*Math.sin(e*2.17+t*1.7)+.15*Math.sin(e*4.31+t*2.9)}var Yr=class{constructor(e,t,n,i,r,o){this.camera=e;this.config=r;this.shake=o;D(this,"homePos");D(this,"homeQuat",new $t);D(this,"baseFov");D(this,"homeFov");D(this,"homeShift",new Ue);D(this,"focusShift",new Ue);D(this,"shift",new Ue);D(this,"goalPos",new k);D(this,"goalQuat",new $t);D(this,"goalFov");D(this,"focused",!1);D(this,"pos",new k);D(this,"quat",new $t);D(this,"fov");D(this,"vel",{x:{v:0},y:{v:0},z:{v:0}});D(this,"trauma",0);D(this,"kick",new k);D(this,"kickVel",new k);D(this,"fovKick",0);D(this,"fovKickVel",0);D(this,"probe",new vt);D(this,"env",null);D(this,"envSeen",[]);D(this,"envMuted",!1);this.homePos=t.clone(),this.baseFov=i,this.homeFov=i,this.goalFov=i,this.fov=i,this.probe.position.copy(t),this.probe.lookAt(n),this.homeQuat.copy(this.probe.quaternion),this.snapHome()}snapHome(){this.focused=!1,this.pos.copy(this.homePos),this.quat.copy(this.homeQuat),this.fov=this.homeFov,this.shift.copy(this.homeShift),this.trauma=0,this.kick.set(0,0,0),this.kickVel.set(0,0,0),this.fovKick=0,this.fovKickVel=0;for(let e of Object.values(this.vel))e.v=0}setHome(e,t,n){this.homeFov=e,this.homeShift.set(t,n)}setFocusShift(e,t){this.focusShift.set(e,t)}focus(e,t,n){let i=this.config,r=e.clone().add(t).multiplyScalar(.5);r.y+=i.focusHeight;let o=this.baseFov-i.fovZoom,a=this.homePos.distanceTo(r)*Math.tan(this.baseFov*ai/2)/Math.tan(o*ai/2)/i.focusSizeGain,l=new k(0,0,-1).applyQuaternion(this.homeQuat).applyAxisAngle(new k(0,1,0),-n*i.panYawDeg*ai).normalize();this.goalPos.copy(r).addScaledVector(l,-a),this.probe.position.copy(this.goalPos),this.probe.lookAt(r),this.goalQuat.copy(this.probe.quaternion).multiply(new $t().setFromAxisAngle(new k(0,0,1),n*i.dutchDeg*ai)),this.goalFov=o,this.focused=!0}release(){this.focused=!1}impact(e,t){let n=this.shake;this.trauma=Math.min(1,this.trauma+n.traumaPerHit+n.traumaPerDamage*e);let i=Math.sqrt(n.kickStiffness);this.kickVel.addScaledVector(new k(t,-.35,-.5).normalize(),n.kickImpulse*(.5+e)*i),this.fovKickVel-=n.fovPunch*(.5+e)*i}envImpulse(e,t,n,i,r,o,a){if(this.envMuted||n<=0||this.envSeen.includes(e))return;this.envSeen.push(e),this.envSeen.length>64&&this.envSeen.shift();let l=Math.min(a,t);if(this.env){let c=Math.max(0,1-(o-this.env.start)/this.env.duration);if(this.env.amplitude*c*c>=l)return}this.env={start:o,amplitude:l,duration:n,zoom:i,dir:Math.sign(r)||1}}write(e,t){if(e<=0)return;let n=this.config,i=this.shake,r=this.focused?this.goalPos:this.homePos,o=this.focused?this.goalQuat:this.homeQuat,a=this.focused?this.goalFov:this.homeFov,l=this.focused?n.followTime:n.returnFollowTime;this.pos.set($o(this.pos.x,r.x,this.vel.x,l,e),$o(this.pos.y,r.y,this.vel.y,l,e),$o(this.pos.z,r.z,this.vel.z,l,e));let c=1-Math.exp(-e/Math.max(1e-4,l));this.quat.slerp(o,c),this.fov+=(a-this.fov)*c,this.shift.lerp(this.focused?this.focusShift:this.homeShift,c),this.trauma=Math.max(0,this.trauma-i.traumaDecay*e);let h=this.trauma*this.trauma,u=h*h*(3-2*h),d=t*i.frequency,p=new k(cs(0,d)*i.maxOffset[0],cs(1,d)*i.maxOffset[1],cs(2,d)*i.maxOffset[2]).multiplyScalar(u),g=new ss(cs(3,d)*i.maxAngle[0]*ai*u,cs(4,d)*i.maxAngle[1]*ai*u,cs(5,d)*i.maxAngle[2]*ai*u),y=Math.max(1,Math.ceil(e/.008)),m=e/y;for(let T=0;T<y;T++){let R=this.kick.clone().multiplyScalar(-i.kickStiffness).addScaledVector(this.kickVel,-i.kickDamping);this.kickVel.addScaledVector(R,m),this.kick.addScaledVector(this.kickVel,m),this.fovKickVel+=(-i.kickStiffness*this.fovKick-i.kickDamping*this.fovKickVel)*m,this.fovKick+=this.fovKickVel*m}let f=1,S=new k;if(this.env){let T=(t-this.env.start)/this.env.duration;if(T>=1)this.env=null;else{let R=(1-T)*(1-T),C=2*Math.max(1,Math.abs(this.pos.z))*Math.tan(this.fov*ai/2);S.set(this.env.dir*.9,-.45,0).normalize().multiplyScalar(this.env.amplitude*C*R).applyQuaternion(this.quat),f=1-this.env.zoom*R}}this.camera.position.copy(this.pos).add(p.applyQuaternion(this.quat)).add(this.kick).add(S),this.camera.quaternion.copy(this.quat).multiply(new $t().setFromEuler(g)),this.camera.fov=Math.min(170,Math.max(5,(this.fov+this.fovKick)*f)),this.camera.updateProjectionMatrix();let v=this.camera.projectionMatrix.elements;v[8]=this.shift.x,v[9]=this.shift.y,this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()}};var zn={x:37,y:18,w:182,h:30},Zr={x:26,y:55,w:204,h:222},Jr={x:27,y:296,w:202,h:47},wh="#fff1d7",qo="#b7b6b6",Eh="#d9b77c";function Iy(s,e,t,n,i,r){let o=document.createElement("canvas");o.width=r,o.height=r;let a=o.getContext("2d");if(!a)return;let l=Math.min(r/Math.max(1,e.naturalWidth),r/Math.max(1,e.naturalHeight)),c=e.naturalWidth*l,h=e.naturalHeight*l;a.drawImage(e,(r-c)/2,(r-h)/2,c,h),a.globalCompositeOperation="source-in",a.fillStyle=t,a.fillRect(0,0,r,r),s.drawImage(o,n-r/2,i-r/2)}function Th(s,e,t){let r=document.createElement("canvas");r.width=256,r.height=360;let o=r.getContext("2d");if(!o)return r;if(o.drawImage(t?e.back:e.front,0,0,256,360),!e.complete){let a=Zr.x+Zr.w/2,l=Zr.y+Zr.h/2,c=t?qo:Eh;s.glyph?Iy(o,s.glyph,c,a,l,120):(o.save(),o.translate(a,l),o.rotate(Math.PI/4),o.strokeStyle=c,o.lineWidth=4,o.strokeRect(-40,-40,80,80),o.restore())}return o.textBaseline="middle",o.fillStyle=wh,o.textAlign="center",o.font="700 24px system-ui, sans-serif",o.fillText(s.name,zn.x+zn.w/2,zn.y+zn.h/2+1,zn.w-64),o.textAlign="right",o.font="800 22px system-ui, sans-serif",o.fillStyle=t?qo:Eh,o.fillText(t?"\uB4A4":"\uC55E",zn.x+zn.w,zn.y+zn.h/2+1),o.textAlign="center",o.fillStyle=t?qo:wh,o.font="900 44px system-ui, sans-serif",o.fillText(String(t?s.backPower:s.frontPower),Jr.x+Jr.w/2,Jr.y+Jr.h/2+2),r}function Ah(s,e){let i=document.createElement("canvas");i.width=256,i.height=360;let r=i.getContext("2d");if(!r)return i;let o=e?"#6b6864":"#e9dcbc",a=e?"#d6d1c9":"#2a1d0c",l=e?"#3b3936":s.tint,c=e?"#8d8984":s.tint;return r.fillStyle=l,r.fillRect(0,0,256,360),r.fillStyle=o,r.fillRect(12,12,232,336),r.fillStyle=a,r.font="700 30px system-ui, sans-serif",r.textAlign="left",r.textBaseline="top",r.fillText(s.slot,26,24),r.textAlign="right",r.fillText(e?"\uB4A4":"\uC55E",230,24),r.save(),r.translate(256/2,360*.42),r.rotate(Math.PI/4),r.fillStyle=c,r.fillRect(-46,-46,92,92),r.strokeStyle=a,r.lineWidth=5,r.strokeRect(-46,-46,92,92),r.restore(),r.fillStyle=a,r.textAlign="center",r.textBaseline="middle",r.font="900 88px system-ui, sans-serif",r.fillText(String(e?s.backPower:s.frontPower),256/2,360*.74),r.font="600 24px system-ui, sans-serif",r.fillText(s.name,256/2,326,216),i}function Ch(s){let e=new Hn(s);return e.colorSpace=Ye,e.anisotropy=4,new qt({map:e,transparent:!0,depthWrite:!1,depthTest:!1,fog:!1})}var ks=class{constructor(e,t,n=null){D(this,"root",new Wt);D(this,"inner",new Wt);D(this,"front");D(this,"back");D(this,"materials");D(this,"state",{spin:0,scale:0,opacity:1,dim:0});let i=t*.7111111111111111,r=new Yt(i,t),o=Ch(n?Th(e,n,!1):Ah(e,!1)),a=Ch(n?Th(e,n,!0):Ah(e,!0));this.materials=[o,a],this.front=new ct(r,o),this.back=new ct(r,a),this.back.rotation.y=Math.PI;for(let l of[this.front,this.back])l.renderOrder=60,this.inner.add(l);this.root.add(this.inner),this.root.visible=!1}static restAngle(e,t){return t*Math.PI*2+(e==="back"?Math.PI:0)}update(e,t){this.root.visible=this.state.scale>.001&&this.state.opacity>.001,this.root.position.copy(e),this.root.quaternion.copy(t.quaternion),this.inner.rotation.set(0,this.state.spin,0),this.inner.scale.setScalar(this.state.scale);let n=1-.55*this.state.dim;for(let i of this.materials)i.opacity=this.state.opacity,i.color.setScalar(n)}dispose(){this.root.removeFromParent();for(let e of this.materials)e.map?.dispose(),e.dispose();this.front.geometry.dispose()}};var st={linear:s=>s,outQuad:s=>1-(1-s)*(1-s),inQuad:s=>s*s,inOutQuad:s=>s<.5?2*s*s:1-Math.pow(-2*s+2,2)/2,outCubic:s=>1-(1-s)**3,outExpo:s=>s>=1?1:1-2**(-10*s),outBack:s=>{let t=s-1;return t*t*(2.70158*t+1.70158)+1},outElastic:(s,e)=>t=>{if(t<=0||t>=1)return t;let n=s,i;return n<1?(n=1,i=e/4):i=e/(2*Math.PI)*Math.asin(1/n),n*2**(-10*t)*Math.sin((t-i)*2*Math.PI/e)+1}},Kr=class{constructor(){D(this,"timeScale",1);D(this,"baseScale",1);D(this,"realTweens",[]);D(this,"real",0);D(this,"tweens",[]);D(this,"gameWaits",[]);D(this,"realWaits",[]);D(this,"hitStop",{active:!1,until:0,scale:.02})}get realNow(){return this.real}get scale(){return this.timeScale}applyTimeScale(e){this.timeScale=e}setSlowMotion(e){this.baseScale=e,this.hitStop.active||this.applyTimeScale(e)}startHitStop(e,t){e<=0||(this.hitStop.until=Math.max(this.hitStop.until,this.real+e),this.hitStop.active=!0,this.hitStop.scale=t,this.applyTimeScale(t))}kill(e,t){this.tweens=this.tweens.filter(n=>n.target===e&&(t===void 0||n.key===t)?(n.done(),!1):!0)}tween(e,t,n,i,r=st.outQuad){let o=e;return this.kill(e,t),new Promise(a=>this.tweens.push({target:o,key:t,from:o[t]??0,to:n,dur:Math.max(1e-4,i),t:0,fn:r,done:a}))}tweenReal(e,t,n,i,r=st.outQuad){let o=e;return this.realTweens=this.realTweens.filter(a=>a.target===o&&a.key===t?(a.done(),!1):!0),new Promise(a=>this.realTweens.push({target:o,key:t,from:o[t]??0,to:n,dur:Math.max(1e-4,i),t:0,fn:r,done:a}))}waitGame(e){return new Promise(t=>this.gameWaits.push({left:e,done:t}))}waitReal(e){return new Promise(t=>this.realWaits.push({until:this.real+e,done:t}))}step(e){this.real+=e;for(let n of[...this.realWaits])this.real>=n.until&&(this.realWaits.splice(this.realWaits.indexOf(n),1),n.done());this.hitStop.active&&this.real>=this.hitStop.until&&(this.hitStop.active=!1,this.applyTimeScale(this.baseScale));for(let n of[...this.realTweens]){n.t+=e;let i=Math.min(1,n.t/n.dur);n.target[n.key]=n.from+(n.to-n.from)*n.fn(i),i>=1&&(this.realTweens.splice(this.realTweens.indexOf(n),1),n.done())}let t=e*this.timeScale;for(let n of[...this.tweens]){n.t+=t;let i=Math.min(1,n.t/n.dur);n.target[n.key]=n.from+(n.to-n.from)*n.fn(i),i>=1&&(this.tweens.splice(this.tweens.indexOf(n),1),n.done())}for(let n of[...this.gameWaits])n.left-=t,n.left<=0&&(this.gameWaits.splice(this.gameWaits.indexOf(n),1),n.done());return t}clear(){for(let e of this.tweens)e.done();for(let e of this.realTweens)e.done();for(let e of this.gameWaits)e.done();for(let e of this.realWaits)e.done();this.tweens=[],this.realTweens=[],this.gameWaits=[],this.realWaits=[],this.hitStop.active=!1,this.baseScale=1,this.applyTimeScale(1)}},bt=(...s)=>Promise.all(s.flat().filter(e=>e!==null));var jr=class{constructor(e){D(this,"canvas");D(this,"ctx");D(this,"showing",null);D(this,"flash",!0);this.canvas=document.createElement("canvas"),this.canvas.className="cutscene",Object.assign(this.canvas.style,{position:"absolute",inset:"0",width:"100%",height:"100%",pointerEvents:"none",display:"none",zIndex:"5"}),e.appendChild(this.canvas),this.ctx=this.canvas.getContext("2d")}play(e,t,n,i,r){this.showing={start:n,seconds:i,lineAt:r,spec:e,...t},this.canvas.style.display="block"}get active(){return this.showing!==null}clear(){this.showing=null,this.canvas.style.display="none"}update(e){let t=this.showing,n=this.ctx;if(!t||!n)return;let i=e-t.start;if(i>=t.seconds){this.clear();return}let r=this.canvas.getBoundingClientRect(),o=Math.max(1,Math.round(r.width)),a=Math.max(1,Math.round(r.height));(this.canvas.width!==o||this.canvas.height!==a)&&(this.canvas.width=o,this.canvas.height=a);let l=t.spec,c=Math.max(o/l.size.width,a/l.size.height),h=Math.min(1,i/t.seconds),u=l.zoomFrom+(l.zoomTo-l.zoomFrom)*h,d=Math.min(1,i/Math.max(.001,l.fade)),p=Math.min(1,(t.seconds-i)/Math.max(.001,l.fade));n.clearRect(0,0,o,a),n.save(),n.globalAlpha=Math.min(d,p),n.fillStyle="#0b0d14",n.fillRect(0,0,o,a);let g=(m,f)=>{if(!m)return;let S=l.size.width*c*f,v=l.size.height*c*f;n.drawImage(m,(o-S)/2,(a-v)/2,S,v)};g(t.background,1+(u-1)*.4),g(t.foreground,u);let y=i-t.lineAt;if(t.line&&y>=0){let m=Math.min(1,y/Math.max(.001,l.lineWipe)),f=Math.max(2,t.line.naturalHeight*c),S=a*l.lineY-f/2;n.drawImage(t.line,0,0,t.line.naturalWidth*m,t.line.naturalHeight,0,S,o*m,f),this.flash&&y<l.lineWipe*2&&(n.globalAlpha*=.35*(1-y/(l.lineWipe*2)),n.fillStyle="#dfe8ff",n.fillRect(0,0,o,a))}n.restore()}};var Qr=class{constructor(e,t,n,i){this.scene=e;this.vfx=t;this.characterHeight=i;D(this,"playing",new Set);D(this,"textures",new Map);let r=new Map;for(let a of t.sprites.values())r.set(a.atlas,Math.max(r.get(a.atlas)??0,a.rect[0]+a.rect[2],a.rect[1]+a.rect[3]));let o=new Map;for(let[a,l]of n){let c=new Tt(l);c.colorSpace=Ye,c.needsUpdate=!0,o.set(a,c)}for(let a of t.sprites.values()){let l=o.get(a.atlas),c=r.get(a.atlas)??2048;if(!l)continue;let h=l.clone(),[u,d,p,g]=a.rect;h.repeat.set(p/c,g/c),h.offset.set(u/c,1-(d+g)/c),h.needsUpdate=!0,this.textures.set(a.id,h)}}get allTextures(){return[...this.textures.values()]}spawn(e,t,n,i,r){let o=this.vfx.animations.get(e.play),a=o?o.frames:[e.play],l=this.vfx.sprites.get(a[0]),c=a.map(T=>this.textures.get(T)).filter(T=>T!==void 0);if(!l||c.length!==a.length)return;let h=this.characterHeight*e.scale/l.canvas[1],u=new Yt(l.canvas[0]*h,l.canvas[1]*h);u.translate((l.canvas[0]/2-l.pivot[0])*h,(l.pivot[1]-l.canvas[1]/2)*h,0);let d=l.tint==="alpha_silhouette",p=new qt({map:c[0]??null,color:new Ge(d?r:i),transparent:!0,depthWrite:!1,depthTest:!1,side:Ot,fog:!1});d&&(p.onBeforeCompile=T=>{T.fragmentShader=T.fragmentShader.replace("#include <map_fragment>",`#ifdef USE_MAP
  diffuseColor.a *= texture2D( map, vMapUv ).a;
#endif`)},p.customProgramCacheKey=()=>"envfx-silhouette");let g=new ct(u,p),y=e.anchor==="floor",m=e.anchor==="foot"||y;g.renderOrder=m?9:46;let f=e.face==="away"?-n:n,S=this.characterHeight;g.position.set(t.x+f*e.offset[0]*S,t.y+e.offset[1]*S,t.z),y&&(g.position.y=.012,g.rotation.x=-Math.PI/2+.4),g.scale.x=f>=0?1:-1,this.scene.add(g);let v=o?o.durations:[e.hold];this.playing.add({mesh:g,material:p,frames:c,durations:v,fade:o?o.fadeLast:e.fade,t:0,floor:y})}update(e,t){for(let n of[...this.playing]){n.t+=e*1e3*this.vfx.playbackRate;let i=n.t,r=0;for(;r<n.durations.length-1&&i>=(n.durations[r]??0);)i-=n.durations[r]??0,r+=1;let o=n.frames[Math.min(r,n.frames.length-1)]??null;n.material.map!==o&&(n.material.map=o,n.material.needsUpdate=!0);let a=n.durations.reduce((c,h)=>c+h,0),l=n.t-a;if(n.material.opacity=l<=0?1:Math.max(0,1-l/Math.max(1,n.fade)),l>=n.fade){this.remove(n);continue}if(!n.floor){let c=n.mesh.scale.x;n.mesh.quaternion.copy(t.quaternion),n.mesh.scale.set(c,1,1)}}}remove(e){e.mesh.removeFromParent(),e.mesh.geometry.dispose(),e.material.dispose(),this.playing.delete(e)}clear(){for(let e of[...this.playing])this.remove(e)}};var ea=class{constructor(e,t){this.scene=e;this.characterHeight=t;D(this,"playing",new Set)}spawn(e,t,n,i,r,o={}){if(t.length===0)return null;let{width:a,height:l}=e.size,c=this.characterHeight*e.scale/Math.max(a,l),h=new Yt(a*c,l*c);h.translate((a/2-e.pivot.x)*c,(e.pivot.y-l/2)*c,0);let u=new qt({map:t[0]??null,transparent:!0,depthWrite:!1,depthTest:!1,side:Ot,fog:!1,blending:e.blend==="add"?_i:jn}),d=new ct(h,u);d.renderOrder=o.order??45,d.position.copy(n),d.scale.x=i,this.scene.add(d);let p={mesh:d,material:u,textures:t,effect:e,start:r,hold:o.hold??!1,roll:o.roll??0,fade:null};return this.playing.add(p),p}fade(e,t,n,i){e&&(e.fade={from:e.material.opacity,to:t,start:i,seconds:Math.max(.001,n)})}update(e,t){for(let n of this.playing){let i=n.effect.frames,r=(e-n.start)*1e3,o=0;for(;o<i.length-1&&r>=(i[o]?.ms??0);)r-=i[o]?.ms??0,o+=1;let a=i.reduce((u,d)=>u+d.ms,0),l=!n.hold&&!n.effect.loop&&(e-n.start)*1e3>=a,c=n.textures[Math.min(o,n.textures.length-1)]??null;if(n.material.map!==c&&(n.material.map=c,n.material.needsUpdate=!0),n.fade){let u=Math.min(1,(e-n.fade.start)/n.fade.seconds);if(n.material.opacity=n.fade.from+(n.fade.to-n.fade.from)*u,u>=1&&n.fade.to<=0){this.remove(n);continue}}if(l){this.remove(n);continue}let h=n.mesh.scale.x;n.mesh.quaternion.copy(t.quaternion),n.roll!==0&&n.mesh.rotateZ(n.roll),n.mesh.scale.set(h,1,1)}}remove(e){e.mesh.removeFromParent(),e.mesh.geometry.dispose(),e.material.dispose(),this.playing.delete(e)}clear(){for(let e of[...this.playing])this.remove(e)}};function Rh(s){return s.filter(e=>e!==null).map(e=>{let t=new Tt(e);return t.colorSpace=Ye,t.needsUpdate=!0,t})}var ta=class{constructor(e,t,n,i,r){this.combatantId=e;this.catalog=t;this.worldPerPixel=i;D(this,"root",new Wt);D(this,"visual",new Wt);D(this,"plates",new Map);D(this,"shown",null);D(this,"shownId","");D(this,"facing",1);D(this,"home",new k);D(this,"opacity",1);D(this,"down",!1);D(this,"hidden",!1);D(this,"breath",0);D(this,"fade",{doll:this,get v(){return this.doll.opacity},set v(e){this.doll.setOpacity(e)}});this.root.add(this.visual);for(let o of t.manifest.frames){let a=n.get(o.id);if(!a)continue;let l=this.makePlate(o,a,r);l.mesh.visible=!1,this.visual.add(l.mesh),this.plates.set(o.id,l)}this.showFrame(this.poseFrame("idle"))}addFrame(e,t,n=10){let i=this.plates.get(e);if(i){i.material.map=t,i.material.needsUpdate=!0;return}let r=this.makePlate(this.catalog.frame(e),t,n);r.mesh.visible=!1,this.visual.add(r.mesh),this.plates.set(e,r)}makePlate(e,t,n){let i=Ly(e,this.worldPerPixel),r=new qt({map:t,transparent:!0,alphaTest:.02,depthWrite:!1,side:Ot,fog:!1}),o=new ct(i,r);return o.renderOrder=n,o.userData.combatantId=this.combatantId,{mesh:o,material:r}}poseFrame(e){let t={idle:"idle",dash:"advance",guard:"guard",hurt:"hit",retreat:"retreat"}[e];return(this.catalog.frameEndingWith(t)??this.catalog.frameEndingWith("idle")??this.catalog.manifest.frames[0])?.id??""}skillFrames(e){let t=e==="ULT"?this.catalog.frameSequence("ULT"):[];if(t.length>0)return[t[0]];let n=this.catalog.frameSequence(e==="ULT"?"S3":e);return n.length>0?n:[this.poseFrame("idle")]}setPose(e){this.showFrame(this.poseFrame(e))}showFrame(e){if(e===this.shownId)return;let t=this.plates.get(e);t&&(this.shown&&(this.shown.mesh.visible=!1),t.mesh.visible=!0,t.material.opacity=this.opacity,this.shown=t,this.shownId=e)}setOpacity(e){this.opacity=e,this.shown&&(this.shown.material.opacity=e)}get opacityValue(){return this.opacity}get pickTarget(){return this.shown?.mesh??null}setFacing(e){this.facing=e,this.root.scale.x=e}faceCamera(e){this.root.quaternion.copy(e.quaternion),Math.sign(this.root.scale.x)!==this.facing&&(this.root.scale.x=this.facing),this.visual.rotation.set(0,0,0),this.visual.scale.set(1,1+this.breath,1)}get idle(){return this.shownId===this.poseFrame("idle")}setTint(e){for(let t of this.plates.values())t.material.color.setHex(e)}toLocalX(e){return e/this.root.scale.x}chest(e){return new k(this.root.position.x+this.visual.position.x*this.root.scale.x,e,this.root.position.z)}reset(){this.root.position.copy(this.home),this.visual.position.set(0,0,0),this.down=!1,this.hidden=!1,this.setOpacity(1),this.setPose("idle")}};function Ly(s,e){let[t,n,i,r]=s.bbox,o=e,a=new Yt((i-t)*o,(r-n)*o);return a.translate(((t+i)/2-s.anchor.x)*o,(s.anchor.y-(n+r)/2)*o,0),a}function Ph(s,e,t,n){let i=s.naturalWidth>0?s.naturalWidth/t:1,r=e.bbox[0]*i,o=e.bbox[1]*i,a=Math.max(1,(e.bbox[2]-e.bbox[0])*i),l=Math.max(1,(e.bbox[3]-e.bbox[1])*i),c=Math.min(1,n/Math.max(a,l)),h=document.createElement("canvas");h.width=Math.max(1,Math.round(a*c)),h.height=Math.max(1,Math.round(l*c));let u=h.getContext("2d");u&&u.drawImage(s,r,o,a,l,0,0,h.width,h.height);let d=new Hn(h);return d.colorSpace=Ye,d.anisotropy=4,d}var Dy="http://www.w3.org/2000/svg",ky={"\uD569 \uC2B9\uB9AC":"win","\uD569 \uD328\uBC30":"lose",\uAD50\uCC29:"draw"};function Bt(s,e,t=""){let n=document.createElement(s);return e&&(n.className=e),t&&(n.textContent=t),n}function en(s,e={}){let t=document.createElementNS(Dy,s);for(let[n,i]of Object.entries(e))t.setAttribute(n,String(i));return t}var hs=8,Uy=0,na=class{constructor(e,t){this.gauge=t;D(this,"root");D(this,"tags",new Map);D(this,"callouts",[]);D(this,"selection",{ally:null,target:null,pickable:[]});D(this,"unit",1);D(this,"kit",null);D(this,"hpPath",null);D(this,"spPath",null);D(this,"reducedMotion",!1);D(this,"onPick",null);this.root=Bt("div","overlay3d"),e.append(this.root)}setGaugeKit(e){this.kit=e,this.hpPath=e?new ps(e.layout.hp.points):null,this.spPath=e?new ps(e.layout.sp.points):null}file(e){return this.kit?.base?`${this.kit.base}/${e}.png`:null}layer(e,t=""){let n=this.file(e);if(!n||!this.kit)return null;let[i,r]=this.kit.layout.canvas,o=en("image",{href:n,x:0,y:0,width:i,height:r,preserveAspectRatio:"none"});return t&&o.setAttribute("class",t),o}makeGauge(e){let n=this.kit.layout,[i,r]=n.canvas,o=Bt("div",`gauge3d ${e}`);o.style.transform=`translate(${-n.anchor[0]/i*100}%, ${-n.anchor[1]/r*100}%)`,o.style.transitionDuration=`${this.gauge.downFade}s`;let a=en("svg",{viewBox:`0 0 ${i} ${r}`,width:"100%",overflow:"visible"});a.style.aspectRatio=`${i} / ${r}`;let l=`g${++Uy}`,c=en("defs"),h=(x,b)=>{let L=en("mask",{id:`${l}-${x}`,maskUnits:"userSpaceOnUse",x:-20,y:-20,width:i+40,height:r+40}),N=en("path",{fill:"none",stroke:"#fff","stroke-width":b,"stroke-linejoin":"round","stroke-linecap":"butt"});return L.append(N),c.append(L),N},u=h("hp",n.hp.width+hs),d=h("sp",n.sp.width+hs),p=h("hpl",n.hp.width+hs),g=h("spl",n.sp.width+hs);a.append(c);let y=x=>ms(x?x.prefix(1):[]),m=(x,b,L,N)=>{let P=this.layer(x)??en("path",{d:y(x.includes("hp")?this.hpPath:this.spPath),fill:"none",stroke:L,"stroke-width":N,"stroke-linejoin":"round"});return P.setAttribute("mask",`url(#${l}-${b})`),P},f=(x,b)=>this.layer(x)??en("path",{d:y(b==="hp"?this.hpPath:this.spPath),fill:"none",stroke:"#0b111a","stroke-opacity":.85,"stroke-width":n[b].width+3,"stroke-linejoin":"round",class:"track"});a.append(f("G_hp_track","hp"),f("G_sp_track","sp"));let S=m("G_hp_loss","hpl",n.hp.color,n.hp.width),v=m("G_sp_loss","spl",n.sp.color,n.sp.width);S.setAttribute("class","loss"),v.setAttribute("class","loss"),a.append(S,v),a.append(m("G_hp_fill","hp",n.hp.color,n.hp.width),m("G_sp_fill","sp",n.sp.color,n.sp.width));let T=this.layer("G_frame");T&&a.append(T);let R=en("g",{class:"pips"});a.append(R);let C=this.layer("G_selection","sel"),A=this.layer("G_critical","crit");C&&a.append(C),A&&a.append(A);let $=Bt("span","gauge-num");return o.append(a,$),{el:o,svg:a,hpMask:u,spMask:d,hpLossMask:p,spLossMask:g,hpLoss:S,spLoss:v,pips:R,selection:C,critical:A,num:$,hpRatio:null,spRatio:null,lossUntil:0}}setActors(e){for(let t of this.tags.values())t.el.remove(),t.gauge.el.remove();this.tags.clear();for(let t of e){let n=Bt("div",`tag3d ${t.side}`);n.addEventListener("click",()=>{this.selection.pickable.includes(t.combatantId)&&this.onPick?.(t.combatantId)});let i=Bt("b","",t.name);i.style.setProperty("--fit",String(Math.max(.6,Math.min(1,7/Math.max(1,[...t.name].length)))));let r=Bt("small",""),o=Bt("div","status");n.append(i,r,o);let a=this.kit?this.makeGauge(t.side):null;a&&this.root.append(a.el),this.root.append(n),this.tags.set(t.combatantId,{el:n,name:i,note:r,gauge:a??this.emptyGauge(),status:o})}}emptyGauge(){let e=Bt("div","gauge3d");e.hidden=!0;let t=en("path"),n=en("g");return{el:e,svg:en("svg"),hpMask:t,spMask:t,hpLossMask:t,spLossMask:t,hpLoss:t,spLoss:t,pips:n,selection:null,critical:null,num:Bt("span",""),hpRatio:null,spRatio:null,lossUntil:0}}setSelection(e){this.selection=e}setUnit(e){this.unit=e>0?e:1}setGauge(e,t){let n=this.tags.get(e);if(!n||!this.kit)return;let i=this.kit.layout.pip.positions,r=t?Math.min(t.total,i.length):0;if(!t||r<=0){n.gauge.pips.replaceChildren();return}let o=this.kit.layout.pip.scale,a=56*o,l=14*o;n.gauge.pips.replaceChildren(...ll(t.charge,r,t.stage).map((c,h)=>{let[u,d]=i[h],p=this.file(`U12_ultimate_${c}`),g=p?en("image",{href:p,x:u,y:d,width:a,height:l,preserveAspectRatio:"none"}):en("rect",{x:u,y:d,width:a,height:l});return g.setAttribute("class",`pip ${c}`),g}))}setNote(e,t,n=!1){let i=this.tags.get(e);i&&(i.note.textContent=t,i.note.classList.toggle("clash",n&&t!==""))}setStatuses(e,t){let n=this.tags.get(e);n&&n.status.replaceChildren(...t.map(i=>{let r=Bt("i","");return r.dataset.id=i.id,r.append(Bt("span","",String(i.turns))),r}))}callout(e,t,n,i,r,o){let a=ky[n],l=Bt("div",a?`callout3d plate ${a}${t?"":" lose"}`:t?"callout3d":"callout3d lose");l.append(Bt("b","",n)),i&&l.append(Bt("small","",i)),l.style.animationDuration=`${o}s`,this.root.append(l),this.callouts.push({el:l,combatantId:e,until:r+o})}number(e,t,n){if(!e)return;let i=Bt("div",`num3d ${n}`,t);i.style.left=`${e.x*100}%`,i.style.top=`${e.y*100}%`,this.root.append(i),window.setTimeout(()=>i.remove(),1300)}update(e,t,n,i,r=()=>null,o=()=>null){let a=this.root.clientHeight||1,l=this.selection;for(let[c,h]of this.tags){let u=h.gauge;if(!this.kit||!this.hpPath||!this.spPath)break;let d=r(c),p=e(c),g=o(c);if(u.el.hidden=!d||!g,!d||!g)continue;let y=p?Math.abs(d.y-p.y)*a:0,m=Math.max(this.gauge.minWidth,Math.min(this.gauge.maxWidth,y/this.unit*this.gauge.widthRatio));u.el.style.width=`${m*this.unit}px`,u.el.style.left=`${d.x*100}%`,u.el.style.top=`${d.y*100}%`;let f=t(c),S=f?0:fs(g.maxHp>0?g.hp/g.maxHp:0),v=fs(g.maxMentality>0?g.mentality/g.maxMentality:0),T=($,x,b,L)=>b===null||L>=b||this.reducedMotion?!1:(x.setAttribute("d",ms($.segment(L,b))),!0),R=T(this.hpPath,u.hpLossMask,u.hpRatio,S),C=T(this.spPath,u.spLossMask,u.spRatio,v);(R||C)&&(u.lossUntil=n+this.gauge.lossSeconds),R&&u.hpLoss.classList.add("on"),C&&u.spLoss.classList.add("on"),n>=u.lossUntil&&(u.hpLoss.classList.remove("on"),u.spLoss.classList.remove("on")),u.hpRatio!==S&&u.hpMask.setAttribute("d",ms(da(this.hpPath.prefix(S),hs,!0,S>=1))),u.spRatio!==v&&u.spMask.setAttribute("d",ms(da(this.spPath.prefix(v),hs,!0,v>=1))),u.hpRatio=S,u.spRatio=v;let A=l.ally===c||l.target===c;u.el.classList.toggle("picked",A),u.selection?.classList.toggle("on",A),u.critical?.classList.toggle("on",!f&&S>0&&S<=this.gauge.criticalRatio),u.num.textContent=A?`\uCCB4\uB825 ${Math.max(0,Math.round(g.hp))}/${g.maxHp} \xB7 \uC815\uC2E0\uB825 ${Math.round(g.mentality)}`:"",u.el.classList.toggle("down",f)}for(let[c,h]of this.tags){let u=e(c);h.el.hidden=!u,u&&(h.el.style.left=`${u.x*100}%`,h.el.style.top=`${u.y*100}%`,h.el.classList.toggle("down",t(c)),h.el.classList.toggle("pickable",l.pickable.includes(c)),h.el.classList.toggle("picked",l.ally===c||l.target===c))}for(let c of[...this.callouts]){if(n>=c.until){c.el.remove(),this.callouts.splice(this.callouts.indexOf(c),1);continue}let h=e(c.combatantId);h&&(c.el.style.left=`${h.x*100}%`,c.el.style.top=`${(h.y-i)*100}%`)}}clear(){for(let e of this.callouts)e.el.remove();this.callouts=[];for(let e of this.root.querySelectorAll(".num3d"))e.remove()}};var Fy=Math.PI/180;function Ny(){let s=document.createElement("canvas");s.width=128,s.height=16;let e=s.getContext("2d");if(e){let n=e.createLinearGradient(0,0,128,0);n.addColorStop(0,"rgba(255,110,20,0)"),n.addColorStop(.55,"rgba(255,170,40,0.75)"),n.addColorStop(.9,"rgba(255,230,120,1)"),n.addColorStop(1,"rgba(255,252,220,1)"),e.fillStyle=n,e.beginPath(),e.moveTo(0,8),e.lineTo(110,3),e.quadraticCurveTo(128,8,110,13),e.closePath(),e.fill()}let t=new Hn(s);return t.colorSpace=Ye,t}function Oy(){let e=document.createElement("canvas");e.width=e.height=128;let t=e.getContext("2d");if(t){let i=t.createRadialGradient(64,64,0,64,64,64);i.addColorStop(0,"rgba(255,255,235,1)"),i.addColorStop(.25,"rgba(255,220,110,0.9)"),i.addColorStop(.6,"rgba(255,140,30,0.25)"),i.addColorStop(1,"rgba(0,0,0,0)"),t.fillStyle=i,t.fillRect(0,0,128,128)}let n=new Hn(e);return n.colorSpace=Ye,n}var ia=class{constructor(e,t){this.scene=e;this.config=t;D(this,"streak",Ny());D(this,"core",Oy());D(this,"sparks",[]);D(this,"flashes",[]);D(this,"seed",1)}rand(){return this.seed=this.seed*16807%2147483647,this.seed/2147483647}burst(e,t,n,i){let r=this.config,o=new Is(new as({map:this.core,transparent:!0,depthWrite:!1,depthTest:!1,blending:_i})),a=r.coreSize*(n?1.25:1);o.position.copy(e),o.scale.setScalar(a),o.renderOrder=i+2,this.scene.add(o),this.flashes.push({sprite:o,t:0,life:r.coreLife,size:a});let l=n?r.countClash:r.countHit,c=r.coneDeg*(n?1.4:1)*Fy;for(let h=0;h<l;h++){let d=(this.rand()<r.backShare?Math.PI:0)+(this.rand()-.5)*c+.25,p=r.speedMin+this.rand()*(r.speedMax-r.speedMin),g=new k(Math.cos(d)*t*p,Math.sin(d)*p*.9+1.5,(this.rand()-.5)*p*.6),y=new Is(new as({map:this.streak,transparent:!0,depthWrite:!1,depthTest:!1,blending:_i}));y.renderOrder=i+2,y.position.copy(e),this.scene.add(y),this.sparks.push({sprite:y,pos:e.clone(),vel:g,t:0,life:r.lifeMin+this.rand()*(r.lifeMax-r.lifeMin),width:r.width*(.7+this.rand()*.6)})}}step(e,t,n,i){let r=this.config;for(let l of[...this.flashes]){l.t+=e;let c=l.t/l.life;if(c>=1){this.remove(l.sprite),this.flashes.splice(this.flashes.indexOf(l),1);continue}l.sprite.scale.setScalar(l.size*(1+.2*c)),l.sprite.material.opacity=1-c*c}let o=new k,a=new k;for(let l of[...this.sparks]){l.t+=e;let c=l.t/l.life;if(c>=1){this.remove(l.sprite),this.sparks.splice(this.sparks.indexOf(l),1);continue}l.vel.y-=r.gravity*e,l.vel.multiplyScalar(Math.exp(-r.drag*e)),l.pos.addScaledVector(l.vel,e);let h=l.vel.length(),u=Math.max(l.width*1.5,h*r.length);o.copy(l.pos).project(t),a.copy(l.pos).addScaledVector(l.vel,.01).project(t),l.sprite.material.rotation=Math.atan2((a.y-o.y)*i,(a.x-o.x)*n),l.sprite.position.copy(l.pos).addScaledVector(l.vel,-.5*u/Math.max(.001,h)),l.sprite.scale.set(u,l.width*(1-.5*c),1),l.sprite.material.opacity=1-c*c}}remove(e){this.scene.remove(e),e.material.dispose()}clear(){for(let e of this.flashes)this.remove(e.sprite);for(let e of this.sparks)this.remove(e.sprite);this.flashes=[],this.sparks=[]}};var Ih={ally:"#6f9bbd",enemy:"#b3262b"},Us=class extends Error{},sa=class{constructor(e,t,n,i,r,o,a,l,c,h=new Map,u=new Map,d=null){this.canvas=e;this.config=n;this.sprites=o;this.frameImages=a;this.skillInfo=l;this.sound=c;this.voices=u;D(this,"renderer");D(this,"scene",new Vr);D(this,"camera");D(this,"rig");D(this,"clock",new Kr);D(this,"sparks");D(this,"overlay");D(this,"backdrop");D(this,"zones",null);D(this,"uiUnit",1);D(this,"envFx");D(this,"mapSurface");D(this,"envSurface",null);D(this,"envSerial",0);D(this,"lab",null);D(this,"speed",1);D(this,"dimToken",0);D(this,"dimKnob",{stage:this,value:1,get v(){return this.value},set v(e){this.value=e,this.stage.applyBrightness(e)}});D(this,"actors",new Map);D(this,"queue",[]);D(this,"running",!1);D(this,"epoch",0);D(this,"raycaster",new Wr);D(this,"textures",new Map);D(this,"worldPerPixel",new Map);D(this,"cards",new Map);D(this,"kit",{plates:null,completePlates:()=>null,glyphs:{},gauge:null});D(this,"effects");D(this,"cutscene");D(this,"ultimates",new Map);D(this,"foreground");D(this,"foregroundFade",{stage:this,value:1,get v(){return this.value},set v(e){this.value=e;for(let t of this.stage.foreground)t.opacity=e}});D(this,"slowToken",0);this.renderer=new Ps({canvas:e,antialias:!0}),this.renderer.outputColorSpace=Ye,this.renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1)),this.scene.background=new Ge(920587);let p=new Ds(this.scene,i);this.backdrop=p,p.build(r),this.foreground=p.combatHidden,this.camera=new vt(p.fov,e.width/e.height,.1,300),this.rig=new Yr(this.camera,p.homePosition,p.homeLookAt,p.fov,n.camera,n.shake),this.sparks=new ia(this.scene,n.sparks),this.mapSurface=i.surface,this.envFx=d?{vfx:d.vfx,layer:new Qr(this.scene,d.vfx,d.images,n.layout.characterHeight)}:null,this.overlay=new na(t,n.footGauge),this.effects=new ea(this.scene,n.layout.characterHeight),this.cutscene=new jr(t);for(let[g,y]of h)this.prepareUltimate(g,y);this.resize(),this.preload()}preload(){let e=t=>{t&&this.renderer.initTexture(t)};for(let t of this.sprites.keys())for(let n of this.texturesOf(t)?.values()??[])e(n);for(let t of this.envFx?.layer.allTextures??[])e(t);for(let t of this.ultimates.values()){for(let n of t.effects.values())n.forEach(e);t.environment?.root.traverse(n=>{let i=n.material;i&&!Array.isArray(i)&&e(i.map)})}}prepareUltimate(e,t){let n=this.sprites.get(e);if(!n)return;let i=null,r=null;t.environment&&(i=new Ds(this.scene,t.environment.config),i.build(t.environment.images),i.setOpacity(0),r=Hy(t.environment.config,t.environment.images));let o=new Map;for(let a of Object.values(t.art.effects)){let l=n.manifest.effects.find(c=>c.id===a);l&&o.set(a,Rh(l.frames.map(c=>t.image(c.file))))}this.ultimates.set(e,{art:t.art,environment:i,fade:{v:0,backdrop:i},effects:o,background:r,foreground:t.image(t.art.cutscene.foreground),line:t.image(t.art.cutscene.line),surface:t.environment?.config.surface??null})}slotOf(e){return this.skillInfo(e).slot}resize(){let e=this.canvas.getBoundingClientRect(),t=Math.max(1,Math.round(e.width)),n=Math.max(1,Math.round(e.height));this.renderer.setSize(t,n,!1),this.camera.aspect=t/n,this.camera.updateProjectionMatrix(),this.reframe()}setFrameZones(e,t){this.zones=e,this.uiUnit=t>0?t:1,this.overlay.setUnit(this.uiUnit),this.reframe()}reframe(e=!1){let t=this.zones;if(!t)return;let n=this.canvas.getBoundingClientRect(),i=Math.max(1,n.width),r=Math.max(1,n.height),o=this.config.framing,a=this.uiUnit,l=t.home,c={left:l.left+o.sideMargin*a/i,right:l.right-o.sideMargin*a/i,top:l.top+o.tagMargin*a/r,bottom:l.bottom-o.footMargin*a/r},h=this.config.layout.characterHeight,u=[];for(let m of this.actors.values()){if(m.doll.down)continue;let{x:f,z:S}=m.doll.home;u.push([f-o.bodyHalfWidth*h,0,S],[f+o.bodyHalfWidth*h,0,S],[f,o.headHeight*h,S])}let d=this.backdrop.homePosition,p=this.backdrop.homeLookAt,g=Mh({eye:[d.x,d.y,d.z],target:[p.x,p.y,p.z],baseFov:this.backdrop.fov,aspect:i/r,points:u,rect:c,maxZoomOut:o.maxZoomOut,cover:o.cover});this.rig.setHome(g.fov,g.offsetX,g.offsetY);let y=Xo(t.focus);this.rig.setFocusShift(y.offsetX,y.offsetY),e&&this.rig.snapHome()}texturesOf(e){let t=this.textures.get(e);if(t)return t;let n=this.sprites.get(e);if(!n)return null;let i=new Map,r=new Map;for(let o of n.manifest.frames){let a=this.frameImages(e,o.file);if(!a)continue;let l=`${o.file}|${o.bbox.join(",")}`,c=r.get(l)??Ph(a,o,n.manifest.canvas.width,this.config.layout.textureMaxSide);r.set(l,c),i.set(o.id,c)}return this.textures.set(e,i),this.worldPerPixel.set(e,this.config.layout.characterHeight/n.characterHeight),i}reset(e){this.epoch+=1,this.queue=[],this.running=!1,this.clock.clear(),this.sparks.clear(),this.envFx?.layer.clear(),this.envSurface=null,this.dimToken+=1,this.dimKnob.v=1,this.scene.background=new Ge(920587),this.overlay.clear();for(let i of this.cards.keys())i.dispose();this.cards.clear(),this.effects.clear(),this.cutscene.clear();for(let i of this.ultimates.values())i.environment?.setOpacity(0);for(let i of this.actors.values())this.scene.remove(i.doll.root);this.actors.clear();let t=this.config.layout,n={ally:0,enemy:0};for(let i of e){let r=this.sprites.get(i.artId),o=this.texturesOf(i.artId);if(!r||!o)continue;let a=n[i.side]++,l=i.side==="ally"?-1:1,c=new ta(i.combatantId,r,o,this.worldPerPixel.get(i.artId)??1,10+a);c.home.set(l*(t.sideHalfGap+a*t.rowOutward),0,-a*t.rowDepth),c.setFacing(i.side==="ally"?1:-1),c.reset(),this.scene.add(c.root),this.actors.set(i.combatantId,{entry:i,doll:c,hp:i.hp,mentality:i.mentality})}this.overlay.setActors(e.filter(i=>this.actors.has(i.combatantId))),this.foregroundFade.v=1,this.reframe(),this.rig.snapHome()}play(e){this.queue.push(...e),this.running||this.run(this.epoch)}get idle(){return!this.running&&this.queue.length===0}async run(e){this.running=!0;try{for(;this.queue.length>0&&e===this.epoch;){let t=this.queue.shift();if(t.kind!=="state"&&!this.stepOnStage(t)){this.applyAll(By(t));continue}t.kind!=="state"&&this.enterExchange(t.kind==="oneSided"?[t.attackerId,t.targetId]:[t.attackerId,t.defenderId]),t.kind==="oneSided"?await this.playOneSided(t,e):t.kind==="clash"?await this.playClash(t,e):this.applyState(t.event)}e===this.epoch&&this.leaveExchange()}catch(t){t instanceof Us||console.error(t)}finally{e===this.epoch&&(this.running=!1)}}stepOnStage(e){return(e.kind==="oneSided"?[e.attackerId,e.targetId]:[e.attackerId,e.defenderId]).every(n=>this.actors.has(n))}enterExchange(e){let t=this.config.motion;this.clock.tween(this.foregroundFade,"v",0,t.foregroundFade);for(let[n,i]of this.actors)this.setShown(i.doll,e.includes(n))}leaveExchange(){this.clock.tween(this.foregroundFade,"v",1,this.config.motion.foregroundFade);for(let e of this.actors.values())this.setShown(e.doll,!0)}setShown(e,t){let n=this.config.motion;if(e.hidden===!t)return;e.hidden=!t;let i=t?e.down?n.downOpacity:1:0;this.clock.tween(e.fade,"v",i,n.bystanderFade)}async wait(e,t){let n=await e;if(t!==this.epoch)throw new Us;return n}actor(e){let t=this.actors.get(e);if(!t)throw new Us;return t}applyState(e){if(e.type==="damageApplied"){let t=this.actors.get(e.combatantId);t&&(t.hp=e.hp)}else if(e.type==="statusTicked"){let t=this.actors.get(e.combatantId);t&&(t.hp=Math.max(0,t.hp-e.damage),this.overlay.number(this.headPoint(e.combatantId,.2),String(e.damage),""))}else if(e.type==="mentalityChanged"){let t=this.actors.get(e.combatantId);t&&(t.mentality=e.mentality)}else if(e.type==="defeated"){let t=this.actors.get(e.combatantId);t&&!t.doll.down&&this.fallDown(t,this.epoch).catch(()=>{})}}applyAll(e){for(let t of e)this.applyState(t)}dir(e,t){return Math.sign(t.root.position.x-e.root.position.x)||e.facing}chest(e){return e.chest(this.config.layout.characterHeight*.5)}windup(e,t,n){return e.showFrame(t),this.clock.tween(e.visual.position,"x",e.toLocalX(-n*this.config.motion.windupBack),this.config.motion.windupTime)}dash(e,t,n,i){e.setPose("dash"),this.dashSound(e);let r=Math.sign(t-e.root.position.x)||e.facing;return this.envEvent("dashStart",e,r),bt(this.clock.tween(e.root.position,"x",t,i,st.inQuad),this.clock.tween(e.root.position,"z",n,i,st.inQuad),this.clock.tween(e.visual.position,"x",0,i)).then(()=>this.envEvent("brake",e,r))}strike(e,t,n){return e.showFrame(t),this.clock.tween(e.visual.position,"x",e.toLocalX(n*this.config.motion.strikeReach),this.config.motion.strikeTime,st.outBack)}hitSegments(e,t){let n=t.map((i,r)=>e.catalog.frame(i).impact?r:-1).filter(i=>i>=0);return n.length===0&&n.push(t.length>1?1:0),n.map((i,r)=>t.slice(i,n[r+1]??t.length))}frameSeconds(e,t,n){let i=e.catalog.frame(t).ms;return i!==null?i/1e3:this.config.motion.strikeTrailTime/Math.max(1,n)}async playSegment(e,t,n,i=!1){let r=t.length-1,o=t.slice(1),a=i&&o.length>1?o.length-1:-1,l=yh(o.filter((h,u)=>u!==a).map(h=>this.frameSeconds(e,h,r)),this.config.motion.decayEase);await this.wait(this.clock.waitGame(this.frameSeconds(e,t[0],r)),n);let c=0;for(let[h,u]of o.entries()){if(e.down)return;e.showFrame(u),this.frameVoice(e,u);let d=h===a?this.frameSeconds(e,u,r):l[c++]??0;await this.wait(this.clock.waitGame(d),n)}}nudge(e,t){let n=this.config.motion;return e.setPose("hurt"),this.clock.tween(e.root.position,"x",e.root.position.x+t*n.hitKnock,n.knockTime,st.outExpo)}worldX(e){return e.root.position.x+e.visual.position.x*e.root.scale.x}async playHits(e,t,n,i,r,o,a,l){let c=this.config.motion,h=this.dir(e,t),u=this.hitSegments(e,n),d=u.map(()=>[]);for(let m=0;m+1<u.length;m++){let f=u[m];for(;f.length>1&&e.catalog.frame(f[f.length-1]).windup;)d[m+1].unshift(f.pop())}let p=pa(i,u.length),g=n.length>1&&u[0]?.[0]===n[0];g||(e.showFrame(n[0]),await this.wait(this.clock.waitGame(c.readyHold),l));let y=this.lab?this.config.lab:null;for(let m=0;m<u.length;m++){let f=u[m],S=m===u.length-1;if(m>0&&!t.down&&Math.abs(this.worldX(t)-this.worldX(e))>c.contactGap*1.25){let b=this.worldX(t)-h*c.contactGap,L=Math.max(c.followTime,Math.abs(b-this.worldX(e))/c.followSpeed);e.setPose("dash"),this.dashSound(e),this.envEvent("dashStart",e,h),await this.wait(bt(this.clock.tween(e.root.position,"x",b,L,st.inOutQuad),this.clock.tween(e.root.position,"z",t.root.position.z,L,st.inOutQuad)),l),this.envEvent("brake",e,h)}y&&S&&m>0&&await this.wait(this.clock.waitGame(y.finalBeatPause),l);for(let b of d[m]??[])e.showFrame(b),await this.wait(this.clock.waitGame(this.frameSeconds(e,b,f.length)),l);let v=g&&m===0?this.voiceOf(e)?.parry??null:this.voiceOf(e)?.frames[f[0]]??null,T=this.chest(e).lerp(this.chest(t),this.config.sparks.contactBias);this.voice(e,v,{impactIn:this.wallSeconds(c.strikeTime),at:T,gain:y?S?y.voiceGain.final:y.voiceGain.intermediate:1}),g&&m===0?(e.showFrame(f[0]),a?(t.showFrame(a),await this.wait(this.clock.tween(t.visual.position,"x",t.toLocalX(-h*c.parryLunge),c.strikeTime,st.outBack),l)):await this.wait(this.strike(e,f[0],h),l)):await this.wait(this.strike(e,f[0],h),l);let R=this.chest(e).lerp(this.chest(t),this.config.sparks.contactBias),C=p[m]??0;if(this.impact(R,t,h,C,!1,S?r:[],S?i:0,!0,S?"heavy":"light"),S&&i>0&&this.envEvent("finalHit",t,h,R),m===0)for(let b of o)this.fadeCard(b);let A=y&&S?this.clock.waitGame(y.attackerHold).then(()=>this.playSegment(e,f,l,!0)):this.playSegment(e,f,l,S),$=[this.clock.tween(e.visual.position,"x",0,c.knockTime),A];t.down||(S?i>0&&$.push(this.knockback(t,h,i,i>=c.heavyDamage,l)):$.push(this.nudge(t,h),this.clock.tween(t.visual.position,"x",0,c.knockTime)));let x=S?Math.min(c.knockMax,c.knockBase+i*c.knockPerDamage):c.hitKnock;t.down||this.rig.focus(this.chest(e),this.chest(t).add(new k(h*x,0,0)),h),await this.wait(bt($),l)}await this.wait(this.clock.waitReal(c.lingerAfterHit),l)}async knockback(e,t,n,i,r){let o=this.config.motion;e.setPose("hurt");let a=Math.min(o.knockMax,o.knockBase+n*o.knockPerDamage);await this.wait(bt(this.clock.tween(e.visual.position,"x",e.toLocalX(t*a),o.knockTime,st.outExpo),this.clock.tween(e.visual.position,"y",i?o.staggerDrop:0,o.knockTime,st.outExpo)),r),this.envEvent("knockLand",e,t,null,i),i&&this.envEvent("heavyLand",e,t),i&&await this.wait(this.clock.waitGame(o.staggerHold),r)}springBack(e){let t=this.config.motion;if(e.down)return Promise.resolve();e.setPose("retreat");let n=st.outElastic(t.settleAmplitude,t.settlePeriod);return bt(this.clock.tween(e.visual.position,"x",0,t.settleTime,n),this.clock.tween(e.visual.position,"y",0,t.settleTime,n))}returnHome(e){let t=this.config.motion;return e.down?Promise.resolve():(e.setPose("retreat"),bt(this.clock.tween(e.root.position,"x",e.home.x,t.returnTime,st.outCubic),this.clock.tween(e.root.position,"z",e.home.z,t.returnTime,st.outCubic),this.clock.tween(e.visual.position,"x",0,t.returnTime),this.clock.tween(e.visual.position,"y",0,t.returnTime)))}async fallDown(e,t){let n=this.config.motion,i=e.doll;i.down=!0,i.setPose("hurt"),this.sound.play("down"),this.envEvent("down",i,1),await this.wait(bt(this.clock.tween(i.visual.position,"y",-n.downSink,n.downTime,st.outCubic),this.clock.tween(i.fade,"v",i.hidden?0:n.downOpacity,n.downTime)),t)}async reviewEnvFx(e){let t=this.envFx,n=[...this.actors.values()],i=n.find(l=>l.entry.side==="ally")?.doll,r=n.find(l=>l.entry.side==="enemy")?.doll;if(!t||!i||!r)return;let o=this.epoch,a=[null,...[...this.ultimates.values()].filter(l=>l.environment)];try{for(;;)for(let l of a){for(let c of this.ultimates.values())c.environment?.setOpacity(c===l?1:0);this.envSurface=l?.surface??null;for(let c of t.vfx.events.keys()){let h=t.vfx.events.get(c)?.surfaces.includes(this.surface.kind)??!1;e(`${this.surface.kind} \xB7 ${c}${h?"":" (\uC774 \uC9C0\uD615\uC5D0\uC11C\uB294 \uC548 \uB0C4)"}`),this.rig.focus(this.chest(i),this.chest(r),1),this.envEvent(c,r,1,this.chest(i).lerp(this.chest(r),.5),c==="knockLand"),await this.wait(this.clock.waitReal(1.3),o)}}}catch{}finally{for(let l of this.ultimates.values())l.environment?.setOpacity(0);this.envSurface=null}}get surface(){return this.envSurface??this.mapSurface}envEvent(e,t,n,i=null,r=!1){let o=this.envFx,a=o?.vfx.events.get(e);if(!o||!a)return;let l=this.surface;if(!a.surfaces.includes(l.kind))return;for(let h of a.spawns){let u=h.anchor==="contact"?i??(t?this.chest(t):null):h.anchor==="chest"?t?this.chest(t):i:t?this.footOf(t):i;u&&o.layer.spawn(h,u,n,l.tint,l.crack)}let c=o.vfx.camera.presets.get(r&&a.heavyCamera?a.heavyCamera:a.camera);c&&c.duration>0&&this.rig.envImpulse(`${e}:${++this.envSerial}`,c.amplitude,c.duration/1e3,c.zoom,n,this.clock.realNow,o.vfx.camera.cap)}voiceOf(e){return this.voices.get(e.catalog.manifest.character)??null}voice(e,t,n={}){let i=this.voiceOf(e);if(!i||!t)return!1;let r=(i.lead[t]??0)/1e3,o=n.impactIn!==void 0?Math.max(0,Math.min(.5,n.impactIn-r)):0,a=this.lab&&n.at?this.panOf(n.at):0;return this.sound.playSample?.(`${i.character}/${t}`,(i.gain[t]??1)*(n.gain??1),{delay:o,pan:a})??!1}frameVoice(e,t,n={}){this.voice(e,this.voiceOf(e)?.frames[t]??null,n)}panOf(e){let t=e.clone().project(this.camera);return Math.max(-1,Math.min(1,t.x))*this.config.lab.pan.width}wallSeconds(e){return e/Math.max(.05,this.clock.scale)/Math.max(.1,this.speed)}dashSound(e){this.voice(e,this.voiceOf(e)?.dash??null)||this.sound.play("dash")}hitSlow(e){let t=this.config.motion,n=++this.slowToken;this.clock.setSlowMotion(1),this.clock.waitReal(e).then(()=>{if(n===this.slowToken)return this.clock.setSlowMotion(t.hitSlowScale),this.clock.waitReal(t.hitSlowTime)}).then(()=>{n===this.slowToken&&this.clock.setSlowMotion(1)})}impact(e,t,n,i,r,o,a=i,l=!0,c=null){let h=this.config.shake,u=this.config.hitStop,d=a>=this.config.motion.heavyDamage;l&&this.sparks.burst(e,n,r,10);let p=this.lab&&c?this.config.lab:null,g=p&&c?p.hitStop[c]:r&&i<=0?u.clashSeconds:Math.min(u.maxSeconds,u.baseSeconds+i*u.perDamageSeconds);this.clock.startHitStop(g,u.scale),i>0&&this.hitSlow(g+this.config.motion.knockTime);let y=i>0?Math.min(1,i/h.damageForMaxShake):h.clashPower;this.lab?.reducedMotion&&p||this.rig.impact(p&&c?y*p.shake[c]:y,n),p&&(c==="heavy"||c==="climax")&&this.dimBackdrop(),p&&c==="climax"&&!this.lab?.reducedFlash&&this.impactFrame(),this.sound.play(i<=0?"clash":d?"hitHeavy":"hit");let m=this.actors.get(t.combatantId);m&&i>0&&o.length===0&&!r&&(m.hp=Math.max(0,m.hp-i)),this.applyAll(o),i>0&&(this.overlay.number(this.headPoint(t.combatantId,.1),String(i),d?"heavy":""),d&&this.overlay.number(this.headPoint(t.combatantId,.55),"\uD750\uD2B8\uB7EC\uC9D0","tag"))}showCallouts(e,t){for(let n of e)t.includes(n.combatantId)&&this.overlay.callout(n.combatantId,n.success,n.title,n.reason,this.clock.realNow,this.config.callout.seconds)}makeCard(e,t){let n=this.actor(t.combatantId).entry,i=this.skillInfo(t.skillId,n.characterId),r=n.side,o=i.attribute?this.kit.glyphs[i.attribute]??null:null,a=new ks({name:i.name,slot:i.slot,frontPower:i.frontPower,backPower:i.backPower,tint:r==="ally"?Ih.ally:Ih.enemy,glyph:o},this.config.cardFlip.height,this.kit.completePlates(n.characterId,t.skillId)??this.kit.plates);return this.scene.add(a.root),this.cards.set(a,e),a}cardAnchor(e){let t=this.config.cardFlip,n=this.config.layout.characterHeight;return new k(e.root.position.x+e.visual.position.x*e.root.scale.x,n*1.05+e.visual.position.y+t.headLift+t.height/2,e.root.position.z)}async revealCards(e,t){let n=this.config.cardFlip;this.sound.play("flip");let i=[];for(let{card:r,face:o}of e)r.state.spin=0,r.state.dim=0,r.state.opacity=1,this.clock.tweenReal(r.state,"scale",1,n.spinTime*.25,st.outBack),i.push(this.clock.tweenReal(r.state,"spin",ks.restAngle(o,n.spinTurns),n.spinTime,st.outCubic));await this.wait(bt(i),t),this.sound.play("reveal");for(let{card:r}of e)r.state.scale=1.3;await this.wait(bt(e.map(({card:r})=>this.clock.tweenReal(r.state,"scale",1,n.revealPop,st.outQuad))),t)}dimCard(e){let t=this.config.cardFlip;this.clock.tweenReal(e.state,"dim",1,t.holdTime*.5),this.clock.tweenReal(e.state,"scale",.8,t.holdTime*.5)}async fadeCard(e){e&&(await this.clock.tweenReal(e.state,"opacity",0,this.config.cardFlip.fadeTime),this.cards.delete(e),e.dispose())}approach(e,t,n){let i=this.config.cardFlip,r=(i.spinTime+i.revealPop+i.holdTime)*i.slowScale;e.setPose("dash"),this.dashSound(e),this.envEvent("dashStart",e,Math.sign(t-e.root.position.x)||e.facing);let o=e.root.position.x+(t-e.root.position.x)*i.approachShare,a=e.root.position.z+(n-e.root.position.z)*i.approachShare;return bt(this.clock.tween(e.root.position,"x",o,r,st.linear),this.clock.tween(e.root.position,"z",a,r,st.linear),this.clock.tween(e.visual.position,"x",0,r))}async playOneSided(e,t){let n=this.actor(e.attackerId).doll,i=this.actor(e.targetId).doll,r=this.config.motion,o=this.config.cardFlip,a=this.dir(n,i),l=n.skillFrames(this.slotOf(e.skillId)),c=i.root.position.x-a*r.contactGap,h=i.root.position.z;this.rig.focus(this.chest(n),this.chest(i),a),await this.wait(this.windup(n,n.poseFrame("dash"),a),t);let u=this.makeCard(n,e.flip);this.clock.setSlowMotion(o.slowScale);let d=this.approach(n,c,h);await this.wait(this.revealCards([{card:u,face:e.flip.face}],t),t),this.showCallouts(e.callouts,[e.attackerId]),await this.wait(this.clock.waitReal(o.holdTime),t),await this.wait(d,t),this.clock.setSlowMotion(1);let p=this.ultimateFor(e.attackerId,e.skillId);if(p){await this.playUltimate(p,n,i,e.damage,e.events,[u],t);return}await this.wait(this.dash(n,c,h,r.dashTime*(1-o.approachShare)),t),this.rig.focus(this.chest(n),this.chest(i),a),await this.wait(this.playHits(n,i,l,e.damage,e.events,[u],null,t),t),this.rig.release();let g=Math.abs(i.root.position.x-i.home.x)>.01;await this.wait(bt(g?this.returnHome(i):this.springBack(i),this.returnHome(n)),t),this.settle(n),this.settle(i)}async playClash(e,t){let n=this.actor(e.attackerId).doll,i=this.actor(e.defenderId).doll,r=this.config.motion,o=this.config.cardFlip,a=this.dir(n,i),l=n.skillFrames(this.slotOf(e.attackerSkillId)),c=i.skillFrames(this.slotOf(e.defenderSkillId));this.rig.focus(this.chest(n),this.chest(i),a),await this.wait(bt(this.windup(n,n.poseFrame("dash"),a),this.windup(i,i.poseFrame("dash"),-a)),t);let h=(n.root.position.x+i.root.position.x)/2,u=(n.root.position.z+i.root.position.z)/2,d=h-a*r.contactGap/2,p=h+a*r.contactGap/2,g=null,y=null,m=!1;for(let S of e.rounds){g??(g=this.makeCard(n,S.attackerFlip)),y??(y=this.makeCard(i,S.defenderFlip)),this.clock.setSlowMotion(o.slowScale);let v=m?null:bt(this.approach(n,d,u),this.approach(i,p,u));if(m&&(n.setPose("guard"),i.setPose("guard")),await this.wait(this.revealCards([{card:g,face:S.attackerFlip.face},{card:y,face:S.defenderFlip.face}],t),t),this.showCallouts(S.callouts,[e.attackerId,e.defenderId]),S.type==="win"&&this.dimCard(S.loserId===e.attackerId?g:y),await this.wait(this.clock.waitReal(o.holdTime),t),v&&await this.wait(v,t),this.clock.setSlowMotion(1),S.type==="win"){this.applyAll(S.events);break}let T=m?r.reengageTime:r.dashTime*(1-o.approachShare);await this.wait(bt(this.dash(n,d,u,T),this.dash(i,p,u,T)),t),this.rig.focus(this.chest(n),this.chest(i),a),await this.wait(bt(this.strike(n,l[1]??l[0],a),this.strike(i,c[1]??c[0],-a)),t),this.impact(this.chest(n).lerp(this.chest(i),.5),i,a,0,!0,S.events),this.envEvent("deadlock",null,a,this.chest(n).lerp(this.chest(i),.5)),this.sound.play("clashTie");let R=(C,A)=>(C.setPose("guard"),[this.clock.tween(C.root.position,"x",C.root.position.x+A*r.deadlockPush,r.knockTime,st.outExpo),this.clock.tween(C.visual.position,"x",0,r.knockTime)]);await this.wait(bt(R(n,-a),R(i,a)),t),await this.wait(this.clock.waitGame(r.roundRest),t),m=!0}let f=e.finisher;if(f){let S=this.actor(f.winnerId).doll,v=this.actor(f.loserId).doll,T=this.dir(S,v),R=S.skillFrames(this.slotOf(f.winnerSkillId)),C=this.ultimateFor(f.winnerId,f.winnerSkillId);if(C){await this.playUltimate(C,S,v,f.damage,e.events,[g,y],t);return}v.setPose("guard"),await this.wait(this.dash(S,v.root.position.x-T*r.contactGap,v.root.position.z,m?r.reengageTime:r.dashTime),t),this.rig.focus(this.chest(S),this.chest(v),T);let A=v.skillFrames(this.slotOf(f.loserId===e.attackerId?e.attackerSkillId:e.defenderSkillId));await this.wait(this.playHits(S,v,R,f.damage,e.events,[g,y],A[0],t),t)}else this.applyAll(e.events),this.fadeCard(g),this.fadeCard(y),await this.wait(this.clock.waitReal(r.lingerAfterHit),t);this.rig.release(),await this.wait(bt(this.returnHome(n),this.returnHome(i)),t),this.settle(n),this.settle(i)}settle(e){e.down||e.setPose("idle")}ultimateFor(e,t){if(this.slotOf(t)!=="ULT")return null;let n=this.actors.get(e);return!n||n.entry.artId!==n.entry.characterId?null:this.ultimates.get(n.entry.characterId)??null}footOf(e){return new k(e.root.position.x+e.visual.position.x*e.root.scale.x,.02,e.root.position.z+.05)}async playUltimate(e,t,n,i,r,o,a){let l=e.art.timeline,c=this.config.motion,h=this.clock.realNow,u=b=>this.wait(this.clock.waitReal(Math.max(0,h+b-this.clock.realNow)),a),d=this.dir(t,n),p=b=>t.catalog.manifest.effects.find(L=>L.id===b)??null,g=(b,L,N={})=>{let K=p(b),P=e.effects.get(b);return K&&P?this.effects.spawn(K,P,L,t.facing,this.clock.realNow,N):null};t.showFrame(e.art.frames.ready);let y=(b,L)=>this.voice(t,this.voiceOf(t)?.ultimate[b]??null,L?{at:L}:{});y("start"),this.envEvent("ultStart",t,d),this.rig.focus(this.chest(t),this.chest(n),d);let m=g(e.art.effects.pool,this.footOf(t),{hold:!0,order:9});m&&(m.material.opacity=0,this.effects.fade(m,1,l.poolIn,this.clock.realNow)),await u(l.swapEnvironment),e.fade.v=1,this.envSurface=e.surface,e.environment?.setOpacity(1),await u(l.cutsceneStart),this.clock.waitReal(l.cutLine-l.cutsceneStart).then(()=>{this.cutscene.active&&y("cutLine")}),this.cutscene.flash=!this.lab?.reducedFlash,this.cutscene.play(e.art.cutscene,{background:e.background,foreground:e.foreground,line:e.line},this.clock.realNow,l.cutsceneEnd-l.cutsceneStart,l.cutLine-l.cutsceneStart),await u(l.appearBehind),this.effects.fade(m,0,.1,this.clock.realNow),t.root.position.x=n.root.position.x+d*e.art.behindGap,t.root.position.z=n.root.position.z,t.visual.position.set(0,0,0),t.showFrame(e.art.frames.open),this.rig.focus(this.chest(n),this.chest(t),d);let f=e.art.slashes,S=pa(i,f.count),v=this.config.layout.characterHeight,T=Promise.resolve(),R=this.lab?this.config.lab.ultimate:null,C=l.sheathClick+(R?R.payoffDelay:0),A=b=>{if(!R)return l.sheathClick+b*f.interval;let L=C;for(let N=0;N<b;N++)L+=R.slashIntervals[Math.min(N,R.slashIntervals.length-1)]??f.interval;return L},$=[{time:R?C:l.water,run:()=>{g(e.art.effects.water,this.footOf(n)),y("water",this.chest(n))}}];R&&$.push({time:l.sheathClick,run:()=>{t.showFrame(e.art.frames.closed),y("sheathClick",this.chest(t));for(let b of o)this.fadeCard(b)}});for(let b=0;b<f.count;b++){let L=b===f.count-1;$.push({time:A(b),run:()=>{if(b===0&&!R){t.showFrame(e.art.frames.closed),y("sheathClick");for(let U of o)this.fadeCard(U)}let[N,K]=f.offset[b%f.offset.length]??[0,0],P=this.chest(n).add(new k(N*v*t.facing,K*v,0));g(e.art.effects.slash,P,{roll:(f.rollDeg[b%f.rollDeg.length]??0)*Math.PI/180});let H=S[b]??0,[q,J]=L?[1,0]:f.jolt[b%f.jolt.length]??[0,0],W=-d*(q<0?-1:1);this.impact(this.chest(n),n,W,H,!1,L?r:[],L?i:0,!1,L?"climax":"light"),L&&this.envEvent("ultPayoff",n,-d),!n.down&&(L?i>0&&(T=this.knockback(n,-d,i,i>=c.heavyDamage,a)):(n.setPose("hurt"),this.clock.tween(n.visual.position,"x",n.toLocalX(-d*q*v),f.joltTime,st.outExpo),this.clock.tween(n.visual.position,"y",J*v,f.joltTime,st.outExpo)))}})}$.sort((b,L)=>b.time-L.time);for(let b of $)await u(b.time),b.run();await u(l.restoreEnvironment),this.clock.tweenReal(e.fade,"v",0,l.restoreFade),this.envSurface=null,await u(l.end),e.environment?.setOpacity(0),await this.wait(T,a),this.rig.release();let x=Math.abs(n.root.position.x-n.home.x)>.01;await this.wait(bt(x?this.returnHome(n):this.springBack(n),this.returnHome(t)),a),this.settle(t),this.settle(n)}tick(e){let t=this.clock.step(e),n=this.canvas.getBoundingClientRect();if(this.sparks.step(t,this.camera,n.width,n.height),this.envFx?.layer.update(e,this.camera),this.lab){let i=this.config.lab.breath,r=0;for(let o of this.actors.values())o.doll.breath=o.doll.idle&&!o.doll.down?i.amplitude*Math.sin((this.clock.realNow/i.period+r)*Math.PI*2):0,r+=.37}this.rig.write(e,this.clock.realNow),this.camera.updateMatrixWorld();for(let i of this.actors.values())i.doll.faceCamera(this.camera);for(let[i,r]of this.cards)i.update(this.cardAnchor(r),this.camera);this.effects.update(this.clock.realNow,this.camera),this.cutscene.update(this.clock.realNow);for(let i of this.ultimates.values())i.fade.v<1&&i.fade.v>0&&i.environment?.setOpacity(i.fade.v);this.overlay.update(i=>this.headPoint(i,0),i=>this.actors.get(i)?.doll.down??!1,this.clock.realNow,this.config.callout.headOffset*.06,i=>this.footPoint(i),i=>{let r=this.actors.get(i);return r?{hp:r.hp,maxHp:r.entry.maxHp,mentality:r.mentality,maxMentality:r.entry.maxMentality}:null}),this.renderer.render(this.scene,this.camera)}footPoint(e){let t=this.actors.get(e);if(!t||t.doll.hidden)return null;t.doll.root.updateMatrixWorld(!0);let n=t.doll.visual.getWorldPosition(new k).project(this.camera);return n.z>1?null:{x:(n.x+1)/2,y:(1-n.y)/2}}headPoint(e,t){let n=this.actors.get(e);if(!n||n.doll.hidden)return null;let i=n.doll,r=this.config.layout.characterHeight,o=new k(i.root.position.x+i.visual.position.x*i.root.scale.x,r*(1.05+t)+i.visual.position.y,i.root.position.z).project(this.camera);return o.z>1?null:{x:(o.x+1)/2,y:(1-o.y)/2}}snapshot(){return[...this.actors.values()].map(e=>({combatantId:e.entry.combatantId,name:e.entry.name,side:e.entry.side,hp:{value:e.hp,max:e.entry.maxHp},mentality:{value:e.mentality,max:e.entry.maxMentality},down:e.doll.down}))}hitTest(e,t){let n=this.canvas.getBoundingClientRect(),i=new Ue((e-n.left)/n.width*2-1,-((t-n.top)/n.height)*2+1);this.raycaster.setFromCamera(i,this.camera);let r=[...this.actors.values()].filter(a=>!a.doll.down&&!a.doll.hidden).map(a=>a.doll.pickTarget).filter(a=>a!==null),o=this.raycaster.intersectObjects(r,!1)[0];return o?o.object.userData.combatantId??null:null}setSelection(e){this.overlay.setSelection(e)}setKit(e){this.kit=e,this.overlay.setGaugeKit(e.gauge)}setStatuses(e,t){this.overlay.setStatuses(e,t)}onTagPick(e){this.overlay.onPick=e}setNote(e,t,n=!1){this.overlay.setNote(e,t,n)}setLab(e){if(this.lab=e?{...e}:null,this.rig.envMuted=this.lab?.reducedMotion??!1,this.overlay.reducedMotion=(this.lab?.reducedMotion??!1)||typeof matchMedia=="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches,!this.lab)for(let t of this.actors.values())t.doll.breath=0}setSpeed(e){this.speed=e}applyBrightness(e){this.backdrop.setBrightness(e);for(let t of this.ultimates.values())t.environment?.setBrightness(e)}async dimBackdrop(){let e=this.config.lab.dim,t=++this.dimToken;await this.clock.tweenReal(this.dimKnob,"v",e.level,e.in),await this.clock.waitReal(e.hold),t===this.dimToken&&await this.clock.tweenReal(this.dimKnob,"v",1,e.out)}async impactFrame(){let e=[this.backdrop.root,...[...this.ultimates.values()].flatMap(i=>i.environment?[i.environment.root]:[])],t=e.map(i=>i.visible);for(let i of e)i.visible=!1;let n=this.scene.background;this.scene.background=new Ge(15328474);for(let i of this.actors.values())i.doll.setTint(0);await this.clock.waitReal(this.config.lab.impactFrame.seconds),e.forEach((i,r)=>i.visible=t[r]??i.visible),this.scene.background=n;for(let i of this.actors.values())i.doll.setTint(16777215)}setGauge(e,t){this.overlay.setGauge(e,t)}};function By(s){return s.kind==="oneSided"?s.events:[...s.rounds.flatMap(e=>e.events),...s.events]}function Hy(s,e){let[t,n]=s.viewport,i=document.createElement("canvas");i.width=t,i.height=n;let r=i.getContext("2d");if(!r)return i;for(let o of[...s.layers].sort((a,l)=>a.order-l.order)){let a=e.get(o.file);if(!a)continue;let l=a.naturalWidth>0?a.naturalWidth/t:1;if(o.draws.length>0)for(let c of o.draws){let[h,u,d,p]=c.source;r.drawImage(a,h*l,u*l,d*l,p*l,...c.destination)}else{let[c,h,u,d]=o.rect;r.drawImage(a,c*t,h*n,u*t,d*n)}}return i}function Lh(){let s=document;return s.fullscreenElement??s.webkitFullscreenElement??null}function zy(s){let e=document,t=s;return(e.fullscreenEnabled??e.webkitFullscreenEnabled??!1)&&(typeof t.requestFullscreen=="function"||typeof t.webkitRequestFullscreen=="function")}async function Vy(s){let e=document,t=s;try{if(Lh()){e.exitFullscreen?await e.exitFullscreen():e.webkitExitFullscreen?.();return}t.requestFullscreen?await t.requestFullscreen({navigationUI:"hide"}):t.webkitRequestFullscreen?.(),await screen.orientation.lock?.("landscape").catch(()=>{})}catch{}}function Dh(s,e){if(!e||(e.hidden=!zy(s),e.hidden))return;let t=()=>{let n=Lh()===s;e.setAttribute("aria-pressed",String(n)),e.setAttribute("aria-label",n?"\uC804\uCCB4\uD654\uBA74 \uB044\uAE30":"\uC804\uCCB4\uD654\uBA74"),e.title=n?"\uC804\uCCB4\uD654\uBA74 \uB044\uAE30":"\uC804\uCCB4\uD654\uBA74"};e.addEventListener("click",()=>void Vy(s)),document.addEventListener("fullscreenchange",t),document.addEventListener("webkitfullscreenchange",t),t()}var Uh=document.getElementById("view"),pt=Uh?.dataset.assets??"../assets",Gy=Uh?.dataset.battle??"../docs/battle-data.json";async function bn(s){let e=await fetch(s);if(!e.ok)throw new Error(`${s} \uB97C \uC77D\uC744 \uC218 \uC5C6\uB2E4 (${e.status})`);return e.json()}function ra(s){return new Promise(e=>{let t=new Image;t.onload=()=>e(t),t.onerror=()=>e(null),t.src=s})}async function Wy(s){let[e,t,n]=await Promise.all([bn(Gy),Ml(pt),bn(`${pt}/ui/stage3d.json`)]),i=new zs(sl(e)),r=El(n),o=r.battle.map,a=ba(await bn(`${pt}/${o}/placement.json`)),l=await Sl(pt),c=new Map;await Promise.all(i.data.characters.map(async x=>{if(!l.has(x.id))return;let b=await bl(pt,x.id);b&&c.set(x.id,b)}));let h=await bn(`${pt}/index.json`),u=Array.isArray(h.ultimates)?h.ultimates.filter(x=>typeof x=="string"):[],d=new Map;await Promise.all(u.filter(x=>c.has(x)).map(async x=>{let b=ml(await bn(`${pt}/${x}/ultimate.json`)),L=b.environment?ba(await bn(`${pt}/${b.environment}/placement.json`)):null;d.set(x,{art:b,environment:L})}));let p=Array.isArray(h.sounds)?h.sounds.filter(x=>typeof x=="string"):[],g=new Map,y=new Map;await Promise.all(p.filter(x=>c.has(x)).map(async x=>{let b=pl(await bn(`${pt}/${x}/sounds.json`));g.set(x,b),await Promise.all(Object.entries(b.files).map(async([L,N])=>{try{let K=await fetch(`${pt}/${x}/${N}`);K.ok&&y.set(`${x}/${L}`,await K.arrayBuffer())}catch{}}))}));let m=null;try{m=fl(await bn(`${pt}/env-vfx/metadata/manifest.json`),await bn(`${pt}/env-vfx/metadata/camera-presets.json`),await bn(`${pt}/env-vfx/bindings.json`))}catch{m=null}let f=[];for(let x of a.layers)f.push({key:`${o}/${x.file}`,url:`${pt}/${o}/${x.file}`});for(let[x,b]of c)for(let L of b.manifest.frames)f.push({key:`${x}/${L.file}`,url:`${pt}/${x}/${L.file}`});for(let[x,{art:b,environment:L}]of d){let N=new Set(Object.values(b.effects)),K=new Set([b.cutscene.foreground,b.cutscene.line]);for(let P of c.get(x)?.manifest.effects??[])if(N.has(P.id))for(let H of P.frames)K.add(H.file);for(let P of K)f.push({key:`${x}/${P}`,url:`${pt}/${x}/${P}`});if(b.environment&&L)for(let P of L.layers)f.push({key:`${b.environment}/${P.file}`,url:`${pt}/${b.environment}/${P.file}`})}for(let x of m?ma(m):[])f.push({key:`env-vfx/${x}`,url:`${pt}/env-vfx/${x}`});let S=0,v=new Map,T=[];s(`\uADF8\uB9BC 0 / ${f.length}`,0),await Promise.all(f.map(async x=>{let b=await ra(x.url);b?v.set(x.key,b):T.push(x.key),S+=1,s(`\uADF8\uB9BC ${S} / ${f.length}`,S/f.length)}));let R=new Map;for(let x of a.layers){let b=v.get(`${o}/${x.file}`);b&&R.set(x.file,b)}let C=new Map;for(let[x,{art:b,environment:L}]of d){let N=new Map;if(b.environment&&L)for(let K of L.layers){let P=v.get(`${b.environment}/${K.file}`);P&&N.set(K.file,P)}C.set(x,{art:b,environment:L?{config:L,images:N}:null,image:K=>v.get(`${x}/${K}`)??null})}let A=new Map;for(let x of m?ma(m):[]){let b=v.get(`env-vfx/${x}`);b&&A.set(x,b)}let $=m&&A.size>0?{vfx:m,images:A}:null;return{catalog:i,ui:t,stage:r,backdrop:a,backdropImages:R,sprites:c,frames:v,ultimates:C,voices:g,samples:y,envFx:$,missing:T}}var Yo=class{constructor(e,t,n){this.catalog=e;this.setup=n;D(this,"battle");D(this,"ai",new Ai);D(this,"aiContext");let i=(o,a)=>a.map((l,c)=>({id:`${o==="ally"?"a":"e"}${c+1}`,characterId:l,side:o}));this.battle=new Vs(e,i("ally",n.ally),i("enemy",n.enemy),{rng:t,enemyAi:this.ai});let r=new Ti(e,t);this.aiContext={catalog:e,resolver:r,rng:t}}roster(){return this.battle.combatants.map(e=>{let t=this.setup.artAlias[e.base.id];return{combatantId:e.id,characterId:e.base.id,artId:t??e.base.id,name:t?`${e.base.name} \xB7 \uC790\uB9AC \uD45C\uC2DC`:e.base.name,side:e.side,hp:e.hp,maxHp:e.base.maxHp,mentality:e.mentality,maxMentality:this.catalog.rules.mentalityMax}})}inputAllies(){return this.battle.sideOf("ally").filter(e=>!e.isDefeated).map(e=>({id:e.id,characterId:e.base.id,deck:[...e.deck],name:e.base.name}))}inputEnemies(){return this.battle.sideOf("enemy").filter(e=>!e.isDefeated).map(e=>({id:e.id,name:e.base.name}))}autoOrders(e){let t=this.battle.sideOf("enemy").filter(r=>!r.isDefeated),n=[],i=new Set;for(let r of this.battle.sideOf("ally")){if(r.isDefeated||t.length===0)continue;let o=this.ai.chooseTarget(r,t,i,this.aiContext);i.add(o);let a=this.battle.combatant(o),l=this.ai.chooseSkill(r,{target:a,isClash:e.get(o)===r.id,opponentSkillId:null},this.aiContext);n.push({actorId:r.id,targetId:o,skillId:l})}return n}},Xy=1920,$y=1080;function kh(){let s=Math.min(window.innerWidth/Xy,window.innerHeight/$y);return document.documentElement.style.setProperty("--u",String(s)),s}function qy(s,e){let t=Math.max(1,e.width),n=Math.max(1,e.height);return{left:Math.max(0,(s.left-e.left)/t),right:Math.min(1,(s.right-e.left)/t),top:Math.max(0,(s.top-e.top)/n),bottom:Math.min(1,(s.bottom-e.top)/n)}}async function Yy(){kh();let s=document.getElementById("view"),e=s.parentElement,t=document.getElementById("status"),n=document.getElementById("turn"),i=document.getElementById("seed"),r=document.getElementById("mode"),o=document.getElementById("autonext"),a=document.getElementById("loading"),l=document.getElementById("loading-bar"),c=document.getElementById("loading-text"),h=1;t.textContent="\uBD88\uB7EC\uC624\uB294 \uC911\u2026";let u=await Wy((I,E)=>{c&&(c.textContent=I),l&&(l.style.width=`${Math.round(E*100)}%`)}),d=`${pt}/ui/kit`,p=u.ui.display,[g,y,m,f,S,v]=await Promise.all(["U3_small_default","U15_overhead_front","U15_overhead_back","R_mark","R_insight","R_resolve"].map(I=>ra(`${d}/${I}.png`))),T=new Map;await Promise.all(Object.entries(p.cardKit).flatMap(([I,E])=>Object.keys(E).map(async Z=>{let[se,fe]=await Promise.all([ra(`${d}/K${Z}_overhead_front.png`),ra(`${d}/K${Z}_overhead_back.png`)]);se&&fe&&T.set(`${I}/${Z}`,{front:se,back:fe,complete:!0})})));let R=await fetch(`${d}/gauge-layout.json`).then(I=>I.ok?I.json():null).catch(()=>null);g&&document.documentElement.classList.add("kit"),a?.setAttribute("hidden","");let C=document.querySelector(".stage-name");if(C&&u.backdrop.name&&(C.textContent=u.backdrop.name),u.sprites.size===0)throw new Error("\uC5D0\uC14B\uC774 \uB4E4\uC5B4\uC628 \uCE90\uB9AD\uD130\uAC00 \uD558\uB098\uB3C4 \uC5C6\uB2E4");let A=new Js(u.ui.sound);for(let[I,E]of u.samples)A.addSample(I,E);let $=document.getElementById("sound"),x=document.getElementById("sound-hint"),b=()=>{x&&(x.hidden=A.running||($?!$.checked:!1))},L=()=>{A.unlock(),A.setMuted($?!$.checked:!1),window.setTimeout(b,300)};b();for(let I of["pointerdown","pointerup","touchend","click","keydown"])window.addEventListener(I,L,{capture:!0});$?.addEventListener("change",L);let N=new sa(s,e,u.stage,u.backdrop,u.backdropImages,u.sprites,(I,E)=>u.frames.get(`${I}/${E}`)??null,(I,E)=>{let Z=Xs(u.catalog,I,{name:E?p.cardKit[E]?.[I]:void 0,terms:p.terms});return{slot:Z.slot,name:Z.name,frontPower:Z.frontPower,backPower:Z.backPower,attribute:Z.trace}},A,u.ultimates,u.voices,u.envFx),K={};f&&(K.attack=f),S&&(K.defense=S),v&&(K.support=v),N.setKit({plates:y&&m?{front:y,back:m}:null,completePlates:(I,E)=>T.get(`${I}/${E}`)??null,glyphs:K,gauge:R?{base:g?d:null,layout:R}:null});let P=document.getElementById("ui"),H=document.querySelector(".topbar"),q=document.getElementById("command"),J=()=>{let I=kh();if(N.resize(),!P||!H||!q)return;let E=s.getBoundingClientRect(),Z=P.getBoundingClientRect(),se=H.getBoundingClientRect().bottom,fe=q.getBoundingClientRect().top,ve=Z.bottom-60*I,We=(Ze,ot)=>qy(new DOMRect(Z.left,Ze,Z.width,ot-Ze),E);N.setFrameZones({home:We(se,fe),focus:We(se,ve)},I)};J(),window.addEventListener("resize",J),window.addEventListener("orientationchange",J),Dh(e,document.getElementById("fullscreen"));let W="done",U=null,Y=null,ne=new Map,ae=0,X=()=>(r?.value??"play")==="play",j=()=>r?.value==="lab",le=()=>r?.value==="showcase"||j(),ge=document.getElementById("lab-motion"),me=document.getElementById("lab-flash"),Ce=document.getElementById("lab-options"),Ae=()=>{let I=j();Ce?.toggleAttribute("hidden",!I),N.setLab(I?{reducedMotion:ge?.checked??!1,reducedFlash:me?.checked??!1}:null)};ge?.addEventListener("change",Ae),me?.addEventListener("change",Ae);let Se=[],Ve=!1,O=I=>U?.battle.combatant(I).side==="ally",ht=I=>{N.play(ul(I,{isPlayerSide:O}))},_e=()=>{if(!U)return;let I=u.catalog.rules;for(let E of U.battle.combatants){let Z=cl(E.deck.includes(I.ultimateSkillId),E.ultimatePending);N.setGauge(E.id,E.isDefeated?null:{charge:Math.min(E.attributeTotal,I.ultimateThreshold),total:I.ultimateThreshold,stage:Z})}},Ee=()=>{if(U)for(let I of U.battle.combatants)N.setStatuses(I.id,I.isDefeated?[]:I.statuses.map(E=>({id:E.id,turns:E.turns})))},de=I=>{if(U)for(let E of U.battle.sideOf("enemy")){let Z=ne.get(E.id),se=Z?U.battle.combatant(Z).base.name:"",fe=!!Z&&Y?.orderOf(Z)?.targetId===E.id;N.setNote(E.id,I?se:"",fe)}},Qe=new Map,Le=I=>{if(Qe.has(I))return Qe.get(I)??null;let E=u.stage.battle.artAlias[I]??I,Z=u.sprites.get(E)?.frameEndingWith("idle"),se=Z?u.frames.get(`${E}/${Z.file}`):void 0,fe=null;if(Z&&se){let[ve,We,Ze,ot]=Z.bbox,mt=Math.min(Ze-ve,(ot-We)*.42),Je=mt*79/116,At=Math.max(0,Z.anchor.x-mt/2),kt=document.createElement("canvas");kt.width=232,kt.height=158,kt.getContext("2d")?.drawImage(se,At,Math.max(0,We-Je*.04),mt,Je,0,0,232,158);try{fe=kt.toDataURL("image/png")}catch{fe=`${pt}/${E}/${Z.file}`}}return Qe.set(I,fe),fe},w=()=>{!U||!Y||W!=="input"||(_.show(Y,U.inputAllies(),U.inputEnemies()),de(!0),N.setSelection({ally:Y.selectedAlly,target:Y.selectedTarget,pickable:Y.selectedAlly?U.inputEnemies().map(I=>I.id):U.inputAllies().map(I=>I.id)}))},_=new Zs(u.catalog,u.ui.side,{ally:I=>{Y?.selectAlly(I),w()},target:I=>{Y?.selectTarget(I),w()},card:I=>{Y?.selectCard(I),w()},go:()=>he()},Le,{display:p,kit:g?d:null,chance:(I,E)=>U?U.battle.frontChance(I,E):null,traces:I=>U?{...U.battle.combatant(I).attributes,threshold:u.catalog.rules.ultimateThreshold}:null}),B=()=>{if(!U)return;let I=U.battle.sideOf("ally")[0],E=U.battle.sideOf("enemy")[0];if(!I||!E)return;let Z=u.catalog,se=[...Z.deckFor(I.base.id),Z.rules.ultimateSkillId].map(ve=>{let We=Z.skill(ve);return{skillId:We.id,slot:We.slot,frontPower:We.frontPower}}),fe=Z.skill(Z.deckFor(E.base.id)[0]);Se=dl({allyId:I.id,enemyId:E.id,cards:se,enemyCard:{skillId:fe.id,backPower:fe.backPower},enemyMaxHp:E.base.maxHp}),N.play(Se)},Q=document.getElementById("result"),te=I=>{Q&&(Q.hidden=!1,Q.className=`result ${I==="ally"?"win":I==="enemy"?"lose":"draw"}`,Q.textContent=I==="ally"?"\uC2B9\uB9AC":I==="enemy"?"\uD328\uBC30":"\uBB34\uC2B9\uBD80")},ie=()=>{Q&&(Q.hidden=!0);let I=Number(i.value)||1;if(U=new Yo(u.catalog,rl(I),u.stage.battle),N.reset(U.roster()),Ae(),Ve=r?.value==="envfx",Ve){Y=null,W="done",n.textContent="-",_.idle("\uACF5\uC6A9 \uD658\uACBD \uC774\uD399\uD2B8 \uAC80\uC218 \u2014 \uC0AC\uAC74\uB9C8\uB2E4 \uD55C \uBC88\uC529, \uC804\uD22C \uB9F5\uACFC \uBC24\uBC14\uB2E4\uC5D0\uC11C \uB3C8\uB2E4"),N.reviewEnvFx(E=>t.textContent=`\uD658\uACBD \uC774\uD399\uD2B8 \xB7 ${E}`);return}if(le()){Y=null,W="showcase",t.textContent=j()?"\uC5F0\uCD9C \uC2E4\uD5D8 \xB7 S1 \u2192 S2 \u2192 S3 \u2192 \uACB0\uD589":"\uC2DC\uC5F0 \xB7 S1 \u2192 S2 \u2192 S3 \u2192 \uACB0\uD589",n.textContent="-",_.idle(j()?"\uC870\uC0AC\uD55C \uC5F0\uCD9C \uAE30\uBC95\uC744 \uCF20 \uC2E4\uD5D8 \u2014 \uBCF8\uD3B8\uC5D0\uB294 \uC544\uC9C1 \uC5C6\uB2E4":"\uC81C\uC791 \uD655\uC778\uC6A9 \uC790\uB3D9 \uC2DC\uC5F0 \u2014 \uC544\uAD70\uC774 \uD569\uC5D0\uC11C \uB298 \uC774\uAE34\uB2E4"),B();return}ae=0,Y=null,t.textContent=X()?"\uC804\uD22C \uC911":`\uC790\uB3D9 \uAD00\uC804 \xB7 \uC2DC\uB4DC ${I}`,n.textContent="1",W="resolving",pe()},pe=()=>{if(!U||U.battle.isFinished)return be();let I=U.battle.startTurn();if(ht(I),_e(),Ee(),n.textContent=String(U.battle.turn),U.battle.isFinished)return be();ne=new Map;for(let E of I)E.type==="enemyTargeted"&&ne.set(E.enemyId,E.targetId);if(X()){W="waitInput",_.idle("\uC801\uC774 \uB178\uB9B4 \uB300\uC0C1\uC744 \uACE0\uB974\uB294 \uC911\u2026");return}U.battle.submitOrders(U.autoOrders(ne)),ht(U.battle.resolve()),W="resolving",_.idle("\uC790\uB3D9 \uAD00\uC804 \uC911")},oe=()=>{U&&(Y=new Ws(U.inputAllies(),U.inputEnemies().map(I=>I.id),ne),W="input",N.reframe(),de(!0),w())},he=()=>{!U||!Y||W!=="input"||!Y.ready||(U.battle.submitOrders(Y.submitted),Y=null,de(!1),N.setSelection({ally:null,target:null,pickable:[]}),ht(U.battle.resolve()),W="resolving",_.idle("\uAD50\uC804 \uC911\u2026"))},be=()=>{if(!U||W==="done")return;W="done",Y=null,de(!1),N.setSelection({ally:null,target:null,pickable:[]}),_e();let I=U.battle.winner;t.textContent=I==="ally"?"\uC544\uAD70 \uC2B9":I==="enemy"?"\uC801 \uC2B9":"\uBB34\uC2B9\uBD80",Ee(),te(I),_.idle(`${t.textContent} \u2014 \uC7AC\uC2DC\uC791\uC744 \uB204\uB974\uBA74 \uB2E4\uC2DC \uD55C\uB2E4`),o?.checked&&window.setTimeout(()=>{W!=="done"||!o.checked||(i.value=String((Number(i.value)||1)+1),ie())},3500)},Pe=I=>W!=="input"||!U?null:N.hitTest(I.clientX,I.clientY),ee=I=>{!I||!U||!Y||W!=="input"||(U.inputAllies().some(E=>E.id===I)?Y.selectAlly(I):U.inputEnemies().some(E=>E.id===I)&&Y.selectTarget(I),w())};s.addEventListener("click",I=>ee(Pe(I))),N.onTagPick(ee),s.addEventListener("mousemove",I=>{s.style.cursor=Pe(I)?"pointer":""});let $e=document.getElementById("help"),Fe=()=>{$e?.setAttribute("hidden","");try{localStorage.setItem("ed.helpSeen","1")}catch{}};document.getElementById("help-open")?.addEventListener("click",()=>{document.getElementById("menu")?.setAttribute("hidden",""),$e?.removeAttribute("hidden")}),document.getElementById("help-close")?.addEventListener("click",Fe),window.addEventListener("keydown",I=>{if(I.key==="Escape")return document.getElementById("menu")?.setAttribute("hidden",""),Fe();if(W!=="input"||!Y||!U||I.target instanceof HTMLInputElement||I.target instanceof HTMLSelectElement)return;if(I.key==="Enter"){I.preventDefault(),he();return}let E=Number(I.key),Z=Y.hand;Number.isInteger(E)&&E>=1&&E<=Z.length&&(Y.selectCard(Z[E-1]),w())});let we=!1;try{we=localStorage.getItem("ed.helpSeen")==="1"}catch{we=!1}we||$e?.removeAttribute("hidden"),document.getElementById("restart")?.addEventListener("click",ie),r?.addEventListener("change",()=>{if(U){if(le()||W==="showcase"||r?.value==="envfx"||Ve)return ie();!X()&&(W==="input"||W==="waitInput")&&(Y=null,de(!1),N.setSelection({ally:null,target:null,pickable:[]}),U.battle.submitOrders(U.autoOrders(ne)),ht(U.battle.resolve()),W="resolving",_.idle("\uC790\uB3D9 \uAD00\uC804 \uC911"))}});let ye=document.getElementById("speed");ye?.addEventListener("click",()=>{h=h>=3?1:h+1,N.setSpeed(h);let I=ye.querySelector("span");I&&(I.textContent=`\xD7${h}`),ye.setAttribute("aria-pressed",String(h>1))});let ue=document.getElementById("auto"),Re=()=>ue?.setAttribute("aria-pressed",String(r?.value==="watch"));ue?.addEventListener("click",()=>{r&&(r.value=r.value==="watch"?"play":"watch",r.dispatchEvent(new Event("change")))}),r?.addEventListener("change",Re),Re();let qe=document.getElementById("menu");document.getElementById("menu-open")?.addEventListener("click",()=>{$e?.setAttribute("hidden",""),qe?.removeAttribute("hidden")}),document.getElementById("menu-close")?.addEventListener("click",()=>qe?.setAttribute("hidden","")),document.getElementById("restart")?.addEventListener("click",()=>qe?.setAttribute("hidden",""));let tt=performance.now(),De=I=>{let E=Math.min(.05,(I-tt)/1e3)*h;tt=I,N.tick(E),U&&W==="waitInput"&&N.idle&&oe(),U&&W==="showcase"&&N.idle&&B(),U&&W==="resolving"&&N.idle&&(ae-=E,ae<=0&&(U.battle.isFinished?be():(ht(U.battle.endTurn()),_e(),Ee(),W="turnEnd"),ae=.5)),U&&W==="turnEnd"&&N.idle&&(ae-=E,ae<=0&&(pe(),ae=.5)),requestAnimationFrame(De)};ie(),requestAnimationFrame(De),u.missing.length>0&&(t.textContent+=` \xB7 \uADF8\uB9BC ${u.missing.length}\uAC1C \uC5C6\uC74C`)}Yy();
/*! Bundled license information:

three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2023 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
