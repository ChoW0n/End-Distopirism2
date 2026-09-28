using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using DG.Tweening;
using TMPro;
using UnityEngine;

namespace EndDistopirism.Presentation
{
    //교전 종류. 일방 공격은 공격자만 달려가고, 맞부딪힘은 둘 다 가운데로 달려가 부딪힌다
    public enum CueKind { OneSided, Clash }

    //이펙트를 맞는 쪽 앞에 둘지 뒤에 둘지
    public enum EffectLayer { Front, Back }

    //달려갈 때 머리 위에 띄울 결과 한 줄 (SPEC-005 §8.10). 문장은 어댑터가 전투 규칙에서 만들어 넘긴다
    [Serializable]
    public struct CueCallout
    {
        public Limbus25DActor actor;
        public bool success;
        //작은 줄. 성공이면 위력 비교, 패배면 원인 한 줄. 비어 있어도 된다
        public string reason;
        //큰 줄. 비어 있으면 감독의 기본 문구(공격 성공·패배)를 쓴다. 합 라운드는 합 승리·합 패배·교착
        public string headline;

        public CueCallout(Limbus25DActor actor, bool success, string reason, string headline = null)
        {
            this.actor = actor;
            this.success = success;
            this.reason = reason;
            this.headline = headline;
        }
    }

    //맞부딪힘 한 라운드의 결과. 이기면 진 쪽이 밀리고, 교착이면 둘 다 조금 밀린다 (SPEC-005 §9.3)
    public enum RoundKind { Win, Deadlock }

    //맞부딪힘 한 라운드. 교착이면 winner·loser 를 비워 둔다
    [Serializable]
    public struct CueRound
    {
        public RoundKind kind;
        public Limbus25DActor winner;
        public Limbus25DActor loser;
        //이 라운드에 달려갈 때 띄울 결과 알림. 아군 쪽 것만 뜬다
        public CueCallout[] callouts;

        //이긴 라운드를 만든다
        public static CueRound Win(Limbus25DActor winner, Limbus25DActor loser, params CueCallout[] callouts)
        {
            return new CueRound { kind = RoundKind.Win, winner = winner, loser = loser, callouts = callouts };
        }

        //교착 라운드를 만든다
        public static CueRound Deadlock(params CueCallout[] callouts)
        {
            return new CueRound { kind = RoundKind.Deadlock, callouts = callouts };
        }
    }

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
        //결과 알림. 아군 쪽 것만 뜬다
        public CueCallout[] callouts;
        //맞부딪힘 라운드 목록. 있으면 attacker·defender 는 합을 건 쪽·받은 쪽이고, 붙은 채로 라운드를 이어 간다
        public CueRound[] rounds;
        //마지막에 진 쪽을 치는 쪽. 비어 있으면 마무리가 없다 (교착 한도로 끝남)
        public Limbus25DActor finisher;
        //양쪽이 낸 카드 슬롯. 슬롯마다 준비·맞닿음·궤적 장이 다르다 (SPEC-005 §9.4)
        public SkillSlot attackerSlot;
        public SkillSlot defenderSlot;
        //이 교전의 한 방으로 맞은 쪽이 쓰러지는지 (도메인 defeated). 넉백 대신 쓰러진다
        public bool targetDefeated;

        //낸 카드 슬롯을 붙인 사본을 돌려준다
        public PresentationCue WithSlots(SkillSlot attacker, SkillSlot defender = SkillSlot.None)
        {
            PresentationCue copy = this;
            copy.attackerSlot = attacker;
            copy.defenderSlot = defender;
            return copy;
        }

        //맞은 쪽이 쓰러지는 사본을 돌려준다
        public PresentationCue WithDefeat(bool defeated = true)
        {
            PresentationCue copy = this;
            copy.targetDefeated = defeated;
            return copy;
        }

        //결과 알림을 붙인 사본을 돌려준다
        public PresentationCue WithCallouts(params CueCallout[] list)
        {
            PresentationCue copy = this;
            copy.callouts = list;
            return copy;
        }

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

        //라운드가 여러 번인 맞부딪힘을 만든다. finisher 가 비어 있지 않으면 마지막에 상대를 damage 만큼 친다
        public static PresentationCue ClashRounds(Limbus25DActor attacker, Limbus25DActor defender, CueRound[] rounds, Limbus25DActor finisher, int damage, bool stagger = false)
        {
            return new PresentationCue
            {
                attacker = attacker, defender = defender, kind = CueKind.Clash, rounds = rounds, finisher = finisher,
                damage = damage, stagger = stagger, impactLayer = EffectLayer.Front,
            };
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
            [Header("③ 돌진")]
            public float dashTime = 0.13f;
            public float contactGap = 1.1f;
            [Header("④ 충돌")]
            public float strikeTime = 0.10f;
            public float strikeReach = 0.25f;
            [Header("⑤ 넉백")]
            public float knockTime = 0.18f;
            public float knockBase = 0.8f;
            public float knockPerDamage = 0.02f;
            public float knockMax = 2.2f;
            public float staggerDrop = -0.12f;
            public float staggerHold = 0.22f;
            [Header("⑥ 복귀")]
            public float lingerAfterHit = 0.22f;
            [Tooltip("타격 뒤 궤적 장들을 넘기는 시간. 레퍼런스처럼 약 1초 동안 사라진다")]
            public float strikeTrailTime = 0.1f;
            [Tooltip("궤적 시간 중 첫 장(최대 궤적)을 보여 주는 몫. 나머지 장은 남은 시간에 빠르게 넘긴다")]
            [Range(0f, 1f)] public float strikeTrailPeakShare = 0.5f;
            public float settleTime = 0.55f;
            public float settleAmplitude = 1.1f;
            public float settlePeriod = 0.35f;
            public float returnTime = 0.3f;
            [Header("맞부딪힘에서 이긴 쪽이 튕기는 거리")]
            public float clashWinnerRecoil = 0.25f;
            [Tooltip("교전에 끼지 않은 인형이 흐려져 사라지는 시간 (SPEC-005 §9.3)")]
            public float bystanderFade = 0.15f;
            [Tooltip("근경이 교전 시작에 사라지고 교전 사이에 다시 보이는 시간 (SPEC-005 §9.5.1)")]
            public float foregroundFade = 0.25f;
            [Tooltip("맞부딪힘 라운드에서 진 쪽이 밀리는 거리")]
            public float clashPush = 0.55f;
            [Tooltip("교착 라운드에서 둘 다 밀리는 거리")]
            public float deadlockPush = 0.35f;
            [Tooltip("붙은 자리에서 다시 부딪히는 짧은 재돌진 시간. 마무리 돌진도 이 시간")]
            public float reengageTime = 0.12f;
            [Tooltip("라운드 사이 쉼 (게임 시간)")]
            public float roundRest = 0.18f;
            [Header("쓰러짐·흐트러짐")]
            [Tooltip("쓰러질 때 가라앉으며 흐려지는 시간")]
            public float downTime = 0.6f;
            public float downSink = 0.25f;
            [Tooltip("쓰러진 인형의 투명도")]
            [Range(0f, 1f)] public float downOpacity = 0.35f;
            [Tooltip("이 피해 이상이면 흐트러짐: 주저앉아 버티고, 숫자가 붉고, '흐트러짐' 딱지가 붙는다")]
            public int heavyDamage = 25;
        }

        //소리 (웹 SynthSound 의 소리 자리와 같다). 클립이 없으면 조용하다
        [Serializable]
        public sealed class SoundSettings
        {
            [Tooltip("비어 있으면 감독에 붙여 만든다")]
            public AudioSource source;
            [Range(0f, 1f)] public float volume = 0.8f;
            [Tooltip("달려 나갈 때")]
            public AudioClip dash;
            [Tooltip("합에서 부딪힐 때·피해 없는 충돌")]
            public AudioClip clash;
            [Tooltip("교착")]
            public AudioClip clashTie;
            public AudioClip hit;
            [Tooltip("흐트러짐 피해")]
            public AudioClip hitHeavy;
            [Tooltip("쓰러짐")]
            public AudioClip down;
        }

        //피해 숫자 모양 (웹 .num3d). 크기는 월드 글 크기
        [Serializable]
        public sealed class NumberSettings
        {
            public float seconds = 1.1f;
            public float fontSize = 5f;
            public float tagFontSize = 2.4f;
            [Tooltip("머리 위로 더 띄우는 높이. 숫자는 키의 0.1, 딱지는 0.55 (웹 headPoint lift × 키 2)")]
            public float lift = 0.2f;
            public float tagLift = 1.1f;
            [Tooltip("사라지는 동안 떠오르는 높이")]
            public float rise = 0.5f;
            public string staggerText = "흐트러짐";
            public Color color = new Color(0.961f, 0.929f, 0.878f);
            public Color outline = new Color(0.071f, 0.047f, 0.039f);
            public Color heavyColor = new Color(1f, 0.294f, 0.227f);
            public Color heavyOutline = new Color(1f, 0.949f, 0.878f);
            public Color tagColor = new Color(0.914f, 0.78f, 0.478f);
            [Range(0f, 1f)] public float outlineWidth = 0.2f;
            public int sortingOrder = 520;
        }

        //카메라 수치 (SPEC-005 §8.4)
        [Serializable]
        public sealed class CameraSettings
        {
            [Tooltip("초점 때 캐릭터 화면 크기가 대기 때의 몇 배까지 커질지. 초점 거리는 이 값에서 나온다")]
            public float focusSizeGain = 1.08f;
            public float focusHeight = 0.1f;
            [Tooltip("공격자 쪽으로 도는 각도")]
            public float panYawDeg = 24f;
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
            public Vector3 maxOffset = new Vector3(0.35f, 0.28f, 0.2f);
            public Vector3 maxAngle = new Vector3(1.6f, 1.6f, 2.5f);
            public float frequency = 22f;
            [Header("타격 방향 차기 (감쇠 스프링)")]
            public float kickImpulse = 0.25f;
            public float kickStiffness = 220f;
            public float kickDamping = 18f;
            [Header("화각 펀치")]
            public float fovPunch = 3.5f;
            [Tooltip("피해 없는 합 충돌의 흔들림 세기 (0~1)")]
            [Range(0f, 1f)] public float clashPower = 0.35f;
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
            [Tooltip("피해 없는 합 충돌의 역경직")]
            public float clashSeconds = 0.05f;
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

        //금속 스파크 수치 (SPEC-005 §8.6). 충돌 이펙트 프리팹이 없으면 코드로 만든 스파크를 쓴다
        [Serializable]
        public sealed class SparkSettings
        {
            public bool enabled = true;
            [Tooltip("가산 합성 파티클 재질. 비어 있으면 찾을 수 있는 파티클 셰이더로 만든다")]
            public Material material;
            public int countHit = 26;
            public int countClash = 42;
            public Vector2 speed = new Vector2(7f, 17f);
            public float gravity = 16f;
            public float drag = 1.8f;
            public Vector2 lifetime = new Vector2(0.3f, 0.62f);
            [Tooltip("속도에 비례해 늘이는 길이 (Stretched Billboard 속도 배율)")]
            public float length = 0.1f;
            public float width = 0.05f;
            public float coneDeg = 80f;
            [Range(0f, 1f)] public float backShare = 0.3f;
            public float coreSize = 0.6f;
            public float coreLife = 0.08f;
            public Color head = new Color(1f, 0.97f, 0.8f);
            public Color body = new Color(1f, 0.8f, 0.25f);
            public Color tail = new Color(1f, 0.45f, 0.1f);
        }

        //결과 알림 수치 (SPEC-005 §8.10)
        [Serializable]
        public sealed class CalloutSettings
        {
            [Tooltip("TextMeshPro(월드용)가 붙은 프리팹. 비어 있으면 기본 글꼴로 만든다")]
            public GameObject prefab;
            public float seconds = 1.1f;
            [Tooltip("머리 위로 띄우는 높이")]
            public float headOffset = 0.35f;
            public float fontSize = 3f;
            public string successText = "공격 성공";
            public string loseText = "패배";
            public Color successColor = new Color(0.953f, 0.902f, 0.8f);
            public Color loseColor = new Color(1f, 0.478f, 0.4f);
            public Color reasonColor = new Color(0.604f, 0.557f, 0.502f);
            [Tooltip("어두운 반투명 상자 한 겹 (웹 rgba(12,10,9,0.82))")]
            public Color boxColor = new Color(0.047f, 0.039f, 0.035f, 0.82f);
            [Tooltip("상자 윗줄. 성공은 파랑, 패배는 빨강")]
            public Color successLine = new Color(0.561f, 0.69f, 0.784f);
            public Color loseLine = new Color(0.702f, 0.149f, 0.169f);
            public float lineWidth = 0.03f;
            [Tooltip("글자 크기에 곱하는 상자 안 여백 (가로, 세로)")]
            public Vector2 boxPadding = new Vector2(0.09f, 0.03f);
            [Tooltip("나타날 때 아래에서 올라오는 거리와 사라질 때 더 올라가는 거리")]
            public float enterDrop = 0.12f;
            public float exitRise = 0.06f;
            public int sortingOrder = 500;
        }

        [Header("카메라 (원근)")]
        [SerializeField] private Camera targetCamera;
        [Tooltip("움직일 트랜스폼. 비어 있으면 카메라 자신")]
        [SerializeField] private Transform cameraRig;

        [Header("무대")]
        [Tooltip("근경을 교전 중에 숨길 배경. 비어 있으면 장면에서 찾는다")]
        [SerializeField] private Limbus25DStageBackdrop backdrop;

        [SerializeField] private MotionSettings motion = new MotionSettings();
        [SerializeField] private CameraSettings cameraSettings = new CameraSettings();
        [SerializeField] private ShakeSettings shake = new ShakeSettings();
        [SerializeField] private HitStopSettings hitStop = new HitStopSettings();
        [SerializeField] private EffectSettings effects = new EffectSettings();
        [SerializeField] private CalloutSettings callout = new CalloutSettings();
        [SerializeField] private SparkSettings sparks = new SparkSettings();
        [SerializeField] private SoundSettings sound = new SoundSettings();
        [SerializeField] private NumberSettings numbers = new NumberSettings();

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
            if (backdrop == null) backdrop = FindObjectOfType<Limbus25DStageBackdrop>();
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
            FaceActorsToCamera();
        }

        //캐릭터 판을 카메라 회전과 똑같이 돌린다 (SPEC-005 §8.9). 늘 정면으로 보이고 화면에서 기울지 않는다
        private void FaceActorsToCamera()
        {
            if (cameraRig == null) return;
            Quaternion facing = cameraRig.rotation;
            foreach (Limbus25DActor actor in Limbus25DActor.Active)
            {
                if (actor != null && actor.FacesCamera) actor.transform.rotation = facing;
            }
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
                    EnterExchange(cue);
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
                LeaveExchange();
            }
        }

        //교전 한 건이 시작된다. 근경을 숨기고, 이 교전의 두 사람만 남긴다 (SPEC-005 §9.3·§9.5.1)
        private void EnterExchange(PresentationCue cue)
        {
            if (backdrop != null) backdrop.SetCombat(true, motion.foregroundFade);
            foreach (Limbus25DActor actor in Limbus25DActor.Active)
            {
                if (actor == null) continue;
                actor.SetShown(actor == cue.attacker || actor == cue.defender, motion.bystanderFade);
            }
        }

        //대기열이 비었다. 입력·대기 동안은 모두 다시 보인다
        private void LeaveExchange()
        {
            if (backdrop != null) backdrop.SetCombat(false, motion.foregroundFade);
            foreach (Limbus25DActor actor in Limbus25DActor.Active)
            {
                if (actor != null) actor.SetShown(true, motion.bystanderFade);
            }
        }

        //── 한 교전의 타임라인 (SPEC-005 §8.2·§9.3). 웹 renderer3d/stage.ts 와 같은 순서다 ──

        //일방 공격: 초점 → 선딜레이(준비 장) → 돌진 → 충돌(맞닿는 장) → 스파크·역경직·흔들림·피해 숫자 → 넉백 → 복귀
        //맞부딪힘: PlayClashRoundsAsync
        public async Task PlayAsync(PresentationCue cue, CancellationToken token)
        {
            Limbus25DActor attacker = cue.attacker;
            Limbus25DActor defender = cue.defender;
            if (attacker == null || defender == null) return;
            if (cue.kind == CueKind.Clash)
            {
                //라운드 목록이 없는 옛 맞부딪힘은 한 라운드로 돈다. attacker 가 이긴 쪽이다
                if (cue.rounds == null || cue.rounds.Length == 0)
                {
                    cue.rounds = new[] { CueRound.Win(attacker, defender, cue.callouts ?? new CueCallout[0]) };
                    cue.finisher = attacker;
                }
                await PlayClashRoundsAsync(cue, token);
                return;
            }

            float dir = DirOf(attacker, defender);
            KillMotion(attacker);
            KillMotion(defender);

            FocusOn(attacker, defender, dir);
            await AwaitTween(Windup(attacker, cue.attackerSlot, dir), token);
            ShowCallouts(cue.callouts, attacker, null, token);
            await AwaitTween(Dash(attacker, defender.transform.position.x - dir * motion.contactGap, defender.transform.position.z, motion.dashTime), token);
            FollowPair(attacker, defender, dir);
            await AwaitTween(Strike(attacker, cue.attackerSlot, dir), token);

            Vector3 contact = Vector3.Lerp(attacker.Chest, defender.Chest, effects.contactBias);
            Impact(cue, contact, defender, dir, cue.damage, false, cue.targetDefeated);
            Tween trail = attacker.PlayStrikeTrail(motion.strikeTrailTime, motion.strikeTrailPeakShare, cue.attackerSlot);
            Sequence after = DOTween.Sequence().SetLink(gameObject).Join(VisualHome(attacker, motion.knockTime));
            bool heavy = IsHeavy(cue);
            if (cue.damage > 0 && !defender.IsDown) after.Join(Knockback(defender, dir, cue.damage, heavy));
            await AwaitTween(after, token);
            await WaitRealtime(motion.lingerAfterHit, token);
            await AwaitTween(trail, token);

            ReleaseFocus();
            Sequence back = DOTween.Sequence().SetLink(gameObject);
            if (!defender.IsDown) back.Join(SpringBack(defender));
            if (!attacker.IsDown) back.Join(ReturnHome(attacker));
            await AwaitTween(back, token);
            Settle(attacker);
            Settle(defender);
        }

        //초점 → 둘 다 선딜레이 → 라운드마다 (돌진·재돌진 → 부딪힘 → 밀림) → 마무리 한 방 → 복귀
        //라운드 사이에 제자리로 돌아가지 않고 붙은 채로 이어 간다
        private async Task PlayClashRoundsAsync(PresentationCue cue, CancellationToken token)
        {
            Limbus25DActor a = cue.attacker;
            Limbus25DActor d = cue.defender;
            float dir = DirOf(a, d);
            KillMotion(a);
            KillMotion(d);

            FocusOn(a, d, dir);
            await AwaitTween(Windup(a, cue.attackerSlot, dir).Join(Windup(d, cue.defenderSlot, -dir)), token);

            //붙는 자리. 가운데에서 서로 contactGap 만큼 떨어진다
            float midX = (a.transform.position.x + d.transform.position.x) * 0.5f;
            float midZ = (a.transform.position.z + d.transform.position.z) * 0.5f;
            float ax = midX - dir * motion.contactGap * 0.5f;
            float dx = midX + dir * motion.contactGap * 0.5f;

            for (int i = 0; i < cue.rounds.Length; i++)
            {
                CueRound round = cue.rounds[i];
                ShowCallouts(round.callouts, a, d, token);
                float time = i == 0 ? motion.dashTime : motion.reengageTime;
                await AwaitTween(DOTween.Sequence().SetLink(gameObject).Join(Dash(a, ax, midZ, time)).Join(Dash(d, dx, midZ, time)), token);
                FollowPair(a, d, dir);
                await AwaitTween(Strike(a, cue.attackerSlot, dir).Join(Strike(d, cue.defenderSlot, -dir)), token);

                Vector3 contact = (a.Chest + d.Chest) * 0.5f;
                Impact(cue, contact, d, dir, 0, true, false);
                PlaySound(round.kind == RoundKind.Deadlock ? sound.clashTie : sound.clash);

                //진 쪽이 밀린다. 교착이면 둘 다 조금 밀린다
                Sequence push = DOTween.Sequence().SetLink(gameObject);
                if (round.kind == RoundKind.Win && (round.loser == a || round.loser == d))
                {
                    Limbus25DActor loser = round.loser;
                    Limbus25DActor winner = loser == a ? d : a;
                    push.Join(Push(loser, loser == a ? -dir : dir, motion.clashPush));
                    push.Join(VisualHome(winner, motion.knockTime));
                }
                else
                {
                    push.Join(Push(a, -dir, motion.deadlockPush));
                    push.Join(Push(d, dir, motion.deadlockPush));
                }
                await AwaitTween(push, token);
                await WaitScaled(motion.roundRest, token);
            }

            Limbus25DActor w = cue.finisher;
            if (w == a || w == d)
            {
                //이긴 쪽이 진 쪽을 친다
                Limbus25DActor l = w == a ? d : a;
                SkillSlot slot = w == a ? cue.attackerSlot : cue.defenderSlot;
                float wdir = DirOf(w, l);
                await AwaitTween(Dash(w, l.transform.position.x - wdir * motion.contactGap, l.transform.position.z, motion.reengageTime), token);
                await AwaitTween(Strike(w, slot, wdir), token);

                Vector3 contact = Vector3.Lerp(w.Chest, l.Chest, effects.contactBias);
                Impact(cue, contact, l, wdir, cue.damage, false, cue.targetDefeated);
                Tween trail = w.PlayStrikeTrail(motion.strikeTrailTime, motion.strikeTrailPeakShare, slot);
                Sequence after = DOTween.Sequence().SetLink(gameObject).Join(VisualHome(w, motion.knockTime));
                if (cue.damage > 0 && !l.IsDown) after.Join(Knockback(l, wdir, cue.damage, IsHeavy(cue)));
                await AwaitTween(after, token);
                await WaitRealtime(motion.lingerAfterHit, token);
                await AwaitTween(trail, token);
            }
            else
            {
                await WaitRealtime(motion.lingerAfterHit, token);
            }

            ReleaseFocus();
            Sequence back = DOTween.Sequence().SetLink(gameObject);
            if (!a.IsDown) back.Join(ReturnHome(a));
            if (!d.IsDown) back.Join(ReturnHome(d));
            await AwaitTween(back, token);
            Settle(a);
            Settle(d);
        }

        //맞는 순간. 이펙트·스파크·역경직·카메라·소리·피해 숫자·쓰러짐 (웹 impact 와 같다)
        private void Impact(PresentationCue cue, Vector3 contact, Limbus25DActor target, float dir, int damage, bool clash, bool defeated)
        {
            bool heavy = damage >= motion.heavyDamage || (!clash && cue.stagger);
            GameObject prefab = clash ? effects.defaultClashSpark : (cue.impactEffect != null ? cue.impactEffect : effects.defaultImpact);
            if (prefab != null) SpawnEffect(prefab, contact, target, clash ? EffectLayer.Front : cue.impactLayer, dir);
            else if (sparks.enabled) SpawnSparks(contact, target, dir, clash);
            float seconds = clash && damage <= 0 ? hitStop.clashSeconds : Mathf.Min(hitStop.maxSeconds, hitStop.baseSeconds + damage * hitStop.perDamageSeconds);
            StartHitStop(seconds);
            AddImpact(damage > 0 ? Mathf.Min(1f, damage / Mathf.Max(1f, shake.damageForMaxShake)) : shake.clashPower, dir);
            PlaySound(damage <= 0 ? sound.clash : heavy ? sound.hitHeavy : sound.hit);
            if (defeated) Defeat(target);
            if (damage > 0)
            {
                ShowNumber(target, damage.ToString(), heavy ? NumberKind.Heavy : NumberKind.Normal);
                if (heavy) ShowNumber(target, numbers.staggerText, NumberKind.Tag);
            }
        }

        //흐트러짐인지. 웹은 피해가 heavyDamage 이상이면 흐트러짐이다. 어댑터가 따로 알려도 따른다
        private bool IsHeavy(PresentationCue cue)
        {
            return cue.damage >= motion.heavyDamage || cue.stagger;
        }

        //쓰러뜨린다. 교전 밖(출혈 등)에서 쓰러질 때도 부른다
        public void Defeat(Limbus25DActor actor)
        {
            if (actor == null || actor.IsDown) return;
            actor.Visual.DOKill();
            actor.FallDown(motion.downTime, motion.downSink, motion.downOpacity);
            PlaySound(sound.down);
        }

        //공격 방향. 같은 자리면 바라보는 쪽
        private static float DirOf(Limbus25DActor from, Limbus25DActor to)
        {
            float dir = Mathf.Sign(to.transform.position.x - from.transform.position.x);
            return Mathf.Approximately(to.transform.position.x, from.transform.position.x) ? from.Facing : dir;
        }

        //앞 교전에서 남은 트윈을 끊는다
        private static void KillMotion(Limbus25DActor actor)
        {
            actor.transform.DOKill();
            actor.Visual.DOKill();
        }

        //걸음이 끝난 인형을 대기 장으로. 쓰러졌으면 그대로 둔다
        private static void Settle(Limbus25DActor actor)
        {
            if (!actor.IsDown) actor.SetPose(Limbus25DActor.Pose.Idle);
        }

        //합에서 밀린다. 막는 장으로 바꾸고 자리째 뒤로 미끄러진다. 판은 기울이지 않는다
        private Sequence Push(Limbus25DActor actor, float away, float distance)
        {
            actor.SetPose(Limbus25DActor.Pose.Guard);
            return DOTween.Sequence().SetLink(actor.gameObject)
                .Join(actor.transform.DOMoveX(actor.transform.position.x + away * distance, motion.knockTime).SetEase(Ease.OutExpo))
                .Join(actor.Visual.DOLocalMoveX(0f, motion.knockTime).SetEase(Ease.Linear));
        }

        //── 몸짓 (SPEC-005 §8.3). 판은 기울지도 찌그러지지도 않는다. 위치 이동과 장 바꾸기로만 한다 ──
        //이동은 월드 방향으로 계산해 로컬로 바꿔 넣는다. 루트 배율 부호는 건드리지 않는다

        //② 뒤로 물러나며 준비 장
        private Sequence Windup(Limbus25DActor actor, SkillSlot slot, float dir)
        {
            actor.ShowSkillReady(slot);
            return DOTween.Sequence().SetLink(actor.gameObject)
                .Join(actor.Visual.DOLocalMoveX(actor.WorldToLocalX(-dir * motion.windupBack), motion.windupTime).SetEase(Ease.OutQuad));
        }

        //③ 상대 앞까지 가속해 들어간다. 깊이(z)도 상대 줄에 맞춘다
        private Sequence Dash(Limbus25DActor actor, float toX, float toZ, float time)
        {
            actor.SetPose(Limbus25DActor.Pose.Dash);
            PlaySound(sound.dash);
            return DOTween.Sequence().SetLink(actor.gameObject)
                .Join(actor.transform.DOMoveX(toX, time).SetEase(Ease.InQuad))
                .Join(actor.transform.DOMoveZ(toZ, time).SetEase(Ease.InQuad))
                .Join(actor.Visual.DOLocalMoveX(0f, time).SetEase(Ease.Linear));
        }

        //④ 앞으로 내딛는 맞닿는 장. 탄성 있게 (OutBack)
        private Sequence Strike(Limbus25DActor actor, SkillSlot slot, float dir)
        {
            actor.ShowSkillPeak(slot);
            return DOTween.Sequence().SetLink(actor.gameObject)
                .Join(actor.Visual.DOLocalMoveX(actor.WorldToLocalX(dir * motion.strikeReach), motion.strikeTime).SetEase(Ease.OutBack));
        }

        //⑤ 맞은 쪽이 공격 반대로 밀린다. 흐트러짐이면 조금 주저앉아 잠깐 버틴다. 기울지 않는다 (§8.9)
        private Sequence Knockback(Limbus25DActor actor, float dir, int damage, bool heavy)
        {
            actor.SetPose(Limbus25DActor.Pose.Hurt);
            Transform v = actor.Visual;
            float distance = Mathf.Min(motion.knockMax, motion.knockBase + damage * motion.knockPerDamage);
            Sequence seq = DOTween.Sequence().SetLink(actor.gameObject)
                .Join(v.DOLocalMoveX(actor.WorldToLocalX(dir * distance), motion.knockTime).SetEase(Ease.OutExpo))
                .Join(v.DOLocalMoveY(heavy ? motion.staggerDrop : 0f, motion.knockTime).SetEase(Ease.OutExpo));
            if (heavy) seq.AppendInterval(motion.staggerHold);
            return seq;
        }

        //⑥ 맞은 쪽이 스프링처럼 통통 튕기며 제자리로 돌아온다
        private Sequence SpringBack(Limbus25DActor actor)
        {
            actor.SetPose(Limbus25DActor.Pose.Recover);
            Transform v = actor.Visual;
            float t = motion.settleTime;
            return DOTween.Sequence().SetLink(actor.gameObject)
                .Join(v.DOLocalMoveX(0f, t).SetEase(Ease.OutElastic, motion.settleAmplitude, motion.settlePeriod))
                .Join(v.DOLocalMoveY(0f, t).SetEase(Ease.OutElastic, motion.settleAmplitude, motion.settlePeriod));
        }

        //몸짓 위치만 제자리로. 자리는 그대로다
        private Sequence VisualHome(Limbus25DActor actor, float time)
        {
            return DOTween.Sequence().SetLink(actor.gameObject)
                .Join(actor.Visual.DOLocalMoveX(0f, time).SetEase(Ease.Linear));
        }

        //⑥ 원위치로 돌아간다
        private Sequence ReturnHome(Limbus25DActor actor)
        {
            actor.SetPose(Limbus25DActor.Pose.Recover);
            return DOTween.Sequence().SetLink(actor.gameObject)
                .Join(actor.transform.DOMoveX(actor.Home.x, motion.returnTime).SetEase(Ease.OutCubic))
                .Join(actor.transform.DOMoveZ(actor.Home.z, motion.returnTime).SetEase(Ease.OutCubic))
                .Join(actor.Visual.DOLocalMoveX(0f, motion.returnTime).SetEase(Ease.Linear))
                .Join(actor.Visual.DOLocalMoveY(0f, motion.returnTime).SetEase(Ease.Linear));
        }

        //연출이 끊겼을 때 두 사람을 즉시 제자리로 돌린다
        private void RecoverActors(PresentationCue cue)
        {
            foreach (Limbus25DActor actor in new[] { cue.attacker, cue.defender })
            {
                if (actor == null) continue;
                KillMotion(actor);
                if (!actor.IsDown) actor.transform.position = actor.Home;
                actor.ResetVisual();
            }
            ReleaseFocus();
        }

        //── 소리 ──

        //소리를 한 번 낸다. 클립이 없으면 조용히 넘어간다
        private void PlaySound(AudioClip clip)
        {
            if (clip == null) return;
            if (sound.source == null)
            {
                sound.source = gameObject.AddComponent<AudioSource>();
                sound.source.playOnAwake = false;
                sound.source.spatialBlend = 0f;
            }
            sound.source.PlayOneShot(clip, sound.volume);
        }

        //── 금속 스파크 (SPEC-005 §8.6) ──

        private Material sparkMaterial;
        private Texture2D sparkTexture;

        //금속끼리 부딪힌 스파크. 짧은 섬광 + 노란 불똥 줄기가 공격 방향 부채꼴로 튀고 중력으로 떨어진다
        //게임 시간으로 흘러 역경직 동안 같이 멈춘다
        private void SpawnSparks(Vector3 position, Limbus25DActor reference, float dir, bool clash)
        {
            var root = new GameObject("Sparks");
            root.transform.position = position;
            int order = reference != null ? reference.SortingOrder + effects.frontOrderOffset + 1 : 0;
            int count = clash ? sparks.countClash : sparks.countHit;
            int back = Mathf.RoundToInt(count * sparks.backShare);
            float cone = sparks.coneDeg * (clash ? 1.4f : 1f);
            //앞쪽 불똥, 되튀는 불똥, 가운데 섬광
            BuildSparkSystem(root.transform, "Forward", count - back, dir, cone, order, false);
            BuildSparkSystem(root.transform, "Back", back, -dir, cone, order, false);
            BuildSparkSystem(root.transform, "Core", 1, dir, 0f, order, true);
            Destroy(root, sparks.lifetime.y + 0.5f);
        }

        //불똥 한 묶음을 파티클 시스템으로 만든다. 늘인 빌보드라 속도 방향으로 길어진다
        private void BuildSparkSystem(Transform parent, string name, int count, float dir, float coneDeg, int order, bool core)
        {
            if (count <= 0) return;
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            //원뿔이 공격 방향(월드 x)으로, 살짝 위를 향하게
            go.transform.rotation = Quaternion.LookRotation(new Vector3(dir, 0.25f, 0f).normalized, Vector3.up);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);

            var main = ps.main;
            main.duration = 0.1f;
            main.loop = false;
            main.playOnAwake = false;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.useUnscaledTime = false;
            main.maxParticles = count;
            if (core)
            {
                main.startLifetime = sparks.coreLife;
                main.startSpeed = 0f;
                main.startSize = sparks.coreSize;
                main.startColor = sparks.head;
                main.gravityModifier = 0f;
            }
            else
            {
                main.startLifetime = new ParticleSystem.MinMaxCurve(sparks.lifetime.x, sparks.lifetime.y);
                main.startSpeed = new ParticleSystem.MinMaxCurve(sparks.speed.x, sparks.speed.y);
                main.startSize = new ParticleSystem.MinMaxCurve(sparks.width * 0.7f, sparks.width * 1.3f);
                main.startColor = new ParticleSystem.MinMaxGradient(sparks.head, sparks.body);
                main.gravityModifier = sparks.gravity / Mathf.Max(0.01f, -Physics.gravity.y);
            }

            var emission = ps.emission;
            emission.rateOverTime = 0f;
            emission.SetBursts(new[] { new ParticleSystem.Burst(0f, (short)count) });

            var shape = ps.shape;
            shape.enabled = !core;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = coneDeg * 0.5f;
            shape.radius = 0.02f;

            if (!core)
            {
                var drag = ps.limitVelocityOverLifetime;
                drag.enabled = true;
                drag.drag = sparks.drag;
                drag.multiplyDragByParticleSize = false;
                drag.multiplyDragByParticleVelocity = false;
            }

            //뜨거운 머리 → 식는 꼬리 색, 끝에서 흐려진다
            var color = ps.colorOverLifetime;
            color.enabled = true;
            var gradient = new Gradient();
            gradient.SetKeys(
                new[] { new GradientColorKey(sparks.head, 0f), new GradientColorKey(sparks.body, 0.4f), new GradientColorKey(sparks.tail, 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(1f, 0.5f), new GradientAlphaKey(0f, 1f) });
            color.color = gradient;

            var renderer = go.GetComponent<ParticleSystemRenderer>();
            renderer.renderMode = core ? ParticleSystemRenderMode.Billboard : ParticleSystemRenderMode.Stretch;
            renderer.velocityScale = sparks.length;
            renderer.lengthScale = 1f;
            renderer.sharedMaterial = GetSparkMaterial();
            renderer.sortingOrder = order;

            ps.Play(true);
        }

        //스파크 재질. 지정이 없으면 파티클 셰이더를 찾아 부드러운 점 텍스처로 만든다
        private Material GetSparkMaterial()
        {
            if (sparks.material != null) return sparks.material;
            if (sparkMaterial != null) return sparkMaterial;
            Shader shader = Shader.Find("Universal Render Pipeline/Particles/Unlit");
            if (shader == null) shader = Shader.Find("Legacy Shaders/Particles/Additive");
            if (shader == null) shader = Shader.Find("Sprites/Default");
            sparkMaterial = new Material(shader) { name = "SparkRuntime" };
            if (sparkTexture == null)
            {
                //가운데가 밝은 둥근 점. 늘이면 불똥 줄기가 된다
                const int n = 32;
                sparkTexture = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
                for (int y = 0; y < n; y++)
                {
                    for (int x = 0; x < n; x++)
                    {
                        float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(n * 0.5f, n * 0.5f)) / (n * 0.5f);
                        float a = Mathf.Clamp01(1f - d);
                        sparkTexture.SetPixel(x, y, new Color(1f, 1f, 1f, a * a));
                    }
                }
                sparkTexture.Apply();
            }
            sparkMaterial.mainTexture = sparkTexture;
            if (sparkMaterial.HasProperty("_BaseMap")) sparkMaterial.SetTexture("_BaseMap", sparkTexture);
            //URP 파티클 셰이더면 투명·가산으로 맞춘다
            if (sparkMaterial.HasProperty("_Surface"))
            {
                sparkMaterial.SetFloat("_Surface", 1f);
                sparkMaterial.SetFloat("_Blend", 2f);
                sparkMaterial.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
                sparkMaterial.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.One);
                sparkMaterial.SetInt("_ZWrite", 0);
                sparkMaterial.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
                sparkMaterial.renderQueue = (int)UnityEngine.Rendering.RenderQueue.Transparent;
            }
            return sparkMaterial;
        }

        //── 결과 알림 (SPEC-005 §8.10) ──

        //달려가는 사람(a, b) 중 아군에게만 결과 알림을 띄운다. 적에게는 띄우지 않는다
        private void ShowCallouts(CueCallout[] list, Limbus25DActor a, Limbus25DActor b, CancellationToken token)
        {
            if (list == null) return;
            foreach (CueCallout c in list)
            {
                if (c.actor == null || !c.actor.IsPlayerSide) continue;
                if (c.actor != a && c.actor != b) continue;
                _ = RunCalloutAsync(c, token);
            }
        }

        //흰 점 하나짜리 스프라이트. 알림 상자와 윗줄을 그린다
        private Sprite whiteSprite;

        private Sprite WhiteSprite()
        {
            if (whiteSprite == null) whiteSprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0f, 0f, 4f, 4f), new Vector2(0.5f, 0.5f), 4f);
            return whiteSprite;
        }

        //글에 맞춘 판 하나를 만든다. 알림 상자 바탕·윗줄에 쓴다
        private SpriteRenderer MakePanel(Transform parent, string name, Color color, int order)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var r = go.AddComponent<SpriteRenderer>();
            r.sprite = WhiteSprite();
            r.color = color;
            r.sortingOrder = order;
            return r;
        }

        //글을 만들어 머리를 따라다니게 하고, 끝에서 흐려지며 사라진다. 실제 시간이라 역경직에 멈추지 않는다
        //모양은 웹 .callout3d 와 같다: 어두운 반투명 상자 한 겹 + 윗줄(성공 파랑·패배 빨강), 큰 줄 + 작은 줄
        private async Task RunCalloutAsync(CueCallout c, CancellationToken token)
        {
            GameObject go = new GameObject("Callout");
            GameObject textGo = callout.prefab != null ? Instantiate(callout.prefab, go.transform) : new GameObject("Text");
            textGo.transform.SetParent(go.transform, false);
            TMP_Text text = textGo.GetComponentInChildren<TMP_Text>();
            if (text == null) text = textGo.AddComponent<TextMeshPro>();
            text.alignment = TextAlignmentOptions.Center;
            text.fontSize = callout.fontSize;
            text.enableWordWrapping = false;
            string big = !string.IsNullOrEmpty(c.headline) ? c.headline : (c.success ? callout.successText : callout.loseText);
            Color bigColor = c.success ? callout.successColor : callout.loseColor;
            text.text = string.IsNullOrEmpty(c.reason)
                ? $"<cspace=0.08em><color=#{ColorUtility.ToHtmlStringRGB(bigColor)}>{big}</color></cspace>"
                : $"<cspace=0.08em><color=#{ColorUtility.ToHtmlStringRGB(bigColor)}>{big}</color></cspace>\n<size=70%><color=#{ColorUtility.ToHtmlStringRGB(callout.reasonColor)}>{c.reason}</color></size>";
            var textRenderer = text.GetComponent<Renderer>();
            if (textRenderer != null) textRenderer.sortingOrder = callout.sortingOrder;

            //글 크기에 맞춰 상자와 윗줄을 깐다. 상자는 글 아래가 알림 기준점(머리 위)에 오게 올린다
            text.ForceMeshUpdate();
            Vector2 size = text.GetRenderedValues(false);
            float padX = callout.fontSize * callout.boxPadding.x;
            float padY = callout.fontSize * callout.boxPadding.y;
            float boxW = size.x + padX * 2f;
            float boxH = size.y + padY * 2f;
            text.transform.localPosition = new Vector3(0f, boxH * 0.5f, 0f);
            SpriteRenderer box = MakePanel(go.transform, "Box", callout.boxColor, callout.sortingOrder - 2);
            box.transform.localPosition = new Vector3(0f, boxH * 0.5f, 0.001f);
            box.transform.localScale = new Vector3(boxW, boxH, 1f);
            SpriteRenderer line = MakePanel(go.transform, "Line", c.success ? callout.successLine : callout.loseLine, callout.sortingOrder - 1);
            line.transform.localPosition = new Vector3(0f, boxH, 0.0005f);
            line.transform.localScale = new Vector3(boxW, callout.lineWidth, 1f);
            float boxAlpha = callout.boxColor.a;
            float lineAlpha = line.color.a;

            float start = Time.unscaledTime;
            try
            {
                while (!token.IsCancellationRequested && c.actor != null)
                {
                    float k = (Time.unscaledTime - start) / Mathf.Max(0.01f, callout.seconds);
                    if (k >= 1f) break;
                    //앞 12% 에 아래에서 올라오며 나타나고, 78% 부터 조금 더 올라가며 흐려진다
                    float alpha = k < 0.12f ? k / 0.12f : (k > 0.78f ? (1f - k) / 0.22f : 1f);
                    float rise = k < 0.12f ? Mathf.Lerp(-callout.enterDrop, 0f, k / 0.12f) : (k > 0.78f ? Mathf.Lerp(0f, callout.exitRise, (k - 0.78f) / 0.22f) : 0f);
                    //판처럼 카메라 회전을 그대로 따른다. 화면에서 기울지 않는다
                    Quaternion facing = cameraRig != null ? cameraRig.rotation : Quaternion.identity;
                    go.transform.SetPositionAndRotation(c.actor.Head + facing * Vector3.up * (callout.headOffset + rise), facing);
                    text.alpha = alpha;
                    box.color = WithAlpha(box.color, boxAlpha * alpha);
                    line.color = WithAlpha(line.color, lineAlpha * alpha);
                    await Task.Yield();
                }
            }
            finally
            {
                if (go != null) Destroy(go);
            }
        }

        private static Color WithAlpha(Color c, float a)
        {
            c.a = a;
            return c;
        }

        //── 피해 숫자 (웹 .num3d) ──

        //피해 숫자 종류. 보통·흐트러짐(큰 피해)·글 딱지
        public enum NumberKind { Normal, Heavy, Tag }

        //맞은 사람 머리 위에 숫자나 글을 띄운다. 출혈 같은 교전 밖 피해에도 쓴다. 실제 시간
        public void ShowNumber(Limbus25DActor target, string value, NumberKind kind)
        {
            if (target == null || target.IsHidden || string.IsNullOrEmpty(value)) return;
            _ = RunNumberAsync(target, value, kind, lifetime != null ? lifetime.Token : CancellationToken.None);
        }

        //튀어나오며 커졌다 줄고(1.8 → 0.92 → 1), 떠오르며 끝에서 흐려진다. 뜬 자리에 머문다
        private async Task RunNumberAsync(Limbus25DActor target, string value, NumberKind kind, CancellationToken token)
        {
            var go = new GameObject("Number");
            TextMeshPro text = go.AddComponent<TextMeshPro>();
            text.alignment = TextAlignmentOptions.Center;
            text.enableWordWrapping = false;
            text.fontStyle = FontStyles.Bold;
            text.fontSize = kind == NumberKind.Tag ? numbers.tagFontSize : numbers.fontSize;
            text.color = kind == NumberKind.Heavy ? numbers.heavyColor : kind == NumberKind.Tag ? numbers.tagColor : numbers.color;
            text.outlineWidth = kind == NumberKind.Tag ? 0f : numbers.outlineWidth;
            text.outlineColor = kind == NumberKind.Heavy ? numbers.heavyOutline : numbers.outline;
            text.text = value;
            var r = text.GetComponent<Renderer>();
            if (r != null) r.sortingOrder = numbers.sortingOrder;

            float lift = kind == NumberKind.Tag ? numbers.tagLift : numbers.lift;
            Vector3 anchor = target.Head + Vector3.up * lift;
            float start = Time.unscaledTime;
            try
            {
                while (!token.IsCancellationRequested)
                {
                    float k = (Time.unscaledTime - start) / Mathf.Max(0.01f, numbers.seconds);
                    if (k >= 1f) break;
                    float scale = k < 0.12f ? Mathf.Lerp(1.8f, 0.92f, k / 0.12f) : (k < 0.22f ? Mathf.Lerp(0.92f, 1f, (k - 0.12f) / 0.1f) : 1f);
                    Quaternion facing = cameraRig != null ? cameraRig.rotation : Quaternion.identity;
                    go.transform.SetPositionAndRotation(anchor + facing * Vector3.up * (numbers.rise * k), facing);
                    go.transform.localScale = Vector3.one * scale;
                    text.alpha = k > 0.75f ? (1f - k) / 0.25f : 1f;
                    await Task.Yield();
                }
            }
            finally
            {
                if (go != null) Destroy(go);
            }
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
            //초점 거리는 캐릭터 화면 크기가 대기 때의 focusSizeGain 배를 넘지 않게 정한다 (SPEC-005 §8.4)
            //간격에 맞춰 당기면 크기가 1.6배까지 들쭉날쭉했다
            float zoomFov = homeFov - cameraSettings.fovZoom;
            float distance = Vector3.Distance(homePosition, middle)
                * Mathf.Tan(homeFov * 0.5f * Mathf.Deg2Rad)
                / Mathf.Tan(Mathf.Max(1f, zoomFov) * 0.5f * Mathf.Deg2Rad)
                / Mathf.Max(0.01f, cameraSettings.focusSizeGain);
            Vector3 view = Quaternion.AngleAxis(-dir * cameraSettings.panYawDeg, Vector3.up) * (homeRotation * Vector3.forward);
            goalPosition = middle - view.normalized * distance;
            goalRotation = Quaternion.LookRotation(middle - goalPosition, Vector3.up) * Quaternion.Euler(0f, 0f, dir * cameraSettings.dutchDeg);
            goalFov = zoomFov;
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
            //트라우마 제곱을 부드러운 계단(smoothstep)으로 (웹 camera.ts 와 같다)
            float tt = trauma * trauma;
            float amount = tt * tt * (3f - 2f * tt);
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

        //-1 ~ 1 사이의 부드러운 잡음. 채널마다 다른 씨앗의 사인 세 겹 (웹 camera.ts noise 와 같다)
        private float Noise(int channel, float t)
        {
            float s = noiseSeeds[channel];
            return 0.55f * Mathf.Sin(t + s) + 0.3f * Mathf.Sin(t * 2.17f + s * 1.7f) + 0.15f * Mathf.Sin(t * 4.31f + s * 2.9f);
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
