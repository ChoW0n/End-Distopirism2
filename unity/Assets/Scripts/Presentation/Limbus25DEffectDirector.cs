using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using DG.Tweening;
using UnityEngine;

namespace EndDistopirism.Presentation
{
    //교전 종류. 일방 공격은 공격자만 달려가고, 맞부딪힘은 둘 다 가운데로 달려가 부딪힌다
    public enum CueKind { OneSided, Clash }

    //이펙트를 맞는 쪽 앞에 둘지 뒤에 둘지
    public enum EffectLayer { Front, Back }

    //전투 계산이 끝난 뒤 연출에 넘기는 한 건. 연출은 규칙을 모르고 이 값만 본다 (SPEC-005 §8.1)
    //맞부딪힘이면 attacker 가 이긴 쪽, defender 가 진 쪽이다
    [Serializable]
    public struct PresentationCue
    {
        public Limbus25DActor attacker;
        public Limbus25DActor defender;
        public CueKind kind;
        public int damage;
        public bool stagger;
        //비어 있으면 감독의 기본 충돌 이펙트를 쓴다
        public GameObject impactEffect;
        public EffectLayer impactLayer;

        //일방 공격 한 건을 만든다
        public static PresentationCue OneSided(Limbus25DActor attacker, Limbus25DActor defender, int damage, bool stagger = false)
        {
            return new PresentationCue { attacker = attacker, defender = defender, kind = CueKind.OneSided, damage = damage, stagger = stagger, impactLayer = EffectLayer.Front };
        }

        //맞부딪힘 한 건을 만든다. winner 가 loser 를 친다
        public static PresentationCue Clash(Limbus25DActor winner, Limbus25DActor loser, int damage, bool stagger = false)
        {
            return new PresentationCue { attacker = winner, defender = loser, kind = CueKind.Clash, damage = damage, stagger = stagger, impactLayer = EffectLayer.Front };
        }
    }

    //림버스식 2.5D 교전 연출 감독. 종이 인형(스프라이트 한 장)을 3D 공간에서 튕기고·꺾고·돌리고,
    //원근 카메라를 당기고·흔들어 타격감을 만든다. 전투 계산은 하지 않는다 (SPEC-005 §8)
    //
    //시간 규칙
    //- 캐릭터 몸짓 트윈은 게임 시간이다. 역경직 동안 같이 멈춘다
    //- 대기열 기다림·카메라는 실제 시간(unscaled)이다. 역경직 동안에도 흐른다
    //쓰는 곳 규칙
    //- 카메라 변환은 LateUpdate 의 WriteCamera 한 곳에서만 쓴다
    //- Time.timeScale 은 ApplyTimeScale 한 곳에서만 쓴다
    [DisallowMultipleComponent]
    public sealed class Limbus25DEffectDirector : MonoBehaviour
    {
        //── 설정 묶음 ──

        //몸짓 수치. 거리는 월드 단위, 각도는 도 (SPEC-005 §8.7)
        [Serializable]
        public sealed class MotionSettings
        {
            [Header("② 선딜레이")]
            public float windupTime = 0.16f;
            public float windupBack = 0.35f;
            public Vector2 windupSquash = new Vector2(1.06f, 0.94f);
            public float windupLeanDeg = 8f;
            [Header("③ 돌진")]
            public float dashTime = 0.13f;
            public float contactGap = 1.1f;
            public Vector2 dashStretch = new Vector2(1.15f, 0.92f);
            [Header("④ 충돌")]
            public float strikeTime = 0.10f;
            public float strikeReach = 0.25f;
            public Vector2 strikeStretch = new Vector2(1.12f, 0.9f);
            public float strikeLeanDeg = 14f;
            [Header("⑤ 넉백")]
            public float knockTime = 0.18f;
            public float knockBase = 0.8f;
            public float knockPerDamage = 0.02f;
            public float knockMax = 2.2f;
            public float knockLeanDeg = 18f;
            public float staggerSnapDeg = 28f;
            public float staggerDrop = -0.12f;
            public float staggerHold = 0.22f;
            [Header("⑥ 복귀")]
            public float lingerAfterHit = 0.22f;
            [Tooltip("타격 뒤 궤적 장들을 넘기는 시간. 레퍼런스처럼 약 1초 동안 사라진다")]
            public float strikeTrailTime = 0.65f;
            public float settleTime = 0.55f;
            public float settleAmplitude = 1.1f;
            public float settlePeriod = 0.35f;
            public float returnTime = 0.3f;
            [Header("맞부딪힘에서 이긴 쪽이 튕기는 거리")]
            public float clashWinnerRecoil = 0.25f;
        }

        //카메라 수치 (SPEC-005 §8.4)
        [Serializable]
        public sealed class CameraSettings
        {
            public float focusDistanceBase = 5.5f;
            public float focusDistancePerUnit = 0.9f;
            public float focusDistanceMin = 6f;
            public float focusDistanceMax = 11f;
            public float focusHeight = 0.1f;
            [Tooltip("공격자 쪽으로 도는 각도")]
            public float panYawDeg = 6f;
            [Tooltip("공격자 쪽으로 기우는 각도")]
            public float dutchDeg = 2.5f;
            public float fovZoom = 4f;
            [Tooltip("목표를 따라가는 시간(초, 실제 시간)")]
            public float followTime = 0.12f;
            public float returnFollowTime = 0.35f;
        }

        //흔들림 수치. 트라우마 방식 (SPEC-005 §8.4)
        [Serializable]
        public sealed class ShakeSettings
        {
            [Tooltip("이 피해면 흔들림이 최대가 된다")]
            public float damageForMaxShake = 30f;
            public float traumaPerHit = 0.35f;
            public float traumaPerDamage = 0.6f;
            public float traumaDecay = 1.4f;
            [Tooltip("트라우마 → 흔들림 세기. 기본은 제곱")]
            public AnimationCurve traumaToShake = AnimationCurve.EaseInOut(0f, 0f, 1f, 1f);
            public Vector3 maxOffset = new Vector3(0.35f, 0.28f, 0.2f);
            public Vector3 maxAngle = new Vector3(1.6f, 1.6f, 2.5f);
            public float frequency = 22f;
            [Header("타격 방향 차기 (감쇠 스프링)")]
            public float kickImpulse = 0.25f;
            public float kickStiffness = 220f;
            public float kickDamping = 18f;
            [Header("화각 펀치")]
            public float fovPunch = 3.5f;
        }

        //역경직 수치 (SPEC-005 §8.5)
        [Serializable]
        public sealed class HitStopSettings
        {
            public bool enabled = true;
            [Range(0f, 1f)] public float scale = 0.02f;
            public float baseSeconds = 0.03f;
            public float perDamageSeconds = 0.002f;
            public float maxSeconds = 0.09f;
        }

        //이펙트 배치 수치 (SPEC-005 §8.6)
        [Serializable]
        public sealed class EffectSettings
        {
            public GameObject defaultImpact;
            public GameObject defaultClashSpark;
            [Tooltip("이펙트 원화가 오른쪽을 보고 그려졌는지")]
            public bool effectArtFacesRight = true;
            public int frontOrderOffset = 1;
            public int backOrderOffset = 1;
            [Tooltip("카메라 쪽(앞)·안쪽(뒤)으로 미는 깊이. 원근 카메라에서 반투명 정렬을 돕는다")]
            public float depthBias = 0.05f;
            [Tooltip("켜면 역경직 동안에도 파티클이 흐른다")]
            public bool particlesIgnoreHitStop = false;
            public float fallbackLifetime = 1.5f;
            [Tooltip("공격자·맞는 쪽 가슴 사이에서 충돌 좌표를 맞는 쪽으로 얼마나 붙일지")]
            [Range(0f, 1f)] public float contactBias = 0.7f;
        }

        [Header("카메라 (원근)")]
        [SerializeField] private Camera targetCamera;
        [Tooltip("움직일 트랜스폼. 비어 있으면 카메라 자신")]
        [SerializeField] private Transform cameraRig;

        [SerializeField] private MotionSettings motion = new MotionSettings();
        [SerializeField] private CameraSettings cameraSettings = new CameraSettings();
        [SerializeField] private ShakeSettings shake = new ShakeSettings();
        [SerializeField] private HitStopSettings hitStop = new HitStopSettings();
        [SerializeField] private EffectSettings effects = new EffectSettings();

        //교전 하나가 끝날 때마다 알린다. 전투 흐름이 다음 턴으로 넘어가는 데 쓴다
        public event Action<PresentationCue> CueFinished;

        //대기열
        private readonly Queue<PresentationCue> queue = new Queue<PresentationCue>();
        private bool running;
        private CancellationTokenSource lifetime;

        //카메라 상태. 목표만 바뀌고 실제 값은 WriteCamera 에서 따라간다
        private Vector3 homePosition;
        private Quaternion homeRotation;
        private float homeFov;
        private bool focused;
        private Vector3 goalPosition;
        private Quaternion goalRotation;
        private float goalFov;
        private Vector3 currentPosition;
        private Quaternion currentRotation;
        private float currentFov;
        private Vector3 positionVelocity;
        private bool cameraReady;

        //흔들림 상태
        private float trauma;
        private Vector3 kickOffset;
        private Vector3 kickVelocity;
        private float fovKick;
        private float fovKickVelocity;
        private readonly float[] noiseSeeds = { 11.3f, 47.9f, 83.1f, 121.7f, 163.3f, 199.9f };

        //역경직 상태
        private bool hitStopActive;
        private float hitStopUntil;
        private float restoreTimeScale = 1f;

        //지금 연출이 돌고 있는지
        public bool IsBusy => running || queue.Count > 0;

        //── 생명 주기 ──

        //카메라 대기 자세를 기억한다
        private void Awake()
        {
            if (targetCamera == null) targetCamera = Camera.main;
            if (cameraRig == null && targetCamera != null) cameraRig = targetCamera.transform;
            CaptureCameraHome();
        }

        private void OnEnable()
        {
            lifetime = new CancellationTokenSource();
        }

        //꺼질 때는 돌던 연출을 끊고 시간 배율·카메라를 되돌린다
        private void OnDisable()
        {
            lifetime?.Cancel();
            lifetime?.Dispose();
            lifetime = null;
            queue.Clear();
            if (hitStopActive)
            {
                hitStopActive = false;
                ApplyTimeScale(restoreTimeScale);
            }
            if (cameraReady && cameraRig != null)
            {
                cameraRig.SetPositionAndRotation(homePosition, homeRotation);
                if (targetCamera != null) targetCamera.fieldOfView = homeFov;
            }
        }

        //역경직이 끝났는지 실제 시간으로 본다
        private void Update()
        {
            if (hitStopActive && Time.unscaledTime >= hitStopUntil)
            {
                hitStopActive = false;
                ApplyTimeScale(restoreTimeScale);
            }
        }

        //카메라는 모든 움직임이 끝난 뒤 한 번만 쓴다
        private void LateUpdate()
        {
            WriteCamera(Time.unscaledDeltaTime);
        }

        //── 대기열 ──

        //교전 한 건을 넣는다. 앞 교전이 끝나야 다음이 돈다
        public void Enqueue(PresentationCue cue)
        {
            queue.Enqueue(cue);
            if (!running) _ = RunQueueAsync();
        }

        //대기열을 순서대로 비운다. 예외는 여기서 받아 기록하고 다음 건으로 넘어간다
        private async Task RunQueueAsync()
        {
            running = true;
            try
            {
                while (queue.Count > 0 && lifetime != null)
                {
                    PresentationCue cue = queue.Dequeue();
                    try
                    {
                        await PlayAsync(cue, lifetime.Token);
                        CueFinished?.Invoke(cue);
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                    catch (Exception error)
                    {
                        Debug.LogException(error, this);
                        RecoverActors(cue);
                    }
                }
            }
            finally
            {
                running = false;
            }
        }

        //── 한 교전의 타임라인 (SPEC-005 §8.2) ──

        //초점 → 선딜레이 → 돌진 → 충돌 → 역경직·흔들림 → 넉백·회전 → 복귀
        public async Task PlayAsync(PresentationCue cue, CancellationToken token)
        {
            Limbus25DActor attacker = cue.attacker;
            Limbus25DActor defender = cue.defender;
            if (attacker == null || defender == null) return;
            bool clash = cue.kind == CueKind.Clash;
            float dir = Mathf.Sign(defender.transform.position.x - attacker.transform.position.x);
            if (dir == 0f) dir = attacker.Facing;
            float power = Mathf.Clamp01(cue.damage / Mathf.Max(1f, shake.damageForMaxShake));

            attacker.transform.DOKill();
            attacker.Visual.DOKill();
            defender.transform.DOKill();
            defender.Visual.DOKill();

            //① 초점. 둘 가운데로 다가가며 공격자 쪽으로 돌고 기운다
            FocusOn(attacker, defender, dir);

            //② 선딜레이. 뒤로 튕기며 웅크린다. 맞부딪힘이면 둘 다
            Sequence windup = Windup(attacker, dir);
            if (clash) windup.Join(Windup(defender, -dir));
            await AwaitTween(windup, token);

            //③ 돌진
            Sequence rush = DOTween.Sequence().SetLink(gameObject);
            if (clash)
            {
                float middle = (attacker.transform.position.x + defender.transform.position.x) * 0.5f;
                rush.Join(Dash(attacker, middle - dir * motion.contactGap * 0.5f, dir));
                rush.Join(Dash(defender, middle + dir * motion.contactGap * 0.5f, -dir));
            }
            else
            {
                rush.Join(Dash(attacker, defender.transform.position.x - dir * motion.contactGap, dir));
            }
            await AwaitTween(rush, token);
            FollowPair(attacker, defender, dir);

            //④ 충돌. 앞으로 찍어 누르는 순간이 맞닿는 프레임이다
            Sequence strike = Strike(attacker, dir);
            if (clash) strike.Join(Strike(defender, -dir));
            await AwaitTween(strike, token);

            Vector3 contact = Vector3.Lerp(attacker.Chest, defender.Chest, effects.contactBias);
            if (clash && effects.defaultClashSpark != null)
            {
                SpawnEffect(effects.defaultClashSpark, (attacker.Chest + defender.Chest) * 0.5f, defender, EffectLayer.Front, dir);
            }
            SpawnEffect(cue.impactEffect != null ? cue.impactEffect : effects.defaultImpact, contact, defender, cue.impactLayer, dir);
            attacker.PlayStrikeTrail(motion.strikeTrailTime);
            StartHitStop(Mathf.Min(hitStop.maxSeconds, hitStop.baseSeconds + cue.damage * hitStop.perDamageSeconds));
            AddImpact(power, dir);

            //⑤ 넉백·회전. 맞은 쪽은 공격 반대로 밀리며 젖혀진다. 흐트러짐이면 순간 꺾인다
            Sequence knock = Knockback(defender, dir, cue.damage, cue.stagger);
            Sequence settleAttacker = SettleVisual(attacker, motion.knockTime);
            if (clash) settleAttacker.Join(attacker.transform.DOMoveX(attacker.transform.position.x - dir * motion.clashWinnerRecoil, motion.knockTime).SetEase(Ease.OutQuad));
            await AwaitTween(knock, token);
            await WaitRealtime(motion.lingerAfterHit, token);
            //궤적이 다 사라질 때까지 공격자는 그 자리에서 버틴다 (게임 시간)
            await WaitScaled(Mathf.Max(0f, motion.strikeTrailTime - motion.knockTime - motion.lingerAfterHit), token);

            //⑥ 복귀. 맞은 쪽은 스프링처럼 튕기며, 공격자는 원위치로, 카메라는 원경으로
            ReleaseFocus();
            Sequence back = DOTween.Sequence().SetLink(gameObject);
            back.Join(SpringBack(defender));
            back.Join(ReturnHome(attacker));
            if (clash) back.Join(ReturnHome(defender));
            await AwaitTween(back, token);
            attacker.SetPose(Limbus25DActor.Pose.Idle);
            defender.SetPose(Limbus25DActor.Pose.Idle);
        }

        //── 몸짓 (SPEC-005 §8.3) ──
        //이동·회전은 월드 방향으로 계산해 로컬로 바꿔 넣는다. 루트 배율 부호는 건드리지 않는다

        //② 뒤로 튕기며 웅크린다. 뒤로 당김 + 눌림 + 뒤로 젖힘
        private Sequence Windup(Limbus25DActor actor, float dir)
        {
            actor.SetPose(Limbus25DActor.Pose.Windup);
            Transform v = actor.Visual;
            float t = motion.windupTime;
            return DOTween.Sequence().SetLink(actor.gameObject)
                .Join(v.DOLocalMove(new Vector3(actor.WorldToLocalX(-dir * motion.windupBack), 0f, 0f), t).SetEase(Ease.OutQuad))
                .Join(v.DOScale(new Vector3(motion.windupSquash.x, motion.windupSquash.y, 1f), t).SetEase(Ease.OutQuad))
                .Join(v.DOLocalRotate(new Vector3(0f, 0f, actor.WorldToLocalRoll(dir * motion.windupLeanDeg)), t).SetEase(Ease.OutQuad));
        }

        //③ 상대 앞까지 가속해 들어간다. 달리는 동안 몸이 앞으로 늘어난다
        private Sequence Dash(Limbus25DActor actor, float toX, float dir)
        {
            actor.SetPose(Limbus25DActor.Pose.Dash);
            Transform v = actor.Visual;
            float t = motion.dashTime;
            return DOTween.Sequence().SetLink(actor.gameObject)
                .Join(actor.transform.DOMoveX(toX, t).SetEase(Ease.InQuad))
                .Join(v.DOLocalMove(Vector3.zero, t).SetEase(Ease.OutQuad))
                .Join(v.DOScale(new Vector3(motion.dashStretch.x, motion.dashStretch.y, 1f), t).SetEase(Ease.OutQuad))
                .Join(v.DOLocalRotate(new Vector3(0f, 0f, actor.WorldToLocalRoll(-dir * motion.strikeLeanDeg * 0.5f)), t).SetEase(Ease.OutQuad));
        }

        //④ 앞으로 찍어 누른다. 늘림 + 숙임을 탄성 있게 (OutBack)
        private Sequence Strike(Limbus25DActor actor, float dir)
        {
            actor.SetPose(Limbus25DActor.Pose.Strike);
            Transform v = actor.Visual;
            float t = motion.strikeTime;
            return DOTween.Sequence().SetLink(actor.gameObject)
                .Join(v.DOLocalMove(new Vector3(actor.WorldToLocalX(dir * motion.strikeReach), 0f, 0f), t).SetEase(Ease.OutBack))
                .Join(v.DOScale(new Vector3(motion.strikeStretch.x, motion.strikeStretch.y, 1f), t).SetEase(Ease.OutBack))
                .Join(v.DOLocalRotate(new Vector3(0f, 0f, actor.WorldToLocalRoll(-dir * motion.strikeLeanDeg)), t).SetEase(Ease.OutBack));
        }

        //⑤ 공격 반대로 밀리며 뒤로 젖혀진다. 흐트러짐이면 보간 없이 순간 꺾이고(2D 컷오프) 잠깐 버틴다
        private Sequence Knockback(Limbus25DActor actor, float dir, int damage, bool stagger)
        {
            actor.SetPose(Limbus25DActor.Pose.Hurt);
            Transform v = actor.Visual;
            float t = motion.knockTime;
            float distance = Mathf.Min(motion.knockMax, motion.knockBase + damage * motion.knockPerDamage);
            float roll = actor.WorldToLocalRoll(-dir * (stagger ? motion.staggerSnapDeg : motion.knockLeanDeg));
            Sequence seq = DOTween.Sequence().SetLink(actor.gameObject);
            if (stagger)
            {
                //꺾임은 트윈하지 않는다. 한 프레임에 꺾여야 종이가 부러지듯 보인다
                v.localRotation = Quaternion.Euler(0f, 0f, roll);
            }
            else
            {
                seq.Join(v.DOLocalRotate(new Vector3(0f, 0f, roll), t).SetEase(Ease.OutExpo));
            }
            seq.Join(v.DOLocalMove(new Vector3(actor.WorldToLocalX(dir * distance), stagger ? motion.staggerDrop : 0f, 0f), t).SetEase(Ease.OutExpo));
            seq.Join(v.DOScale(new Vector3(0.92f, 1.08f, 1f), t * 0.5f).SetEase(Ease.OutQuad));
            if (stagger) seq.AppendInterval(motion.staggerHold);
            return seq;
        }

        //⑥ 맞은 쪽이 스프링처럼 통통 튕기며 제자리로 돌아온다
        private Sequence SpringBack(Limbus25DActor actor)
        {
            actor.SetPose(Limbus25DActor.Pose.Recover);
            Transform v = actor.Visual;
            float t = motion.settleTime;
            return DOTween.Sequence().SetLink(actor.gameObject)
                .Join(v.DOLocalMove(Vector3.zero, t).SetEase(Ease.OutElastic, motion.settleAmplitude, motion.settlePeriod))
                .Join(v.DOLocalRotate(Vector3.zero, t).SetEase(Ease.OutElastic, motion.settleAmplitude, motion.settlePeriod))
                .Join(v.DOScale(Vector3.one, t).SetEase(Ease.OutElastic, motion.settleAmplitude, motion.settlePeriod));
        }

        //몸짓만 대기 모양으로 되돌린다. 자리는 그대로다
        private Sequence SettleVisual(Limbus25DActor actor, float time)
        {
            Transform v = actor.Visual;
            return DOTween.Sequence().SetLink(actor.gameObject)
                .Join(v.DOLocalMove(Vector3.zero, time).SetEase(Ease.OutQuad))
                .Join(v.DOLocalRotate(Vector3.zero, time).SetEase(Ease.OutQuad))
                .Join(v.DOScale(Vector3.one, time).SetEase(Ease.OutQuad));
        }

        //원위치로 돌아간다
        private Sequence ReturnHome(Limbus25DActor actor)
        {
            actor.SetPose(Limbus25DActor.Pose.Recover);
            return DOTween.Sequence().SetLink(actor.gameObject)
                .Join(actor.transform.DOMove(actor.Home, motion.returnTime).SetEase(Ease.OutCubic))
                .Join(SettleVisual(actor, motion.returnTime));
        }

        //연출이 끊겼을 때 두 사람을 즉시 제자리로 돌린다
        private void RecoverActors(PresentationCue cue)
        {
            foreach (Limbus25DActor actor in new[] { cue.attacker, cue.defender })
            {
                if (actor == null) continue;
                actor.transform.DOKill();
                actor.Visual.DOKill();
                actor.transform.position = actor.Home;
                actor.ResetVisual();
            }
            ReleaseFocus();
        }

        //── 카메라 (SPEC-005 §8.4) ──

        //카메라 대기 자세를 기억한다. 카메라를 옮긴 뒤 다시 불러도 된다
        public void CaptureCameraHome()
        {
            if (cameraRig == null) return;
            homePosition = cameraRig.position;
            homeRotation = cameraRig.rotation;
            homeFov = targetCamera != null ? targetCamera.fieldOfView : 60f;
            currentPosition = homePosition;
            currentRotation = homeRotation;
            currentFov = homeFov;
            positionVelocity = Vector3.zero;
            cameraReady = true;
        }

        //두 사람 가운데로 다가가며 공격자 쪽으로 돌고 기운다
        private void FocusOn(Limbus25DActor a, Limbus25DActor b, float dir)
        {
            if (!cameraReady) return;
            Vector3 middle = (a.Chest + b.Chest) * 0.5f + Vector3.up * cameraSettings.focusHeight;
            float separation = Mathf.Abs(b.transform.position.x - a.transform.position.x);
            float distance = Mathf.Clamp(
                cameraSettings.focusDistanceBase + separation * cameraSettings.focusDistancePerUnit,
                cameraSettings.focusDistanceMin,
                cameraSettings.focusDistanceMax);
            Vector3 view = Quaternion.AngleAxis(-dir * cameraSettings.panYawDeg, Vector3.up) * (homeRotation * Vector3.forward);
            goalPosition = middle - view.normalized * distance;
            goalRotation = Quaternion.LookRotation(middle - goalPosition, Vector3.up) * Quaternion.Euler(0f, 0f, dir * cameraSettings.dutchDeg);
            goalFov = homeFov - cameraSettings.fovZoom;
            focused = true;
        }

        //달려간 뒤 가까워진 둘에 맞춰 초점을 다시 잡는다
        private void FollowPair(Limbus25DActor a, Limbus25DActor b, float dir)
        {
            FocusOn(a, b, dir);
        }

        //원경으로 돌아간다
        private void ReleaseFocus()
        {
            focused = false;
        }

        //맞은 순간. 트라우마를 더하고, 맞은 방향으로 차고, 화각을 순간 좁힌다. 연타는 값이 쌓일 뿐 끊기지 않는다
        public void AddImpact(float power01, float dir)
        {
            trauma = Mathf.Clamp01(trauma + shake.traumaPerHit + shake.traumaPerDamage * power01);
            //스프링 고유 진동수를 곱해 두면 최대 변위가 대략 kickImpulse·fovPunch 가 된다
            float omega = Mathf.Sqrt(Mathf.Max(1f, shake.kickStiffness));
            kickVelocity += new Vector3(dir, -0.35f, 0.5f).normalized * (shake.kickImpulse * (0.5f + power01) * omega);
            fovKickVelocity -= shake.fovPunch * (0.5f + power01) * omega;
        }

        //카메라를 쓰는 유일한 곳. 실제 시간으로 따라가고 흔든다
        private void WriteCamera(float dt)
        {
            if (!cameraReady || cameraRig == null || dt <= 0f) return;

            Vector3 wantPosition = focused ? goalPosition : homePosition;
            Quaternion wantRotation = focused ? goalRotation : homeRotation;
            float wantFov = focused ? goalFov : homeFov;
            float follow = focused ? cameraSettings.followTime : cameraSettings.returnFollowTime;
            currentPosition = Vector3.SmoothDamp(currentPosition, wantPosition, ref positionVelocity, follow, Mathf.Infinity, dt);
            float k = 1f - Mathf.Exp(-dt / Mathf.Max(0.0001f, follow));
            currentRotation = Quaternion.Slerp(currentRotation, wantRotation, k);
            currentFov = Mathf.Lerp(currentFov, wantFov, k);

            //트라우마 흔들림. 위치 3축과 회전 3축을 서로 다른 잡음으로 흔든다
            trauma = Mathf.Max(0f, trauma - shake.traumaDecay * dt);
            float amount = Mathf.Clamp01(shake.traumaToShake.Evaluate(trauma * trauma));
            float t = Time.unscaledTime * shake.frequency;
            Vector3 shakeOffset = Vector3.Scale(new Vector3(Noise(0, t), Noise(1, t), Noise(2, t)), shake.maxOffset) * amount;
            Vector3 shakeAngles = Vector3.Scale(new Vector3(Noise(3, t), Noise(4, t), Noise(5, t)), shake.maxAngle) * amount;

            //타격 방향 차기와 화각 펀치. 감쇠 스프링이라 겹쳐도 부드럽게 합쳐진다
            Spring(ref kickOffset, ref kickVelocity, shake.kickStiffness, shake.kickDamping, dt);
            SpringScalar(ref fovKick, ref fovKickVelocity, shake.kickStiffness, shake.kickDamping, dt);

            cameraRig.SetPositionAndRotation(
                currentPosition + currentRotation * shakeOffset + kickOffset,
                currentRotation * Quaternion.Euler(shakeAngles));
            if (targetCamera != null && !targetCamera.orthographic)
            {
                targetCamera.fieldOfView = Mathf.Clamp(currentFov + fovKick, 1f, 179f);
            }
        }

        //-1 ~ 1 사이의 부드러운 잡음
        private float Noise(int channel, float t)
        {
            return Mathf.PerlinNoise(noiseSeeds[channel], t) * 2f - 1f;
        }

        //감쇠 스프링 한 걸음. 큰 dt 는 잘게 나눠 튀지 않게 한다
        private static void Spring(ref Vector3 x, ref Vector3 v, float stiffness, float damping, float dt)
        {
            int steps = Mathf.Max(1, Mathf.CeilToInt(dt / 0.008f));
            float h = dt / steps;
            for (int i = 0; i < steps; i++)
            {
                v += (-stiffness * x - damping * v) * h;
                x += v * h;
            }
        }

        private static void SpringScalar(ref float x, ref float v, float stiffness, float damping, float dt)
        {
            int steps = Mathf.Max(1, Mathf.CeilToInt(dt / 0.008f));
            float h = dt / steps;
            for (int i = 0; i < steps; i++)
            {
                v += (-stiffness * x - damping * v) * h;
                x += v * h;
            }
        }

        //── 역경직 (SPEC-005 §8.5) ──

        //충돌 프레임에 세상을 거의 멈춘다. 겹치면 끝나는 시각만 늦춘다
        public void StartHitStop(float seconds)
        {
            if (!hitStop.enabled || seconds <= 0f) return;
            if (!hitStopActive) restoreTimeScale = Time.timeScale;
            hitStopUntil = Mathf.Max(hitStopUntil, Time.unscaledTime + seconds);
            hitStopActive = true;
            ApplyTimeScale(hitStop.scale);
        }

        //시간 배율을 쓰는 유일한 곳
        private static void ApplyTimeScale(float scale)
        {
            Time.timeScale = scale;
        }

        //── 이펙트 (SPEC-005 §8.6) ──

        //충돌 좌표에 이펙트를 낸다. 맞는 쪽 기준으로 앞/뒤 정렬 순서와 깊이를 잡는다
        public GameObject SpawnEffect(GameObject prefab, Vector3 worldPosition, Limbus25DActor reference, EffectLayer layer, float dir = 1f, float lifetimeSeconds = -1f)
        {
            if (prefab == null || reference == null) return null;

            //원근 카메라에서는 정렬 순서만으로 모자라 깊이도 조금 민다
            Vector3 toCamera = cameraRig != null ? (cameraRig.position - worldPosition).normalized : Vector3.back;
            float bias = layer == EffectLayer.Front ? effects.depthBias : -effects.depthBias;
            GameObject instance = Instantiate(prefab, worldPosition + toCamera * bias, Quaternion.identity);

            //이펙트도 진행 방향에 맞춰 좌우를 정한다. 음수 배율은 루트에만 둔다
            Vector3 scale = instance.transform.localScale;
            float sign = dir * (effects.effectArtFacesRight ? 1f : -1f);
            instance.transform.localScale = new Vector3(Mathf.Abs(scale.x) * Mathf.Sign(sign), scale.y, scale.z);

            int order = reference.SortingOrder + (layer == EffectLayer.Front ? effects.frontOrderOffset : -effects.backOrderOffset);
            foreach (Renderer r in instance.GetComponentsInChildren<Renderer>(true))
            {
                r.sortingLayerID = reference.SortingLayerId;
                r.sortingOrder = order;
            }

            //파티클은 이 프레임에 바로 튼다. 기본은 역경직에 같이 멈춘다
            float longest = 0f;
            foreach (ParticleSystem ps in instance.GetComponentsInChildren<ParticleSystem>(true))
            {
                ParticleSystem.MainModule main = ps.main;
                main.useUnscaledTime = effects.particlesIgnoreHitStop;
                ps.Clear(false);
                ps.Play(false);
                longest = Mathf.Max(longest, main.duration + main.startLifetime.constantMax);
            }

            float life = lifetimeSeconds > 0f ? lifetimeSeconds : (longest > 0f ? longest : effects.fallbackLifetime);
            Destroy(instance, life);
            return instance;
        }

        //── 기다리기 ──

        //트윈이 끝날 때까지 프레임마다 기다린다. 트윈은 게임 시간이라 역경직 동안 늘어난다
        private static async Task AwaitTween(Tween tween, CancellationToken token)
        {
            while (tween != null && tween.IsActive() && !tween.IsComplete())
            {
                if (token.IsCancellationRequested)
                {
                    tween.Kill();
                    token.ThrowIfCancellationRequested();
                }
                await Task.Yield();
            }
        }

        //게임 시간으로 기다린다. 역경직 동안 늘어난다
        private static async Task WaitScaled(float seconds, CancellationToken token)
        {
            float left = seconds;
            while (left > 0f)
            {
                token.ThrowIfCancellationRequested();
                await Task.Yield();
                left -= Time.deltaTime;
            }
        }

        //실제 시간으로 기다린다. 역경직과 무관하게 흐른다
        private static async Task WaitRealtime(float seconds, CancellationToken token)
        {
            float end = Time.unscaledTime + seconds;
            while (Time.unscaledTime < end)
            {
                token.ThrowIfCancellationRequested();
                await Task.Yield();
            }
        }
    }
}
