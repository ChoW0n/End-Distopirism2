using System.Collections.Generic;
using DG.Tweening;
using UnityEngine;

namespace EndDistopirism.Presentation
{
    //카드 슬롯. 슬롯마다 준비·충돌·궤적 장이 따로 있다 (SPEC-005 §9.4). 궁극기는 S3 장을 빌린다
    public enum SkillSlot { None, S1, S2, S3, Ult }

    //무대에 선 종이 인형 한 명. 연출 감독이 움직이는 대상이다 (SPEC-005 §8.3)
    //구조: 루트(자리·바라보는 쪽) → Visual(몸짓) → SpriteRenderer(그림)
    //루트는 자리와 좌우만 들고, 몸짓(위치 이동)은 전부 Visual 에만 건다
    [DisallowMultipleComponent]
    public sealed class Limbus25DActor : MonoBehaviour
    {
        //장 종류. 그림이 없으면 대기 장으로 떨어진다
        //Recover 는 웹의 retreat(물러나며 돌아오는 장)이다
        public enum Pose { Idle, Windup, Dash, Strike, Recover, Hurt, Guard }

        //카드 슬롯 하나의 장 묶음. 매니페스트의 1n-skilln-* 장과 같다
        [System.Serializable]
        public sealed class SkillFrames
        {
            [Tooltip("선딜레이 장 (1n-skilln-ready)")]
            public Sprite ready;
            [Tooltip("맞닿는 순간의 장 (1n-skilln-01-peak)")]
            public Sprite peak;
            [Tooltip("충돌 뒤 궤적이 사라지는 장들. peak 다음 장부터 순서대로 (02~07)")]
            public Sprite[] trail;
            [Tooltip("이 슬롯 원화가 오른쪽을 보는지")]
            public bool facesRight = true;

            public bool IsEmpty => ready == null && peak == null && (trail == null || trail.Length == 0);
        }

        [Header("구조")]
        [Tooltip("몸짓을 거는 자식. 비어 있으면 첫 번째 자식을 쓴다")]
        [SerializeField] private Transform visual;
        [SerializeField] private SpriteRenderer spriteRenderer;

        [Header("방향")]
        [Tooltip("시작할 때 바라볼 쪽. 1 = 화면 오른쪽, -1 = 왼쪽")]
        [SerializeField] private int startFacing = 1;

        [Header("장마다 원화가 오른쪽을 보는지 (카일은 전부 오른쪽)")]
        [SerializeField] private bool idleFacesRight = true;
        [SerializeField] private bool windupFacesRight = true;
        [SerializeField] private bool dashFacesRight = true;
        [SerializeField] private bool strikeFacesRight = true;
        [SerializeField] private bool recoverFacesRight = true;
        [SerializeField] private bool hurtFacesRight = true;
        [SerializeField] private bool guardFacesRight = true;
        [SerializeField] private bool strikeTrailFacesRight = true;

        [Header("자세 장 (없으면 대기 장). 매니페스트 00-idle · 01-advance · 02-retreat · 03-guard · 04-hit")]
        [SerializeField] private Sprite idle;
        [Tooltip("슬롯 장이 없을 때 쓰는 선딜레이 장")]
        [SerializeField] private Sprite windup;
        [SerializeField] private Sprite dash;
        [Tooltip("슬롯 장이 없을 때 쓰는 충돌 장")]
        [SerializeField] private Sprite strike;
        [SerializeField] private Sprite recover;
        [SerializeField] private Sprite hurt;
        [Tooltip("합에서 밀릴 때 막는 장 (카일 02-preload)")]
        [SerializeField] private Sprite guard;
        [Tooltip("슬롯 장이 없을 때 쓰는 궤적 장. 충돌 장부터 넣는다 (카일 slash 01~07)")]
        [SerializeField] private Sprite[] strikeTrail;

        [Header("카드 슬롯 장 (SPEC-005 §9.4). 비어 있으면 위 선딜레이·충돌·궤적 장을 쓴다")]
        [SerializeField] private SkillFrames skill1 = new SkillFrames();
        [SerializeField] private SkillFrames skill2 = new SkillFrames();
        [SerializeField] private SkillFrames skill3 = new SkillFrames();

        [Header("카메라")]
        [Tooltip("판을 늘 카메라 쪽으로 세운다 (SPEC-005 §8.9). 연출 감독이 매 프레임 돌린다")]
        [SerializeField] private bool facesCamera = true;

        [Header("판 고정")]
        [Tooltip("종이 인형은 기울지도 찌그러지지도 않는다 (SPEC-005 §8.3). 켜 두면 Visual 회전·배율을 매 프레임 되돌린다")]
        [SerializeField] private bool keepFlat = true;

        [Header("편")]
        [Tooltip("플레이어 쪽(아군)인지. 결과 알림은 아군에게만 뜬다 (SPEC-005 §8.10)")]
        [SerializeField] private bool playerSide;

        [Header("그 밖")]
        [Tooltip("몸 가운데 높이(로컬). 이펙트·카메라 초점이 여기를 본다")]
        [SerializeField] private float chestHeight = 1.0f;
        [Tooltip("머리 꼭대기 높이(로컬). 결과 알림·피해 숫자가 이 위에 뜬다")]
        [SerializeField] private float headHeight = 2.1f;
        [Tooltip("이펙트 앞/뒤를 가를 기준 정렬 순서")]
        [SerializeField] private int baseSortingOrder = 0;

        //바라보는 쪽. 1 = 화면 오른쪽. 이 값이 좌우의 유일한 출처다
        private int facing = 1;
        //지금 걸린 장의 원화가 오른쪽을 보는지. 아니면 그림만 뒤집어 오른쪽을 보게 맞춘다
        private bool shownFacesRight = true;
        //루트 배율의 크기. 부호는 facing 이 정한다
        private Vector3 rootScaleAbs = Vector3.one;
        //대기 자리. 공격자가 돌진했다 돌아올 곳이다
        private Vector3 home;
        //투명도 트윈. 쓰러짐·숨기기가 같은 손잡이를 써서 서로 끊는다 (웹 PaperDoll.fade 와 같다)
        private Tween fadeTween;
        //쓰러졌을 때의 투명도. 다시 보일 때 이 값으로 돌아간다
        private float downOpacity = 1f;

        //무대에 켜져 있는 인형들. 연출 감독이 카메라 쪽으로 세울 때 쓴다
        private static readonly HashSet<Limbus25DActor> active = new HashSet<Limbus25DActor>();
        public static IReadOnlyCollection<Limbus25DActor> Active => active;
        public bool FacesCamera => facesCamera;
        public bool IsPlayerSide => playerSide;
        //쓰러졌는지. 쓰러진 인형은 넉백·복귀하지 않는다
        public bool IsDown { get; private set; }
        //교전에 끼지 않아 숨겨졌는지 (SPEC-005 §9.3)
        public bool IsHidden { get; private set; }

        public Transform Visual => visual;
        public SpriteRenderer Renderer => spriteRenderer;
        public int Facing => facing;
        public Vector3 Home => home;
        public int SortingOrder => spriteRenderer != null ? spriteRenderer.sortingOrder : baseSortingOrder;
        public int SortingLayerId => spriteRenderer != null ? spriteRenderer.sortingLayerID : 0;
        //몸 가운데의 월드 좌표. 몸짓으로 옮겨진 만큼 따라간다 (웹 chest 와 같다)
        public Vector3 Chest => (visual != null ? visual.position : transform.position) + Vector3.up * chestHeight * rootScaleAbs.y;
        //머리 꼭대기의 월드 좌표. 몸짓으로 옮겨진 만큼 따라간다
        public Vector3 Head => (visual != null ? visual.position : transform.position) + Vector3.up * headHeight * rootScaleAbs.y;

        //아군인지 정한다
        public void SetPlayerSide(bool value)
        {
            playerSide = value;
        }

        //구조를 잡고 시작 방향을 건다
        private void Awake()
        {
            if (visual == null && transform.childCount > 0) visual = transform.GetChild(0);
            if (visual == null)
            {
                //자식이 없으면 만든다. 몸짓이 루트 배율 부호를 건드리지 않게 하려는 것이다
                var go = new GameObject("Visual");
                visual = go.transform;
                visual.SetParent(transform, false);
            }
            if (spriteRenderer == null) spriteRenderer = visual.GetComponentInChildren<SpriteRenderer>();
            if (idle == null && spriteRenderer != null) idle = spriteRenderer.sprite;
            if (spriteRenderer != null) spriteRenderer.sortingOrder = baseSortingOrder;
            ShowSprite(spriteRenderer != null ? spriteRenderer.sprite : null, idleFacesRight);

            rootScaleAbs = new Vector3(Mathf.Abs(transform.localScale.x), Mathf.Abs(transform.localScale.y), Mathf.Abs(transform.localScale.z));
            home = transform.position;
            SetFacing(startFacing);
        }

        private void OnEnable()
        {
            active.Add(this);
        }

        private void OnDisable()
        {
            active.Remove(this);
        }

        //바라보는 쪽을 바꾼다. 좌우는 여기서만 바뀐다
        public void SetFacing(int side)
        {
            facing = side >= 0 ? 1 : -1;
            ApplyFacing();
        }

        //지금 자리를 대기 자리로 삼는다
        public void MarkHome()
        {
            home = transform.position;
        }

        //장을 바꿔 끼운다. 없는 장은 대기 장으로 떨어진다
        public void SetPose(Pose pose)
        {
            if (spriteRenderer == null) return;
            (Sprite chosen, bool right) = pose switch
            {
                Pose.Windup => (windup, windupFacesRight),
                Pose.Dash => (dash, dashFacesRight),
                Pose.Strike => (strike, strikeFacesRight),
                Pose.Recover => (recover, recoverFacesRight),
                Pose.Hurt => (hurt, hurtFacesRight),
                Pose.Guard => (guard, guardFacesRight),
                _ => (idle, idleFacesRight),
            };
            if (chosen == null) { chosen = idle; right = idleFacesRight; }
            ShowSprite(chosen, right);
        }

        //슬롯의 장 묶음. 궁극기는 S3 장을 빌린다 (웹 skillFrames 와 같다). 없으면 null
        private SkillFrames FramesOf(SkillSlot slot)
        {
            SkillFrames set = slot switch
            {
                SkillSlot.S1 => skill1,
                SkillSlot.S2 => skill2,
                SkillSlot.S3 => skill3,
                SkillSlot.Ult => skill3,
                _ => null,
            };
            return set != null && !set.IsEmpty ? set : null;
        }

        //선딜레이 장을 건다. 슬롯 장이 없으면 공용 선딜레이 장
        public void ShowSkillReady(SkillSlot slot)
        {
            SkillFrames set = FramesOf(slot);
            if (set != null && set.ready != null) ShowSprite(set.ready, set.facesRight);
            else SetPose(Pose.Windup);
        }

        //맞닿는 순간의 장을 건다. 슬롯 장이 없으면 공용 충돌 장
        public void ShowSkillPeak(SkillSlot slot)
        {
            SkillFrames set = FramesOf(slot);
            if (set != null && set.peak != null) ShowSprite(set.peak, set.facesRight);
            else if (set != null && set.ready != null) ShowSprite(set.ready, set.facesRight);
            else SetPose(Pose.Strike);
        }

        //그림을 걸고, 원화가 왼쪽을 보면 flipX 로 오른쪽을 보게 맞춘다. 화면 좌우는 루트 부호가 따로 정한다
        private void ShowSprite(Sprite sprite, bool facesRight)
        {
            if (spriteRenderer == null) return;
            if (sprite != null) spriteRenderer.sprite = sprite;
            shownFacesRight = facesRight;
            spriteRenderer.flipX = !facesRight;
        }

        //충돌 장 뒤로 궤적이 사라지는 장들을 게임 시간으로 넘긴다. 역경직 동안 같이 멈춘다
        //충돌 장을 peakShare 만큼 붙잡은 뒤 남은 장을 고르게 넘긴다. 쓰러지면 멈춘다 (웹 trail 과 같다)
        public Tween PlayStrikeTrail(float seconds, float peakShare = 0.5f, SkillSlot slot = SkillSlot.None)
        {
            if (spriteRenderer == null) return null;
            SkillFrames set = FramesOf(slot);
            Sprite[] rest;
            bool right;
            if (set != null)
            {
                rest = set.trail ?? new Sprite[0];
                right = set.facesRight;
            }
            else
            {
                if (strikeTrail == null || strikeTrail.Length < 2) return null;
                rest = new Sprite[strikeTrail.Length - 1];
                System.Array.Copy(strikeTrail, 1, rest, 0, rest.Length);
                right = strikeTrailFacesRight;
            }
            if (rest.Length == 0) return null;
            float peak = Mathf.Clamp01(peakShare);
            int shown = -1;
            return DOTween.To(() => 0f, value =>
                {
                    if (value < peak || IsDown) return;
                    int index = Mathf.Clamp(Mathf.FloorToInt((value - peak) / Mathf.Max(0.0001f, 1f - peak) * rest.Length), 0, rest.Length - 1);
                    if (index == shown || rest[index] == null) return;
                    shown = index;
                    ShowSprite(rest[index], right);
                }, 1f, seconds)
                .SetEase(Ease.Linear)
                .SetLink(gameObject);
        }

        //루트 배율 부호. 그림은 늘 오른쪽을 보게 맞춰 두므로 바라보는 쪽과 같다
        public float MirrorSign => facing;

        //월드 방향의 x 이동을 Visual 로컬 값으로 바꾼다. 루트가 뒤집혀 있으면 로컬 x 가 반대로 먹는다
        public float WorldToLocalX(float worldDx)
        {
            return worldDx / (Mathf.Sign(transform.lossyScale.x) * Mathf.Max(0.0001f, Mathf.Abs(transform.lossyScale.x)));
        }

        //화면에서 보이는 회전(반시계 +)을 Visual 로컬 Z 회전으로 바꾼다. 루트가 뒤집히면 로컬 회전도 반대로 보인다
        public float WorldToLocalRoll(float worldDegrees)
        {
            return worldDegrees * Mathf.Sign(transform.lossyScale.x);
        }

        //루트 배율 부호를 facing 에 맞춘다
        private void ApplyFacing()
        {
            float sign = MirrorSign;
            transform.localScale = new Vector3(rootScaleAbs.x * sign, rootScaleAbs.y, rootScaleAbs.z);
        }

        //몸짓이 끝난 뒤 좌우가 깨졌으면 되돌린다 (SPEC-005 §8.3 좌우 반전 방어)
        private void LateUpdate()
        {
            float want = MirrorSign;
            if (Mathf.Sign(transform.localScale.x) != want) ApplyFacing();
            //다른 곳에서 flipX 를 건드렸으면 지금 장의 원화 방향대로 되돌린다
            if (spriteRenderer != null && spriteRenderer.flipX != !shownFacesRight) spriteRenderer.flipX = !shownFacesRight;
            if (visual == null) return;
            if (keepFlat)
            {
                visual.localRotation = Quaternion.identity;
                visual.localScale = Vector3.one;
                return;
            }
            //Visual 배율은 늘 양수. 음수가 섞이면 그림이 한 번 더 뒤집힌다
            Vector3 s = visual.localScale;
            if (s.x < 0f || s.y < 0f || s.z < 0f) visual.localScale = new Vector3(Mathf.Abs(s.x), Mathf.Abs(s.y), Mathf.Abs(s.z));
        }

        //투명도를 트윈한다. 앞 트윈을 끊는다
        private Tween FadeTo(float target, float seconds, bool unscaled)
        {
            if (spriteRenderer == null) return null;
            fadeTween?.Kill();
            fadeTween = DOTween.To(() => spriteRenderer.color.a, a =>
                {
                    Color c = spriteRenderer.color;
                    c.a = a;
                    spriteRenderer.color = c;
                }, target, Mathf.Max(0f, seconds))
                .SetUpdate(unscaled)
                .SetLink(gameObject);
            return fadeTween;
        }

        //교전에 끼지 않으면 흐려져 사라지고, 차례가 오면 다시 보인다 (SPEC-005 §9.3 구경꾼 숨기기)
        //쓰러진 인형은 쓰러짐 흐림으로 돌아간다. 색의 알파만 바꾼다. 실제 시간으로 돈다
        public void SetShown(bool shown, float seconds)
        {
            if (IsHidden == !shown) return;
            IsHidden = !shown;
            FadeTo(shown ? (IsDown ? downOpacity : 1f) : 0f, seconds, true);
        }

        //쓰러진다. 피격 장으로 바꾸고 가라앉으며 흐려진다. 기울이지 않는다 (SPEC-005 §9.3). 게임 시간
        public Sequence FallDown(float seconds, float sink, float opacity)
        {
            IsDown = true;
            downOpacity = opacity;
            SetPose(Pose.Hurt);
            //흐림은 숨기기와 같은 손잡이라 따로 돈다. 시퀀스에 넣으면 숨기기가 끊을 수 없다
            FadeTo(IsHidden ? 0f : opacity, seconds, false);
            Sequence seq = DOTween.Sequence().SetLink(gameObject);
            if (visual != null) seq.Join(visual.DOLocalMoveY(-sink, seconds).SetEase(Ease.OutCubic));
            return seq;
        }

        //몸짓을 대기 상태로 즉시 되돌린다. 교전이 끊겼을 때 쓴다
        public void ResetVisual()
        {
            if (visual == null) return;
            visual.localPosition = Vector3.zero;
            visual.localRotation = Quaternion.identity;
            visual.localScale = Vector3.one;
            if (!IsDown) SetPose(Pose.Idle);
        }

        //새 전투를 위해 쓰러짐·숨김을 풀고 대기 자리에 선다
        public void ResetForBattle()
        {
            fadeTween?.Kill();
            IsDown = false;
            IsHidden = false;
            downOpacity = 1f;
            transform.position = home;
            if (spriteRenderer != null)
            {
                Color c = spriteRenderer.color;
                c.a = 1f;
                spriteRenderer.color = c;
            }
            ResetVisual();
        }
    }
}
