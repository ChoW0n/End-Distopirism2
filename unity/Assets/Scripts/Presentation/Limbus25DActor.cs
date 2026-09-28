using DG.Tweening;
using UnityEngine;

namespace EndDistopirism.Presentation
{
    //무대에 선 종이 인형 한 명. 연출 감독이 움직이는 대상이다 (SPEC-005 §8.3)
    //구조: 루트(자리·바라보는 쪽) → Visual(몸짓) → SpriteRenderer(그림)
    //루트는 자리와 좌우만 들고, 튕기고 꺾는 몸짓은 전부 Visual 에만 건다
    [DisallowMultipleComponent]
    public sealed class Limbus25DActor : MonoBehaviour
    {
        //장 종류. 그림이 없으면 대기 장으로 떨어진다
        public enum Pose { Idle, Windup, Dash, Strike, Recover, Hurt }

        [Header("구조")]
        [Tooltip("몸짓을 거는 자식. 비어 있으면 첫 번째 자식을 쓴다")]
        [SerializeField] private Transform visual;
        [SerializeField] private SpriteRenderer spriteRenderer;

        [Header("방향")]
        [Tooltip("시작할 때 바라볼 쪽. 1 = 화면 오른쪽, -1 = 왼쪽")]
        [SerializeField] private int startFacing = 1;

        [Header("장마다 원화가 오른쪽을 보는지 (카일: 대기·회복은 오른쪽, 준비·돌진·베기는 왼쪽)")]
        [SerializeField] private bool idleFacesRight = true;
        [SerializeField] private bool windupFacesRight = false;
        [SerializeField] private bool dashFacesRight = false;
        [SerializeField] private bool strikeFacesRight = false;
        [SerializeField] private bool recoverFacesRight = true;
        [SerializeField] private bool hurtFacesRight = true;
        [SerializeField] private bool strikeTrailFacesRight = false;

        [Header("장 (없으면 대기 장)")]
        [SerializeField] private Sprite idle;
        [SerializeField] private Sprite windup;
        [SerializeField] private Sprite dash;
        [SerializeField] private Sprite strike;
        [SerializeField] private Sprite recover;
        [SerializeField] private Sprite hurt;
        [Tooltip("타격 뒤 이어 트는 장. 베기 궤적이 사라지는 순서대로 넣는다 (카일 slash 01~07)")]
        [SerializeField] private Sprite[] strikeTrail;

        [Header("그 밖")]
        [Tooltip("몸 가운데 높이(로컬). 이펙트·카메라 초점이 여기를 본다")]
        [SerializeField] private float chestHeight = 1.1f;
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

        public Transform Visual => visual;
        public SpriteRenderer Renderer => spriteRenderer;
        public int Facing => facing;
        public Vector3 Home => home;
        public int SortingOrder => spriteRenderer != null ? spriteRenderer.sortingOrder : baseSortingOrder;
        public int SortingLayerId => spriteRenderer != null ? spriteRenderer.sortingLayerID : 0;
        //몸 가운데의 월드 좌표
        public Vector3 Chest => transform.position + Vector3.up * chestHeight * rootScaleAbs.y;

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
                _ => (idle, idleFacesRight),
            };
            if (chosen == null) { chosen = idle; right = idleFacesRight; }
            ShowSprite(chosen, right);
        }

        //그림을 걸고, 원화가 왼쪽을 보면 flipX 로 오른쪽을 보게 맞춘다. 화면 좌우는 루트 부호가 따로 정한다
        private void ShowSprite(Sprite sprite, bool facesRight)
        {
            if (spriteRenderer == null) return;
            if (sprite != null) spriteRenderer.sprite = sprite;
            shownFacesRight = facesRight;
            spriteRenderer.flipX = !facesRight;
        }

        //타격 장 뒤로 궤적이 사라지는 장들을 게임 시간으로 넘긴다. 역경직 동안 같이 멈춘다
        public Tween PlayStrikeTrail(float seconds)
        {
            if (spriteRenderer == null || strikeTrail == null || strikeTrail.Length == 0) return null;
            int last = strikeTrail.Length - 1;
            int shown = -1;
            return DOTween.To(() => 0f, value =>
                {
                    int index = Mathf.Clamp(Mathf.FloorToInt(value), 0, last);
                    if (index == shown || strikeTrail[index] == null) return;
                    shown = index;
                    ShowSprite(strikeTrail[index], strikeTrailFacesRight);
                }, last + 0.999f, seconds)
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
            //Visual 배율은 늘 양수. 음수가 섞이면 그림이 한 번 더 뒤집힌다
            Vector3 s = visual.localScale;
            if (s.x < 0f || s.y < 0f || s.z < 0f) visual.localScale = new Vector3(Mathf.Abs(s.x), Mathf.Abs(s.y), Mathf.Abs(s.z));
        }

        //몸짓을 대기 상태로 즉시 되돌린다. 교전이 끊겼을 때 쓴다
        public void ResetVisual()
        {
            if (visual == null) return;
            visual.localPosition = Vector3.zero;
            visual.localRotation = Quaternion.identity;
            visual.localScale = Vector3.one;
            SetPose(Pose.Idle);
        }
    }
}
