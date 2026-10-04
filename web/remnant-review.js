//정렬된 원화를 같은 발 기준점에 그린다. 전투 규칙이나 기본 아트 설정을 바꾸지 않는다
class RemnantReview {
  //단독 파일은 내장 그림을, 저장소 화면은 같은 매니페스트와 PNG를 읽는다
  constructor(manifest, layout, images) {
    this.manifest = manifest;
    this.layout = layout;
    this.images = images;
    this.canvas = document.getElementById('sprite-view');
    this.current = 0;
    this.skill = 1;
    this.flipped = true;
    this.run = 0;
    this.idleHeight = manifest.ground[1] - manifest.frames[0].bbox[1];
    this.bind();
    this.makeFrames();
    this.select(0);
  }

  //UI 조작과 창 크기 변경에만 다시 그린다. 가만히 있을 때 애니메이션 루프는 돌리지 않는다
  bind() {
    for (const id of ['background', 'size', 'baseline']) document.getElementById(id).addEventListener('change', () => this.draw());
    document.getElementById('flip').addEventListener('click', () => {
      this.flipped = !this.flipped;
      const button = document.getElementById('flip');
      button.textContent = this.flipped ? '왼쪽 보기' : '오른쪽 보기';
      button.setAttribute('aria-pressed', String(this.flipped));
      this.draw();
    });
    for (const button of document.querySelectorAll('[data-skill]')) button.addEventListener('click', () => {
      this.stop();
      this.skill = Number(button.dataset.skill);
      for (const other of document.querySelectorAll('[data-skill]')) other.setAttribute('aria-pressed', String(other === button));
      this.select(this.manifest.frames.findIndex(frame => frame.id.includes(`skill${this.skill}`)));
    });
    document.getElementById('play').addEventListener('click', () => this.playing ? this.stop() : this.play());
    window.addEventListener('resize', () => this.draw());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
    document.getElementById('play').disabled = false;
  }

  //잘라낸 그림의 크기가 아니라 공통 몸 크기로 썸네일을 비교한다
  makeFrames() {
    const list = document.getElementById('frames');
    this.buttons = this.manifest.frames.map((frame, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'frame';
      button.setAttribute('aria-label', this.layout.frames[index].label);
      button.setAttribute('aria-pressed', 'false');
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 230;
      this.paint(canvas.getContext('2d'), index, 160, 205, 150, false);
      const label = document.createElement('span'); label.textContent = this.layout.frames[index].label;
      button.append(canvas, label);
      button.addEventListener('click', () => { this.stop(); this.select(index); });
      list.append(button);
      return button;
    });
  }

  //매니페스트의 발점과 알파 영역으로 실제 엔진과 같은 등비 배치를 한다
  paint(ctx, index, x, y, height, flipped) {
    const frame = this.manifest.frames[index];
    const [left, top, right, bottom] = frame.bbox;
    const scale = height / this.idleHeight;
    ctx.save();
    ctx.translate(x, y); ctx.scale(flipped ? -scale : scale, scale);
    ctx.drawImage(this.images[index], left, top, right-left, bottom-top, left-frame.anchor[0], top-frame.anchor[1], right-left, bottom-top);
    ctx.restore();
  }

  //현재 포즈를 고른다. 사용자가 고른 상태는 화면 밖으로 저장하지 않는다
  select(index) {
    this.current = index;
    for (const [i, button] of this.buttons.entries()) button.setAttribute('aria-pressed', String(i === index));
    document.getElementById('pose-name').textContent = this.layout.frames[index].label;
    document.getElementById('frame-count').textContent = `${index + 1} / ${this.manifest.frames.length}`;
    this.draw();
  }

  //모든 장에 같은 배율을 적용한다. 준비 장이 높아져도 몸 자체를 줄이지 않는다
  draw() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * ratio); this.canvas.height = Math.round(rect.height * ratio);
    const ctx = this.canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const light = document.getElementById('background').value === 'light';
    ctx.fillStyle = light ? '#e7e3dc' : '#111d2b'; ctx.fillRect(0,0,rect.width,rect.height);
    const x = rect.width / 2, y = rect.height - 32;
    const anchor = this.manifest.ground;
    const half = Math.max(...this.manifest.frames.flatMap(frame => [anchor[0]-frame.bbox[0],frame.bbox[2]-anchor[0]]));
    const rise = Math.max(...this.manifest.frames.map(frame => anchor[1]-frame.bbox[1]));
    const target = Number(document.getElementById('size').value);
    const height = Math.min(target, (rect.width/2-18)*this.idleHeight/half, (rect.height-55)*this.idleHeight/rise);
    if (document.getElementById('baseline').checked) {
      ctx.strokeStyle = light ? '#8e8576' : '#6a614f'; ctx.lineWidth = 1; ctx.setLineDash([4,6]);
      ctx.beginPath();ctx.moveTo(22,y);ctx.lineTo(rect.width-22,y);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle = light ? '#746448' : '#d9b77c';ctx.fillRect(x-3,y-3,6,6);
    }
    this.paint(ctx,this.current,x,y,height,this.flipped);
  }

  //도메인 재생과 분리된 1회 포즈 확인. 멈추기·다른 장 선택이 이전 예약을 무효화한다
  async play() {
    const token = ++this.run; this.playing = true;
    document.getElementById('play').textContent = '멈추기';
    const ready = this.manifest.frames.findIndex(frame => frame.id.includes(`skill${this.skill}`));
    const sequence = [[0,350],[1,130],[ready,this.manifest.frames[ready].ms],[ready+1,this.manifest.frames[ready+1].ms],[2,180],[0,400]];
    for (const [index,ms] of sequence) {
      if (token !== this.run) return;
      this.select(index);
      await new Promise(resolve => setTimeout(resolve,ms));
    }
    if (token === this.run) this.stop();
  }

  stop() { this.run++; this.playing = false; document.getElementById('play').textContent = '한 번 재생'; }
}

//네트워크 오류와 단독 파일 실행을 같은 화면에서 안내한다
(async () => {
  const read = async file => { const response = await fetch(file); if (!response.ok) throw new Error(file); return response.json(); };
  const embedded = window.REMNANT_REVIEW_DATA;
  const [manifest,layout] = embedded ? [embedded.manifest,embedded.layout] : await Promise.all([
    read('../assets/remnantWalker/sprite-manifest.json'),read('../assets/remnantWalker/source-layout.json')
  ]);
  const images = await Promise.all(manifest.frames.map((frame,index) => new Promise((resolve,reject) => {
    const image = new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(frame.file));
    image.src=embedded ? embedded.images[index] : `../assets/remnantWalker/${frame.file}`;
  })));
  new RemnantReview(manifest,layout,images);
  document.getElementById('load-state').hidden = true;
  const download = document.getElementById('manifest-download');
  download.href = URL.createObjectURL(new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}));
  if (embedded) { document.getElementById('battle-preview').hidden=true; document.getElementById('offline-note').hidden=false; }
})().catch(error => {
  document.getElementById('load-state').textContent = `그림을 불러오지 못했어. 에셋 묶음을 같은 폴더에 넣고 서버로 다시 열어 줘. (${error.message})`;
});
