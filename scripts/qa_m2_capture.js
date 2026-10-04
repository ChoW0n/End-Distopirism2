//검수 페이지에서만 실행한다. 제품 번들에는 들어가지 않는다
() => {
  const api = window.__m2;
  const stage = api.stage;
  const frames = [], events = [], seen = new Set();
  Object.assign(api, { rows: frames, events, cycles: 0, shots: [], paused: false });

  //실제로 그린 판의 네 모서리를 화면 비율 좌표로 바꾼다
  const bounds = (mesh) => {
    mesh.updateWorldMatrix(true, false);
    const positions = mesh.geometry.attributes.position;
    const points = Array.from({ length: positions.count }, (_, i) => {
      const p = stage.camera.position.clone().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(stage.camera);
      return [(p.x + 1) / 2, (1 - p.y) / 2];
    });
    return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
  };
  const tick = stage.tick.bind(stage);
  stage.tick = (dt) => {
    if (api.paused) return;
    tick(dt);
    if (!api.record) return;
    const row = {
      t: stage.clock.realNow, wall: performance.now(), dt, state: api.state(),
      top: document.querySelector('.topbar').getBoundingClientRect().bottom / innerHeight,
      bodies: [], cards: [], sea: stage.envSurface !== null,
      ambient: stage.ambient.root.visible, cut: stage.cutscene.active,
      dim: stage.dimKnob.v, cutFlash: stage.cutscene.flash,
      trauma: stage.rig.trauma, envMuted: stage.rig.envMuted,
    };
    for (const [id, actor] of stage.actors) {
      const d = actor.doll;
      if (!d.hidden && d.shown && d.opacity > 0.1) row.bodies.push({ id, frame: d.shownId, impact: !!d.catalog.frame(d.shownId).impact, down: d.down, box: bounds(d.shown.mesh) });
    }
    for (const [card, owner] of stage.cards) {
      if (card.state.opacity > 0.1 && card.state.scale > 0.1) row.cards.push({ id: owner.combatantId, box: bounds(card.front), ...card.state });
    }
    frames.push(row);
    api.last = row;

    //동일 프레임을 캡처하려고 잠시 멈춘다. 캡처가 끝나면 Python 쪽에서 즉시 해제한다
    let shot = null;
    if (row.cards.some(c => c.opacity > 0.9 && c.spin >= Math.PI * 4 - 0.01)) shot = 'cards';
    for (const b of row.bodies) if (b.impact) {
      for (const slot of ['skill1', 'skill2', 'skill3']) if (b.frame.includes(slot)) shot = slot;
    }
    if (row.cut && stage.clock.realNow - stage.cutscene.showing.start > 0.3) shot = 'cutscene';
    else if (!row.cut && row.sea && row.bodies.some(b => b.frame.includes('ult-post'))) shot = 'nightsea';
    if (!row.cut && row.bodies.some(b => Math.min(...b.box) < -1e-5 || Math.max(...b.box) > 1.00001)) shot = 'body-outside';
    if (!row.cut && row.cards.some(c => c.box[1] < row.top - 1e-5)) shot = 'card-covered';
    if (shot && !seen.has(shot)) {
      seen.add(shot);
      api.shots.push({ name: shot, row: frames.length - 1 });
      api.paused = true;
    }
  };
  //호출을 세되 원래 메서드와 반환 약속은 그대로 전달한다
  for (const [owner, methods] of [[stage.overlay, ['flash', 'powerClash']], [stage, ['dimBackdrop', 'impactFrame']]]) {
    for (const method of methods) {
      const call = owner[method].bind(owner);
      owner[method] = (...args) => {
        if (api.record) events.push({ method, t: stage.clock.realNow });
        return call(...args);
      };
    }
  }
  const play = stage.play.bind(stage);
  stage.play = (...args) => { if (api.record) api.cycles++; return play(...args); };
  const ultimate = stage.playUltimate.bind(stage);
  stage.playUltimate = async (...args) => {
    if (api.record) events.push({ method: 'ultimateStart', t: stage.clock.realNow });
    await ultimate(...args);
    if (api.record) events.push({ method: 'ultimateEnd', t: stage.clock.realNow });
  };
}
